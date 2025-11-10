import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, DollarSign, Users, CheckCircle, XCircle, AlertTriangle, Clock, CreditCard } from "lucide-react";
import type { Artist } from "@shared/schema";

interface ArtistWithEarnings extends Artist {
  unpaidEarnings: number;
  unpaidSalesCount: number;
  lastPayoutDate?: string;
  lastPayoutAmount?: number;
}

interface PayoutRecord {
  id: string;
  artistId: string;
  artistName: string;
  artistEmail: string;
  amount: number;
  status: string;
  stripeTransferId?: string;
  createdAt: string;
}

export default function AdminPayouts() {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isExecutingAll, setIsExecutingAll] = useState(false);

  // Fetch all artists with their earnings
  const { data: artistsData, isLoading: artistsLoading } = useQuery<ArtistWithEarnings[]>({
    queryKey: ["/api/admin/artists/earnings"],
  });

  // Fetch recent payouts across all artists
  const { data: payoutsData, isLoading: payoutsLoading } = useQuery<PayoutRecord[]>({
    queryKey: ["/api/admin/payouts/history"],
  });

  const executePayoutMutation = useMutation({
    mutationFn: async (artistId?: string) => {
      const endpoint = artistId 
        ? `/api/admin/payouts/execute/${artistId}`
        : `/api/admin/payouts/execute`;
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: (data: any, artistId?: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artists/earnings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/history"] });
      
      if (artistId) {
        toast({
          title: "Payout executed",
          description: `Successfully processed payout for artist`,
        });
      } else {
        const results = data.results || [];
        const successful = results.filter((r: any) => r.success).length;
        const failed = results.filter((r: any) => !r.success).length;
        
        toast({
          title: "Batch payout completed",
          description: `Processed ${successful} successful, ${failed} failed`,
        });
      }
      setIsExecutingAll(false);
    },
    onError: (error: any) => {
      toast({
        title: "Payout failed",
        description: error.message || "Failed to execute payout",
        variant: "destructive",
      });
      setIsExecutingAll(false);
    },
  });

  const handleExecutePayout = (artistId?: string) => {
    if (!artistId) {
      setIsExecutingAll(true);
    }
    executePayoutMutation.mutate(artistId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStripeBadge = (artist: ArtistWithEarnings) => {
    if (!artist.stripeAccountId) {
      return <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>;
    }
    if (artist.stripeOnboardingComplete && artist.stripePayoutsEnabled) {
      return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Ready</Badge>;
    }
    if (artist.stripeDetailsSubmitted) {
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending Verification</Badge>;
    }
    return <Badge variant="secondary" className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />Incomplete</Badge>;
  };

  const totalEarnings = artistsData?.reduce((sum, a) => sum + (a.unpaidEarnings || 0), 0) || 0;
  const artistsWithStripe = artistsData?.filter(a => a.stripeOnboardingComplete && a.stripePayoutsEnabled).length || 0;
  const artistsWithEarnings = artistsData?.filter(a => (a.unpaidEarnings || 0) > 0).length || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold font-serif">Payout Management</h1>
              <p className="text-sm text-muted-foreground">Manage artist payouts and earnings</p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setLocation("/admin/dashboard")}
                data-testid="button-back"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Artists
              </CardDescription>
              <CardTitle className="text-3xl" data-testid="text-total-artists">
                {artistsLoading ? <Skeleton className="h-9 w-16" /> : artistsData?.length || 0}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Stripe Connected
              </CardDescription>
              <CardTitle className="text-3xl text-green-600" data-testid="text-stripe-connected">
                {artistsLoading ? <Skeleton className="h-9 w-16" /> : artistsWithStripe}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Total Unpaid Earnings
              </CardDescription>
              <CardTitle className="text-3xl text-blue-600" data-testid="text-total-unpaid">
                {artistsLoading ? <Skeleton className="h-9 w-24" /> : `$${totalEarnings.toFixed(2)}`}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Artists w/ Earnings
              </CardDescription>
              <CardTitle className="text-3xl text-yellow-600" data-testid="text-artists-with-earnings">
                {artistsLoading ? <Skeleton className="h-9 w-16" /> : artistsWithEarnings}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Execute All Payouts Button */}
        <div className="mb-6 flex justify-end">
          <Button
            onClick={() => handleExecutePayout()}
            disabled={isExecutingAll || artistsWithEarnings === 0 || artistsLoading}
            data-testid="button-execute-all-payouts"
          >
            <DollarSign className="mr-2 h-4 w-4" />
            {isExecutingAll ? "Processing..." : "Execute All Payouts"}
          </Button>
        </div>

        {/* Artists with Earnings Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Artist Earnings & Payouts</CardTitle>
            <CardDescription>View unpaid earnings and execute individual payouts</CardDescription>
          </CardHeader>
          <CardContent>
            {artistsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artist</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Stripe Status</TableHead>
                    <TableHead className="text-right">Unpaid Earnings</TableHead>
                    <TableHead className="text-right">Unpaid Sales</TableHead>
                    <TableHead className="text-right">Last Payout</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artistsData && artistsData.length > 0 ? (
                    artistsData
                      .filter(a => (a.unpaidEarnings || 0) > 0)
                      .map((artist) => (
                        <TableRow key={artist.id} data-testid={`row-artist-${artist.id}`}>
                          <TableCell className="font-medium">{artist.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{artist.email}</TableCell>
                          <TableCell>{getStripeBadge(artist)}</TableCell>
                          <TableCell className="text-right font-medium" data-testid={`text-earnings-${artist.id}`}>
                            ${(artist.unpaidEarnings || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {artist.unpaidSalesCount || 0}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {artist.lastPayoutDate 
                              ? new Date(artist.lastPayoutDate).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleExecutePayout(artist.id)}
                              disabled={
                                executePayoutMutation.isPending ||
                                !artist.stripeOnboardingComplete ||
                                !artist.stripePayoutsEnabled ||
                                (artist.unpaidEarnings || 0) < 10
                              }
                              data-testid={`button-payout-${artist.id}`}
                            >
                              {executePayoutMutation.isPending ? "Processing..." : "Pay Out"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No artists with unpaid earnings
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Payouts History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payouts</CardTitle>
            <CardDescription>View payout transaction history</CardDescription>
          </CardHeader>
          <CardContent>
            {payoutsLoading ? (
              <div className="space-y-2">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Artist</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stripe Transfer ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutsData && payoutsData.length > 0 ? (
                    payoutsData.slice(0, 20).map((payout) => (
                      <TableRow key={payout.id} data-testid={`row-payout-${payout.id}`}>
                        <TableCell className="text-sm">
                          {new Date(payout.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-medium">{payout.artistName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{payout.artistEmail}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${payout.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>{getStatusBadge(payout.status)}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">
                          {payout.stripeTransferId || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No payout history yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
