import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Users, Package, Calculator, Target, UserCheck, XCircle, Clock } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

export default function AdminFinancialDashboard() {
  // Fetch revenue metrics
  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ['/api/admin/financial/revenue'],
  });

  // Fetch artist break-even scenarios
  // Fetch Printify costs
  const { data: printifyCosts, isLoading: costsLoading } = useQuery({
    queryKey: ['/api/admin/financial/printify-costs'],
  });

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="admin-financial-dashboard">
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-financial-dashboard">
          Financial Dashboard
        </h1>
        <p className="text-muted-foreground">
          Comprehensive financial analytics and tools for business planning
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList data-testid="tabs-financial">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing Strategy</TabsTrigger>
          <TabsTrigger value="margins" data-testid="tab-margins">Margin Calculator</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          <RevenueOverview data={revenueData} isLoading={revenueLoading} />
          <PrintifyCostsOverview data={printifyCosts} isLoading={costsLoading} />
        </TabsContent>

        {/* PRICING STRATEGY TAB */}
        <TabsContent value="pricing" className="space-y-4">
          <PricingStrategyTool />
        </TabsContent>

        {/* MARGIN CALCULATOR TAB */}
        <TabsContent value="margins" className="space-y-4">
          <MarginCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================
// REVENUE OVERVIEW COMPONENT
// ============================================

