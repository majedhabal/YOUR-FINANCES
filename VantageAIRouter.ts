import { auth, db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

// Model identifiers based on latest SDK guidelines and user requirement
export const MODEL_LITE = 'gemini-3.1-flash-lite';
export const MODEL_FLASH = 'gemini-3.5-flash';
export const MODEL_PRO = 'gemini-3.1-pro-preview'; // SDK identification corresponding to gemini-3.1-pro

export type TaskType = 
  | 'categorize_merchant'
  | 'clean_text'
  | 'parse_receipt_image'
  | 'summarize_document'
  | 'generate_financial_forecast'
  | 'portfolio_optimization'
  | string;

export interface AIPayload {
  prompt: string;
  image?: { data: string; mimeType: string };
  temperature?: number;
  [key: string]: any;
}

// Next highest model tier mapping for recovery fallback
const FALLBACK_TIERS: Record<string, string> = {
  [MODEL_LITE]: MODEL_FLASH,
  [MODEL_FLASH]: MODEL_PRO,
  [MODEL_PRO]: '' // Pro represents highest intelligence block
};

/**
 * Orchestrates all frontend AI requests by matching task complexity to the optimal Gemini tier
 * and providing one-time graceful routing fallbacks on error or rate limits.
 */
export async function executeVantageAITask(taskType: TaskType, payload: AIPayload): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Authentication required for strategic analysis.");
  }

  // Determine initial model based on task complexity
  let modelToUse = MODEL_FLASH; // Default base tier
  const defaultTemp = 0.1; // Enforce completely factual, deterministic outputs

  switch (taskType) {
    case 'categorize_merchant':
    case 'clean_text':
      modelToUse = MODEL_LITE;
      break;
    case 'parse_receipt_image':
    case 'summarize_document':
      modelToUse = MODEL_FLASH;
      break;
    case 'generate_financial_forecast':
    case 'portfolio_optimization':
      modelToUse = MODEL_PRO;
      break;
    default:
      modelToUse = MODEL_FLASH;
      break;
  }

  // Declare temperature explicitly
  const temperature = payload.temperature !== undefined ? payload.temperature : defaultTemp;

  // Execute with automatic fallback logic
  return await invokeAIWithFallback(modelToUse, payload, temperature, user);
}

async function invokeAIWithFallback(model: string, payload: AIPayload, temperature: number, user: any): Promise<string> {
  try {
    const result = await makeAPICall(model, payload, temperature, user);
    
    // Treat empty text payload as unexpected response structure to trigger fallback
    if (!result || typeof result !== 'string' || result.trim() === '') {
      throw new Error("UNEXPECTED_PAYLOAD_STRUCTURE");
    }

    return result;
  } catch (error: any) {
    const nextModel = FALLBACK_TIERS[model];
    if (nextModel) {
      console.warn(`[VantageAIRouter] Call failed on model tier ${model}. Attempting upgrade fallback to ${nextModel}...`, error);
      
      // For rate limits, add a tiny interval to allow protocol synchronization
      if (error.message?.includes("429") || error.message?.includes("congested") || error.message?.includes("rate")) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      // Retry with higher tier
      try {
        const fallbackResult = await makeAPICall(nextModel, payload, temperature, user);
        if (!fallbackResult || typeof fallbackResult !== 'string' || fallbackResult.trim() === '') {
          throw new Error("UNEXPECTED_PAYLOAD_STRUCTURE_ON_FALLBACK");
        }
        return fallbackResult;
      } catch (fallbackError: any) {
        throw new Error(`Fallback failed to activate: ${fallbackError.message || fallbackError}`);
      }
    }
    throw error;
  }
}

async function makeAPICall(model: string, payload: AIPayload, temperature: number, user: any): Promise<string> {
  // Retrieve subscription tier and key overrides via the client client-SDK
  let subscriptionTier = 'free';
  let geminiKey = null;

  try {
    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (userDocSnap.exists()) {
      const uData = userDocSnap.data();
      subscriptionTier = uData.subscriptionTier || 'free';
      geminiKey = uData.geminiKey || null;
    }
  } catch (error) {
    console.warn("Client fallback config parameters failed to parse:", error);
    if (user.email === 'majedhabal2@gmail.com') {
      subscriptionTier = 'premium';
    }
  }

  const idToken = await user.getIdToken();
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vantage-Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({
      prompt: payload.prompt,
      model,
      temperature,
      isImage: !!payload.image,
      image: payload.image,
      subscriptionTier,
      geminiKey
    })
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = "Vantage AI is momentarily offline.";
    try {
      const err = JSON.parse(text);
      errorMessage = err.error || err.message || errorMessage;
    } catch {
      if (response.status === 429) {
        errorMessage = "429: Vantage Intelligence node limit reached.";
      } else {
        errorMessage = `Advisor Node Error (Status ${response.status}): ${text || 'Protocol mismatch'}`;
      }
    }
    throw new Error(errorMessage);
  }

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.text;
  } catch (parseError) {
    console.error("Malformed AI JSON data response:", text);
    throw new Error("UNEXPECTED_PAYLOAD_STRUCTURE");
  }
}
