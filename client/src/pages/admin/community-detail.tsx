import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, ArrowLeft, Trash2, ChevronRight, Home, Network, Pencil, Layers } from "lucide-react";
import { DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Community, Building } from "@shared/schema";

interface ControllerInfo {
  id: string;
  name: string;
  url: string;
  isVerified: boolean | null;
}

export default function CommunityDetailPage({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [buildingFloors, setBuildingFloors] = useState("");
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);

  const { data: community, isLoading: commLoading } = useQuery<Community>({
    queryKey: ["/api/communities", id],
  });

  const { data: controller } = useQuery<ControllerInfo>({
    queryKey: ["/api/controllers", community?.controllerId],
    queryFn: async () => {
      if (!community?.controllerId) return null;
      const res = await fetch(`/api/controllers/${community.controllerId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!community?.controllerId,
  });

  const { data: buildings, isLoading: bldgLoading } = useQuery<Building[]>({
    queryKey: ["/api/communities", id, "buildings"],
    queryFn: async () => {
      const res = await fetch(`/api/communities/${id}/buildings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch buildings");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; floors: number; communityId: string }) => {
      const res = await apiRequest("POST", "/api/buildings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", id, "buildings"] });
      setDialogOpen(false);
      setBuildingName("");
      setBuildingAddress("");
      setBuildingFloors("");
      toast({ title: "Building added" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ buildingId, data }: { buildingId: string; data: { name: string; address: string; floors: number } }) => {
      const res = await apiRequest("PATCH", `/api/buildings/${buildingId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", id, "buildings"] });
      setEditBuilding(null);
      toast({ title: "Building updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (buildingId: string) => {
      await apiRequest("DELETE", `/api/buildings/${buildingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", id, "buildings"] });
      toast({ title: "Building deleted" });
    },
  });

  if (commLoading || bldgLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/admin/communities")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-community-name">{community?.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{community?.address || "No address"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{buildings?.length || 0} buildings</Badge>
          <Badge variant="outline">Site: {community?.unifiSiteId || "default"}</Badge>
          {controller ? (
            <Badge variant="outline" data-testid="badge-controller">
              <Network className="h-3 w-3 mr-1" />
              {controller.name}
            </Badge>
          ) : (
            <Badge variant="secondary" data-testid="badge-no-controller">No controller</Badge>
          )}
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-building">
              <Plus className="h-4 w-4 mr-2" />
              Add Building
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Building</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name: buildingName,
                  address: buildingAddress,
                  floors: parseInt(buildingFloors),
                  communityId: id,
                });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="bldg-name">Building Name</Label>
                <Input
                  id="bldg-name"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="e.g., Building A"
                  required
                  data-testid="input-building-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bldg-address">Address</Label>
                <Input
                  id="bldg-address"
                  value={buildingAddress}
                  onChange={(e) => setBuildingAddress(e.target.value)}
                  placeholder="Optional"
                  data-testid="input-building-address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bldg-floors">Number of Floors</Label>
                <Input
                  id="bldg-floors"
                  type="number"
                  value={buildingFloors}
                  onChange={(e) => setBuildingFloors(e.target.value)}
                  placeholder="e.g., 3"
                  min={1}
                  required
                  data-testid="input-building-floors"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-building">
                {createMutation.isPending ? "Adding..." : "Add Building"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!buildings?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Home className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">No buildings yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add buildings to this community</p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-building">
              <Plus className="h-4 w-4 mr-2" />
              Add Building
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buildings.map((building) => (
            <Card
              key={building.id}
              className="hover-elevate cursor-pointer"
              onClick={() => navigate(`/admin/buildings/${building.id}`)}
              data-testid={`card-building-${building.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-chart-2/10">
                      <Building2 className="h-5 w-5 text-chart-2" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{building.name}</h3>
                      {building.address && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{building.address}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
                <div className="flex items-center justify-between mt-3">
                  {building.floors ? (
                    <Badge variant="secondary" data-testid={`badge-floors-${building.id}`}>
                      <Layers className="h-3 w-3 mr-1" />
                      {building.floors} {building.floors === 1 ? "floor" : "floors"}
                    </Badge>
                  ) : <span />}
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditBuilding(building);
                      }}
                      data-testid={`button-edit-building-${building.id}`}
                    >
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this building?")) deleteMutation.mutate(building.id);
                      }}
                      data-testid={`button-delete-building-${building.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editBuilding} onOpenChange={(open) => { if (!open) setEditBuilding(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Building</DialogTitle>
            <DialogDescription>Update the building details.</DialogDescription>
          </DialogHeader>
          {editBuilding && (
            <EditBuildingForm
              building={editBuilding}
              onSubmit={(data) => editMutation.mutate({ buildingId: editBuilding.id, data })}
              isPending={editMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditBuildingForm({ building, onSubmit, isPending }: {
  building: Building;
  onSubmit: (data: { name: string; address: string; floors: number }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(building.name);
  const [address, setAddress] = useState(building.address || "");
  const [floors, setFloors] = useState(building.floors?.toString() || "1");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, address, floors: parseInt(floors) || 1 });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Building Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          data-testid="input-edit-building-name"
        />
      </div>
      <div className="space-y-2">
        <Label>Address</Label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Optional"
          data-testid="input-edit-building-address"
        />
      </div>
      <div className="space-y-2">
        <Label>Number of Floors</Label>
        <Input
          type="number"
          value={floors}
          onChange={(e) => setFloors(e.target.value)}
          placeholder="e.g., 3"
          min={1}
          required
          data-testid="input-edit-building-floors"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-edit-building">
        {isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
