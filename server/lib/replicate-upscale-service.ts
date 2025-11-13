import Replicate from "replicate";
import crypto from "crypto";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

const REAL_ESRGAN_MODEL = "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

interface UpscaleParams {
  imageUrl: string;
  scale?: number;
  face_enhance?: boolean;
}

interface UpscaleResult {
  success: boolean;
  upscaledUrl?: string;
  replicateId?: string;
  error?: string;
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

  static async upscaleImage(params: UpscaleParams): Promise<UpscaleResult> {
    try {
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
        return {
          success: false,
          error: "Replicate did not return an upscaled image URL"
        };
      }

      return {
        success: true,
        upscaledUrl,
        estimatedCostCents: this.estimateCost(scale)
      };
    } catch (error: any) {
      console.error("Replicate upscale error:", error);
      return {
        success: false,
        error: error?.message || "Failed to upscale image"
      };
    }
  }

  static async createUpscaleJob(params: UpscaleParams): Promise<{ predictionId: string }> {
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

      return {
        status,
        upscaledUrl: upscaledUrl || undefined,
        error: prediction.error ? String(prediction.error) : undefined
      };
    } catch (error: any) {
      console.error("Error checking Replicate job status:", error);
      return {
        status: 'failed',
        error: error?.message || "Failed to check job status"
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
