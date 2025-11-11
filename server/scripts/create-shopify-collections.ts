/**
 * Create Shopify Collections for Homepage
 * Creates style-based collections for browsing artwork
 */

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

interface ShopifyCollection {
  title: string;
  body_html?: string;
  sort_order?: string;
  published?: boolean;
}

const collections: ShopifyCollection[] = [
  {
    title: "Abstract Art",
    body_html: "<p>Bold shapes, vibrant colors, and contemporary abstract designs that make a statement.</p>",
    sort_order: "best-selling",
    published: true,
  },
  {
    title: "Nature & Landscapes",
    body_html: "<p>Breathtaking natural scenes, serene landscapes, and outdoor beauty captured by talented artists.</p>",
    sort_order: "best-selling",
    published: true,
  },
  {
    title: "Urban & Street",
    body_html: "<p>City life, street art, modern architecture, and the energy of urban environments.</p>",
    sort_order: "best-selling",
    published: true,
  },
  {
    title: "Pop Culture",
    body_html: "<p>Contemporary icons, trends, cultural moments, and modern artistic expressions.</p>",
    sort_order: "best-selling",
    published: true,
  },
];

async function createCollection(collection: ShopifyCollection): Promise<any> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    throw new Error("Shopify not configured");
  }

  const apiVersion = "2024-10";
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      custom_collection: collection,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create collection: ${error}`);
  }

  const result = await response.json();
  return result.custom_collection;
}

async function main() {
  console.log("\n🎨 Creating Shopify Collections...\n");

  const created = [];
  
  for (const collection of collections) {
    try {
      console.log(`Creating: ${collection.title}...`);
      const result = await createCollection(collection);
      created.push({
        title: result.title,
        handle: result.handle,
        id: result.id,
        url: `/collections/${result.handle}`,
      });
      console.log(`✅ Created: ${result.title} (Handle: ${result.handle})`);
    } catch (error: any) {
      console.error(`❌ Failed: ${collection.title} - ${error.message}`);
    }
  }

  console.log("\n📋 Collections Summary:\n");
  created.forEach(c => {
    console.log(`  ${c.title}`);
    console.log(`    URL: ${c.url}`);
    console.log(`    ID: ${c.id}\n`);
  });

  console.log("✅ Done! Update your homepage template with these collection URLs.");
}

main().catch(console.error);
