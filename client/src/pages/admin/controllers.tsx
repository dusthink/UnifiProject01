import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Network, CheckCircle2, XCircle, RefreshCw, Trash2, Globe, Router, Eye, EyeOff, Pencil, Cpu, Clock, Wifi, Layers, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Network as NetworkType } from "@shared/schema";

interface Controller {
  id: string;
  name: string;
  url: string;
  username: string;
  isVerified: boolean | null;
  lastConnectedAt: string | null;
  isUnifiOs: boolean | null;
  hardwareModel: string | null;
  firmwareVersion: string | null;
  hostname: string | null;
  macAddress: string | null;
  uptimeSeconds: number | null;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

function ControllerForm({
  mode,
  initial,
  onSubmit,
  isPending,
}: {
  mode: "add" | "edit";
  initial?: { name: string; url: string; username: string };
  onSubmit: (data: { name: string; url: string; username: string; password: string }) => void;
  isPending: boolean;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [username, setUsername] = useState(initial?.username || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    if (!url || !username || !password) {
      toast({ title: "Fill in all fields", description: "URL, username, and password are required to test.", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/controllers/test-credentials", { url, username, password });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    }
    setTesting(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, url, username, password });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Main Office Controller"
          required
          data-testid="input-controller-name"
        />
      </div>
      <div className="space-y-2">
        <Label>Controller URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://192.168.1.1:8443"
          required
          data-testid="input-controller-url"
        />
        <p className="text-xs text-muted-foreground">Include the port (typically 8443 for self-hosted or 443 for UniFi Cloud)</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            required
            autoComplete="off"
            data-testid="input-controller-username"
          />
        </div>
        <div className="space-y-2">
          <Label>Password{mode === "edit" ? " (leave blank to keep current)" : ""}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "edit" ? "••••••••" : ""}
              required={mode === "add"}
              autoComplete="new-password"
              className="pr-10"
              data-testid="input-controller-password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${testResult.success ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`} data-testid="text-test-result">
          {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {testResult.message}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={handleTest}
          disabled={testing}
          data-testid="button-test-connection"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${testing ? "animate-spin" : ""}`} />
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        <Button type="submit" className="flex-1" disabled={isPending} data-testid="button-submit-controller">
          {isPending ? "Saving..." : mode === "add" ? "Add Controller" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

export default function ControllersPage() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editController, setEditController] = useState<Controller | null>(null);
  const [expandedCtrlId, setExpandedCtrlId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<"sites" | "networks" | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [addNetworkOpen, setAddNetworkOpen] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState("");
  const [networkVlanId, setNetworkVlanId] = useState("");
  const [networkSubnet, setNetworkSubnet] = useState("");
  const [networkDhcpEnabled, setNetworkDhcpEnabled] = useState(true);
  const [networkDhcpStart, setNetworkDhcpStart] = useState("");
  const [networkDhcpStop, setNetworkDhcpStop] = useState("");

  const { data: controllers, isLoading } = useQuery<Controller[]>({
    queryKey: ["/api/controllers"],
  });

  const isExpanded = (ctrlId: string, section: "sites" | "networks") =>
    expandedCtrlId === ctrlId && expandedSection === section;

  const toggleSection = (ctrlId: string, section: "sites" | "networks") => {
    if (expandedCtrlId === ctrlId && expandedSection === section) {
      setExpandedCtrlId(null);
      setExpandedSection(null);
    } else {
      setExpandedCtrlId(ctrlId);
      setExpandedSection(section);
    }
  };

  const { data: sites } = useQuery<any[]>({
    queryKey: ["/api/controllers", expandedCtrlId, "sites"],
    queryFn: async () => {
      if (!expandedCtrlId) return [];
      const res = await fetch(`/api/controllers/${expandedCtrlId}/sites`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedCtrlId && expandedSection === "sites",
  });

  const { data: controllerNetworks } = useQuery<NetworkType[]>({
    queryKey: ["/api/networks/controller", expandedCtrlId],
    queryFn: async () => {
      if (!expandedCtrlId) return [];
      const res = await fetch(`/api/networks/controller/${expandedCtrlId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedCtrlId && expandedSection === "networks",
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/controllers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
      setAddDialogOpen(false);
      toast({ title: "Controller added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/controllers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
      setEditController(null);
      toast({ title: "Controller updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/controllers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
      toast({ title: "Controller removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createNetworkMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/networks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", addNetworkOpen] });
      setAddNetworkOpen(null);
      resetNetworkForm();
      toast({ title: "Network created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteNetworkMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/networks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", expandedCtrlId] });
      toast({ title: "Network deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleTestSaved = async (id: string) => {
    setTestingId(id);
    setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      const res = await apiRequest("POST", `/api/controllers/${id}/test`);
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [id]: { success: false, message: err.message } }));
    }
    setTestingId(null);
  };

  const resetNetworkForm = () => {
    setNetworkName("");
    setNetworkVlanId("");
    setNetworkSubnet("");
    setNetworkDhcpEnabled(true);
    setNetworkDhcpStart("");
    setNetworkDhcpStop("");
  };

  const autoFillSubnet = (vlan: string) => {
    const v = parseInt(vlan);
    if (!isNaN(v) && v > 0 && v < 4095) {
      const oct2 = Math.floor(v / 256);
      const oct3 = v % 256;
      setNetworkSubnet(`10.${oct2}.${oct3}.1/25`);
      setNetworkDhcpStart(`10.${oct2}.${oct3}.2`);
      setNetworkDhcpStop(`10.${oct2}.${oct3}.126`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Controllers</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage UniFi controller connections</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-controller">
              <Plus className="h-4 w-4 mr-2" />
              Add Controller
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add UniFi Controller</DialogTitle>
              <DialogDescription>Enter the controller details and test the connection before adding.</DialogDescription>
            </DialogHeader>
            <ControllerForm
              mode="add"
              onSubmit={(data) => addMutation.mutate(data)}
              isPending={addMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editController} onOpenChange={(open) => { if (!open) setEditController(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Controller</DialogTitle>
            <DialogDescription>Update the controller details. Leave password blank to keep the current one.</DialogDescription>
          </DialogHeader>
          {editController && (
            <ControllerForm
              mode="edit"
              initial={{ name: editController.name, url: editController.url, username: editController.username }}
              onSubmit={(data) => {
                const payload: Record<string, any> = { name: data.name, url: data.url, username: data.username };
                if (data.password) payload.password = data.password;
                editMutation.mutate({ id: editController.id, data: payload });
              }}
              isPending={editMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addNetworkOpen} onOpenChange={(open) => { if (!open) { setAddNetworkOpen(null); resetNetworkForm(); createNetworkMutation.reset(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Network</DialogTitle>
            <DialogDescription>Create a VLAN network that can be assigned to units.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addNetworkOpen) return;
              createNetworkMutation.mutate({
                controllerId: addNetworkOpen,
                name: networkName,
                vlanId: parseInt(networkVlanId),
                ipSubnet: networkSubnet || null,
                dhcpEnabled: networkDhcpEnabled,
                dhcpStart: networkDhcpStart || null,
                dhcpStop: networkDhcpStop || null,
              });
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Network Name</Label>
                <Input
                  value={networkName}
                  onChange={(e) => setNetworkName(e.target.value)}
                  placeholder="e.g., Unit-101-Net"
                  required
                  data-testid="input-network-name"
                />
              </div>
              <div className="space-y-2">
                <Label>VLAN ID</Label>
                <Input
                  type="number"
                  value={networkVlanId}
                  onChange={(e) => {
                    setNetworkVlanId(e.target.value);
                    autoFillSubnet(e.target.value);
                  }}
                  placeholder="e.g., 100"
                  required
                  min={1}
                  max={4094}
                  data-testid="input-network-vlan"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>IP Subnet</Label>
              <Input
                value={networkSubnet}
                onChange={(e) => setNetworkSubnet(e.target.value)}
                placeholder="e.g., 10.0.100.1/25"
                data-testid="input-network-subnet"
              />
              <p className="text-xs text-muted-foreground">Auto-filled from VLAN ID. Modify if needed.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dhcp-enabled"
                checked={networkDhcpEnabled}
                onChange={(e) => setNetworkDhcpEnabled(e.target.checked)}
                className="rounded"
                data-testid="checkbox-dhcp-enabled"
              />
              <Label htmlFor="dhcp-enabled" className="cursor-pointer">Enable DHCP</Label>
            </div>
            {networkDhcpEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>DHCP Start</Label>
                  <Input
                    value={networkDhcpStart}
                    onChange={(e) => setNetworkDhcpStart(e.target.value)}
                    placeholder="e.g., 10.0.100.2"
                    data-testid="input-dhcp-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label>DHCP Stop</Label>
                  <Input
                    value={networkDhcpStop}
                    onChange={(e) => setNetworkDhcpStop(e.target.value)}
                    placeholder="e.g., 10.0.100.126"
                    data-testid="input-dhcp-stop"
                  />
                </div>
              </div>
            )}
            {createNetworkMutation.isError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3" data-testid="text-network-error">
                {(createNetworkMutation.error as any)?.message || "Failed to create network"}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={createNetworkMutation.isPending} data-testid="button-submit-network">
              {createNetworkMutation.isPending ? "Creating..." : "Create Network"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : controllers && controllers.length > 0 ? (
        <div className="space-y-4">
          {controllers.map((ctrl) => (
            <Card key={ctrl.id} data-testid={`card-controller-${ctrl.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 p-2 rounded-lg ${ctrl.isVerified ? "bg-green-500/10" : "bg-muted"}`}>
                      <Network className={`h-5 w-5 ${ctrl.isVerified ? "text-green-500" : "text-muted-foreground"}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`text-controller-name-${ctrl.id}`}>{ctrl.name}</h3>
                        {ctrl.hardwareModel && (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-model-${ctrl.id}`}>
                            <Cpu className="h-3 w-3 mr-1" />
                            {ctrl.hardwareModel}
                          </Badge>
                        )}
                        {ctrl.isUnifiOs && (
                          <Badge variant="outline" className="text-xs">UniFi OS</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate" data-testid={`text-controller-url-${ctrl.id}`}>
                        {ctrl.hostname ? `${ctrl.hostname} — ` : ""}{ctrl.url}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <Badge variant={ctrl.isVerified ? "default" : "secondary"} data-testid={`badge-controller-status-${ctrl.id}`}>
                          {ctrl.isVerified ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Verified</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Unverified</>
                          )}
                        </Badge>
                        {ctrl.firmwareVersion && (
                          <span className="text-xs text-muted-foreground" data-testid={`text-firmware-${ctrl.id}`}>
                            v{ctrl.firmwareVersion}
                          </span>
                        )}
                        {ctrl.uptimeSeconds && ctrl.uptimeSeconds > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-uptime-${ctrl.id}`}>
                            <Clock className="h-3 w-3" />
                            {formatUptime(ctrl.uptimeSeconds)}
                          </span>
                        )}
                        {ctrl.macAddress && (
                          <span className="text-xs text-muted-foreground font-mono" data-testid={`text-mac-${ctrl.id}`}>
                            {ctrl.macAddress.replace(/(.{2})(?=.)/g, "$1:")}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          User: {ctrl.username}
                        </span>
                        {ctrl.lastConnectedAt && (
                          <span className="text-xs text-muted-foreground">
                            Last connected: {new Date(ctrl.lastConnectedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTestSaved(ctrl.id)}
                      disabled={testingId === ctrl.id}
                      data-testid={`button-test-saved-controller-${ctrl.id}`}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${testingId === ctrl.id ? "animate-spin" : ""}`} />
                      {testingId === ctrl.id ? "Testing..." : "Test"}
                    </Button>
                    <Button
                      size="sm"
                      variant={isExpanded(ctrl.id, "sites") ? "default" : "outline"}
                      onClick={() => toggleSection(ctrl.id, "sites")}
                      data-testid={`button-expand-controller-${ctrl.id}`}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      Sites
                    </Button>
                    <Button
                      size="sm"
                      variant={isExpanded(ctrl.id, "networks") ? "default" : "outline"}
                      onClick={() => toggleSection(ctrl.id, "networks")}
                      data-testid={`button-networks-controller-${ctrl.id}`}
                    >
                      <Layers className="h-4 w-4 mr-1" />
                      Networks
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditController(ctrl)}
                      data-testid={`button-edit-controller-${ctrl.id}`}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Remove this controller?")) {
                          deleteMutation.mutate(ctrl.id);
                        }
                      }}
                      data-testid={`button-delete-controller-${ctrl.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {testResults[ctrl.id] && (
                  <div className={`mt-3 flex items-center gap-2 p-3 rounded-md text-sm ${testResults[ctrl.id].success ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`} data-testid={`text-test-saved-result-${ctrl.id}`}>
                    {testResults[ctrl.id].success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {testResults[ctrl.id].message}
                  </div>
                )}

                {isExpanded(ctrl.id, "sites") && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Discovered Sites
                    </h4>
                    {sites && sites.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>ID</TableHead>
                            <TableHead>Devices</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sites.map((site: any) => (
                            <TableRow key={site.name} data-testid={`row-site-${site.name}`}>
                              <TableCell className="font-medium">{site.desc || site.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{site.name}</Badge>
                              </TableCell>
                              <TableCell>{site.num_new_alarms ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {ctrl.isVerified ? "No sites found" : "Test connection first to discover sites"}
                      </p>
                    )}
                  </div>
                )}

                {isExpanded(ctrl.id, "networks") && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Networks (VLANs)
                      </h4>
                      <Button
                        size="sm"
                        onClick={() => setAddNetworkOpen(ctrl.id)}
                        data-testid={`button-add-network-${ctrl.id}`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Network
                      </Button>
                    </div>
                    {controllerNetworks && controllerNetworks.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>VLAN</TableHead>
                            <TableHead>Subnet</TableHead>
                            <TableHead>DHCP</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead className="w-[60px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {controllerNetworks.map((net) => (
                            <TableRow key={net.id} className={!net.isManaged ? "opacity-75" : ""} data-testid={`row-network-${net.id}`}>
                              <TableCell className="font-medium" data-testid={`text-network-name-${net.id}`}>{net.name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" data-testid={`badge-vlan-${net.id}`}>VLAN {net.vlanId}</Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground font-mono">{net.ipSubnet || "—"}</TableCell>
                              <TableCell>
                                {net.dhcpEnabled ? (
                                  <span className="text-xs text-muted-foreground">
                                    {net.dhcpStart} - {net.dhcpStop}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Disabled</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {net.isManaged ? (
                                  <Badge variant="outline" className="text-xs" data-testid={`badge-source-${net.id}`}>Web UI</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-muted" data-testid={`badge-source-${net.id}`}>
                                    <Lock className="h-3 w-3 mr-1" />
                                    Controller
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {net.isManaged ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      if (confirm("Delete this network? This will also remove it from the UniFi controller.")) {
                                        deleteNetworkMutation.mutate(net.id);
                                      }
                                    }}
                                    data-testid={`button-delete-network-${net.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground px-2" title="Controller-managed networks cannot be modified here">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No networks found. Add a network or test the controller connection to discover existing networks.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Router className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">No Controllers</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Add a UniFi controller to start managing your network. You'll need the controller URL and admin credentials.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
