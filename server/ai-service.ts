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
 * Generate marketing content for artwork using GPT-4o
 * This helps artists write compelling titles, descriptions, tags, and stories
 */
export async function generateArtworkContent(params: {
  contentType: 'title' | 'description' | 'tags' | 'artworkStory' | 'suggestedUse';
  artworkTitle?: string;
  existingDescription?: string;
  style?: string;
  medium?: string;
  colors?: string;
}): Promise<{ content: string; tokensUsed: number }> {
  try {
    const { contentType, artworkTitle, existingDescription, style, medium, colors } = params;

    // Build context from existing information
    const context = [];
    if (artworkTitle) context.push(`Artwork title: "${artworkTitle}"`);
    if (existingDescription) context.push(`Description: "${existingDescription}"`);
    if (style) context.push(`Style: ${style}`);
    if (medium) context.push(`Medium: ${medium}`);
    if (colors) context.push(`Colors: ${colors}`);

    const contextString = context.length > 0 ? context.join('\n') : '';

    // Generate prompts based on content type
    let systemPrompt = "You are a professional art curator and copywriter helping artists sell their artwork online. Write compelling, authentic, and engaging content that helps customers connect with the art.";
    let userPrompt = '';

    switch (contentType) {
      case 'title':
        userPrompt = `Generate a compelling, SEO-friendly title for this artwork. The title should be concise (3-7 words), descriptive, and evocative. It should capture the essence of the piece without being generic.\n\n${contextString}\n\nProvide ONLY the title, nothing else.`;
        break;

      case 'description':
        userPrompt = `Write a compelling product description for this artwork (2-3 sentences, 30-50 words). Focus on what makes it special, the emotions it evokes, and why customers would want it in their space. Be authentic and avoid marketing clichés.\n\n${contextString}\n\nProvide ONLY the description, nothing else.`;
        break;

      case 'tags':
        userPrompt = `Generate 5-8 relevant search tags for this artwork. Tags should include style, mood, color themes, and potential use cases. Separate with commas.\n\n${contextString}\n\nProvide ONLY the comma-separated tags, nothing else.`;
        break;

      case 'artworkStory':
        userPrompt = `Write an engaging artwork story (4-6 sentences, 60-100 words) that helps customers connect with the piece. Include: the inspiration behind it, the creative process, or the meaning/emotion it conveys. Write in a warm, personal tone as if the artist is speaking directly to the buyer.\n\n${contextString}\n\nProvide ONLY the story, nothing else.`;
        break;

      case 'suggestedUse':
        userPrompt = `Suggest 2-3 ideal room placements or use cases for this artwork (1 sentence, 20-30 words). Be specific about environments where it would shine (e.g., "Perfect statement piece for modern living rooms or inspiring home offices").\n\n${contextString}\n\nProvide ONLY the suggested use text, nothing else.`;
        break;
    }

    // Call GPT-4o for content generation
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
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
