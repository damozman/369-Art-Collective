import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, DollarSign, Users, TrendingUp, Network, Wallet, CheckCircle, XCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";

interface EmpireStats {
  totalRevenue: number;
  totalReferralBonuses: number;
  totalRecruitmentBonuses: number;
  totalArtists: number;
  totalRecruitedArtists: number;
  topArtists: Array<{
    id: string;
    name: string;
    email: string;
    totalEarnings: number;
    salesCount: number;
    currentTier: string;
  }>;
  topRecruiters: Array<{
    id: string;
    name: string;
    email: string;
    recruitedCount: number;
    recruitmentEarnings: number;
  }>;
}

export default function AdminEmpire() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [payoutResults, setPayoutResults] = useState<any>(null);

  const { data: empireStats, isLoading } = useQuery<EmpireStats>({
    queryKey: ['/api/admin/empire'],
  });

  const processPayoutsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/admin/process-payouts', 'POST');
      return response.json();
    },
    onSuccess: (data) => {
      setPayoutResults(data);
      toast({
        title: "Payouts Processed!",
        description: `${data.successfulPayouts} payouts completed, ${data.failedPayouts} failed`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/empire'] });
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process payouts",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/admin/dashboard")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold font-serif">Empire Dashboard</h1>
                <p className="text-sm text-muted-foreground">Network growth & revenue analytics</p>
              </div>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Payout Processing Card */}
        <Card className="mb-8 bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Monthly Payout Processing
            </CardTitle>
            <CardDescription>
              Process automated payouts for all artists with connected Stripe accounts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => processPayoutsMutation.mutate()}
              disabled={processPayoutsMutation.isPending}
              size="lg"
              data-testid="button-process-payouts"
            >
              <Wallet className="mr-2 h-4 w-4" />
              {processPayoutsMutation.isPending ? 'Processing...' : 'Process Monthly Payouts'}
            </Button>

            {payoutResults && (
              <div className="p-4 bg-background rounded-lg border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Payouts</p>
                    <p className="text-2xl font-bold">{payoutResults.totalPayouts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Successful</p>
                    <p className="text-2xl font-bold text-green-600">{payoutResults.successfulPayouts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{payoutResults.failedPayouts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-2xl font-bold">${payoutResults.totalAmount.toFixed(2)}</p>
                  </div>
                </div>

                {payoutResults.payouts && payoutResults.payouts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Payout Details:</p>
                    {payoutResults.payouts.map((payout: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-2">
                          {payout.status === 'completed' ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{payout.artistName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">${payout.amount.toFixed(2)}</span>
                          <Badge variant={payout.status === 'completed' ? 'default' : 'destructive'}>
                            {payout.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Total Revenue
              </CardDescription>
              <CardTitle className="text-3xl" data-testid="text-total-revenue">
                ${(empireStats?.totalRevenue || 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Referral Bonuses
              </CardDescription>
              <CardTitle className="text-3xl text-green-600" data-testid="text-referral-bonuses">
                ${(empireStats?.totalReferralBonuses || 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <Network className="h-4 w-4" />
                Recruitment Bonuses
              </CardDescription>
              <CardTitle className="text-3xl text-purple-600" data-testid="text-recruitment-bonuses">
                ${(empireStats?.totalRecruitmentBonuses || 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Network Size
              </CardDescription>
              <CardTitle className="text-3xl text-blue-600" data-testid="text-total-artists">
                {empireStats?.totalArtists || 0}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {empireStats?.totalRecruitedArtists || 0} recruited
              </p>
            </CardHeader>
          </Card>
        </div>

        {/* Top Artists */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Top Performing Artists</CardTitle>
            <CardDescription>Artists with highest total earnings</CardDescription>
          </CardHeader>
          <CardContent>
            {empireStats?.topArtists && empireStats.topArtists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Rank</th>
                      <th className="text-left p-3 font-semibold">Artist</th>
                      <th className="text-right p-3 font-semibold">Sales</th>
                      <th className="text-right p-3 font-semibold">Current Tier</th>
                      <th className="text-right p-3 font-semibold">Total Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empireStats.topArtists.map((artist, index) => (
                      <tr key={artist.id} className="border-b hover-elevate" data-testid={`row-top-artist-${artist.id}`}>
                        <td className="p-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 font-bold">
                            {index + 1}
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-semibold">{artist.name}</p>
                            <p className="text-sm text-muted-foreground">{artist.email}</p>
                          </div>
                        </td>
                        <td className="p-3 text-right">{artist.salesCount}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            artist.currentTier === 'Platinum' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                            artist.currentTier === 'Gold' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                            artist.currentTier === 'Silver' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                            'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                          }`}>
                            {artist.currentTier}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold">
                          ${artist.totalEarnings.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No sales data yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Recruiters */}
        <Card>
          <CardHeader>
            <CardTitle>Top Recruiters</CardTitle>
            <CardDescription>Artists driving network growth</CardDescription>
          </CardHeader>
          <CardContent>
            {empireStats?.topRecruiters && empireStats.topRecruiters.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Rank</th>
                      <th className="text-left p-3 font-semibold">Recruiter</th>
                      <th className="text-right p-3 font-semibold">Artists Recruited</th>
                      <th className="text-right p-3 font-semibold">Recruitment Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empireStats.topRecruiters.map((recruiter, index) => (
                      <tr key={recruiter.id} className="border-b hover-elevate" data-testid={`row-recruiter-${recruiter.id}`}>
                        <td className="p-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 font-bold">
                            {index + 1}
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-semibold">{recruiter.name}</p>
                            <p className="text-sm text-muted-foreground">{recruiter.email}</p>
                          </div>
                        </td>
                        <td className="p-3 text-right">{recruiter.recruitedCount}</td>
                        <td className="p-3 text-right font-semibold text-purple-600">
                          ${recruiter.recruitmentEarnings.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No recruitment data yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
