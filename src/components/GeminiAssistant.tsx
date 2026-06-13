import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, AlertCircle, Bot, User, Trash2, Mic, Check, AlertTriangle, Paperclip, Camera, RefreshCw, Upload, Image as ImageIcon, Plus } from 'lucide-react';
import { generateAIContent } from '../lib/gemini';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { auth, db } from '../lib/firebase';
import { getDoc, doc } from 'firebase/firestore';
import { useVantageActions } from '../hooks/useVantageActions';
import { LocalIntelligenceEngine } from '../lib/LocalIntelligenceEngine';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { syncExchangeRates, DEFAULT_RATES } from '../lib/exchangeRates';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  pendingAction?: {
    name: 'createAccount' | 'addTransaction' | 'setRecurringProtocol' | 'createTransaction';
    args: any;
    confirmed?: boolean;
    error?: string;
  };
  success?: boolean;
}

interface GeminiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  profile: any;
  refreshGlobalBalances?: () => Promise<void>;
}

const renderInlineText = (inputText: string) => {
  if (!inputText.includes('**')) {
    return <span>{inputText}</span>;
  }
  
  const fragments = inputText.split('**');
  return (
    <>
      {fragments.map((frag, idx) => {
        const isBoldElement = idx % 2 === 1;
        return (
          <span
            key={`frag-${idx}`}
            style={{ 
              fontWeight: isBoldElement ? 700 : 400,
              fontFamily: "'Google Sans', sans-serif"
            }}
            className={isBoldElement ? "font-bold text-white font-weight-700" : ""}
          >
            {frag}
          </span>
        );
      })}
    </>
  );
};

const renderMessageText = (text: string, messageId: string) => {
  const lines = text.split('\n');
  return (
    <div className="flex flex-col gap-2 w-full text-left">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed === '') {
          return <div key={`empty-${messageId}-${idx}`} className="h-1" />;
        }

        let content = line;

        // Custom list item check for bullets (* or - or •)
        const bulletMatch = content.match(/^[\s]*[\*\-•][\s]+(.*)/);
        if (bulletMatch) {
          const itemText = bulletMatch[1];
          return (
            <div 
              key={`bullet-${messageId}-${idx}`} 
              className="flex items-start gap-2 pl-5 py-0.5 w-full text-left"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#A6DDB1] mt-1.5 shrink-0" />
              <span 
                style={{ 
                  fontFamily: "'Google Sans', sans-serif", 
                  fontWeight: 400 
                }}
                className="text-[clamp(11px,2.8vw,13px)] tracking-wide leading-relaxed text-neutral-200 flex-1 text-left"
              >
                {renderInlineText(itemText)}
              </span>
            </div>
          );
        }

        // Custom list item check for numbered points (e.g. 1. )
        const numberMatch = content.match(/^[\s]*(\d+)\.[\s]+(.*)/);
        if (numberMatch) {
          const num = numberMatch[1];
          const itemText = numberMatch[2];
          return (
            <div 
              key={`num-${messageId}-${idx}`} 
              className="flex items-start gap-2 pl-5 py-0.5 w-full text-left"
            >
              <span style={{ color: '#A6DDB1' }} className="text-[clamp(11px,2.8vw,13px)] font-bold shrink-0">{num}.</span>
              <span 
                style={{ 
                  fontFamily: "'Google Sans', sans-serif", 
                  fontWeight: 400 
                }}
                className="text-[clamp(11px,2.8vw,13px)] tracking-wide leading-relaxed text-neutral-200 flex-1 text-left"
              >
                {renderInlineText(itemText)}
              </span>
            </div>
          );
        }

        // Standalone section title structures or headers
        let isSectionHeader = false;
        let cleanText = content;
        if (content.startsWith('**') && content.endsWith('**')) {
          isSectionHeader = true;
          cleanText = content.slice(2, -2);
        } else if (trimmed === trimmed.toUpperCase() && trimmed.length > 5 && !trimmed.match(/^\s*\d/) && !trimmed.match(/^[$\d%,\.\s\-+:]+$/)) {
          isSectionHeader = true;
        }

        if (isSectionHeader) {
          return (
            <h4 
              key={`h4-${messageId}-${idx}`} 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 700 
              }}
              className="text-[clamp(12px,3vw,14px)] font-bold text-white uppercase tracking-wider mt-3 mb-1 first:mt-0 text-left font-weight-700"
            >
              {cleanText}
            </h4>
          );
        }

        return (
          <p 
            key={`p-${messageId}-${idx}`} 
            style={{ 
              fontFamily: "'Google Sans', sans-serif", 
              fontWeight: 400 
            }}
            className="text-[clamp(11px,2.8vw,13px)] leading-relaxed tracking-wide text-neutral-200 text-left"
          >
            {renderInlineText(content)}
          </p>
        );
      })}
    </div>
  );
};

