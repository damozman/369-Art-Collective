#!/bin/bash
# Production build script with symlink fix
# This script should be run before publishing/deploying

set -e

echo "🔨 Building 247 CreatorStack for production..."
echo ""

# Use npm run build which calls the package.json build script
echo "📦 Running build..."
npm run build

# Create the required symlink for production deployment
echo "🔗 Creating production static files symlink..."
ln -sfn ../public dist/server/public

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "ℹ️  The production build is ready at dist/"
echo "ℹ️  You can now publish/deploy your application"
