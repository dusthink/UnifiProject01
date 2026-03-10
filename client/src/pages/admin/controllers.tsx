import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Network, CheckCircle2, XCircle, RefreshCw, Trash2, Globe, Router, Eye, EyeOff, Pencil, Cpu, Clock, Wifi, Layers, Lock, Copy, ChevronRight, ChevronDown, Monitor, Signal, Radio, ArrowLeftRight, HardDrive, Download, AlertTriangle, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Network as NetworkType, Device } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type DeviceType = "switch" | "access_point" | "hybrid" | "gateway" | "other";

function detectDeviceType(dev: any): DeviceType {
  const type = (dev.type || "").toLowerCase();
  const model = (dev.model || "").toLowerCase();

  const isSwitch = type === "usw" || model.startsWith("usw") || model.startsWith("us-");
  const isAP = type === "uap" || model.startsWith("uap") || model.startsWith("u6-") || model.startsWith("u7-");
  const isGateway = type === "ugw" || type === "udm" || type === "uxg" || model.startsWith("udm") || model.startsWith("ugw") || model.startsWith("uxg");

  if (isSwitch && isAP) return "hybrid";
  if (model.includes("iw") || model.includes("in-wall")) return "hybrid";
  if (isGateway) return "gateway";
  if (isSwitch) return "switch";
  if (isAP) return "access_point";
  return "other";
}

function detectPortCount(dev: any): number | null {
  if (dev.port_table && Array.isArray(dev.port_table)) {
    return dev.port_table.length;
  }
  if (typeof dev.port_overrides === "object" && Array.isArray(dev.port_overrides)) {
    return dev.port_overrides.length;
  }
  return null;
}

const deviceTypeLabels: Record<DeviceType, string> = {
  switch: "Switch",
  access_point: "Access Point",
  hybrid: "Hybrid (AP + Switch)",
  gateway: "Gateway",
  other: "Other",
};

const deviceTypeColors: Record<DeviceType, string> = {
  switch: "bg-blue-500/10 text-blue-600 border-blue-200",
  access_point: "bg-purple-500/10 text-purple-600 border-purple-200",
  hybrid: "bg-amber-500/10 text-amber-600 border-amber-200",
  gateway: "bg-green-500/10 text-green-600 border-green-200",
  other: "bg-gray-500/10 text-gray-600 border-gray-200",
};

function DeviceTypeIcon({ type, className = "h-4 w-4" }: { type: DeviceType; className?: string }) {
  switch (type) {
    case "switch": return <ArrowLeftRight className={className} />;
    case "access_point": return <Radio className={className} />;
    case "hybrid": return <Wifi className={className} />;
    case "gateway": return <Router className={className} />;
    default: return <Monitor className={className} />;
  }
}

function DeviceTypeBadge({ type }: { type: DeviceType }) {
  return (
    <Badge variant="outline" className={`text-xs ${deviceTypeColors[type]}`} data-testid={`badge-device-type-${type}`}>
      <DeviceTypeIcon type={type} className="h-3 w-3 mr-1" />
      {deviceTypeLabels[type]}
    </Badge>
  );
}

function getDeviceImageUrl(iconId: string | null | undefined, size: number = 128): string | null {
  if (!iconId) return null;
  return `https://static.ui.com/fingerprint/0/${iconId}_${size}x${size}.png`;
}

function DeviceImage({ iconId, deviceType, size = 36, className = "" }: { iconId?: string | null; deviceType?: DeviceType; size?: number; className?: string }) {
  const [imgError, setImgError] = useState(false);
  const url = getDeviceImageUrl(iconId, size > 64 ? 257 : 128);

  if (!url || imgError) {
    return <DeviceTypeIcon type={deviceType || "other"} className={`h-${Math.round(size/6)} w-${Math.round(size/6)} text-muted-foreground`} />;
  }

  return (
    <img
      src={url}
      alt="Device"
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
      onError={() => setImgError(true)}
      data-testid="img-device"
    />
  );
}

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

const wifiDefaults = {
  name: "", password: "", wpaMode: "wpa2", securityMode: "wpapsk", networkConfId: "",
  enabled: true, isGuest: false, hideSsid: false, wlanBand: "both",
  macFilterEnabled: false, macFilterPolicy: "allow", macFilterList: "",
  uapsdEnabled: false, dtimMode: "default", dtimNa: 1, dtimNg: 1,
  minrateNaEnabled: false, minrateNaDataRateKbps: 6000, minrateNgEnabled: false, minrateNgDataRateKbps: 1000,
  fastRoamingEnabled: false, pmfMode: "optional", groupRekey: 3600,
  bcastEnhanceEnabled: true, l2Isolation: false, proxyArp: false,
  rateLimitEnabled: false, rateLimitUpload: 0, rateLimitDownload: 0,
  scheduleEnabled: false,
};

interface BackupEntry {
  id: string;
  controllerId: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  schedule: string;
}

interface BackupSettings {
  controllerId: string;
  enabled: boolean;
  schedule: string;
  consentAcceptedAt?: string | null;
  lastBackupAt?: string | null;
  nextBackupAt?: string | null;
}

