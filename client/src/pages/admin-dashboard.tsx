import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { LogOut, CheckCircle, XCircle, Users, Eye, Network } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ArtworkWithArtist } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkWithArtist | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const { data: artworks, isLoading } = useQuery<ArtworkWithArtist[]>({
    queryKey: ["/api/artworks/all"],
  });

  const filteredArtworks = artworks?.filter(a => 
    statusFilter === "all" ? true : a.status === statusFilter
  );

  const stats = {
    total: artworks?.length || 0,
    pending: artworks?.filter(a => a.status === "pending").length || 0,
    approved: artworks?.filter(a => a.status === "approved").length || 0,
    rejected: artworks?.filter(a => a.status === "rejected").length || 0,
  };

  const approveMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return apiRequest("POST", `/api/artworks/${artworkId}/approve`, {});
    },
    onSuccess: (_, artworkId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
      toast({
        title: "Artwork approved",
        description: "Draft product created in Shopify",
      });
      setSelectedArtwork(null);
    },
    onError: (error: any) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ artworkId, reason }: { artworkId: string; reason: string }) => {
      return apiRequest("POST", `/api/artworks/${artworkId}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
      toast({
        title: "Artwork rejected",
        description: "Artist will be notified",
      });
      setSelectedArtwork(null);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Rejection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleApprove = (artwork: ArtworkWithArtist) => {
    approveMutation.mutate(artwork.id);
  };

  const handleReject = (artwork: ArtworkWithArtist) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }
    rejectMutation.mutate({ artworkId: artwork.id, reason: rejectionReason });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending Review</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold font-serif">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Review and manage artwork submissions</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/empire")}
                data-testid="button-empire"
              >
                <Network className="mr-2 h-4 w-4" />
                Empire Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/artists")}
                data-testid="button-manage-artists"
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Artists
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="hover-elevate cursor-pointer" onClick={() => setStatusFilter("all")}>
            <CardHeader className="p-4">
              <CardDescription>Total Submissions</CardDescription>
              <CardTitle className="text-3xl" data-testid="text-total">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => setStatusFilter("pending")}>
            <CardHeader className="p-4">
              <CardDescription>Pending Review</CardDescription>
              <CardTitle className="text-3xl text-yellow-600" data-testid="text-pending">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => setStatusFilter("approved")}>
            <CardHeader className="p-4">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-3xl text-green-600" data-testid="text-approved">{stats.approved}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => setStatusFilter("rejected")}>
            <CardHeader className="p-4">
              <CardDescription>Rejected</CardDescription>
              <CardTitle className="text-3xl text-red-600" data-testid="text-rejected">{stats.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <Skeleton className="h-48 rounded-t-xl" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredArtworks && filteredArtworks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArtworks.map((artwork) => (
              <Card key={artwork.id} className="overflow-hidden" data-testid={`card-artwork-${artwork.id}`}>
                <div className="aspect-square relative bg-muted">
                  <img
                    src={artwork.imageUrl}
                    alt={artwork.title}
                    className="w-full h-full object-cover"
                    data-testid={`img-artwork-${artwork.id}`}
                  />
                </div>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-1" data-testid={`text-title-${artwork.id}`}>{artwork.title}</h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-artist-${artwork.id}`}>
                      by {artwork.artist.name}
                    </p>
                    {artwork.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {artwork.description}
                      </p>
                    )}
                  </div>

                  {artwork.tags && artwork.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {artwork.tags.slice(0, 3).map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="pt-2">
                    {getStatusBadge(artwork.status)}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedArtwork(artwork)}
                      data-testid={`button-view-${artwork.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    {artwork.status === "pending" && (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 flex-1"
                          onClick={() => handleApprove(artwork)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${artwork.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12">
            <div className="text-center">
              <p className="text-muted-foreground">No {statusFilter !== "all" ? statusFilter : ""} artworks found</p>
            </div>
          </Card>
        )}
      </main>

      <Dialog open={!!selectedArtwork} onOpenChange={(open) => !open && setSelectedArtwork(null)}>
        <DialogContent className="max-w-3xl">
          {selectedArtwork && (
            <>
              <DialogHeader>
                <DialogTitle data-testid="dialog-title">{selectedArtwork.title}</DialogTitle>
                <DialogDescription data-testid="dialog-artist">
                  by {selectedArtwork.artist.name} ({selectedArtwork.artist.email})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <img
                  src={selectedArtwork.imageUrl}
                  alt={selectedArtwork.title}
                  className="w-full h-auto max-h-96 object-contain rounded-lg bg-muted"
                  data-testid="dialog-img"
                />

                {selectedArtwork.description && (
                  <div>
                    <h4 className="font-medium mb-2">Description</h4>
                    <p className="text-sm text-muted-foreground" data-testid="dialog-description">{selectedArtwork.description}</p>
                  </div>
                )}

                {selectedArtwork.tags && selectedArtwork.tags.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedArtwork.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedArtwork.status === "pending" && (
                  <div>
                    <h4 className="font-medium mb-2">Rejection Reason (if rejecting)</h4>
                    <Textarea
                      placeholder="Provide a reason for rejection..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="min-h-24"
                      data-testid="input-rejection-reason"
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2">
                {selectedArtwork.status === "pending" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => handleReject(selectedArtwork)}
                      disabled={rejectMutation.isPending}
                      data-testid="button-reject"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedArtwork)}
                      disabled={approveMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="button-approve"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Create Shopify Product
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
