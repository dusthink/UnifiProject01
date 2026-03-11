import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Wifi, CheckCircle2, XCircle, Zap, Settings, Monitor, Radio, ArrowLeftRight, Router, ChevronDown, ChevronRight, Loader2, X, Power, PowerOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Building, Unit, Device, UnitDevicePort, Community, Network, WifiNetwork } from "@shared/schema";

const deviceTypeLabels: Record<string, string> = {
  switch: "Switch",
  access_point: "AP",
  hybrid: "Hybrid",
  gateway: "Gateway",
  other: "Device",
};

function DeviceIcon({ type, className = "h-4 w-4" }: { type?: string | null; className?: string }) {
  switch (type) {
    case "switch": return <ArrowLeftRight className={className} />;
    case "access_point": return <Radio className={className} />;
    case "hybrid": return <Wifi className={className} />;
    case "gateway": return <Router className={className} />;
    default: return <Monitor className={className} />;
  }
}

function DeviceImage({ iconId, deviceType, size = 28 }: { iconId?: string | null; deviceType?: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const url = iconId ? `https://static.ui.com/fingerprint/0/${iconId}_128x128.png` : null;

  if (!url || imgError) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <DeviceIcon type={deviceType} className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="object-contain"
      onError={() => setImgError(true)}
    />
  );
}

