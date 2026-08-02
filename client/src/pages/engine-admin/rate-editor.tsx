/**
 * Creating and changing a rate.
 *
 * THE ONE THING THIS FORM MUST NOT LET SOMEONE MISUNDERSTAND: changing a rate
 * does not recalculate anything. It applies to sales recorded from its start
 * date onward, and every past payment keeps the rate it was made under.
 *
 * Owners reliably expect the opposite — that fixing a rate fixes the payments
 * already made — so the form says so in plain words, on screen, at the moment
 * of saving. Getting this wrong does not corrupt any data (allocations are
 * snapshots and cannot be rewritten), but it does mean somebody believes people
 * have been re-paid when they have not.
 */

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  changeRule,
  createRule,
  type AdminContributor,
  type AdminRule,
  type RuleDraft,
} from "@/lib/admin-api";

/** Cost types the engine understands. Ticking one means "subtract before the %". */
const COST_TYPES = [
  { key: "production", label: "Printing / production" },
  { key: "shipping", label: "Shipping" },
  { key: "processing_fee", label: "Card processing fee" },
];

export function RateEditor({
  slug,
  contributors,
  existing,
  onDone,
  onCancel,
}: {
  slug: string;
  contributors: AdminContributor[];
  /** Present when changing an existing rate; absent when creating one. */
  existing?: AdminRule;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const isChange = Boolean(existing);

  const [ruleKey, setRuleKey] = useState(existing?.ruleKey ?? "");
  const [appliesTo, setAppliesTo] = useState<"tenant" | "contributor">(
    existing?.scope === "contributor" ? "contributor" : "tenant"
  );
  const [contributorId, setContributorId] = useState<string>(
    contributors.find((c) => c.name === existing?.contributorName)?.id ?? ""
  );
  const [percent, setPercent] = useState(
    existing?.rate !== null && existing?.rate !== undefined ? String(existing.rate) : "30"
  );
  const [payOn, setPayOn] = useState<"net" | "gross">(
    existing?.basis === "gross" ? "gross" : "net"
  );
  const [deductions, setDeductions] = useState<string[]>(
    existing?.costDeductions ?? ["production", "shipping", "processing_fee"]
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const draft: RuleDraft = {
        ruleKey: ruleKey.trim(),
        scope: appliesTo,
        scopeRef: appliesTo === "contributor" ? contributorId : null,
        contributorId: appliesTo === "contributor" ? contributorId : null,
        basis: payOn,
        method: "percent",
        percent: Number(percent),
        costDeductions: payOn === "net" ? deductions : [],
        // A rate for one person must beat the everyone-rate, or it never applies.
        priority: appliesTo === "contributor" ? 10 : 0,
      };

      return isChange
        ? changeRule(slug, existing!.ruleKey, draft)
        : createRule(slug, draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-rules", slug] });
      onDone();
    },
    onError: (err) => setError((err as Error).message),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (appliesTo === "contributor" && !contributorId) {
      setError("Choose who this rate is for");
      return;
    }

    save.mutate();
  }

  function toggleDeduction(key: string) {
    setDeductions((current) =>
      current.includes(key) ? current.filter((d) => d !== key) : [...current, key]
    );
  }

  return (
    <Card data-testid="card-rate-editor">
      <CardHeader>
        <CardTitle>{isChange ? `Change "${existing!.ruleKey}"` : "New rate"}</CardTitle>
        <CardDescription>
          {isChange
            ? "This creates a new version. Sales already recorded keep the rate they were paid under."
            : "Set who earns what, and what it is a percentage of."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rule-key">Short name</Label>
            <Input
              id="rule-key"
              value={ruleKey}
              onChange={(e) => setRuleKey(e.target.value)}
              placeholder="standard-rate"
              disabled={isChange}
              required
              data-testid="input-rule-key"
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers and dashes. Used to identify the rate; not shown to
              contributors.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Who it applies to</Label>
            <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as any)}>
              <SelectTrigger data-testid="select-applies-to">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tenant">Everyone</SelectItem>
                <SelectItem value="contributor">One person</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {appliesTo === "contributor" && (
            <div className="space-y-2">
              <Label>Person</Label>
              <Select value={contributorId} onValueChange={setContributorId}>
                <SelectTrigger data-testid="select-contributor">
                  <SelectValue placeholder="Choose someone" />
                </SelectTrigger>
                <SelectContent>
                  {contributors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A rate for one person overrides the everyone-rate.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-percent">They earn</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rule-percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                required
                className="w-28"
                data-testid="input-percent"
              />
              <span className="text-sm">%</span>
              <Select value={payOn} onValueChange={(v) => setPayOn(v as any)}>
                <SelectTrigger className="w-56" data-testid="select-pay-on">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="net">of profit, after costs</SelectItem>
                  <SelectItem value="gross">of the full sale price</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {payOn === "net" && (
            <div className="space-y-2">
              <Label>Costs to subtract first</Label>
              <div className="space-y-2">
                {COST_TYPES.map((cost) => (
                  <label key={cost.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={deductions.includes(cost.key)}
                      onChange={() => toggleDeduction(cost.key)}
                      data-testid={`checkbox-${cost.key}`}
                    />
                    {cost.label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Anything left unticked is treated as your own overhead and does not
                reduce what they earn.
              </p>
            </div>
          )}

          {/*
            Stated at the point of saving, not buried in help text. Owners
            reliably expect a rate change to fix past payments; it does not.
          */}
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            This applies to sales recorded from now on. Payments already made are not
            recalculated — they keep the rate that applied at the time.
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-rate-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending} data-testid="button-save-rate">
              {save.isPending ? "Saving…" : isChange ? "Save as new version" : "Create rate"}
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-rate">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
