import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { Upload, CheckCircle, Clock, XCircle, DollarSign, Users, Wallet, Eye, EyeOff, Crown, Sparkles, ExternalLink, BarChart3, Archive, RefreshCw, Zap, TrendingUp, Settings, Image as ImageIcon } from "lucide-react";
import { useSubscriptionStatus, getTrialStatusText, type SubscriptionStatus } from "@/hooks/use-subscription-status";
import type { Artwork } from "@shared/schema";
import { ArtistLayout } from "@/components/layouts/artist-layout";
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

// Subscription Tier Card Component
function SubscriptionTierCard({ 
  subscription, 
  isLoading,
  artworkCount
}: { 
  subscription: SubscriptionStatus | null;
  isLoading: boolean;
  artworkCount: number;
}) {
  const [, setLocation] = useLocation();
  
  if (isLoading) {
    return (
      <Card className="mb-8" data-testid="card-subscription-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const tier = subscription?.tier || "free";
  const tierName = tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Elite";
  const tierColor = tier === "free" ? "secondary" : tier === "pro" ? "default" : "default";
  const royaltyRate = tier === "free" ? "30%" : tier === "pro" ? "35% minimum" : "45% guaranteed";
  const FREE_TIER_LIMIT = 20;
  const remainingUploads = tier === "free" ? Math.max(0, FREE_TIER_LIMIT - artworkCount) : null;

  // Free tier
  if (tier === "free") {
    return (
      <Card className="mb-8 border-primary/20" data-testid="card-subscription-free">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Subscription: {tierName}</CardTitle>
            </div>
            <Badge variant={tierColor} data-testid="badge-tier-free">
              {tierName}
            </Badge>
          </div>
          <CardDescription>
            Upgrade to unlock unlimited uploads and premium features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Upload className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{remainingUploads}/{FREE_TIER_LIMIT} Uploads Left</p>
                  <p className="text-muted-foreground text-xs">Limited artwork</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{royaltyRate} Royalty</p>
                  <p className="text-muted-foreground text-xs">Base tier rate</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <XCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">No AI Tools</p>
                  <p className="text-muted-foreground text-xs">Upgrade to unlock</p>
                </div>
              </div>
            </div>
            <Button onClick={() => setLocation("/artist/settings")} className="w-full" data-testid="button-upgrade-subscription">
              <Crown className="mr-2 h-4 w-4" />
              Start Free Trial
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              14-day Pro trial or 7-day Elite trial • No charge until trial ends
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pro/Elite tier
  return (
    <Card className="mb-8 border-primary/40 bg-primary/5" data-testid={`card-subscription-${tier}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <CardTitle>Subscription: {tierName}</CardTitle>
          </div>
          {subscription?.isOnTrial ? (
            <Badge variant="default" className="bg-blue-600 dark:bg-blue-500" data-testid="badge-trial-status">
              Trial: {getTrialStatusText(subscription)}
            </Badge>
          ) : (
            <Badge variant={tierColor} className="bg-primary" data-testid={`badge-tier-${tier}`}>
              <Sparkles className="w-3 h-3 mr-1" />
              {tierName}
            </Badge>
          )}
        </div>
        <CardDescription>
          {subscription?.isOnTrial 
            ? `${tierName} trial active • Full access to all features`
            : tier === "pro" ? "Unlimited uploads and AI Art Studio access" : "Full access with guaranteed 45% royalty"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Artwork Limit</span>
            <span className="font-medium text-primary">Unlimited</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Royalty Rate</span>
            <span className="font-medium text-primary">{royaltyRate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Art Studio</span>
            <span className="font-medium text-primary flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Enabled
            </span>
          </div>
          {subscription?.isOnTrial && subscription?.trialEndDate ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trial Ends</span>
              <span className="font-medium">
                {subscription.trialEndDate.toLocaleDateString()}
              </span>
            </div>
          ) : subscription?.subscriptionPeriodEnd && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Renews</span>
              <span className="font-medium">
                {new Date(subscription.subscriptionPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="pt-2 border-t">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setLocation("/artist/settings")} 
              className="w-full"
              data-testid="button-manage-subscription"
            >
              <Settings className="mr-2 h-4 w-4" />
              Manage Subscription
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// AI Upscale Quota Widget Component
function QuotaWidget({ tier }: { tier: string }) {
  const [, setLocation] = useLocation();
  
  const { data: quotaData, isLoading } = useQuery<{
    hasQuota: boolean;
    quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
    remaining: number;
    total: number;
    tier: string;
    message: string;
    analytics: {
      lifetimeTotal: number;
      currentMonthUsed: number;
      totalCostCents: number;
      recentUpscales: any[];
    };
  }>({
    queryKey: ['/api/upscale/quota'],
  });

  if (isLoading) {
    return (
      <Card className="mb-8" data-testid="card-quota-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!quotaData) return null;

  const isUnlimited = quotaData.quotaType === 'elite_unlimited';
  const hasQuota = quotaData.total > 0;
  const percentageUsed = isUnlimited || !hasQuota ? 0 : ((quotaData.total - quotaData.remaining) / quotaData.total) * 100;
  const isLowQuota = hasQuota && !isUnlimited && percentageUsed >= 80;
  const isExhausted = hasQuota && !isUnlimited && quotaData.remaining === 0;
  const hasZeroQuota = !isUnlimited && !hasQuota;

  return (
    <Card className="mb-8" data-testid="card-quota">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <CardTitle>AI Image Upscaling</CardTitle>
          </div>
          {isUnlimited ? (
            <Badge variant="default" className="bg-primary" data-testid="badge-quota-unlimited">
              <Sparkles className="w-3 h-3 mr-1" />
              Unlimited
            </Badge>
          ) : (
            <Badge variant={isExhausted ? "destructive" : isLowQuota ? "secondary" : "outline"} data-testid="badge-quota-remaining">
              {quotaData.remaining} / {quotaData.total} remaining
            </Badge>
          )}
        </div>
        <CardDescription>
          {isUnlimited 
            ? "Enhance any image to professional print quality with priority processing"
            : "Boost low-resolution images to meet print quality standards"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {hasZeroQuota && (
            <div className="p-4 bg-muted/50 rounded-lg border border-muted">
              <p className="text-sm text-muted-foreground">
                No AI upscale quota assigned. Upgrade to start enhancing your images.
              </p>
            </div>
          )}

          {!isUnlimited && hasQuota && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quota Usage</span>
                <span className="font-medium">{Math.round(percentageUsed)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    isExhausted ? 'bg-destructive' : 
                    isLowQuota ? 'bg-yellow-500' : 
                    'bg-primary'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, percentageUsed))}%` }}
                  data-testid="progress-quota-usage"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {quotaData.quotaType === 'registration_bonus' && 'Using registration bonus credits'}
                {quotaData.quotaType === 'monthly' && 'Resets monthly on your subscription anniversary'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{quotaData.analytics?.lifetimeTotal || 0}</p>
                <p className="text-muted-foreground text-xs">Lifetime upscales</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{quotaData.analytics?.currentMonthUsed || 0}</p>
                <p className="text-muted-foreground text-xs">This month</p>
              </div>
            </div>
            {isUnlimited && (
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Priority Queue</p>
                  <p className="text-muted-foreground text-xs">Fastest processing</p>
                </div>
              </div>
            )}
          </div>

          {hasZeroQuota && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                AI upscaling is available with Pro or Elite subscriptions.
              </p>
              <Button onClick={() => setLocation("/artist/settings")} className="w-full" data-testid="button-upgrade-quota-zero">
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Get AI Upscales
              </Button>
            </div>
          )}

          {isExhausted && !hasZeroQuota && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                You've used all your AI upscales. Upgrade to continue enhancing images.
              </p>
              <Button onClick={() => setLocation("/artist/settings")} className="w-full" data-testid="button-upgrade-quota">
                <Crown className="mr-2 h-4 w-4" />
                Upgrade for More Upscales
              </Button>
            </div>
          )}

          {isLowQuota && !isExhausted && !hasZeroQuota && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                Running low on upscales. Upgrade for unlimited AI enhancements.
              </p>
              <Button variant="outline" onClick={() => setLocation("/artist/settings")} className="w-full" size="sm" data-testid="button-upgrade-quota-low">
                <Crown className="mr-2 h-4 w-4" />
                View Upgrade Options
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Featured Status Card Component
function FeaturedStatusCard({ 
  featuredStatus, 
  isLoading, 
  onUpgrade 
}: { 
  featuredStatus: { hasActiveSubscription: boolean; subscription: any | null } | undefined;
  isLoading: boolean;
  onUpgrade: () => void;
}) {
  if (isLoading) {
    return (
      <Card className="mb-8" data-testid="card-featured-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  // State 1: No active subscription - show upgrade CTA
  if (!featuredStatus?.hasActiveSubscription) {
    return (
      <Card className="mb-8 border-primary/20" data-testid="card-featured-upgrade">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <CardTitle>Boost Your Visibility</CardTitle>
          </div>
          <CardDescription>
            Get your testimonial featured on the homepage to drive more product sales
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Homepage Featuring</p>
                  <p className="text-muted-foreground text-xs">Stand out at the top</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Increase Sales</p>
                  <p className="text-muted-foreground text-xs">More visibility = more products</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Build Authority</p>
                  <p className="text-muted-foreground text-xs">Showcase your success</p>
                </div>
              </div>
            </div>
            <Button onClick={onUpgrade} className="w-full" data-testid="button-upgrade-featured">
              <Crown className="mr-2 h-4 w-4" />
              Get Featured - $99/month
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Requires an active testimonial. Cancel anytime.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sub = featuredStatus.subscription;
  const tier = sub?.featuredTier;

  // State 2: Premium subscription
  if (tier === "premium") {
    return (
      <Card className="mb-8 border-primary/40 bg-primary/5" data-testid="card-featured-premium">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <CardTitle>Featured Status: Active</CardTitle>
            </div>
            <Badge variant="default" className="bg-primary" data-testid="badge-tier-premium">
              <Sparkles className="w-3 h-3 mr-1" />Sponsored
            </Badge>
          </div>
          <CardDescription>
            Your testimonial is featured on the homepage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="font-medium">{new Date(sub.startDate).toLocaleDateString()}</span>
            </div>
            {sub.stripeSubscriptionStatus && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={sub.stripeSubscriptionStatus === "active" ? "default" : "secondary"} data-testid="badge-stripe-status">
                  {sub.stripeSubscriptionStatus}
                </Badge>
              </div>
            )}
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Your subscription renews monthly at $99. Manage your subscription in Stripe.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 3: Merit-based or admin override
  const isMerit = tier === "merit";
  const isAdmin = tier === "admin_override";
  
  return (
    <Card className="mb-8 border-green-500/40 bg-green-500/5" data-testid={`card-featured-${tier}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-green-600" />
            <CardTitle>Featured Status: Active</CardTitle>
          </div>
          <Badge variant="default" className="bg-green-600" data-testid={`badge-tier-${tier}`}>
            <Sparkles className="w-3 h-3 mr-1" />
            {isMerit ? "Top Earner" : "Admin Selected"}
          </Badge>
        </div>
        <CardDescription>
          {isMerit ? "Congratulations! You're in the top 5 earning artists this month." : "Your testimonial has been selected for featuring."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Active Until</span>
            <span className="font-medium">
              {sub.endDate ? new Date(sub.endDate).toLocaleDateString() : "Ongoing"}
            </span>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {isMerit ? "Keep up the great work! This status auto-renews monthly if you remain in the top 5." : "Contact admin for more information about your featured status."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArtistDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // No longer passing artistId in query - session handles it server-side
  const { data: artworks, isLoading } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks/my-artworks"],
  });

  const { data: archivedArtworks, isLoading: isLoadingArchived } = useQuery<Artwork[]>({
    queryKey: ["/api/artworks/my-archived"],
  });

  const { data: payoutData, isLoading: payoutLoading, isError: payoutError } = useQuery<{ payouts: any[]; unpaidEarnings: number; unpaidSalesCount: number }>({
    queryKey: ["/api/artists/payouts"],
  });

  const { subscriptionDetails: subscription, isLoading: subscriptionLoading } = useSubscriptionStatus();

  const { data: featuredStatus, isLoading: featuredLoading } = useQuery<{
    hasActiveSubscription: boolean;
    subscription: any | null;
  }>({
    queryKey: ["/api/artists/featured-status"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/stripe/create-featured-checkout");
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Checkout failed",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    },
  });

  const stats = {
    total: artworks?.length || 0,
    pending: artworks?.filter(a => a.status === "pending").length || 0,
    approved: artworks?.filter(a => a.status === "approved").length || 0,
    rejected: artworks?.filter(a => a.status === "rejected").length || 0,
    archived: archivedArtworks?.length || 0,
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

  const reactivateMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return await apiRequest("POST", `/api/artworks/${artworkId}/my-reactivate`);
    },
    onSuccess: () => {
      toast({
        title: "Artwork reactivated",
        description: "Your artwork has been returned to the active catalog and will be reviewed for marketplace listing. Consider refreshing your marketing materials to drive traffic.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/my-artworks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/my-archived"] });
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation failed",
        description: error.message || "Failed to reactivate artwork",
        variant: "destructive",
      });
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
    <ArtistLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold font-serif mb-2">My Artwork</h2>
              <p className="text-muted-foreground">Manage your submissions and track their status</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setLocation("/artist/analytics")} className="min-h-11" data-testid="button-analytics">
                <BarChart3 className="mr-2 h-4 w-4" />
                Analytics
              </Button>
              <Button variant="outline" onClick={() => setLocation("/artist/referrals")} className="min-h-11" data-testid="button-referrals">
                <Users className="mr-2 h-4 w-4" />
                Referrals
              </Button>
              <Button variant="outline" onClick={() => setLocation("/artist/earnings")} className="min-h-11" data-testid="button-earnings">
                <DollarSign className="mr-2 h-4 w-4" />
                Earnings
              </Button>
              <Button variant="outline" onClick={() => setLocation("/artist/payouts")} className="min-h-11" data-testid="button-payouts">
                <Wallet className="mr-2 h-4 w-4" />
                Payouts
              </Button>
              <Button onClick={() => setLocation("/artist/upload")} className="min-h-11" data-testid="button-upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload Artwork
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Total Submissions</CardDescription>
                {isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <CardTitle className="text-3xl" data-testid="text-total">{stats.total}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Pending Review</CardDescription>
                {isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <CardTitle className="text-3xl text-yellow-600" data-testid="text-pending">{stats.pending}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Approved</CardDescription>
                {isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <CardTitle className="text-3xl text-green-600" data-testid="text-approved">{stats.approved}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Rejected</CardDescription>
                {isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <CardTitle className="text-3xl text-red-600" data-testid="text-rejected">{stats.rejected}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Archived</CardDescription>
                {isLoading || isLoadingArchived ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <CardTitle className="text-3xl text-muted-foreground" data-testid="text-archived">{stats.archived}</CardTitle>
                )}
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="p-4">
                <CardDescription>Unpaid Earnings</CardDescription>
                {payoutLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : payoutError ? (
                  <CardTitle className="text-3xl text-destructive" data-testid="text-unpaid-earnings">
                    $0.00
                  </CardTitle>
                ) : (
                  <>
                    <CardTitle className="text-3xl text-primary" data-testid="text-unpaid-earnings">
                      ${payoutData?.unpaidEarnings?.toFixed(2) || '0.00'}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {payoutData?.unpaidSalesCount || 0} unpaid sales
                    </p>
                  </>
                )}
              </CardHeader>
            </Card>
          </div>

          {/* Subscription Tier Section */}
          <SubscriptionTierCard
            subscription={subscription}
            isLoading={subscriptionLoading}
            artworkCount={stats.total}
          />

          {/* AI Upscale Quota Section */}
          <QuotaWidget tier={subscription?.tier || "free"} />

          {/* Featured Status Section */}
          <FeaturedStatusCard
            featuredStatus={featuredStatus}
            isLoading={featuredLoading}
            onUpgrade={() => checkoutMutation.mutate()}
          />
        </div>

        <Tabs defaultValue="active" className="mt-8">
          <TabsList>
            <TabsTrigger value="active" data-testid="tab-active">Active Artworks</TabsTrigger>
            <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
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
          </TabsContent>

          <TabsContent value="archived" className="mt-6">
            {isLoadingArchived ? (
              <div className="flex justify-center items-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : !archivedArtworks || archivedArtworks.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Archive className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No archived artworks</h3>
                  <p className="text-muted-foreground">
                    Artworks that haven't sold in 18 months will be automatically archived
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {archivedArtworks.map((artwork) => (
                  <Card key={artwork.id} className="overflow-hidden" data-testid={`card-archived-${artwork.id}`}>
                    <div className="aspect-square relative bg-muted">
                      <img
                        src={artwork.imageUrl}
                        alt={artwork.title}
                        className="w-full h-full object-cover opacity-60"
                        data-testid={`img-artwork-${artwork.id}`}
                      />
                      <div className="absolute top-2 right-2">
                        <Badge variant="secondary" className="bg-red-600 text-white">
                          <Archive className="w-3 h-3 mr-1" />
                          Archived
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-6">
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-semibold text-lg mb-1" data-testid={`text-title-${artwork.id}`}>
                            {artwork.title}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Archived: {artwork.archivedAt ? new Date(artwork.archivedAt).toLocaleDateString() : 'Unknown'}
                          </p>
                        </div>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="default" 
                              size="sm" 
                              className="w-full"
                              disabled={reactivateMutation.isPending}
                              data-testid={`button-reactivate-${artwork.id}`}
                            >
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Reactivate
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reactivate "{artwork.title}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This artwork will be returned to your active catalog. It may need re-approval before appearing in the marketplace. 
                                Consider updating your marketing materials to drive traffic to this piece.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => reactivateMutation.mutate(artwork.id)}>
                                Reactivate Artwork
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {payoutData && payoutData.payouts && payoutData.payouts.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold font-serif">Recent Payouts</h3>
                <p className="text-muted-foreground">Your latest royalty payments</p>
              </div>
              <Button variant="outline" onClick={() => setLocation("/artist/payouts")} data-testid="button-view-all-payouts">
                View All
              </Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {payoutData.payouts.slice(0, 3).map((payout: any) => (
                    <div key={payout.id} className="flex items-center justify-between p-4 rounded-lg border" data-testid={`payout-${payout.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">${parseFloat(payout.amount).toFixed(2)}</p>
                          {payout.status === "completed" && (
                            <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid={`badge-payout-completed-${payout.id}`}>
                              <CheckCircle className="w-3 h-3 mr-1" />Paid
                            </Badge>
                          )}
                          {payout.status === "processing" && (
                            <Badge variant="secondary" data-testid={`badge-payout-processing-${payout.id}`}>
                              <Clock className="w-3 h-3 mr-1" />Processing
                            </Badge>
                          )}
                          {payout.status === "failed" && (
                            <Badge variant="destructive" data-testid={`badge-payout-failed-${payout.id}`}>
                              <XCircle className="w-3 h-3 mr-1" />Failed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {payout.salesCount} sales • {new Date(payout.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      {payout.stripeTransferId && (
                        <p className="text-xs text-muted-foreground font-mono" data-testid={`text-transfer-id-${payout.id}`}>
                          {payout.stripeTransferId.substring(0, 20)}...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ArtistLayout>
  );
}
