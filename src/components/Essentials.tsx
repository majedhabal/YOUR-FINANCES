import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Check, 
  X,
  AlertCircle,
  Landmark,
  CreditCard,
  Home,
  Building2 as BankIcon,
  HandCoins,
  Archive,
  Calendar,
  Shield,
  Plane,
  Car,
  Sparkles,
  TrendingUp,
  Bot,
  Lightbulb
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  serverTimestamp,
  where,
  runTransaction,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { ConfirmationModal } from './ConfirmationModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { BudgetCard } from './BudgetCard';
import { MASTER_CATEGORIES, evaluateMathExpression } from '../lib/constants';
import { formatLabel } from '../lib/stringUtils';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';
import { calculateAccountBalances } from '../lib/trendUtils';
import { DebtMilestoneConfigModal } from './DebtMilestoneConfigModal';
import { SalaryBreakdownModal } from './SalaryBreakdownModal';
import { BudgetSection } from './BudgetSection';
import { SalaryOverviewSection } from './SalaryOverviewSection';
import { EssentialsHeader } from './EssentialsHeader';
import { BudgetDetailView } from './BudgetDetailView';
import { SavingsSection } from './SavingsSection';
import { DebtSection } from './DebtSection';
import { GoalTransactionModal } from './GoalTransactionModal';
import { DebtTransactionModal } from './DebtTransactionModal';
import { BudgetTransactionModal } from './BudgetTransactionModal';
import { PremiumModal } from './PremiumModal';


interface BudgetCategory {
  id: string;
  budgetId?: string;
  accountId?: string;
  maxBudget?: number;
  title?: string;
  categoryTitle?: string;
  allocatedAmount: number;
  currency: string;
  category: string;
  subcategory?: string;
  emoji?: string;
  iconAsset?: string;
  period: 'daily' | 'weekly' | 'monthly';
  lastHistorySnapshotDate?: any;
  createdAt: any;
  spentAmount?: number;
  spent?: number;
  mappedCategories?: string[];
  mappedSubCategories?: string[];
}

const isTxMatchingBudget = (tx: any, budget: BudgetCategory) => {
  if (!tx) return false;
  if (tx.type === 'transfer') {
    if (budget.category === 'ACCOUNT FUND TRANSFERS') {
      const matchId = budget.accountId && tx.toAccountId === budget.accountId;
      const matchSub = budget.subcategory && tx.notes?.toLowerCase().includes(budget.subcategory.toLowerCase());
      return tx.transferSide === 'sender' && (matchId || matchSub);
    }
    return false;
  }
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

interface DailyLogProps {
  profile: any;
}

export const Essentials: React.FC<DailyLogProps> = ({ profile }) => {
  const { t } = useTranslation();
  const NAVIGATION_TABS = [
    { id: 'daily' as const, label: t('essentials.budget_allocation') },
    { id: 'savings' as const, label: t('essentials.savings_goals') },
    { id: 'debt' as const, label: t('essentials.debt_management') }
  ];
  const [budgets, setBudgets] = useState<BudgetCategory[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'savings' | 'debt'>('daily');
  
  // Milestones State
  const [milestones, setMilestones] = useState<any[]>(() => {
    if (profile?.uid) {
      const saved = localStorage.getItem(`vantage_offline_milestones_${profile.uid}`);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [userLogins, setUserLogins] = useState<any[]>([]);

  // Initialization trigger
  useEffect(() => {
    if (profile?.uid && profile.initialized === false) {
      const initialize = async () => {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          await fetch('/api/initialize-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ data: {} })
          });
        } catch (err) {
          console.error("Server-side initialization trigger failed:", err);
        }
      };
      initialize();
    }
  }, [profile?.uid, profile?.initialized]);

  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('milestone-modal-toggled', { detail: { isOpen: isMilestoneModalOpen } }));
  }, [isMilestoneModalOpen]);
  const [editingMilestone, setEditingMilestone] = useState<any | null>(null);
  const [milestoneToDelete, setMilestoneToDelete] = useState<any | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [showArchivedGoals, setShowArchivedGoals] = useState(false);
  const [savingsGoalAction, setSavingsGoalAction] = useState<{ type: 'archive' | 'delete', ms: any } | null>(null);

  // Debt Milestones State
  const [debtMilestones, setDebtMilestones] = useState<any[]>([]);
  const [isDebtMilestoneModalOpen, setIsDebtMilestoneModalOpen] = useState(false);
  
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('debt-milestone-modal-toggled', { detail: { isOpen: isDebtMilestoneModalOpen } }));
  }, [isDebtMilestoneModalOpen]);

  useEffect(() => {
  }, []);
  const [editingDebtMilestone, setEditingDebtMilestone] = useState<any | null>(null);
  const [debtMilestoneToDelete, setDebtMilestoneToDelete] = useState<any | null>(null);
  const [showManageLinkedModal, setShowManageLinkedModal] = useState(false);
  const [showArchivedDebts, setShowArchivedDebts] = useState(false);
  const [debtMilestoneAction, setDebtMilestoneAction] = useState<{ type: 'archive' | 'delete', ms: any } | null>(null);

  // Modals
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetCategory | null>(null);
  const [activeBudgetForTx, setActiveBudgetForTx] = useState<BudgetCategory | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<BudgetCategory | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [targetForTx, setTargetForTx] = useState<{ type: 'milestone' | 'debt', target: any } | null>(null);

  // Salary Breakdown Blueprints State & Helpers
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [dbSalary, setDbSalary] = useState<number>(5000);
  const [dbPayday, setDbPayday] = useState<number>(28);

  const getCurrentPeriodYearMonth = () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curDay = now.getDate();

    let initYear = curYear;
    let initMonth = curMonth;

    if (curDay < dbPayday) {
      const prevMonthDate = new Date(curYear, curMonth - 1, 1);
      initYear = prevMonthDate.getFullYear();
      initMonth = prevMonthDate.getMonth();
    }
    return `${initYear}-${String(initMonth + 1).padStart(2, '0')}`;
  };

  const [selectedPeriod, setSelectedPeriod] = useState<string>(getCurrentPeriodYearMonth());

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });
    return `${monthName} Salary Breakdown`;
  };

  const getOperationalDateSpanText = (yrMo: string, paydayVal: number) => {
    const [year, month] = yrMo.split('-').map(Number);
    const startDate = new Date(year, month - 1, paydayVal);
    const endDate = new Date(year, month, paydayVal - 1);
    
    const getOrdinalSuffix = (num: number) => {
      if (num > 3 && num < 21) return 'th';
      switch (num % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };

    const startMonthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    const endMonthName = endDate.toLocaleDateString('en-US', { month: 'long' });

    return `From ${paydayVal}${getOrdinalSuffix(paydayVal)} of ${startMonthName} until ${endDate.getDate()}${getOrdinalSuffix(endDate.getDate())} of ${endMonthName}`;
  };

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, `users/${profile.uid}/recurringTransactions`),
      where('type', '==', 'income')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .filter((item) => item.isActive !== false);

      const computedSalary = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setDbSalary(computedSalary);

      const payItem = items.find(item => (item.category === 'Salary' || (item.category === 'Income' && item.subcategory === 'Wage')) && item.dayOption) || items.find(item => (item.category === 'Salary' || (item.category === 'Income' && item.subcategory === 'Wage'))) || items.find(item => item.dayOption);
      if (payItem) {
        setDbPayday(Number(payItem.dayOption));
      } else {
        setDbPayday(28);
      }
    }, (err) => {
      console.warn("Could not read recurring transactions in DailyLog:", err);
    });
    return () => unsub();
  }, [profile?.uid]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // fallback
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;
    
    // Auto-execution check for pending transfer schedules whose payday start date is active
    const checkAndExecutePendingTransfers = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const q = query(
        collection(db, `users/${profile.uid}/transactions`),
        where('status', '==', 'Pending Schedule')
      );
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(db);
          let updatedCount = 0;
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            // Compare transaction date with today
            // If today is on or after the scheduled date, execute/approve it!
            if (data.date && todayStr >= data.date) {
              const docRef = doc(db, `users/${profile.uid}/transactions`, docSnap.id);
              batch.update(docRef, {
                status: 'confirmed',
                updatedAt: serverTimestamp()
              });
              updatedCount++;
            }
          });
          if (updatedCount > 0) {
            await batch.commit();
            console.log(`Executed ${updatedCount} time-locked pending transfers.`);
          }
        }
      } catch (err) {
        console.error("Error executing pending transfers:", err);
      }
    };

    checkAndExecutePendingTransfers();
  }, [profile?.uid]);

