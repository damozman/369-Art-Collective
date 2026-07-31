/**
 * The tenant admin console, at `/manage/:tenantSlug`.
 *
 * The owner's surface over the engine, as distinct from `/portal/:tenantSlug`
 * (the contributor's). Same separation discipline as the portal: no
 * `auth-context`, no `ProtectedRoute`, nothing from `pages/artist-*` or
 * `pages/admin-*`. Those belong to the marketplace and are deleted in Phase 2.
 *
 * Two different logins can be open at once in one browser — an owner testing
 * what their artists see. The sessions are separate keys server-side, so that
 * works rather than one clobbering the other.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";

import { AdminApiError, getMe, type AdminMe } from "@/lib/admin-api";
import { AdminConsole } from "./admin-console";
import { AdminLogin } from "./admin-login";

export default function EngineAdmin() {
  const params = useParams<{ tenantSlug: string }>();
  const tenantSlug = params.tenantSlug ?? "";
  const queryClient = useQueryClient();

  /** `null` means not signed in — a 401 on first visit is normal, not an error. */
  const meQuery = useQuery<AdminMe | null>({
    queryKey: ["admin-me", tenantSlug],
    queryFn: async () => {
      try {
        return await getMe(tenantSlug);
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) return null;
        throw error;
      }
    },
    enabled: tenantSlug.length > 0,
  });

  function refreshSession() {
    queryClient.removeQueries({ queryKey: ["admin-overview"] });
    queryClient.removeQueries({ queryKey: ["admin-contributors"] });
    queryClient.removeQueries({ queryKey: ["admin-review"] });
    queryClient.removeQueries({ queryKey: ["admin-rules"] });
    queryClient.removeQueries({ queryKey: ["admin-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-me", tenantSlug] });
  }

  if (meQuery.isLoading) return <AdminMessage title="Loading…" />;

  if (meQuery.isError) {
    const notFound =
      meQuery.error instanceof AdminApiError && meQuery.error.status === 404;
    return (
      <AdminMessage
        title={notFound ? "Not found" : "Something went wrong"}
        detail={
          notFound
            ? "Check the address. If it looks right, this business may not be set up yet."
            : (meQuery.error as Error).message
        }
      />
    );
  }

  if (!meQuery.data) {
    return <AdminLogin tenantSlug={tenantSlug} onSignedIn={refreshSession} />;
  }

  return <AdminConsole me={meQuery.data} onSignedOut={refreshSession} />;
}

function AdminMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold" data-testid="text-admin-message">
          {title}
        </h1>
        {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
