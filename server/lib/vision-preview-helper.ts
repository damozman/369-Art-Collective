import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_OPENAI_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB limit
const AI_PREVIEW_MAX_DIMENSION = 2048; // Max width/height for AI analysis
const AI_PREVIEW_QUALITY = 80; // JPEG quality (0-100)
const AI_PREVIEW_DIR = path.join(process.cwd(), "uploads", "ai-previews");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Error codes for AI content generation
export enum AIContentErrorCode {
  AI_IMAGE_TOO_LARGE = "AI_IMAGE_TOO_LARGE",
  AI_IMAGE_FETCH_FAILED = "AI_IMAGE_FETCH_FAILED",
  AI_IMAGE_INVALID = "AI_IMAGE_INVALID",
  AI_PREVIEW_GENERATION_FAILED = "AI_PREVIEW_GENERATION_FAILED",
  AI_UNKNOWN_ERROR = "AI_UNKNOWN_ERROR"
}

// Custom error class for AI content generation
export class AIContentError extends Error {
  constructor(
    public code: AIContentErrorCode,
    public userMessage: string,
    public developerMessage: string
  ) {
    super(developerMessage);
    this.name = "AIContentError";
  }
}

// Ensure AI preview directory exists
async function ensurePreviewDir(): Promise<void> {
  try {
    await fs.mkdir(AI_PREVIEW_DIR, { recursive: true });
  } catch (error) {
    console.error("[AI_PREVIEW] Failed to create preview directory:", error);
  }
}

// Generate hash for caching
function generateFileHash(filePath: string): string {
  return crypto.createHash('sha256').update(filePath).digest('hex').substring(0, 16);
}

// Check if a file path is safe (within uploads directory)
function isSafeFilePath(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const uploadsPath = path.resolve(UPLOADS_DIR);
  return resolvedPath.startsWith(uploadsPath);
}

// Extract local file path from URL
function extractLocalPath(imageUrl: string): string | null {
  try {
    // Handle relative paths like "/uploads/..."
    if (imageUrl.startsWith('/uploads/')) {
      // Strip leading slash before joining to avoid absolute path issues
      const relativePath = imageUrl.replace(/^\//, '');
      return path.join(process.cwd(), relativePath);
    }
    
    // Handle full URLs like "https://domain.com/uploads/..."
    if (imageUrl.startsWith('http')) {
      const url = new URL(imageUrl);
      if (url.pathname.startsWith('/uploads/')) {
        // Strip leading slash before joining to avoid absolute path issues
        const relativePath = url.pathname.replace(/^\//, '');
        return path.join(process.cwd(), relativePath);
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Get or create AI-friendly preview image
export async function getAIPreviewImage(imageUrl: string): Promise<string> {
  await ensurePreviewDir();
  
  // Extract local file path
  const localPath = extractLocalPath(imageUrl);
  
  if (!localPath) {
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_INVALID,
      "Invalid image URL. Please upload your image directly.",
      `Cannot process non-local image URL: ${imageUrl}`
    );
  }
  
  // Security check: ensure file is within uploads directory
  if (!isSafeFilePath(localPath)) {
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_INVALID,
      "Invalid image path. Please upload your image again.",
      `Unsafe file path detected: ${localPath}`
    );
  }
  
  // Check if original file exists
  try {
    await fs.access(localPath);
  } catch (error) {
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_FETCH_FAILED,
      "Image file not found. Please try uploading again.",
      `File not found: ${localPath}`
    );
  }
  
  // Get file stats
  const stats = await fs.stat(localPath);
  const fileSize = stats.size;
  
  // If file is already under 20MB, use original
  if (fileSize < MAX_OPENAI_IMAGE_SIZE_BYTES) {
    console.log(`[AI_PREVIEW] Using original image (${(fileSize / 1024 / 1024).toFixed(2)}MB): ${imageUrl}`);
    return imageUrl;
  }
  
  // Generate preview filename
  const fileHash = generateFileHash(localPath);
  const ext = path.extname(localPath);
  const basename = path.basename(localPath, ext);
  const previewFilename = `${basename}_${fileHash}_preview.jpg`;
  const previewPath = path.join(AI_PREVIEW_DIR, previewFilename);
  const previewUrl = `/uploads/ai-previews/${previewFilename}`;
  
  // Check if preview already exists
  try {
    await fs.access(previewPath);
    const previewStats = await fs.stat(previewPath);
    console.log(`[AI_PREVIEW] Using cached preview (${(previewStats.size / 1024 / 1024).toFixed(2)}MB): ${previewUrl}`);
    return previewUrl;
  } catch (error) {
    // Preview doesn't exist, create it
  }
  
  // Create downsized JPEG preview
  try {
    console.log(`[AI_PREVIEW] Creating preview for ${basename}${ext} (original: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    
    const image = sharp(localPath);
    const metadata = await image.metadata();
    
    // Resize if needed
    const maxDim = Math.max(metadata.width || 0, metadata.height || 0);
    if (maxDim > AI_PREVIEW_MAX_DIMENSION) {
      await image
        .resize(AI_PREVIEW_MAX_DIMENSION, AI_PREVIEW_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toFile(previewPath);
    } else {
      // Just convert to JPEG with compression
      await image
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toFile(previewPath);
    }
    
    const previewStats = await fs.stat(previewPath);
    const previewSize = previewStats.size;
    
    console.log(`[AI_PREVIEW] Preview created (${(previewSize / 1024 / 1024).toFixed(2)}MB): ${previewUrl}`);
    
    // Verify preview is under limit
    if (previewSize >= MAX_OPENAI_IMAGE_SIZE_BYTES) {
      // If still too large, throw error with guidance
      throw new AIContentError(
        AIContentErrorCode.AI_IMAGE_TOO_LARGE,
        "Your image is extremely large and cannot be processed for AI analysis. Try uploading a smaller version of your artwork.",
        `Preview still exceeds 20MB after compression: ${(previewSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
    
    return previewUrl;
  } catch (error: any) {
    if (error instanceof AIContentError) {
      throw error;
    }
    
    throw new AIContentError(
      AIContentErrorCode.AI_PREVIEW_GENERATION_FAILED,
      "Failed to process your image for AI analysis. Please try a different image format.",
      `Sharp processing error: ${error.message}`
    );
  }
}

// Clean up old preview files (optional - can be called periodically)
export async function cleanupOldPreviews(maxAgeHours: number = 24): Promise<number> {
  try {
    await ensurePreviewDir();
    
    const files = await fs.readdir(AI_PREVIEW_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.endsWith('_preview.jpg')) continue;
      
      const filePath = path.join(AI_PREVIEW_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
    
    console.log(`[AI_PREVIEW] Cleaned up ${deletedCount} old preview files`);
    return deletedCount;
  } catch (error) {
    console.error("[AI_PREVIEW] Cleanup failed:", error);
    return 0;
  }
}
