/**
 * The contributor portal, at `/portal/:tenantSlug`.
 *
 * A SEPARATE SURFACE from the marketplace's artist pages, deliberately. It does
 * not use `auth-context`, `ProtectedRoute`, or any `pages/artist-*` component:
 * those belong to the system being retired in Phase 2, and this must survive
 * their deletion untouched. The only thing shared is the shadcn component
 * library and the query client.
 *
 * The tenant comes from the URL, so an unknown slug is a 404 that looks exactly
 * like a tenant the visitor has no business knowing exists — matching the
 * server, which answers unknown slugs the same way for the same reason.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";

import { PortalApiError, getMe, getTenant, type PortalMe } from "@/lib/portal-api";
import { PortalDashboard } from "./portal-dashboard";
import { PortalLogin } from "./portal-login";

export default function Portal() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug ?? "";
  const queryClient = useQueryClient();

  const tenantQuery = useQuery({
    queryKey: ["portal-tenant", tenantSlug],
    queryFn: () => getTenant(tenantSlug),
    enabled: tenantSlug.length > 0,
  });

  /**
   * `null` means "not signed in" rather than an error — a 401 here is the
   * normal first visit, not a failure worth showing anyone.
   */
  const meQuery = useQuery<PortalMe | null>({
    queryKey: ["portal-me", tenantSlug],
    queryFn: async () => {
      try {
        return await getMe(tenantSlug);
      } catch (error) {
        if (error instanceof PortalApiError && error.status === 401) return null;
        throw error;
      }
    },
    enabled: tenantQuery.isSuccess,
  });

  function refreshSession() {
    // Everything downstream keys off the session, so drop the lot rather than
    // trying to be surgical. Signing in and out are both rare.
    queryClient.removeQueries({ queryKey: ["portal-statement"] });
    queryClient.removeQueries({ queryKey: ["portal-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["portal-me", tenantSlug] });
  }

  if (tenantQuery.isLoading || (tenantQuery.isSuccess && meQuery.isLoading)) {
    return <PortalMessage title="Loading…" />;
  }

  if (tenantQuery.isError) {
    const notFound =
      tenantQuery.error instanceof PortalApiError && tenantQuery.error.status === 404;

    return (
      <PortalMessage
        title={notFound ? "Portal not found" : "Something went wrong"}
        detail={
          notFound
            ? "Check the link you were given. If it looks right, ask whoever invited you."
            : (tenantQuery.error as Error).message
        }
      />
    );
  }

  if (meQuery.isError) {
    return (
      <PortalMessage
        title="Something went wrong"
        detail={(meQuery.error as Error).message}
      />
    );
  }

  if (!meQuery.data) {
    return <PortalLogin tenant={tenantQuery.data!} onSignedIn={refreshSession} />;
  }

  return <PortalDashboard me={meQuery.data} onSignedOut={refreshSession} />;
}

function PortalMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold" data-testid="text-portal-message">
          {title}
        </h1>
        {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
