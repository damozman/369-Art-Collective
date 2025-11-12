import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";

export default function SubscriptionConfirm() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentIntent = urlParams.get("payment_intent");
    const redirectStatus = urlParams.get("redirect_status");

    async function confirmPayment() {
      if (!redirectStatus) {
        setStatus("failed");
        setMessage("Invalid payment confirmation link");
        return;
      }

      if (redirectStatus === "succeeded") {
        // Payment succeeded, refresh subscription data
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/artists/subscription"] });
        
        setStatus("success");
        setMessage("Your subscription has been successfully activated!");
        
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          setLocation("/artist/dashboard");
        }, 3000);
      } else {
        // Payment failed or was canceled
        setStatus("failed");
        setMessage(
          redirectStatus === "processing" 
            ? "Your payment is still processing. Please check back shortly."
            : "Payment failed or was canceled. You can try again from your settings page."
        );
      }
    }

    confirmPayment();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            {status === "loading" && <Loader2 className="w-6 h-6 animate-spin" />}
            {status === "success" && <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500" />}
            {status === "failed" && <XCircle className="w-6 h-6 text-destructive" />}
            {status === "loading" ? "Processing Payment..." : status === "success" ? "Payment Successful!" : "Payment Failed"}
          </CardTitle>
          <CardDescription>
            {message || "Please wait while we confirm your payment..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
          )}

          {status === "success" && (
            <>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                <p className="text-sm text-green-600 dark:text-green-400">
                  Your subscription is now active. You can now access all premium features!
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Redirecting to dashboard in 3 seconds...
              </p>
            </>
          )}

          {status === "failed" && (
            <div className="space-y-3">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <p className="text-sm text-destructive">
                  {message}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setLocation("/artist/settings")}
                  className="flex-1"
                  data-testid="button-go-to-settings"
                >
                  Go to Settings
                </Button>
                <Button
                  onClick={() => setLocation("/artist/dashboard")}
                  className="flex-1"
                  data-testid="button-go-to-dashboard"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
