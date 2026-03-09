import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Network, CheckCircle2, XCircle, RefreshCw, Trash2, Globe, Router, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Controller {
  id: string;
  name: string;
  url: string;
  username: string;
  isVerified: boolean | null;
  lastConnectedAt: string | null;
}

export default function ControllersPage() {
  const { toast } = useToast();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: controllers, isLoading } = useQuery<Controller[]>({
    queryKey: ["/api/controllers"],
  });

  const { data: sites } = useQuery<any[]>({
    queryKey: ["/api/controllers", expandedId, "sites"],
    queryFn: async () => {
      if (!expandedId) return [];
      const res = await fetch(`/api/controllers/${expandedId}/sites`, { credentials: "include" });
      return res.json();
    },
    enabled: !!expandedId,
  });

  const addMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/controllers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
      setAddDialogOpen(false);
      setName("");
      setUrl("");
      setUsername("");
      setPassword("");
      toast({ title: "Controller added" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingId(id);
      const res = await apiRequest("POST", `/api/controllers/${id}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/controllers"] });
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
      setTestingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
      setTestingId(null);
    },
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
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addMutation.mutate({ name, url, username, password });
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
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
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
              <Button type="submit" className="w-full" disabled={addMutation.isPending} data-testid="button-submit-controller">
                {addMutation.isPending ? "Adding..." : "Add Controller"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                      <h3 className="font-semibold" data-testid={`text-controller-name-${ctrl.id}`}>{ctrl.name}</h3>
                      <p className="text-sm text-muted-foreground truncate" data-testid={`text-controller-url-${ctrl.id}`}>{ctrl.url}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <Badge variant={ctrl.isVerified ? "default" : "secondary"} data-testid={`badge-controller-status-${ctrl.id}`}>
                          {ctrl.isVerified ? (
                            <><CheckCircle2 className="h-3 w-3 mr-1" /> Verified</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Unverified</>
                          )}
                        </Badge>
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
                      onClick={() => setExpandedId(expandedId === ctrl.id ? null : ctrl.id)}
                      data-testid={`button-expand-controller-${ctrl.id}`}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      Sites
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => testMutation.mutate(ctrl.id)}
                      disabled={testingId === ctrl.id}
                      data-testid={`button-test-controller-${ctrl.id}`}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${testingId === ctrl.id ? "animate-spin" : ""}`} />
                      Test
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

                {expandedId === ctrl.id && (
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
