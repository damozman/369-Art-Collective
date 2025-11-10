import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, DollarSign, Package, Users, Award, Image } from "lucide-react";
import type { Artist } from "@shared/schema";

export default function ArtistAnalytics() {
  const { user } = useAuth();
  const artistId = user?.id;

  // Fetch earnings data
  const { data: earningsData, isLoading: earningsLoading } = useQuery<{
    totalEarnings: string;
    monthlySales: string;
    currentTier: number;
    nextTierThreshold: number;
    nextTierPercentage: number;
    salesCount: number;
    sales: any[];
  }>({
    queryKey: [`/api/artists/${artistId}/earnings`],
    enabled: !!artistId,
  });

  // Fetch referral data
  const { data: referralData, isLoading: referralLoading } = useQuery<{
    referralCode: string;
    referralLink: string;
    testimonialShareUrl: string | null;
    stats: {
      totalReferralSales: number;
      totalReferralEarnings: number;
      totalArtistsRecruited: number;
      totalRecruitmentEarnings: number;
      testimonialRecruits: number;
      generalRecruits: number;
    };
    recruitedArtists: any[];
  }>({
    queryKey: [`/api/artists/${artistId}/referrals`],
    enabled: !!artistId,
  });

  // Fetch artwork performance data
  const { data: artworkData, isLoading: artworkLoading } = useQuery<{
    summary: {
      totalArtworks: number;
      approvedArtworks: number;
      pendingArtworks: number;
      rejectedArtworks: number;
      activeProducts: number;
    };
    artworks: Array<{
      id: string;
      title: string;
      imageUrl: string;
      status: string;
      salesCount: number;
      totalEarnings: number;
      shopifyProductStatus: string | null;
      createdAt: Date | null;
    }>;
  }>({
    queryKey: [`/api/artists/${artistId}/artwork-performance`],
    enabled: !!artistId,
  });

  const isLoading = earningsLoading || referralLoading || artworkLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Track your performance and earnings</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalEarnings = parseFloat(earningsData?.totalEarnings || '0');
  const monthlySales = parseFloat(earningsData?.monthlySales || '0');
  const referralEarnings = referralData?.stats.totalReferralEarnings || 0;
  const recruitmentEarnings = referralData?.stats.totalRecruitmentEarnings || 0;

  // Prepare earnings breakdown data for pie chart
  const earningsBreakdown = [
    { name: 'Base Royalties', value: totalEarnings - referralEarnings - recruitmentEarnings, color: '#3b82f6' },
    { name: 'Referral Bonuses', value: referralEarnings, color: '#10b981' },
    { name: 'Recruitment Bonuses', value: recruitmentEarnings, color: '#8b5cf6' },
  ].filter(item => item.value > 0);

  // Prepare artwork status data for pie chart
  const artworkStatusData = artworkData?.summary ? [
    { name: 'Approved', value: artworkData.summary.approvedArtworks, color: '#10b981' },
    { name: 'Pending', value: artworkData.summary.pendingArtworks, color: '#f59e0b' },
    { name: 'Rejected', value: artworkData.summary.rejectedArtworks, color: '#ef4444' },
  ].filter(item => item.value > 0) : [];

  // Prepare top artworks data for bar chart (top 5)
  const topArtworks = (artworkData?.artworks || [])
    .filter(a => a.totalEarnings > 0)
    .slice(0, 5)
    .map(a => ({
      name: a.title.length > 20 ? a.title.substring(0, 20) + '...' : a.title,
      earnings: a.totalEarnings,
      sales: a.salesCount,
    }));

  // Tier progress
  const tierProgress = earningsData?.nextTierThreshold 
    ? (monthlySales / earningsData.nextTierThreshold) * 100
    : 100;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-artist-analytics">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-analytics">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Track your performance and earnings</p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2" data-testid="badge-tier">
          {earningsData?.currentTier}% Royalty Tier
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-earnings">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">
              ${totalEarnings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {earningsData?.salesCount || 0} total sales
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-sales">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-sales">
              ${monthlySales.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {tierProgress >= 100 ? 'Max tier reached!' : `${tierProgress.toFixed(0)}% to next tier`}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-artworks">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Artworks</CardTitle>
            <Image className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-artworks">
              {artworkData?.summary.totalArtworks || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {artworkData?.summary.activeProducts || 0} active products
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-recruits">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recruited Artists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-recruited-artists">
              {referralData?.stats.totalArtistsRecruited || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              ${(recruitmentEarnings || 0).toFixed(2)} earned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Earnings Breakdown */}
        {earningsBreakdown.length > 0 && (
          <Card data-testid="card-earnings-breakdown">
            <CardHeader>
              <CardTitle>Earnings Breakdown</CardTitle>
              <CardDescription>Distribution of your earnings by type</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={earningsBreakdown}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {earningsBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Artwork Status */}
        {artworkStatusData.length > 0 && (
          <Card data-testid="card-artwork-status">
            <CardHeader>
              <CardTitle>Artwork Status</CardTitle>
              <CardDescription>Distribution of your submitted artworks</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={artworkStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {artworkStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top Performing Artworks */}
      {topArtworks.length > 0 && (
        <Card data-testid="card-top-artworks">
          <CardHeader>
            <CardTitle>Top Performing Artworks</CardTitle>
            <CardDescription>Your best-selling artworks by earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topArtworks}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value: number, name: string) => {
                    if (name === 'earnings') return `$${value.toFixed(2)}`;
                    return value;
                  }} />
                  <Legend />
                  <Bar dataKey="earnings" fill="#3b82f6" name="Earnings ($)" />
                  <Bar dataKey="sales" fill="#10b981" name="Sales Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Referral Performance */}
      {(referralData?.stats.totalArtistsRecruited || 0) > 0 && (
        <Card data-testid="card-referral-performance">
          <CardHeader>
            <CardTitle>Referral Performance</CardTitle>
            <CardDescription>Your recruitment and referral activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Referral Sales</p>
                <p className="text-2xl font-bold" data-testid="text-referral-sales">{referralData?.stats.totalReferralSales || 0}</p>
                <p className="text-xs text-muted-foreground">
                  ${(referralEarnings || 0).toFixed(2)} earned
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Testimonial Recruits</p>
                <p className="text-2xl font-bold" data-testid="text-testimonial-recruits">{referralData?.stats.testimonialRecruits || 0}</p>
                <p className="text-xs text-muted-foreground">
                  Via success stories
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">General Recruits</p>
                <p className="text-2xl font-bold" data-testid="text-general-recruits">{referralData?.stats.generalRecruits || 0}</p>
                <p className="text-xs text-muted-foreground">
                  Via referral links
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
