#!/bin/bash
# Deploy Search System
# Deploys search bar, search results page, and filter functionality

cd "$(dirname "$0")"

echo "🔍 Deploying Search System..."
echo "   Features: Header search + Search results page + Filters"
echo ""

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/header.liquid \
  --only=templates/search.json \
  --only=sections/247-search-results.liquid

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 What to test:"
echo "   1. Desktop header → search bar appears next to cart"
echo "   2. Mobile menu → search bar appears at top of drawer"
echo "   3. Search for 'art' → results page with grid layout"
echo "   4. Filter by collection, size, finish → filters work"
echo "   5. No results → shows helpful suggestions"
echo ""
echo "🔗 Test search:"
echo "   • https://bvhpq0-hy.myshopify.com/search?q=art"
echo "   • https://bvhpq0-hy.myshopify.com/search?q=abstract"
echo ""
echo "⚠️  Clear browser cache if changes don't appear immediately"
