import { emailLayout } from './layout';

interface TrialLastChanceProps {
  artistName: string;
  subscriptionTier: 'pro' | 'elite';
  domain: string;
}

export function trialLastChanceEmail({ artistName, subscriptionTier, domain }: TrialLastChanceProps): string {
  const tierName = subscriptionTier === 'pro' ? 'Pro' : 'Elite';
  const monthlyPrice = subscriptionTier === 'pro' ? '$15' : '$35';
  const annualSavings = subscriptionTier === 'pro' ? '$30' : '$70';

  const content = `
    <h2>⏰ Last Chance: Your ${tierName} Trial Ends Tomorrow</h2>
    <p>Hi ${artistName},</p>
    <p><strong>This is it</strong> - your ${tierName} trial expires in 24 hours.</p>
    
    <div class="highlight">
      <p style="margin: 0 0 10px; font-size: 18px; font-weight: 600;">Tomorrow you'll lose:</p>
      <ul style="margin: 10px 0; font-size: 16px;">
        <li>Higher royalty rates (back to 30%)</li>
        <li>AI Art Studio access</li>
        <li>Unlimited uploads (down to 20/month)</li>
        <li>Featured artist placement</li>
      </ul>
      <p style="margin: 10px 0 0; font-size: 16px; font-weight: 600;">All for just ${monthlyPrice}/month.</p>
    </div>

    <p><strong>Think about it:</strong> A single sale more than pays for your subscription. Most ${tierName} artists earn ${monthlyPrice}+ in their first month.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://${domain}/artist/settings" class="button" style="font-size: 18px; padding: 18px 36px;">Continue ${tierName} for ${monthlyPrice}/mo</a>
      <p style="color: #666666; font-size: 14px; margin-top: 12px;">Cancel anytime. No long-term commitment.</p>
    </div>

    <div class="benefits">
      <p style="margin: 0 0 10px; font-weight: 600;">💡 Pro Tip:</p>
      <p style="margin: 0;">Save ${annualSavings}/year with our annual plan. Switch anytime in Settings.</p>
    </div>

    <p>Questions? Reply to this email - we're here to help!</p>
    <p>Don't let this opportunity slip away,<br><strong>The 247 Print Network Team</strong></p>
  `;

  return emailLayout({
    preheader: `Your ${tierName} trial ends tomorrow! Keep your benefits for just ${monthlyPrice}/month`,
    children: content
  });
}
