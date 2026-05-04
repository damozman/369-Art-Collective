#!/usr/bin/env node

/**
 * 369 Art Collective - Auto-Assign Art Template to Products
 * 
 * This script automatically assigns the "art" product template to all
 * art products in your Shopify store using the Shopify Admin API.
 * 
 * Prerequisites:
 *   - SHOPIFY_ADMIN_API_TOKEN environment variable set
 *   - SHOPIFY_STORE_URL environment variable set (e.g., "your-store.myshopify.com")
 * 
 * Usage:
 *   node scripts/assign-art-template.js
 *   
 * Or via npm:
 *   npm run shopify:assign-templates
 */

import https from 'node:https';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(60)}`, colors.blue);
  log(`  ${title}`, colors.bright);
  log(`${'='.repeat(60)}`, colors.blue);
  console.log('');
}

// Check environment variables
function checkEnvVars() {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  
  if (!accessToken || !storeUrl) {
    log('❌ Missing required environment variables:', colors.red);
    if (!accessToken) log('  • SHOPIFY_ACCESS_TOKEN', colors.yellow);
    if (!storeUrl) log('  • SHOPIFY_STORE_URL', colors.yellow);
    log('\nPlease set these in your .env file or environment.', colors.reset);
    log('\nExample:', colors.bright);
    log('SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx', colors.reset);
    log('SHOPIFY_STORE_URL=your-store.myshopify.com', colors.reset);
    process.exit(1);
  }
  
  log('✓ Environment variables verified', colors.green);
}

// Make Shopify API request
function shopifyRequest(method, path, data = null) {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: process.env.SHOPIFY_STORE_URL,
      path: `/admin/api/2025-01${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(parsed)}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Main assignment process
async function assignTemplates() {
  logSection('Auto-Assign Art Template to Products');

  // Step 1: Check environment
  log('Step 1: Checking configuration...', colors.bright);
  checkEnvVars();

  // Step 2: Fetch all products
  logSection('Step 2: Fetching Products');
  log('Retrieving all products from Shopify...', colors.blue);
  
  try {
    const response = await shopifyRequest('GET', '/products.json?limit=250');
    const products = response.products || [];
    
    log(`✓ Found ${products.length} total products`, colors.green);
    
    // Filter for art products (you can customize this filter)
    // For now, we'll look for products with specific tags or vendors
    const artProducts = products.filter(p => 
      p.vendor === '369 Art Collective' ||
      (p.tags && p.tags.includes('artwork')) ||
      (p.tags && p.tags.includes('art-print'))
    );
    
    log(`✓ Identified ${artProducts.length} art products`, colors.green);
    
    if (artProducts.length === 0) {
      log('\n⚠ No art products found to update', colors.yellow);
      log('Make sure your products have:', colors.reset);
      log('  • Vendor set to "369 Art Collective", OR', colors.reset);
      log('  • Tags including "artwork" or "art-print"', colors.reset);
      return;
    }

    // Step 3: Assign template to each product
    logSection('Step 3: Assigning Templates');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const product of artProducts) {
      log(`\nUpdating: ${product.title}`, colors.blue);
      
      try {
        await shopifyRequest('PUT', `/products/${product.id}.json`, {
          product: {
            id: product.id,
            template_suffix: 'art',
          },
        });
        
        log(`  ✓ Template assigned`, colors.green);
        successCount++;
      } catch (error) {
        log(`  ❌ Failed: ${error.message}`, colors.red);
        errorCount++;
      }
      
      // Rate limiting: Wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Summary
    logSection('✅ Template Assignment Complete');
    log(`Successfully updated: ${successCount} products`, colors.green);
    if (errorCount > 0) {
      log(`Failed to update: ${errorCount} products`, colors.red);
    }
    
    log('\n✓ All art products now use the "art" template!', colors.bright);
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    log('\nCommon issues:', colors.bright);
    log('• Invalid API token: Check SHOPIFY_ADMIN_API_TOKEN', colors.reset);
    log('• Wrong store URL: Verify SHOPIFY_STORE_URL', colors.reset);
    log('• Missing permissions: Ensure token has product write access', colors.reset);
    process.exit(1);
  }
}

// Run assignment
assignTemplates().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, colors.red);
  process.exit(1);
});
