import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  MousePointerClick,
  DollarSign,
  Award,
  Copy,
  CheckCircle,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Influencer } from "@shared/schema";
import { Leaderboard } from "@/components/gamification/leaderboard";
import { BadgesDisplay } from "@/components/gamification/badges-display";
import { Challenges } from "@/components/gamification/challenges";

export default function InfluencerDashboard() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Fetch influencer profile
  const { data: influencer, isLoading: profileLoading, isError: profileError } = useQuery<Influencer>({
    queryKey: ["/api/influencers/me"],
  });

  // Fetch performance stats
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery<{
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalEarnings: string;
    pendingEarnings: string;
    monthlySalesCount: number;
    currentTier: string;
  }>({
    queryKey: ["/api/influencers/performance"],
  });

  const copyAffiliateLink = () => {
    if (!influencer?.affiliateCode) return;
    
    const link = `${window.location.origin}?ref=${influencer.affiliateCode}`;
    navigator.clipboard.writeText(link);
    
    setCopied(true);
    toast({
      title: "Link Copied!",
      description: "Your affiliate link has been copied to clipboard",
    });
    
    setTimeout(() => setCopied(false), 2000);
  };

  // Tier configuration
  const tierConfig = {
    bronze: { label: "Bronze", commission: "8%", color: "bg-orange-600", threshold: 0 },
    silver: { label: "Silver", commission: "10%", color: "bg-slate-400", threshold: 20 },
    gold: { label: "Gold", commission: "12%", color: "bg-yellow-500", threshold: 50 },
    platinum: { label: "Platinum", commission: "15%", color: "bg-blue-500", threshold: 100 },
    elite: { label: "Elite", commission: "18%", color: "bg-purple-600", threshold: 200 },
  };

  const currentTier = stats?.currentTier || "bronze";
  const tierInfo = tierConfig[currentTier as keyof typeof tierConfig];

  const isLoading = profileLoading || statsLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <div className="grid md:grid-cols-4 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (profileError || statsError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Dashboard</CardTitle>
            <CardDescription>
              Unable to load dashboard data. Please try refreshing the page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-welcome">
            Welcome back, {influencer?.name}!
          </h1>
          <p className="text-muted-foreground">
            Track your performance and grow your earnings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className={`h-8 w-8 ${tierInfo.color} text-white rounded-full p-1`} />
          <div>
            <Badge className={tierInfo.color} data-testid="badge-tier">
              {tierInfo.label} Tier
            </Badge>
            <p className="text-xs text-muted-foreground">{tierInfo.commission} commission</p>
          </div>
        </div>
      </div>

      {/* Affiliate Link */}
      <Card>
        <CardHeader>
          <CardTitle>Your Unique Affiliate Link</CardTitle>
          <CardDescription>
            Share this link to track clicks and conversions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div
              className="flex-1 px-4 py-2 bg-muted rounded-md font-mono text-sm"
              data-testid="text-affiliate-link"
            >
              {window.location.origin}?ref={influencer?.affiliateCode}
            </div>
            <Button
              data-testid="button-copy-link"
              onClick={copyAffiliateLink}
              variant="outline"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Performance Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card data-testid="card-clicks">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-clicks">
              {stats?.totalClicks?.toLocaleString() ?? "0"}
            </div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card data-testid="card-conversions">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-conversions">
              {stats?.totalConversions ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.conversionRate?.toFixed(2) ?? "0.00"}% conversion rate
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-earnings">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-earnings">
              ${stats?.totalEarnings ? parseFloat(stats.totalEarnings).toFixed(2) : "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card data-testid="card-pending">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending">
              ${stats?.pendingEarnings ? parseFloat(stats.pendingEarnings).toFixed(2) : "0.00"}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting payout</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Tier Progress</CardTitle>
          <CardDescription>
            Sell more to unlock higher commission rates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Monthly Sales: {stats?.monthlySalesCount ?? 0}</span>
              <span>Current: {tierInfo.label} ({tierInfo.commission})</span>
            </div>

            {/* Tier Ladder */}
            <div className="space-y-2">
              {Object.entries(tierConfig).map(([key, config]) => {
                const isActive = key === currentTier;
                const isPassed = stats && stats.monthlySalesCount !== undefined && stats.monthlySalesCount >= config.threshold;
                
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-3 rounded-md ${
                      isActive ? "bg-primary/10 border-2 border-primary" : "bg-muted"
                    }`}
                    data-testid={`tier-${key}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${config.color}`} />
                      <span className="font-medium">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {config.threshold}+ sales/mo
                      </span>
                      <span className="font-semibold">{config.commission}</span>
                      {isPassed && <CheckCircle className="h-4 w-4 text-green-600" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gamification: Achievements and Leaderboard */}
      <div className="grid lg:grid-cols-2 gap-6">
        <BadgesDisplay influencerId={influencer?.id} />
        <Leaderboard />
      </div>

      {/* Gamification: Challenges */}
      <Challenges influencerId={influencer?.id} />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
              1
            </div>
            <div>
              <p className="font-medium">Share Your Link</p>
              <p className="text-sm text-muted-foreground">
                Copy your affiliate link and share it on social media, blogs, or email
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
              2
            </div>
            <div>
              <p className="font-medium">Track Performance</p>
              <p className="text-sm text-muted-foreground">
                Monitor clicks, conversions, and earnings in real-time
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
              3
            </div>
            <div>
              <p className="font-medium">Level Up</p>
              <p className="text-sm text-muted-foreground">
                Reach higher tiers for better commission rates (up to 18%)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
