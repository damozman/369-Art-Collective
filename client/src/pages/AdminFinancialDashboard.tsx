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
  const { data: breakevenData, isLoading: breakevenLoading } = useQuery({
    queryKey: ['/api/admin/financial/all-breakeven'],
  });

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
          <TabsTrigger value="trials" data-testid="tab-trials">Trial Analytics</TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing">Pricing Strategy</TabsTrigger>
          <TabsTrigger value="breakeven" data-testid="tab-breakeven">Artist Break-Even</TabsTrigger>
          <TabsTrigger value="margins" data-testid="tab-margins">Margin Calculator</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          <RevenueOverview data={revenueData} isLoading={revenueLoading} />
          <PrintifyCostsOverview data={printifyCosts} isLoading={costsLoading} />
        </TabsContent>

        {/* TRIAL ANALYTICS TAB */}
        <TabsContent value="trials" className="space-y-4">
          <TrialAnalytics />
        </TabsContent>

        {/* PRICING STRATEGY TAB */}
        <TabsContent value="pricing" className="space-y-4">
          <PricingStrategyTool />
        </TabsContent>

        {/* ARTIST BREAK-EVEN TAB */}
        <TabsContent value="breakeven" className="space-y-4">
          <ArtistBreakevenCalculator data={breakevenData} isLoading={breakevenLoading} />
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
              {printNetwork.artistSubscriptions.freeCount +
                printNetwork.artistSubscriptions.proCount +
                printNetwork.artistSubscriptions.eliteCount}
            </div>
            <p className="text-xs text-muted-foreground">
              {printNetwork.artistSubscriptions.proCount} Pro + {printNetwork.artistSubscriptions.eliteCount} Elite
            </p>
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
            <CardTitle>247 Print Network</CardTitle>
            <CardDescription>POD marketplace revenue streams</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Artist Subscriptions</span>
                <span className="text-sm font-bold" data-testid="value-print-subscriptions">
                  ${printNetwork.artistSubscriptions.monthlyMRR.toFixed(2)}/mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {printNetwork.artistSubscriptions.freeCount} Free · 
                {printNetwork.artistSubscriptions.proCount} Pro ($20) · 
                {printNetwork.artistSubscriptions.eliteCount} Elite ($45)
              </p>
            </div>
            
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
          Test different price points and see impact on margins across all artist tiers
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
                      <div>
                        <p className="font-medium">Free Tier (30%)</p>
                        <p className="text-muted-foreground">
                          Margin: ${pricePoint.margins.free.platformMargin.toFixed(2)} 
                          ({pricePoint.margins.free.platformMarginPercent.toFixed(1)}%)
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Pro Tier (35%)</p>
                        <p className="text-muted-foreground">
                          Margin: ${pricePoint.margins.pro.platformMargin.toFixed(2)} 
                          ({pricePoint.margins.pro.platformMarginPercent.toFixed(1)}%)
                        </p>
                      </div>
                      <div>
                        <p className="font-medium">Elite Tier (45%)</p>
                        <p className="text-muted-foreground">
                          Margin: ${pricePoint.margins.elite.platformMargin.toFixed(2)} 
                          ({pricePoint.margins.elite.platformMarginPercent.toFixed(1)}%)
                        </p>
                      </div>
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
// ARTIST BREAK-EVEN CALCULATOR
// ============================================

