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

/**
 * Generate marketing content for artwork using GPT-4o Vision
 * This helps artists write compelling titles, descriptions, tags, and stories by analyzing the actual image
 */
export async function generateArtworkContent(params: {
  contentType: 'title' | 'description' | 'tags' | 'artworkStory' | 'suggestedUse';
  imageUrl?: string;
  artworkTitle?: string;
  existingDescription?: string;
  style?: string;
  medium?: string;
  colors?: string;
}): Promise<{ content: string; tokensUsed: number }> {
  try {
    const { contentType, imageUrl, artworkTitle, existingDescription, style, medium, colors } = params;

    // Build context from existing information
    const context = [];
    if (artworkTitle) context.push(`Current title: "${artworkTitle}"`);
    if (existingDescription) context.push(`Current description: "${existingDescription}"`);
    if (style) context.push(`Style: ${style}`);
    if (medium) context.push(`Medium: ${medium}`);
    if (colors) context.push(`Colors: ${colors}`);

    const contextString = context.length > 0 ? `\n\nExisting context:\n${context.join('\n')}` : '';

    // Generate prompts based on content type
    let systemPrompt = "You are a professional art curator and copywriter helping artists sell their artwork online. Analyze the image carefully and write compelling, authentic, and engaging content that accurately describes what you see. Focus on the main subject, composition, colors, mood, and style.";
    let userPrompt = '';

    switch (contentType) {
      case 'title':
        userPrompt = `Analyze this artwork image carefully. Generate a compelling, SEO-friendly title that accurately describes the main subject, mood, and style. The title should be concise (3-7 words), descriptive, and evocative.${contextString}\n\nProvide ONLY the title, nothing else.`;
        break;

      case 'description':
        userPrompt = `Analyze this artwork image carefully. Write a compelling product description (2-3 sentences, 30-50 words) that accurately describes what you see: the subject, composition, colors, and mood. Focus on what makes it special and why customers would want it.${contextString}\n\nProvide ONLY the description, nothing else.`;
        break;

      case 'tags':
        userPrompt = `Analyze this artwork image carefully. Generate 5-8 relevant search tags based on what you see: the subject, style, colors, mood, and potential use cases. Separate with commas.${contextString}\n\nProvide ONLY the comma-separated tags, nothing else.`;
        break;

      case 'artworkStory':
        userPrompt = `Analyze this artwork image carefully. Write an engaging artwork story (4-6 sentences, 60-100 words) based on what you see. Describe the subject, composition, mood, and emotions it conveys. Write in a warm, personal tone.${contextString}\n\nProvide ONLY the story, nothing else.`;
        break;

      case 'suggestedUse':
        userPrompt = `Analyze this artwork image carefully. Based on the subject, style, and colors you see, suggest 2-3 ideal room placements or use cases (1 sentence, 20-30 words). Be specific about environments where it would shine.${contextString}\n\nProvide ONLY the suggested use text, nothing else.`;
        break;
    }

    // Build messages array with image support if imageUrl provided
    const messages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    if (imageUrl) {
      // Use GPT-4o Vision with image
      messages.push({
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail: "high" // Use high detail for accurate subject recognition
            }
          },
          {
            type: "text",
            text: userPrompt
          }
        ]
      });
    } else {
      // Fallback to text-only if no image provided
      messages.push({
        role: "user",
        content: userPrompt
      });
    }

    // Call GPT-4o (Vision) for content generation
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7, // Balanced creativity
      max_tokens: 200, // Enough for content but not excessive
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    if (!content) {
      throw new Error("No content generated from GPT-4o");
    }

    return { content, tokensUsed };
  } catch (error: any) {
    console.error("[ERROR][AI_CONTENT] Failed to generate content:", error.message);
    throw new Error(`Failed to generate content: ${error.message}`);
  }
}
