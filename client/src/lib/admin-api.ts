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
  costs: Array<{ type: string; amount: Money; source: string | null }>;
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
  archivedAt: string | null;
  contributors: Array<{ id: string; name: string; role: string | null }>;
}

export interface AdminSettings {
  payoutHoldDays: number;
  minimumPayout: Money;
  clawbackPolicy: "recoup" | "absorb" | "reserve";
  reservePercent: number;
  reserveReleaseDays: number;
  currency: string;
  stripeConnected: boolean;
}

/**
 * Note `minimumPayout` goes UP as a decimal string, not as minor units, and not
 * as a number. The server parses it with the same exact reader the engine uses.
 * Sending `Number(input)` from here would round before the server ever saw it.
 */
export interface SettingsDraft {
  payoutHoldDays: number;
  minimumPayout: string;
  clawbackPolicy: "recoup" | "absorb" | "reserve";
  reservePercent?: number | null;
  reserveReleaseDays?: number | null;
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

export function getSettings(tenantSlug: string): Promise<AdminSettings> {
  return request(`${base(tenantSlug)}/settings`);
}

export function updateSettings(
  tenantSlug: string,
  input: SettingsDraft
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/settings`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updateWork(
  tenantSlug: string,
  workId: string,
  input: { title?: string; externalRef?: string; productType?: string }
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/works/${encodeURIComponent(workId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setWorkArchived(
  tenantSlug: string,
  workId: string,
  archived: boolean
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/works/${encodeURIComponent(workId)}/archive`, {
    method: "POST",
    body: JSON.stringify({ archived }),
  });
}

export function unlinkWorkContributor(
  tenantSlug: string,
  workId: string,
  contributorId: string
): Promise<{ ok: boolean }> {
  return request(
    `${base(tenantSlug)}/works/${encodeURIComponent(workId)}/contributors/${encodeURIComponent(
      contributorId
    )}`,
    { method: "DELETE" }
  );
}

/**
 * Record a cost the sales channel could not report — most often a PayPal fee.
 * `amount` is a decimal string typed by a human ("2.04"); it is parsed exactly
 * on the server. Do not convert it to a number on the way out.
 */
