import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry from "p-retry";

// Using Replit's AI Integrations service for OpenAI-compatible API access
// This internally uses Replit AI Integrations and charges are billed to your credits
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

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
 * Generate AI content using GPT-5 with retry logic
 */
export async function generatePromptContent(
  request: PromptGenerationRequest
): Promise<PromptGenerationResponse> {
  try {
    const { template, context } = request;
    
    // Build system prompt based on template type
    let systemPrompt = `You are a professional content creator helping busy solopreneurs create high-quality content quickly.`;
    
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
    
    // Call OpenAI with retry logic
    const response = await pRetry(
      async () => {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o", // Using gpt-4o which is widely supported and reliable
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_tokens: 2048,
          });
          
          return completion;
        } catch (error: any) {
          // Check if it's a rate limit error
          if (isRateLimitError(error)) {
            throw error; // Rethrow to trigger p-retry
          }
          // For non-rate-limit errors, don't retry - just fail fast
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
    
    const generatedContent = response.choices[0]?.message?.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;
    
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