function RevenueOverview({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) {
    return <Card><CardContent className="p-6">Loading revenue data...</CardContent></Card>;
  }

  if (!data) {
    return <Card><CardContent className="p-6">No revenue data available</CardContent></Card>;
  }

  const { printNetwork, creatorStack, totals } = data;

  return (
    <>
      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-mrr">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-total-mrr">
              ${totals.totalMRR.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              ${totals.totalAnnualRecurring.toFixed(0)}/year ARR
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monthly Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-monthly-revenue">
              ${totals.totalMonthlyRevenue.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              MRR + Variable Revenue
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-artist-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Artists</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-artist-count">
              {printNetwork.artists.activeCount}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-product-sales">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Product Sales</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-product-sales">
              {printNetwork.productSales.totalOrders}
            </div>
            <p className="text-xs text-muted-foreground">
              ${printNetwork.productSales.platformMargin.toFixed(2)} margin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-print-network">
          <CardHeader>
            <CardTitle>369 Art Collective</CardTitle>
            <CardDescription>POD marketplace revenue streams</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Product Sales</span>
                <span className="text-sm font-bold" data-testid="value-print-sales">
                  ${printNetwork.productSales.platformMargin.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {printNetwork.productSales.totalOrders} orders · 
                ${printNetwork.productSales.averageOrderValue.toFixed(2)} avg · 
                ${printNetwork.productSales.artistRoyalties.toFixed(2)} artist royalties
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">AI Studio Credits</span>
                <span className="text-sm font-bold" data-testid="value-ai-credits">
                  ${printNetwork.aiCredits.revenue.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {printNetwork.aiCredits.totalPurchases} purchases
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-creatorstack">
          <CardHeader>
            <CardTitle>247 CreatorStack</CardTitle>
            <CardDescription>Digital products & AI tools</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Kit Sales</span>
                <span className="text-sm font-bold" data-testid="value-kit-sales">
                  ${creatorStack.kitSales.revenue.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {creatorStack.kitSales.totalSales} kits sold
              </p>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Pro Memberships</span>
                <span className="text-sm font-bold" data-testid="value-creatorstack-memberships">
                  ${creatorStack.proMemberships.monthlyMRR.toFixed(2)}/mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {creatorStack.proMemberships.activeMembers} active members @ $29/mo
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ============================================
// PRINTIFY COSTS OVERVIEW
// ============================================

function PrintifyCostsOverview({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading || !data) return null;

  return (
    <Card data-testid="card-printify-costs">
      <CardHeader>
        <CardTitle>Printify Product Costs</CardTitle>
        <CardDescription>Current production and shipping costs (estimated)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium">Posters</p>
            <p className="text-xs text-muted-foreground">
              ${data.poster.cost.toFixed(2)} + ${data.poster.shipping.toFixed(2)} ship
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Canvas</p>
            <p className="text-xs text-muted-foreground">
              ${data.canvas.cost.toFixed(2)} + ${data.canvas.shipping.toFixed(2)} ship
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Framed</p>
            <p className="text-xs text-muted-foreground">
              ${data.framed.cost.toFixed(2)} + ${data.framed.shipping.toFixed(2)} ship
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">Metal</p>
            <p className="text-xs text-muted-foreground">
              ${data.metal.cost.toFixed(2)} + ${data.metal.shipping.toFixed(2)} ship
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// PRICING STRATEGY TOOL
// ============================================

function PricingStrategyTool() {
  const [productType, setProductType] = useState<string>("canvas");
  const [currentPrice, setCurrentPrice] = useState<string>("89.99");
  const [printifyCost, setPrintifyCost] = useState<string>("12.00");
  const [shipping, setShipping] = useState<string>("7.50");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calculateStrategy = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/admin/financial/pricing-strategy', {
        productType,
        currentPrice: parseFloat(currentPrice),
        printifyCost: parseFloat(printifyCost),
        shipping: parseFloat(shipping),
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Pricing strategy error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="card-pricing-strategy">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Pricing Strategy Tool
        </CardTitle>
        <CardDescription>
          Test different price points and see impact on margins at each royalty rate
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="product-type">Product Type</Label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger id="product-type" data-testid="select-product-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="poster">Poster</SelectItem>
                <SelectItem value="canvas">Canvas</SelectItem>
                <SelectItem value="framed">Framed Print</SelectItem>
                <SelectItem value="metal">Metal Print</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="current-price">Current Price ($)</Label>
            <Input
              id="current-price"
              data-testid="input-current-price"
              type="number"
              step="0.01"
              value={currentPrice}
              onChange={(e) => setCurrentPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="printify-cost">Printify Cost ($)</Label>
            <Input
              id="printify-cost"
              data-testid="input-printify-cost"
              type="number"
              step="0.01"
              value={printifyCost}
              onChange={(e) => setPrintifyCost(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shipping">Shipping ($)</Label>
            <Input
              id="shipping"
              data-testid="input-shipping"
              type="number"
              step="0.01"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={calculateStrategy}
          disabled={loading}
          data-testid="button-calculate-strategy"
          className="w-full"
        >
          {loading ? "Calculating..." : "Generate Pricing Strategy"}
        </Button>

        {results && (
          <div className="space-y-4 mt-6">
            <h3 className="font-semibold">Price Point Analysis</h3>
            <div className="grid gap-4">
              {results.suggestedPrices.map((pricePoint: any, index: number) => (
                <Card key={index} className="border-2" data-testid={`price-point-${index}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">
                      ${pricePoint.price.toFixed(2)} 
                      {index === 1 && <span className="text-sm text-muted-foreground ml-2">(Current)</span>}
                      {index === 0 && <span className="text-sm text-destructive ml-2">(-10%)</span>}
                      {index === 2 && <span className="text-sm text-green-600 ml-2">(+10%)</span>}
                      {index === 3 && <span className="text-sm text-green-600 ml-2">(+20%)</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {(["30", "35", "45"] as const).map((rate) => (
                        <div key={rate}>
                          <p className="font-medium">{rate}% Royalty</p>
                          <p className="text-muted-foreground">
                            Margin: ${pricePoint.margins[`rate${rate}`].platformMargin.toFixed(2)}
                            ({pricePoint.margins[`rate${rate}`].platformMarginPercent.toFixed(1)}%)
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
// ============================================
// MARGIN CALCULATOR
// ============================================

function MarginCalculator() {
  const [retailPrice, setRetailPrice] = useState<string>("89.99");
  const [printifyCost, setPrintifyCost] = useState<string>("12.00");
  const [shipping, setShipping] = useState<string>("7.50");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const calculateMargins = async (royaltyPercent: number) => {
    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/admin/financial/margins', {
        retailPrice: parseFloat(retailPrice),
        printifyCost: parseFloat(printifyCost),
        shipping: parseFloat(shipping),
        artistRoyaltyPercent: royaltyPercent,
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Margin calculation error:", error);
      return null;
    }
  };

  const calculateAllMargins = async () => {
    const [rate30, rate35, rate45] = await Promise.all([
      calculateMargins(30),
      calculateMargins(35),
      calculateMargins(45),
    ]);
    setResults({ rate30, rate35, rate45 });
    setLoading(false);
  };

  return (
    <Card data-testid="card-margin-calculator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Product Margin Calculator
        </CardTitle>
        <CardDescription>
          Calculate exact margins for any product across all artist royalty tiers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="margin-retail-price">Retail Price ($)</Label>
            <Input
              id="margin-retail-price"
              data-testid="input-margin-retail-price"
              type="number"
              step="0.01"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="margin-printify-cost">Printify Cost ($)</Label>
            <Input
              id="margin-printify-cost"
              data-testid="input-margin-printify-cost"
              type="number"
              step="0.01"
              value={printifyCost}
              onChange={(e) => setPrintifyCost(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="margin-shipping">Shipping ($)</Label>
            <Input
              id="margin-shipping"
              data-testid="input-margin-shipping"
              type="number"
              step="0.01"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={calculateAllMargins}
          disabled={loading}
          data-testid="button-calculate-margins"
          className="w-full"
        >
          {loading ? "Calculating..." : "Calculate Margins"}
        </Button>

        {results && (
          <div className="space-y-4 mt-6">
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { tier: '30% Royalty', data: results.rate30, color: 'text-green-600' },
                { tier: '35% Royalty', data: results.rate35, color: 'text-blue-600' },
                { tier: '45% Royalty', data: results.rate45, color: 'text-purple-600' },
              ].map(({ tier, data, color }, index) => (
                <Card key={index} data-testid={`margin-result-${index}`}>
                  <CardHeader>
                    <CardTitle className="text-base">{tier}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Retail Price:</span>
                      <span className="font-medium">${data.retailPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Printify Cost:</span>
                      <span>${data.costs.printify.toFixed(2)} ({data.breakdown.printifyPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping:</span>
                      <span>${data.costs.shipping.toFixed(2)} ({data.breakdown.shippingPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Artist Royalty:</span>
                      <span>${data.costs.artistRoyalty.toFixed(2)} ({data.breakdown.artistPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Payment Fee:</span>
                      <span>${data.costs.paymentProcessing.toFixed(2)} ({data.breakdown.paymentPercent.toFixed(1)}%)</span>
                    </div>
                    <div className="pt-2 border-t flex justify-between font-bold">
                      <span>Platform Margin:</span>
                      <span className={color}>
                        ${data.platformMargin.toFixed(2)} ({data.platformMarginPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
