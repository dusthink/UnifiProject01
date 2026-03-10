import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Wifi, Shield, CheckCircle2, XCircle, Zap, Settings, Monitor } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Building, Unit, Device, UnitDevicePort, User, Community, Network } from "@shared/schema";

type SafeUser = Omit<User, "password">;

function UnitRow({ unit, devices, tenants, networks, onDelete, onProvision, onDeprovision, onEdit }: {
  unit: Unit;
  devices: Device[];
  tenants: SafeUser[];
  networks: Network[];
  onDelete: (id: string) => void;
  onProvision: (id: string) => void;
  onDeprovision: (id: string) => void;
  onEdit: (unit: Unit) => void;
}) {
  const tenant = unit.tenantId ? tenants.find(t => t.id === unit.tenantId) : null;
  const displayTenant = tenant ? (tenant.displayName || tenant.username) : unit.tenantName;
  const network = unit.networkId ? networks.find(n => n.id === unit.networkId) : null;

  return (
    <TableRow data-testid={`row-unit-${unit.id}`}>
      <TableCell className="font-medium">{unit.unitNumber}</TableCell>
      <TableCell>
        {network ? (
          <Badge variant="secondary" data-testid={`badge-network-${unit.id}`}>{network.name} (VLAN {network.vlanId})</Badge>
        ) : unit.vlanId ? (
          <Badge variant="secondary">VLAN {unit.vlanId}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Not set</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {unit.wifiMode === "ppsk" ? (
            <Shield className="h-3.5 w-3.5 text-chart-3" />
          ) : (
            <Wifi className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="text-sm uppercase">{unit.wifiMode || "ppsk"}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[120px] truncate">{unit.wifiSsid || "-"}</TableCell>
      <TableCell className="max-w-[100px] truncate" data-testid={`text-tenant-${unit.id}`}>{displayTenant || "-"}</TableCell>
      <TableCell>
        {unit.isProvisioned ? (
          <Badge variant="default" className="bg-status-online/15 text-status-online border-0">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Inactive
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(unit)} data-testid={`button-edit-unit-${unit.id}`}>
            <Settings className="h-4 w-4" />
          </Button>
          {unit.isProvisioned ? (
            <Button size="icon" variant="ghost" onClick={() => onDeprovision(unit.id)} data-testid={`button-deprovision-unit-${unit.id}`}>
              <XCircle className="h-4 w-4 text-destructive" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => onProvision(unit.id)} data-testid={`button-provision-unit-${unit.id}`}>
              <Zap className="h-4 w-4 text-status-online" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => onDelete(unit.id)} data-testid={`button-delete-unit-${unit.id}`}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
  const [wifiMode, setWifiMode] = useState("ppsk");
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
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

  const { data: tenants } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/tenant-users"],
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
    setWifiMode("ppsk");
    setWifiSsid("");
    setWifiPassword("");
    setSelectedTenantId("");
    setSelectedDeviceIds([]);
  };

  const openEdit = (unit: Unit) => {
    setEditUnit(unit);
    setUnitNumber(unit.unitNumber);
    setSelectedNetworkId(unit.networkId || "");
    setWifiMode(unit.wifiMode || "ppsk");
    setWifiSsid(unit.wifiSsid || "");
    setWifiPassword(unit.wifiPassword || "");
    setSelectedTenantId(unit.tenantId || "");
    const assignments = allPortAssignments?.[unit.id] || [];
    setSelectedDeviceIds(assignments.map(a => a.deviceId));
    setEditOpen(true);
  };

  const availableDevices = devices || [];

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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Unit Number</Label>
          <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g., 101" required data-testid="input-unit-number" />
        </div>
        <div className="space-y-2">
          <Label>Network</Label>
          {controllerNetworks && controllerNetworks.length > 0 ? (
            <Select value={selectedNetworkId} onValueChange={setSelectedNetworkId}>
              <SelectTrigger data-testid="select-network">
                <SelectValue placeholder="Select a network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No network assigned</SelectItem>
                {controllerNetworks.map((net) => (
                  <SelectItem key={net.id} value={net.id} data-testid={`option-network-${net.id}`}>
                    {net.name} (VLAN {net.vlanId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground pt-2">
              {community?.controllerId ? "No networks configured on controller. Add networks in the Controllers page." : "No controller assigned to this community."}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label>WiFi Mode</Label>
        <Select value={wifiMode} onValueChange={setWifiMode}>
          <SelectTrigger data-testid="select-wifi-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ppsk">PPSK (Private Pre-Shared Key)</SelectItem>
            <SelectItem value="individual">Individual SSID</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>WiFi SSID</Label>
          <Input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} placeholder={wifiMode === "ppsk" ? "Shared SSID" : "Unit-101-WiFi"} data-testid="input-wifi-ssid" />
        </div>
        <div className="space-y-2">
          <Label>WiFi Password</Label>
          <Input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} placeholder="Min 8 characters" data-testid="input-wifi-password" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Tenant</Label>
        <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
          <SelectTrigger data-testid="select-tenant">
            <SelectValue placeholder="No tenant assigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No tenant assigned</SelectItem>
            {tenants?.map((t) => (
              <SelectItem key={t.id} value={t.id} data-testid={`option-tenant-${t.id}`}>
                {t.displayName || t.username}{t.email ? ` (${t.email})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{device.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{device.macAddress}{device.model ? ` · ${device.model}` : ""}</p>
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
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const netId = selectedNetworkId && selectedNetworkId !== "none" ? selectedNetworkId : null;
                const selectedNet = netId ? controllerNetworks?.find(n => n.id === netId) : null;
                createMutation.mutate({
                  buildingId: id,
                  unitNumber,
                  networkId: netId,
                  vlanId: selectedNet?.vlanId ?? null,
                  wifiMode,
                  wifiSsid: wifiSsid || null,
                  wifiPassword: wifiPassword || null,
                  tenantId: selectedTenantId && selectedTenantId !== "none" ? selectedTenantId : null,
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
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editUnit) return;
              const netId = selectedNetworkId && selectedNetworkId !== "none" ? selectedNetworkId : null;
              const selectedNet = netId ? controllerNetworks?.find(n => n.id === netId) : null;
              updateMutation.mutate({
                unitId: editUnit.id,
                data: {
                  unitNumber,
                  networkId: netId,
                  vlanId: selectedNet?.vlanId ?? null,
                  wifiMode,
                  wifiSsid: wifiSsid || null,
                  wifiPassword: wifiPassword || null,
                  tenantId: selectedTenantId && selectedTenantId !== "none" ? selectedTenantId : null,
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

      <Card>
        <CardContent className="p-0">
          {!units?.length ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Wifi className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-1">No units yet</h3>
              <p className="text-sm text-muted-foreground">Add units to this building</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>WiFi Mode</TableHead>
                    <TableHead>SSID</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {units.map((unit) => (
                    <UnitRow
                      key={unit.id}
                      unit={unit}
                      devices={devices || []}
                      tenants={tenants || []}
                      networks={controllerNetworks || []}
                      onDelete={(uid) => { if (confirm("Delete this unit?")) deleteMutation.mutate(uid); }}
                      onProvision={(uid) => provisionMutation.mutate(uid)}
                      onDeprovision={(uid) => deprovisionMutation.mutate(uid)}
                      onEdit={openEdit}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
