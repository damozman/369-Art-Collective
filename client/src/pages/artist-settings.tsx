import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { changePasswordSchema, updateArtistProfileSchema, deleteAccountSchema } from "@shared/schema";
import type { Artist } from "@shared/schema";
import { Lock, User, Mail, Type, ArrowLeft, LogOut, Image as ImageIcon, Settings as SettingsIcon, AlertTriangle, Crown, Sparkles, Zap, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loadStripe } from "@stripe/stripe-js";
import { nanoid } from "nanoid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
type UpdateProfileForm = z.infer<typeof updateArtistProfileSchema>;
type DeleteAccountForm = z.infer<typeof deleteAccountSchema>;

export default function ArtistSettings() {
  const { toast } = useToast();
  const { user: authUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [showCancelSubscriptionDialog, setShowCancelSubscriptionDialog] = useState(false);

  // Store idempotency keys to reuse across retries/double-clicks
  const createIdempotencyKeyRef = useRef<string | null>(null);
  const upgradeIdempotencyKeyRef = useRef<string | null>(null);

  const { data: user } = useQuery<Artist>({ queryKey: ["/api/auth/me"] });

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const profileForm = useForm<UpdateProfileForm>({
    resolver: zodResolver(updateArtistProfileSchema),
    defaultValues: {
      name: "",
      email: "",
      artistShort: "",
    },
  });

  // Reset form when user data loads
  useEffect(() => {
    if (user) {
      profileForm.reset({
        name: user.name,
        email: user.email,
        artistShort: user.artistShort,
      });
    }
  }, [user, profileForm]);

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordForm) => {
      return apiRequest("POST", "/api/artists/change-password", data);
    },
    onSuccess: () => {
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      passwordForm.reset();
      setIsChangingPassword(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to change password",
        description: error.message || "Please check your current password and try again.",
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfileForm) => {
      return apiRequest("PATCH", "/api/artists/profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (data: DeleteAccountForm) => {
      return apiRequest("POST", "/api/artists/delete-account", data);
    },
    onSuccess: () => {
      // Invalidate auth cache immediately to prevent redirect loops
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      
      toast({
        title: "Account deleted",
        description: "Your account has been permanently disabled.",
      });
      setShowDeleteDialog(false);
      setDeletePassword("");
      // Redirect to login page after a brief delay
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete account",
        description: error.message || "Please check your password and try again.",
        variant: "destructive",
      });
    },
  });

  const createStripeOnboardingLinkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/artists/stripe/onboarding-link", {});
    },
    onSuccess: (data: any) => {
      // Redirect to Stripe onboarding
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create onboarding link",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const refreshStripeStatusMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/artists/stripe/refresh-status", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Stripe status refreshed",
        description: "Your Stripe account status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to refresh Stripe status",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: subscriptionDetails, isLoading: isLoadingSubscription } = useQuery<{
    tier: "free" | "pro" | "elite";
    status: string | null;
    subscriptionPeriodEnd: string | null;
  }>({
    queryKey: ["/api/artists/subscription"],
    enabled: !!user,
  });

  const upgradeSubscriptionMutation = useMutation({
    mutationFn: async (tier: "pro" | "elite") => {
      // Reuse existing idempotency key or generate new one
      // This ensures retries/double-clicks use the same key
      if (!upgradeIdempotencyKeyRef.current) {
        upgradeIdempotencyKeyRef.current = nanoid();
      }
      const idempotencyKey = upgradeIdempotencyKeyRef.current;
      
      const response = await fetch("/api/artists/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, idempotencyKey }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upgrade subscription");
      }

      return response.json();
    },
    onSuccess: async (data) => {
      // Clear idempotency key after successful completion
      upgradeIdempotencyKeyRef.current = null;
      
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artists/subscription"] });
      
      if (data.requiresPayment && data.clientSecret) {
        if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
          toast({
            title: "Configuration error",
            description: "Stripe not configured.",
            variant: "destructive",
          });
          return;
        }

        const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
        if (!stripe) {
          toast({
            title: "Failed to load Stripe",
            description: "Please try again.",
            variant: "destructive",
          });
          return;
        }

        const { error } = await stripe.confirmPayment({
          clientSecret: data.clientSecret,
          confirmParams: {
            return_url: `${window.location.origin}/artist/subscription/confirm`,
          },
        });

        if (error) {
          toast({
            title: "Payment failed",
            description: error.message || "Please try again.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Subscription upgraded",
          description: "Your subscription tier has been updated successfully.",
        });
      }
    },
    onError: (error: any) => {
      // Clear idempotency key on error to allow fresh retry
      upgradeIdempotencyKeyRef.current = null;
      
      toast({
        title: "Failed to upgrade subscription",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/artists/subscription/cancel", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artists/subscription"] });
      toast({
        title: "Subscription cancelled",
        description: "Your subscription will end at the end of the billing period.",
      });
      setShowCancelSubscriptionDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to cancel subscription",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const reactivateSubscriptionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/artists/subscription/reactivate", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artists/subscription"] });
      toast({
        title: "Subscription reactivated",
        description: "Your subscription has been successfully reactivated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reactivate subscription",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  async function handleUpgradeToTier(tier: "pro" | "elite") {
    if (!subscriptionDetails) return;

    if (subscriptionDetails.tier === "free") {
      // Reuse existing idempotency key or generate new one
      // This ensures retries/double-clicks use the same key
      if (!createIdempotencyKeyRef.current) {
        createIdempotencyKeyRef.current = nanoid();
      }
      const idempotencyKey = createIdempotencyKeyRef.current;
      
      const response = await fetch("/api/artists/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, idempotencyKey }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        // Clear idempotency key on error to allow fresh retry
        createIdempotencyKeyRef.current = null;
        toast({
          title: "Failed to create subscription",
          description: error.message || "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const { clientSecret } = await response.json();

      if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
        toast({
          title: "Configuration error",
          description: "Stripe not configured.",
          variant: "destructive",
        });
        return;
      }

      const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
      if (!stripe) {
        toast({
          title: "Failed to load Stripe",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await stripe.confirmPayment({
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/artist/subscription/confirm`,
        },
      });

      if (error) {
        // Clear idempotency key on payment error to allow fresh retry
        createIdempotencyKeyRef.current = null;
        toast({
          title: "Payment failed",
          description: error.message || "Please try again.",
          variant: "destructive",
        });
      } else {
        // Clear idempotency key after successful payment
        createIdempotencyKeyRef.current = null;
      }
    } else {
      upgradeSubscriptionMutation.mutate(tier);
    }
  }

  function onPasswordSubmit(data: ChangePasswordForm) {
    changePasswordMutation.mutate(data);
  }

  function onProfileSubmit(data: UpdateProfileForm) {
    updateProfileMutation.mutate(data);
  }

  function handleDeleteAccount() {
    if (!deletePassword) {
      toast({
        title: "Password required",
        description: "Please enter your password to confirm account deletion.",
        variant: "destructive",
      });
      return;
    }
    deleteAccountMutation.mutate({ password: deletePassword });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-serif">Artist Portal</h1>
                <p className="text-sm text-muted-foreground">Welcome back, {authUser?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/artist/settings")} data-testid="button-settings">
                <SettingsIcon className="h-5 w-5" />
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/artist/dashboard")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-settings">Account Settings</h1>
              <p className="text-muted-foreground">
                Manage your account details and security settings
              </p>
            </div>
          </div>

          <Separator />

          <Card data-testid="card-profile">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your profile details. Artist initials are used in product SKUs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter your full name"
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="your@email.com"
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="artistShort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Artist Initials</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Type className="w-4 h-4 text-muted-foreground" />
                          <Input
                            {...field}
                            placeholder="JH"
                            maxLength={10}
                            className="uppercase"
                            data-testid="input-artist-short"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-update-profile"
                  >
                    {updateProfileMutation.isPending ? "Updating..." : "Update Profile"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card data-testid="card-password">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Password
              </CardTitle>
              <CardDescription>
                Change your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isChangingPassword ? (
              <Button
                variant="outline"
                onClick={() => setIsChangingPassword(true)}
                data-testid="button-change-password-toggle"
              >
                Change Password
              </Button>
            ) : (
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                    <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter current password"
                            data-testid="input-current-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Enter new password (min 6 characters)"
                            data-testid="input-new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Confirm new password"
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={changePasswordMutation.isPending}
                        data-testid="button-submit-password"
                      >
                        {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsChangingPassword(false);
                          passwordForm.reset();
                        }}
                        data-testid="button-cancel-password"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stripe-connect">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Stripe Connect - Payment Setup
              </CardTitle>
              <CardDescription>
                Connect your bank account to receive automated royalty payouts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user?.stripeOnboardingComplete ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4 space-y-2">
                    <p className="text-sm font-medium">
                      Set up your Stripe account to receive payments
                    </p>
                    <p className="text-sm text-muted-foreground">
                      You'll need to provide:
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Business details (individual or business)</li>
                      <li>Bank account information for payouts</li>
                      <li>Identity verification</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => createStripeOnboardingLinkMutation.mutate()}
                    disabled={createStripeOnboardingLinkMutation.isPending}
                    data-testid="button-setup-stripe"
                  >
                    {createStripeOnboardingLinkMutation.isPending ? "Creating link..." : "Set Up Stripe Account"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 space-y-2">
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      ✓ Stripe Account Connected
                    </p>
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Status:</span> {user.stripePayoutsEnabled ? "Payouts enabled" : "Pending verification"}
                      </p>
                      {user.externalAccountLast4 && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Bank Account:</span> ****{user.externalAccountLast4}
                        </p>
                      )}
                      {user.stripeDefaultCurrency && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Currency:</span> {user.stripeDefaultCurrency.toUpperCase()}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {!user.stripePayoutsEnabled && (
                    <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                        Action Required
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Complete your Stripe onboarding to enable payouts
                      </p>
                      <Button
                        onClick={() => createStripeOnboardingLinkMutation.mutate()}
                        disabled={createStripeOnboardingLinkMutation.isPending}
                        className="mt-2"
                        data-testid="button-resume-stripe"
                      >
                        {createStripeOnboardingLinkMutation.isPending ? "Creating link..." : "Resume Onboarding"}
                      </Button>
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={() => refreshStripeStatusMutation.mutate()}
                    disabled={refreshStripeStatusMutation.isPending}
                    data-testid="button-refresh-stripe"
                  >
                    {refreshStripeStatusMutation.isPending ? "Refreshing..." : "Refresh Status"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-subscription">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {subscriptionDetails?.tier === "elite" ? (
                  <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                ) : subscriptionDetails?.tier === "pro" ? (
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Zap className="w-5 h-5" />
                )}
                Subscription Plan
              </CardTitle>
              <CardDescription>
                Manage your subscription tier and billing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSubscription ? (
                <p className="text-sm text-muted-foreground">Loading subscription details...</p>
              ) : subscriptionDetails ? (
                <>
                  {/* Current tier display */}
                  <div className="rounded-lg bg-muted p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Current Plan</p>
                        <p className="text-2xl font-bold capitalize">{subscriptionDetails.tier}</p>
                        {subscriptionDetails.tier !== "free" && (
                          <p className="text-sm text-muted-foreground">
                            ${subscriptionDetails.tier === "pro" ? "15" : "40"}/month
                          </p>
                        )}
                      </div>
                      <Badge variant={subscriptionDetails.status === "active" ? "default" : "outline"} className="capitalize">
                        {subscriptionDetails.status || "free"}
                      </Badge>
                    </div>

                    {/* Subscription status info */}
                    {subscriptionDetails.tier !== "free" && subscriptionDetails.subscriptionPeriodEnd && (
                      <div className="border-t pt-3">
                        <p className="text-xs text-muted-foreground">
                          {subscriptionDetails.status === "canceled" 
                            ? `Access until ${new Date(subscriptionDetails.subscriptionPeriodEnd).toLocaleDateString()}`
                            : `Renews on ${new Date(subscriptionDetails.subscriptionPeriodEnd).toLocaleDateString()}`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Tier benefits */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Your Benefits:</p>
                    <ul className="space-y-1 text-sm">
                      {subscriptionDetails.tier === "free" && (
                        <>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>30% royalty rate</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>Up to 20 artworks</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <X className="w-4 h-4 mt-0.5 text-muted-foreground" />
                            <span className="text-muted-foreground">No AI Art Studio</span>
                          </li>
                        </>
                      )}
                      {subscriptionDetails.tier === "pro" && (
                        <>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span><strong>35% minimum</strong> royalty</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span><strong>Unlimited</strong> artworks</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>AI Art Studio access</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>Priority support</span>
                          </li>
                        </>
                      )}
                      {subscriptionDetails.tier === "elite" && (
                        <>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span><strong>45% guaranteed</strong> royalty</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span><strong>Unlimited</strong> artworks</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>Full AI Art Studio</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>Profile customization</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                            <span>Featured placement</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Upgrade/downgrade actions */}
                  <div className="space-y-2">
                    {subscriptionDetails.tier === "free" && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Upgrade to unlock more features:</p>
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            onClick={() => handleUpgradeToTier("pro")}
                            disabled={upgradeSubscriptionMutation.isPending}
                            className="flex-1"
                            data-testid="button-upgrade-pro"
                          >
                            {upgradeSubscriptionMutation.isPending ? "Processing..." : "Upgrade to Pro ($15/mo)"}
                          </Button>
                          <Button
                            variant="default"
                            onClick={() => handleUpgradeToTier("elite")}
                            disabled={upgradeSubscriptionMutation.isPending}
                            className="flex-1"
                            data-testid="button-upgrade-elite"
                          >
                            {upgradeSubscriptionMutation.isPending ? "Processing..." : "Upgrade to Elite ($40/mo)"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {subscriptionDetails.tier === "pro" && (
                      <div className="space-y-2">
                        <Button
                          variant="default"
                          onClick={() => handleUpgradeToTier("elite")}
                          disabled={upgradeSubscriptionMutation.isPending}
                          data-testid="button-upgrade-elite"
                        >
                          {upgradeSubscriptionMutation.isPending ? "Processing..." : "Upgrade to Elite ($40/mo)"}
                        </Button>
                      </div>
                    )}

                    {subscriptionDetails.tier !== "free" && subscriptionDetails.status === "canceled" && (
                      <Button
                        variant="default"
                        onClick={() => reactivateSubscriptionMutation.mutate()}
                        disabled={reactivateSubscriptionMutation.isPending}
                        data-testid="button-reactivate-subscription"
                      >
                        {reactivateSubscriptionMutation.isPending ? "Reactivating..." : "Reactivate Subscription"}
                      </Button>
                    )}

                    {subscriptionDetails.tier !== "free" && subscriptionDetails.status === "active" && (
                      <Button
                        variant="outline"
                        onClick={() => setShowCancelSubscriptionDialog(true)}
                        data-testid="button-cancel-subscription"
                      >
                        Cancel Subscription
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Unable to load subscription details</p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-delete-account" className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Delete Account
              </CardTitle>
              <CardDescription>
                Permanently disable your artist account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-destructive/10 p-4 space-y-2" data-testid="text-delete-warning">
                <p className="text-sm font-medium text-destructive">
                  Warning: This action cannot be undone
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Your account will be permanently disabled</li>
                  <li>You will no longer be able to log in or upload artwork</li>
                  <li>Your products in Shopify will remain available for purchase</li>
                  <li>Existing orders and earnings will continue to be processed</li>
                </ul>
              </div>

              <div className="space-y-2">
                <label htmlFor="delete-password" className="text-sm font-medium">
                  Confirm your password to delete your account
                </label>
                <Input
                  id="delete-password"
                  type="password"
                  placeholder="Enter your password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  data-testid="input-delete-password"
                />
              </div>

              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                disabled={!deletePassword || deleteAccountMutation.isPending}
                data-testid="button-delete-account"
              >
                {deleteAccountMutation.isPending ? "Deleting..." : "Delete My Account"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently disable your artist account. Your products will remain in 
              the store, but you will no longer be able to log in or manage your account.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Yes, delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelSubscriptionDialog} onOpenChange={setShowCancelSubscriptionDialog}>
        <AlertDialogContent data-testid="dialog-cancel-subscription">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will remain active until the end of the current billing period. 
              You can reactivate it at any time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-cancel-subscription">
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelSubscriptionMutation.mutate()}
              data-testid="button-confirm-cancel-subscription"
            >
              Yes, cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