function SwitchPortDiagram({ portTable, portOverrides, networks, unitVlanId, selectedPorts, onTogglePort, assigningPorts }: {
  portTable: any[];
  portOverrides: any[];
  networks: any[];
  unitVlanId: number | null;
  selectedPorts: Set<number>;
  onTogglePort: (portIdx: number) => void;
  assigningPorts: boolean;
}) {
  const overrideMap = new Map<number, any>();
  portOverrides.forEach((po: any) => overrideMap.set(po.port_idx, po));

  const networkMap = new Map<string, any>();
  networks.forEach((n: any) => networkMap.set(n._id, n));

  const ports = portTable
    .sort((a: any, b: any) => (a.port_idx || 0) - (b.port_idx || 0));

  if (ports.length === 0) return <p className="text-xs text-muted-foreground">No ports found</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {ports.map((port: any) => {
          const override = overrideMap.get(port.port_idx);
          const nativeNetId = override?.native_networkconf_id || port.native_networkconf_id;
          const nativeNet = nativeNetId ? networkMap.get(nativeNetId) : null;
          const nativeVlan = nativeNet?.vlan || override?.native_vlan || port.native_vlan || 1;
          const isUp = port.up === true;
          const speed = port.speed || 0;
          const portForward = override?.forward || port.forward || "all";
          const isDisabled = portForward === "disabled";
          const isCustom = portForward === "customize" || portForward === "native";
          const poeEnabled = override ? override.poe_mode !== "off" : port.poe_enable;
          const isSelected = selectedPorts.has(port.port_idx);
          const isUnitVlan = unitVlanId != null && nativeVlan === unitVlanId;
          const isUplink = port.is_uplink === true;

          let vlanLabel = nativeNet ? `${nativeNet.name} (${nativeVlan})` : nativeVlan === 1 ? "Default" : `VLAN ${nativeVlan}`;
          if (isDisabled) vlanLabel = "Disabled";
          else if (!isCustom && nativeVlan === 1 && !nativeNet) vlanLabel = "Default";

          const bgColor = isSelected
            ? "bg-primary/20 border-primary ring-2 ring-primary/50"
            : isDisabled
              ? "bg-destructive/5 border-destructive/20 opacity-60"
              : isUnitVlan
                ? "bg-chart-3/15 border-chart-3/50"
                : isUp
                  ? nativeVlan === 1 ? "bg-muted" : "bg-primary/10 border-primary/30"
                  : "bg-muted/50 border-dashed";

          return (
            <TooltipProvider key={port.port_idx} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`relative flex flex-col items-center justify-center w-12 h-14 rounded border text-center transition-colors ${isUplink ? "cursor-default opacity-60" : "cursor-pointer hover:ring-1 hover:ring-primary/30"} ${bgColor}`}
                    data-testid={`port-${port.port_idx}`}
                    onClick={() => {
                      if (isUplink || assigningPorts) return;
                      onTogglePort(port.port_idx);
                    }}
                  >
                    <span className="text-[10px] font-bold">{port.port_idx}</span>
                    <span className="text-[8px] text-muted-foreground truncate max-w-[42px]">
                      {isDisabled ? "Off" : nativeVlan === 1 && !isCustom ? "Def" : `V${nativeVlan}`}
                    </span>
                    {isUp && (
                      <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-status-online" />
                    )}
                    {isUnitVlan && !isSelected && (
                      <div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-chart-3" />
                    )}
                    {isSelected && (
                      <div className="absolute top-0.5 left-0.5">
                        <CheckCircle2 className="h-2.5 w-2.5 text-primary" />
                      </div>
                    )}
                    {isUplink && (
                      <span className="absolute -bottom-0.5 text-[7px] text-muted-foreground">UL</span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[220px]">
                  <p className="font-medium">Port {port.port_idx}{isUplink ? " (Uplink)" : ""}</p>
                  <p>Native: {vlanLabel}</p>
                  <p>Status: {isDisabled ? "Disabled" : isUp ? `Up (${speed >= 1000 ? `${speed/1000}G` : `${speed}M`})` : "Down"}</p>
                  {isDisabled && <p className="text-destructive font-medium">Port VLAN disabled</p>}
                  {poeEnabled && !isDisabled && <p>PoE: Active</p>}
                  {isUnitVlan && <p className="text-chart-3 font-medium">Assigned to unit network</p>}
                  {isSelected && <p className="text-primary font-medium">Selected</p>}
                  {!isUplink && <p className="text-primary mt-1">Click to {isSelected ? "deselect" : "select"}</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-status-online" /> Link up</div>
        {unitVlanId != null && <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-chart-3" /> Unit VLAN</div>}
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-primary/20 border border-primary/30" /> Custom VLAN</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-muted border border-dashed" /> Down</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-destructive/10 border border-destructive/30" /> Disabled</div>
        {selectedPorts.size > 0 && <div className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-primary" /> Selected ({selectedPorts.size})</div>}
      </div>
    </div>
  );
}

function DeviceConfigDialog({ device, controllerId, siteId, unitVlanId, unitNetworkName, onClose }: {
  device: Device;
  controllerId: string;
  siteId: string;
  unitVlanId: number | null;
  unitNetworkName: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedPorts, setSelectedPorts] = useState<Set<number>>(new Set());
  const [provisioning, setProvisioning] = useState<{ message: string; startedAt: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/devices", device.id, "details", controllerId, siteId],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/details?controllerId=${encodeURIComponent(controllerId)}&siteId=${encodeURIComponent(siteId)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load device details");
      return res.json();
    },
  });

  const startProvisioning = useCallback((message: string) => {
    setProvisioning({ message, startedAt: Date.now() });
    if (pollRef.current) clearInterval(pollRef.current);
    let pollCount = 0;
    pollRef.current = setInterval(async () => {
      pollCount++;
      await refetch();
      if (pollCount >= 12) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setProvisioning(null);
        toast({ title: "Provisioning complete", description: "Device configuration has been updated." });
      }
    }, 5000);
  }, [refetch, toast]);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!provisioning) return;
    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickInterval);
  }, [provisioning]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopProvisioning = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setProvisioning(null);
  }, []);

  const togglePort = (portIdx: number) => {
    setSelectedPorts(prev => {
      const next = new Set(prev);
      if (next.has(portIdx)) next.delete(portIdx);
      else next.add(portIdx);
      return next;
    });
  };

  const assignMutation = useMutation({
    mutationFn: async ({ ports, nativeVlan }: { ports: number[]; nativeVlan: number }) => {
      await apiRequest("POST", `/api/devices/${device.id}/set-port-vlans`, {
        controllerId,
        siteId,
        ports: ports.map(portIdx => ({ portIdx, nativeVlan })),
      });
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Ports updated", description: `Sent VLAN ${variables.nativeVlan} config to controller. Device is provisioning...` });
      setSelectedPorts(new Set());
      startProvisioning(`Applying VLAN ${variables.nativeVlan} to ${variables.ports.length} port(s)...`);
    },
    onError: (err: any) => toast({ title: "Failed to update ports", description: err.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async ({ ports }: { ports: number[] }) => {
      await apiRequest("POST", `/api/devices/${device.id}/set-port-vlans`, {
        controllerId,
        siteId,
        ports: ports.map(portIdx => ({ portIdx, nativeVlan: 1 })),
      });
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Ports reset", description: `Resetting ${variables.ports.length} port(s) to default. Device is provisioning...` });
      setSelectedPorts(new Set());
      startProvisioning(`Resetting ${variables.ports.length} port(s) to default...`);
    },
    onError: (err: any) => toast({ title: "Failed to reset ports", description: err.message, variant: "destructive" }),
  });

  const enableMutation = useMutation({
    mutationFn: async ({ ports, enabled }: { ports: number[]; enabled: boolean }) => {
      await apiRequest("POST", `/api/devices/${device.id}/set-port-enabled`, {
        controllerId,
        siteId,
        ports: ports.map(portIdx => ({ portIdx, enabled })),
      });
    },
    onSuccess: (_data, variables) => {
      const action = variables.enabled ? "Enabling" : "Disabling";
      toast({ title: `${action} ports`, description: `${action} ${variables.ports.length} port(s). Device is provisioning...` });
      setSelectedPorts(new Set());
      startProvisioning(`${action} ${variables.ports.length} port(s)...`);
    },
    onError: (err: any) => toast({ title: "Failed to update ports", description: err.message, variant: "destructive" }),
  });

  const isAP = device.deviceType === "access_point" || device.deviceType === "hybrid";
  const isSwitch = device.deviceType === "switch" || device.deviceType === "hybrid";

  const networkMap = new Map<string, any>();
  (data?.networks || []).forEach((n: any) => networkMap.set(n._id, n));

  const getPortVlan = (portIdx: number) => {
    const portData = data?.unifi?.port_table?.find((p: any) => p.port_idx === portIdx);
    const override = data?.unifi?.port_overrides?.find((po: any) => po.port_idx === portIdx);
    const netId = override?.native_networkconf_id || portData?.native_networkconf_id;
    const net = netId ? networkMap.get(netId) : null;
    return net?.vlan || override?.native_vlan || portData?.native_vlan || 1;
  };

  const getPortForward = (portIdx: number) => {
    const portData = data?.unifi?.port_table?.find((p: any) => p.port_idx === portIdx);
    const override = data?.unifi?.port_overrides?.find((po: any) => po.port_idx === portIdx);
    return override?.forward || portData?.forward || "all";
  };

  const selectedPortsArray = Array.from(selectedPorts);
  const allSelectedAlreadyUnit = selectedPortsArray.length > 0 && unitVlanId != null && selectedPortsArray.every(p => getPortVlan(p) === unitVlanId);
  const anySelectedNonDefault = selectedPortsArray.some(p => getPortVlan(p) !== 1);
  const anySelectedNotUnit = unitVlanId != null && selectedPortsArray.some(p => getPortVlan(p) !== unitVlanId);
  const anySelectedDisabled = selectedPortsArray.some(p => getPortForward(p) === "disabled");
  const anySelectedEnabled = selectedPortsArray.some(p => getPortForward(p) !== "disabled");
  const anyMutating = assignMutation.isPending || resetMutation.isPending || enableMutation.isPending;

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <DeviceImage iconId={device.iconId} deviceType={device.deviceType} size={32} />
          </div>
          <div>
            <span>{device.name}</span>
            <p className="text-xs font-normal text-muted-foreground mt-0.5">
              {device.model || deviceTypeLabels[device.deviceType || "other"]} · {device.macAddress}
            </p>
          </div>
        </DialogTitle>
        <DialogDescription className="sr-only">Device configuration details</DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="space-y-5 mt-2">
          {data.unifi && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {data.unifi.ip && (
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">IP Address</p>
                  <p className="text-sm font-medium" data-testid="text-device-ip">{data.unifi.ip}</p>
                </div>
              )}
              {data.unifi.version && (
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Firmware</p>
                  <p className="text-sm font-medium">{data.unifi.version}</p>
                </div>
              )}
              {data.unifi.uptime != null && (
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Uptime</p>
                  <p className="text-sm font-medium">{formatUptime(data.unifi.uptime)}</p>
                </div>
              )}
              {data.unifi.state != null && (
                <div className="space-y-0.5">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">State</p>
                  <Badge variant={data.unifi.state === 1 ? "default" : "secondary"} className={data.unifi.state === 1 ? "bg-status-online/15 text-status-online border-0" : ""}>
                    {data.unifi.state === 1 ? "Online" : "Offline"}
                  </Badge>
                </div>
              )}
            </div>
          )}

          {isAP && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Wifi className="h-4 w-4" /> Broadcasting SSIDs
                </h3>
                {data.wlans?.length > 0 ? (
                  <div className="grid gap-2">
                    {data.wlans.map((w: any) => (
                      <div key={w._id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card" data-testid={`wlan-${w._id}`}>
                        <div className="flex items-center gap-2">
                          <Wifi className={`h-3.5 w-3.5 ${w.enabled ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="text-sm font-medium">{w.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {w.security && <Badge variant="outline" className="text-[10px] h-5">{w.security.toUpperCase()}</Badge>}
                          {w.is_guest && <Badge variant="outline" className="text-[10px] h-5">Guest</Badge>}
                          <Badge variant={w.enabled ? "default" : "secondary"} className={`text-[10px] h-5 ${w.enabled ? "bg-status-online/15 text-status-online border-0" : ""}`}>
                            {w.enabled ? "On" : "Off"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No SSIDs broadcasting on this AP</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Radio className="h-4 w-4" /> AP Groups
                </h3>
                {data.apGroups?.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {data.apGroups.map((g: any) => (
                      <Badge key={g._id} variant="secondary" className="text-xs" data-testid={`apgroup-${g._id}`}>
                        {g.name} ({g.device_count} {g.device_count === 1 ? "AP" : "APs"})
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not assigned to any AP group</p>
                )}
              </div>
            </>
          )}

          {isSwitch && data.unifi?.port_table?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4" /> Port Configuration
                {unitVlanId != null && (
                  <Badge variant="outline" className="text-[10px] ml-1">Unit: VLAN {unitVlanId}</Badge>
                )}
              </h3>

              {!data.unifi.switch_vlan_enabled && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/5 mb-3" data-testid="port-vlan-notice">
                  <Power className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">Port VLAN is not enabled on this device. It will be automatically enabled when you assign a VLAN to a port.</p>
                </div>
              )}

              {provisioning && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/5 mb-3 animate-in fade-in" data-testid="provisioning-banner">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{provisioning.message}</p>
                      <p className="text-[10px] text-blue-500/70 mt-0.5">
                        Device is reprovisioning. Ports will update automatically. ({Math.floor((Date.now() - provisioning.startedAt) / 1000)}s)
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-500 hover:text-blue-600" onClick={stopProvisioning} data-testid="button-dismiss-provisioning">
                    Dismiss
                  </Button>
                </div>
              )}

              <SwitchPortDiagram
                portTable={data.unifi.port_table}
                portOverrides={data.unifi.port_overrides || []}
                networks={data.networks || []}
                unitVlanId={unitVlanId}
                selectedPorts={selectedPorts}
                onTogglePort={togglePort}
                assigningPorts={anyMutating}
              />

              {selectedPorts.size > 0 && (
                <div className="mt-3 p-3 rounded-lg border bg-muted/30 space-y-3" data-testid="port-config-panel">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{selectedPorts.size} port{selectedPorts.size > 1 ? "s" : ""} selected</p>
                      <p className="text-xs text-muted-foreground">
                        Ports: {selectedPortsArray.sort((a, b) => a - b).join(", ")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPorts(new Set())}
                      className="h-7 text-xs"
                      data-testid="button-clear-selection"
                    >
                      Clear
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {anySelectedDisabled && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => enableMutation.mutate({ ports: selectedPortsArray.filter(p => getPortForward(p) === "disabled"), enabled: true })}
                        disabled={anyMutating}
                        data-testid="button-enable-ports"
                      >
                        {enableMutation.isPending && enableMutation.variables?.enabled ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Enabling...</>
                        ) : (
                          <><Power className="h-3 w-3 mr-1" /> Enable Port{selectedPortsArray.filter(p => getPortForward(p) === "disabled").length > 1 ? "s" : ""}</>
                        )}
                      </Button>
                    )}
                    {anySelectedEnabled && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => {
                          const portsToDisable = selectedPortsArray.filter(p => getPortForward(p) !== "disabled");
                          if (confirm(`Disable ${portsToDisable.length} port${portsToDisable.length > 1 ? "s" : ""}? This will stop all traffic on ${portsToDisable.length > 1 ? "these ports" : "this port"}.`)) {
                            enableMutation.mutate({ ports: portsToDisable, enabled: false });
                          }
                        }}
                        disabled={anyMutating}
                        data-testid="button-disable-ports"
                      >
                        {enableMutation.isPending && !enableMutation.variables?.enabled ? (
                          <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Disabling...</>
                        ) : (
                          <><PowerOff className="h-3 w-3 mr-1" /> Disable Port{selectedPortsArray.filter(p => getPortForward(p) !== "disabled").length > 1 ? "s" : ""}</>
                        )}
                      </Button>
                    )}
                  </div>

                  {!anySelectedDisabled && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {unitVlanId != null && anySelectedNotUnit && (
                        <Button
                          size="sm"
                          onClick={() => assignMutation.mutate({ ports: selectedPortsArray, nativeVlan: unitVlanId })}
                          disabled={anyMutating}
                          data-testid="button-assign-unit-vlan"
                        >
                          {assignMutation.isPending ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Assigning...</>
                          ) : (
                            <>Assign {selectedPorts.size > 1 ? `${selectedPorts.size} ports` : "port"} to {unitNetworkName || `VLAN ${unitVlanId}`}</>
                          )}
                        </Button>
                      )}
                      {allSelectedAlreadyUnit && (
                        <Badge variant="default" className="bg-chart-3/15 text-chart-3 border-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> All selected ports already on unit network
                        </Badge>
                      )}
                      {anySelectedNonDefault && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resetMutation.mutate({ ports: selectedPortsArray.filter(p => getPortVlan(p) !== 1) })}
                          disabled={anyMutating}
                          data-testid="button-reset-port"
                        >
                          {resetMutation.isPending ? (
                            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Resetting...</>
                          ) : (
                            "Reset to Default"
                          )}
                        </Button>
                      )}
                      {unitVlanId == null && (
                        <p className="text-xs text-muted-foreground">No network assigned to this unit. Assign a network to the unit first to configure ports.</p>
                      )}
                    </div>
                  )}
                  {anySelectedDisabled && anySelectedEnabled && (
                    <p className="text-xs text-muted-foreground">Some selected ports are disabled. Enable them first to configure VLANs.</p>
                  )}
                  {anySelectedDisabled && !anySelectedEnabled && (
                    <p className="text-xs text-muted-foreground">Selected ports are disabled. Enable them to configure VLANs.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">Could not load device details.</p>
      )}
    </DialogContent>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function UnitCard({ unit, devices, networks, wifiNetworks, portAssignments, controllerId, siteId, onDelete, onProvision, onDeprovision, onEdit, onRemoveDevice }: {
  unit: Unit;
  devices: Device[];
  networks: Network[];
  wifiNetworks: WifiNetwork[];
  portAssignments: UnitDevicePort[];
  controllerId: string;
  siteId: string;
  onDelete: (id: string) => void;
  onProvision: (id: string) => void;
  onDeprovision: (id: string) => void;
  onEdit: (unit: Unit) => void;
  onRemoveDevice: (assignmentId: string, deviceName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [configDevice, setConfigDevice] = useState<Device | null>(null);
  const network = unit.networkId ? networks.find(n => n.id === unit.networkId) : null;
  const wifiNet = unit.unifiWlanId ? wifiNetworks.find(w => w.unifiWlanId === unit.unifiWlanId) : null;
  const assignedDevices = portAssignments
    .map(pa => devices.find(d => d.id === pa.deviceId))
    .filter(Boolean) as Device[];

  return (
    <>
      <Card className="overflow-hidden" data-testid={`card-unit-${unit.id}`}>
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
          data-testid={`unit-toggle-${unit.id}`}
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{unit.unitNumber}</span>
              {unit.isProvisioned ? (
                <Badge variant="default" className="bg-status-online/15 text-status-online border-0 text-[10px] h-5">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" /> Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] h-5">
                  <XCircle className="h-3 w-3 mr-0.5" /> Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {network && (
                <span className="flex items-center gap-1">
                  <ArrowLeftRight className="h-3 w-3" />
                  {network.name} (VLAN {network.vlanId})
                </span>
              )}
              {wifiNet && (
                <span className="flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  {wifiNet.name}
                </span>
              )}
              {assignedDevices.length > 0 && (
                <span className="flex items-center gap-1">
                  <Monitor className="h-3 w-3" />
                  {assignedDevices.length} {assignedDevices.length === 1 ? "device" : "devices"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(unit)} data-testid={`button-edit-unit-${unit.id}`}>
              <Settings className="h-4 w-4" />
            </Button>
            {unit.isProvisioned ? (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDeprovision(unit.id)} data-testid={`button-deprovision-unit-${unit.id}`}>
                <XCircle className="h-4 w-4 text-destructive" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onProvision(unit.id)} data-testid={`button-provision-unit-${unit.id}`}>
                <Zap className="h-4 w-4 text-status-online" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDelete(unit.id)} data-testid={`button-delete-unit-${unit.id}`}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="border-t px-4 py-3 bg-muted/30">
            {assignedDevices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No devices assigned to this unit.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assigned Devices</p>
                <div className="grid gap-2">
                  {assignedDevices.map((device) => {
                    const assignment = portAssignments.find(pa => pa.deviceId === device.id);
                    return (
                      <div
                        key={device.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => setConfigDevice(device)}
                        data-testid={`device-config-${device.id}`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                          <DeviceImage iconId={device.iconId} deviceType={device.deviceType} size={28} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{device.name}</p>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                              {deviceTypeLabels[device.deviceType || "other"]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {device.macAddress}{device.model ? ` · ${device.model}` : ""}{device.portCount ? ` · ${device.portCount} ports` : ""}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (assignment) onRemoveDevice(assignment.id, device.name);
                          }}
                          data-testid={`button-remove-device-${device.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Dialog open={!!configDevice} onOpenChange={(open) => { if (!open) setConfigDevice(null); }}>
        {configDevice && (
          <DeviceConfigDialog
            device={configDevice}
            controllerId={controllerId}
            siteId={siteId}
            unitVlanId={unit.vlanId ?? null}
            unitNetworkName={network?.name ?? null}
            onClose={() => setConfigDevice(null)}
          />
        )}
      </Dialog>
    </>
  );
}

export default function BuildingDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);

  const [unitNumber, setUnitNumber] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedWifiNetworkId, setSelectedWifiNetworkId] = useState("");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  const { data: building, isLoading: bldgLoading } = useQuery<Building>({
    queryKey: ["/api/buildings", id],
  });

  const { data: units, isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: ["/api/buildings", id, "units"],
    queryFn: async () => {
      const res = await fetch(`/api/buildings/${id}/units`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: devices } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: community } = useQuery<Community>({
    queryKey: ["/api/communities", building?.communityId],
    queryFn: async () => {
      const res = await fetch(`/api/communities/${building!.communityId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!building?.communityId,
  });

  const { data: controllerNetworks } = useQuery<Network[]>({
    queryKey: ["/api/networks/controller", community?.controllerId, "site", community?.unifiSiteId || "default"],
    queryFn: async () => {
      if (!community?.controllerId) return [];
      const siteId = community.unifiSiteId || "default";
      const res = await fetch(`/api/networks/controller/${community.controllerId}?siteId=${encodeURIComponent(siteId)}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!community?.controllerId,
  });

  const { data: controllerWifiNetworks } = useQuery<WifiNetwork[]>({
    queryKey: ["/api/wifi-networks/controller", community?.controllerId, "site", community?.unifiSiteId || "default"],
    queryFn: async () => {
      if (!community?.controllerId) return [];
      const siteId = community.unifiSiteId || "default";
      const res = await fetch(`/api/wifi-networks/controller/${community.controllerId}?siteId=${encodeURIComponent(siteId)}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!community?.controllerId,
  });

  const { data: allPortAssignments } = useQuery<Record<string, UnitDevicePort[]>>({
    queryKey: ["/api/buildings", id, "port-assignments"],
    queryFn: async () => {
      if (!units?.length) return {};
      const result: Record<string, UnitDevicePort[]> = {};
      await Promise.all(
        units.map(async (unit) => {
          const res = await fetch(`/api/units/${unit.id}/ports`, { credentials: "include" });
          if (res.ok) result[unit.id] = await res.json();
        })
      );
      return result;
    },
    enabled: !!units?.length,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/units", data);
      return res.json();
    },
    onSuccess: async (newUnit: Unit) => {
      if (selectedDeviceIds.length > 0) {
        await Promise.all(
          selectedDeviceIds.map((deviceId) =>
            apiRequest("POST", "/api/port-assignments", { unitId: newUnit.id, deviceId, portNumber: 1 })
          )
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "port-assignments"] });
      setAddOpen(false);
      resetForm();
      toast({ title: "Unit added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ unitId, data, deviceIds }: { unitId: string; data: any; deviceIds: string[] }) => {
      const res = await apiRequest("PATCH", `/api/units/${unitId}`, data);
      const existingAssignments = allPortAssignments?.[unitId] || [];
      const existingDeviceIds = existingAssignments.map(a => a.deviceId);
      const toAdd = deviceIds.filter(dId => !existingDeviceIds.includes(dId));
      const toRemove = existingAssignments.filter(a => !deviceIds.includes(a.deviceId));
      await Promise.all([
        ...toAdd.map(deviceId =>
          apiRequest("POST", "/api/port-assignments", { unitId, deviceId, portNumber: 1 })
        ),
        ...toRemove.map(a =>
          apiRequest("DELETE", `/api/port-assignments/${a.id}`)
        ),
      ]);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "port-assignments"] });
      setEditOpen(false);
      setEditUnit(null);
      toast({ title: "Unit updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeDeviceMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest("DELETE", `/api/port-assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "port-assignments"] });
      toast({ title: "Device removed from unit" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (unitId: string) => {
      await apiRequest("DELETE", `/api/units/${unitId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "port-assignments"] });
      toast({ title: "Unit deleted" });
    },
  });

  const provisionMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const res = await apiRequest("POST", `/api/units/${unitId}/provision`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      toast({ title: "Unit provisioned", description: "VLAN and WiFi configured on UniFi controller." });
    },
    onError: (err: any) => toast({ title: "Provisioning failed", description: err.message, variant: "destructive" }),
  });

  const deprovisionMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const res = await apiRequest("POST", `/api/units/${unitId}/deprovision`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buildings", id, "units"] });
      toast({ title: "Unit deprovisioned" });
    },
    onError: (err: any) => toast({ title: "Deprovisioning failed", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setUnitNumber("");
    setSelectedNetworkId("");
    setSelectedWifiNetworkId("");
    setSelectedDeviceIds([]);
  };

  const openEdit = (unit: Unit) => {
    setEditUnit(unit);
    setUnitNumber(unit.unitNumber);
    setSelectedNetworkId(unit.networkId || "");
    const matchedWifi = unit.unifiWlanId ? controllerWifiNetworks?.find(w => w.unifiWlanId === unit.unifiWlanId) : null;
    setSelectedWifiNetworkId(matchedWifi?.id || "");
    const assignments = allPortAssignments?.[unit.id] || [];
    setSelectedDeviceIds(assignments.map(a => a.deviceId));
    setEditOpen(true);
  };

  const assignableTypes = ["switch", "access_point", "hybrid"];
  const availableDevices = (devices || []).filter(d => assignableTypes.includes(d.deviceType || "other"));

  if (bldgLoading || unitsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const toggleDevice = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const unitFormFields = (
    <>
      <div className="space-y-2">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g., Unit 101" required data-testid="input-unit-number" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Network</Label>
          {controllerNetworks && controllerNetworks.length > 0 ? (
            <Select value={selectedNetworkId} onValueChange={setSelectedNetworkId}>
              <SelectTrigger data-testid="select-network">
                <SelectValue placeholder="No network assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No network assigned</SelectItem>
                {controllerNetworks.filter((net) => net.vlanId && net.vlanId > 0).map((net) => (
                  <SelectItem key={net.id} value={net.id} data-testid={`option-network-${net.id}`}>
                    {net.name} (VLAN {net.vlanId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground pt-2">
              {community?.controllerId ? "No networks available." : "No controller assigned."}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>WiFi Network</Label>
          {controllerWifiNetworks && controllerWifiNetworks.length > 0 ? (
            <Select value={selectedWifiNetworkId} onValueChange={setSelectedWifiNetworkId}>
              <SelectTrigger data-testid="select-wifi-network">
                <SelectValue placeholder="No WiFi assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No WiFi assigned</SelectItem>
                {controllerWifiNetworks.map((wifi) => (
                  <SelectItem key={wifi.id} value={wifi.id} data-testid={`option-wifi-${wifi.id}`}>
                    {wifi.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground pt-2">
              {community?.controllerId ? "No WiFi networks available." : "No controller assigned."}
            </p>
          )}
        </div>
      </div>
      {availableDevices.length > 0 && (
        <div className="space-y-2">
          <Label>Assigned Devices</Label>
          <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
            {availableDevices.map((device) => {
              const isSelected = selectedDeviceIds.includes(device.id);
              return (
                <label
                  key={device.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-accent"}`}
                  data-testid={`device-option-${device.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleDevice(device.id)}
                    className="rounded"
                    data-testid={`checkbox-device-${device.id}`}
                  />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/50">
                    <DeviceImage iconId={device.iconId} deviceType={device.deviceType} size={28} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{device.name}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">{deviceTypeLabels[device.deviceType || "other"] || "Device"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{device.macAddress}{device.model ? ` · ${device.model}` : ""}{device.portCount ? ` · ${device.portCount} ports` : ""}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => navigate(`/admin/communities/${building?.communityId}`)} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-building-name">{building?.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {building?.address || "No address"}
            {building?.floors ? ` · ${building.floors} ${building.floors === 1 ? "floor" : "floors"}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Badge variant="secondary">{units?.length || 0} units</Badge>
        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-unit">
              <Plus className="h-4 w-4 mr-2" />
              Add Unit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Unit</DialogTitle>
              <DialogDescription className="sr-only">Add a new unit to this building</DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const netId = selectedNetworkId && selectedNetworkId !== "none" ? selectedNetworkId : null;
                const selectedNet = netId ? controllerNetworks?.find(n => n.id === netId) : null;
                const wifiNetId = selectedWifiNetworkId && selectedWifiNetworkId !== "none" ? selectedWifiNetworkId : null;
                const selectedWifi = wifiNetId ? controllerWifiNetworks?.find(w => w.id === wifiNetId) : null;
                createMutation.mutate({
                  buildingId: id,
                  unitNumber,
                  networkId: netId,
                  vlanId: selectedNet?.vlanId ?? null,
                  unifiWlanId: selectedWifi?.unifiWlanId ?? null,
                  wifiSsid: selectedWifi?.name ?? null,
                });
              }}
              className="space-y-4"
            >
              {unitFormFields}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-unit">
                {createMutation.isPending ? "Adding..." : "Add Unit"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) { setEditUnit(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Unit {editUnit?.unitNumber}</DialogTitle>
            <DialogDescription className="sr-only">Edit unit settings</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editUnit) return;
              const netId = selectedNetworkId && selectedNetworkId !== "none" ? selectedNetworkId : null;
              const selectedNet = netId ? controllerNetworks?.find(n => n.id === netId) : null;
              const wifiNetId = selectedWifiNetworkId && selectedWifiNetworkId !== "none" ? selectedWifiNetworkId : null;
              const selectedWifi = wifiNetId ? controllerWifiNetworks?.find(w => w.id === wifiNetId) : null;
              updateMutation.mutate({
                unitId: editUnit.id,
                data: {
                  unitNumber,
                  networkId: netId,
                  vlanId: selectedNet?.vlanId ?? null,
                  unifiWlanId: selectedWifi?.unifiWlanId ?? null,
                  wifiSsid: selectedWifi?.name ?? null,
                },
                deviceIds: selectedDeviceIds,
              });
            }}
            className="space-y-4"
          >
            {unitFormFields}
            <Button type="submit" className="w-full" disabled={updateMutation.isPending} data-testid="button-update-unit">
              {updateMutation.isPending ? "Updating..." : "Update Unit"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {!units?.length ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-16">
              <Wifi className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-1">No units yet</h3>
              <p className="text-sm text-muted-foreground">Add units to this building</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              devices={devices || []}
              networks={controllerNetworks || []}
              wifiNetworks={controllerWifiNetworks || []}
              portAssignments={allPortAssignments?.[unit.id] || []}
              controllerId={community?.controllerId || ""}
              siteId={community?.unifiSiteId || "default"}
              onDelete={(uid) => { if (confirm("Delete this unit?")) deleteMutation.mutate(uid); }}
              onProvision={(uid) => provisionMutation.mutate(uid)}
              onDeprovision={(uid) => deprovisionMutation.mutate(uid)}
              onEdit={openEdit}
              onRemoveDevice={(assignmentId, deviceName) => {
                if (confirm(`Remove ${deviceName} from this unit?`)) removeDeviceMutation.mutate(assignmentId);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
