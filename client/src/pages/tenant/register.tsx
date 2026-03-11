import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Wifi, AlertCircle, Building2, Home, CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface InviteInfo {
  valid: boolean;
  email?: string;
  unitNumber: string;
  buildingName: string;
  communityName: string;
}

export default function TenantRegisterPage() {
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token");

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [isValidating, setIsValidating] = useState(true);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setInviteError("No invite token provided. Please use the link from your property manager.");
      setIsValidating(false);
      return;
    }

    fetch(`/api/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Invalid invite link");
        }
        return res.json();
      })
      .then((data: InviteInfo) => {
        setInviteInfo(data);
        if (data.email) setEmail(data.email);
      })
      .catch((err) => {
        setInviteError(err.message);
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, [token]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!tosAccepted) {
      setError("You must accept the Terms of Service to create an account");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        email,
        displayName,
        tosAccepted: true,
        inviteToken: token,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Registration failed");
      }
      const data = await res.json();
      if (data._generatedPassword) {
        setGeneratedPassword(data._generatedPassword);
      }
      setRegistered(true);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Validating your invite link...</p>
        </div>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 mx-auto">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-invite-error-title">Invalid Invite</h1>
            <p className="text-muted-foreground text-sm" data-testid="text-invite-error-message">{inviteError}</p>
          </div>
          <Card>
            <CardContent className="py-6 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Please contact your property manager for a new invite link.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/login"} data-testid="button-back-to-login">
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/10 mx-auto">
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-register-success-title">Account Created!</h1>
            <p className="text-muted-foreground text-sm">Welcome to your tenant portal</p>
          </div>
          <Card>
            <CardContent className="py-6 space-y-4">
              {generatedPassword ? (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300">
                    <Mail className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="text-sm">Your login credentials have been sent to <strong>{email}</strong>. Please check your inbox.</p>
                  </div>
                  <div className="p-4 rounded-md bg-muted space-y-2">
                    <p className="text-sm"><span className="text-muted-foreground">Email:</span> <strong>{email}</strong></p>
                    <p className="text-sm"><span className="text-muted-foreground">Password:</span> <strong className="font-mono">{generatedPassword}</strong></p>
                  </div>
                  <p className="text-xs text-muted-foreground">Keep this safe. You can change your password after logging in.</p>
                </>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-md bg-green-500/10 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                  <p className="text-sm">Your account is ready. You can now log in to the tenant portal.</p>
                </div>
              )}
              <Button className="w-full" onClick={() => window.location.href = "/login"} data-testid="button-go-to-login">
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mx-auto">
            <Wifi className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-tenant-register-title">Create Your Account</h1>
          <p className="text-muted-foreground text-sm">Complete your registration to access your tenant portal</p>
        </div>

        {inviteInfo && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium" data-testid="text-invite-unit">
                    Unit {inviteInfo.unitNumber}
                  </p>
                  <p className="text-muted-foreground" data-testid="text-invite-location">
                    {inviteInfo.buildingName} • {inviteInfo.communityName}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center">Your Details</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-register-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your full name"
                  required
                  autoComplete="name"
                  data-testid="input-tenant-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                  disabled={!!inviteInfo?.email}
                  data-testid="input-tenant-email"
                />
                {inviteInfo?.email && (
                  <p className="text-xs text-muted-foreground">This invite was sent to this email address</p>
                )}
              </div>

              <div className="p-3 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm flex items-start gap-2">
                <Mail className="h-4 w-4 shrink-0 mt-0.5" />
                <span>After registering, your login password will be sent to your email address.</span>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={(checked) => setTosAccepted(checked === true)}
                  data-testid="checkbox-tos"
                />
                <label htmlFor="tos" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline"
                    data-testid="link-tos"
                  >
                    Terms of Service
                  </a>
                </label>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || !tosAccepted || !displayName} data-testid="button-submit-register">
                {isLoading ? "Creating account..." : "Complete Registration"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-primary font-medium hover:underline" data-testid="link-to-login">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
