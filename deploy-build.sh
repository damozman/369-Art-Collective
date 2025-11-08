#!/bin/bash
# Production build script with symlink fix
# This script should be run before publishing/deploying

set -e

echo "🔨 Building 247 CreatorStack for production..."
echo ""

# Build frontend with Vite
echo "📦 Building frontend..."
npx vite build

# Build backend - copy TypeScript files as-is since we'll use tsx in production
echo "📦 Preparing backend..."
mkdir -p dist/server
cp -r server/* dist/server/
cp -r shared dist/

# Create the required symlink for production deployment
echo "🔗 Creating production static files symlink..."
ln -sfn ../public dist/server/public

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "ℹ️  The production build is ready at dist/"
echo "ℹ️  Backend will run with tsx (TypeScript runtime)"
echo "ℹ️  You can now publish/deploy your application"
