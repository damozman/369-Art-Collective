import Replicate from "replicate";
import crypto from "crypto";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

const REAL_ESRGAN_MODEL = "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

// Maximum safe pixel count for Replicate GPU (increased to support larger images)
// 12M pixels allows images up to ~3464x3464px (e.g., 4000x2252 = 9M pixels, 1868x4000 = 7.4M pixels)
const MAX_SAFE_PIXELS = 12_000_000; // 12M pixels (~3464x3464 or similar)

// Target DPI and dimensions for qualifying all 12 variants (24×36" at 150 DPI)
const TARGET_MIN_PIXELS_FOR_ALL_VARIANTS = 19_440_000; // ~3600x5400px minimum for all 12 variants

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
   * Calculate intelligent upscale factor based on current dimensions, orientation, and target
   * Returns the minimum scale needed to qualify for all 12 variants while preventing GPU memory errors
   * Returns null if the image is already at maximum safe resolution and cannot be upscaled
   */
  static calculateOptimalScale(width: number, height: number): 2 | 3 | 4 | null {
    const currentPixels = width * height;
    const MAX_OUTPUT_PIXELS = 32_000_000; // 32M pixels max to prevent GPU crashes
    
    // Detect orientation
    const ratio = width / height;
    const orientation = Math.abs(ratio - 1) < 0.1 ? 'square' 
      : width > height ? 'landscape' 
      : 'portrait';
    
    // If already meets target, use scale 2 for minimal processing
    if (currentPixels >= TARGET_MIN_PIXELS_FOR_ALL_VARIANTS) {
      return 2;
    }
    
    // Calculate scale needed to reach target
    const requiredScale = Math.sqrt(TARGET_MIN_PIXELS_FOR_ALL_VARIANTS / currentPixels);
    
    // Calculate maximum safe scale to prevent GPU memory errors
    const maxSafeScale = Math.sqrt(MAX_OUTPUT_PIXELS / currentPixels);
    
    // Apply orientation-specific limits
    let maxScale = 4;
    if (orientation === 'landscape') {
      // Landscape creates massive outputs, cap at scale 2
      maxScale = Math.min(2, Math.floor(maxSafeScale));
      console.log(`[SCALE_CALC] Landscape detected: capping at scale ${maxScale}`);
    } else if (orientation === 'square') {
      // Square can handle scale 3
      maxScale = Math.min(3, Math.floor(maxSafeScale));
    } else {
      // Portrait can handle scale 4
      maxScale = Math.min(4, Math.floor(maxSafeScale));
    }
    
    // Choose minimum of required scale and max safe scale
    const targetScale = Math.ceil(requiredScale);
    const finalScale = Math.min(targetScale, maxScale);
    
    console.log(`[SCALE_CALC] ${width}×${height}px ${orientation}: required=${requiredScale.toFixed(2)}, max_safe=${maxSafeScale.toFixed(2)}, final=${finalScale}`);
    
    // If finalScale is 1 or less, the image cannot be safely upscaled
    // Real-ESRGAN doesn't support 1x, so return null
    if (finalScale <= 1) {
      console.log(`[SCALE_CALC] Image ${width}×${height} cannot be safely upscaled: finalScale=${finalScale}`);
      return null;
    }
    
    // Return the computed finalScale (already constrained by GPU limits and orientation)
    // Valid Real-ESRGAN scales: 2, 3, or 4
    if (finalScale >= 2 && finalScale <= 4) {
      return finalScale as 2 | 3 | 4;
    }
    
    // Should never reach here due to checks above
    return null;
  }

  /**
   * Check if image already meets print quality standards
   * Returns true if image qualifies for all 12 variants without upscaling
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
        
        if (isGpuMemoryError) {
          // Try fallback strategies based on current scale
          if (scale === 4) {
            console.log(`GPU memory error with scale 4, retrying with scale 2...`);
            
            try {
              const output = await replicate.run(REAL_ESRGAN_MODEL, {
                input: {
                  image: params.imageUrl,
                  scale: 2,
                  face_enhance: params.face_enhance || false,
                }
              }) as any;

              const upscaledUrl = typeof output === 'string' ? output : output?.url || output?.[0];
              
              if (!upscaledUrl) {
                throw new Error("No upscaled URL returned after fallback");
              }

              console.log(`✅ Fallback successful: 4x→2x upscale completed`);
              return {
                success: true,
                upscaledUrl,
                estimatedCostCents: this.estimateCost(2)
              };
            } catch (fallbackError) {
              console.error(`Fallback from 4x to 2x also failed:`, fallbackError);
              // Continue to error handling below
            }
          } else if (scale === 3) {
            console.log(`GPU memory error with scale 3, retrying with scale 2...`);
            
            try {
              const output = await replicate.run(REAL_ESRGAN_MODEL, {
                input: {
                  image: params.imageUrl,
                  scale: 2,
                  face_enhance: params.face_enhance || false,
                }
              }) as any;

              const upscaledUrl = typeof output === 'string' ? output : output?.url || output?.[0];
              
              if (!upscaledUrl) {
                throw new Error("No upscaled URL returned after fallback");
              }

              console.log(`✅ Fallback successful: 3x→2x upscale completed`);
              return {
                success: true,
                upscaledUrl,
                estimatedCostCents: this.estimateCost(2)
              };
            } catch (fallbackError) {
              console.error(`Fallback from 3x to 2x also failed:`, fallbackError);
              // Continue to error handling below
            }
          }
          
          // If scale was already 2, or all fallbacks failed, provide helpful error
          console.log(`GPU memory limit reached for ${params.width}×${params.height} at scale ${scale}`);
          
          // Calculate current quality info for better error message (if dimensions available)
          let userMessage = "Your image is too large to upscale with AI due to GPU memory constraints.";
          
          if (params.width && params.height) {
            const { DpiValidatorService } = await import('./dpi-validator-service');
            const currentAnalysis = DpiValidatorService.analyzePrintQuality(params.width, params.height);
            
            if (currentAnalysis.variantQualification.totalQualified >= 4) {
              userMessage += ` Good news: Your current image already qualifies for ${currentAnalysis.variantQualification.totalQualified} of 12 product sizes! You can proceed with uploading, or try uploading a higher-resolution original image for even more options.`;
            } else if (currentAnalysis.meetsMinimum) {
              userMessage += ` Your current image qualifies for ${currentAnalysis.variantQualification.totalQualified} product sizes. To unlock more sizes, try uploading a higher-resolution original image instead.`;
            } else {
              userMessage += " Try uploading a smaller image or a higher-resolution original.";
            }
          }
          
          throw new UpscaleError(
            UpscaleErrorCode.GPU_MEMORY_LIMIT,
            userMessage,
            `GPU memory limit for ${params.width}×${params.height} at scale ${scale}`
          );
        }
        
        // If not a GPU error, re-throw
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
    // CRITICAL: Width and height are REQUIRED for safe upscaling
    // Without dimensions, we cannot calculate safe scale and must reject the request
    if (!params.width || !params.height) {
      throw new UpscaleError(
        UpscaleErrorCode.INVALID_IMAGE,
        "Cannot upscale image: dimensions are required. Please try uploading your image again.",
        `Missing required dimensions: width=${params.width}, height=${params.height}`
      );
    }
    
    // Preflight validation - only check INPUT size, not output
    this.validateImageSize(params.width, params.height);
    
    // Calculate optimal scale based on dimensions and orientation
    console.log(`[UPSCALE_JOB] Calculating optimal scale for ${params.width}×${params.height}px image`);
    const calculatedScale = this.calculateOptimalScale(params.width, params.height);
    console.log(`[UPSCALE_JOB] Calculated scale result: ${calculatedScale}`);
    
    if (calculatedScale === null) {
      // Image cannot be safely upscaled - this should be rare
      const currentPixels = params.width * params.height;
      const orientation = params.width > params.height ? 'landscape' : (params.width < params.height ? 'portrait' : 'square');
      
      console.error(`[UPSCALE_ERROR] calculateOptimalScale returned null for ${params.width}×${params.height} (${currentPixels.toLocaleString()} pixels, ${orientation})`);
      
      // Provide more helpful error message based on orientation
      let userMessage = "Your image cannot be upscaled due to GPU memory constraints.";
      if (orientation === 'landscape' && currentPixels > 10_000_000) {
        userMessage = "Your wide landscape image is too large to upscale safely. Try cropping to portrait orientation or uploading a smaller image.";
      } else if (currentPixels > 18_000_000) {
        userMessage = "Your image is already at maximum resolution for AI upscaling. No upscaling needed!";
      }
      
      throw new UpscaleError(
        UpscaleErrorCode.IMAGE_TOO_LARGE,
        userMessage,
        `Image ${params.width}×${params.height} (${currentPixels.toLocaleString()} pixels, ${orientation}) cannot be safely upscaled - calculateOptimalScale returned null`
      );
    }
    
    const scale = calculatedScale;
    
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
