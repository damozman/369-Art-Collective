/**
 * Year-end payment reporting — what the business paid each person in a calendar
 * year, and who is not ready to be filed for.
 *
 * ⚠️ WHAT THIS SCREEN MUST NOT IMPLY. It does not file anything, and it must
 * never read as though it does. The business is the payer of record — money
 * moves through their own Stripe account, never ours (ratified decision #1) —
 * so the forms are issued by Stripe under their account or by their accountant.
 * What this gives them is the number, itemised, with the window it covers
 * printed next to it. Copy that says "your 1099s are ready" would be a promise
 * the system cannot keep.
 *
 * The three things it has to get right:
 *
 * 1. THE DIFFERENCE BETWEEN PAID AND EARNED IS STATED, NOT ASSUMED. Every other
 *    screen in this console shows what people have EARNED. This one shows what
 *    they were PAID, which is a different number, and an owner who reads it as
 *    the familiar one will think the report is wrong. It says so at the top,
 *    before the figures.
 *
 * 2. MISSING PAPERWORK IS THE ACTIONABLE THING. A total is just a number; "you
 *    paid four people who have no tax form on file" is a task. It leads.
 *
 * 3. NOTHING IS RECOMPUTED HERE. Amounts arrive as minor-unit strings and are
 *    formatted with `portal-money`, never passed through `Number`. The
 *    threshold comparison is the server's — this renders the flag it sent,
 *    rather than comparing amounts itself, so the CSV and the screen can never
 *    disagree about who is over $600.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Info } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTaxReport,
  getTaxYears,
  taxCsvUrl,
  type TaxRowFlag,
  type TaxYearRow,
} from "@/lib/admin-api";
import { formatDate } from "@/lib/portal-date";
import { formatMoney } from "@/lib/portal-money";

/**
 * What each flag says to the owner.
 *
 * Written as consequences rather than states — "no tax form on file" is a
 * status, "you cannot file for this person yet" is the thing they need to know.
 * `tone` drives colour: amber is something to fix, plain is information.
 */
const FLAG_COPY: Record<TaxRowFlag, { label: string; detail: string; tone: "warn" | "info" }> = {
  no_tax_form: {
    label: "No tax form",
    detail: "Paid, but no W-9 has been collected. This person can't be filed for yet.",
    tone: "warn",
  },
  invalid_tax_identity: {
    label: "Tax details rejected",
    detail: "Stripe couldn't verify the details given. They need to be corrected.",
    tone: "warn",
  },
  foreign_person: {
    label: "Not a US person",
    detail: "A W-8BEN is on file. This is a 1042-S, not a 1099 — ask your accountant.",
    tone: "info",
  },
  below_threshold: {
    label: "Under $600",
    detail: "Below the federal threshold. Some states are lower, so it's still listed.",
    tone: "info",
  },
  non_usd: {
    label: "Not in dollars",
    detail: "Paid in another currency, so it isn't part of the dollar total.",
    tone: "info",
  },
};

