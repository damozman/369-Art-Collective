import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Eye, Flag, Search, ArrowUpDown, Zap, TrendingUp, DollarSign, Image, Ruler, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ArtworkWithArtist, Artist, ViolationReport } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminLayout } from "@/components/layouts/admin-layout";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkWithArtist | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [reason, setReason] = useState<"trademark" | "copyright" | "inappropriate" | "other">("trademark");
  const [notes, setNotes] = useState("");
  
  // Enhanced filtering & bulk selection state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "artist-az" | "artist-za">("newest");
  const [selectedArtworkIds, setSelectedArtworkIds] = useState<Set<string>>(new Set());
  const [showBulkRejectDialog, setShowBulkRejectDialog] = useState(false);
  const [bulkRejectionReason, setBulkRejectionReason] = useState("");

  const { data: artworks, isLoading } = useQuery<ArtworkWithArtist[]>({
    queryKey: ["/api/artworks/all"],
  });

  // Query for pending artists count
  const { data: artists } = useQuery<Artist[]>({
    queryKey: ["/api/admin/artists"],
  });

  // Query for violation reports of selected artwork
  const { data: violationReports } = useQuery<ViolationReport[]>({
    queryKey: ["/api/artworks", selectedArtwork?.id, "violations"],
    enabled: !!selectedArtwork,
  });

  // Query for detailed artwork metadata
  const { data: artworkDetails, isLoading: detailsLoading } = useQuery<{
    artwork: {
      id: string;
      title: string;
      imageUrl: string;
      shopifyProductId: string | null;
      status: string;
      createdAt: string;
    };
    dimensions: {
      width: number;
      height: number;
      megapixels: number;
    };
    upscaling: {
      usedUpscaling: boolean;
      originalDimensions?: { width: number; height: number };
      upscaledDimensions?: { width: number; height: number };
      scaleFactor?: number | null;
      status?: string;
      costCents?: number;
      quotaType?: string;
      tier?: string;
      createdAt?: string;
      completedAt?: string;
      errorMessage?: string;
    } | null;
    quality: {
      estimatedDpi: number;
      targetDpi: number;
      meetsMinimum: boolean;
      meetsTarget: boolean;
      qualityLevel?: string;
      recommendation: string;
      message: string;
      orientation?: string;
    };
    variants: {
      totalQualified: number;
      totalVariants: number;
      byFinish: {
        paper: number;
        canvas: number;
        framed: number;
        metal: number;
      };
      qualified: Array<{
        key: string;
        name: string;
        widthInches: number;
        heightInches: number;
      }>;
    };
  }>({
    queryKey: ["/api/artworks", selectedArtwork?.id, "details"],
    enabled: !!selectedArtwork,
  });

  // Query for AI upscale analytics
  const { data: upscaleAnalytics, isLoading: upscaleLoading } = useQuery<{
    totalUpscales: number;
    completedUpscales: number;
    failedUpscales: number;
    totalCostDollars: number;
    byTier: { free: number; pro: number; elite: number };
    byQuotaType: { registration_bonus: number; monthly: number; elite_unlimited: number };
    costByTier: { free: number; pro: number; elite: number };
    cacheHits: number;
    cacheHitRate: number;
  }>({
    queryKey: ["/api/admin/analytics/upscales"],
  });

  const pendingArtistsCount = artists?.filter(a => !a.approved).length || 0;

  // Service health check
  const { data: healthData } = useQuery<{ services: Record<string, { status: string; message?: string }> }>({
    queryKey: ["/api/health"],
    refetchInterval: 60000, // re-check every minute
  });

  // Enhanced filtering with search and sorting
  const filteredArtworks = useMemo(() => {
    if (!artworks) return [];
    
    let filtered = artworks.filter(a => 
      statusFilter === "all" ? true : a.status === statusFilter
    );

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(query) ||
        a.artist.name.toLowerCase().includes(query) ||
        a.artist.email.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "oldest":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case "artist-az":
          return a.artist.name.localeCompare(b.artist.name);
        case "artist-za":
          return b.artist.name.localeCompare(a.artist.name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [artworks, statusFilter, searchQuery, sortBy]);

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

  const flagMutation = useMutation({
    mutationFn: async ({ artworkId, reason, notes }: { artworkId: string; reason: string; notes: string }) => {
      return apiRequest("POST", `/api/artworks/${artworkId}/flag`, { reason, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks", selectedArtwork?.id, "violations"] });
      toast({
        title: "Artwork flagged",
        description: "IP violation report created",
      });
      setShowFlagDialog(false);
      setNotes("");
      setReason("trademark");
    },
    onError: (error: any) => {
      toast({
        title: "Flagging failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk operations mutations
  const bulkApproveMutation = useMutation({
    mutationFn: async (artworkIds: string[]) => {
      const res = await apiRequest("POST", "/api/artworks/bulk", { artworkIds, action: "approve" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
      toast({
        title: "Bulk approval complete",
        description: `${data.successCount} artworks approved, ${data.failureCount} failed`,
      });
      setSelectedArtworkIds(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Bulk approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ artworkIds, reason }: { artworkIds: string[]; reason: string }) => {
      const res = await apiRequest("POST", "/api/artworks/bulk", { artworkIds, action: "reject", reason });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
      toast({
        title: "Bulk rejection complete",
        description: `${data.successCount} artworks rejected, ${data.failureCount} failed`,
      });
      setSelectedArtworkIds(new Set());
      setShowBulkRejectDialog(false);
      setBulkRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Bulk rejection failed",
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

  const handleFlag = () => {
    if (!notes.trim()) {
      toast({
        title: "Description required",
        description: "Please describe the suspected violation",
        variant: "destructive",
      });
      return;
    }
    if (!selectedArtwork) return;
    flagMutation.mutate({
      artworkId: selectedArtwork.id,
      reason,
      notes,
    });
  };

  // Selection management helpers
  const toggleSelectArtwork = (artworkId: string) => {
    const newSelected = new Set(selectedArtworkIds);
    if (newSelected.has(artworkId)) {
      newSelected.delete(artworkId);
    } else {
      newSelected.add(artworkId);
    }
    setSelectedArtworkIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedArtworkIds.size === filteredArtworks.length) {
      setSelectedArtworkIds(new Set());
    } else {
      setSelectedArtworkIds(new Set(filteredArtworks.map(a => a.id)));
    }
  };

  const handleBulkApprove = () => {
    if (selectedArtworkIds.size === 0) return;
    bulkApproveMutation.mutate(Array.from(selectedArtworkIds));
  };

  const handleBulkReject = () => {
    if (!bulkRejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please provide a reason for bulk rejection",
        variant: "destructive",
      });
      return;
    }
    bulkRejectMutation.mutate({
      artworkIds: Array.from(selectedArtworkIds),
      reason: bulkRejectionReason,
    });
  };

  // Reset selection when filters change
  const handleFilterChange = (filter: "all" | "pending" | "approved" | "rejected") => {
    setStatusFilter(filter);
    setSelectedArtworkIds(new Set());
  };

  // Clear selection when search or sort changes
  useEffect(() => {
    setSelectedArtworkIds(new Set());
  }, [searchQuery, sortBy]);

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
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Service Health */}
        {healthData?.services && (
          <Card className="mb-6">
            <CardHeader className="p-4 pb-2">
              <CardDescription>Connected Services</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex flex-wrap gap-2">
              {Object.entries(healthData.services).map(([name, info]) => {
                const isOk = info.status === "healthy" || info.status === "configured";
                const isWarn = info.status === "not_configured";
                return (
                  <Badge
                    key={name}
                    className={
                      isOk ? "bg-green-600 hover:bg-green-700" :
                      isWarn ? "bg-yellow-600 hover:bg-yellow-700" :
                      "bg-red-600 hover:bg-red-700"
                    }
                    title={info.message}
                  >
                    {isOk ? "✓" : isWarn ? "–" : "✗"} {name}
                  </Badge>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Artwork Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="hover-elevate cursor-pointer" onClick={() => handleFilterChange("all")}>
            <CardHeader className="p-4">
              <CardDescription>Total Submissions</CardDescription>
              <CardTitle className="text-3xl" data-testid="text-total">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => handleFilterChange("pending")}>
            <CardHeader className="p-4">
              <CardDescription>Pending Review</CardDescription>
              <CardTitle className="text-3xl text-yellow-600" data-testid="text-pending">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => handleFilterChange("approved")}>
            <CardHeader className="p-4">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-3xl text-green-600" data-testid="text-approved">{stats.approved}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="hover-elevate cursor-pointer" onClick={() => handleFilterChange("rejected")}>
            <CardHeader className="p-4">
              <CardDescription>Rejected</CardDescription>
              <CardTitle className="text-3xl text-red-600" data-testid="text-rejected">{stats.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* AI Upscale Analytics */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">AI Upscale Analytics</h2>
          </div>
          {upscaleLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardHeader className="p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : upscaleAnalytics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription>Total Upscales</CardDescription>
                    <CardTitle className="text-3xl" data-testid="text-total-upscales">{upscaleAnalytics.totalUpscales}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription>Completed</CardDescription>
                    <CardTitle className="text-3xl text-green-600" data-testid="text-completed-upscales">{upscaleAnalytics.completedUpscales}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription>Total Cost</CardDescription>
                    <CardTitle className="text-3xl text-primary" data-testid="text-total-cost">${upscaleAnalytics.totalCostDollars.toFixed(2)}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription>Cache Hit Rate</CardDescription>
                    <CardTitle className="text-3xl text-blue-600" data-testid="text-cache-rate">{upscaleAnalytics.cacheHitRate}%</CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Usage by Tier
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Free:</span>
                        <span className="font-medium">{upscaleAnalytics.byTier.free} upscales (${upscaleAnalytics.costByTier.free.toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pro:</span>
                        <span className="font-medium">{upscaleAnalytics.byTier.pro} upscales (${upscaleAnalytics.costByTier.pro.toFixed(2)})</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Elite:</span>
                        <span className="font-medium">{upscaleAnalytics.byTier.elite} upscales (${upscaleAnalytics.costByTier.elite.toFixed(2)})</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="p-4">
                    <CardDescription className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Usage by Quota Type
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Registration Bonus:</span>
                        <span className="font-medium">{upscaleAnalytics.byQuotaType.registration_bonus}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Monthly:</span>
                        <span className="font-medium">{upscaleAnalytics.byQuotaType.monthly}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Elite Unlimited:</span>
                        <span className="font-medium">{upscaleAnalytics.byQuotaType.elite_unlimited}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardHeader className="p-4">
                <CardDescription>No upscale usage data available</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>

        {/* Search and Sort Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by artwork title, artist name, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-artworks"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-full sm:w-48" data-testid="select-sort">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" data-testid="sort-newest">Newest First</SelectItem>
              <SelectItem value="oldest" data-testid="sort-oldest">Oldest First</SelectItem>
              <SelectItem value="artist-az" data-testid="sort-artist-az">Artist A-Z</SelectItem>
              <SelectItem value="artist-za" data-testid="sort-artist-za">Artist Z-A</SelectItem>
            </SelectContent>
          </Select>
          {filteredArtworks && filteredArtworks.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={selectedArtworkIds.size === filteredArtworks.length && filteredArtworks.length > 0}
                onCheckedChange={toggleSelectAll}
                data-testid="checkbox-select-all"
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select All ({filteredArtworks.length})
              </label>
            </div>
          )}
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => handleFilterChange(v as any)} className="mb-6">
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
              <Card key={artwork.id} className="overflow-hidden relative" data-testid={`card-artwork-${artwork.id}`}>
                {/* Selection checkbox */}
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedArtworkIds.has(artwork.id)}
                    onCheckedChange={() => toggleSelectArtwork(artwork.id)}
                    className="bg-white border-2"
                    data-testid={`checkbox-artwork-${artwork.id}`}
                  />
                </div>
                <div className="h-48 relative bg-muted">
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

        {/* Bulk Action Bar - Fixed at bottom when items selected */}
        {selectedArtworkIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <p className="font-medium" data-testid="text-selected-count">
                    {selectedArtworkIds.size} artwork{selectedArtworkIds.size !== 1 ? 's' : ''} selected
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedArtworkIds(new Set())}
                    data-testid="button-clear-selection"
                  >
                    Clear Selection
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleBulkApprove}
                    disabled={bulkApproveMutation.isPending}
                    data-testid="button-bulk-approve"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Selected ({selectedArtworkIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowBulkRejectDialog(true)}
                    disabled={bulkRejectMutation.isPending}
                    data-testid="button-bulk-reject"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject Selected ({selectedArtworkIds.size})
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedArtwork} onOpenChange={(open) => !open && setSelectedArtwork(null)}>
        <DialogContent className="max-w-3xl sm:max-w-4xl w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] overflow-hidden p-0">
          {selectedArtwork && (
            <div className="flex h-full flex-col">
              <DialogHeader className="px-6 pt-6 pb-4 border-b">
                <DialogTitle data-testid="dialog-title">{selectedArtwork.title}</DialogTitle>
                <DialogDescription data-testid="dialog-artist">
                  by {selectedArtwork.artist.name} ({selectedArtwork.artist.email})
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                <img
                  src={selectedArtwork.imageUrl}
                  alt={selectedArtwork.title}
                  className="w-full h-auto max-h-64 sm:max-h-72 object-contain rounded-lg bg-muted"
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

                {selectedArtwork.artworkStory && (
                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-md">
                    <h4 className="font-medium mb-2 text-blue-900 dark:text-blue-100">Artwork Story</h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200" data-testid="dialog-artwork-story">
                      {selectedArtwork.artworkStory}
                    </p>
                  </div>
                )}

                {selectedArtwork.styleTags && selectedArtwork.styleTags.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Style Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedArtwork.styleTags.map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100" data-testid={`badge-style-${idx}`}>
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedArtwork.suggestedUse && (
                  <div>
                    <h4 className="font-medium mb-2">Suggested Use</h4>
                    <p className="text-sm text-muted-foreground" data-testid="dialog-suggested-use">
                      {selectedArtwork.suggestedUse}
                    </p>
                  </div>
                )}

                {/* Image Quality & Variant Qualification Details */}
                {detailsLoading ? (
                  <Card className="border-2" data-testid="card-details-loading">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Image className="w-5 h-5" />
                        Image Quality & Variants
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ) : artworkDetails ? (
                  <Card className="border-2 border-primary/20 bg-primary/5" data-testid="card-artwork-details">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Image className="w-5 h-5" />
                        Image Quality & Variants
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Dimensions */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h5 className="text-sm font-medium mb-1 flex items-center gap-1">
                            <Ruler className="w-4 h-4" />
                            Dimensions
                          </h5>
                          <p className="text-sm text-muted-foreground" data-testid="text-dimensions">
                            {artworkDetails.dimensions.width} × {artworkDetails.dimensions.height} px
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {artworkDetails.dimensions.megapixels} MP
                          </p>
                        </div>
                        <div>
                          <h5 className="text-sm font-medium mb-1">Quality</h5>
                          <p className="text-sm text-muted-foreground" data-testid="text-dpi">
                            ~{artworkDetails.quality.estimatedDpi} DPI
                          </p>
                          <Badge 
                            variant={
                              artworkDetails.quality.qualityLevel === 'excellent' ? 'default' :
                              artworkDetails.quality.qualityLevel === 'good' ? 'secondary' : 
                              'outline'
                            }
                            className="mt-1"
                            data-testid="badge-quality-level"
                          >
                            {artworkDetails.quality.qualityLevel || artworkDetails.quality.recommendation}
                          </Badge>
                        </div>
                      </div>

                      {/* Upscaling Info */}
                      {artworkDetails.upscaling && (
                        <div className={`p-3 rounded-md border ${
                          artworkDetails.upscaling.usedUpscaling 
                            ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' 
                            : 'bg-muted/50 border-border'
                        }`}>
                          <h5 className="text-sm font-medium mb-1 flex items-center gap-1">
                            <Zap className="w-4 h-4" />
                            AI Upscaling
                          </h5>
                          {artworkDetails.upscaling.usedUpscaling ? (
                            <div className="space-y-1">
                              <p className="text-sm text-blue-900 dark:text-blue-100 font-medium" data-testid="text-upscaling-used">
                                ✓ AI upscaling was used
                              </p>
                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                Original: {artworkDetails.upscaling.originalDimensions?.width} × {artworkDetails.upscaling.originalDimensions?.height} px
                              </p>
                              <p className="text-xs text-blue-800 dark:text-blue-200">
                                Upscaled: {artworkDetails.upscaling.upscaledDimensions?.width} × {artworkDetails.upscaling.upscaledDimensions?.height} px
                              </p>
                              {artworkDetails.upscaling.scaleFactor && (
                                <Badge variant="outline" className="mt-1 border-blue-500 text-blue-700 dark:text-blue-300">
                                  {artworkDetails.upscaling.scaleFactor}x scale
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid="text-no-upscaling">
                              No AI upscaling used
                            </p>
                          )}
                        </div>
                      )}

                      {/* Variant Qualification */}
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium flex items-center gap-1">
                          <Layers className="w-4 h-4" />
                          Product Variants ({artworkDetails.variants.totalQualified}/{artworkDetails.variants.totalVariants})
                        </h5>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="text-center p-2 bg-muted/30 rounded">
                            <p className="text-xs text-muted-foreground mb-1">Paper</p>
                            <p className="text-lg font-semibold" data-testid="text-paper-count">
                              {artworkDetails.variants.byFinish.paper}
                            </p>
                          </div>
                          <div className="text-center p-2 bg-muted/30 rounded">
                            <p className="text-xs text-muted-foreground mb-1">Canvas</p>
                            <p className="text-lg font-semibold" data-testid="text-canvas-count">
                              {artworkDetails.variants.byFinish.canvas}
                            </p>
                          </div>
                          <div className="text-center p-2 bg-muted/30 rounded">
                            <p className="text-xs text-muted-foreground mb-1">Framed</p>
                            <p className="text-lg font-semibold" data-testid="text-framed-count">
                              {artworkDetails.variants.byFinish.framed}
                            </p>
                          </div>
                          <div className="text-center p-2 bg-muted/30 rounded">
                            <p className="text-xs text-muted-foreground mb-1">Metal</p>
                            <p className="text-lg font-semibold" data-testid="text-metal-count">
                              {artworkDetails.variants.byFinish.metal}
                            </p>
                          </div>
                        </div>
                        {artworkDetails.variants.byFinish.metal === 0 && (
                          <p className="text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 p-2 rounded" data-testid="text-metal-explanation">
                            ⚠️ Metal prints require 180+ DPI. This image qualifies for {artworkDetails.variants.byFinish.paper + artworkDetails.variants.byFinish.canvas + artworkDetails.variants.byFinish.framed} Paper/Canvas/Framed variants only.
                          </p>
                        )}
                      </div>

                      {/* Quality Message */}
                      <div className="bg-muted/50 p-3 rounded-md border border-border">
                        <p className="text-xs text-muted-foreground" data-testid="text-quality-message">
                          {artworkDetails.quality.message}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {selectedArtwork.seoSlug && (
                  <div className="bg-muted/30 p-3 rounded-md border border-border">
                    <h4 className="font-medium mb-1 text-sm">SEO Slug</h4>
                    <code className="text-xs text-muted-foreground font-mono" data-testid="dialog-seo-slug">
                      {selectedArtwork.seoSlug}
                    </code>
                  </div>
                )}

                {selectedArtwork.ipDeclarationAccepted && (
                  <div className="bg-muted/50 p-3 rounded-md">
                    <h4 className="font-medium mb-1 text-sm">IP Declaration</h4>
                    <p className="text-xs text-muted-foreground">{selectedArtwork.ipDeclarationText}</p>
                  </div>
                )}

                {violationReports && violationReports.length > 0 && (
                  <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4 rounded-md">
                    <h4 className="font-medium mb-2 text-red-800 dark:text-red-200 flex items-center gap-2">
                      <Flag className="w-4 h-4" />
                      Violation Reports ({violationReports.length})
                    </h4>
                    <div className="space-y-3">
                      {violationReports.map((report, idx) => (
                        <div key={idx} className="bg-background p-3 rounded border border-border">
                          <div className="flex justify-between items-start mb-2">
                            <Badge variant={report.status === "resolved" ? "outline" : "destructive"}>
                              {report.reason.charAt(0).toUpperCase() + report.reason.slice(1)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(report.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          {report.notes && <p className="text-sm text-muted-foreground">{report.notes}</p>}
                          {report.status === "resolved" && report.resolvedAt && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Resolved on {new Date(report.resolvedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
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

              <DialogFooter className="px-6 py-4 border-t bg-background/95">
                <div className="flex justify-between w-full">
                  <Button
                    variant="outline"
                    onClick={() => setShowFlagDialog(true)}
                    data-testid="button-flag-violation"
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    Flag for IP Violation
                  </Button>
                  {selectedArtwork.status === "pending" && (
                    <div className="flex gap-2">
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
                    </div>
                  )}
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showFlagDialog} onOpenChange={setShowFlagDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flag Artwork for IP Violation</AlertDialogTitle>
            <AlertDialogDescription>
              Report a suspected trademark, copyright, or other intellectual property violation.
              This creates an internal record for investigation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Violation Type</label>
              <Select value={reason} onValueChange={(value: any) => setReason(value)}>
                <SelectTrigger data-testid="select-violation-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trademark">Trademark Violation</SelectItem>
                  <SelectItem value="copyright">Copyright Violation</SelectItem>
                  <SelectItem value="inappropriate">Inappropriate Content</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Describe the suspected violation (e.g., 'Contains Nike swoosh logo', 'Unauthorized use of Disney character')..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-32"
                data-testid="input-violation-description"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-flag">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFlag}
              disabled={flagMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-submit-flag"
            >
              <Flag className="w-4 h-4 mr-2" />
              Submit Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Rejection Confirmation Dialog */}
      <Dialog open={showBulkRejectDialog} onOpenChange={setShowBulkRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Selected Artworks</DialogTitle>
            <DialogDescription>
              You are about to reject {selectedArtworkIds.size} artwork{selectedArtworkIds.size !== 1 ? 's' : ''}.
              Please provide a reason that will be sent to the artists.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rejection Reason</label>
              <Textarea
                placeholder="Explain why these artworks are being rejected..."
                value={bulkRejectionReason}
                onChange={(e) => setBulkRejectionReason(e.target.value)}
                className="min-h-32"
                data-testid="input-bulk-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkRejectDialog(false)}
              data-testid="button-cancel-bulk-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkReject}
              disabled={bulkRejectMutation.isPending || !bulkRejectionReason.trim()}
              data-testid="button-confirm-bulk-reject"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject {selectedArtworkIds.size} Artwork{selectedArtworkIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
