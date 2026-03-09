import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

interface TosDialogProps {
  open: boolean;
}

export function TosDialog({ open }: TosDialogProps) {
  const [tosAccepted, setTosAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAccept = async () => {
    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/accept-tos");
      if (!res.ok) {
        throw new Error("Failed to accept Terms of Service");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Terms accepted", description: "Thank you for accepting the Terms of Service." });
    } catch {
      toast({ title: "Error", description: "Failed to accept Terms of Service. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle data-testid="text-tos-dialog-title">Terms of Service</DialogTitle>
              <DialogDescription>Please review and accept our terms to continue.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            This platform uses an unofficial UniFi API that is not supported or endorsed by Ubiquiti Inc.
            The API may change without notice due to firmware updates. Only verified firmware versions are supported.
          </p>
          <p className="text-sm text-muted-foreground">
            The service is provided "as is" without warranties. You are responsible for maintaining backups
            of your UniFi controller configuration.
          </p>

          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="tos-dialog"
              checked={tosAccepted}
              onCheckedChange={(checked) => setTosAccepted(checked === true)}
              data-testid="checkbox-tos-dialog"
            />
            <label htmlFor="tos-dialog" className="text-sm text-muted-foreground leading-snug cursor-pointer">
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium hover:underline"
                data-testid="link-tos-dialog"
              >
                Terms of Service
              </a>
              , including the use of unofficial UniFi APIs and support for verified firmware versions only.
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleLogout} data-testid="button-tos-decline">
            Decline & Sign Out
          </Button>
          <Button onClick={handleAccept} disabled={!tosAccepted || isLoading} data-testid="button-tos-accept">
            {isLoading ? "Accepting..." : "Accept & Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
