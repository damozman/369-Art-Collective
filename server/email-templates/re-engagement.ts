import { emailLayout } from './layout';

interface ReEngagementProps {
  artistName: string;
  previousTier: 'pro' | 'elite';
  domain: string;
}

export function reEngagementEmail({ artistName, previousTier, domain }: ReEngagementProps): string {
  const tierName = previousTier === 'pro' ? 'Pro' : 'Elite';
  const monthlyPrice = previousTier === 'pro' ? '$15' : '$35';

  const content = `
    <h2>We Miss You, ${artistName}! 💙</h2>
    <p>Hi ${artistName},</p>
    <p>We noticed you recently downgraded from <strong>${tierName}</strong>. We hope everything's okay!</p>
    
    <p>We wanted to reach out because ${tierName} artists typically earn <strong>2-3x more</strong> than Free tier artists. Here's what you're missing:</p>

    <div class="benefits">
      <h3>What ${tierName} Artists Get:</h3>
      <ul>
        <li><strong>Higher royalties</strong> - Earn more on every single sale</li>
        <li><strong>AI Art Studio</strong> - Create variations & enhancements instantly</li>
        <li><strong>Featured placement</strong> - Get discovered by more buyers</li>
        <li><strong>Unlimited uploads</strong> - No monthly caps holding you back</li>
        <li><strong>Priority support</strong> - We're here when you need us</li>
      </ul>
    </div>

    <div class="highlight">
      <p style="margin: 0; font-weight: 600;">🎁 Special Offer for Returning Artists:</p>
      <p style="margin: 10px 0 0;">Rejoin ${tierName} today and we'll credit your account with <strong>10 free AI upscales</strong> ($10 value).</p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="https://${domain}/artist/settings" class="button">Upgrade Back to ${tierName}</a>
    </div>

    <p>If you downgraded due to a specific issue, please let us know! Reply to this email and we'll do everything we can to help.</p>

    <p>Your success is our success. We'd love to have you back!</p>
    <p>Best regards,<br><strong>The 369 Art Collective Team</strong></p>
  `;

  return emailLayout({
    preheader: `Come back to ${tierName} and get 10 free AI upscales!`,
    children: content
  });
}
