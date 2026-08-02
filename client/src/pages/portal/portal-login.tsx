/**
 * Contributor sign-in.
 *
 * Identity is `(tenant, email)`, not email alone — the same freelancer can work
 * for several tenants — so the tenant is fixed by the URL and shown on the form
 * rather than being something the contributor picks. Signing in at
 * `/portal/369` can only ever reach 369's earnings.
 *
 * The server answers every failure with one message ("Incorrect email or
 * password") so nobody can enumerate who works for a tenant. This form renders
 * that message verbatim and never tries to be more helpful than it.
 */

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortalApiError, login, type PortalTenant } from "@/lib/portal-api";
import { ForgotPassword } from "@/pages/reset/password-reset";

export function PortalLogin({
  tenant,
  onSignedIn,
}: {
  tenant: PortalTenant;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(tenant.slug, email, password);
      onSignedIn();
    } catch (err) {
      // Rate limiting (429) is worth surfacing as itself; everything else gets
      // the server's single deliberately-vague message.
      setError(
        err instanceof PortalApiError ? err.message : "Could not sign in. Please try again."
      );
      setSubmitting(false);
    }
  }

  if (forgot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md">
          <ForgotPassword
            tenantSlug={tenant.slug}
            subject="contributor"
            onBack={() => setForgot(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="text-portal-login-title">
            {tenant.name}
          </CardTitle>
          <CardDescription>
            Sign in to see what you have earned, how it was worked out, and when it gets paid.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portal-email">Email</Label>
              <Input
                id="portal-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-portal-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="portal-password">Password</Label>
              <Input
                id="portal-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-portal-password"
              />
            </div>

            {error && (
              <p
                className="text-sm text-destructive"
                role="alert"
                data-testid="text-portal-login-error"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-portal-login"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>

            <button
              type="button"
              onClick={() => setForgot(true)}
              className="block w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
              data-testid="button-portal-forgot"
            >
              Forgotten your password?
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
