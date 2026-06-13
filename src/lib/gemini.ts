import { auth, db } from "./firebase";
import { doc, getDoc, collection, query, where, limit, getDocs } from "firebase/firestore";

export async function generateAIContent(prompt: string, image?: { data: string; mimeType: string }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required for strategic analysis.");

  // Fetch client tier and custom key overrides using standard client SDK
  let subscriptionTier = 'free';
  let geminiKey = null;

  // --- START OF OPTIMIZATION INJECTION LAYER ---
  // Normalize prompt text to create a standardized description clean match cache key
  const cleanDescription = prompt.trim().toLowerCase();

  // We only intercept if it's a pure text categorization prompt. If an image is passed (Receipt Scanning), 
  // we bypass the text lookup cache to allow full vision-based processing.
  if (!image) {
    try {
      const transactionsRef = collection(db, "users", user.uid, "transactions");
      const cacheQuery = query(
        transactionsRef,
        where("descriptionClean", "==", cleanDescription),
        limit(1)
      );

      const querySnapshot = await getDocs(cacheQuery);

      if (!querySnapshot.empty) {
        const historicalMatch = querySnapshot.docs[0].data();
        console.log("⚡ Cache Layer Hit! Bypassing Gemini API execution to preserve quota limits.");
        
        // Return a mock-up server response payload format matching exactly what data.text yields
        // so that your calling components do not experience any breakage.
        return JSON.stringify({
          category: historicalMatch.category,
          subcategory: historicalMatch.subcategory || historicalMatch.category,
          isCachedMatch: true
        });
      }
    } catch (cacheError) {
      console.warn("Local look-back validation module failure (safe fallback to live API):", cacheError);
    }
  }
  // --- END OF OPTIMIZATION INJECTION LAYER ---

  try {
    const userDocSnap = await getDoc(doc(db, "users", user.uid));
    if (userDocSnap.exists()) {
      const uData = userDocSnap.data();
      subscriptionTier = uData.subscriptionTier || 'free';
      geminiKey = uData.geminiKey || null;
    }
  } catch (error) {
    console.warn("Client-side fallback config options load failed (safe bypass):", error);
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
      prompt,
      isImage: !!image,
      image,
      subscriptionTier,
      geminiKey
    })
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = "Vantage AI is momentarily unavailable.";
    try {
      const err = JSON.parse(text);
      errorMessage = err.error || err.message || errorMessage;
    } catch (parseError) {
      console.error("Non-JSON error response from Vantage AI:", text || "Empty body");
      if (response.status === 429) {
        errorMessage = "Vantage Intelligence node is congested (429 Rate Limit). Please wait 60 seconds.";
      } else {
        errorMessage = `Strategic system error (Status ${response.status}). ${text || 'Protocol mismatch'}`;
      }
    }
    throw new Error(errorMessage);
  }

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.text;
  } catch (parseError) {
    console.error("Failed to parse AI response JSON:", text);
    throw new Error("Received malformed response from the Advisor Node.");
  }
}

export const GENERATIVE_MODEL = "gemini-1.5-flash";