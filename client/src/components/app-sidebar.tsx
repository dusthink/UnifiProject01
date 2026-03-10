import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Building2, Home, Network, LogOut, Wifi, Users, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard", url: "/admin", icon: Home },
  { title: "Communities", url: "/admin/communities", icon: Building2 },
  { title: "Tenants", url: "/admin/tenants", icon: Users },
];

const controllerSubItems = [
  { title: "Controllers", url: "/admin/controllers", icon: Network },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const controllerSectionActive = controllerSubItems.some(
    (item) => location === item.url || location.startsWith(item.url + "/")
  );
  const [controllerOpen, setControllerOpen] = useState(controllerSectionActive);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Wifi className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold" data-testid="text-app-title">UniFi MDU</h2>
            <p className="text-xs text-muted-foreground">Network Manager</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.url || (item.url !== "/admin" && location.startsWith(item.url))}>
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setControllerOpen(!controllerOpen)}
                  data-active={controllerSectionActive}
                  data-testid="link-nav-network"
                >
                  <Network className="h-4 w-4" />
                  <span>Network</span>
                  <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${controllerOpen ? "" : "-rotate-90"}`} />
                </SidebarMenuButton>
              </SidebarMenuItem>
              {controllerOpen && controllerSubItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={location === item.url || location.startsWith(item.url + "/")} className="pl-8">
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">{user?.displayName || user?.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={logout} data-testid="button-logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
