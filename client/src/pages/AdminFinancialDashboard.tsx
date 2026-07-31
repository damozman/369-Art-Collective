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

  const { artists, productSales, needsReview } = data;

  // Server returns integer minor units; format at the edge.
  const fmt = (minor: number) =>
    `$${(minor / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <>
      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-gross-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-gross-revenue">
              {fmt(productSales.grossRevenueMinor)}
            </div>
            <p className="text-xs text-muted-foreground">
              {productSales.totalOrders} line items · {fmt(productSales.averageOrderValueMinor)} avg
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-net-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net After Costs</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-net-revenue">
              {fmt(productSales.netMinor)}
            </div>
            <p className="text-xs text-muted-foreground">
              After production, shipping &amp; processing
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-platform-margin">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Margin</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="value-platform-margin">
              {fmt(productSales.platformMarginMinor)}
            </div>
            <p className="text-xs text-muted-foreground">
              {fmt(productSales.artistRoyaltiesMinor)} paid to artists
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
              {artists.activeCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card data-testid="card-cost-breakdown">
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
            <CardDescription>
              Snapshotted at the time of each sale, not looked up later
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Production (Printify)</span>
              <span className="text-sm font-bold" data-testid="value-production-cost">
                {fmt(productSales.productionCostMinor)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Shipping</span>
              <span className="text-sm font-bold" data-testid="value-shipping-cost">
                {fmt(productSales.shippingCostMinor)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Payment processing</span>
              <span className="text-sm font-bold" data-testid="value-processing-fee">
                {fmt(productSales.processingFeeMinor)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Artist royalties</span>
              <span className="text-sm font-bold" data-testid="value-artist-royalties">
                {fmt(productSales.artistRoyaltiesMinor)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-needs-review">
          <CardHeader>
            <CardTitle>Held for review</CardTitle>
            <CardDescription>
              Line items whose costs could not be resolved. No royalty has been
              calculated for these — they are waiting on a human, not accruing
              silently against an assumed cost.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {needsReview.orderCount > 0 ? (
                <Clock className="h-5 w-5 text-amber-500" />
              ) : (
                <UserCheck className="h-5 w-5 text-emerald-500" />
              )}
              <div className="text-2xl font-bold" data-testid="value-needs-review-count">
                {needsReview.orderCount}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {needsReview.orderCount === 0
                ? "Every line item was costed successfully."
                : `${fmt(needsReview.grossRevenueMinor)} of revenue awaiting cost resolution`}
            </p>
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
  if (isLoading) {
    return <Card><CardContent className="p-6">Loading product costs...</CardContent></Card>;
  }

  const costs: any[] = data?.costs ?? [];

  if (costs.length === 0) {
    return <Card><CardContent className="p-6">No product costs available</CardContent></Card>;
  }

  const fmt = (minor: number) => `$${(minor / 100).toFixed(2)}`;

  const sourceLabel: Record<string, { text: string; variant: "default" | "secondary" | "destructive" }> = {
    "printify-catalog": { text: "Live (catalog)", variant: "default" },
    "printify-product": { text: "Live (product)", variant: "default" },
    fixture: { text: "Fixture — not real pricing", variant: "secondary" },
    unresolved: { text: "Unresolved", variant: "destructive" },
  };

  return (
    <Card data-testid="card-printify-costs">
      <CardHeader>
        <CardTitle>Product costs</CardTitle>
        <CardDescription>
          Resolved through the same path used to cost a real sale. The source
          column says where each number came from — anything not marked live is
          not pricing truth.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Product</th>
                <th className="py-2 pr-4 font-medium">Production</th>
                <th className="py-2 pr-4 font-medium">Shipping (US)</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => {
                const label = sourceLabel[c.source] ?? { text: c.source, variant: "secondary" as const };
                return (
                  <tr key={`${c.finish}-${c.size}`} className="border-b last:border-0">
                    <td className="py-2 pr-4">{c.finish} {c.size}</td>
                    <td className="py-2 pr-4">{c.error ? "—" : fmt(c.productionMinor)}</td>
                    <td className="py-2 pr-4">{c.error ? "—" : fmt(c.shippingMinor)}</td>
                    <td className="py-2">
                      <Badge variant={label.variant}>{label.text}</Badge>
                      {c.error && (
                        <span className="ml-2 text-xs text-muted-foreground">{c.error}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