export const GeminiAssistant: React.FC<GeminiAssistantProps> = ({ 
  isOpen, 
  onClose, 
  uid, 
  accounts, 
  transactions, 
  accountBalances, 
  profile,
  refreshGlobalBalances
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { createAccount, addTransaction, setRecurringProtocol } = useVantageActions(uid);

  // Receipt Scanning States and Handlers
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [receiptScanResult, setReceiptScanResult] = useState<any | null>(null);
  const [isReceiptPreviewOpen, setIsReceiptPreviewOpen] = useState(false);
  const [receiptScanError, setReceiptScanError] = useState<string | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        console.error("Failed to load exchange rates inside GeminiAssistant:", err);
      }
    };
    loadRates();
  }, []);

  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setReceiptScanError("Please select a valid receipt image asset.");
      return;
    }

    setReceiptScanning(true);
    setReceiptScanError(null);

    try {
      // 1. Get base64 string
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1];
          resolve(base64);
        };
        reader.onerror = err => reject(err);
        reader.readAsDataURL(file);
      });

      // 2. Formulate Prompt
      const parsePrompt = `You are an expert multi-currency financial ledger receipt parser.
Analyze the receipt image carefully. Extract and recommend the matching details.

Rules:
1. Date: Format date strictly as YYYY-MM-DD. If the date is missing or illegible, return today's date ${new Date().toISOString().split('T')[0]}.
2. Currency: Extract the native currency directly from the currency symbol or text on the receipt (e.g. $, USD, AED, EUR, GBP, PHP, etc). If no currency symbol or text is found, default to 'AED'.
3. Total Amount: Extract the absolute grand total value as a decimal number.
4. Category: Map the merchant and items to one of these primary category folders: Food & Drink, Transport, Shopping, Entertainment, Housing, Bills & Utilities, Technology, Income, Other.
5. Subcategory: Provide a specific subcategory name based on the merchant category (e.g., 'Coffee', 'Fuel', 'Groceries', 'Subscribers', etc.).

You MUST respond ONLY with a raw JSON block matching this structure, with no formatting text, no markdown tags, and no surrounding explanations:
{
  "merchantName": "...",
  "date": "YYYY-MM-DD",
  "totalAmount": 0.00,
  "currency": "AED",
  "category": "Food & Drink",
  "subcategory": "Coffee"
}`;

      // 3. Execute Vantage AI Task using task wrapper 'parse_receipt_image' matching 'gemini-3.5-flash'
      const resultText = await executeVantageAITask('parse_receipt_image', {
        prompt: parsePrompt,
        image: {
          data: base64Data,
          mimeType: file.type
        }
      });

      // 4. Extract and Parse JSON
      let cleanText = resultText.trim();
      const match = cleanText.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error("Could not find a valid transaction structure in the AI scan response.");
      }

      const parsedResult = JSON.parse(match[0]);
      setReceiptScanResult(parsedResult);
      if (accounts && accounts.length > 0) {
        setTargetAccountId(accounts[0].id);
      }
      setIsReceiptPreviewOpen(true);
    } catch (err: any) {
      console.error("Receipt Scan Error:", err);
      setReceiptScanError(err.message || "Failed to analyze receipt.");
    } finally {
      setReceiptScanning(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handlePostReceiptScan = async () => {
    if (!receiptScanResult || !uid) return;
    setLoading(true);
    try {
      const chosenAccount = accounts.find(a => a.id === targetAccountId) || accounts[0];
      const accountCurrency = chosenAccount?.currency || 'AED';

      const convertToAED_Local = (amount: number, fromCurrency: string): number => {
        let normalizedCurrency = fromCurrency.toUpperCase().trim();
        if (normalizedCurrency === '$') normalizedCurrency = 'USD';
        if (normalizedCurrency === '€') normalizedCurrency = 'EUR';
        if (normalizedCurrency === '£') normalizedCurrency = 'GBP';
        if (normalizedCurrency === '¥') normalizedCurrency = 'JPY';
        
        const rateToAED = (exchangeRates && exchangeRates[normalizedCurrency]) || DEFAULT_RATES[normalizedCurrency as keyof typeof DEFAULT_RATES] || 1;
        return amount * rateToAED;
      };

      const convertAEDToAccountCurrency = (amountAED: number, toCurrency: string): number => {
        let normalized = toCurrency.toUpperCase().trim();
        if (normalized === '$') normalized = 'USD';
        if (normalized === '€') normalized = 'EUR';
        if (normalized === '£') normalized = 'GBP';
        if (normalized === '¥') normalized = 'JPY';
        
        const rateToAED = (exchangeRates && exchangeRates[normalized]) || DEFAULT_RATES[normalized as keyof typeof DEFAULT_RATES] || 1;
        return amountAED / rateToAED;
      };

      const amountInAED = convertToAED_Local(Number(receiptScanResult.totalAmount) || 0, receiptScanResult.currency || 'AED');
      const finalAccountAmount = convertAEDToAccountCurrency(amountInAED, accountCurrency);

      await addTransaction({
        amount: Math.abs(finalAccountAmount),
        category: receiptScanResult.category || 'Other',
        subcategory: receiptScanResult.subcategory || '',
        date: receiptScanResult.date || new Date().toISOString().split('T')[0],
        notes: `${receiptScanResult.merchantName || 'Receipt'} Scan`,
        type: 'expense',
        accountId: chosenAccount?.id || accounts[0]?.id || 'default',
        nativeCurrency: accountCurrency,
        currency: accountCurrency,
        status: 'Posted/Validated',
        createdAt: new Date(),
        emoji: '🧾'
      });

      setIsReceiptPreviewOpen(false);
      setReceiptScanResult(null);
      if (refreshGlobalBalances) {
        refreshGlobalBalances();
      }
      alert("Transaction posted directly to ledger successfully!");
    } catch (err: any) {
      console.error("Posting Error:", err);
      alert(`Failed to commit transaction: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Dynamic document upload state variables
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [selectedFileText, setSelectedFileText] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.csv', '.xlsx', '.xls', '.ods'];

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: "File exceeds 5MB limit." };
    }
    const nameLower = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_EXTENSIONS.some(ext => nameLower.endsWith(ext));
    if (!hasAllowedExt) {
      return { valid: false, error: "Unsupported file type. Use .pdf, .docx, .txt, or spreadsheet format." };
    }
    return { valid: true };
  };

  const getFileBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const getFileText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsText(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      setFileError(validation.error || "Invalid file");
      setSelectedFile(null);
      setSelectedFileBase64(null);
      setSelectedFileText(null);
      return;
    }

    setFileError(null);
    setSelectedFile(file);

    try {
      const base64 = await getFileBase64(file);
      setSelectedFileBase64(base64);

      const nameLower = file.name.toLowerCase();
      if (nameLower.endsWith('.txt') || nameLower.endsWith('.csv')) {
        const fileText = await getFileText(file);
        setSelectedFileText(fileText);
      } else {
        setSelectedFileText(null);
      }
    } catch (err) {
      console.error("Error reading file:", err);
      setFileError("Failed to read local document.");
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setSelectedFileBase64(null);
    setSelectedFileText(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startListening = async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API is not supported in this browser. Please use Chrome/Safari.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    setVoiceError(null);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (permError: any) {
      console.warn("User did not grant microphone stream permission or iframe policy restricted access:", permError);
      setVoiceError("Microphone permission denied.");
      return;
    }

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setVoiceError(null);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQueryInput(transcript);
    };

    rec.onerror = (e: any) => {
      console.error("Speech Recognition Error Event:", e);
      const errorType = e?.error || "unknown";
      if (errorType === 'not-allowed') {
        setVoiceError("Microphone access is blocked.");
      } else if (errorType === 'no-speech') {
        setVoiceError("No speech detected.");
      } else {
        setVoiceError(`Voice issue: ${errorType}`);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    try {
      rec.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const isPremium = !!(profile?.isPremium || profile?.subscriptionTier === 'premium');
  const isInsightsEnabled = !!(profile?.geminiInsightsEnabled);

  // Suggestions for immediate activation
  const suggestions = [
    'Analyze my potential saving bottlenecks',
    'Calculate my average daily spending velocity',
    'Summarize weekly portfolio breakdown'
  ];

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const confirmAssistantAction = async (msgId: string, name: string, args: any) => {
    setLoading(true);
    try {
      if (name === 'createAccount') {
        const balanceVal = args.balance !== undefined ? parseFloat(args.balance) : 0;
        const cur = args.currency || profile?.currency || 'AED';
        
        const accountData = {
          name: args.name || 'AI Checking Account',
          type: args.type || 'bank',
          startingBalance: balanceVal,
          currency: cur,
          createdAt: new Date(),
          bankAccountType: 'Checking',
          includeInLiquidity: true
        };
        
        await createAccount(accountData);
        
        const formalBalanceStr = balanceVal.toLocaleString();
        const successMsg = `Protocol established. Your ${cur} ${formalBalanceStr} ${args.name || 'Checking Account'} is now live.`;
        
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m,
          text: successMsg,
          success: true,
          pendingAction: { ...m.pendingAction, confirmed: true } as any
        } : m));

        window.dispatchEvent(new CustomEvent('vantage-accounts-glow'));
        
      } else if (name === 'addTransaction' || name === 'createTransaction') {
        const reqAccountIdOrName = args.accountId || args.accountName;
        let targetAcc = null;
        
        if (reqAccountIdOrName) {
          targetAcc = accounts.find(a => a.id === reqAccountIdOrName);
          if (!targetAcc) {
            targetAcc = accounts.find(a => a.name.toLowerCase().includes(reqAccountIdOrName.toLowerCase()) || 
                                           reqAccountIdOrName.toLowerCase().includes(a.name.toLowerCase()));
          }
        }
        
        if (!targetAcc && accounts.length > 0) {
          targetAcc = accounts[0];
        }
        
        if (!targetAcc) {
          throw new Error("Which account should I use for this?");
        }
        
        const amtVal = parseFloat(args.amount) || 0;
        const txType = args.type || 'expense';
        
        const txData = {
          userId: uid,
          amount: amtVal,
          type: txType,
          accountId: targetAcc.id,
          category: args.category || 'Food & Drink',
          notes: args.note || args.notes || args.category || 'AI Operation',
          date: args.date || new Date().toISOString().split('T')[0],
          createdAt: new Date(),
          emoji: '💰',
          status: 'confirmed'
        };

        // Requirement 4: Diagnostic logging
        console.log('AI Transaction Payload:', txData);
        
        try {
          await addTransaction(txData);
        } catch (firebaseErr: any) {
          console.error("Firestore Write Failed inside execution block:", firebaseErr);
          const errCode = firebaseErr.code || '';
          const errMsg = firebaseErr.message || String(firebaseErr);
          const formattedMessage = errCode ? `${errCode}: ${errMsg}` : errMsg;
          throw new Error(formattedMessage);
        }
        
        const successMsg = `Protocol established. Your transaction for '${txData.notes}' of AED ${amtVal.toLocaleString()} has been safely written.`;
        
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m,
          text: successMsg,
          success: true,
          pendingAction: { ...m.pendingAction, confirmed: true } as any
        } : m));

        // Requirement 3: Global state hydration
        if (refreshGlobalBalances) {
          await refreshGlobalBalances();
        }
        
        // Requirement 5: Visual success notification & scrolling
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const mainScrollable = document.querySelector('main') || document.querySelector('.overflow-y-auto');
          if (mainScrollable) {
            mainScrollable.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
        
      } else if (name === 'setRecurringProtocol') {
        const reqAccountIdOrName = args.accountId || args.accountName;
        let targetAcc = null;
        
        if (reqAccountIdOrName) {
          targetAcc = accounts.find(a => a.id === reqAccountIdOrName);
          if (!targetAcc) {
            targetAcc = accounts.find(a => a.name.toLowerCase().includes(reqAccountIdOrName.toLowerCase()) || 
                                           reqAccountIdOrName.toLowerCase().includes(a.name.toLowerCase()));
          }
        }
        
        if (!targetAcc && accounts.length > 0) {
          targetAcc = accounts[0];
        }
        
        if (!targetAcc) {
          throw new Error("Which account should I use for this?");
        }
        
        const amtVal = parseFloat(args.amount) || 0;
        
        const recData = {
          userId: uid,
          amount: amtVal,
          type: args.type || 'expense',
          accountId: targetAcc.id,
          category: args.category || 'Entertainment',
          notes: args.notes || 'Subscription',
          recurrency: args.frequency || 'monthly',
          interval: 1,
          dayOption: 'sameDate',
          duration: 'forever',
          isActive: true,
          createdAt: new Date(),
          lastGeneratedDate: new Date().toISOString().split('T')[0],
          nextGenerationDate: new Date().toISOString().split('T')[0]
        };
        
        await setRecurringProtocol(recData);
        const successMsg = `Protocol established and first payment logged in Activity`;
        
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m,
          text: successMsg,
          success: true,
          pendingAction: { ...m.pendingAction, confirmed: true } as any
        } : m));

        // Requirement 3: Global state hydration
        if (refreshGlobalBalances) {
          await refreshGlobalBalances();
        }

        // Requirement 5: Visual success notification & scrolling
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const mainScrollable = document.querySelector('main') || document.querySelector('.overflow-y-auto');
          if (mainScrollable) {
            mainScrollable.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
    } catch (err: any) {
      console.error("Execution failed inside assistant bubble:", err);
      // Requirement 4: If the write fails, show the exact Firebase error in the AI chat bubble (e.g., 'Permission Denied' or 'Quota Exceeded')
      const errorMessage = err.message || String(err);
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        text: `Execution failed: ${errorMessage}`,
        pendingAction: { ...m.pendingAction, error: errorMessage } as any
      } : m));
    } finally {
      setLoading(false);
    }
  };

  const abortAssistantAction = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      text: "Protocol aborted. Operation cleared from buffer.",
      pendingAction: undefined
    } : m));
  };

  const handleSendMessage = async (text: string) => {
    if ((!text.trim() && !selectedFile) || loading) return;

    // Capture standard file states locally
    const fileToSend = selectedFile;
    const fileBase64ToSend = selectedFileBase64;
    const fileTextToSend = selectedFileText;

    // Reset attachment states instantly
    setSelectedFile(null);
    setSelectedFileBase64(null);
    setSelectedFileText(null);
    setQueryInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    let displayText = text;
    if (fileToSend) {
      const fileBadge = `[ATTACHED DOCUMENT: ${fileToSend.name}]`;
      displayText = text.trim() ? `${fileBadge}\n\n${text}` : fileBadge;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}-${Math.random()}`,
      sender: 'user',
      text: displayText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // 1. Try resolving as potential function call / tool command
      const user = auth.currentUser;
      if (!user) throw new Error("Vantage identity verification missing. Try logging in again.");
      
      const idToken = await user.getIdToken();
      let subscriptionTier = profile?.subscriptionTier || 'free';
      let geminiKey = profile?.geminiKey || null;

      const uniqueCats = Array.from(new Set([
        ...transactions.map(t => t.category),
        "Groceries", "Food", "Transport", "Rent", "Housing", "Entertainment", "Utilities", "Salary", "Income", "Vehicle", "Technology"
      ].filter(Boolean)));

      // Include the file text/context in the query for better search and function calling context!
      let searchQuery = text;
      if (fileToSend) {
        if (fileTextToSend) {
          searchQuery = `[Attached Document Contents of ${fileToSend.name}]:\n${fileTextToSend}\n\nClient Query: ${text}`;
        } else {
          searchQuery = `[Attached Document Base64 Node of ${fileToSend.name} - MIME: ${fileToSend.type}]. Client Query: ${text}`;
        }
      }

      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vantage-Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          query: searchQuery,
          categories: uniqueCats,
          accounts: accounts.map(a => ({ id: a.id, name: a.name })),
          geminiKey,
          subscriptionTier
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.functionCall) {
          const { name, args } = data.functionCall;
          
          if (name === 'fetchFinancialInsight') {
            const topic = args.topic || 'General Portfolio';
            const period = args.timePeriod || 'this month';
            let insightSummary = "";
            if (topic.toLowerCase().includes('saving')) {
              insightSummary = `Strategic Vantage Neural Insight: For ${period}, savings protocol yields are optimized at 5.2% annualized. We recommend moving liquidity into savings modules.`;
            } else if (topic.toLowerCase().includes('spend')) {
              insightSummary = `Strategic Vantage Neural Insight: Spending trends for ${period} remain steady. Food & lifestyle expenses are the primary categories of discretionary outflow. Keep protocols in monitor mode.`;
            } else if (topic.toLowerCase().includes('net worth')) {
              insightSummary = `Strategic Vantage Neural Insight: Net worth holds high resilience for ${period}. Liquid floor meets security parameters.`;
            } else {
              insightSummary = `Strategic Vantage Neural Insight: Financial portfolio metrics are aligned to objectives for ${period}. No leaks detected.`;
            }
            const aiMsg: Message = {
              id: `ai-${Date.now()}-${Math.random()}`,
              sender: 'ai',
              text: insightSummary,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMsg]);
            setLoading(false);
            return;
          }

          let confirmationText = "";
          let unresolvedAccount = false;
          
          if (name === 'createAccount') {
            const balanceVal = args.balance !== undefined ? parseFloat(args.balance) : 0;
            const cur = args.currency || profile?.currency || 'AED';
            confirmationText = `Ready to create: ${args.name || 'Checking Account'} with ${balanceVal.toLocaleString()} ${cur}. Confirm?`;
          } else if (name === 'addTransaction' || name === 'createTransaction') {
            const amountVal = args.amount !== undefined ? parseFloat(args.amount) : 0;
            const typeStr = args.type || 'expense';
            const notesStr = args.note || args.notes || args.category || 'Transaction';
            
            const reqAccountIdOrName = args.accountId || args.accountName;
            let targetAcc = null;
            if (reqAccountIdOrName) {
              targetAcc = accounts.find(a => a.id === reqAccountIdOrName);
              if (!targetAcc) {
                targetAcc = accounts.find(a => a.name.toLowerCase().includes(reqAccountIdOrName.toLowerCase()) || 
                                               reqAccountIdOrName.toLowerCase().includes(a.name.toLowerCase()));
              }
            }
            
            if (!targetAcc && accounts.length > 0) {
              if (reqAccountIdOrName) {
                unresolvedAccount = true;
              } else {
                targetAcc = accounts[0];
              }
            }
            
            if (!targetAcc) {
              unresolvedAccount = true;
            }
            
            if (unresolvedAccount) {
              const aiMsg: Message = {
                id: `ai-${Date.now()}-${Math.random()}`,
                sender: 'ai',
                text: "Which account should I use for this?",
                timestamp: new Date()
              };
              setMessages(prev => [...prev, aiMsg]);
              setLoading(false);
              return;
            } else {
              confirmationText = `Ready to create: transaction for ${notesStr} of AED ${amountVal.toLocaleString()} (${typeStr}) in account ${targetAcc.name}. Confirm?`;
            }
          } else if (name === 'setRecurringProtocol') {
            const amountVal = args.amount !== undefined ? parseFloat(args.amount) : 0;
            const notesStr = args.notes || args.category || 'Subscription';
            confirmationText = `Ready to create: recurring protocol ${notesStr} with AED ${amountVal.toLocaleString()} (${args.frequency || 'monthly'}). Confirm?`;
          }

          const aiMsg: Message = {
            id: `ai-${Date.now()}-${Math.random()}`,
            sender: 'ai',
            text: confirmationText,
            timestamp: new Date(),
            pendingAction: {
              name: name as any,
              args: args
            }
          };
          setMessages(prev => [...prev, aiMsg]);
          setLoading(false);
          return;
        }
      }

      // 2. Fallback to standard chat response if no tool call is matched
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentTxs = transactions
        .filter(tx => new Date(tx.date) >= thirtyDaysAgo)
        .map(tx => ({
          date: new Date(tx.date).toLocaleDateString(),
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          account: accounts.find(a => a.id === tx.accountId)?.name || 'Primary'
        }));

      const balancesContext = accounts.map(acc => ({
        name: acc.name,
        balance: accountBalances[acc.id] || 0
      }));

      const lifeProfile = `
        User Profile: ${profile.fullName || 'Sara Spence'}, Marital: ${profile.maritalStatus || 'Standard'}, Dependents: ${profile.hasKids ? 'With Children' : 'None'}.
        North Star Goal: ${profile.financialGoals || 'Wealth Growth & Security'}.
      `;

      const chatHistory = messages.slice(-6).map(m => `${m.sender === 'user' ? 'Client' : 'Assistant shadow'}: ${m.text}`).join('\n');

      let promptWithAttachedFile = text;
      if (fileToSend) {
        if (fileTextToSend) {
          promptWithAttachedFile = `
            ATTACHED CLIENT FILE: ${fileToSend.name}
            --------------------------------------------------
            ${fileTextToSend}
            --------------------------------------------------
            
            CLIENT QUERY: ${text}
          `;
        } else {
          promptWithAttachedFile = `
            ATTACHED CLIENT FILE: ${fileToSend.name} [MIME: ${fileToSend.type}].
            
            CLIENT QUERY: ${text}
          `;
        }
      }

      const fullPrompt = `
        System Protocol: You are the high-density financial advisor intelligence named VANTAGE.
        Your style is analytical, precise, neat, objective, and deeply professional.
        Avoid verbose marketing language, but keep insights actionable, focusing on optimization.

        User Environment Metadata:
        - Active Account Lists: ${balancesContext.map(b => `${b.name}: ${b.balance}`).join(', ')}
        - 30-Day Ledger Logs: ${recentTxs.map(t => `${t.date} | ${t.category}: ${t.amount} (${t.account})`).join('; ')}
        ${lifeProfile}

        Current conversation context:
        ${chatHistory}

        New User Command: "${promptWithAttachedFile}"
        
        Provide your strategic financial assessment. Keep paragraphs short and utilize bullet points when listing metrics. Use direct uppercase headings where relevant. Do not output code blocks.
      `;

      let imageParam = undefined;
      if (fileToSend && fileBase64ToSend) {
        imageParam = {
          data: fileBase64ToSend,
          mimeType: fileToSend.type || 'application/pdf'
        };
      }

      const aiResponseText = await generateAIContent(fullPrompt, imageParam);

      const aiMsg: Message = {
        id: `ai-${Date.now()}-${Math.random()}`,
        sender: 'ai',
        text: aiResponseText || 'Neural connection timed out. System restored.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (error: any) {
      console.error('Core loop advisor failure:', error);
      const errMsg: Message = {
        id: `ai-err-${Date.now()}`,
        sender: 'ai',
        text: error.message || 'System error. AI model interface unreachable.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4">
        {/* Backdrop overlay */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Modal Window Panel */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="assistant-modal-window relative w-full max-w-[380px] md:max-w-[440px] bg-[#111214] border border-white/5 rounded-2xl md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[85vh] mx-auto"
        >
          {/* Dynamic styling overlays strictly obeying rules: Inter / Google Sans fonts without bold unless page/main header or section titles */}
          <style>{`
            .assistant-modal-window {
              font-family: 'Google Sans', sans-serif !important;
            }
            .assistant-modal-window #assistant-main-title {
              font-family: 'Google Sans', sans-serif !important;
              font-weight: 700 !important;
            }
            .assistant-modal-window h1,
            .assistant-modal-window h2:not(#assistant-main-title),
            .assistant-modal-window h3,
            .assistant-modal-window h5,
            .assistant-modal-window span,
            .assistant-modal-window p,
            .assistant-modal-window button,
            .assistant-modal-window div,
            .assistant-modal-window input {
              font-family: 'Google Sans', sans-serif !important;
              font-weight: 400;
            }
            .assistant-modal-window .font-weight-700,
            .assistant-modal-window .font-bold,
            .assistant-modal-window h4,
            .assistant-modal-window b,
            .assistant-modal-window strong {
              font-weight: 700 !important;
            }
          `}</style>

          {/* Header to eliminate text bleeding */}
          <div className="p-3 sm:p-4 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-vantage-green/15 flex items-center justify-center border border-vantage-green/35 shrink-0">
                <Sparkles size={14} className="text-[#A6DDB1]" />
              </div>
              <div className="flex flex-col">
                <h2 id="assistant-main-title" className="text-xs font-bold uppercase tracking-[0.3em] leading-none text-white">VANTAGE INSIGHTS</h2>
                <span className="text-[8px] text-neutral-400 uppercase tracking-[0.2em] font-normal mt-1 block">Gemini Generative Node</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  title="Purge session chat history"
                  className="w-8 h-8 md:w-9 md:h-9 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-red-400 rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 border-none outline-none"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button 
                type="button"
                onClick={onClose}
                className="w-8 h-8 md:w-9 md:h-9 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg flex items-center justify-center transition-all cursor-pointer active:scale-95 border-none outline-none"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Core Content Area with high density padding (p-4 on mobile and p-5 on tablet/desktop) and tight margins */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3.5 scrollbar-hide flex flex-col" ref={scrollRef}>
            {!isPremium ? (
              <div className="my-auto w-full">
                <PremiumMarketingCard 
                  featureName="Vantage Assistant" 
                  description="Leverage bespoke multi-turn conversational audits, comprehensive burn velocity summaries, and active capital analytics." 
                />
              </div>
            ) : !isInsightsEnabled ? (
              <div className="my-auto text-center flex flex-col items-center gap-2 p-6 bg-neutral-900/30 border border-white/5 rounded-2xl">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle size={20} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-white font-normal uppercase tracking-wider text-[11px]">AI Insights Inactive</h3>
                  <p className="text-[10px] text-neutral-400 font-normal uppercase tracking-wider mt-1.5 leading-relaxed">
                    Please enable 'Gemini AI Insights' in your Settings menu to permit this device to query core account balances securely.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                {/* Action card button wrapper */}
                <div className="w-full shrink-0">
                  {receiptScanning ? (
                    /* Animated skeleton loader state */
                    <div className="w-full p-4 bg-neutral-900/40 border border-dashed border-vantage-green/30 rounded-2xl flex flex-col gap-3 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center">
                          <RefreshCw size={13} className="text-vantage-green animate-spin" />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                          <div className="h-3 w-[120px] bg-neutral-800 rounded animate-pulse" />
                          <div className="h-2 w-[80px] bg-neutral-800 rounded animate-pulse mt-1" />
                        </div>
                      </div>
                      <div className="text-xs text-neutral-400 uppercase tracking-widest pl-1 font-normal animate-pulse">
                        Vantage AI is reading your receipt...
                      </div>
                    </div>
                  ) : (
                    /* Scan New Receipt camera/upload area card button */
                    <button
                      onClick={() => receiptFileInputRef.current?.click()}
                      className="w-full p-4 bg-neutral-900/45 hover:bg-neutral-900/70 border border-dashed border-neutral-700/60 hover:border-vantage-green/50 rounded-2xl flex items-center justify-between text-left transition-all active:scale-[0.99] group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-vantage-green/10 flex items-center justify-center border border-vantage-green/20 group-hover:bg-vantage-green/20 transition-all shrink-0">
                          <Camera size={16} className="text-vantage-green" />
                        </div>
                        <div className="flex flex-col">
                          <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs font-bold uppercase tracking-widest text-white">
                            Scan New Receipt
                          </span>
                          <span className="text-[9px] text-neutral-400 uppercase tracking-wider mt-0.5 font-normal">
                            Auto-extract price, merchant & details
                          </span>
                        </div>
                      </div>
                      <Upload size={14} className="text-neutral-500 group-hover:text-vantage-green transition-colors mr-1 shrink-0" />
                    </button>
                  )}
                  <input
                    type="file"
                    ref={receiptFileInputRef}
                    onChange={handleReceiptScan}
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                  />
                  {receiptScanError && (
                    <div className="mt-2 text-[10px] text-red-400 uppercase tracking-wider font-normal flex items-center gap-1.5 px-1">
                      <AlertTriangle size={10} />
                      <span>{receiptScanError}</span>
                    </div>
                  )}
                </div>

                {messages.length === 0 ? (
                  // Empty Welcome State
                  <div className="my-auto flex flex-col gap-2 w-full text-center py-2 shrink-0">
                    <div className="space-y-1">
                      <h1 className="text-[clamp(16px,4.5vw,26px)] font-normal text-white leading-tight uppercase tracking-tight">
                        Quantum Ledger.<br/>
                        <span className="text-vantage-green font-normal">Analyze Capital.</span>
                      </h1>
                      <p className="text-[clamp(8px,2vw,10px)] text-[#A0AEC0] uppercase tracking-[0.25em] font-normal">
                        Connected to encrypted database paths
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 text-left mt-2">
                      <span className="text-[clamp(8px,2vw,10.5px)] font-normal text-[#A0AEC0] uppercase tracking-[0.15em] pl-1">Tactical Exploration Query</span>
                      {suggestions.map((s, idx) => (
                        <button
                          key={`action-item-${s}-${idx}`}
                          onClick={() => handleSendMessage(s)}
                          className="p-2.5 bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[#1E293B] border border-neutral-300 rounded-xl text-left font-normal text-[clamp(11px,3.2vw,14px)] uppercase tracking-wide flex items-center justify-between group transition-all cursor-pointer"
                        >
                          <span className="font-normal">{s}</span>
                          <Send size={11} className="opacity-0 group-hover:opacity-100 transition-opacity text-vantage-green" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Active Conversation Thread
                  <div className="space-y-2 flex-1">
                {messages.map((message) => (
                  <div 
                     key={message.id} 
                     className={`flex flex-col ${message.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1.5 text-[#A0AEC0] font-normal text-[9px] uppercase tracking-widest">
                      {message.sender === 'user' ? (
                        <>
                          <span>Audit Request</span>
                          <User size={9} className="text-neutral-500" />
                        </>
                      ) : (
                        <>
                          <div className="text-vantage-green flex items-center gap-1.5 font-normal">
                            <Bot size={9} className="text-vantage-green" />
                            <span>Vantage Core Node</span>
                            {message.success && (
                              <motion.span 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1 ml-1.5 px-1 py-0.5 text-[#00FF88] bg-[#00FF88]/10 border border-[#00FF88]/30 rounded text-[7px] font-normal tracking-widest uppercase animate-pulse"
                              >
                                <Check size={7} className="stroke-[3]" />
                                <span>VERIFIED</span>
                              </motion.span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {message.sender === 'user' ? (
                      // Slim Obsidian Style Chat Bubbles for User Message
                      <div className="bg-[#1A1D24] text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-[85%] border border-white/10 shadow-lg">
                        <p className="text-[11px] sm:text-xs font-normal leading-relaxed whitespace-pre-wrap">{message.text}</p>
                      </div>
                    ) : (
                      // Emerald Highlight & Slim Obsidian Style for AI Agent Response
                      <div className="bg-[#111318] text-[#F8F9FA] rounded-2xl rounded-tl-none px-4 py-3.5 max-w-[90%] border-l-4 border-l-vantage-green border-y border-r border-[#2D3748]/30 shadow-xl relative overflow-hidden flex flex-col gap-3.5 w-full">
                        <div className="text-[11px] sm:text-xs font-normal leading-relaxed whitespace-pre-wrap tracking-wide text-neutral-200 w-full">
                          {renderMessageText(message.text, message.id)}
                        </div>

                        {message.pendingAction && !message.pendingAction.confirmed && (
                          <div className="flex flex-col gap-2.5 border-t border-white/5 pt-3.5 mt-1">
                            {message.pendingAction.error && (
                              <div className="p-2.5 bg-red-500/10 border border-red-500/25 rounded-xl flex items-center gap-2">
                                <AlertTriangle size={12} className="text-red-500 shrink-0" />
                                <span className="text-[9px] text-red-400 font-normal tracking-wide uppercase whitespace-pre-wrap break-all">
                                  Firebase Error: {message.pendingAction.error}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => abortAssistantAction(message.id)}
                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[9px] font-normal rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Abort
                              </button>
                              <button
                                onClick={() => confirmAssistantAction(message.id, message.pendingAction!.name, message.pendingAction!.args)}
                                className="px-2.5 py-1 bg-vantage-green hover:bg-emerald-600 text-white text-[9px] font-normal rounded-lg uppercase tracking-wider shadow-lg active:scale-95 transition-all cursor-pointer"
                              >
                                Confirm Protocol
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* AI Analysing / Thinking Status Spinner */}
                {loading && (
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-1.5 mb-1 px-1.5 text-vantage-green font-normal text-[9px] uppercase tracking-widest animate-pulse">
                      <Bot size={9} className="text-vantage-green animate-spin" />
                      <span>Resolving Balances...</span>
                    </div>
                    <div className="bg-[#111318]/50 p-4 rounded-2xl rounded-tl-none flex items-center gap-3 border border-white/5 shadow-md">
                      <div className="w-4 h-4 border-2 border-vantage-green/20 border-t-vantage-green rounded-full animate-spin"></div>
                      <span className="text-[9px] uppercase font-normal tracking-widest text-[#A0AEC0]">Accessing Secure Vault API...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
          {/* Footer Input Controls & Disclaimer Panel with reduced padding */}
          <div className="p-3 sm:p-3.5 bg-[#0E1015] border-t border-vantage-text/5 dark:border-white/5 flex flex-col gap-2">
            {voiceError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                <span className="text-[clamp(9px,2.5vw,11px)] text-red-500 font-normal">{voiceError}</span>
                <button type="button" onClick={() => setVoiceError(null)} className="ml-auto text-red-500 hover:text-red-400">
                  <X size={10} />
                </button>
              </div>
            )}

            {fileError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2">
                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(9px,2.5vw,11px)] text-red-500 font-normal">{fileError}</span>
                <button type="button" onClick={() => setFileError(null)} className="ml-auto text-red-500 hover:text-red-400">
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Thumbnail Chip Preview of Attached Local Document */}
            {selectedFile && (
              <div className="flex items-center gap-2 p-1.5 bg-[#1A1D24] border border-white/5 rounded-lg w-fit max-w-full">
                <Paperclip size={10} className="text-[#A6DDB1] shrink-0 animate-pulse" />
                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-slate-300 truncate max-w-[180px] uppercase tracking-wider">
                  {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)}MB)
                </span>
                <button 
                  type="button" 
                  onClick={handleRemoveFile} 
                  className="w-4 h-4 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer border-none outline-none"
                >
                  <X size={8} />
                </button>
              </div>
            )}

            {/* Input Action Form with left Paperclip trigger */}
            {isPremium && (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage(queryInput);
                }}
                className="flex items-center gap-2 h-11 max-h-[44px]"
              >
                {/* Paperclip Button */}
                <button
                  type="button"
                  onClick={triggerFileSelect}
                  className="w-10 h-10 rounded-xl bg-[#1A1D24] border border-white/5 hover:bg-[#252A35] flex items-center justify-center transition-all cursor-pointer text-neutral-400 hover:text-[#A6DDB1] outline-none shrink-0"
                  title="Attach Local Document (.pdf, .docx, .txt, spreadsheets)"
                >
                  <Paperclip size={15} />
                </button>
                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls,.ods"
                  className="hidden"
                />

                <div className="relative flex-1 h-11 max-h-[44px]">
                  <input 
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    disabled={loading}
                    placeholder="Inquire about cash flows or category optimizations..."
                    className="w-full h-11 bg-[#1A1D24] border border-white/5 hover:border-white/10 focus:border-vantage-green rounded-xl pl-4 pr-24 text-[clamp(11px,2.8vw,13px)] placeholder:text-[clamp(9.5px,2.4vw,11.5px)] text-white outline-none transition-all placeholder:text-neutral-500 font-normal uppercase tracking-wider shadow-inner"
                    style={{ height: '44px', maxHeight: '44px' }}
                  />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={startListening}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border border-white/5 ${
                        isListening 
                          ? 'bg-red-500/20 text-red-500 animate-pulse border-red-500/40' 
                          : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
                      }`}
                      title="Voice input"
                    >
                      <Mic size={14} className={isListening ? "animate-bounce" : ""} />
                    </button>
                    <button
                      type="submit"
                      disabled={(!queryInput.trim() && !selectedFile) || loading}
                      style={{ 
                        backgroundColor: (queryInput.trim() || selectedFile) && !loading ? '#A6DDB1' : undefined,
                        color: (queryInput.trim() || selectedFile) && !loading ? '#1E293B' : undefined
                      }}
                      className="w-8 h-8 bg-vantage-green text-white rounded-lg hover:brightness-95 active:scale-95 transition-all disabled:opacity-30 disabled:hover:opacity-30 flex items-center justify-center cursor-pointer shadow-lg"
                    >
                      <Send size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Legal compliance foot disclaimer */}
            <div className="text-center text-[clamp(7.5px,1.8vw,11px)] font-normal text-neutral-500 uppercase tracking-widest leading-relaxed py-1 px-2 border-t border-white/[0.02] pt-2 mt-0.5">
              Powered by Google Gemini. AI may provide inaccurate financial estimates; always verify with your core ledger.
            </div>
          </div>
        </motion.div>

        {isReceiptPreviewOpen && receiptScanResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-[20px] bg-[#FFFFFF] text-[#111318] p-5 shadow-2xl relative border border-neutral-100 flex flex-col gap-4 animate-none"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 font-bold" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                    Vantage AI Scan Review
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsReceiptPreviewOpen(false)}
                  className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900 flex items-center justify-center transition-all cursor-pointer border-none outline-none"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Amount Section */}
              <div className="text-center py-2 flex flex-col items-center shrink-0">
                <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-normal mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  Total Amount Extractions
                </span>
                {(() => {
                  const chosenAccount = accounts.find(a => a.id === targetAccountId) || accounts[0];
                  const accountCurrency = chosenAccount?.currency || 'AED';

                  const convertToAED_Local = (amount: number, fromCurrency: string): number => {
                    let normalizedCurrency = fromCurrency.toUpperCase().trim();
                    if (normalizedCurrency === '$') normalizedCurrency = 'USD';
                    if (normalizedCurrency === '€') normalizedCurrency = 'EUR';
                    if (normalizedCurrency === '£') normalizedCurrency = 'GBP';
                    if (normalizedCurrency === '¥') normalizedCurrency = 'JPY';
                    
                    const rateToAED = (exchangeRates && exchangeRates[normalizedCurrency]) || DEFAULT_RATES[normalizedCurrency as keyof typeof DEFAULT_RATES] || 1;
                    return amount * rateToAED;
                  };

                  const convertAEDToAccountCurrency = (amountAED: number, toCurrency: string): number => {
                    let normalized = toCurrency.toUpperCase().trim();
                    if (normalized === '$') normalized = 'USD';
                    if (normalized === '€') normalized = 'EUR';
                    if (normalized === '£') normalized = 'GBP';
                    if (normalized === '¥') normalized = 'JPY';
                    
                    const rateToAED = (exchangeRates && exchangeRates[normalized]) || DEFAULT_RATES[normalized as keyof typeof DEFAULT_RATES] || 1;
                    return amountAED / rateToAED;
                  };

                  const amountInAED = convertToAED_Local(Number(receiptScanResult.totalAmount) || 0, receiptScanResult.currency || 'AED');
                  const finalAmount = convertAEDToAccountCurrency(amountInAED, accountCurrency);

                  return (
                    <>
                      <div className="text-3xl font-bold tracking-tight text-neutral-900 flex items-baseline justify-center gap-1 leading-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                        {accountCurrency} {finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {accountCurrency.toUpperCase() !== 'AED' && (
                        <div className="text-[#10B981] text-[10px] font-bold uppercase tracking-widest mt-1.5 leading-none" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                          ≈ {amountInAED.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Compact Details Rows */}
              <div className="space-y-2 py-1 text-sm flex-1 overflow-y-auto">
                {/* Affects Account Dropdown Row */}
                <div className="flex flex-col gap-1 border-b border-neutral-100 pb-2">
                  <label 
                    className="text-[10px] uppercase tracking-wider text-neutral-400 font-normal block pl-0.5"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  >
                    Affects Account
                  </label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="w-full h-8 px-2 bg-[#FFFFFF] border border-neutral-200 rounded-lg text-xs text-neutral-800 font-normal outline-none focus:border-vantage-green transition-all cursor-pointer"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  >
                    {accounts.filter(a => !a.isArchived).map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Merchant */}
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2 pt-1 font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Merchant
                  </span>
                  <span className="text-neutral-800 font-normal text-xs uppercase text-right">
                    {receiptScanResult.merchantName || 'Unknown'}
                  </span>
                </div>

                {/* Date */}
                <div className="flex items-center justify-between border-b border-neutral-100 pb-2 font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Transaction Date
                  </span>
                  <span className="text-neutral-800 font-normal text-xs text-right text-neutral-700">
                    {receiptScanResult.date || 'Unknown'}
                  </span>
                </div>

                {/* AI recommendations */}
                <div className="flex items-center justify-between pt-1 font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Category
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-1 bg-[#10B981]/10 border border-[#10B981]/20 text-[#10B981] text-[9px] font-bold uppercase tracking-widest rounded-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                      {receiptScanResult.category || 'Other'}
                    </span>
                    {receiptScanResult.subcategory && (
                      <span className="px-2.5 py-1 bg-neutral-100 border border-neutral-200/60 text-neutral-500 text-[9px] font-bold uppercase tracking-widest rounded-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                        {receiptScanResult.subcategory}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handlePostReceiptScan}
                disabled={loading}
                className="w-full h-11 bg-neutral-900 hover:bg-neutral-850 text-[#FFFFFF] text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-lg hover:shadow-xl active:scale-[0.98] disabled:opacity-50 shrink-0"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  "Approve & Post"
                )}
              </button>
            </motion.div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