function BackupDialog({ controller, open, onOpenChange }: { controller: Controller; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [showConsent, setShowConsent] = useState(false);
  const [consentSource, setConsentSource] = useState<"toggle" | "manual">("toggle");
  const [pendingSchedule, setPendingSchedule] = useState("daily");
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  const settingsQuery = useQuery<BackupSettings>({
    queryKey: ["/api/controllers", controller.id, "backup-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/controllers/${controller.id}/backup-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load backup settings");
      return res.json();
    },
    enabled: open,
  });

  const backupsQuery = useQuery<BackupEntry[]>({
    queryKey: ["/api/controllers", controller.id, "backups"],
    queryFn: async () => {
      const res = await fetch(`/api/controllers/${controller.id}/backups`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load backups");
      return res.json();
    },
    enabled: open,
  });

  const settings = settingsQuery.data;

  const handleToggleBackups = async (enabled: boolean) => {
    if (enabled && !settings?.consentAcceptedAt) {
      setConsentSource("toggle");
      setShowConsent(true);
      return;
    }
    try {
      await apiRequest("PUT", `/api/controllers/${controller.id}/backup-settings`, {
        enabled,
        schedule: settings?.schedule || "daily",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
      toast({ title: enabled ? "Backups enabled" : "Backups disabled" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleConsentAccept = async () => {
    try {
      if (consentSource === "manual") {
        await apiRequest("PUT", `/api/controllers/${controller.id}/backup-settings`, {
          enabled: settings?.enabled ?? false,
          schedule: settings?.schedule || "daily",
          consentAccepted: true,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
        setShowConsent(false);
        toast({ title: "Consent accepted", description: "Starting backup..." });
        setTriggeringBackup(true);
        try {
          await apiRequest("POST", `/api/controllers/${controller.id}/backups/trigger`, {});
          queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backups"] });
          queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
          toast({ title: "Backup completed", description: "Controller backup has been created successfully." });
        } catch (err: any) {
          toast({ title: "Backup failed", description: err.message, variant: "destructive" });
        } finally {
          setTriggeringBackup(false);
        }
      } else {
        await apiRequest("PUT", `/api/controllers/${controller.id}/backup-settings`, {
          enabled: true,
          schedule: pendingSchedule,
          consentAccepted: true,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
        setShowConsent(false);
        toast({ title: "Backups enabled", description: "Cloud storage consent accepted." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleScheduleChange = async (schedule: string) => {
    try {
      await apiRequest("PUT", `/api/controllers/${controller.id}/backup-settings`, {
        enabled: settings?.enabled ?? false,
        schedule,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleTriggerBackup = async () => {
    if (!settings?.consentAcceptedAt) {
      setConsentSource("manual");
      setShowConsent(true);
      return;
    }
    setTriggeringBackup(true);
    try {
      await apiRequest("POST", `/api/controllers/${controller.id}/backups/trigger`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backup-settings"] });
      toast({ title: "Backup completed", description: "Controller backup has been created successfully." });
    } catch (err: any) {
      toast({ title: "Backup failed", description: err.message, variant: "destructive" });
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleDeleteBackup = async (id: string) => {
    if (!confirm("Delete this backup? This cannot be undone.")) return;
    try {
      await apiRequest("DELETE", `/api/backups/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/controllers", controller.id, "backups"] });
      toast({ title: "Backup deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDownloadBackup = (id: string, filename: string) => {
    const link = document.createElement("a");
    link.href = `/api/backups/${id}/download`;
    link.download = filename;
    link.click();
  };

  const retentionLabels: Record<string, string> = { daily: "14 days", weekly: "14 weeks", monthly: "14 months" };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <>
      <Dialog open={open && !showConsent} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle data-testid="text-backup-dialog-title">Controller Backups - {controller.name}</DialogTitle>
            <DialogDescription>Manage automatic and manual backups for this controller.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-1">
                <div className="font-medium text-sm">Automatic Backups</div>
                <div className="text-xs text-muted-foreground">
                  {settings?.enabled
                    ? `Running ${settings.schedule} - Retention: ${retentionLabels[settings.schedule] || "7 days"}`
                    : "Backups are currently disabled"}
                </div>
                {settings?.lastBackupAt && (
                  <div className="text-xs text-muted-foreground">
                    Last backup: {new Date(settings.lastBackupAt).toLocaleString()}
                  </div>
                )}
                {settings?.nextBackupAt && settings.enabled && (
                  <div className="text-xs text-muted-foreground">
                    Next backup: {new Date(settings.nextBackupAt).toLocaleString()}
                  </div>
                )}
              </div>
              <Switch
                checked={settings?.enabled ?? false}
                onCheckedChange={handleToggleBackups}
                data-testid="switch-backup-enabled"
              />
            </div>

            {settings?.enabled && (
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <Label className="text-sm font-medium">Schedule</Label>
                <Select value={settings.schedule} onValueChange={handleScheduleChange}>
                  <SelectTrigger className="w-36" data-testid="select-backup-schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-auto">
                  Retention: {retentionLabels[settings.schedule] || "7 days"}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleTriggerBackup}
                disabled={triggeringBackup || !controller.isVerified}
                data-testid="button-trigger-backup"
              >
                {triggeringBackup ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <HardDrive className="h-4 w-4 mr-1" />
                )}
                {triggeringBackup ? "Creating Backup..." : "Backup Now"}
              </Button>
              {!controller.isVerified && (
                <span className="text-xs text-muted-foreground">Controller must be verified to create backups.</span>
              )}
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Backup History</div>
              {backupsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (backupsQuery.data?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg">
                  No backups yet. Click "Backup Now" to create one.
                </div>
              ) : (
                <ScrollArea className="max-h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Filename</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backupsQuery.data?.map((b) => (
                        <TableRow key={b.id} data-testid={`row-backup-${b.id}`}>
                          <TableCell className="font-mono text-xs" data-testid={`text-backup-filename-${b.id}`}>{b.filename}</TableCell>
                          <TableCell className="text-xs">{formatFileSize(b.fileSize)}</TableCell>
                          <TableCell className="text-xs">{new Date(b.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadBackup(b.id, b.filename)}
                                data-testid={`button-download-backup-${b.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteBackup(b.id)}
                                data-testid={`button-delete-backup-${b.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConsent} onOpenChange={setShowConsent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Cloud Storage Consent
            </DialogTitle>
            <DialogDescription>Please review before enabling controller backups.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2 dark:bg-amber-950 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm space-y-2">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Security Notice</p>
                  <p className="text-amber-700 dark:text-amber-300">
                    Controller backups contain sensitive configuration data including network settings,
                    device configurations, and security credentials. By enabling backups, you acknowledge:
                  </p>
                  <ul className="list-disc ml-4 text-amber-700 dark:text-amber-300 space-y-1">
                    <li>Backup files will be stored in this application's database</li>
                    <li>Backups contain sensitive network configuration data</li>
                    <li>You are responsible for controlling access to this platform</li>
                    <li>Expired backups are automatically deleted based on the retention schedule</li>
                  </ul>
                </div>
              </div>
            </div>

            {consentSource === "toggle" && (
              <div className="flex items-center gap-4">
                <Label className="text-sm font-medium">Backup Schedule</Label>
                <Select value={pendingSchedule} onValueChange={setPendingSchedule}>
                  <SelectTrigger className="w-36" data-testid="select-consent-schedule">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowConsent(false)} data-testid="button-consent-cancel">
                Cancel
              </Button>
              <Button onClick={handleConsentAccept} data-testid="button-consent-accept">
                {consentSource === "manual" ? "I Understand, Create Backup" : "I Understand, Enable Backups"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ControllersPage() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editController, setEditController] = useState<Controller | null>(null);
  const [expandedCtrlId, setExpandedCtrlId] = useState<string | null>(null);
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);
  const [siteTab, setSiteTab] = useState<"networks" | "wifi" | "devices">("networks");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [addNetworkOpen, setAddNetworkOpen] = useState<{ controllerId: string; siteId: string } | null>(null);
  const [networkName, setNetworkName] = useState("");
  const [networkVlanId, setNetworkVlanId] = useState("");
  const [networkSubnet, setNetworkSubnet] = useState("");
  const [networkDhcpEnabled, setNetworkDhcpEnabled] = useState(true);
  const [networkDhcpStart, setNetworkDhcpStart] = useState("");
  const [networkDhcpStop, setNetworkDhcpStop] = useState("");

  const [addWifiOpen, setAddWifiOpen] = useState<{ controllerId: string; siteId: string } | null>(null);
  const [showWifiAdvanced, setShowWifiAdvanced] = useState(false);
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [wifi, setWifi] = useState(wifiDefaults);
  const wf = (field: string, value: any) => setWifi(prev => ({ ...prev, [field]: value }));
  const resetWifi = () => { setWifi(wifiDefaults); setShowWifiAdvanced(false); setShowWifiPassword(false); };

  const [selectedNetworkIds, setSelectedNetworkIds] = useState<string[]>([]);
  const [selectedWifiIds, setSelectedWifiIds] = useState<string[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{ type: "networks" | "wifi" | "devices"; ids: string[] } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [bulkWifiOpen, setBulkWifiOpen] = useState<{ controllerId: string; siteId: string } | null>(null);
  const [bulkWifiTab, setBulkWifiTab] = useState<"ppsk" | "ssid">("ppsk");
  const [bulkWifiPpskMode, setBulkWifiPpskMode] = useState<"new" | "existing">("new");
  const [bulkWifiName, setBulkWifiName] = useState("");
  const [bulkWifiExistingId, setBulkWifiExistingId] = useState("");
  const [bulkWifiSelectedNetworks, setBulkWifiSelectedNetworks] = useState<string[]>([]);
  const [bulkWifiNaming, setBulkWifiNaming] = useState<"network" | "prefix" | "custom">("network");
  const [bulkWifiPrefix, setBulkWifiPrefix] = useState("WiFi");
  const [bulkWifiSubmitting, setBulkWifiSubmitting] = useState(false);
  const [bulkWifiResult, setBulkWifiResult] = useState<{ total: number; succeeded: number; failed: number; results: any[] } | null>(null);

  const resetBulkWifi = () => {
    setBulkWifiTab("ppsk");
    setBulkWifiPpskMode("new");
    setBulkWifiName("");
    setBulkWifiExistingId("");
    setBulkWifiSelectedNetworks([]);
    setBulkWifiNaming("network");
    setBulkWifiPrefix("WiFi");
    setBulkWifiSubmitting(false);
    setBulkWifiResult(null);
  };

  const [backupDialogCtrl, setBackupDialogCtrl] = useState<Controller | null>(null);
  const [importDevicesOpen, setImportDevicesOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState<{ controllerId: string; siteId: string } | null>(null);
  const [bulkCount, setBulkCount] = useState("10");
  const [bulkVlanStart, setBulkVlanStart] = useState("100");
  const [bulkPrefix, setBulkPrefix] = useState("VLAN-");
  const [bulkSubnetSize, setBulkSubnetSize] = useState("25");
  const [bulkDhcp, setBulkDhcp] = useState(true);
  const [bulkResult, setBulkResult] = useState<{ requested: number; total: number; succeeded: number; failed: number; skipped: number; errors: string[]; results: any[] } | null>(null);
  const [bulkCreating, setBulkCreating] = useState(false);

  const { data: controllers, isLoading } = useQuery<Controller[]>({
    queryKey: ["/api/controllers"],
  });

  const clearSelections = () => { setSelectedNetworkIds([]); setSelectedWifiIds([]); setSelectedDeviceIds([]); };

  const toggleController = (ctrlId: string) => {
    if (expandedCtrlId === ctrlId) {
      setExpandedCtrlId(null);
      setExpandedSiteId(null);
    } else {
      setExpandedCtrlId(ctrlId);
      setExpandedSiteId(null);
    }
    clearSelections();
  };

  const toggleSite = (siteId: string) => {
    if (expandedSiteId === siteId) {
      setExpandedSiteId(null);
    } else {
      setExpandedSiteId(siteId);
      setSiteTab("networks");
    }
    clearSelections();
  };

  const { data: sites } = useQuery<any[]>({
    queryKey: ["/api/controllers", expandedCtrlId, "sites"],
    queryFn: async () => {
      if (!expandedCtrlId) return [];
      const res = await fetch(`/api/controllers/${expandedCtrlId}/sites`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedCtrlId,
  });

  const { data: siteNetworks } = useQuery<NetworkType[]>({
    queryKey: ["/api/networks/controller", expandedCtrlId, "site", expandedSiteId],
    queryFn: async () => {
      if (!expandedCtrlId || !expandedSiteId) return [];
      const res = await fetch(`/api/networks/controller/${expandedCtrlId}?siteId=${encodeURIComponent(expandedSiteId)}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedCtrlId && !!expandedSiteId && (siteTab === "networks" || siteTab === "wifi"),
  });

  const { data: importedDevices, isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
    enabled: !!expandedCtrlId && !!expandedSiteId && siteTab === "devices",
  });

  const { data: wifiNetworks, isLoading: wifiLoading } = useQuery<any[]>({
    queryKey: ["/api/wifi-networks/controller", expandedCtrlId, "site", expandedSiteId],
    queryFn: async () => {
      if (!expandedCtrlId || !expandedSiteId) return [];
      const res = await fetch(`/api/wifi-networks/controller/${expandedCtrlId}?siteId=${encodeURIComponent(expandedSiteId)}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedCtrlId && !!expandedSiteId && siteTab === "wifi",
  });

  const { data: liveDevices, isFetching: fetchingLiveDevices, refetch: refetchLiveDevices } = useQuery<any[]>({
    queryKey: ["/api/controllers", expandedCtrlId, "live-devices", expandedSiteId],
    queryFn: async () => {
      if (!expandedCtrlId || !expandedSiteId) return [];
      const res = await fetch(`/api/controllers/${expandedCtrlId}/devices/${encodeURIComponent(expandedSiteId)}`, { credentials: "include" });
      return res.json();
    },
    enabled: false,
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
      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", expandedCtrlId, "site", expandedSiteId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", expandedCtrlId, "site", expandedSiteId] });
      toast({ title: "Network deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const importDeviceMutation = useMutation({
    mutationFn: async (data: { name: string; macAddress: string; model: string | null; unifiDeviceId: string | null }) => {
      const res = await apiRequest("POST", "/api/devices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Device imported" });
    },
    onError: (err: any) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/devices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Device removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addWifiMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/wifi-networks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wifi-networks/controller"] });
      toast({ title: "WiFi network created" });
      setAddWifiOpen(null);
      resetWifi();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteWifiMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/wifi-networks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wifi-networks/controller"] });
      toast({ title: "WiFi network deleted" });
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

  const resetBulkForm = () => {
    setBulkCount("10");
    setBulkVlanStart("100");
    setBulkPrefix("VLAN-");
    setBulkSubnetSize("25");
    setBulkDhcp(true);
    setBulkResult(null);
    setBulkCreating(false);
  };

  const bulkPreview = (() => {
    const count = parseInt(bulkCount) || 0;
    const vlanStart = parseInt(bulkVlanStart) || 0;
    const cidrBits = parseInt(bulkSubnetSize) || 25;
    const hostBits = 32 - cidrBits;
    const blockSize = 1 << hostBits;
    const fmtIp = (ip: number) => `${(ip >>> 24) & 0xFF}.${(ip >>> 16) & 0xFF}.${(ip >>> 8) & 0xFF}.${ip & 0xFF}`;

    const items: Array<{ vlanId: number; name: string; subnet: string; dhcpRange: string }> = [];
    const max = Math.min(count, 200);
    for (let i = 0; i < max; i++) {
      const vlanId = vlanStart + i;
      if (vlanId > 4094) break;
      const oct2 = Math.floor(vlanId / 256);
      const oct3 = vlanId % 256;
      const subnetBase = ((10 << 24) | (oct2 << 16) | (oct3 << 8)) >>> 0;
      const gateway = (subnetBase + 1) >>> 0;
      const dhcpStart = (subnetBase + 2) >>> 0;
      const dhcpEnd = (subnetBase + blockSize - 2) >>> 0;
      items.push({
        vlanId,
        name: `${bulkPrefix}${vlanId}`,
        subnet: `${fmtIp(gateway)}/${cidrBits}`,
        dhcpRange: bulkDhcp ? `${fmtIp(dhcpStart)} - ${fmtIp(dhcpEnd)}` : "Disabled",
      });
    }
    return items;
  })();

  const handleBulkCreate = async () => {
    if (!bulkOpen) return;
    setBulkCreating(true);
    setBulkResult(null);
    try {
      const res = await apiRequest("POST", "/api/networks/bulk", {
        controllerId: bulkOpen.controllerId,
        siteId: bulkOpen.siteId,
        count: parseInt(bulkCount),
        vlanStart: parseInt(bulkVlanStart),
        namePrefix: bulkPrefix,
        subnetSize: bulkSubnetSize,
        dhcpEnabled: bulkDhcp,
      });
      const data = await res.json();
      setBulkResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", bulkOpen.controllerId, "site", bulkOpen.siteId] });
      if (data.succeeded > 0) {
        toast({ title: `Created ${data.succeeded} network${data.succeeded > 1 ? "s" : ""}`, description: data.failed > 0 ? `${data.failed} failed` : undefined });
      }
    } catch (err: any) {
      toast({ title: "Bulk create failed", description: err.message, variant: "destructive" });
    }
    setBulkCreating(false);
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
                controllerId: addNetworkOpen.controllerId,
                siteId: addNetworkOpen.siteId,
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

      <Dialog open={!!addWifiOpen} onOpenChange={(open) => { if (!open) { setAddWifiOpen(null); resetWifi(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add WiFi Network</DialogTitle>
            <DialogDescription>Create a wireless SSID on the UniFi controller.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addWifiOpen) return;
              const isPpsk = wifi.securityMode === "ppsk";
              addWifiMutation.mutate({
                controllerId: addWifiOpen.controllerId,
                siteId: addWifiOpen.siteId,
                ...wifi,
                securityMode: isPpsk ? "wpapsk" : wifi.securityMode,
                wpaMode: isPpsk ? "wpa2" : wifi.wpaMode,
                isPpsk,
                networkConfId: wifi.networkConfId || undefined,
                macFilterList: wifi.macFilterEnabled && wifi.macFilterList ? wifi.macFilterList.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean) : undefined,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>SSID Name</Label>
              <Input value={wifi.name} onChange={(e) => wf("name", e.target.value)} placeholder="e.g., Building-A-WiFi" required data-testid="input-wifi-name" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Security Protocol</Label>
                <Select value={wifi.securityMode} onValueChange={(v) => {
                  wf("securityMode", v);
                  if (v === "ppsk") {
                    wf("wpaMode", "wpa2");
                    if (wifi.wlanBand === "6g") wf("wlanBand", "both");
                  }
                }}>
                  <SelectTrigger data-testid="select-wifi-security"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wpapsk">WPA Personal</SelectItem>
                    <SelectItem value="ppsk">WPA Personal (PPSK)</SelectItem>
                    <SelectItem value="open">Open (No Encryption)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(wifi.securityMode === "wpapsk" || wifi.securityMode === "ppsk") && (
                <div className="space-y-2">
                  <Label>WPA Mode</Label>
                  {wifi.securityMode === "ppsk" ? (
                    <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm text-muted-foreground" data-testid="text-wifi-wpa-mode-locked">
                      WPA2 (required for PPSK)
                    </div>
                  ) : (
                    <Select value={wifi.wpaMode} onValueChange={(v) => wf("wpaMode", v)}>
                      <SelectTrigger data-testid="select-wifi-wpa-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wpa2">WPA2</SelectItem>
                        <SelectItem value="wpa3">WPA3</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>

            {wifi.securityMode === "ppsk" && (
              <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300" data-testid="text-ppsk-info">
                PPSK networks use Private Pre-Shared Keys — each user or device gets a unique password. Individual keys are managed per-unit after the network is created.
              </div>
            )}

            {wifi.securityMode === "wpapsk" && (
              <div className="space-y-2">
                <Label>Password</Label>
                <div className="relative">
                  <Input type={showWifiPassword ? "text" : "password"} value={wifi.password} onChange={(e) => wf("password", e.target.value)} placeholder="Min 8 characters" required minLength={8} data-testid="input-wifi-password" />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowWifiPassword(!showWifiPassword)} data-testid="button-toggle-wifi-password">
                    {showWifiPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={wifi.networkConfId || "_none"} onValueChange={(v) => wf("networkConfId", v === "_none" ? "" : v)}>
                <SelectTrigger data-testid="select-wifi-network"><SelectValue placeholder="Default network" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Default (LAN)</SelectItem>
                  {siteNetworks?.map((net: any) => (
                    <SelectItem key={net.networkConfId || net.id} value={net.networkConfId || net.id}>
                      {net.name} {net.vlanId ? `(VLAN ${net.vlanId})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={wifi.isGuest} onChange={(e) => wf("isGuest", e.target.checked)} className="rounded" data-testid="checkbox-wifi-guest" />
                Guest Network
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={wifi.enabled} onChange={(e) => wf("enabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-enabled" />
                Enabled
              </label>
            </div>

            <button type="button" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full" onClick={() => setShowWifiAdvanced(!showWifiAdvanced)} data-testid="button-wifi-advanced-toggle">
              <ChevronRight className={`h-4 w-4 transition-transform ${showWifiAdvanced ? "rotate-90" : ""}`} />
              Advanced Options
            </button>

            {showWifiAdvanced && (
              <div className="space-y-5 border rounded-lg p-4 bg-muted/30">

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Wifi className="h-4 w-4" /> Broadcasting</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.hideSsid} onChange={(e) => wf("hideSsid", e.target.checked)} className="rounded" data-testid="checkbox-wifi-hide-ssid" />
                    Hide SSID (don't broadcast network name)
                  </label>
                  <div className="space-y-2">
                    <Label>WiFi Band</Label>
                    <Select value={wifi.wlanBand} onValueChange={(v) => wf("wlanBand", v)}>
                      <SelectTrigger data-testid="select-wifi-band"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both (2.4 GHz & 5 GHz)</SelectItem>
                        <SelectItem value="2g">2.4 GHz Only</SelectItem>
                        <SelectItem value="5g">5 GHz Only</SelectItem>
                        {wifi.securityMode !== "ppsk" && <SelectItem value="6g">6 GHz Only</SelectItem>}
                      </SelectContent>
                    </Select>
                    {wifi.securityMode === "ppsk" && (
                      <p className="text-xs text-muted-foreground">6 GHz is not available for PPSK networks.</p>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> Security</h4>
                  {wifi.securityMode === "wpapsk" && (
                    <>
                      <div className="space-y-2">
                        <Label>PMF (Protected Management Frames)</Label>
                        <Select value={wifi.pmfMode} onValueChange={(v) => wf("pmfMode", v)}>
                          <SelectTrigger data-testid="select-wifi-pmf"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="disabled">Disabled</SelectItem>
                            <SelectItem value="optional">Optional</SelectItem>
                            <SelectItem value="required">Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Group Rekey Interval (seconds)</Label>
                        <Input type="number" value={wifi.groupRekey} onChange={(e) => wf("groupRekey", parseInt(e.target.value) || 3600)} min={0} max={86400} data-testid="input-wifi-group-rekey" />
                      </div>
                    </>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.fastRoamingEnabled} onChange={(e) => wf("fastRoamingEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-fast-roaming" />
                    BSS Transition (802.11v / Fast Roaming)
                  </label>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Signal className="h-4 w-4" /> MAC Filter</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.macFilterEnabled} onChange={(e) => wf("macFilterEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-mac-filter" />
                    Enable MAC Address Filtering
                  </label>
                  {wifi.macFilterEnabled && (
                    <>
                      <div className="space-y-2">
                        <Label>Filter Policy</Label>
                        <Select value={wifi.macFilterPolicy} onValueChange={(v) => wf("macFilterPolicy", v)}>
                          <SelectTrigger data-testid="select-wifi-mac-policy"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="allow">Allow Listed (Whitelist)</SelectItem>
                            <SelectItem value="deny">Deny Listed (Blacklist)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>MAC Addresses (one per line or comma-separated)</Label>
                        <textarea className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={wifi.macFilterList} onChange={(e) => wf("macFilterList", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" data-testid="textarea-wifi-mac-list" />
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Rate Limiting</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.rateLimitEnabled} onChange={(e) => wf("rateLimitEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-rate-limit" />
                    Enable Bandwidth Limit
                  </label>
                  {wifi.rateLimitEnabled && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Download Limit (Kbps)</Label>
                        <Input type="number" value={wifi.rateLimitDownload} onChange={(e) => wf("rateLimitDownload", parseInt(e.target.value) || 0)} min={0} data-testid="input-wifi-rate-down" />
                      </div>
                      <div className="space-y-2">
                        <Label>Upload Limit (Kbps)</Label>
                        <Input type="number" value={wifi.rateLimitUpload} onChange={(e) => wf("rateLimitUpload", parseInt(e.target.value) || 0)} min={0} data-testid="input-wifi-rate-up" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Radio className="h-4 w-4" /> Performance</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.uapsdEnabled} onChange={(e) => wf("uapsdEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-uapsd" />
                    U-APSD (Unscheduled Automatic Power Save Delivery)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.bcastEnhanceEnabled} onChange={(e) => wf("bcastEnhanceEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-bcast-enhance" />
                    Multicast Enhancement (IGMPv3)
                  </label>
                  <div className="space-y-2">
                    <Label>DTIM Mode</Label>
                    <Select value={wifi.dtimMode} onValueChange={(v) => wf("dtimMode", v)}>
                      <SelectTrigger data-testid="select-wifi-dtim-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {wifi.dtimMode === "custom" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>DTIM Period (2.4 GHz)</Label>
                        <Input type="number" value={wifi.dtimNg} onChange={(e) => wf("dtimNg", parseInt(e.target.value) || 1)} min={1} max={255} data-testid="input-wifi-dtim-ng" />
                      </div>
                      <div className="space-y-2">
                        <Label>DTIM Period (5 GHz)</Label>
                        <Input type="number" value={wifi.dtimNa} onChange={(e) => wf("dtimNa", parseInt(e.target.value) || 1)} min={1} max={255} data-testid="input-wifi-dtim-na" />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.minrateNgEnabled} onChange={(e) => wf("minrateNgEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-minrate-ng" />
                    Minimum Data Rate (2.4 GHz)
                  </label>
                  {wifi.minrateNgEnabled && (
                    <div className="space-y-2">
                      <Label>Min Rate 2.4 GHz (Kbps)</Label>
                      <Select value={String(wifi.minrateNgDataRateKbps)} onValueChange={(v) => wf("minrateNgDataRateKbps", parseInt(v))}>
                        <SelectTrigger data-testid="select-wifi-minrate-ng"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1000">1 Mbps</SelectItem>
                          <SelectItem value="2000">2 Mbps</SelectItem>
                          <SelectItem value="5500">5.5 Mbps</SelectItem>
                          <SelectItem value="6000">6 Mbps</SelectItem>
                          <SelectItem value="9000">9 Mbps</SelectItem>
                          <SelectItem value="11000">11 Mbps</SelectItem>
                          <SelectItem value="12000">12 Mbps</SelectItem>
                          <SelectItem value="18000">18 Mbps</SelectItem>
                          <SelectItem value="24000">24 Mbps</SelectItem>
                          <SelectItem value="36000">36 Mbps</SelectItem>
                          <SelectItem value="48000">48 Mbps</SelectItem>
                          <SelectItem value="54000">54 Mbps</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.minrateNaEnabled} onChange={(e) => wf("minrateNaEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-minrate-na" />
                    Minimum Data Rate (5 GHz)
                  </label>
                  {wifi.minrateNaEnabled && (
                    <div className="space-y-2">
                      <Label>Min Rate 5 GHz (Kbps)</Label>
                      <Select value={String(wifi.minrateNaDataRateKbps)} onValueChange={(v) => wf("minrateNaDataRateKbps", parseInt(v))}>
                        <SelectTrigger data-testid="select-wifi-minrate-na"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6000">6 Mbps</SelectItem>
                          <SelectItem value="9000">9 Mbps</SelectItem>
                          <SelectItem value="12000">12 Mbps</SelectItem>
                          <SelectItem value="18000">18 Mbps</SelectItem>
                          <SelectItem value="24000">24 Mbps</SelectItem>
                          <SelectItem value="36000">36 Mbps</SelectItem>
                          <SelectItem value="48000">48 Mbps</SelectItem>
                          <SelectItem value="54000">54 Mbps</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Globe className="h-4 w-4" /> Client Isolation</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.l2Isolation} onChange={(e) => wf("l2Isolation", e.target.checked)} className="rounded" data-testid="checkbox-wifi-l2-isolation" />
                    Layer 2 Isolation (prevent client-to-client traffic)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.proxyArp} onChange={(e) => wf("proxyArp", e.target.checked)} className="rounded" data-testid="checkbox-wifi-proxy-arp" />
                    Proxy ARP
                  </label>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule</h4>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={wifi.scheduleEnabled} onChange={(e) => wf("scheduleEnabled", e.target.checked)} className="rounded" data-testid="checkbox-wifi-schedule" />
                    Enable WiFi Schedule
                  </label>
                  {wifi.scheduleEnabled && (
                    <p className="text-xs text-muted-foreground">Schedule configuration is available on the UniFi controller after creation.</p>
                  )}
                </div>
              </div>
            )}

            {addWifiMutation.isError && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3" data-testid="text-wifi-error">
                {(addWifiMutation.error as any)?.message || "Failed to create WiFi network"}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={addWifiMutation.isPending} data-testid="button-submit-wifi">
              {addWifiMutation.isPending ? "Creating..." : "Create WiFi Network"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkOpen} onOpenChange={(open) => { if (!open) { setBulkOpen(null); resetBulkForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Create Networks</DialogTitle>
            <DialogDescription>Create multiple VLAN networks at once. Configure the range and review the preview before creating.</DialogDescription>
          </DialogHeader>
          {!bulkResult ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Number of Networks</Label>
                  <Input
                    type="number"
                    value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                    min={1}
                    max={200}
                    data-testid="input-bulk-count"
                  />
                </div>
                <div className="space-y-2">
                  <Label>VLAN Range Start</Label>
                  <Input
                    type="number"
                    value={bulkVlanStart}
                    onChange={(e) => setBulkVlanStart(e.target.value)}
                    min={1}
                    max={4094}
                    data-testid="input-bulk-vlan-start"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name Prefix</Label>
                  <Input
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value)}
                    placeholder="e.g., VLAN-"
                    data-testid="input-bulk-prefix"
                  />
                  <p className="text-xs text-muted-foreground">Names will be "{bulkPrefix}{bulkVlanStart}", "{bulkPrefix}{parseInt(bulkVlanStart) + 1}", etc.</p>
                </div>
                <div className="space-y-2">
                  <Label>Subnet Size</Label>
                  <Select value={bulkSubnetSize} onValueChange={setBulkSubnetSize}>
                    <SelectTrigger data-testid="select-bulk-subnet-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">/25 — 126 hosts</SelectItem>
                      <SelectItem value="26">/26 — 62 hosts</SelectItem>
                      <SelectItem value="27">/27 — 30 hosts</SelectItem>
                      <SelectItem value="28">/28 — 14 hosts</SelectItem>
                      <SelectItem value="29">/29 — 6 hosts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bulk-dhcp"
                  checked={bulkDhcp}
                  onChange={(e) => setBulkDhcp(e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-bulk-dhcp"
                />
                <Label htmlFor="bulk-dhcp" className="cursor-pointer">Enable DHCP on all networks</Label>
              </div>

              {bulkPreview.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preview ({bulkPreview.length} networks)</Label>
                  <ScrollArea className="h-[200px] border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Name</TableHead>
                          <TableHead className="text-xs">VLAN</TableHead>
                          <TableHead className="text-xs">Subnet</TableHead>
                          <TableHead className="text-xs">DHCP Range</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkPreview.map((item) => (
                          <TableRow key={item.vlanId}>
                            <TableCell className="text-xs py-1.5">{item.name}</TableCell>
                            <TableCell className="text-xs py-1.5">{item.vlanId}</TableCell>
                            <TableCell className="text-xs py-1.5 font-mono">{item.subnet}</TableCell>
                            <TableCell className="text-xs py-1.5 font-mono">{item.dhcpRange}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleBulkCreate}
                disabled={bulkCreating || bulkPreview.length === 0}
                data-testid="button-bulk-create"
              >
                {bulkCreating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating {bulkPreview.length} networks...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Create {bulkPreview.length} Networks
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-green-600">{bulkResult.succeeded}</div>
                  <div className="text-xs text-muted-foreground">Created</div>
                </div>
                {bulkResult.failed > 0 && (
                  <div className="text-center flex-1">
                    <div className="text-2xl font-bold text-destructive">{bulkResult.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                )}
                {bulkResult.skipped > 0 && (
                  <div className="text-center flex-1">
                    <div className="text-2xl font-bold text-yellow-600">{bulkResult.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                )}
              </div>
              <Progress value={(bulkResult.succeeded / bulkResult.requested) * 100} className="h-2" />
              {bulkResult.errors.length > 0 && (
                <ScrollArea className="h-[120px] border rounded-md p-3">
                  {bulkResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive mb-1">{err}</p>
                  ))}
                </ScrollArea>
              )}
              <Button className="w-full" onClick={() => { setBulkOpen(null); resetBulkForm(); }} data-testid="button-bulk-done">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importDevicesOpen} onOpenChange={(open) => { if (!open) setImportDevicesOpen(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Devices from Controller</DialogTitle>
            <DialogDescription>Discover devices on this site and import them into the system for unit assignments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => refetchLiveDevices()}
                disabled={fetchingLiveDevices}
                data-testid="button-discover-devices"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchingLiveDevices ? "animate-spin" : ""}`} />
                {fetchingLiveDevices ? "Discovering..." : "Discover Devices"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {liveDevices ? `${liveDevices.length} device${liveDevices.length !== 1 ? "s" : ""} found` : "Click to scan for devices"}
              </span>
            </div>
            {liveDevices && liveDevices.length > 0 && (
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="space-y-1 p-2">
                  {liveDevices.map((dev: any) => {
                    const alreadyImported = importedDevices?.some(d => d.unifiDeviceId === dev._id || d.macAddress === dev.mac);
                    const devType = detectDeviceType(dev);
                    const ports = detectPortCount(dev);
                    return (
                      <div key={dev._id || dev.mac} className="flex items-center justify-between gap-3 p-2.5 rounded-md hover:bg-muted/50" data-testid={`row-live-device-${dev._id || dev.mac}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted/50">
                            <DeviceImage iconId={dev.icon} deviceType={devType} size={36} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{dev.name || dev.hostname || dev.model || "Unknown"}</p>
                              <DeviceTypeBadge type={devType} />
                              {ports && (devType === "switch" || devType === "hybrid") && (
                                <Badge variant="outline" className="text-xs">{ports} ports</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {dev.mac ? (dev.mac.includes(":") ? dev.mac : dev.mac.replace(/(.{2})(?=.)/g, "$1:")) : ""} — {dev.model || "Unknown model"}
                              {dev.state === 1 && <span className="ml-2 text-green-600">Online</span>}
                            </p>
                          </div>
                        </div>
                        {alreadyImported ? (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Imported
                          </Badge>
                        ) : devType === "gateway" || devType === "other" ? (
                          <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                            Not assignable
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              importDeviceMutation.mutate({
                                name: dev.name || dev.hostname || dev.model || "Device",
                                macAddress: dev.mac,
                                model: dev.model || null,
                                deviceType: devType,
                                portCount: ports,
                                iconId: dev.icon ? String(dev.icon) : null,
                                unifiDeviceId: dev._id || null,
                              });
                            }}
                            disabled={importDeviceMutation.isPending}
                            data-testid={`button-import-device-${dev._id || dev.mac}`}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Import
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            {liveDevices && liveDevices.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No devices found on this site.</p>
            )}
          </div>
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
                      variant={expandedCtrlId === ctrl.id ? "default" : "outline"}
                      onClick={() => toggleController(ctrl.id)}
                      data-testid={`button-expand-controller-${ctrl.id}`}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      Sites
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBackupDialogCtrl(ctrl)}
                      data-testid={`button-backups-controller-${ctrl.id}`}
                    >
                      <HardDrive className="h-4 w-4 mr-1" />
                      Backups
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

                {expandedCtrlId === ctrl.id && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Sites
                    </h4>
                    {sites && sites.length > 0 ? (
                      <div className="space-y-2">
                        {sites.map((site: any) => {
                          const siteKey = site.name || site._id;
                          const siteName = site.desc || site.description || site.name;
                          const isSiteExpanded = expandedSiteId === siteKey;
                          return (
                            <div key={siteKey} className="border rounded-lg" data-testid={`card-site-${siteKey}`}>
                              <div
                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => toggleSite(siteKey)}
                                data-testid={`button-toggle-site-${siteKey}`}
                              >
                                <div className="flex items-center gap-2">
                                  {isSiteExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                  <Globe className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">{siteName}</span>
                                  <Badge variant="outline" className="text-xs">{siteKey}</Badge>
                                </div>
                              </div>
                              {isSiteExpanded && (
                                <div className="border-t">
                                  <div className="flex border-b">
                                    <button
                                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${siteTab === "networks" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                      onClick={() => { setSiteTab("networks"); setSelectedNetworkIds([]); setSelectedWifiIds([]); setSelectedDeviceIds([]); }}
                                      data-testid={`button-tab-networks-${siteKey}`}
                                    >
                                      <Layers className="h-3.5 w-3.5" />
                                      Networks
                                      {siteNetworks && <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{siteNetworks.length}</Badge>}
                                    </button>
                                    <button
                                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${siteTab === "wifi" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                      onClick={() => { setSiteTab("wifi"); setSelectedNetworkIds([]); setSelectedWifiIds([]); setSelectedDeviceIds([]); }}
                                      data-testid={`button-tab-wifi-${siteKey}`}
                                    >
                                      <Wifi className="h-3.5 w-3.5" />
                                      WiFi
                                      {wifiNetworks && <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{wifiNetworks.length}</Badge>}
                                    </button>
                                    <button
                                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${siteTab === "devices" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                      onClick={() => { setSiteTab("devices"); setSelectedNetworkIds([]); setSelectedWifiIds([]); setSelectedDeviceIds([]); }}
                                      data-testid={`button-tab-devices-${siteKey}`}
                                    >
                                      <Monitor className="h-3.5 w-3.5" />
                                      Devices
                                      {importedDevices && <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{importedDevices.length}</Badge>}
                                    </button>
                                  </div>

                                  {siteTab === "networks" && (
                                    <div className="p-3">
                                      <div className="flex items-center justify-between mb-3">
                                        <div>
                                          {selectedNetworkIds.length > 0 && (
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              onClick={() => setBulkDeleteConfirm({ type: "networks", ids: selectedNetworkIds })}
                                              data-testid="button-bulk-delete-networks"
                                            >
                                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                                              Delete {selectedNetworkIds.length} Selected
                                            </Button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setBulkOpen({ controllerId: ctrl.id, siteId: siteKey })}
                                            data-testid={`button-bulk-add-network-${siteKey}`}
                                          >
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                            Bulk Add
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => setAddNetworkOpen({ controllerId: ctrl.id, siteId: siteKey })}
                                            data-testid={`button-add-network-${siteKey}`}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Add Network
                                          </Button>
                                        </div>
                                      </div>
                                      {siteNetworks && siteNetworks.length > 0 ? (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[40px]">
                                                <Checkbox
                                                  checked={siteNetworks.filter(n => n.isManaged).length > 0 && siteNetworks.filter(n => n.isManaged).every(n => selectedNetworkIds.includes(n.id))}
                                                  onCheckedChange={(checked) => {
                                                    if (checked) {
                                                      setSelectedNetworkIds(siteNetworks.filter(n => n.isManaged).map(n => n.id));
                                                    } else {
                                                      setSelectedNetworkIds([]);
                                                    }
                                                  }}
                                                  data-testid="checkbox-select-all-networks"
                                                />
                                              </TableHead>
                                              <TableHead>Name</TableHead>
                                              <TableHead>VLAN</TableHead>
                                              <TableHead>Subnet</TableHead>
                                              <TableHead>DHCP</TableHead>
                                              <TableHead>Source</TableHead>
                                              <TableHead className="w-[60px]">Actions</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {siteNetworks.map((net) => (
                                              <TableRow key={net.id} className={!net.isManaged ? "opacity-75" : ""} data-testid={`row-network-${net.id}`}>
                                                <TableCell>
                                                  {net.isManaged ? (
                                                    <Checkbox
                                                      checked={selectedNetworkIds.includes(net.id)}
                                                      onCheckedChange={(checked) => {
                                                        if (checked) {
                                                          setSelectedNetworkIds(prev => prev.includes(net.id) ? prev : [...prev, net.id]);
                                                        } else {
                                                          setSelectedNetworkIds(prev => prev.filter(id => id !== net.id));
                                                        }
                                                      }}
                                                      data-testid={`checkbox-network-${net.id}`}
                                                    />
                                                  ) : null}
                                                </TableCell>
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

                                  {siteTab === "wifi" && (
                                    <div className="p-3">
                                      <div className="flex items-center justify-between gap-2 mb-3">
                                        <div>
                                          {selectedWifiIds.length > 0 && (
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              onClick={() => setBulkDeleteConfirm({ type: "wifi", ids: selectedWifiIds })}
                                              data-testid="button-bulk-delete-wifi"
                                            >
                                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                                              Delete {selectedWifiIds.length} Selected
                                            </Button>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => { resetBulkWifi(); setBulkWifiOpen({ controllerId: ctrl.id, siteId: siteKey }); }}
                                            data-testid={`button-bulk-wifi-${siteKey}`}
                                          >
                                            <Layers className="h-3.5 w-3.5 mr-1" />
                                            Bulk WiFi
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => setAddWifiOpen({ controllerId: ctrl.id, siteId: siteKey })}
                                            data-testid={`button-add-wifi-${siteKey}`}
                                          >
                                            <Plus className="h-3.5 w-3.5 mr-1" />
                                            Add WiFi Network
                                          </Button>
                                        </div>
                                      </div>
                                      {wifiLoading ? (
                                        <div className="space-y-2">
                                          <Skeleton className="h-8 w-full" />
                                          <Skeleton className="h-8 w-full" />
                                          <Skeleton className="h-8 w-full" />
                                        </div>
                                      ) : wifiNetworks && wifiNetworks.length > 0 ? (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[40px]">
                                                <Checkbox
                                                  checked={wifiNetworks.filter((wn: any) => wn.isManaged).length > 0 && wifiNetworks.filter((wn: any) => wn.isManaged).every((wn: any) => selectedWifiIds.includes(wn.id))}
                                                  onCheckedChange={(checked) => {
                                                    if (checked) {
                                                      setSelectedWifiIds(wifiNetworks.filter((wn: any) => wn.isManaged).map((wn: any) => wn.id));
                                                    } else {
                                                      setSelectedWifiIds([]);
                                                    }
                                                  }}
                                                  data-testid="checkbox-select-all-wifi"
                                                />
                                              </TableHead>
                                              <TableHead>SSID</TableHead>
                                              <TableHead>Security</TableHead>
                                              <TableHead>Password</TableHead>
                                              <TableHead>Status</TableHead>
                                              <TableHead>Source</TableHead>
                                              <TableHead className="w-[60px]">Actions</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {wifiNetworks.map((wn: any) => (
                                              <TableRow key={wn.id} data-testid={`row-wifi-${wn.id}`}>
                                                <TableCell>
                                                  {wn.isManaged ? (
                                                    <Checkbox
                                                      checked={selectedWifiIds.includes(wn.id)}
                                                      onCheckedChange={(checked) => {
                                                        if (checked) {
                                                          setSelectedWifiIds(prev => prev.includes(wn.id) ? prev : [...prev, wn.id]);
                                                        } else {
                                                          setSelectedWifiIds(prev => prev.filter((id: string) => id !== wn.id));
                                                        }
                                                      }}
                                                      data-testid={`checkbox-wifi-${wn.id}`}
                                                    />
                                                  ) : null}
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                  <div className="flex items-center gap-2">
                                                    <Wifi className="h-4 w-4 text-muted-foreground" />
                                                    {wn.name}
                                                    {wn.isGuest && <Badge variant="outline" className="text-xs">Guest</Badge>}
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  <Badge variant="outline" className="text-xs">
                                                    {wn.securityMode === "wpapsk" ? (wn.wpaMode === "wpa3" ? "WPA3" : wn.wpaMode === "wpa2" ? "WPA2" : wn.wpaMode || "WPA") : wn.securityMode === "open" ? "Open" : wn.securityMode || "—"}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell>
                                                  {wn.password ? (
                                                    <span className="text-sm font-mono text-muted-foreground">••••••••</span>
                                                  ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                  )}
                                                </TableCell>
                                                <TableCell>
                                                  <Badge variant={wn.enabled ? "default" : "secondary"} className="text-xs">
                                                    {wn.enabled ? "Enabled" : "Disabled"}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell>
                                                  <Badge variant={wn.isManaged ? "default" : "outline"} className="text-xs">
                                                    {wn.isManaged ? "Web UI" : "Controller"}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell>
                                                  {wn.isManaged ? (
                                                    <Button
                                                      size="icon"
                                                      variant="ghost"
                                                      onClick={() => {
                                                        if (confirm(`Delete WiFi network "${wn.name}"? This will also remove it from the UniFi controller.`)) {
                                                          deleteWifiMutation.mutate(wn.id);
                                                        }
                                                      }}
                                                      data-testid={`button-delete-wifi-${wn.id}`}
                                                    >
                                                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                  ) : (
                                                    <Lock className="h-4 w-4 text-muted-foreground ml-2" />
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      ) : (
                                        <p className="text-center text-sm text-muted-foreground py-8">
                                          No WiFi networks found on this site. Add one to create a wireless SSID.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {siteTab === "devices" && (
                                    <div className="p-3">
                                      <div className="flex items-center justify-between mb-3">
                                        <div>
                                          {selectedDeviceIds.length > 0 && (
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              onClick={() => setBulkDeleteConfirm({ type: "devices", ids: selectedDeviceIds })}
                                              data-testid="button-bulk-delete-devices"
                                            >
                                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                                              Delete {selectedDeviceIds.length} Selected
                                            </Button>
                                          )}
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => setImportDevicesOpen(true)}
                                          data-testid={`button-import-devices-${siteKey}`}
                                        >
                                          <Plus className="h-3.5 w-3.5 mr-1" />
                                          Import from Controller
                                        </Button>
                                      </div>
                                      {devicesLoading ? (
                                        <div className="space-y-2">
                                          <Skeleton className="h-8 w-full" />
                                          <Skeleton className="h-8 w-full" />
                                          <Skeleton className="h-8 w-full" />
                                        </div>
                                      ) : importedDevices && importedDevices.length > 0 ? (
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="w-[40px]">
                                                <Checkbox
                                                  checked={importedDevices.length > 0 && importedDevices.every(d => selectedDeviceIds.includes(d.id))}
                                                  onCheckedChange={(checked) => {
                                                    if (checked) {
                                                      setSelectedDeviceIds(importedDevices.map(d => d.id));
                                                    } else {
                                                      setSelectedDeviceIds([]);
                                                    }
                                                  }}
                                                  data-testid="checkbox-select-all-devices"
                                                />
                                              </TableHead>
                                              <TableHead>Name</TableHead>
                                              <TableHead>Type</TableHead>
                                              <TableHead>Model</TableHead>
                                              <TableHead>MAC Address</TableHead>
                                              <TableHead className="w-[60px]">Actions</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {importedDevices.map((dev) => (
                                              <TableRow key={dev.id} data-testid={`row-device-${dev.id}`}>
                                                <TableCell>
                                                  <Checkbox
                                                    checked={selectedDeviceIds.includes(dev.id)}
                                                    onCheckedChange={(checked) => {
                                                      if (checked) {
                                                        setSelectedDeviceIds(prev => prev.includes(dev.id) ? prev : [...prev, dev.id]);
                                                      } else {
                                                        setSelectedDeviceIds(prev => prev.filter(id => id !== dev.id));
                                                      }
                                                    }}
                                                    data-testid={`checkbox-device-${dev.id}`}
                                                  />
                                                </TableCell>
                                                <TableCell className="font-medium" data-testid={`text-device-name-${dev.id}`}>
                                                  <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                                                      <DeviceImage iconId={dev.iconId} deviceType={(dev.deviceType as DeviceType) || "other"} size={32} />
                                                    </div>
                                                    {dev.name}
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  <div className="flex items-center gap-1.5">
                                                    <DeviceTypeBadge type={(dev.deviceType as DeviceType) || "other"} />
                                                    {dev.portCount && ((dev.deviceType === "switch" || dev.deviceType === "hybrid") ? (
                                                      <Badge variant="outline" className="text-xs">{dev.portCount}p</Badge>
                                                    ) : null)}
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  <Badge variant="outline" className="text-xs">{dev.model || "—"}</Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground font-mono">{dev.macAddress}</TableCell>
                                                <TableCell>
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => {
                                                      if (confirm("Remove this device? It will no longer be available for unit assignments.")) {
                                                        deleteDeviceMutation.mutate(dev.id);
                                                      }
                                                    }}
                                                    data-testid={`button-delete-device-${dev.id}`}
                                                  >
                                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      ) : (
                                        <div className="text-center py-6">
                                          <Monitor className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                                          <p className="text-sm text-muted-foreground mb-2">No devices imported yet</p>
                                          <p className="text-xs text-muted-foreground">Import devices from the controller to use them in unit assignments.</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {ctrl.isVerified ? "No sites found" : "Test connection first to discover sites"}
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

      {backupDialogCtrl && (
        <BackupDialog
          controller={backupDialogCtrl}
          open={!!backupDialogCtrl}
          onOpenChange={(v) => { if (!v) setBackupDialogCtrl(null); }}
        />
      )}

      <Dialog open={!!bulkWifiOpen} onOpenChange={(open) => { if (!open) { setBulkWifiOpen(null); resetBulkWifi(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-bulk-wifi-title">Bulk WiFi Assignment</DialogTitle>
            <DialogDescription>Create or assign WiFi networks across multiple VLANs at once.</DialogDescription>
          </DialogHeader>

          {bulkWifiResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <div className="text-center flex-1">
                  <div className="text-2xl font-bold text-green-600" data-testid="text-bulk-wifi-succeeded">{bulkWifiResult.succeeded}</div>
                  <div className="text-xs text-muted-foreground">Succeeded</div>
                </div>
                {bulkWifiResult.skipped > 0 && (
                  <div className="text-center flex-1">
                    <div className="text-2xl font-bold text-yellow-600" data-testid="text-bulk-wifi-skipped">{bulkWifiResult.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                )}
                {bulkWifiResult.failed > 0 && (
                  <div className="text-center flex-1">
                    <div className="text-2xl font-bold text-destructive">{bulkWifiResult.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                )}
              </div>
              {bulkWifiResult.results.filter((r: any) => !r.success).length > 0 && (
                <ScrollArea className="h-[120px] border rounded-md p-3">
                  {bulkWifiResult.results.filter((r: any) => r.skipped).map((r: any, i: number) => (
                    <p key={i} className="text-xs text-yellow-600 mb-1">{r.networkName}: {r.error}</p>
                  ))}
                  {bulkWifiResult.results.filter((r: any) => !r.success && !r.skipped).map((r: any, i: number) => (
                    <p key={`f${i}`} className="text-xs text-destructive mb-1">{r.networkName}: {r.error}</p>
                  ))}
                </ScrollArea>
              )}
              {bulkWifiResult.results.filter((r: any) => r.success && r.generatedPassword).length > 0 && (
                <div>
                  <Label className="text-sm mb-2 block">Generated Credentials</Label>
                  <ScrollArea className="h-[180px] border rounded-md">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium">Network</th>
                          <th className="text-left p-2 font-medium">SSID</th>
                          <th className="text-left p-2 font-medium">Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkWifiResult.results.filter((r: any) => r.success && r.generatedPassword).map((r: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2">{r.networkName}</td>
                            <td className="p-2 font-mono">{r.ssidName || "—"}</td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{r.generatedPassword}</code>
                                <button
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => { navigator.clipboard.writeText(r.generatedPassword); toast({ title: "Copied!" }); }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => { setBulkWifiOpen(null); resetBulkWifi(); queryClient.invalidateQueries({ queryKey: ["/api/wifi-networks/controller"] }); }} data-testid="button-bulk-wifi-done">
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex border-b">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bulkWifiTab === "ppsk" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setBulkWifiTab("ppsk"); setBulkWifiSelectedNetworks([]); }}
                  data-testid="button-bulk-wifi-tab-ppsk"
                >
                  <Lock className="h-3.5 w-3.5 inline mr-1.5" />
                  PPSK
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bulkWifiTab === "ssid" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setBulkWifiTab("ssid"); setBulkWifiSelectedNetworks([]); }}
                  data-testid="button-bulk-wifi-tab-ssid"
                >
                  <Wifi className="h-3.5 w-3.5 inline mr-1.5" />
                  Create SSIDs
                </button>
              </div>

              {bulkWifiTab === "ppsk" && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300">
                    <p>One SSID with unique pre-shared keys per network. Each key auto-maps to its network's VLAN. Passwords are generated automatically.</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={bulkWifiPpskMode === "new" ? "default" : "outline"}
                      onClick={() => { setBulkWifiPpskMode("new"); setBulkWifiExistingId(""); }}
                      data-testid="button-bulk-ppsk-new"
                    >
                      Create New PPSK
                    </Button>
                    <Button
                      size="sm"
                      variant={bulkWifiPpskMode === "existing" ? "default" : "outline"}
                      onClick={() => { setBulkWifiPpskMode("existing"); setBulkWifiName(""); }}
                      data-testid="button-bulk-ppsk-existing"
                    >
                      Add to Existing
                    </Button>
                  </div>

                  {bulkWifiPpskMode === "new" && (
                    <div>
                      <Label className="text-sm">SSID Name</Label>
                      <Input
                        value={bulkWifiName}
                        onChange={(e) => setBulkWifiName(e.target.value)}
                        placeholder="e.g. Building-WiFi"
                        data-testid="input-bulk-ppsk-name"
                      />
                    </div>
                  )}

                  {bulkWifiPpskMode === "existing" && (
                    <div>
                      <Label className="text-sm">Select Existing PPSK Network</Label>
                      <Select value={bulkWifiExistingId} onValueChange={setBulkWifiExistingId}>
                        <SelectTrigger data-testid="select-bulk-ppsk-existing">
                          <SelectValue placeholder="Choose a PPSK network..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(wifiNetworks || []).filter((wn: any) => wn.isManaged && wn.unifiWlanId && wn.securityMode === "wpapsk" && !wn.password).map((wn: any) => (
                            <SelectItem key={wn.id} value={wn.id}>
                              {wn.name}
                            </SelectItem>
                          ))}
                          {(wifiNetworks || []).filter((wn: any) => wn.isManaged && wn.unifiWlanId && wn.securityMode === "wpapsk" && !wn.password).length === 0 && (
                            <SelectItem value="_none" disabled>No PPSK networks found</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {bulkWifiTab === "ssid" && (
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 border rounded-lg text-xs text-muted-foreground">
                    <p>Creates a separate WiFi network (SSID) for each selected network. Each gets its own unique name and auto-generated password.</p>
                  </div>

                  <div>
                    <Label className="text-sm">Naming Convention</Label>
                    <Select value={bulkWifiNaming} onValueChange={(v: any) => setBulkWifiNaming(v)}>
                      <SelectTrigger data-testid="select-bulk-ssid-naming">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="network">Use Network Name</SelectItem>
                        <SelectItem value="prefix">Prefix + VLAN ID</SelectItem>
                        <SelectItem value="custom">Custom Prefix + Network Name</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(bulkWifiNaming === "prefix" || bulkWifiNaming === "custom") && (
                    <div>
                      <Label className="text-sm">Prefix</Label>
                      <Input
                        value={bulkWifiPrefix}
                        onChange={(e) => setBulkWifiPrefix(e.target.value)}
                        placeholder={bulkWifiNaming === "prefix" ? "e.g. WiFi" : "e.g. Apt"}
                        data-testid="input-bulk-ssid-prefix"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {bulkWifiNaming === "prefix" ? `Example: "${bulkWifiPrefix || "WiFi"}-100" (prefix + VLAN ID)` : `Example: "${bulkWifiPrefix || "WiFi"}-${(siteNetworks || [])[0]?.name || "Unit101"}" (prefix + network name)`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label className="text-sm mb-2 block">Select Networks ({bulkWifiSelectedNetworks.length} selected)</Label>
                <ScrollArea className="h-[200px] border rounded-lg p-2">
                  {(() => {
                    const nets = (siteNetworks || []).filter((n: any) => {
                      const name = (n.name || "").trim().toLowerCase();
                      const purpose = (n.purpose || "").toLowerCase();
                      if (purpose === "wan" || purpose === "internet" || purpose === "remote-user-vpn") return false;
                      if (/^internet$/i.test(name)) return false;
                      if (bulkWifiTab === "ppsk" && (!n.vlanId || n.vlanId === 0)) return false;
                      return true;
                    });
                    if (nets.length === 0) {
                      return <p className="text-xs text-muted-foreground p-2 text-center">No networks available. Create networks first.</p>;
                    }
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded">
                          <Checkbox
                            checked={bulkWifiSelectedNetworks.length === nets.length && nets.length > 0}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setBulkWifiSelectedNetworks(nets.map((n: any) => n.id));
                              } else {
                                setBulkWifiSelectedNetworks([]);
                              }
                            }}
                            data-testid="checkbox-bulk-wifi-select-all"
                          />
                          <span className="text-sm font-medium">Select All</span>
                        </div>
                        {nets.map((net: any) => (
                          <div key={net.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded" data-testid={`checkbox-row-network-${net.id}`}>
                            <Checkbox
                              checked={bulkWifiSelectedNetworks.includes(net.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setBulkWifiSelectedNetworks(prev => [...prev, net.id]);
                                } else {
                                  setBulkWifiSelectedNetworks(prev => prev.filter(id => id !== net.id));
                                }
                              }}
                              data-testid={`checkbox-bulk-wifi-network-${net.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm">{net.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">VLAN {net.vlanId}</span>
                            </div>
                            {bulkWifiTab === "ssid" && bulkWifiSelectedNetworks.includes(net.id) && (
                              <span className="text-xs text-muted-foreground font-mono">
                                {bulkWifiNaming === "network" ? net.name : bulkWifiNaming === "prefix" ? `${bulkWifiPrefix || "WiFi"}-${net.vlanId}` : `${bulkWifiPrefix || "WiFi"}-${net.name}`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </ScrollArea>
              </div>

              {bulkWifiSelectedNetworks.length > 0 && (
                <div className="p-3 bg-muted/50 border rounded-lg text-xs">
                  <span className="font-medium">Preview: </span>
                  {bulkWifiTab === "ppsk" && bulkWifiPpskMode === "new" && (
                    <span>1 new PPSK SSID "{bulkWifiName}" with {bulkWifiSelectedNetworks.length} auto-generated key{bulkWifiSelectedNetworks.length > 1 ? "s" : ""}</span>
                  )}
                  {bulkWifiTab === "ppsk" && bulkWifiPpskMode === "existing" && (() => {
                    const sel = (wifiNetworks || []).find((wn: any) => wn.id === bulkWifiExistingId);
                    return <span>{bulkWifiSelectedNetworks.length} new key{bulkWifiSelectedNetworks.length > 1 ? "s" : ""} will be added to "{sel?.name || "..."}"</span>;
                  })()}
                  {bulkWifiTab === "ssid" && (
                    <span>{bulkWifiSelectedNetworks.length} individual SSID{bulkWifiSelectedNetworks.length > 1 ? "s" : ""} with auto-generated passwords</span>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setBulkWifiOpen(null); resetBulkWifi(); }} data-testid="button-bulk-wifi-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!bulkWifiOpen) return;
                    if (bulkWifiTab === "ppsk" && bulkWifiPpskMode === "new" && !bulkWifiName.trim()) {
                      toast({ title: "SSID name is required", variant: "destructive" });
                      return;
                    }
                    if (bulkWifiTab === "ppsk" && bulkWifiPpskMode === "existing" && !bulkWifiExistingId) {
                      toast({ title: "Select an existing PPSK network", variant: "destructive" });
                      return;
                    }
                    if (bulkWifiSelectedNetworks.length === 0) {
                      toast({ title: "Select at least one network", variant: "destructive" });
                      return;
                    }
                    setBulkWifiSubmitting(true);
                    try {
                      const body: any = {
                        controllerId: bulkWifiOpen.controllerId,
                        siteId: bulkWifiOpen.siteId,
                        networkIds: bulkWifiSelectedNetworks,
                      };
                      if (bulkWifiTab === "ppsk") {
                        body.mode = bulkWifiPpskMode === "new" ? "new" : "existing";
                        if (bulkWifiPpskMode === "new") {
                          body.ssidConfig = {
                            name: bulkWifiName,
                            securityMode: "wpapsk",
                            isPpsk: true,
                            wpaMode: "wpa2",
                          };
                        } else {
                          body.existingWifiId = bulkWifiExistingId;
                        }
                      } else {
                        body.mode = "new";
                        body.ssidConfig = {
                          securityMode: "wpapsk",
                          wpaMode: "wpa2",
                          namingConvention: bulkWifiNaming,
                          prefix: bulkWifiPrefix,
                          autoPassword: true,
                        };
                      }
                      const res = await apiRequest("POST", "/api/wifi-networks/bulk", body);
                      const result = await res.json();
                      setBulkWifiResult(result);
                      queryClient.invalidateQueries({ queryKey: ["/api/wifi-networks/controller"] });
                    } catch (err: any) {
                      toast({ title: "Bulk WiFi failed", description: err.message, variant: "destructive" });
                    } finally {
                      setBulkWifiSubmitting(false);
                    }
                  }}
                  disabled={bulkWifiSubmitting || bulkWifiSelectedNetworks.length === 0}
                  data-testid="button-bulk-wifi-submit"
                >
                  {bulkWifiSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    `Apply to ${bulkWifiSelectedNetworks.length} Network${bulkWifiSelectedNetworks.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulkDeleteConfirm} onOpenChange={(open) => { if (!open && !bulkDeleting) setBulkDeleteConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Delete</DialogTitle>
          </DialogHeader>
          {bulkDeleteConfirm && (
            <div className="space-y-4">
              <p className="text-sm">
                Are you sure you want to delete <span className="font-semibold">{bulkDeleteConfirm.ids.length}</span>{" "}
                {bulkDeleteConfirm.type === "networks" ? "network" : bulkDeleteConfirm.type === "wifi" ? "WiFi network" : "device"}
                {bulkDeleteConfirm.ids.length !== 1 ? "s" : ""}?
              </p>
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm space-y-1">
                <p className="font-medium text-destructive">Warning:</p>
                {bulkDeleteConfirm.type === "networks" && (
                  <p className="text-muted-foreground">Selected networks will be removed from both this platform and the UniFi controller. Any WiFi networks attached to these VLANs may also be affected.</p>
                )}
                {bulkDeleteConfirm.type === "wifi" && (
                  <p className="text-muted-foreground">Selected SSIDs will be removed from both this platform and the UniFi controller. Tenants using these WiFi networks will lose connectivity.</p>
                )}
                {bulkDeleteConfirm.type === "devices" && (
                  <p className="text-muted-foreground">Selected devices will be removed from this platform. Any existing unit port assignments using these devices will also be deleted.</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBulkDeleteConfirm(null)} disabled={bulkDeleting} data-testid="button-cancel-bulk-delete">
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={bulkDeleting}
                  data-testid="button-confirm-bulk-delete"
                  onClick={async () => {
                    setBulkDeleting(true);
                    const { type, ids } = bulkDeleteConfirm;
                    let successCount = 0;
                    let failCount = 0;
                    const failedIds: string[] = [];
                    for (const id of ids) {
                      try {
                        const endpoint = type === "networks" ? `/api/networks/${id}` : type === "wifi" ? `/api/wifi-networks/${id}` : `/api/devices/${id}`;
                        await apiRequest("DELETE", endpoint);
                        successCount++;
                      } catch {
                        failCount++;
                        failedIds.push(id);
                      }
                    }
                    if (type === "networks") {
                      queryClient.invalidateQueries({ queryKey: ["/api/networks/controller", expandedCtrlId, "site", expandedSiteId] });
                      setSelectedNetworkIds(failedIds);
                    } else if (type === "wifi") {
                      queryClient.invalidateQueries({ queryKey: ["/api/wifi-networks/controller"] });
                      setSelectedWifiIds(failedIds);
                    } else {
                      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
                      setSelectedDeviceIds(failedIds);
                    }
                    toast({
                      title: `Deleted ${successCount} ${type === "networks" ? "network" : type === "wifi" ? "WiFi network" : "device"}${successCount !== 1 ? "s" : ""}`,
                      description: failCount > 0 ? `${failCount} failed to delete.` : undefined,
                      variant: failCount > 0 ? "destructive" : undefined,
                    });
                    setBulkDeleting(false);
                    setBulkDeleteConfirm(null);
                  }}
                >
                  {bulkDeleting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    `Delete ${bulkDeleteConfirm.ids.length} Item${bulkDeleteConfirm.ids.length !== 1 ? "s" : ""}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
