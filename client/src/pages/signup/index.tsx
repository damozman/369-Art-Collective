/**
 * Pricing and signup — the only page a customer sees before they have an
 * account.
 *
 * Deliberately one page rather than two. Splitting pricing from signup means a
 * customer who has already decided has to navigate again, and it loses the plan
 * they picked. Choosing a plan and creating the account are one intention.
 *
 * Tenant-neutral by ratified decision #11: nothing here mentions art, prints or
 * 369. This is the page a record label or a publisher would land on.
 *
 * The two claims made on this page that the code has to keep:
 *
 *  1. **No card for the trial.** Stated plainly, because it is the single
 *     biggest reason someone abandons a signup form.
 *  2. **Counted on people actually paid.** Also stated, because it is the part
 *     of the pricing model people misread as "people on the books" and then
 *     feel misled by later.
 */

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, Loader2 } from "lucide-react";

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
import { getPlans, signUp, type PublicPlan } from "@/lib/signup-api";
import { formatMoney } from "@/lib/portal-money";

export default function SignupPage() {
  const [, navigate] = useLocation();
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [planKey, setPlanKey] = useState<string | null>(null);

  const plans = useQuery({ queryKey: ["public-plans"], queryFn: getPlans });

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Pay the people who make your work
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Sales come in, everyone's share is worked out, and each person can sign in
            and see exactly how their payment was calculated. No spreadsheet.
          </p>
          <p className="mt-4 text-sm font-medium">
            14 days free. No card needed to start.
          </p>
        </header>

        <IntervalToggle value={interval} onChange={setInterval} />

        {plans.isLoading && (
          <p className="mt-8 text-center text-sm text-muted-foreground">Loading plans…</p>
        )}

        {plans.data && (
          <div className="mt-8 grid gap-4 md:grid-cols-3" data-testid="grid-plans">
            {plans.data.plans.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                interval={interval}
                selected={planKey === plan.key}
                onSelect={() => setPlanKey(plan.key)}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Plans are counted on the number of people you actually pay in a month — not
          how many are on your books. A quiet month costs less.
        </p>

        {plans.data && (
          <div className="mx-auto mt-10 max-w-md">
            <SignupForm
              planKey={planKey ?? plans.data.plans[0]?.key ?? ""}
              interval={interval}
              onDone={(slug) => navigate(`/manage/${slug}`)}
            />
          </div>
        )}

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
          Advances and recoupment — paying someone up front and earning it back — are
          not supported yet. If that is how your deals work, talk to us before signing
          up rather than after.
        </p>
      </main>
    </div>
  );
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: "monthly" | "annual";
  onChange: (next: "monthly" | "annual") => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-lg border p-1 mx-auto w-fit">
      {(["monthly", "annual"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
            value === option
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`button-interval-${option}`}
        >
          {option === "monthly" ? "Monthly" : "Yearly"}
          {option === "annual" && (
            <span className="ml-2 text-xs opacity-90">2 months free</span>
          )}
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  selected,
  onSelect,
}: {
  plan: PublicPlan;
  interval: "monthly" | "annual";
  selected: boolean;
  onSelect: () => void;
}) {
  const annual = interval === "annual";
  // The headline is always a per-month figure so the two intervals can be
  // compared without arithmetic. The real yearly charge is stated underneath —
  // showing only "$41/mo" for something billed at $490 once would be the kind
  // of pricing sleight-of-hand this product should not do.
  const headline = annual ? plan.annualPerMonth : plan.monthly;

  return (
    <Card
      className={selected ? "border-primary ring-1 ring-primary" : undefined}
      data-testid={`card-plan-${plan.key}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{plan.name}</CardTitle>
          {annual && (
            <Badge variant="outline" className="font-normal">
              Save {formatMoney(plan.annualSaving.minor, plan.currency)}
            </Badge>
          )}
        </div>
        <CardDescription>{plan.blurb}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-semibold" data-testid={`text-price-${plan.key}`}>
            {formatMoney(headline.minor, plan.currency)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              /month
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {annual
              ? `Billed ${formatMoney(plan.annual.minor, plan.currency)} once a year`
              : "Billed monthly"}
          </p>
        </div>

        <ul className="space-y-1.5 text-sm">
          <Feature>Up to {plan.peopleLimit} people paid each month</Feature>
          <Feature>Everyone gets their own sign-in</Feature>
          <Feature>Refunds and chargebacks handled</Feature>
          <Feature>Payments sent from your own account</Feature>
        </ul>

        <Button
          variant={selected ? "default" : "outline"}
          className="w-full"
          onClick={onSelect}
          data-testid={`button-choose-${plan.key}`}
        >
          {selected ? "Selected" : "Choose"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function SignupForm({
  planKey,
  interval,
  onDone,
}: {
  planKey: string;
  interval: "monthly" | "annual";
  onDone: (tenantSlug: string) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result = await signUp({
        businessName,
        name,
        email,
        password,
        planKey,
        billingInterval: interval,
      });
      onDone(result.tenantSlug);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card data-testid="card-signup">
      <CardHeader>
        <CardTitle>Start your 14 days</CardTitle>
        <CardDescription>
          No card needed. You can change plan at any time.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signup-business">Business name</Label>
            <Input
              id="signup-business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              data-testid="input-signup-business"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-name">Your name</Label>
            <Input
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              data-testid="input-signup-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-signup-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="input-signup-password"
            />
            <p className="text-xs text-muted-foreground">
              At least 12 characters. A short sentence works well.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-signup-error">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy} data-testid="button-signup">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? "Setting things up…" : "Create my account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
