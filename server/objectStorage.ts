import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the artwork uploads bucket directory
  getArtworkUploadsDir(): string {
    const dir = process.env.ARTWORK_UPLOADS_DIR || "";
    if (!dir) {
      throw new Error(
        "ARTWORK_UPLOADS_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set ARTWORK_UPLOADS_DIR env var (e.g., /my-bucket/artwork-uploads)."
      );
    }
    return dir;
  }

  // Gets the AI preview uploads bucket directory
  getAiPreviewsDir(): string {
    const dir = process.env.AI_PREVIEWS_DIR || "";
    if (!dir) {
      throw new Error(
        "AI_PREVIEWS_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set AI_PREVIEWS_DIR env var (e.g., /my-bucket/ai-previews)."
      );
    }
    return dir;
  }

  // Gets the AI generated images bucket directory
  getAiGeneratedDir(): string {
    const dir = process.env.AI_GENERATED_DIR || "";
    if (!dir) {
      throw new Error(
        "AI_GENERATED_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set AI_GENERATED_DIR env var (e.g., /my-bucket/ai-generated)."
      );
    }
    return dir;
  }

  // Upload a file buffer to object storage
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
    const fullPath = `${directory}/${filename}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: contentType || "application/octet-stream",
      metadata: {
        cacheControl: "public, max-age=31536000", // 1 year cache for immutable files
      },
    });

    // Return the object path (e.g., /objects/artwork-uploads/filename.jpg)
    return `/objects/${objectName}`;
  }

  // Get a file from object storage
  async getFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    // Map /objects/* URLs to configured directory paths
    // objectPath examples: /objects/artwork-uploads/file.jpg
    // env dirs examples: /bucket-name/artwork-uploads
    
    const artworkDir = this.getArtworkUploadsDir();
    const aiPreviewsDir = this.getAiPreviewsDir();
    const aiGeneratedDir = this.getAiGeneratedDir();

    // Determine which directory this path belongs to
    let targetDir: string | null = null;
    
    if (objectPath.startsWith("/objects/artwork-uploads/")) {
      targetDir = artworkDir;
    } else if (objectPath.startsWith("/objects/ai-previews/")) {
      targetDir = aiPreviewsDir;
    } else if (objectPath.startsWith("/objects/ai-generated/")) {
      targetDir = aiGeneratedDir;
    }
    
    if (!targetDir) {
      throw new ObjectNotFoundError();
    }
    
    // Extract the filename from the object path
    // /objects/artwork-uploads/file.jpg -> file.jpg
    const pathParts = objectPath.split("/");
    const filename = pathParts.slice(3).join("/"); // Skip '', 'objects', 'directory-name'
    
    // Construct full path: /bucket-name/directory-name/filename
    const fullPath = `${targetDir}/${filename}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    
    return file;
  }

  // Downloads an object to the response
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 31536000) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();

      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
        "Access-Control-Allow-Origin": "*",
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  /**
   * Read an object as a Buffer
   * @param objectPath - URL path like "/objects/artwork-uploads/file.jpg"
   */
  async readObjectAsBuffer(objectPath: string): Promise<Buffer> {
    const file = await this.getFile(objectPath);
    const chunks: Buffer[] = [];
    
    const stream = file.createReadStream();
    
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Write a Buffer to object storage (with security validation)
   * @param objectPath - URL path like "/objects/ai-previews/file.jpg"
   * @param buffer - File buffer
   * @param contentType - MIME type
   */
  async putObjectFromBuffer(
    objectPath: string,
    buffer: Buffer,
    contentType: string
  ): Promise<void> {
    // Validate path starts with /objects/
    if (!objectPath.startsWith('/objects/')) {
      throw new Error('Invalid object path: must start with /objects/');
    }
    
    // Validate path is within allowed URL directories
    const allowedUrlPrefixes = [
      '/objects/artwork-uploads/',
      '/objects/ai-generated/',
      '/objects/ai-previews/',
    ];
    
    const isAllowed = allowedUrlPrefixes.some(prefix => objectPath.startsWith(prefix));
    
    if (!isAllowed) {
      throw new Error(`Security: Upload path must be within allowed directories (artwork-uploads, ai-generated, or ai-previews)`);
    }
    
    // Parse and upload
    const { bucketName, objectName } = parseObjectPath(objectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(buffer, {
      contentType,
      metadata: {
        cacheControl: "public, max-age=31536000",
      },
    });
  }

  /**
   * Check if an object exists
   * @param objectPath - URL path like "/objects/artwork-uploads/file.jpg"
   */
  async objectExists(objectPath: string): Promise<boolean> {
    try {
      await this.getFile(objectPath);
      return true;
    } catch (error: any) {
      if (error.name === "ObjectNotFoundError") {
        return false;
      }
      throw error;
    }
  }

  // Check if a file exists in object storage
  async fileExists(objectPath: string): Promise<boolean> {
    try {
      await this.getFile(objectPath);
      return true;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  // Delete a file from object storage
  async deleteFile(objectPath: string): Promise<void> {
    const file = await this.getFile(objectPath);
    await file.delete();
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}
