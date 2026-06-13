import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, FileDown, Trash2, RefreshCw, ChevronLeft, ChevronDown, ChevronRight, Check, X, Square, CheckSquare, GitBranch, CalendarClock, Lock, Sparkles, Mic, Pencil } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, getDocs, writeBatch, doc, getDoc, deleteDoc, where, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { TransactionDetailModal } from './TransactionDetailModal';
import { MASTER_CATEGORIES } from '../lib/constants';
import { useVantageActions } from '../hooks/useVantageActions';
import { AddTransactionModal } from './AddTransactionModal';
import { AdContainer } from './AdContainer';
import { PremiumModal } from './PremiumModal';
import { getCachedAccessToken, deleteGoogleCalendarEvent, connectGoogleWorkspace, syncToGoogleTasks } from '../lib/googleAuth';
import { projectRecurringTransactions } from '../lib/projection';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  notes: string;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  description?: string;
  type: 'income' | 'expense' | 'transfer';
  emoji?: string;
  aiTag?: string;
  accountId: string;
  toAccountId?: string;
  status?: 'confirmed' | 'draft' | 'Pending Schedule' | 'scheduled' | 'Posted/Validated' | 'pending' | 'upcoming' | 'pending_confirmation';
  groupId?: string | null;
  transferSide?: 'sender' | 'receiver';
  hasMirror?: boolean;
  recurringId?: string;
  isSyncedToTasks?: boolean;
  googleTaskId?: string;
  isUpcoming?: boolean;
  isUpcomingSalaryAllocation?: boolean;
  salaryBreakdownPeriod?: string;
  parentTransferId?: string;
  correlationGroupId?: string;
  transferId?: string;
  nativeCurrency?: string;
  currency?: string;
}

interface TransactionsProps {
  profile: any;
  onUpdateProfile?: (updated: any) => void;
  filterAccountId?: string | null;
  accounts: any[];
  accountBalances: Record<string, number>;
  onClearFilter?: () => void;
  onBackToDashboard?: () => void;
  refreshGlobalBalances?: () => Promise<void>;
}