export function recordEventCost(
  tenantSlug: string,
  eventId: string,
  input: { type: string; amount: string; note?: string }
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/review/${encodeURIComponent(eventId)}/cost`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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

// ============================================================
// Billing
// ============================================================

export interface BillingPlan {
  key: string;
  name: string;
  blurb: string;
  peopleLimit: number;
  currency: string;
  monthly: Money;
  annual: Money;
  annualPerMonth: Money;
  annualSaving: Money;
  monthsChargedAnnually: number;
}

export interface BillingView {
  plans: BillingPlan[];
  subscription: {
    planKey: string;
    status: "trialing" | "active" | "past_due" | "canceled";
    billingInterval: "monthly" | "annual";
    trialEndsAt: string | null;
    renewsAt: string;
    hasPaymentMethod: boolean;
    lastPaymentError: string | null;
  } | null;
  usage: {
    peopleThisPeriod: number;
    peopleLimit: number | null;
    overLimit: boolean;
    needsCustomPlan: boolean;
    suggestedPlanKey: string | null;
    periodStart: string;
    periodEnd: string;
  } | null;
  access: {
    access: "full" | "read_only" | "none";
    canRunPayouts: boolean;
    canWrite: boolean;
    message: string | null;
    needsPaymentMethod: boolean;
  };
  suggestedDowngradeKey: string | null;
}

export function getBilling(tenantSlug: string): Promise<BillingView> {
  return request(`${base(tenantSlug)}/billing`);
}

/** Returns a short-lived Stripe link. Navigate to it; never store it. */
export function startCheckout(
  tenantSlug: string,
  planKey: string,
  interval: "monthly" | "annual"
): Promise<{ url: string }> {
  return request(`${base(tenantSlug)}/billing/checkout`, {
    method: "POST",
    body: JSON.stringify({ planKey, interval }),
  });
}

export function openBillingPortal(tenantSlug: string): Promise<{ url: string }> {
  return request(`${base(tenantSlug)}/billing/portal`, { method: "POST" });
}

/** Only valid while still trialing — see the server route for why. */
export function changePlan(
  tenantSlug: string,
  planKey: string,
  interval: "monthly" | "annual"
): Promise<{ ok: boolean }> {
  return request(`${base(tenantSlug)}/billing/plan`, {
    method: "POST",
    body: JSON.stringify({ planKey, interval }),
  });
}

// ---- Year-end payment reporting (1099) ----

/**
 * Why a row needs looking at before it is filed. Mirrors `TaxRowFlag` on the
 * server; the wording each one gets on screen lives in `tax-tab.tsx`, once.
 */
export type TaxRowFlag =
  | "no_tax_form"
  | "foreign_person"
  | "invalid_tax_identity"
  | "below_threshold"
  | "non_usd";

export interface TaxYearRow {
  contributorId: string;
  name: string;
  email: string | null;
  stripeAccountId: string | null;
  taxFormType: string | null;
  taxIdentityStatus: string;
  currency: string;
  paid: Money;
  payoutCount: number;
  firstPaidAt: string;
  lastPaidAt: string;
  flags: TaxRowFlag[];
}

export interface TaxYearReport {
  year: number;
  /** Inclusive start of the window, ISO/UTC. */
  from: string;
  /** EXCLUSIVE end. Printed on screen so the figure can always be explained. */
  until: string;
  thresholdMinor: string;
  counts: {
    rows: number;
    /** Distinct people. Differs from `rows` when someone is paid in two currencies. */
    contributors: number;
    reportable: number;
    missingTaxForm: number;
  };
  totalsByCurrency: { currency: string; rowCount: number; total: Money }[];
  rows: TaxYearRow[];
}

export function getTaxYears(tenantSlug: string): Promise<{ years: number[] }> {
  return request(`${base(tenantSlug)}/tax/years`);
}

export function getTaxReport(tenantSlug: string, year: number): Promise<TaxYearReport> {
  return request(`${base(tenantSlug)}/tax/1099?year=${encodeURIComponent(String(year))}`);
}

/**
 * Where the CSV download points.
 *
 * A plain link rather than a fetch: the browser's own download handling reads
 * the `Content-Disposition` filename the server sets, and rebuilding that
 * through a blob would mean naming the file twice, in two places, from two
 * pieces of code that would eventually disagree.
 */
export function taxCsvUrl(tenantSlug: string, year: number): string {
  return `${base(tenantSlug)}/tax/1099.csv?year=${encodeURIComponent(String(year))}`;
}

export interface AdminAuditEntry {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string;
  actorType: string;
  before: unknown;
  after: unknown;
}

export function getAuditLog(
  tenantSlug: string,
  options: { action?: string; before?: string } = {}
): Promise<{ entries: AdminAuditEntry[]; actions: string[] }> {
  const params = new URLSearchParams();
  if (options.action) params.set("action", options.action);
  if (options.before) params.set("before", options.before);

  const query = params.toString();
  return request(`${base(tenantSlug)}/audit${query ? `?${query}` : ""}`);
}

// ============================================================
// CSV import
// ============================================================
//
// Three calls for one job, in order: what columns does this file have, what
// would importing it do, and only then do it. The file content is posted each
// time rather than held on the server between steps — there is then no window
// in which the file the owner approved and the file that gets imported differ.

export type CsvDateFormat = "iso" | "mdy" | "dmy";

export interface CsvColumnMapping {
  amount: string;
  date: string;
  work?: string;
  contributor?: string;
  reference?: string;
  quantity?: string;
  currency?: string;
  share?: string;
  role?: string;
  description?: string;
  costs?: Partial<Record<"production" | "shipping" | "processing_fee", string>>;
}

export interface CsvImportConfig {
  mapping: CsvColumnMapping;
  dateFormat: CsvDateFormat;
  currency: string;
  statementLabel: string;
}

export interface CsvInspection {
  headers: string[];
  delimiter: string;
  rowCount: number;
  raggedCount: number;
  sample: string[][];
}

export interface CsvPreviewRow {
  line: number;
  workRef: string | null;
  contributorRef: string | null;
  amount: Money;
  currency: string;
  occurredAt: string;
  outcome: "import" | "hold" | "already_imported";
  reason?: string;
}

export interface CsvPreview {
  statementLabel: string;
  delimiter: string;
  headers: string[];
  totalRows: number;
  readableRows: number;
  willImport: number;
  willHold: number;
  alreadyImported: number;
  total: Money;
  currencies: string[];
  errors: Array<{ line: number; message: string }>;
  warnings: string[];
  unknownWorks: string[];
  unknownContributors: string[];
  lookAlikes: Array<{ line: number; existingSource: string; existingSourceEventId: string }>;
  lookAlikeCheckSkipped: boolean;
  rows: CsvPreviewRow[];
}

export interface CsvImportResult {
  statementLabel: string;
  imported: number;
  heldForReview: number;
  duplicates: number;
  failed: number;
  totalGross: Money;
  totalAllocated: Money;
  errors: Array<{ line: number; message: string }>;
}

export function inspectCsv(tenantSlug: string, content: string): Promise<CsvInspection> {
  return request(`${base(tenantSlug)}/import/csv/inspect`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

/** Writes nothing. Answers "what would this do" before anything is owed. */
export function previewCsv(
  tenantSlug: string,
  content: string,
  config: CsvImportConfig
): Promise<CsvPreview> {
  return request(`${base(tenantSlug)}/import/csv/preview`, {
    method: "POST",
    body: JSON.stringify({ content, config }),
  });
}

export function commitCsv(
  tenantSlug: string,
  content: string,
  config: CsvImportConfig
): Promise<CsvImportResult> {
  return request(`${base(tenantSlug)}/import/csv/commit`, {
    method: "POST",
    body: JSON.stringify({ content, config }),
  });
}

export interface AdminAdvance {
  id: string;
  contributorId: string;
  contributorName: string;
  amount: Money;
  recouped: Money;
  outstanding: Money;
  recoupmentPercent: number;
  currency: string;
  status: "open" | "written_off" | "cancelled";
  workId: string | null;
  workTitle: string | null;
  issuedAt: string;
  note: string | null;
  closedAt: string | null;
  closeNote: string | null;
}

export function getAdvances(
  tenantSlug: string,
  options: { includeClosed?: boolean } = {}
): Promise<{ currency: string; advances: AdminAdvance[] }> {
  const query = options.includeClosed ? "?includeClosed=true" : "";
  return request(`${base(tenantSlug)}/advances${query}`);
}

/**
 * `amount` goes up as a decimal STRING, never a number — the server parses it
 * with the engine's exact reader. Same rule as the minimum payout.
 */
export function createAdvance(
  tenantSlug: string,
  input: {
    contributorId: string;
    amount: string;
    recoupmentPercent: number;
    issuedAt: string;
    workId?: string | null;
    note?: string | null;
  }
): Promise<{ advance: AdminAdvance }> {
  return request(`${base(tenantSlug)}/advances`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function closeAdvance(
  tenantSlug: string,
  advanceId: string,
  input: { status: "written_off" | "cancelled"; note?: string }
): Promise<{ advance: AdminAdvance }> {
  return request(`${base(tenantSlug)}/advances/${encodeURIComponent(advanceId)}/close`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
