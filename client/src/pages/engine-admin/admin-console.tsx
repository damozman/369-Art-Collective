/**
 * The owner's console.
 *
 * Five views: what's happening, who's owed, what needs attention, what the rules
 * are, and paying people.
 *
 * DESIGN RULES, all inherited from the engine and all load-bearing:
 *
 * 1. Money is never a `number`. Every amount arrives as a string and is formatted
 *    with `formatMoney`, which parses with `BigInt`.
 * 2. Nothing is recomputed on screen. Rates, splits and reasons are all rendered
 *    from what the server recorded. A console that recalculates could disagree
 *    with the contributor's own statement, which is the worst possible bug here.
 * 3. Paying is always preceded by a preview. "Who would be paid, and who would be
 *    skipped and why" is a read-only question, and answering it must carry no
 *    chance of accidentally doing it.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  LogOut,
  RefreshCw,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getContributors,
  getOverview,
  getPayoutBatches,
  getReview,
  getRules,
  assignReviewItem,
  dismissReviewItem,
  logout,
  previewPayouts,
  runPayouts,
  type AdminContributor,
  type AdminMe,
  type AdminRule,
  type RunResult,
} from "@/lib/admin-api";
import { RateEditor } from "./rate-editor";
import { PeopleEditor } from "./people-editor";
import { formatMoney, isPositive, signOf } from "@/lib/portal-money";
import { formatDate } from "@/lib/portal-date";

export function AdminConsole({
  me,
  onSignedOut,
}: {
  me: AdminMe;
  onSignedOut: () => void;
}) {
  const slug = me.tenant.slug;
  const currency = me.tenant.currency;
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ["admin-overview", slug],
    queryFn: () => getOverview(slug),
  });

  async function handleSignOut() {
    await logout(slug);
    onSignedOut();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-admin-tenant">
              {me.tenant.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {me.name}
              {me.role === "viewer" && " · read-only"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} data-testid="button-admin-signout">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {overview.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {overview.data && (
          <>
            <AttentionBanner
              needsReview={overview.data.counts.needsReview}
              failedPayouts={overview.data.counts.failedPayouts}
              negativeBalances={overview.data.counts.negativeBalances}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Sales recorded"
                value={formatMoney(overview.data.gross.minor, currency)}
                detail={`${overview.data.counts.events} line items`}
                testId="stat-gross"
              />
              <StatCard
                label="Owed to people"
                value={formatMoney(overview.data.outstanding.minor, currency)}
                detail="Earned but not yet paid"
                testId="stat-outstanding"
              />
              <StatCard
                label="Ready to pay now"
                value={formatMoney(overview.data.payableNow.minor, currency)}
                detail={`${formatMoney(overview.data.held.minor, currency)} still in the refund window`}
                testId="stat-payable"
              />
              <StatCard
                label="Paid out"
                value={formatMoney((-BigInt(overview.data.paidOut.minor)).toString(), currency)}
                detail="All time"
                testId="stat-paid"
              />
            </div>
          </>
        )}

        <Tabs defaultValue="pay">
          <TabsList>
            <TabsTrigger value="pay" data-testid="tab-pay">Pay people</TabsTrigger>
            <TabsTrigger value="people" data-testid="tab-people">People</TabsTrigger>
            <TabsTrigger value="attention" data-testid="tab-attention">
              Needs attention
              {overview.data && overview.data.counts.needsReview > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {overview.data.counts.needsReview}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rules" data-testid="tab-rules">Rates</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pay" className="mt-4">
            <PayTab slug={slug} currency={currency} canWrite={me.role === "admin"} onDone={() => {
              queryClient.invalidateQueries({ queryKey: ["admin-overview", slug] });
              queryClient.invalidateQueries({ queryKey: ["admin-payouts", slug] });
              queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
            }} />
          </TabsContent>

          <TabsContent value="people" className="mt-4">
            <PeopleTab slug={slug} currency={currency} canWrite={me.role === "admin"} />
          </TabsContent>

          <TabsContent value="attention" className="mt-4">
            <AttentionTab slug={slug} currency={currency} />
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <RulesTab slug={slug} canWrite={me.role === "admin"} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryTab slug={slug} currency={currency} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  testId: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl" data-testid={testId}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

/** One line at the top saying whether anything needs a human today. */
function AttentionBanner({
  needsReview,
  failedPayouts,
  negativeBalances,
}: {
  needsReview: number;
  failedPayouts: number;
  negativeBalances: number;
}) {
  const problems: string[] = [];
  // "Items", not "sales" — the queue holds anything the engine refused to act
  // on, and a chargeback that could not be recovered is not a sale.
  if (needsReview > 0)
    problems.push(`${needsReview} item${needsReview === 1 ? "" : "s"} to review`);
  if (failedPayouts > 0)
    problems.push(`${failedPayouts} failed payment${failedPayouts === 1 ? "" : "s"}`);
  if (negativeBalances > 0)
    problems.push(
      `${negativeBalances} ${negativeBalances === 1 ? "person" : "people"} in the negative after a refund`
    );

  if (problems.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
        data-testid="banner-all-clear"
      >
        <CheckCircle2 className="h-4 w-4" />
        Nothing needs your attention.
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      data-testid="banner-attention"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Needs your attention: {problems.join(", ")}.</span>
    </div>
  );
}

