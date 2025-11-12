import { useQuery } from "@tanstack/react-query";

export interface SubscriptionStatus {
  tier: "free" | "pro" | "elite";
  status: string | null;
  subscriptionPeriodEnd: string | null;
  trialEndsAt: string | null;
  isOnTrial: boolean;
  trialDaysRemaining: number | null;
  trialEndDate: Date | null;
}

export type SubscriptionStatusOrNull = SubscriptionStatus | null;

/**
 * Shared hook for subscription status across all components
 * Centralizes trial logic and countdown calculations
 */
export function useSubscriptionStatus() {
  const { data, isLoading, error } = useQuery<{
    tier: "free" | "pro" | "elite";
    status: string | null;
    subscriptionPeriodEnd: string | null;
    trialEndsAt: string | null;
  }>({
    queryKey: ["/api/artists/subscription"],
  });

  // Return null while loading to prevent showing wrong tier to paid users
  if (isLoading || !data) {
    return {
      subscriptionDetails: null,
      isLoading,
      error,
    };
  }

  const trialEndDate = data.trialEndsAt ? new Date(data.trialEndsAt) : null;
  const isOnTrial = !!trialEndDate && trialEndDate > new Date();
  
  // Calculate days remaining, clamped at 0 to avoid negative values
  const trialDaysRemaining = trialEndDate 
    ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const subscriptionDetails: SubscriptionStatus = {
    ...data,
    isOnTrial,
    trialDaysRemaining,
    trialEndDate,
  };

  return {
    subscriptionDetails,
    isLoading,
    error,
  };
}

/**
 * Utility to format trial status for display
 */
export function getTrialStatusText(status: SubscriptionStatus): string {
  if (!status.isOnTrial || status.trialDaysRemaining === null) {
    return "";
  }

  if (status.trialDaysRemaining === 0) {
    return "Trial ending today";
  }

  if (status.trialDaysRemaining === 1) {
    return "1 day left in trial";
  }

  return `${status.trialDaysRemaining} days left in trial`;
}

/**
 * Get trial CTA text for a given tier
 */
export function getTrialCTAText(tier: "pro" | "elite"): string {
  return tier === "pro" 
    ? "Start 14-Day Trial (Pro)" 
    : "Start 7-Day Trial (Elite)";
}

/**
 * Get paid CTA text for a given tier (fallback when trials not available)
 */
export function getPaidCTAText(tier: "pro" | "elite"): string {
  return tier === "pro" 
    ? "Upgrade to Pro ($15/mo)" 
    : "Upgrade to Elite ($40/mo)";
}
