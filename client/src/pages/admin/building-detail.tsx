import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Wifi, CheckCircle2, XCircle, Zap, Settings, Monitor, Radio, ArrowLeftRight, Router, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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

function SwitchPortDiagram({ portTable, portOverrides, networks }: {
  portTable: any[];
  portOverrides: any[];
  networks: any[];
}) {
  const overrideMap = new Map<number, any>();
  portOverrides.forEach((po: any) => overrideMap.set(po.port_idx, po));

  const networkMap = new Map<string, any>();
  networks.forEach((n: any) => networkMap.set(n._id, n));

  const ports = portTable
    .filter((p: any) => !p.is_uplink)
    .sort((a: any, b: any) => (a.port_idx || 0) - (b.port_idx || 0));

  if (ports.length === 0) return <p className="text-xs text-muted-foreground">No ports found</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ports.map((port: any) => {
          const override = overrideMap.get(port.port_idx);
          const nativeVlan = override?.native_vlan || port.native_vlan || 1;
          const nativeNetId = override?.native_networkconf_id || port.native_networkconf_id;
          const nativeNet = nativeNetId ? networkMap.get(nativeNetId) : null;
          const isUp = port.up === true;
          const speed = port.speed || 0;
          const isCustom = override?.forward === "customize";
          const poeEnabled = override ? override.poe_mode !== "off" : port.poe_enable;

          let portLabel = `Port ${port.port_idx}`;
          let vlanLabel = nativeNet ? `${nativeNet.name} (${nativeVlan})` : `VLAN ${nativeVlan}`;
          if (isCustom && nativeVlan === 1 && !nativeNet) vlanLabel = "Default";

          const bgColor = isUp
            ? nativeVlan === 1 ? "bg-muted" : "bg-primary/10 border-primary/30"
            : "bg-muted/50 border-dashed";

          return (
            <TooltipProvider key={port.port_idx} delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`relative flex flex-col items-center justify-center w-12 h-14 rounded border text-center cursor-default transition-colors ${bgColor}`}
                    data-testid={`port-${port.port_idx}`}
                  >
                    <span className="text-[10px] font-bold">{port.port_idx}</span>
                    <span className="text-[8px] text-muted-foreground truncate max-w-[42px]">
                      {nativeVlan === 1 ? "Def" : `V${nativeVlan}`}
                    </span>
                    {isUp && (
                      <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-status-online" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  <p className="font-medium">{portLabel}</p>
                  <p>Native: {vlanLabel}</p>
                  <p>Status: {isUp ? `Up (${speed >= 1000 ? `${speed/1000}G` : `${speed}M`})` : "Down"}</p>
                  {poeEnabled && <p>PoE: Active</p>}
                  {isCustom && <p className="text-primary">Custom profile</p>}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-status-online" /> Link up</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-primary/20 border border-primary/30" /> Custom VLAN</div>
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-muted border border-dashed" /> Down</div>
      </div>
    </div>
  );
}

function DeviceConfigDialog({ device, controllerId, siteId, onClose }: {
  device: Device;
  controllerId: string;
  siteId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/devices", device.id, "details", controllerId, siteId],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${device.id}/details?controllerId=${encodeURIComponent(controllerId)}&siteId=${encodeURIComponent(siteId)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load device details");
      return res.json();
    },
  });

  const isAP = device.deviceType === "access_point" || device.deviceType === "hybrid";
  const isSwitch = device.deviceType === "switch" || device.deviceType === "hybrid";

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
              </h3>
              <SwitchPortDiagram
                portTable={data.unifi.port_table}
                portOverrides={data.unifi.port_overrides || []}
                networks={data.networks || []}
              />
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

function UnitCard({ unit, devices, networks, wifiNetworks, portAssignments, controllerId, siteId, onDelete, onProvision, onDeprovision, onEdit }: {
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
                  {assignedDevices.map((device) => (
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
