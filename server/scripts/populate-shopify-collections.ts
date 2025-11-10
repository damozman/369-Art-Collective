import { db } from "../lib/db";
import { artworks, artists } from "@shared/schema";
import { eq } from "drizzle-orm";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

interface ShopifyCollection {
  title: string;
  body_html?: string;
  sort_order?: string;
  published?: boolean;
}

interface CollectionData {
  id: string;
  title: string;
  handle: string;
}

// Create a collection in Shopify
async function createCollection(collection: ShopifyCollection): Promise<CollectionData | null> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("⚠️  Shopify not configured - skipping collection creation");
    return null;
  }

  try {
    const apiVersion = "2024-10";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({
        custom_collection: {
          ...collection,
          published: true,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to create collection "${collection.title}":`, error);
      return null;
    }

    const result = await response.json();
    const collectionData = result.custom_collection;
    
    console.log(`✅ Created collection: ${collection.title} (ID: ${collectionData.id})`);
    
    return {
      id: collectionData.id,
      title: collectionData.title,
      handle: collectionData.handle,
    };
  } catch (error: any) {
    console.error(`Error creating collection "${collection.title}":`, error.message);
    return null;
  }
}

// Add product to collection
async function addProductToCollection(collectionId: string, productId: string): Promise<boolean> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return false;
  }

  try {
    const apiVersion = "2024-10";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collects.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({
        collect: {
          product_id: productId,
          collection_id: collectionId,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to add product ${productId} to collection ${collectionId}:`, error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error(`Error adding product to collection:`, error.message);
    return false;
  }
}

// Get all collections (to avoid duplicates)
async function getExistingCollections(): Promise<Map<string, string>> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return new Map();
  }

  try {
    const apiVersion = "2024-10";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch existing collections");
      return new Map();
    }

    const result = await response.json();
    const collections = new Map<string, string>();
    
    for (const collection of result.custom_collections || []) {
      collections.set(collection.title, collection.id);
    }
    
    return collections;
  } catch (error: any) {
    console.error("Error fetching collections:", error.message);
    return new Map();
  }
}

