import { db } from "../lib/db";
import { artworks, artists } from "@shared/schema";
import { eq } from "drizzle-orm";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

async function checkReadiness() {
  console.log("\n🔍 Shopify Store Population Readiness Check\n");
  console.log("=".repeat(60));

  // Check 1: Shopify Configuration
  console.log("\n1️⃣  SHOPIFY CONFIGURATION");
  console.log("-".repeat(60));
  
  if (!shopifyShopUrl) {
    console.log("❌ SHOPIFY_SHOP_URL is not set");
  } else {
    console.log(`✅ SHOPIFY_SHOP_URL: ${shopifyShopUrl}`);
  }
  
  if (!shopifyAccessToken) {
    console.log("❌ SHOPIFY_ACCESS_TOKEN is not set");
  } else {
    console.log(`✅ SHOPIFY_ACCESS_TOKEN: ${"*".repeat(20)}...`);
  }

  const shopifyConfigured = Boolean(shopifyShopUrl && shopifyAccessToken);
  
  if (!shopifyConfigured) {
    console.log("\n⚠️  Shopify is NOT configured");
    console.log("   The script will run in DRY-RUN mode (no API calls)\n");
  } else {
    console.log("\n✅ Shopify is fully configured\n");
  }

  // Check 2: Database Content
  console.log("\n2️⃣  DATABASE CONTENT");
  console.log("-".repeat(60));

  const allArtworks = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id));

  const approvedArtworks = allArtworks.filter(
    (item) => item.artwork.status === "approved"
  );

  const withShopifyIds = approvedArtworks.filter(
    (item) => item.artwork.shopifyProductId
  );

  console.log(`Total artworks: ${allArtworks.length}`);
  console.log(`Approved artworks: ${approvedArtworks.length}`);
  console.log(`With Shopify product IDs: ${withShopifyIds.length}`);

  if (approvedArtworks.length === 0) {
    console.log("\n❌ No approved artworks found");
    console.log("   Approve some artworks in the admin panel first\n");
  } else if (withShopifyIds.length === 0) {
    console.log("\n❌ No artworks have Shopify product IDs");
    console.log("   Artworks need to be approved to create Shopify products\n");
  } else {
    console.log(`\n✅ ${withShopifyIds.length} artworks ready for collection organization\n`);
  }

  // Check 3: What Will Be Created
  console.log("\n3️⃣  WHAT WILL BE CREATED");
  console.log("-".repeat(60));

  // Group by artists
  const artistGroups = new Map<string, typeof withShopifyIds>();
  for (const item of withShopifyIds) {
    const artistId = item.artist.id;
    if (!artistGroups.has(artistId)) {
      artistGroups.set(artistId, []);
    }
    artistGroups.get(artistId)!.push(item);
  }

  console.log(`\n📁 Artist Collections (${artistGroups.size}):`);
  for (const [artistId, items] of Array.from(artistGroups.entries())) {
    const artist = items[0].artist;
    console.log(`   • Art by ${artist.name} (${items.length} products)`);
  }

  // Group by styles
  const styleGroups = new Map<string, number>();
  for (const item of withShopifyIds) {
    const styles = item.artwork.styleTags || [];
    for (const style of styles) {
      styleGroups.set(style, (styleGroups.get(style) || 0) + 1);
    }
  }

  console.log(`\n🎭 Style Collections (${styleGroups.size}):`);
  for (const [style, count] of Array.from(styleGroups.entries())) {
    console.log(`   • ${style} (${count} products)`);
  }

  console.log(`\n⭐ Featured Collections (2):`);
  console.log(`   • New Arrivals (${Math.min(20, withShopifyIds.length)} newest products)`);
  console.log(`   • All Art Prints (${withShopifyIds.length} products)`);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  
  const totalCollections = artistGroups.size + styleGroups.size + 2;
  
  console.log(`\nTotal collections to create: ${totalCollections}`);
  console.log(`Total products to organize: ${withShopifyIds.length}`);
  
  if (!shopifyConfigured) {
    console.log("\n⚠️  STATUS: NOT READY (Shopify not configured)");
    console.log("   Configure Shopify credentials to proceed\n");
  } else if (withShopifyIds.length === 0) {
    console.log("\n⚠️  STATUS: NOT READY (No products with Shopify IDs)");
    console.log("   Approve artworks to create Shopify products first\n");
  } else {
    console.log("\n✅ STATUS: READY TO POPULATE");
    console.log(`   Run: npx tsx server/scripts/populate-shopify-collections.ts\n`);
  }

  console.log("=".repeat(60) + "\n");
}

// Run the check
checkReadiness()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Check failed:", error);
    process.exit(1);
  });
