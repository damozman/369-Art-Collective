import { GoogleGenerativeAI } from "@google/generative-ai";
import pLimit from "p-limit";
import pRetry from "p-retry";

const genAI = new GoogleGenerativeAI(
  (process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) as string
);

// Helper function to check if error is rate limit or quota violation
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export interface PromptGenerationRequest {
  template: string;
  context: {
    businessType?: string;
    targetAudience?: string;
    tone?: string;
    quantity?: number;
    platform?: string;
    [key: string]: any;
  };
}

export interface PromptGenerationResponse {
  success: boolean;
  generatedContent: string;
  tokensUsed: number;
  error?: string;
}

/**
 * Generate AI content using Gemini 2.0 Flash with retry logic
 */
export async function generatePromptContent(
  request: PromptGenerationRequest
): Promise<PromptGenerationResponse> {
  try {
    const { template, context } = request;

    // Build system prompt based on template type
    const systemPrompt = `You are a professional content creator helping busy solopreneurs create high-quality content quickly.`;

    // Build user prompt with context
    let userPrompt = `${template}\n\nContext:\n`;

    if (context.businessType) {
      userPrompt += `- Business Type: ${context.businessType}\n`;
    }
    if (context.targetAudience) {
      userPrompt += `- Target Audience: ${context.targetAudience}\n`;
    }
    if (context.tone) {
      userPrompt += `- Tone: ${context.tone}\n`;
    }
    if (context.platform) {
      userPrompt += `- Platform: ${context.platform}\n`;
    }
    if (context.quantity) {
      userPrompt += `- Quantity: Generate ${context.quantity} variations\n`;
    }

    // Add any additional context
    Object.keys(context).forEach(key => {
      if (!['businessType', 'targetAudience', 'tone', 'platform', 'quantity'].includes(key)) {
        userPrompt += `- ${key}: ${context[key]}\n`;
      }
    });

    const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Call Gemini with retry logic
    const result = await pRetry(
      async () => {
        try {
          return await model.generateContent(combinedPrompt);
        } catch (error: any) {
          if (isRateLimitError(error)) {
            throw error; // Rethrow to trigger p-retry
          }
          throw error;
        }
      },
      {
        retries: 7,
        minTimeout: 2000,
        maxTimeout: 128000,
        factor: 2,
      }
    );

    const generatedContent = result.response.text().trim();
    const { totalTokens } = await model.countTokens(combinedPrompt);
    const tokensUsed = totalTokens || 0;

    return {
      success: true,
      generatedContent,
      tokensUsed,
    };
  } catch (error: any) {
    console.error("[CreatorStack AI] Generation failed:", error);
    return {
      success: false,
      generatedContent: "",
      tokensUsed: 0,
      error: error.message || "AI generation failed",
    };
  }
}

/**
 * Process multiple prompts concurrently with rate limiting
 */
export async function batchGeneratePrompts(
  requests: PromptGenerationRequest[]
): Promise<PromptGenerationResponse[]> {
  const limit = pLimit(2); // Process up to 2 requests concurrently

  const processingPromises = requests.map((request) =>
    limit(() => generatePromptContent(request))
  );

  return await Promise.all(processingPromises);
}
