import Replicate from "replicate";
import crypto from "crypto";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

const REAL_ESRGAN_MODEL = "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

// Maximum safe pixel count for Replicate GPU (increased to support larger images)
// 12M pixels allows images up to ~3464x3464px (e.g., 4000x2252 = 9M pixels, 1868x4000 = 7.4M pixels)
const MAX_SAFE_PIXELS = 12_000_000; // 12M pixels (~3464x3464 or similar)

// Target DPI and dimensions for qualifying 8+ variants
const TARGET_MIN_PIXELS_FOR_ALL_VARIANTS = 9_720_000; // ~2700x3600px minimum for 8+ variants

// Error codes for structured error handling
export enum UpscaleErrorCode {
  IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE",
  GPU_MEMORY_LIMIT = "GPU_MEMORY_LIMIT",
  PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT",
  PROVIDER_ERROR = "PROVIDER_ERROR",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  INVALID_IMAGE = "INVALID_IMAGE",
  NETWORK_ERROR = "NETWORK_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}

// Custom error class with user-friendly messages
export class UpscaleError extends Error {
  constructor(
    public code: UpscaleErrorCode,
    public userMessage: string,
    public developerMessage: string
  ) {
    super(developerMessage);
    this.name = "UpscaleError";
  }
}

interface UpscaleParams {
  imageUrl: string;
  scale?: number;
  face_enhance?: boolean;
  width?: number;
  height?: number;
}

interface UpscaleResult {
  success: boolean;
  upscaledUrl?: string;
  replicateId?: string;
  error?: string;
  errorCode?: UpscaleErrorCode;
  userMessage?: string;
  originalWidth?: number;
  originalHeight?: number;
  upscaledWidth?: number;
  upscaledHeight?: number;
  estimatedCostCents?: number;
}

export class ReplicateUpscaleService {
  
  static calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Preflight validation before upscaling
  static validateImageSize(width?: number, height?: number): void {
    if (!width || !height) return; // Skip validation if dimensions not provided

    const totalPixels = width * height;
    
    if (totalPixels > MAX_SAFE_PIXELS) {
      throw new UpscaleError(
        UpscaleErrorCode.IMAGE_TOO_LARGE,
        `Your image is too large to upscale (${width}×${height}px). Images larger than ${Math.floor(Math.sqrt(MAX_SAFE_PIXELS))}×${Math.floor(Math.sqrt(MAX_SAFE_PIXELS))}px cannot be processed. Try uploading a higher-resolution original instead of upscaling.`,
        `Image dimensions ${width}×${height} exceed max safe pixels ${MAX_SAFE_PIXELS}`
      );
    }
  }

  /**
   * Calculate intelligent upscale factor based on current dimensions and target
   * Returns the minimum scale needed to qualify for 8+ variants
   */
  static calculateOptimalScale(width: number, height: number): number {
    const currentPixels = width * height;
    
    // If already meets target, use scale 2 for minimal processing
    if (currentPixels >= TARGET_MIN_PIXELS_FOR_ALL_VARIANTS) {
      return 2;
    }
    
    // Calculate scale needed to reach target
    const requiredScale = Math.sqrt(TARGET_MIN_PIXELS_FOR_ALL_VARIANTS / currentPixels);
    
    // Round up to nearest valid scale (2 or 4)
    if (requiredScale <= 2) {
      return 2;
    } else {
      return 4;
    }
  }

  /**
   * Check if image already meets print quality standards
   * Returns true if image qualifies for 8+ variants without upscaling
   */
  static isAlreadyHighQuality(width: number, height: number): boolean {
    const totalPixels = width * height;
    return totalPixels >= TARGET_MIN_PIXELS_FOR_ALL_VARIANTS;
  }

