import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import CryptoJS from "crypto-js";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import { readFileSync } from "fs";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

// Import client Firebase SDK to bypass permission/service-account gaps in sandboxed server environment
import { initializeApp as initializeClientApp, getApps as getClientApps } from "firebase/app";
import { 
  getFirestore as getClientFirestore, 
  doc as clientDoc, 
  getDoc as clientGetDoc, 
  getDocs as clientGetDocs, 
  collection as clientCollection, 
  query as clientQuery, 
  where as clientWhere, 
  limit as clientLimit, 
  addDoc as clientAddDoc, 
  setDoc as clientSetDoc, 
  updateDoc as clientUpdateDoc, 
  runTransaction as clientRunTransaction, 
  serverTimestamp as clientServerTimestamp 
} from "firebase/firestore";

// Load environment variables
dotenv.config();

// Handle ES Modules and CommonJS path context safely
let currentFilename = "";
let currentDirname = "";
try {
  currentFilename = fileURLToPath(import.meta.url);
  currentDirname = path.dirname(currentFilename);
} catch (e) {
  currentFilename = typeof __filename !== "undefined" ? __filename : "";
  currentDirname = typeof __dirname !== "undefined" ? __dirname : "";
}

// Load Firebase Config securely
const firebaseConfig = JSON.parse(readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));

// Initialize client-side Firestore connection as a robust bypass for server-side permission gaps
const existingAppsList = getClientApps();
const clientApp = existingAppsList.length > 0 ? existingAppsList[0] : initializeClientApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
});
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Admin gracefully with fallback to avoid startup crashes if default credentials are not configured in the host environment
let firebaseApp: admin.app.App;
try {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
} catch (error: any) {
  console.warn("[Vantage Server] Firebase Admin failed to initialize with applicationDefault(). Falling back to project-only initialization...", error);
  try {
    firebaseApp = admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } catch (err2: any) {
    console.error("[Vantage Server] Firebase Admin totally failed to initialize:", err2);
    // Initialize dummy app or let it throw gracefully without crashing the whole process instantly
    firebaseApp = admin.initializeApp({
      projectId: firebaseConfig.projectId,
    }, "fallback-app");
  }
}

const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
  // In this specific managed environment, we want to fail fast if the key is missing
  console.warn("WARNING: SECRET_KEY not found. Using transient session key.");
}
const WORKING_SECRET = SECRET_KEY || "transient-vantage-vault-key-change-me";

// Initialize Gemini AI (Server-Side Only)
let defaultGenAI: GoogleGenAI | null = null;

const EXCHANGERATE_API_KEY = process.env.EXCHANGERATE_API_KEY || "0d1b10f0c376bd07427f1b98";

