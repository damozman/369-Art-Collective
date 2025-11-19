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

/**
 * Smart Collections Configuration
 * These collections automatically populate based on product tags
 */
const SMART_COLLECTIONS = [
  // Featured Collections
  {
    handle: 'new-arrivals',
    title: 'New Arrivals',
    description: 'Discover the latest artwork additions to our marketplace.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'New',
      },
    ],
    disjunctive: false, // AND logic
  },
  
  // Style-Based Collections (matching navigation menu)
  // Using 'Style:' prefix format to match AI-generated tags (Style:Nature, Style:Wildlife, etc.)
  {
    handle: 'abstract',
    title: 'Abstract Art',
    description: 'Bold, contemporary abstract artwork that makes a statement.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Abstract',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'landscape',
    title: 'Landscape Art',
    description: 'Breathtaking landscapes and scenic vistas.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Landscape',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'nature',
    title: 'Nature Art',
    description: 'Celebrate the beauty of the natural world.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Nature',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'urban',
    title: 'Urban Art',
    description: 'Street art, cityscapes, and urban culture.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Urban',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'portrait',
    title: 'Portrait Art',
    description: 'Stunning portraiture and figurative art.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Portrait',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'modern',
    title: 'Modern Art',
    description: 'Contemporary modern art for today\'s spaces.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Modern',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'minimalist',
    title: 'Minimalist Art',
    description: 'Clean, simple designs that speak volumes.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Minimalist',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'colorful',
    title: 'Colorful Art',
    description: 'Vibrant, bold colors that energize any room.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Colorful',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'wildlife',
    title: 'Wildlife Art',
    description: 'Beautiful wildlife and animal artwork.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Wildlife',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'botanical',
    title: 'Botanical Art',
    description: 'Floral and plant-inspired artwork.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Style:Botanical',
      },
    ],
    disjunctive: false,
  },
  
  // Finish-Based Collections
  {
    handle: 'canvas-prints',
    title: 'Canvas Prints',
    description: 'Classic gallery-wrapped canvas prints ready to hang.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Finish:Canvas',
      },
    ],
    disjunctive: false,
  },
  {
    handle: 'paper-prints',
    title: 'Paper Prints',
    description: 'Premium paper prints perfect for framing.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'Finish:Paper',
      },
    ],
    disjunctive: false,
  },
  
  // All Art Prints
  {
    handle: 'all-art-prints',
    title: 'All Art Prints',
    description: 'Browse our complete collection of artwork.',
    rules: [
      {
        column: 'TAG',
        relation: 'EQUALS',
        condition: 'art-print',
      },
    ],
    disjunctive: false,
  },
];

async function createSmartCollection(config) {
  try {
    log(`Creating smart collection: ${config.title}...`, colors.blue);
    
    const mutation = `
      mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            handle
            title
            ruleSet {
              rules {
                column
                relation
                condition
              }
              appliedDisjunctively
            }
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
        title: config.title,
        handle: config.handle,
        descriptionHtml: `<p>${config.description}</p>`,
        ruleSet: {
          rules: config.rules,
          appliedDisjunctively: config.disjunctive,
        },
      },
    };
    
    const data = await shopifyGraphQL(mutation, variables);
    
    if (data.collectionCreate.userErrors && data.collectionCreate.userErrors.length > 0) {
      const errors = data.collectionCreate.userErrors.map(e => `${e.field}: ${e.message}`).join(', ');
      
      if (errors.includes('already') || errors.includes('taken')) {
        log(`⚠ Collection "${config.title}" already exists, skipping`, colors.yellow);
        return null;
      }
      
      throw new Error(errors);
    }
    
    const collection = data.collectionCreate.collection;
    log(`✓ Created smart collection: ${collection.title} (${collection.handle})`, colors.green);
    log(`  Auto-populates with tag: ${config.rules[0].condition}`, colors.reset);
    
    return collection;
    
  } catch (error) {
    log(`❌ Failed to create collection "${config.title}": ${error.message}`, colors.red);
    throw error;
  }
}

async function main() {
  log('\n============================================================', colors.blue);
  log('  Creating Smart Collections for Auto-Organization', colors.blue);
  log('============================================================\n', colors.blue);
  
  log(`Store: ${shopifyStoreUrl}\n`, colors.reset);
  
  let successCount = 0;
  
  for (const config of SMART_COLLECTIONS) {
    try {
      await createSmartCollection(config);
      successCount++;
      await delay();
    } catch (error) {
      // Continue with next collection
    }
  }
  
  log('\n============================================================', colors.blue);
  log('  ✅ Smart Collections Setup Complete!', colors.green);
  log('============================================================\n', colors.blue);
  
  log(`Created: ${successCount}/${SMART_COLLECTIONS.length} collections\n`, colors.green);
  log('\n📝 What happens next:', colors.yellow);
  log('  - Products with matching tags will automatically appear in collections', colors.reset);
  log('  - Navigation menus will now show products organized by style', colors.reset);
  log('  - Your grizzly bear will appear in "Wildlife Art" if tagged Style:Wildlife\n', colors.reset);
}

main().catch(error => {
  log(`\n❌ Setup Failed: ${error.message}`, colors.red);
  process.exit(1);
});