  // Transform Replicate errors into user-friendly messages
  static translateReplicateError(error: any): UpscaleError {
    const errorMessage = error?.message || String(error);
    
    // GPU memory errors
    if (errorMessage.includes('GPU memory') || errorMessage.includes('max size that fits in GPU')) {
      return new UpscaleError(
        UpscaleErrorCode.GPU_MEMORY_LIMIT,
        "Your image is too large to upscale with AI. Try uploading a higher-resolution original instead, or use a smaller image.",
        errorMessage
      );
    }
    
    // Timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return new UpscaleError(
        UpscaleErrorCode.PROVIDER_TIMEOUT,
        "The AI upscaling service took too long to respond. Please try again in a moment.",
        errorMessage
      );
    }
    
    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
      return new UpscaleError(
        UpscaleErrorCode.NETWORK_ERROR,
        "Could not connect to the AI upscaling service. Please check your connection and try again.",
        errorMessage
      );
    }
    
    // Invalid image errors
    if (errorMessage.includes('invalid') || errorMessage.includes('could not decode')) {
      return new UpscaleError(
        UpscaleErrorCode.INVALID_IMAGE,
        "Your image file appears to be corrupted or in an unsupported format. Please try a different image.",
        errorMessage
      );
    }
    
    // Generic provider error
    return new UpscaleError(
      UpscaleErrorCode.PROVIDER_ERROR,
      "The AI upscaling service encountered an error. Please try again or upload a different image.",
      errorMessage
    );
  }

  static async upscaleImage(params: UpscaleParams): Promise<UpscaleResult> {
    try {
      // Preflight validation
      this.validateImageSize(params.width, params.height);
      
      const scale = params.scale || 4;
      
      // First attempt with requested scale
      try {
        const output = await replicate.run(REAL_ESRGAN_MODEL, {
          input: {
            image: params.imageUrl,
            scale: scale,
            face_enhance: params.face_enhance || false,
          }
        }) as any;

        const upscaledUrl = typeof output === 'string' ? output : output?.url || output?.[0];
        
        if (!upscaledUrl) {
          const error = new UpscaleError(
            UpscaleErrorCode.PROVIDER_ERROR,
            "The AI service did not return an upscaled image. Please try again.",
            "Replicate did not return an upscaled image URL"
          );
          return {
            success: false,
            error: error.developerMessage,
            errorCode: error.code,
            userMessage: error.userMessage
          };
        }

        return {
          success: true,
          upscaledUrl,
          estimatedCostCents: this.estimateCost(scale)
        };
      } catch (firstError: any) {
        // Check if it's a GPU memory error and we can retry with smaller scale
        const errorMessage = firstError?.message || String(firstError);
        const isGpuMemoryError = errorMessage.includes('GPU memory') || 
                                 errorMessage.includes('max size that fits in GPU') ||
                                 errorMessage.includes('CUDA out of memory');
        
        if (isGpuMemoryError && scale === 4) {
          console.log(`GPU memory error with scale 4, retrying with scale 2...`);
          
          // Retry with scale 2
          const output = await replicate.run(REAL_ESRGAN_MODEL, {
            input: {
              image: params.imageUrl,
              scale: 2,
              face_enhance: params.face_enhance || false,
            }
          }) as any;

          const upscaledUrl = typeof output === 'string' ? output : output?.url || output?.[0];
          
          if (!upscaledUrl) {
            const error = new UpscaleError(
              UpscaleErrorCode.PROVIDER_ERROR,
              "The AI service did not return an upscaled image after retry. Please try again.",
              "Replicate did not return an upscaled image URL after fallback"
            );
            return {
              success: false,
              error: error.developerMessage,
              errorCode: error.code,
              userMessage: error.userMessage
            };
          }

          return {
            success: true,
            upscaledUrl,
            estimatedCostCents: this.estimateCost(2)
          };
        }
        
        // If not a GPU error or already at scale 2, re-throw
        throw firstError;
      }
    } catch (error: any) {
      console.error("Replicate upscale error:", error);
      
      // Transform error into user-friendly message
      const upscaleError = error instanceof UpscaleError 
        ? error 
        : this.translateReplicateError(error);
      
      return {
        success: false,
        error: upscaleError.developerMessage,
        errorCode: upscaleError.code,
        userMessage: upscaleError.userMessage
      };
    }
  }

  static async createUpscaleJob(params: UpscaleParams): Promise<{ predictionId: string; scale: number }> {
    // Preflight validation - only check INPUT size, not output
    this.validateImageSize(params.width, params.height);
    
    // Use intelligent scale calculation if dimensions provided
    const scale = params.width && params.height 
      ? this.calculateOptimalScale(params.width, params.height)
      : (params.scale || 4);
    
    console.log(`Creating upscale job with scale ${scale} for ${params.width}×${params.height}px image`);
    
    const prediction = await replicate.predictions.create({
      version: REAL_ESRGAN_MODEL.split(':')[1],
      input: {
        image: params.imageUrl,
        scale: scale,
        face_enhance: params.face_enhance || false,
      }
    });

    return {
      predictionId: prediction.id,
      scale
    };
  }

  static async getJobStatus(predictionId: string): Promise<{
    status: 'queued' | 'processing' | 'completed' | 'failed';
    upscaledUrl?: string;
    error?: string;
    errorCode?: UpscaleErrorCode;
    userMessage?: string;
  }> {
    try {
      const prediction = await replicate.predictions.get(predictionId);
      
      let status: 'queued' | 'processing' | 'completed' | 'failed' = 'queued';
      
      if (prediction.status === 'succeeded') {
        status = 'completed';
      } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
        status = 'failed';
      } else if (prediction.status === 'processing' || prediction.status === 'starting') {
        status = 'processing';
      }

      const output = prediction.output;
      const upscaledUrl = typeof output === 'string' ? output : output?.[0];

      // Transform Replicate errors to user-friendly messages
      let errorCode: UpscaleErrorCode | undefined;
      let userMessage: string | undefined;
      let errorString: string | undefined;
      
      if (prediction.error) {
        const rawError = String(prediction.error);
        const upscaleError = this.translateReplicateError({ message: rawError });
        errorCode = upscaleError.code;
        userMessage = upscaleError.userMessage;
        errorString = rawError;
      }

      return {
        status,
        upscaledUrl: upscaledUrl || undefined,
        error: errorString,
        errorCode,
        userMessage
      };
    } catch (error: any) {
      console.error("Error checking Replicate job status:", error);
      const upscaleError = this.translateReplicateError(error);
      return {
        status: 'failed',
        error: upscaleError.developerMessage,
        errorCode: upscaleError.code,
        userMessage: upscaleError.userMessage
      };
    }
  }

  static estimateCost(scale: number): number {
    if (scale === 2) return 2;
    if (scale === 4) return 3;
    return 5;
  }

  /**
   * Download upscaled image from Replicate URL and save to object storage
   * Returns permanent object storage URL
   * 
   * IMPORTANT: Compresses images to JPEG to stay under Shopify's 20MB limit
   * while maintaining print quality (90% quality, 4096px width preserved)
   */
  static async saveUpscaledImageToStorage(
    replicateUrl: string, 
    artistId: string, 
    originalFileHash: string
  ): Promise<string> {
    try {
      // Download image from Replicate
      const response = await fetch(replicateUrl);
      if (!response.ok) {
        throw new Error(`Failed to download upscaled image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      
      const originalSizeMB = buffer.length / (1024 * 1024);
      console.log(`[IMAGE_COMPRESSION] Original upscaled image size: ${originalSizeMB.toFixed(2)}MB`);

      // Compress to JPEG if over 15MB to ensure under Shopify's 20MB limit
      if (originalSizeMB > 15) {
        const sharp = (await import('sharp')).default;
        buffer = await sharp(buffer)
          .jpeg({ quality: 90 }) // High quality for print
          .toBuffer();
        
        const compressedSizeMB = buffer.length / (1024 * 1024);
        console.log(`[IMAGE_COMPRESSION] Compressed to JPEG: ${compressedSizeMB.toFixed(2)}MB (${((1 - compressedSizeMB/originalSizeMB) * 100).toFixed(1)}% reduction)`);
      }

      // Import object storage service
      const { ObjectStorageService } = await import('../objectStorage');
      const objectStorage = new ObjectStorageService();

      // Generate unique filename with timestamp and hash
      const timestamp = Date.now();
      const filename = originalSizeMB > 15 
        ? `upscaled_${artistId}_${originalFileHash}_${timestamp}.jpg`
        : `upscaled_${artistId}_${originalFileHash}_${timestamp}.png`;
      
      const contentType = originalSizeMB > 15 ? 'image/jpeg' : 'image/png';

      // Upload to object storage (AI generated directory for upscaled images)
      const objectStorageUrl = await objectStorage.uploadFile({
        directory: objectStorage.getAiGeneratedDir(),
        filename,
        buffer,
        contentType,
      });

      console.log(`✅ Upscaled image saved to object storage: ${objectStorageUrl}`);
      return objectStorageUrl;
    } catch (error: any) {
      console.error('Error saving upscaled image to object storage:', error);
      throw new UpscaleError(
        UpscaleErrorCode.NETWORK_ERROR,
        'Failed to save upscaled image. Please try again.',
        error.message
      );
    }
  }

  static async getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
    try {
      const https = await import('https');
      const http = await import('http');
      
      return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        client.get(url, (response) => {
          const chunks: Buffer[] = [];
          let bytesRead = 0;
          const maxBytes = 24 * 1024;
          
          response.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
            bytesRead += chunk.length;
            
            if (bytesRead >= maxBytes) {
              response.destroy();
            }
          });
          
          response.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const dimensions = this.parseDimensionsFromBuffer(buffer);
            resolve(dimensions);
          });
          
          response.on('error', reject);
        }).on('error', reject);
      });
    } catch (error) {
      console.error("Error getting image dimensions:", error);
      return null;
    }
  }

  private static parseDimensionsFromBuffer(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24) return null;

    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xFF) break;
        
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    return null;
  }
}
