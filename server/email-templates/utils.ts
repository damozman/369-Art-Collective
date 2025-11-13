// Email template utilities with security safeguards

// HTML-encode user input to prevent HTML injection
export function escapeHtml(text: string): string {
  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

// Safe placeholder replacement with HTML escaping for user-controlled values
export function replaceEmailPlaceholders(html: string, replacements: Record<string, string>): string {
  let result = html;
  
  // User-controlled fields that need escaping
  const userControlledFields = ['artistName'];
  
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    const safeValue = userControlledFields.includes(key) ? escapeHtml(value) : value;
    result = result.replaceAll(placeholder, safeValue);
  }
  
  return result;
}

// Template metadata for QA and testing
export interface EmailTemplateMetadata {
  name: string;
  description: string;
  variables: string[];
  sampleData: Record<string, any>;
}

export const templateMetadata: Record<string, EmailTemplateMetadata> = {
  'trial-day-3': {
    name: 'Trial Day 3 Welcome',
    description: 'Sent 3 days after trial starts to showcase benefits',
    variables: ['artistName', 'subscriptionTier', 'trialDaysLeft', 'domain'],
    sampleData: {
      artistName: 'Sarah Chen',
      subscriptionTier: 'pro',
      trialDaysLeft: 11,
      domain: 'example.replit.app'
    }
  },
  'trial-ending-soon': {
    name: 'Trial Ending Soon',
    description: 'Sent 2 days before trial expires',
    variables: ['artistName', 'subscriptionTier', 'trialDaysLeft', 'domain'],
    sampleData: {
      artistName: 'Marcus Rodriguez',
      subscriptionTier: 'elite',
      trialDaysLeft: 2,
      domain: 'example.replit.app'
    }
  },
  'trial-last-chance': {
    name: 'Trial Last Chance',
    description: 'Sent 1 day before trial expires (final urgency)',
    variables: ['artistName', 'subscriptionTier', 'domain'],
    sampleData: {
      artistName: 'Elena Volkov',
      subscriptionTier: 'pro',
      domain: 'example.replit.app'
    }
  },
  're-engagement': {
    name: 'Re-engagement (Downgrade Win-back)',
    description: 'Sent after artist downgrades from Pro/Elite to Free',
    variables: ['artistName', 'previousTier', 'domain'],
    sampleData: {
      artistName: 'Nina Patel',
      previousTier: 'elite',
      domain: 'example.replit.app'
    }
  }
};
