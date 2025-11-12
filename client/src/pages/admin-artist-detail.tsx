import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Artist, PortfolioSubmission } from "@shared/schema";
import { ArrowLeft, Mail, User, Hash, Calendar, DollarSign, KeyRound, CheckCircle, XCircle, Copy, Trash2, AlertTriangle, Image as ImageIcon, FileText } from "lucide-react";
import { format } from "date-fns";

export default function AdminArtistDetail() {
  const [, params] = useRoute("/admin/artists/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const artistId = params?.id;

  const { data: artist, isLoading } = useQuery<Artist>({
    queryKey: [`/api/admin/artists/${artistId}`],
    enabled: Boolean(artistId),
  });

  const { data: portfolioSubmissions = [] } = useQuery<PortfolioSubmission[]>({
    queryKey: [`/api/admin/artists/${artistId}/portfolio`],
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

  const deleteArtistMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/admin/artists/${artistId}/delete`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artists/all"] });
      toast({
        title: "Artist deleted",
        description: "The artist account has been disabled successfully",
      });
      setTimeout(() => setLocation("/admin/artists"), 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete artist",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const response = await apiRequest("PATCH", `/api/admin/artists/${artistId}/notes`, {
        adminNotes: notes,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/artists/${artistId}`] });
      toast({
        title: "Notes saved",
        description: "Admin notes updated successfully",
      });
      setIsEditingNotes(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save notes",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Sync adminNotes state when artist data is loaded
  useEffect(() => {
    if (artist) {
      setAdminNotes(artist.adminNotes ?? "");
    }
  }, [artist?.adminNotes]);

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

        {/* Portfolio Submissions Card */}
        <Card data-testid="card-portfolio">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Portfolio Submissions
            </CardTitle>
            <CardDescription>
              {portfolioSubmissions.length > 0 
                ? `${portfolioSubmissions.length} portfolio sample${portfolioSubmissions.length !== 1 ? 's' : ''} submitted during registration`
                : "No portfolio samples submitted yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {portfolioSubmissions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {portfolioSubmissions.map((submission, index) => (
                  <div key={submission.id} className="relative group">
                    <img
                      src={submission.imageUrl}
                      alt={`Portfolio ${index + 1}`}
                      className="w-full h-64 object-cover rounded-lg border"
                      data-testid={`img-portfolio-${index}`}
                    />
                    <div className="absolute bottom-2 left-2 text-xs bg-background/90 px-2 py-1 rounded">
                      Sample {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No portfolio samples submitted</p>
                <p className="text-xs mt-1">This artist registered before portfolio requirements were added</p>
              </div>
            )}
          </CardContent>
        </Card>

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
                className="min-h-11"
                data-testid="button-reset-password"
              >
                {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-admin-notes">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Private Admin Notes
            </CardTitle>
            <CardDescription>
              Internal notes for CRM and relationship tracking (visible only to admins)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Add notes about calls, conversations, preferences, follow-ups, etc."
              value={adminNotes}
              onChange={(e) => {
                setAdminNotes(e.target.value);
                setIsEditingNotes(true);
              }}
              rows={6}
              className="resize-none"
              data-testid="textarea-admin-notes"
            />
            {isEditingNotes && (
              <div className="flex gap-2">
                <Button
                  onClick={() => updateNotesMutation.mutate(adminNotes)}
                  disabled={updateNotesMutation.isPending}
                  data-testid="button-save-notes"
                >
                  {updateNotesMutation.isPending ? "Saving..." : "Save Notes"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAdminNotes(artist.adminNotes || "");
                    setIsEditingNotes(false);
                  }}
                  disabled={updateNotesMutation.isPending}
                  data-testid="button-cancel-notes"
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-destructive" data-testid="card-delete-account">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Artist Account
            </CardTitle>
            <CardDescription>
              Permanently disable this artist account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20" data-testid="text-delete-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-destructive">Warning: This action will:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Permanently disable the artist account</li>
                    <li>Prevent the artist from logging in or uploading artwork</li>
                    <li>Keep Shopify products available for purchase</li>
                    <li>Continue processing orders and earnings</li>
                  </ul>
                  <p className="text-destructive font-semibold">This action cannot be undone.</p>
                </div>
              </div>
            </div>

            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteArtistMutation.isPending}
              className="min-h-11"
              data-testid="button-delete-artist"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteArtistMutation.isPending ? "Deleting..." : "Delete Artist Account"}
            </Button>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Artist Account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently disable the account for <strong>{artist.name}</strong> ({artist.email}).
              <br /><br />
              This action cannot be undone. The artist will no longer be able to log in or upload artwork,
              but their Shopify products will remain available for purchase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteArtistMutation.mutate();
                setShowDeleteDialog(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
