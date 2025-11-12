import { db } from './server/lib/db';
import { artists } from './shared/schema';
import bcrypt from 'bcrypt';

async function createTestArtist() {
  const email = 'trial-test@247print.test';
  const password = 'TestPass123!';
  
  try {
    // Check if already exists
    const existing = await db.query.artists.findFirst({
      where: (artists, { eq }) => eq(artists.email, email)
    });
    
    if (existing) {
      console.log('[INFO] Test artist already exists:', email);
      console.log('[INFO] Password:', password);
      console.log('[INFO] Artist ID:', existing.id);
      console.log('[INFO] Current tier:', existing.subscriptionTier);
      return;
    }
    
    // Create new test artist
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [newArtist] = await db.insert(artists).values({
      email,
      password: hashedPassword,
      name: 'Trial Test Artist',
      bio: 'Test account for trial system validation',
      instagramHandle: '@trialtester',
      portfolioApproved: true,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      artworkLimit: 20,
      isFeaturedEligible: false,
      featuredPriority: 0
    }).returning();
    
    console.log('[SUCCESS] Created test artist:');
    console.log('  Email:', email);
    console.log('  Password:', password);
    console.log('  Artist ID:', newArtist.id);
    console.log('  Status: Portfolio approved, Free tier');
  } catch (error) {
    console.error('[ERROR] Failed to create test artist:', error);
    throw error;
  }
}

createTestArtist().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
