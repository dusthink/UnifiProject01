import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import AdminDashboard from "@/pages/admin/dashboard";
import CommunitiesPage from "@/pages/admin/communities";
import CommunityDetailPage from "@/pages/admin/community-detail";
import BuildingDetailPage from "@/pages/admin/building-detail";
import TenantsPage from "@/pages/admin/tenants";
import ControllersPage from "@/pages/admin/controllers";
import SettingsPage from "@/pages/admin/settings";
import TenantPortal from "@/pages/tenant/portal";
import TenantRegisterPage from "@/pages/tenant/register";
import TermsOfServicePage from "@/pages/terms-of-service";
import { TosDialog } from "@/components/tos-dialog";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function AdminRouter() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/admin" />
      </Route>
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/communities" component={CommunitiesPage} />
      <Route path="/admin/communities/:id">
        {(params) => <CommunityDetailPage id={params.id} />}
      </Route>
      <Route path="/admin/buildings/:id">
        {(params) => <BuildingDetailPage id={params.id} />}
      </Route>
      <Route path="/admin/tenants" component={TenantsPage} />
      <Route path="/admin/controllers" component={ControllersPage} />
      <Route path="/admin/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AdminLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-2 border-b shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <AdminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-64">
          <Skeleton className="h-12 w-12 rounded-2xl mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  const needsTosAcceptance = user && !user.tosAcceptedAt;

  return (
    <>
      <Switch>
        <Route path="/terms" component={TermsOfServicePage} />
        <Route path="/register/tenant" component={TenantRegisterPage} />
        <Route>
          {!user ? (
            <LoginPage />
          ) : user.role === "tenant" ? (
            <TenantPortal />
          ) : (
            <AdminLayout />
          )}
        </Route>
      </Switch>
      <TosDialog open={!!needsTosAcceptance} />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
