/**
 * Date display for the portal.
 *
 * Formatted from the ISO string's date part, NOT via `new Date(...)` and the
 * browser's locale. That is not pedantry: the engine records `occurredAt` as an
 * instant, and a sale stamped `2026-06-15T02:00:00Z` renders as *14 June* for a
 * contributor in Los Angeles. The statement they see would then disagree with
 * the emailed one, with `renderStatementText` on the server (which slices the
 * ISO string), and with the tenant's own record of the same sale — over a
 * one-day shift that looks, to someone chasing a missing payment, exactly like
 * a discrepancy worth disputing.
 *
 * So the whole portal reads dates in UTC, the way they were recorded.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-06-15T02:00:00.000Z` → `15 Jun 2026`. */
export function formatDate(iso: string | null | undefined): string {
  const ymd = isoDate(iso);
  if (!ymd) return "—";

  const [year, month, day] = ymd.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return ymd;

  // Number() on a day-of-month is safe in a way it is never safe on money.
  return `${Number(day)} ${monthName} ${year}`;
}

/** The `YYYY-MM-DD` part of an ISO timestamp, or null if it is not one. */
export function isoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ymd = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** Today in UTC as `YYYY-MM-DD`, for seeding the date-range inputs. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 1 January of the given date's UTC year — the statement's default start. */
export function startOfYearIso(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-01-01`;
}
