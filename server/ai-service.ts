import OpenAI from "openai";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "path";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

/**
 * Generate an AI image using OpenAI's gpt-image-1 model
 * Note: gpt-image-1 returns base64 format only (response_format parameter not supported)
 */
export async function generateAiImage(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<{ imageBuffer: Buffer; costUsd: number }> {
  try {
    // Call OpenAI API
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size,
    });

    // Extract base64 image data
    if (!response.data || response.data.length === 0) {
      throw new Error("No image data returned from OpenAI");
    }
    
    const base64 = response.data[0]?.b64_json ?? "";
    if (!base64) {
      throw new Error("No image data returned from OpenAI");
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64, "base64");

    // Estimate cost based on image size
    const costUsd = estimateImageGenerationCost(size);

    return { imageBuffer, costUsd };
  } catch (error: any) {
    console.error("AI image generation error:", error);
    throw new Error(`Failed to generate AI image: ${error.message}`);
  }
}

/**
 * Save an image buffer to the uploads directory
 */
export async function saveAiImage(
  imageBuffer: Buffer,
  userId: string,
  generationType: "artist_studio" | "customer_portrait"
): Promise<string> {
  try {
    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads", "ai-generated");
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${generationType}_${userId}_${timestamp}.png`;
    const filepath = path.join(uploadsDir, filename);

    // Save the file
    await fs.writeFile(filepath, imageBuffer);

    // Return relative path for database storage
    return `/uploads/ai-generated/${filename}`;
  } catch (error: any) {
    console.error("Error saving AI image:", error);
    throw new Error(`Failed to save AI image: ${error.message}`);
  }
}

/**
 * Estimate cost per image generation based on size
 * OpenAI pricing (estimated):
 * - 1024x1024: $0.04-0.08 per image
 * - 512x512: $0.02-0.04 per image
 * - 256x256: $0.01-0.02 per image
 */
function estimateImageGenerationCost(size: string): number {
  switch (size) {
    case "1024x1024":
      return 0.06; // Mid-range estimate
    case "512x512":
      return 0.03;
    case "256x256":
      return 0.015;
    default:
      return 0.06; // Default to highest cost
  }
}

/**
 * Validate image generation prompt for safety and quality
 */
export function validatePrompt(prompt: string): { valid: boolean; error?: string } {
  // Minimum length check
  if (prompt.length < 10) {
    return { valid: false, error: "Prompt must be at least 10 characters" };
  }

  // Maximum length check
  if (prompt.length > 1000) {
    return { valid: false, error: "Prompt must be less than 1000 characters" };
  }

  // Basic content safety check (very simple - OpenAI has its own content filters)
  const blockedWords = ["explicit", "nsfw", "nude", "violent"];
  const lowerPrompt = prompt.toLowerCase();
  for (const word of blockedWords) {
    if (lowerPrompt.includes(word)) {
      return { valid: false, error: "Prompt contains inappropriate content" };
    }
  }

  return { valid: true };
}
