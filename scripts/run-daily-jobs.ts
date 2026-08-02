/**
 * Run the daily sweep once and exit.
 *
 * The app runs this on its own timer (`server/engine/jobs/scheduler.ts`), so
 * this script is not required for the job to happen. It exists for two cases:
 *
 *   1. **An external scheduler.** A platform cron, a Kubernetes CronJob or a
 *      Render/Railway scheduled task can drive this instead. Useful when the
 *      web process is scaled to zero between requests, which is exactly the
 *      deployment where an in-process timer never fires.
 *   2. **Sending it by hand**, to check what a real inbox receives.
 *
 * Running both the timer and an external cron is harmless — the sweep is
 * idempotent by design. See the header of `jobs/daily.ts`.
 *
 *   npm run job:daily
 */

import { getEngineDb, isEngineDbConfigured } from "../server/engine/db";
import { getEmailSender, isEmailConfigured } from "../server/engine/email/sender";
import { runDailyJobs } from "../server/engine/jobs/daily";

async function main(): Promise<void> {
  if (!isEngineDbConfigured()) {
    console.error("DATABASE_URL is not set — nothing to sweep.");
    process.exit(1);
  }

  if (!isEmailConfigured()) {
    // Refuses rather than sweeping. Claiming every trial-warning dedupe key
    // against a sender that cannot deliver would permanently silence those
    // warnings — see `isEmailConfigured`.
    console.error(
      "Email is not configured (set RESEND_API_KEY and EMAIL_FROM). " +
        "Refusing to sweep: it would mark reminders as sent without sending them."
    );
    process.exit(1);
  }

  const baseUrl = (process.env.PUBLIC_APP_URL ?? "http://localhost:5000").replace(
    /\/+$/,
    ""
  );

  const summary = await runDailyJobs(getEngineDb(), {
    sender: getEmailSender(),
    baseUrl,
  });

  console.log(JSON.stringify(summary, null, 2));

  // A non-zero exit so an external scheduler's own alerting notices, rather
  // than the failure living only in a log nobody reads.
  if (summary.errors.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error("Daily job failed:", error);
  process.exit(1);
});
