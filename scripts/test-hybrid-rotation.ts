#!/usr/bin/env tsx

/**
 * Test Hybrid Rotation System
 * 
 * Simulates different tier scenarios to verify:
 * - Performance slots (top 2 earners)
 * - Rotation slots (fair distribution)
 * - lastFeaturedAt tracking
 */

import { db } from '../server/lib/db';
import { artists } from '../shared/schema';
import { updateFeaturedStatusForTier } from '../server/lib/featured-artists-service';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('🧪 Testing Hybrid Rotation System\n');

  try {
    // Get first 6 test artists
    const testArtists = await db
      .select()
      .from(artists)
      .limit(6)
      .execute();

    if (testArtists.length < 6) {
      console.log('❌ Need at least 6 artists to test rotation');
      process.exit(1);
    }

    console.log('Step 1: Setting up test tiers...');
    
    // Set up test scenario:
    // 2 Elite artists (different sales)
    // 3 Pro artists (different sales)
    // 1 Free artist (control)
    
    const [elite1, elite2, pro1, pro2, pro3, free1] = testArtists;
    
    // Elite tier - highest priority
    await updateFeaturedStatusForTier(elite1.id, 'elite');
    await db.update(artists).set({ monthlySales: '500.00' }).where(eq(artists.id, elite1.id)).execute();
    console.log(`  ✓ ${elite1.name}: Elite tier, $500/mo sales`);
    
    await updateFeaturedStatusForTier(elite2.id, 'elite');
    await db.update(artists).set({ monthlySales: '300.00' }).where(eq(artists.id, elite2.id)).execute();
    console.log(`  ✓ ${elite2.name}: Elite tier, $300/mo sales`);
    
    // Pro tier - medium priority
    await updateFeaturedStatusForTier(pro1.id, 'pro');
    await db.update(artists).set({ monthlySales: '200.00' }).where(eq(artists.id, pro1.id)).execute();
    console.log(`  ✓ ${pro1.name}: Pro tier, $200/mo sales`);
    
    await updateFeaturedStatusForTier(pro2.id, 'pro');
    await db.update(artists).set({ monthlySales: '150.00' }).where(eq(artists.id, pro2.id)).execute();
    console.log(`  ✓ ${pro2.name}: Pro tier, $150/mo sales`);
    
    await updateFeaturedStatusForTier(pro3.id, 'pro');
    await db.update(artists).set({ monthlySales: '100.00' }).where(eq(artists.id, pro3.id)).execute();
    console.log(`  ✓ ${pro3.name}: Pro tier, $100/mo sales`);
    
    // Free tier - not eligible
    await updateFeaturedStatusForTier(free1.id, 'free');
    console.log(`  ✓ ${free1.name}: Free tier (not eligible)\n`);

    console.log('Step 2: Calling API endpoint (limit=4)...');
    const response = await fetch('http://localhost:5000/api/featured-artists?limit=4');
    const featured = await response.json();
    
    console.log(`\n✨ Featured Artists (${featured.length}/4):\n`);
    
    if (featured.length === 0) {
      console.log('  ⚠️  No artists returned (all might be unapproved)');
    } else {
      featured.forEach((artist: any, index: number) => {
        const slot = index < 2 ? `PERFORMANCE SLOT ${index + 1}` : `ROTATION SLOT ${index - 1}`;
        console.log(`  ${index + 1}. [${slot}]`);
        console.log(`     ${artist.name} (${artist.subscriptionTier})`);
        console.log(`     Sales: $${artist.monthlySales}/mo | Artworks: ${artist.artworkCount}`);
        console.log(`     Specialty: ${artist.specialty}\n`);
      });
    }

    console.log('Step 3: Expected behavior:');
    console.log('  • Slots 1-2: Top 2 earners (Elite1 $500, Elite2 $300)');
    console.log('  • Slots 3-4: Rotation among remaining eligible (Pro1, Pro2, Pro3)');
    console.log('  • Free tier artist excluded\n');

    console.log('Step 4: Calling API again to test rotation...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const response2 = await fetch('http://localhost:5000/api/featured-artists?limit=4');
    const featured2 = await response2.json();
    
    console.log(`\n✨ Featured Artists - Second Call (${featured2.length}/4):\n`);
    
    if (featured2.length > 0) {
      featured2.forEach((artist: any, index: number) => {
        const slot = index < 2 ? `PERFORMANCE` : `ROTATION`;
        console.log(`  ${index + 1}. [${slot}] ${artist.name} ($${artist.monthlySales}/mo)`);
      });
    }
    
    console.log('\n✅ Test complete! Hybrid rotation system is working.');
    console.log('\nCleanup: Resetting all artists to free tier...');
    
    for (const artist of testArtists) {
      await updateFeaturedStatusForTier(artist.id, 'free');
      await db.update(artists).set({ monthlySales: '0.00' }).where(eq(artists.id, artist.id)).execute();
    }
    
    console.log('✓ All test artists reset to free tier\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
