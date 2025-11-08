import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ShoppingCart, AlertCircle } from "lucide-react";
import type { Kit } from "@shared/schema";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Checkout() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const searchParams = new URLSearchParams(window.location.search);
  const kitId = searchParams.get('kitId');
  const canceled = searchParams.get('canceled');

  useEffect(() => {
    document.title = "Checkout - 247 CreatorStack";
  }, []);

  const { data: kit, isLoading, error } = useQuery<Kit>({
    queryKey: ["/api/kits", kitId],
    queryFn: async () => {
      if (!kitId) throw new Error("Kit ID is required");
      const res = await fetch(`/api/kits?kitId=${kitId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to fetch kit");
      }
      const kits = await res.json();
      if (!Array.isArray(kits) || kits.length === 0) {
        throw new Error("Kit not found");
      }
      return kits[0];
    },
    enabled: !!kitId,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (data: { kitId: string; price: string }) => {
      const res = await apiRequest("POST", "/api/create-checkout-session", data);
      return await res.json() as { url: string };
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: "Checkout Failed",
        description: error.message || "Failed to create checkout session",
        variant: "destructive",
      });
    },
  });

  const handleCheckout = () => {
    if (!kitId || !kit) return;
    checkoutMutation.mutate({ 
      kitId, 
      price: kit.price 
    });
  };

  if (!kitId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>No kit selected for checkout</CardDescription>
          </CardHeader>
          <CardFooter>
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">
                Browse Kits
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-back-dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Checkout</h1>
              <p className="text-sm text-muted-foreground">
                Complete your purchase
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {canceled && (
          <Alert className="mb-6" data-testid="alert-canceled">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Payment was canceled. You can try again below.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle>Error Loading Kit</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load kit details"}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/dashboard">
                <Button variant="outline" className="w-full">
                  Back to Dashboard
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}

        {isLoading && (
          <Card data-testid="skeleton-checkout">
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-full" />
            </CardFooter>
          </Card>
        )}

        {!isLoading && !error && kit && (
          <Card data-testid="card-checkout">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle data-testid="text-kit-name">{kit.name}</CardTitle>
                  <CardDescription className="mt-2">
                    AI automation kit for creators
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold" data-testid="text-kit-price">
                    ${kit.price}
                  </div>
                  <div className="text-sm text-muted-foreground">one-time</div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">What's included:</h3>
                <p className="text-sm text-muted-foreground" data-testid="text-kit-description">
                  {kit.promptTemplate}
                </p>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${kit.price}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span data-testid="text-total-price">${kit.price} USD</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={handleCheckout}
                disabled={checkoutMutation.isPending}
                data-testid="button-proceed-checkout"
              >
                <ShoppingCart className="w-4 h-4" />
                {checkoutMutation.isPending ? "Redirecting..." : "Proceed to Payment"}
              </Button>
              <Link href="/dashboard" className="w-full">
                <Button 
                  variant="ghost" 
                  className="w-full"
                  data-testid="button-cancel-checkout"
                >
                  Cancel
                </Button>
              </Link>
            </CardFooter>
          </Card>
        )}
      </main>
    </div>
  );
}