async function populateShopifyCollections() {
  console.log("\n🎨 Starting Shopify Collection Population Script\n");
  console.log("=" .repeat(60));

  // Check Shopify configuration
  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("\n⚠️  Shopify is not configured!");
    console.log("Set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN environment variables.");
    console.log("\nThis script will show you what WOULD be created:\n");
  }

  // Get all approved artworks with Shopify product IDs
  const approvedArtworks = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id))
    .where(eq(artworks.status, "approved"));

  console.log(`\n📊 Found ${approvedArtworks.length} approved artworks\n`);

  // Filter artworks that have Shopify product IDs
  const artworksWithProducts = approvedArtworks.filter(
    (item) => item.artwork.shopifyProductId
  );

  console.log(`   ${artworksWithProducts.length} have Shopify product IDs`);
  console.log(`   ${approvedArtworks.length - artworksWithProducts.length} need products created\n`);

  if (artworksWithProducts.length === 0) {
    console.log("⚠️  No artworks with Shopify product IDs found.");
    console.log("Run the artwork approval process to create products first.\n");
    return;
  }

  // Get existing collections to avoid duplicates
  const existingCollections = await getExistingCollections();
  console.log(`\n📁 Found ${existingCollections.size} existing collections in Shopify\n`);

  // Track created collections
  const createdCollections = new Map<string, string>();

  // === 1. CREATE ARTIST COLLECTIONS ===
  console.log("\n" + "=".repeat(60));
  console.log("🎨 CREATING ARTIST COLLECTIONS");
  console.log("=".repeat(60) + "\n");

  const artistGroups = new Map<string, typeof artworksWithProducts>();
  for (const item of artworksWithProducts) {
    const artistId = item.artist.id;
    if (!artistGroups.has(artistId)) {
      artistGroups.set(artistId, []);
    }
    artistGroups.get(artistId)!.push(item);
  }

  for (const [artistId, items] of Array.from(artistGroups.entries())) {
    const artist = items[0].artist;
    const collectionTitle = `Art by ${artist.name}`;
    
    // Skip if already exists
    if (existingCollections.has(collectionTitle)) {
      const existingId = existingCollections.get(collectionTitle)!;
      createdCollections.set(collectionTitle, existingId);
      console.log(`ℹ️  Collection already exists: ${collectionTitle}`);
      continue;
    }

    const collection = await createCollection({
      title: collectionTitle,
      body_html: `<p>${artist.bio || `Browse artwork by ${artist.name}`}</p>`,
      sort_order: "created-desc",
    });

    if (collection) {
      createdCollections.set(collectionTitle, collection.id);
      
      // Add all artist's products to this collection
      let added = 0;
      for (const item of items) {
        const success = await addProductToCollection(
          collection.id,
          item.artwork.shopifyProductId!
        );
        if (success) added++;
        
        // Rate limiting: 2 requests per second
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      console.log(`   Added ${added}/${items.length} products to collection\n`);
    }
  }

  // === 2. CREATE STYLE COLLECTIONS ===
  console.log("\n" + "=".repeat(60));
  console.log("🎭 CREATING STYLE COLLECTIONS");
  console.log("=".repeat(60) + "\n");

  // Extract all unique style tags
  const styleGroups = new Map<string, typeof artworksWithProducts>();
  
  for (const item of artworksWithProducts) {
    const styles = item.artwork.styleTags || [];
    for (const style of styles) {
      if (!styleGroups.has(style)) {
        styleGroups.set(style, []);
      }
      styleGroups.get(style)!.push(item);
    }
  }

  for (const [style, items] of Array.from(styleGroups.entries())) {
    const collectionTitle = style;
    
    // Skip if already exists
    if (existingCollections.has(collectionTitle)) {
      const existingId = existingCollections.get(collectionTitle)!;
      createdCollections.set(collectionTitle, existingId);
      console.log(`ℹ️  Collection already exists: ${collectionTitle}`);
      continue;
    }

    const collection = await createCollection({
      title: collectionTitle,
      body_html: `<p>Explore our collection of ${style.toLowerCase()} artwork.</p>`,
      sort_order: "best-selling",
    });

    if (collection) {
      createdCollections.set(collectionTitle, collection.id);
      
      // Add products to style collection
      let added = 0;
      for (const item of items) {
        const success = await addProductToCollection(
          collection.id,
          item.artwork.shopifyProductId!
        );
        if (success) added++;
        
        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      console.log(`   Added ${added}/${items.length} products to collection\n`);
    }
  }

  // === 3. CREATE FEATURED COLLECTIONS ===
  console.log("\n" + "=".repeat(60));
  console.log("⭐ CREATING FEATURED COLLECTIONS");
  console.log("=".repeat(60) + "\n");

  // New Arrivals (most recent 20 artworks)
  const newArrivals = artworksWithProducts
    .sort((a, b) => 
      new Date(b.artwork.createdAt || 0).getTime() - 
      new Date(a.artwork.createdAt || 0).getTime()
    )
    .slice(0, 20);

  const newArrivalsTitle = "New Arrivals";
  if (!existingCollections.has(newArrivalsTitle)) {
    const collection = await createCollection({
      title: newArrivalsTitle,
      body_html: "<p>Discover our latest artwork additions from talented artists around the world.</p>",
      sort_order: "created-desc",
    });

    if (collection) {
      createdCollections.set(newArrivalsTitle, collection.id);
      
      let added = 0;
      for (const item of newArrivals) {
        const success = await addProductToCollection(
          collection.id,
          item.artwork.shopifyProductId!
        );
        if (success) added++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      console.log(`   Added ${added}/${newArrivals.length} products to collection\n`);
    }
  } else {
    console.log(`ℹ️  Collection already exists: ${newArrivalsTitle}\n`);
  }

  // All Art Prints
  const allPrintsTitle = "All Art Prints";
  if (!existingCollections.has(allPrintsTitle)) {
    const collection = await createCollection({
      title: allPrintsTitle,
      body_html: "<p>Browse our complete collection of museum-quality art prints from independent artists.</p>",
      sort_order: "best-selling",
    });

    if (collection) {
      createdCollections.set(allPrintsTitle, collection.id);
      
      let added = 0;
      for (const item of artworksWithProducts) {
        const success = await addProductToCollection(
          collection.id,
          item.artwork.shopifyProductId!
        );
        if (success) added++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      
      console.log(`   Added ${added}/${artworksWithProducts.length} products to collection\n`);
    }
  } else {
    console.log(`ℹ️  Collection already exists: ${allPrintsTitle}\n`);
  }

  // === SUMMARY ===
  console.log("\n" + "=".repeat(60));
  console.log("✅ COLLECTION POPULATION COMPLETE");
  console.log("=".repeat(60) + "\n");
  
  console.log("📊 Summary:");
  console.log(`   Artist Collections: ${artistGroups.size}`);
  console.log(`   Style Collections: ${styleGroups.size}`);
  console.log(`   Featured Collections: 2`);
  console.log(`   Total Collections Created: ${createdCollections.size}`);
  console.log(`   Products Organized: ${artworksWithProducts.length}`);
  
  console.log("\n🎨 Your Shopify store is now fully organized!\n");
  
  if (shopifyShopUrl) {
    console.log(`Visit your store: https://${shopifyShopUrl}\n`);
  }
}

// Run the script
populateShopifyCollections()
  .then(() => {
    console.log("Script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
