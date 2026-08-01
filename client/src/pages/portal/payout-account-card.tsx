/**
 * "Can I actually be paid?" — the contributor's payout setup.
 *
 * WHY THIS IS THE FIRST THING ON THE PAGE WHEN IT ISN'T DONE. A balance the
 * person cannot withdraw is worse than no balance: they watch it grow, assume
 * payment is coming, and find out it never was at the point they need the
 * money. Until the account is ready this card sits above the balance and says
 * so plainly. Once it is ready it collapses to a single quiet line.
 *
 * TWO THINGS THIS SCREEN REFUSES TO DO:
 *
 * 1. **It never says "you're set up" because the flow finished.** Coming back
 *    from Stripe means the form was submitted, not that Stripe approved
 *    anything — it routinely asks for documents afterwards. The screen shows
 *    what the *server* last heard from Stripe, and the server only learns it by
 *    asking. So returning from onboarding triggers a refresh rather than an
 *    assumption.
 *
 * 2. **It never collects bank details itself.** The whole flow is hosted by
 *    Stripe. Account numbers and tax IDs never touch this application, which is
 *    the only way to be sure they cannot leak from it.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/portal-date";
import {
  getPayoutAccount,
  refreshPayoutAccount,
  startPayoutOnboarding,
  PortalApiError,
  type PortalPayoutAccount,
} from "@/lib/portal-api";

/**
 * Did the person just come back from Stripe?
 *
 * `?payouts=returned` is set on the return URL and `?payouts=expired` on the
 * refresh URL. Read once and stripped from the address bar, so a reload does
 * not re-trigger the refresh and a shared link does not carry it.
 */
function useReturnedFromStripe(): "returned" | "expired" | null {
  const [flag, setFlag] = useState<"returned" | "expired" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("payouts");
    if (value !== "returned" && value !== "expired") return;

    setFlag(value);
    params.delete("payouts");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );
  }, []);

  return flag;
}

const PRESENTATION: Record<
  PortalPayoutAccount["state"],
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  not_started: {
    label: "Not set up",
    tone: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    Icon: AlertCircle,
  },
  pending: {
    label: "In progress",
    tone: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    Icon: Clock,
  },
  restricted: {
    label: "Paused",
    tone: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
    Icon: AlertCircle,
  },
  ready: {
    label: "Ready",
    tone: "border-border bg-card",
    Icon: CheckCircle2,
  },
};

export function PayoutAccountCard({ tenantSlug }: { tenantSlug: string }) {
  const queryClient = useQueryClient();
  const returned = useReturnedFromStripe();
  const [error, setError] = useState<string | null>(null);

  const accountQuery = useQuery({
    queryKey: ["portal-payout-account", tenantSlug],
    queryFn: () => getPayoutAccount(tenantSlug),
  });

  const refresh = useMutation({
    mutationFn: () => refreshPayoutAccount(tenantSlug),
    onSuccess: (status) => {
      setError(null);
      queryClient.setQueryData(["portal-payout-account", tenantSlug], status);
    },
    onError: (err: unknown) => {
      setError(
        err instanceof PortalApiError
          ? err.message
          : "Couldn't check with Stripe just now. Try again in a moment."
      );
    },
  });

  const start = useMutation({
    mutationFn: () => startPayoutOnboarding(tenantSlug),
    onSuccess: ({ url }) => {
      setError(null);
      // A full navigation, not a new tab. Stripe's flow returns to us, and a
      // popup that gets blocked looks to the person like a broken button.
      window.location.assign(url);
    },
    onError: (err: unknown) => {
      setError(
        err instanceof PortalApiError
          ? err.message
          : "Couldn't start payment setup. Try again in a moment."
      );
    },
  });

  // Coming back from Stripe proves the form was submitted, nothing more. Ask
  // the server to ask Stripe.
  useEffect(() => {
    if (returned === "returned") refresh.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned]);

  if (accountQuery.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Getting paid</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-64" />
        </CardContent>
      </Card>
    );
  }

  if (accountQuery.isError || !accountQuery.data) {
    return null;
  }

  const account = accountQuery.data;
  const { label, tone, Icon } = PRESENTATION[account.state];
  const busy = start.isPending || refresh.isPending;

  return (
    <Card className={cn("border", tone)} data-testid="payout-account-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          Getting paid
        </CardTitle>
        <Badge variant={account.canReceivePayouts ? "secondary" : "outline"}>{label}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{account.message}</p>

        {returned === "expired" && (
          <p className="text-sm text-muted-foreground">
            That setup link had expired — they only last a few minutes. Start again below.
          </p>
        )}

        {account.outstanding.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Stripe still needs:</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {account.outstanding.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!account.canReceivePayouts && (
            <Button
              onClick={() => start.mutate()}
              disabled={busy}
              data-testid="button-start-payout-setup"
            >
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              {account.state === "not_started" ? "Set up payments" : "Continue setup"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refresh.mutate()}
            disabled={busy}
            data-testid="button-refresh-payout-account"
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", refresh.isPending && "animate-spin")}
              aria-hidden
            />
            Check again
          </Button>
        </div>

        {account.lastCheckedAt && (
          <p className="text-xs text-muted-foreground">
            Last checked with Stripe on {formatDate(account.lastCheckedAt)}.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Your bank details go straight to Stripe and are never stored here.
        </p>
      </CardContent>
    </Card>
  );
}
