/**
 * Forgot-password and set-a-new-password, shared by both sign-ins.
 *
 * One component, parameterised by `subject`, because the two flows are
 * identical from the person's side and duplicating them means fixing every
 * wording problem twice.
 *
 * ⚠️ THE CONFIRMATION MESSAGE IS DELIBERATELY VAGUE, and matching the server
 * matters. The endpoint answers the same way whether or not an account exists,
 * so this screen must not add "we've sent it to you" or "check that address is
 * right" — either would reintroduce the membership oracle the server is
 * carefully avoiding.
 */

import { useEffect, useState, type FormEvent } from "react";

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

export type ResetSubject = "contributor" | "tenant_user";

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Step one: ask for a link. */
export function ForgotPassword({
  tenantSlug,
  subject,
  onBack,
}: {
  tenantSlug: string;
  subject: ResetSubject;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await post(
        `/api/engine/t/${encodeURIComponent(tenantSlug)}/password/forgot`,
        { email, subject }
      );

      if (response.status === 429) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Too many requests. Try again later.");
        setBusy(false);
        return;
      }

      // Anything else is treated as success, because the server answers
      // identically for a known and an unknown address.
      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card data-testid="card-forgot-sent">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If that address has an account, a reset link is on its way. It works
            once, and expires in an hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onBack} data-testid="button-back-to-signin">
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-forgot">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email address and we'll send you a link.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-email">Email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-forgot-email"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-forgot-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy} data-testid="button-send-reset">
              {busy ? "Sending…" : "Send me a link"}
            </Button>
            <Button type="button" variant="ghost" onClick={onBack}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Step two: set the new password.
 *
 * Checks the link before showing the form. Letting somebody type a password and
 * only then saying "that link expired" wastes the effort and, worse, teaches
 * them to distrust the reset flow at the moment they most need it to work.
 */
export function SetNewPassword({
  tenantSlug,
  token,
  onDone,
}: {
  tenantSlug: string;
  token: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<"checking" | "ok" | "bad">("checking");
  const [reason, setReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(
      `/api/engine/t/${encodeURIComponent(tenantSlug)}/password/check?token=${encodeURIComponent(token)}`,
      { credentials: "include" }
    )
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setState(body.valid ? "ok" : "bad");
        setReason(body.reason ?? null);
      })
      .catch(() => {
        if (!cancelled) setState("bad");
      });

    return () => {
      cancelled = true;
    };
  }, [tenantSlug, token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server: the server cannot see the second
    // box, and "you typed two different passwords" is a much better message
    // than silently setting the first one.
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const response = await post(
        `/api/engine/t/${encodeURIComponent(tenantSlug)}/password/reset`,
        { token, password }
      );
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "That did not work.");
        setBusy(false);
        return;
      }

      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  if (state === "checking") {
    return <p className="text-sm text-muted-foreground">Checking your link…</p>;
  }

  if (state === "bad") {
    return (
      <Card data-testid="card-reset-invalid">
        <CardHeader>
          <CardTitle>That link doesn't work</CardTitle>
          <CardDescription>
            {reason ?? "This link is not valid."} Ask for a new one and it will be
            sent straight away.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onDone} data-testid="button-reset-restart">
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card data-testid="card-reset-done">
        <CardHeader>
          <CardTitle>Password changed</CardTitle>
          <CardDescription>
            Sign in with your new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onDone} data-testid="button-reset-signin">
            Sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-reset">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>At least 8 characters.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="input-reset-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Type it again</Label>
            <Input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              data-testid="input-reset-confirm"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="text-reset-error">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} data-testid="button-set-password">
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
