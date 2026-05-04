# 🔄 GitHub Auto-Sync Setup Guide

## Automatic Shopify Theme Deployment via GitHub

Once set up, every time you push code to GitHub, Shopify automatically updates your theme. No CLI commands, no manual uploads!

---

## 🎯 **How It Works**

```
You edit code in Replit
    ↓
Push to GitHub (one command)
    ↓
Shopify detects the change
    ↓
Theme auto-updates! ✨
```

---

## ✅ **Prerequisites**

Before setting up GitHub integration:
- ✅ You've tested Shopify CLI deployment (completed above)
- ✅ Your theme files are organized in `attached_assets/theme/`
- ✅ You have a GitHub account

---

## 📋 **Setup Steps**

### **Step 1: Create GitHub Repository**

1. **Go to GitHub:** https://github.com/new

2. **Create new repository:**
   - Repository name: `247-print-network-theme`
   - Description: `Shopify theme for 369 Art Collective`
   - Visibility: **Private** (recommended for your business)
   - ✅ Initialize with README: **NO** (we already have files)
   - Click **"Create repository"**

3. **Copy the repository URL:**
   - You'll see: `https://github.com/YOUR_USERNAME/247-print-network-theme.git`
   - Keep this handy!

---

### **Step 2: Initialize Git in Replit**

Open Replit Shell and run these commands:

```bash
# Navigate to project root
cd /home/runner/workspace

# Check if Git is already initialized
git status

# If NOT initialized, run:
git init

# Configure Git (use your info)
git config user.name "Your Name"
git config user.email "your-email@example.com"

# Add all files
git add .

# Create first commit
git commit -m "Initial commit: Complete 369 Art Collective theme with mockup system"

# Connect to GitHub (replace with YOUR repository URL)
git remote add origin https://github.com/YOUR_USERNAME/247-print-network-theme.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Enter GitHub credentials when prompted.**

---

### **Step 3: Connect Shopify to GitHub**

Now connect Shopify to automatically sync from your GitHub repository:

#### **Option A: Native Shopify GitHub Integration** ⭐ **RECOMMENDED**

1. **Login to Shopify Admin:**
   - Go to: https://bvhpq0-hy.myshopify.com/admin

2. **Navigate to Themes:**
   - Click **"Online Store"** in left sidebar
   - Click **"Themes"**

3. **Add GitHub Theme:**
   - Click **"Add theme"** button
   - Select **"Connect from GitHub"**

4. **Authorize GitHub:**
   - Click **"Authorize GitHub"**
   - Login to GitHub if prompted
   - Click **"Authorize Shopify"**

5. **Select Repository:**
   - Choose your repository: `247-print-network-theme`
   - Select branch: `main`
   - Click **"Connect"**

6. **Wait for Initial Sync:**
   - Shopify clones your repository
   - Creates a new unpublished theme
   - Takes 1-2 minutes

7. **Test the New Theme:**
   - Click **"Preview"** to see your theme
   - Verify mockup system works
   - If everything looks good, click **"Publish"**

**✅ Done!** Now every push to GitHub automatically updates this theme.

---

#### **Option B: GitHub Actions (Advanced)**

For more control over deployment (staging/production environments):

1. **Create GitHub Actions workflow:**

In your GitHub repository, create this file:
`.github/workflows/deploy.yml`

```yaml
name: Deploy to Shopify

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install Shopify CLI
        run: npm install -g @shopify/cli @shopify/theme

      - name: Deploy to Shopify
        env:
          SHOPIFY_CLI_THEME_TOKEN: ${{ secrets.SHOPIFY_CLI_THEME_TOKEN }}
        run: |
          cd attached_assets/theme
          shopify theme push --theme=${{ secrets.SHOPIFY_THEME_ID }} --store=bvhpq0-hy.myshopify.com --password=${{ secrets.SHOPIFY_PASSWORD }}
