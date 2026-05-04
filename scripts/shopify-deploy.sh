#!/bin/bash

# 3six9 Art Collective - Shopify Theme Deployment Script
# This script helps deploy theme files using Shopify CLI

set -e

echo "🚀 3six9 Art Collective - Shopify Theme Deploy"
echo "============================================"
echo ""

# Navigate to theme directory
cd attached_assets/theme

echo "📁 Theme directory: $(pwd)"
echo ""

# Check if Shopify CLI is installed
if ! command -v shopify &> /dev/null; then
    echo "❌ Shopify CLI not found!"
    echo "Installing Shopify CLI..."
    npm install -g @shopify/cli @shopify/theme
fi

echo "✅ Shopify CLI installed"
echo ""

# Count files to be deployed
echo "📦 Files ready for deployment:"
echo "   - Assets: $(ls -1 assets/*.{css,js,png} 2>/dev/null | wc -l) files"
echo "   - Sections: $(ls -1 sections/*.liquid 2>/dev/null | wc -l) files"
echo "   - Snippets: $(ls -1 snippets/*.liquid 2>/dev/null | wc -l) files"
echo "   - Templates: $(ls -1 templates/*.json 2>/dev/null | wc -l) files"
echo "   - Layout: $(ls -1 layout/*.liquid 2>/dev/null | wc -l) files"
echo "   - Config: $(ls -1 config/*.json 2>/dev/null | grep -v settings_data | wc -l) files"
echo ""

echo "🔐 Authentication Required"
echo "You'll be prompted to login to your Shopify store..."
echo ""
echo "Your store: bvhpq0-hy.myshopify.com"
echo ""

# Provide deployment options
echo "Choose deployment option:"
echo ""
echo "1️⃣  Create NEW unpublished theme (SAFE - for testing)"
echo "    Command: shopify theme push --unpublished"
echo ""
echo "2️⃣  Push to existing theme by ID"
echo "    Command: shopify theme push --theme=THEME_ID"
echo ""
echo "3️⃣  List available themes first"
echo "    Command: shopify theme list"
echo ""

read -p "Enter option (1, 2, or 3): " option

case $option in
    1)
        echo ""
        echo "🎨 Creating new unpublished theme for testing..."
        echo "This is SAFE - won't affect your live site"
        echo ""
        shopify theme push --unpublished --store=bvhpq0-hy.myshopify.com
        ;;
    2)
        read -p "Enter Theme ID: " theme_id
        echo ""
        echo "🎨 Pushing to theme ID: $theme_id..."
        echo ""
        shopify theme push --theme=$theme_id --store=bvhpq0-hy.myshopify.com
        ;;
    3)
        echo ""
        echo "📋 Listing available themes..."
        echo ""
        shopify theme list --store=bvhpq0-hy.myshopify.com
        echo ""
        echo "Run this script again to deploy to a specific theme"
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"
