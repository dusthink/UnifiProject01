import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, Building2, CheckCircle, XCircle, Loader2, Eye, EyeOff, Send } from "lucide-react";

interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
}

interface BrandingSettings {
  businessName: string;
  tagline: string;
  logo: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
}

const emptySmtp: SmtpSettings = { host: "", port: "587", user: "", pass: "", from: "" };
const emptyBranding: BrandingSettings = {
  businessName: "", tagline: "", logo: "", address: "", city: "", state: "", zip: "",
  phone: "", email: "", website: "", primaryColor: "#2563eb",
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [smtpForm, setSmtpForm] = useState<SmtpSettings | null>(null);
  const [brandingForm, setBrandingForm] = useState<BrandingSettings | null>(null);

  const { data: smtpData, isLoading: smtpLoading } = useQuery<SmtpSettings>({
    queryKey: ["/api/admin/settings/smtp"],
    select: (d: any) => ({ ...emptySmtp, ...d }),
  });

  const { data: brandingData, isLoading: brandingLoading } = useQuery<BrandingSettings>({
    queryKey: ["/api/admin/settings/branding"],
    select: (d: any) => ({ ...emptyBranding, ...d }),
  });

  const smtp = smtpForm ?? smtpData ?? emptySmtp;
  const branding = brandingForm ?? brandingData ?? emptyBranding;

  const smtpMutation = useMutation({
    mutationFn: (data: SmtpSettings) => apiRequest("PUT", "/api/admin/settings/smtp", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/smtp"] });
      setSmtpForm(null);
      toast({ title: "SMTP settings saved" });
    },
    onError: () => toast({ title: "Failed to save SMTP settings", variant: "destructive" }),
  });

  const brandingMutation = useMutation({
    mutationFn: (data: BrandingSettings) => apiRequest("PUT", "/api/admin/settings/branding", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/branding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branding"] });
      setBrandingForm(null);
      toast({ title: "Branding settings saved" });
    },
    onError: () => toast({ title: "Failed to save branding settings", variant: "destructive" }),
  });

  async function sendTestEmail() {
    if (!testEmail) return;
    setTestLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/settings/smtp/test", { email: testEmail });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Test email sent", description: `Sent to ${testEmail}` });
      } else {
        toast({ title: "Test email failed", description: data.error || "Check SMTP configuration", variant: "destructive" });
      }
    } catch {
      toast({ title: "Test email failed", variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  }

  const smtpConfigured = !!(smtp.host && smtp.user && smtp.pass);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage SMTP configuration and branding</p>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList className="mb-4">
          <TabsTrigger value="smtp" data-testid="tab-smtp">
            <Mail className="h-4 w-4 mr-2" />
            Email (SMTP)
          </TabsTrigger>
          <TabsTrigger value="branding" data-testid="tab-branding">
            <Building2 className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">SMTP Configuration</CardTitle>
                  <CardDescription>Used for tenant invite and credential emails</CardDescription>
                </div>
                {smtpConfigured ? (
                  <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
                    <CheckCircle className="h-3.5 w-3.5" /> Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Not configured
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {smtpLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-host">SMTP Host</Label>
                      <Input
                        id="smtp-host"
                        data-testid="input-smtp-host"
                        placeholder="smtp.example.com"
                        value={smtp.host}
                        onChange={e => setSmtpForm({ ...smtp, host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input
                        id="smtp-port"
                        data-testid="input-smtp-port"
                        placeholder="587"
                        value={smtp.port}
                        onChange={e => setSmtpForm({ ...smtp, port: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-user">Username / Email</Label>
                    <Input
                      id="smtp-user"
                      data-testid="input-smtp-user"
                      placeholder="you@example.com"
                      value={smtp.user}
                      onChange={e => setSmtpForm({ ...smtp, user: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-pass">Password</Label>
                    <div className="relative">
                      <Input
                        id="smtp-pass"
                        data-testid="input-smtp-pass"
                        type={showPass ? "text" : "password"}
                        placeholder="App password or SMTP password"
                        value={smtp.pass}
                        onChange={e => setSmtpForm({ ...smtp, pass: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPass(v => !v)}
                        data-testid="button-toggle-password"
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-from">From Address</Label>
                    <Input
                      id="smtp-from"
                      data-testid="input-smtp-from"
                      placeholder="noreply@example.com (leave blank to use username)"
                      value={smtp.from}
                      onChange={e => setSmtpForm({ ...smtp, from: e.target.value })}
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button
                      data-testid="button-save-smtp"
                      onClick={() => smtpMutation.mutate(smtp)}
                      disabled={smtpMutation.isPending}
                    >
                      {smtpMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save SMTP Settings
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send Test Email</CardTitle>
              <CardDescription>Verify your SMTP settings are working correctly</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  data-testid="input-test-email"
                  placeholder="recipient@example.com"
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  data-testid="button-send-test"
                  variant="outline"
                  onClick={sendTestEmail}
                  disabled={testLoading || !testEmail || !smtpConfigured}
                >
                  {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send Test
                </Button>
              </div>
              {!smtpConfigured && (
                <p className="text-sm text-muted-foreground mt-2">Save SMTP settings first before sending a test email.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business Identity</CardTitle>
              <CardDescription>Shown in emails, the tenant portal, and login pages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {brandingLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-name">Business Name</Label>
                      <Input
                        id="brand-name"
                        data-testid="input-brand-name"
                        placeholder="Acme Properties"
                        value={branding.businessName}
                        onChange={e => setBrandingForm({ ...branding, businessName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-tagline">Tagline</Label>
                      <Input
                        id="brand-tagline"
                        data-testid="input-brand-tagline"
                        placeholder="Managed WiFi for Modern Living"
                        value={branding.tagline}
                        onChange={e => setBrandingForm({ ...branding, tagline: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-logo">Logo URL</Label>
                    <Input
                      id="brand-logo"
                      data-testid="input-brand-logo"
                      placeholder="https://example.com/logo.png"
                      value={branding.logo}
                      onChange={e => setBrandingForm({ ...branding, logo: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Paste a publicly accessible image URL for your logo</p>
                  </div>
                  {branding.logo && (
                    <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                      <img
                        src={branding.logo}
                        alt="Logo preview"
                        className="max-h-16 max-w-48 object-contain"
                        data-testid="img-logo-preview"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-1.5">
                    <Label htmlFor="brand-address">Street Address</Label>
                    <Input
                      id="brand-address"
                      data-testid="input-brand-address"
                      placeholder="123 Main St"
                      value={branding.address}
                      onChange={e => setBrandingForm({ ...branding, address: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5 col-span-1">
                      <Label htmlFor="brand-city">City</Label>
                      <Input
                        id="brand-city"
                        data-testid="input-brand-city"
                        placeholder="New York"
                        value={branding.city}
                        onChange={e => setBrandingForm({ ...branding, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-state">State</Label>
                      <Input
                        id="brand-state"
                        data-testid="input-brand-state"
                        placeholder="NY"
                        value={branding.state}
                        onChange={e => setBrandingForm({ ...branding, state: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-zip">ZIP</Label>
                      <Input
                        id="brand-zip"
                        data-testid="input-brand-zip"
                        placeholder="10001"
                        value={branding.zip}
                        onChange={e => setBrandingForm({ ...branding, zip: e.target.value })}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-phone">Phone</Label>
                      <Input
                        id="brand-phone"
                        data-testid="input-brand-phone"
                        placeholder="+1 (555) 000-0000"
                        value={branding.phone}
                        onChange={e => setBrandingForm({ ...branding, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-email">Contact Email</Label>
                      <Input
                        id="brand-email"
                        data-testid="input-brand-email"
                        placeholder="support@example.com"
                        value={branding.email}
                        onChange={e => setBrandingForm({ ...branding, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-website">Website</Label>
                    <Input
                      id="brand-website"
                      data-testid="input-brand-website"
                      placeholder="https://example.com"
                      value={branding.website}
                      onChange={e => setBrandingForm({ ...branding, website: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      data-testid="button-save-branding"
                      onClick={() => brandingMutation.mutate(branding)}
                      disabled={brandingMutation.isPending}
                    >
                      {brandingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Branding
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
