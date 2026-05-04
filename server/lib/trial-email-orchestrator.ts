import { db } from './db';
import { subscriptionTrials, emailLogs, artists } from '@shared/schema';
import { eq, and, lt, gte, isNull } from 'drizzle-orm';
import { emailService } from './email-service';
import { 
  trialDay3Email, 
  trialEndingSoonEmail, 
  trialLastChanceEmail, 
  reEngagementEmail,
  replaceEmailPlaceholders,
  escapeHtml
} from '../email-templates';

// Email orchestration for trial lifecycle emails
// Called from subscription-service webhook handlers and scheduled jobs

interface SendTrialEmailResult {
  sent: boolean;
  reason?: string;
  emailLogId?: string;
}

// Idempotency check - prevent duplicate emails
async function hasRecentTrialEmail(
  artistId: string,
  emailType: string,
  hourWindow: number = 24
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hourWindow * 60 * 60 * 1000);
  
  const existing = await db.select()
    .from(emailLogs)
    .where(
      and(
        eq(emailLogs.recipientId, artistId),
        eq(emailLogs.emailType, emailType),
        gte(emailLogs.sentAt, cutoff)
      )
    )
    .limit(1);
  
  return existing.length > 0;
}

// Send Trial Day 3 Welcome Email
export async function sendTrialDay3Email(artistId: string): Promise<SendTrialEmailResult> {
  try {
    // Get artist and trial details
    const artist = await db.select()
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (!artist) {
      return { sent: false, reason: 'Artist not found' };
    }

    // Check for active trial
    const trials = await db.select()
      .from(subscriptionTrials)
      .where(
        and(
          eq(subscriptionTrials.artistId, artistId),
          eq(subscriptionTrials.status, 'active')
        )
      )
      .limit(1);
    
    if (!trials.length) {
      return { sent: false, reason: 'No active trial found' };
    }

    const trial = trials[0];
    
    // Check if already sent
    if (await hasRecentTrialEmail(artistId, 'trial_day3_checkin', 72)) {
      return { sent: false, reason: 'Day 3 email already sent recently' };
    }

    // Calculate days remaining
    const trialEnd = new Date(trial.scheduledTrialEnd);
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Generate email HTML
    const domain = (process.env.PUBLIC_APP_URL || 'https://369artcollective.com').replace(/^https?:\/\//, '');
    const tierType = trial.tier as 'pro' | 'elite';
    const htmlBody = trialDay3Email({
      artistName: artist.name,
      subscriptionTier: tierType,
      trialDaysLeft: daysLeft,
      domain
    });

    const finalHtml = replaceEmailPlaceholders(htmlBody, {
      unsubscribeUrl: `https://${domain}/unsubscribe?artistId=${artistId}`,
      domain
    });

    // Send via emailService
    await emailService.sendEmail({
      recipientEmail: artist.email,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'trial_day3_checkin',
      subject: `${trial.tier === 'pro' ? 'Pro' : 'Elite'} Trial - Day 3 Check-in! 🎨`,
      htmlBody: finalHtml,
      textBody: `Hi ${escapeHtml(artist.name)}, you're 3 days into your ${trial.tier === 'pro' ? 'Pro' : 'Elite'} trial with ${daysLeft} days remaining!`,
      metadata: { trialId: trial.id, tier: trial.tier, daysLeft }
    });

    return { sent: true };
  } catch (error: any) {
    console.error('[ERROR][TRIAL_EMAIL] Day 3 email failed:', error);
    return { sent: false, reason: error.message };
  }
}

// Send Trial Ending Soon Email (2 days before expiry)
export async function sendTrialEndingSoonEmail(artistId: string): Promise<SendTrialEmailResult> {
  try {
    const artist = await db.select()
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (!artist) {
      return { sent: false, reason: 'Artist not found' };
    }

    const trials = await db.select()
      .from(subscriptionTrials)
      .where(
        and(
          eq(subscriptionTrials.artistId, artistId),
          eq(subscriptionTrials.status, 'active')
        )
      )
      .limit(1);
    
    if (!trials.length) {
      return { sent: false, reason: 'No active trial found' };
    }

    const trial = trials[0];
    
    if (await hasRecentTrialEmail(artistId, 'trial_ending_soon', 48)) {
      return { sent: false, reason: 'Ending Soon email already sent' };
    }

    const trialEnd = new Date(trial.scheduledTrialEnd);
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const domain = (process.env.PUBLIC_APP_URL || 'https://369artcollective.com').replace(/^https?:\/\//, '');
    const tierType = trial.tier as 'pro' | 'elite';
    const htmlBody = trialEndingSoonEmail({
      artistName: artist.name,
      subscriptionTier: tierType,
      trialDaysLeft: daysLeft,
      domain
    });

    const finalHtml = replaceEmailPlaceholders(htmlBody, {
      unsubscribeUrl: `https://${domain}/unsubscribe?artistId=${artistId}`,
      domain
    });

    await emailService.sendEmail({
      recipientEmail: artist.email,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'trial_ending_soon',
      subject: `⏰ Your ${trial.tier === 'pro' ? 'Pro' : 'Elite'} Trial Ends in ${daysLeft} Days`,
      htmlBody: finalHtml,
      textBody: `Hi ${escapeHtml(artist.name)}, your trial ends in ${daysLeft} days. Keep your benefits by staying subscribed!`,
      metadata: { trialId: trial.id, tier: trial.tier, daysLeft }
    });

    return { sent: true };
  } catch (error: any) {
    console.error('[ERROR][TRIAL_EMAIL] Ending Soon email failed:', error);
    return { sent: false, reason: error.message };
  }
}

// Send Trial Last Chance Email (1 day before expiry)
export async function sendTrialLastChanceEmail(artistId: string): Promise<SendTrialEmailResult> {
  try {
    const artist = await db.select()
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (!artist) {
      return { sent: false, reason: 'Artist not found' };
    }

    const trials = await db.select()
      .from(subscriptionTrials)
      .where(
        and(
          eq(subscriptionTrials.artistId, artistId),
          eq(subscriptionTrials.status, 'active')
        )
      )
      .limit(1);
    
    if (!trials.length) {
      return { sent: false, reason: 'No active trial found' };
    }

    const trial = trials[0];
    
    if (await hasRecentTrialEmail(artistId, 'trial_last_chance', 24)) {
      return { sent: false, reason: 'Last Chance email already sent' };
    }

    const domain = (process.env.PUBLIC_APP_URL || 'https://369artcollective.com').replace(/^https?:\/\//, '');
    const tierType = trial.tier as 'pro' | 'elite';
    const htmlBody = trialLastChanceEmail({
      artistName: artist.name,
      subscriptionTier: tierType,
      domain
    });

    const finalHtml = replaceEmailPlaceholders(htmlBody, {
      unsubscribeUrl: `https://${domain}/unsubscribe?artistId=${artistId}`,
      domain
    });

    await emailService.sendEmail({
      recipientEmail: artist.email,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'trial_last_chance',
      subject: `⏰ Last Chance: Your ${trial.tier === 'pro' ? 'Pro' : 'Elite'} Trial Ends Tomorrow`,
      htmlBody: finalHtml,
      textBody: `Hi ${escapeHtml(artist.name)}, this is your last chance! Your trial expires in 24 hours.`,
      metadata: { trialId: trial.id, tier: trial.tier }
    });

    return { sent: true };
  } catch (error: any) {
    console.error('[ERROR][TRIAL_EMAIL] Last Chance email failed:', error);
    return { sent: false, reason: error.message };
  }
}

// Send Re-engagement Email (after downgrade from Pro/Elite → Free)
export async function sendReEngagementEmail(
  artistId: string,
  previousTier: 'pro' | 'elite'
): Promise<SendTrialEmailResult> {
  try {
    const artist = await db.select()
      .from(artists)
      .where(eq(artists.id, artistId))
      .limit(1)
      .then(rows => rows[0]);
    
    if (!artist) {
      return { sent: false, reason: 'Artist not found' };
    }

    // Check if already sent in last 30 days
    if (await hasRecentTrialEmail(artistId, 'trial_expired_reengage', 30 * 24)) {
      return { sent: false, reason: 'Re-engagement email already sent recently' };
    }

    const domain = (process.env.PUBLIC_APP_URL || 'https://369artcollective.com').replace(/^https?:\/\//, '');
    const htmlBody = reEngagementEmail({
      artistName: artist.name,
      previousTier,
      domain
    });

    const finalHtml = replaceEmailPlaceholders(htmlBody, {
      unsubscribeUrl: `https://${domain}/unsubscribe?artistId=${artistId}`,
      domain
    });

    await emailService.sendEmail({
      recipientEmail: artist.email,
      recipientType: 'artist',
      recipientId: artistId,
      emailType: 'trial_expired_reengage',
      subject: `We Miss You! Special Offer to Rejoin ${previousTier === 'pro' ? 'Pro' : 'Elite'}`,
      htmlBody: finalHtml,
      textBody: `Hi ${escapeHtml(artist.name)}, we'd love to have you back on ${previousTier === 'pro' ? 'Pro' : 'Elite'}!`,
      metadata: { previousTier }
    });

    return { sent: true };
  } catch (error: any) {
    console.error('[ERROR][TRIAL_EMAIL] Re-engagement email failed:', error);
    return { sent: false, reason: error.message };
  }
}

// Scheduled job: Check all active trials and send appropriate emails
export async function processTrialEmails(): Promise<{
  day3Sent: number;
  endingSoonSent: number;
  lastChanceSent: number;
  errors: number;
}> {
  const now = new Date();
  const results = {
    day3Sent: 0,
    endingSoonSent: 0,
    lastChanceSent: 0,
    errors: 0
  };

  try {
    // Get all active trials
    const activeTrials = await db.select()
      .from(subscriptionTrials)
      .where(eq(subscriptionTrials.status, 'active'));

    for (const trial of activeTrials) {
      const trialStart = new Date(trial.trialStartedAt);
      const trialEnd = new Date(trial.scheduledTrialEnd);
      
      // Calculate elapsed time in hours (more precise than days for cron drift tolerance)
      const hoursElapsed = (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60);
      const hoursUntilEnd = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Day 3 email: Send between 72-120 hours after trial start (3-5 day window)
      // Wide window ensures email fires even if cron misses a day
      if (hoursElapsed >= 72 && hoursElapsed < 120) {
        const result = await sendTrialDay3Email(trial.artistId);
        if (result.sent) {
          results.day3Sent++;
          console.log(`[SUCCESS][DAY3] Sent to ${trial.artistId} (${hoursElapsed.toFixed(1)}h elapsed)`);
        } else if (result.reason && !result.reason.includes('already sent')) {
          results.errors++;
          console.log(`[ERROR][DAY3] Failed for ${trial.artistId}: ${result.reason}`);
        }
      }

      // Ending Soon: Send between 48-72 hours before expiry (2-3 day window)
      // Overlaps with Stripe trial_will_end webhook (3 days before) - idempotency prevents duplicates
      if (hoursUntilEnd >= 48 && hoursUntilEnd <= 72) {
        const result = await sendTrialEndingSoonEmail(trial.artistId);
        if (result.sent) {
          results.endingSoonSent++;
          console.log(`[SUCCESS][ENDING_SOON] Sent to ${trial.artistId} (${hoursUntilEnd.toFixed(1)}h remaining)`);
        } else if (result.reason && !result.reason.includes('already sent')) {
          results.errors++;
          console.log(`[ERROR][ENDING_SOON] Failed for ${trial.artistId}: ${result.reason}`);
        }
      }

      // Last Chance: Send between 24-48 hours before expiry (1-2 day window)
      // No Stripe webhook for this - batch processor is only trigger
      if (hoursUntilEnd >= 24 && hoursUntilEnd <= 48) {
        const result = await sendTrialLastChanceEmail(trial.artistId);
        if (result.sent) {
          results.lastChanceSent++;
          console.log(`[SUCCESS][LAST_CHANCE] Sent to ${trial.artistId} (${hoursUntilEnd.toFixed(1)}h remaining)`);
        } else if (result.reason && !result.reason.includes('already sent')) {
          results.errors++;
          console.log(`[ERROR][LAST_CHANCE] Failed for ${trial.artistId}: ${result.reason}`);
        }
      }
    }

    console.log('[INFO][TRIAL_EMAILS] Processing complete:', results);
    return results;
  } catch (error: any) {
    console.error('[ERROR][TRIAL_EMAILS] Batch processing failed:', error);
    return { ...results, errors: results.errors + 1 };
  }
}
