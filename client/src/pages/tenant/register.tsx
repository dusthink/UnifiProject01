import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wifi, AlertCircle, Eye, EyeOff, Building2, Home, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
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
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        email,
        password,
        displayName,
        inviteToken: token,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Registration failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Account created!", description: "Welcome to your tenant portal." });
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = () => {
    window.location.href = `/api/auth/google?inviteToken=${token}`;
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mx-auto">
            <Wifi className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-tenant-register-title">Set Up Your Account</h1>
          <p className="text-muted-foreground text-sm">Create your tenant portal account</p>
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
            <h2 className="text-lg font-semibold text-center">Create Your Account</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-11 gap-3"
              onClick={handleGoogleRegister}
              data-testid="button-google-register"
            >
              <SiGoogle className="h-4 w-4" />
              Sign up with Google
            </Button>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-register-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="displayName">Full Name</Label>
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
                <Label htmlFor="email">Email</Label>
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

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
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
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit-register">
                {isLoading ? "Creating account..." : "Create Account"}
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