function ArtistBreakevenCalculator({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) {
    return <Card><CardContent className="p-6">Loading break-even data...</CardContent></Card>;
  }

  if (!data) {
    return <Card><CardContent className="p-6">No break-even data available</CardContent></Card>;
  }

  const { free, pro, elite } = data;

  return (
    <div className="space-y-4">
      <Card data-testid="card-breakeven-intro">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Artist Break-Even Calculator
          </CardTitle>
          <CardDescription>
            See how many sales artists need to break even on subscription costs (based on $89.99 avg order)
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-breakeven-free">
          <CardHeader>
            <CardTitle className="text-lg">Free Tier</CardTitle>
            <CardDescription>${free.subscriptionCost}/month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-green-600" data-testid="value-breakeven-free">
                {free.salesNeededToBreakEven}
              </p>
              <p className="text-sm text-muted-foreground">sales needed (subscription is free!)</p>
            </div>
            <div>
              <p className="text-sm font-medium">Royalty: {free.royaltyPercent}%</p>
              <p className="text-xs text-muted-foreground">
                Earn ${free.averageProductRevenue.toFixed(2)} per sale
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Benefits:</p>
              {free.monthlyROI.benefits.map((benefit: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">· {benefit}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-breakeven-pro" className="border-primary">
          <CardHeader>
            <CardTitle className="text-lg">Pro Tier</CardTitle>
            <CardDescription>${pro.subscriptionCost}/month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-blue-600" data-testid="value-breakeven-pro">
                {pro.salesNeededToBreakEven}
              </p>
              <p className="text-sm text-muted-foreground">sales needed to break even</p>
            </div>
            <div>
              <p className="text-sm font-medium">Royalty: {pro.royaltyPercent}%</p>
              <p className="text-xs text-muted-foreground">
                Earn ${pro.averageProductRevenue.toFixed(2)} per sale
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Benefits:</p>
              {pro.monthlyROI.benefits.map((benefit: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">· {benefit}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-breakeven-elite" className="border-purple-600">
          <CardHeader>
            <CardTitle className="text-lg">Elite Tier</CardTitle>
            <CardDescription>${elite.subscriptionCost}/month</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold text-purple-600" data-testid="value-breakeven-elite">
                {elite.salesNeededToBreakEven}
              </p>
              <p className="text-sm text-muted-foreground">sales needed to break even</p>
            </div>
            <div>
              <p className="text-sm font-medium">Royalty: {elite.royaltyPercent}%</p>
              <p className="text-xs text-muted-foreground">
                Earn ${elite.averageProductRevenue.toFixed(2)} per sale
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Benefits:</p>
              {elite.monthlyROI.benefits.map((benefit: string, i: number) => (
                <p key={i} className="text-xs text-muted-foreground">· {benefit}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ROI Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Pro Tier:</span> Artists earn ${(pro.averageProductRevenue - free.averageProductRevenue).toFixed(2)} more per sale (35% vs 30%). 
              After {pro.salesNeededToBreakEven} sales to break even, every additional sale nets them an extra ${(pro.averageProductRevenue - free.averageProductRevenue).toFixed(2)} 
              + unlimited artworks + AI tools.
            </p>
            <p>
              <span className="font-medium">Elite Tier:</span> Artists earn ${(elite.averageProductRevenue - free.averageProductRevenue).toFixed(2)} more per sale (45% vs 30%). 
              After {elite.salesNeededToBreakEven} sales to break even, every additional sale nets them an extra ${(elite.averageProductRevenue - free.averageProductRevenue).toFixed(2)} 
              + guaranteed featured placement + unlimited AI credits.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
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
    const [free, pro, elite] = await Promise.all([
      calculateMargins(30),
      calculateMargins(35),
      calculateMargins(45),
    ]);
    setResults({ free, pro, elite });
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
                { tier: 'Free (30%)', data: results.free, color: 'text-green-600' },
                { tier: 'Pro (35%)', data: results.pro, color: 'text-blue-600' },
                { tier: 'Elite (45%)', data: results.elite, color: 'text-purple-600' },
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

// ============================================
// TRIAL ANALYTICS COMPONENT  
// ============================================

interface TrialAnalyticsData {
  summary: {
    totalTrialsStarted: number;
    totalConverted: number;
    totalCanceled: number;
    totalExpired: number;
    conversionRate: number;
    trialGeneratedMRR: number;
    proTrials: number;
    eliteTrials: number;
    proConversions: number;
    eliteConversions: number;
    proConversionRate: number;
    eliteConversionRate: number;
  };
  funnel: {
    totalArtists: number;
    freeArtists: number;
    trialStarters: number;
    converted: number;
    freeToTrialRate: number;
    trialToConversionRate: number;
  };
  breakdowns: {
    tier: string;
    source: string;
    count: number;
    converted: number;
    conversionRate: number;
  }[];
}

function TrialAnalytics() {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  
  const { data, isLoading } = useQuery<TrialAnalyticsData>({
    queryKey: ['/api/admin/analytics/trials', { range }],
  });

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading trial analytics...</CardContent></Card>;
  }

  if (!data) {
    return <Card><CardContent className="p-6">No trial data available</CardContent></Card>;
  }

  const { summary, funnel, breakdowns } = data;

  return (
    <>
      {/* Time Range Selector */}
      <Card data-testid="card-range-selector">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="range-select">Time Range:</Label>
            <Select value={range} onValueChange={(value) => setRange(value as any)}>
              <SelectTrigger id="range-select" className="w-[180px]" data-testid="select-time-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d" data-testid="option-7d">Last 7 Days</SelectItem>
                <SelectItem value="30d" data-testid="option-30d">Last 30 Days</SelectItem>
                <SelectItem value="90d" data-testid="option-90d">Last 90 Days</SelectItem>
                <SelectItem value="all" data-testid="option-all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-trials-started">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trials Started</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-trials-started">
              {summary.totalTrialsStarted}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.proTrials} Pro, {summary.eliteTrials} Elite
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-conversion-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-conversion-rate">
              {summary.conversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.totalConverted} of {summary.totalTrialsStarted} converted
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-trial-mrr">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial-Generated MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-trial-mrr">
              ${summary.trialGeneratedMRR.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              From converted trials
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-active-trials">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Churned Trials</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-churned-trials">
              {summary.totalCanceled + summary.totalExpired}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.totalCanceled} canceled, {summary.totalExpired} expired
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Performance Breakdown */}
      <Card data-testid="card-tier-breakdown">
        <CardHeader>
          <CardTitle>Pro vs Elite Performance</CardTitle>
          <CardDescription>Trial conversion rates by subscription tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pro Tier (14-day trial)</span>
                  <Badge variant="outline" data-testid="badge-pro-tier">Pro</Badge>
                </div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="value-pro-conversion">
                  {summary.proConversionRate.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground">
                  {summary.proConversions} conversions from {summary.proTrials} trials
                </p>
                <p className="text-sm text-muted-foreground">
                  MRR Impact: ${(summary.proConversions * 15).toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Elite Tier (7-day trial)</span>
                  <Badge variant="outline" data-testid="badge-elite-tier">Elite</Badge>
                </div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400" data-testid="value-elite-conversion">
                  {summary.eliteConversionRate.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground">
                  {summary.eliteConversions} conversions from {summary.eliteTrials} trials
                </p>
                <p className="text-sm text-muted-foreground">
                  MRR Impact: ${(summary.eliteConversions * 40).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card data-testid="card-conversion-funnel">
        <CardHeader>
          <CardTitle>Trial Conversion Funnel</CardTitle>
          <CardDescription>User journey from Free tier to paid subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Total Artists</div>
                <div className="text-2xl font-bold" data-testid="value-total-artists">{funnel.totalArtists}</div>
                <div className="text-xs text-muted-foreground">Approved accounts</div>
              </div>

              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Free Tier</div>
                <div className="text-2xl font-bold" data-testid="value-free-artists">{funnel.freeArtists}</div>
                <div className="text-xs text-muted-foreground">
                  {((funnel.freeArtists / funnel.totalArtists) * 100).toFixed(1)}% of total
                </div>
              </div>

              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Trial Starters</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="value-trial-starters">
                  {funnel.trialStarters}
                </div>
                <div className="text-xs text-muted-foreground">
                  {funnel.freeToTrialRate.toFixed(1)}% of free users
                </div>
              </div>

              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">Converted</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="value-converted">
                  {funnel.converted}
                </div>
                <div className="text-xs text-muted-foreground">
                  {funnel.trialToConversionRate.toFixed(1)}% of trials
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trial Source Breakdown */}
      <Card data-testid="card-source-breakdown">
        <CardHeader>
          <CardTitle>Trial Sources & Conversion</CardTitle>
          <CardDescription>Performance by trial activation source</CardDescription>
        </CardHeader>
        <CardContent>
          {breakdowns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trial source data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3" data-testid="header-tier">Tier</th>
                    <th className="text-left py-2 px-3" data-testid="header-source">Source</th>
                    <th className="text-right py-2 px-3" data-testid="header-trials">Trials</th>
                    <th className="text-right py-2 px-3" data-testid="header-converted">Converted</th>
                    <th className="text-right py-2 px-3" data-testid="header-rate">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdowns.map((row: any, index: number) => (
                    <tr key={index} className="border-b" data-testid={`row-breakdown-${index}`}>
                      <td className="py-2 px-3">
                        <Badge variant={row.tier === 'pro' ? 'outline' : 'secondary'}>
                          {row.tier}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{row.source}</td>
                      <td className="text-right py-2 px-3">{row.count}</td>
                      <td className="text-right py-2 px-3">{row.converted}</td>
                      <td className="text-right py-2 px-3 font-medium">
                        {row.conversionRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