// ---- Pay ----

function PayTab({
  slug,
  currency,
  canWrite,
  onDone,
}: {
  slug: string;
  currency: string;
  canWrite: boolean;
  onDone: () => void;
}) {
  const [result, setResult] = useState<string | null>(null);
  const [failures, setFailures] = useState<RunResult["failures"]>([]);

  const preview = useQuery({
    queryKey: ["admin-payouts", slug, "preview"],
    queryFn: () => previewPayouts(slug),
  });

  const run = useMutation({
    mutationFn: () => runPayouts(slug),
    onSuccess: (data) => {
      setFailures(data.failures ?? []);
      setResult(
        data.paid === 0 && data.failed === 0
          ? "Nothing was paid — nobody was eligible."
          : `Paid ${data.paid}. ${data.failed} failed. Total sent ${formatMoney(
              data.totalPaid.minor,
              currency
            )}.`
      );
      preview.refetch();
      onDone();
    },
    onError: (error) => {
      setFailures([]);
      setResult((error as Error).message);
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ready to pay</CardTitle>
          <CardDescription>
            This is a preview. Nothing moves until you press the button.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preview.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}

          {preview.data && (
            <>
              <p className="text-2xl font-semibold" data-testid="text-total-to-pay">
                {formatMoney(preview.data.totalToPay.minor, currency)}
              </p>

              {preview.data.eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-nobody-eligible">
                  Nobody is eligible right now.
                </p>
              ) : (
                <ul className="space-y-1 text-sm" data-testid="list-eligible">
                  {preview.data.eligible.map((person) => (
                    <li key={person.contributorId} className="flex justify-between">
                      <span>{person.name}</span>
                      <span className="font-medium">
                        {formatMoney(person.amount.minor, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {preview.data.skipped.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="mb-2 text-sm font-medium">
                    Skipped ({preview.data.skipped.length})
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground" data-testid="list-skipped">
                    {preview.data.skipped.map((person) => (
                      <li key={person.contributorId}>
                        <span className="text-foreground">{person.name}</span> — {person.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => run.mutate()}
                  disabled={!canWrite || run.isPending || preview.data.eligible.length === 0}
                  data-testid="button-run-payouts"
                >
                  {run.isPending ? "Sending…" : "Pay everyone listed"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {!canWrite && (
                  <span className="text-sm text-muted-foreground">
                    Your account is read-only.
                  </span>
                )}
              </div>

              {result && (
                <p className="text-sm" data-testid="text-run-result">
                  {result}
                </p>
              )}

              {failures.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="mb-2 text-sm font-medium">Why they failed</p>
                  <ul className="space-y-1 text-sm text-muted-foreground" data-testid="list-failures">
                    {failures.map((failure) => (
                      <li key={failure.contributorId}>
                        <span className="text-foreground">{failure.name}</span> — {failure.reason}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Nobody's balance was reduced. They roll into the next run.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- People ----

function PeopleTab({
  slug,
  currency,
  canWrite,
}: {
  slug: string;
  currency: string;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<AdminContributor | "new" | null>(null);

  const query = useQuery({
    queryKey: ["admin-contributors", slug],
    queryFn: () => getContributors(slug),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) return null;

  if (editing) {
    return (
      <PeopleEditor
        slug={slug}
        existing={editing === "new" ? undefined : editing}
        onDone={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (query.data.contributors.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-6 w-6" />
          <p className="mb-4">Nobody has been added yet.</p>
          {canWrite && (
            <Button onClick={() => setEditing("new")} data-testid="button-add-first-person">
              Add someone
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>People you pay</CardTitle>
          <CardDescription>
            Minimum payout is {formatMoney(query.data.minimumPayout.minor, currency)}.
          </CardDescription>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing("new")} data-testid="button-add-person">
            Add someone
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Balance</th>
                <th className="py-2 pr-4 font-medium">Ready now</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody data-testid="table-contributors">
              {query.data.contributors.map((person) => (
                <tr key={person.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{person.name}</div>
                    {person.email && (
                      <div className="text-xs text-muted-foreground">{person.email}</div>
                    )}
                  </td>
                  <td
                    className={`py-2 pr-4 ${signOf(person.balance.minor) < 0 ? "text-destructive" : ""}`}
                  >
                    {formatMoney(person.balance.minor, currency)}
                  </td>
                  <td className="py-2 pr-4">
                    {isPositive(person.payable.minor)
                      ? formatMoney(person.payable.minor, currency)
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {person.blockedReason ? (
                      <span className="text-xs text-muted-foreground">
                        {person.blockedReason}
                      </span>
                    ) : (
                      <Badge variant="default">Ready</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(person)}
                        data-testid={`button-edit-person-${person.id}`}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Needs attention ----

function AttentionTab({ slug, currency }: { slug: string; currency: string }) {
  const queryClient = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-review", slug],
    queryFn: () => getReview(slug),
  });

  const people = useQuery({
    queryKey: ["admin-contributors", slug],
    queryFn: () => getContributors(slug),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-review", slug] });
    queryClient.invalidateQueries({ queryKey: ["admin-overview", slug] });
    queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
    queryClient.invalidateQueries({ queryKey: ["admin-payouts", slug] });
  }

  const assign = useMutation({
    mutationFn: ({ eventId, contributorId }: { eventId: string; contributorId: string }) =>
      assignReviewItem(slug, eventId, contributorId, true),
    onSuccess: (data) => {
      setMessage(
        data.status === "resolved"
          ? `Paid ${data.allocated.formatted}. Future sales from this reference will resolve on their own.`
          : `Still stuck: ${data.warnings.join("; ")}`
      );
      setActing(null);
      refresh();
    },
    onError: (error) => setMessage((error as Error).message),
  });

  const dismiss = useMutation({
    mutationFn: ({ eventId, why }: { eventId: string; why: string }) =>
      dismissReviewItem(slug, eventId, why),
    onSuccess: () => {
      setMessage("Dismissed.");
      setActing(null);
      refresh();
    },
    onError: (error) => setMessage((error as Error).message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) return null;

  if (query.data.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
          Nothing to review. Every sale was processed successfully.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Things to review</CardTitle>
        <CardDescription>
          Either the system could not work out who to pay — so it deliberately paid
          nobody rather than guessing — or a refund arrived that could not be
          recovered automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <p className="mb-4 text-sm" data-testid="text-review-message">
            {message}
          </p>
        )}

        <ul className="space-y-3" data-testid="list-review">
          {query.data.items.map((item) => {
            // A refund cannot be "assigned" to anyone — the money is already gone.
            // Only an unmatched sale has somebody to point it at.
            const isRefund = item.gross.minor.startsWith("-");
            const open = acting === item.id;

            return (
              <li key={item.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatMoney(item.gross.minor, currency)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.source} · {item.sourceEventId}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.occurredAt)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMessage(null);
                        setActing(open ? null : item.id);
                      }}
                      data-testid={`button-resolve-${item.id}`}
                    >
                      {open ? "Close" : "Resolve"}
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    {!isRefund && (
                      <div className="space-y-2">
                        <Label>Who should be paid for this?</Label>
                        <div className="flex flex-wrap gap-2">
                          <Select
                            value={chosen[item.id] ?? ""}
                            onValueChange={(v) =>
                              setChosen((c) => ({ ...c, [item.id]: v }))
                            }
                          >
                            <SelectTrigger className="w-64" data-testid={`select-assign-${item.id}`}>
                              <SelectValue placeholder="Choose someone" />
                            </SelectTrigger>
                            <SelectContent>
                              {(people.data?.contributors ?? []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            disabled={!chosen[item.id] || assign.isPending}
                            onClick={() =>
                              assign.mutate({
                                eventId: item.id,
                                contributorId: chosen[item.id],
                              })
                            }
                            data-testid={`button-assign-${item.id}`}
                          >
                            {assign.isPending ? "Working…" : "Assign and pay"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Pays what the rates said on {formatDate(item.occurredAt)} — not
                          today's rate. Future sales from this reference will match on
                          their own.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>
                        {isRefund ? "Acknowledge this" : "Or dismiss it"}
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="w-64"
                          placeholder="Why? (kept on the record)"
                          value={note[item.id] ?? ""}
                          onChange={(e) =>
                            setNote((n) => ({ ...n, [item.id]: e.target.value }))
                          }
                          data-testid={`input-dismiss-${item.id}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={dismiss.isPending}
                          onClick={() =>
                            dismiss.mutate({
                              eventId: item.id,
                              why: note[item.id] ?? "",
                            })
                          }
                          data-testid={`button-dismiss-${item.id}`}
                        >
                          Dismiss
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isRefund
                          ? "The money is already gone; this only clears the flag. The loss stays on the record and recoups from future earnings."
                          : "Clears the flag without paying anyone. The sale stays on the record."}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---- Rules ----

function RulesTab({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const [editing, setEditing] = useState<AdminRule | "new" | null>(null);

  const query = useQuery({
    queryKey: ["admin-rules", slug],
    queryFn: () => getRules(slug),
  });

  const contributorsQuery = useQuery({
    queryKey: ["admin-contributors", slug],
    queryFn: () => getContributors(slug),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) return null;

  if (editing) {
    return (
      <RateEditor
        slug={slug}
        contributors={contributorsQuery.data?.contributors ?? []}
        existing={editing === "new" ? undefined : editing}
        onDone={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  // Only the newest version of each rate — older versions are history, not
  // something to act on, and listing them all makes the screen unreadable.
  const currentRules = Object.values(
    query.data.rules.reduce<Record<string, AdminRule>>((acc, rule) => {
      const seen = acc[rule.ruleKey];
      if (!seen || rule.version > seen.version) acc[rule.ruleKey] = rule;
      return acc;
    }, {})
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>What everyone earns</CardTitle>
          <CardDescription>
            Changing a rate creates a new version — past sales keep the rate that
            applied at the time.
          </CardDescription>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing("new")} data-testid="button-add-rate">
            New rate
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {currentRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rates set up yet.</p>
        ) : (
          <ul className="space-y-3" data-testid="list-rules">
            {currentRules.map((rule) => (
              <li key={rule.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {/* The sentence is built server-side; never re-derive it here. */}
                    <p className="text-sm" data-testid={`rule-description-${rule.ruleKey}`}>
                      {rule.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rule.contributorName ? `${rule.contributorName} · ` : ""}
                      {rule.ruleKey} · version {rule.version}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!rule.active && <Badge variant="secondary">Inactive</Badge>}
                    {canWrite && rule.active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(rule)}
                        data-testid={`button-edit-rate-${rule.ruleKey}`}
                      >
                        Change
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---- History ----

function HistoryTab({ slug, currency }: { slug: string; currency: string }) {
  const query = useQuery({
    queryKey: ["admin-payouts", slug],
    queryFn: () => getPayoutBatches(slug),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!query.data) return null;

  if (query.data.batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          <Clock className="mx-auto mb-2 h-6 w-6" />
          No payouts have been run yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payout runs</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2" data-testid="list-batches">
          {query.data.batches.map((batch) => (
            <li key={batch.id} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  {formatMoney(batch.totalPaid.minor, currency)} to {batch.paidCount}{" "}
                  {batch.paidCount === 1 ? "person" : "people"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(batch.createdAt)}
                  {batch.failedCount > 0 && ` · ${batch.failedCount} failed`}
                </p>
              </div>
              {batch.failedCount > 0 ? (
                <Badge variant="destructive">
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Needs retry
                </Badge>
              ) : (
                <Badge variant="secondary">Done</Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
