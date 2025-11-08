#!/bin/bash
set -e

echo "Building frontend with Vite..."
pnpm vite build

echo "Building backend with TypeScript..."
pnpm tsc --project tsconfig.server.json

echo "Creating symlink for production static files..."
ln -sfn ../public dist/server/public

echo "✓ Build completed successfully!"
