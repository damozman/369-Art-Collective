#!/bin/bash
# Production build script with symlink fix
# This script should be run before publishing/deploying

set -e

echo "🔨 Building 247 CreatorStack for production..."
echo ""

# Build frontend with Vite
echo "📦 Building frontend..."
npx vite build

# Build backend with esbuild (handles ESM module resolution correctly)
echo "📦 Building backend with esbuild..."
npx esbuild server/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile=dist/server/index.js \
  --packages=external \
  --sourcemap

# Create the required symlink for production deployment
echo "🔗 Creating production static files symlink..."
mkdir -p dist/server
ln -sfn ../public dist/server/public

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "ℹ️  The production build is ready at dist/"
echo "ℹ️  You can now publish/deploy your application"
