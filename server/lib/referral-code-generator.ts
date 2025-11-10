import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export function generateReferralCode(prefixOrName: string): string {
  // If the input ends with '-', treat it as a fixed prefix (e.g., 'INF-')
  // Otherwise, generate a prefix from the name (for artists)
  const prefix = prefixOrName.endsWith('-')
    ? prefixOrName.slice(0, -1) // Remove trailing dash
    : (prefixOrName
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 3) || 'ART');
  
  const code = nanoid();
  
  return `${prefix}-${code}`;
}
