import { emailLayout } from './layout';

interface TrialDay3Props {
  artistName: string;
  subscriptionTier: 'pro' | 'elite';
  trialDaysLeft: number;
  domain: string;
}

export function trialDay3Email({ artistName, subscriptionTier, trialDaysLeft, domain }: TrialDay3Props): string {
  const tierName = subscriptionTier === 'pro' ? 'Pro' : 'Elite';
  const royaltyRate = subscriptionTier === 'pro' ? '35%' : '45%';
  const features = subscriptionTier === 'pro' 
    ? ['35% royalty rate', '25 AI upscales/month', 'AI Art Studio access', 'Unlimited artwork uploads', 'Priority support']
    : ['45% royalty rate', 'Unlimited AI upscales', 'AI Art Studio access', 'Unlimited artwork uploads', 'VIP support', 'Featured artist priority'];

  const content = `
    <h2>Welcome to Your ${tierName} Trial! 🎨</h2>
    <p>Hi ${artistName},</p>
    <p>You're 3 days into your <strong>${tierName} trial</strong>, and we wanted to check in! With <strong>${trialDaysLeft} days remaining</strong>, now's the perfect time to explore everything ${tierName} has to offer.</p>
    
    <div class="benefits">
      <h3>Your ${tierName} Benefits:</h3>
      <ul>
        ${features.map(feature => `<li>${feature}</li>`).join('\n        ')}
      </ul>
    </div>

    <p>Here are some ways to maximize your trial:</p>
    <ul>
      <li><strong>Upload your best work</strong> - No upload limits on ${tierName}</li>
      <li><strong>Try AI Art Studio</strong> - Generate variations and enhance your designs</li>
      <li><strong>Boost your earnings</strong> - ${royaltyRate} royalty rate means more money per sale</li>
      <li><strong>Build your brand</strong> - Get featured on our homepage for maximum exposure</li>
    </ul>

    <div style="text-align: center;">
      <a href="https://${domain}/artist/dashboard" class="button">Explore Your Dashboard</a>
    </div>

    <p>Questions? Our support team is here to help. Just reply to this email!</p>
    <p>Happy creating,<br><strong>The 369 Art Collective Team</strong></p>
  `;

  return emailLayout({
    preheader: `You have ${trialDaysLeft} days left in your ${tierName} trial - make the most of it!`,
    children: content
  });
}
