/**
 * Client for the contributor portal API (`/api/engine/t/:tenantSlug/*`).
 *
 * Deliberately standalone rather than reusing the marketplace's `apiRequest`
 * and `auth-context`. The portal is a different surface with a different
 * session (`engineContributor`, tenant-scoped) over a different schema, and in
 * Phase 2 the marketplace client is deleted wholesale — nothing under
 * `pages/portal` or this file should need touching when that happens. Sharing
 * an auth helper across the two would quietly recreate the coupling that
 * ratified decision #9 exists to prevent.
 *
 * Every amount below is typed as `Money`/`string`, never `number`. See
 * `portal-money.ts` for why that is load-bearing rather than fussy.
 */

import type { Money } from "./portal-money";

/** Thrown for any non-2xx response, carrying the status so 401 can be special. */
export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "PortalApiError";
  }
}

export interface PortalTenant {
  name: string;
  slug: string;
  currency: string;
}

export interface PortalSession {
  contributorId: string;
  name: string;
  email: string;
  tenant: { name: string; slug: string };
}

export interface PortalMe extends PortalSession {
  currency: string;
  /** The full ledger balance, held portion included. */
  balanceMinor: string;
  balance: string;
  /** The part that has cleared its hold window and can be paid out now. */
  payableMinor: string;
  payable: string;
  /** Earned but still inside the refund window. */
  heldMinor: string;
}

/** One step of the stored derivation. `amountMinor` is a string — see ingest.ts. */
export interface TraceStep {
  label: string;
  amountMinor?: string;
  detail?: string;
}

export type StatementLineType =
  | "allocation"
  | "reversal"
  | "adjustment"
  | "payout"
  | "payout_reversal";

export interface StatementLine {
  occurredAt: string;
  type: StatementLineType;
  amount: Money;
  /** The derivation as it was recorded at calculation time. Render, never recompute. */
  explanation: string | null;
  trace: TraceStep[] | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  workTitle: string | null;
  availableAt: string | null;
  held: boolean;
}

export interface StatementTotals {
  earned: Money;
  reversed: Money;
  adjustments: Money;
  paidOut: Money;
  closingBalance: Money;
  payableNow: Money;
  held: Money;
}

export interface PortalStatement {
  contributorId: string;
  contributorName: string;
  tenantName: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: Money;
  lines: StatementLine[];
  totals: StatementTotals;
  summary: string;
}

export interface PortalPayout {
  id: string;
  status: string;
  amountMinor: string;
  amount: string;
  currency: string;
  reserveHeldMinor: string;
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
}

function base(tenantSlug: string): string {
  return `/api/engine/t/${encodeURIComponent(tenantSlug)}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // The session cookie is the whole auth mechanism; without this every
    // request is anonymous and the portal looks permanently logged out.
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });

  if (!res.ok) {
    // The API answers with `{ message }`; fall back to the status text for
    // anything that is not JSON (a proxy error page, say).
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch {
      /* keep statusText */
    }
    throw new PortalApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export function getTenant(tenantSlug: string): Promise<PortalTenant> {
  return request<PortalTenant>(base(tenantSlug));
}

export function login(
  tenantSlug: string,
  email: string,
  password: string
): Promise<PortalSession> {
  return request<PortalSession>(`${base(tenantSlug)}/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(tenantSlug: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${base(tenantSlug)}/logout`, { method: "POST" });
}

export function getMe(tenantSlug: string): Promise<PortalMe> {
  return request<PortalMe>(`${base(tenantSlug)}/me`);
}

export function getStatement(
  tenantSlug: string,
  range?: { from?: string; to?: string }
): Promise<PortalStatement> {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const query = params.toString();
  return request<PortalStatement>(`${base(tenantSlug)}/statement${query ? `?${query}` : ""}`);
}

export function getPayouts(tenantSlug: string): Promise<{ payouts: PortalPayout[] }> {
  return request<{ payouts: PortalPayout[] }>(`${base(tenantSlug)}/payouts`);
}
