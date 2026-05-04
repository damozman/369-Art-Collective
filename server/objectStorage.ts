import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Response } from "express";

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key);
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Internal handle returned by getFile — wraps bucket + path for downstream methods
interface StorageFileHandle {
  bucket: string;
  path: string;
}

export class ObjectStorageService {
  constructor() {}

  getArtworkUploadsDir(): string {
    const bucket = process.env.SUPABASE_ARTWORK_UPLOADS_BUCKET;
    if (!bucket) throw new Error("SUPABASE_ARTWORK_UPLOADS_BUCKET is not set");
    return bucket;
  }

  getAiPreviewsDir(): string {
    const bucket = process.env.SUPABASE_AI_PREVIEWS_BUCKET;
    if (!bucket) throw new Error("SUPABASE_AI_PREVIEWS_BUCKET is not set");
    return bucket;
  }

  getAiGeneratedDir(): string {
    const bucket = process.env.SUPABASE_AI_GENERATED_BUCKET;
    if (!bucket) throw new Error("SUPABASE_AI_GENERATED_BUCKET is not set");
    return bucket;
  }

  /**
   * Upload a file buffer to Supabase Storage.
   * `directory` is the bucket name (returned by getArtworkUploadsDir etc.).
   * Returns a public URL string.
   */
  async uploadFile({
    directory,
    filename,
    buffer,
    contentType,
  }: {
    directory: string;
    filename: string;
    buffer: Buffer;
    contentType?: string;
  }): Promise<string> {
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from(directory)
      .upload(filename, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = supabase.storage.from(directory).getPublicUrl(filename);
    return data.publicUrl;
  }

  /**
   * Resolve a stored URL or /objects/ path to a { bucket, path } handle.
   */
  async getFile(objectPath: string): Promise<StorageFileHandle> {
    // Support both full Supabase public URLs and legacy /objects/ paths
    const supabase = getSupabase();
    const supabaseUrl = process.env.SUPABASE_URL!;

    let bucket: string;
    let path: string;

    if (objectPath.startsWith(supabaseUrl)) {
      // e.g. https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
      const match = objectPath.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
      if (!match) throw new ObjectNotFoundError();
      bucket = match[1];
      path = match[2];
    } else if (objectPath.startsWith("/objects/")) {
      // Legacy /objects/<bucket>/<path>
      const parts = objectPath.replace("/objects/", "").split("/");
      bucket = parts[0];
      path = parts.slice(1).join("/");
    } else {
      throw new ObjectNotFoundError();
    }

    // Verify it exists
    const { data, error } = await supabase.storage.from(bucket).list(
      path.includes("/") ? path.substring(0, path.lastIndexOf("/")) : "",
      { search: path.includes("/") ? path.substring(path.lastIndexOf("/") + 1) : path }
    );

    if (error || !data || data.length === 0) throw new ObjectNotFoundError();

    return { bucket, path };
  }

  /**
   * Stream a file from Supabase Storage to an Express response.
   */
  async downloadObject(file: StorageFileHandle, res: Response, cacheTtlSec: number = 31536000) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage.from(file.bucket).download(file.path);
      if (error || !data) throw new Error(error?.message || "Download failed");

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const ext = file.path.split('.').pop()?.toLowerCase();
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
        gif: "image/gif", webp: "image/webp", pdf: "application/pdf",
      };
      const contentType = (ext && mimeMap[ext]) || "application/octet-stream";

      res.set({
        "Content-Type": contentType,
        "Content-Length": buffer.length,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
        "Access-Control-Allow-Origin": "*",
      });
      res.send(buffer);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  /**
   * Read a stored object as a Buffer.
   */
  async readObjectAsBuffer(objectPath: string): Promise<Buffer> {
    const file = await this.getFile(objectPath);
    const supabase = getSupabase();
    const { data, error } = await supabase.storage.from(file.bucket).download(file.path);
    if (error || !data) throw new Error(error?.message || "Download failed");
    return Buffer.from(await data.arrayBuffer());
  }

  /**
   * Write a Buffer to object storage.
   */
  async putObjectFromBuffer(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
    const allowedPrefixes = ["/objects/artwork-uploads/", "/objects/ai-generated/", "/objects/ai-previews/"];
    if (!allowedPrefixes.some(p => objectPath.startsWith(p))) {
      throw new Error("Security: Upload path must be within allowed directories");
    }
    const parts = objectPath.replace("/objects/", "").split("/");
    const bucket = parts[0];
    const path = parts.slice(1).join("/");

    const supabase = getSupabase();
    const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  async objectExists(objectPath: string): Promise<boolean> {
    try {
      await this.getFile(objectPath);
      return true;
    } catch (error: any) {
      if (error.name === "ObjectNotFoundError") return false;
      throw error;
    }
  }

  async fileExists(objectPath: string): Promise<boolean> {
    try {
      await this.getFile(objectPath);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return false;
      throw error;
    }
  }

  async deleteFile(objectPath: string): Promise<void> {
    const file = await this.getFile(objectPath);
    const supabase = getSupabase();
    const { error } = await supabase.storage.from(file.bucket).remove([file.path]);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
}
