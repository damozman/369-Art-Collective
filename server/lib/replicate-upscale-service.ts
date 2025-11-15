import Replicate from "replicate";
import crypto from "crypto";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

const REAL_ESRGAN_MODEL = "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

// Maximum safe pixel count for Replicate GPU (based on observed limits)
const MAX_SAFE_PIXELS = 2_000_000; // 2M pixels (~1414x1414 or similar)

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

  static async createUpscaleJob(params: UpscaleParams): Promise<{ predictionId: string }> {
    // Preflight validation
    this.validateImageSize(params.width, params.height);
    
    const scale = params.scale || 4;
    
    const prediction = await replicate.predictions.create({
      version: REAL_ESRGAN_MODEL.split(':')[1],
      input: {
        image: params.imageUrl,
        scale: scale,
        face_enhance: params.face_enhance || false,
      }
    });

    return {
      predictionId: prediction.id
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
