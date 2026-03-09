import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Wifi, AlertCircle, Eye, EyeOff } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";

export default function LoginPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const googleError = params.get("error");

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(googleError === "google_auth_failed" ? "Google sign-in failed. Please try again." : "");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email, password);
      toast({ title: "Welcome back!", description: "Successfully logged in." });
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("401")) {
        setError("Invalid email/username or password");
      } else if (msg.includes("Google sign-in")) {
        setError(msg);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setIsLoading(true);
    try {
      await register(email, password, displayName);
      toast({ title: "Account created!", description: "Welcome to UniFi MDU Manager." });
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError("");
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mx-auto">
            <Wifi className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-login-title">UniFi MDU Manager</h1>
          <p className="text-muted-foreground text-sm">Multi-dwelling network management portal</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-center" data-testid="text-auth-mode">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-11 gap-3"
              onClick={handleGoogleLogin}
              data-testid="button-google-auth"
            >
              <SiGoogle className="h-4 w-4" />
              {mode === "login" ? "Continue with Google" : "Sign up with Google"}
            </Button>

            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                or
              </span>
            </div>

            <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md" data-testid="text-auth-error">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {mode === "register" && (
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
                    data-testid="input-display-name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{mode === "login" ? "Email or Username" : "Email"}</Label>
                <Input
                  id="email"
                  type={mode === "register" ? "email" : "text"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === "login" ? "Enter your email or username" : "Enter your email"}
                  required
                  autoComplete={mode === "register" ? "email" : "username"}
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => toast({ title: "Reset Password", description: "Please contact your property manager to reset your password." })}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
                    required
                    minLength={mode === "register" ? 8 : undefined}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    className="pr-10"
                    data-testid="input-password"
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

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit-auth">
                {isLoading
                  ? (mode === "login" ? "Signing in..." : "Creating account...")
                  : (mode === "login" ? "Sign In" : "Create Account")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  onClick={switchMode}
                  className="text-primary font-medium hover:underline"
                  data-testid="link-switch-to-register"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={switchMode}
                  className="text-primary font-medium hover:underline"
                  data-testid="link-switch-to-login"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Tenants: use the invite link from your property manager
          </p>
        </div>
      </div>
    </div>
  );
}
