/**
 * The timer that drives the daily job.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY A TICK, AND NOT "RUN AT 03:00 UTC"
 * ────────────────────────────────────────────────────────────────────────
 *
 * The obvious design computes the milliseconds until the next 03:00 and sleeps.
 * It has a failure mode that is invisible until it costs a customer: if the
 * process is not running at 03:00 — a deploy, a restart, a platform that cycles
 * idle containers — that day simply does not happen, and nobody finds out. On a
 * host that recycles every few hours the job could go weeks without ever being
 * awake at the appointed minute.
 *
 * Fixing that properly means persisting the last run and catching up, which is
 * a second source of truth about what has been sent, sitting next to the one
 * the database already enforces.
 *
 * So instead this ticks hourly and lets `runDailyJobs` be idempotent. The
 * dedupe keys in `sendOnce` — the trial's end date, the calendar day — are what
 * make "run it again" mean "send nothing new". A restart re-runs the sweep
 * immediately and correctly; a missed hour is caught by the next one; a clock
 * jump changes nothing. The cost is a couple of cheap queries per tenant per
 * hour, which is not a cost.
 *
 * One honest consequence: the review digest goes out on the first tick after
 * midnight UTC, so its arrival time depends on when the process last started
 * rather than being pinned to a chosen hour. For a "these are waiting for you"
 * digest that is immaterial. If it ever needs to land at a specific local hour,
 * that is a real feature (per-tenant timezone and a send-hour preference), not
 * a tweak to this interval.
 *
 * ⚠️ REFUSES TO START WITHOUT A CONFIGURED SENDER. See `isEmailConfigured` —
 * sweeping every tenant through the unconfigured sender would claim and burn
 * every trial-warning dedupe key, and those warnings could never be recovered.
 */

import { isEmailConfigured, getEmailSender } from "../email/sender";
import type { EngineDb } from "../ingest";
import { runDailyJobs, type DailyJobSummary } from "./daily";

const DEFAULT_INTERVAL_MINUTES = 60;

export interface SchedulerHandle {
  /** Stop ticking. Safe to call more than once. */
  stop(): void;
  /** Run the sweep now, outside the tick. Used by the CLI entry point. */
  runNow(): Promise<DailyJobSummary>;
}

export interface StartOptions {
  baseUrl: string;
  intervalMinutes?: number;
  /** Skip the immediate sweep on start. Used by tests. */
  skipInitialRun?: boolean;
  log?: (message: string) => void;
}

/**
 * Start the hourly tick. Returns null when the deployment cannot send email,
 * which is the normal state in development and in every sandbox.
 */
export function startDailyJobs(
  db: EngineDb,
  options: StartOptions
): SchedulerHandle | null {
  const log = options.log ?? ((message: string) => console.log(message));

  if (!isEmailConfigured()) {
    log(
      "[jobs] daily job not started: email is not configured " +
        "(set RESEND_API_KEY and EMAIL_FROM). No trial or review reminders will be sent."
    );
    return null;
  }

  // A misconfigured interval falls back rather than throwing or, worse,
  // becoming `setInterval(fn, NaN)` — which Node treats as 1ms and would sweep
  // every tenant in a tight loop.
  const configured =
    options.intervalMinutes ?? Number(process.env.DAILY_JOB_INTERVAL_MINUTES);

  const minutes =
    typeof configured === "number" && Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_INTERVAL_MINUTES;

  // Guards against a slow sweep overlapping the next tick. Two concurrent
  // sweeps would not double-send — the unique index settles that — but they
  // would race for the same rows to no purpose.
  let running = false;
  let stopped = false;

  async function runOnce(): Promise<DailyJobSummary> {
    const summary = await runDailyJobs(db, {
      sender: getEmailSender(),
      baseUrl: options.baseUrl,
    });

    const notable =
      summary.trialWarnings.sent +
      summary.reviewDigests.sent +
      summary.trialWarnings.failed +
      summary.reviewDigests.failed +
      summary.errors.length;

    // Quiet when there is nothing to say. An hourly line saying "nothing
    // happened" trains everyone to ignore the one that matters.
    if (notable > 0) {
      log(
        `[jobs] daily sweep: ${summary.tenantsSwept} tenants, ` +
          `${summary.trialWarnings.sent} trial warnings, ` +
          `${summary.reviewDigests.sent} review digests, ` +
          `${summary.trialWarnings.failed + summary.reviewDigests.failed} failed, ` +
          `${summary.errors.length} errors`
      );
    }

    return summary;
  }

  async function tick(): Promise<void> {
    if (running || stopped) return;
    running = true;

    try {
      await runOnce();
    } catch (error) {
      // `runDailyJobs` already collects its own failures; this only catches
      // something truly unexpected. It must never reach the process.
      log(`[jobs] daily sweep failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(tick, minutes * 60 * 1000);
  // So the timer never holds the process open — a scheduled job must not be
  // the reason a container refuses to exit.
  timer.unref?.();

  log(`[jobs] daily job started, sweeping every ${minutes} minutes`);

  // Immediately, so a restart catches anything missed while the process was
  // down rather than waiting a full interval.
  if (!options.skipInitialRun) void tick();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    runNow: runOnce,
  };
}
