import { GoogleGenerativeAI } from "@google/generative-ai";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "path";

const genAI = new GoogleGenerativeAI(
  (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) as string
);

/**
 * Generate an AI image using a placeholder function
 * NOTE: Gemini does not have a dedicated image generation model like DALL-E.
 * This function is a placeholder and should be replaced with a real image generation service if needed.
 */
export async function generateAiImage(
  prompt: string,
  size: "1024x1024" | "512x512" | "256x256" = "1024x1024"
): Promise<{ imageBuffer: Buffer; costUsd: number }> {
  // Placeholder: return a static image to avoid breaking the flow
  const placeholderImagePath = path.join(process.cwd(), './client/public/placeholder.png');
  const imageBuffer = await fs.readFile(placeholderImagePath);
  const costUsd = 0; // No cost for placeholder

  return { imageBuffer, costUsd };
}

/**
 * Save an image buffer to object storage
 */
export async function saveAiImage(
  imageBuffer: Buffer,
  userId: string,
  generationType: "artist_studio" | "customer_portrait"
): Promise<string> {
  try {
    const { ObjectStorageService } = await import("./objectStorage");
    const objectStorage = new ObjectStorageService();

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${generationType}_${userId}_${timestamp}.png`;

    // Upload to object storage
    const imageUrl = await objectStorage.uploadFile({
      directory: objectStorage.getAiGeneratedDir(),
      filename,
      buffer: imageBuffer,
      contentType: "image/png",
    });

    return imageUrl;
  } catch (error: any) {
    console.error("Error saving AI image:", error);
    throw new Error(`Failed to save AI image: ${error.message}`);
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

  // Basic content safety check (very simple - Gemini has its own content filters)
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
 * Generate marketing content for artwork using Gemini 1.5 Flash
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
    
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Build context from existing information
    const context = [];
    if (artworkTitle) context.push(`Current title: "${artworkTitle}"`);
    if (existingDescription) context.push(`Current description: "${existingDescription}"`);
    if (style) context.push(`Style: ${style}`);
    if (medium) context.push(`Medium: ${medium}`);
    if (colors) context.push(`Colors: ${colors}`);

    const contextString = context.length > 0 ? `\n\nExisting context:\n${context.join('\n')}` : '';

    // Generate prompts based on content type
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

    const parts: any[] = [{text: userPrompt}];
    
    if (imageUrl) {
      const response = await fetch(imageUrl);
      const imageBuffer = await response.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      
      parts.unshift({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64
        }
      });
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    });

    const response = result.response;
    const content = response.text().trim();
    const { totalTokens } = await model.countTokens(userPrompt);
    
    if (!content) {
      throw new Error("No content generated from Gemini");
    }

    return { content, tokensUsed: totalTokens };
  } catch (error: any) {
    console.error("[ERROR][AI_CONTENT] Failed to generate content:", error.message);
    throw new Error(`Failed to generate content: ${error.message}`);
  }
}
