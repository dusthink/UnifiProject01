import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wifi, LogOut, Monitor, Smartphone, Shield, Eye, EyeOff, ArrowDownUp, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/components/theme-provider";
import { Moon, Sun } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function TenantPortal() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: unitInfo, isLoading: unitLoading } = useQuery<{
    unitNumber: string;
    wifiSsid: string | null;
    wifiPassword: string | null;
    wifiMode: string | null;
    vlanId: number | null;
    isProvisioned: boolean | null;
  }>({
    queryKey: ["/api/tenant/unit"],
  });

  const { data: clients, isLoading: clientsLoading } = useQuery<any[]>({
    queryKey: ["/api/tenant/clients"],
    refetchInterval: 30000,
  });

  const passwordMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiRequest("PATCH", "/api/tenant/wifi-password", { newPassword: password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/unit"] });
      setNewPassword("");
      toast({ title: "Password updated", description: "Your WiFi password has been changed. Devices will need to reconnect." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const totalRx = clients?.reduce((sum, c) => sum + (c.rxBytes || 0), 0) || 0;
  const totalTx = clients?.reduce((sum, c) => sum + (c.txBytes || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Wifi className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold" data-testid="text-portal-title">My Network</h1>
              <p className="text-xs text-muted-foreground">Unit {unitInfo?.unitNumber || "..."}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block" data-testid="text-tenant-name">{user?.displayName}</span>
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={logout} data-testid="button-tenant-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {unitLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Download</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-download-total">{formatBytes(totalRx)}</p>
                </CardContent>
              </Card>
              <Card className="hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowDownUp className="h-4 w-4 text-muted-foreground rotate-180" />
                    <span className="text-sm text-muted-foreground">Upload</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-upload-total">{formatBytes(totalTx)}</p>
                </CardContent>
              </Card>
              <Card className="hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Connected Devices</span>
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-device-count">{clients?.length || 0}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Wifi className="h-4 w-4" />
                    WiFi Settings
                  </h3>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Network Name (SSID)</span>
                      <span className="text-sm font-medium" data-testid="text-wifi-ssid">{unitInfo?.wifiSsid || "Not configured"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Current Password</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-mono" data-testid="text-wifi-password">
                          {showPassword ? (unitInfo?.wifiPassword || "Not set") : "********"}
                        </span>
                        <Button size="icon" variant="ghost" onClick={() => setShowPassword(!showPassword)} data-testid="button-toggle-password">
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Mode</span>
                      <Badge variant="secondary" className="uppercase text-xs">{unitInfo?.wifiMode || "ppsk"}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      {unitInfo?.isProvisioned ? (
                        <Badge variant="default" className="bg-status-online/15 text-status-online border-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" /> Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Change WiFi Password
                  </h3>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      passwordMutation.mutate(newPassword);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="new-pw">New Password</Label>
                      <div className="relative">
                        <Input
                          id="new-pw"
                          type={showNewPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min 8 characters"
                          minLength={8}
                          required
                          data-testid="input-new-wifi-password"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="absolute right-0 top-0"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          data-testid="button-toggle-new-password"
                        >
                          {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={passwordMutation.isPending || newPassword.length < 8} data-testid="button-change-password">
                      {passwordMutation.isPending ? "Updating..." : "Change Password"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      After changing your password, all connected devices will need to reconnect with the new password.
                    </p>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Connected Devices
                  </h3>
                  <Badge variant="secondary">{clients?.length || 0} devices</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {clientsLoading ? (
                  <div className="p-6">
                    <Skeleton className="h-32" />
                  </div>
                ) : !clients?.length ? (
                  <div className="text-center py-12 px-4">
                    <Monitor className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No devices currently connected</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {unitInfo?.isProvisioned
                        ? "Connect to your WiFi network to see devices here"
                        : "Your network has not been provisioned yet"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Device</TableHead>
                          <TableHead>IP Address</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Download</TableHead>
                          <TableHead>Upload</TableHead>
                          <TableHead>Uptime</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clients.map((client: any, i: number) => (
                          <TableRow key={client.mac || i} data-testid={`row-client-${i}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {client.isWired ? (
                                  <Monitor className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-medium text-sm">{client.hostname}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-accent px-1.5 py-0.5 rounded">{client.ip || "-"}</code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {client.isWired ? "Wired" : "WiFi"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatBytes(client.rxBytes)}</TableCell>
                            <TableCell className="text-sm">{formatBytes(client.txBytes)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatUptime(client.uptime)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
