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
import { RefreshCw, ArrowLeft, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { Alert, AlertDescription } from "@/components/ui/alert";

const resetCreditsSchema = z.object({
  email: z.string().email("Must be a valid email"),
  notes: z.string().optional(),
});

type ResetCreditsForm = z.infer<typeof resetCreditsSchema>;

export default function AdminTools() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [resetResult, setResetResult] = useState<any>(null);

  const resetCreditsForm = useForm<ResetCreditsForm>({
    defaultValues: {
      email: "",
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

  function onResetCreditsSubmit(data: ResetCreditsForm) {
    setResetResult(null);
    resetCreditsMutation.mutate(data);
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
                    <p><strong>Previous Used:</strong> {resetResult.previousUsed}</p>
                    <p><strong>New Quota:</strong> {resetResult.newQuota} upscales/month</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>


        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> All admin actions are logged for security and compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