```

2. **Add GitHub Secrets:**

In your GitHub repository:
- Go to **Settings** → **Secrets and variables** → **Actions**
- Click **"New repository secret"**
- Add these secrets:
  - `SHOPIFY_PASSWORD` - Your Shopify API password
  - `SHOPIFY_THEME_ID` - Your theme ID
  - `SHOPIFY_CLI_THEME_TOKEN` - Your CLI token

---

### **Step 4: Test Auto-Deployment**

Make a small test change to verify auto-deployment works:

1. **Edit a file in Replit:**
   ```bash
   # Make a small CSS change
   echo "/* Test change */" >> attached_assets/theme/assets/247-art.css
   ```

2. **Commit and push:**
   ```bash
   git add .
   git commit -m "Test: Verify auto-deployment works"
   git push
   ```

3. **Check Shopify:**
   - **Option A (Native):** Theme updates automatically in 30-60 seconds
   - **Option B (Actions):** Check GitHub Actions tab to see deployment progress

4. **Verify change:**
   - Go to your Shopify theme preview
   - View page source
   - Look for `/* Test change */` in CSS

---

## 🔄 **Daily Workflow (After Setup)**

Once GitHub integration is set up, your workflow becomes:

```bash
# 1. Make changes to theme files in Replit

# 2. Commit changes
git add .
git commit -m "Description of what you changed"

# 3. Push to GitHub
git push

# 4. Wait 30 seconds - Shopify auto-updates! ✨
```

**That's it!** No more manual uploads, no CLI commands.

---

## 📊 **Benefits of GitHub Integration**

| Feature | Manual Upload | Shopify CLI | GitHub Auto-Sync |
|---------|--------------|-------------|------------------|
| **Deployment Speed** | 15-20 min | 30 seconds | 30 seconds |
| **Effort** | High (11 files) | Medium (one command) | **Low (one push)** |
| **Version Control** | Manual | Manual | **Automatic** |
| **Rollback** | Hard | Hard | **Easy (git revert)** |
| **Team Collaboration** | Difficult | Medium | **Easy** |
| **CI/CD Ready** | No | No | **Yes** |

---

## 🎯 **Advanced: Multi-Environment Setup**

For staging + production environments:

**Replit Workflow:**
```
main branch → Auto-deploys to PRODUCTION theme
staging branch → Auto-deploys to STAGING theme
```

**Setup:**
1. Create `staging` branch in Git
2. Connect both branches in Shopify (create 2 GitHub themes)
3. Test changes on staging first
4. Merge to main when ready

---

## 🔒 **Security Best Practices**

**DO:**
- ✅ Use private GitHub repository
- ✅ Use GitHub Secrets for API keys
- ✅ Enable 2FA on GitHub and Shopify
- ✅ Use `.shopifyignore` to exclude sensitive files

**DON'T:**
- ❌ Commit `config/settings_data.json` (has sensitive data)
- ❌ Commit API keys or passwords
- ❌ Make repository public

---

## ❌ **Troubleshooting**

### **Issue: "GitHub authorization failed"**

Make sure you're the Shopify store owner or have "Themes" permission.

### **Issue: "Repository not found"**

Verify:
- Repository is created on GitHub
- You've pushed code to `main` branch
- Repository isn't empty

### **Issue: "Theme not updating after push"**

**For Native Integration:**
- Check Shopify Admin → Themes → Your GitHub theme → "Last updated" timestamp
- Click "Update" manually if needed

**For GitHub Actions:**
- Go to GitHub → Actions tab
- Check if workflow ran successfully
- Review error logs if failed

### **Issue: "Deployment failed with Liquid errors"**

Run locally first:
```bash
cd attached_assets/theme
shopify theme check
```

Fix any errors before pushing to GitHub.

---

## 📝 **Quick Reference**

### **First-Time Setup**
```bash
# Initialize Git
git init
git add .
git commit -m "Initial commit"

# Connect to GitHub
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin main

# Then connect in Shopify Admin
# Online Store → Themes → Add theme → Connect from GitHub
```

### **Daily Updates**
```bash
# Make changes in Replit
git add .
git commit -m "What you changed"
git push

# Shopify auto-updates in ~30 seconds! ✨
```

### **Rollback to Previous Version**
```bash
# See commit history
git log --oneline

# Rollback to specific commit
git revert COMMIT_ID
git push

# Shopify auto-deploys the rollback!
```

---

## 🎉 **You're Done!**

Once GitHub integration is set up:
- ✅ Theme updates automatically on every push
- ✅ Full version control with Git
- ✅ Easy rollback to previous versions
- ✅ Team collaboration ready
- ✅ Never manually upload files again!

**Next time you need to update your theme:** Just edit code in Replit and run `git push` 🚀
