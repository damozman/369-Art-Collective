# 247 CreatorStack - Deployment & Build System SOP

## Overview

This document explains how the 247 CreatorStack build and deployment system works, making it easy to understand the process from development to production.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Development vs Production](#development-vs-production)
3. [The Build Process](#the-build-process)
4. [Deployment Process](#deployment-process)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Key Technical Concepts](#key-technical-concepts)

---

## System Architecture

### What You're Working With

Your application has **two separate parts** that work together:

1. **Frontend (Client)**: The visual interface users see
   - Built with: React, TypeScript, Vite
   - Location: `client/` folder
   - Runs in: User's web browser

2. **Backend (Server)**: The behind-the-scenes logic
   - Built with: Node.js, Express, TypeScript
   - Location: `server/` folder
   - Runs on: Replit's servers

### How They Work Together

```
User's Browser  →  Frontend (React)  →  Backend (Express)  →  Database
                   (client/src)         (server/)              (PostgreSQL)
```

---

## Development vs Production

### Development Mode (What You're Using Now)

**Command**: `npm run dev`

**How it works**:
- TypeScript files run directly using `tsx` (no compilation needed)
- Vite serves the frontend with hot-reload (changes appear instantly)
- Both run on port 5000
- Perfect for: Testing, making changes, debugging

**What's happening**:
```bash
npm run dev
  ↓
NODE_ENV=development tsx server/index.ts
  ↓
Server starts → Vite dev server runs → You see changes instantly
```

### Production Mode (Deployed Website)

**Command**: `npm run start` (after building)

**How it works**:
- Files are compiled/bundled into optimized JavaScript
- All code is minimized and optimized for speed
- Runs on Replit's deployment servers
- Perfect for: Live website users

**What's happening**:
```bash
sh deploy-build.sh
  ↓
Frontend builds to dist/public/
Backend bundles to dist/server/index.js
Symlink created: dist/server/public → ../public
  ↓
npm run start
  ↓
Production server runs from dist/server/index.js
```

---

## The Build Process

### The Magic Script: `deploy-build.sh`

This script does **3 critical things** in order:

#### Step 1: Build the Frontend

```bash
npx vite build
```

**What happens**:
- Takes all your React components from `client/src/`
- Bundles them into optimized JavaScript and CSS
- Outputs to: `dist/public/`
- Creates: `index.html`, `assets/index-[hash].js`, `assets/index-[hash].css`

**Result**: A folder ready to serve to browsers

#### Step 2: Build the Backend

```bash
npx esbuild server/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile=dist/server/index.js \
  --packages=external \
  --sourcemap
```

**What happens**:
- Takes all your server code from `server/`
- Bundles it into ONE single JavaScript file
- Resolves all the `import` statements correctly
- Keeps node_modules separate (not bundled)
- Outputs to: `dist/server/index.js` (105KB file)

**Result**: A single file that can run on Node.js

**Why esbuild instead of TypeScript compiler?**
- TypeScript's `tsc` has issues with ESM module resolution
- When tsc compiles `import './routes'`, Node.js expects `import './routes.js'`
- esbuild handles this automatically by bundling everything together

#### Step 3: Create the Symlink

```bash
ln -sfn ../public dist/server/public
```

**What happens**:
- Creates a "shortcut" from `dist/server/public` to `dist/public`
- This lets the server find the frontend files

**Why is this needed?**
- The server looks for frontend files at `dist/server/public`
- But Vite builds to `dist/public`
- The symlink connects them without duplicating files

**Visual Representation**:
```
dist/
├── public/                  ← Frontend files (from Vite)
│   ├── index.html
│   └── assets/
│       ├── index-DH-vcWxt.js
│       └── index-BftNd-e1.css
└── server/
    ├── index.js             ← Bundled server code (from esbuild)
    ├── index.js.map         ← Source map for debugging
    └── public → ../public   ← Symlink to frontend files
```

---

## Deployment Process

### How to Deploy Your Changes

#### Option A: Using Replit UI (Recommended)

1. **Go to the Deployments Tab**
   - Look for "Publishing" or "Deployments" in Replit

2. **Click "Publish" or "Deploy"**
   - Replit automatically runs `sh deploy-build.sh`
   - You'll see build logs in real-time

3. **Wait for Success**
   - Build completes in ~20 seconds
   - Deployment starts automatically
   - Your site goes live at https://247portal.replit.app

#### Option B: Manual Build (For Testing)

```bash
# Clean previous build
rm -rf dist

# Run the build script
sh deploy-build.sh

# Test locally (optional)
npm run start
```

### What Happens During Deployment

```
You Click "Publish"
  ↓
Replit runs: sh deploy-build.sh
  ↓
Frontend builds (12 seconds)
Backend bundles (0.04 seconds)
Symlink created
  ↓
Replit packages everything
  ↓
Creates Docker container
  ↓
Starts production server: npm run start
  ↓
Server runs: NODE_ENV=production node dist/server/index.js
  ↓
Site goes live! 🎉
```

### Verifying Successful Deployment

**Check the build logs for**:
```
✓ built in 12.32s                          ← Frontend success
⚡ Done in 43ms                             ← Backend success  
✅ Build completed successfully!           ← Overall success
Deployment successful                       ← Deployment success
```

**Visit your site**:
```
https://247portal.replit.app
```

**You should see**:
- "Automate. Create. Grow." headline
- "Browse Kits" button
- "Artist Login" button
- Three feature cards

**If you see only "API LIVE"**: Deployment cache issue (see troubleshooting)

---

## Troubleshooting Guide

### Problem 1: "Old Site Still Showing After Republish"

**Symptoms**:
- Published site shows old content
- Build logs show success
- New files exist in build output

**Cause**: Replit deployment cache serving old assets

**Solution**:
1. Go to Deployments → Manage → "Shut down"
2. Wait 30 seconds
3. Click "Publish" again (creates fresh deployment)

### Problem 2: "Module Not Found" Error in Production

**Symptoms**:
```
Error: Cannot find module './routes'
```

**Cause**: ESM module resolution issues with TypeScript compiler

**Solution**: Already fixed! The build now uses esbuild which handles this.

**How to verify fix**:
```bash
# Check deploy-build.sh contains:
npx esbuild server/index.ts --bundle ...
# NOT:
npx tsc --project tsconfig.server.json
```

### Problem 3: "Missing dist/server/index.js"

**Symptoms**:
```
Error: Could not find dist/server/index.js
```

**Cause**: Build script didn't run or failed

**Solution**:
1. Check build logs for errors
2. Ensure `deploy-build.sh` is in `.replit` config
3. Manually run: `sh deploy-build.sh` to test

### Problem 4: "Frontend Not Loading"

**Symptoms**:
- Blank page
- Console errors about missing files
- 404 errors for `/assets/` files

**Cause**: Symlink not created or broken

**Solution**:
```bash
# Check if symlink exists
ls -la dist/server/public

# Should show:
# lrwxrwxrwx ... public -> ../public

# If missing, run:
sh deploy-build.sh
```

### Problem 5: "PostCSS Warning"

**Symptoms**:
```
A PostCSS plugin did not pass the `from` option
```

**Cause**: Tailwind CSS plugin notice (harmless)

**Solution**: Ignore it! This doesn't affect functionality.

---

## Key Technical Concepts

### What is "Bundling"?

**Simple Explanation**:
Think of bundling like packing for a trip. Instead of bringing 50 separate items, you pack them all into one suitcase.

**Technical Explanation**:
- Your app has hundreds of separate files
- Bundling combines them into a few optimized files
- Makes loading faster and simpler

**Example**:
```
Before Bundling:
server/index.ts
server/routes.ts
server/storage.ts
server/lib/db.ts
... 50+ files

After Bundling:
dist/server/index.js  (one file!)
```

### What is ESM vs CommonJS?

**ESM (ECMAScript Modules)**:
- Modern JavaScript module system
- Uses `import` and `export`
- Your project uses this

```javascript
// ESM
import express from 'express';
export const app = express();
```

**CommonJS**:
- Older module system
- Uses `require` and `module.exports`

```javascript
// CommonJS
const express = require('express');
module.exports = { app };
```

**Why it matters**:
- ESM requires explicit file extensions: `import './routes.js'`
- Your TypeScript uses: `import './routes'` (no extension)
- esbuild fixes this by bundling everything together

### What is a Symlink?

**Simple Explanation**:
A shortcut. Like a desktop shortcut on Windows - it points to the real file somewhere else.

**Technical Explanation**:
```bash
ln -sfn ../public dist/server/public

# Creates:
dist/server/public → ../public

# When server looks for:
dist/server/public/index.html

# It actually finds:
dist/public/index.html
```

**Why not just copy files?**
- Symlinks save space (no duplication)
- Changes to original automatically reflect
- Faster build times

### What Does `--packages=external` Mean?

**In esbuild command**:
```bash
--packages=external
```

**Simple Explanation**:
"Don't bundle the node_modules packages - keep them separate"

**Why**:
- Your app uses express, drizzle-orm, etc.
- These are already in `node_modules/`
- No need to bundle them into your code
- Keeps bundle size small (105KB instead of 5MB+)

**What gets bundled**:
- ✅ Your code (`server/`, `shared/`)
- ❌ Node modules (express, drizzle, etc.)

---

## Build Configuration Files

### `.replit` - Deployment Config

```toml
[deployment]
deploymentTarget = "autoscale"
build = ["sh", "deploy-build.sh"]    ← Runs our custom build
run = ["npm", "run", "start"]        ← Starts the server
```

**What this means**:
- When you click "Publish", Replit runs `sh deploy-build.sh`
- After building, Replit runs `npm run start`

### `package.json` - Scripts

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build && tsc --project tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/index.js",
    "db:push": "drizzle-kit push"
  }
}
```

**Key Scripts**:
- `npm run dev`: Development mode (what you use locally)
- `npm run start`: Production mode (used in deployment)
- `npm run build`: ⚠️ Don't use! Has TypeScript issues. Use `deploy-build.sh` instead

### `tsconfig.server.json` - TypeScript Config

```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

**Note**: This config is currently not used in production builds (we use esbuild instead), but kept for IDE type-checking.

---

## Quick Reference

### Development Commands

```bash
# Start development server
npm run dev

# Install a new package
pnpm install package-name

# Push database schema changes
npm run db:push
```

### Build Commands

```bash
# Clean build
rm -rf dist && sh deploy-build.sh

# Test production build locally
npm run start

# Check build output
ls -la dist/server/
```

### Deployment Checklist

- [ ] Changes tested in development mode
- [ ] Database migrations applied (if needed)
- [ ] Environment variables set (if needed)
- [ ] Click "Publish" in Replit
- [ ] Wait for "Deployment successful" message
- [ ] Visit https://247portal.replit.app to verify
- [ ] Check homepage loads correctly
- [ ] Test key features work

---

## Emergency Recovery

### If Deployment is Completely Broken

1. **Shut down the deployment**
   - Deployments → Manage → "Shut down"

2. **Clean local build**
   ```bash
   rm -rf dist node_modules
   pnpm install
   ```

3. **Test build locally**
   ```bash
   sh deploy-build.sh
   npm run start
   ```

4. **If local works, republish**
   - Click "Publish" again

5. **If still broken**
   - Check for errors in build logs
   - Verify `deploy-build.sh` hasn't been modified
   - Ensure esbuild is installed: `pnpm list esbuild`

---

## Understanding the File Structure

```
247portal/
├── client/                    # Frontend code
│   └── src/
│       ├── pages/            # React pages
│       ├── components/       # Reusable components
│       └── lib/              # Utilities
│
├── server/                    # Backend code
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API endpoints
│   ├── storage.ts           # Database layer
│   └── lib/                 # Backend utilities
│
├── shared/                    # Code used by both
│   └── schema.ts            # Database schema
│
├── dist/                      # Build output (generated)
│   ├── public/              # Frontend build
│   └── server/              # Backend build
│
├── deploy-build.sh           # Production build script
├── package.json              # Dependencies
└── .replit                   # Replit configuration
```

---

## Common Questions

### Q: Why use esbuild instead of TypeScript compiler?

**A**: TypeScript's `tsc` doesn't handle ESM module resolution well for Node.js. It expects you to write `import './routes.js'` with the `.js` extension, but we write `import './routes'`. esbuild bundles everything together, solving this problem.

### Q: Can I use `npm run build` instead of `deploy-build.sh`?

**A**: No! `npm run build` uses TypeScript compiler which has the module resolution issues. Always use `sh deploy-build.sh` for production builds.

### Q: Why is the build so fast?

**A**: esbuild is written in Go and is extremely fast. It bundles the entire backend in ~40ms!

### Q: What happens if I delete the symlink?

**A**: The production server won't find the frontend files, and users will see a blank page or 404 errors. Just run `sh deploy-build.sh` again to recreate it.

### Q: Can I test the production build locally?

**A**: Yes! Run `sh deploy-build.sh` then `npm run start`. Visit http://localhost:5000 to test.

---

## Best Practices

1. **Always test changes in development first**
   - Use `npm run dev` to test locally
   - Verify everything works before publishing

2. **Never modify package.json or .replit directly**
   - These are protected files
   - Use Replit's package manager or ask for help

3. **Keep deploy-build.sh intact**
   - This script is critical for deployment
   - Only modify if you understand the build process

4. **Monitor build logs**
   - Always check logs when deploying
   - Look for the "✅ Build completed successfully!" message

5. **Use proper shutdown before republishing**
   - If deployment is serving old assets
   - Shut down completely, wait, then republish

---

## Support & Resources

- **Live Site**: https://247portal.replit.app
- **Deployment Logs**: Check the Deployments tab in Replit
- **Build Script**: `deploy-build.sh` in the root directory
- **Documentation**: This file + `replit.md`

---

**Last Updated**: November 8, 2025
**Build System Version**: esbuild 0.25.12
**Node.js Version**: 20.19.3
