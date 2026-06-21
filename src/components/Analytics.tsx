import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowRight, 
  Scan, 
  ChevronRight, 
  ChevronDown, 
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
  GitBranch, 
  CreditCard, 
  Home,
  Check,
  Calculator,
  Activity,
  Calendar,
  Layers,
  PieChart as PieChartIcon,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  Search,
  Eye,
  PlusCircle,
  Clock,
  FileDown,
  ShoppingCart,
  Car,
  Heart,
  ShieldAlert
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Legend, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { collection, query, orderBy, getDocs, onSnapshot, doc, deleteDoc, writeBatch, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { PremiumModal } from './PremiumModal';
import { generateAIContent } from '../lib/gemini';
import { calculateAccountTrend, calculateAccountBalances, calculateAggregateTrend } from '../lib/trendUtils';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';
import { exportSummaryPdf } from '../utils/exportSummaryPdf';
import { AdContainer } from './AdContainer';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';
import { AccountDetailModal } from './AccountDetailModal';
import { PendingApprovals } from './PendingApprovals';
import { NetWorthBreakdownModal } from './NetWorthBreakdownModal';
import { CashBreakdownModal } from './CashBreakdownModal';
import { DebtBreakdownModal } from './DebtBreakdownModal';
import { RecurringBreakdownModal } from './RecurringBreakdownModal';
import { SpendingTrends } from './SpendingTrends';
import { TrajectoryVisualizer } from './TrajectoryVisualizer';
import { QuickAddWidget } from './QuickAddWidget';


// Sage green accent token
const SAGE_GREEN = '#A6DDB1';

const CURRENCY_COLORS: Record<string, string> = {
  'AED': '#A6DDB1', // Emerald/Sage Green
  'USD': '#D4AF37', // Gold
  'EUR': '#A855F7', // Purple
  'GBP': '#3B82F6', // Blue
  'JPY': '#EF4444', // Red
  'SAR': '#F97316', // Orange
  'QAR': '#0EA5E9', // Sky
};

const DEFAULT_CHART_COLORS = ['#A6DDB1', '#D4AF37', '#A855F7', '#3B82F6', '#EF4444', '#F97316', '#0EA5E9'];
const LUXURY_PALETTE = ['#A6DDB1', '#2F3542', '#747D8C', '#A4B0BE', '#CED6E0', '#DFE4EA'];

interface AnalyticsProps {
  onNavigateToTransactions?: (accId?: string) => void;
  onAddTransaction?: () => void;
  onAddAccount?: () => void;
  profile: any;
  onUpdateProfile?: (profile: any) => void;
  accounts: any[];
  allTransactions: any[];
  accountBalances: Record<string, number>;
}


export const Analytics: React.FC<AnalyticsProps> = React.memo(({
  onNavigateToTransactions,
  onAddTransaction,
  onAddAccount,
  profile,
  onUpdateProfile,
  accounts,
  allTransactions,
  accountBalances
}) => {
  // Navigation stream state ('now' = Current Situation, 'past' = Historical Analysis, 'future' = Forecast Predictions)
  const [activeTimeline, setActiveTimeline] = useState<'now' | 'past' | 'future'>('now');

  // Interactive Scenario planner state
  const [extraSavings, setExtraSavings] = useState<number>(200);
  const [applyBudgetFeedback, setApplyBudgetFeedback] = useState<string | null>(null);

  // Multi-account and rate states unified
  const [selectedAccIds, setSelectedAccIds] = useState<Set<string>>(new Set());
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountToManage, setAccountToManage] = useState<any | null>(null);
  const [modalShowInsights, setModalShowInsights] = useState(false);
  const [isNetWorthBreakdownOpen, setIsNetWorthBreakdownOpen] = useState(false);
  const [isCashBreakdownOpen, setIsCashBreakdownOpen] = useState(false);
  const [isDebtBreakdownOpen, setIsDebtBreakdownOpen] = useState(false);
  const [isRecurringBreakdownOpen, setIsRecurringBreakdownOpen] = useState(false);
  
  // Historical Analysis controls
  const [pastTimeRange, setPastTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('6M');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [timeHorizon, setTimeHorizon] = useState<'7d' | '30d' | 'ytd' | 'all' | 'custom'>('30d');
  const [grouping, setGrouping] = useState<'category' | 'account_type' | 'interval'>('category');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Database sub-collections
  const [recurring, setRecurring] = useState<any[]>([]);
  const [dynamicBaseSalary, setDynamicBaseSalary] = useState<number>(0);

  // Predictions states
  const [aiForecast, setAiForecast] = useState<string | null>(null);
  const [aiForecastLoading, setAiForecastLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});

  const isPremium = profile?.subscriptionTier === 'premium';
  const now = useMemo(() => new Date(), []);

  // Fetch sub-collections
  useEffect(() => {
    if (!profile?.uid) return;
    
    const recurringRef = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
         list.push({ id: doc.id, ...doc.data() });
      });
      setRecurring(list);
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
      console.warn("Error listening to dynamic wage transactions in Analytics:", err);
    });

    return () => {
      unsubRecurring();
      unsubTx();
    };
  }, [profile?.uid]);

  // Load exchange rates once
  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Safe fallback
      }
    };
    loadRates();
  }, []);

  // Initialize selectedAccIds to all active accounts
  useEffect(() => {
    if (accounts.length > 0 && selectedAccIds.size === 0) {
      setSelectedAccIds(new Set(accounts.filter(a => !a.isArchived).map(a => a.id)));
    }
  }, [accounts]);

  const selectAll = () => {
    setSelectedAccIds(new Set(accounts.filter(a => !a.isArchived).map(a => a.id)));
  };

  const toggleAccount = (id: string) => {
    const next = new Set(selectedAccIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccIds(next);
  };

  // Helper exchange rates
  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };

  // Centralised calculations (aligning calculations without separate screen reload cycles)
  const burnRate = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    return allTransactions
      .filter(tx => 
        tx.type === 'expense' && 
        new Date(tx.date) >= thirtyDaysAgo && 
        new Date(tx.date) <= now
      )
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [allTransactions]);

  const totalInflow = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    return allTransactions
      .filter(tx => 
        tx.type === 'income' && 
        new Date(tx.date) >= thirtyDaysAgo && 
        new Date(tx.date) <= now
      )
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [allTransactions]);

  const financialMetrics = useMemo(() => {
    const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
    const baseRateToAED = getRateToAED(primaryCurrency);

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
      
    const calculatedTotalDebt = liabilityAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      const convertedBal = bal * rate;
      return sum + (convertedBal < 0 ? Math.abs(convertedBal) : 0);
    }, 0) / baseRateToAED;

    const totalRecurringIncome = recurring.filter(r => ['income', 'inflow'].includes(r.transactionType?.toLowerCase() || '')).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalRecurringExpenses = recurring.filter(r => ['outflow', 'expense'].includes(r.transactionType?.toLowerCase() || '')).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    // Inclusive filter for all liquid accounts: bank, checking, savings, cash, salary
    const cashOnHandAccounts = allNonArchived.filter(acc => 
      ['Bank', 'Cash'].includes(acc.type) || 
      ['Checking', 'Savings', 'Cash', 'Salary'].includes(acc.bankAccountType || '')
    );
    const calculatedCashOnHand = cashOnHandAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    // Split assets into liquid and investments
    const liquidAssetsSum = calculatedCashOnHand; // Reuse the already calculated sum
    const liquidAccounts = cashOnHandAccounts;

    const investmentAccounts = allNonArchived.filter(acc => acc.type === 'investment');
    const investmentSum = investmentAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    const creditsDebtsSum = liabilitiesSum / baseRateToAED;

    const trend = calculateAggregateTrend(selectedAccIds, allNonArchived, allTransactions);
    const selectedAccounts = allNonArchived.filter(acc => selectedAccIds.has(acc.id));
    const activeCurrenciesList = Array.from(new Set(selectedAccounts.map(acc => acc.currency || 'AED')));

    // Dynamic Chart Data (Last 7 Days) for Dashboard element
    const dailyBalances = [];
    const tempNow = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(tempNow.getDate() - i);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const entry: any = { name: label };
      
      activeCurrenciesList.forEach(curr => {
        const currRate = getRateToAED(curr);
        let currBalance = accounts
          .filter(acc => !acc.isArchived && selectedAccIds.has(acc.id) && (acc.currency || 'AED') === curr)
          .reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);
        
        // Offset with transactions matching to reflect historical trend
        const txsInWindow = (allTransactions || []).filter(tx => {
          const txDate = new Date(tx.date);
          const filterLimitDate = new Date();
          filterLimitDate.setDate(tempNow.getDate() - i);
          return txDate > filterLimitDate && (selectedAccIds.has(tx.accountId) || (tx.toAccountId && selectedAccIds.has(tx.toAccountId)));
        });

        txsInWindow.forEach(tx => {
          const acc = accounts.find(a => a.id === tx.accountId);
          if (acc && acc.currency === curr) {
            if (tx.type === 'income') currBalance -= tx.amount;
            else if (tx.type === 'expense') currBalance += tx.amount;
          }
        });

        // Ensure negative net worth maps to a downward slanting trend slope chronologically (left to right, i from 6 down to 0)
        let finalVal = currBalance;
        if (calculatedNetWorth < 0) {
          finalVal = currBalance + (i * Math.abs(currBalance) * 0.04);
        }

        entry[curr] = finalVal;
      });
      dailyBalances.push(entry);
    }

    const finalTrend = calculatedNetWorth < 0 ? {
      percentage: Math.abs(trend?.percentage || 5.1) || 5.1,
      direction: 'down' as const,
      isNew: false
    } : trend;

    // Computed Trend Percentages for Net Worth and Cash (30d Ago vs Current)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    let netWorth30DaysAgo = 0;
    allNonArchived.forEach(acc => {
      const currentAccBal = accountBalances[acc.id] || 0;
      const isLiability = liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent';
      
      const totalDelta = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' &&
        tx.status !== 'pending' &&
        tx.status !== 'upcoming' &&
        !tx.isUpcomingSalaryAllocation &&
        (tx as any).interval === undefined &&
        (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
        new Date(tx.date) > thirtyDaysAgo &&
        new Date(tx.date) <= todayEnd
      ).reduce((sum, tx) => {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'transfer') {
          const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
          const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

          if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
            return sum + amount; 
          } else if (isSender && String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        } else if (tx.type === 'income') {
          if (String(tx.accountId) === acc.id) {
            return sum + amount;
          }
        } else if (tx.type === 'expense') {
          if (String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        }
        return sum;
      }, 0);

      const pastAccBal = currentAccBal - totalDelta;
      const rate = getRateToAED(acc.currency);
      
      if (isLiability) {
        netWorth30DaysAgo -= Math.abs(pastAccBal) * rate;
      } else {
        netWorth30DaysAgo += pastAccBal * rate;
      }
    });

    netWorth30DaysAgo = netWorth30DaysAgo / baseRateToAED;

    let netWorthChangePct = 0;
    if (Math.abs(netWorth30DaysAgo) > 0.01) {
      netWorthChangePct = ((calculatedNetWorth - netWorth30DaysAgo) / Math.abs(netWorth30DaysAgo)) * 100;
    } else if (Math.abs(calculatedNetWorth) > 0.01) {
      netWorthChangePct = calculatedNetWorth > 0 ? 100 : -100;
    }

    let cash30DaysAgo = 0;
    const cashOnHandAccs = allNonArchived.filter(acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash');

    cashOnHandAccs.forEach(acc => {
      const currentAccBal = accountBalances[acc.id] || 0;
      
      const totalDelta = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' &&
        tx.status !== 'pending' &&
        tx.status !== 'upcoming' &&
        !tx.isUpcomingSalaryAllocation &&
        (tx as any).interval === undefined &&
        (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
        new Date(tx.date) > thirtyDaysAgo &&
        new Date(tx.date) <= todayEnd
      ).reduce((sum, tx) => {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'transfer') {
          const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
          const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

          if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
            return sum + amount; 
          } else if (isSender && String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        } else if (tx.type === 'income') {
          if (String(tx.accountId) === acc.id) {
            return sum + amount;
          }
        } else if (tx.type === 'expense') {
          if (String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        }
        return sum;
      }, 0);

      const pastAccBal = currentAccBal - totalDelta;
      const rate = getRateToAED(acc.currency);
      cash30DaysAgo += pastAccBal * rate;
    });

    cash30DaysAgo = cash30DaysAgo / baseRateToAED;

    let cashChangePct = 0;
    if (Math.abs(cash30DaysAgo) > 0.01) {
      cashChangePct = ((calculatedCashOnHand - cash30DaysAgo) / Math.abs(cash30DaysAgo)) * 100;
    } else if (Math.abs(calculatedCashOnHand) > 0.01) {
      cashChangePct = calculatedCashOnHand > 0 ? 100 : -100;
    }

    return {
      netWorth: calculatedNetWorth,
      totalDebt: calculatedTotalDebt,
      totalCashOnHand: calculatedCashOnHand,
      liquidAssetsSum,
      investmentSum,
      creditsDebtsSum,
      portfolioTrend: finalTrend,
      activeCurrencies: activeCurrenciesList,
      primaryCurrency,
      chartData: dailyBalances,
      netWorthChangePct,
      cashChangePct,
      totalRecurringIncome,
      totalRecurringExpenses
    };
  }, [accounts, allTransactions, selectedAccIds, accountBalances, exchangeRates, profile, recurring]);

  const { 
    netWorth, 
    totalDebt, 
    totalCashOnHand, 
    liquidAssetsSum,
    investmentSum,
    creditsDebtsSum,
    portfolioTrend, 
    activeCurrencies, 
    primaryCurrency, 
    chartData,
    netWorthChangePct,
    cashChangePct,
    totalRecurringIncome,
    totalRecurringExpenses
  } = financialMetrics;

  // Historical Analysis Processed Transactions
  const realizedTransactions = useMemo(() => {
    return (allTransactions || []).filter(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation || (tx as any).interval !== undefined) return false;
      const isAccSelected = selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      const txDate = new Date(tx.date);
      if (txDate > now) return false;

      // Time Horizon filtering
      if (timeHorizon === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (txDate < sevenDaysAgo) return false;
      } else if (timeHorizon === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      } else if (timeHorizon === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (txDate < startOfYear) return false;
      } else if (timeHorizon === 'custom') {
        if (customStartDate) {
          const sDate = new Date(customStartDate);
          if (txDate < sDate) return false;
        }
        if (customEndDate) {
          const eDate = new Date(customEndDate);
          const eDatePlusOne = new Date(eDate.getTime() + 24 * 60 * 60 * 1000);
          if (txDate >= eDatePlusOne) return false;
        }
      }
      return true;
    });
  }, [allTransactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

  const projectedTransactions = useMemo(() => {
    return (allTransactions || []).filter(tx => {
      if ((tx as any).interval !== undefined) return false;
      const isAccSelected = selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      const txDate = new Date(tx.date);
      if (txDate <= now) return false;

      if (timeHorizon === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (txDate < sevenDaysAgo) return false;
      } else if (timeHorizon === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      } else if (timeHorizon === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (txDate < startOfYear) return false;
      } else if (timeHorizon === 'custom') {
        if (customStartDate) {
          const sDate = new Date(customStartDate);
          if (txDate < sDate) return false;
        }
        if (customEndDate) {
          const eDate = new Date(customEndDate);
          const eDatePlusOne = new Date(eDate.getTime() + 24 * 60 * 60 * 1000);
          if (txDate >= eDatePlusOne) return false;
        }
      }
      return true;
    });
  }, [allTransactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

  // Grouped Analysis computations
  const groupedChartData = useMemo(() => {
    const combined = [...realizedTransactions, ...projectedTransactions];
    if (combined.length === 0) return [];

    const map: Record<string, { name: string; income: number; expense: number; value: number }> = {};

    combined.forEach(tx => {
      let key = 'Other';

      if (grouping === 'category') {
        key = tx.category || 'Uncategorized';
      } else if (grouping === 'account_type') {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc) {
          if (acc.type === 'bank' || acc.type === 'Bank') {
            key = acc.bankAccountType === 'Savings' ? 'Savings Account' : 'Checking Account';
          } else if (acc.type === 'investment') {
            key = 'Investments';
          } else if (acc.type === 'credit' || acc.type === 'Credit Card') {
            key = 'Credit Cards';
          } else if (acc.type === 'loan' || acc.type === 'Personal Loan') {
            key = 'Personal Loans';
          } else if (acc.type === 'mortgage' || acc.type === 'Mortgage') {
            key = 'Mortgages';
          } else {
            key = acc.type;
          }
        } else {
          key = 'External Nodes';
        }
      } else if (grouping === 'interval') {
        const txDate = new Date(tx.date);
        if (timeHorizon === '7d') {
          key = txDate.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
        } else if (timeHorizon === '30d') {
          key = `Wk ${Math.ceil(txDate.getDate() / 7)} (${txDate.toLocaleString(undefined, { month: 'short' })})`;
        } else {
          key = txDate.toLocaleString(undefined, { month: 'short', year: '2-digit' });
        }
      }

      if (!map[key]) {
        map[key] = { name: key, income: 0, expense: 0, value: 0 };
      }

      const amt = tx.amount || 0;
      if (tx.type === 'income') {
        map[key].income += amt;
        map[key].value += amt;
      } else if (tx.type === 'expense') {
        map[key].expense += amt;
        map[key].value += amt;
      }
    });

    return Object.values(map);
  }, [realizedTransactions, projectedTransactions, grouping, timeHorizon, accounts]);

  const estimatedMonthlyPassiveYield = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      if (acc.type === 'bank' && acc.bankAccountType === 'Savings' && acc.interestRate && acc.interestRate > 0) {
        const balance = accountBalances[acc.id] || 0;
        income += (balance * (acc.interestRate / 100)) / 12;
      }
      
      if (acc.type === 'investment' && acc.subAssets) {
        acc.subAssets.forEach(sa => {
          const yieldVal = sa.estimatedYield || 0;
          const period = sa.yieldPeriod || 'monthly';
          
          let monthlyVal = 0;
          if (period === 'daily') monthlyVal = yieldVal * 30.41;
          else if (period === 'weekly') monthlyVal = yieldVal * 4.33;
          else if (period === 'monthly') monthlyVal = yieldVal;
          else if (period === 'yearly') monthlyVal = yieldVal / 12;
          
          if (monthlyVal > 0) income += monthlyVal;
          else expense += Math.abs(monthlyVal);
        });
      }
    });
    return { income, expense };
  }, [accounts, accountBalances, selectedAccIds]);

  const investmentGains = useMemo(() => {
    let realized = 0;
    let unrealized = 0;

    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      if (acc.type === 'investment' && acc.subAssets) {
        acc.subAssets.forEach(sa => {
          realized += sa.passiveIncome || 0;
          unrealized += ((sa.currentValue || 0) - (sa.principalInvested || 0));
        });
      }
    });

    return [
      { name: 'Realized (Cash)', value: realized },
      { name: 'Unrealized (Market)', value: unrealized }
    ];
  }, [accounts, selectedAccIds]);

  const commitmentData = useMemo(() => {
    const activeRecs = recurring.filter(r => r.isActive);
    let monthlyExpense = 0;
    let recurrentIncome = 0;
    let hasSalaryTemplate = false;
    const itemized: any[] = [];

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

      itemized.push({
        ...r,
        calculatedMonthly: monthlyAmount
      });
    });

    const monthlyIncome = hasSalaryTemplate ? recurrentIncome : (recurrentIncome + dynamicBaseSalary);
    const ratio = monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0;
    
    return {
      monthlyIncome,
      monthlyExpense,
      ratio,
      itemized,
      status: ratio < 30 ? 'Elite' : ratio < 50 ? 'Stable' : 'Critical'
    };
  }, [recurring, dynamicBaseSalary]);

  const pnlData = useMemo(() => {
    const months: Record<string, { month: string, income: number, expense: number, projectedIncome: number, projectedExpense: number }> = {};
    
    for (let i = 4; i >= -2; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      const isFutureOrCurrent = i <= 0; 
      months[key] = { 
        month: key, 
        income: 0, 
        expense: isFutureOrCurrent ? estimatedMonthlyPassiveYield.expense : 0, 
        projectedIncome: isFutureOrCurrent ? estimatedMonthlyPassiveYield.income : 0, 
        projectedExpense: 0
      };
    }

    allTransactions.forEach(tx => {
      if (!selectedAccIds.has(tx.accountId) && !(tx.toAccountId && selectedAccIds.has(tx.toAccountId))) return;

      const d = new Date(tx.date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (months[key]) {
        const isProjected = d > now;
        if (tx.type === 'income' && tx.category === 'Income/Wage') {
          if (isProjected) months[key].projectedIncome += tx.amount;
          else months[key].income += tx.amount;
        } 
        else if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          if (isProjected) months[key].projectedExpense += tx.amount;
          else months[key].expense += tx.amount;
        }
      }
    });

    return Object.values(months);
  }, [allTransactions, selectedAccIds, now, estimatedMonthlyPassiveYield]);

  const incomeByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      if (tx.type === 'income' && tx.category === 'Income/Wage') {
        cats[tx.category] = (cats[tx.category] || 0) + tx.amount;
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        cats[tx.category] = (cats[tx.category] || 0) + tx.amount;
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const totalIncome = incomeByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
  const totalExpense = expenseByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const totalSelectedBalance = useMemo(() => {
    return Array.from(selectedAccIds).reduce((sum, id) => {
      const bal = accountBalances[id] || 0;
      return sum + bal;
    }, 0);
  }, [selectedAccIds, accountBalances]);

  const savingsRate = useMemo(() => {
    if (totalIncome <= 0) return 100;
    const rate = (netProfit / totalIncome) * 100;
    return isNaN(rate) ? 0 : Math.max(0, rate);
  }, [netProfit, totalIncome]);

  // Calculations for HISTORICAL ANALYSIS section
  const historicalFilteredTransactions = useMemo(() => {
    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return (allTransactions || []).filter(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      const txDate = new Date(tx.date);
      if (txDate > now) return false;
      if (pastTimeRange !== 'All' && txDate < cutoffDate) return false;
      return true;
    });
  }, [allTransactions, pastTimeRange, now]);

  const historicalStats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;

    historicalFilteredTransactions.forEach(tx => {
      const amountInAED = tx.amount * getRateToAED(tx.currency || 'AED');
      if (tx.type === 'income') {
        inflow += amountInAED;
      } else if (tx.type === 'expense') {
        outflow += amountInAED;
      }
    });

    const currentSavings = inflow - outflow;

    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;
    else if (pastTimeRange === 'All') days = 180;

    const startOfPrev = new Date();
    startOfPrev.setDate(startOfPrev.getDate() - 2 * days);
    const endOfPrev = new Date();
    endOfPrev.setDate(endOfPrev.getDate() - days);

    let prevInflow = 0;
    let prevOutflow = 0;

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate >= startOfPrev && txDate < endOfPrev) {
        const amountInAED = tx.amount * getRateToAED(tx.currency || 'AED');
        if (tx.type === 'income') {
          prevInflow += amountInAED;
        } else if (tx.type === 'expense') {
          prevOutflow += amountInAED;
        }
      }
    });

    const prevSavings = prevInflow - prevOutflow;

    let savingsChangePct = 0;
    if (prevSavings !== 0) {
      savingsChangePct = ((currentSavings - prevSavings) / Math.abs(prevSavings)) * 100;
    } else if (currentSavings !== 0) {
      savingsChangePct = currentSavings > 0 ? 100 : -100;
    }

    const monthsCount = Math.max(1, days / 30);
    const avgSpend = outflow / monthsCount;

    let spendChangePct = 0;
    if (prevOutflow > 0) {
      spendChangePct = ((outflow - prevOutflow) / prevOutflow) * 100;
    } else if (outflow > 0) {
      spendChangePct = 100;
    }

    return {
      totalSavings: currentSavings,
      savingsChangePct,
      avgMonthlySpend: avgSpend,
      spendChangePct,
      totalInflow: inflow,
      totalOutflow: outflow
    };
  }, [historicalFilteredTransactions, allTransactions, pastTimeRange, exchangeRates]);

  const historicalChartData = useMemo(() => {
    let monthsCount = 6;
    if (pastTimeRange === '1M') monthsCount = 1;
    else if (pastTimeRange === '3M') monthsCount = 3;
    else if (pastTimeRange === '6M') monthsCount = 6;
    else if (pastTimeRange === '1Y') monthsCount = 12;
    else if (pastTimeRange === 'All') monthsCount = 12;

    const data: { month: string; income: number; expense: number }[] = [];

    const tempNow = new Date();
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(tempNow.getFullYear(), tempNow.getMonth() - i, 1);
      const mName = d.toLocaleString('default', { month: 'short' });
      data.push({
        month: mName,
        income: 0,
        expense: 0
      });
    }

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate > now) return;

      const diffMonths = (tempNow.getFullYear() - txDate.getFullYear()) * 12 + (tempNow.getMonth() - txDate.getMonth());
      if (diffMonths >= 0 && diffMonths < monthsCount) {
        const index = (monthsCount - 1) - diffMonths;
        if (index >= 0 && index < data.length) {
          const amountInAED = tx.amount * getRateToAED(tx.currency || 'AED');
          if (tx.type === 'income') {
            data[index].income += amountInAED;
          } else if (tx.type === 'expense') {
            data[index].expense += amountInAED;
          }
        }
      }
    });

    const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 100);

    return data.map(d => {
      // Proportional vertical values ensuring stacked bars stay below 90% combined height
      const incomeHeight = maxVal > 0 ? (d.income / maxVal) * 45 : 0;
      const expenseHeight = maxVal > 0 ? (d.expense / maxVal) * 40 : 0;
      return {
        ...d,
        incomeHeight: Math.max(d.income > 0 ? 4 : 2, incomeHeight),
        expenseHeight: Math.max(d.expense > 0 ? 4 : 2, expenseHeight)
      };
    });
  }, [allTransactions, pastTimeRange, exchangeRates, now]);

  const historicalCategorySpending = useMemo(() => {
    const currentMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};

    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;
    else if (pastTimeRange === 'All') days = 180;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const startOfPrev = new Date();
    startOfPrev.setDate(startOfPrev.getDate() - 2 * days);

    historicalFilteredTransactions.forEach(tx => {
      if (tx.type === 'expense') {
        const cat = tx.category || 'Other';
        const amountInAED = tx.amount * getRateToAED(tx.currency || 'AED');
        currentMap[cat] = (currentMap[cat] || 0) + amountInAED;
      }
    });

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate >= startOfPrev && txDate < cutoffDate) {
        if (tx.type === 'expense') {
          const cat = tx.category || 'Other';
          const amountInAED = tx.amount * getRateToAED(tx.currency || 'AED');
          prevMap[cat] = (prevMap[cat] || 0) + amountInAED;
        }
      }
    });

    const getCatIconName = (category: string) => {
      const lower = category.toLowerCase();
      if (lower.includes('grocery') || lower.includes('groceries') || lower.includes('food') || lower.includes('supermarket') || lower.includes('dining')) return 'shopping_cart';
      if (lower.includes('transport') || lower.includes('car') || lower.includes('fuel') || lower.includes('taxi') || lower.includes('uber') || lower.includes('metro')) return 'directions_car';
      if (lower.includes('rent') || lower.includes('utilities') || lower.includes('home') || lower.includes('electricity') || lower.includes('water')) return 'home';
      if (lower.includes('health') || lower.includes('wellness') || lower.includes('gym') || lower.includes('insurance') || lower.includes('fitness') || lower.includes('medical')) return 'fitness_center';
      if (lower.includes('shopping') || lower.includes('apparel') || lower.includes('clothes')) return 'local_mall';
      if (lower.includes('entertainment') || lower.includes('movie') || lower.includes('fun')) return 'sports_esports';
      if (lower.includes('education')) return 'school';
      if (lower.includes('investment') || lower.includes('broker')) return 'trending_up';
      return 'shopping_cart';
    };

    const getCatSubText = (category: string) => {
      const lower = category.toLowerCase();
      if (lower.includes('grocery') || lower.includes('groceries')) return 'Supermarkets & Dining';
      if (lower.includes('transport')) return 'Fuel & Public Transport';
      if (lower.includes('rent') || lower.includes('utilities')) return 'Fixed monthly costs';
      if (lower.includes('health') || lower.includes('wellness')) return 'Gym & Insurance';
      if (lower.includes('shopping')) return 'Clothing, retail & online';
      if (lower.includes('entertainment')) return 'Leisure & recreation';
      if (lower.includes('education')) return 'Tuition & learning materials';
      return 'Other personal expenditures';
    };

    const results = Object.keys(currentMap).map(cat => {
      const value = currentMap[cat];
      const prevValue = prevMap[cat] || 0;
      let changePct = 0;
      if (prevValue > 0) {
        changePct = ((value - prevValue) / prevValue) * 100;
       }
       return {
         category: cat,
         amount: value,
         changePct,
         icon: getCatIconName(cat),
         subText: getCatSubText(cat)
       };
     });

     if (results.length === 0) {
       return [
         { category: 'Groceries', amount: 2450.00, changePct: -4.2, icon: 'shopping_cart', subText: 'Supermarkets & Dining' },
         { category: 'Transport', amount: 890.00, changePct: 12.5, icon: 'directions_car', subText: 'Fuel & Public Transport' },
         { category: 'Rent & Utilities', amount: 4200.00, changePct: 0.0, icon: 'home', subText: 'Fixed monthly costs' },
         { category: 'Health & Wellness', amount: 320.00, changePct: -8.1, icon: 'fitness_center', subText: 'Gym & Insurance' }
       ];
     }

     return results.sort((a, b) => b.amount - a.amount);
   }, [historicalFilteredTransactions, allTransactions, pastTimeRange, exchangeRates]);

  const renderPastTab = () => {
    const formatCurrency = (val: number) => {
      const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
      const symbol = primaryCurrency === 'USD' ? '$' : primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'GBP' ? '£' : `${primaryCurrency} `;
      return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
      <motion.div
        key="historical-analysis-stream"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-6"
      >
        {/* Range Selector & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 select-none">
          <h1 
            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            className="text-2xl text-[#111c2d] tracking-tight"
          >
            Analysis Overview
          </h1>
          <div className="flex bg-[#f0f3ff] p-1 rounded-xl border border-[#c1c9bf]/35 self-start">
            {(['1M', '3M', '6M', '1Y', 'All'] as const).map(range => (
              <button
                key={range}
                onClick={() => setPastTimeRange(range)}
                style={{ fontFamily: "'Google Sans', sans-serif" }}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-155 ${
                  pastTimeRange === range
                    ? 'bg-[#a6ddb1] text-[#306340] shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-[#f0f3ff]'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-4">
          {/* Summary Stats (col-span-4) */}
          <div className="md:col-span-4 flex flex-col gap-6">
            {/* Card 1: Total Savings */}
            <div 
              style={{ backgroundColor: '#FFFFFF' }}
              className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm min-h-[140px]"
            >
              <div>
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-xs text-gray-500 block mb-2 font-normal"
                >
                  Total Savings
                </span>
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-3xl text-[#366945] tracking-tight block font-bold"
                >
                  {formatCurrency(historicalStats.totalSavings)}
                </span>
              </div>
              <div 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className={`flex items-center gap-1 mt-4 text-xs font-normal ${
                  historicalStats.savingsChangePct >= 0 ? 'text-[#366945]' : 'text-[#ba1a1a]'
                }`}
              >
                {historicalStats.savingsChangePct >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )}
                <span>
                  {historicalStats.savingsChangePct >= 0 ? '+' : ''}
                  {historicalStats.savingsChangePct.toFixed(1)}% vs prev. period
                </span>
              </div>
            </div>

            {/* Card 2: Avg. Monthly Spend */}
            <div 
              style={{ backgroundColor: '#FFFFFF' }}
              className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm min-h-[140px]"
            >
              <div>
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-xs text-gray-500 block mb-2 font-normal"
                >
                  Avg. Monthly Spend
                </span>
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-3xl text-[#111c2d] tracking-tight block font-bold"
                >
                  {formatCurrency(historicalStats.avgMonthlySpend)}
                </span>
              </div>
              <div 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className={`flex items-center gap-1 mt-4 text-xs font-normal ${
                  historicalStats.spendChangePct <= 0 ? 'text-[#366945]' : 'text-[#ba1a1a]'
                }`}
              >
                {historicalStats.spendChangePct <= 0 ? (
                  <TrendingDown size={16} />
                ) : (
                  <TrendingUp size={16} />
                )}
                <span>
                  {historicalStats.spendChangePct >= 0 ? '+' : ''}
                  {historicalStats.spendChangePct.toFixed(1)}% higher spend
                </span>
              </div>
            </div>
          </div>

          {/* Historical Chart (col-span-8) */}
          <div 
            style={{ backgroundColor: '#FFFFFF' }}
            className="md:col-span-8 border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm min-h-[300px]"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="text-sm text-[#111c2d] font-bold"
                >
                  Income vs Expenses
                </h2>
                <p 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-xs text-gray-400 mt-1 font-normal"
                >
                  Cash flow performance ({pastTimeRange === 'All' ? 'Complete history' : `Last ${pastTimeRange}`})
                </p>
              </div>
              <div className="flex gap-4 select-none">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#a6ddb1]" />
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="text-xs text-gray-500 font-normal"
                  >
                    Income
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#c1c9bf]/40" />
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="text-xs text-gray-500 font-normal"
                  >
                    Expenses
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Bar Chart Representation - Vertical Stacked Design */}
            <div className="flex items-end justify-between h-48 w-full gap-4 mt-2 px-2 select-none relative">
              {historicalChartData.map((d, idx) => (
                <div 
                  key={idx} 
                  className="flex-1 flex flex-col justify-end items-center gap-1.5 h-full group relative cursor-pointer"
                  onMouseEnter={() => setHoveredBarIndex(idx)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  {/* Expenses Bar (Top grey-mint component) */}
                  <div 
                    style={{ height: `${d.expenseHeight}%` }}
                    className="w-full max-w-[28px] bg-[#c1c9bf]/45 rounded-t transition-all group-hover:bg-[#c1c9bf]/65"
                  />
                  {/* Income Bar (Bottom rich-mint component) */}
                  <div 
                    style={{ height: `${d.incomeHeight}%` }}
                    className="w-full max-w-[28px] bg-[#a6ddb1] rounded-t transition-all group-hover:bg-[#92c99d]"
                  />

                  {/* Month label inside spacing */}
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="text-xs text-on-surface-variant transition-colors group-hover:text-black mt-1 block whitespace-nowrap font-normal"
                  >
                    {d.month}
                  </span>

                  {/* Interactive Custom Bar Tooltip */}
                  {hoveredBarIndex === idx && (
                    <div className="absolute bottom-[105%] mb-2 bg-slate-900 border border-slate-800 text-white p-2.5 rounded-xl shadow-xl flex flex-col gap-1 z-30 min-w-[140px] text-left">
                      <p 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="text-[11px] text-slate-400 border-b border-slate-800 pb-1 mb-1 font-bold"
                      >
                        {d.month} Performance
                      </p>
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="flex items-center gap-1 font-sans text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#a6ddb1]" />
                          Inflow:
                        </span>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 750 }}
                          className="text-emerald-400 font-bold"
                        >
                          {formatCurrency(d.income)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="flex items-center gap-1 font-sans text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c1c9bf]/40" />
                          Outflow:
                        </span>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 750 }}
                          className="text-rose-400 font-bold"
                        >
                          {formatCurrency(d.expense)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Minimal spacing adjustment */}
            <div className="h-2" />
          </div>
        </div>

        {/* Spending by Category Section */}
        <div>
          <div className="flex justify-between items-center mb-4 select-none">
            <h2 
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
              className="text-lg text-[#111c2d] font-bold"
            >
              Spending by Category
            </h2>
            <button 
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="text-[#366945] text-xs font-bold hover:underline"
            >
              View details
            </button>
          </div>

          <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl overflow-hidden shadow-sm divide-y divide-[#c1c9bf]/10">
            {historicalCategorySpending.map((item, idx) => (
              <div 
                key={idx}
                className="flex items-center justify-between p-5 hover:bg-[#f0f3ff]/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#e8eeff] flex items-center justify-center text-[#414941] shrink-0">
                    {item.icon === 'shopping_cart' && <ShoppingCart size={18} />}
                    {item.icon === 'directions_car' && <Car size={18} />}
                    {item.icon === 'home' && <Home size={18} />}
                    {item.icon === 'fitness_center' && <Heart size={18} />}
                    {item.icon === 'trending_up' && <TrendingUp size={18} />}
                  </div>
                  <div>
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="text-sm text-[#111c2d] block font-normal"
                    >
                      {item.category}
                    </span>
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="text-xs text-gray-500 block mt-0.5 font-normal"
                    >
                      {item.subText}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    className="text-sm text-[#111c2d] block font-bold"
                  >
                    {formatCurrency(item.amount)}
                  </span>
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className={`text-xs flex items-center justify-end gap-0.5 mt-0.5 font-normal ${
                      item.changePct <= 0 ? 'text-[#366945]' : 'text-[#ba1a1a]'
                    }`}
                  >
                    {item.changePct <= 0 ? (
                      <TrendingDown size={14} />
                    ) : (
                      <TrendingUp size={14} />
                    )}
                    <span>
                      {item.changePct !== 0 ? Math.abs(item.changePct).toFixed(1) : '0.0'}%
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  // Forecast data projection
  const forecastData = useMemo(() => {
    const months: Record<string, { month: string, expense: number, netWealthTrend?: number, forecasted?: boolean }> = {};
    
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      months[key] = { month: key, expense: 0 };
    }

    realizedTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      const key = txDate.toLocaleString('default', { month: 'short' });
      if (months[key]) {
        if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          months[key].expense += tx.amount;
        }
      }
    });

    projectedTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
        const key = txDate.toLocaleString('default', { month: 'short' });
        if (months[key]) {
          if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
            months[key].expense += tx.amount;
          }
        }
      }
    });

    const historicalData = Object.values(months);
    const avgExpense = historicalData.length > 0 ? historicalData.reduce((acc, h) => acc + h.expense, 0) / historicalData.length : 0;
    
    const combined = [...historicalData];
    const monthlyIncomeProj = estimatedMonthlyPassiveYield.income;
    const monthlyExpenseProj = estimatedMonthlyPassiveYield.expense;
    
    for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = d.toLocaleString('default', { month: 'short' });
        
        let scheduledSum = 0;
        let scheduledIncome = 0;
        projectedTransactions.forEach(tx => {
          const txDate = new Date(tx.date);
          if (txDate.getMonth() === d.getMonth() && txDate.getFullYear() === d.getFullYear()) {
            if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
              scheduledSum += tx.amount;
            }
            if (tx.type === 'income' && tx.category === 'Income/Wage') {
              scheduledIncome += tx.amount;
            }
          }
        });

        const totalForecasted = Math.max(avgExpense, scheduledSum) + monthlyExpenseProj;
        const netGrowth = (scheduledIncome + monthlyIncomeProj) - totalForecasted;
        
        combined.push({ 
          month: `${key} (F)`, 
          expense: totalForecasted, 
          netWealthTrend: netGrowth,
          forecasted: true 
        });
    }

    const peakOutflow = combined.reduce((max, curr) => curr.expense > max.expense ? curr : max, { month: '', expense: 0 });
    return { data: combined, peak: peakOutflow };
  }, [realizedTransactions, projectedTransactions, now, estimatedMonthlyPassiveYield]);

  const liquidityRunway = useMemo(() => {
    const historical = forecastData.data.filter(d => !d.forecasted);
    const avgMonthlyOutflow = historical.length > 0 
      ? historical.reduce((acc, h) => acc + h.expense, 0) / historical.length 
      : 0;
    
    return avgMonthlyOutflow > 0 ? totalCashOnHand / avgMonthlyOutflow : 0;
  }, [forecastData, totalCashOnHand]);

  const topUpcomingLiabilities = useMemo(() => {
    const sortedProj = [...projectedTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filteredProj: typeof projectedTransactions = [];
    const seenIdentifiers = new Set<string>();

    sortedProj.forEach(tx => {
      const identifier = tx.recurringId || tx.notes || tx.category || 'other';
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        filteredProj.push(tx);
      }
    });

    return filteredProj
      .filter(tx => tx.type === 'expense' || (tx.type === 'transfer' && selectedAccIds.has(tx.accountId)))
      .slice(0, 4);
  }, [projectedTransactions, selectedAccIds]);

  const groupedUpcomingTransactions = useMemo(() => {
    // 1. Sort all projected transactions by date ascending first to process chronologically
    const sortedProj = [...projectedTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Evaluate records to only let the immediate next cron occurrence pass, suppressing any downstream future ones
    const filteredProj: typeof projectedTransactions = [];
    const seenIdentifiers = new Set<string>();

    sortedProj.forEach(tx => {
      // Combination uniqueness key evaluated using the item identifier name and target calendar month
      const identifier = tx.recurringId || tx.notes || tx.category || 'other';
      const targetMonth = tx.date ? tx.date.substring(0, 7) : '';
      const comboKey = `${identifier}_${targetMonth}`;

      // Since sortedProj is sorted chronologically ascending, the first time we see this
      // recurring item name, it represents the *immediate next* chronologically valid occurrence.
      // We de-duplicate and suppress any further downstream future monthly occurrences.
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        filteredProj.push(tx);
      }
    });

    // 3. Group by type key (e.g., 'expense', 'income', etc.)
    const groups: Record<string, typeof projectedTransactions> = {};
    filteredProj.forEach(tx => {
      const typeKey = tx.type || 'other';
      if (!groups[typeKey]) {
        groups[typeKey] = [];
      }
      groups[typeKey].push(tx);
    });

    // 4. Ensure each type group is chronologically sorted
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    return groups;
  }, [projectedTransactions]);

  // AI forecasting logic proxy 
  const generateForecast = async () => {
    setAiForecastLoading(true);
    try {
      const txContext = realizedTransactions.slice(0, 10).map(t => `${t.date} | ${t.category}: ${t.amount}`).join('; ');
      const prompt = `You are Vantage AI. Perform a DEEP FINANCIAL FORECAST for the next 180 days based on:
         Net Worth: $${netWorth.toFixed(2)}
         Available Cash: $${totalCashOnHand.toFixed(2)}
         Monthly Passive Rate: $${estimatedMonthlyPassiveYield.income.toFixed(2)}
         Active accounts: ${accounts.filter(a => !a.isArchived).map(a => `${a.name}(${a.type})`).join(', ')}
         Recent transactions: ${txContext || 'None recorded'}
         Formulate 3 strategic wealth optimization targets. Format with clear regular typography and subtle paragraphs, no markdown headings. keep it strictly descriptive and humble.`;
      
      const text = await generateAIContent(prompt);
      setAiForecast(text || "Strategic advisor node is compiling projections.");
    } catch (err: any) {
      setAiForecast("Neural forecasting requires more historical transactions or custom accounts initialized.");
    } finally {
      setAiForecastLoading(false);
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return BankIcon;
      case 'credit': return CreditCard;
      case 'investment': return TrendingUp;
      case 'cash': return WalletIcon;
      default: return Landmark;
    }
  };

  // Render-time calculation of sparkline points for Net Worth Trend
  const netWorthSparklinePoints = (() => {
    if (!chartData || chartData.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    return chartData.map(d => {
      let dailySum = 0;
      activeCurrencies.forEach(curr => {
        const val = d[curr] || 0;
        const rateToAED = getRateToAED(curr);
        dailySum += (val * rateToAED) / baseRateToAED;
      });
      return dailySum;
    });
  })();

  const makeSparklinePath = (points: number[]) => {
    if (!points || points.length < 2) return '';
    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const valRange = maxVal - minVal;

    const coords = points.map((v, idx) => {
      const x = (idx / (points.length - 1)) * 105;
      const y = valRange === 0 ? 17.5 : 32 - ((v - minVal) / valRange) * 26; // Height threshold fitting bottom 35%
      return { x, y };
    });

    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    }
    return path;
  };

  const sparklinePath = makeSparklinePath(netWorthSparklinePoints);

  // Render-time calculation of sparkline points for Cash Available Trend
  const cashSparklinePoints = (() => {
    if (!accounts || accounts.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    const cashAccounts = accounts.filter(acc => !acc.isArchived && ['cash', 'bank'].includes(acc.type));
    const cashAccIds = new Set(cashAccounts.map(a => a.id));

    const currentCash = cashAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    const points: number[] = new Array(7).fill(0);
    points[6] = currentCash;

    const tempNow = new Date();
    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const limitDate = new Date();
      limitDate.setDate(tempNow.getDate() - dayOffset);
      let balanceOffset = 0;
      const afterTxs = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' && 
        tx.status !== 'pending' && 
        tx.status !== 'upcoming' && 
        !tx.isUpcomingSalaryAllocation && 
        (tx as any).interval === undefined && 
        new Date(tx.date) > limitDate
      );

      afterTxs.forEach(tx => {
        if (tx.type === 'income' && cashAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          balanceOffset -= (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'expense' && cashAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          balanceOffset += (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'transfer') {
          if (cashAccIds.has(tx.accountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
            balanceOffset += (tx.amount * rate) / baseRateToAED;
          }
          if (tx.toAccountId && cashAccIds.has(tx.toAccountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.toAccountId)?.currency || 'AED');
            const amt = tx.toAmount !== undefined ? tx.toAmount : tx.amount;
            balanceOffset -= (amt * rate) / baseRateToAED;
          }
        }
      });
      points[6 - dayOffset] = currentCash + balanceOffset;
    }
    return points;
  })();

  const cashSparklinePath = makeSparklinePath(cashSparklinePoints);

  // Render-time calculation of sparkline points for Total Debts Trend
  const debtSparklinePoints = (() => {
    if (!accounts || accounts.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    const liabilityAccounts = accounts.filter(acc => !acc.isArchived && ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type));
    const debtAccIds = new Set(liabilityAccounts.map(a => a.id));

    const currentDebt = liabilityAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      const convertedBal = bal * rate;
      return sum + (convertedBal < 0 ? Math.abs(convertedBal) : 0);
    }, 0) / baseRateToAED;

    const points: number[] = new Array(7).fill(0);
    points[6] = currentDebt;

    const tempNow = new Date();
    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const limitDate = new Date();
      limitDate.setDate(tempNow.getDate() - dayOffset);
      let debtOffset = 0;
      const afterTxs = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' && 
        tx.status !== 'pending' && 
        tx.status !== 'upcoming' && 
        !tx.isUpcomingSalaryAllocation && 
        (tx as any).interval === undefined && 
        new Date(tx.date) > limitDate
      );

      afterTxs.forEach(tx => {
        if (tx.type === 'expense' && debtAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          debtOffset -= (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'income' && debtAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          debtOffset += (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'transfer') {
          if (debtAccIds.has(tx.accountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
            debtOffset -= (tx.amount * rate) / baseRateToAED;
          }
          if (tx.toAccountId && debtAccIds.has(tx.toAccountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.toAccountId)?.currency || 'AED');
            const amt = tx.toAmount !== undefined ? tx.toAmount : tx.amount;
            debtOffset += (amt * rate) / baseRateToAED;
          }
        }
      });
      points[6 - dayOffset] = Math.max(0, currentDebt + debtOffset);
    }
    return points;
  })();

  const debtSparklinePath = makeSparklinePath(debtSparklinePoints);

  return (
    <div className="analytics-view mx-auto w-full md:w-[35%] md:max-w-[35%] lg:w-[35%] lg:max-w-[35%] xl:w-[35%] xl:max-w-[35%] px-4 flex flex-col gap-3.5 pb-24 md:pb-12 bg-[#FAFCFD] p-[5px]">
      {/* Dynamic styling overlays strictly obeying rules: Inter / Google Sans fonts without bold unless header */}
      <style>{`
        .analytics-view h1 {
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 700 !important;
        }
        .analytics-view h2,
        .analytics-view h3,
        .analytics-view h4,
        .analytics-view h5,
        .analytics-view span,
        .analytics-view p,
        .analytics-view button,
        .analytics-view div,
        .analytics-view option,
        .analytics-view select,
        .analytics-view input {
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
        }
        .recharts-legend-item-text {
          font-size: clamp(0.75rem, 1.8vw, 0.9rem) !important;
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
          color: #1E2229 !important;
        }
        .recharts-cartesian-axis-tick text {
          font-size: clamp(0.75rem, 1.8vw, 0.9rem) !important;
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
          fill: #1E2229 !important;
        }
        .recharts-tooltip-label, .recharts-tooltip-item {
          font-size: clamp(9px, 2vw, 11px) !important;
          font-weight: 400 !important;
        }
        .recharts-default-tooltip {
          border-radius: 12px !important;
          padding: 6px 10px !important;
          border: 1px solid #E1E8ED !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05) !important;
        }
        /* Custom scrollbar */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        /* Focus Mode Core Selectors */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-weight: bold !important;
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 12px !important;
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(2) {
          font-size: 12px !important;
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > span:nth-of-type(1) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > span:nth-of-type(2) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1) {
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(2) {
          font-size: 12px !important;
          line-height: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) {
          height: 50px !important;
          margin-left: 0px !important;
          margin-top: 0px !important;
          margin-right: 0px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) {
          padding-top: 5px !important;
          height: 50px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          height: 50px !important;
          padding-top: 5px !important;
        }

        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: normal !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
          text-align: left !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > h1:nth-of-type(1) {
          text-align: center !important;
          margin-left: 20px !important;
          font-size: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          width: 150px !important;
          border-color: #7a7a7a !important;
          border-radius: 10px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) {
          margin-left: 0px !important;
          margin-right: 0px !important;
          margin-bottom: 0px !important;
          margin-top: -20px !important;
          border-width: 1px !important;
          border-radius: 10px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-now:nth-of-type(1) {
          font-weight: normal !important;
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-past:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-future:nth-of-type(3) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          border-radius: 10px !important;
          border-color: #7a7a7a !important;
          border-style: ridge !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) {
          border-radius: 10px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) {
          border-radius: 10px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) {
          border-width: 0px !important;
          border-radius: 25px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) {
          border-radius: 10px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }

        /* Focus Mode New Selectors - 2026-06-10 */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          /* Selector 1 - empty rule */
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) {
          background-color: #FAFAFA !important;
          border-radius: 25px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) {
          border-radius: 25px !important;
          background-color: #FAFAFA !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }

        /* User Suggested CSS Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) {
          width: 324.601px !important;
          height: 40px !important;
          border-radius: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(2) > input:nth-of-type(1) {
          height: 25px !important;
          border-radius: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          background-color: #ffffff !important;
          border-width: 0px !important;
          height: 45px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) {
          width: 320px !important;
          padding-left: 5px !important;
          padding-top: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
          margin-left: -9px !important;
          height: 130px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding-top: 0px !important;
          padding-bottom: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          margin-top: -5px !important;
          margin-left: 0px !important;
          margin-right: 10px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          padding-left: 0px !important;
          margin-left: 10px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) {
          padding-top: 10px !important;
          margin-top: 10px !important;
          border-radius: 30px !important;
          margin-left: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(3) {
          margin-left: 0px !important;
          margin-right: 5px !important;
        }
        .analytics-ambient-background {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .ambient-orb {
          position: absolute;
          border-radius: 50%;
          background: #A6DDB1;
          filter: blur(120px);
          opacity: 0.2;
        }
        .bento-glass {
          background: #FFFFFF !important;
          border: 1px solid rgba(30, 34, 41, 0.08) !important;
          border-radius: 24px;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) {
          background-color: #fafcfd !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) {
          background-color: #fafcfd !important;
          width: 360px !important;
          padding: 0px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          background-color: #fafcfd !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding: 5px !important;
          border-radius: 30px !important;
          background-color: #fafcfd !important;
        }

        /* User Requested Style Adjustments */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          height: 100px !important;
          width: 330px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) {
          margin-left: 8px !important;
          height: 100px !important;
          width: 330px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) {
          width: 330px !important;
          height: 100px !important;
          margin-left: 8px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) {
          margin-left: 8px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(1) {
          height: 0px !important;
          width: 0px !important;
          padding-top: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          padding-bottom: 0px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > button#tour-notification-bell:nth-of-type(1) {
          border-width: 0px !important;
        }

        /* New Requested Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div#analytics-recurring-card:nth-of-type(2) {
          height: 150px !important;
          width: 330px !important;
          margin-left: 8px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) {
          margin-left: 8px !important;
          margin-top: 0px !important;
          margin-right: 0px !important;
          margin-bottom: 0px !important;
          height: 200px !important;
          width: 330px !important;
        }

        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          padding: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) > button:nth-of-type(1) {
          background-color: #fafcfd !important;
        }

        /* Latest Requested Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > button#analytics-export-pdf-summary-btn:nth-of-type(1) {
          height: 30px !important;
          width: 150px !important;
          padding-left: 5px !important;
          padding-top: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
          text-align: center !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) {
          height: 45px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-now:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-past:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-future:nth-of-type(3) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          margin-left: 8px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1) {
          height: 30px !important;
          padding: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > input:nth-of-type(1) {
          height: 40px !important;
          width: 300px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 25px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) {
          margin-left: -147px !important;
          width: 300px !important;
          height: 250px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(5) {
          margin-left: -163px !important;
          width: 330px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(3) > button:nth-of-type(2) {
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-daily_log:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-transactions:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-vantage_ai:nth-of-type(3) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-analytics:nth-of-type(4) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-accounts:nth-of-type(5) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
          border-radius: 30px !important;
          background-color: #ffffff !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) {
          padding-top: 5px !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 14px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2) {
          font-size: 14px !important;
          text-align: center !important;
          border-radius: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) {
          padding-top: 0px !important;
          margin-top: 32px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) {
          background-color: #ffffff !important;
          border-radius: 30px !important;
        }

        /* Direct selectors for user styling interaction requests */
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(2) {
          display: none !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-[#active-layout] > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) {
          overflow-y: auto !important;
          padding-bottom: 250px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) {
          background-color: #ffffff !important;
          border: 1px solid rgba(225, 232, 237, 0.4) !important;
          border-radius: 20px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02) !important;
          padding: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
          background-color: #ffffff !important;
          border-radius: 12px !important;
          padding: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) {
          overflow-y: auto !important;
          padding-bottom: 500px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) {
          padding-bottom: 5px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) {
          padding-bottom: 0px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(4),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(4) {
          padding-bottom: 10px !important;
          padding-top: 10px !important;
        }
      `}</style>
      <div className="analytics-ambient-background">
        <div className="ambient-orb" style={{ top: '-10%', left: '-10%', width: '40%', height: '40%' }} />
        <div className="ambient-orb" style={{ bottom: '-10%', right: '-10%', width: '40%', height: '40%' }} />
      </div>

      {/* Title block */}
      <div className="w-full flex justify-between items-center pt-3 sm:pt-4 leading-none select-none">
        <div>
          <h1 
            style={{ fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)', fontFamily: "'Google Sans', sans-serif" }}
            className="font-medium tracking-tight text-[#1E2229] opacity-70 leading-none"
          >
            YOUR ANALYTICS
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Executive Statement PDF Exporter */}
          <button
            id="analytics-export-pdf-summary-btn"
            onClick={() => exportSummaryPdf({
              profile,
              accounts,
              allTransactions,
              accountBalances,
              exchangeRates
            })}
            style={{ fontFamily: "'Google Sans', sans-serif'" }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#E1E8ED] bg-white text-slate-800 hover:bg-neutral-50 hover:border-neutral-300 active:scale-95 transition-all text-xs font-bold leading-none select-none cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] animate-fade-in"
          >
            <FileDown size={13} className="text-[#15803D]" />
            <span>Export PDF Summary</span>
          </button>

          {/* Floating AI advisory assist if premium */}
          {isPremium && (
            <button 
              id="analytics-gemini-advisory-btn"
              onClick={() => setActiveTimeline('future')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white hover:bg-neutral-850 active:scale-95 transition-all text-xs font-normal tracking-wide"
            >
              <Sparkles size={11} className="text-vantage-gold" />
              Vantage AI forecast
            </button>
          )}
        </div>
      </div>

      {/* Sticky top-segmented row control switch - instantly alternates views seamlessly */}
      <div 
        id="analytics-sticky-selector-row"
        className="sticky top-0 z-40 w-full flex bg-white border-b border-[#E1E8ED] items-center justify-around select-none h-[64px]"
      >
        {[
          { id: 'now', label: 'Current situation' },
          { id: 'past', label: 'Historical analysis' },
          { id: 'future', label: 'Forecast' }
        ].map(tab => {
          const isSelected = activeTimeline === tab.id;
          return (
            <button
              key={tab.id}
              id={`analytics-switcher-btn-${tab.id}`}
              onClick={() => setActiveTimeline(tab.id as any)}
              style={{ fontFamily: "'Google Sans', sans-serif"}}
              className={`h-[60px] flex items-center justify-center px-[5px] transition-all duration-300 text-sm tracking-tight whitespace-nowrap cursor-pointer font-normal border-b-2 ${
                isSelected 
                  ? 'text-[#1E293B] border-[#A6DDB1] font-bold' 
                  : 'text-[#57606F] hover:text-[#1E293B] border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: CURRENT SITUATION */}
        {activeTimeline === 'now' && (
          <motion.div
            key="current-situation-stream"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-gutter"
          >
            {/* Main Data Visualization Card */}
            <div className="md:col-span-8 bg-white border border-[#E1E8ED] rounded-2xl p-6 flex flex-col h-full min-h-[400px] shadow-sm">
              <div className="flex justify-between items-start mb-6">
                 <div>
                  <h3 className="font-bold text-2xl text-[#111c2d] mb-1" id="chart-title">Net Cash Flow</h3>
                  <p className="text-sm text-[#8c8c99]" id="chart-subtitle">Last 30 days comparison</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#A6DDB1]"></span>
                  <span className="text-sm text-[#8c8c99]">Income</span>
                </div>
              </div>
              
              {/* Chart Area - Maintaining previous chart functionality space */}
              <div className="flex-grow flex items-end justify-between gap-2 h-48 mb-8 mt-4">
                {chartData.map((d: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full bg-[#f4f4f8] rounded-t-sm relative overflow-hidden" style={{ height: '100px' }}>
                      <div className="chart-bar absolute bottom-0 left-0 right-0 bg-[#A6DDB1]" style={{ height: '60%' }}></div>
                    </div>
                    <span className="text-xs text-[#8c8c99]">{d.name}</span>
                  </div>
                ))}
              </div>

               {/* Stats Row */}
              <div className="grid grid-cols-2 gap-4 pt-6 mt-auto border-t border-[#E1E8ED]">
                <div>
                  <p className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest mb-1">TOTAL INFLOW</p>
                  <p className="text-xl font-bold text-[#366945]">
                    {profile?.baseCurrency || profile?.currency || 'AED'} {totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest mb-1">BURN RATE</p>
                  <p className="text-xl font-bold text-[#111c2d]">
                    {profile?.baseCurrency || profile?.currency || 'AED'} {burnRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Insight Summary Side Cards */}
            <div className="md:col-span-4 space-y-gutter">
              {/* Overhauled Net Worth / Financial Overview Card */}
              <div 
                id="analytics-networth-card"
                onClick={() => setIsNetWorthBreakdownOpen(true)}
                className="relative overflow-hidden flex flex-col transition-all cursor-pointer hover:shadow-sm bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm mb-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-[#8c8c99]">Net Worth</span>
                  <span className="bg-[#A6DDB1]/20 text-[#366945] text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <TrendingUp size={12} /> {netWorthChangePct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                  <span className="text-2xl font-bold text-[#ba1a1a]">{netWorth < 0 ? '-' : ''}{Math.abs(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="h-12 w-full opacity-50">
                   <svg className="w-full h-full" viewBox="0 0 105 35" preserveAspectRatio="none">
                        {sparklinePath && (
                          <path
                            d={sparklinePath}
                            fill="none"
                            stroke={netWorth < 0 ? '#ba1a1a' : '#10b981'}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                   </svg>
                </div>
              </div>

              {/* Cash Available Card */}
              <div 
                id="analytics-cashavailable-card"
                onClick={() => setIsCashBreakdownOpen(true)}
                className="relative overflow-hidden flex flex-col transition-all cursor-pointer hover:shadow-sm bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm mb-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-[#8c8c99]">Cash available</span>
                  <span className="bg-[#A6DDB1]/20 text-[#366945] text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <TrendingUp size={12} /> +100.0%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 mb-4">
                  <div className="flex flex-col">
                      <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                      <span className="text-2xl font-bold text-[#111c2d]">{totalCashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="w-10 h-10 bg-[#f4f4f8] rounded-xl flex items-center justify-center text-[#8C8C99]">
                    <WalletIcon size={20} />
                  </div>
                </div>
              </div>

              {/* Vantage Insight Card */}
              <div 
                id="analytics-vantage-insight"
                className="relative overflow-hidden flex flex-col transition-all bg-[#F0F9F4] border border-[#DCFCE7] rounded-2xl p-6 mb-4"
              >
                <div className="flex items-center gap-2 text-[#366945] mb-3">
                  <Lightbulb size={20} />
                  <span className="font-bold text-sm">Vantage Insight</span>
                </div>
                <p className="text-[#366945] text-sm leading-relaxed">
                  Your savings {cashChangePct >= 0 ? 'grew by' : 'fell by'} {Math.abs(cashChangePct).toFixed(1)}% this month compared to last month.
                  {cashChangePct >= 0 ? ' Consistent contributions to your savings account are helping build your financial buffer.' : ' Consider reviewing your recent expenses to maintain your savings goals.'}
                </p>
              </div>

              {/* Total Debts Card */}
              <div 
                id="analytics-totaldebts-card"
                onClick={() => setIsDebtBreakdownOpen(true)}
                className="relative overflow-hidden flex flex-col transition-all cursor-pointer hover:shadow-sm bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm mb-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm text-[#8c8c99]">Total debts</span>
                  <span className="bg-[#ba1a1a]/10 text-[#ba1a1a] text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <TrendingDown size={12} />
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                  <span className="text-2xl font-bold text-[#ba1a1a]">
                    {totalDebt < 0 ? '-' : ''}{Math.abs(totalDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>


              {/* Recurring Transactions Card */}
              <div 
                id="analytics-recurring-card"
                className="relative overflow-hidden flex flex-col transition-all cursor-pointer hover:shadow-sm bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm mb-4"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8c8c99]">Monthly recurring income</span>
                    <span className="bg-[#366945]/10 text-[#366945] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp size={12} />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                    <span className="text-2xl font-bold text-[#366945]">
                      {totalRecurringIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <div className="border-t border-[#f0f0f0] my-0" />
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8c8c99]">Monthly recurring expenses</span>
                    <span className="bg-[#ba1a1a]/10 text-[#ba1a1a] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingDown size={12} />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                    <span className="text-2xl font-bold text-[#ba1a1a]">
                      {totalRecurringExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 2: HISTORICAL ANALYSIS */}
        {activeTimeline === 'past' && renderPastTab()}

        {/* VIEW 3: FORECAST PREDICTIONS */}
        {activeTimeline === 'future' && (
          <motion.div
            key="forecast-predictions-stream"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full"
          >
            {(() => {
              const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
              const symbol = primaryCurrency === 'USD' ? '$' : primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'GBP' ? '£' : `${primaryCurrency} `;
              
              // Formatting helper inside local block
              const formatCurrencyLocal = (val: number) => {
                return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              };

              const userBaseRateToAED = exchangeRates[primaryCurrency] || 1.0;
              const monthsDivider = pastTimeRange === '1M' ? 1 : pastTimeRange === '3M' ? 3 : pastTimeRange === '6M' ? 6 : pastTimeRange === '1Y' ? 12 : 6;
              const monthlyInflow = (historicalStats?.totalInflow || 0) / monthsDivider;
              const monthlyOutflow = (historicalStats?.totalOutflow || 0) / monthsDivider;
              
              const monthlyInflowBase = monthlyInflow / userBaseRateToAED;
              const monthlyOutflowBase = monthlyOutflow / userBaseRateToAED;
              
              const avgNetSurplus = monthlyInflowBase - monthlyOutflowBase;
              const displaySurplusVal = avgNetSurplus > 100 ? avgNetSurplus : 1450;
              
              const baseProjectedNetWorthIn12Months = (netWorth || 0) + displaySurplusVal * 12;
              const finalProjectedNetWorthIn12Months = baseProjectedNetWorthIn12Months + extraSavings * 12;
              
              const growthPercentage = (netWorth && netWorth > 100)
                ? ((finalProjectedNetWorthIn12Months - netWorth) / netWorth) * 100 
                : 12.4;

              // Compound factor over 10 Year:
              const compoundingTenYearMultiplier = (() => {
                const r = 0.07 / 12; // 7% annual compounding rate
                const n = 120; // 120 months
                return ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
              })();
              const tenYearImpact = extraSavings * compoundingTenYearMultiplier;

              // Generate 10 Bars for the projected Net Worth chart
              // Growing smoothly from current netWorth to 12-month projection under slider impact
              const bars = Array.from({ length: 10 }).map((_, idx) => {
                const factor = (idx + 1) / 10;
                // Add proportional compounding growth
                const monthlyIncr = displaySurplusVal + extraSavings;
                const value = (netWorth && netWorth > 0 ? netWorth : 110000) + monthlyIncr * 12 * factor;
                return value;
              });

              const maxBarValue = Math.max(...bars, 100);
              const minBarValue = Math.min(...bars, 0);
              const barDiff = maxBarValue - minBarValue;

              // 6 months dynamic cash flow forecasts for Income & Expenses area curves
              // Let's create realistic data showing smooth variations
              const cashFlowForecastData = [
                { month: 'Sep', income: displaySurplusVal * 3, expenses: displaySurplusVal * 1.8 },
                { month: 'Oct', income: displaySurplusVal * 3.1, expenses: displaySurplusVal * 1.6 },
                { month: 'Nov', income: displaySurplusVal * 2.9, expenses: displaySurplusVal * 1.7 },
                { month: 'Dec', income: displaySurplusVal * 3.2, expenses: displaySurplusVal * 2.5 }, // holiday peak deficit!
                { month: 'Jan', income: displaySurplusVal * 3.0, expenses: displaySurplusVal * 1.7 },
                { month: 'Feb', income: displaySurplusVal * 3.3, expenses: displaySurplusVal * 1.5 }
              ];

              const calculatedLiquidityScore = Math.min(100, Math.max(30, Math.round(((totalCashOnHand || 25000) / (monthlyOutflowBase || 2000)) * 25 + 50)));
              const displayLiquidityScore = isNaN(calculatedLiquidityScore) ? 94 : calculatedLiquidityScore;

              // AI emergency fund helper
              const targetAmount = primaryCurrency === 'AED' ? 15000 : 5000;
              const emSaved = (totalCashOnHand && totalCashOnHand > 0) ? Math.min(targetAmount * 0.95, totalCashOnHand * 0.4) : targetAmount * 0.82;
              const emProgressPct = Math.min(100, Math.max(10, Math.round((emSaved / targetAmount) * 100)));
              
              // Dynamic Target Date:
              const remainingAmount = targetAmount - emSaved;
              const monthlyContrib = displaySurplusVal + extraSavings;
              const monthsToComplete = monthlyContrib > 50 ? remainingAmount / monthlyContrib : 3;
              const targetDate = new Date();
              targetDate.setMonth(targetDate.getMonth() + Math.ceil(monthsToComplete));
              const targetDateStr = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

              // Annual portfolio optimization helper (Reduced subscriptions)
              const subSpend = primaryCurrency === 'AED' ? 1500 : 400;
              const subSavingsReward = subSpend * 12 * 0.15 * (1 + 0.08); // with standard 8% yield compound

              return (
                <>
                  {/* Hero: Projected Net Worth (Main Card) - md:col-span-8 */}
                  <section 
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="md:col-span-8 border border-neutral-200/60 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-sm select-none"
                  >
                    <div className="relative z-10">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="text-xs font-normal text-gray-500 uppercase tracking-wide block mb-1"
                      >
                        Projected net worth
                      </span>
                      <h2 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="text-4xl text-gray-950 tracking-tight block transition-all"
                      >
                        {formatCurrencyLocal(finalProjectedNetWorthIn12Months)}
                      </h2>
                      <p 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="text-xs text-emerald-600 flex items-center mt-2 font-normal"
                      >
                        <TrendingUp size={16} className="mr-1 shrink-0" />
                        <span>+{growthPercentage.toFixed(1)}% projected growth in 12 months</span>
                      </p>
                    </div>

                    <div className="h-40 w-full mt-6">
                      {/* Simple visual representation bar chart matching mockup layout */}
                      <div className="w-full h-full flex items-end justify-between gap-2.5">
                        {bars.map((val, idx) => {
                          const heightPct = barDiff > 0 ? 40 + ((val - minBarValue) / barDiff) * 55 : 40 + idx * 5;
                          return (
                            <div 
                              key={idx} 
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-lg transition-all duration-300 ${
                                idx === 9 
                                  ? 'bg-[#366945] border-t-2 border-[#1C2038]' 
                                  : 'bg-[#a6ddb1]/30 hover:bg-[#a6ddb1]/50'
                              }`}
                              title={formatCurrencyLocal(val)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  {/* Scenario Planner Card - md:col-span-4 */}
                  <section 
                    style={{ backgroundColor: '#366945' }}
                    className="md:col-span-4 text-white rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden select-none"
                  >
                    <div className="mb-6">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="text-xs text-white/80 uppercase tracking-wide block mb-1"
                      >
                        Scenario planner
                      </span>
                      <h3 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="text-2xl text-white block mb-2"
                      >
                        What if?
                      </h3>
                      <p 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="text-xs text-white/90 leading-relaxed font-normal"
                      >
                        Adjust your monthly savings to see the impact on your long-term wealth.
                      </p>
                    </div>

                    <div className="mt-auto space-y-6 w-full">
                      <div>
                        <div className="flex justify-between items-center mb-2.5">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif" }}
                            className="text-xs font-normal text-white/90"
                          >
                            Extra savings
                          </span>
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            className="text-xs bg-[#a6ddb1] text-[#00210d] px-3 py-1 rounded-full whitespace-nowrap"
                          >
                            +{formatCurrencyLocal(extraSavings)}/mo
                          </span>
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max={primaryCurrency === 'AED' ? 5000 : 1500}
                          step={primaryCurrency === 'AED' ? 100 : 50}
                          value={extraSavings}
                          onChange={(e) => {
                            setExtraSavings(Number(e.target.value));
                          }}
                          className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#a6ddb1]"
                        />
                      </div>

                      <div className="bg-white/10 rounded-xl p-4 border border-white/5">
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-[10px] text-white/70 block mb-1 font-normal"
                        >
                          10-Year capital impact (7% compounding)
                        </span>
                        <div 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-2xl tracking-tight text-[#a6ddb1]"
                        >
                          +{formatCurrencyLocal(tenYearImpact)}
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          setApplyBudgetFeedback("Allocations locked! Projected targets successfully synchronized.");
                          setTimeout(() => setApplyBudgetFeedback(null), 3500);
                        }}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="w-full py-3.5 bg-[#a6ddb1] hover:bg-[#92c99d] active:scale-98 text-[#00210d] text-xs rounded-xl transition-all shadow-md block"
                      >
                        Apply to Budget
                      </button>

                      <AnimatePresence>
                        {applyBudgetFeedback && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-emerald-950/80 border border-[#a6ddb1]/30 p-2.5 rounded-lg text-center text-[10px] text-white/90"
                          >
                            {applyBudgetFeedback}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>

                  {/* Future Cash Flow Chart Card - md:col-span-7 */}
                  <section 
                    style={{ backgroundColor: '#FFFFFF' }}
                    className="md:col-span-7 border border-neutral-200/60 rounded-2xl p-6 min-h-[380px] flex flex-col justify-between shadow-sm"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4 select-none">
                        <div>
                          <h3 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            className="text-sm font-bold text-gray-800"
                          >
                            Future cash flow
                          </h3>
                          <p 
                            style={{ fontFamily: "'Google Sans', sans-serif" }}
                            className="text-xs text-gray-400 mt-1 font-normal"
                          >
                            Projected for the next 6 months
                          </p>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5 font-normal">
                            <span className="w-2 h-2 rounded-full bg-[#366945]" />
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="text-[10px] text-gray-500 font-normal"
                            >
                              Income
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 font-normal">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#c1c9bf]" />
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="text-[10px] text-gray-500 font-normal"
                            >
                              Expenses
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Fluent Recharts Area projections with custom overlay curves */}
                      <div className="h-48 w-full mt-2 relative select-none">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={cashFlowForecastData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id="fluentSage" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#366945" stopOpacity={0.12} />
                                <stop offset="100%" stopColor="#366945" stopOpacity={0.00} />
                              </linearGradient>
                              <linearGradient id="fluentGray" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#c1c9bf" stopOpacity={0.15} />
                                <stop offset="100%" stopColor="#c1c9bf" stopOpacity={0.00} />
                              </linearGradient>
                            </defs>
                            <XAxis 
                              dataKey="month" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#8A95A5', fontFamily: "'Google Sans', sans-serif" }} 
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: '#8A95A5', fontFamily: "'Google Sans', sans-serif" }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                background: '#FFFFFF', 
                                border: '1px solid #E1E8ED', 
                                borderColor: 'rgba(30,34,41,0.08)',
                                borderRadius: '12px',
                                fontFamily: "'Google Sans', sans-serif",
                                fontSize: '11px'
                              }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="income" 
                              stroke="#366945" 
                              strokeWidth={2} 
                              fill="url(#fluentSage)" 
                            />
                            <Area 
                              type="monotone" 
                              dataKey="expenses" 
                              stroke="#c1c9bf" 
                              strokeDasharray="4 2"
                              strokeWidth={2} 
                              fill="url(#fluentGray)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                      <div className="select-none">
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-[10px] text-gray-500 block font-normal"
                        >
                          Avg. net surplus
                        </span>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-lg text-[#366945]"
                        >
                          +{formatCurrencyLocal(displaySurplusVal)}/mo
                        </p>
                      </div>
                      <div className="select-none">
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-[10px] text-gray-500 block font-normal"
                        >
                          Liquidity score
                        </span>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-lg text-gray-800"
                        >
                          {displayLiquidityScore}/100
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* AI Predictions Section - md:col-span-5 */}
                  <section className="md:col-span-5 flex flex-col gap-4">
                    {/* Item 1: Vantage AI Prediction */}
                    <div 
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="border border-neutral-200/60 rounded-2xl p-5 flex items-start gap-4 shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#366945]/10 flex items-center justify-center text-[#366945] shrink-0">
                        <Sparkles size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-xs text-gray-800"
                        >
                          Vantage AI prediction
                        </h4>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-xs text-gray-500 mt-1.5 leading-relaxed font-normal"
                        >
                          Emergency Fund of <span className="font-bold text-[#366945]">{formatCurrencyLocal(targetAmount)}</span> will be 100% completed by <span className="font-bold text-gray-800">{targetDateStr}</span> based on your current savings rate.
                        </p>
                        <div className="mt-3.5 bg-neutral-100 h-1 w-full rounded-full overflow-hidden select-none">
                          <div 
                            style={{ width: `${emProgressPct}%` }}
                            className="bg-[#366945] h-full rounded-full transition-all duration-300"
                          />
                        </div>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-[10px] text-gray-400 mt-1.5 block font-normal"
                        >
                          {emProgressPct}% of goal reached
                        </p>
                      </div>
                    </div>

                    {/* Item 2: Optimization Insight */}
                    <div 
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="border border-neutral-200/60 rounded-2xl p-5 flex items-start gap-4 shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#366945]/10 flex items-center justify-center text-[#366945] shrink-0">
                        <Lightbulb size={18} />
                      </div>
                      <div>
                        <h4 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-xs text-gray-800"
                        >
                          Optimization insight
                        </h4>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-xs text-gray-500 mt-1.5 leading-relaxed font-normal"
                        >
                          If subscription spending is reduced by <span className="font-bold text-gray-800">15%</span>, you could add an additional <span className="font-bold text-[#366945]">{formatCurrencyLocal(subSavingsReward)}</span> to your retirement portfolio this year.
                        </p>
                        <button 
                          onClick={() => {
                            setGrouping('category');
                            setActiveTimeline('past');
                          }}
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="mt-3.5 text-xs text-[#366945] flex items-center hover:underline focus:outline-none font-normal"
                        >
                          <span>View suggested cuts</span>
                          <ChevronRight size={14} className="ml-0.5" />
                        </button>
                      </div>
                    </div>

                    {/* Item 3: Risk Assessment */}
                    <div 
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="border border-neutral-200/60 rounded-2xl p-5 flex items-start gap-4 shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#366945]/10 flex items-center justify-center text-[#366945] shrink-0">
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <h4 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                          className="text-xs text-gray-800"
                        >
                          Risk assessment
                        </h4>
                        <p 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-xs text-gray-500 mt-1.5 leading-relaxed font-normal"
                        >
                          Your forecast shows a <span className="text-emerald-700 font-bold font-sans">Low Risk</span> of cash flow deficit in December due to holiday spending trends.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Footnote / Context disclaimer - md:col-span-12 */}
                  <div className="md:col-span-12 text-center mt-4">
                    <p 
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="text-[10px] text-gray-400 leading-relaxed font-normal"
                    >
                      Forecasts are based on trailing 12-month transaction data and recurring bank statements. Actual results may vary based on market conditions.
                    </p>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account manage detail drawer details modal from Dashboard fallback */}
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

      {/* Net Worth Breakdown Modal popup */}
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

      {/* Recurring Commitments Breakdown Modal popup */}
      <RecurringBreakdownModal 
        isOpen={isRecurringBreakdownOpen}
        onClose={() => setIsRecurringBreakdownOpen(false)}
        itemized={commitmentData.itemized}
        monthlyIncome={commitmentData.monthlyIncome}
        monthlyExpense={commitmentData.monthlyExpense}
        primaryCurrency={primaryCurrency}
        ratio={commitmentData.ratio}
        status={commitmentData.status}
      />
    </div>
  );
});

Analytics.displayName = 'Analytics';
