#!/usr/bin/env node

/**
 * 247 Print Network - Homepage Product Population
 * 
 * Automatically updates the Shopify storefront homepage with real products
 * from your store instead of placeholder images.
 * 
 * What it does:
 * - Fetches 8 featured products from your Shopify store
 * - Gets collection cover images from each finish type (Metal, Canvas, Paper, Framed)
 * - Updates homepage configuration with real product URLs and images
 * - Deploys to the live Shopify theme
 * 
 * Usage:
 *   node scripts/populate-homepage-products.js
 *   
 * Environment variables required:
 *   SHOPIFY_STORE_URL - Your Shopify store URL
 *   SHOPIFY_ACCESS_TOKEN - Your Shopify Admin API token
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const shopifyStoreUrl = process.env.SHOPIFY_STORE_URL;
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const LIVE_THEME_ID = '179686146345'; // 247pn-art-starter-theme

// Validate environment
if (!shopifyStoreUrl || !accessToken) {
  console.error('\n❌ Missing required environment variables:');
  console.error('  • SHOPIFY_STORE_URL');
  console.error('  • SHOPIFY_ACCESS_TOKEN\n');
  process.exit(1);
}

async function shopifyRequest(endpoint) {
  const response = await fetch(
    `https://${shopifyStoreUrl}/admin/api/2025-01/${endpoint}`,
    { headers: { 'X-Shopify-Access-Token': accessToken } }
  );
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

async function uploadToTheme(themeId, filePath, content) {
  const response = await fetch(
    `https://${shopifyStoreUrl}/admin/api/2025-01/themes/${themeId}/assets.json`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        asset: {
          key: filePath,
          value: content,
        },
      }),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to upload ${filePath}: ${response.status}`);
  }
  
  return await response.json();
}

async function main() {
  console.log('🎨 Populating homepage with real products...\n');
  
  try {
    // 1. Fetch featured artworks
    console.log('Step 1: Fetching 8 featured artworks...');
    const productsData = await shopifyRequest('products.json?limit=8&status=active&fields=id,title,handle,images');
    const products = productsData.products.filter(p => p.images && p.images.length > 0);
    
    if (products.length === 0) {
      throw new Error('No products with images found in store');
    }
    
    console.log(`✓ Found ${products.length} products with images\n`);
    
    // 2. Get collection cover images
    console.log('Step 2: Getting collection cover images...');
    const finishTypes = ['Metal', 'Canvas', 'Paper', 'Framed'];
    const collectionCovers = {};
    
    for (const finish of finishTypes) {
      const data = await shopifyRequest(`products.json?limit=1&tag=Finish:${finish}&fields=id,title,handle,images`);
      if (data.products && data.products[0] && data.products[0].images[0]) {
        collectionCovers[finish] = data.products[0].images[0].src;
        console.log(`✓ ${finish}: ${data.products[0].title}`);
      }
    }
    
    console.log('\nStep 3: Updating homepage configuration...');
    
    // 3. Read current index.json
    const indexPath = path.join(__dirname, '../attached_assets/theme/templates/index.json');
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // 4. Update featured collections
    if (collectionCovers.Paper) {
      indexData.sections.featured_collections.blocks.collection_1.settings.collection_image = collectionCovers.Paper;
    }
    if (collectionCovers.Canvas) {
      indexData.sections.featured_collections.blocks.collection_2.settings.collection_image = collectionCovers.Canvas;
    }
    if (collectionCovers.Framed) {
      indexData.sections.featured_collections.blocks.collection_3.settings.collection_image = collectionCovers.Framed;
    }
    if (collectionCovers.Metal) {
      indexData.sections.featured_collections.blocks.collection_4.settings.collection_image = collectionCovers.Metal;
    }
    
    console.log('✓ Updated collection cover images');
    
    // 5. Update featured artworks
    const artworkBlocks = ['artwork_1', 'artwork_2', 'artwork_3', 'artwork_4', 'artwork_5', 'artwork_6', 'artwork_7', 'artwork_8'];
    
    products.slice(0, 8).forEach((product, index) => {
      const blockKey = artworkBlocks[index];
      if (indexData.sections.featured_artworks.blocks[blockKey]) {
        indexData.sections.featured_artworks.blocks[blockKey].settings.artwork_title = product.title;
        indexData.sections.featured_artworks.blocks[blockKey].settings.artwork_image = product.images[0].src;
        indexData.sections.featured_artworks.blocks[blockKey].settings.artwork_url = `https://247printnetwork.com/products/${product.handle}`;
      }
    });
    
    console.log('✓ Updated featured artworks with real products');
    
    // 6. Save locally
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    console.log('✓ Saved to local file\n');
    
    // 7. Deploy to live theme
    console.log('Step 4: Deploying to live Shopify theme...');
    const uploadResult = await uploadToTheme(
      LIVE_THEME_ID,
      'templates/index.json',
      JSON.stringify(indexData)
    );
    
    console.log(`✓ Deployed to theme: ${uploadResult.asset.theme_id}`);
    console.log(`✓ Updated at: ${uploadResult.asset.updated_at}\n`);
    
    // 8. Summary
    console.log('📊 Summary:');
    console.log(`  • ${products.length} featured products`);
    console.log(`  • ${Object.keys(collectionCovers).length} collection covers`);
    console.log(`  • Deployed to live theme: ${LIVE_THEME_ID}`);
    console.log('\n✅ Homepage successfully populated with real products!');
    console.log('   Visit: https://247printnetwork.com\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
