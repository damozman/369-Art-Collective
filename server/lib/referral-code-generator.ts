import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export function generateReferralCode(artistName: string): string {
  const prefix = artistName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3) || 'ART';
  
  const code = nanoid();
  
  return `${prefix}-${code}`;
}
