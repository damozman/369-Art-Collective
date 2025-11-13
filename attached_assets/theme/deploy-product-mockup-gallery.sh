#!/bin/bash
# Deploy Product Page with Mockup Gallery Support
# This uploads the complete product page template that displays Printify mockup images

cd "$(dirname "$0")"

echo "🎨 Deploying Complete Product Page with Mockup Gallery..."
echo "   This includes all features + mockup image support"
echo ""

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-product-page.liquid \
  --only=templates/product.art.json

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 What to check:"
echo "   1. Product pages should show beautiful Displate-style layout"
echo "   2. Thumbnails on left side (up to 6 images)"
echo "   3. Click thumbnails to switch between images"
echo "   4. Mockup images should appear automatically"
echo ""
echo "🔗 Test on Shopify admin:"
echo "   Products → Stairway to Clouds → View in online store"
echo "   Products → Art Deco Facade → View in online store"
echo ""
echo "⚠️  If you see 404 errors:"
echo "   Check that products exist and are published in Shopify admin"
