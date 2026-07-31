/**
 * Client for the tenant admin API (`/api/engine/t/:tenantSlug/admin/*`).
 *
 * Standalone, like `portal-api.ts` and for the same reason: this is the engine's
 * surface, not the marketplace's, and Phase 2 deletes the marketplace client
 * wholesale. Nothing here imports from `auth-context` or `queryClient`.
 *
 * Every amount is `Money` — `{ minor: string; formatted: string }`. Never a
 * `number`. Format with `portal-money.ts`, which parses with `BigInt`.
 */

import type { Money } from "./portal-money";

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export interface AdminMe {
  name: string;
  email: string;
  role: "admin" | "viewer";
  tenant: { name: string; slug: string; currency: string };
}

export interface AdminOverview {
  currency: string;
  gross: Money;
  allocated: Money;
  paidOut: Money;
  outstanding: Money;
  held: Money;
  payableNow: Money;
  counts: {
    events: number;
    needsReview: number;
    contributors: number;
    negativeBalances: number;
    failedPayouts: number;
  };
}

export interface AdminContributor {
  id: string;
  name: string;
  email: string | null;
  externalRef: string | null;
  active: boolean;
  balance: Money;
  payable: Money;
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
  blockedReason: string | null;
}

export interface AdminReviewItem {
  id: string;
  source: string;
  sourceEventId: string;
  occurredAt: string;
  gross: Money;
  reason: string | null;
  workRef: string | null;
}

export interface AdminRule {
  id: string;
  ruleKey: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: string;
  contributorName: string | null;
  basis: string;
  method: string;
  rate: number | null;
  flatAmount: Money | null;
  costDeductions: string[];
  priority: number;
  active: boolean;
  /** Plain-language sentence built server-side. Prefer this over the raw fields. */
  description: string;
}

export interface AdminBatch {
  id: string;
  status: string;
  availableAsOf: string;
  completedAt: string | null;
  createdAt: string;
  payoutCount: number;
  paidCount: number;
  failedCount: number;
  totalPaid: Money;
}

export interface PayoutPreview {
  currency: string;
  totalToPay: Money;
  eligible: Array<{ contributorId: string; name: string; amount: Money }>;
  skipped: Array<{
    contributorId: string;
    name: string;
    amount: Money;
    reason: string;
  }>;
}

export interface RunResult {
  batchId: string;
  status: string;
  paid: number;
  failed: number;
  skipped: number;
  totalPaid: Money;
  skippedReasons: Array<{ contributorId: string; reason: string }>;
  failures: Array<{ contributorId: string; name: string; reason: string }>;
}

