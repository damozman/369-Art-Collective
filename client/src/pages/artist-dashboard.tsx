import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { Upload, LogOut, Image as ImageIcon, CheckCircle, Clock, XCircle, DollarSign, Users, Wallet, Settings, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Artwork } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function ArtistDashboard() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // No longer passing artistId in query - session handles it server-side
  const { data: artworks, isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks/my-artworks"],
  });

  const stats = {
    total: artworks?.length || 0,
    pending: artworks?.filter(a => a.status === "pending").length || 0,
    approved: artworks?.filter(a => a.status === "approved").length || 0,
    rejected: artworks?.filter(a => a.status === "rejected").length || 0,
  };

  const deactivateMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return await apiRequest("POST", `/api/artworks/${artworkId}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/my-artworks"] });
      toast({
        title: "Product deactivated",
        description: "Your product has been hidden from the storefront",
      });
      setActionInProgress(null);
    },
    onError: (error: any) => {
      toast({
        title: "Deactivation failed",
        description: error.message || "Failed to deactivate product",
        variant: "destructive",
      });
      setActionInProgress(null);
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return await apiRequest("POST", `/api/artworks/${artworkId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/my-artworks"] });
      toast({
        title: "Product activated",
        description: "Your product is now visible on the storefront",
      });
      setActionInProgress(null);
    },
    onError: (error: any) => {
      toast({
        title: "Activation failed",
        description: error.message || "Failed to activate product",
        variant: "destructive",
      });
      setActionInProgress(null);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid={`badge-status-approved`}><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "pending":
        return <Badge variant="secondary" data-testid={`badge-status-pending`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "rejected":
        return <Badge variant="destructive" data-testid={`badge-status-rejected`}><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const getProductStatusBadge = (shopifyProductStatus?: string | null) => {
    if (shopifyProductStatus === "active") {
      return <Badge variant="default" className="bg-blue-600 hover:bg-blue-700" data-testid="badge-product-active"><Eye className="w-3 h-3 mr-1" />Active</Badge>;
    } else if (shopifyProductStatus === "draft") {
      return <Badge variant="secondary" data-testid="badge-product-draft"><EyeOff className="w-3 h-3 mr-1" />Hidden</Badge>;
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Artist Portal</h1>
                <p className="text-sm text-muted-foreground">Welcome back, {user?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/artist/settings")} data-testid="button-settings">
                <Settings className="h-5 w-5" />
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
        <div className="mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold font-serif mb-2">My Artwork</h2>
              <p className="text-muted-foreground">Manage your submissions and track their status</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation("/artist/referrals")} data-testid="button-referrals">
                <Users className="mr-2 h-4 w-4" />
                Referrals
              </Button>
              <Button variant="outline" onClick={() => setLocation("/artist/earnings")} data-testid="button-earnings">
                <DollarSign className="mr-2 h-4 w-4" />
                Earnings
              </Button>
              <Button variant="outline" onClick={() => setLocation("/artist/payouts")} data-testid="button-payouts">
                <Wallet className="mr-2 h-4 w-4" />
                Payouts
              </Button>
              <Button onClick={() => setLocation("/artist/upload")} data-testid="button-upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload Artwork
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Total Submissions</CardDescription>
                <CardTitle className="text-3xl" data-testid="text-total">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Pending Review</CardDescription>
                <CardTitle className="text-3xl text-yellow-600" data-testid="text-pending">{stats.pending}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Approved</CardDescription>
                <CardTitle className="text-3xl text-green-600" data-testid="text-approved">{stats.approved}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Rejected</CardDescription>
                <CardTitle className="text-3xl text-red-600" data-testid="text-rejected">{stats.rejected}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <Skeleton className="h-48 rounded-t-xl" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : artworks && artworks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworks.map((artwork) => (
              <Card key={artwork.id} className="overflow-hidden hover-elevate" data-testid={`card-artwork-${artwork.id}`}>
                <div className="aspect-square relative bg-muted">
                  <img
                    src={artwork.imageUrl}
                    alt={artwork.title}
                    className="w-full h-full object-cover"
                    data-testid={`img-artwork-${artwork.id}`}
                  />
                </div>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg mb-1" data-testid={`text-title-${artwork.id}`}>{artwork.title}</h3>
                      {artwork.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${artwork.id}`}>
                          {artwork.description}
                        </p>
                      )}
                    </div>

                    {artwork.tags && artwork.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {artwork.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs" data-testid={`tag-${artwork.id}-${idx}`}>
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      {getStatusBadge(artwork.status)}
                      <p className="text-xs text-muted-foreground" data-testid={`date-${artwork.id}`}>
                        {new Date(artwork.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {artwork.status === "approved" && artwork.shopifyProductId && (
                      <div className="mt-3 pt-3 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Store Visibility:</span>
                          {getProductStatusBadge(artwork.shopifyProductStatus)}
                        </div>

                        {artwork.shopifyProductStatus === "active" ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full"
                                disabled={actionInProgress === artwork.id}
                                data-testid={`button-deactivate-${artwork.id}`}
                              >
                                <EyeOff className="mr-2 h-4 w-4" />
                                Hide from Store
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Hide product from store?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will hide "{artwork.title}" from your storefront. Customers won't be able to see or purchase it. You can reactivate it anytime.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    setActionInProgress(artwork.id);
                                    deactivateMutation.mutate(artwork.id);
                                  }}
                                  data-testid="button-confirm-deactivate"
                                >
                                  Hide Product
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="w-full"
                                disabled={actionInProgress === artwork.id}
                                data-testid={`button-activate-${artwork.id}`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                Show in Store
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Show product in store?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will make "{artwork.title}" visible on your storefront. Customers will be able to see and purchase it.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-activate">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    setActionInProgress(artwork.id);
                                    activateMutation.mutate(artwork.id);
                                  }}
                                  data-testid="button-confirm-activate"
                                >
                                  Show Product
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    )}

                    {artwork.status === "rejected" && artwork.rejectionReason && (
                      <div className="mt-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                        <p className="text-xs font-medium text-destructive mb-1">Rejection Reason:</p>
                        <p className="text-xs text-muted-foreground" data-testid={`rejection-reason-${artwork.id}`}>
                          {artwork.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">No artwork yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start by uploading your first piece of artwork
                </p>
                <Button onClick={() => setLocation("/artist/upload")} data-testid="button-upload-empty">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Your First Artwork
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