useEffect(() => {
    if (!profile?.uid) return;

    // Fetch Budgets
    const unsubBudgets = onSnapshot(collection(db, `users/${profile.uid}/miniBudgets`), (snap) => {
      setBudgets(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          title: data.title || data.categoryTitle || 'Unnamed Budget'
        } as BudgetCategory;
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/miniBudgets`);
    });

    // Fetch Recent Transactions (Last 60 days)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const dateStr = sixtyDaysAgo.toLocaleDateString('en-CA');
    
    const qRecent = query(
      collection(db, `users/${profile.uid}/transactions`), 
      where('date', '>=', dateStr)
    );
    
    const unsubRecent = onSnapshot(qRecent, (snap) => {
      setRecentTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${profile.uid}/transactions`);
    });

    // Fetch All Transactions for Account Balances
    const qAll = query(collection(db, `users/${profile.uid}/transactions`));
    const unsubAll = onSnapshot(qAll, (snap) => {
      setAllTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/transactions`);
    });

    // Fetch Accounts
    const unsubAcc = onSnapshot(collection(db, `users/${profile.uid}/accounts`), (snap) => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/accounts`);
    });

    // Fetch Categories
    const unsubCat = onSnapshot(collection(db, `users/${profile.uid}/categories`), (snap) => {
      setUserCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/categories`);
    });

    // Fetch Goals (Unified Milestones/DebtMilestones)
    const unsubGoals = onSnapshot(collection(db, `users/${profile.uid}/goals`), (snap) => {
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Migration logic: If no goals, try to load from old collections
      if (items.length === 0) {
        // This is a simplified migration - in a real app, you'd do this once properly
        console.log("No goals found, checking for old milestones/debtMilestones...");
      }

      setMilestones(items.filter((item: any) => item.type === 'savings' || !item.type));
      setDebtMilestones(items.filter((item: any) => item.type === 'debt'));
      
      localStorage.setItem(`vantage_offline_goals_${profile.uid}`, JSON.stringify(items));
    }, (error) => {
      console.error("Error fetching goals:", error);
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/goals`);
    });

    // Fetch User Logins
    const unsubLogins = onSnapshot(collection(db, `users/${profile.uid}/logins`), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUserLogins(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${profile.uid}/logins`);
    });

    // 🌟 FIX 1: Clean up all open streams when unmounting/navigating away
    return () => {
      unsubBudgets();
      unsubRecent();
      unsubAll();
      unsubAcc();
      unsubCat();
      unsubGoals();
      unsubLogins();
    };
  }, [profile?.uid]); // 🔒 FIX 2: Explicitly lock this hook to user session changes only!

  useEffect(() => {
    const handleTrigger = () => {
      setActiveSubTab('daily');
      setIsConfigModalOpen(true);
    };
    const handleSetSubtab = (e: Event) => {
      const customEvent = e as CustomEvent;
      const subtab = customEvent.detail?.subtab;
      if (subtab === 'daily' || subtab === 'savings' || subtab === 'debt') {
        setActiveSubTab(subtab);
      }
    };

    window.addEventListener('trigger-daily-log-budget-config', handleTrigger);
    window.addEventListener('set-daily-log-subtab', handleSetSubtab);
    return () => {
      window.removeEventListener('trigger-daily-log-budget-config', handleTrigger);
      window.removeEventListener('set-daily-log-subtab', handleSetSubtab);
    };
  }, []);

  const effectiveCategories = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;

  const calculateSpent = (budget: BudgetCategory, offset: 'current' | 'previous' = 'current') => {
    const now = new Date();
    let start: Date;
    let end: Date;

    const period = budget.period || 'daily';

    if (period === 'monthly') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const curDay = now.getDate();

      let initYear = curYear;
      let initMonth = curMonth;

      if (curDay < dbPayday) {
        const prevMonthDate = new Date(curYear, curMonth - 1, 1);
        initYear = prevMonthDate.getFullYear();
        initMonth = prevMonthDate.getMonth();
      }

      if (offset === 'current') {
        start = new Date(initYear, initMonth, dbPayday);
        end = new Date(initYear, initMonth + 1, dbPayday - 1, 23, 59, 59);
      } else {
        const prevCycleDate = new Date(initYear, initMonth - 1, 1);
        const prevInitYear = prevCycleDate.getFullYear();
        const prevInitMonth = prevCycleDate.getMonth();
        start = new Date(prevInitYear, prevInitMonth, dbPayday);
        end = new Date(prevInitYear, prevInitMonth + 1, dbPayday - 1, 23, 59, 59);
      }
    } else if (period === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0,0,0,0);

      if (offset === 'current') {
        start = monday;
        end = now;
      } else {
        start = new Date(monday);
        start.setDate(start.getDate() - 7);
        end = new Date(monday);
        end.setSeconds(-1);
      }
    } else {
      // Daily
      if (offset === 'current') {
        const todayStr = new Date().toLocaleDateString('en-CA');
        return recentTransactions
          .filter(tx => isTxMatchingBudget(tx, budget) && tx.date === todayStr)
          .reduce((sum, tx) => sum + (tx.amount || 0), 0);
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toLocaleDateString('en-CA');
        return recentTransactions
          .filter(tx => isTxMatchingBudget(tx, budget) && tx.date === yesterdayStr)
          .reduce((sum, tx) => sum + (tx.amount || 0), 0);
      }
    }

    const startStr = start.toLocaleDateString('en-CA');
    const endStr = end.toLocaleDateString('en-CA');

    return recentTransactions
      .filter(tx => isTxMatchingBudget(tx, budget) && tx.date >= startStr && tx.date <= endStr)
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, `users/${profile.uid}/miniBudgets`, budgetToDelete.id));
      setBudgetToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/miniBudgets/${budgetToDelete.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const activeBaseCurr = profile?.baseCurrency || profile?.currency || 'AED';

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(accounts, allTransactions);
  }, [accounts, allTransactions]);

  // Aggregate Cash / Bank / Savings
  const savingsAccounts = accounts.filter(acc => 
    !acc.isArchived && 
    (acc.type === 'bank' || acc.type === 'Bank' || acc.type === 'cash' || acc.type === 'Cash' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Cash')
  );

  const totalLiquidReserve = savingsAccounts.reduce((sum, acc) => {
    const currentBalance = accountBalances[acc.id] || 0;
    const rate = (exchangeRates && exchangeRates[acc.currency]) || 1;
    const baseRateToAED = (exchangeRates && exchangeRates[activeBaseCurr]) || 1;
    const translated = (currentBalance * rate) / baseRateToAED;
    return sum + translated;
  }, 0);

  // Aggregate Debt & Liabilities
  const debtAccounts = accounts.filter(acc => 
    !acc.isArchived && 
    (acc.type === 'credit' || acc.type === 'loan' || acc.type === 'mortgage' || acc.type === 'Credit Card' || acc.type === 'Personal Loan' || acc.type === 'Mortgage')
  );

  const totalDebt = debtAccounts.reduce((sum, acc) => {
    const currentBalance = accountBalances[acc.id] || 0;
    const rate = (exchangeRates && exchangeRates[acc.currency]) || 1;
    const baseRateToAED = (exchangeRates && exchangeRates[activeBaseCurr]) || 1;
    const translated = (currentBalance * rate) / baseRateToAED;
    return sum + Math.abs(translated);
  }, 0);



  const handleDeleteMilestone = async () => {
    if (!profile?.uid || !milestoneToDelete) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, `users/${profile.uid}/milestones`, milestoneToDelete.id));
      setMilestoneToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/milestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleArchiveMilestone = async (ms: any) => {
    if (!profile?.uid || !ms?.id) return;
    setIsLoading(true);
    try {
      await setDoc(doc(db, `users/${profile.uid}/milestones`, ms.id), {
        isArchived: !ms.isArchived,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/milestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSavingsGoalAction = async () => {
    if (!profile?.uid || !savingsGoalAction) return;
    const { type, ms } = savingsGoalAction;
    setIsLoading(true);
    try {
      if (type === 'archive') {
        await setDoc(doc(db, `users/${profile.uid}/milestones`, ms.id), {
          isArchived: !ms.isArchived,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else if (type === 'delete') {
        await deleteDoc(doc(db, `users/${profile.uid}/milestones`, ms.id));
      }
      setSavingsGoalAction(null);
    } catch (err) {
      handleFirestoreError(err, type === 'delete' ? OperationType.DELETE : OperationType.WRITE, `users/${profile.uid}/milestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDebtMilestoneAction = async () => {
    if (!profile?.uid || !debtMilestoneAction) return;
    const { type, ms } = debtMilestoneAction;
    setIsLoading(true);
    try {
      if (type === 'archive') {
        await setDoc(doc(db, `users/${profile.uid}/debtMilestones`, ms.id), {
          isArchived: !ms.isArchived,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else if (type === 'delete') {
        const acc = ms;
        const accRef = doc(db, `users/${profile.uid}/accounts`, acc.id);
        
        const batch = writeBatch(db);
        batch.delete(accRef);

        const txsToDelete = allTransactions.filter(tx => tx.sourceAccountId === acc.id || tx.toAccountId === acc.id || tx.fromAccountId === acc.id);
        
        txsToDelete.forEach(tx => {
          const txRef = doc(db, `users/${profile.uid}/transactions`, tx.id);
          batch.delete(txRef);
        });

        await batch.commit();
      }
      setDebtMilestoneAction(null);
    } catch (err) {
      handleFirestoreError(err, type === 'delete' ? OperationType.DELETE : OperationType.WRITE, `users/${profile.uid}/accounts/${ms.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleArchiveDebtMilestone = async (ms: any) => {
    if (!profile?.uid || !ms?.id) return;
    setIsLoading(true);
    try {
      await setDoc(doc(db, `users/${profile.uid}/debtMilestones`, ms.id), {
        isArchived: !ms.isArchived,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/debtMilestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDebtMilestone = async () => {
    if (!profile?.uid || !debtMilestoneToDelete) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, `users/${profile.uid}/debtMilestones`, debtMilestoneToDelete.id));
      setDebtMilestoneToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/debtMilestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMilestoneDeleteClick = async () => {
    if (!debtMilestoneToDelete) return;
    const linkedAcc = accounts.find(a => a.id === debtMilestoneToDelete.accountId);
    if (linkedAcc) {
      // Intercept layout process to open the "Manage Linked Account" overlay sheet
      setShowManageLinkedModal(true);
    } else {
      await handleDeleteDebtMilestone();
    }
  };

  const handleManageLinkedAccount = async (action: 'delete' | 'archive' | 'keep') => {
    if (!profile?.uid || !debtMilestoneToDelete) return;
    setIsLoading(true);
    try {
      const milestoneId = debtMilestoneToDelete.id;
      const accountId = debtMilestoneToDelete.accountId;

      await deleteDoc(doc(db, `users/${profile.uid}/debtMilestones`, milestoneId));

      if (accountId) {
        if (action === 'delete') {
          await deleteDoc(doc(db, `users/${profile.uid}/accounts`, accountId));
        } else if (action === 'archive') {
          await setDoc(doc(db, `users/${profile.uid}/accounts`, accountId), {
            isArchived: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      setDebtMilestoneToDelete(null);
      setShowManageLinkedModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/debtMilestones/accounts`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderTransactionDrilldown = (budget: BudgetCategory, isMobileView: boolean = false) => {
    const assocTx = recentTransactions
      .filter(tx => isTxMatchingBudget(tx, budget))
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalSpent = assocTx.reduce((sum, tx) => sum + (tx.amount || 0), 0);

    return (
      <div 
        className={`w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-xl p-3 sm:p-4 flex flex-col gap-3 shadow-xs ${isMobileView ? 'max-w-[360px] mx-auto' : ''}`} 
        style={{ fontFamily: "'Google Sans', sans-serif" }}
      >
        {/* Header Info */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div className="flex flex-col">
            <span className="text-[10px] text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
              {budget.period === 'daily' || budget.title?.toLowerCase().includes('daily') || budget.category?.toLowerCase().includes('daily') ? t('essentials.daily_spends_overview', 'DAILY SPENDS OVERVIEW') : t('essentials.associated_ledger', 'ASSOCIATED LEDGER')}
            </span>
            <h5 className="text-[13px] text-black font-bold" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
              {budget.title || budget.category} {t('essentials.detail', 'Detail')}
            </h5>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setEditingBudget(budget)}
              className="px-2.5 py-1 text-[10px] hover:bg-neutral-50 active:scale-95 text-neutral-600 font-bold border border-neutral-200 rounded-lg transition-all cursor-pointer"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            >
              {t('essentials.edit_limit', 'Edit Limit')}
            </button>
            <button
              type="button"
              onClick={() => setSelectedBudgetId(null)}
              className="w-6 h-6 hover:bg-neutral-50 active:scale-95 text-neutral-400 hover:text-neutral-600 rounded-full flex items-center justify-center transition-all cursor-pointer border border-neutral-200"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Transaction Item List */}
        <div className="flex flex-col divide-y divide-neutral-100 max-h-[220px] overflow-y-auto pr-1">
          {assocTx.length > 0 ? (
            assocTx.map((tx, idx) => {
              const formattedAmount = `- ${tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tx.currency || budget.currency || 'AED'}`;
              return (
                <div 
                  key={`tx-${budget.id}-${tx.id || idx}`} 
                  className="py-2.5 flex items-center justify-between gap-3 text-left hover:bg-neutral-50/50 cursor-pointer rounded-lg transition-all"
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Mini clear circular action badge */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTx(tx);
                      }}
                      className="w-[20px] h-[20px] rounded-full border border-neutral-200 hover:border-rose-300 hover:bg-rose-50 flex items-center justify-center text-neutral-400 hover:text-rose-500 transition-all shrink-0 cursor-pointer"
                      title="Delete Transaction"
                    >
                      <Trash2 size={10} />
                    </button>
                    
                    <div className="flex flex-col min-w-0">
                      <span 
                        className="text-[#1E293B] truncate block"
                        style={{ 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 400,
                          fontSize: 'clamp(11px, 2.5vw, 13px)'
                        }}
                      >
                        {tx.notes || tx.title || t('essentials.untitled_expense', 'Untitled Expense')}
                      </span>
                      <span 
                        className="text-[9px] text-neutral-400 block leading-none mt-0.5"
                        style={{ 
                          fontFamily: "'Google Sans', sans-serif", 
                          fontWeight: 400
                        }}
                      >
                        {tx.date} {tx.paymentMethod ? `• ${tx.paymentMethod}` : ''}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <span 
                      className="text-[#EF4444] block font-bold"
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif", 
                        fontWeight: 700,
                        fontSize: 'clamp(11px, 2.5vw, 13px)'
                      }}
                    >
                      {formattedAmount}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center">
              <span className="text-[11px] text-[#57606F] font-normal opacity-50" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                {t('essentials.no_past_transactions', 'No past transactions logged for this period')}
              </span>
            </div>
          )}
        </div>

        {/* Summary Row */}
        <div className="border-t border-neutral-150 pt-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-neutral-400" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
            {t('essentials.total_transaction_values', 'Total Transaction Values')}
          </span>
          <span className="text-[13px] text-neutral-800 font-bold" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
            {totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {budget.currency || 'AED'}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-[#F8FAFC] min-h-screen text-black pb-[10vh] gap-6 relative transition-colors duration-300 px-[15px]">
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none"
          >
            <div className="w-32 h-32 bg-white dark:bg-[#252932] border-4 border-vantage-green rounded-full flex items-center justify-center shadow-lg">
              <Check size={64} className="text-vantage-green animate-bounce" strokeWidth={4} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - Sticky */}
      <EssentialsHeader 
        title={t('essentials.title')}
      />
      <SalaryBreakdownModal 
        isOpen={isSalaryModalOpen}
        onClose={() => setIsSalaryModalOpen(false)}
        profile={profile}
        budgets={budgets}
        onOpenPremiumModal={() => setIsPremiumModalOpen(true)}
        onSuccess={() => {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 2000);
        }}
      />
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        uid={profile.uid}
        profile={profile}
        onSuccess={(updatedProfile) => {
          // Handle successful upgrade if needed
        }}
      />

      {/* Unified Grid Layout */}
      <div className="flex flex-col gap-6 p-[5px] border-0 h-auto">
        <SalaryOverviewSection 
          salary={dbSalary} 
          currency={activeBaseCurr} 
          onOpenBreakdown={() => setIsSalaryModalOpen(true)} 
        />

        {/* Column 1: Budget Allocation */}
        <BudgetSection 
          budgets={budgets} 
          accounts={accounts} 
          transactions={recentTransactions} 
          onDelete={(b) => setBudgetToDelete(b)} 
          onBudgetClick={(b) => setSelectedBudgetId(b.id)} 
          onAddExpense={(b) => setActiveBudgetForTx(b)} 
          baseCurrency={activeBaseCurr}
          currentPeriod={selectedPeriod}
          payday={dbPayday}
          onPeriodChange={(p) => setSelectedPeriod(p)}
          isCurrentPeriod={selectedPeriod === getCurrentPeriodYearMonth()}
        />


        {/* Column 2: Savings Goals */}
        <SavingsSection milestones={milestones}
        accounts={accounts}
        accountBalances={accountBalances}
        transactions={allTransactions}
        onDeleteMilestone={(ms) => setSavingsGoalAction({ type: 'delete', ms })}
        onAddTransaction={(ms) => setTargetForTx({ type: 'milestone', target: ms })}
        onAddGoal={() => window.dispatchEvent(new CustomEvent('trigger-savings-goal-config'))}
        currency={profile.baseCurrency || 'AED'}
         />

        {/* Column 3: Debt Management */}
        <DebtSection                
          accounts={accounts} 
          transactions={allTransactions} 
          onDeleteDebt={(acc) => setDebtMilestoneAction({ type: 'delete', ms: acc })}                
          onAddDebtTransaction={(acc) => setTargetForTx({ type: 'debt', target: acc })}
          onAddDebt={() => window.dispatchEvent(new CustomEvent('trigger-debt-config'))}
          currency={profile.baseCurrency || 'AED'}
        />

        {/* Debt Insight Card */}
        <div 
          id="essentials-debt-insight"
          className="relative overflow-hidden flex flex-col transition-all bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-6"
        >
          <div className="flex items-center gap-2 text-[#B91C1C] mb-3" style={{ backgroundColor: '#ffffff' }}>
            <Lightbulb size={20} />
            <span className="font-bold text-sm">{t('essentials.vantage_insight')}</span>
          </div>
          <p className="text-[#B91C1C] text-sm leading-relaxed" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
            { (() => {
              const debtNow = accounts.filter(a => ['Credit Card', 'Personal Loan', 'Mortgage'].includes(a.type)).reduce((sum, a) => sum + Math.abs(a.currentBalance || 0), 0);
              const debtPast = accounts.filter(a => ['Credit Card', 'Personal Loan', 'Mortgage'].includes(a.type)).reduce((sum, a) => sum + Math.abs(a.startingBalance || 0), 0);
              const diff = debtNow - debtPast;
              const pct = debtPast > 0 ? (Math.abs(diff) / debtPast) * 100 : 0;
              
              const direction = diff > 0 
                ? t('common.increased', 'increased') 
                : diff < 0 
                  ? t('common.decreased', 'decreased') 
                  : t('common.remained_stable', 'remained stable');
                  
              return t('essentials.debt_insight_text', { status: direction, pct: pct.toFixed(1) });
            })() }
          </p>
        </div>
      </div>

      {selectedBudgetId && budgets.find(b => b.id === selectedBudgetId) && (
        <div className="fixed inset-0 z-50 bg-[#F8FAFC]">
          <BudgetDetailView 
            budget={budgets.find(b => b.id === selectedBudgetId)!}
            transactions={allTransactions}
            accounts={accounts}
            uid={profile.uid}
            onBack={() => setSelectedBudgetId(null)}
            onEdit={() => { /* Implement */ }}
          />
        </div>
      )}
      
      {/* Config Modal */}
      <BudgetConfigModal 
        isOpen={isConfigModalOpen || editingBudget !== null}
        onClose={() => {
          setIsConfigModalOpen(false);
          setEditingBudget(null);
        }}
        profile={profile}
        editingBudget={editingBudget}
        effectiveCategories={effectiveCategories}
      />

      {/* Budget Transaction Modal */}
      {activeBudgetForTx && (
        <BudgetTransactionModal 
          isOpen={true}
          onClose={() => setActiveBudgetForTx(null)}
          onSuccess={() => {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
          }}
          budget={activeBudgetForTx}
          accounts={accounts}
          profile={profile}
        />
      )}

      {targetForTx && targetForTx.type === 'milestone' && (
        <GoalTransactionModal 
          isOpen={true}
          onClose={() => setTargetForTx(null)}
          onSuccess={() => {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
          }}
          target={targetForTx.target}
          type="milestone"
          accounts={accounts}
          profile={profile}
        />
      )}

      {targetForTx && targetForTx.type === 'debt' && (
        <DebtTransactionModal 
          isOpen={true}
          onClose={() => setTargetForTx(null)}
          onSuccess={() => {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
          }}
          debt={targetForTx.target}
          accounts={accounts}
          profile={profile}
        />
      )}

      <ConfirmationModal 
        key="budget-delete-confirm"
        isOpen={budgetToDelete !== null}
        onClose={() => setBudgetToDelete(null)}
        onConfirm={handleDeleteBudget}
        title="Delete Budget?"
        message="Your transaction history will remain safe. Deleting the budget card only removes the daily view shortcut."
        confirmLabel="Confirm Deletion"
        isLoading={isLoading}
        type="danger"
      />

      {/* Milestone Config Modal */}
      <MilestoneConfigModal 
        isOpen={isMilestoneModalOpen}
        onClose={() => {
          setIsMilestoneModalOpen(false);
          setEditingMilestone(null);
        }}
        profile={profile}
        editingMilestone={editingMilestone}
        accounts={accounts}
        allTransactions={allTransactions}
        exchangeRates={exchangeRates}
      />

      {/* Centralized Protective Confirmation Pop-up Overlay for Savings Goals */}
      <AnimatePresence>
        {savingsGoalAction !== null && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 select-none animate-fadeIn">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSavingsGoalAction(null)}
              className="absolute inset-0 bg-white"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className="relative w-full max-w-[340px] md:max-w-[380px] bg-white border border-[#E1E8ED] rounded-[1.5rem] p-5 md:p-6 flex flex-col items-center text-center gap-3 md:gap-4 shadow-2xl"
            >
              {/* Soft decorative sage green Circle - optimized size and tight spacing */}
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#A6DDB1]/20 text-[#A6DDB1] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>

              <div className="flex flex-col gap-1 md:gap-2 w-full">
                {/* Title in bold 700 with fluid scaling */}
                <h3 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-[#1F2937] text-[clamp(12px,3.2vw,14px)] font-bold"
                >
                  {savingsGoalAction.type === 'delete' ? t('essentials.delete_target_goal', 'Delete Target Goal') : (savingsGoalAction.ms?.isArchived ? t('essentials.restore_target_goal', 'Restore Target Goal') : t('essentials.archive_target_goal', 'Archive Target Goal'))}
                </h3>
                {/* Regular weight 400 for parsing descriptive query text to load beautifully */}
                <p 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-neutral-500 tracking-wide leading-relaxed text-[clamp(12px,3vw,14px)] mt-1 md:mt-1.5"
                >
                  {t('essentials.are_you_sure_to_proceed', 'Are you sure you want to proceed?')}
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 mt-2">
                {/* PROCEED High-contrast validation button custom-styled with regular weight 400 and soft sage green action #A6DDB1 */}
                <button
                  type="button"
                  onClick={handleConfirmSavingsGoalAction}
                  disabled={isLoading}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400,
                    backgroundColor: '#A6DDB1',
                    color: '#1E293B'
                  }}
                  className="w-full h-[38px] md:h-[42px] text-[clamp(11px,2.8vw,13px)] flex items-center justify-center rounded-xl shadow-sm uppercase tracking-[0.1em] hover:brightness-95 active:scale-95 transition-all text-center cursor-pointer font-normal border-none outline-none"
                >
                  {isLoading ? t('common.processing', 'Processing...') : t('common.proceed', 'PROCEED')}
                </button>
                {/* CANCEL Dismiss button with regular weight 400 and scaled font to avoid looking disproportionate on desktop */}
                <button
                  type="button"
                  onClick={() => setSavingsGoalAction(null)}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400
                  }}
                  className="w-full flex items-center justify-center text-neutral-500 hover:text-black transition-colors font-normal cursor-pointer bg-transparent border-none outline-none text-[clamp(11px,2.8vw,13px)]"
                >
                  {t('common.cancel', 'CANCEL')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Centralized Protective Confirmation Pop-up Overlay for Debt Milestones */}
      <AnimatePresence>
        {debtMilestoneAction !== null && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 select-none animate-fadeIn">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDebtMilestoneAction(null)}
              className="absolute inset-0 bg-white"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className="relative w-full max-w-[340px] md:max-w-[380px] bg-white border border-[#E1E8ED] rounded-[1.5rem] p-5 md:p-6 flex flex-col items-center text-center gap-3 md:gap-4 shadow-2xl"
            >
              {/* Soft decorative sage green Circle - optimized size and tight spacing */}
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#A6DDB1]/20 text-[#A6DDB1] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>

              <div className="flex flex-col gap-1 md:gap-2 w-full">
                {/* Title in bold 700 with fluid scaling */}
                <h3 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-[#1F2937] text-[clamp(12px,3.2vw,14px)] font-bold"
                >
                  {debtMilestoneAction.type === 'delete' ? t('essentials.delete_debt', 'Delete Debt') : (debtMilestoneAction.ms?.isArchived ? t('essentials.restore_debt', 'Restore Debt') : t('essentials.archive_debt', 'Archive Debt'))}
                </h3>
                {/* Regular weight 400 for parsing descriptive query text to load beautifully */}
                <p 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-neutral-500 tracking-wide leading-relaxed text-[clamp(12px,3vw,14px)] mt-1 md:mt-1.5"
                >
                  {t('essentials.are_you_sure_to_proceed', 'Are you sure you want to proceed?')}
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 mt-2">
                {/* PROCEED High-contrast validation button custom-styled with regular weight 400 and soft sage green action #A6DDB1 */}
                <button
                  type="button"
                  onClick={handleConfirmDebtMilestoneAction}
                  disabled={isLoading}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400,
                    backgroundColor: '#A6DDB1',
                    color: '#1E293B'
                  }}
                  className="w-full h-[38px] md:h-[42px] text-[clamp(11px,2.8vw,13px)] flex items-center justify-center rounded-xl shadow-sm uppercase tracking-[0.1em] hover:brightness-95 active:scale-95 transition-all text-center cursor-pointer font-normal border-none outline-none"
                >
                  {isLoading ? t('common.processing', 'Processing...') : t('common.proceed', 'PROCEED')}
                </button>
                {/* CANCEL Dismiss button with regular weight 400 and scaled font to avoid looking disproportionate on desktop */}
                <button
                  type="button"
                  onClick={() => setDebtMilestoneAction(null)}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400
                  }}
                  className="w-full flex items-center justify-center text-neutral-500 hover:text-black transition-colors font-normal cursor-pointer bg-transparent border-none outline-none text-[clamp(11px,2.8vw,13px)] uppercase tracking-[0.1em]"
                >
                  {t('common.cancel', 'CANCEL')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Centralized Protective Confirmation Pop-up Overlay for Debt Milestones */}
      <AnimatePresence>
        {debtMilestoneAction !== null && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 select-none animate-fadeIn">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDebtMilestoneAction(null)}
              className="absolute inset-0 bg-white"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className="relative w-full max-w-[340px] md:max-w-[380px] bg-white border border-[#E1E8ED] rounded-[1.5rem] p-5 md:p-6 flex flex-col items-center text-center gap-3 md:gap-4 shadow-2xl"
            >
              {/* Soft decorative sage green Circle - optimized size and tight spacing */}
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#A6DDB1]/20 text-[#A6DDB1] flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>

              <div className="flex flex-col gap-1 md:gap-2 w-full">
                {/* Title in bold 700 with fluid scaling */}
                <h3 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-[#1F2937] text-[clamp(12px,3.2vw,14px)] font-bold"
                >
                  {debtMilestoneAction.type === 'delete' ? t('essentials.delete_debt_milestone', 'Delete Debt Milestone') : (debtMilestoneAction.ms?.isArchived ? t('essentials.restore_debt_milestone', 'Restore Debt Milestone') : t('essentials.archive_debt_milestone', 'Archive Debt Milestone'))}
                </h3>
                {/* Regular weight 400 for parsing descriptive query text to load beautifully */}
                <p 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-neutral-500 tracking-wide leading-relaxed text-[clamp(12px,3vw,14px)] mt-1 md:mt-1.5"
                >
                  {t('essentials.are_you_sure_to_proceed', 'Are you sure you want to proceed?')}
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 mt-2">
                {/* PROCEED High-contrast validation button custom-styled with regular weight 400 and soft sage green action #A6DDB1 */}
                <button
                  type="button"
                  onClick={handleConfirmDebtMilestoneAction}
                  disabled={isLoading}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400,
                    backgroundColor: '#A6DDB1',
                    color: '#1E293B'
                  }}
                  className="w-full h-[38px] md:h-[42px] text-[clamp(11px,2.8vw,13px)] flex items-center justify-center rounded-xl shadow-sm uppercase tracking-[0.1em] hover:brightness-95 active:scale-95 transition-all text-center cursor-pointer font-normal border-none outline-none"
                >
                  {isLoading ? t('common.processing', 'Processing...') : t('common.proceed', 'PROCEED')}
                </button>
                {/* CANCEL Dismiss button with regular weight 400 and scaled font to avoid looking disproportionate on desktop */}
                <button
                  type="button"
                  onClick={() => setDebtMilestoneAction(null)}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 400
                  }}
                  className="w-full flex items-center justify-center text-neutral-500 hover:text-black transition-colors font-normal cursor-pointer bg-transparent border-none outline-none text-[clamp(11px,2.8vw,13px)] uppercase tracking-[0.1em]"
                >
                  {t('common.cancel', 'CANCEL')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Debt Milestone Config Modal */}
      <DebtMilestoneConfigModal 
        isOpen={isDebtMilestoneModalOpen}
        onClose={() => {
          setIsDebtMilestoneModalOpen(false);
          setEditingDebtMilestone(null);
        }}
        profile={profile}
        editingMilestone={editingDebtMilestone}
        accounts={accounts}
        exchangeRates={exchangeRates}
      />

      <TransactionDetailModal 
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        uid={profile?.uid}
      />

      {/* Debt Milestone Deletion Confirmation */}
      <ConfirmationModal 
        key="debt-milestone-delete-confirm"
        isOpen={debtMilestoneToDelete !== null && !showManageLinkedModal}
        onClose={() => setDebtMilestoneToDelete(null)}
        onConfirm={handleConfirmMilestoneDeleteClick}
        title="Delete Debt Milestone?"
        message="Are you sure you want to delete this active repayment milestone?"
        confirmLabel="Confirm Delete Milestone"
        isLoading={isLoading}
        type="danger"
      />

      {/* Manage Linked Account Confirmation Modal */}
      <AnimatePresence>
        {showManageLinkedModal && debtMilestoneToDelete && (() => {
          const linkedAcc = accounts.find(a => a.id === debtMilestoneToDelete.accountId);
          return (
            <div 
    key={`manage-linked-overlay-container-${debtMilestoneToDelete.id || 'fallback'}`} 
    className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-4"
  >
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => {
                  setShowManageLinkedModal(false);
                  setDebtMilestoneToDelete(null);
                }} 
                className="absolute inset-0 bg-white pointer-events-auto" 
              />
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }} 
                className="relative w-full max-w-[360px] bg-white border border-[#E1E8ED] rounded-2xl p-5 shadow-xl z-[260] text-center flex flex-col items-center"
              >
                {/* Warning Title in bold 700 exclusively */}
                <h3 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                  className="text-sm text-black mb-2 leading-tight font-bold"
                >
                  {t('essentials.manage_linked_account', 'Manage Linked Account')}
                </h3>
                
                {/* Body message in regular 400 with high-density line constraints */}
                <p 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                  className="text-[10px] text-[#57606F] leading-snug tracking-normal mb-4 font-normal max-w-[280px]"
                >
                  {t('essentials.linked_account_warning', 'This active repayment milestone is linked to the liability node: ')}<span className="text-black">{linkedAcc?.name || 'Unknown'}</span>{t('essentials.linked_account_question', '. Would you like to wipe its overall balance-sheet node or keep/archive the ledger logs?')}
                </p>
 
                {/* Clear action selector keys in a confirmation layout row or stacked status layout */}
                <div className="flex flex-col gap-2 w-full">
                  <button
                    onClick={() => handleManageLinkedAccount('delete')}
                    disabled={isLoading}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                    className="w-full h-8.5 bg-red-600 hover:bg-red-700 text-white font-normal rounded-xl transition-colors cursor-pointer border-none text-[10px] uppercase tracking-wider"
                  >
                    {t('essentials.delete_account', 'Delete Account')}
                  </button>
                  <button
                    onClick={() => handleManageLinkedAccount('archive')}
                    disabled={isLoading}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                    className="w-full h-8.5 bg-[#f1f2f6] hover:bg-neutral-200 text-neutral-800 font-normal rounded-xl transition-colors cursor-pointer border-none text-[10px] uppercase tracking-wider"
                  >
                    {t('essentials.archive_account', 'Archive Account')}
                  </button>
                  <button
                    onClick={() => handleManageLinkedAccount('keep')}
                    disabled={isLoading}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} 
                    className="w-full h-8.5 bg-vantage-green/10 hover:bg-vantage-green/20 text-vantage-green font-normal rounded-xl transition-colors cursor-pointer border-none text-[10px] uppercase tracking-wider"
                  >
                    {t('essentials.keep_active', 'Keep Active')}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

// --- Sub-components ---
const BudgetConfigModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  profile: any; 
  editingBudget: BudgetCategory | null;
  effectiveCategories: any[];
}> = ({ isOpen, onClose, profile, editingBudget, effectiveCategories }) => {
  const [title, setTitle] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [mappedCategories, setMappedCategories] = useState<string[]>([]);
  const [mappedSubCategories, setMappedSubCategories] = useState<string[]>([]);
  const [expandedCats, setExpandedCats] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [emoji, setEmoji] = useState('🍟');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (editingBudget) {
      setTitle(editingBudget.categoryTitle || editingBudget.title || editingBudget.category || '');
      setMaxBudget((editingBudget.allocatedAmount !== undefined ? editingBudget.allocatedAmount : (editingBudget.maxBudget || 0)).toString());
      setCurrency(editingBudget.currency || 'AED');
      setPeriod(editingBudget.period || 'daily');
      setEmoji(editingBudget.emoji || (editingBudget.iconAsset && editingBudget.iconAsset.length === 1 ? editingBudget.iconAsset : '🍟'));
      
      const loadedCats = editingBudget.mappedCategories || (editingBudget.category ? [editingBudget.category] : []);
      const loadedSubs = editingBudget.mappedSubCategories || (editingBudget.subcategory && editingBudget.subcategory !== 'All' ? [editingBudget.subcategory] : []);
      setMappedCategories(loadedCats);
      setMappedSubCategories(loadedSubs);
      setExpandedCats(loadedCats);
    } else {
      setTitle('');
      setMaxBudget('');
      setCurrency('AED');
      setPeriod('daily');
      setEmoji('🍟');
      setMappedCategories([]);
      setMappedSubCategories([]);
      setExpandedCats([]);
    }
    setIsDropdownOpen(false);
  }, [editingBudget, isOpen, effectiveCategories]);

  const handleToggleCategory = (categoryName: string) => {
    const categoryDef = effectiveCategories.find(c => c.name === categoryName);
    const subCategories = categoryDef ? (categoryDef.subcategories || []) : [];

    const isSelected = mappedCategories.includes(categoryName);
    let newCats = [...mappedCategories];
    let newSubs = [...mappedSubCategories];

    if (isSelected) {
      // Uncheck parent: remove category and all its children subcategories
      newCats = newCats.filter(c => c !== categoryName);
      newSubs = newSubs.filter(sub => !subCategories.includes(sub));
      setExpandedCats(prev => prev.filter(c => c !== categoryName));
    } else {
      // Check parent: add category and all its children subcategories
      newCats.push(categoryName);
      subCategories.forEach((sub: string) => {
        if (!newSubs.includes(sub)) newSubs.push(sub);
      });
      if (!expandedCats.includes(categoryName)) {
        setExpandedCats(prev => [...prev, categoryName]);
      }
    }
    setMappedCategories(newCats);
    setMappedSubCategories(newSubs);

    // Dynamic emoji updates
    if (newCats.length > 0) {
      const firstCatData = effectiveCategories.find(c => c.name === newCats[0]);
      if (firstCatData?.emoji) {
        setEmoji(firstCatData.emoji);
      }
    }
  };

  const handleToggleSubCategory = (subName: string, parentCategoryName: string) => {
    const isSelected = mappedSubCategories.includes(subName);
    let newSubs = [...mappedSubCategories];
    let newCats = [...mappedCategories];

    if (isSelected) {
      newSubs = newSubs.filter(s => s !== subName);
    } else {
      newSubs.push(subName);
      if (!newCats.includes(parentCategoryName)) {
        newCats.push(parentCategoryName);
      }
      if (!expandedCats.includes(parentCategoryName)) {
        setExpandedCats(prev => [...prev, parentCategoryName]);
      }
    }
    setMappedCategories(newCats);
    setMappedSubCategories(newSubs);

    // Dynamic emoji updates
    if (newCats.length > 0) {
      const firstCatData = effectiveCategories.find(c => c.name === newCats[0]);
      if (firstCatData?.emoji) {
        setEmoji(firstCatData.emoji);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !title || !maxBudget) return;

    const parsedMaxBudget = parseFloat(evaluateMathExpression(maxBudget));

    if (editingBudget) {
      const isUnchanged = (editingBudget.categoryTitle === title || editingBudget.title === title) &&
                          (editingBudget.allocatedAmount === parsedMaxBudget || editingBudget.maxBudget === parsedMaxBudget) &&
                          editingBudget.currency === currency &&
                          JSON.stringify(editingBudget.mappedCategories || []) === JSON.stringify(mappedCategories) &&
                          JSON.stringify(editingBudget.mappedSubCategories || []) === JSON.stringify(mappedSubCategories) &&
                          editingBudget.period === period &&
                          (editingBudget.emoji === emoji || editingBudget.iconAsset === emoji);
      if (isUnchanged) {
        onClose();
        return;
      }
    }

    setIsLoading(true);

    try {
      const bId = editingBudget?.id || editingBudget?.budgetId;
      const budgetRef = bId 
        ? doc(db, `users/${profile.uid}/miniBudgets`, bId)
        : doc(collection(db, `users/${profile.uid}/miniBudgets`));
        
      const iconAssetVal = emoji || 'shopping-cart';
      const spentAmountVal = editingBudget ? (editingBudget.spentAmount !== undefined ? editingBudget.spentAmount : (editingBudget.spent || 0)) : 0.00;

      const fallbackCategory = mappedCategories.length > 0 ? mappedCategories[0] : (effectiveCategories[0]?.name || 'Food & Drinks');
      const fallbackSubcategory = mappedSubCategories.length > 0 ? mappedSubCategories[0] : null;

      await setDoc(budgetRef, {
        budgetId: budgetRef.id,
        id: budgetRef.id, // compatibility
        userId: profile.uid,
        categoryTitle: title,
        title: title, // compatibility
        allocatedAmount: parsedMaxBudget,
        maxBudget: parsedMaxBudget, // compatibility
        spentAmount: spentAmountVal,
        spent: spentAmountVal, // compatibility
        currency,
        iconAsset: iconAssetVal,
        emoji: emoji || '🍟', // compatibility
        category: fallbackCategory,
        subcategory: fallbackSubcategory,
        mappedCategories,
        mappedSubCategories,
        period,
        createdAt: editingBudget?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/miniBudgets`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-white" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.9, opacity: 0 }} 
            className="relative w-full max-w-[360px] md:max-w-[400px] bg-white border-[1px] border-neutral-200 rounded-2xl p-5 shadow-2xl transition-all"
          >
            <div className="flex flex-col items-center gap-0.5 mb-4">
              <h4 className="text-black text-center leading-none"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 700, 
                    fontSize: 'clamp(15px, 4.2vw, 19px)' 
                  }}>
                {editingBudget ? 'Modify Protocol' : 'Budget Control'}
              </h4>
              <p className="text-emerald-700 text-center leading-none mt-1"
                 style={{ 
                   fontFamily: "'Google Sans', sans-serif", 
                   fontWeight: 400, 
                   fontSize: 'clamp(9px, 2.2vw, 11px)' 
                 }}>
                {editingBudget ? 'Adjustment Phase' : 'Configuration Phase'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-[clamp(10px,2.8vw,14px)]">
              {/* Budget Title */}
              <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                <label className="px-1 leading-none text-slate-500 font-normal"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontSize: 'clamp(9px, 2.5vw, 11px)' 
                       }}>
                  Budget Title
                </label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Daily Coffee"
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2.5 text-black outline-none transition-all placeholder:text-[#57606F]/40"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400, 
                    fontSize: 'clamp(11px, 2.8vw, 13px)', 
                    height: 'clamp(34px, 9vw, 38px)' 
                  }}
                />
              </div>

              {/* Category Selections Dropdown (Replaces old side-by-side dropdowns) */}
              <div id="category-selection-container" className="space-y-1 text-left flex flex-col justify-start items-stretch relative">
                <label className="px-1 leading-none text-slate-500 font-normal"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontSize: 'clamp(9px, 2.5vw, 11px)' 
                       }}>
                  Category Selections
                </label>
                <button
                  type="button"
                  id="category-selection-trigger"
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-xl px-3 text-black transition-colors hover:bg-neutral-50 flex items-center justify-between text-left cursor-pointer outline-none select-none"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: 'clamp(11px, 2.8vw, 13px)', 
                    height: 'clamp(34px, 9vw, 38px)' 
                  }}
                >
                  <span className="truncate">
                    {mappedCategories.length === 0 
                      ? "Select Tracking Categories ▼" 
                      : `${mappedCategories.length} Categories, ${mappedSubCategories.length} Selected`}
                  </span>
                  <span className="text-neutral-400 text-[10px] shrink-0">
                    {isDropdownOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* Dropdown Menu Overlay / Popover */}
                {isDropdownOpen && (
                  <div 
                    id="category-selection-menu"
                    className="absolute z-[250] left-0 right-0 mt-1 max-h-[220px] overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-xl p-3 flex flex-col gap-2.5 sm:max-h-[250px] md:max-h-[300px]"
                    style={{
                      fontFamily: "'Google Sans', sans-serif"
                    }}
                  >
                    {effectiveCategories.map((cat, idx) => {
                      const isCatSelected = mappedCategories.includes(cat.name);
                      const isCatExpanded = expandedCats.includes(cat.name);
                      const catSubcategories = cat.subcategories || [];

                      return (
                        <div key={`daily-log-cat-sel-${cat.name || 'node'}-${idx}`} className="flex flex-col gap-1">
                          {/* Parent Category Row */}
                          <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-neutral-100 bg-white hover:bg-neutral-50 transition-colors">
                            <label className="flex items-center gap-2 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isCatSelected}
                                onChange={() => handleToggleCategory(cat.name)}
                                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 accent-slate-900 cursor-pointer"
                              />
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif",
                                  fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
                                  fontWeight: 500
                                }}
                                className="text-slate-800"
                              >
                                {cat.name}
                              </span>
                            </label>
                            
                            {catSubcategories.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedCats(prev => 
                                    prev.includes(cat.name) 
                                      ? prev.filter(c => c !== cat.name) 
                                      : [...prev, cat.name]
                                  );
                                }}
                                className="text-neutral-400 hover:text-black transition-colors px-2 py-0.5 text-xs select-none cursor-pointer"
                              >
                                {isCatExpanded ? '▲' : '▼'}
                              </button>
                            )}
                          </div>

                          {/* Nested Sub-Categories */}
                          {isCatExpanded && catSubcategories.length > 0 && (
                            <div className="flex flex-col gap-1 ml-6 pl-2 border-l-2 border-neutral-100">
                              {catSubcategories.map((sub: string, subIdx: number) => {
                                const isSubSelected = mappedSubCategories.includes(sub);
                                return (
                                  <label 
                                    key={`sub-cat-${cat.name}-${sub}-${subIdx}`}
                                    className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-neutral-50 cursor-pointer text-left"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSubSelected}
                                      onChange={() => handleToggleSubCategory(sub, cat.name)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-neutral-600 focus:ring-neutral-400 accent-neutral-600 cursor-pointer"
                                    />
                                    <span 
                                      style={{ 
                                        fontFamily: "'Google Sans', sans-serif",
                                        fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
                                        fontWeight: 400
                                      }}
                                      className="text-neutral-600"
                                    >
                                      {sub}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Space-optimized grid for Max Amount and Currency */}
              <div className="grid grid-cols-2" style={{ gap: 'clamp(10px, 2.8vw, 14px)' }}>
                {/* Max Amount */}
                <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                  <label className="px-1 leading-none text-slate-500 font-normal"
                         style={{ 
                           fontFamily: "'Google Sans', sans-serif", 
                           fontSize: 'clamp(9px, 2.5vw, 11px)' 
                         }}>
                    Max Amount
                  </label>
                  <input 
                    type="text"
                    value={maxBudget} 
                    onChange={e => setMaxBudget(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                    onBlur={() => setMaxBudget(prev => evaluateMathExpression(prev))}
                    placeholder="0 or e.g., 7000*6"
                    className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2.5 text-black outline-none transition-all placeholder:text-[#57606F]/40 font-mono"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400, 
                      fontSize: 'clamp(11px, 2.8vw, 13px)', 
                      height: 'clamp(34px, 9vw, 38px)' 
                    }}
                  />
                </div>

                {/* Currency */}
                <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                  <label className="px-1 leading-none text-slate-500 font-normal"
                         style={{ 
                           fontFamily: "'Google Sans', sans-serif", 
                           fontSize: 'clamp(9px, 2.5vw, 11px)' 
                         }}>
                    Currency
                  </label>
                  <select 
                    value={currency} 
                    onChange={e => setCurrency(e.target.value)}
                    className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black outline-none transition-all placeholder:text-[#57606F]/40 cursor-pointer"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400, 
                      fontSize: 'clamp(11px, 2.8vw, 13px)', 
                      height: 'clamp(34px, 9vw, 38px)' 
                    }}
                  >
                    <option value="AED" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>AED</option>
                    <option value="USD" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>USD</option>
                    <option value="EUR" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>EUR</option>
                    <option value="GBP" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>GBP</option>
                  </select>
                </div>
              </div>

              {/* Budget Period */}
              <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                <label className="px-1 leading-none text-slate-500 font-normal"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontSize: 'clamp(9px, 2.5vw, 11px)' 
                       }}>
                  Budget Period
                </label>
                <select 
                  value={period} 
                  onChange={e => setPeriod(e.target.value as any)}
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black outline-none transition-all placeholder:text-[#57606F]/40 cursor-pointer"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400, 
                    fontSize: 'clamp(11px, 2.8vw, 13px)', 
                    height: 'clamp(34px, 9vw, 38px)' 
                  }}
                >
                  <option value="daily" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Daily</option>
                  <option value="weekly" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Weekly</option>
                  <option value="monthly" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Monthly</option>
                </select>
              </div>

              {/* Main Submit Action Button */}
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-[38px] md:h-[42px] bg-[#A6DDB1] rounded-lg text-slate-900 active:scale-95 transition-all disabled:opacity-50 mt-4 flex items-center justify-center cursor-pointer shadow-lg shadow-[#A6DDB1]/20 font-bold"
                style={{
                  fontFamily: "'Google Sans', sans-serif",
                  fontSize: 'clamp(11px, 2.8vw, 13px)'
                }}
              >
                {editingBudget ? 'Update Protocol' : 'Establish Budget'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export const QuickTransactionModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess?: () => void;
  budget: BudgetCategory; 
  accounts: any[]; 
  profile: any;
  effectiveCategories: any[];
}> = ({ isOpen, onClose, onSuccess, budget, accounts, profile, effectiveCategories }) => {
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 1. Get the list of allowed categories
  const allowedCategories = React.useMemo(() => {
    return budget.mappedCategories && budget.mappedCategories.length > 0
      ? budget.mappedCategories
      : (budget.category ? [budget.category] : []);
  }, [budget]);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');

  // 2. Initial state sync
  useEffect(() => {
    if (allowedCategories.length > 0) {
      setSelectedCategory(allowedCategories[0]);
    } else {
      setSelectedCategory('');
    }
  }, [allowedCategories]);

  // 3. Keep subcategories in sync with selectedCategory
  const allowedSubcategories = React.useMemo(() => {
    if (!selectedCategory) return [];
    
    // Find category definition in effectiveCategories to get all its subcategories
    const catDef = effectiveCategories.find(c => c.name === selectedCategory);
    const allSubs = catDef ? (catDef.subcategories || []) : [];
    
    // Filter if budget has specific mappedSubCategories
    if (budget.mappedSubCategories && budget.mappedSubCategories.length > 0) {
      return allSubs.filter((sub: string) => budget.mappedSubCategories?.includes(sub));
    }
    
    // If budget has a single specific subcategory that isn't 'All'
    if (budget.subcategory && budget.subcategory !== 'All') {
      return allSubs.filter((sub: string) => sub === budget.subcategory);
    }
    
    // Otherwise, allow all subcategories for this category
    return allSubs;
  }, [selectedCategory, budget, effectiveCategories]);

  useEffect(() => {
    if (allowedSubcategories.length > 0) {
      setSelectedSubcategory(allowedSubcategories[0]);
    } else {
      setSelectedSubcategory('');
    }
  }, [allowedSubcategories]);

  // Filter accounts by currency
  const filteredAccounts = accounts.filter(a => a.currency === budget.currency && !a.isArchived);

  useEffect(() => {
    if (filteredAccounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(filteredAccounts[0].id);
    }
  }, [filteredAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !sourceAccountId || !amount) return;
    setIsLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
        const accountRef = doc(db, `users/${profile.uid}/accounts`, sourceAccountId);
        const budgetRef = doc(db, `users/${profile.uid}/miniBudgets`, budget.id);

        // --- READS ---
        const accountSnap = await transaction.get(accountRef);
        if (!accountSnap.exists()) throw new Error("Account does not exist");
        const accountData = accountSnap.data();

        const budgetSnap = await transaction.get(budgetRef);

        // --- WRITES ---
        const txAmount = parseFloat(evaluateMathExpression(amount));
        const newBalance = accountData.currentBalance - txAmount;
        
        transaction.set(txRef, {
          id: txRef.id,
          userId: profile.uid,
          accountId: sourceAccountId,
          amount: txAmount,
          type: 'expense',
          category: selectedCategory,
          subcategory: selectedSubcategory || null,
          notes: note || `Budget: ${budget.title}`,
          emoji: budget.emoji,
          date: new Date().toLocaleDateString('en-CA'),
          budgetId: budget.id,
          createdAt: serverTimestamp()
        });
        
        transaction.update(accountRef, {
          currentBalance: newBalance,
          updatedAt: serverTimestamp()
        });

        if (budgetSnap.exists()) {
            // (Removed spentAmount update: relying on ledger re-calculation)
        }
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/transactions`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-white" />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-[420px] bg-vantage-card border-[1.5px] border-[#E1E8ED] rounded-[1.25rem] p-4 sm:p-6 md:p-7 shadow-2xl">
          <div className="flex flex-col items-center gap-0.5 mb-4 sm:mb-5">
            <h4 className="font-black text-black leading-none"
                style={{ fontSize: 'clamp(18px, 5vw, 22px)' }}>
              Submit Transaction
            </h4>
            <p className="text-emerald-700 font-black mt-1"
               style={{ fontSize: 'clamp(9px, 2vw, 11px)' }}>
              {budget.title} Control
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5">
              <label className="font-black text-[#57606F] uppercase tracking-widest px-1 leading-none"
                     style={{ fontSize: 'clamp(9px, 2vw, 10.5px)' }}>
                Source Account ({budget.currency})
              </label>
              <select 
                value={sourceAccountId} 
                onChange={e => setSourceAccountId(e.target.value)}
                className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black font-black focus:border-vantage-green outline-none transition-all h-[36px] max-h-[36px] md:h-[40px] md:max-h-[40px] text-[13px] md:text-[14px] uppercase"
              >
                {filteredAccounts.map((acc, idx) => (
                  <option key={`account-opt-selection-${acc.id || idx}-${idx}`} value={acc.id} className="bg-white">{acc.name}</option>
                ))}
                {filteredAccounts.length === 0 && <option disabled>No {budget.currency} accounts found</option>}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-[#57606F] uppercase tracking-widest px-1 leading-none"
                     style={{ fontSize: 'clamp(9px, 2vw, 10.5px)' }}>
                Category
              </label>
              <select 
                value={selectedCategory} 
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black font-black focus:border-vantage-green outline-none transition-all h-[36px] max-h-[36px] md:h-[40px] md:max-h-[40px] text-[13px] md:text-[14px]"
              >
                {allowedCategories.map((cat, idx) => (
                  <option key={`tx-cat-opt-${cat}-${idx}`} value={cat} className="bg-white">{formatLabel(cat)}</option>
                ))}
                {allowedCategories.length === 0 && <option disabled>No categories assigned</option>}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-[#57606F] uppercase tracking-widest px-1 leading-none"
                     style={{ fontSize: 'clamp(9px, 2vw, 10.5px)' }}>
                Sub-category
              </label>
              <select 
                value={selectedSubcategory} 
                onChange={e => setSelectedSubcategory(e.target.value)}
                className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black font-black focus:border-vantage-green outline-none transition-all h-[36px] max-h-[36px] md:h-[40px] md:max-h-[40px] text-[13px] md:text-[14px]"
              >
                {allowedSubcategories.map((sub, idx) => (
                  <option key={`tx-sub-opt-${sub}-${idx}`} value={sub} className="bg-white">{formatLabel(sub)}</option>
                ))}
                {allowedSubcategories.length === 0 && <option value="">None</option>}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-[#57606F] uppercase tracking-widest px-1 leading-none"
                     style={{ fontSize: 'clamp(9px, 2vw, 10.5px)' }}>
                Interaction Amount
              </label>
              <div className="relative">
                <input 
                  type="text"
                  value={amount} 
                  onChange={e => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                  onBlur={() => setAmount(prev => evaluateMathExpression(prev))}
                  placeholder="0 or e.g., 7000*6"
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg pl-3 pr-12 font-mono text-black focus:border-vantage-green outline-none transition-all h-[36px] max-h-[36px] md:h-[40px] md:max-h-[40px] text-[14px] md:text-[15px]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 font-black uppercase pointer-events-none"
                      style={{ fontSize: 'clamp(10px, 2.5vw, 12px)' }}>
                  {budget.currency}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-black text-[#57606F] uppercase tracking-widest px-1 leading-none"
                     style={{ fontSize: 'clamp(9px, 2vw, 10.5px)' }}>
                Interaction Note
              </label>
              <input 
                value={note} 
                onChange={e => setNote(e.target.value)}
                placeholder="Details of the interaction..."
                className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-3 text-black font-black focus:border-vantage-green outline-none transition-all placeholder:text-[#57606F]/30 uppercase h-[36px] max-h-[36px] md:h-[40px] md:max-h-[40px] text-[13px] md:text-[14px]"
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading || filteredAccounts.length === 0}
              className="w-full h-[36px] md:h-[40px] bg-vantage-green rounded-lg text-white font-black uppercase tracking-[0.25em] text-[12px] sm:text-[13px] shadow-lg shadow-vantage-green/20 active:scale-95 transition-all disabled:opacity-50 mt-4 flex items-center justify-center cursor-pointer"
            >
              Commit Entry
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export const MilestoneConfigModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  editingMilestone: any | null;
  accounts: any[];
  allTransactions: any[];
  exchangeRates: any;
}> = ({ isOpen, onClose, profile, editingMilestone, accounts, allTransactions, exchangeRates }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [monthsToTarget, setMonthsToTarget] = useState(12);
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const uniqueAccounts = React.useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    accounts.forEach((acc: any) => {
      if (acc && acc.id && !seen.has(acc.id)) {
        seen.add(acc.id);
        list.push(acc);
      }
    });
    return list;
  }, [accounts]);

  // Filter cash, bank & savings accounts
  const savingsAccounts = uniqueAccounts.filter(acc => 
    !acc.isArchived && 
    (acc.type === 'bank' || acc.type === 'Bank' || acc.type === 'cash' || acc.type === 'Cash' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Cash')
  );

  useEffect(() => {
    if (isOpen) {
      if (editingMilestone) {
        setName(editingMilestone.name || '');
        setTargetAmount(editingMilestone.targetAmount?.toString() || '');
        setMonthsToTarget(editingMilestone.monthsToTarget || 12);
        setLinkedAccountIds(editingMilestone.linkedAccountIds || []);
      } else {
        setName('');
        setTargetAmount('');
        setMonthsToTarget(12);
        // Default to linking all eligible cash/bank/savings accounts
        setLinkedAccountIds(savingsAccounts.map(a => a.id));
      }
    }
  }, [editingMilestone, isOpen, accounts]);

  const activeBaseCurr = profile?.baseCurrency || profile?.currency || 'AED';

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(uniqueAccounts, allTransactions);
  }, [uniqueAccounts, allTransactions]);

  const linkedBalancesSum = React.useMemo(() => {
    const linkedAccs = uniqueAccounts.filter(acc => linkedAccountIds.includes(acc.id));
    return linkedAccs.reduce((sum, acc) => {
      const currentBalance = accountBalances[acc.id] || 0;
      const rate = (exchangeRates && exchangeRates[acc.currency]) || 1;
      const baseRateToAED = (exchangeRates && exchangeRates[activeBaseCurr]) || 1;
      const translated = (currentBalance * rate) / baseRateToAED;
      return sum + translated;
    }, 0);
  }, [uniqueAccounts, linkedAccountIds, accountBalances, exchangeRates, activeBaseCurr]);

  const parsedTarget = parseFloat(evaluateMathExpression(targetAmount)) || 0;
  const recommendedVal = Math.max(0, (parsedTarget - linkedBalancesSum) / Math.max(1, monthsToTarget));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !name || !targetAmount) return;
    setIsLoading(true);

    try {
      const milestoneRef = editingMilestone
        ? doc(db, `users/${profile.uid}/milestones`, editingMilestone.id)
        : doc(collection(db, `users/${profile.uid}/milestones`));

      await setDoc(milestoneRef, {
        id: milestoneRef.id,
        name,
        targetAmount: parseFloat(evaluateMathExpression(targetAmount)),
        monthsToTarget: parseInt(monthsToTarget.toString()) || 12,
        linkedAccountIds,
        createdAt: editingMilestone?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      window.dispatchEvent(new CustomEvent('route-essentials-subtab', { detail: { subtab: 'savings' } }));
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/milestones`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAccount = (id: string) => {
    setLinkedAccountIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-white" />
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-[375px] bg-white border border-[#E1E8ED] rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex flex-col items-center gap-1.5 p-6 pb-2 flex-shrink-0">
              <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-gray-900 tracking-tight text-center leading-tight text-lg">
                {editingMilestone ? t('essentials.refilling_milestone_goal', 'Refilling Milestone Goal') : t('essentials.configure_milestone_goal', 'Configure Milestone Goal')}
              </h4>
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-gray-400 tracking-[0.2em] text-[10px]">
                {t('essentials.savings_target_setup', 'Savings Target Setup')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6 overflow-y-auto p-6 pt-2">

              {/* Goal name */}
              <div className="space-y-2">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500 tracking-widest px-1 block">
                  {t('essentials.goal_name_label', 'Goal Name / Label')}
                </label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('essentials.goal_name_placeholder', 'E.g., Buying a car, emergency shield')}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                  className="w-full bg-[#f1f5f9] border-none rounded-[0.5rem] px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#A6DDB1] outline-none transition-all text-xs"
                />
              </div>

              {/* Selection categories / accounts linked */}
              <div className="space-y-2">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500 tracking-widest px-1 block leading-relaxed">
                  {t('essentials.select_ledger_sources', 'Select Quantum Ledger Sources (Cash, Bank & Savings)')}
                </label>
                <div className="max-h-[140px] overflow-y-auto border border-gray-100 rounded-[0.5rem] p-2 space-y-1.5 bg-[#f1f5f9]/50">
                  {savingsAccounts.length === 0 ? (
                    <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-400 uppercase tracking-wider text-center py-4">No active accounts to link</div>
                  ) : (
                    savingsAccounts.map((acc, idx) => {
                      const isChecked = linkedAccountIds.includes(acc.id);
                      const balanceVal = accountBalances[acc.id] || 0;
                      return (
                        <div 
                          key={`ms-cfg-acc-${acc.id}-${idx}`} 
                          onClick={() => handleToggleAccount(acc.id)}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100/80 cursor-pointer select-none transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // Controlled by element onClick
                              style={{ accentColor: '#A6DDB1' }}
                              className="w-5 h-5 rounded border-none text-brand focus:ring-brand"
                            />
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[11px] text-gray-700">
                              {acc.name}
                            </span>
                          </div>
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }} className="text-[11px] text-gray-500">
                            {acc.currency} {balanceVal < 0 ? '-' : ''}{Math.abs(balanceVal).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Target amount */}
              <div className="space-y-2">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500 tracking-widest px-1 block">
                  {t('essentials.target_amount', 'Target Amount')}
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    placeholder={t('essentials.target_amount_placeholder', '0 or e.g., 7000*6')}
                    value={targetAmount}
                    onChange={e => setTargetAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                    onBlur={() => setTargetAmount(prev => evaluateMathExpression(prev))}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                    className="w-full bg-[#f1f5f9] border-none rounded-[0.5rem] py-3 px-4 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#A6DDB1] outline-none transition-all text-xs"
                  />
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] tracking-widest pointer-events-none">
                    {activeBaseCurr}
                  </span>
                </div>
              </div>

              {/* Slider target months */}
              <section className="mb-8" data-purpose="deadline-section">
                <div className="flex justify-between items-center mb-4">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500 tracking-widest">
                    {t('essentials.deadline_months_remaining', 'Deadline (Months Remaining)')}
                  </label>
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-xs text-gray-900">{monthsToTarget} {t('essentials.months', 'Months')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="range"
                    min="1"
                    max="60"
                    value={monthsToTarget}
                    onChange={e => setMonthsToTarget(parseInt(e.target.value))}
                    style={{ accentColor: '#A6DDB1' }}
                    className="w-full h-2 bg-[#f1f5f9] rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="bg-[#f1f5f9] px-4 py-2 rounded-[0.5rem] text-[10px] font-bold text-gray-700 w-12 text-center">
                    {monthsToTarget}
                  </div>
                </div>
              </section>

              {/* Recommendation indicator card */}
              <section className="bg-[#f1f5f9]/80 rounded-[0.5rem] p-4 border border-[#e2e8f0]" data-purpose="allocation-card">
                <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500 mb-2">
                  {t('essentials.vantage_recommended_allocation', 'Vantage Recommended Allocation:')}
                </h3>
                <div className="flex justify-between items-baseline mt-1 block">
                  {parsedTarget <= linkedBalancesSum ? (
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, color: '#366945' }} className="text-xs">
                      {t('essentials.pooled_funding_status', 'Pooled Funding Status: {{percentage}}% Secured', { percentage: parsedTarget > 0 ? Math.round((linkedBalancesSum / parsedTarget) * 100) : 100 })}
                    </span>
                  ) : (
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex items-baseline gap-1">
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-gray-900 text-sm leading-none">
                          {activeBaseCurr} {recommendedVal < 0 ? '-' : ''}{Math.abs(recommendedVal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[10px] text-gray-500">
                          {t('essentials.per_month', 'per month')}
                        </span>
                      </div>
                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, color: '#366945' }} className="text-[10px] mt-1 block">
                        {t('essentials.pooled_funding_status', 'Pooled Funding Status: {{percentage}}% Secured', { percentage: parsedTarget > 0 ? Math.round((linkedBalancesSum / parsedTarget) * 100) : 0 })}
                      </span>
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[9px] text-gray-400 mt-2 block">
                  {t('essentials.based_on_currently_linked', 'Based on {{currency}} {{amount}} currently linked', { currency: activeBaseCurr, amount: Math.abs(linkedBalancesSum).toLocaleString('en-US', { maximumFractionDigits: 0 }) })}
                </span>
              </section>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={onClose}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="flex-1 h-[42px] bg-gray-100 hover:bg-gray-200 rounded-[0.5rem] text-gray-900 text-[10px] transition-all cursor-pointer border-none"
                >
                  {t('essentials.cancel', 'Cancel')}
                </button>
                <button 
                  type="submit" 
                  disabled={isLoading || !name || !targetAmount || linkedAccountIds.length === 0}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="flex-1 h-[42px] bg-[#A6DDB1] text-gray-900 rounded-[0.5rem] text-[10px] shadow-sm transition-all disabled:opacity-50 cursor-pointer border-none"
                >
                  {isLoading ? t('essentials.saving', 'Saving...') : t('essentials.save_updates', 'Save Updates')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

