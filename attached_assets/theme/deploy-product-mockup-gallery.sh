#!/bin/bash
# Deploy Product Mockup Gallery System to Shopify
# This uploads the template, JavaScript, and CSS needed to display Printify mockup images

cd "$(dirname "$0")"

echo "🎨 Deploying Product Mockup Gallery System..."
echo "   This will enable mockup images on product pages"
echo ""

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-art-product.liquid \
  --only=assets/247-art.js \
  --only=assets/247-art.css \
  --only=assets/247-art-nov13-rebrand.css \
  --only=templates/product.art.json

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Visit your Shopify product pages to verify mockup images appear"
echo "   2. Click thumbnails to switch between mockup views"
echo "   3. Each product should show ~4 images (1 original + 3 mockups)"
echo ""
echo "🔗 Test products:"
echo "   - Stairway to Clouds (9876069187881)"
echo "   - Art Deco Facade (9875831161129)"
