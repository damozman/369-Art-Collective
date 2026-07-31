/**
 * One line of a statement, with its derivation.
 *
 * THIS COMPONENT IS THE PRODUCT THESIS. The whole argument for this system over
 * a spreadsheet is that a contributor can answer "why is it this number?"
 * without emailing anyone. So the explanation and the trace are rendered from
 * the stored allocation, verbatim — nothing here recalculates anything, and it
 * must stay that way. Recomputing on the client would answer "what would this
 * sale earn under today's rules", which is a different question and diverges
 * the moment a rate changes. The server has that bug in its history
 * (`payout-service.ts` recalculating at payout time); the client must not
 * reintroduce it.
 *
 * Held lines are visibly distinct on purpose: someone looking at a balance they
 * cannot yet withdraw needs the reason on the same screen, not in a support
 * reply.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/portal-date";
import { formatMoney, signOf } from "@/lib/portal-money";
import type { StatementLine as Line, StatementLineType } from "@/lib/portal-api";

/** Human labels — the API's enum values are not contributor-facing language. */
const TYPE_LABEL: Record<StatementLineType, string> = {
  allocation: "Earned",
  reversal: "Reversed",
  adjustment: "Adjustment",
  payout: "Paid out",
  payout_reversal: "Payout returned",
};

const TYPE_VARIANT: Record<StatementLineType, "default" | "secondary" | "destructive" | "outline"> =
  {
    allocation: "default",
    reversal: "destructive",
    adjustment: "secondary",
    payout: "outline",
    payout_reversal: "secondary",
  };

export function StatementLineRow({ line, currency }: { line: Line; currency: string }) {
  const [open, setOpen] = useState(false);

  const hasWorking = Boolean(line.trace && line.trace.length > 0);
  const sign = signOf(line.amount.minor);

  return (
    <div
      className={cn(
        "border-b border-border px-4 py-4 last:border-b-0",
        line.held && "bg-amber-50/60 dark:bg-amber-950/20"
      )}
      data-testid={`row-statement-line-${line.type}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatDate(line.occurredAt)}
            </span>

            <Badge variant={TYPE_VARIANT[line.type]}>{TYPE_LABEL[line.type]}</Badge>

            {line.held && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400"
                data-testid="badge-held"
              >
                <Clock className="h-3 w-3" />
                Held
              </Badge>
            )}
          </div>

          {line.workTitle && (
            <p className="mt-1 truncate font-medium" data-testid="text-work-title">
              {line.workTitle}
            </p>
          )}
        </div>

        <div className="text-right">
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              sign < 0 && "text-muted-foreground"
            )}
            data-testid="text-line-amount"
          >
            {formatMoney(line.amount.minor, currency)}
          </p>
        </div>
      </div>

      {/*
        Held lines explain themselves inline. "Why can't I withdraw this?" is
        the single most predictable support question in a payouts product.
      */}
      {line.held && line.availableAt && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400" data-testid="text-held-until">
          Inside the refund window — becomes available on {formatDate(line.availableAt)}.
        </p>
      )}

      {line.explanation && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-line-explanation">
          {line.explanation}
        </p>
      )}

      {hasWorking && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            aria-expanded={open}
            data-testid="button-toggle-working"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {open ? "Hide the working" : "Show the working"}
          </button>

          {open && (
            <dl className="mt-2 rounded-md border border-border bg-muted/40 p-3" data-testid="list-trace">
              {line.trace!.map((step, index) => (
                <div
                  key={`${step.label}-${index}`}
                  className="flex items-baseline justify-between gap-4 py-1"
                >
                  <dt className="text-sm">
                    {step.label}
                    {step.detail && (
                      <span className="ml-1 text-muted-foreground">({step.detail})</span>
                    )}
                  </dt>
                  {step.amountMinor !== undefined && (
                    <dd className="text-sm tabular-nums">
                      {formatMoney(step.amountMinor, currency)}
                    </dd>
                  )}
                </div>
              ))}

              {line.ruleKey && (
                <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                  Rule <span className="font-mono">{line.ruleKey}</span>
                  {line.ruleVersion !== null && ` (version ${line.ruleVersion})`}
                </p>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
