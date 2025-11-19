#!/usr/bin/env node

/**
 * Automated script to inject mobile bottom sheet JavaScript into Shopify theme
 * Usage: node scripts/inject-bottom-sheet-js.cjs [theme-name]
 * Example: node scripts/inject-bottom-sheet-js.cjs development
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Get theme from command line argument
const targetTheme = process.argv[2];

if (!targetTheme) {
  log('❌ Error: Please specify a theme name!', 'red');
  log('', 'reset');
  log('Usage:', 'blue');
  log('  node scripts/inject-bottom-sheet-js.cjs development', 'green');
  log('  node scripts/inject-bottom-sheet-js.cjs live', 'green');
  log('', 'reset');
  process.exit(1);
}

async function main() {
  try {
    log(`🚀 Starting automated bottom sheet JavaScript injection to "${targetTheme}" theme...`, 'blue');
    
    const themePath = path.join(__dirname, '..', 'attached_assets', 'theme');
    process.chdir(themePath);
    
    // Step 1: Pull current theme
    log(`📥 Step 1: Pulling "${targetTheme}" theme from Shopify...`, 'blue');
    try {
      execSync(`shopify theme pull --path . --theme "${targetTheme}" --only "sections/main-product.liquid"`, { 
        stdio: 'inherit' 
      });
    } catch (error) {
      log('⚠️  Could not pull main-product.liquid, trying templates/product.liquid...', 'yellow');
      execSync(`shopify theme pull --path . --theme "${targetTheme}" --only "templates/product.liquid"`, { 
        stdio: 'inherit' 
      });
    }
    
    // Step 2: Find target file
    const possibleFiles = [
      'sections/main-product.liquid',
      'templates/product.liquid'
    ];
    
    let targetFile = null;
    for (const file of possibleFiles) {
      const filePath = path.join(themePath, file);
      if (fs.existsSync(filePath)) {
        targetFile = filePath;
        log(`✅ Found target file: ${file}`, 'green');
        break;
      }
    }
    
    if (!targetFile) {
      log('❌ Error: Could not find product template file!', 'red');
      log('Please manually add the JavaScript code as shown in the instructions.', 'yellow');
      process.exit(1);
    }
    
    // Step 3: Check if already injected
    const fileContent = fs.readFileSync(targetFile, 'utf8');
    if (fileContent.includes('initBottomSheet')) {
      log('⚠️  Bottom sheet JavaScript already exists!', 'yellow');
      log('Skipping injection to avoid duplicates.', 'yellow');
      process.exit(0);
    }
    
    // Step 4: Create backup
    const backupPath = `${targetFile}.backup-${Date.now()}`;
    fs.copyFileSync(targetFile, backupPath);
    log(`💾 Backup created: ${path.basename(backupPath)}`, 'blue');
    
    // Step 5: Inject JavaScript
    log('💉 Step 2: Injecting JavaScript...', 'blue');
    
    const jsCode = `
<script>
(function() {
  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBottomSheet);
  } else {
    initBottomSheet();
  }

  function initBottomSheet() {
    // Only run on mobile (max-width: 900px)
    if (window.innerWidth > 900) return;

    const bottomSheet = document.querySelector("section.pn247-art-product .product__info");
    if (!bottomSheet) return;

    // Toggle expanded state on tap anywhere on bottom sheet
    bottomSheet.addEventListener("click", function(e) {
      // Don't toggle if clicking inside form elements
      if (e.target.tagName === "INPUT" || 
          e.target.tagName === "BUTTON" || 
          e.target.tagName === "SELECT") {
        return;
      }
      
      this.classList.toggle("expanded");
    });

    // Swipe gesture support
    let touchStartY = 0;
    let touchStartTime = 0;

    bottomSheet.addEventListener("touchstart", function(e) {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    bottomSheet.addEventListener("touchend", function(e) {
      const touchEndY = e.changedTouches[0].clientY;
      const touchDuration = Date.now() - touchStartTime;
      const swipeDistance = touchStartY - touchEndY;

      // Only count as swipe if quick (< 300ms) and significant distance (> 50px)
      if (touchDuration < 300) {
        if (swipeDistance > 50) {
          // Swipe up = expand
          this.classList.add("expanded");
        } else if (swipeDistance < -50) {
          // Swipe down = collapse
          this.classList.remove("expanded");
        }
      }
    }, { passive: true });

    // Re-check on window resize
    window.addEventListener("resize", function() {
      if (window.innerWidth > 900) {
        bottomSheet.classList.remove("expanded");
      }
    });
  }
})();
</script>`;
    
    // Find last closing tag and inject before it
    const lines = fileContent.split('\n');
    let injectionIndex = -1;
    
    // Search from bottom up for closing tags
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('</section>') || lines[i].includes('</div>')) {
        injectionIndex = i;
        break;
      }
    }
    
    if (injectionIndex === -1) {
      // Fallback: add at end of file
      injectionIndex = lines.length - 1;
    }
    
    // Insert the code
    lines.splice(injectionIndex, 0, jsCode);
    const newContent = lines.join('\n');
    
    fs.writeFileSync(targetFile, newContent, 'utf8');
    log('✅ JavaScript injected successfully!', 'green');
    
    // Step 6: Push changes back
    log(`📤 Step 3: Pushing changes back to "${targetTheme}" theme...`, 'blue');
    const relativeFile = path.relative(themePath, targetFile);
    execSync(`shopify theme push --path . --theme "${targetTheme}" --only "${relativeFile}"`, { 
      stdio: 'inherit' 
    });
    
    log('', 'reset');
    log(`✅ Done! Mobile bottom sheet JavaScript is now live on "${targetTheme}" theme!`, 'green');
    log('📱 Test it: Visit any product page on mobile and tap the bottom sheet', 'blue');
    log(`💾 Backup saved: ${path.basename(backupPath)}`, 'yellow');
    
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    log('Please add the JavaScript manually using the step-by-step instructions.', 'yellow');
    process.exit(1);
  }
}

main();
