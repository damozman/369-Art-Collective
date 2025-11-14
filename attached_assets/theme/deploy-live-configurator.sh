#!/bin/bash
# Deploy Live Product Configurator
# Deploys size scaling, frame overlays, and visual preview features

cd "$(dirname "$0")"

echo "🎨 Deploying Live Product Configurator..."
echo "   Features: Visual size scaling + Frame preview overlays"
echo ""

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-art-product.liquid \
  --only=snippets/247-art-options.liquid \
  --only=templates/product.art.json \
  --only=assets/247-art.js \
  --only=assets/247-art.css

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 What to test:"
echo "   1. Select different sizes → image should scale visually"
echo "   2. Select Black/White Frame → realistic frame border appears"
echo "   3. Select No Frame → frame border disappears"
echo "   4. Price updates correctly (+$29 for frames)"
echo "   5. Add to cart → correct variant + frame option saved"
echo ""
echo "🔗 Test products:"
echo "   • https://bvhpq0-hy.myshopify.com/products/stairway-to-clouds"
echo "   • https://bvhpq0-hy.myshopify.com/products/art-deco-facade"
echo ""
echo "⚠️  Clear browser cache if changes don't appear immediately"
