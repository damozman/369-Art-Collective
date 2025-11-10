import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, CheckCircle, XCircle, Eye, Sparkles } from "lucide-react";
import type { Influencer } from "@shared/schema";

type InfluencerWithStats = Influencer & {
  stats?: {
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalEarnings: string;
    pendingEarnings: string;
    monthlySalesCount: number;
    currentTier: string;
  };
};

export default function AdminInfluencers() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerWithStats | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch influencers with filters
  const { data: influencers = [], isLoading } = useQuery<Influencer[]>({
    queryKey: ["/api/admin/influencers", statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (search) {
        params.append("search", search);
      }
      const url = `/api/admin/influencers${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch influencers");
      return response.json();
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/influencers/${id}/approve`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      toast({
        title: "Influencer Approved",
        description: "The influencer has been activated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/admin/influencers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/influencers"] });
      toast({
        title: "Status Updated",
        description: "Influencer status has been changed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // View details - fetch full influencer with stats
  const viewDetails = async (influencer: Influencer) => {
    try {
      const response = await fetch(`/api/admin/influencers/${influencer.id}`, {
        credentials: "include",
      });
      const data = await response.json();
      setSelectedInfluencer(data);
      setDetailsOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load influencer details",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "bg-yellow-600",
      active: "bg-green-600",
      suspended: "bg-red-600",
    };
    return (
      <Badge className={variants[status as keyof typeof variants] || "bg-gray-600"}>
        {status}
      </Badge>
    );
  };

  const getTierBadge = (tier: string) => {
    const colors = {
      bronze: "bg-orange-600",
      silver: "bg-slate-400",
      gold: "bg-yellow-500",
      platinum: "bg-blue-500",
      elite: "bg-purple-600",
    };
    return (
      <Badge className={colors[tier as keyof typeof colors] || "bg-gray-600"}>
        {tier}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            Influencer Management
          </h1>
          <p className="text-muted-foreground">
            Review applications, approve influencers, and track performance
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">
              {influencers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {influencers.filter(i => i.status === "pending").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-count">
              {influencers.filter(i => i.status === "active").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-suspended-count">
              {influencers.filter(i => i.status === "suspended").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Affiliate Code</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {influencers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No influencers found
                  </TableCell>
                </TableRow>
              ) : (
                influencers.map((influencer) => (
                  <TableRow key={influencer.id} data-testid={`row-influencer-${influencer.id}`}>
                    <TableCell className="font-medium">{influencer.name}</TableCell>
                    <TableCell>{influencer.email}</TableCell>
                    <TableCell>{getStatusBadge(influencer.status)}</TableCell>
                    <TableCell>{getTierBadge(influencer.currentTier)}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {influencer.affiliateCode}
                      </code>
                    </TableCell>
                    <TableCell>
                      {new Date(influencer.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {influencer.status === "pending" && (
                          <Button
                            data-testid={`button-approve-${influencer.id}`}
                            size="sm"
                            onClick={() => approveMutation.mutate(influencer.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        )}
                        {influencer.status === "active" && (
                          <Button
                            data-testid={`button-suspend-${influencer.id}`}
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: influencer.id,
                                status: "suspended",
                              })
                            }
                            disabled={updateStatusMutation.isPending}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Suspend
                          </Button>
                        )}
                        <Button
                          data-testid={`button-view-${influencer.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => viewDetails(influencer)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Influencer Details</DialogTitle>
            <DialogDescription>
              View performance stats and application details
            </DialogDescription>
          </DialogHeader>
          {selectedInfluencer && (
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Name</p>
                  <p className="text-sm text-muted-foreground">{selectedInfluencer.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">{selectedInfluencer.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  {getStatusBadge(selectedInfluencer.status)}
                </div>
                <div>
                  <p className="text-sm font-medium">Tier</p>
                  {getTierBadge(selectedInfluencer.currentTier)}
                </div>
              </div>

              {/* Performance Stats */}
              {selectedInfluencer.stats && (
                <div>
                  <h3 className="font-semibold mb-2">Performance</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Clicks</p>
                      <p className="text-lg font-bold">{selectedInfluencer.stats.totalClicks}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Conversions</p>
                      <p className="text-lg font-bold">{selectedInfluencer.stats.totalConversions}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Earnings</p>
                      <p className="text-lg font-bold">
                        ${parseFloat(selectedInfluencer.stats.totalEarnings).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Application Details */}
              <div>
                <h3 className="font-semibold mb-2">Application</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="font-medium">Audience</p>
                    <p className="text-muted-foreground">{selectedInfluencer.audience}</p>
                  </div>
                  <div>
                    <p className="font-medium">Niche</p>
                    <p className="text-muted-foreground">{selectedInfluencer.niche}</p>
                  </div>
                  <div>
                    <p className="font-medium">Motivation</p>
                    <p className="text-muted-foreground">{selectedInfluencer.motivation}</p>
                  </div>
                  {selectedInfluencer.socialHandles && (
                    <div>
                      <p className="font-medium">Social Handles</p>
                      <div className="text-muted-foreground">
                        {Object.entries(selectedInfluencer.socialHandles)
                          .filter(([_, value]) => value)
                          .map(([platform, handle]) => (
                            <div key={platform}>
                              {platform}: {handle}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
