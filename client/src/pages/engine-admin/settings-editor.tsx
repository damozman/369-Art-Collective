/**
 * Business settings — the four numbers that decide how money is held, paid and
 * recovered.
 *
 * ⚠️ THE ONE THING THIS SCREEN MUST GET ACROSS: two of these settings apply to
 * the next payout run, and one of them does not apply backwards at all.
 *
 * The hold period is stamped onto each payment as it is worked out and written
 * to the ledger as a release date. Shortening it does NOT release money that is
 * already waiting, and lengthening it does not pull back money already
 * released. That is deliberate — a date somebody has already been shown should
 * not move under them — but an owner who changes 30 days to 7 and then looks for
 * freed-up money will otherwise think the system is broken. So the field says
 * so, on the field, not in a help page nobody opens.
 *
 * Money rule, as everywhere: the minimum payout is a STRING all the way to the
 * server. It is never `Number()`-ed on the way out. The server parses it with
 * the engine's exact decimal reader.
 */

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";

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
import { getSettings, updateSettings, type AdminSettings } from "@/lib/admin-api";

const POLICY_COPY: Record<string, { label: string; detail: string }> = {
  recoup: {
    label: "Recover it from their future earnings",
    detail:
      "Their balance goes negative and the next sales pay it back before they get anything. Nobody is asked for money back.",
  },
  absorb: {
    label: "The business absorbs it",
    detail:
      "The refund is recorded, but they keep what they were paid. Simplest, and costs you the money.",
  },
  reserve: {
    label: "Hold back a reserve from every payout",
    detail:
      "A slice of each payment is kept aside to cover future refunds, then released later. Costs people patience rather than money.",
  },
};

export function SettingsTab({ slug, canWrite }: { slug: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin-settings", slug],
    queryFn: () => getSettings(slug),
  });

  return (
    <div className="space-y-4">
      {settings.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {settings.data && (
        <SettingsForm
          slug={slug}
          canWrite={canWrite}
          settings={settings.data}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-settings", slug] });
            queryClient.invalidateQueries({ queryKey: ["admin-contributors", slug] });
          }}
        />
      )}
    </div>
  );
}

function SettingsForm({
  slug,
  canWrite,
  settings,
  onSaved,
}: {
  slug: string;
  canWrite: boolean;
  settings: AdminSettings;
  onSaved: () => void;
}) {
  const [holdDays, setHoldDays] = useState(String(settings.payoutHoldDays));
  const [minimum, setMinimum] = useState(settings.minimumPayout.formatted);
  const [policy, setPolicy] = useState(settings.clawbackPolicy);
  const [reservePercent, setReservePercent] = useState(String(settings.reservePercent));
  const [reserveDays, setReserveDays] = useState(String(settings.reserveReleaseDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed when the server's copy changes, so a save elsewhere doesn't leave
  // this form showing stale values it would then write back.
  useEffect(() => {
    setHoldDays(String(settings.payoutHoldDays));
    setMinimum(settings.minimumPayout.formatted);
    setPolicy(settings.clawbackPolicy);
    setReservePercent(String(settings.reservePercent));
    setReserveDays(String(settings.reserveReleaseDays));
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      updateSettings(slug, {
        payoutHoldDays: Number(holdDays),
        // Deliberately NOT Number(...) — see the file header.
        minimumPayout: minimum.trim(),
        clawbackPolicy: policy,
        reservePercent: policy === "reserve" ? Number(reservePercent) : null,
        reserveReleaseDays: policy === "reserve" ? Number(reserveDays) : null,
      }),
    onSuccess: () => {
      setSaved(true);
      onSaved();
    },
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    save.mutate();
  }

  const holdChanged = String(settings.payoutHoldDays) !== holdDays.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card data-testid="card-settings-payouts">
        <CardHeader>
          <CardTitle>Paying people</CardTitle>
          <CardDescription>
            When money becomes available, and how much has to build up before it is
            worth sending.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="settings-hold">Wait this many days before money can be paid out</Label>
            <Input
              id="settings-hold"
              inputMode="numeric"
              value={holdDays}
              onChange={(e) => setHoldDays(e.target.value)}
              disabled={!canWrite}
              className="max-w-32"
              data-testid="input-settings-hold"
            />
            <p className="text-xs text-muted-foreground">
              Covers the window where a customer can still refund. Most card refunds
              land within two weeks.
            </p>

            {holdChanged && (
              <p
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
                data-testid="text-hold-warning"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This only applies to sales from now on. Money already earned keeps
                  the release date it was given — changing this will not free it up
                  early, or push it back.
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-minimum">
              Don't pay anyone until they've earned at least
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{settings.currency}</span>
              <Input
                id="settings-minimum"
                inputMode="decimal"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                disabled={!canWrite}
                className="max-w-32"
                data-testid="input-settings-minimum"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Payments cost a fee each, so tiny ones lose money. Anyone under this
              rolls over to the next run — nothing is lost. Takes effect on the next
              payout run.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-settings-refunds">
        <CardHeader>
          <CardTitle>When a customer refunds after you've paid</CardTitle>
          <CardDescription>
            The money has already left. This decides who ends up carrying it.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="settings-policy">What should happen</Label>
            <Select
              value={policy}
              onValueChange={(v) => {
                const next = v as AdminSettings["clawbackPolicy"];
                setPolicy(next);
                // A tenant that has never used a reserve has 0% stored, which
                // is the one value the server refuses — so choosing "hold a
                // reserve" would otherwise land on a guaranteed error. Seed
                // something usable instead of pre-filling the invalid case.
                if (next === "reserve" && Number(reservePercent) <= 0) {
                  setReservePercent("10");
                }
              }}
              disabled={!canWrite}
            >
              <SelectTrigger id="settings-policy" data-testid="select-settings-policy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(POLICY_COPY).map(([value, copy]) => (
                  <SelectItem key={value} value={value}>
                    {copy.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground" data-testid="text-policy-detail">
              {POLICY_COPY[policy]?.detail}
            </p>
          </div>

          {policy === "reserve" && (
            <div className="grid gap-4 sm:grid-cols-2" data-testid="group-reserve">
              <div className="space-y-2">
                <Label htmlFor="settings-reserve-pct">Hold back this much of each payout</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="settings-reserve-pct"
                    inputMode="decimal"
                    value={reservePercent}
                    onChange={(e) => setReservePercent(e.target.value)}
                    disabled={!canWrite}
                    className="max-w-24"
                    data-testid="input-settings-reserve-pct"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-reserve-days">Release it after</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="settings-reserve-days"
                    inputMode="numeric"
                    value={reserveDays}
                    onChange={(e) => setReserveDays(e.target.value)}
                    disabled={!canWrite}
                    className="max-w-24"
                    data-testid="input-settings-reserve-days"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" data-testid="text-settings-error">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending} data-testid="button-save-settings">
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          {saved && !save.isPending && (
            <span
              className="flex items-center gap-1 text-sm text-muted-foreground"
              data-testid="text-settings-saved"
            >
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      )}
    </form>
  );
}
