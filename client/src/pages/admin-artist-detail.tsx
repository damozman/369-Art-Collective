import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Artist } from "@shared/schema";
import { ArrowLeft, Mail, User, Hash, Calendar, DollarSign, KeyRound, CheckCircle, XCircle, Copy } from "lucide-react";
import { format } from "date-fns";

export default function AdminArtistDetail() {
  const [, params] = useRoute("/admin/artists/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const artistId = params?.id;

  const { data: artist, isLoading } = useQuery<Artist>({
    queryKey: [`/api/artists/${artistId}`],
    enabled: Boolean(artistId),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/artists/${artistId}/reset-password`);
      return response.json();
    },
    onSuccess: (data) => {
      setTempPassword(data.temporaryPassword);
      toast({
        title: "Password reset successful",
        description: `Temporary password generated for ${data.artistEmail}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset password",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Password copied to clipboard",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Artist not found</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/artists")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-artist-detail">Artist Details</h1>
            <p className="text-muted-foreground">Manage artist account and settings</p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card data-testid="card-profile">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Full Name</div>
                <div className="font-medium" data-testid="text-name">{artist.name}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Email
                </div>
                <div className="font-medium" data-testid="text-email">{artist.email}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Artist Initials
                </div>
                <div className="font-medium" data-testid="text-artist-short">{artist.artistShort}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Joined
                </div>
                <div className="font-medium" data-testid="text-created-at">
                  {format(new Date(artist.createdAt), 'PPP')}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-account-status">
            <CardHeader>
              <CardTitle>Account Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground mb-2">Approval Status</div>
                {artist.approved ? (
                  <Badge variant="default" className="bg-green-600" data-testid="badge-approved">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approved
                  </Badge>
                ) : (
                  <Badge variant="secondary" data-testid="badge-pending">
                    <XCircle className="w-3 h-3 mr-1" />
                    Pending Approval
                  </Badge>
                )}
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Monthly Sales
                </div>
                <div className="font-medium text-2xl" data-testid="text-monthly-sales">
                  ${parseFloat(artist.monthlySales || '0').toFixed(2)}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-2">Stripe Status</div>
                {artist.stripeAccountStatus === 'active' ? (
                  <Badge variant="default" className="bg-green-600" data-testid="badge-stripe-active">
                    Active
                  </Badge>
                ) : artist.stripeAccountStatus === 'pending' ? (
                  <Badge variant="secondary" data-testid="badge-stripe-pending">
                    Pending
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid="badge-stripe-not-connected">
                    Not Connected
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-security">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Security
            </CardTitle>
            <CardDescription>
              Reset artist password to help them regain access to their account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tempPassword ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground mb-2">Temporary Password</div>
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-mono font-bold" data-testid="text-temp-password">
                      {tempPassword}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(tempPassword)}
                      data-testid="button-copy-password"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    Share this password with the artist via email: <strong>{artist.email}</strong>
                    <br />
                    They should change it immediately after logging in.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setTempPassword(null)}
                  data-testid="button-done"
                >
                  Done
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setShowResetDialog(true)}
                disabled={resetPasswordMutation.isPending}
                data-testid="button-reset-password"
              >
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Artist Password?</AlertDialogTitle>
            <AlertDialogDescription>
              This will generate a new temporary password for <strong>{artist.name}</strong>.
              The current password will be invalidated immediately.
              You'll need to share the temporary password with them via email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reset">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                resetPasswordMutation.mutate();
                setShowResetDialog(false);
              }}
              data-testid="button-confirm-reset"
            >
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
