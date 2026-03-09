import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Network, Globe, Wifi, Router, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

export default function UniFiPage() {
  const { data: status, isLoading, isFetching } = useQuery<{ success: boolean; message: string; sites?: any[] }>({
    queryKey: ["/api/unifi/test"],
    staleTime: 30000,
    retry: false,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">UniFi Controller</h1>
          <p className="text-muted-foreground text-sm mt-1">Connection status and site management</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/unifi/test"] })}
          disabled={isFetching}
          data-testid="button-refresh-status"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Network className="h-4 w-4" />
                Connection Status
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
                {status?.success ? (
                  <CheckCircle2 className="h-6 w-6 text-status-online shrink-0" />
                ) : (
                  <XCircle className="h-6 w-6 text-destructive shrink-0" />
                )}
                <div>
                  <p className="font-medium text-sm">
                    {status?.success ? "Connected" : "Disconnected"}
                  </p>
                  <p className="text-xs text-muted-foreground">{status?.message}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Controller URL</span>
                  <Badge variant="outline" data-testid="text-controller-url">Configured</Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Authentication</span>
                  <Badge variant={status?.success ? "default" : "secondary"}>
                    {status?.success ? "Authenticated" : "Failed"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Sites
              </h3>
            </CardHeader>
            <CardContent>
              {status?.sites?.length ? (
                <div className="space-y-2">
                  {status.sites.map((site: any) => (
                    <div key={site.name} className="flex items-center justify-between p-2 rounded-md bg-accent/50" data-testid={`card-site-${site.name}`}>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{site.desc || site.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{site.name}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {status?.success ? "No sites found" : "Connect to view sites"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-3">Quick Info</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
              <Router className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">API Version</p>
                <p className="text-sm font-medium">UniFi Controller v7+</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">WiFi Modes</p>
                <p className="text-sm font-medium">PPSK & Individual</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-md bg-accent/50">
              <Network className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">VLAN Support</p>
                <p className="text-sm font-medium">802.1Q Tagging</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
