import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Copy, Check, Link, Mail, Clock, Eye, EyeOff, Send, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Community, Building, Unit } from "@shared/schema";

type UnitWithFloor = Unit & { floor?: number | null };

export default function TenantsPage() {
  const { toast } = useToast();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);

  const [selectedCommunity, setSelectedCommunity] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");

  const [inviteCommunity, setInviteCommunity] = useState("");
  const [inviteBuilding, setInviteBuilding] = useState("");
  const [inviteUnit, setInviteUnit] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [inviteSentInfo, setInviteSentInfo] = useState<{ name: string; email: string; inviteUrl: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const { data: units } = useQuery<UnitWithFloor[]>({
    queryKey: ["/api/buildings", selectedBuilding, "units"],
    queryFn: async () => {
      if (!selectedBuilding) return [];
      const res = await fetch(`/api/buildings/${selectedBuilding}/units`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedBuilding,
  });

  const { data: inviteBuildings } = useQuery<Building[]>({
    queryKey: ["/api/communities", inviteCommunity, "buildings"],
    queryFn: async () => {
      if (!inviteCommunity) return [];
      const res = await fetch(`/api/communities/${inviteCommunity}/buildings`, { credentials: "include" });
      return res.json();
    },
    enabled: !!inviteCommunity,
  });

  const { data: inviteUnits } = useQuery<UnitWithFloor[]>({
    queryKey: ["/api/buildings", inviteBuilding, "units"],
    queryFn: async () => {
      if (!inviteBuilding) return [];
      const res = await fetch(`/api/buildings/${inviteBuilding}/units`, { credentials: "include" });
      return res.json();
    },
    enabled: !!inviteBuilding,
  });

  const { data: pendingInvites } = useQuery<any[]>({
    queryKey: ["/api/admin/invites"],
  });

  const selectedUnitData = units?.find((u) => u.id === selectedUnit);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/create-tenant", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create tenant");
      }
      return res.json();
    },
    onSuccess: () => {
      setCreatedInfo({ name: `${firstName} ${lastName}`.trim(), email, password });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Tenant account created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const sendInviteMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/invite", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      setInviteSentInfo({
        name: `${firstName} ${lastName}`.trim(),
        email,
        inviteUrl: data.inviteUrl,
        emailSent: data.emailSent,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: data.emailSent ? "Invite email sent" : "Invite link generated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { unitId: string; email?: string }) => {
      const res = await apiRequest("POST", "/api/admin/invite", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setGeneratedLink(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite link generated" });
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
    if (!createdInfo) return;
    navigator.clipboard.writeText(`Name: ${createdInfo.name}\nEmail: ${createdInfo.email}\nPassword: ${createdInfo.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const resetCreateDialog = () => {
    setCreatedInfo(null);
    setInviteSentInfo(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setShowPassword(false);
    setSendInvite(false);
    setSelectedCommunity("");
    setSelectedBuilding("");
    setSelectedUnit("");
  };

  const resetInviteDialog = () => {
    setGeneratedLink("");
    setInviteEmail("");
    setInviteCommunity("");
    setInviteBuilding("");
    setInviteUnit("");
  };

  const CascadeSelector = ({
    community, setComm,
    building, setBldg,
    unit, setUnit,
    communityBuildings,
    buildingUnits,
    testPrefix = "tenant",
  }: {
    community: string; setComm: (v: string) => void;
    building: string; setBldg: (v: string) => void;
    unit: string; setUnit: (v: string) => void;
    communityBuildings?: Building[];
    buildingUnits?: UnitWithFloor[];
    testPrefix?: string;
  }) => {
    const selectedUnitObj = buildingUnits?.find((u) => u.id === unit);
    return (
      <>
        <div className="space-y-2">
          <Label>Community <span className="text-destructive">*</span></Label>
          <Select value={community} onValueChange={(v) => { setComm(v); setBldg(""); setUnit(""); }}>
            <SelectTrigger data-testid={`select-${testPrefix}-community`}>
              <SelectValue placeholder="Select community" />
            </SelectTrigger>
            <SelectContent>
              {communities?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {community && (
          <div className="space-y-2">
            <Label>Building <span className="text-destructive">*</span></Label>
            <Select value={building} onValueChange={(v) => { setBldg(v); setUnit(""); }}>
              <SelectTrigger data-testid={`select-${testPrefix}-building`}>
                <SelectValue placeholder="Select building" />
              </SelectTrigger>
              <SelectContent>
                {communityBuildings?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {building && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Unit <span className="text-destructive">*</span></Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger data-testid={`select-${testPrefix}-unit`}>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {buildingUnits?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.unitNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Input
                readOnly
                value={selectedUnitObj?.floor != null ? String(selectedUnitObj.floor) : ""}
                placeholder="Auto-filled"
                className="bg-muted/50 text-muted-foreground cursor-default"
                data-testid={`input-${testPrefix}-floor`}
              />
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Tenant Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">Create accounts or send invite links for tenant self-registration</p>
        </div>
        <div className="flex gap-2">

          {/* Invite dialog */}
          <Dialog open={inviteDialogOpen} onOpenChange={(o) => { setInviteDialogOpen(o); if (!o) resetInviteDialog(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-invite-tenant">
                <Link className="h-4 w-4 mr-2" />
                Generate Invite Link
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{generatedLink ? "Invite Link Ready" : "Generate Invite Link"}</DialogTitle>
              </DialogHeader>
              {generatedLink ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Share this link with the tenant. They can use it to create their account and access their unit's WiFi settings.
                  </p>
                  <div className="p-3 rounded-md bg-accent/50 text-sm break-all font-mono" data-testid="text-invite-link">
                    {generatedLink}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    This link expires in 7 days
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleCopyLink} className="flex-1" variant="secondary" data-testid="button-copy-invite-link">
                      {linkCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {linkCopied ? "Copied!" : "Copy Link"}
                    </Button>
                    <Button onClick={() => { setInviteDialogOpen(false); resetInviteDialog(); }} className="flex-1" data-testid="button-done-invite">
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Generate a link that a tenant can use to self-register and get access to their unit's portal.
                  </p>
                  <CascadeSelector
                    community={inviteCommunity} setComm={setInviteCommunity}
                    building={inviteBuilding} setBldg={setInviteBuilding}
                    unit={inviteUnit} setUnit={setInviteUnit}
                    communityBuildings={inviteBuildings}
                    buildingUnits={inviteUnits}
                    testPrefix="invite"
                  />
                  <div className="space-y-2">
                    <Label>Tenant Email (optional)</Label>
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="tenant@example.com"
                      type="email"
                      data-testid="input-invite-email"
                    />
                    <p className="text-xs text-muted-foreground">
                      If provided, only this email can use the invite link
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!inviteUnit || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate({ unitId: inviteUnit, email: inviteEmail || undefined })}
                    data-testid="button-generate-invite"
                  >
                    {inviteMutation.isPending ? "Generating..." : "Generate Invite Link"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Create tenant dialog */}
          <Dialog open={createDialogOpen} onOpenChange={(o) => { setCreateDialogOpen(o); if (!o) resetCreateDialog(); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-tenant">
                <Plus className="h-4 w-4 mr-2" />
                Create Tenant
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {createdInfo ? "Tenant Created" : inviteSentInfo ? "Invite Sent" : "Create Tenant Account"}
                </DialogTitle>
              </DialogHeader>

              {createdInfo ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-md bg-accent/50 space-y-2">
                    <p className="text-sm"><span className="text-muted-foreground">Name:</span> <strong>{createdInfo.name}</strong></p>
                    <p className="text-sm"><span className="text-muted-foreground">Email:</span> <strong>{createdInfo.email}</strong></p>
                    <p className="text-sm"><span className="text-muted-foreground">Password:</span> <strong>{createdInfo.password}</strong></p>
                  </div>
                  <p className="text-xs text-muted-foreground">Share these credentials with the tenant. They can use them to log in to the tenant portal.</p>
                  <div className="flex gap-2">
                    <Button onClick={handleCopy} className="flex-1" variant="secondary" data-testid="button-copy-creds">
                      {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {copied ? "Copied!" : "Copy Credentials"}
                    </Button>
                    <Button onClick={() => { setCreateDialogOpen(false); resetCreateDialog(); }} className="flex-1" data-testid="button-done">
                      Done
                    </Button>
                  </div>
                </div>
              ) : inviteSentInfo ? (
                <div className="space-y-4">
                  {inviteSentInfo.emailSent ? (
                    <div className="flex items-start gap-3 p-4 rounded-md bg-green-500/10 text-green-700 dark:text-green-400">
                      <Send className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Invite email sent</p>
                        <p className="text-sm mt-0.5">An invite was sent to <strong>{inviteSentInfo.email}</strong>. They'll receive a link to create their account.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-4 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Email not configured</p>
                        <p className="text-sm mt-0.5">SMTP is not set up. Share this invite link manually with <strong>{inviteSentInfo.email}</strong>:</p>
                      </div>
                    </div>
                  )}
                  {!inviteSentInfo.emailSent && (
                    <div className="p-3 rounded-md bg-muted text-sm break-all font-mono" data-testid="text-invite-link-created">
                      {inviteSentInfo.inviteUrl}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    This invite link expires in 7 days
                  </p>
                  <div className="flex gap-2">
                    {!inviteSentInfo.emailSent && (
                      <Button
                        onClick={() => { navigator.clipboard.writeText(inviteSentInfo.inviteUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                        className="flex-1"
                        variant="secondary"
                        data-testid="button-copy-invite-link-created"
                      >
                        {linkCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                        {linkCopied ? "Copied!" : "Copy Link"}
                      </Button>
                    )}
                    <Button onClick={() => { setCreateDialogOpen(false); resetCreateDialog(); }} className="flex-1" data-testid="button-done-invite-created">
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (sendInvite) {
                      sendInviteMutation.mutate({
                        unitId: selectedUnit,
                        email,
                        firstName,
                        lastName,
                        phone: phone || undefined,
                        sendEmail: true,
                      });
                    } else {
                      createMutation.mutate({ firstName, lastName, email, phone: phone || undefined, password, unitId: selectedUnit });
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jane"
                        required
                        data-testid="input-tenant-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Smith"
                        required
                        data-testid="input-tenant-last-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenantEmail">Email Address <span className="text-destructive">*</span></Label>
                    <Input
                      id="tenantEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane.smith@example.com"
                      required
                      data-testid="input-tenant-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenantPhone">Phone Number</Label>
                    <Input
                      id="tenantPhone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 000-0000"
                      data-testid="input-tenant-phone"
                    />
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer" onClick={() => setSendInvite(!sendInvite)} data-testid="toggle-send-invite">
                    <Checkbox
                      id="sendInvite"
                      checked={sendInvite}
                      onCheckedChange={(c) => setSendInvite(c === true)}
                      className="mt-0.5"
                      data-testid="checkbox-send-invite"
                    />
                    <div>
                      <label htmlFor="sendInvite" className="text-sm font-medium cursor-pointer">Send invite to tenant</label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {sendInvite
                          ? "An invite link will be emailed to the tenant. They'll use it to create their account and will receive their password by email."
                          : "Set a password below and share the credentials with the tenant manually."}
                      </p>
                    </div>
                  </div>

                  {!sendInvite && (
                    <div className="space-y-2">
                      <Label htmlFor="tenantPassword">Password <span className="text-destructive">*</span></Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="tenantPassword"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min 8 characters"
                            required={!sendInvite}
                            minLength={8}
                            className="pr-10"
                            data-testid="input-tenant-password"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            data-testid="button-toggle-password"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button type="button" variant="secondary" onClick={generatePassword} data-testid="button-generate-pw">
                          Generate
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-4">
                    <p className="text-sm font-medium text-muted-foreground">Unit Assignment</p>
                    <CascadeSelector
                      community={selectedCommunity} setComm={setSelectedCommunity}
                      building={selectedBuilding} setBldg={setSelectedBuilding}
                      unit={selectedUnit} setUnit={setSelectedUnit}
                      communityBuildings={buildings}
                      buildingUnits={units}
                      testPrefix="tenant"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={
                      createMutation.isPending || sendInviteMutation.isPending ||
                      !selectedUnit || !firstName || !lastName || !email ||
                      (!sendInvite && !password)
                    }
                    data-testid="button-submit-tenant"
                  >
                    {sendInvite ? (
                      <><Send className="h-4 w-4 mr-2" />{sendInviteMutation.isPending ? "Sending invite..." : "Send Invite"}</>
                    ) : (
                      createMutation.isPending ? "Creating..." : "Create Tenant Account"
                    )}
                  </Button>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {pendingInvites && pendingInvites.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Pending Invites
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Building</TableHead>
                  <TableHead>Community</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((inv: any) => {
                  const expired = new Date() > new Date(inv.expiresAt);
                  return (
                    <TableRow key={inv.id} data-testid={`row-invite-${inv.id}`}>
                      <TableCell className="font-medium">Unit {inv.unitNumber}</TableCell>
                      <TableCell>{inv.buildingName}</TableCell>
                      <TableCell>{inv.communityName}</TableCell>
                      <TableCell>{inv.email || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={expired ? "destructive" : "secondary"} data-testid={`badge-invite-status-${inv.id}`}>
                          {expired ? "Expired" : "Pending"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(!pendingInvites || pendingInvites.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">Tenant Management</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Create tenant accounts directly or generate invite links so residents can self-register and access their WiFi settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
