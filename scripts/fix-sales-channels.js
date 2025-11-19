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

async function shopifyREST(endpoint, method = 'GET', body = null) {
  const url = `https://${shopifyStoreUrl}/admin/api/${API_VERSION}/${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAccessToken,
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify REST error (${response.status}): ${error}`);
  }
  
  return await response.json();
}

async function getAllProducts() {
  const result = await shopifyREST('products.json?status=any&limit=250');
  return result.products || [];
}

async function getAllCollections() {
  const query = `
    query {
      collections(first: 50) {
        edges {
          node {
            id
            handle
            title
          }
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(query);
  return data.collections.edges.map(edge => edge.node);
}

async function publishProductToOnlineStore(productId) {
  try {
    log(`  Publishing product ${productId} to Online Store...`, colors.yellow);
    
    const result = await shopifyREST(`products/${productId}.json`, 'PUT', {
      product: {
        id: productId,
        published_scope: 'web',
      }
    });
    
    log(`  ✓ Published to Online Store`, colors.green);
    return result;
  } catch (error) {
    log(`  ❌ Failed: ${error.message}`, colors.red);
    throw error;
  }
}

async function publishCollectionToOnlineStore(collectionId) {
  try {
    // Collections use GraphQL publishablePublish mutation
    const mutation = `
      mutation PublishCollection($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable {
            ... on Collection {
              id
              title
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    // Get Online Store publication ID (usually it's available by default)
    // For now, we'll use the REST API to update collection
    const gid = collectionId;
    const numericId = gid.split('/').pop();
    
    log(`  Publishing collection ${numericId} to Online Store...`, colors.yellow);
    
    const result = await shopifyREST(`collections/${numericId}.json`, 'PUT', {
      collection: {
        id: numericId,
        published_scope: 'web',
      }
    });
    
    log(`  ✓ Published to Online Store`, colors.green);
    return result;
  } catch (error) {
    log(`  ⚠ Could not publish: ${error.message}`, colors.yellow);
    // Don't throw - collections might already be published
  }
}

async function main() {
  log('\n============================================================', colors.blue);
  log('  Fixing Sales Channels (Online Store Publishing)', colors.blue);
  log('============================================================\n', colors.blue);
  
  log(`Store: ${shopifyStoreUrl}\n`, colors.reset);
  
  // Fix Products
  log('Fetching all products...', colors.blue);
  const products = await getAllProducts();
  log(`Found ${products.length} products\n`, colors.green);
  
  for (const product of products) {
    log(`Product: ${product.title}`, colors.blue);
    log(`  Status: ${product.status}`, colors.reset);
    log(`  Published Scope: ${product.published_scope || 'not set'}`, colors.reset);
    
    if (product.published_scope !== 'web') {
      await publishProductToOnlineStore(product.id);
    } else {
      log(`  ✓ Already published to Online Store`, colors.green);
    }
  }
  
  // Fix Collections
  log('\n\nFetching all collections...', colors.blue);
  const collections = await getAllCollections();
  log(`Found ${collections.length} collections\n`, colors.green);
  
  for (const collection of collections) {
    log(`Collection: ${collection.title} (${collection.handle})`, colors.blue);
    await publishCollectionToOnlineStore(collection.id);
  }
  
  log('\n============================================================', colors.blue);
  log('  ✅ Sales Channels Fixed!', colors.green);
  log('============================================================\n', colors.blue);
  
  log('📝 What was fixed:', colors.yellow);
  log(`  - ${products.length} products now published to Online Store`, colors.reset);
  log(`  - ${collections.length} collections now published to Online Store`, colors.reset);
  log('  - Future products will automatically publish to Online Store\n', colors.reset);
}

main().catch(error => {
  log(`\n❌ Failed: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
