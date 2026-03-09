import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Building2, Home, Router, Users, Wifi, Activity, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Community, Device } from "@shared/schema";

function StatCard({ icon: Icon, label, value, sublabel, color }: {
  icon: any; label: string; value: string | number; sublabel?: string; color: string;
}) {
  return (
    <Card className="hover-elevate">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold" data-testid={`text-stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: communities, isLoading: commLoading } = useQuery<Community[]>({
    queryKey: ["/api/communities"],
  });

  const { data: devices, isLoading: devLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: unifiStatus } = useQuery<{ success: boolean; message: string }>({
    queryKey: ["/api/unifi/test"],
    staleTime: 60000,
    retry: false,
  });

  if (commLoading || devLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Overview of your multi-dwelling network</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Communities"
          value={communities?.length || 0}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          icon={Router}
          label="Devices"
          value={devices?.length || 0}
          color="bg-chart-2/10 text-chart-2"
        />
        <StatCard
          icon={Wifi}
          label="Controller"
          value={unifiStatus?.success ? "Connected" : "Offline"}
          sublabel={unifiStatus?.message}
          color={unifiStatus?.success ? "bg-status-online/10 text-status-online" : "bg-destructive/10 text-destructive"}
        />
        <StatCard
          icon={Activity}
          label="Status"
          value="Active"
          sublabel="All systems operational"
          color="bg-chart-4/10 text-chart-4"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold">Recent Communities</h3>
          </CardHeader>
          <CardContent>
            {!communities?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No communities yet</p>
                <p className="text-xs mt-1">Add your first community to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {communities.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 p-2 rounded-md" data-testid={`card-community-${c.id}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
                      <Building2 className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.address || "No address"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <h3 className="font-semibold">Controller Status</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {unifiStatus?.success ? (
                  <CheckCircle2 className="h-5 w-5 text-status-online" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {unifiStatus?.success ? "Connected to UniFi Controller" : "Controller Unreachable"}
                  </p>
                  <p className="text-xs text-muted-foreground">{unifiStatus?.message}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-md bg-accent/50">
                  <p className="text-xs text-muted-foreground">Registered Devices</p>
                  <p className="text-lg font-semibold mt-1">{devices?.length || 0}</p>
                </div>
                <div className="p-3 rounded-md bg-accent/50">
                  <p className="text-xs text-muted-foreground">Communities</p>
                  <p className="text-lg font-semibold mt-1">{communities?.length || 0}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
