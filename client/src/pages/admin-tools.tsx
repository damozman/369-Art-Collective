import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { RefreshCw, Gift, ArrowLeft, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";

const resetCreditsSchema = z.object({
  email: z.string().email("Must be a valid email"),
  notes: z.string().optional(),
});

const grantCompTierSchema = z.object({
  email: z.string().email("Must be a valid email"),
  tier: z.enum(["free", "pro", "elite"]),
  notes: z.string().optional(),
});

type ResetCreditsForm = z.infer<typeof resetCreditsSchema>;
type GrantCompTierForm = z.infer<typeof grantCompTierSchema>;

export default function AdminTools() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [resetResult, setResetResult] = useState<any>(null);
  const [tierResult, setTierResult] = useState<any>(null);

  const resetCreditsForm = useForm<ResetCreditsForm>({
    defaultValues: {
      email: "",
      notes: "",
    },
  });

  const grantTierForm = useForm<GrantCompTierForm>({
    defaultValues: {
      email: "",
      tier: "pro",
      notes: "",
    },
  });

  const resetCreditsMutation = useMutation({
    mutationFn: async (data: ResetCreditsForm) => {
      const response = await apiRequest("POST", "/api/admin/reset-credits", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Credits reset",
        description: data.message,
      });
      setResetResult(data.artist);
      resetCreditsForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset credits",
        description: error.message || "Please check the email and try again.",
        variant: "destructive",
      });
      setResetResult(null);
    },
  });

  const grantTierMutation = useMutation({
    mutationFn: async (data: GrantCompTierForm) => {
      const response = await apiRequest("POST", "/api/admin/grant-comp-tier", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Tier granted",
        description: data.message,
      });
      setTierResult(data.artist);
      grantTierForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant tier",
        description: error.message || "Please check the email and try again.",
        variant: "destructive",
      });
      setTierResult(null);
    },
  });

  function onResetCreditsSubmit(data: ResetCreditsForm) {
    setResetResult(null);
    resetCreditsMutation.mutate(data);
  }

  function onGrantTierSubmit(data: GrantCompTierForm) {
    setTierResult(null);
    grantTierMutation.mutate(data);
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
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
            <h1 className="text-3xl font-bold" data-testid="heading-admin-tools">Admin Tools</h1>
            <p className="text-muted-foreground">
              Manage artist credits and subscription tiers
            </p>
          </div>
        </div>

        <Separator />

        {/* Reset Artist Credits Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              <CardTitle>Reset Artist Credits</CardTitle>
            </div>
            <CardDescription>
              Reset an artist's monthly AI upscale quota to maximum for their current tier
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...resetCreditsForm}>
              <form onSubmit={resetCreditsForm.handleSubmit(onResetCreditsSubmit)} className="space-y-4">
                <FormField
                  control={resetCreditsForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Artist Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            placeholder="artist@example.com" 
                            {...field} 
                            className="pl-10"
                            data-testid="input-reset-email"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter the artist's email address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={resetCreditsForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Reason for credit reset..." 
                          {...field} 
                          data-testid="input-reset-notes"
                        />
                      </FormControl>
                      <FormDescription>
                        Internal notes about why credits were reset
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={resetCreditsMutation.isPending}
                  data-testid="button-reset-credits"
                >
                  {resetCreditsMutation.isPending ? "Resetting..." : "Reset Credits"}
                </Button>
              </form>
            </Form>

            {resetResult && (
              <Alert data-testid="alert-reset-success">
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">Success!</p>
                    <p><strong>Artist:</strong> {resetResult.name} ({resetResult.email})</p>
                    <p><strong>Tier:</strong> {resetResult.tier}</p>
                    <p><strong>Previous Used:</strong> {resetResult.previousUsed}</p>
                    <p><strong>New Quota:</strong> {resetResult.newQuota === 'unlimited' ? 'Unlimited' : `${resetResult.newQuota} upscales/month`}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Grant Comp Tier Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              <CardTitle>Grant Complimentary Tier</CardTitle>
            </div>
            <CardDescription>
              Give an artist Pro or Elite tier without Stripe subscription (promotional or partnership deals)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...grantTierForm}>
              <form onSubmit={grantTierForm.handleSubmit(onGrantTierSubmit)} className="space-y-4">
                <FormField
                  control={grantTierForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Artist Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input 
                            placeholder="artist@example.com" 
                            {...field} 
                            className="pl-10"
                            data-testid="input-tier-email"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter the artist's email address
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={grantTierForm.control}
                  name="tier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-tier">
                            <SelectValue placeholder="Select a tier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="free" data-testid="option-tier-free">Free (30% royalty, 20 artworks, 5 upscales/month)</SelectItem>
                          <SelectItem value="pro" data-testid="option-tier-pro">Pro (35% royalty, unlimited artworks, 25 upscales/month)</SelectItem>
                          <SelectItem value="elite" data-testid="option-tier-elite">Elite (45% royalty, unlimited artworks, unlimited upscales)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose the tier to grant
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={grantTierForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Reason for granting comp tier..." 
                          {...field} 
                          data-testid="input-tier-notes"
                        />
                      </FormControl>
                      <FormDescription>
                        Internal notes about why tier was granted
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={grantTierMutation.isPending}
                  data-testid="button-grant-tier"
                >
                  {grantTierMutation.isPending ? "Granting..." : "Grant Tier"}
                </Button>
              </form>
            </Form>

            {tierResult && (
              <Alert data-testid="alert-tier-success">
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-semibold">Success!</p>
                    <p><strong>Artist:</strong> {tierResult.name} ({tierResult.email})</p>
                    <p><strong>Previous Tier:</strong> {tierResult.previousTier}</p>
                    <p><strong>New Tier:</strong> {tierResult.newTier}</p>
                    <p><strong>Status:</strong> {tierResult.subscriptionStatus || 'Free'}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Artist will receive an email notification about their new benefits.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> All admin actions are logged for security and compliance. 
            Artists will receive email notifications when their tier changes.
          </p>
        </div>
      </div>
    </div>
  );
}