function base(tenantSlug: string): string {
  return `/api/engine/t/${encodeURIComponent(tenantSlug)}/admin`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch {
      /* keep statusText */
    }
    throw new AdminApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export function login(
  tenantSlug: string,
  email: string,
  password: string
): Promise<AdminMe> {
  return request<AdminMe>(`${base(tenantSlug)}/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(tenantSlug: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`${base(tenantSlug)}/logout`, { method: "POST" });
}

export function getMe(tenantSlug: string): Promise<AdminMe> {
  return request<AdminMe>(`${base(tenantSlug)}/me`);
}

export function getOverview(tenantSlug: string): Promise<AdminOverview> {
  return request<AdminOverview>(`${base(tenantSlug)}/overview`);
}

export function getContributors(
  tenantSlug: string
): Promise<{ currency: string; minimumPayout: Money; contributors: AdminContributor[] }> {
  return request(`${base(tenantSlug)}/contributors`);
}

export function getReview(
  tenantSlug: string
): Promise<{ currency: string; items: AdminReviewItem[] }> {
  return request(`${base(tenantSlug)}/review`);
}

export function getRules(tenantSlug: string): Promise<{ rules: AdminRule[] }> {
  return request(`${base(tenantSlug)}/rules`);
}

export function getPayoutBatches(
  tenantSlug: string
): Promise<{ currency: string; batches: AdminBatch[] }> {
  return request(`${base(tenantSlug)}/payouts`);
}

/** Read-only. Answers "who would be paid" without any risk of paying them. */
export function previewPayouts(tenantSlug: string): Promise<PayoutPreview> {
  return request<PayoutPreview>(`${base(tenantSlug)}/payouts/preview`);
}

export function runPayouts(tenantSlug: string): Promise<RunResult> {
  return request<RunResult>(`${base(tenantSlug)}/payouts/run`, { method: "POST" });
}

export interface AdminWork {
  id: string;
  title: string;
  externalRef: string | null;
  productType: string | null;
  contributors: Array<{ id: string; name: string; role: string | null }>;
}

export interface RuleDraft {
  ruleKey: string;
  scope: "tenant" | "contributor" | "work" | "product_type";
  scopeRef?: string | null;
  contributorId?: string | null;
  basis: "gross" | "net" | "unit";
  method: "percent" | "flat_per_unit" | "flat_per_event";
  percent?: number | null;
  flatMinor?: string | null;
  costDeductions?: string[];
  priority?: number;
  effectiveFrom?: string;
}

export function getWorks(tenantSlug: string): Promise<{ works: AdminWork[] }> {
  return request(`${base(tenantSlug)}/works`);
}

export function createRule(tenantSlug: string, draft: RuleDraft): Promise<{ id: string }> {
  return request(`${base(tenantSlug)}/rules`, {
    method: "POST",
    body: JSON.stringify(draft),
  });
}

/** Changing a rate creates a NEW VERSION. It never edits the old one. */
export function changeRule(
  tenantSlug: string,
  ruleKey: string,
  draft: RuleDraft
): Promise<{ id: string; version: number }> {
  return request(`${base(tenantSlug)}/rules/${encodeURIComponent(ruleKey)}`, {
    method: "PUT",
    body: JSON.stringify(draft),
  });
}

export function deactivateRule(tenantSlug: string, ruleKey: string): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/rules/${encodeURIComponent(ruleKey)}/deactivate`, {
    method: "POST",
  });
}

export function createContributor(
  tenantSlug: string,
  input: { name: string; email?: string; externalRef?: string; password?: string }
): Promise<{ id: string }> {
  return request(`${base(tenantSlug)}/contributors`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContributor(
  tenantSlug: string,
  contributorId: string,
  input: {
    name?: string;
    email?: string;
    externalRef?: string;
    password?: string;
    active?: boolean;
  }
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/contributors/${encodeURIComponent(contributorId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function createWork(
  tenantSlug: string,
  input: { title: string; externalRef?: string; productType?: string }
): Promise<{ id: string }> {
  return request(`${base(tenantSlug)}/works`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function linkWorkContributor(
  tenantSlug: string,
  workId: string,
  contributorId: string,
  role?: string
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/works/${encodeURIComponent(workId)}/contributors`, {
    method: "POST",
    body: JSON.stringify({ contributorId, role }),
  });
}

export function assignReviewItem(
  tenantSlug: string,
  eventId: string,
  contributorId: string,
  rememberReference = false
): Promise<{ status: string; allocated: Money; warnings: string[] }> {
  return request(`${base(tenantSlug)}/review/${encodeURIComponent(eventId)}/assign`, {
    method: "POST",
    body: JSON.stringify({ contributorId, rememberReference }),
  });
}

export function dismissReviewItem(
  tenantSlug: string,
  eventId: string,
  note: string
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/review/${encodeURIComponent(eventId)}/dismiss`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function writeOffDeficit(
  tenantSlug: string,
  contributorId: string,
  amountMinor: string,
  note: string
): Promise<{ id: string }> {
  return request(
    `${base(tenantSlug)}/contributors/${encodeURIComponent(contributorId)}/write-off`,
    { method: "POST", body: JSON.stringify({ amountMinor, note }) }
  );
}

export function retryPayout(
  tenantSlug: string,
  payoutId: string
): Promise<{ status: string; failureReason?: string }> {
  return request(`${base(tenantSlug)}/payouts/${encodeURIComponent(payoutId)}/retry`, {
    method: "POST",
  });
}
