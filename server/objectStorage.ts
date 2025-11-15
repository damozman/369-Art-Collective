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

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const objectName = parts.slice(1).join("/");
    
    // Try to find the file in the appropriate bucket
    // We'll infer the bucket from environment variables
    const artworkDir = this.getArtworkUploadsDir();
    const aiPreviewsDir = this.getAiPreviewsDir();
    const aiGeneratedDir = this.getAiGeneratedDir();

    // Extract bucket names
    const artworkBucket = parseObjectPath(artworkDir).bucketName;
    const previewsBucket = parseObjectPath(aiPreviewsDir).bucketName;
    const generatedBucket = parseObjectPath(aiGeneratedDir).bucketName;

    // Try each bucket
    const bucketsToTry = Array.from(new Set([artworkBucket, previewsBucket, generatedBucket]));
    
    for (const bucketName of bucketsToTry) {
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    throw new ObjectNotFoundError();
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