/** The year the report opens on, matching the server's default. */
function defaultYear(now: Date = new Date()): number {
  return now.getUTCMonth() <= 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

export function TaxTab({ slug }: { slug: string }) {
  const [year, setYear] = useState<number>(() => defaultYear());

  const years = useQuery({
    queryKey: ["admin-tax-years", slug],
    queryFn: () => getTaxYears(slug),
  });

  const report = useQuery({
    queryKey: ["admin-tax-report", slug, year],
    queryFn: () => getTaxReport(slug, year),
  });

  // The current year is always offered even before anybody has been paid in it,
  // so the picker is never empty and never implies the screen is broken.
  const offered = Array.from(
    new Set([...(years.data?.years ?? []), defaultYear(), new Date().getUTCFullYear()])
  ).sort((a, b) => b - a);

  const data = report.data;
  const usdTotal = data?.totalsByCurrency.find((total) => total.currency === "USD");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle data-testid="text-tax-title">Payments for tax reporting</CardTitle>
              <CardDescription>
                What you actually <strong>paid out</strong> each person during the year — not
                what they earned. Money earned in December and paid in January belongs to the
                following year, which is how tax reporting works and why this number differs
                from the rest of the console.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
                <SelectTrigger className="h-9 w-28" data-testid="select-tax-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {offered.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button asChild variant="outline" size="sm" data-testid="button-tax-csv">
                {/* A real link, so the browser downloads it with the filename the
                    server chose rather than one invented a second time here. */}
                <a href={taxCsvUrl(slug, year)} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {report.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {report.isError && (
            <p className="text-sm text-destructive" data-testid="text-tax-error">
              {(report.error as Error).message}
            </p>
          )}

          {data && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Summary
                  label={
                    // Named as dollars only when it isn't the whole story —
                    // otherwise the qualifier is noise on the one currency
                    // Phase 1 supports.
                    data.totalsByCurrency.length > 1 ? "Paid out in dollars" : "Paid out in the year"
                  }
                  value={usdTotal ? formatMoney(usdTotal.total.minor) : formatMoney("0")}
                  detail={
                    // PEOPLE, not rows. Somebody paid in two currencies is two
                    // rows and one person, and an owner checking "5 people" against
                    // their own records would find it wrong and then distrust the
                    // total beside it.
                    `${data.counts.contributors} ${
                      data.counts.contributors === 1 ? "person" : "people"
                    } paid` +
                    (data.totalsByCurrency.length > 1
                      ? ` · also ${data.totalsByCurrency
                          .filter((total) => total.currency !== "USD")
                          .map((total) => `${formatMoney(total.total.minor, total.currency)} ${total.currency}`)
                          .join(", ")}`
                      : "")
                  }
                  testId="stat-tax-total"
                />
                <Summary
                  label="At or over $600"
                  value={String(data.counts.reportable)}
                  detail="The federal 1099-NEC threshold"
                  testId="stat-tax-reportable"
                />
                <Summary
                  label="Missing paperwork"
                  value={String(data.counts.missingTaxForm)}
                  detail={
                    data.counts.missingTaxForm > 0
                      ? "Can't be filed for as things stand"
                      : "Everyone paid has a form on file"
                  }
                  tone={data.counts.missingTaxForm > 0 ? "warn" : "plain"}
                  testId="stat-tax-missing"
                />
              </div>

              {data.counts.missingTaxForm > 0 && (
                <div
                  className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  data-testid="banner-tax-missing"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    You paid {data.counts.missingTaxForm}{" "}
                    {data.counts.missingTaxForm === 1 ? "person" : "people"} whose tax details
                    aren't on file. They're listed below. Tax details are collected by Stripe
                    when someone connects their bank — asking them to finish that is what
                    fixes this.
                  </p>
                </div>
              )}

              {data.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-tax-empty">
                  Nobody was paid in {data.year}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="pb-2 pr-4 font-medium">Person</th>
                        <th className="pb-2 pr-4 font-medium">Paid</th>
                        <th className="pb-2 pr-4 font-medium">Payments</th>
                        <th className="pb-2 pr-4 font-medium">Last paid</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.rows.map((row) => (
                        <TaxRow key={`${row.contributorId}:${row.currency}`} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p>
                    Covers payments made from {formatDate(data.from)} up to (but not
                    including) {formatDate(data.until)}, counted in UTC. A payout run late on
                    31 December US time falls into the next year.
                  </p>
                  <p>
                    Refunds clawed back after someone was paid reduce the year the clawback
                    happened in, not this one. The money here was genuinely received.
                  </p>
                  <p>
                    Tax ID numbers are deliberately not held by this system — Stripe collects
                    and keeps them. This is your record of what you paid, for your accountant
                    to file from and to check Stripe's own reporting against.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TaxRow({ row }: { row: TaxYearRow }) {
  return (
    <tr data-testid={`row-tax-${row.contributorId}`}>
      <td className="py-3 pr-4">
        <p className="font-medium">{row.name}</p>
        {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
      </td>

      <td className="py-3 pr-4 font-medium tabular-nums" data-testid={`text-tax-paid-${row.contributorId}`}>
        {formatMoney(row.paid.minor, row.currency)}
        {row.currency !== "USD" && (
          <span className="ml-1 text-xs text-muted-foreground">{row.currency}</span>
        )}
      </td>

      <td className="py-3 pr-4 text-muted-foreground tabular-nums">{row.payoutCount}</td>

      <td className="py-3 pr-4 text-muted-foreground">{formatDate(row.lastPaidAt)}</td>

      <td className="py-3 pr-4">
        {row.flags.length === 0 ? (
          <Badge variant="outline" className="font-normal">
            Ready
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.flags.map((flag) => {
              const copy = FLAG_COPY[flag];
              if (!copy) return null;
              return (
                <Badge
                  key={flag}
                  variant="outline"
                  title={copy.detail}
                  className={
                    copy.tone === "warn"
                      ? "border-amber-400 font-normal text-amber-700 dark:text-amber-400"
                      : "font-normal"
                  }
                  data-testid={`badge-tax-${flag}-${row.contributorId}`}
                >
                  {copy.label}
                </Badge>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}

function Summary({
  label,
  value,
  detail,
  tone = "plain",
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "plain" | "warn";
  testId: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""
        }`}
        data-testid={testId}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
