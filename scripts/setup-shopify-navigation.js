#!/usr/bin/env node

/**
 * 247 Print Network - Automated Shopify Navigation Setup
 * 
 * This script automatically creates all pages, assigns templates, and sets up
 * navigation menus for your Shopify store using the Shopify Admin REST API.
 * 
 * Usage:
 *   node scripts/setup-shopify-navigation.js
 *   
 * Or via npm:
 *   npm run shopify:setup-navigation
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
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

// Configuration
const shopifyStoreUrl = process.env.SHOPIFY_SHOP_URL || process.env.SHOPIFY_STORE_URL;
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2025-01';

// Validate environment
if (!shopifyStoreUrl || !shopifyAccessToken) {
  log('\n❌ Missing Shopify credentials', colors.red);
  log('\nRequired environment variables:', colors.bright);
  log('  • SHOPIFY_SHOP_URL (or SHOPIFY_STORE_URL)', colors.yellow);
  log('  • SHOPIFY_ACCESS_TOKEN', colors.yellow);
  log('\nPlease set these in your .env file or Replit Secrets.', colors.reset);
  process.exit(1);
}

// Helper function to make Shopify REST API requests
async function shopifyRequest(endpoint, method = 'GET', body = null) {
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
    throw new Error(`Shopify API error (${response.status}): ${error}`);
  }
  
  // Handle 204 No Content responses (successful deletes)
  if (response.status === 204) {
    return null;
  }
  
  return await response.json();
}

// Helper function to make Shopify GraphQL API requests
async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${shopifyStoreUrl}/admin/api/${API_VERSION}/graphql.json`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAccessToken,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
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

// Rate limiting helper (Shopify allows 2 requests/second)
function delay(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Page configurations
const PAGES = [
  {
    title: 'About Us',
    handle: 'about',
    template_suffix: 'about',
    body_html: '<p>Learn about 247 Print Network - empowering artists through fair royalties and print-on-demand.</p>',
    published: true,
  },
  {
    title: 'Contact Us',
    handle: 'contact',
    template_suffix: 'contact',
    body_html: '<p>Get in touch with our team. We\'re here to help!</p>',
    published: true,
  },
  {
    title: 'Meet the Creators',
    handle: 'creators',
    template_suffix: 'creators',
    body_html: '<p>Discover the talented artists behind our artwork.</p>',
    published: true,
  },
  {
    title: 'FAQs',
    handle: 'faq',
    template_suffix: 'faq',
    body_html: '<p>Find answers to frequently asked questions.</p>',
    published: true,
  },
  {
    title: 'Join the Creatorverse',
    handle: 'join',
    template_suffix: 'join',
    body_html: '<p>Join our community of artists and earn 30-45% royalties on every sale!</p>',
    published: true,
  },
];

// Main navigation menu structure
const MAIN_MENU = {
  title: 'Main Menu',
  handle: 'main-menu',
  items: [
    { title: 'Home', resource_type: 'frontpage', url: '/' },
    {
      title: 'Shop by Artist',
      url: '#',
      children: [
        { title: 'Featured Artists', resource_type: 'collection', handle: 'featured-artists' },
        { title: 'Abstract Artists', resource_type: 'collection', handle: 'abstract-art' },
        { title: 'Nature Artists', resource_type: 'collection', handle: 'nature-landscapes' },
        { title: 'Urban Artists', resource_type: 'collection', handle: 'urban-street' },
        { title: 'Pop Culture Artists', resource_type: 'collection', handle: 'pop-culture' },
      ],
    },
    {
      title: 'Shop by Style',
      url: '#',
      children: [
        { title: 'Abstract Art', resource_type: 'collection', handle: 'abstract-art' },
        { title: 'Nature & Landscapes', resource_type: 'collection', handle: 'nature-landscapes' },
        { title: 'Urban & Street', resource_type: 'collection', handle: 'urban-street' },
        { title: 'Pop Culture', resource_type: 'collection', handle: 'pop-culture' },
      ],
    },
    { title: 'Featured', resource_type: 'collection', handle: 'featured' },
    { title: 'About', resource_type: 'page', handle: 'about' },
    { title: 'Meet the Creators', resource_type: 'page', handle: 'creators' },
    { title: 'Contact', resource_type: 'page', handle: 'contact' },
  ],
};

// Footer navigation menu structure
const FOOTER_MENU = {
  title: 'Footer Menu',
  handle: 'footer',
  items: [
    {
      title: 'Shop',
      url: '#',
      children: [
        { title: 'All Art', resource_type: 'collection', handle: 'all' },
        { title: 'Featured', resource_type: 'collection', handle: 'featured' },
        { title: 'Abstract Art', resource_type: 'collection', handle: 'abstract-art' },
        { title: 'Nature & Landscapes', resource_type: 'collection', handle: 'nature-landscapes' },
        { title: 'Urban & Street', resource_type: 'collection', handle: 'urban-street' },
      ],
    },
    {
      title: 'About',
      url: '#',
      children: [
        { title: 'About Us', resource_type: 'page', handle: 'about' },
        { title: 'Meet the Creators', resource_type: 'page', handle: 'creators' },
        { title: 'Join as an Artist', resource_type: 'page', handle: 'join' },
        { title: 'FAQs', resource_type: 'page', handle: 'faq' },
      ],
    },
    {
      title: 'Support',
      url: '#',
      children: [
        { title: 'Contact Us', resource_type: 'page', handle: 'contact' },
        { title: 'Shipping Policy', resource_type: 'policy', handle: 'shipping-policy' },
        { title: 'Refund Policy', resource_type: 'policy', handle: 'refund-policy' },
        { title: 'Privacy Policy', resource_type: 'policy', handle: 'privacy-policy' },
      ],
    },
    {
      title: 'Legal',
      url: '#',
      children: [
        { title: 'Terms of Service', resource_type: 'policy', handle: 'terms-of-service' },
        { title: 'Privacy Policy', resource_type: 'policy', handle: 'privacy-policy' },
      ],
    },
  ],
};

// Step 1: Create pages
async function createPages() {
  logSection('Creating Pages');
  
  const createdPages = [];
  
  for (const pageConfig of PAGES) {
    try {
      log(`Creating page: ${pageConfig.title}...`, colors.blue);
      
      const result = await shopifyRequest('pages.json', 'POST', {
        page: pageConfig,
      });
      
      if (result.page) {
        createdPages.push(result.page);
        log(`✓ Created: ${result.page.title} (ID: ${result.page.id})`, colors.green);
        log(`  URL: /pages/${result.page.handle}`, colors.cyan);
        log(`  Template: page.${result.page.template_suffix}`, colors.cyan);
      }
      
      await delay();
    } catch (error) {
      if (error.message.includes('already exists')) {
        log(`⚠ Page "${pageConfig.title}" already exists, skipping`, colors.yellow);
      } else {
        log(`❌ Failed to create page "${pageConfig.title}": ${error.message}`, colors.red);
      }
    }
  }
  
  log(`\n✓ Pages created: ${createdPages.length}/${PAGES.length}`, colors.green);
  return createdPages;
}

// Step 2: Get resource IDs for menu linking
async function getResourceIds() {
  logSection('Fetching Resource IDs');
  
  const resources = {
    pages: {},
    collections: {},
  };
  
  try {
    // Fetch all pages
    log('Fetching pages...', colors.blue);
    const pagesData = await shopifyRequest('pages.json?limit=250');
    if (pagesData.pages) {
      pagesData.pages.forEach(page => {
        resources.pages[page.handle] = page.id;
      });
      log(`✓ Found ${pagesData.pages.length} pages`, colors.green);
    }
    
    await delay();
    
    // Fetch all collections
    log('Fetching collections...', colors.blue);
    const collectionsData = await shopifyRequest('collections.json?limit=250');
    if (collectionsData.collections) {
      collectionsData.collections.forEach(collection => {
        resources.collections[collection.handle] = collection.id;
      });
      log(`✓ Found ${collectionsData.collections.length} collections`, colors.green);
    }
    
  } catch (error) {
    log(`⚠ Warning: Failed to fetch resources: ${error.message}`, colors.yellow);
  }
  
  return resources;
}

// Step 3: Convert menu config to GraphQL menu items
function convertToGraphQLMenuItems(items, resources) {
  return items.map(item => {
    const menuItem = {
      title: item.title,
      type: 'HTTP',
      url: item.url || '#',
    };
    
    // Determine type and resource ID
    if (item.resource_type === 'page' && item.handle && resources.pages[item.handle]) {
      menuItem.type = 'PAGE';
      menuItem.resourceId = `gid://shopify/Page/${resources.pages[item.handle]}`;
      menuItem.url = `/pages/${item.handle}`;
    } else if (item.resource_type === 'collection' && item.handle && resources.collections[item.handle]) {
      menuItem.type = 'COLLECTION';
      menuItem.resourceId = `gid://shopify/Collection/${resources.collections[item.handle]}`;
      menuItem.url = `/collections/${item.handle}`;
    } else if (item.resource_type === 'frontpage') {
      menuItem.type = 'HTTP';
      menuItem.url = '/';
    } else if (item.resource_type === 'policy' && item.handle) {
      menuItem.type = 'HTTP';
      menuItem.url = `/policies/${item.handle}`;
    }
    
    // Handle nested items
    if (item.children && item.children.length > 0) {
      menuItem.items = convertToGraphQLMenuItems(item.children, resources);
    }
    
    return menuItem;
  });
}

// Step 4: Create menu using GraphQL
async function createMenu(menuConfig, resources) {
  logSection(`Creating Menu: ${menuConfig.title}`);
  
  try {
    log('Converting menu structure...', colors.blue);
    const menuItems = convertToGraphQLMenuItems(menuConfig.items, resources);
    
    log(`Creating menu with GraphQL...`, colors.blue);
    
    const mutation = `
      mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemInput!]!) {
        menuCreate(menu: {
          title: $title
          handle: $handle
          items: $items
        }) {
          menu {
            id
            handle
            title
            itemsCount
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    
    const variables = {
      title: menuConfig.title,
      handle: menuConfig.handle,
      items: menuItems,
    };
    
    const data = await shopifyGraphQL(mutation, variables);
    
    if (data.menuCreate.userErrors && data.menuCreate.userErrors.length > 0) {
      const errors = data.menuCreate.userErrors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new Error(errors);
    }
    
    const menu = data.menuCreate.menu;
    log(`✓ Menu created successfully!`, colors.green);
    log(`  ID: ${menu.id}`, colors.cyan);
    log(`  Handle: ${menu.handle}`, colors.cyan);
    log(`  Items: ${menu.itemsCount}`, colors.cyan);
    
    // Log menu structure
    log('\nMenu structure:', colors.bright);
    logMenuItems(menuConfig.items, 0);
    
    return menu;
    
  } catch (error) {
    log(`❌ Failed to create menu: ${error.message}`, colors.red);
    
    // If menu already exists, try to delete and recreate
    if (error.message.includes('already exists') || error.message.includes('taken')) {
      log(`\n⚠ Menu "${menuConfig.title}" already exists`, colors.yellow);
      log('You can delete it manually in Shopify Admin → Content → Menus', colors.yellow);
      log('Or run this script again after deleting it.', colors.yellow);
    }
    
    throw error;
  }
}

// Helper to log menu structure
function logMenuItems(items, depth = 0) {
  const indent = '  '.repeat(depth);
  for (const item of items) {
    const icon = depth === 0 ? '•' : '↳';
    log(`${indent}${icon} ${item.title}`, colors.cyan);
    if (item.children && item.children.length > 0) {
      logMenuItems(item.children, depth + 1);
    }
  }
}

// Main execution
async function main() {
  try {
    logSection('247 Print Network - Automated Navigation Setup');
    
    log('Store:', colors.bright);
    log(`  ${shopifyStoreUrl}`, colors.cyan);
    log('\nThis will create:', colors.bright);
    log(`  • ${PAGES.length} custom pages with templates`, colors.reset);
    log(`  • Main navigation menu with ${MAIN_MENU.items.length} top-level items`, colors.reset);
    log(`  • Footer navigation menu with ${FOOTER_MENU.items.length} sections`, colors.reset);
    console.log('');
    
    // Step 1: Create pages
    const createdPages = await createPages();
    
    // Step 2: Get resource IDs
    const resources = await getResourceIds();
    
    // Step 3: Create main menu
    await createMenu(MAIN_MENU, resources);
    
    // Step 4: Create footer menu
    await createMenu(FOOTER_MENU, resources);
    
    // Success summary
    logSection('✅ Navigation Setup Complete!');
    
    log('Created:', colors.bright);
    log(`  ✓ ${createdPages.length} pages with custom templates`, colors.green);
    log(`  ✓ Main navigation menu`, colors.green);
    log(`  ✓ Footer navigation menu`, colors.green);
    
    log('\nNext steps:', colors.bright);
    log('1. Go to Shopify Admin → Content → Pages to review pages', colors.reset);
    log('2. Go to Content → Menus to review navigation', colors.reset);
    log('3. Customize homepage sections (Hero, Featured Collections, etc.)', colors.reset);
    log('4. Preview your store and test all links', colors.reset);
    log('5. Publish your theme when ready!', colors.reset);
    
    log('\nYour store navigation is now live! 🎉', colors.green);
    
  } catch (error) {
    logSection('❌ Setup Failed');
    log(error.message, colors.red);
    log('\nPlease check your Shopify credentials and try again.', colors.yellow);
    process.exit(1);
  }
}

// Run the script
main();
