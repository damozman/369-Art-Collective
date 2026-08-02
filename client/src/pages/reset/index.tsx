/**
 * The page an emailed reset link lands on.
 *
 * Routed at `/portal/:tenantSlug/reset` and `/manage/:tenantSlug/reset`. Two
 * URLs rather than one because the link is the only thing telling us which
 * sign-in the person came from, and sending a contributor to the owner console
 * afterwards would be confusing at best.
 *
 * The token arrives in the query string. That is unavoidable for an emailed
 * link, and is why the token is single-use and short-lived: a URL ends up in
 * browser history, in referrer headers, and occasionally in a support ticket
 * pasted by the person themselves.
 */

import { useParams, useLocation } from "wouter";

import { SetNewPassword } from "./password-reset";

export default function ResetPage({ surface }: { surface: "portal" | "manage" }) {
  const params = useParams<{ tenantSlug: string }>();
  const [, navigate] = useLocation();
  const tenantSlug = params.tenantSlug ?? "";

  // Read from `window.location` rather than a router hook: wouter's params do
  // not include the query string, and this value is the whole point of the page.
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const signInPath = surface === "portal" ? `/portal/${tenantSlug}` : `/manage/${tenantSlug}`;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <p className="text-sm text-muted-foreground" data-testid="text-reset-no-token">
          This link is incomplete. Ask for a new one from the sign-in page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <SetNewPassword
          tenantSlug={tenantSlug}
          token={token}
          onDone={() => navigate(signInPath)}
        />
      </div>
    </div>
  );
}
