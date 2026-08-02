/**
 * The owner's billing screen: what they are on, what they are using, and how to
 * change it.
 *
 * ⚠️ WHAT THIS SCREEN MUST NOT IMPLY. Usage is shown as a guide rail, never as
 * a meter. The bill is the plan they chose (blueprint §12 rule 2), so nothing
 * here may read as "you will be charged more because you paid 47 people". Going
 * over is phrased as a suggestion to move up, because that is exactly what it
 * is — the plan changes when they change it, or at renewal after this notice.
 *
 * The other thing it has to get right is tone in two directions. It tells them
 * when they are OVER their plan, and it tells them when they are paying for
 * more than they need. The second costs us money and is the whole reason the
 * first is believable.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getBilling,
  startCheckout,
  openBillingPortal,
  changePlan,
  type BillingView,
} from "@/lib/admin-api";
import { formatMoney } from "@/lib/portal-money";
import { formatDate } from "@/lib/portal-date";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Cancelled",
};

export function BillingTab({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const billing = useQuery({
    queryKey: ["admin-billing", slug],
    queryFn: () => getBilling(slug),
  });

  /**
   * The toggle starts on whatever they are actually on, not on monthly.
   *
   * Defaulting to monthly showed "billed yearly" in the header while the plan
   * cards below quoted monthly prices and marked the monthly plan "Current" —
   * i.e. the screen contradicted itself about what the customer had chosen.
   * Held as an override so an explicit click still wins until the page reloads.
   */
  const [intervalOverride, setIntervalOverride] = useState<
    "monthly" | "annual" | null
  >(null);
  const interval =
    intervalOverride ?? billing.data?.subscription?.billingInterval ?? "monthly";
  const setInterval = setIntervalOverride;

  const checkout = useMutation({
    mutationFn: (planKey: string) => startCheckout(slug, planKey, interval),
    onSuccess: (result) => {
      // Checkout links are short-lived and single-use, so we navigate rather
      // than store one.
      window.location.href = result.url;
    },
    onError: (err) => setError((err as Error).message),
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(slug),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (err) => setError((err as Error).message),
  });

  const switchPlan = useMutation({
    mutationFn: (planKey: string) => changePlan(slug, planKey, interval),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-billing", slug] });
    },
    onError: (err) => setError((err as Error).message),
  });

  if (billing.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!billing.data) return null;

  const view = billing.data;
  const sub = view.subscription;
  const usage = view.usage;
  const onTrial = sub?.status === "trialing";

  return (
    <div className="space-y-4">
      {sub?.status === "past_due" && (
        <Card className="border-amber-500/50 bg-amber-500/5" data-testid="card-payment-failed">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">We could not take your last payment.</p>
              <p className="mt-1 text-muted-foreground">
                {sub.lastPaymentError ?? "Please update your card."} Everything keeps
                working in the meantime — the people you pay are still being paid.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {view.access.access === "read_only" && (
        <Card className="border-amber-500/50 bg-amber-500/5" data-testid="card-read-only">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">{view.access.message}</p>
              <p className="mt-1 text-muted-foreground">
                Everything you have set up is still here and still visible. Choose a
                plan below to start paying people again.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-current-plan">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Your plan</CardTitle>
              <CardDescription>
                {sub
                  ? `${STATUS_LABEL[sub.status] ?? sub.status}${
                      sub.billingInterval === "annual" ? " · billed yearly" : ""
                    }`
                  : "No subscription"}
              </CardDescription>
            </div>
            {sub && <Badge variant="outline">{planName(view, sub.planKey)}</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-sm">
          {onTrial && sub?.trialEndsAt && (
            <p data-testid="text-trial-ends">
              Your free trial runs until{" "}
              <strong>{formatDate(sub.trialEndsAt)}</strong>. No card needed until then.
            </p>
          )}

          {sub?.status === "active" && (
            <p data-testid="text-renews">
              Renews on <strong>{formatDate(sub.renewsAt)}</strong>.
            </p>
          )}

          {usage && (
            <div className="rounded-md bg-muted/40 p-3">
              <p className="font-medium" data-testid="text-usage">
                {usage.peopleThisPeriod} {usage.peopleThisPeriod === 1 ? "person" : "people"}{" "}
                paid this month
                {usage.peopleLimit !== null && ` of ${usage.peopleLimit} included`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Counted from {formatDate(usage.periodStart)}. Only people who actually
                received a payment count.
              </p>

              {usage.overLimit && (
                <p
                  className="mt-2 text-xs text-amber-700 dark:text-amber-400"
                  data-testid="text-over-limit"
                >
                  {usage.needsCustomPlan
                    ? "That is more than our largest plan covers — get in touch and we'll sort something out."
                    : "That is more than your plan includes. Nobody was stopped from being paid, and your bill has not changed. Move up when it suits you."}
                </p>
              )}
            </div>
          )}

          {view.suggestedDowngradeKey && (
            <div
              className="flex items-start gap-2 rounded-md border p-3"
              data-testid="card-downgrade"
            >
              <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="font-medium">You are paying for more than you use.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {planName(view, view.suggestedDowngradeKey)} would cover the last two
                  months. Switching is up to you — some businesses keep the headroom on
                  purpose.
                </p>
              </div>
            </div>
          )}

          {canWrite && sub?.hasPaymentMethod && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              data-testid="button-billing-portal"
            >
              {portal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Manage payment and invoices
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-plan-choices">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Change plan</CardTitle>
              <CardDescription>
                Priced on how many people you pay in a month, not how many are on your
                books.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {(["monthly", "annual"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setInterval(option)}
                  className={`rounded-md px-3 py-1 text-xs transition-colors ${
                    interval === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`button-billing-interval-${option}`}
                >
                  {option === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {view.plans.map((plan) => {
              const isCurrent = sub?.planKey === plan.key;
              const annual = interval === "annual";
              const headline = annual ? plan.annualPerMonth : plan.monthly;

              return (
                <div
                  key={plan.key}
                  className={`rounded-md border p-4 ${isCurrent ? "border-primary" : ""}`}
                  data-testid={`plan-option-${plan.key}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{plan.name}</p>
                    {isCurrent && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Current
                      </Badge>
                    )}
                  </div>

                  <p className="mt-2 text-2xl font-semibold">
                    {formatMoney(headline.minor, plan.currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      /month
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {annual
                      ? `${formatMoney(plan.annual.minor, plan.currency)} a year — saves ${formatMoney(plan.annualSaving.minor, plan.currency)}`
                      : "Billed monthly"}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Up to {plan.peopleLimit} people paid each month
                  </p>

                  {canWrite && (
                    <Button
                      size="sm"
                      variant={isCurrent ? "outline" : "default"}
                      className="mt-3 w-full"
                      disabled={
                        (isCurrent && sub?.billingInterval === interval) ||
                        checkout.isPending ||
                        switchPlan.isPending
                      }
                      onClick={() =>
                        // While still trialing there is nothing to prorate, so
                        // the plan changes locally. Once Stripe holds a
                        // subscription, the change must happen on their side or
                        // our record and their invoice disagree.
                        sub?.hasPaymentMethod || !onTrial
                          ? checkout.mutate(plan.key)
                          : switchPlan.mutate(plan.key)
                      }
                      data-testid={`button-select-plan-${plan.key}`}
                    >
                      {isCurrent && sub?.billingInterval === interval
                        ? "Current plan"
                        : onTrial && !sub?.hasPaymentMethod
                          ? "Choose"
                          : "Subscribe"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive" data-testid="text-billing-error">
              {error}
            </p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Yearly plans run for the full year you pay for. If you cancel partway
            through, your access continues until the end of that year rather than being
            refunded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function planName(view: BillingView, planKey: string): string {
  return view.plans.find((plan) => plan.key === planKey)?.name ?? planKey;
}
