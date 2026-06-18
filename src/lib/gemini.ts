import { auth, db } from "./firebase";
import { doc, getDoc, collection, query, where, limit, getDocs, writeBatch } from "firebase/firestore";

export async function generateAIContent(prompt: string, image?: { data: string; mimeType: string }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required for strategic analysis.");

  let subscriptionTier = 'free';
  let geminiKey = null;
  const cleanDescription = prompt.trim().toLowerCase();

  if (!image) {
    try {
      const transactionsRef = collection(db, "users", user.uid, "transactions");
      const cacheQuery = query(
        transactionsRef,
        where("descriptionClean", "==", cleanDescription), // Safe query expression string normalization fix
        limit(1)
      );
      const querySnapshot = await getDocs(cacheQuery);
      if (!querySnapshot.empty) {
        const historicalMatch = querySnapshot.docs[0].data();
        return historicalMatch.aiResponseText || "Analysis matches historical profiles.";
      }
    } catch (error) {
      console.warn("Background cache check safely bypassed:", error);
    }
  }

  const idToken = await user.getIdToken();
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vantage-Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({ prompt, isImage: !!image, image, subscriptionTier, geminiKey })
  });

  if (!response.ok) throw new Error("Vantage intelligence connection timeout.");
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.text;
  } catch {
    return text;
  }
}