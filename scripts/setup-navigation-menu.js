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
 * Navigation Menu Structure
 */
const MENU_STRUCTURE = {
  featured: [
    { handle: 'new-arrivals', title: 'New Arrivals' },
    { handle: 'all-art-prints', title: 'All Art Prints' },
  ],
  byStyle: [
    { handle: 'nature', title: 'Nature Art' },
    { handle: 'modern', title: 'Modern Art' },
    { handle: 'wildlife', title: 'Wildlife Art' },
    { handle: 'abstract', title: 'Abstract Art' },
    { handle: 'landscape', title: 'Landscape Art' },
    { handle: 'portrait', title: 'Portrait Art' },
    { handle: 'urban', title: 'Urban Art' },
    { handle: 'minimalist', title: 'Minimalist Art' },
    { handle: 'colorful', title: 'Colorful Art' },
    { handle: 'botanical', title: 'Botanical Art' },
  ],
  byFinish: [
    { handle: 'canvas-prints', title: 'Canvas Prints' },
    { handle: 'paper-prints', title: 'Paper Prints' },
  ],
};

async function getMainMenu() {
  const query = `
    query GetMenus {
      menus(first: 10) {
        edges {
          node {
            id
            handle
            title
            items {
              id
              title
              url
              type
              items {
                id
                title
                url
                type
              }
            }
          }
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(query);
  
  // Find main-menu from the list
  const menus = data.menus.edges.map(edge => edge.node);
  const mainMenu = menus.find(menu => menu.handle === 'main-menu');
  
  return mainMenu || null;
}

async function getCollectionByHandle(handle) {
  const query = `
    query GetCollection($handle: String!) {
      collectionByHandle(handle: $handle) {
        id
        handle
        title
      }
    }
  `;
  
  const data = await shopifyGraphQL(query, { handle });
  return data.collectionByHandle;
}

async function updateMenu(menuId, title, handle, items) {
  const mutation = `
    mutation UpdateMenu($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
        menu {
          id
          handle
          title
          items {
            id
            title
            url
            type
            items {
              id
              title
              url
              type
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  
  const data = await shopifyGraphQL(mutation, { id: menuId, title, handle, items });
  
  if (data.menuUpdate.userErrors && data.menuUpdate.userErrors.length > 0) {
    const errors = data.menuUpdate.userErrors.map(e => `${e.field}: ${e.message}`).join(', ');
    throw new Error(errors);
  }
  
  return data.menuUpdate.menu;
}

async function buildMenuItems() {
  log('\nBuilding menu structure...', colors.blue);
  
  const menuItems = [];
  
  // Featured Collections (top level)
  log('\nAdding featured collections...', colors.yellow);
  for (const item of MENU_STRUCTURE.featured) {
    const collection = await getCollectionByHandle(item.handle);
    if (collection) {
      menuItems.push({
        title: item.title,
        resourceId: collection.id,
        type: 'COLLECTION',
      });
      log(`  ✓ ${item.title}`, colors.green);
    } else {
      log(`  ⚠ Skipping ${item.title} (collection not found)`, colors.yellow);
    }
    await delay(100);
  }
  
  // Shop by Style (nested menu)
  log('\nAdding "Shop by Style" menu...', colors.yellow);
  const styleItems = [];
  for (const item of MENU_STRUCTURE.byStyle) {
    const collection = await getCollectionByHandle(item.handle);
    if (collection) {
      styleItems.push({
        title: item.title,
        resourceId: collection.id,
        type: 'COLLECTION',
      });
      log(`  ✓ ${item.title}`, colors.green);
    }
    await delay(100);
  }
  
  if (styleItems.length > 0) {
    menuItems.push({
      title: 'Shop by Style',
      type: 'HTTP',
      url: '/collections',
      items: styleItems,
    });
  }
  
  // Shop by Finish (nested menu)
  log('\nAdding "Shop by Finish" menu...', colors.yellow);
  const finishItems = [];
  for (const item of MENU_STRUCTURE.byFinish) {
    const collection = await getCollectionByHandle(item.handle);
    if (collection) {
      finishItems.push({
        title: item.title,
        resourceId: collection.id,
        type: 'COLLECTION',
      });
      log(`  ✓ ${item.title}`, colors.green);
    }
    await delay(100);
  }
  
  if (finishItems.length > 0) {
    menuItems.push({
      title: 'Shop by Finish',
      type: 'HTTP',
      url: '/collections',
      items: finishItems,
    });
  }
  
  return menuItems;
}

async function main() {
  log('\n============================================================', colors.blue);
  log('  Setting Up Navigation Menu with Collections', colors.blue);
  log('============================================================\n', colors.blue);
  
  log(`Store: ${shopifyStoreUrl}\n`, colors.reset);
  
  // Get main menu
  log('Fetching main menu...', colors.blue);
  const mainMenu = await getMainMenu();
  
  if (!mainMenu) {
    log('❌ Main menu not found. Creating it first...', colors.red);
    log('Please create a menu called "main-menu" in Shopify Admin first.', colors.yellow);
    process.exit(1);
  }
  
  log(`✓ Found menu: ${mainMenu.title} (${mainMenu.handle})`, colors.green);
  
  // Build menu items
  const menuItems = await buildMenuItems();
  
  // Update menu
  log('\nUpdating navigation menu...', colors.blue);
  await updateMenu(mainMenu.id, mainMenu.title, mainMenu.handle, menuItems);
  
  log('\n============================================================', colors.blue);
  log('  ✅ Navigation Menu Setup Complete!', colors.green);
  log('============================================================\n', colors.blue);
  
  log(`Added ${menuItems.length} top-level menu items:\n`, colors.green);
  menuItems.forEach(item => {
    log(`  • ${item.title}`, colors.reset);
    if (item.items && item.items.length > 0) {
      item.items.forEach(subItem => {
        log(`    └─ ${subItem.title}`, colors.reset);
      });
    }
  });
  
  log('\n📝 What happens next:', colors.yellow);
  log('  - Visit your storefront to see the new navigation menu', colors.reset);
  log('  - Collections are now organized by Style and Finish', colors.reset);
  log('  - Future products will automatically appear in the right collections\n', colors.reset);
}

main().catch(error => {
  log(`\n❌ Setup Failed: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
