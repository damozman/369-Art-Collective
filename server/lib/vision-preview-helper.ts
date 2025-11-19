import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { ObjectStorageService } from "../objectStorage";

const MAX_OPENAI_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB limit
const AI_PREVIEW_MAX_DIMENSION = 2048; // Max width/height for AI analysis
const AI_PREVIEW_QUALITY = 80; // JPEG quality (0-100)
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

// Generate hash for caching (using URL instead of file path)
function generateFileHash(imageUrl: string): string {
  return crypto.createHash('sha256').update(imageUrl).digest('hex').substring(0, 16);
}

// Check if a file path is safe (within uploads directory)
function isSafeFilePath(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const uploadsPath = path.resolve(UPLOADS_DIR);
  return resolvedPath.startsWith(uploadsPath);
}

// Extract storage path and type from URL
function parseImageUrl(imageUrl: string): { type: "object-storage" | "filesystem" | "unknown", path: string } | null {
  try {
    // Handle object storage URLs like "/objects/..."
    if (imageUrl.startsWith('/objects/')) {
      return { type: "object-storage", path: imageUrl };
    }
    
    // Handle filesystem URLs like "/uploads/..." (legacy)
    if (imageUrl.startsWith('/uploads/')) {
      const relativePath = imageUrl.replace(/^\//, '');
      return { type: "filesystem", path: path.join(process.cwd(), relativePath) };
    }
    
    // Handle full URLs
    if (imageUrl.startsWith('http')) {
      const url = new URL(imageUrl);
      if (url.pathname.startsWith('/objects/')) {
        return { type: "object-storage", path: url.pathname };
      }
      if (url.pathname.startsWith('/uploads/')) {
        const relativePath = url.pathname.replace(/^\//, '');
        return { type: "filesystem", path: path.join(process.cwd(), relativePath) };
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Get or create AI-friendly preview image
export async function getAIPreviewImage(imageUrl: string): Promise<string> {
  // Parse the image URL to determine storage type
  const parsed = parseImageUrl(imageUrl);
  
  if (!parsed) {
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_INVALID,
      "Invalid image URL. Please upload your image directly.",
      `Cannot process image URL: ${imageUrl}`
    );
  }
  
  // Branch by storage type
  if (parsed.type === "filesystem") {
    return await getAIPreviewImageFilesystem(imageUrl, parsed.path);
  } else if (parsed.type === "object-storage") {
    return await getAIPreviewImageObjectStorage(imageUrl, parsed.path);
  }
  
  throw new AIContentError(
    AIContentErrorCode.AI_IMAGE_INVALID,
    "Invalid image storage type.",
    `Unknown storage type for: ${imageUrl}`
  );
}

// Handle filesystem images (legacy)
async function getAIPreviewImageFilesystem(imageUrl: string, localPath: string): Promise<string> {
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
  const fileHash = generateFileHash(imageUrl);
  const ext = path.extname(localPath);
  const basename = path.basename(localPath, ext);
  const previewFilename = `${basename}_${fileHash}_preview.jpg`;
  
  // For filesystem images, still use object storage for previews if available
  const objectStorage = new ObjectStorageService();
  const previewObjectPath = `/objects/ai-previews/${previewFilename}`;
  
  // Check if preview already exists in object storage
  try {
    const exists = await objectStorage.objectExists(previewObjectPath);
    if (exists) {
      console.log(`[AI_PREVIEW] Using cached preview from object storage: ${previewObjectPath}`);
      return previewObjectPath;
    }
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
    let previewBuffer: Buffer;
    
    if (maxDim > AI_PREVIEW_MAX_DIMENSION) {
      previewBuffer = await image
        .resize(AI_PREVIEW_MAX_DIMENSION, AI_PREVIEW_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toBuffer();
    } else {
      // Just convert to JPEG with compression
      previewBuffer = await image
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toBuffer();
    }
    
    const previewSize = previewBuffer.length;
    
    console.log(`[AI_PREVIEW] Preview created (${(previewSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Verify preview is under limit
    if (previewSize >= MAX_OPENAI_IMAGE_SIZE_BYTES) {
      throw new AIContentError(
        AIContentErrorCode.AI_IMAGE_TOO_LARGE,
        "Your image is extremely large and cannot be processed for AI analysis. Try uploading a smaller version of your artwork.",
        `Preview still exceeds 20MB after compression: ${(previewSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
    
    // Upload to object storage
    await objectStorage.putObjectFromBuffer(previewObjectPath, previewBuffer, "image/jpeg");
    
    return previewObjectPath;
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

// Handle object storage images (new)
async function getAIPreviewImageObjectStorage(imageUrl: string, objectPath: string): Promise<string> {
  const objectStorage = new ObjectStorageService();
  
  // Check if original file exists
  try {
    const exists = await objectStorage.objectExists(objectPath);
    if (!exists) {
      throw new AIContentError(
        AIContentErrorCode.AI_IMAGE_FETCH_FAILED,
        "Image file not found. Please try uploading again.",
        `Object not found: ${objectPath}`
      );
    }
  } catch (error: any) {
    if (error instanceof AIContentError) throw error;
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_FETCH_FAILED,
      "Failed to access image. Please try uploading again.",
      `Object storage error: ${error.message}`
    );
  }
  
  // Download the image to a buffer
  let imageBuffer: Buffer;
  try {
    console.log(`[AI_PREVIEW] Reading object from storage: ${objectPath}`);
    imageBuffer = await objectStorage.readObjectAsBuffer(objectPath);
    console.log(`[AI_PREVIEW] Successfully read ${imageBuffer.length} bytes from object storage`);
  } catch (error: any) {
    console.error(`[AI_PREVIEW] Failed to read object from storage: ${error.message}`);
    throw new AIContentError(
      AIContentErrorCode.AI_IMAGE_FETCH_FAILED,
      "Failed to download image. Please try again.",
      `Download error: ${error.message}`
    );
  }
  
  const fileSize = imageBuffer.length;
  
  // If file is already under 20MB, use original
  if (fileSize < MAX_OPENAI_IMAGE_SIZE_BYTES) {
    console.log(`[AI_PREVIEW] Using original image (${(fileSize / 1024 / 1024).toFixed(2)}MB): ${imageUrl}`);
    return imageUrl;
  }
  
  // Generate preview filename
  const fileHash = generateFileHash(imageUrl);
  const ext = path.extname(objectPath);
  const basename = path.basename(objectPath, ext);
  const previewFilename = `${basename}_${fileHash}_preview.jpg`;
  const previewObjectPath = `/objects/ai-previews/${previewFilename}`;
  
  // Check if preview already exists
  try {
    const exists = await objectStorage.objectExists(previewObjectPath);
    if (exists) {
      console.log(`[AI_PREVIEW] Using cached preview: ${previewObjectPath}`);
      return previewObjectPath;
    }
  } catch (error) {
    // Preview doesn't exist, create it
  }
  
  // Create downsized JPEG preview from buffer
  try {
    console.log(`[AI_PREVIEW] Creating preview for ${basename}${ext} (original: ${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    console.log(`[AI_PREVIEW] imageBuffer type: ${typeof imageBuffer}, isBuffer: ${Buffer.isBuffer(imageBuffer)}`);
    
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    console.log(`[AI_PREVIEW] Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Resize if needed
    const maxDim = Math.max(metadata.width || 0, metadata.height || 0);
    let previewBuffer: Buffer;
    
    if (maxDim > AI_PREVIEW_MAX_DIMENSION) {
      previewBuffer = await image
        .resize(AI_PREVIEW_MAX_DIMENSION, AI_PREVIEW_MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toBuffer();
    } else {
      // Just convert to JPEG with compression
      previewBuffer = await image
        .jpeg({ quality: AI_PREVIEW_QUALITY })
        .toBuffer();
    }
    
    const previewSize = previewBuffer.length;
    
    console.log(`[AI_PREVIEW] Preview created (${(previewSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Verify preview is under limit
    if (previewSize >= MAX_OPENAI_IMAGE_SIZE_BYTES) {
      throw new AIContentError(
        AIContentErrorCode.AI_IMAGE_TOO_LARGE,
        "Your image is extremely large and cannot be processed for AI analysis. Try uploading a smaller version of your artwork.",
        `Preview still exceeds 20MB after compression: ${(previewSize / 1024 / 1024).toFixed(2)}MB`
      );
    }
    
    // Upload preview to object storage
    await objectStorage.putObjectFromBuffer(previewObjectPath, previewBuffer, "image/jpeg");
    
    return previewObjectPath;
  } catch (error: any) {
    if (error instanceof AIContentError) {
      throw error;
    }
    
    console.error(`[AI_PREVIEW] Unexpected error in getAIPreviewImageObjectStorage:`, error);
    throw new AIContentError(
      AIContentErrorCode.AI_PREVIEW_GENERATION_FAILED,
      "Failed to process your image for AI analysis. Please try a different image format.",
      `Error: ${error.message || error}`
    );
  }
}

// Clean up old preview files in object storage (optional - can be called periodically)
export async function cleanupOldPreviews(maxAgeHours: number = 24): Promise<number> {
  try {
    const objectStorage = new ObjectStorageService();
    const previewsDir = objectStorage.getAiPreviewsDir();
    
    // Note: Cleanup for object storage would require listing objects
    // which depends on the object storage implementation.
    // For now, return 0 as object storage handles its own lifecycle
    console.log(`[AI_PREVIEW] Object storage cleanup not implemented yet`);
    return 0;
  } catch (error) {
    console.error("[AI_PREVIEW] Cleanup failed:", error);
    return 0;
  }
}
