import { emailLayout } from './layout';

interface TrialEndingSoonProps {
  artistName: string;
  subscriptionTier: 'pro' | 'elite';
  trialDaysLeft: number;
  domain: string;
}

export function trialEndingSoonEmail({ artistName, subscriptionTier, trialDaysLeft, domain }: TrialEndingSoonProps): string {
  const tierName = subscriptionTier === 'pro' ? 'Pro' : 'Elite';
  const monthlyPrice = subscriptionTier === 'pro' ? '$15/month' : '$35/month';
  const royaltyRate = subscriptionTier === 'pro' ? '35%' : '45%';

  const content = `
    <h2>Your ${tierName} Trial Ends in ${trialDaysLeft} Days ⏰</h2>
    <p>Hi ${artistName},</p>
    <p>Just a friendly reminder: your <strong>${tierName} trial ends in ${trialDaysLeft} days</strong>.</p>
    
    <div class="highlight">
      <p style="margin: 0; font-weight: 600;">⚡ Don't lose access to:</p>
      <ul style="margin: 10px 0;">
        <li>${royaltyRate} royalty rate (vs 30% on Free)</li>
        <li>AI Art Studio with advanced tools</li>
        <li>Unlimited artwork uploads</li>
        <li>Featured artist eligibility</li>
        <li>Priority customer support</li>
      </ul>
    </div>

    <p>Your trial will automatically convert to a paid ${tierName} subscription at <strong>${monthlyPrice}</strong> unless you cancel. That's less than the cost of a single sale!</p>

    <div style="text-align: center;">
      <a href="https://${domain}/artist/settings" class="button">Keep My ${tierName} Benefits</a>
    </div>

    <p style="text-align: center; margin-top: 20px;">
      <a href="https://${domain}/artist/settings" style="color: #999999; font-size: 14px; text-decoration: underline;">Or cancel anytime in Settings</a>
    </p>

    <p>Thanks for being part of our artist community!</p>
    <p>Best,<br><strong>The 369 Art Collective Team</strong></p>
  `;

  return emailLayout({
    preheader: `Only ${trialDaysLeft} days left in your ${tierName} trial - keep your benefits!`,
    children: content
  });
}
