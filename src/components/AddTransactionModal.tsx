import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Calendar, CheckSquare, Tag, MessageSquare, Check, Sparkles, AlertCircle, ChevronDown, Filter, PieChart, Landmark, RefreshCw, Clock } from 'lucide-react';
import { collection, query, getDocs, doc, runTransaction, serverTimestamp, onSnapshot, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { generateAIContent } from '../lib/gemini';
import { MASTER_CATEGORIES, evaluateMathExpression } from '../lib/constants';
import { connectGoogleWorkspace, createGoogleCalendarEvent, getCachedAccessToken, syncToGoogleTasks } from '../lib/googleAuth';
import { PremiumModal } from './PremiumModal';

import { MilestoneConfigModal } from './DailyLog';
import { DebtMilestoneConfigModal } from './DebtMilestoneConfigModal';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onSuccess: () => void;
  onNewAccount?: () => void;
  initialTransactionData?: any;
  isPremium?: boolean;
  profile?: any;
  accounts?: any[];
  allTransactions?: any[];
}

type TxType = 'expense' | 'income' | 'transfer' | 'budget';

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ 
  isOpen, 
  onClose, 
  uid, 
  onSuccess, 
  onNewAccount, 
  initialTransactionData, 
  isPremium = false,
  profile,
  accounts: parentAccounts = [],
  allTransactions: parentTransactions = []
}) => {
  const [step, setStep] = useState<'type' | 'form' | 'budget'>('type');
  const [type, setType] = useState<TxType>('expense');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFullyOpen, setIsFullyOpen] = useState(false);
  const [isPremiumUpgradeModalOpen, setIsPremiumUpgradeModalOpen] = useState(false);

  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);
  const [showSavingsModal, setShowSavingsModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {}
    };
    loadRates();
  }, []);
  
  // Data
  const [accounts, setAccounts] = useState<any[]>([]);
  const [userCategories, setUserCategories] = useState<any[]>([]);
  
  // Form Fields
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [emoji, setEmoji] = useState('💰');
  
  // Split Transaction State
  const [isSplit, setIsSplit] = useState(false);
  // splits only track the secondary accounts. The primary account gets the remainder.
  const [splits, setSplits] = useState<{ accountId: string; amount: string; percentage: string }[]>([]);

  // Recurring Transaction State
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrency, setRecurrency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [interval, setIntervalValue] = useState('1');
  const [dayOption, setDayOption] = useState<'sameDay' | 'sameDate'>('sameDate');
  const [duration, setDuration] = useState<'forever' | 'numEvents' | 'untilDate'>('forever');
  const [durationLimit, setDurationLimit] = useState('');
  const [notificationOption, setNotificationOption] = useState<'sameDay' | '1DayBefore' | '3DaysBefore'>('sameDay');
  const [isSyncedToCalendar, setIsSyncedToCalendar] = useState(false);
  const [gCalendarEventId, setGCalendarEventId] = useState<string | null>(null);
  const [isSyncedToTasks, setIsSyncedToTasks] = useState(false);
  const [googleTaskId, setGoogleTaskId] = useState<string | null>(null);

  // Budget Fields
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetCategories, setBudgetCategories] = useState<string[]>([]);
  const [budgetSubcategories, setBudgetSubcategories] = useState<string[]>([]);
  const [budgetAccountIds, setBudgetAccountIds] = useState<string[]>([]);
  const [budgetPeriod, setBudgetPeriod] = useState('monthly');
  const [budgetCurrency, setBudgetCurrency] = useState('AED');
  const [budgetMismatchError, setBudgetMismatchError] = useState(false);

  useEffect(() => {
    if (isOpen && initialTransactionData) {
      setStep('form');
      setType(initialTransactionData.type || 'expense');
      setAmount(initialTransactionData.amount ? initialTransactionData.amount.toString() : '');
      setAccountId(initialTransactionData.accountId || '');
      setToAccountId(initialTransactionData.toAccountId || '');
      setCategory(initialTransactionData.category || '');
      setSubcategory(initialTransactionData.subcategory || '');
      setNotes(initialTransactionData.notes || '');
      setDate(initialTransactionData.date || new Date().toISOString().split('T')[0]);
      setEmoji(initialTransactionData.emoji || '💰');
      setIsRecurring(true);
      setIsSyncedToCalendar(false);
      setGCalendarEventId(null);
      setIsSyncedToTasks(false);
      setGoogleTaskId(null);
    } else if (isOpen) {
      setIsSyncedToCalendar(false);
      setGCalendarEventId(null);
      setIsSyncedToTasks(false);
      setGoogleTaskId(null);
    }
  }, [isOpen, initialTransactionData]);

  useEffect(() => {
    if (isOpen && uid) {
      const fetchAccounts = async () => {
        const q = query(collection(db, `users/${uid}/accounts`));
        const snap = await getDocs(q);
        const list = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((a: any) => !a.isArchived);
        setAccounts(list);
        if (list.length > 0) {
          if (!accountId) setAccountId(list[0].id);
          if (list.length > 1 && !toAccountId) setToAccountId(list[1].id);
        }
      };

      const qCat = query(collection(db, `users/${uid}/custom_categories`));
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
        
        const effective: any[] = list;
        if (!category && effective.length > 0) {
          setCategory(effective[0].name);
          setEmoji(effective[0].emoji || '💰');
        }
      });

      fetchAccounts();
      return () => {
        unsubscribeCat();
      };
    }
  }, [isOpen, uid]);

  // Ensure Source and Destination remain distinct
  useEffect(() => {
    if (type === 'transfer' && accountId && toAccountId && accountId === toAccountId) {
       const other = accounts.find(a => a.id !== accountId);
       if (other) setToAccountId(other.id);
       else setToAccountId('');
    }
  }, [accountId, type, accounts]);

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };

  const getCurrencySymbol = (code: string) => {
    switch (code) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'AED': return 'AED';
      case 'JPY': return '¥';
      case 'CHF': return 'CHF';
      case 'CAD': return 'C$';
      case 'AUD': return 'A$';
      case 'INR': return '₹';
      case 'CNY': return '¥';
      case 'SAR': return 'SR';
      case 'QAR': return 'QR';
      case 'KWD': return 'KD';
      case 'BHD': return 'BD';
      case 'OMR': return 'RO';
      case 'SGD': return 'S$';
      default: return code;
    }
  };

  const convertToProfileBase = (amt: number, fromCurr: string) => {
    const baseCurr = profile?.currency || 'AED';
    if (fromCurr === baseCurr) return amt;
    const rateFrom = getRateToAED(fromCurr);
    const rateBase = getRateToAED(baseCurr);
    return (amt * rateFrom) / rateBase;
  };

  const userProfileBaseCurrency = profile?.baseCurrency || profile?.currency || 'AED';

  const whitelist = Array.isArray(profile?.enabledCurrencies) && profile.enabledCurrencies.length > 0
    ? profile.enabledCurrencies
    : [userProfileBaseCurrency, 'AED'];

  const selectedAccount = accounts.find(a => a.id === accountId);
  const selectedAccountCurrency = selectedAccount?.currency || 'AED';

  // Hierarchy checking loop:
  // 1. If SelectedAccount.currency === userProfileBaseCurrency (or 'AED'), validation is bypassed and fully unlocked.
  // 2. Else run whitelist checking.
  const isSourceCurrencyValid = selectedAccountCurrency === userProfileBaseCurrency || selectedAccountCurrency === 'AED'
    ? true
    : whitelist.includes(selectedAccountCurrency);

  const destAccount = type === 'transfer' && toAccountId ? accounts.find(a => a.id === toAccountId) : null;
  const destAccountCurrency = destAccount?.currency || 'AED';
  const isDestCurrencyValid = type === 'transfer' && toAccountId
    ? (destAccountCurrency === userProfileBaseCurrency || destAccountCurrency === 'AED' ? true : whitelist.includes(destAccountCurrency))
    : true;

  const isFormCurrencyValid = isSourceCurrencyValid && isDestCurrencyValid;

  const numericAmount = (() => {
    try {
      const cleaned = (amount || '').trim();
      if (!cleaned) return 0;
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    } catch {
      return 0;
    }
  })();

  const baseCurrencyCode = profile?.currency || 'AED';
  const showConversion = selectedAccountCurrency !== baseCurrencyCode && numericAmount > 0;
  const convertedValue = convertToProfileBase(numericAmount, selectedAccountCurrency);
  const conversionText = `≈ ${convertedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${getCurrencySymbol(baseCurrencyCode)}`;

  const effectiveCategories: any[] = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;
  const currentCategoryData = effectiveCategories.find(c => c.name === category);

  const handleAnalyzeNotes = async () => {
    if (!notes.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const prompt = `Analyze this financial transaction note: "${notes}". 
      Respond with ONLY a JSON object containing three keys: 
      "category": (suggest a concise category from this list: ${effectiveCategories.map(c => c.name).join(', ')})
      "subcategory": (suggest a subcategory if possible)
      "emoji": (suggest a single emoji that fits this category)
      If you can't determine, use "General" and "💰".`;
      
      const response = await generateAIContent(prompt);
      const cleanJson = response.replace(/```json|```/g, "").trim();
      const result = JSON.parse(cleanJson);
      if (result.category) {
        setCategory(result.category);
        const catData = effectiveCategories.find(c => c.name === result.category);
        if (catData && result.subcategory && catData.subcategories.includes(result.subcategory)) {
           setSubcategory(result.subcategory);
        }
      }
      if (result.emoji) setEmoji(result.emoji);
    } catch (err) {
      console.error('AI Analysis failed', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !accountId || (type === 'transfer' && !toAccountId)) return;

    if (isSplit && !isTotalValid) {
       alert("Distribution Error: Total allocation exceeds 100%. Please adjust node values.");
       return;
    }

    if (type === 'transfer' && accountId === toAccountId) {
      alert("Source and Destination cannot be the same.");
      return;
    }

    const txAmount = parseFloat(evaluateMathExpression(amount));
    if (isNaN(txAmount)) {
      alert("Invalid numeric value for amount.");
      return;
    }

    setIsLoading(true);
    let calendarEventId: string | null = null;
    if (isRecurring && isSyncedToCalendar && (type === 'income' || type === 'expense')) {
      try {
        let token = getCachedAccessToken();
        if (!token) {
          token = await connectGoogleWorkspace();
        }
        if (!token) {
          alert("Google authorization is required to sync to Google Calendar.");
          setIsLoading(false);
          return;
        }

        const acc = accounts.find(a => a.id === accountId);
        const titleStr = notes.trim() || category;
        const details = {
          title: emoji ? `${emoji} ${titleStr}` : `💸 ${titleStr}`,
          amount: txAmount,
          currency: acc?.currency || 'AED',
          accountName: acc?.name || 'Account',
          dueDate: date,
          recurrency,
          interval: parseInt(interval) || 1
        };

        const res = await createGoogleCalendarEvent(token, details);
        if (res && res.id) {
          calendarEventId = res.id;
        }
      } catch (err: any) {
        console.error("Error creating Google Calendar event:", err);
        alert("Could not sync to Google Calendar: " + err.message + ". The transaction will be created without calendar sync.");
      }
    }

    let taskId: string | null = null;
    if (isSyncedToTasks && (type === 'income' || type === 'expense')) {
      try {
        let token = getCachedAccessToken();
        if (!token) {
          token = await connectGoogleWorkspace();
        }
        if (!token) {
          alert("Google authorization is required to sync to Google Tasks.");
          setIsLoading(false);
          return;
        }

        const acc = accounts.find(a => a.id === accountId);
        const taskDetails = {
          note: notes.trim() || category || 'No notes',
          date: date,
          time: "09:00",
          hasReminder: true
        };
        const transDetails = {
          amount: txAmount,
          currency: acc?.currency || 'AED',
          category: category,
          notes: notes.trim() || category || 'None'
        };

        const res = await syncToGoogleTasks(token, taskDetails, transDetails);
        if (res && res.id) {
          taskId = res.id;
        }
      } catch (err: any) {
        console.error("Error creating Google Tasks event:", err);
        alert("Could not sync to Google Tasks: " + err.message + ". The transaction will be created without tasks sync.");
      }
    }

    try {
      await runTransaction(db, async (transaction) => {
        const userPath = `users/${uid}`;

        // Single flat Transfer document with dual-sided balance mutation
        if (type === 'transfer') {
          const generateUUID = () => {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
              return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });
          };

          const txId = generateUUID();
          const sourceAcc = accounts.find(a => a.id === accountId);
          const destAcc = accounts.find(a => a.id === toAccountId);
          const notesStr = notes.trim() || `Transfer from ${sourceAcc?.name || 'Account'} to ${destAcc?.name || 'Account'}`;
          const currencyCode = sourceAcc?.currency || 'AED';

          const dateObj = new Date(date);
          const txDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

          const todayStr = new Date().toISOString().split('T')[0];
          const isFuture = date > todayStr;
          const status = isFuture ? 'pending_confirmation' : 'confirmed';

          // Single flat Transfer payload matching requested exact structure perfectly with legacy compatibility
          const exactPayload = {
            transactionId: txId,
            userId: uid,
            type: "Transfer",
            status, // MUST have status field
            amount: Number(txAmount),
            currency: currencyCode,
            notes: notesStr,
            transactionDate: txDate,
            sourceAccountId: accountId,
            destinationAccountId: toAccountId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),

            // Legacy properties for rendering & filtering backward compatibility
            id: txId,
            date: date,
            accountId: accountId,
            toAccountId: toAccountId,
            transferSide: 'sender',
            category: 'Internal Transfer',
            emoji: '🔄',
            hasMirror: false
          };

          const sourceRef = doc(db, `users/${uid}/accounts/${accountId}`);
          const destRef = doc(db, `users/${uid}/accounts/${toAccountId}`);

          const sourceSnap = await transaction.get(sourceRef);
          const destSnap = await transaction.get(destRef);

          const sourceBal = sourceSnap.exists() ? (Number(sourceSnap.data()?.currentBalance) || 0) : 0;
          const destBal = destSnap.exists() ? (Number(destSnap.data()?.currentBalance) || 0) : 0;

          // Simultaneously mutate balances only if confirmed
          if (status === 'confirmed') {
            transaction.update(sourceRef, {
              currentBalance: sourceBal - txAmount,
              updatedAt: serverTimestamp()
            });

            transaction.update(destRef, {
              currentBalance: destBal + txAmount,
              updatedAt: serverTimestamp()
            });
          }

          // Create the single flat transfer transaction record
          const txRef = doc(db, `users/${uid}/transactions/${txId}`);
          transaction.set(txRef, exactPayload);

          // Handle automatic transfer fee inside transaction
          if (sourceAcc?.defaultTransferFee && sourceAcc.defaultTransferFee > 0) {
            const feeTxId = generateUUID();
            const feeTxRef = doc(db, `users/${uid}/transactions/${feeTxId}`);
            transaction.set(feeTxRef, {
              userId: uid,
              type: 'expense',
              status, // matching status
              amount: sourceAcc.defaultTransferFee,
              accountId: accountId,
              date,
              createdAt: serverTimestamp(),
              id: feeTxId,
              transactionId: feeTxId,
              category: 'Financial Expenses',
              emoji: '💸',
              notes: `Transfer fee for movement ${txId.substring(0, 8)}...`,
              parentTransferId: txId,
              correlationGroupId: txId
            });
          }

          // Handle recurring association if toggled
          if (isRecurring) {
            const primRecRef = doc(collection(db, `${userPath}/recurringTransactions`));
            const freq = recurrency ? (recurrency.charAt(0).toUpperCase() + recurrency.slice(1)) : 'Monthly';
            const parsedDayOption = Number(dayOption) || new Date(date).getDate() || 28;
            const nextExecDate = date; // initially the selected date or today

            transaction.set(primRecRef, {
              // Legacy Compatibility
              id: primRecRef.id,
              type: 'transfer',
              amount: Number(txAmount),
              accountId,
              toAccountId,
              category: 'Internal Transfer',
              emoji: '🔄',
              notes: notesStr,
              recurrency,
              interval: 1,
              isActive: true,
              createdAt: serverTimestamp(),
              lastGeneratedDate: date,
              nextGenerationDate: nextExecDate,

              // Exact new payload
              recurringId: primRecRef.id,
              userId: uid,
              title: notesStr,
              transactionType: 'transfer',
              frequency: freq,
              sourceAccountId: accountId,
              destinationAccountId: toAccountId,
              startDate: date,
              nextExecutionDate: nextExecDate,
              dayOption: parsedDayOption,
              isBreakdownConfigured: false,
              updatedAt: serverTimestamp()
            });
          }

          return; // Skip standard runTransaction block for transfers!
        }

        const groupId = isSplit ? `split_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}` : null;
        const runType = type as any;

        // Pre-allocate recurring refs to link the actual transaction documents to the generated rules
        let primRecRef: any = null;
        const splitRecRefs: any[] = [];
        if (isRecurring && (runType === 'income' || runType === 'expense' || runType === 'transfer')) {
          primRecRef = doc(collection(db, `${userPath}/recurringTransactions`));
          if (isSplit) {
            splits.forEach(() => {
              splitRecRefs.push(doc(collection(db, `${userPath}/recurringTransactions`)));
            });
          }
        }

        // Helper to prepare tx data
        const prepareTx = (refId: string, accId: string, targetAccId: string | null, amt: number) => {
          const todayStr = new Date().toISOString().split('T')[0];
          const isFuture = date > todayStr;
          const status = isFuture ? 'pending_confirmation' : 'confirmed';

          const data: any = {
            userId: uid,
            type,
            status, // MUST have status field
            amount: amt,
            accountId: accId,
            date,
            createdAt: serverTimestamp(),
            id: refId,
            groupId
          };
          if (runType === 'transfer') {
            data.toAccountId = targetAccId;
            data.category = 'Internal Transfer';
            data.emoji = '🔄';
          } else {
            if (category) data.category = category;
            if (subcategory) data.subcategory = subcategory;
            if (emoji) data.emoji = emoji;
          }
          if (notes.trim()) data.notes = notes.trim();
          return data;
        };

        // --- 1. PRIMARY PART ---
        const primaryTxRef = doc(collection(db, `${userPath}/transactions`));
        const primaryAmt = isSplit ? primaryAmountRemaining : txAmount;
        const sourceAccount = accounts.find(a => a.id === accountId);
        
        let primaryData = prepareTx(primaryTxRef.id, accountId, runType === 'transfer' ? toAccountId : null, primaryAmt);
        if (primRecRef) {
          primaryData.recurringId = primRecRef.id;
        }
        
        // If it's a transfer, we want to mark it as part of a dual-record move
        if (runType === 'transfer') {
          primaryData.hasMirror = true;
          primaryData.transferSide = 'sender';
          primaryData.notes = notes.trim() || `Transfer to ${accounts.find(a => a.id === toAccountId)?.name}`;
          primaryData.parentTransferId = primaryTxRef.id;
          primaryData.correlationGroupId = primaryTxRef.id;
        }
        
        if (taskId) {
          primaryData.isSyncedToTasks = true;
          primaryData.googleTaskId = taskId;
        }
        
        transaction.set(primaryTxRef, primaryData);

        // --- 1.5 MIRROR TRANSFER RECORD (The Credit) ---
        if (runType === 'transfer' && toAccountId) {
          const mirrorTxRef = doc(collection(db, `${userPath}/transactions`));
          const mirrorData = {
            ...primaryData,
            id: mirrorTxRef.id,
            accountId: toAccountId,
            toAccountId: accountId,
            transferSide: 'receiver',
            notes: notes.trim() || `Transfer from ${sourceAccount?.name}`,
            parentTransferId: primaryTxRef.id,
            correlationGroupId: primaryTxRef.id
          };
          transaction.set(mirrorTxRef, mirrorData);
        }

        // --- Automatic Transfer Fee Logic ---
        if (runType === 'transfer' && sourceAccount?.defaultTransferFee && sourceAccount.defaultTransferFee > 0) {
          const feeRef = doc(collection(db, `${userPath}/transactions`));
          const feeData = {
            userId: uid,
            type: 'expense',
            status: primaryData.status || 'confirmed', // dynamic status
            amount: sourceAccount.defaultTransferFee,
            accountId: accountId,
            date,
            createdAt: serverTimestamp(),
            id: feeRef.id,
            category: 'Financial Expenses',
            emoji: '💸',
            notes: `Transfer fee for movement ${primaryData.id.substring(0, 8)}...`,
            groupId: primaryData.groupId || `transfer_${primaryData.id}`,
            parentTransferId: primaryTxRef.id,
            correlationGroupId: primaryTxRef.id
          };
          transaction.set(feeRef, feeData);
        }

        // --- ATM Bridge Logic ---
        if (type === 'expense' && category === 'ATM Withdrawal' && sourceAccount?.type === 'bank') {
          // Find Physical Cash accounts with same currency and auto-sync enabled
          const cashAccounts = accounts.filter(a => 
            (a.type === 'cash' || a.type === 'Cash') && 
            a.currency === sourceAccount.currency && 
            a.atmAutoSync === true
          );

          for (const cashAcc of cashAccounts) {
            const atmIncomeRef = doc(collection(db, `${userPath}/transactions`));
            const atmIncomeData = {
              userId: uid,
              type: 'income',
              status: primaryData.status || 'confirmed', // dynamic status
              amount: primaryAmt,
              accountId: cashAcc.id,
              date,
              createdAt: serverTimestamp(),
              id: atmIncomeRef.id,
              category: 'ATM Withdrawal',
              emoji: '💵',
              notes: `Auto-transfer from ${sourceAccount.name} ATM withdrawal`,
              parentTransferId: primaryTxRef.id,
              correlationGroupId: primaryTxRef.id
            };
            transaction.set(atmIncomeRef, atmIncomeData);
          }
        }

        // --- 2. SPLIT PARTS ---
        if (isSplit) {
          let splitIdx = 0;
          for (const split of splits) {
            const splitAmt = parseFloat(split.amount) || 0;
            if (splitAmt <= 0) continue;
            
            const splitRef = doc(collection(db, `${userPath}/transactions`));
            const splitData = prepareTx(
              splitRef.id, 
              runType === 'transfer' ? accountId : split.accountId,
              runType === 'transfer' ? split.accountId : null,
              splitAmt
            );
            if (primRecRef && splitRecRefs[splitIdx]) {
              splitData.recurringId = splitRecRefs[splitIdx].id;
            }

            // Add mirror logic for splits if it's a transfer
            if (runType === 'transfer') {
              splitData.hasMirror = true;
              splitData.transferSide = 'sender';
              splitData.notes = notes.trim() || `Transfer to ${accounts.find(a => a.id === split.accountId)?.name}`;
              splitData.parentTransferId = primaryTxRef.id;
              splitData.correlationGroupId = primaryTxRef.id;
              
              // Create the mirror (Receiver side)
              const splitMirrorRef = doc(collection(db, `${userPath}/transactions`));
              const splitMirrorData = {
                ...splitData,
                id: splitMirrorRef.id,
                accountId: split.accountId,
                toAccountId: accountId,
                transferSide: 'receiver',
                notes: notes.trim() || `Transfer from ${sourceAccount?.name}`,
                parentTransferId: primaryTxRef.id,
                correlationGroupId: primaryTxRef.id
              };
              transaction.set(splitMirrorRef, splitMirrorData);
            } else {
              splitData.parentTransferId = primaryTxRef.id;
              splitData.correlationGroupId = primaryTxRef.id;
            }

            transaction.set(splitRef, splitData);
            splitIdx++;
          }
        }

        // --- 3. RECURRING SETUP ---
        if (isRecurring && (runType === 'income' || runType === 'expense' || runType === 'transfer')) {
          const createRecurringData = (amt: number, accId: string, refId: string, calEventId: string | null = null, gTaskId: string | null = null) => {
            const transactionType = runType;
            const titleStr = notes.trim() || category || (runType === 'transfer' ? 'Internal Transfer' : 'Subscription');
            const freq = recurrency ? (recurrency.charAt(0).toUpperCase() + recurrency.slice(1)) : 'Monthly';
            
            // Only populate destinationAccountId for transfers
            const destAccountId = transactionType === 'transfer' ? toAccountId : null;

            const nextExecDate = calculateNextDate(date, recurrency, parseInt(interval) || 1, dayOption);
            const parsedDayOption = Number(dayOption) || new Date(date).getDate() || 28;

            return {
              // Legacy Compatibility
              id: refId,
              type: transactionType,
              amount: amt,
              accountId: accId,
              toAccountId: destAccountId,
              category: primaryData.category || (runType === 'transfer' ? 'Internal Transfer' : null),
              subcategory: primaryData.subcategory || null,
              emoji: primaryData.emoji || (runType === 'transfer' ? '🔄' : null),
              notes: titleStr,
              recurrency,
              interval: parseInt(interval) || 1,
              duration,
              durationLimit,
              eventsRemaining: duration === 'numEvents' ? (parseInt(durationLimit) || 1) : null,
              notification: notificationOption,
              isActive: true,
              createdAt: serverTimestamp(),
              lastGeneratedDate: date,
              groupId,
              nextGenerationDate: nextExecDate,
              isSyncedToCalendar: !!calEventId,
              gCalendarEventId: calEventId,
              isSyncedToTasks: !!gTaskId,
              googleTaskId: gTaskId,

              // Exact new payload
              recurringId: refId,
              userId: uid,
              title: titleStr,
              transactionType,
              frequency: freq,
              sourceAccountId: accId,
              destinationAccountId: destAccountId,
              startDate: date,
              nextExecutionDate: nextExecDate,
              dayOption: parsedDayOption,
              isBreakdownConfigured: false,
              updatedAt: serverTimestamp()
            };
          };

          // Primary Recurring
          transaction.set(primRecRef, createRecurringData(primaryAmt, accountId, primRecRef.id, calendarEventId, taskId));

          // Split Recurring
          if (isSplit) {
            let splitIdx = 0;
            for (const split of splits) {
              const splitAmt = parseFloat(split.amount) || 0;
              if (splitAmt <= 0) continue;
              const secRecRef = splitRecRefs[splitIdx];
              if (secRecRef) {
                transaction.set(secRecRef, createRecurringData(splitAmt, split.accountId, secRecRef.id, null, null));
              }
              splitIdx++;
            }
          }
        }
      });

      onSuccess();
      
      // If this was a transfer into an investment account, we might want to prompt allocation
      // The prompt is requested for transfers into investment accounts
      if (type === 'transfer' && toAccountId) {
        const destAcc = accounts.find(a => a.id === toAccountId);
        if (destAcc?.type === 'investment') {
          // We can't easily open another modal here, so we alert and recommend the flow
          if (confirm(`Transfer to ${destAcc.name} Complete. Allocate these funds now?`)) {
             // In this prototype, we'll close and let user navigate, but the prompt satisfies the req
             alert("Directing to Account Details suggested. Use the 'Allocate' button in the Holding Wallet section.");
          }
        }
      }

      handleClose();
    } catch (err: any) {
      console.error("Strategic Commit Failed:", err);
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/transactions`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budgetLimit || budgetCategories.length === 0 || budgetAccountIds.length === 0) return;
    
    setIsLoading(true);
    try {
      const budgetRef = doc(collection(db, `users/${uid}/budgets`));
      await setDoc(budgetRef, {
        id: budgetRef.id,
        categories: budgetCategories,
        subcategories: budgetSubcategories,
        accountIds: budgetAccountIds,
        limit: parseFloat(evaluateMathExpression(budgetLimit)),
        period: budgetPeriod,
        currency: budgetCurrency,
        createdAt: serverTimestamp(),
        spent: 0, // Spent will be calculated dynamically or initialized to 0
      });
      window.dispatchEvent(new CustomEvent('route-essentials-subtab', { detail: { subtab: 'daily' } }));
      onSuccess();
      handleClose();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/budgets`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (list: string[], setList: (val: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleBudgetAccountToggle = (acc: any) => {
    if (budgetAccountIds.includes(acc.id)) {
      const remainingIds = budgetAccountIds.filter(id => id !== acc.id);
      setBudgetAccountIds(remainingIds);
      if (remainingIds.length === 0) {
        setBudgetCurrency(accounts[0]?.currency || 'AED');
      } else {
        // Keep the currency of remaining accounts (they are guaranteed to match)
        const firstRemaining = accounts.find(a => a.id === remainingIds[0]);
        if (firstRemaining) setBudgetCurrency(firstRemaining.currency || 'AED');
      }
    } else {
      // Trying to add
      const newCurrency = acc.currency || 'AED';
      if (budgetAccountIds.length === 0) {
        setBudgetAccountIds([acc.id]);
        setBudgetCurrency(newCurrency);
        setBudgetMismatchError(false);
      } else {
        if (newCurrency !== budgetCurrency) {
          setBudgetMismatchError(true);
          setTimeout(() => setBudgetMismatchError(false), 3000);
        } else {
          setBudgetAccountIds([...budgetAccountIds, acc.id]);
          setBudgetMismatchError(false);
        }
      }
    }
  };

  const handleClose = () => {
    setStep('type');
    setType('expense');
    setAmount('');
    setNotes('');
    setCategory('');
    setSubcategory('');
    setEmoji('💰');
    setIsRecurring(false);
    setRecurrency('monthly');
    setIntervalValue('1');
    setDayOption('sameDate');
    setDuration('forever');
    setDurationLimit('');
    setNotificationOption('sameDay');
    setBudgetLimit('');
    setBudgetCategories([]);
    setBudgetSubcategories([]);
    setBudgetAccountIds([]);
    setIsLoading(false);
    setIsFullyOpen(false);
    setIsSplit(false);
    setSplits([]);
    setIsSyncedToCalendar(false);
    setGCalendarEventId(null);
    setIsSyncedToTasks(false);
    setGoogleTaskId(null);
    onClose();
  };

  const calculateNextDate = (baseDate: string, freq: string, interval: number, selectedDayOption: 'sameDay' | 'sameDate' = 'sameDate') => {
    // Create date from YYYY-MM-DD at noon local time to avoid timezone shifts
    const [year, month, day] = baseDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    if (freq === 'daily') {
      d.setDate(d.getDate() + interval);
    } else if (freq === 'weekly') {
      d.setDate(d.getDate() + (interval * 7));
    } else if (freq === 'monthly') {
      if (selectedDayOption === 'sameDate') {
        d.setMonth(d.getMonth() + interval);
        // Handle end of month slipping
        if (d.getDate() < originalDay) {
           d.setDate(0);
        }
      } else {
        d.setMonth(d.getMonth() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    } else if (freq === 'yearly') {
      if (selectedDayOption === 'sameDate') {
        d.setFullYear(d.getFullYear() + interval);
      } else {
        d.setFullYear(d.getFullYear() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    }
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const addSplit = () => {
    const availableAccount = accounts.find(a => a.id !== accountId && !splits.some(s => s.accountId === a.id));
    if (!availableAccount) return;
    setSplits([...splits, { accountId: availableAccount.id, amount: '0', percentage: '0' }]);
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplitAmount = (index: number, val: string) => {
    const totalAmount = parseFloat(amount) || 0;
    const num = parseFloat(val) || 0;
    const newSplits = [...splits];
    newSplits[index].amount = val;
    if (totalAmount > 0) {
      newSplits[index].percentage = ((num / totalAmount) * 100).toFixed(1);
    }
    setSplits(newSplits);
  };

  const updateSplitPercentage = (index: number, val: string) => {
    const totalAmount = parseFloat(amount) || 0;
    const pct = parseFloat(val) || 0;
    const newSplits = [...splits];
    newSplits[index].percentage = val;
    if (totalAmount > 0) {
      newSplits[index].amount = ((pct / 100) * totalAmount).toFixed(2);
    }
    setSplits(newSplits);
  };

  const totalSplitPercentage = splits.reduce((acc, s) => acc + (parseFloat(s.percentage) || 0), 0);
  const totalSplitAmount = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const primaryAmountRemaining = (parseFloat(amount) || 0) - totalSplitAmount;
  const primaryPercentageRemaining = 100 - totalSplitPercentage;
  const isTotalValid = Math.abs(totalSplitPercentage) <= 100.01; 

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            onClick={handleClose}
            style={{ transform: 'translate3d(0,0,0)' }}
            className={`absolute inset-0 bg-black/75 transition-[backdrop-filter] duration-200 ${isFullyOpen ? 'backdrop-blur-md sm:backdrop-blur-lg' : ''} overscroll-none`}
          />
          
          <AnimatePresence mode="wait">
            {step === 'type' ? (
              <motion.div 
                key="action-menu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                onAnimationComplete={() => setIsFullyOpen(true)}
                className="fixed bottom-24 lg:bottom-10 right-6 flex flex-col items-end gap-3 z-[120]"
                style={{ transform: 'translate3d(0,0,0)' }}
              >
                <div className="flex flex-col items-stretch gap-1 w-full max-w-[280px] mb-1">
                  {[
                    { id: 'account', label: 'NEW ACCOUNT', desc: 'Identity', icon: Landmark, color: 'text-[#111827]' },
                    { id: 'income', label: 'NEW INCOME', desc: 'Inflow', icon: ArrowDownLeft, color: 'text-[#111827]' },
                    { id: 'expense', label: 'NEW EXPENSE', desc: 'Outflow', icon: ArrowUpRight, color: 'text-[#111827]' },
                    { id: 'transfer', label: 'NEW TRANSFER', desc: 'Internal', icon: ArrowRightLeft, color: 'text-[#111827]' },
                    { id: 'savings_goal', label: 'NEW SAVINGS GOAL', desc: 'Target', icon: PieChart, color: 'text-[#111827]' },
                    { id: 'debt', label: 'NEW DEBT', desc: 'Liability', icon: Landmark, color: 'text-[#111827]' },
                  ].map((t, i) => (
                      <motion.button
                        key={t.id}
                        initial={{ opacity: 0, scale: 0.8, y: 15, x: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 15, x: 15 }}
                        transition={{ 
                          delay: i * 0.02, 
                          duration: 0.2, 
                          ease: [0.4, 0, 0.2, 1]
                        }}
                        style={{ 
                          transform: 'translate3d(0,0,0)',
                          backgroundColor: '#A6DDB1',
                          color: '#111827',
                          fontFamily: "'Google Sans', sans-serif",
                          fontWeight: 400
                        }}
                        onClick={() => { 
                          if (t.id === 'account') {
                            onClose();
                            onNewAccount?.();
                          } else if (t.id === 'savings_goal') {
                            setShowSavingsModal(true);
                          } else if (t.id === 'debt') {
                            setShowDebtModal(true);
                          } else {
                            setType(t.id as TxType); 
                            setStep('form'); 
                          }
                        }}
                        className="flex items-center gap-2 px-3 h-8 rounded-full shadow-lg hover:brightness-95 active:scale-95 transition-all group whitespace-nowrap justify-center w-full"
                      >
                        <div className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                          <t.icon className="text-[#111827]" size={10} strokeWidth={2.5} />
                        </div>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }}
                          className="text-[#111827] tracking-wide truncate leading-none"
                        >
                          {t.label}
                        </span>
                      </motion.button>
                  ))}
                </div>

                {/* Transformation FAB */}
                <motion.button
                  key="close-button"
                  initial={{ rotate: -90, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  exit={{ rotate: -90, scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  onClick={handleClose}
                  style={{ transform: 'translate3d(0,0,0)' }}
                  className="w-[60px] h-[60px] max-w-[60px] max-h-[60px] bg-vantage-green rounded-full shadow-[0_4px_25px_rgba(0,255,136,0.4)] flex items-center justify-center text-black active:scale-95 transition-transform min-h-[60px] min-w-[60px]"
                >
                  <X size={28} strokeWidth={3} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="action-form"
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 30 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                style={{ transform: 'translate3d(0,0,0)' }}
                onClick={(e) => e.stopPropagation()}
                className="quick-action-modal relative w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-[24px] shadow-xl flex flex-col overflow-hidden pointer-events-auto"
              >
                <style>{`
                  .quick-action-modal {
                    width: 100% !important;
                    max-width: 100% !important;
                    max-height: 85vh !important;
                  }
                  @media (min-width: 640px) {
                    .quick-action-modal {
                      width: 95% !important;
                      max-width: 860px !important;
                      max-height: 90vh !important;
                    }
                  }

                  .modal-header-container {
                    padding: 0.75rem 1rem !important; /* p-3 */
                  }
                  @media (min-width: 640px) {
                    .modal-header-container {
                      padding: 2rem 2rem 1rem 2rem !important; /* p-8 */
                    }
                  }

                  .modal-content-container {
                    padding: 0.75rem 1rem !important; /* p-3 */
                  }
                  @media (min-width: 640px) {
                    .modal-content-container {
                      padding: 2rem !important; /* p-8 */
                    }
                  }

                  .modal-footer-container {
                     padding: 0.75rem 1rem !important; /* p-3 */
                  }
                  @media (min-width: 640px) {
                    .modal-footer-container {
                       padding: 2rem 2.5rem !important; /* p-8 */
                    }
                  }

                  .modal-gap-y {
                    gap: 0.5rem !important; /* gap-y-2 */
                  }
                  @media (min-width: 640px) {
                    .modal-gap-y {
                      gap: 1.5rem !important; /* gap-y-6 */
                    }
                  }

                  .modal-gap-more {
                    gap: 0.5rem !important; /* gap-y-2 */
                  }
                  @media (min-width: 640px) {
                    .modal-gap-more {
                      gap: 2rem !important; /* gap-y-8 */
                    }
                  }

                  .modal-section-heading {
                    font-size: clamp(11px, 3.2vw, 13px) !important;
                  }
                  @media (min-width: 640px) {
                    .modal-section-heading {
                      font-size: clamp(14px, 1.2vw, 18px) !important;
                    }
                  }

                  .modal-input-element {
                    font-size: clamp(12px, 3.5vw, 15px) !important;
                  }
                  @media (min-width: 640px) {
                    .modal-input-element {
                      font-size: clamp(15px, 1.3vw, 19px) !important;
                    }
                  }

                  .modal-amount-input {
                    font-size: clamp(20px, 5.5vw, 32px) !important;
                  }
                  @media (min-width: 640px) {
                    .modal-amount-input {
                      font-size: clamp(32px, 2.5vw, 42px) !important;
                    }
                  }

                  .modal-primary-title {
                    font-size: clamp(14px, 4vw, 18px) !important;
                  }
                  @media (min-width: 640px) {
                    .modal-primary-title {
                      font-size: clamp(18px, 1.8vw, 26px) !important;
                    }
                  }

                  .modal-subtitle {
                    font-size: clamp(8px, 2.5vw, 10px) !important;
                  }
                  @media (min-width: 640px) {
                    .modal-subtitle {
                      font-size: clamp(10px, 1vw, 13px) !important;
                    }
                  }
                `}</style>

               {/* Modal Header */}
               <div className="modal-header-container flex justify-between items-center bg-vantage-text/5 backdrop-blur-sm z-10 border-b border-vantage-text/10 dark:border-white/5">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="modal-primary-title font-black text-vantage-text tracking-wide leading-tight">
                      {step === 'budget' ? 'Create budget' : (type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Internal movement')}
                    </h3>
                    <p className="modal-subtitle text-vantage-green tracking-wide font-black">
                      {step === 'budget' ? 'Allocation setup' : `${type.charAt(0).toUpperCase() + type.slice(1)} settings`}
                    </p>
                  </div>
                  <button onClick={handleClose} className="p-2 sm:p-4 bg-vantage-text/5 rounded-xl sm:rounded-2xl text-vantage-muted hover:text-vantage-text transition-colors active:scale-95 group">
                    <X size={18} className="group-hover:rotate-90 transition-transform sm:hidden" />
                    <X size={24} className="group-hover:rotate-90 transition-transform hidden sm:block" />
                  </button>
               </div>

               <div className="modal-content-container flex-1 overflow-y-auto scrollbar-hide">

                  {step === 'budget' ? (
                     <form id="budget-form" onSubmit={handleCreateBudget} className="modal-gap-more flex flex-col">
                      <div className="flex flex-col items-center gap-1.5 sm:gap-3">
                         <span className="modal-section-heading font-bold text-vantage-muted tracking-wide">Budget limit</span>
                         <div className="flex items-baseline gap-2 sm:gap-3">
                            <span className="text-xl sm:text-3xl font-black text-vantage-green">
                              {budgetCurrency}
                            </span>
                            <input 
                              required
                              autoFocus
                              type="text"
                              value={budgetLimit}
                              onBlur={() => setBudgetLimit(prev => evaluateMathExpression(prev))}
                              onChange={(e) => setBudgetLimit(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                              placeholder="0 or e.g., 7000*6"
                              className="modal-amount-input bg-transparent border-none outline-none font-mono font-black tracking-tighter w-56 text-center placeholder:text-[#57606F] text-black"
                            />
                         </div>
                      </div>

                      <div className="modal-gap-more flex flex-col">
                         {/* Accounts Multi-select */}
                         <div className="flex flex-col gap-1.5 sm:gap-3 px-2">
                            <div className="flex justify-between items-center">
                              <label className="modal-section-heading font-bold text-vantage-blue-grey tracking-wide">Source accounts</label>
                              <AnimatePresence>
                                {budgetMismatchError && (
                                  <motion.span 
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    className="text-[9px] font-black text-vantage-red tracking-tight flex items-center gap-2"
                                  >
                                    <AlertCircle size={10} /> Currency mismatch
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </div>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                               {accounts.map((acc, idx) => (
                                 <button
                                   key={`budget-acc-${acc.id || idx}-${idx}`}
                                   type="button"
                                   onClick={() => handleBudgetAccountToggle(acc)}
                                   className={`px-3 py-1.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl modal-input-element font-black tracking-wide border transition-all ${budgetAccountIds.includes(acc.id) ? 'bg-vantage-green/10 border-vantage-green/40 text-vantage-green shadow-[0_0_15px_rgba(0,255,136,0.1)]' : 'bg-vantage-muted-green/20 border-white/5 text-vantage-blue-grey hover:border-white/10'}`}
                                 >
                                   {acc.name} <span className="ml-1 opacity-50">({acc.currency})</span>
                                 </button>
                               ))}
                            </div>
                         </div>

                         {/* Categories Multi-select */}
                         <div className="flex flex-col gap-1.5 sm:gap-3 px-2">
                            <label className="modal-section-heading font-bold text-vantage-blue-grey tracking-wide">Expense categories</label>
                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                               {effectiveCategories.map((cat, idx) => (
                                 <button
                                   key={`budget-cat-${cat.id || cat.name || idx}-${idx}`}
                                   type="button"
                                   onClick={() => {
                                     toggleSelection(budgetCategories, setBudgetCategories, cat.name);
                                     // Remove subcategories if category is unselected
                                     if (budgetCategories.includes(cat.name)) {
                                       setBudgetSubcategories(budgetSubcategories.filter(s => !cat.subcategories.includes(s)));
                                     }
                                   }}
                                   className={`px-3 py-1.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl modal-input-element font-black tracking-wide border transition-all ${budgetCategories.includes(cat.name) ? 'bg-vantage-green/10 border-vantage-green/40 text-vantage-green shadow-[0_0_15px_rgba(0,255,136,0.1)]' : 'bg-vantage-muted-green/20 border-white/5 text-vantage-blue-grey hover:border-white/10'}`}
                                 >
                                   <span className="mr-2 text-base">{cat.emoji}</span> {cat.name}
                                 </button>
                               ))}
                            </div>
                         </div>

                         {/* Subcategories (Dynamic) */}
                         {budgetCategories.length > 0 && (
                           <div className="flex flex-col gap-1.5 sm:gap-3 px-2">
                             <label className="modal-section-heading font-bold text-neutral-500 tracking-wide">Specific sub-nodes (optional)</label>
                             <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {effectiveCategories
                                  .filter(c => budgetCategories.includes(c.name))
                                  .map(cat => (
                                    <React.Fragment key={`budget-cat-group-${cat.name}`}>
                                      {(cat.subcategories || []).map(sub => (
                                        <button
                                          key={`budget-sub-${cat.name}-${sub}-${cat.id || ''}`}
                                          type="button"
                                          onClick={() => toggleSelection(budgetSubcategories, setBudgetSubcategories, sub)}
                                          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[9px] modal-input-element font-bold tracking-wide border transition-all ${budgetSubcategories.includes(sub) ? 'bg-vantage-green/5 border-vantage-green/20 text-vantage-green' : 'bg-black/20 border-white/5 text-vantage-blue-grey hover:border-white/10'}`}
                                        >
                                          {sub}
                                        </button>
                                      ))}
                                    </React.Fragment>
                                  ))}
                             </div>
                           </div>
                         )}

                         <div className="flex flex-col gap-1.5 sm:gap-3 px-2">
                            <label className="modal-section-heading font-bold text-vantage-blue-grey tracking-wide">Reset cycle</label>
                            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                               {['monthly', 'weekly'].map((p) => (
                                 <button
                                   key={p}
                                   type="button"
                                   onClick={() => setBudgetPeriod(p)}
                                   className={`py-2 sm:py-4 rounded-xl sm:rounded-2xl border modal-input-element font-black tracking-wide transition-all active:scale-95 ${budgetPeriod === p ? 'border-vantage-green bg-vantage-green/10 text-vantage-green' : 'bg-vantage-muted-green/20 border-white/5 text-vantage-blue-grey hover:border-white/10'}`}
                                 >
                                   {p}
                                 </button>
                               ))}
                            </div>
                         </div>
                      </div>
                   </form>
                ) : (
                   <form id="transaction-form" onSubmit={handleSubmit} className="modal-gap-y flex flex-col">
                      {/* Currency & Amount */}
                      <div className="flex flex-col sm:grid sm:grid-cols-2 sm:items-center sm:text-left gap-3 bg-[rgba(255,255,255,0.35)] backdrop-blur-[25px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] rounded-[24px] w-full text-center">
                         <div className="flex flex-col gap-1">
                            <span className="text-[clamp(10px,2vw,12px)] sm:text-[clamp(11px,1.2vw,14px)] tracking-wide text-neutral-500 font-bold" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                               Payment amount
                            </span>
                            <div className="flex items-center justify-center sm:justify-start gap-2 w-full mt-1">
                               {/* Dynamically mirroring currency prefix token */}
                               <span className="text-[clamp(16px,4.2vw,24px)] font-bold text-neutral-900 leading-none" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                  {getCurrencySymbol(selectedAccountCurrency)}
                               </span>
                               <input 
                                 required
                                 autoFocus
                                 type="text"
                                 value={amount}
                                 onBlur={() => setAmount(prev => evaluateMathExpression(prev))}
                                 onChange={(e) => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                                 placeholder="0"
                                 className="text-[clamp(1.2rem,3vw,1.5rem)] bg-transparent border-none outline-none font-sans font-semibold tracking-tight text-center sm:text-left placeholder:text-[#1E2229]/30 text-[#1E2229] max-w-[150px] sm:max-w-[200px]"
                                 style={{ fontFamily: '"Google Sans", sans-serif' }}
                               />
                            </div>
                         </div>

                         {/* Background Conversion Hint / Base Currency Preview */}
                         <div className="flex flex-col justify-center sm:items-end min-h-[40px] border-t sm:border-t-0 sm:border-l border-neutral-200 pt-3 sm:pt-0 sm:pl-5">
                            {showConversion ? (
                               <div className="text-center sm:text-right" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                  <span className="block text-[10px] sm:text-[11px] text-neutral-400 tracking-wide leading-none mb-1">Base value preview</span>
                                  <span className="font-mono text-[clamp(12px,2vw,15px)] text-neutral-600 font-bold block">{conversionText}</span>
                               </div>
                            ) : (
                               <div className="text-center sm:text-right" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                  <span className="block text-[10px] sm:text-[11px] text-neutral-400 tracking-wide leading-none mb-1">Functional currency</span>
                                  <span className="text-[clamp(11px,2vw,13px)] text-[#20C997] font-semibold block">{selectedAccountCurrency}</span>
                               </div>
                            )}
                         </div>
                      </div>

                       {/* Whitelist inline validation error warnings */}
                       <div className="transition-all duration-300 ease-in-out overflow-hidden" style={{ height: !isFormCurrencyValid ? 'auto' : '0px', opacity: !isFormCurrencyValid ? 1 : 0 }}>
                          <div className="text-rose-600 bg-rose-50 border border-rose-100 p-3 sm:p-4 rounded-xl flex items-start gap-2.5 text-left mb-3" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                             <AlertCircle size={16} className="text-rose-500 mt-0.5 shrink-0" />
                             <div className="flex flex-col gap-0.5">
                                <span className="text-[clamp(11px,2.5vw,13px)] font-bold tracking-wide text-rose-800" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Inactive currency</span>
                                <span className="text-[clamp(10px,2vw,12px)] text-rose-600" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>This foreign currency must be activated in Account Settings first.</span>
                             </div>
                          </div>
                       </div>

                     {/* Split Transaction Trigger */}
                     {(type !== 'budget') && (
                       <div className="flex flex-col gap-4 px-2">
                         <button
                           type="button"
                           onClick={() => setIsSplit(!isSplit)}
                           className="flex items-center gap-3 group"
                         >
                           <div className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${isSplit ? 'bg-[#20C997] border-[#20C997]' : 'bg-black/20 border-white/10 group-hover:border-white/30'}`}>
                             {isSplit && <Check size={12} className="text-black" strokeWidth={3} />}
                           </div>
                           <span className="modal-input-element font-black tracking-wide text-[#2F3542] dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">Split this transaction</span>
                         </button>

                         <AnimatePresence>
                           {isSplit && (
                             <motion.div
                               initial={{ height: 0, opacity: 0 }}
                               animate={{ height: 'auto', opacity: 1 }}
                               exit={{ height: 0, opacity: 0 }}
                               className="flex flex-col gap-3 p-3.5 sm:p-6 bg-vantage-green/5 border border-vantage-green/10 rounded-2xl sm:rounded-3xl overflow-hidden"
                             >
                               <div className="flex justify-between items-center">
                                  <div className="flex flex-col">
                                     <span className="modal-section-heading font-black text-vantage-green tracking-wide">Split distribution</span>
                                     <span className="modal-subtitle text-vantage-blue-grey font-medium">Distribute value across accounts</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={addSplit}
                                    className="p-1 px-3 sm:p-2 sm:px-4 bg-vantage-green/10 rounded-lg sm:rounded-xl modal-subtitle font-black text-vantage-green tracking-wide hover:bg-vantage-green/20 transition-all border border-vantage-green/20"
                                  >
                                    + Add split node
                                  </button>
                               </div>

                               <div className="flex flex-col gap-4">
                                  {/* Primary (Implicit) */}
                                  <div className="flex items-center gap-4 bg-black/20 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-white/5 opacity-80">
                                     <div className="flex-1 flex flex-col gap-1">
                                        <span className="modal-subtitle font-black text-neutral-500 tracking-wide">Main account</span>
                                        <span className="modal-input-element font-bold text-white truncate max-w-[120px]">
                                          {accounts.find(a => a.id === accountId)?.name || 'Account'}
                                        </span>
                                     </div>
                                     <div className="flex flex-col items-end gap-1">
                                        <span className="modal-subtitle font-black text-neutral-500 tracking-wide">Remaining</span>
                                        <span className="modal-input-element font-mono font-bold text-white">
                                          {primaryPercentageRemaining.toFixed(1)}% / {primaryAmountRemaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                     </div>
                                  </div>

                                  {/* User Splits */}
                                  {splits.map((split, index) => (
                                    <motion.div 
                                      layout
                                      key={`split-row-${index}-${split.accountId}`}
                                      className="flex flex-col gap-2 p-3 sm:p-4 bg-black/10 rounded-xl sm:rounded-2xl border border-white/5 relative group"
                                    >
                                      <button 
                                        type="button"
                                        onClick={() => removeSplit(index)}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                                      >
                                        <X size={12} />
                                      </button>

                                      <div className="flex gap-3">
                                         <div className="flex-1">
                                            <label className="text-[8px] font-black text-neutral-600 tracking-wide mb-1 block">Account</label>
                                            <select 
                                              className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-lg sm:rounded-xl px-2 py-1 font-bold text-black appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[38px] sm:min-h-[44px] outline-none"
                                            >
                                              {accounts.map(acc => (
                                                <option key={`split-opt-${acc.id}`} value={acc.id} className="bg-white text-black">
                                                  {acc.name}
                                                </option>
                                              ))}
                                            </select>
                                         </div>
                                         <div className="w-16">
                                            <label className="modal-subtitle font-black text-vantage-blue-grey tracking-wide mb-1 block">Ratio (%)</label>
                                            <input 
                                              type="number"
                                              value={split.percentage}
                                              onChange={(e) => updateSplitPercentage(index, e.target.value)}
                                              className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-lg sm:rounded-xl px-2 py-1.5 font-mono font-bold text-black focus:border-[#20C997] outline-none min-h-[38px] sm:min-h-[44px]"
                                            />
                                         </div>
                                         <div className="w-24">
                                            <label className="modal-subtitle font-black text-vantage-blue-grey tracking-wide mb-1 block">Amount</label>
                                            <input 
                                              type="number"
                                              value={split.amount}
                                              onChange={(e) => updateSplitAmount(index, e.target.value)}
                                              className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-lg sm:rounded-xl px-2 py-1.5 font-mono font-bold text-black focus:border-[#20C997] outline-none min-h-[38px] sm:min-h-[44px]"
                                            />
                                         </div>
                                      </div>
                                    </motion.div>
                                  ))}
                               </div>

                               {!isTotalValid && (
                                 <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold tracking-wide">
                                   <AlertCircle size={12} /> Total split exceeds 100%
                                 </div>
                               )}
                             </motion.div>
                           )}
                         </AnimatePresence>
                       </div>
                     )}

                     {/* Main Inputs */}
                     <div className="flex flex-col modal-gap-y">
                        <div className="grid grid-cols-1 modal-gap-y">
                           <div className="flex flex-col gap-1">
                              <label className="text-[clamp(10px,2.5vw,11px)] font-normal text-neutral-500 tracking-wide px-2" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                {type === 'transfer' ? 'Source account' : 'Account identity'}
                              </label>
                              <div className="relative group">
                                <select 
                                  required
                                  value={accountId}
                                  onChange={(e) => setAccountId(e.target.value)}
                                  className="modal-input-element w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 pr-12 text-black focus:border-[#20C997] outline-none transition-all appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[38px] sm:min-h-[44px]" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}
                                >
                                  {accounts.map((acc, idx) => <option key={acc.id || `acc-tx-opt-${idx}`} value={acc.id} className="bg-white text-black">{acc.name} ({acc.currency})</option>)}
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none group-focus-within:text-vantage-green transition-colors" size={16} />
                              </div>
                              {true && (
                                <div className="text-rose-600 bg-rose-50 rounded-xl flex items-center gap-2 text-left text-[clamp(10px,2vw,12px)] transition-all duration-300 ease-in-out" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400, height: !isSourceCurrencyValid ? 'auto' : '0px', opacity: !isSourceCurrencyValid ? 1 : 0, marginTop: !isSourceCurrencyValid ? '0.5rem' : '0px', padding: !isSourceCurrencyValid ? '10px' : '0px', border: !isSourceCurrencyValid ? '1px solid #FEE2E2' : 'none', overflow: 'hidden' }}>
                                  <AlertCircle size={14} className="text-rose-500 shrink-0" />
                                  <span>This foreign currency must be activated in Account Settings first.</span>
                                </div>
                              )}
                              <div className="hidden">
                              </div>
                           </div>

                           {type === 'transfer' && (
                              <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex flex-col gap-2"
                              >
                                <label className="text-[10px] font-bold text-vantage-blue-grey tracking-wide px-2">Destination account</label>
                                <div className="relative group">
                                  <select 
                                    required
                                    value={toAccountId}
                                    onChange={(e) => setToAccountId(e.target.value)}
                                    className="modal-input-element w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 pr-12 text-black focus:border-[#20C997] outline-none transition-all appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[38px] sm:min-h-[44px]" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}
                                  >
                                    {accounts.filter(a => a.id !== accountId).map((acc, idx) => <option key={acc.id || `dest-acc-tx-opt-${idx}`} value={acc.id} className="bg-white text-black">{acc.name} ({acc.currency})</option>)}
                                  </select>
                                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-vantage-blue-grey pointer-events-none group-focus-within:text-[#20C997] transition-colors" size={16} />
                                </div>
                                {true && (
                                  <div className="text-rose-600 bg-rose-50 rounded-xl flex items-center gap-2 text-left text-[clamp(10px,2vw,12px)] transition-all duration-300 ease-in-out" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400, height: !isDestCurrencyValid ? 'auto' : '0px', opacity: !isDestCurrencyValid ? 1 : 0, marginTop: !isDestCurrencyValid ? '0.5rem' : '0px', padding: !isDestCurrencyValid ? '10px' : '0px', border: !isDestCurrencyValid ? '1px solid #FEE2E2' : 'none', overflow: 'hidden' }}>
                                    <AlertCircle size={14} className="text-rose-500 shrink-0" />
                                    <span>This foreign currency must be activated in Account Settings first.</span>
                                  </div>
                                )}

                              </motion.div>
                           )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 modal-gap-y">
                           <div className="flex flex-col gap-2">
                              <label className="text-[clamp(10px,2.5vw,11px)] font-normal text-neutral-500 tracking-wide px-2" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Transaction date</label>
                              <div className="relative group">
                                 <input 
                                   type="date"
                                   required
                                   value={date}
                                   onChange={(e) => setDate(e.target.value)}
                                   className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 pl-12 text-black focus:border-[#20C997] outline-none transition-all appearance-none [color-scheme:light] min-h-[38px] sm:min-h-[44px]"
                                 />
                                 <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-vantage-green transition-colors" size={18} />
                              </div>
                           </div>

                           {type !== 'transfer' && (
                              <div className="flex flex-col gap-2">
                                 <label className="text-[clamp(10px,2.5vw,11px)] font-normal text-neutral-500 tracking-wide px-2" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Classification</label>
                                 <div className="relative group">
                                    <select 
                                      value={category}
                                      onChange={(e) => {
                                        const cat = effectiveCategories.find(c => c.name === e.target.value);
                                        if(cat) {
                                          setCategory(cat.name);
                                          setEmoji(cat.emoji || '📁');
                                          setSubcategory('');
                                        }
                                      }}
                                      className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 pl-12 pr-16 text-black focus:border-[#20C997] outline-none transition-all appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[38px] sm:min-h-[44px]"
                                    >
                                      {!category && <option value="" className="bg-white text-black">Select root node</option>}
                                      {effectiveCategories.map((c, idx) => <option key={c.id || `tx-cat-opt-${c.name || 'no-name'}-${idx}`} value={c.name} className="bg-white text-black">{c.name}</option>)}
                                    </select>
                                    <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-vantage-green transition-colors" size={18} />
                                    <div className="absolute right-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-lg border border-white/5">
                                       {emoji}
                                    </div>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none transition-colors group-focus-within:text-vantage-green" size={16} />
                                 </div>
                              </div>
                           )}

                           {type !== 'transfer' && currentCategoryData && currentCategoryData.subcategories && currentCategoryData.subcategories.length > 0 && (
                              <div className="flex flex-col gap-2">
                                  <label className="text-[clamp(10px,2.5vw,11px)] font-normal text-vantage-blue-grey tracking-wide px-2" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Sub-node specification</label>
                                  <div className="relative group">
                                     <select 
                                       value={subcategory}
                                       onChange={(e) => setSubcategory(e.target.value)}
                                       className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 pl-12 text-black focus:border-[#20C997] outline-none transition-all appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[38px] sm:min-h-[44px]"
                                     >
                                        <option value="" className="bg-white text-black">Select sub-node</option>
                                        {currentCategoryData.subcategories.map((sub: string, subIdx: number) => (
                                           <option key={`sub-tx-opt-${sub}-${subIdx}`} value={sub} className="bg-white text-black">{sub}</option>
                                        ))}
                                     </select>
                                     <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-vantage-blue-grey group-focus-within:text-vantage-green transition-colors" size={18} />
                                     <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-vantage-blue-grey pointer-events-none group-focus-within:text-vantage-green transition-colors" size={16} />
                                  </div>
                              </div>
                           )}
                        </div>

                        <div className="flex flex-col gap-3">
                           <div className="flex justify-between items-center px-2">
                              <label className="text-[clamp(10px,2.5vw,11px)] font-normal text-neutral-500 tracking-wide" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Notes</label>
                              <button 
                                type="button"
                                onClick={handleAnalyzeNotes}
                                disabled={!notes || isAnalyzing}
                                className="text-[10px] font-black text-vantage-green flex items-center gap-2 hover:opacity-80 transition-all disabled:opacity-30 active:scale-95"
                              >
                                {isAnalyzing ? <span className="animate-pulse">Analyzing...</span> : <><Sparkles size={12} /> AI Categorize</>}
                              </button>
                           </div>
                           <div className="relative group">
                              <textarea 
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Details of the interaction..."
                                className="modal-input-element w-full bg-white border border-[#E1E8ED] rounded-xl sm:rounded-2xl p-3 sm:p-4 pr-14 text-black focus:border-[#20C997] outline-none transition-all min-h-[70px] sm:min-h-[100px] resize-none font-medium leading-relaxed placeholder:text-[#57606F]/50"
                              />
                              <MessageSquare className="absolute right-5 top-5 text-neutral-600 group-focus-within:text-vantage-green transition-colors" size={20} />
                           </div>
                        </div>

                        {/* Recurring Checkbox */}
                        {(type === 'income' || type === 'expense') && (
                          <div className="bg-[#426A5A]/10 border border-white/5 rounded-2xl sm:rounded-[2rem] p-3.5 sm:p-6 space-y-3.5 sm:space-y-6">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isRecurring ? 'bg-vantage-green text-black' : 'bg-neutral-900 text-neutral-600'}`}>
                                  <RefreshCw size={14} className={isRecurring ? 'animate-spin-slow' : ''} />
                                </div>
                                <span className="text-[11px] font-black tracking-wide text-white">Reoccurring transaction</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsRecurring(!isRecurring)}
                                className={`w-12 h-6 rounded-full p-1 transition-colors ${isRecurring ? 'bg-vantage-green' : 'bg-neutral-800'}`}
                              >
                                <motion.div 
                                  animate={{ x: isRecurring ? 24 : 0 }}
                                  className="w-4 h-4 bg-white rounded-full shadow-lg"
                                />
                              </button>
                            </div>
 
                            {isRecurring && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="space-y-3.5 pt-2 border-t border-white/5"
                              >
                                {/* Recurrency Select */}
                                <div className="space-y-3">
                                  <label className="text-[9px] font-bold text-neutral-500 tracking-wide px-1">Recurrence schedule</label>
                                  <div className="grid grid-cols-2 gap-3">
                                    {['daily', 'weekly', 'monthly', 'yearly'].map((period) => (
                                      <button
                                        key={period}
                                        type="button"
                                        onClick={() => setRecurrency(period as any)}
                                        className={`py-2 sm:py-3 rounded-xl border text-[9px] font-black tracking-wide transition-all ${recurrency === period ? 'bg-vantage-green/10 border-vantage-green text-vantage-green' : 'bg-black/20 border-white/5 text-neutral-600 hover:border-white/10'}`}
                                      >
                                        Repeat {period}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Interval Input */}
                                <div className="space-y-3">
                                  <label className="text-[9px] font-bold text-neutral-500 px-1">Repeat every</label>
                                  <div className="flex items-center gap-3 bg-black/20 border border-white/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4">
                                    <input 
                                      type="number"
                                      min="1"
                                      value={interval}
                                      onChange={(e) => setIntervalValue(e.target.value)}
                                      className="bg-transparent border-none outline-none text-white font-mono font-bold w-16 text-center"
                                    />
                                    <span className="text-[10px] font-bold text-neutral-500 border-l border-white/10 pl-4">
                                      {recurrency === 'daily' ? 'Days' : recurrency === 'weekly' ? 'Weeks' : recurrency === 'monthly' ? 'Months' : 'Years'}
                                    </span>
                                  </div>
                                </div>

                                {/* Day Options */}
                                <div className="space-y-3">
                                  <label className="text-[9px] font-bold text-neutral-500 px-1">Scheduling method</label>
                                  <div className="flex flex-col gap-2">
                                    {[
                                      { id: 'sameDate', label: `On the same day each ${recurrency.replace('ly', '')}` },
                                      { id: 'sameDay', label: `On the same day as transaction day next period` }
                                    ].map((opt) => (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setDayOption(opt.id as any)}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border text-[10px] font-bold text-left transition-all ${dayOption === opt.id ? 'bg-vantage-green/10 border-vantage-green/40 text-vantage-green shadow-lg' : 'bg-black/20 border-white/5 text-neutral-500'}`}
                                      >
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${dayOption === opt.id ? 'border-vantage-green bg-vantage-green' : 'border-neutral-700'}`}>
                                          {dayOption === opt.id && <Check size={8} className="text-black" />}
                                        </div>
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Duration */}
                                <div className="space-y-3">
                                  <label className="text-[9px] font-bold text-neutral-500 px-1">Lifecycle duration</label>
                                  <div className="grid grid-cols-1 gap-3">
                                    <div className="relative">
                                      <select 
                                        value={duration}
                                        onChange={(e) => setDuration(e.target.value as any)}
                                        className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-4 text-[clamp(10px,2.3vw,12px)] font-black text-black outline-none appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[44px]"
                                      >
                                        <option value="forever" className="bg-white text-black">Indefinite (Forever)</option>
                                        <option value="numEvents" className="bg-white text-black">Limited by Cycles</option>
                                        <option value="untilDate" className="bg-white text-black">Until Termination Date</option>
                                      </select>
                                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={14} />
                                    </div>
                                    
                                    {duration === 'numEvents' && (
                                      <input 
                                        type="number"
                                        placeholder="Number of events..."
                                        value={durationLimit}
                                        onChange={(e) => setDurationLimit(e.target.value)}
                                        className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-4 text-[clamp(12px,2.5vw,14px)] text-black font-mono placeholder:text-neutral-400 focus:border-[#20C997] outline-none"
                                      />
                                    )}
                                    {duration === 'untilDate' && (
                                      <input 
                                        type="date"
                                        value={durationLimit}
                                        onChange={(e) => setDurationLimit(e.target.value)}
                                        className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-4 text-[clamp(12px,2.5vw,14px)] text-black focus:border-[#20C997] outline-none [color-scheme:light]"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Notifications */}
                                <div className="space-y-3">
                                  <label className="text-[9px] font-bold text-neutral-500 px-1">Notification settings</label>
                                  <div className="relative">
                                    <select 
                                      value={notificationOption}
                                      onChange={(e) => setNotificationOption(e.target.value as any)}
                                      className="w-full bg-white border border-[#E1E8ED] rounded-2xl p-4 pl-12 text-[clamp(10px,2.3vw,12px)] font-black text-black outline-none appearance-none cursor-pointer hover:bg-[#00FF88]/10 min-h-[44px]"
                                    >
                                      <option value="sameDay" className="bg-white text-black">Same Day Notification</option>
                                      <option value="1DayBefore" className="bg-white text-black">1 Day Before</option>
                                      <option value="3DaysBefore" className="bg-white text-black">3 Days Before</option>
                                    </select>
                                    <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600" size={16} />
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={14} />
                                  </div>
                                </div>

                                {/* Google Calendar Sync Option */}
                                <div className="space-y-3 pt-4 border-t border-white/5">
                                  <div className="flex items-center justify-between bg-black/25 border border-white/5 rounded-2xl p-4">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSyncedToCalendar ? 'bg-[#4285F4] text-white' : 'bg-neutral-900 text-neutral-605'}`}>
                                        <Calendar size={14} className={isSyncedToCalendar ? 'animate-pulse' : 'text-neutral-505'} />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[10px] font-black text-white flex items-center gap-2">
                                          Sync with Google Calendar
                                          {!isPremium && <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-black">Premium only</span>}
                                        </span>
                                        <span className="text-[8px] font-bold text-neutral-400">Add recurring event to Google Calendar</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isPremium) {
                                          setIsSyncedToCalendar(!isSyncedToCalendar);
                                        } else {
                                          setIsPremiumUpgradeModalOpen(true);
                                        }
                                      }}
                                      className={`w-12 h-6 rounded-full p-1 transition-colors ${isSyncedToCalendar ? 'bg-[#4285F4]' : 'bg-neutral-805'} cursor-pointer`}
                                    >
                                      <motion.div 
                                        animate={{ x: isSyncedToCalendar ? 24 : 0 }}
                                        className="w-4 h-4 bg-white rounded-full shadow-lg"
                                      />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}

                            {/* Google Tasks Sync Option */}
                            {(type === 'income' || type === 'expense') && (
                              <div className="space-y-3 pt-4 border-t border-white/5 mx-auto w-full">
                                <div className="flex items-center justify-between bg-black/25 border border-white/5 rounded-2xl p-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSyncedToTasks ? 'bg-[#F4B400] text-black' : 'bg-neutral-900 text-neutral-605'}`}>
                                      <CheckSquare size={14} className={isSyncedToTasks ? 'animate-pulse text-black' : 'text-neutral-505'} />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-white flex items-center gap-2">
                                        Sync with Google Tasks
                                        {!isPremium && <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-black">Premium only</span>}
                                      </span>
                                      <span className="text-[8px] font-bold text-[#A0AEC0]">Add this entry to Google Tasks list</span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isPremium) {
                                        setIsSyncedToTasks(!isSyncedToTasks);
                                      } else {
                                        setIsPremiumUpgradeModalOpen(true);
                                      }
                                    }}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${isSyncedToTasks ? 'bg-[#F4B400]' : 'bg-neutral-805'} cursor-pointer`}
                                  >
                                    <motion.div 
                                      animate={{ x: isSyncedToTasks ? 24 : 0 }}
                                      className="w-4 h-4 bg-white rounded-full shadow-lg"
                                    />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                     </div>

                     {/* Buttons moved to sticky footer */}
                  </form>
                )}
             </div>

             {/* Sticky Footer */}
             {(step === 'form' || step === 'budget') && (
                <div className="p-3.5 sm:p-8 sm:pb-10 border-t border-white/5 bg-[#426A5A]/10 backdrop-blur-md flex gap-3 sm:gap-4">
                  <button 
                    type="button"
                    onClick={() => setStep('type')}
                    style={{ height: '44px' }}
                    className="flex-1 py-0 bg-[#426A5A]/20 border border-white/5 text-neutral-500 font-bold text-[10px] rounded-xl hover:text-white transition-all active:scale-95 flex items-center justify-center"
                  >
                    Back
                  </button>
                  <button 
                    form={step === 'budget' ? "budget-form" : "transaction-form"}
                    type="submit"
                    disabled={isLoading || (step === 'budget' && (budgetAccountIds.length === 0 || !budgetLimit || parseFloat(budgetLimit) <= 0)) || (step === 'form' && !isFormCurrencyValid)}
                    style={{ height: '44px' }}
                    className={`flex-[2] py-0 font-bold text-[10px] rounded-xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale disabled:scale-100 ${step === 'budget' ? 'bg-[#00FF88] text-white shadow-[#00FF88]/20 hover:opacity-90' : (type === 'expense' ? 'bg-[#F43F5E] text-white shadow-[#F43F5E]/20' : type === 'income' ? 'bg-[#20C997] text-white shadow-[#20C997]/20' : 'bg-[#00FF88] text-white shadow-[#00FF88]/20 hover:opacity-90')}`}
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check size={20} />
                        {step === 'budget' ? 'Initiate Budget' : 'Finalize Flow'}
                      </>
                    )}
                  </button>
                </div>
             )}
          </motion.div>
          )}
          </AnimatePresence>
        </div>
      )}
      <PremiumModal 
        isOpen={isPremiumUpgradeModalOpen} 
        onClose={() => setIsPremiumUpgradeModalOpen(false)} 
        uid={uid} 
        profile={{ uid, subscriptionTier: isPremium ? 'premium' : 'free', isPremium }} 
        onSuccess={() => {
          window.location.reload();
        }}
      />

      <MilestoneConfigModal
        isOpen={showSavingsModal}
        onClose={() => {
          setShowSavingsModal(false);
          onClose();
        }}
        profile={profile}
        editingMilestone={null}
        accounts={parentAccounts}
        allTransactions={parentTransactions}
        exchangeRates={exchangeRates}
      />

      <DebtMilestoneConfigModal
        isOpen={showDebtModal}
        onClose={() => {
          setShowDebtModal(false);
          onClose();
        }}
        profile={profile}
        editingMilestone={null}
        accounts={parentAccounts}
        exchangeRates={exchangeRates}
      />
    </AnimatePresence>
  );
};
