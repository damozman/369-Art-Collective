#!/bin/bash
# Production build script with symlink fix
# This script should be run before publishing/deploying

set -e

echo "🔨 Building 247 CreatorStack for production..."
echo ""

# Run the standard build
echo "📦 Building frontend with Vite..."
pnpm vite build

echo "🔧 Building backend with TypeScript..."
pnpm tsc --project tsconfig.server.json

# Create the required symlink for production deployment
echo "🔗 Creating production static files symlink..."
ln -sfn ../public dist/server/public

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "ℹ️  The production build is ready at dist/"
echo "ℹ️  You can now publish/deploy your application"
