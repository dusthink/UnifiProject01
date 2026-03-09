import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Router, Trash2, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Device, Community } from "@shared/schema";

interface ControllerSummary {
  id: string;
  name: string;
  url: string;
  isVerified: boolean | null;
}

export default function DevicesPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [model, setModel] = useState("");
  const [unifiDeviceId, setUnifiDeviceId] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [discoverControllerId, setDiscoverControllerId] = useState("");
  const [discoverSiteId, setDiscoverSiteId] = useState("default");

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: communities } = useQuery<Community[]>({
    queryKey: ["/api/communities"],
  });

  const { data: controllers } = useQuery<ControllerSummary[]>({
    queryKey: ["/api/controllers"],
  });

  const { data: controllerSites } = useQuery<any[]>({
    queryKey: ["/api/controllers", discoverControllerId, "sites"],
    queryFn: async () => {
      if (!discoverControllerId) return [];
      const res = await fetch(`/api/controllers/${discoverControllerId}/sites`, { credentials: "include" });
      return res.json();
    },
    enabled: !!discoverControllerId,
  });

  const { data: unifiDevices, refetch: refetchUnifi, isFetching: fetchingUnifi } = useQuery<any[]>({
    queryKey: ["/api/controllers", discoverControllerId, "devices", discoverSiteId],
    queryFn: async () => {
      if (!discoverControllerId || !discoverSiteId) return [];
      const res = await fetch(`/api/controllers/${discoverControllerId}/devices/${discoverSiteId}`, { credentials: "include" });
      return res.json();
    },
    enabled: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      setDialogOpen(false);
      setName(""); setMacAddress(""); setModel(""); setUnifiDeviceId(""); setCommunityId(""); setBuildingId("");
      toast({ title: "Device added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/devices/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Device deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const verifiedControllers = controllers?.filter(c => c.isVerified) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Devices</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage UniFi network devices</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-device">
              <Plus className="h-4 w-4 mr-2" />
              Add Device
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Device</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name,
                  macAddress,
                  model: model || null,
                  unifiDeviceId: unifiDeviceId || null,
                  communityId: communityId || null,
                  buildingId: buildingId || null,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Device Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Switch-Bldg-A" required data-testid="input-device-name" />
              </div>
              <div className="space-y-2">
                <Label>MAC Address</Label>
                <Input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" required data-testid="input-device-mac" />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g., USW-24-POE" data-testid="input-device-model" />
              </div>
              <div className="space-y-2">
                <Label>UniFi Device ID</Label>
                <Input value={unifiDeviceId} onChange={(e) => setUnifiDeviceId(e.target.value)} placeholder="From UniFi controller" data-testid="input-device-unifi-id" />
              </div>
              {communities && communities.length > 0 && (
                <div className="space-y-2">
                  <Label>Community</Label>
                  <Select value={communityId} onValueChange={setCommunityId}>
                    <SelectTrigger data-testid="select-device-community">
                      <SelectValue placeholder="Select community" />
                    </SelectTrigger>
                    <SelectContent>
                      {communities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-device">
                {createMutation.isPending ? "Adding..." : "Add Device"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {verifiedControllers.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-semibold">Discover Devices from Controller</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1.5 min-w-[180px]">
                <Label className="text-xs">Controller</Label>
                <Select value={discoverControllerId} onValueChange={(v) => { setDiscoverControllerId(v); setDiscoverSiteId("default"); }}>
                  <SelectTrigger data-testid="select-discover-controller">
                    <SelectValue placeholder="Select controller" />
                  </SelectTrigger>
                  <SelectContent>
                    {verifiedControllers.map((ctrl) => (
                      <SelectItem key={ctrl.id} value={ctrl.id}>{ctrl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {discoverControllerId && controllerSites && controllerSites.length > 0 && (
                <div className="space-y-1.5 min-w-[140px]">
                  <Label className="text-xs">Site</Label>
                  <Select value={discoverSiteId} onValueChange={setDiscoverSiteId}>
                    <SelectTrigger data-testid="select-discover-site">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {controllerSites.map((site: any) => (
                        <SelectItem key={site.name} value={site.name}>{site.desc || site.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button
                variant="secondary"
                onClick={() => refetchUnifi()}
                disabled={fetchingUnifi || !discoverControllerId}
                data-testid="button-discover-devices"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchingUnifi ? "animate-spin" : ""}`} />
                Discover
              </Button>
            </div>

            {unifiDevices && unifiDevices.length > 0 && (
              <div className="space-y-2 pt-2 border-t">
                {unifiDevices.map((d: any) => (
                  <div key={d._id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-accent/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.name || d.model}</p>
                      <p className="text-xs text-muted-foreground">{d.mac} - {d.model}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setName(d.name || d.model);
                        setMacAddress(d.mac);
                        setModel(d.model);
                        setUnifiDeviceId(d._id);
                        setDialogOpen(true);
                      }}
                      data-testid={`button-import-device-${d._id}`}
                    >
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {!devices?.length ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Router className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-1">No devices registered</h3>
              <p className="text-sm text-muted-foreground mb-4">Add UniFi switches and access points</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>UniFi ID</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => (
                    <TableRow key={device.id} data-testid={`row-device-${device.id}`}>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-accent px-1.5 py-0.5 rounded">{device.macAddress}</code>
                      </TableCell>
                      <TableCell>{device.model || "-"}</TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                        {device.unifiDeviceId || "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { if (confirm("Delete this device?")) deleteMutation.mutate(device.id); }}
                          data-testid={`button-delete-device-${device.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
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
