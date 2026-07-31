/**
 * The contributor's view of their own earnings.
 *
 * Three questions, in the order they get asked:
 *   1. What am I owed, and how much of it can I actually have right now?
 *   2. Where did that come from, and how was each number worked out?
 *   3. What have I already been paid?
 *
 * The balance row answers (1) by splitting the balance into *available* and
 * *held* rather than showing one number. A single balance is the thing that
 * generates support email: a contributor sees $87.44, requests it, gets $65.58,
 * and assumes they have been shortchanged. Held money is shown as its own
 * figure, with its reason, on the same screen.
 *
 * Every amount is formatted from its minor-unit STRING. Nothing here calls
 * `Number` on money, and nothing recomputes a derivation — see
 * `statement-line.tsx`.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, LogOut, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate, startOfYearIso, todayIso } from "@/lib/portal-date";
import { formatMoney, isPositive, isZero } from "@/lib/portal-money";
import {
  getPayouts,
  getStatement,
  logout,
  type PortalMe,
  type PortalPayout,
} from "@/lib/portal-api";
import { StatementLineRow } from "./statement-line";

export function PortalDashboard({ me, onSignedOut }: { me: PortalMe; onSignedOut: () => void }) {
  const [from, setFrom] = useState(startOfYearIso());
  const [to, setTo] = useState(todayIso());

  const currency = me.currency;

  const statementQuery = useQuery({
    queryKey: ["portal-statement", me.tenant.slug, me.contributorId, from, to],
    queryFn: () => getStatement(me.tenant.slug, { from, to }),
  });

  const payoutsQuery = useQuery({
    queryKey: ["portal-payouts", me.tenant.slug, me.contributorId],
    queryFn: () => getPayouts(me.tenant.slug),
  });

  async function handleSignOut() {
    try {
      await logout(me.tenant.slug);
    } finally {
      // Sign out locally even if the request failed — leaving someone looking
      // at a page they believe they have left is worse than a stale cookie.
      onSignedOut();
    }
  }

  const held = me.heldMinor;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-sm text-muted-foreground">{me.tenant.name}</p>
            <h1 className="text-xl font-semibold" data-testid="text-contributor-name">
              {me.name}
            </h1>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            data-testid="button-portal-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        {/* ---- What am I owed ---- */}
        <section className="grid gap-4 sm:grid-cols-3">
          <BalanceCard
            label="Available now"
            amountMinor={me.payableMinor}
            currency={currency}
            icon={<Wallet className="h-4 w-4" />}
            emphasis
            testId="card-payable"
          />
          <BalanceCard
            label="Held"
            amountMinor={held}
            currency={currency}
            icon={<Clock className="h-4 w-4" />}
            held={isPositive(held)}
            testId="card-held"
          />
          <BalanceCard
            label="Total balance"
            amountMinor={me.balanceMinor}
            currency={currency}
            testId="card-balance"
          />
        </section>

        {/*
          The banner is driven by the STATEMENT's held total, not the balance
          card's, because the two are different measures and can legitimately
          disagree.

          `/me` reports held as `balance − payable`: the part of the *all-time
          balance* that cannot be withdrawn. The statement reports the sum of
          held *lines in the selected period*. Normally these match. They come
          apart when payouts or reversals have drawn the balance below the
          held-line total — the balance figure then floors, and reports less
          held money than there are held lines on screen.

          Reading the balance figure here would put "Held $0.00" directly above
          rows badged "Held", which is precisely the kind of unexplained
          discrepancy this product exists to eliminate. So the banner is scoped
          to what the contributor is actually looking at, and says so.
        */}
        {statementQuery.data && isPositive(statementQuery.data.totals.held.minor) && (
          <p
            className="rounded-md border border-amber-500/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
            data-testid="text-held-explainer"
          >
            <strong>
              {formatMoney(statementQuery.data.totals.held.minor, currency)}
            </strong>{" "}
            of the earnings shown below is still inside the refund window. It is yours — it just
            cannot be paid out until the window closes. Each held line shows the date it becomes
            available.
          </p>
        )}

        {/* ---- Where did it come from ---- */}
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-semibold">Statement</h2>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="portal-from" className="text-xs">
                  From
                </Label>
                <Input
                  id="portal-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 w-[9.5rem]"
                  data-testid="input-statement-from"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="portal-to" className="text-xs">
                  To
                </Label>
                <Input
                  id="portal-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 w-[9.5rem]"
                  data-testid="input-statement-to"
                />
              </div>
            </div>
          </div>

          <Card>
            {statementQuery.isLoading && (
              <CardContent className="space-y-3 py-6">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-3/4" />
              </CardContent>
            )}

            {statementQuery.isError && (
              <CardContent className="py-6">
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {(statementQuery.error as Error).message}
                </p>
              </CardContent>
            )}

            {statementQuery.data && (
              <>
                {/*
                  The plain-language summary the server already writes. Shown
                  first and prominently — it is the sentence that answers
                  "did something change, and why" before any table does.
                */}
                <CardContent className="border-b border-border py-4">
                  <p className="text-sm" data-testid="text-statement-summary">
                    {statementQuery.data.summary}
                  </p>
                </CardContent>

                <CardContent className="px-0 py-0">
                  {statementQuery.data.lines.length === 0 ? (
                    <p
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                      data-testid="text-statement-empty"
                    >
                      No activity between {formatDate(from)} and {formatDate(to)}.
                    </p>
                  ) : (
                    statementQuery.data.lines.map((line, index) => (
                      <StatementLineRow
                        key={`${line.occurredAt}-${line.type}-${index}`}
                        line={line}
                        currency={statementQuery.data.currency}
                      />
                    ))
                  )}
                </CardContent>

                <CardContent className="border-t border-border py-4">
                  <dl className="space-y-1 text-sm">
                    <TotalRow
                      label="Opening balance"
                      minor={statementQuery.data.openingBalance.minor}
                      currency={currency}
                    />
                    <TotalRow
                      label="Earned"
                      minor={statementQuery.data.totals.earned.minor}
                      currency={currency}
                    />
                    {!isZero(statementQuery.data.totals.reversed.minor) && (
                      <TotalRow
                        label="Reversed (refunds and chargebacks)"
                        minor={statementQuery.data.totals.reversed.minor}
                        currency={currency}
                      />
                    )}
                    {!isZero(statementQuery.data.totals.adjustments.minor) && (
                      <TotalRow
                        label="Adjustments"
                        minor={statementQuery.data.totals.adjustments.minor}
                        currency={currency}
                      />
                    )}
                    {!isZero(statementQuery.data.totals.paidOut.minor) && (
                      <TotalRow
                        label="Paid out"
                        minor={statementQuery.data.totals.paidOut.minor}
                        currency={currency}
                      />
                    )}
                    <TotalRow
                      label="Closing balance"
                      minor={statementQuery.data.totals.closingBalance.minor}
                      currency={currency}
                      strong
                      testId="text-closing-balance"
                    />
                  </dl>
                </CardContent>
              </>
            )}
          </Card>
        </section>

        {/* ---- What have I been paid ---- */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Payouts</h2>

          <Card>
            <CardContent className="px-0 py-0">
              {payoutsQuery.isLoading && (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-1/3" />
                </div>
              )}

              {payoutsQuery.data?.payouts.length === 0 && (
                <p
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  data-testid="text-payouts-empty"
                >
                  No payouts yet.
                </p>
              )}

              {payoutsQuery.data?.payouts.map((payout) => (
                <PayoutRow key={payout.id} payout={payout} />
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function BalanceCard({
  label,
  amountMinor,
  currency,
  icon,
  emphasis,
  held,
  testId,
}: {
  label: string;
  amountMinor: string;
  currency: string;
  icon?: React.ReactNode;
  emphasis?: boolean;
  held?: boolean;
  testId: string;
}) {
  return (
    <Card className={cn(held && "border-amber-500/50")} data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
            emphasis && "text-primary",
            held && "text-amber-700 dark:text-amber-400"
          )}
        >
          {formatMoney(amountMinor, currency)}
        </p>
      </CardContent>
    </Card>
  );
}

function TotalRow({
  label,
  minor,
  currency,
  strong,
  testId,
}: {
  label: string;
  minor: string;
  currency: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "font-semibold")}>
      <dt>{label}</dt>
      <dd className="tabular-nums" data-testid={testId}>
        {formatMoney(minor, currency)}
      </dd>
    </div>
  );
}

/** Payout status in contributor language, not state-machine language. */
const PAYOUT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Scheduled", variant: "secondary" },
  processing: { label: "On its way", variant: "secondary" },
  paid: { label: "Paid", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  retrying: { label: "Retrying", variant: "secondary" },
};

function PayoutRow({ payout }: { payout: PortalPayout }) {
  const status = PAYOUT_STATUS[payout.status] ?? {
    label: payout.status,
    variant: "secondary" as const,
  };

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 last:border-b-0"
      data-testid="row-payout"
    >
      <div>
        <p className="text-sm text-muted-foreground">
          {formatDate(payout.completedAt ?? payout.createdAt)}
        </p>
        {/*
          A failed payout says why. The contributor cannot fix it themselves,
          but "we tried and it bounced" is a very different experience from
          money simply not arriving.
        */}
        {payout.failureReason && (
          <p className="text-sm text-destructive" data-testid="text-payout-failure">
            {payout.failureReason}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="font-medium tabular-nums" data-testid="text-payout-amount">
          {formatMoney(payout.amountMinor, payout.currency)}
        </span>
      </div>
    </div>
  );
}
