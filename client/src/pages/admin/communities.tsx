import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Plus, MapPin, Trash2, ChevronRight, Network } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Community } from "@shared/schema";

export default function CommunitiesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [siteId, setSiteId] = useState("default");

  const { data: communities, isLoading } = useQuery<Community[]>({
    queryKey: ["/api/communities"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; unifiSiteId: string }) => {
      const res = await apiRequest("POST", "/api/communities", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
      setDialogOpen(false);
      setName("");
      setAddress("");
      setSiteId("default");
      toast({ title: "Community created", description: "New community has been added." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/communities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
      toast({ title: "Community deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Communities</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage apartment complexes and properties</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-community">
              <Plus className="h-4 w-4 mr-2" />
              Add Community
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Community</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({ name, address, unifiSiteId: siteId });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="comm-name">Community Name</Label>
                <Input
                  id="comm-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Riverside Apartments"
                  required
                  data-testid="input-community-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comm-address">Address</Label>
                <Input
                  id="comm-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g., 123 Main St, City, ST"
                  data-testid="input-community-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comm-site">UniFi Site ID</Label>
                <Input
                  id="comm-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  placeholder="default"
                  data-testid="input-community-site"
                />
                <p className="text-xs text-muted-foreground">The UniFi site name for this community</p>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-community">
                {createMutation.isPending ? "Creating..." : "Create Community"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!communities?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">No communities yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first community to start managing properties</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-community">
              <Plus className="h-4 w-4 mr-2" />
              Add Community
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {communities.map((community) => (
            <Card
              key={community.id}
              className="hover-elevate cursor-pointer group"
              onClick={() => navigate(`/admin/communities/${community.id}`)}
              data-testid={`card-community-${community.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{community.name}</h3>
                      {community.address && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground truncate">{community.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                  <Network className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Site: {community.unifiSiteId || "default"}</span>
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this community?")) deleteMutation.mutate(community.id);
                    }}
                    data-testid={`button-delete-community-${community.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