export const Transactions: React.FC<TransactionsProps> = ({ 
  profile, 
  onUpdateProfile,
  filterAccountId, 
  accounts: initialAccounts,
  accountBalances,
  onClearFilter, 
  onBackToDashboard,
  refreshGlobalBalances
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringRules, setRecurringRules] = useState<any[]>([]);
  const [isUpcomingExpanded, setIsUpcomingExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const { createAccount, addTransaction, setRecurringProtocol } = useVantageActions(profile?.uid);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'date' | 'category'>('date');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const isPremium = !!(profile?.isPremium || profile?.subscriptionTier === 'premium');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [cloningTx, setCloningTx] = useState<Transaction | null>(null);
  const [pulsingGroupId, setPulsingGroupId] = useState<string | null>(null);
  const [actionMenuTx, setActionMenuTx] = useState<Transaction | null>(null);
  
  // Edit Transaction States
  const [isEditingTx, setIsEditingTx] = useState(false);
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteConfirmTx, setDeleteConfirmTx] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [taskCreationTx, setTaskCreationTx] = useState<Transaction | null>(null);
  const [taskNote, setTaskNote] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskReminder, setTaskReminder] = useState(true);
  const [isSyncingTask, setIsSyncingTask] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        console.error("Failed to sync exchange rates in Transactions:", err);
      }
    };
    loadRates();
  }, []);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<any[]>(initialAccounts);

  const actionMenuAccount = actionMenuTx ? accounts.find(a => a.id === actionMenuTx.accountId) : null;
  const actionMenuNativeCurrency = actionMenuTx ? (actionMenuAccount?.currency || actionMenuTx.nativeCurrency || actionMenuTx.currency || 'AED') : 'AED';
  const profileBaseCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  const actionMenuRate = actionMenuTx ? ((exchangeRates && exchangeRates[actionMenuNativeCurrency]) || DEFAULT_RATES[actionMenuNativeCurrency as keyof typeof DEFAULT_RATES] || 1) : 1;
  const actionMenuBaseRateToAED = (exchangeRates && exchangeRates[profileBaseCurrency]) || DEFAULT_RATES[profileBaseCurrency as keyof typeof DEFAULT_RATES] || 1;
  const actionMenuTranslatedAmount = actionMenuTx ? ((actionMenuTx.amount * actionMenuRate) / actionMenuBaseRateToAED) : 0;
  
  // AI Discovery / Search State
  const [aiQuery, setAiQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilter, setAiFilter] = useState<{
    category?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    type?: string | null;
    notes?: string | null;
    accountId?: string | null;
    summary?: string | null;
    query?: string | null;
    isAggregation?: boolean;
  } | null>(null);

  const [pendingAction, setPendingAction] = useState<{
    name: 'createAccount' | 'addTransaction' | 'setRecurringProtocol' | 'createTransaction';
    args: any;
    confirmationText: string;
  } | null>(null);
  const [aiResponseStatus, setAiResponseStatus] = useState<string | null>(null);
  const [showSuccessCheck, setShowSuccessCheck] = useState(false);

  const recognitionRef = useRef<any>(null);

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

    setAiError(null);

    try {
      // Explicitly prompt for microphone media permission inside the iframe to trigger the browser's allowance state
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop tracks to release hardware device capture
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (permError: any) {
      console.warn("User did not grant microphone stream permission or iframe policy restricted access:", permError);
      setAiError("Microphone permission denied. Please grant microphone access in your browser settings to use voice search.");
      return;
    }

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsListening(true);
      setAiError(null);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiQuery(transcript);
      handleAISearch(transcript);
    };

    rec.onerror = (e: any) => {
      console.error("Speech Recognition Error Event:", e);
      const errorType = e?.error || "unknown";
      if (errorType === 'not-allowed') {
        setAiError("Microphone access is blocked. Click the microphone/lock icon in your browser's address bar to reset permissions.");
      } else if (errorType === 'no-speech') {
        // Suppress general silent timeouts from cluttering, or handle gracefully
        setAiError("No speech detected. Please speak clearly into your microphone.");
      } else {
        setAiError(`Voice input issue: ${errorType}`);
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

  const handleAISearch = async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsAiLoading(true);
    setAiError(null);
    setAiResponseStatus(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Vantage identity verification missing. Try logging in again.");
      
      const idToken = await user.getIdToken();
      
      const uniqueCats = Array.from(new Set([
        ...transactions.map(t => t.category),
        "Groceries", "Food", "Transport", "Rent", "Housing", "Entertainment", "Utilities", "Salary", "Income", "Vehicle", "Technology"
      ].filter(Boolean)));

      // Fetch client tier and custom key overrides using standard client SDK
      let subscriptionTier = profile?.subscriptionTier || 'free';
      let geminiKey = profile?.geminiKey || null;
      
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vantage-Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          query: queryText,
          categories: uniqueCats,
          accounts: accounts.map(a => ({ id: a.id, name: a.name })),
          geminiKey,
          subscriptionTier
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || "Search request fell short.");
      }
      
      const data = await response.json();
      if (data.functionCall) {
        handleFunctionCall(data.functionCall, queryText);
      } else if (data.filter) {
        setAiFilter({
          ...data.filter,
          isAggregation: !!data.isAggregation,
          summary: data.summary,
          query: queryText
        });
      } else {
        throw new Error("Vantage AI Search did not return a valid filter structure or command.");
      }
    } catch (err: any) {
      console.error("AI Search Error:", err);
      setAiError(err.message || "Request timed out or endpoint is temporarily unavailable.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleFunctionCall = (fnCall: { name: string; args: any }, originalQuery: string) => {
    const { name, args } = fnCall;
    
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

      setAiFilter({
        category: null,
        startDate: null,
        endDate: null,
        minAmount: null,
        maxAmount: null,
        type: null,
        notes: null,
        accountId: null,
        isAggregation: true,
        summary: insightSummary,
        query: originalQuery
      });
      return;
    }
    
    let confirmationText = "";
    if (name === 'createAccount') {
      const balanceVal = args.balance !== undefined ? args.balance : 0;
      const balanceStr = balanceVal.toLocaleString();
      const currencyStr = args.currency || profile?.currency || 'AED';
      confirmationText = `Ready to create: ${args.name || 'Checking Account'} with ${balanceStr} ${currencyStr}. Confirm?`;
    } else if (name === 'addTransaction' || name === 'createTransaction') {
      const amountVal = args.amount !== undefined ? args.amount : 0;
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
          setAiError("Which account should I use for this?");
          return;
        } else {
          targetAcc = accounts[0];
        }
      }
      
      if (!targetAcc) {
        setAiError("Which account should I use for this?");
        return;
      }
      
      confirmationText = `Ready to create: transaction for ${notesStr} of AED ${amountVal.toLocaleString()} (${typeStr}) in account ${targetAcc.name}. Confirm?`;
    } else if (name === 'setRecurringProtocol') {
      const amountVal = args.amount !== undefined ? args.amount : 0;
      const notesStr = args.notes || args.category || 'Subscription';
      confirmationText = `Ready to create: recurring protocol ${notesStr} with AED ${amountVal.toLocaleString()} (${args.frequency || 'monthly'}). Confirm?`;
    }
    
    setPendingAction({
      name: name as any,
      args,
      confirmationText
    });
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setIsAiLoading(true);
    setAiError(null);
    setAiResponseStatus(null);
    const userId = profile?.uid || auth.currentUser?.uid;
    if (!userId) {
      setAiError("Execution failed: Vantage identity verification missing.");
      setIsAiLoading(false);
      return;
    }
    
    try {
      const { name, args } = pendingAction;
      
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
        
        // Match specific success response pattern: "Protocol established. Your AED 10,000 Checking Account is now live."
        const formalBalanceStr = balanceVal.toLocaleString();
        setAiResponseStatus(`Protocol established. Your ${cur} ${formalBalanceStr} ${args.name || 'Checking Account'} is now live.`);
        
        // Trigger a visual 'Pop' glow on the Accounts tab
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
          if (reqAccountIdOrName) {
            throw new Error("Which account should I use for this?");
          } else {
            targetAcc = accounts[0];
          }
        }
        
        if (!targetAcc) {
          throw new Error("Which account should I use for this?");
        }
        
        const amtVal = parseFloat(args.amount) || 0;
        const txType = args.type || 'expense';
        
        const txData = {
          userId: userId,
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
        
        try {
          console.log('AI Transaction Payload:', txData);
          await addTransaction(txData);
        } catch (firebaseErr: any) {
          console.error("Firestore Write Failed inside execution block:", firebaseErr);
          const errCode = firebaseErr.code || '';
          const errMsg = firebaseErr.message || String(firebaseErr);
          const formattedMessage = errCode ? `${errCode}: ${errMsg}` : errMsg;
          throw new Error(formattedMessage);
        }
        
        setAiResponseStatus(`Protocol established. Your transaction for '${txData.notes}' of AED ${amtVal.toLocaleString()} has been safely written.`);
        
        // 5. UI Visual Confirmation Checkmark (temporary Vantage Emerald checkmark)
        setShowSuccessCheck(true);
        setTimeout(() => setShowSuccessCheck(false), 5000);
        
        // 3. Global State Hydration: call refreshGlobalBalances
        if (refreshGlobalBalances) {
          await refreshGlobalBalances();
        }
        
        // 5. Scroll the Activity tab to the top to show the new entry
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
          if (reqAccountIdOrName) {
            throw new Error("Which account should I use for this?");
          } else {
            targetAcc = accounts[0];
          }
        }
        
        if (!targetAcc) {
          throw new Error("Which account should I use for this?");
        }
        
        const amtVal = parseFloat(args.amount) || 0;
        
        const recData = {
          userId: userId,
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
        setAiResponseStatus(`Protocol established and first payment logged in Activity`);
        
        // UI Visual Confirmation Checkmark (temporary Vantage Emerald checkmark)
        setShowSuccessCheck(true);
        setTimeout(() => setShowSuccessCheck(false), 5000);
        
        // Global State Hydration: call refreshGlobalBalances
        if (refreshGlobalBalances) {
          await refreshGlobalBalances();
        }
        
        // Scroll the Activity tab to the top to show the new entry
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          const mainScrollable = document.querySelector('main') || document.querySelector('.overflow-y-auto');
          if (mainScrollable) {
            mainScrollable.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      }
      
      setPendingAction(null);
    } catch (err: any) {
      console.error(err);
      setAiResponseStatus(null);
      setAiError(`Execution failed: ${err.message || 'Operation fell short.'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleClearAiFilter = () => {
    setAiFilter(null);
    setAiQuery('');
  };
  
  // Advanced Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  
  // Selection Logic
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const longPressTimer = useRef<any>(null);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    if (!profile?.uid) return;
    
    const path = `users/${profile.uid}/transactions`;
    const q = query(collection(db, path), orderBy('date', 'desc'));
    
    const unsubscribeActivityLedger = onSnapshot(q, (snap) => {
      console.log('New Data Detected', { collection: 'transactions', count: snap.size });
      const txs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txs);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
      setLoading(false);
    });

    const recRef = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsubscribeRecurring = onSnapshot(recRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecurringRules(list);
    }, (err) => {
      console.warn("Failed to subscribe to recurring transactions in Activity:", err);
    });

    const qCat = query(collection(db, `users/${profile.uid}/custom_categories`));
    const unsubscribeCat = onSnapshot(qCat, async (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        try {
          const { fetchGlobalPresets } = await import('../lib/categoryUtils');
          const presets = await fetchGlobalPresets();
          list = presets.map((p, idx) => ({ id: `preset_${idx}`, ...p }));
        } catch (err) {
          list = MASTER_CATEGORIES.map((p, idx) => ({ id: `local_${idx}`, ...p }));
        }
      }
      setUserCategories(list);
    });

    return () => {
      unsubscribeActivityLedger();
      unsubscribeRecurring();
      unsubscribeCat();
    };
  }, [profile?.uid]);

  const closeActionSheet = () => {
    setActionMenuTx(null);
    setIsActionSheetOpen(false);
    setSelectedTransaction(null);
    setIsEditingTx(false);
    setEditMerchant('');
    setEditAmount('');
    setEditCategory('');
    setEditSubcategory('');
    setEditDate('');
    setEditNotes('');
  };

  const handleDeleteTransaction = async (transactionId: string, recurringId?: string, isTransfer?: boolean) => {
    if (!profile?.uid || !transactionId) return;
    setIsLoading(true);
    try {
      const txRef = doc(db, `users/${profile.uid}/transactions`, transactionId);

      // Clean up associated recurring definitions
      if (recurringId) {
        try {
          const recRef = doc(db, `users/${profile.uid}/recurringTransactions`, recurringId);
          const recSnap = await getDoc(recRef);
          if (recSnap.exists()) {
            const recData = recSnap.data();
            if (recData.isSyncedToCalendar && recData.gCalendarEventId) {
              const token = getCachedAccessToken();
              if (token) {
                try {
                  await deleteGoogleCalendarEvent(token, recData.gCalendarEventId);
                } catch (calErr) {
                  console.error("Failed to automatically delete calendar event:", calErr);
                }
              }
            }
            await deleteDoc(recRef);
          }
        } catch (recurringErr) {
          console.error("Associated recurring rule delete failed", recurringErr);
        }
      }

      // 1. Gather all relationship group tokens for cascading deletion
      const targetTx = transactions.find(t => t.id === transactionId);
      const tokens = new Set<string>();
      tokens.add(transactionId);
      if (targetTx) {
        if (targetTx.parentTransferId) tokens.add(targetTx.parentTransferId);
        if (targetTx.correlationGroupId) tokens.add(targetTx.correlationGroupId);
        if (targetTx.transferId) tokens.add(targetTx.transferId);
      }

      // 2. Perform rapid optimistic client-side deletion for an instant snappy UI
      setTransactions(prev => prev.filter(t => 
        !tokens.has(t.id) && 
        !(t.parentTransferId && tokens.has(t.parentTransferId)) && 
        !(t.correlationGroupId && tokens.has(t.correlationGroupId)) && 
        !(t.transferId && tokens.has(t.transferId))
      ));

      // 3. Find and append all related documents in firestore to delete
      const txsColRef = collection(db, `users/${profile.uid}/transactions`);
      const docsToDelete = new Set<string>();
      docsToDelete.add(transactionId);

      for (const token of tokens) {
        const q1 = query(txsColRef, where("transferId", "==", token));
        const s1 = await getDocs(q1);
        s1.forEach(d => docsToDelete.add(d.id));

        const q2 = query(txsColRef, where("parentTransferId", "==", token));
        const s2 = await getDocs(q2);
        s2.forEach(d => docsToDelete.add(d.id));

        const q3 = query(txsColRef, where("correlationGroupId", "==", token));
        const s3 = await getDocs(q3);
        s3.forEach(d => docsToDelete.add(d.id));
      }

      // 4. Batch delete all found docs
      const batch = writeBatch(db);
      docsToDelete.forEach(docId => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, docId));
      });
      await batch.commit();

      // Explicitly clean up layout/modal states
      closeActionSheet();
      setSelectedTx(null);
      setDeleteConfirmTx(null);
    } catch (error: any) {
      console.error("Ledger Deletion failed:", error);
      handleFirestoreError(error, OperationType.DELETE, `users/${profile.uid}/transactions/${transactionId}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEditedTransaction = async () => {
    if (!profile?.uid || !actionMenuTx) return;
    
    const amountVal = parseFloat(editAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setEditError("Please enter a valid amount cost greater than zero.");
      return;
    }
    if (!editMerchant.trim()) {
      setEditError("Please enter a merchant or payee title name.");
      return;
    }
    if (!editCategory) {
      setEditError("Please select a valid category.");
      return;
    }
    if (!editDate) {
      setEditError("Please select a transaction date.");
      return;
    }

    setIsLoading(true);
    setEditError(null);

    try {
      const txRef = doc(db, `users/${profile.uid}/transactions`, actionMenuTx.id);
      
      const payload: any = {
        notes: editMerchant.trim(),
        amount: amountVal,
        category: editCategory,
        subcategory: editSubcategory || '',
        date: editDate,
        description: editNotes.trim()
      };

      // Perform persistent Firestore write
      await updateDoc(txRef, payload);

      // Perform instant in-place client side recalculation/balancing to prevent layout stutters
      setTransactions(prev => prev.map(t => t.id === actionMenuTx.id ? {
        ...t,
        ...payload
      } : t));

      // Trigger global state/accounts update
      if (refreshGlobalBalances) {
        await refreshGlobalBalances();
      }

      closeActionSheet();
    } catch (err: any) {
      console.error("Failed to commit edited transaction details:", err);
      setEditError(err?.message || "An error occurred while saving transaction updates.");
    } finally {
      setIsLoading(false);
    }
  };

  // Combined Filtering Logic
  const combinedTransactions = React.useMemo(() => {
    const projected = projectRecurringTransactions(recurringRules, transactions, 60);
    return [...transactions, ...projected];
  }, [transactions, recurringRules]);

  const filteredTransactions = combinedTransactions.filter(tx => {
    // 0. Filter transactions with interval (templates)
    if ((tx as any).interval !== undefined && (tx as any).interval !== null) return false;

    // 0. Status Filter (Only confirmed by default in main list, unless in specific mode, or projected upcoming draft items)
    if (tx.status === 'draft' && !tx.isUpcoming) return false;

    // 0.1 Archive Filter (Hide transactions from archived accounts)
    const acc = accounts.find(a => a.id === tx.accountId);
    if (acc?.isArchived) return false;

    // 1. Dashboard Filter (Prop-based)
    if (filterAccountId && tx.accountId !== filterAccountId) return false;

    // 1.5 Premium AI Filter Logic
    if (aiFilter) {
      if (aiFilter.category && tx.category?.toLowerCase() !== aiFilter.category.toLowerCase()) return false;
      if (aiFilter.startDate && tx.date < aiFilter.startDate) return false;
      if (aiFilter.endDate && tx.date > aiFilter.endDate) return false;
      if (aiFilter.minAmount !== undefined && aiFilter.minAmount !== null && tx.amount < aiFilter.minAmount) return false;
      if (aiFilter.maxAmount !== undefined && aiFilter.maxAmount !== null && tx.amount > aiFilter.maxAmount) return false;
      if (aiFilter.type && tx.type !== aiFilter.type) return false;
      if (aiFilter.accountId && tx.accountId !== aiFilter.accountId) return false;
      if (aiFilter.notes) {
        const notesQ = aiFilter.notes.toLowerCase();
        const matchNotes = tx.notes?.toLowerCase().includes(notesQ);
        if (!matchNotes) return false;
      }
    }

    // 2. Search Query (Notes, Category, Subcat, Type, Amount)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchNotes = tx.notes?.toLowerCase().includes(q);
      const matchCat = tx.category?.toLowerCase().includes(q);
      const matchSub = tx.subcategory?.toLowerCase().includes(q);
      const matchType = tx.type?.toLowerCase().includes(q);
      const matchAmount = tx.amount.toString().includes(q);
      if (!(matchNotes || matchCat || matchSub || matchType || matchAmount)) return false;
    }

    // 3. Date Range
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo && tx.date > dateTo) return false;

    // 4. Amount Range
    if (minAmount && tx.amount < parseFloat(minAmount)) return false;
    if (maxAmount && tx.amount > parseFloat(maxAmount)) return false;

    // 5. Account Selection
    if (selectedAccountIds.length > 0) {
      const belongsToSelected = selectedAccountIds.includes(tx.accountId);
      if (!belongsToSelected) return false;
    }

    return true;
  });

  const today = new Date().toLocaleDateString('en-CA');

  const upcomingTransactions = React.useMemo(() => 
    filteredTransactions.filter(tx => 
      tx.status === 'pending' || 
      tx.status === 'upcoming' || 
      tx.status === 'pending_confirmation' ||
      tx.isUpcomingSalaryAllocation || 
      (tx.date > today && tx.status !== 'Posted/Validated' && tx.status !== 'confirmed')
    )
  , [filteredTransactions, today]);

  const pastTransactions = React.useMemo(() => 
    filteredTransactions.filter(tx => 
      tx.status !== 'draft' &&
      tx.status !== 'pending_confirmation' &&
      !(tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) && 
      (tx.date <= today || tx.status === 'Posted/Validated' || tx.status === 'confirmed')
    )
  , [filteredTransactions, today]);

  const groupedPastTransactions = React.useMemo(() => {
    const groups: Record<string, typeof pastTransactions> = {};
    pastTransactions.forEach(tx => {
      const cat = tx.category || 'Other';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(tx);
    });
    // Sort within each category by date descending
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
    return groups;
  }, [pastTransactions]);

  const categoryTotals = React.useMemo(() => {
    const totals: Record<string, { income: number; expense: number; net: number }> = {};
    Object.entries(groupedPastTransactions).forEach(([cat, txs]) => {
      let income = 0;
      let expense = 0;
      txs.forEach(tx => {
        let isOutflow = tx.type === 'expense';
        if (tx.type === 'transfer') {
          isOutflow = tx.transferSide !== 'receiver';
        }
        if (isOutflow) {
          expense += tx.amount;
        } else {
          income += tx.amount;
        }
      });
      totals[cat] = { income, expense, net: income - expense };
    });
    return totals;
  }, [groupedPastTransactions]);

  React.useEffect(() => {
    const categories = Object.keys(groupedPastTransactions);
    if (categories.length > 0) {
      // If we don't have a category selected, or the selected one isn't in current list
      if (!selectedCategory || !groupedPastTransactions[selectedCategory]) {
        setSelectedCategory(categories[0]);
      }
    } else {
      setSelectedCategory(null);
    }
  }, [groupedPastTransactions, selectedCategory]);

  // Calculate Account Metrics for Filter View
  const accountMetrics = React.useMemo(() => {
    if (!filterAccountId) return null;
    
    // We use transactions <= today to get the true current flow
    const accountSpecificTxs = transactions.filter(tx => tx.accountId === filterAccountId && tx.date <= today);
    
    let inflow = 0;
    let outflow = 0;

    accountSpecificTxs.forEach(tx => {
      const isOutflow = tx.type === 'expense' || (tx.type === 'transfer' && tx.transferSide === 'sender') || (tx.type === 'transfer' && !tx.transferSide);
      const isInflow = tx.type === 'income' || (tx.type === 'transfer' && tx.transferSide === 'receiver');

      if (isInflow) {
        inflow += tx.amount;
      } else if (isOutflow) {
        outflow += tx.amount;
      }
    });

    return {
      inflow,
      outflow,
      net: inflow - outflow
    };
  }, [transactions, filterAccountId]);

  const totalFilteredAmount = React.useMemo(() => {
    // We want the balance ONLY including transactions <= today
    const activeAccIds = filterAccountId ? [filterAccountId] : (selectedAccountIds.length > 0 ? selectedAccountIds : accounts.map(a => a.id));
    
    // Sum only past transactions for these accounts
    return transactions
      .filter(tx => tx.date <= today && activeAccIds.includes(tx.accountId))
      .reduce((sum, tx) => {
        if (tx.type === 'income') return sum + tx.amount;
        if (tx.type === 'expense') return sum - tx.amount;
        if (tx.type === 'transfer') {
          let delta = 0;
          if (tx.transferSide === 'receiver') delta += tx.amount;
          else if (tx.transferSide === 'sender') delta -= tx.amount;
          else delta -= tx.amount; // Fallback
          return sum + delta;
        }
        return sum;
      }, 0);
  }, [transactions, accounts, filterAccountId, selectedAccountIds, today]);

  const aiFilteredSpentSum = React.useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  const aiFilteredIncomeSum = React.useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  const totalFutureCommitment = React.useMemo(() => {
    return upcomingTransactions.reduce((sum, tx) => {
      // Sum expenses as positive commitment, income as negative
      if (tx.type === 'expense') return sum + tx.amount;
      if (tx.type === 'income') return sum - tx.amount;
      return sum;
    }, 0);
  }, [upcomingTransactions]);

  const clearAllFilters = () => {
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setSelectedAccountIds([]);
    setSearchQuery('');
  };

  const handleExportCSV = () => {
    try {
      const headers = ["Date", "Description/Merchant", "Category", "Subcategory", "Account", "Type", "Amount", "Currency", "Status", "Notes"];
      
      const rows = filteredTransactions.map(tx => {
        const account = accounts.find(a => a.id === tx.accountId);
        const accountName = account ? account.name : "Unknown Account";
        const txCurrency = account?.currency || tx.nativeCurrency || tx.currency || profile?.baseCurrency || profile?.currency || 'AED';
        
        // Escape quotes in text values
        const cleanNotes = (tx.notes || '').replace(/"/g, '""');
        const cleanDesc = (tx.description || '').replace(/"/g, '""');
        const cleanCat = (tx.category || '').replace(/"/g, '""');
        const cleanSub = (tx.subcategory || tx.subCategory || '').replace(/"/g, '""');
        
        return [
          tx.date,
          `"${cleanNotes}"`,
          `"${cleanCat}"`,
          `"${cleanSub}"`,
          `"${accountName}"`,
          tx.type,
          tx.amount,
          txCurrency,
          tx.status || 'confirmed',
          `"${cleanDesc}"`
        ];
      });

      const csvContent = [
        headers.join(","),
        ...rows.map(e => e.join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `Vantage_Financial_Activity_${timestamp}.csv`;
      link.setAttribute("download", fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export financial activity:", err);
    }
  };

  const toggleAccountFilter = (id: string) => {
    if (selectedAccountIds.includes(id)) {
      setSelectedAccountIds(selectedAccountIds.filter(a => a !== id));
    } else {
      setSelectedAccountIds([...selectedAccountIds, id]);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
    if (newSelected.size === 0) setIsSelectionMode(false);
  };

  const handleLongPress = (id: string) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const handleDelete = async () => {
    if (!profile?.uid || selectedIds.size === 0) return;
    setIsDeleting(true);
    
    try {
      const batch = writeBatch(db);
      const recurringIdsToDelete = new Set<string>();

      // 1. Accumulate relationship tokens from all selected transactions
      const tokens = new Set<string>();
      selectedIds.forEach(id => {
        tokens.add(id);
        const foundTx = transactions.find(t => t.id === id);
        if (foundTx) {
          if (foundTx.recurringId) {
            recurringIdsToDelete.add(foundTx.recurringId);
          }
          if (foundTx.parentTransferId) tokens.add(foundTx.parentTransferId);
          if (foundTx.correlationGroupId) tokens.add(foundTx.correlationGroupId);
          if (foundTx.transferId) tokens.add(foundTx.transferId);
        }
      });

      // 2. Client-side optimistic update for immediate, snappy row removal
      setTransactions(prev => prev.filter(t => 
        !tokens.has(t.id) && 
        !(t.parentTransferId && tokens.has(t.parentTransferId)) && 
        !(t.correlationGroupId && tokens.has(t.correlationGroupId)) && 
        !(t.transferId && tokens.has(t.transferId))
      ));

      // 3. Query all related transaction legs & fees to prevent data asymmetry
      const txsColRef = collection(db, `users/${profile.uid}/transactions`);
      const docsToDelete = new Set<string>();
      selectedIds.forEach(id => docsToDelete.add(id));

      for (const token of tokens) {
        const q1 = query(txsColRef, where("transferId", "==", token));
        const s1 = await getDocs(q1);
        s1.forEach(d => docsToDelete.add(d.id));

        const q2 = query(txsColRef, where("parentTransferId", "==", token));
        const s2 = await getDocs(q2);
        s2.forEach(d => docsToDelete.add(d.id));

        const q3 = query(txsColRef, where("correlationGroupId", "==", token));
        const s3 = await getDocs(q3);
        s3.forEach(d => docsToDelete.add(d.id));
      }

      // Add all target docs to batch delete
      docsToDelete.forEach(docId => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, docId));
      });

      // Also clean up Google Calendar event & delete the active recurring rule definition documents!
      for (const recId of recurringIdsToDelete) {
        try {
          const recRef = doc(db, `users/${profile.uid}/recurringTransactions`, recId);
          const recSnap = await getDoc(recRef);
          if (recSnap.exists()) {
            const recData = recSnap.data();
            if (recData.isSyncedToCalendar && recData.gCalendarEventId) {
              const token = getCachedAccessToken();
              if (token) {
                try {
                  await deleteGoogleCalendarEvent(token, recData.gCalendarEventId);
                } catch (calErr) {
                  console.error("Failed to delete automated calendar event in bulk deletion:", calErr);
                }
              }
            }
            batch.delete(recRef);
          }
        } catch (recurringErr) {
          console.error("Failed to delete associated recurring rule in bulk deletion:", recurringErr);
        }
      }

      await batch.commit();
      
      setIsSelectionMode(false);
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error("Bulk delete failed", err);
      alert("Could not delete transactions.");
    } finally {
      setIsDeleting(false);
    }
  };

  const triggerSplitPulse = (groupId: string | undefined | null) => {
    if (!groupId) return;
    setPulsingGroupId(groupId);
    setTimeout(() => setPulsingGroupId(null), 1500);
  };

  return (
    <div className="transactions-view-root bg-white min-h-screen pb-[10vh] [WebkitOverflowScrolling:touch]">
      <style>{`
        .transactions-view-root,
        .transactions-view-root * {
          font-family: 'Google Sans', sans-serif !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2) > span:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(2) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) {
          width: 296px !important;
          height: 49px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) {
          height: 40px !important;
        }
      `}</style>
      
      <div className="w-full max-w-[500px] mx-auto flex flex-col gap-6 px-4 md:px-0">
        <div 
          className="w-full flex items-center justify-between"
          style={{ 
            paddingLeft: '5px',
            paddingRight: '5px',
            paddingBottom: '5px',
            paddingTop: '5px', 
            height: '26.625px', 
            fontSize: '12px' 
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              {filterAccountId && (
                 <button 
                   onClick={onBackToDashboard}
                   className="p-1 -ml-1 text-vantage-green hover:bg-vantage-green/10 rounded-full transition-colors font-medium"
                   style={{ fontFamily: "'Google Sans', sans-serif" }}
                 >
                   <ChevronLeft size={16} />
                 </button>
              )}
              <h2 
                style={{ fontSize: '26px', lineHeight: '26px', fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                className="font-medium text-[#1E2229] tracking-tight"
              >
                {filterAccountId ? 'Account History' : 'Transactions'}
              </h2>
            </div>
            <p 
              style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1rem)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className="text-[#1E2229]/60 tracking-normal font-normal"
            >
               {filterAccountId ? 'Viewing Account Transactions' : 'All Transactions'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSelectionMode && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
              >
                 <span style={{ fontSize: 'clamp(10px, 2.5vw, 12px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-vantage-green">{selectedIds.size} selected</span>
                 <button 
                   type="button"
                   onClick={() => setShowDeleteConfirm(true)}
                   className="p-2 bg-rose-100 text-rose-600 rounded-xl hover:bg-rose-200 transition-all shadow-sm active:scale-95"
                 >
                    <Trash2 size={16} />
                 </button>
                 <button 
                   type="button"
                   onClick={() => {
                     setIsSelectionMode(false);
                     setSelectedIds(new Set());
                   }}
                   className="p-2 bg-vantage-card border border-vantage-text/10 text-vantage-muted rounded-xl hover:text-white"
                 >
                    <X size={16} />
                 </button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Premium Glassmorphic Bento Segment Bar with soft backlight glow */}
        <div className="relative w-full">
          {/* Soft backlight glow vector using brand signature color #A6DDB1 directly behind the glass layer */}
          <div className="absolute inset-0 bg-[#A6DDB1] rounded-[20px] blur-[30px] opacity-15 pointer-events-none" />
          
          <div 
            style={{
              background: 'rgba(255, 255, 255, 0.35)',
              backdropFilter: 'blur(25px) saturate(180%)',
              WebkitBackdropFilter: 'blur(25px) saturate(180%)',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.45)',
            }}
            className="relative w-full p-4 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] flex flex-col gap-3 overflow-hidden z-[10] max-w-[480px] mx-auto"
          >
            {/* Search Block Row - balanced on a single horizontal line with strict layout flexbox parameters (wrap: nowrap) */}
            <div className="flex flex-row items-center justify-between flex-nowrap gap-3 w-full">
              <div className="flex-1 flex items-center gap-2 bg-white/50 border border-[#1E2229]/10 rounded-full px-3.5 py-2.5 focus-within:border-[#A6DDB1] focus-within:bg-white/80 transition-all duration-200 min-w-0">
                <Search size={14} className="text-[#1E2229]/40 shrink-0" />
                <input 
                  type="text"
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-[#1E2229] placeholder-[#1E2229]/40 outline-offset-0 focus:outline-none focus:ring-0 p-0"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.95rem, 2.2vw, 1.15rem)', fontWeight: 500 }}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="text-[#1E2229]/50 hover:text-[#1E2229] transition-colors shrink-0">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Action Buttons Frame */}
              <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
                {/* Voice Search button */}
                <button 
                  type="button" 
                  onClick={startListening} 
                  className={`p-2.5 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center shrink-0 border ${
                    isListening 
                      ? 'bg-rose-100 text-rose-600 border-rose-200 animate-pulse' 
                      : 'bg-white/50 border-[#1E2229]/10 text-[#1E2229] hover:bg-white/80'
                  }`}
                  title="Voice Search"
                >
                  <Mic size={14} />
                </button>

                {/* Filter Trigger button */}
                <button 
                  type="button"
                  id="tour-search-input"
                  onClick={() => setIsFilterModalOpen(true)}
                  className={`p-2.5 rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center shrink-0 ${ 
                    (dateFrom || dateTo || minAmount || maxAmount || selectedAccountIds.length > 0) 
                      ? 'bg-[#A6DDB1]/25 border-[#A6DDB1] text-[#1E2229] font-medium' 
                      : 'bg-white/50 border-[#1E2229]/10 text-[#1E2229] hover:bg-white/80' 
                  }`}
                  title="Filter Activities"
                >
                  <Filter size={14} />
                </button>

                {/* Export CSV button */}
                <button 
                  type="button"
                  disabled={filteredTransactions.length === 0}
                  onClick={handleExportCSV}
                  className="p-2.5 bg-white/50 border border-[#1E2229]/10 rounded-full text-[#1E2229] hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer flex items-center justify-center shrink-0"
                  title="Export activities as CSV"
                >
                  <FileDown size={14} />
                </button>
              </div>
            </div>

            {/* Category Pill / Segment Switch Row - balanced cleanly on single horizontal lines with strict flexbox nowrap */}
            <div className="flex flex-row items-center justify-between flex-nowrap gap-4 w-full pt-3 border-t border-[#1E2229]/5">
              <span 
                style={{ fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                className="text-[#1E2229]/60 shrink-0 select-none whitespace-nowrap"
              >
                Arrange view
              </span>
              
              <div className="flex flex-row items-center gap-1.5 flex-nowrap bg-white/40 border border-[#1E2229]/10 rounded-full p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('date')}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)',
                    fontWeight: 400,
                    ...(viewMode === 'date' ? { background: 'rgba(166, 221, 177, 0.25)', borderColor: '#A6DDB1', color: '#1E2229', fontWeight: 500 } : {})
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full border border-transparent transition-all duration-200 whitespace-nowrap cursor-pointer ${
                    viewMode === 'date' 
                      ? '' 
                      : 'text-[#1E2229]/60 hover:text-[#1E2229] hover:bg-white/50'
                  }`}
                >
                  By Date
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('category')}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)',
                    fontWeight: 400,
                    ...(viewMode === 'category' ? { background: 'rgba(166, 221, 177, 0.25)', borderColor: '#A6DDB1', color: '#1E2229', fontWeight: 500 } : {})
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full border border-transparent transition-all duration-200 whitespace-nowrap cursor-pointer ${
                    viewMode === 'category' 
                      ? '' 
                      : 'text-[#1E2229]/60 hover:text-[#1E2229] hover:bg-white/50'
                  }`}
                >
                  By Category
                </button>
              </div>
            </div>
          </div>
        </div>

      {filterAccountId && accountMetrics && (
         <div className="w-full grid grid-cols-3 gap-2 px-1">
            {/* Net Flow */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-2 md:p-4 bg-white border border-neutral-100 rounded-xl flex flex-col gap-0.5 shadow-sm"
            >
               <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-neutral-400 tracking-wide leading-none">Net Flow</span>
               <span style={{ fontSize: 'clamp(11px, 2.8vw, 14px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className={`font-bold truncate leading-tight ${accountMetrics.net >= 0 ? 'text-[#1E2229]' : 'text-[#DC2626]'}`}>
                 {accounts.find(a => a.id === filterAccountId)?.currency || 'AED'} {accountMetrics.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </span>
            </motion.div>

            {/* Inflow */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.15 }}
              className="p-2 md:p-4 bg-white border border-neutral-100 rounded-xl flex flex-col gap-0.5 shadow-sm"
            >
               <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-neutral-400 tracking-wide leading-none">Inflow</span>
               <span style={{ fontSize: 'clamp(11px, 2.8vw, 14px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="font-bold text-[#A6DDB1] truncate leading-tight">
                 {accounts.find(a => a.id === filterAccountId)?.currency || 'AED'} {accountMetrics.inflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </span>
            </motion.div>

            {/* Outflow */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.15 }}
              className="p-2 md:p-4 bg-white border border-neutral-100 rounded-xl flex flex-col gap-0.5 shadow-sm"
            >
               <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-neutral-400 tracking-wide leading-none">Outflow</span>
               <span style={{ fontSize: 'clamp(11px, 2.8vw, 14px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="font-bold text-[#1E2229] truncate leading-tight">
                 {accounts.find(a => a.id === filterAccountId)?.currency || 'AED'} {accountMetrics.outflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
               </span>
            </motion.div>
         </div>
      )}
      
      {/* Search has been removed to maximize responsiveness as requested */}

      {aiError && (
        <div className="w-[95%] md:w-full mx-auto md:mx-0 p-3 bg-red-500/10 border border-red-500/20 rounded-[1rem] flex items-center gap-2 px-1">
          <span className="text-[2vw] md:text-xs text-red-500 font-bold">{aiError}</span>
          <button onClick={() => setAiError(null)} className="ml-auto text-red-500 hover:text-red-400">
            <X size={12} />
          </button>
        </div>
      )}

      {pendingAction && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-[95%] md:w-full mx-auto md:mx-0 p-5 bg-[#FFFFFF] border-[3px] border-[#000000] rounded-[1.25rem] shadow-2xl flex flex-col gap-4 text-black px-1"
        >
          <div className="flex items-center gap-2 border-b border-black/10 pb-2">
            <Sparkles size={16} className="text-[#000000]" />
            <span className="text-[2.2vw] md:text-xs font-black tracking-wide text-black/60">Vantage obsidian gateway</span>
          </div>
          <p className="text-[3.5vw] md:text-sm font-black text-black leading-snug">
            {pendingAction.confirmationText}
          </p>
          <div className="flex gap-2 justify-end">
            <button 
              onClick={() => setPendingAction(null)}
              className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-black text-[2.5vw] md:text-xs font-black rounded-[0.75rem] transition-colors tracking-wide"
            >
              Abort
            </button>
            <button 
              onClick={confirmPendingAction}
              className="px-4 py-2 bg-black hover:bg-neutral-800 text-white text-[2.5vw] md:text-xs font-black rounded-[0.75rem] transition-colors tracking-wide shadow-md"
            >
              Confirm protocol
            </button>
          </div>
        </motion.div>
      )}

      {aiResponseStatus && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-[95%] md:w-full mx-auto md:mx-0 p-4 bg-emerald-950 border border-[#00FF88]/30 rounded-[1.25rem] shadow-lg flex flex-col gap-1 text-white px-1"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#00FF88]" />
            <span className="text-[2.2vw] md:text-xs font-black tracking-wide text-[#00FF88] opacity-80">AI protocol compilation</span>
            {showSuccessCheck && (
              <motion.div 
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00FF88]/20 border border-[#00FF88]/40 text-[#00FF88] text-[9px] font-black tracking-wide"
              >
                <Check size={10} className="stroke-[3]" />
                <span>Success</span>
              </motion.div>
            )}
            <button 
              onClick={() => setAiResponseStatus(null)}
              className="ml-auto text-vantage-muted hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-[3.2vw] md:text-sm font-bold text-white normal-case flex items-center gap-2">
            {showSuccessCheck && (
              <Check size={18} className="text-[#00FF88] stroke-[3] shrink-0 animate-bounce" />
            )}
            <span>{aiResponseStatus}</span>
          </p>
        </motion.div>
      )}

      <div className="flex flex-col gap-6">
        {/* Statistics Banner with tighter padding boundaries and fluid text sizing to prevent warping or overlapping on narrow devices */}
        <div 
          style={{ height: '56.625px', borderRadius: '30px' }}
          className="w-full p-4 bg-white border border-neutral-100 flex items-center justify-between shadow-sm gap-2"
        >
           <div className="flex flex-col min-w-0 flex-1">
              <span style={{ fontSize: 'clamp(8px, 2vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-neutral-400 tracking-wide mb-0.5 truncate">Portfolio Balance</span>
              <span 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                className="text-[clamp(14px,4vw,20px)] text-[#1E2229] leading-tight flex items-baseline gap-1"
              >
                <span className="text-vantage-green text-[clamp(10px,2.5vw,13px)] font-bold">{profile?.currency || 'AED'}</span>
                <span className="font-bold text-[clamp(14px,4vw,20px)] select-all truncate">
                  {totalFilteredAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </span>
           </div>
           <div className="text-right shrink-0">
              <span style={{ fontSize: 'clamp(8px, 2vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-neutral-400 tracking-wide block mb-0.5">Total Entries</span>
              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[clamp(14px,4vw,20px)] font-bold text-vantage-green leading-none">{filteredTransactions.length}</span>
           </div>
        </div>

        {/* Aggregation Insight Panel for AI Discovery Bar */}
        {aiFilter && aiFilter.isAggregation && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-[95%] md:w-full mx-auto md:mx-0 p-4 bg-emerald-50 border border-emerald-500/20 rounded-xl flex flex-col gap-2 text-black shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-black" />
              <span className="text-[10px] md:text-xs font-black tracking-wide text-[#000000]/60">Vantage AI insights panel</span>
              <button 
                onClick={handleClearAiFilter}
                className="ml-auto text-black hover:opacity-75 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col">
              <p className="text-[12px] md:text-sm font-bold text-black normal-case">
                {aiFilter.summary || `Calculated aggregate values match for "${aiFilter.query}"`}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#000000]/10 pt-3">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-black/40">Total spend</span>
                  <span className="text-base md:text-lg font-black text-black">
                    {profile?.currency || 'AED'} {aiFilteredSpentSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-black/40">Entries matched</span>
                  <span className="text-base md:text-lg font-black text-black">
                    {filteredTransactions.length} operations
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="flex justify-center p-10">
            <div className="w-8 h-8 border-2 border-vantage-green border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="w-full text-center py-20 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
            <p className="text-xs text-neutral-400 tracking-[0.1em] font-normal leading-none">No operations found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 md:gap-10">
            {viewMode === 'date' ? (
              <>
                {/* Upcoming Section */}
                {upcomingTransactions.length > 0 && (
                  <div className="flex flex-col gap-1.5 md:gap-2.5 w-full">
                    <div 
                      className="w-full flex items-center justify-between border-b border-neutral-100 pb-2.5 px-2 cursor-pointer select-none hover:bg-neutral-50/50 active:scale-[0.99] transition-all"
                      style={{ borderRadius: '30px' }}
                      onClick={() => setIsUpcomingExpanded(!isUpcomingExpanded)}
                    >
                      <div className="flex items-center gap-2">
                        <CalendarClock size={16} className="text-[#A6DDB1]" />
                        <h3 style={{ fontSize: 'clamp(11px, 3.2vw, 13px)', fontFamily: "'Google Sans', sans-serif" }} className="font-normal text-[#1E2229] tracking-wide flex items-center gap-1.5">
                          Upcoming
                          {isUpcomingExpanded ? <ChevronDown size={14} className="text-neutral-400" /> : <ChevronRight size={14} className="text-neutral-400" />}
                        </h3>
                      </div>
                      <div className="flex flex-col items-end">
                        <span style={{ fontSize: '12px', fontFamily: "'Google Sans', sans-serif" }} className="font-normal text-neutral-400 tracking-wide leading-none mb-1">Commitment</span>
                        <span style={{ fontSize: '12px', fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">
                          {profile?.currency || 'AED'} {totalFutureCommitment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    {isUpcomingExpanded && (
                      <div className="flex flex-col gap-1.5 md:gap-2.5 w-full animate-fade-in">
                        {upcomingTransactions.map((tx, idx) => (
                          <TransactionRow 
                            key={`upcoming-${tx.id || 'missing'}-${idx}`}
                            tx={tx}
                            isUpcoming={true}
                            isSelected={selectedIds.has(tx.id)}
                            isPulsing={tx.groupId === pulsingGroupId}
                            isSelectionMode={isSelectionMode}
                            isTargeted={true}
                            filterAccountId={filterAccountId}
                            accounts={accounts}
                            onLongPress={handleLongPress}
                            onToggleSelection={toggleSelection}
                            onSelect={() => {
                              setActionMenuTx(tx);
                              setIsActionSheetOpen(true);
                              setSelectedTransaction(tx);
                              triggerSplitPulse(tx.groupId);
                            }}
                            onDelete={handleDeleteTransaction}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Activity List */}
                {pastTransactions.length > 0 && (
                  <div className="flex flex-col gap-1.5 md:gap-2.5 w-full">
                    <div className="w-full border-b border-neutral-100 pb-2.5 px-2 flex justify-between items-center">
                      {/* Unified Title for Bento Layout */}
                      <h3 style={{ fontSize: 'clamp(11px, 3.2vw, 13px)', fontFamily: "'Google Sans', sans-serif" }} className="font-normal text-vantage-muted tracking-wide">Activity log</h3>
                    </div>
                    <div className="flex flex-col gap-1.5 md:gap-2.5 w-full">
                      {pastTransactions.map((tx, idx) => (
                        <TransactionRow 
                          key={`past-${tx.id || 'missing'}-${idx}`}
                          tx={tx}
                          isUpcoming={false}
                          isSelected={selectedIds.has(tx.id)}
                          isPulsing={tx.groupId === pulsingGroupId}
                          isSelectionMode={isSelectionMode}
                          isTargeted={false}
                          filterAccountId={filterAccountId}
                          accounts={accounts}
                          onLongPress={handleLongPress}
                          onToggleSelection={toggleSelection}
                          onSelect={() => {
                            setActionMenuTx(tx);
                            setIsActionSheetOpen(true);
                            setSelectedTransaction(tx);
                            triggerSplitPulse(tx.groupId);
                          }}
                          onDelete={handleDeleteTransaction}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full flex flex-col gap-4">
                {/* Unified Accordion stack */}
                <div className="flex flex-col gap-2.5 w-full">
                  {Object.keys(groupedPastTransactions).length === 0 ? (
                    <div className="w-full text-center py-20 bg-neutral-50 rounded-2xl border border-dashed border-neutral-100">
                      <p className="text-xs text-[#1E2229] font-normal leading-none" style={{ fontFamily: "'Google Sans', sans-serif" }}>No operations found</p>
                    </div>
                  ) : (
                    Object.keys(groupedPastTransactions).map((cat, catIdx) => {
                      const txsInCat = groupedPastTransactions[cat] || [];
                      const isExpanded = expandedCategories[cat] === true;
                      const totals = categoryTotals[cat] || { net: 0, income: 0, expense: 0 };
                      const isOutflow = totals.net < 0;

                      return (
                        <div 
                          key={`cat-${cat}-${catIdx}`} 
                          style={{ backgroundColor: '#FFFFFF' }}
                          className="w-full bg-white border border-neutral-100 rounded-xl overflow-hidden shadow-sm flex flex-col"
                        >
                          <div 
                            onClick={() => {
                              setExpandedCategories(prev => ({
                                ...prev,
                                [cat]: !prev[cat]
                              }));
                            }}
                            style={{ fontFamily: "'Google Sans', sans-serif" }}
                            className="flex items-center justify-between p-3.5 bg-white cursor-pointer active:bg-neutral-50/50 select-none h-[clamp(44px,7vw,56px)]"
                          >
                            <div className="flex items-center gap-[clamp(8px,2vw,12px)] min-w-0 flex-1">
                              <span 
                                className="text-neutral-500 text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 font-normal shrink-0"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              >
                                {txsInCat.length}
                              </span>
                              <span 
                                className="text-[clamp(11px,2.8vw,13px)] text-black tracking-tight truncate font-normal"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              >
                                {cat}
                              </span>
                            </div>
                            <div className="flex items-center gap-[clamp(6px,1.5vw,10px)] shrink-0 pl-2">
                              <span 
                                className={`text-[clamp(11px,3vw,13px)] font-bold ${isOutflow ? 'text-crimson' : 'text-emerald-700'}`}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                              >
                                {isOutflow ? '-' : '+'}{Math.abs(totals.net).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {profile?.currency || 'AED'}
                              </span>
                              <button
                                type="button"
                                className="p-1 rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-black transition-colors"
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} className="stroke-[2.5]" />
                                ) : (
                                  <ChevronRight size={14} className="stroke-[2.5]" />
                                )}
                              </button>
                            </div>
                          </div>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18 }}
                                className="flex flex-col gap-1.5 p-2 bg-[#FAFCFD]/30 border-t border-neutral-50"
                              >
                                {txsInCat.map((tx, idx) => (
                                  <TransactionRow 
                                    key={`grouped-${cat}-${tx.id}-${idx}`}
                                    tx={tx}
                                    isUpcoming={false}
                                    isSelected={selectedIds.has(tx.id)}
                                    isPulsing={tx.groupId === pulsingGroupId}
                                    isSelectionMode={isSelectionMode}
                                    isTargeted={false}
                                    filterAccountId={filterAccountId}
                                    accounts={accounts}
                                    onLongPress={handleLongPress}
                                    onToggleSelection={toggleSelection}
                                    onSelect={() => {
                                      setActionMenuTx(tx);
                                      setIsActionSheetOpen(true);
                                      setSelectedTransaction(tx);
                                      triggerSplitPulse(tx.groupId);
                                    }}
                                    onDelete={handleDeleteTransaction}
                                  />
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Native report button removed as requested */}

      {/* Advanced Filter Modal */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsFilterModalOpen(false)}
               className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ y: 50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 50, opacity: 0 }}
               className="relative w-full max-w-[360px] bg-vantage-card rounded-[2rem] border border-vantage-text/10 shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
               style={{ fontFamily: "'Google Sans', sans-serif" }}
            >
               <div className="flex items-center justify-between mb-5">
                  <div className="flex flex-col">
                     <h3 className="text-vantage-text tracking-tight" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 4.2vw, 18px)' }}>Advanced filters</h3>
                     <p className="text-vantage-muted tracking-wide" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.5vw, 11px)' }}>Refine filter parameters</p>
                  </div>
                  <button 
                     onClick={() => setIsFilterModalOpen(false)}
                     className="p-1.5 bg-vantage-text/5 rounded-lg text-vantage-muted hover:text-vantage-text"
                  >
                     <X size={16} />
                  </button>
               </div>

               <div className="space-y-4">
                  {/* Date Range */}
                  <div className="space-y-1.5">
                     <label className="tracking-wide px-1.5" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Temporal range</label>
                     <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                           <input 
                             type="date"
                             value={dateFrom}
                             onChange={(e) => setDateFrom(e.target.value)}
                             className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                           />
                           <span className="absolute -top-1.5 left-3 px-1 bg-vantage-card tracking-wide text-vantage-muted" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>From</span>
                        </div>
                        <div className="relative">
                           <input 
                             type="date"
                             value={dateTo}
                             onChange={(e) => setDateTo(e.target.value)}
                             className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                           />
                           <span className="absolute -top-1.5 left-3 px-1 bg-vantage-card tracking-wide text-vantage-muted" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>To</span>
                        </div>
                     </div>
                  </div>

                  {/* Amount Range */}
                  <div className="space-y-1.5">
                     <label className="tracking-wide px-1.5" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Volume range</label>
                     <div className="grid grid-cols-2 gap-3">
                        <div className="relative">
                           <input 
                             type="number"
                             placeholder="Min"
                             value={minAmount}
                             onChange={(e) => setMinAmount(e.target.value)}
                             className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                           />
                           <span className="absolute -top-1.5 left-3 px-1 bg-vantage-card tracking-wide text-vantage-muted" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>Minimum</span>
                        </div>
                        <div className="relative">
                           <input 
                             type="number"
                             placeholder="Max"
                             value={maxAmount}
                             onChange={(e) => setMaxAmount(e.target.value)}
                             className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                           />
                           <span className="absolute -top-1.5 left-3 px-1 bg-vantage-card tracking-wide text-vantage-muted" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>Maximum</span>
                        </div>
                     </div>
                  </div>

                  {/* Accounts Multi-Selector */}
                  <div className="space-y-2">
                     <label className="tracking-wide px-1.5" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Account origins</label>
                     <div className="grid grid-cols-1 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                        {accounts.filter(a => !a.isArchived).map((acc, idx) => {
                           const isSelected = selectedAccountIds.includes(acc.id);
                           return (
                              <button
                                key={`filt-mob-${acc.id}-${idx}`}
                                onClick={() => toggleAccountFilter(acc.id)}
                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${isSelected ? 'bg-[#A6DDB1] border-[#A6DDB1]' : 'bg-slate-100 border-slate-200/60'}`}
                              >
                                 <div className="flex items-center gap-2.5 min-w-0">
                                    <div 
                                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all"
                                      style={{
                                        backgroundColor: isSelected ? '#000000' : 'transparent',
                                        borderColor: isSelected ? '#000000' : 'rgba(0,0,0,0.15)',
                                        color: isSelected ? '#A6DDB1' : 'transparent'
                                      }}
                                    >
                                       {isSelected ? <Check size={11} strokeWidth={4} /> : (acc.type === 'bank' ? <Square size={11} className="text-slate-400" /> : <X size={11} className="text-slate-400" />)}
                                    </div>
                                    <div className="flex flex-col items-start min-w-0">
                                       <span 
                                         className={`tracking-tight truncate max-w-full`}
                                         style={{ 
                                           fontFamily: "'Google Sans', sans-serif", 
                                           fontWeight: 400, 
                                           fontSize: 'clamp(10px, 2.6vw, 11px)',
                                           color: isSelected ? '#000000' : '#1E293B'
                                         }}
                                       >
                                         {acc.name}
                                       </span>
                                       <span 
                                         className="tracking-wide text-slate-500"
                                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(7px, 2.1vw, 8px)' }}
                                       >
                                         {acc.type}
                                       </span>
                                    </div>
                                 </div>
                                 <span 
                                   className="shrink-0 pl-1.5"
                                   style={{ 
                                     fontFamily: "'Google Sans', sans-serif", 
                                     fontWeight: 400, 
                                     fontSize: 'clamp(10px, 2.6vw, 11px)',
                                     color: isSelected ? '#000000' : '#1E293B'
                                   }}
                                 >
                                   {(accountBalances[acc.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                 </span>
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  <div className="flex gap-3 pt-3">
                     <button 
                       onClick={clearAllFilters}
                       className="flex-1 h-[38px] md:h-[42px] flex items-center justify-center bg-vantage-text/5 border border-vantage-text/10 rounded-xl hover:bg-vantage-text/10 transition-all tracking-wide"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontWeight: 400, 
                         fontSize: 'clamp(11px, 2.8vw, 13px)',
                         color: 'inherit'
                       }}
                     >
                       Reset filters
                     </button>
                     <button 
                       onClick={() => setIsFilterModalOpen(false)}
                       className="flex-1 h-[38px] md:h-[42px] flex items-center justify-center rounded-xl transition-all active:scale-95 text-center tracking-wide"
                       style={{ 
                         backgroundColor: '#A6DDB1', 
                         color: '#000000', 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontWeight: 400, 
                         fontSize: 'clamp(11px, 2.8vw, 13px)'
                       }}
                     >
                       Apply filters
                     </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 1. Action Menu Bottom Sheet */}
      <AnimatePresence>
        {actionMenuTx && (
          <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeActionSheet}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
                      <motion.div 
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-[340px] sm:max-w-[480px] bg-[rgba(255,255,255,0.6)] backdrop-blur-[24px] border border-[rgba(30,34,41,0.08)] rounded-t-[28px] sm:rounded-[24px] shadow-xl p-5 sm:p-6 flex flex-col items-center select-none z-10"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
            >
              {/* Drag Indicator */}
              <div className="w-12 h-1 bg-neutral-200 rounded-full mb-4 sm:hidden" />
              
              <AnimatePresence mode="wait">
                {!isEditingTx ? (
                  <motion.div 
                    key="actions-list-state"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="w-full flex flex-col items-center animate-none"
                  >
                    <div className="w-full text-center mb-5 sm:mb-6">
                      <h4 style={{ fontSize: 'clamp(13px, 3.8vw, 16px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-neutral-900 tracking-wide">
                        Transaction actions
                      </h4>
                      <p style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif'" }} className="text-neutral-500 mt-1 pb-1 px-2 truncate max-w-full flex items-center justify-center gap-1.5 flex-wrap">
                        <span className="text-neutral-500 font-normal" style={{ fontWeight: 400 }}>{actionMenuTx.notes || actionMenuTx.category} —</span>
                        <span className="font-bold text-neutral-900" style={{ fontWeight: 700 }}>
                          {actionMenuTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="font-normal text-neutral-500 text-[10px]" style={{ fontWeight: 400 }}>
                          {actionMenuNativeCurrency}
                        </span>
                        <span className="text-neutral-400 font-normal">|</span>
                        <span className="font-normal text-gray-400" style={{ fontWeight: 400 }}>≈</span>
                        <span className="font-bold text-gray-600" style={{ fontWeight: 700 }}>
                          {actionMenuTranslatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="font-normal text-gray-500 text-[10px]" style={{ fontWeight: 400 }}>{profileBaseCurrency}</span>
                      </p>
                    </div>
                    
                    <div className="w-full max-w-[340px] sm:max-w-2xl flex flex-col sm:flex-row gap-2.5 sm:gap-4 justify-center items-center">
                      {/* Edit Details */}
                      <button 
                        onClick={() => {
                          if (actionMenuTx) {
                            setEditMerchant(actionMenuTx.notes || actionMenuTx.category || '');
                            setEditAmount(actionMenuTx.amount.toString());
                            setEditCategory(actionMenuTx.category || '');
                            setEditSubcategory(actionMenuTx.subcategory || '');
                            setEditDate(actionMenuTx.date || '');
                            setEditNotes(actionMenuTx.description || '');
                            setEditError(null);
                            setIsEditingTx(true);
                          }
                        }}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="w-full h-[40px] flex items-center justify-between px-4 bg-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.6)] rounded-[30px] border border-[rgba(30,34,41,0.04)] text-left disabled:opacity-50 transition-all cursor-pointer group active:scale-[0.99] shadow-none"
                      >
                        <div className="flex items-center gap-3 pr-2 min-w-0">
                          <Pencil className="text-neutral-900 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" size={16} />
                          <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-900 tracking-wide truncate">
                            Edit details
                          </span>
                        </div>
                        <ChevronRight className="text-neutral-400 shrink-0 group-hover:text-neutral-700 transition-colors" size={14} />
                      </button>

                      {/* Make Recurring */}
                      <button 
                        onClick={() => {
                          const tx = actionMenuTx;
                          closeActionSheet();
                          setCloningTx(tx);
                        }}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="w-full h-[40px] flex items-center justify-between px-4 bg-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.6)] rounded-[30px] border border-[rgba(30,34,41,0.04)] text-left disabled:opacity-50 transition-all cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 pr-2 min-w-0">
                          <RefreshCw className="text-neutral-900 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" size={16} />
                          <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-900 tracking-wide truncate">
                            Make recurring
                          </span>
                        </div>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-400 font-normal shrink-0 sm:hidden">&rarr;</span>
                      </button>
                      
                      {/* Create Task */}
                      <button 
                        onClick={() => {
                          if (!isPremium) {
                            setIsPremiumModalOpen(true);
                            return;
                          }
                          const tx = actionMenuTx;
                          closeActionSheet();
                          setTaskCreationTx(tx);
                          setTaskNote(tx?.notes || '');
                          setTaskDate(new Date().toISOString().split('T')[0]);
                          setTaskTime('09:00');
                          setTaskReminder(true);
                        }}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="w-full h-[40px] flex items-center justify-between px-4 bg-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.6)] rounded-[30px] border border-[rgba(30,34,41,0.04)] text-left disabled:opacity-50 transition-all cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 pr-2 min-w-0">
                          <CheckSquare className="text-neutral-900 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" size={16} />
                          <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-900 tracking-wide truncate flex items-center gap-1.5">
                            Create task
                            {!isPremium && (
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded-md tracking-offset flex items-center gap-0.5 shrink-0">
                                <Lock size={8} /> Premium
                              </span>
                            )}
                          </span>
                        </div>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-400 font-normal shrink-0 sm:hidden">&rarr;</span>
                      </button>
                      
                      {/* Delete */}
                      <button 
                        onClick={() => {
                          if (actionMenuTx) {
                            setDeleteConfirmTx(actionMenuTx);
                          }
                        }}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="w-full h-[40px] flex items-center justify-between px-4 bg-[rgba(235,94,85,0.08)] hover:bg-[rgba(235,94,85,0.12)] rounded-[30px] border border-[rgba(235,94,85,0.1)] text-left disabled:opacity-50 transition-all cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3 pr-2 min-w-0">
                          <Trash2 className="text-red-600 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" size={16} />
                          <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-red-600 tracking-wide truncate">
                            Delete
                          </span>
                        </div>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-red-400 font-normal shrink-0 sm:hidden">&times;</span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="edit-form-state"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="w-full flex flex-col items-start text-left"
                  >
                    <div className="w-full text-left mb-4">
                      <h4 style={{ fontSize: 'clamp(13px, 3.8vw, 16px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-neutral-900 tracking-wide">
                        Edit details
                      </h4>
                    </div>

                    {editError && (
                      <div className="w-full p-2.5 mb-3 bg-red-50 rounded-xl border border-red-100 text-[clamp(10px,2.5vw,12px)] text-red-600 font-normal text-left" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                        {editError}
                      </div>
                    )}

                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-[clamp(12px,1.5vw,18px)] mb-5 text-left items-start">
                      {/* Merchant Name */}
                      <div className="flex flex-col gap-1 w-full">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Merchant / Payee title name
                        </label>
                        <input 
                          type="text" 
                          value={editMerchant}
                          onChange={(e) => setEditMerchant(e.target.value)}
                          placeholder="Enter merchant or payee"
                          className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl px-3 py-2.5 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors font-normal shadow-none"
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        />
                      </div>

                      {/* Amount Cost */}
                      <div className="flex flex-col gap-1 w-full">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Transaction amount cost
                        </label>
                        <div className="relative flex items-center w-full">
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="absolute left-3 text-neutral-400 text-[clamp(11px,2.5vw,13px)] pointer-events-none">
                            {actionMenuNativeCurrency}
                          </span>
                          <input 
                            type="number" 
                            step="any"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl pl-12 pr-3 py-2.5 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors shadow-none font-bold text-left"
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          />
                        </div>
                      </div>

                      {/* Category */}
                      <div className="flex flex-col gap-1 w-full">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Category
                        </label>
                        <select 
                          value={editCategory}
                          onChange={(e) => {
                            setEditCategory(e.target.value);
                            setEditSubcategory('');
                          }}
                          className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl px-3 py-2.5 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors font-normal shadow-none cursor-pointer"
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        >
                          <option value="">Select category</option>
                          {userCategories.map((cat: any, catIdx: number) => (
                            <option key={`tx-cat-edit-${cat.id || cat.name}-${catIdx}`} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Subcategory */}
                      <div className="flex flex-col gap-1 w-full">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Sub-category
                        </label>
                        <select 
                          value={editSubcategory}
                          onChange={(e) => setEditSubcategory(e.target.value)}
                          className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl px-3 py-2.5 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors font-normal shadow-none cursor-pointer"
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        >
                          <option value="">None</option>
                          {(userCategories.find(c => c.name === editCategory)?.subcategories || []).map((sub: string, idx: number) => (
                            <option key={`${editCategory}-${sub}-${idx}`} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date */}
                      <div className="flex flex-col gap-1 w-full">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Date
                        </label>
                        <input 
                          type="date" 
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl px-3 py-2.5 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors font-normal shadow-none cursor-pointer"
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        />
                      </div>

                      {/* Notes Description */}
                      <div className="flex flex-col gap-1 w-full md:col-span-2">
                        <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11px] text-neutral-500 tracking-wide">
                          Notes
                        </label>
                        <textarea 
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Enter transaction descriptions or notes"
                          className="w-full bg-[#FFFFFF] border border-gray-100 rounded-xl px-3 py-2 text-[clamp(11px,2.5vw,13px)] text-black focus:outline-none focus:border-indigo-650 transition-colors font-normal shadow-none h-20 resize-none"
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        />
                      </div>
                    </div>

                    <div className="w-full flex gap-3 mt-2 pr-1">
                      <button
                        onClick={() => {
                          setIsEditingTx(false);
                          setEditError(null);
                        }}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="flex-1 py-2.5 border border-gray-100 text-neutral-600 rounded-xl text-xs transition-colors hover:bg-neutral-50 cursor-pointer text-center font-normal"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEditedTransaction}
                        disabled={isLoading}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs transition-all hover:bg-indigo-700 font-bold text-center cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        {isLoading ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deletion Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmTx && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isLoading) setDeleteConfirmTx(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-[340px] sm:max-w-[380px] bg-white border border-neutral-100 rounded-[2rem] p-5 flex flex-col items-center text-center shadow-2xl z-10"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
            >
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              
              <h3 
                className="text-neutral-900 tracking-wide mb-2"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 4.5vw, 18px)' }}
              >
                Confirm delete
              </h3>
              
              <p 
                className="text-neutral-500 leading-relaxed mb-6"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)' }}
              >
                Are you sure you want to permanently delete this transaction? This action cannot be undone.
              </p>
              
              <div className="flex flex-col w-full gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    await handleDeleteTransaction(
                      deleteConfirmTx.id,
                      deleteConfirmTx.recurringId,
                      deleteConfirmTx.type === 'transfer'
                    );
                  }}
                  disabled={isLoading}
                  className="w-full h-[38px] md:h-[42px] flex items-center justify-center bg-red-600 hover:bg-red-700 text-white rounded-xl sm:rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 text-center tracking-wide font-normal px-4 shrink-0"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                >
                  {isLoading ? "Deleting..." : "Delete"}
                </button>
                
                <button
                  type="button"
                  onClick={() => setDeleteConfirmTx(null)}
                  disabled={isLoading}
                  className="w-full h-[38px] md:h-[42px] flex items-center justify-center bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl sm:rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 text-neutral-500 hover:text-neutral-900 text-center tracking-wide font-normal px-4 shrink-0"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Task Creation Modal */}
      <AnimatePresence>
        {taskCreationTx && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTaskCreationTx(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 flex flex-col select-none border border-neutral-100 text-left"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-neutral-100 mb-6">
                <div>
                  <h4 style={{ fontSize: 'clamp(16px, 4.5vw, 22px)' }} className="font-extrabold text-neutral-900 tracking-tight">
                    Create Google Task
                  </h4>
                  <p style={{ fontSize: 'clamp(10px, 2.5vw, 12px)' }} className="text-neutral-500 font-bold tracking-wide">
                    Link task to entry
                  </p>
                </div>
                <button 
                  onClick={() => setTaskCreationTx(null)}
                  className="p-2 hover:bg-neutral-100 rounded-full text-neutral-500 hover:text-neutral-900 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* Form Controls */}
              <div className="space-y-5">
                {/* 1. Note Input (Pre-filled with existing transaction note) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-neutral-500 font-bold text-[clamp(9px,2.2vw,11px)] tracking-wide px-1">
                    Memo/task details
                  </label>
                  <input 
                    type="text"
                    value={taskNote}
                    onChange={(e) => setTaskNote(e.target.value)}
                    placeholder="Describe what needs to be done..."
                    className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white border-2 border-neutral-100 focus:border-[#F4B400] rounded-2xl p-4 text-[clamp(12px,3vw,14px)] text-black font-semibold outline-none transition-all placeholder:text-neutral-400"
                  />
                </div>
                
                {/* 2. Date Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-neutral-500 font-bold text-[clamp(9px,2.2vw,11px)] tracking-wide px-1">
                    Due date
                  </label>
                  <input 
                    type="date"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white border-2 border-neutral-100 focus:border-[#F4B400] rounded-2xl p-4 text-[clamp(12px,3vw,14px)] text-black font-bold outline-none transition-all [color-scheme:light]"
                  />
                </div>
                
                {/* 3. Time Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-neutral-500 font-bold text-[clamp(9px,2.2vw,11px)] tracking-wide px-1">
                    Due time
                  </label>
                  <input 
                    type="time"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white border-2 border-neutral-100 focus:border-[#F4B400] rounded-2xl p-4 text-[clamp(12px,3vw,14px)] text-black font-bold outline-none transition-all [color-scheme:light]"
                  />
                </div>
                
                {/* 4. Reminder Toggle */}
                <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border-2 border-neutral-100">
                  <div className="flex flex-col">
                    <span style={{ fontSize: 'clamp(11px, 3vw, 13px)' }} className="font-extrabold text-neutral-900 tracking-wide">
                      Reminder
                    </span>
                    <span className="text-[9px] text-neutral-500 font-bold tracking-wide">
                      Enable notification alerts
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskReminder(!taskReminder)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors ${taskReminder ? 'bg-[#F4B400]' : 'bg-neutral-200'}`}
                  >
                    <motion.div 
                      animate={{ x: taskReminder ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-lg"
                    />
                  </button>
                </div>
              </div>
              
              {/* Submission / Actions */}
              <div className="flex gap-4 mt-8 pt-4 border-t border-neutral-100">
                <button 
                  onClick={() => setTaskCreationTx(null)}
                  disabled={isSyncingTask}
                  className="flex-1 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-bold text-[clamp(10px,2.5vw,13px)] tracking-wide text-neutral-600 transition-all select-none cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    setIsSyncingTask(true);
                    try {
                      let token = getCachedAccessToken();
                      if (!token) {
                        token = await connectGoogleWorkspace();
                      }
                      if (!token) {
                        alert("Google authorization is required to sync to Google Tasks.");
                        setIsSyncingTask(false);
                        return;
                      }

                      const tx = taskCreationTx;
                      const acc = accounts.find(a => a.id === tx.accountId);
                      
                      const taskDetails = {
                        note: taskNote,
                        date: taskDate,
                        time: taskTime || undefined,
                        hasReminder: taskReminder
                      };
                      
                      const transDetails = {
                        amount: tx.amount,
                        currency: acc?.currency || 'AED',
                        category: tx.category,
                        notes: tx.notes || tx.category
                      };

                      const result = await syncToGoogleTasks(token, taskDetails, transDetails);
                      if (result && result.id) {
                        // Import setDoc from firebase/firestore which is used below
                        const { setDoc } = await import('firebase/firestore');
                        // Update the original transaction card in the ledger to show it is 'Task-Linked'
                        const txRef = doc(db, `users/${profile.uid}/transactions`, tx.id);
                        await setDoc(txRef, { isSyncedToTasks: true, googleTaskId: result.id }, { merge: true });
                        
                        setTaskCreationTx(null);
                      }
                    } catch (err: any) {
                      console.error("Failed to create Google Task:", err);
                      alert("Could not create task: " + err.message);
                    } finally {
                      setIsSyncingTask(false);
                    }
                  }}
                  disabled={isSyncingTask}
                  className="flex-1 py-4 bg-[#F4B400] hover:bg-[#E5A700] rounded-2xl font-bold text-[clamp(10px,2.5vw,13px)] tracking-wide text-black shadow-lg shadow-[#F4B400]/10 flex items-center justify-center gap-2 select-none active:scale-95 transition-all cursor-pointer"
                >
                  {isSyncingTask ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Create task</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TransactionDetailModal 
        isOpen={!!selectedTx}
        uid={profile.uid}
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
        onMakeRecurring={(tx) => {
          setSelectedTx(null);
          setCloningTx(tx);
        }}
        onDelete={handleDeleteTransaction}
      />

      <AddTransactionModal 
        isOpen={!!cloningTx}
        onClose={() => setCloningTx(null)}
        uid={profile.uid}
        onSuccess={() => setCloningTx(null)}
        initialTransactionData={cloningTx}
      />

      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        uid={profile.uid}
        profile={profile}
        onSuccess={onUpdateProfile || (() => {})}
      />

      {profile.subscriptionTier === 'free' && (
        <AdContainer subscriptionTier="free" />
      )}

      {/* Advanced Filter Modal */}
      <AnimatePresence>
        {isFilterModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
          >
             <motion.div 
               initial={{ y: 50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 50, opacity: 0 }}
               className="w-full max-w-[400px] bg-vantage-black rounded-[2rem] thin-border shadow-2xl p-5 max-h-[85vh] overflow-y-auto"
               style={{ fontFamily: "'Google Sans', sans-serif" }}
             >
                <div className="flex items-center justify-between mb-5">
                   <div className="flex flex-col">
                      <h3 className="text-vantage-text tracking-tight" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 'clamp(14px, 4.2vw, 18px)' }}>Advanced filters</h3>
                      <p className="text-vantage-muted tracking-wide" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.5vw, 11px)' }}>Refine filter parameters</p>
                   </div>
                   <button 
                     onClick={() => setIsFilterModalOpen(false)}
                     className="p-1.5 bg-vantage-text/5 rounded-lg text-vantage-muted hover:text-vantage-text"
                   >
                      <X size={16} />
                   </button>
                </div>

                <div className="space-y-4">
                   {/* Date Range */}
                   <div className="space-y-1.5">
                      <label className="tracking-wide px-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Temporal range</label>
                      <div className="grid grid-cols-2 gap-3">
                         <div className="relative">
                            <input 
                              type="date"
                              value={dateFrom}
                              onChange={(e) => setDateFrom(e.target.value)}
                              className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                            />
                            <span className="absolute -top-1.5 left-3 px-1 bg-vantage-black tracking-wide text-vantage-blue-grey" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>From</span>
                         </div>
                         <div className="relative">
                            <input 
                              type="date"
                              value={dateTo}
                              onChange={(e) => setDateTo(e.target.value)}
                              className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                            />
                            <span className="absolute -top-1.5 left-3 px-1 bg-vantage-black tracking-wide text-vantage-blue-grey" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>To</span>
                         </div>
                      </div>
                   </div>

                   {/* Amount Range */}
                   <div className="space-y-1.5">
                      <label className="tracking-wide px-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Volume range</label>
                      <div className="grid grid-cols-2 gap-3">
                         <div className="relative">
                            <input 
                              type="number"
                              placeholder="Min"
                              value={minAmount}
                              onChange={(e) => setMinAmount(e.target.value)}
                              className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                            />
                            <span className="absolute -top-1.5 left-3 px-1 bg-vantage-black tracking-wide text-vantage-blue-grey" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>Minimum</span>
                         </div>
                         <div className="relative">
                            <input 
                              type="number"
                              placeholder="Max"
                              value={maxAmount}
                              onChange={(e) => setMaxAmount(e.target.value)}
                              className="w-full bg-vantage-text/5 border border-vantage-text/10 rounded-xl px-2.5 text-vantage-text h-10 outline-none focus:border-vantage-text/30"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)' }}
                            />
                            <span className="absolute -top-1.5 left-3 px-1 bg-vantage-black tracking-wide text-vantage-blue-grey" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(8px, 2.2vw, 10px)' }}>Maximum</span>
                         </div>
                      </div>
                   </div>

                   {/* Accounts Multi-Selector */}
                   <div className="space-y-1.5">
                      <label className="tracking-wide px-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 12px)', color: '#475569' }}>Account origins</label>
                      <div className="grid grid-cols-1 gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                         {accounts.filter(a => !a.isArchived).map((acc, idx) => {
                            const isSelected = selectedAccountIds.includes(acc.id);
                            return (
                               <button
                                 key={`filt-desk-${acc.id}-${idx}`}
                                 onClick={() => toggleAccountFilter(acc.id)}
                                 className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${isSelected ? 'bg-[#A6DDB1] border-[#A6DDB1]' : 'bg-slate-100 border-slate-200/60'}`}
                               >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                     <div 
                                       className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all"
                                       style={{
                                         backgroundColor: isSelected ? '#000000' : 'transparent',
                                         borderColor: isSelected ? '#000000' : 'rgba(0,0,0,0.15)',
                                         color: isSelected ? '#A6DDB1' : 'transparent'
                                       }}
                                     >
                                        {isSelected ? <Check size={11} strokeWidth={4} /> : (acc.type === 'bank' ? <Square size={11} className="text-slate-400" /> : <X size={11} className="text-slate-400" />)}
                                     </div>
                                     <div className="flex flex-col items-start min-w-0">
                                        <span 
                                          className="tracking-tight truncate max-w-full"
                                          style={{ 
                                            fontFamily: "'Google Sans', sans-serif", 
                                            fontWeight: 400, 
                                            fontSize: 'clamp(10px, 2.6vw, 11px)',
                                            color: isSelected ? '#000000' : '#1E293B'
                                          }}
                                        >
                                          {acc.name}
                                        </span>
                                        <span 
                                          className="tracking-wide text-slate-500"
                                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(7px, 2.1vw, 8px)' }}
                                        >
                                          {acc.type}
                                        </span>
                                     </div>
                                  </div>
                                  <span 
                                    className="shrink-0 pl-1.5"
                                    style={{ 
                                      fontFamily: "'Google Sans', sans-serif", 
                                      fontWeight: 400, 
                                      fontSize: 'clamp(10px, 2.6vw, 11px)',
                                      color: isSelected ? '#000000' : '#1E293B'
                                    }}
                                  >
                                    {(accountBalances[acc.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                               </button>
                            );
                         })}
                      </div>
                   </div>

                   <div className="flex gap-3 pt-3">
                      <button 
                        onClick={clearAllFilters}
                        className="flex-1 h-[38px] md:h-[42px] flex items-center justify-center bg-vantage-card thin-border rounded-xl text-vantage-blue-grey hover:text-white transition-all tracking-wide"
                        style={{ 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 400, 
                          fontSize: 'clamp(11px, 2.8vw, 13px)'
                        }}
                      >
                        Reset filters
                      </button>
                      <button 
                        onClick={() => setIsFilterModalOpen(false)}
                        className="flex-1 h-[38px] md:h-[42px] flex items-center justify-center rounded-xl transition-all active:scale-95 text-center tracking-wide"
                        style={{ 
                          backgroundColor: '#A6DDB1', 
                          color: '#000000', 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 400, 
                          fontSize: 'clamp(11px, 2.8vw, 13px)'
                        }}
                      >
                        Apply filters
                      </button>
                   </div>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

const TransactionRow: React.FC<{
  tx: Transaction;
  isUpcoming: boolean;
  isSelected: boolean;
  isPulsing: boolean;
  isSelectionMode: boolean;
  isTargeted?: boolean;
  filterAccountId?: string | null;
  accounts: any[];
  onLongPress: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onSelect: () => void;
  onDelete?: (transactionId: string, recurringId?: string, isTransfer?: boolean) => void;
}> = ({
  tx,
  isUpcoming,
  isSelected,
  isPulsing,
  isSelectionMode,
  isTargeted,
  filterAccountId,
  accounts,
  onLongPress,
  onToggleSelection,
  onSelect,
  onDelete
}) => {
  const longPressTimer = useRef<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  let isOutflow = tx.type === 'expense';
  if (tx.type === 'transfer') {
    isOutflow = tx.transferSide !== 'receiver';
  }

  const isUpcomingEffective = isUpcoming && tx.status !== 'Posted/Validated' && tx.status !== 'confirmed';

  const displayEmoji = tx.type === 'transfer' ? '🔄' : (tx.emoji || (tx.type === 'income' ? '💰' : '💸'));
  const displayType = tx.type === 'transfer' 
    ? (tx.transferSide === 'receiver' ? 'Credit' : 'Debit')
    : (tx.type === 'expense' ? 'Debit' : tx.type === 'income' ? 'Credit' : tx.type);

  // Outer click handler helper
  const handleRowClick = () => {
    if (isSelectionMode) onToggleSelection(tx.id);
    else onSelect();
  };

  const isPositive = !isOutflow;

  const pillStyle = isPositive ? {
    background: 'rgba(166, 221, 177, 0.18)',
    border: '1px solid rgba(166, 221, 177, 0.4)',
    color: '#A6DDB1'
  } : {
    background: 'rgba(30, 34, 41, 0.04)',
    border: '1px solid rgba(30, 34, 41, 0.06)',
    color: 'rgba(30, 34, 41, 0.65)'
  };

  const getRowStyle = (isSelected: boolean): React.CSSProperties => ({
    background: isSelected ? '#F0FDF4' : '#FFFFFF',
    borderRadius: '30px',
    border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(30, 34, 41, 0.06)',
    boxShadow: '0 4px 20px -2px rgba(0,0,0,0.03), 0 2px 8px -1px rgba(30,34,41,0.02)',
    fontFamily: "'Google Sans', sans-serif",
    padding: '0.25rem 1.25rem',
    height: '40px',
    display: 'flex',
    alignItems: 'center'
  });

  if (isDeleting) {
    return (
      <motion.div
        initial={{ height: 40, opacity: 1, scale: 1, marginBottom: 12 }}
        animate={{ height: 0, opacity: 0, scale: 0.9, marginBottom: 0, padding: 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      />
    );
  }

  if (isConfirming) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{ fontFamily: "'Google Sans', sans-serif" }}
        className="w-full bg-[#FFF2F2] border border-red-200 rounded-[30px] p-4 flex flex-row items-center justify-between text-left mb-3 shadow-[0_4px_12px_rgba(254,226,226,0.3)] min-h-[70px]"
      >
        <div className="flex flex-col pr-2">
          <span className="text-[13.5px] font-bold text-red-600">Delete this transaction?</span>
          <p className="text-[11px] font-normal text-red-500 leading-normal">
            Permanently delete this item and recalculate associated account balances.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic(hapticPresets.light);
              setIsConfirming(false);
            }}
            className="px-3.5 py-1.5 rounded-full bg-white border border-neutral-200 text-neutral-600 text-[11px] font-normal hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              triggerHaptic(hapticPresets.success);
              setIsDeleting(true);
              setTimeout(() => {
                if (onDelete) {
                  onDelete(tx.id, tx.recurringId, tx.type === 'transfer');
                }
              }, 250);
            }}
            className="px-3.5 py-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
          >
            Delete
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="w-full block mb-3">
      {/* 1. Mobile Compact Single-Row Layout */}
      <div className="relative w-full overflow-hidden select-none md:hidden rounded-[30px] h-[40px]">
        {/* Swipe backplate background underneath the slide layer */}
        <div className="absolute inset-0 bg-transparent rounded-[30px] flex items-center justify-end pr-5 text-red-500 font-semibold gap-2 z-0 h-full">
          <div className="flex items-center gap-1.5">
            <Trash2 size={15} strokeWidth={2.5} className="animate-pulse text-red-500" />
            <span className="text-xs font-semibold text-red-500">Delete</span>
          </div>
        </div>

        <motion.div 
          drag={isSelectionMode ? false : "x"}
          dragConstraints={{ left: -140, right: 0 }}
          dragElastic={{ left: 0.15, right: 0 }}
          onDragEnd={(event, info) => {
            if (info.offset.x < -65) {
              triggerHaptic(hapticPresets.heavy);
              setIsConfirming(true);
            }
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ 
            opacity: isUpcomingEffective ? 0.75 : 1, 
            y: 0,
            scale: isPulsing ? [1, 1.01, 1] : 1,
            x: 0,
          }}
          transition={{ duration: 0.2 }}
          onMouseDown={() => {
            longPressTimer.current = setTimeout(() => onLongPress(tx.id), 600);
          }}
          onMouseUp={() => {
            clearTimeout(longPressTimer.current);
          }}
          onTouchStart={() => {
            longPressTimer.current = setTimeout(() => onLongPress(tx.id), 600);
          }}
          onTouchEnd={() => {
            clearTimeout(longPressTimer.current);
          }}
          onClick={handleRowClick}
          style={{ ...getRowStyle(isSelected), zIndex: 1, position: 'relative' }}
          className="flex flex-row items-center justify-between flex-nowrap w-full transition-all cursor-pointer active:scale-[0.98] overflow-hidden group"
        >
          {/* Left side: Icon + Content */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3 flex-row flex-nowrap">
            {isSelectionMode ? (
              <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center transition-all ${isSelected ? 'bg-vantage-green text-white' : 'bg-[#1F2937]/5 border border-[#1F2937]/10 text-neutral-400'}`}>
                 {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </div>
            ) : (
              <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-sm ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-700' : tx.type === 'transfer' ? 'bg-blue-100 text-blue-600' : 'bg-red-100'}`}>
                 {isUpcomingEffective ? <CalendarClock size={16} /> : displayEmoji}
              </div>
            )}
            <div className="flex flex-col min-w-0 select-none">
              <div className="flex items-center gap-1.5 flex-row flex-nowrap min-w-0">
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: '12px', color: '#1E2229' }}
                  className="truncate leading-none tracking-tight"
                >
                  {tx.notes || (tx.type === 'transfer' ? 'Internal Movement' : tx.category)}
                </span>
                {tx.groupId && (
                  <span className="text-[8px] font-normal px-1 py-0.2 bg-vantage-green/20 rounded text-vantage-green shrink-0 leading-none">Split</span>
                )}
                {isUpcomingEffective && (
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: '12px' }} className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded shrink-0 leading-none">Upcoming</span>
                )}
              </div>
              
              {/* Contextual category tags formatted as soft capsule / pill element */}
              <div className="mt-1 flex items-center min-w-0">
                <span 
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400, 
                    fontSize: '12px',
                    ...pillStyle,
                    display: 'inline-block',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '9999px',
                    maxWidth: 'fit-content'
                  }}
                  className="tracking-tight truncate leading-none"
                >
                  {tx.subcategory ? `${tx.category} / ${tx.subcategory}` : tx.category}
                </span>
              </div>
            </div>
          </div>

          {/* Right side: Amount + Date */}
          <div className="flex flex-col items-end shrink-0 text-right pl-2 select-none">
            <span 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 600, 
                fontSize: '12px', 
                color: '#1E2229'
              }}
              className="leading-none whitespace-nowrap"
            >
              {!isOutflow ? '+' : '-'}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 400, 
                fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                color: 'rgba(30, 34, 41, 0.65)' 
              }}
              className="tracking-tight leading-none mt-1 whitespace-nowrap"
            >
              {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </motion.div>
      </div>

      {/* 2. Tablet/Desktop Compact Floating Glass Card Layout */}
      <div className="relative w-full overflow-hidden select-none hidden md:block rounded-[30px] h-[40px]">
        {/* Swipe backplate background underneath the slide layer */}
        <div className="absolute inset-0 bg-transparent rounded-[30px] flex items-center justify-end pr-6 text-red-500 font-semibold gap-2 z-0 h-full">
          <div className="flex items-center gap-1.5">
            <Trash2 size={16} strokeWidth={2.5} className="animate-pulse text-red-500" />
            <span className="text-xs font-semibold text-red-500">Delete</span>
          </div>
        </div>

        <motion.div 
          drag={isSelectionMode ? false : "x"}
          dragConstraints={{ left: -140, right: 0 }}
          dragElastic={{ left: 0.15, right: 0 }}
          onDragEnd={(event, info) => {
            if (info.offset.x < -65) {
              triggerHaptic(hapticPresets.heavy);
              setIsConfirming(true);
            }
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ 
            opacity: isUpcomingEffective ? 0.75 : 1, 
            y: 0,
            scale: isPulsing ? [1, 1.01, 1] : 1,
            x: 0,
          }}
          transition={{ duration: 0.2 }}
          onClick={handleRowClick}
          style={{ ...getRowStyle(isSelected), zIndex: 1, position: 'relative' }}
          className="flex flex-row items-center justify-between flex-nowrap w-full transition-all cursor-pointer overflow-hidden group"
        >
          {/* Note/Description Column & Icon */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3 flex-row flex-nowrap">
            {isSelectionMode ? (
              <div className={`w-7 h-7 flex-shrink-0 cursor-pointer rounded-lg flex items-center justify-center transition-all ${isSelected ? 'bg-[#10B981] text-white' : 'bg-neutral-100 border border-neutral-200 text-neutral-400 hover:bg-neutral-200'}`}>
                 {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              </div>
            ) : (
              <div className={`w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-sm ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-700' : tx.type === 'transfer' ? 'bg-blue-100 text-blue-600' : 'bg-red-100'}`}>
                 {isUpcomingEffective ? <CalendarClock size={16} /> : displayEmoji}
              </div>
            )}
            <div className="flex flex-col min-w-0 select-none">
              <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
                <span 
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 500, 
                    fontSize: 'clamp(1.05rem, 2.4vw, 1.25rem)', 
                    color: '#1E2229' 
                  }}
                  className="truncate leading-none tracking-tight whitespace-nowrap"
                >
                  {tx.notes || (tx.type === 'transfer' ? 'Internal Movement' : tx.category)}
                </span>
                {isUpcomingEffective && (
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[8px] px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded shrink-0 leading-none">Upcoming</span>
                )}
              </div>
              
              {/* Soft Category pill for descriptive sub-accent */}
              <div className="mt-1 flex items-center min-w-0">
                <span 
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400, 
                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                    ...pillStyle,
                    display: 'inline-block',
                    padding: '0.1rem 0.5rem',
                    borderRadius: '9999px',
                    maxWidth: 'fit-content'
                  }}
                  className="truncate tracking-tight leading-none"
                >
                  {tx.subcategory ? `${tx.category} / ${tx.subcategory}` : tx.category}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Class/Type status chip Column */}
          <div className="flex items-center shrink-0 w-[110px] justify-center pl-2 pr-2">
            <span 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 500,
                fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)',
                ...pillStyle,
                padding: '0.15rem 0.6rem',
                borderRadius: '9999px',
                textAlign: 'center'
              }}
              className="truncate select-none leading-none"
            >
               {tx.status === 'Pending Schedule' ? 'Scheduled' : (isUpcomingEffective ? 'Upcoming' : displayType)}
            </span>
          </div>

          {/* Amount Column */}
          <div className="flex flex-col items-end shrink-0 w-[130px] text-right pl-2 select-none">
            <span 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 600, 
                fontSize: 'clamp(1.15rem, 2.8vw, 1.45rem)', 
                color: '#1E2229'
              }}
              className="leading-none whitespace-nowrap"
            >
               {!isOutflow ? '+' : '-'}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span 
              style={{ 
                fontFamily: "'Google Sans', sans-serif", 
                fontWeight: 600, 
                fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                color: 'rgba(30,34,41,0.65)' 
              }}
              className="tracking-tight leading-none mt-1 whitespace-nowrap"
            >
               {accounts.find(a => a.id === tx.accountId)?.currency || 'AED'}
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

