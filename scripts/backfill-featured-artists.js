#!/usr/bin/env node

/**
 * Backfill Featured Artist Status
 * 
 * Sets featured eligibility and priority for all existing artists
 * based on their current subscription tier.
 * 
 * Business Rules:
 * - Elite: priority=100, eligible=true
 * - Pro: priority=50, eligible=true
 * - Free: priority=0, eligible=false (manual approval only)
 */

import { db } from '../server/lib/db.js';
import { artists } from '../shared/schema.js';
import { updateFeaturedStatusForTier } from '../server/lib/featured-artists-service.js';

async function main() {
  console.log('🔄 Backfilling featured artist status...\n');
  
  try {
    // Get all artists
    const allArtists = await db.select().from(artists).execute();
    
    console.log(`Found ${allArtists.length} artists to process\n`);
    
    let updated = 0;
    for (const artist of allArtists) {
      const tier = artist.subscriptionTier;
      console.log(`Processing: ${artist.name} (${tier} tier)`);
      
      await updateFeaturedStatusForTier(artist.id, tier);
      updated++;
    }
    
    console.log(`\n✅ Successfully updated ${updated} artists!`);
    console.log('\nFeatured status by tier:');
    console.log('  • Elite: priority=100, eligible=true');
    console.log('  • Pro: priority=50, eligible=true');
    console.log('  • Free: priority=0, eligible=false');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
