/**
 * Upscale service — Sharp-based (libvips lanczos3), no external API required.
 * Replaces the previous Replicate/Real-ESRGAN implementation with the same
 * public interface so routes.ts needs no changes.
 */
import crypto from "crypto";
import sharp from "sharp";

// Target pixel count to qualify for all 12 print variants (24×36" @ 150 DPI)
const TARGET_MIN_PIXELS_FOR_ALL_VARIANTS = 19_440_000;
const MAX_SAFE_PIXELS = 5_000_000;
const MAX_OUTPUT_PIXELS = 30_000_000;

// ─── Error types (unchanged interface) ──────────────────────────────────────

export enum UpscaleErrorCode {
  IMAGE_TOO_LARGE  = "IMAGE_TOO_LARGE",
  GPU_MEMORY_LIMIT = "GPU_MEMORY_LIMIT",
  PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT",
  PROVIDER_ERROR   = "PROVIDER_ERROR",
  QUOTA_EXCEEDED   = "QUOTA_EXCEEDED",
  INVALID_IMAGE    = "INVALID_IMAGE",
  NETWORK_ERROR    = "NETWORK_ERROR",
  UNKNOWN_ERROR    = "UNKNOWN_ERROR",
}

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

// ─── In-memory job store for async polling pattern ──────────────────────────

interface Job {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  upscaledUrl?: string;
  error?: string;
  errorCode?: UpscaleErrorCode;
  userMessage?: string;
}

const jobStore = new Map<string, Job>();

// ─── Service ────────────────────────────────────────────────────────────────

export class ReplicateUpscaleService {

  static calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static validateImageSize(width?: number, height?: number): void {
    if (!width || !height) return;
    const totalPixels = width * height;
    if (totalPixels > MAX_SAFE_PIXELS) {
      const dpiAt24x36 = Math.sqrt(totalPixels / (24 * 36));
      throw new UpscaleError(
        UpscaleErrorCode.IMAGE_TOO_LARGE,
        `Your image (${width}×${height}px, ~${Math.round(dpiAt24x36)} DPI at 24×36") is already high quality and doesn't need upscaling. Click "Next Step" to continue.`,
        `Image ${width}×${height} (${totalPixels.toLocaleString()} px) exceeds safe limit`
      );
    }
  }

  static calculateOptimalScale(width: number, height: number): 2 | 3 | 4 | null {
    const currentPixels = width * height;
    const ratio = width / height;
    const orientation = Math.abs(ratio - 1) < 0.1 ? 'square'
      : width > height ? 'landscape'
      : 'portrait';

    if (currentPixels >= TARGET_MIN_PIXELS_FOR_ALL_VARIANTS) return 2;

    const requiredScale = Math.sqrt(TARGET_MIN_PIXELS_FOR_ALL_VARIANTS / currentPixels);

    let maxScale = 4;
    if (orientation === 'landscape') {
      maxScale = currentPixels * 4 <= MAX_OUTPUT_PIXELS ? 2 : 0;
    } else if (orientation === 'square') {
      if      (currentPixels * 9  <= MAX_OUTPUT_PIXELS) maxScale = 3;
      else if (currentPixels * 4  <= MAX_OUTPUT_PIXELS) maxScale = 2;
      else maxScale = 0;
    } else {
      if      (currentPixels * 16 <= MAX_OUTPUT_PIXELS) maxScale = 4;
      else if (currentPixels * 9  <= MAX_OUTPUT_PIXELS) maxScale = 3;
      else if (currentPixels * 4  <= MAX_OUTPUT_PIXELS) maxScale = 2;
      else maxScale = 0;
    }

    const finalScale = Math.min(Math.ceil(requiredScale), maxScale);
    console.log(`[SCALE_CALC] ${width}×${height}px ${orientation}: required=${requiredScale.toFixed(2)}, final=${finalScale}`);

    if (finalScale >= 2 && finalScale <= 4) return finalScale as 2 | 3 | 4;
    return null;
  }

  static isAlreadyHighQuality(width: number, height: number): boolean {
    return width * height >= TARGET_MIN_PIXELS_FOR_ALL_VARIANTS;
  }

  // ── Core upscale using Sharp (lanczos3) ──────────────────────────────────

  private static async upscaleBuffer(
    buffer: Buffer,
    scale: number
  ): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const w = (meta.width  || 1000) * scale;
    const h = (meta.height || 1000) * scale;

    return sharp(buffer)
      .resize(w, h, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
      .png({ compressionLevel: 6 })
      .toBuffer();
  }

  private static async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // ── upscaleImage (synchronous path used by some routes) ─────────────────

  static async upscaleImage(params: UpscaleParams): Promise<UpscaleResult> {
    try {
      this.validateImageSize(params.width, params.height);
      const scale = params.scale || 4;

      const inputBuffer = await this.fetchBuffer(params.imageUrl);
      const upscaledBuffer = await this.upscaleBuffer(inputBuffer, scale);

      // Save to storage and return permanent URL
      const { ObjectStorageService } = await import('../objectStorage');
      const objectStorage = new ObjectStorageService();
      const filename = `upscaled_${Date.now()}.png`;
      const upscaledUrl = await objectStorage.uploadFile({
        directory: objectStorage.getAiGeneratedDir(),
        filename,
        buffer: upscaledBuffer,
        contentType: 'image/png',
      });

      return {
        success: true,
        upscaledUrl,
        estimatedCostCents: 0,
      };
    } catch (error: any) {
      console.error("Sharp upscale error:", error);
      const upscaleError = error instanceof UpscaleError ? error : new UpscaleError(
        UpscaleErrorCode.PROVIDER_ERROR,
        "Upscaling failed. Please try again or upload a higher-resolution image.",
        error.message
      );
      return {
        success: false,
        error: upscaleError.developerMessage,
        errorCode: upscaleError.code,
        userMessage: upscaleError.userMessage,
      };
    }
  }

