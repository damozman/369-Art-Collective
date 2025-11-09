import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Wallet, CheckCircle, Clock, AlertCircle, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

interface StripeAccountStatus {
  connected: boolean;
  accountId?: string;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  detailsSubmitted?: boolean;
  status?: 'active' | 'pending';
}

interface Payout {
  id: string;
  amount: string;
  status: string;
  stripeTransferId: string | null;
  periodStart: string;
  periodEnd: string;
  salesCount: number;
  baseRoyalties: string;
  referralBonuses: string;
  recruitmentBonuses: string;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

export default function ArtistPayouts() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Parse URL params for success/error states
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast({
        title: "Success!",
        description: "Your Stripe account has been connected successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/account-status'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error') === 'true') {
      toast({
        title: "Connection Failed",
        description: "There was an error connecting your Stripe account. Please try again.",
        variant: "destructive",
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('refresh') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  const { data: accountStatus, isLoading: isLoadingStatus } = useQuery<StripeAccountStatus>({
    queryKey: ['/api/stripe/account-status'],
    enabled: Boolean(user?.id),
    refetchInterval: 30000, // Refresh every 30 seconds to check status
  });

  const { data: payouts, isLoading: isLoadingPayouts } = useQuery<Payout[]>({
    queryKey: [`/api/artists/${user?.id}/payouts`],
    enabled: Boolean(user?.id),
  });

  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/stripe/connect-url', 'GET');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else if (data.status === 'active') {
        toast({
          title: "Already Connected",
          description: "Your Stripe account is already active and ready for payouts.",
        });
        queryClient.invalidateQueries({ queryKey: ['/api/stripe/account-status'] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect Stripe account",
        variant: "destructive",
      });
    },
  });

  if (isLoadingStatus || isLoadingPayouts) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const totalEarnings = payouts?.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0) || 0;
  const completedPayouts = payouts?.filter(p => p.status === 'completed') || [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/artist/dashboard")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold font-serif">Payout Center</h1>
                <p className="text-sm text-muted-foreground">Connect your bank account and view payout history</p>
              </div>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stripe Connection Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Stripe Account
            </CardTitle>
            <CardDescription>
              Connect your Stripe account to receive automated monthly payouts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {accountStatus?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {accountStatus.status === 'active' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-yellow-500" />
                    )}
                    <div>
                      <p className="font-medium">
                        {accountStatus.status === 'active' ? 'Account Active' : 'Setup Pending'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {accountStatus.status === 'active' 
                          ? 'Your account is ready to receive payouts'
                          : 'Complete your Stripe setup to activate payouts'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={accountStatus.status === 'active' ? 'default' : 'secondary'}>
                    {accountStatus.status === 'active' ? 'Connected' : 'Pending'}
                  </Badge>
                </div>

                {accountStatus.status === 'pending' && (
                  <Button
                    onClick={() => connectStripeMutation.mutate()}
                    disabled={connectStripeMutation.isPending}
                    data-testid="button-complete-stripe-setup"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {connectStripeMutation.isPending ? 'Connecting...' : 'Complete Stripe Setup'}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">No Account Connected</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your Stripe account to start receiving monthly payouts directly to your bank account.
                      The setup is quick and secure.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => connectStripeMutation.mutate()}
                  disabled={connectStripeMutation.isPending}
                  data-testid="button-connect-stripe"
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {connectStripeMutation.isPending ? 'Connecting...' : 'Connect Stripe Account'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payout Summary */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Total Earnings</CardTitle>
              <CardDescription>All-time payout total</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold" data-testid="text-total-earnings">
                ${totalEarnings.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Completed Payouts</CardTitle>
              <CardDescription>Successfully processed payments</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold" data-testid="text-completed-payouts">
                {completedPayouts.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Payout History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
            <CardDescription>
              View all your past and pending payouts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payouts && payouts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-sm text-muted-foreground">
                      <th className="text-left py-3 px-4">Period</th>
                      <th className="text-left py-3 px-4">Sales</th>
                      <th className="text-left py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id} className="border-b hover-elevate" data-testid={`row-payout-${payout.id}`}>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <p className="font-medium">
                              {new Date(payout.periodStart).toLocaleDateString()} -
                            </p>
                            <p className="text-muted-foreground">
                              {new Date(payout.periodEnd).toLocaleDateString()}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm font-medium">{payout.salesCount} sales</p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm">
                            <p className="font-bold">${parseFloat(payout.amount).toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">
                              Base: ${parseFloat(payout.baseRoyalties).toFixed(2)}
                              {parseFloat(payout.referralBonuses) > 0 && (
                                <> + ${parseFloat(payout.referralBonuses).toFixed(2)} ref</>
                              )}
                              {parseFloat(payout.recruitmentBonuses) > 0 && (
                                <> + ${parseFloat(payout.recruitmentBonuses).toFixed(2)} recruit</>
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              payout.status === 'completed' ? 'default' :
                              payout.status === 'failed' ? 'destructive' :
                              'secondary'
                            }
                            data-testid={`badge-status-${payout.status}`}
                          >
                            {payout.status === 'completed' && <CheckCircle className="mr-1 h-3 w-3" />}
                            {payout.status === 'pending' && <Clock className="mr-1 h-3 w-3" />}
                            {payout.status === 'failed' && <AlertCircle className="mr-1 h-3 w-3" />}
                            {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm">
                            {payout.completedAt 
                              ? new Date(payout.completedAt).toLocaleDateString()
                              : new Date(payout.createdAt).toLocaleDateString()}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Payouts Yet</p>
                <p className="text-sm text-muted-foreground">
                  Your payout history will appear here once sales are processed
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
