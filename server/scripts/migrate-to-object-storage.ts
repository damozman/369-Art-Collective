/**
 * Migration Script: Filesystem to Object Storage
 * 
 * This script:
 * 1. Scans the local filesystem /uploads/ directory for all images
 * 2. Uploads them to Replit Object Storage
 * 3. Updates database records to point to new /objects/ URLs
 * 
 * Usage: npx tsx server/scripts/migrate-to-object-storage.ts
 */

import fs from "fs/promises";
import path from "path";
import { ObjectStorageService } from "../objectStorage";
import { db } from "../lib/db";
import { artworks, portfolioSubmissions } from "@shared/schema";
import { eq } from "drizzle-orm";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

interface MigrationStats {
  totalFiles: number;
  uploadedFiles: number;
  updatedArtworks: number;
  updatedPortfolios: number;
  errors: string[];
}

async function getAllFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getAllFilesRecursive(fullPath));
    } else if (entry.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function migrateFileToObjectStorage(
  filePath: string,
  objectStorage: ObjectStorageService,
  stats: MigrationStats
): Promise<string | null> {
  try {
    // Read the file
    const buffer = await fs.readFile(filePath);
    
    // Determine target directory based on file path
    const relativePath = path.relative(UPLOADS_DIR, filePath);
    let targetDir: string;
    
    if (relativePath.startsWith("ai-generated")) {
      targetDir = objectStorage.getAiGeneratedDir();
    } else if (relativePath.startsWith("ai-previews")) {
      targetDir = objectStorage.getAiPreviewsDir();
    } else {
      targetDir = objectStorage.getArtworkUploadsDir();
    }
    
    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = contentTypeMap[ext] || 'image/jpeg';
    
    // Upload to object storage
    const filename = path.basename(filePath);
    const objectUrl = await objectStorage.uploadFile({
      directory: targetDir,
      filename,
      buffer,
      contentType,
    });
    
    console.log(`✓ Migrated: ${relativePath} → ${objectUrl}`);
    stats.uploadedFiles++;
    
    return objectUrl;
  } catch (error: any) {
    const errorMsg = `Failed to migrate ${filePath}: ${error.message}`;
    console.error(`✗ ${errorMsg}`);
    stats.errors.push(errorMsg);
    return null;
  }
}

async function updateDatabaseRecords(
  oldUrl: string,
  newUrl: string,
  stats: MigrationStats
): Promise<void> {
  try {
    // Update artworks
    const updatedArtworks = await db
      .update(artworks)
      .set({ imageUrl: newUrl })
      .where(eq(artworks.imageUrl, oldUrl))
      .returning();
    
    if (updatedArtworks.length > 0) {
      console.log(`  Updated ${updatedArtworks.length} artwork(s)`);
      stats.updatedArtworks += updatedArtworks.length;
    }
    
    // Update portfolio submissions
    const updatedPortfolios = await db
      .update(portfolioSubmissions)
      .set({ imageUrl: newUrl })
      .where(eq(portfolioSubmissions.imageUrl, oldUrl))
      .returning();
    
    if (updatedPortfolios.length > 0) {
      console.log(`  Updated ${updatedPortfolios.length} portfolio submission(s)`);
      stats.updatedPortfolios += updatedPortfolios.length;
    }
  } catch (error: any) {
    const errorMsg = `Failed to update database for ${oldUrl}: ${error.message}`;
    console.error(`✗ ${errorMsg}`);
    stats.errors.push(errorMsg);
  }
}

async function main() {
  console.log("=== Object Storage Migration Script ===\n");
  
  const stats: MigrationStats = {
    totalFiles: 0,
    uploadedFiles: 0,
    updatedArtworks: 0,
    updatedPortfolios: 0,
    errors: [],
  };
  
  // Check if uploads directory exists
  try {
    await fs.access(UPLOADS_DIR);
  } catch (error) {
    console.log("✓ No /uploads directory found - nothing to migrate");
    return;
  }
  
  // Initialize object storage
  const objectStorage = new ObjectStorageService();
  
  try {
    // Verify environment variables are set
    objectStorage.getArtworkUploadsDir();
    objectStorage.getAiGeneratedDir();
    objectStorage.getAiPreviewsDir();
  } catch (error: any) {
    console.error("✗ Error: Object storage not configured");
    console.error(error.message);
    console.error("\nPlease set up object storage buckets first:");
    console.error("1. Create buckets in Replit Object Storage");
    console.error("2. Set environment variables: ARTWORK_UPLOADS_DIR, AI_GENERATED_DIR, AI_PREVIEWS_DIR");
    process.exit(1);
  }
  
  console.log("Step 1: Scanning filesystem for images...\n");
  
  // Get all image files
  const files = await getAllFilesRecursive(UPLOADS_DIR);
  stats.totalFiles = files.length;
  
  if (files.length === 0) {
    console.log("✓ No images found in /uploads directory");
    return;
  }
  
  console.log(`Found ${files.length} image file(s)\n`);
  console.log("Step 2: Uploading images to object storage...\n");
  
  // Migrate each file and track URL mappings
  const urlMappings: Map<string, string> = new Map();
  
  for (const filePath of files) {
    const relativePath = path.relative(UPLOADS_DIR, filePath);
    const oldUrl = `/uploads/${relativePath.replace(/\\/g, '/')}`;
    
    const newUrl = await migrateFileToObjectStorage(filePath, objectStorage, stats);
    
    if (newUrl) {
      urlMappings.set(oldUrl, newUrl);
    }
  }
  
  console.log(`\nStep 3: Updating database records...\n`);
  
  // Update database records
  for (const [oldUrl, newUrl] of Array.from(urlMappings.entries())) {
    await updateDatabaseRecords(oldUrl, newUrl, stats);
  }
  
  // Print summary
  console.log("\n=== Migration Summary ===");
  console.log(`Total files found: ${stats.totalFiles}`);
  console.log(`Files uploaded: ${stats.uploadedFiles}`);
  console.log(`Artworks updated: ${stats.updatedArtworks}`);
  console.log(`Portfolio submissions updated: ${stats.updatedPortfolios}`);
  
  if (stats.errors.length > 0) {
    console.log(`\nErrors encountered: ${stats.errors.length}`);
    stats.errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
  }
  
  console.log("\n✓ Migration complete!");
  console.log("\nNext steps:");
  console.log("1. Verify images are accessible at /objects/ URLs");
  console.log("2. Test upload and viewing functionality");
  console.log("3. Once verified, you can safely delete the /uploads directory");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