  // ── createUpscaleJob (async job pattern) ────────────────────────────────

  static async createUpscaleJob(
    params: UpscaleParams
  ): Promise<{ predictionId: string; scale: number }> {
    if (!params.width || !params.height) {
      throw new UpscaleError(
        UpscaleErrorCode.INVALID_IMAGE,
        "Cannot upscale image: dimensions are required. Please try uploading again.",
        `Missing dimensions: width=${params.width}, height=${params.height}`
      );
    }

    const scale = this.calculateOptimalScale(params.width, params.height);
    if (scale === null) {
      const px = params.width * params.height;
      const orientation = params.width > params.height ? 'landscape' : 'portrait';
      throw new UpscaleError(
        UpscaleErrorCode.IMAGE_TOO_LARGE,
        orientation === 'landscape'
          ? "Your landscape image is already at optimal quality. Try cropping to portrait to unlock all 12 product sizes."
          : px > 18_000_000
            ? "Great news! Your image is already at maximum resolution. Click 'Next Step' to continue."
            : "Your image is already high quality and doesn't need upscaling.",
        `calculateOptimalScale returned null for ${params.width}×${params.height}`
      );
    }

    const predictionId = crypto.randomUUID();
    jobStore.set(predictionId, { status: 'queued' });

    console.log(`[UPSCALE_JOB] Starting Sharp ${scale}x upscale (job ${predictionId}) for ${params.width}×${params.height}px`);

    // Run upscale in background — do NOT await here
    (async () => {
      jobStore.set(predictionId, { status: 'processing' });
      try {
        const inputBuffer = await this.fetchBuffer(params.imageUrl);
        const upscaledBuffer = await this.upscaleBuffer(inputBuffer, scale);

        // Compress if over 15 MB to stay under Shopify limits
        let finalBuffer = upscaledBuffer;
        let contentType = 'image/png';
        if (upscaledBuffer.length > 15 * 1024 * 1024) {
          finalBuffer = await sharp(upscaledBuffer).jpeg({ quality: 90 }).toBuffer();
          contentType = 'image/jpeg';
        }

        const { ObjectStorageService } = await import('../objectStorage');
        const objectStorage = new ObjectStorageService();
        const ext = contentType === 'image/jpeg' ? 'jpg' : 'png';
        const filename = `upscaled_${predictionId}.${ext}`;
        const upscaledUrl = await objectStorage.uploadFile({
          directory: objectStorage.getAiGeneratedDir(),
          filename,
          buffer: finalBuffer,
          contentType,
        });

        console.log(`[UPSCALE_JOB] Completed job ${predictionId} → ${upscaledUrl}`);
        jobStore.set(predictionId, { status: 'completed', upscaledUrl });
      } catch (err: any) {
        console.error(`[UPSCALE_JOB] Failed job ${predictionId}:`, err.message);
        jobStore.set(predictionId, {
          status: 'failed',
          error: err.message,
          errorCode: UpscaleErrorCode.PROVIDER_ERROR,
          userMessage: "Upscaling failed. Please try again or upload a higher-resolution image.",
        });
      }
    })();

    return { predictionId, scale };
  }

  // ── getJobStatus ─────────────────────────────────────────────────────────

  static async getJobStatus(predictionId: string): Promise<{
    status: 'queued' | 'processing' | 'completed' | 'failed';
    upscaledUrl?: string;
    error?: string;
    errorCode?: UpscaleErrorCode;
    userMessage?: string;
  }> {
    const job = jobStore.get(predictionId);
    if (!job) {
      return {
        status: 'failed',
        error: 'Job not found',
        errorCode: UpscaleErrorCode.UNKNOWN_ERROR,
        userMessage: 'Upscale job not found. Please try again.',
      };
    }
    return job;
  }

  // ── saveUpscaledImageToStorage (called after job completes) ─────────────
  // The URL is already a permanent storage URL from createUpscaleJob,
  // so we just return it as-is.

  static async saveUpscaledImageToStorage(
    upscaledUrl: string,
    _artistId: string,
    _originalFileHash: string
  ): Promise<string> {
    return upscaledUrl;
  }

  static estimateCost(_scale: number): number {
    return 0; // Local processing — no cost
  }

  // ── Dimension helpers ────────────────────────────────────────────────────

  static async getImageDimensions(url: string): Promise<{ width: number; height: number } | null> {
    try {
      const buffer = await this.fetchBuffer(url);
      const meta = await sharp(buffer).metadata();
      if (meta.width && meta.height) return { width: meta.width, height: meta.height };
      return null;
    } catch {
      return null;
    }
  }

  // Kept for interface compatibility — Sharp handles all formats natively
  private static parseDimensionsFromBuffer(_buffer: Buffer): { width: number; height: number } | null {
    return null;
  }

  static translateReplicateError(error: any): UpscaleError {
    return new UpscaleError(
      UpscaleErrorCode.PROVIDER_ERROR,
      "Upscaling failed. Please try again.",
      error?.message || String(error)
    );
  }
}
