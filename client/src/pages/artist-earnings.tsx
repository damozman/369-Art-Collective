import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, Award, ShoppingCart } from "lucide-react";
import { format } from "date-fns";

interface EarningsData {
  totalEarnings: string;
  monthlySales: string;
  currentTier: number;
  nextTierThreshold: number;
  nextTierPercentage: number;
  salesCount: number;
  sales: Array<{
    id: string;
    artworkTitle: string;
    saleAmount: string;
    royaltyTier: number;
    totalEarnings: string;
    createdAt: string;
  }>;
}

export default function ArtistEarnings() {
  const { user } = useAuth();

  const { data: earnings, isLoading } = useQuery<EarningsData>({
    queryKey: [`/api/artists/${user?.id}/earnings`],
    enabled: Boolean(user?.id),
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!earnings) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">No earnings data available</p>
      </div>
    );
  }

  const getTierBadgeColor = (tier: number) => {
    if (tier >= 45) return "bg-yellow-500 text-yellow-950";
    if (tier >= 40) return "bg-purple-500 text-purple-950";
    if (tier >= 35) return "bg-blue-500 text-blue-950";
    return "bg-green-500 text-green-950";
  };

  const getTierLabel = (tier: number) => {
    if (tier >= 45) return "Platinum";
    if (tier >= 40) return "Gold";
    if (tier >= 35) return "Silver";
    return "Bronze";
  };

  const progressPercentage = parseFloat(earnings.monthlySales) >= earnings.nextTierThreshold
    ? 100
    : (parseFloat(earnings.monthlySales) / earnings.nextTierThreshold) * 100;

  const amountToNextTier = Math.max(0, earnings.nextTierThreshold - parseFloat(earnings.monthlySales));

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-earnings">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-earnings-title">
            Artist Earnings
          </h1>
          <p className="text-muted-foreground">
            Track your sales performance and royalty tier
          </p>
        </div>
        <Badge className={`${getTierBadgeColor(earnings.currentTier)} text-lg px-4 py-2`} data-testid="badge-tier">
          <Award className="w-4 h-4 mr-2" />
          {getTierLabel(earnings.currentTier)} - {earnings.currentTier}%
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-earnings">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-earnings">
              ${earnings.totalEarnings}
            </div>
            <p className="text-xs text-muted-foreground">All-time artist royalties</p>
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-sales">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Sales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-monthly-sales">
              ${earnings.monthlySales}
            </div>
            <p className="text-xs text-muted-foreground">Current month total</p>
          </CardContent>
        </Card>

        <Card data-testid="card-current-tier">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Royalty Tier</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-current-tier">
              {earnings.currentTier}%
            </div>
            <p className="text-xs text-muted-foreground">{getTierLabel(earnings.currentTier)} tier</p>
          </CardContent>
        </Card>

        <Card data-testid="card-sales-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sales-count">
              {earnings.salesCount}
            </div>
            <p className="text-xs text-muted-foreground">Artworks sold</p>
          </CardContent>
        </Card>
      </div>

      {earnings.currentTier < 45 && (
        <Card data-testid="card-tier-progress">
          <CardHeader>
            <CardTitle>Progress to {getTierLabel(earnings.nextTierPercentage)} Tier ({earnings.nextTierPercentage}%)</CardTitle>
            <CardDescription>
              ${amountToNextTier.toFixed(2)} away from your next royalty tier upgrade
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progressPercentage} className="h-3" data-testid="progress-tier" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span data-testid="text-current-monthly">${earnings.monthlySales}</span>
              <span data-testid="text-next-threshold">${earnings.nextTierThreshold}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-sales-history">
        <CardHeader>
          <CardTitle>Recent Sales</CardTitle>
          <CardDescription>Your latest artwork sales and earnings</CardDescription>
        </CardHeader>
        <CardContent>
          {earnings.sales && earnings.sales.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Artwork</TableHead>
                  <TableHead className="text-right">Sale Amount</TableHead>
                  <TableHead className="text-right">Tier</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.sales.map((sale: any, idx: number) => (
                  <TableRow key={sale.id} data-testid={`row-sale-${idx}`}>
                    <TableCell data-testid={`text-sale-date-${idx}`}>
                      {format(new Date(sale.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-artwork-${idx}`}>
                      {sale.artworkTitle}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-sale-amount-${idx}`}>
                      ${parseFloat(sale.saleAmount || '0').toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" data-testid={`badge-tier-${idx}`}>
                        {sale.royaltyTier}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold" data-testid={`text-earnings-${idx}`}>
                      ${parseFloat(sale.totalEarnings || '0').toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-sales">
              No sales yet. Keep creating and promoting your artwork!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
