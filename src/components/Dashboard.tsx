import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  ArrowRight, 
  Scan, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  X, 
  Camera as CameraIcon, 
  Wallet as WalletIcon, 
  Crown, 
  Sparkles, 
  Plus, 
  Landmark, 
  Building2 as BankIcon, 
  Trash2, 
  GitBranch as DocumentsIcon,
  GitBranch,
  CreditCard,
  Home
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { collection, query, orderBy, limit, getDocs, onSnapshot, doc, deleteDoc, writeBatch, where, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { PremiumModal } from './PremiumModal';
import { generateAIContent } from '../lib/gemini';
import { CameraOff, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { AddAccountModal } from './AddAccountModal';
import { AccountDetailModal } from './AccountDetailModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { VantageAIModal } from './VantageAIModal';
import { PendingApprovals } from './PendingApprovals';
import { ConfirmationModal } from './ConfirmationModal';
import { BudgetCard } from './BudgetCard';
import { NetWorthBreakdownModal } from './NetWorthBreakdownModal';
import { CashBreakdownModal } from './CashBreakdownModal';
import { DebtBreakdownModal } from './DebtBreakdownModal';
import { QuickTransactionModal } from './DailyLog';
import { MASTER_CATEGORIES } from '../lib/constants';
import { calculateAccountTrend, calculateAccountBalances, calculateAggregateTrend } from '../lib/trendUtils';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';
import { AdContainer } from './AdContainer';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';

const data = [
  { name: 'Mon', value: 4000 },
  { name: 'Tue', value: 3000 },
  { name: 'Wed', value: 5000 },
  { name: 'Thu', value: 2780 },
  { name: 'Fri', value: 1890 },
  { name: 'Sat', value: 2390 },
  { name: 'Sun', value: 3490 },
];

interface DashboardProps {
  onNavigateToTransactions?: (accId?: string) => void;
  onAddTransaction?: () => void;
  onAddAccount?: () => void;
  profile: any;
  onUpdateProfile?: (profile: any) => void;
  accounts: any[];
  allTransactions: any[];
  accountBalances: Record<string, number>;
}

const CURRENCY_COLORS: Record<string, string> = {
  'AED': '#20C997', // Emerald
  'USD': '#D4AF37', // Gold
  'EUR': '#A855F7', // Purple
  'GBP': '#3B82F6', // Blue
  'JPY': '#EF4444', // Red
  'SAR': '#F97316', // Orange
  'QAR': '#0EA5E9', // Sky
};

const DEFAULT_CHART_COLORS = ['#20C997', '#D4AF37', '#A855F7', '#3B82F6', '#EF4444', '#F97316', '#0EA5E9'];

const isTxMatchingBudget = (tx: any, budget: any) => {
  if (!tx) return false;
  if (tx.type === 'transfer') return false;
  if (tx.budgetId === budget.id) return true;

  // Multi-select categories and subcategories support
  if (budget.mappedCategories && Array.isArray(budget.mappedCategories) && budget.mappedCategories.length > 0) {
    if (budget.mappedCategories.includes(tx.category)) {
      if (budget.mappedSubCategories && Array.isArray(budget.mappedSubCategories) && budget.mappedSubCategories.length > 0) {
        return budget.mappedSubCategories.includes(tx.subcategory);
      }
      return true;
    }
    return false;
  }

  // Legacy single select category / subcategory fallback
  if (tx.category === budget.category) {
    if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
      return true;
    }
    return tx.subcategory === budget.subcategory;
  }
  return false;
};

const calculateSpentForBudget = (budget: any, txs: any[]) => {
  const now = new Date();
  let start: Date;
  let end: Date;

  const period = budget.period || 'daily';

  if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = now;
  } else if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0,0,0,0);
    start = monday;
    end = now;
  } else {
    // Daily
    const todayStr = new Date().toLocaleDateString('en-CA');
    return txs
      .filter(tx => isTxMatchingBudget(tx, budget) && tx.date === todayStr)
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }

  const startStr = start.toLocaleDateString('en-CA');
  const endStr = end.toLocaleDateString('en-CA');

  return txs
    .filter(tx => isTxMatchingBudget(tx, budget) && tx.date >= startStr && tx.date <= endStr)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
};

