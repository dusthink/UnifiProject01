import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Copy, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Community, Building, Unit } from "@shared/schema";

export default function TenantsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedCommunity, setSelectedCommunity] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: communities } = useQuery<Community[]>({ queryKey: ["/api/communities"] });

  const { data: buildings } = useQuery<Building[]>({
    queryKey: ["/api/communities", selectedCommunity, "buildings"],
    queryFn: async () => {
      if (!selectedCommunity) return [];
      const res = await fetch(`/api/communities/${selectedCommunity}/buildings`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedCommunity,
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["/api/buildings", selectedBuilding, "units"],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const res = await fetch(`/api/buildings/${selectedBuilding}/units`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedBuilding,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/create-tenant", data);
      return res.json();
    },
    onSuccess: () => {
      setCreatedCreds({ username, password });
      toast({ title: "Tenant account created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generatePassword = () => {
    const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    setPassword(pw);
  };

  const handleCopy = () => {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Username: ${createdCreds.username}\nPassword: ${createdCreds.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Tenant Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage tenant portal access</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setCreatedCreds(null); setUsername(""); setPassword(""); setDisplayName(""); setSelectedCommunity(""); setSelectedBuilding(""); setSelectedUnit(""); }}}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-tenant">
              <Plus className="h-4 w-4 mr-2" />
              Create Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdCreds ? "Tenant Created" : "Create Tenant Account"}</DialogTitle>
            </DialogHeader>
            {createdCreds ? (
              <div className="space-y-4">
                <div className="p-4 rounded-md bg-accent/50 space-y-2">
                  <p className="text-sm"><span className="text-muted-foreground">Username:</span> <strong>{createdCreds.username}</strong></p>
                  <p className="text-sm"><span className="text-muted-foreground">Password:</span> <strong>{createdCreds.password}</strong></p>
                </div>
                <p className="text-xs text-muted-foreground">Share these credentials with the tenant. They can use them to log in to the tenant portal.</p>
                <div className="flex gap-2">
                  <Button onClick={handleCopy} className="flex-1" variant="secondary" data-testid="button-copy-creds">
                    {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                    {copied ? "Copied!" : "Copy Credentials"}
                  </Button>
                  <Button onClick={() => { setDialogOpen(false); setCreatedCreds(null); }} className="flex-1" data-testid="button-done">
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate({ username, password, unitId: selectedUnit, displayName: displayName || username });
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="tenant_101" required data-testid="input-tenant-username" />
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="John Doe" data-testid="input-tenant-display" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="flex gap-2">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required data-testid="input-tenant-password" />
                    <Button type="button" variant="secondary" onClick={generatePassword} data-testid="button-generate-pw">
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Community</Label>
                  <Select value={selectedCommunity} onValueChange={(v) => { setSelectedCommunity(v); setSelectedBuilding(""); setSelectedUnit(""); }}>
                    <SelectTrigger data-testid="select-tenant-community">
                      <SelectValue placeholder="Select community" />
                    </SelectTrigger>
                    <SelectContent>
                      {communities?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedCommunity && buildings && buildings.length > 0 && (
                  <div className="space-y-2">
                    <Label>Building</Label>
                    <Select value={selectedBuilding} onValueChange={(v) => { setSelectedBuilding(v); setSelectedUnit(""); }}>
                      <SelectTrigger data-testid="select-tenant-building">
                        <SelectValue placeholder="Select building" />
                      </SelectTrigger>
                      <SelectContent>
                        {buildings.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {selectedBuilding && units && units.length > 0 && (
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={selectedUnit} onValueChange={setSelectedUnit}>
                      <SelectTrigger data-testid="select-tenant-unit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((u) => (
                          <SelectItem key={u.id} value={u.id}>Unit {u.unitNumber}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createMutation.isPending || !selectedUnit} data-testid="button-submit-tenant">
                  {createMutation.isPending ? "Creating..." : "Create Tenant Account"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold mb-1">Tenant Management</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Create tenant accounts to give residents access to their WiFi settings and usage statistics through the tenant portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
