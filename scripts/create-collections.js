#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

const shopifyStoreUrl = process.env.SHOPIFY_SHOP_URL || process.env.SHOPIFY_STORE_URL;
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${shopifyStoreUrl}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify GraphQL error (${response.status}): ${error}`);
  }
  
  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  return result.data;
}

function delay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Collections to create
const COLLECTIONS = [
  {
    handle: 'featured',
    title: 'Featured Artwork',
    description: 'Our hand-picked collection of exceptional artwork from talented creators.',
  },
  {
    handle: 'new-arrivals',
    title: 'New Arrivals',
    description: 'Discover the latest artwork additions to our marketplace.',
  },
  {
    handle: 'metal-prints',
    title: 'Metal Prints',
    description: 'Stunning artwork printed on durable aluminum for a modern, vibrant finish.',
  },
  {
    handle: 'canvas-prints',
    title: 'Canvas Prints',
    description: 'Classic gallery-wrapped canvas prints ready to hang.',
  },
  {
    handle: 'posters',
    title: 'Posters',
    description: 'Affordable premium posters perfect for any space.',
  },
  {
    handle: 'framed-prints',
    title: 'Framed Prints',
    description: 'Museum-quality framed prints with premium matting.',
  },
];

async function createCollection(collectionConfig) {
  try {
    log(`Creating collection: ${collectionConfig.title}...`, colors.blue);
    
    const mutation = `
      mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            handle
            title
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      input: {
        title: collectionConfig.title,
        handle: collectionConfig.handle,
        descriptionHtml: `<p>${collectionConfig.description}</p>`,
      },
    };
    
    const data = await shopifyGraphQL(mutation, variables);
    
    if (data.collectionCreate.userErrors && data.collectionCreate.userErrors.length > 0) {
      const errors = data.collectionCreate.userErrors.map(e => `${e.field}: ${e.message}`).join(', ');
      
      if (errors.includes('already') || errors.includes('taken')) {
        log(`⚠ Collection "${collectionConfig.title}" already exists, skipping`, colors.yellow);
        return null;
      }
      
      throw new Error(errors);
    }
    
    const collection = data.collectionCreate.collection;
    log(`✓ Created: ${collection.title} (${collection.handle})`, colors.green);
    
    return collection;
    
  } catch (error) {
    log(`❌ Failed to create collection "${collectionConfig.title}": ${error.message}`, colors.red);
    throw error;
  }
}

async function main() {
  log('\n============================================================', colors.blue);
  log('  Creating Shopify Collections', colors.blue);
  log('============================================================\n', colors.blue);
  
  log(`Store: ${shopifyStoreUrl}\n`, colors.reset);
  
  let successCount = 0;
  
  for (const collectionConfig of COLLECTIONS) {
    try {
      await createCollection(collectionConfig);
      successCount++;
      await delay();
    } catch (error) {
      // Continue with next collection
    }
  }
  
  log('\n============================================================', colors.blue);
  log('  ✅ Collections Setup Complete!', colors.green);
  log('============================================================\n', colors.blue);
  
  log(`Created: ${successCount}/${COLLECTIONS.length} collections\n`, colors.green);
}

main().catch(error => {
  log(`\n❌ Setup Failed: ${error.message}`, colors.red);
  process.exit(1);
});
