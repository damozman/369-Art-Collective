/**
 * Advances — money paid up front, earned back out of what somebody makes later.
 *
 * ⚠️ THE NUMBER THIS SCREEN EXISTS TO MAKE OBVIOUS IS **OUTSTANDING**. An owner
 * looking at this is asking one question: "how much of what I fronted have I got
 * back?" Everything else — the original amount, the rate, the note — is context
 * for that.
 *
 * The recoupment rate is the second thing, and it is stated as a sentence rather
 * than a number, because "50%" alone reads as "half the advance" to most people
 * when it actually means "half of everything they earn, until it clears".
 *
 * Two things are deliberately NOT offered:
 *
 * 1. **No delete.** An advance that has recouped anything is part of the
 *    explanation for money that has already moved. Closing it is a decision with
 *    a reason attached; deleting it would erase why somebody was paid less.
 * 2. **No editing the amount or the rate.** Those are the terms of a deal that
 *    was struck. Changing them retroactively would silently rewrite what the
 *    contributor has already had taken from them. A wrong advance is cancelled
 *    and re-recorded, which leaves both facts on the record.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

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
import {
  closeAdvance,
  createAdvance,
  getAdvances,
  getContributors,
  type AdminAdvance,
} from "@/lib/admin-api";
import { formatMoney } from "@/lib/portal-money";
import { formatDate, todayIso } from "@/lib/portal-date";

export function AdvancesTab({
  slug,
  currency,
  canWrite,
}: {
  slug: string;
  currency: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const advances = useQuery({
    queryKey: ["admin-advances", slug, showClosed],
    queryFn: () => getAdvances(slug, { includeClosed: showClosed }),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-advances", slug] });
    // A new advance changes what the next payout run would hand over.
    queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
  }

  if (adding) {
    return (
      <AdvanceEditor
        slug={slug}
        currency={currency}
        onDone={() => {
          setAdding(false);
          refresh();
        }}
        onCancel={() => setAdding(false)}
      />
    );
  }

  const rows = advances.data?.advances ?? [];
  const open = rows.filter((row) => row.status === "open");
  const totalOutstanding = open.reduce(
    (total, row) => total + BigInt(row.outstanding.minor),
    0n
  );

  return (
    <div className="space-y-4">
      <Card data-testid="card-advances">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Advances</CardTitle>
              <CardDescription>
                Money paid to somebody before they earned it, taken back out of what
                they earn afterwards.
              </CardDescription>
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => setAdding(true)} data-testid="button-add-advance">
                <Plus className="mr-2 h-4 w-4" />
                Record an advance
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {advances.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {advances.data && open.length > 0 && (
            <p className="mb-4 text-sm" data-testid="text-advances-total">
              <span className="text-muted-foreground">Still to recover: </span>
              <span className="font-semibold">
                {formatMoney(totalOutstanding.toString(), currency)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                across {open.length} {open.length === 1 ? "advance" : "advances"}
              </span>
            </p>
          )}

          {advances.data && rows.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-advances-empty">
              {showClosed
                ? "No advances recorded."
                : "No open advances. Anything you pay somebody up front goes here."}
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Who</th>
                    <th className="pb-2 font-medium">Advanced</th>
                    <th className="pb-2 font-medium">Recovered</th>
                    <th className="pb-2 font-medium">Still owed</th>
                    <th className="pb-2 font-medium">Terms</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody data-testid="table-advances">
                  {rows.map((row) => (
                    <AdvanceRow
                      key={row.id}
                      slug={slug}
                      advance={row}
                      currency={currency}
                      canWrite={canWrite}
                      onChanged={refresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="mt-4"
            onClick={() => setShowClosed((v) => !v)}
            data-testid="button-toggle-closed-advances"
          >
            {showClosed ? "Show only open" : "Show closed ones too"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AdvanceRow({
  slug,
  advance,
  currency,
  canWrite,
  onChanged,
}: {
  slug: string;
  advance: AdminAdvance;
  currency: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = useMutation({
    mutationFn: (status: "written_off" | "cancelled") =>
      closeAdvance(slug, advance.id, { status, note: note.trim() || undefined }),
    onSuccess: () => {
      setClosing(false);
      onChanged();
    },
    onError: (err) => setError((err as Error).message),
  });

  const isOpen = advance.status === "open";
  const nothingRecovered = advance.recouped.minor === "0";

  return (
    <tr className="border-b align-top last:border-0" data-testid={`row-advance-${advance.id}`}>
      <td className="py-3 pr-4">
        <span className={isOpen ? "" : "text-muted-foreground"}>
          {advance.contributorName}
        </span>
        {!isOpen && (
          <Badge variant="outline" className="ml-2 font-normal">
            {advance.status === "written_off" ? "Written off" : "Cancelled"}
          </Badge>
        )}
        {advance.workTitle && (
          <p className="text-xs text-muted-foreground">for {advance.workTitle}</p>
        )}
        {advance.note && (
          <p className="text-xs text-muted-foreground">{advance.note}</p>
        )}
      </td>

      <td className="py-3 pr-4">
        {formatMoney(advance.amount.minor, currency)}
        <p className="text-xs text-muted-foreground">{formatDate(advance.issuedAt)}</p>
      </td>

      <td className="py-3 pr-4 text-muted-foreground">
        {formatMoney(advance.recouped.minor, currency)}
      </td>

      <td className="py-3 pr-4">
        <span className={isOpen ? "font-medium" : "text-muted-foreground"}>
          {formatMoney(advance.outstanding.minor, currency)}
        </span>
      </td>

      <td className="py-3 pr-4 text-xs text-muted-foreground">
        {/* Stated as a sentence: "50%" alone reads as half the advance, when it
            actually means half of everything they earn until it clears. */}
        {advance.recoupmentPercent >= 100
          ? "All earnings until it clears"
          : `${advance.recoupmentPercent}% of earnings until it clears`}
      </td>

      <td className="py-3 text-right">
        {canWrite && isOpen && !closing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError(null);
              setClosing(true);
            }}
            data-testid={`button-close-advance-${advance.id}`}
          >
            Close
          </Button>
        )}

        {closing && (
          <div className="space-y-2 text-left">
            <Input
              className="h-8"
              placeholder="Why? (kept on the record)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid={`input-close-note-${advance.id}`}
            />
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                size="sm"
                className="h-8"
                variant="outline"
                disabled={close.isPending}
                onClick={() => close.mutate("written_off")}
                data-testid={`button-write-off-${advance.id}`}
              >
                Write off
              </Button>
              {/* Cancelling is only honest when nothing has been taken back yet —
                  otherwise the contributor really did have money withheld, and
                  "this never happened" would contradict their own statement. */}
              {nothingRecovered && (
                <Button
                  size="sm"
                  className="h-8"
                  variant="outline"
                  disabled={close.isPending}
                  onClick={() => close.mutate("cancelled")}
                  data-testid={`button-cancel-advance-${advance.id}`}
                >
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                className="h-8"
                variant="ghost"
                onClick={() => setClosing(false)}
              >
                Back
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Either way it stops taking money from future payments. Nothing already
              recovered is given back.
            </p>

            {error && (
              <p className="text-xs text-destructive" data-testid="text-close-advance-error">
                {error}
              </p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function AdvanceEditor({
  slug,
  currency,
  onDone,
  onCancel,
}: {
  slug: string;
  currency: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [contributorId, setContributorId] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("100");
  const [issuedAt, setIssuedAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const people = useQuery({
    queryKey: ["admin-contributors", slug],
    queryFn: () => getContributors(slug),
  });

  const save = useMutation({
    mutationFn: () =>
      createAdvance(slug, {
        contributorId,
        // A STRING all the way to the server, which parses it exactly. Never
        // Number() — that rounds before the server ever sees it.
        amount: amount.trim(),
        recoupmentPercent: Number(percent),
        issuedAt,
        note: note.trim() || null,
      }),
    onSuccess: onDone,
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate();
  }

  const rate = Number(percent);

  return (
    <Card data-testid="card-advance-editor">
      <CardHeader>
        <CardTitle>Record an advance</CardTitle>
        <CardDescription>
          Money you have already paid somebody, to be earned back out of what they
          make later.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="advance-person">Who was paid</Label>
            <Select value={contributorId} onValueChange={setContributorId}>
              <SelectTrigger id="advance-person" data-testid="select-advance-person">
                <SelectValue placeholder="Choose someone" />
              </SelectTrigger>
              <SelectContent>
                {(people.data?.contributors ?? [])
                  .filter((person) => person.active)
                  .map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="advance-amount">How much</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{currency}</span>
                <Input
                  id="advance-amount"
                  inputMode="decimal"
                  placeholder="5000.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  data-testid="input-advance-amount"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="advance-date">When you paid it</Label>
              <Input
                id="advance-date"
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                required
                data-testid="input-advance-date"
              />
              <p className="text-xs text-muted-foreground">
                The real date the money left — it decides which tax year reports it.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="advance-percent">How much of their earnings to take back</Label>
            <div className="flex items-center gap-2">
              <Input
                id="advance-percent"
                inputMode="decimal"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="max-w-24"
                required
                data-testid="input-advance-percent"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-advance-explain">
              {!Number.isFinite(rate) || rate <= 0
                ? "Must be above 0 — an advance that takes nothing back is a gift, not an advance."
                : rate >= 100
                  ? "Everything they earn goes to clearing this before they receive anything."
                  : `They keep ${100 - rate}% of what they earn while this clears — often the point of setting a rate below 100%.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="advance-note">Note</Label>
            <Input
              id="advance-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What this was for"
              data-testid="input-advance-note"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-advance-error">
              {error}
            </p>
          )}

          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            Recording this does <strong>not</strong> move any money or change what
            anyone is owed right now. It starts taking effect from their next payment.
          </p>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!contributorId || save.isPending}
              data-testid="button-save-advance"
            >
              {save.isPending ? "Saving…" : "Record advance"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-advance-form">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