export const Dashboard: React.FC<DashboardProps> = React.memo(({ 
  onNavigateToTransactions, 
  onAddTransaction,
  onAddAccount,
  profile, 
  onUpdateProfile,
  accounts,
  allTransactions,
  accountBalances
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);
  const [dynamicBaseSalary, setDynamicBaseSalary] = useState<number>(0);

  // Live Camera and Extraction states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedScanAccountId, setSelectedScanAccountId] = useState<string>('');
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const stopCamera = React.useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  React.useEffect(() => {
    let pStream: MediaStream | null = null;
    if (isScanning && !scanResult) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          pStream = stream;
          setCameraStream(stream);
          setCameraError(null);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          setCameraError("Camera permission denied, or camera unavailable. Please check browser permission settings or upload a receipt file using the option below.");
        });
    } else {
      stopCamera();
    }

    return () => {
      if (pStream) {
        pStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isScanning, scanResult]);

  React.useEffect(() => {
    if (accounts && accounts.length > 0 && !selectedScanAccountId) {
      setSelectedScanAccountId(accounts[0].id);
    }
  }, [accounts, selectedScanAccountId]);

  const handleCaptureAndAnalyze = async () => {
    if (!videoRef.current) return;
    setScanLoading(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64Data = dataUrl.split(',')[1];
        
        const prompt = "Extract the Store Name, Date (formatted as YYYY-MM-DD), and Total Amount from this receipt. Return ONLY a JSON object with keys: storeName, date, amount.";
        const text = await generateAIContent(prompt, { data: base64Data, mimeType: 'image/jpeg' });
        const cleanJson = text?.replace(/```json|```/g, "").trim();
        if (cleanJson) {
          const parsed = JSON.parse(cleanJson);
          setScanResult(parsed);
          stopCamera();
        }
      }
    } catch (err: any) {
      console.error("Capture scan error:", err);
      alert("Vision analysis error: " + (err.message || err));
    } finally {
      setScanLoading(false);
    }
  };

  const handleDashboardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      setScanLoading(true);
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const prompt = "Extract the Store Name, Date (formatted as YYYY-MM-DD), and Total Amount from this receipt. Return ONLY a JSON object with keys: storeName, date, amount.";
        
        const text = await generateAIContent(prompt, { data: base64Data, mimeType: file.type });
        const cleanJson = text?.replace(/```json|```/g, "").trim();
        if (cleanJson) {
          const parsed = JSON.parse(cleanJson);
          setScanResult(parsed);
          stopCamera();
        }
      } catch (err: any) {
        console.error('Scan Error:', err);
        alert("Vision analysis error: " + (err.message || err));
      } finally {
        setScanLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCommitScanResult = async () => {
    if (!profile?.uid) return;
    setScanLoading(true);
    try {
      const txAmount = parseFloat(scanResult.amount) || 0;
      const targetAccId = selectedScanAccountId || (accounts.length > 0 ? accounts[0].id : '');
      if (!targetAccId) {
        alert("Please select or configure an account first.");
        return;
      }

      const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
      const payload = {
        id: txRef.id,
        userId: profile.uid,
        amount: txAmount,
        type: 'expense',
        category: 'Food & Dining', 
        emoji: '🧾',
        notes: `Vision Scan: ${scanResult.storeName || 'Merchant'}`,
        accountId: targetAccId,
        date: scanResult.date || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };

      await setDoc(txRef, payload);
      
      // Cleanup
      setScanResult(null);
      setIsScanning(false);
      if (onAddTransaction) onAddTransaction();
    } catch (err: any) {
      console.error("Failed to commit vision scan transaction", err);
      alert("Failed to commit transaction: " + err.message);
    } finally {
      setScanLoading(false);
    }
  };

  React.useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Warning logged in VantageDataErrorBoundary
      }
    };
    loadRates();
  }, []);
  const [selectedAccIds, setSelectedAccIds] = useState<Set<string>>(new Set());
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [pulsingGroupId, setPulsingGroupId] = useState<string | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);

  const triggerSplitPulse = (groupId: string | undefined | null) => {
    if (!groupId) return;
    setPulsingGroupId(groupId);
    setTimeout(() => setPulsingGroupId(null), 2000);
  };
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountToManage, setAccountToManage] = useState<any | null>(null);
  const [modalShowInsights, setModalShowInsights] = useState(false);
  const [isNetWorthBreakdownOpen, setIsNetWorthBreakdownOpen] = useState(false);
  const [isCashBreakdownOpen, setIsCashBreakdownOpen] = useState(false);
  const [isDebtBreakdownOpen, setIsDebtBreakdownOpen] = useState(false);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [activeBudgetForTx, setActiveBudgetForTx] = useState<any | null>(null);
  const [userCategories, setUserCategories] = useState<any[]>([]);

  React.useEffect(() => {
    if (!profile?.uid) return;

    const categoriesRef = collection(db, `users/${profile.uid}/categories`);
    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setUserCategories(list);
    });

    const recurringRef = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsub = onSnapshot(recurringRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
         list.push({ id: doc.id, ...doc.data() });
      });
      setRecurring(list);
    });

    const budgetsRef = collection(db, `users/${profile.uid}/miniBudgets`);
    const unsubBudgets = onSnapshot(budgetsRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setMiniBudgets(list);
    });

    const txColRef = collection(db, `users/${profile.uid}/transactions`);
    const q = query(
      txColRef,
      where("category", "==", "Income"),
      where("isRecurring", "==", true)
    );
    const unsubTx = onSnapshot(q, (snapshot) => {
      let wageSum = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const subCat = data.subCategory || data.subcategory || "";
        if (subCat.toLowerCase() === "wage") {
          wageSum += Number(data.amount) || 0;
        }
      });
      setDynamicBaseSalary(wageSum);
    }, (err) => {
      console.warn("Error listening to dynamic wage transactions in Dashboard:", err);
    });

    return () => {
      unsubCategories();
      unsub();
      unsubBudgets();
      unsubTx();
    };
  }, [profile?.uid]);

  const commitmentData = React.useMemo(() => {
    const activeRecs = recurring.filter(r => r.isActive);
    let monthlyExpense = 0;
    let recurrentIncome = 0;
    let hasSalaryTemplate = false;

    activeRecs.forEach(r => {
      let monthlyAmount = Number(r.amount) || 0;
      const interval = Number(r.interval) || 1;
      const freq = (r.recurrency || r.frequency || '').toLowerCase();

      if (freq === 'daily') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 30;
      } else if (freq === 'weekly') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 4.33;
      } else if (freq === 'monthly') {
        monthlyAmount = monthlyAmount / (interval || 1);
      } else if (freq === 'yearly') {
        monthlyAmount = monthlyAmount / ((interval || 1) * 12);
      }

      const isIncome = r.type === 'income' || r.transactionType === 'income';
      if (isIncome) {
        recurrentIncome += monthlyAmount;
        const title = (r.title || r.notes || '').toLowerCase();
        const cat = (r.category || '').toLowerCase();
        const subcat = (r.subcategory || r.subCategory || '').toLowerCase();
        if (
          title.includes('salary') || 
          title.includes('wage') || 
          title.includes('payroll') ||
          cat.includes('salary') || 
          cat.includes('wage') || 
          subcat.includes('wage')
        ) {
          hasSalaryTemplate = true;
        }
      } else {
        monthlyExpense += monthlyAmount;
      }
    });

    const monthlyIncome = hasSalaryTemplate ? recurrentIncome : (recurrentIncome + dynamicBaseSalary);
    const ratio = monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0;
    
    return {
      monthlyIncome,
      monthlyExpense,
      ratio,
      status: ratio < 30 ? 'Elite' : ratio < 50 ? 'Stable' : 'Critical'
    };
  }, [recurring, dynamicBaseSalary]);

  const isPremium = profile?.subscriptionTier === 'premium';
  
  // Initialize selection with all non-archived accounts on first load
  React.useEffect(() => {
    if (accounts.length > 0 && selectedAccIds.size === 0) {
      setSelectedAccIds(new Set(accounts.filter(a => !a.isArchived).map(a => a.id)));
    }
  }, [accounts]);

  // Derived Balances & Selection Logic
  const { totalBalance, portfolioTrend, chartData, activeCurrencies, netWorth, totalDebt, totalCashOnHand, primaryCurrency } = React.useMemo(() => {
    const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
    
    // Helper to get exchange rate to AED
    const getRateToAED = (curr: string) => {
      const c = curr || 'AED';
      if (c === 'AED') return 1;
      return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
    };

    const baseRateToAED = getRateToAED(primaryCurrency);

    // Total balance respects the user's current account selection
    const total = accounts
      .filter(acc => !acc.isArchived && selectedAccIds.has(acc.id) && (acc.currency || 'AED') === primaryCurrency)
      .reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);

    // Calculate Net Worth: Sum(Asset Balances) - Sum(Liability Balances)
    const allNonArchived = accounts.filter(acc => !acc.isArchived);
    const liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'];
    const assetAccounts = allNonArchived.filter(acc => !liabilityTypes.includes(acc.type) || acc.loanDirection === 'lent');
    const liabilityAccounts = allNonArchived.filter(acc => liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent');

    const assetsSum = assetAccounts.reduce((sum, acc) => {
       const bal = accountBalances[acc.id] || 0;
       const rate = getRateToAED(acc.currency);
       return sum + (bal * rate);
    }, 0);

    const liabilitiesSum = liabilityAccounts.reduce((sum, acc) => {
       const bal = accountBalances[acc.id] || 0;
       const rate = getRateToAED(acc.currency);
       return sum + (Math.abs(bal) * rate);
    }, 0);

    const calculatedNetWorth = (assetsSum - liabilitiesSum) / baseRateToAED;
      
    // Calculate Total Debt
    const calculatedTotalDebt = liabilityAccounts.reduce((sum, acc) => {
       const bal = accountBalances[acc.id] || 0;
       const rate = getRateToAED(acc.currency);
       const convertedBal = bal * rate;
       return sum + (convertedBal < 0 ? Math.abs(convertedBal) : 0);
    }, 0) / baseRateToAED;

    // Calculate Total Cash on Hand
    const cashOnHandAccounts = allNonArchived.filter(acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash');
    const calculatedCashOnHand = cashOnHandAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    // Calculate Portfolio Trend
    const trend = calculateAggregateTrend(selectedAccIds, accounts.filter(a => !a.isArchived), allTransactions);

    // Identify active currencies in selection for Network summary
    const selectedAccounts = accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id));
    const currencies = Array.from(new Set(selectedAccounts.map(acc => acc.currency || 'AED')));

    // Calculate Chart Data (Last 7 Days)
    const dailyBalances = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      d.setHours(23, 59, 59, 999);
      
      const balancesByCurr: Record<string, number> = {};
      
      currencies.forEach(curr => {
        const currBal = selectedAccounts
          .filter(acc => (acc.currency || 'AED') === curr)
          .reduce((sum, acc) => {
            const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type);
            let initialBal = acc.startingBalance || 0;
            if (isLiability && initialBal > 0) {
              initialBal = -initialBal;
            }
            const pastAndPresentTxs = allTransactions.filter(tx => 
              tx.status !== 'draft' &&
              (tx as any).interval === undefined &&
              (tx.accountId === acc.id || tx.toAccountId === acc.id) && 
              new Date(tx.date) <= d
            );
            
            const sumAtDate = pastAndPresentTxs.reduce((tSum, tx) => {
              const amount = tx.amount;
              
              if (tx.type === 'transfer') {
                const isReceiver = String(tx.toAccountId) === acc.id;
                const isSender = String(tx.accountId) === acc.id;
                
                if (isReceiver) {
                   return tSum + amount;
                }
                if (isSender) {
                   return tSum - amount;
                }
              } else if (tx.type === 'income') {
                if (tx.accountId === acc.id) {
                   return tSum + amount;
                }
              } else if (tx.type === 'expense') {
                if (tx.accountId === acc.id) {
                   return tSum - amount;
                }
              }
              return tSum;
            }, 0);
            
            let total = initialBal + sumAtDate;
            
            // Add Unrealized Gains (if this is the current date or we approximate)
            if (acc.type === 'investment' && i === 0) {
              const subAssets = acc.subAssets || [];
              const totalValue = subAssets.reduce((sSum: number, sa: any) => sSum + (Number(sa.currentValue) || 0), 0);
              const totalPrincipal = subAssets.reduce((sSum: number, sa: any) => sSum + (Number(sa.principalInvested) || 0), 0);
              total += (totalValue - totalPrincipal);
            }
            
            return sum + total;
          }, 0);
        
        balancesByCurr[curr] = currBal;
      });
        
      dailyBalances.push({
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        ...balancesByCurr
      });
    }
      
    return { 
      totalBalance: total, 
      portfolioTrend: trend,
      chartData: dailyBalances,
      activeCurrencies: currencies,
      netWorth: calculatedNetWorth,
      totalDebt: calculatedTotalDebt,
      totalCashOnHand: calculatedCashOnHand,
      primaryCurrency
    };
  }, [accounts, allTransactions, selectedAccIds, accountBalances, exchangeRates]);

  const filteredRecentTransactions = React.useMemo(() => {
    if (selectedAccIds.size === 0) return [];
    
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // If all are selected, just show the recent ones from all
    if (selectedAccIds.size === accounts.length && accounts.length > 0) {
      return allTransactions
        .filter(tx => tx.status !== 'draft' && (tx as any).interval === undefined && new Date(tx.date) <= todayEnd)
        .slice(0, 5);
    }

    return allTransactions
      .filter(tx => tx.status !== 'draft' && (tx as any).interval === undefined && new Date(tx.date) <= todayEnd)
      .filter(tx => selectedAccIds.has(tx.accountId) || (tx.toAccountId && selectedAccIds.has(tx.toAccountId)))
      .slice(0, 5);
  }, [allTransactions, selectedAccIds, accounts]);

  const handleAccountClick = (id: string) => {
    if (isMultiSelect) {
      setSelectedAccIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      // Single select: if already selected alone, reset to ALL. Otherwise select THIS one.
      setSelectedAccIds(prev => {
        if (prev.size === 1 && prev.has(id)) {
          return new Set(accounts.map(a => a.id));
        }
        return new Set([id]);
      });
    }
  };

  const handleLongPress = (id: string) => {
    setIsMultiSelect(true);
    setSelectedAccIds(new Set([id]));
  };

  const selectAll = () => {
    setIsMultiSelect(false);
    setSelectedAccIds(new Set(accounts.map(a => a.id)));
  };

  const startLongPress = (id: string) => {
    const timer = setTimeout(() => handleLongPress(id), 600);
    setLongPressTimer(timer);
  };

  const endLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank':
      case 'Bank': return BankIcon;
      case 'cash':
      case 'Cash': return WalletIcon;
      case 'investment': return TrendingUp;
      case 'credit':
      case 'Credit Card': return CreditCard;
      case 'loan':
      case 'Personal Loan': return DocumentsIcon;
      case 'mortgage':
      case 'Mortgage': return Home;
      default: return Landmark;
    }
  };

  const isLiability = (type: string) => {
    return ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(type);
  };

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete || !profile?.uid) return;
    setIsDeleting(true);
    try {
      // 1. Gather all relationship group tokens for cascading deletion
      const tokens = new Set<string>();
      tokens.add(txToDelete.id);
      if (txToDelete.parentTransferId) tokens.add(txToDelete.parentTransferId);
      if (txToDelete.correlationGroupId) tokens.add(txToDelete.correlationGroupId);
      if (txToDelete.transferId) tokens.add(txToDelete.transferId);

      // 2. Query and retrieve all matching docs sharing the tokens
      const txsColRef = collection(db, `users/${profile.uid}/transactions`);
      const docsToDelete = new Set<string>();
      docsToDelete.add(txToDelete.id);

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

      // 3. Delete everything in a single write batch pipeline payload to prevent data asymmetry
      const batch = writeBatch(db);
      docsToDelete.forEach(docId => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, docId));
      });
      await batch.commit();

      setTxToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/transactions/${txToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pb-10 flex flex-col gap-6 md:gap-8 min-w-0 p-[5px]">
      <style>{`
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) {
          height: 130px !important;
          width: 330px !important;
          margin-left: -10px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) {
          background-color: #ffffff !important;
        }
      `}</style>
      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        uid={profile.uid}
        profile={profile}
        onSuccess={onUpdateProfile || (() => {})}
      />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start w-full">
        {/* Left Pane (spans 6 of 10 columns on desktop) */}
        <div className="col-span-1 lg:col-span-6 flex flex-col gap-6 md:gap-8 w-full">
          {/* Premium Reconstructed Floating Net Worth Bento Capsule */}
      <motion.div 
        id="tour-net-worth-card"
        onClick={() => setIsNetWorthBreakdownOpen(true)}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(30, 34, 41, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 12px 40px rgba(30,34,41,0.03), 0 0 32px rgba(166,221,177,0.35)',
          padding: 'clamp(1rem, 2vw, 1.5rem)',
          transition: 'all 0.3s ease-in-out',
        }}
        className="col-span-1 md:col-span-2 xl:col-span-3 w-full mx-auto flex flex-col justify-between min-w-0 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-300 ease-in-out animate-fade-in"
      >
        <div className="flex flex-col gap-1.5 w-full min-w-0">
          <span 
            className="truncate whitespace-nowrap leading-none mb-1.5 block"
            style={{ 
              fontSize: "clamp(0.9rem, 2vw, 1.1rem)", 
              fontWeight: 400, 
              fontFamily: "'Google Sans', sans-serif", 
              color: '#1E2229',
              whiteSpace: 'nowrap'
            }}
          >
            Net Worth
          </span>
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              flexWrap: 'nowrap',
              width: '100%',
              minWidth: 0
            }}
            className="flex flex-row items-center justify-between flex-nowrap w-full min-w-0"
          >
            <div className="flex flex-row items-baseline gap-1.5 min-w-0 flex-nowrap whitespace-nowrap">
              <span 
                className="font-normal"
                style={{ 
                  fontSize: "clamp(0.9rem, 2vw, 1.1rem)", 
                  fontFamily: "'Google Sans', sans-serif", 
                  color: netWorth < 0 ? '#ff3f34' : '#A6DDB1',
                  whiteSpace: 'nowrap'
                }}
              >
                {primaryCurrency}
              </span>
              <span 
                className="tabular-nums font-semibold tracking-tighter leading-none truncate text-[#1E2229]"
                style={{ 
                  fontSize: "clamp(1.6rem, 4.5vw, 2.4rem)", 
                  fontWeight: 600, 
                  fontFamily: "'Google Sans', sans-serif",
                  whiteSpace: 'nowrap'
                }}
              >
                {netWorth < 0 ? '-' : ''}{Math.abs(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            
            {/* Trend Arrow section */}
            <div className="flex items-center gap-1.5 shrink-0 ml-2 flex-nowrap">
              {portfolioTrend && portfolioTrend.direction !== 'neutral' && !isNaN(portfolioTrend.percentage) && (
                <div 
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-mono font-bold ${
                    portfolioTrend.direction === 'up' ? 'bg-[#A6DDB1]/15 text-[#10B981]' : 'bg-red-500/10 text-red-500'
                  }`}
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  {portfolioTrend.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{portfolioTrend.direction === 'up' ? '+' : '-'}{Math.abs(portfolioTrend.percentage).toFixed(1)}%</span>
                </div>
              )}
              {/* Fallback/Main Trend Icon in container */}
              <div 
                style={{ backgroundColor: portfolioTrend?.direction === 'down' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(166, 221, 177, 0.15)' }}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                  portfolioTrend?.direction === 'down' ? 'text-red-500' : 'text-[#A6DDB1]'
                }`}
              >
                {portfolioTrend?.direction === 'down' ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full animate-fade-in">
        {/* Total Debt Card */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.02 }}
          onClick={() => setIsDebtBreakdownOpen(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(30, 34, 41, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 12px 40px rgba(30,34,41,0.08)',
            padding: 'clamp(1rem, 2vw, 1.25rem)',
          }}
          className="w-full flex items-center justify-between min-w-0 cursor-pointer hover:shadow-lg transition-all"
        >
          <div className="flex flex-col gap-1.5 min-w-0">
            <span 
              className="truncate whitespace-nowrap leading-none"
              style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
            >
              Total Debts
            </span>
            <div 
              className="flex flex-row items-baseline gap-1 min-w-0 flex-nowrap whitespace-nowrap"
              style={{ color: totalDebt > 0 ? '#ff3f34' : '#1E2229' }}
            >
              <span 
                className="font-normal"
                style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontFamily: "'Google Sans', sans-serif", color: totalDebt > 0 ? '#ff3f34' : '#A6DDB1' }}
              >
                {primaryCurrency}
              </span>
              <span 
                className="tabular-nums font-semibold tracking-tighter leading-none truncate"
                style={{ fontSize: "clamp(1.4rem, 4vw, 2.1rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif" }}
              >
                -{(totalDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0 ml-2">
            <TrendingDown size={20} className="md:w-6 md:h-6" />
          </div>
        </motion.div>
        
        {/* Total Cash on Hand Card */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.035 }}
          onClick={() => setIsCashBreakdownOpen(true)}
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(30, 34, 41, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 12px 40px rgba(30,34,41,0.08)',
            padding: 'clamp(1rem, 2vw, 1.25rem)',
          }}
          className="w-full flex items-center justify-between min-w-0 cursor-pointer hover:shadow-lg transition-all"
        >
          <div className="flex flex-col gap-1.5 min-w-0">
            <span 
              className="truncate whitespace-nowrap leading-none"
              style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
            >
              Cash Available
            </span>
            <div 
              className="flex flex-row items-baseline gap-1 min-w-0 flex-nowrap whitespace-nowrap"
              style={{ color: totalCashOnHand < 0 ? '#ff3f34' : '#1E2229' }}
            >
              <span 
                className="font-normal"
                style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontFamily: "'Google Sans', sans-serif", color: totalCashOnHand < 0 ? '#ff3f34' : '#A6DDB1' }}
              >
                {primaryCurrency}
              </span>
              <span 
                className="tabular-nums font-semibold tracking-tighter leading-none truncate"
                style={{ fontSize: "clamp(1.4rem, 4vw, 2.1rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif" }}
              >
                {(totalCashOnHand || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div 
            style={{ backgroundColor: 'rgba(166, 221, 177, 0.15)' }}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-[#A6DDB1] shrink-0 ml-2"
          >
            <WalletIcon size={20} className="md:w-6 md:h-6" />
          </div>
        </motion.div>
      </div>

      {/* Twin Analytical Overview Columns Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 w-full gap-4 items-stretch mb-4 md:mb-8">
        {/* Financial Health Coefficient Card */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(30, 34, 41, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 12px 40px rgba(30,34,41,0.08)',
            padding: '1.25rem',
          }}
          className="w-full flex flex-col justify-between min-w-0"
        >
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-2 md:gap-4 w-full text-center sm:text-left">
            <div className="flex flex-col gap-1 items-center sm:items-start min-w-0">
              <span 
                style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                className="truncate whitespace-nowrap leading-none block w-full"
              >
                Health Index
              </span>
              <div className="flex items-center gap-1.5 justify-center sm:justify-start mt-1">
                <span 
                  style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }}
                  className={`font-semibold px-2 py-0.5 rounded-full text-[9px] font-mono ${
                    commitmentData.status === 'Elite' ? 'bg-emerald-100 text-emerald-700' :
                    commitmentData.status === 'Stable' ? 'bg-amber-100 text-amber-700' :
                    'bg-rose-100 text-[#ff3f34]'
                  }`}
                >
                  {commitmentData.status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 md:gap-3 shrink-0 justify-center sm:justify-end mt-1 sm:mt-0">
              <span 
                className="text-black tracking-tighter leading-none"
                style={{ fontSize: "clamp(1.4rem, 4vw, 2.1rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif" }}
              >
                {commitmentData.ratio.toFixed(1)}%
              </span>
              <div className="w-8 h-8 md:w-11 md:h-11 rounded-full border border-vantage-text/5 flex items-center justify-center relative shrink-0">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                  <circle 
                    cx="24" cy="24" r="20" 
                    fill="transparent" 
                    stroke="rgba(0,0,0,0.02)" 
                    strokeWidth="3.5" 
                  />
                  <circle 
                    cx="24" cy="24" r="20" 
                    fill="transparent" 
                    stroke={commitmentData.ratio > 50 ? '#ff3f34' : '#0e9f6e'} 
                    strokeWidth="3.5" 
                    strokeDasharray={`${(Math.min(commitmentData.ratio, 100) / 100) * 125.6} 125.6`}
                    strokeLinecap="round"
                  />
                </svg>
                <span 
                  style={{ fontSize: 'clamp(7px, 1.8vw, 10px)' }}
                  className="font-normal text-[#57606F] font-mono"
                >
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4 mt-3">
            <div 
              style={{ fontFamily: "'Google Sans', sans-serif", background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(30, 34, 41, 0.05)' }}
              className="p-3 md:p-4 rounded-xl flex flex-col items-center sm:items-start gap-1 shadow-sm min-w-0"
            >
              <span 
                style={{ fontSize: "clamp(0.85rem, 1.8vw, 1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                className="leading-none mb-1 text-center sm:text-left w-full truncate whitespace-nowrap"
              >
                Recurring In
              </span>
              <div className="flex flex-row items-baseline gap-1 min-w-0 flex-nowrap whitespace-nowrap justify-center sm:justify-start">
                <span 
                  className="font-normal"
                  style={{ fontSize: "clamp(0.85rem, 1.8vw, 1rem)", fontFamily: "'Google Sans', sans-serif", color: '#A6DDB1' }}
                >
                  {primaryCurrency}
                </span>
                <span 
                  className="tabular-nums font-semibold tracking-tighter leading-none truncate"
                  style={{ fontSize: "clamp(1.2rem, 3.2vw, 1.7rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                >
                  {commitmentData.monthlyIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div 
              style={{ fontFamily: "'Google Sans', sans-serif", background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(30, 34, 41, 0.05)' }}
              className="p-3 md:p-4 rounded-xl flex flex-col items-center sm:items-start gap-1 shadow-sm min-w-0"
            >
              <span 
                style={{ fontSize: "clamp(0.85rem, 1.8vw, 1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                className="leading-none mb-1 text-center sm:text-left w-full truncate whitespace-nowrap"
              >
                Recurring Out
              </span>
              <div className="flex flex-row items-baseline gap-1 min-w-0 flex-nowrap whitespace-nowrap justify-center sm:justify-start">
                <span 
                  className="font-normal"
                  style={{ fontSize: "clamp(0.85rem, 1.8vw, 1rem)", fontFamily: "'Google Sans', sans-serif", color: '#ff3f34' }}
                >
                  {primaryCurrency}
                </span>
                <span 
                  className="tabular-nums font-semibold tracking-tighter leading-none truncate"
                  style={{ fontSize: "clamp(1.2rem, 3.2vw, 1.7rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                >
                  {commitmentData.monthlyExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Balance Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(30, 34, 41, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 12px 40px rgba(30,34,41,0.08)',
            padding: '1.25rem',
          }}
          className="w-full relative overflow-hidden group flex flex-col justify-between min-w-0"
        >
          <div className="flex flex-col gap-1.5 relative z-10 w-full text-center sm:text-left">
            <span 
              style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
              className="text-center w-full truncate whitespace-nowrap leading-none mb-2 md:mb-4 block"
            >
              Total Assets
            </span>
            
            <div className="flex flex-col gap-1.5 w-full">
              {activeCurrencies.map(curr => {
                const currBal = accounts
                  .filter(acc => !acc.isArchived && (acc.currency || 'AED') === curr)
                  .reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);
                
                return (
                  <div key={`curr-info-${curr}`} className="flex flex-col sm:flex-row items-center sm:justify-between gap-1 w-full min-w-0">
                    <div className="flex items-center gap-1.5 justify-center sm:justify-start min-w-0">
                       <div className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: CURRENCY_COLORS[curr] || '#00FF88' }} />
                       <span 
                         style={{ fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                         className="font-normal leading-none truncate text-[clamp(10px,2.8vw,12px)] md:text-[clamp(12px,1.2vw,16px)]"
                       >
                         {curr} Network
                       </span>
                    </div>
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }}
                      className="font-mono font-normal leading-none whitespace-nowrap text-[clamp(14px,4.2vw,18px)] md:text-[clamp(18px,1.8vw,24px)]"
                    >
                      {currBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
 
            <div className="flex items-center justify-center sm:justify-start gap-1 py-1.5 mt-2 border-t border-black/5 min-w-0 w-full">
              <div 
                className="flex flex-row items-baseline gap-1 md:gap-1.5 min-w-0 flex-nowrap whitespace-nowrap justify-center sm:justify-start w-full"
                style={{ color: '#1E2229' }}
              >
                <span 
                  className="font-normal"
                  style={{ fontSize: "clamp(0.9rem, 2vw, 1.1rem)", fontFamily: "'Google Sans', sans-serif", color: '#A6DDB1' }}
                >
                  {primaryCurrency}
                </span>
                <span 
                  className="tabular-nums font-semibold tracking-tighter leading-none truncate"
                  style={{ fontSize: "clamp(1.4rem, 4vw, 2.1rem)", fontWeight: 600, fontFamily: "'Google Sans', sans-serif" }}
                >
                  {totalBalance < 0 ? '-' : ''}{Math.abs(totalBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-center sm:justify-start gap-1 text-[#A6DDB1] mt-0.5 w-full">
               {portfolioTrend && portfolioTrend.direction !== 'neutral' && !isNaN(portfolioTrend.percentage) && (
                  <>
                    {portfolioTrend.direction === 'up' ? <TrendingUp size={11} strokeWidth={3} /> : <TrendingDown size={11} strokeWidth={3} className="text-[#ff3f34]" />}
                    <span 
                      style={{ fontSize: 'clamp(9px, 2.5vw, 11px)', fontFamily: "'Google Sans', sans-serif" }}
                      className={`font-normal whitespace-nowrap shrink-0 ${portfolioTrend.direction === 'down' ? 'text-[#ff3f34]' : 'text-[#A6DDB1]'}`}
                    >
                      {portfolioTrend.direction === 'up' ? 'Growth' : 'Velocity'} {Math.abs(portfolioTrend.percentage || 0)}%
                    </span>
                  </>
               )}
            </div>
          </div>

          <div className="w-full mt-4 -mx-1 overflow-hidden aspect-[16/7] min-h-[70px] max-h-[140px]">
            <VantageDataErrorBoundary>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis 
                     dataKey="name" 
                     axisLine={false} 
                     tickLine={false} 
                     tick={{ fontSize: 7, fill: '#999', fontWeight: 'bold' }} 
                     dy={10}
                  />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #eee',
                      borderRadius: '12px',
                      fontSize: '9px',
                      fontWeight: 900
                    }}
                    itemStyle={{ padding: '0' }}
                    labelStyle={{ color: '#00FF88', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}
                  />
                  {activeCurrencies.map((curr, index) => (
                    <Line
                      key={`line-${curr}`}
                      type="monotone"
                      dataKey={curr}
                      stroke={CURRENCY_COLORS[curr] || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={1500}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </VantageDataErrorBoundary>
          </div>
        </motion.div>
      </div>

      {/* Manage Individual Account Modal */}
      <AccountDetailModal 
        isOpen={accountToManage !== null}
        onClose={() => setAccountToManage(null)}
        onAddTransaction={onAddTransaction}
        onNavigateToTransactions={onNavigateToTransactions}
        account={accountToManage}
        accounts={accounts}
        accountBalances={accountBalances}
        profile={profile}
        transactions={allTransactions}
        initialShowInsights={modalShowInsights}
      />

      {/* Accounts Management */}
      <div className="w-full flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <span 
              style={{ fontSize: 'clamp(14px, 4.5vw, 18px)' }}
              className="font-bold text-[#57606F] leading-none block"
            >
              Accounts Matrix
            </span>
            <button 
              onClick={selectAll}
              className="text-xs font-normal text-emerald-700 mt-1.5 text-left hover:text-black transition-colors block"
            >
              Synchronize Selection
            </button>
          </div>
          <button 
            onClick={() => onAddAccount?.()}
            className="text-xs font-normal text-[#57606F] flex items-center gap-1 hover:text-emerald-700 transition-colors"
          >
            <Plus size={12} /> New Account
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:flex-wrap md:justify-between gap-2.5 md:gap-y-4 w-full">
           {accounts.filter(a => !a.isArchived).map((acc, idx) => {
              const currentBalance = accountBalances[acc.id] || 0;
              const isSelected = selectedAccIds.has(acc.id);
              const trend = calculateAccountTrend(acc.id, currentBalance, allTransactions, acc.type, acc.loanDirection);
              const rate = (exchangeRates && exchangeRates[acc.currency]) || DEFAULT_RATES[acc.currency as keyof typeof DEFAULT_RATES] || 1;
              const translatedBalance = currentBalance * rate;

              return (
                <motion.div 
                  key={`dashboard-acc-${acc.id || 'id-missing'}-${idx}`}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                  onMouseDown={() => startLongPress(acc.id)}
                  onMouseUp={endLongPress}
                  onMouseLeave={endLongPress}
                  onTouchStart={() => startLongPress(acc.id)}
                  onTouchEnd={endLongPress}
                  onClick={() => handleAccountClick(acc.id)}
                  className={`w-full md:w-[48%] flex items-center p-2.5 md:p-4 rounded-xl md:rounded-[1.5rem] transition-all duration-300 cursor-pointer group border-[1.5px] shadow-sm min-w-0 ${
                    isSelected 
                      ? 'bg-white border-vantage-green' 
                      : 'bg-white border-[#E1E8ED] opacity-60 hover:opacity-100 hover:border-vantage-text/20'
                  }`}
                >
                   {/* Information - 70% width */}
                   <div className="flex-[0.7] flex items-center gap-2 md:gap-4 min-w-0 pr-2 md:pr-4">
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-vantage-green/10 text-vantage-green' : 'bg-vantage-text/5 text-[#57606F]'}`}>
                         {React.createElement(getAccountIcon(acc.type), { size: 14, strokeWidth: isSelected ? 3 : 2 })}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-[clamp(11px,3.2vw,13px)] md:text-[clamp(13px,1.2vw,16px)] font-normal truncate leading-tight ${isSelected ? 'text-black' : 'text-[#2F3542]'}`}>
                          {acc.name}
                        </span>
                        <span className="text-[clamp(9px,2.5vw,11px)] md:text-[clamp(11px,1vw,13px)] font-normal mt-0.5 text-[#57606F] truncate">
                          {acc.type} protocol
                        </span>
                      </div>
                   </div>

                   {/* Interaction/Balance - 30% width */}
                   <div className="flex-[0.3] flex flex-col items-end border-l border-vantage-text/10 pl-2 md:pl-4 shrink-0 min-w-0">
                      <div className="flex flex-col items-end gap-0.5 w-full">
                         <div className="flex items-center gap-1 md:gap-1.5 justify-end w-full min-w-0">
                            <span className="text-[clamp(8px,2.2vw,10px)] md:text-[clamp(10px,0.8vw,12px)] text-vantage-muted/60 font-normal shrink-0">AED</span>
                            <span className={`text-[clamp(12px,3.5vw,14px)] md:text-[clamp(14px,1.4vw,18px)] font-mono font-normal tracking-tight truncate ${
                              isSelected 
                                ? 'text-emerald-700' 
                                : translatedBalance < 0
                                ? 'text-[#ff3f34]' 
                                : 'text-black'
                            }`}>
                              {translatedBalance < 0 ? '-' : ''}{Math.abs(translatedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                         </div>
                         {acc.currency !== 'AED' && (
                            <span className="text-[clamp(8px,2.2vw,10px)] md:text-[clamp(10px,0.8vw,12px)] text-[#57606F] font-normal leading-none opacity-80 mt-0.5 whitespace-nowrap truncate w-full text-right">
                              {acc.currency} {Math.abs(currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                         )}
                      </div>
                      <span className="text-[clamp(8px,2.5vw,10px)] md:text-[clamp(10px,0.8vw,11px)] font-normal leading-none mt-0.5 text-[#57606F] truncate w-full text-right">
                        {acc.currency !== 'AED' ? 'AED translated' : 'Balance'}
                      </span>
                   </div>
                </motion.div>
              );
           })}

            <button 
              onClick={() => onAddAccount?.()}
              className="w-full md:w-[48%] flex items-center justify-center gap-3 p-2.5 md:p-5 rounded-xl md:rounded-[1.5rem] border-[1.5px] border-dashed border-[#D1D8E0] text-[#57606F] hover:border-vantage-green/50 hover:text-emerald-700 hover:bg-vantage-green/5 transition-all group min-w-0"
            >
              <Plus size={14} className="group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-[clamp(11px,3.2vw,13px)] md:text-[clamp(13px,1.2vw,16px)] font-bold truncate">Initialize New Node</span>
            </button>
            
            <AnimatePresence>
              {selectedAccIds.size === 1 && (
                <motion.button 
                  key="manage-selected-account-btn"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => {
                    const accId = Array.from(selectedAccIds)[0];
                    const acc = accounts.find(a => a.id === accId);
                    if (acc) {
                      setModalShowInsights(false);
                      setAccountToManage(acc);
                    }
                  }}
                  className="w-full py-3 bg-gold/10 border border-gold/20 text-gold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-gold/20 transition-all mt-1"
                >
                  <Landmark size={12} /> Manage Selected Account
                </motion.button>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedAccIds.size === 1 && (
                <motion.button 
                  key="view-account-details-btn"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onClick={() => {
                    const accId = Array.from(selectedAccIds)[0];
                    const acc = accounts.find(a => a.id === accId);
                    if (acc) {
                      setModalShowInsights(true);
                      setAccountToManage(acc);
                    }
                  }}
                  className="w-full py-3 bg-[#426A5A]/20 border border-white/5 text-white text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-[#426A5A]/30 transition-all mt-1"
                >
                  <TrendingUp size={12} className="text-gold" /> View Account Details
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Right Pane (40%): Actions, Pending, Micro Spends, and Activity Records */}
      <div className="col-span-1 lg:col-span-4 flex flex-col gap-8 w-full">
          {/* Daily Logs (Spend Budgets list) */}
          <div className="w-full flex flex-col gap-4">
             <span 
               style={{ 
                 fontFamily: "'Google Sans', sans-serif",
                 fontWeight: 700,
                 fontSize: 'clamp(14px, 4.5vw, 18px)' 
               }}
               className="font-bold text-[#57606F] px-1 leading-none"
             >
               Daily Logs (Micro Spends)
             </span>

            {/* Expanded view for Tablet/Desktop */}
            <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4 w-full">
              {miniBudgets.length > 0 ? (
                miniBudgets.map((budget, bIdx) => {
                  const spent = calculateSpentForBudget(budget, allTransactions);
                  return (
                     <BudgetCard
                       key={`desktop-budget-${budget.id || bIdx}`}
                       budget={budget}
                       spent={spent}
                       compact={false}
                       onCardClick={() => setActiveBudgetForTx(budget)}
                       onPlusClick={() => setActiveBudgetForTx(budget)}
                     />
                  );
                })
              ) : (
                <div className="col-span-full w-full py-24 border-[1.5px] border-dashed border-[#E1E8ED] bg-white rounded-[1.5rem] flex flex-col items-center justify-center gap-4">
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="text-[clamp(11px,2.5vw,14px)] text-[#57606F] opacity-70"
                  >
                    No spend budgets initialized
                  </span>
                </div>
              )}
            </div>

            {/* Condensed view for Mobile */}
            <div className="flex md:hidden flex-col gap-3 w-full">
              {miniBudgets.length > 0 ? (
                miniBudgets.map((budget, bIdx) => {
                  const spent = calculateSpentForBudget(budget, allTransactions);
                  return (
                     <BudgetCard
                       key={`mobile-budget-${budget.id || bIdx}`}
                       budget={budget}
                       spent={spent}
                       compact={true}
                       onCardClick={() => setActiveBudgetForTx(budget)}
                       onPlusClick={() => setActiveBudgetForTx(budget)}
                     />
                  );
                })
              ) : (
                <div className="w-full py-16 border-[1.5px] border-dashed border-[#E1E8ED] bg-white rounded-[1.5rem] flex flex-col items-center justify-center gap-4">
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="text-[clamp(10px,2.5vw,12px)] text-[#57606F] opacity-70"
                  >
                    No spend budgets initialized
                  </span>
                </div>
              )}
            </div>
          </div>

      {/* Quick Actions */}
      <div className="w-[90%] mx-auto">
        <button 
          id="quick-scan-btn" 
          onClick={() => {
            if (isPremium) setIsScanning(true);
            else setIsPremiumModalOpen(true);
          }}
          className={`w-full flex items-center justify-center gap-3 p-5 rounded-[1.5rem] text-[3.5vw] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-sm ${isPremium ? 'bg-vantage-green text-white' : 'bg-white border-[1.5px] border-[#E1E8ED] text-[#57606F]'}`}
        >
          {isPremium ? <Scan size={18} strokeWidth={3} /> : <Crown size={18} className="text-vantage-green" />}
          <span>{isPremium ? 'Activate Vision Scan' : 'Unlock Vision Scan'}</span>
        </button>
      </div>

      {/* Admin/Premium Promo Banner for Free Users */}
      <AdContainer subscriptionTier={profile.subscriptionTier || 'free'} />

      {/* Pending Approvals Section */}
      <PendingApprovals 
        uid={profile.uid}
        accounts={accounts}
        onTransactionApproved={onAddTransaction} // Re-trigger data sync if needed
      />

      <AnimatePresence>
        {isScanning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
          >
            {/* Top Close Control */}
            <button 
              onClick={() => {
                stopCamera();
                setScanResult(null);
                setIsScanning(false);
              }}
              className="absolute top-6 right-6 p-3 bg-white/10 text-white hover:text-red-400 hover:bg-white/20 rounded-full transition-all active:scale-95 z-50 cursor-pointer"
            >
              <X size={24} />
            </button>

            <div className="w-full max-w-lg flex flex-col gap-6 py-8">
              {/* Header Info */}
              <div className="text-center space-y-2">
                <span className="text-[10px] uppercase tracking-[0.4em] font-black text-vantage-green">Quantum Vision Workspace</span>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Receipt Intelligent Scanner</h2>
                <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                  Translate physical documents into double-entry ledger transactions instantly.
                </p>
              </div>

              {scanResult ? (
                /* --- STEP 2: DISPLAY EXTRACTION RESULTS & COMMIT TO LEDGER --- */
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#111318] border border-white/10 rounded-[2.5rem] p-6 sm:p-8 flex flex-col gap-6 shadow-2xl"
                >
                  <div className="flex items-center gap-2 text-vantage-green mb-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-vantage-green animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em]">OCR Ledger Extraction Complete</span>
                  </div>

                  <div className="space-y-4">
                    {/* Store Name Input */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Store / Merchant</label>
                      <input 
                        type="text"
                        value={scanResult.storeName || ''}
                        onChange={(e) => setScanResult({ ...scanResult, storeName: e.target.value })}
                        className="w-full bg-neutral-900 border border-white/5 rounded-2xl p-4 text-xs font-bold text-white uppercase outline-none focus:border-vantage-green transition-colors"
                        placeholder="Enter merchant..."
                      />
                    </div>

                    {/* Amount Input */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Extracted Value</label>
                      <input 
                        type="number"
                        value={scanResult.amount || ''}
                        onChange={(e) => setScanResult({ ...scanResult, amount: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-neutral-900 border border-white/5 rounded-2xl p-4 text-xs font-black text-vantage-green outline-none focus:border-vantage-green transition-colors"
                        placeholder="Enter amount..."
                        step="any"
                      />
                    </div>

                    {/* Date Input */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Receipt Date</label>
                      <input 
                        type="date"
                        value={scanResult.date || ''}
                        onChange={(e) => setScanResult({ ...scanResult, date: e.target.value })}
                        className="w-full bg-neutral-900 border border-white/5 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:border-vantage-green transition-colors"
                      />
                    </div>

                    {/* Target Account Selector */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-1">Destination Debit Account</label>
                      <select
                        value={selectedScanAccountId}
                        onChange={(e) => setSelectedScanAccountId(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/5 rounded-2xl p-4 text-xs font-bold text-white outline-none focus:border-vantage-green transition-colors appearance-none cursor-pointer"
                      >
                        {accounts.map((acc: any, accIdx: number) => (
                          <option key={`scan-acc-${acc.id || 'scan'}-${accIdx}`} value={acc.id} className="bg-neutral-900">
                            {acc.name.toUpperCase()} (BAL: ${(accountBalances[acc.id] || 0).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-3 mt-4">
                    <button
                      onClick={handleCommitScanResult}
                      disabled={scanLoading}
                      className="w-full py-4.5 bg-vantage-green hover:bg-emerald-600 disabled:bg-neutral-800 text-white font-black uppercase tracking-[0.2em] rounded-2xl text-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-vantage-green/10"
                    >
                      {scanLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Writing Ledger...</span>
                        </>
                      ) : (
                        <span>Commit to Ledger</span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setScanResult(null);
                        setCameraError(null);
                      }}
                      className="w-full py-4 text-neutral-400 hover:text-white font-bold uppercase tracking-widest rounded-2xl text-[10px] transition-colors flex items-center justify-center cursor-pointer"
                    >
                      &larr; Discard and Take New Photo
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* --- STEP 1: LIVE VIEWFINDER / CAPTURE VIEW --- */
                <div className="flex flex-col gap-6">
                  {/* Viewfinder Target boundary */}
                  <div className="relative w-full aspect-square bg-[#0c0d11] border-2 border-white/10 rounded-[40px] flex flex-col items-center justify-center gap-4 overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-vantage-green rounded-tl-[32px] z-15"></div>
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-vantage-green rounded-tr-[32px] z-15"></div>
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-vantage-green rounded-bl-[32px] z-15"></div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-vantage-green rounded-br-[32px] z-15"></div>

                    {cameraError ? (
                      /* Fallback Display if permission denied */
                      <div className="p-8 text-center flex flex-col items-center gap-4 max-w-xs relative z-10">
                        <CameraOff size={40} className="text-neutral-500" />
                        <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider leading-relaxed">
                          {cameraError}
                        </p>
                      </div>
                    ) : (
                      /* Live Cam Viewfinder */
                      <>
                        <video 
                          ref={videoRef} 
                          autoPlay 
                          playsInline 
                          className="absolute inset-0 w-full h-full object-cover rounded-[38px]" 
                        />
                        
                        {/* Shutter overlay state */}
                        {scanLoading && (
                          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-4">
                            <Loader2 size={36} className="text-vantage-green animate-spin" />
                            <p className="text-[10px] text-vantage-green font-black uppercase tracking-[0.25em] animate-pulse">
                              TRANSCRIBING RECEIPT...
                            </p>
                          </div>
                        )}

                        <div className="absolute pointer-events-none inset-0 border-[3px] border-black/30 rounded-[38px]" />
                      </>
                    )}
                  </div>

                  {/* Shutter Button and manual selector fallback controls */}
                  <div className="flex flex-col gap-4 items-center">
                    {!cameraError && !scanLoading && (
                      <button
                        onClick={handleCaptureAndAnalyze}
                        disabled={scanLoading}
                        className="px-8 py-5 bg-vantage-green text-white font-black uppercase tracking-[0.25em] rounded-[20px] text-[11px] shadow-lg shadow-vantage-green/15 transition-all hover:scale-[1.03] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CameraIcon size={16} />
                        <span className="text-[14px]">Take Receipt Snapshot</span>
                      </button>
                    )}

                    {/* Graceful Drag-and-Drop or direct File Upload fallback panel */}
                    <div className="w-full text-center">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-[10px] font-black text-neutral-400 hover:text-white uppercase tracking-widest transition-colors py-3">
                        <Plus size={14} />
                        <span>Upload receipt from gallery</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleDashboardFileChange} 
                          className="hidden" 
                        />
                      </label>
                    </div>

                    <p className="text-neutral-500 font-mono text-[9px] uppercase tracking-widest text-center">
                      VANTAGE LABS VERIFIED INFRASTRUCTURE
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

       {/* Recent Transactions List */}
      <div className="w-[90%] mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <span 
            style={{ fontSize: 'clamp(14px, 4.5vw, 18px)' }}
            className="font-bold text-[#57606F] uppercase tracking-[0.25em] leading-none"
          >
            Activity Record
          </span>
          <button 
            id="view-all-transactions"
            onClick={() => onNavigateToTransactions?.(selectedAccIds.size === 1 ? Array.from(selectedAccIds)[0] : undefined)}
            className="text-xs font-normal text-emerald-700 uppercase tracking-[0.15em] flex items-center gap-1 hover:text-black transition-colors"
          >
            Full Ledger <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
              {filteredRecentTransactions.map((tx, i) => {
                const type = tx.type;
                const isOutflow = type === 'expense' || (type === 'transfer' && (tx.transferSide === 'sender' || !tx.transferSide));
                
                const fromAcc = accounts.find(a => a.id === tx.accountId)?.name || 'Unknown';
                const toAcc = tx.toAccountId ? (accounts.find(a => a.id === tx.toAccountId)?.name || 'Unknown') : null;
                const isPulsing = pulsingGroupId && tx.groupId === pulsingGroupId;
                
                return (
                  <motion.div 
                    key={tx.id} 
                    animate={{
                      scale: isPulsing ? [1, 1.02, 1] : 1,
                    }}
                    transition={{
                      scale: { repeat: isPulsing ? 2 : 0, duration: 0.5 }
                    }}
                    onClick={() => {
                      if (tx.groupId) triggerSplitPulse(tx.groupId);
                      setSelectedTx(tx);
                    }}
                    className="flex items-center p-3 sm:p-4 bg-white rounded-[1.5rem] border-[1.5px] border-[#E1E8ED] hover:border-vantage-green transition-all cursor-pointer active:scale-95 group shadow-sm"
                  >
                    {/* 70% Information */}
                    <div className="flex-[0.7] flex items-center gap-4 min-w-0 pr-4">
                       <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all shrink-0 ${type === 'income' ? 'bg-vantage-green/10 text-emerald-700' : type === 'transfer' ? 'bg-blue-500/10 text-blue-500' : 'bg-crimson/10 text-crimson'}`}>
                         {type === 'income' ? <ArrowUpRight size={16} strokeWidth={3} /> : type === 'transfer' ? <Plus size={16} strokeWidth={3} className="rotate-45" /> : <ArrowDownLeft size={16} strokeWidth={3} />}
                       </div>
                       <div className="flex flex-col min-w-0">
                         <div className="flex items-center gap-2">
                           <span className="text-[clamp(12px,3.5vw,15px)] font-normal leading-none text-black uppercase truncate">
                             {tx.notes || (tx.type === 'transfer' ? 'Internal Transfer' : tx.category)}
                           </span>
                           {tx.groupId && (
                             <div className="flex items-center gap-0.5 px-1 bg-vantage-green/20 rounded-md">
                               <GitBranch size={8} className="text-vantage-green" />
                               <span className="text-[9px] font-normal uppercase text-vantage-green tracking-tighter">Split</span>
                             </div>
                           )}
                         </div>
                         <div className="flex items-center gap-1 mt-1.5 truncate">
                           <span className="text-[clamp(10px,2.5vw,12px)] text-[#57606F] font-normal uppercase tracking-widest leading-none shrink-0">{fromAcc}</span>
                           {type === 'transfer' && toAcc && (
                             <>
                               <ArrowRight size={8} className="text-vantage-muted/40 shrink-0" />
                               <span className="text-[clamp(10px,2.5vw,12px)] text-[#57606F] font-normal uppercase tracking-widest leading-none shrink-0 truncate">{toAcc}</span>
                             </>
                           )}
                         </div>
                       </div>
                    </div>

                    {/* 30% Interaction/Amount */}
                    <div className="flex-[0.3] flex flex-col items-end border-l border-vantage-text/10 pl-4 shrink-0">
                       <span className={`text-[clamp(12px,3.5vw,15px)] font-normal leading-none ${!isOutflow ? 'text-emerald-700' : 'text-crimson'}`}>
                         {!isOutflow ? '+' : '-'}{(Math.abs(tx.amount) || 0).toLocaleString()}
                       </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[clamp(10px,2.5vw,12px)] text-[#57606F] font-normal uppercase tracking-widest leading-none">
                          {type === 'expense' ? 'Debit' : type === 'income' ? 'Credit' : 'Move'}
                        </span>
                        <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             setTxToDelete(tx);
                           }}
                           className="p-1 text-[#57606F] hover:text-crimson opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                         >
                           <Trash2 size={12} />
                         </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
           {filteredRecentTransactions.length === 0 && (
             <div className="w-[92%] mx-auto py-16 flex flex-col items-center justify-center bg-white rounded-[1.5rem] border-[1.5px] border-dashed border-[#E1E8ED]">
                 <span className="text-[clamp(10px,2.5vw,12px)] font-normal text-[#57606F] uppercase tracking-widest">Protocol Database Empty</span>
             </div>
           )}
        </div>
      </div>

    </div>
  </div>

      {/* Ad Banner for Free Users */}
      <AdContainer subscriptionTier={profile.subscriptionTier || 'free'} />

      {/* Transaction Detail Popup */}
      <TransactionDetailModal 
        isOpen={!!selectedTx}
        uid={profile.uid}
        tx={selectedTx}
        onClose={() => setSelectedTx(null)}
      />

      {activeBudgetForTx && (
        <QuickTransactionModal 
          isOpen={true}
          onClose={() => setActiveBudgetForTx(null)}
          budget={activeBudgetForTx}
          accounts={accounts}
          profile={profile}
          effectiveCategories={userCategories.length > 0 ? userCategories : MASTER_CATEGORIES}
        />
      )}

      <ConfirmationModal 
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action will permanently remove the record from your ledger."
        confirmLabel="Destroy Record"
        isLoading={isDeleting}
      />

      <NetWorthBreakdownModal 
        isOpen={isNetWorthBreakdownOpen}
        onClose={() => setIsNetWorthBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />

      {/* Cash Available Breakdown Modal popup */}
      <CashBreakdownModal 
        isOpen={isCashBreakdownOpen}
        onClose={() => setIsCashBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />

      {/* Debt Breakdown Modal popup */}
      <DebtBreakdownModal 
        isOpen={isDebtBreakdownOpen}
        onClose={() => setIsDebtBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />
    </div>
  );
});