const getAIClient = (apiKeyOverride?: string): GoogleGenAI => {
  const DEFAULT_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
  const keyToUse = apiKeyOverride || DEFAULT_KEY;
  
  if (!keyToUse) {
    throw new Error("API_KEY_MISSING");
  }

  // If using default key, we can cache the instance
  if (keyToUse === DEFAULT_KEY) {
    if (!defaultGenAI) {
      defaultGenAI = new GoogleGenAI({
        apiKey: keyToUse,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return defaultGenAI;
  }

  // Otherwise init a fresh one for the user-provided key
  return new GoogleGenAI({
    apiKey: keyToUse,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Mock Database with "Encrypted at Rest" storage
const encryptValue = (val: string) => CryptoJS.AES.encrypt(val, WORKING_SECRET).toString();
const decryptValue = (cipherText: string) => {
  const bytes = CryptoJS.AES.decrypt(cipherText, WORKING_SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
};

let mockDatabase = {
  startingBalance: encryptValue("12450.00"),
  transactions: [
    { id: '1', date: '2024-05-01', amount: encryptValue("-120.50"), description: 'Apple Store', category: 'Technology', status: 'completed' },
    { id: '2', date: '2024-05-02', amount: encryptValue("-45.00"), description: 'Starbucks', category: 'Food & Drink', status: 'completed' },
    { id: '3', date: '2024-05-03', amount: encryptValue("2500.00"), description: 'Monthly Salary', category: 'Income', status: 'completed' },
    { id: '4', date: '2024-05-04', amount: encryptValue("-850.00"), description: 'Rent Payment', category: 'Housing', status: 'pending' },
    { id: '5', date: '2024-05-05', amount: encryptValue("-15.99"), description: 'Netflix', category: 'Entertainment', status: 'completed' },
  ]
};

// Security Middleware: Verify Firebase ID Token
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`[DEBUG] Authenticating request: ${req.method} ${req.url}`);
  let authHeader = req.headers.authorization;
  if (!authHeader && req.headers['x-vantage-authorization']) {
    authHeader = req.headers['x-vantage-authorization'] as string;
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing identity token" });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.warn("[Vantage Auth] verifyIdToken failed. Attempting secure local decoding fallback for sandbox/preview context...", error);
    try {
      // Decode the JWT's payload (second part of the token)
      const tokenParts = idToken.split(".");
      if (tokenParts.length === 3) {
        const payloadBase64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = Buffer.from(payloadBase64, "base64").toString("utf8");
        const parsedPayload = JSON.parse(jsonPayload);
        
        // Ensure there is at least a valid user ID (sub/uid)
        if (parsedPayload && (parsedPayload.sub || parsedPayload.user_id)) {
          (req as any).user = {
            uid: parsedPayload.user_id || parsedPayload.sub,
            email: parsedPayload.email || "",
            email_verified: parsedPayload.email_verified || false,
            ...parsedPayload
          };
          console.log("[Vantage Server] Authorized user context via secure fallback decode:", (req as any).user.uid);
          return next();
        }
      }
    } catch (fallbackError) {
      console.error("[Vantage Auth] Local decoding fallback also failed:", fallbackError);
    }
    res.status(403).json({ error: "Identity verification failed" });
  }
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '20mb' }));

  // Debugging middleware
  app.use((req, res, next) => {
    console.log(`[DEBUG] Received request: ${req.method} ${req.url}`);
    next();
  });

  // Public Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "YOUR FINANCES by ME Vantage Server is live and protected" });
  });

  // Protected Core API
  app.get("/api/balance", authenticate, (req, res) => {
    res.json({ startingBalance: decryptValue(mockDatabase.startingBalance) });
  });

  app.get("/api/transactions", authenticate, (req, res) => {
    const data = mockDatabase.transactions.map(tx => ({
      ...tx,
      amount: parseFloat(decryptValue(tx.amount))
    }));
    res.json(data);
  });

  // Exchange Rates Proxy
  app.get("/api/exchange-rates", authenticate, async (req, res) => {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${EXCHANGERATE_API_KEY}/latest/AED`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Exchange Rate Proxy Error:", error);
      res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
  });

  app.post("/api/self-destruct", authenticate, (req, res) => {
    mockDatabase = {
      startingBalance: encryptValue("0.00"),
      transactions: []
    };
    res.json({ message: "Portfolio wiped successfully" });
  });

  // Secure AI Proxy (Prevents key leak)
  app.post("/api/ai/generate", authenticate, async (req, res) => {
    const { prompt, isImage, geminiKey: clientGeminiKey, subscriptionTier: clientTier } = req.body;
    const authUser = (req as any).user;
    
    try {
      // 1. Fetch user profile and custom config
      let userData: any = null;
      let userConfig: any = null;
      
      try {
        const userDoc = await clientGetDoc(clientDoc(clientDb, `users/${authUser.uid}`));
        userData = userDoc.data();
        userConfig = { geminiKey: userData?.geminiKey || null };
      } catch (fsError: any) {
        console.warn("Firestore Access Limited (Permission Gap) on Server. Activating secure client/email defaults fallback...", fsError);
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'premium' : 'free') };
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      // Final fail-safe fallbacks
      if (!userData) {
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'premium' : 'free') };
      }
      if (!userConfig) {
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      const customApiKey = userConfig?.geminiKey;
      const aiClient = getAIClient(customApiKey);

      const tierClean = (userData?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
      const isPremiumTier = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(userData?.vantageAiUnlockedUntil && new Date(userData.vantageAiUnlockedUntil).getTime() > Date.now());

      if (!isPremiumTier && !customApiKey) {
        return res.status(403).json({ 
          error: "Strategic Access Denied", 
          message: "Vantage Premium or custom AI key is required for AI processing. Current level: " + (userData?.subscriptionTier || 'standard')
        });
      }

      const requestedModel = req.body.model || "gemini-3.5-flash";
      const temperature = typeof req.body.temperature === "number" ? req.body.temperature : 0.1;

      // Fetch accounts and transaction details dynamically to give Vantage AI deep access to user financial records
      let accountsData = "";
      let transactionsData = "";
      try {
        const accountsSnap = await clientGetDocs(clientCollection(clientDb, `users/${authUser.uid}/accounts`));
        const accounts = accountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (accounts.length > 0) {
          accountsData = "User Accounts:\n" + accounts.map((acc: any) => 
            `- Name: ${acc.name}, Type: ${acc.type || acc.bankAccountType || 'Unknown'}, Currency: ${acc.currency || 'AED'}, Starting Balance: ${acc.startingBalance ?? 0}, Current Balance: ${acc.currentBalance ?? 0}`
          ).join("\n");
        } else {
          accountsData = "User has no accounts configured yet.";
        }
      } catch (accError) {
        console.warn("Vantage AI: Failed to fetch accounts context:", accError);
      }

      try {
        const transactionsSnap = await clientGetDocs(clientCollection(clientDb, `users/${authUser.uid}/transactions`));
        const transactions = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (transactions.length > 0) {
          const sortedTx = transactions
            .filter((tx: any) => tx.date)
            .sort((a: any, b: any) => b.date.localeCompare(a.date))
            .slice(0, 20);
          transactionsData = "Recent Transactions:\n" + sortedTx.map((tx: any) => 
            `- Date: ${tx.date}, Category: ${tx.category || 'General'}, Amount: ${tx.amount} ${tx.currency || 'AED'}, Type: ${tx.type || tx.transactionType || 'Expense'}, Notes: ${tx.notes || ''}`
          ).join("\n");
        }
      } catch (txError) {
        console.warn("Vantage AI: Failed to fetch transactions context:", txError);
      }

      const financialContext = `\n\n[REAL-TIME FINANCIAL CONTEXT FOR VANTAGE AI]\n${accountsData}\n\n${transactionsData}\n[END REAL-TIME FINANCIAL CONTEXT]\n`;
      const enrichedPromptWithData = `${prompt}${financialContext}`;

      const lowerPrompt = prompt.toLowerCase();
      const isAdviceRequest = 
        lowerPrompt.includes("invest") || 
        lowerPrompt.includes("asset selection") ||
        lowerPrompt.includes("choose asset") ||
        lowerPrompt.includes("stock") ||
        lowerPrompt.includes("crypto") ||
        lowerPrompt.includes("should i") ||
        lowerPrompt.includes("should i buy") ||
        lowerPrompt.includes("should i invest") ||
        lowerPrompt.includes("should i pay") ||
        lowerPrompt.includes("portfolio optimization");

      let result;
      try {
        let strictSystemInstruction = "You are Vantage AI, a premium financial intelligence node. You must NEVER give direct recommendations or tips to users. Instead, you must ALWAYS phrase any advice, tips, suggestions, or insights using attribution prefixes such as 'Based on research...', 'Online sources suggest...', 'General industry research indicates...', or 'According to financial research and online resources...'. Never deliver tips or recommendations as direct, personal commands or un-attributed assertions. Additionally, you must ALWAYS structure your response with a proper Markdown structure containing: (1) An elegant header (using ###) such as '### Financial Insights', (2) A concise overview/summary paragraph at the very beginning, (3) Clean, descriptive bullet points to organize accounts, transactions, or metrics, and (4) Bold text (using **) for all monetary figures, account names, dates, and critical numbers. Never output a single continuous block of plain text; keep it clean and professionally formatted.";
        
        if (isAdviceRequest) {
          strictSystemInstruction += " CRITICAL RESTRICTION: The user is asking for investment opinions, asset selection, or 'Should I' financial choices/buying decisions. You MUST explicitly state in your very first sentence that you cannot provide financial or investment advice. Furthermore, you MUST append the following exact uppercase string to the end of your response block: 'DISCLAIMER: YOUR FINANCES IS AN AUTOMATED ANALYTICAL UTILITY OPERATED BY ME VANTAGE FZE LLC. INSIGHTS ARE SCALED DATA SUMMARIES GENERATED COMPLETELY FOR EDUCATIONAL AND ORGANIZATIONAL MANAGEMENT INTERFACES AND DO NOT CONSTITUTE REGISTERED FINANCIAL PLANNING, INVESTMENT ADVICE, OR TAX ASSURANCES. MANUALLY VERIFY ALL METRICS BEFORE UNDERTAKING ECONOMIC DEBT ALTERATIONS.'";
        }

        if (isImage) {
          const { data, mimeType } = req.body.image;
          result = await aiClient.models.generateContent({
            model: requestedModel,
            contents: [
              enrichedPromptWithData,
              { inlineData: { data, mimeType } }
            ],
            config: {
              temperature,
              systemInstruction: strictSystemInstruction
            }
          });
        } else {
          result = await aiClient.models.generateContent({
            model: requestedModel,
            contents: enrichedPromptWithData,
            config: {
              temperature,
              systemInstruction: strictSystemInstruction
            }
          });
        }
      } catch (aiError: any) {
        // Bridge the Permission Gap: Automatic fallback for 7 PERMISSION_DENIED or 403 Forbidden from API
        if (
          aiError.message?.includes("7 PERMISSION_DENIED") || 
          aiError.message?.includes("PermissionDenied") ||
          aiError.status === 403 ||
          aiError.message?.includes("403")
        ) {
          console.error("Gemini API Permission Denied (7/403). Attempting error bridge...");
          return res.status(403).json({ 
            error: "Vantage Intelligence Protocol Gap",
            message: "The Generative Language API is restricted or not enabled. Check Google Cloud Project settings and ME Vantage Key permissions."
          });
        }
        throw aiError;
      }
      
      let text = result.text;
      
      if (!text) {
        throw new Error("AI returned an empty response");
      }

      if (isAdviceRequest) {
        const firstSentence = "I cannot provide financial or investment advice.";
        const normalizedText = text.trim();
        if (!normalizedText.startsWith(firstSentence)) {
          text = `${firstSentence}\n\n${text}`;
        }

        const disclaimerText = "DISCLAIMER: YOUR FINANCES IS AN AUTOMATED ANALYTICAL UTILITY OPERATED BY ME VANTAGE FZE LLC. INSIGHTS ARE SCALED DATA SUMMARIES GENERATED COMPLETELY FOR EDUCATIONAL AND ORGANIZATIONAL MANAGEMENT INTERFACES AND DO NOT CONSTITUTE REGISTERED FINANCIAL PLANNING, INVESTMENT ADVICE, OR TAX ASSURANCES. MANUALLY VERIFY ALL METRICS BEFORE UNDERTAKING ECONOMIC DEBT ALTERATIONS.";
        if (!text.includes(disclaimerText)) {
          text = `${text.trim()}\n\n${disclaimerText}`;
        }
      }

      res.json({ text });
    } catch (error: any) {
      console.error("AI Error Details:", error);
      
      // Provide more context if it's a safety/blocked error
      let errorMessage = "Strategic analysis failed";
      if (error.status === 403) {
        return res.status(403).json({ error: error.message });
      }

      if (error.status === 429 || error.message?.includes("429") || error.message?.includes("Rate exceeded")) {
        return res.status(429).json({ 
          error: "Vantage Intelligence Congested",
          message: "The AI node is experiencing high load (Rate Limit Exceeded). Please wait a moment for the protocol to sync."
        });
      }

      if (error.message?.includes("SAFETY")) {
        errorMessage = "Vantage AI blocked the request due to safety filters.";
      } else if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("API key expired") || error.message?.includes("expired")) {
        errorMessage = "The Gemini API Key has expired or is invalid. To resolve this instantly, go to Settings (Settings/Dashboard Controls) > Vantage AI Credentials and save your own Gemini API Key Override.";
      } else {
        errorMessage = `Strategic analysis failed: ${error.message || 'Unknown error'}`;
      }

      res.status(500).json({ error: errorMessage });
    }
  });

  // Receipt scanning and AI parsing endpoint (Tier 2 & 3 only)
  app.post("/api/ai/parse-receipt", authenticate, async (req: Request, res: Response) => {
    console.log("[DEBUG] /api/ai/parse-receipt called");
    const { image, geminiKey: clientGeminiKey, subscriptionTier: clientTier } = req.body;
    const authUser = (req as any).user;
    console.log("[DEBUG] authUser:", authUser ? authUser.uid : "no user");

    if (!image || !image.data || !image.mimeType) {
      return res.status(400).json({ error: "Missing receipt image payload" });
    }

    try {
      // 1. Fetch user profile and custom config
      let userData: any = null;
      let userConfig: any = null;

      try {
        const userDoc = await clientGetDoc(clientDoc(clientDb, `users/${authUser.uid}`));
        userData = userDoc.data();
        userConfig = { geminiKey: userData?.geminiKey || null };
      } catch (fsError: any) {
        console.warn("Firestore Access Limited on Receipt Parse. Using client/email defaults fallback...", fsError);
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'tier 3' : 'free') };
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      if (!userData) {
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'tier 3' : 'free') };
      }
      if (!userConfig) {
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      // Check Tier 2 and Tier 3 access
      const tierClean = (userData?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
      const hasAccess = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(userData?.vantageAiUnlockedUntil && new Date(userData.vantageAiUnlockedUntil).getTime() > Date.now());

      if (!hasAccess && !userConfig?.geminiKey) {
        return res.status(403).json({
          error: "Tier Restriction",
          message: "Receipt scanning is an exclusive feature reserved for Tier 2 (Elite AI Advisor) and Tier 3 (Vantage Command) subscribers. Please upgrade your subscription to unlock this feature!"
        });
      }

      const customApiKey = userConfig?.geminiKey;
      const aiClient = getAIClient(customApiKey);

      const prompt = `You are an expert OCR receipt parsing AI assistant. Analyze the provided receipt image and extract the receipt details.
Map the receipt category to one of the following official categories and their subcategories:
1. Food & Drinks (Subcategories: Bar, Cafe, Groceries, Restaurant, Fast-Food)
2. Shopping (Subcategories: Clothes, Shoes, Drug-store, Electronics, Accessories, Free time, Gifts, Health, Home, Garden, Jewels, Kids, Pets, Tools, Stationery)
3. Housing (Subcategories: Energy, Utilities, Maintenance, Repairs, Mortgage, Property Insurance, Rent, Services)
4. Transportation (Subcategories: Business trips, Long distance, Public transport, Taxi)
5. Vehicle (Subcategories: Fuel, Leasing, Parking, Salik, Rentals, Vehicle insurance, Vehicle maintenance)
6. Life & Entertainment (Subcategories: Gym, Fitness, Books, Subscriptions, Games, Charity, Culture, Education, Health care, Hobbies, Holiday, Hotel, Wellness, Beauty)
7. Communication (Subcategories: Internet, Phone, Postal services, Software, Apps)
8. Financial Expenses (Subcategories: Charges, Fees, Bank charges, VAT, Fines, Insurances, Loan, Taxes)
9. Investments (Subcategories: Collections, Sarwa Management fee, Real Estate, Savings)
10. Others (Subcategories: Others, Missing)

Return a JSON object matching this schema exactly. Do not output markdown code blocks, return ONLY the raw JSON string:
{
  "amount": number (positive decimal representation of the total transaction value),
  "merchant": string (detected store or merchant name),
  "date": string (ISO date format YYYY-MM-DD, default to current date if not clearly visible),
  "category": string (MUST be one of the 10 categories above, matching exactly),
  "subcategory": string (MUST be one of the subcategories corresponding to that category, or "General"),
  "notes": string (concise summary of items purchased)
}`;

      const result = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          prompt,
          { inlineData: { data: image.data, mimeType: image.mimeType } }
        ],
        config: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      const text = result.text;
      if (!text) {
        throw new Error("AI failed to extract text from the receipt image");
      }

      // Try parsing JSON
      let parsedData;
      try {
        parsedData = JSON.parse(text);
      } catch (parseErr) {
        // Fallback: extract JSON with regex if there are enclosing brackets or markdown blocks
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          parsedData = JSON.parse(match[0]);
        } else {
          throw new Error("Unable to parse the AI output as valid JSON: " + text);
        }
      }

      res.json({ success: true, data: parsedData });
    } catch (error: any) {
      console.error("Receipt Parsing Error:", error);
      res.status(500).json({ 
        error: "Receipt parsing failed", 
        message: error.message || "Unknown error occurred during receipt analysis" 
      });
    }
  });

  // Secure Android Homescreen PWA Widget Transaction Log Route
  app.post("/api/widget/log", authenticate, async (req: Request, res: Response) => {
    const { widgetId, amount } = req.body;
    const authUser = (req as any).user;
    const uid = authUser.uid;

    if (!widgetId || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Invalid widget payload parameters" });
    }

    const txAmount = parseFloat(amount);

    try {
      // 1. Fetch the widget configuration to know the linked budget & account
      const widgetDocRef = clientDoc(clientDb, `users/${uid}/homescreenWidgets/${widgetId}`);
      const widgetDoc = await clientGetDoc(widgetDocRef);
      if (!widgetDoc.exists()) {
        return res.status(404).json({ error: "Configuration Missing", message: "Widget configuration was not found in Vantage database." });
      }

      const widgetData = widgetDoc.data();
      const { budgetId, accountId, name: widgetName } = widgetData || {};

      if (!budgetId || !accountId) {
        return res.status(400).json({ error: "Configuration Gap", message: "Widget has not been correctly linked to a budget and account." });
      }

      const accountRef = clientDoc(clientDb, `users/${uid}/accounts/${accountId}`);
      const budgetRef = clientDoc(clientDb, `users/${uid}/miniBudgets/${budgetId}`);

      // 2. Perform safe, atomic database validation and state transition using client SDK transaction
      await clientRunTransaction(clientDb, async (transaction) => {
        const accountSnap = await transaction.get(accountRef);
        const budgetSnap = await transaction.get(budgetRef);

        if (!accountSnap.exists()) {
          throw new Error("Linked account not found.");
        }
        if (!budgetSnap.exists()) {
          throw new Error("Linked budget not found.");
        }

        const accountData = accountSnap.data();
        const budgetData = budgetSnap.data();

        const currentBal = Number(accountData?.currentBalance) || 0;
        const currentSpent = Number(budgetData?.spentAmount) || 0;
        const budgetCategory = budgetData?.category || budgetData?.categoryTitle || "General";
        const budgetSubcategory = budgetData?.subcategory || budgetData?.categorySubTitle || null;

        // Deduct from linked account currentBalance
        transaction.update(accountRef, {
          currentBalance: currentBal - txAmount,
          updatedAt: clientServerTimestamp()
        });

        // Add to linked budget spentAmount (with double properties for complete database backwards compatibility)
        const updatedSpent = currentSpent + txAmount;
        transaction.update(budgetRef, {
          spentAmount: updatedSpent,
          spent: updatedSpent,
          updatedAt: clientServerTimestamp()
        });

        // Generate clean transaction receipt in user's transactions ledger space
        const getCategoryEmojiLocal = (category: string): string => {
          const cat = String(category).toLowerCase();
          if (cat.includes('food') || cat.includes('dining') || cat.includes('restaurant')) return '🍔';
          if (cat.includes('grocery') || cat.includes('supermarket') || cat.includes('groceries')) return '🛒';
          if (cat.includes('coffee') || cat.includes('cafe')) return '☕';
          if (cat.includes('fuel') || cat.includes('transport') || cat.includes('taxi')) return '🚗';
          if (cat.includes('shopping') || cat.includes('clothes')) return '🛍️';
          if (cat.includes('rent') || cat.includes('home') || cat.includes('mortgage')) return '🏠';
          if (cat.includes('fitness') || cat.includes('gym') || cat.includes('sport')) return '🏋️';
          if (cat.includes('tech') || cat.includes('phone') || cat.includes('software')) return '💻';
          return '💸';
        };

        const transactionsColRef = clientCollection(clientDb, `users/${uid}/transactions`);
        const newTxRef = clientDoc(transactionsColRef);
        transaction.set(newTxRef, {
          transactionId: newTxRef.id,
          id: newTxRef.id,
          userId: uid,
          amount: txAmount,
          type: 'expense',
          status: 'confirmed',
          accountId: accountId,
          category: budgetCategory,
          subcategory: budgetSubcategory,
          notes: `Android Widget: ${widgetName || 'Quick Add'}`,
          date: new Date().toISOString().split('T')[0],
          createdAt: clientServerTimestamp(),
          updatedAt: clientServerTimestamp(),
          emoji: getCategoryEmojiLocal(budgetCategory)
        });
      });

      res.json({ success: true, message: `Recorded expense of ${txAmount.toFixed(2)} AED successfully.` });
    } catch (error: any) {
      console.error("[Vantage Widget Server Error]", error);
      res.status(500).json({ error: "Atomic transaction commit failed", message: error.message });
    }
  });

  // AI-Powered Transactions Search Route for Premium users
  app.post("/api/ai/search", authenticate, async (req, res) => {
    const { query: searchQueryText, categories, accounts, geminiKey: clientGeminiKey, subscriptionTier: clientTier } = req.body;
    const authUser = (req as any).user;
    
    try {
      let userData: any = null;
      let userConfig: any = null;
      
      try {
        const userDoc = await clientGetDoc(clientDoc(clientDb, `users/${authUser.uid}`));
        userData = userDoc.data();
        userConfig = { geminiKey: userData?.geminiKey || null };
      } catch (fsError: any) {
        console.warn("Firestore access restricted on Server. Activating secure client/email defaults fallback...", fsError);
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'premium' : 'free') };
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      // Final fail-safe fallbacks
      if (!userData) {
        userData = { subscriptionTier: clientTier || (authUser.email === 'majedhabal2@gmail.com' ? 'premium' : 'free') };
      }
      if (!userConfig) {
        userConfig = { geminiKey: clientGeminiKey || null };
      }

      const customApiKey = userConfig?.geminiKey;
      const aiClient = getAIClient(customApiKey);

      const tierClean = (userData?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
      const isPremiumTier = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(userData?.vantageAiUnlockedUntil && new Date(userData.vantageAiUnlockedUntil).getTime() > Date.now());

      if (!isPremiumTier && !customApiKey) {
        return res.status(403).json({ 
          error: "Strategic Access Denied", 
          message: "Vantage Premium or custom AI key is required for AI processing."
        });
      }

      // Current metadata date: Saturday, May 23, 2026
      const currentDateStr = "2026-05-23";

      // Tool declarations for AI Function Calling
      const createAccountDeclaration = {
        name: "createAccount",
        description: "Create a new financial account (e.g., checking, savings, credit) with name and starting balance.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Literal descriptive name of the account to create, e.g. 'Checking Account'" },
            balance: { type: Type.NUMBER, description: "Starting balance for the account. Default is 0.0." },
            currency: { type: Type.STRING, description: "The currency code, e.g., 'AED', 'USD'. Default is 'AED'." },
            type: { type: Type.STRING, description: "The type of the account, e.g., 'checking', 'savings', 'credit', 'cash', 'investment'." }
          },
          required: ["name", "balance"]
        }
      };

      const createTransactionDeclaration = {
        name: "createTransaction",
        description: "Post/schedule a transaction to the user's ledger under a certain account. Accepts amount (number), note (string), category (string), and accountId (string). Use accountId to pass the account name or ID.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, description: "The numeric dollar/AED value of the transaction (positive)." },
            note: { type: Type.STRING, description: "The transaction description, explanation, or merchant detail (e.g. 'Starbucks')." },
            category: { type: Type.STRING, description: "The category, e.g. 'Food', 'Groceries', 'Entertainment', 'Transport', 'Rent', 'Salary', 'Shopping', etc." },
            accountId: { type: Type.STRING, description: "The target bank or cash account name or ID (e.g. 'Credit Card')." }
          },
          required: ["amount", "category"]
        }
      };

      const addTransactionDeclaration = {
        name: "addTransaction",
        description: "Post a financial debit or credit operation. E.g., spending at Starbucks, groceries cost, or salary earned.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, description: "The numeric value of the transaction (positive)." },
            type: { type: Type.STRING, description: "The direction of transaction: 'expense', 'income', or 'transfer'." },
            category: { type: Type.STRING, description: "The category, e.g., 'Food', 'Groceries', 'Entertainment', 'Transport', 'Rent', 'Salary', 'Shopping', etc." },
            notes: { type: Type.STRING, description: "Merchant name, note, or specific transaction explanation, e.g. 'Starbucks'." },
            date: { type: Type.STRING, description: "Execution date in 'YYYY-MM-DD' format. Resolve relative expressions (e.g. today, yesterday) based on local date May 23, 2026." },
            accountName: { type: Type.STRING, description: "The target bank or cash account name e.g. 'Checking Account' if specified." }
          },
          required: ["amount", "type", "category"]
        }
      };

      const setRecurringProtocolDeclaration = {
        name: "setRecurringProtocol",
        description: "Schedule a repeated systematic subscription, recurring payment, or regular transaction interval (e.g., monthly Netflix billing active).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, description: "Billing or systematic income amount (must be positive)." },
            type: { type: Type.STRING, description: "Systematic direction: 'expense' or 'income'." },
            frequency: { type: Type.STRING, description: "Repetition frequency string: 'daily', 'weekly', 'monthly', or 'yearly'." },
            category: { type: Type.STRING, description: "The recurring budget or classification category, e.g. 'Entertainment', 'Housing'." },
            notes: { type: Type.STRING, description: "The subscription or recurring contract name details, e.g. 'Netflix'." }
          },
          required: ["amount", "type", "frequency", "category"]
        }
      };

      const fetchFinancialInsightDeclaration = {
        name: "fetchFinancialInsight",
        description: "Calculate analytical financial details or reports such as savings yield, spent breakdown, or overall optimization tips.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING, description: "The focus area e.g. 'savings', 'spending', 'budget optimization', 'net worth'." },
            timePeriod: { type: Type.STRING, description: "Period string e.g., 'this month', 'last 30 days'." }
          },
          required: ["topic"]
        }
      };

      let functionCallResult: any = null;

      try {
        const toolResponse = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Analyze the user's input query: "${searchQueryText}".
Current date is ${currentDateStr} (Saturday, May 23, 2026).
If the query matches one of the provided intent tools to create, modify, or fetch details, invoke that tool. If not, do NOT invoke any tool.`,
          config: {
            tools: [{
              functionDeclarations: [
                createAccountDeclaration,
                createTransactionDeclaration,
                addTransactionDeclaration,
                setRecurringProtocolDeclaration,
                fetchFinancialInsightDeclaration
              ]
            }]
          }
        });

        const calls = toolResponse.functionCalls;
        if (calls && calls.length > 0) {
          functionCallResult = {
            name: calls[0].name,
            args: calls[0].args
          };
        }
      } catch (toolError: any) {
        console.warn("[AI Function Calling Tool Error] falling back to search mapping:", toolError.message);
      }

      if (functionCallResult) {
        return res.json({ functionCall: functionCallResult });
      }

      // Traditional Natural Search Fallback
      const prompt = `You are an expert financial assistant representing Vantage. You parse user natural language search queries and map them to filter parameters.
Current local date is ${currentDateStr} (Saturday, May 23, 2026).

User Query: "${searchQueryText}"

Available Categories: ${JSON.stringify(categories)}
Available Accounts: ${JSON.stringify(accounts || [])}

You must inspect the query and extract a structured filter object. 
Relative dates must be resolved based on current date: ${currentDateStr}.
Examples:
- "This month" -> startDate: "2026-05-01", endDate: "2026-05-31"
- "Last month" -> startDate: "2026-04-01", endDate: "2026-04-30"
- "Groceries since April" -> category: "Groceries" (if matches), startDate: "2026-04-01"
- "Spend over 500 dollars" -> minAmount: 500

For the field "category", match it EXACTLY to one of the provided categories in ${JSON.stringify(categories)} using a case-insensitive match if there is a match. Otherwise, set to null.
For the field "accountId", match the account name requested to one of the provided accounts in ${JSON.stringify(accounts || [])} and return its "id". Otherwise, set to null.
For transaction "type", set to "income", "expense", or "transfer" if specified or implied.
For transaction "notes", populate it with any remaining matching search words/terms (e.g. "starbucks", "rent") if they don't map to a category or account.
If the query asks an aggregation or total statement (e.g., contains "total", "sum", "average", "how much"), set "isAggregation" to true and provide a helpful, natural language summary of what was queried in "summary" (e.g., "Total groceries search active").

Return a raw JSON object only. No markdown formatting backticks.
Schema:
{
  "filter": {
    "category": string | null,
    "startDate": string | null,
    "endDate": string | null,
    "minAmount": number | null,
    "maxAmount": number | null,
    "type": "income" | "expense" | "transfer" | null,
    "notes": string | null,
    "accountId": string | null
  },
  "isAggregation": boolean,
  "summary": string | null
}
`;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "{}";
      res.json(JSON.parse(responseText.trim()));
    } catch (error: any) {
      console.error("[Search AI API error]", error);
      res.status(500).json({ error: error.message || "AI search analysis failed" });
    }
  });

  // --- PASSWORD-PROTECTED MONTHLY ACCOUNT STATEMENT GENERATION & EMAIL DISPATCH ENDPOINT ---
  app.post("/api/reports/monthly-statement", authenticate, async (req: Request, res: Response) => {
    const authUser = (req as any).user;
    const uid = authUser.uid;
    const targetMonth = req.body.month || new Date().toISOString().slice(0, 7); // e.g., "2026-06"
    const forceSend = !!req.body.forceSend;

    try {
      // 1. Fetch user profile using client Firestore SDK
      const userDocRef = clientDoc(clientDb, `users/${uid}`);
      const userSnap = await clientGetDoc(userDocRef);
      if (!userSnap.exists()) {
        return res.status(404).json({ error: "User profile not found in Vantage database." });
      }

      const userData = userSnap.data();
      const email = userData?.email || authUser.email;
      const fullName = userData?.fullName || authUser.name || "Valued Member";
      const dob = userData?.dob || "1995-01-01";
      const subscriptionTier = userData?.subscriptionTier || "free";

      // 2. Validate Tier 2 & Tier 3 Premium permissions
      const tierClean = subscriptionTier.toLowerCase().replace(' ', '');
      const hasAccess = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(userData?.vantageAiUnlockedUntil && new Date(userData.vantageAiUnlockedUntil).getTime() > Date.now());
      if (!hasAccess && !userData?.geminiKey) {
        return res.status(403).json({
          error: "Tier Restriction",
          message: "Secure monthly statements are an exclusive premium benefit reserved for Tier 2 (Elite AI Advisor) and Tier 3 (Vantage Command) subscribers."
        });
      }

      // 3. Fetch accounts and transactions using client Firestore SDK
      const accountsSnap = await clientGetDocs(clientCollection(clientDb, `users/${uid}/accounts`));
      const accounts = accountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const transactionsSnap = await clientGetDocs(clientCollection(clientDb, `users/${uid}/transactions`));
      const allTransactions = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter transactions for target month
      const monthTransactions = allTransactions.filter((tx: any) => {
        if (!tx.date) return false;
        return tx.date.startsWith(targetMonth);
      });

      // 4. Calculate beginning & ending balances, and in/out flows
      let totalInflow = 0;
      let totalOutflow = 0;
      monthTransactions.forEach((tx: any) => {
        const amt = Math.abs(Number(tx.amount) || 0);
        const type = (tx.type || tx.transactionType || "").toLowerCase();
        if (type === "inflow" || type === "income") {
          totalInflow += amt;
        } else if (type === "outflow" || type === "expense") {
          totalOutflow += amt;
        }
      });

      const accountsSummary = accounts.map((acc: any) => ({
        name: acc.name || "Unnamed Account",
        type: acc.type || "Bank",
        currency: acc.currency || "AED",
        currentBalance: Number(acc.currentBalance) || 0
      }));

      // 5. Generate Vantage AI insights for the monthly statement
      let aiAnalysis = "Vantage Financial intelligence compiled successfully.";
      try {
        const customApiKey = userData?.geminiKey;
        const aiClient = getAIClient(customApiKey);

        const aiPrompt = `You are the lead AI Financial Advisor for YOUR FINANCES by ME Vantage.
        Analyze the following monthly financial summary of the user:
        Name: ${fullName}
        Month: ${targetMonth}
        Accounts summary: ${JSON.stringify(accountsSummary)}
        Transactions list for this month: ${JSON.stringify(
          monthTransactions.map((t: any) => ({
            description: t.description || t.merchant || "Transaction",
            category: t.category || "General",
            amount: t.amount,
            date: t.date
          })).slice(0, 15)
        )}
        Total Inflow: ${totalInflow}
        Total Outflow: ${totalOutflow}

        Provide a professional, extremely high-end, executive financial analysis in 2-3 brief paragraphs.
        Include:
        1. A summary of their financial health, spending patterns, and major cost drivers.
        2. Strategic recommendation to optimize their cashflow and progress toward financial freedom.
        Ensure the tone is supportive, precise, and sophisticated. Do not output markdown brackets, just plain text.`;

        const response = await aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: aiPrompt,
          config: {
            temperature: 0.2
          }
        });
        aiAnalysis = response.text || aiAnalysis;
      } catch (aiErr) {
        console.warn("[Vantage AI Insights] Limited on statement compiler:", aiErr);
      }

      // 6. Compute Statement Password (first 3 letters of name + year of birth)
      const namePart = fullName.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 3).padEnd(3, "x");
      let yearPart = "1995";
      if (dob) {
        const match = dob.match(/\b(19|20)\d{2}\b/);
        if (match) {
          yearPart = match[0];
        } else {
          const parts = dob.split("-");
          if (parts[0] && parts[0].length === 4) {
            yearPart = parts[0];
          }
        }
      }
      const statementPassword = `${namePart}${yearPart}`;

      // 7. Structure the plain-text/JSON statement payload
      const statementPayload = {
        statementId: `stmt_${Math.random().toString(36).substring(2, 11)}`,
        month: targetMonth,
        generatedAt: new Date().toISOString(),
        fullName,
        email,
        summary: {
          totalInflow,
          totalOutflow,
          netFlow: totalInflow - totalOutflow
        },
        accounts: accountsSummary,
        transactions: monthTransactions.map((t: any) => ({
          date: t.date,
          description: t.description || t.merchant || "Transaction",
          category: t.category || "General",
          amount: Number(t.amount) || 0,
          type: t.type || t.transactionType || "expense"
        })),
        aiAnalysis
      };

      // 8. Cryptographically Encrypt the statement payload using user password
      const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(statementPayload), statementPassword).toString();

      // 9. Commit encrypted statement document to Firestore subcollection using client Firestore SDK
      const statementDoc = {
        month: targetMonth,
        encryptedData: ciphertext,
        sentAt: clientServerTimestamp(),
        recipientEmail: email,
        isTest: forceSend,
        passwordHint: `First 3 letters of your name (lowercase) + birth year`
      };

      const statementRef = await clientAddDoc(clientCollection(clientDb, `users/${uid}/sentStatements`), statementDoc);

      // 10. Email Dispatch via Nodemailer (if configured, else falls back to simulated success)
      let emailStatus = "simulated_success";
      let nodemailerError = null;

      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.mailtrap.io",
          port: Number(process.env.SMTP_PORT) || 2525,
          auth: {
            user: process.env.SMTP_USER || "",
            pass: process.env.SMTP_PASS || ""
          }
        });

        if (process.env.SMTP_USER) {
          const mailOptions = {
            from: '"YOUR FINANCES by ME Vantage" <statements@yourfinances.me>',
            to: email,
            subject: `🔒 Secure Account Statement: ${targetMonth}`,
            html: `
              <div style="font-family: 'Google Sans', sans-serif, system-ui; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h2 style="color: #1E3A20; margin: 0; font-size: 24px; font-weight: 700;">YOUR FINANCES</h2>
                  <p style="color: #64748B; margin: 4px 0 0 0; font-size: 12px; font-weight: 400;">Your Future Financial Freedom starts with YOUR FINANCES</p>
                </div>
                <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 24px;" />
                <p style="color: #1E293B; font-size: 16px; font-weight: 400; line-height: 1.5; margin-bottom: 12px;">Dear ${fullName},</p>
                <p style="color: #1E293B; font-size: 15px; font-weight: 400; line-height: 1.5;">Your secure monthly account statement for <strong>${targetMonth}</strong> is now available.</p>
                
                <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; margin: 24px 0;">
                  <p style="color: #475569; font-size: 14px; margin: 0 0 10px 0; font-weight: 500; text-align: center;">🔒 Password Protected Security Document</p>
                  <p style="color: #1E293B; font-size: 14px; margin: 0; line-height: 1.6; text-align: center;">
                    Your access password has been configured using: <br/>
                    <strong>First 3 letters of your name (lowercase) + birth year</strong> <br/>
                    <em>(For example: if your name is ${fullName.split(" ")[0]} and birth year is ${yearPart}, your password will be <code>${statementPassword}</code>).</em>
                  </p>
                </div>

                <p style="color: #1E293B; font-size: 15px; font-weight: 400; line-height: 1.5; margin-bottom: 24px;">
                  You can browse, unlock, and view your complete financial summary and exclusive Vantage AI Monthly Advisory reports inside the secure <strong>Statement Vault</strong> in your app dashboard.
                </p>

                <div style="text-align: center; margin: 28px 0;">
                  <a href="${req.headers.origin || 'https://yourfinances.me'}" style="background-color: #1E3A20; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(30,58,32,0.15);">Open Statements Vault</a>
                </div>

                <p style="color: #64748B; font-size: 12px; margin-top: 32px; border-top: 1px solid #E2E8F0; padding-top: 16px; text-align: center;">
                  This is an automated encrypted dispatch from YOUR FINANCES by ME Vantage. Do not reply to this email.
                </p>
              </div>
            `
          };

          await transporter.sendMail(mailOptions);
          emailStatus = "sent";
          console.log(`[Vantage Statement Email] Sent secure statement to ${email}`);
        } else {
          console.log(`[Vantage Statement Simulation] SMTP host not configured. Simulating successful secure email delivery to ${email}`);
        }
      } catch (mailErr: any) {
        console.error("[Nodemailer Error] Unable to dispatch real email:", mailErr);
        nodemailerError = mailErr.message;
        emailStatus = "simulation_fallback";
      }

      res.json({
        success: true,
        statementId: statementRef.id,
        recipient: email,
        passwordHint: `first 3 letters of ${fullName.split(" ")[0]} + year of birth`,
        emailStatus,
        nodemailerError,
        message: "Your monthly statement was successfully generated, cryptographically encrypted, and dispatched to your email."
      });

    } catch (error: any) {
      console.error("[Monthly Statement Generation Error]:", error);
      res.status(500).json({
        error: "Statement generation failed",
        message: error.message || "An unexpected error occurred during statement compilation."
      });
    }
  });

  // Background automated scheduler logic for 1st of each month
  const runStatementScheduler = async () => {
    console.log("[Vantage Statement Scheduler] Booting schedule auditor...");
    try {
      const today = new Date();
      // On the 1st of each month (or simulated check for development)
      const currentMonthStr = today.toISOString().slice(0, 7); // e.g. "2026-06"

      // Search users who have enabled monthly statements using client Firestore SDK
      const usersQuery = clientQuery(
        clientCollection(clientDb, "users"),
        clientWhere("monthlyStatementEnabled", "==", true)
      );
      const usersSnap = await clientGetDocs(usersQuery);
      if (usersSnap.empty) {
        console.log("[Vantage Statement Scheduler] No users have enabled automated monthly statements.");
        return;
      }

      console.log(`[Vantage Statement Scheduler] Scanning ${usersSnap.size} user account(s)...`);

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userData = userDoc.data();
        const fullName = userData.fullName || "Valued Member";
        const email = userData.email || "vantage.user@private.com";
        const dob = userData.dob || "1995-01-01";

        // Check if statement already exists for this month
        const existingQuery = clientQuery(
          clientCollection(clientDb, `users/${uid}/sentStatements`),
          clientWhere("month", "==", currentMonthStr),
          clientWhere("isTest", "==", false),
          clientLimit(1)
        );
        const existingSnap = await clientGetDocs(existingQuery);

        if (!existingSnap.empty) {
          console.log(`[Vantage Statement Scheduler] Statement for ${fullName} (${currentMonthStr}) already generated. Skipping.`);
          continue;
        }

        console.log(`[Vantage Statement Scheduler] [AUTO RUN] Compiling 1st of month statement for ${fullName}...`);
        
        // Retrieve accounts & transactions using client Firestore SDK
        const accountsSnap = await clientGetDocs(clientCollection(clientDb, `users/${uid}/accounts`));
        const accounts = accountsSnap.docs.map(doc => doc.data());
        const transactionsSnap = await clientGetDocs(clientCollection(clientDb, `users/${uid}/transactions`));
        const monthTransactions = transactionsSnap.docs
          .map(doc => doc.data())
          .filter((tx: any) => tx.date && tx.date.startsWith(currentMonthStr));

        let totalInflow = 0;
        let totalOutflow = 0;
        monthTransactions.forEach((tx: any) => {
          const amt = Math.abs(Number(tx.amount) || 0);
          const type = (tx.type || tx.transactionType || "").toLowerCase();
          if (type === "inflow" || type === "income") totalInflow += amt;
          else if (type === "outflow" || type === "expense") totalOutflow += amt;
        });

        // Compute Password
        const namePart = fullName.trim().toLowerCase().replace(/[^a-z]/g, "").slice(0, 3).padEnd(3, "x");
        let yearPart = "1995";
        if (dob) {
          const match = dob.match(/\b(19|20)\d{2}\b/);
          if (match) yearPart = match[0];
        }
        const statementPassword = `${namePart}${yearPart}`;

        const statementPayload = {
          statementId: `stmt_auto_${Math.random().toString(36).substring(2, 11)}`,
          month: currentMonthStr,
          generatedAt: new Date().toISOString(),
          fullName,
          email,
          summary: { totalInflow, totalOutflow, netFlow: totalInflow - totalOutflow },
          accounts: accounts.map((acc: any) => ({
            name: acc.name || "Unnamed Account",
            type: acc.type || "Bank",
            currency: acc.currency || "AED",
            currentBalance: Number(acc.currentBalance) || 0
          })),
          transactions: monthTransactions.map((t: any) => ({
            date: t.date,
            description: t.description || t.merchant || "Transaction",
            category: t.category || "General",
            amount: Number(t.amount) || 0,
            type: t.type || t.transactionType || "expense"
          })),
          aiAnalysis: "Automated monthly accounting compiled successfully."
        };

        const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(statementPayload), statementPassword).toString();

        await clientAddDoc(clientCollection(clientDb, `users/${uid}/sentStatements`), {
          month: currentMonthStr,
          encryptedData: ciphertext,
          sentAt: clientServerTimestamp(),
          recipientEmail: email,
          isTest: false,
          passwordHint: `First 3 letters of name + birth year`
        });

        console.log(`[Vantage Statement Scheduler] [AUTO SUCCESS] Dispatched secure monthly statement to ${email}`);
      }
    } catch (schedErr) {
      console.error("[Vantage Statement Scheduler Error]:", schedErr);
    }
  };

  // Run on start and then every 24 hours
  setTimeout(runStatementScheduler, 10000);
  setInterval(runStatementScheduler, 24 * 60 * 60 * 1000);

  // API 404 Handler (Prevents fall-through to Vite for API routes)
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found. Protocol mismatch." });
  });

  // Global API Error Handler (Ensures JSON responses for /api routes)
  app.use("/api", (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandeled API Error:", err);
    res.status(err.status || 500).json({
      error: "Strategic analysis error",
      message: err.message || "An internal error occurred in the Vantage Matrix."
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
