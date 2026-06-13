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
  FileDown
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

    const cashOnHandAccounts = allNonArchived.filter(acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash');
    const calculatedCashOnHand = cashOnHandAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    // Split assets into liquid and investments
    const liquidAccounts = allNonArchived.filter(acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash');
    const liquidAssetsSum = liquidAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

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
        const txsInWindow = allTransactions.filter(tx => {
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
      
      const totalDelta = allTransactions.filter(tx => 
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
      
      const totalDelta = allTransactions.filter(tx => 
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
      cashChangePct
    };
  }, [accounts, allTransactions, selectedAccIds, accountBalances, exchangeRates, profile]);

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
    cashChangePct
  } = financialMetrics;

  // Historical Analysis Processed Transactions
  const realizedTransactions = useMemo(() => {
    return allTransactions.filter(tx => {
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
    return allTransactions.filter(tx => {
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
      const afterTxs = allTransactions.filter(tx => 
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
      const afterTxs = allTransactions.filter(tx => 
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
          background: rgba(255, 255, 255, 0.55) !important;
          backdrop-filter: blur(24px) !important;
          -webkit-backdrop-filter: blur(24px) !important;
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
        className="sticky top-0 z-40 w-full flex bg-neutral-100/90 backdrop-blur-md p-0.5 border border-[#E1E8ED] rounded-full shadow-sm gap-x-1 items-center justify-between select-none"
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
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className={`flex-1 py-1.5 px-1 text-center rounded-full transition-all duration-300 text-[clamp(10px,2.8vw,13px)] tracking-tight whitespace-nowrap cursor-pointer font-normal ${
                isSelected 
                  ? 'bg-[#A6DDB1] text-[#1E293B] shadow-sm font-bold' 
                  : 'bg-transparent text-[#57606F] hover:text-black hover:bg-neutral-200/50'
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
            className="flex flex-col gap-4"
          >
            {/* Core Financial Cards block */}
            <div className="flex flex-col gap-3">
              {/* Overhauled Net Worth / Financial Overview Card */}
              <div 
                id="analytics-networth-card"
                onClick={() => setIsNetWorthBreakdownOpen(true)}
                className="relative overflow-hidden flex flex-col transition-all cursor-pointer hover:shadow-sm"
                style={{ width: '100%', maxWidth: '480px', padding: '0px', marginLeft: '0px', height: 'auto', minHeight: '130px', backgroundColor: '#FFFFFF', backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(166, 221, 177, 0.18) 0%, transparent 45%)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)' }}
              >
                <div className="flex flex-col gap-2 p-4">
                  {/* Internal Padding content here */}
                </div>

                {/* SVG Sparkline Absolute Backdrop Overlay (for beautiful ambient aura) */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-[25%] overflow-hidden pointer-events-none z-0 opacity-20"
                  id="analytics-networth-ambient-sparkline"
                >
                  <svg className="w-full h-full" viewBox="0 0 105 35" preserveAspectRatio="none">
                    {sparklinePath && (
                      <path
                        d={sparklinePath}
                        fill="none"
                        stroke={netWorth < 0 ? '#ff3f34' : '#10b981'}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </div>

                {/* Topmost Layer: Net Worth + Currency Left, Mini Sparkline Right */}
                <div className="relative z-10 flex items-center justify-between w-full gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="font-medium text-[#1E2229] opacity-70 tracking-wide leading-none text-[clamp(0.85rem,1.8vw,0.95rem)]"
                    >
                      Net Worth
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2.5 min-w-0">
                      <h2 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }}
                        className={`tracking-tight tabular-nums leading-none truncate text-[clamp(1.3rem,3.2vw,1.75rem)] ${netWorth < 0 ? 'text-[#ff3f34]' : 'text-[#1E2229]'}`}
                      >
                        <span className="mr-0.5 text-[clamp(10px,2.6vw,13px)] text-[#57606F] font-normal">
                          {primaryCurrency}
                        </span>
                        {netWorth < 0 ? '-' : ''}{Math.abs(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h2>
                      
                      {primaryCurrency !== 'AED' && (
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="text-[#57606F] font-normal tracking-wide whitespace-nowrap text-[clamp(11px,2.4vw,13px)] self-start sm:self-center"
                        >
                          ≈ {((netWorth || 0) * getRateToAED(primaryCurrency)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Compact Historical Mini Sparkline Chart Trending */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0 relative z-10 animate-fade-in">
                    {/* Dynamic Net Worth Trend Pill */}
                    <div 
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-normal leading-none ${
                        netWorthChangePct < 0 
                          ? 'bg-[#ff3f34]/10 text-[#ff3f34]' 
                          : netWorthChangePct > 0 
                            ? 'bg-[#10b981]/10 text-[#10b981]' 
                            : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {netWorthChangePct < 0 ? (
                        <TrendingDown size={11} className="shrink-0" />
                      ) : netWorthChangePct > 0 ? (
                        <TrendingUp size={11} className="shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                      )}
                      <span>
                        {netWorthChangePct > 0 ? '+' : ''}
                        {netWorthChangePct.toFixed(1)}%
                      </span>
                    </div>

                    <div className="w-[105px] h-[35px] shrink-0 overflow-hidden relative" id="analytics-networth-sparkline">
                      <svg className="w-full h-full" viewBox="0 0 105 35" preserveAspectRatio="none">
                        {sparklinePath && (
                          <path
                            d={sparklinePath}
                            fill="none"
                            stroke={netWorth < 0 ? '#ff3f34' : '#10b981'}
                            strokeWidth={2.2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-cards Row Matrix: Cash Available and Credit Lines */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Cash Available Card */}
                <div 
                  id="analytics-cashavailable-card"
                  onClick={() => setIsCashBreakdownOpen(true)}
                  className="bento-glass relative overflow-hidden p-[clamp(12px,3.5vw,20px)] flex items-center justify-between hover:border-black/10 transition-all min-h-[105px] cursor-pointer"
                  style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)' }}
                >
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-[35%] overflow-hidden pointer-events-none z-0"
                    id="analytics-cash-sparkline"
                  >
                    <svg className="w-full h-full" viewBox="0 0 105 35" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="vantage-cash-sparkline-glow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#A6DDB1" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="#A6DDB1" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>
                      {cashSparklinePath && (
                        <>
                          <path
                            d={`${cashSparklinePath} L 105 35 L 0 35 Z`}
                            fill="url(#vantage-cash-sparkline-glow)"
                          />
                          <path
                            d={cashSparklinePath}
                            fill="none"
                            stroke="#A6DDB1"
                            strokeWidth={2}
                            strokeOpacity={0.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}
                    </svg>
                  </div>

                  <div className="relative z-10 flex items-center justify-between w-full min-w-0">
                    <div className="flex flex-col gap-[clamp(2px,1vw,4px)] min-w-0">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="font-medium text-[#1E2229] opacity-70 tracking-wide leading-none text-[clamp(0.95rem,2.2vw,1.15rem)]"
                      >
                        Cash available
                      </span>
                      <h2 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }}
                        className={`tracking-tighter tabular-nums leading-none truncate text-[clamp(1.3rem,3.2vw,1.75rem)] ${totalCashOnHand < 0 ? 'text-[#ff3f34]' : 'text-[#1E2229]'}`}
                      >
                        <span className="mr-0.5 text-[clamp(8px,2.2vw,10px)] text-[#57606F] font-normal">
                          {primaryCurrency}
                        </span>
                        {(totalCashOnHand || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h2>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {/* Dynamic Cash Trend Pill */}
                      <div 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-normal leading-none ${
                          cashChangePct < 0 
                            ? 'bg-[#ff3f34]/10 text-[#ff3f34]' 
                            : cashChangePct > 0 
                              ? 'bg-[#10b981]/10 text-[#10b981]' 
                              : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {cashChangePct < 0 ? (
                          <TrendingDown size={11} className="shrink-0" />
                        ) : cashChangePct > 0 ? (
                          <TrendingUp size={11} className="shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 shrink-0" />
                        )}
                        <span>
                          {cashChangePct > 0 ? '+' : ''}
                          {cashChangePct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black/5 flex items-center justify-center text-black shrink-0">
                        <WalletIcon size={18} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Debts Card */}
                <div 
                  id="analytics-totaldebt-card"
                  onClick={() => setIsDebtBreakdownOpen(true)}
                  className="relative overflow-hidden p-[clamp(12px,3.5vw,20px)] rounded-2xl bg-[#FFFFFF] border border-[#E1E8ED] flex items-center justify-between shadow-sm hover:border-neutral-300 hover:shadow-md transition-all min-h-[92px] sm:min-h-[105px] cursor-pointer"
                  style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)' }}
                >
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-[35%] overflow-hidden pointer-events-none z-0"
                    id="analytics-debt-sparkline"
                  >
                    <svg className="w-full h-full" viewBox="0 0 105 35" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="vantage-debt-sparkline-glow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#A6DDB1" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#A6DDB1" stopOpacity="0.01" />
                        </linearGradient>
                      </defs>
                      {debtSparklinePath && (
                        <>
                          <path
                            d={`${debtSparklinePath} L 105 35 L 0 35 Z`}
                            fill="url(#vantage-debt-sparkline-glow)"
                          />
                          <path
                            d={debtSparklinePath}
                            fill="none"
                            stroke="#A6DDB1"
                            strokeWidth={2}
                            strokeOpacity={0.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        </>
                      )}
                    </svg>
                  </div>

                  <div className="relative z-10 flex items-center justify-between w-full min-w-0">
                    <div className="flex flex-col gap-[clamp(2px,1vw,4px)] min-w-0">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="font-normal text-[#57606F] tracking-wide leading-none text-[clamp(9px,2.5vw,11px)]"
                      >
                        Total debts
                      </span>
                      <h2 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className={`tracking-tighter tabular-nums leading-none truncate text-[clamp(14px,4.5vw,22px)] ${totalDebt > 0 ? 'text-[#ff3f34]' : 'text-black'}`}
                      >
                        <span className="mr-0.5 text-[clamp(8px,2.2vw,10px)] text-[#57606F] font-normal">
                          {primaryCurrency}
                        </span>
                        -{(totalDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h2>
                    </div>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#ff3f34]/10 flex items-center justify-center text-[#ff3f34] shrink-0">
                      <TrendingDown size={18} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Recurring Dashboard Component */}
            <div 
              id="analytics-recurring-card"
              onClick={() => setIsRecurringBreakdownOpen(true)}
              className="relative overflow-hidden p-[clamp(12px,3.5vw,20px)] rounded-2xl bg-[#FFFFFF] border border-[#E1E8ED] flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-neutral-100 shadow-sm hover:border-neutral-300 hover:shadow-md transition-all gap-4 sm:gap-0 cursor-pointer min-h-[92px] sm:min-h-[105px] select-none"
            >
              {/* Left Column: Recurring Income */}
              <div className="flex-1 flex items-center justify-between sm:pr-4 pb-3 sm:pb-0">
                <div className="flex flex-col gap-[clamp(2px,1vw,4px)] min-w-0">
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                    className="font-normal text-[#57606F] tracking-wide leading-none text-[clamp(9px,2.5vw,11px)]"
                  >
                    Monthly recurring income
                  </span>
                  <h2 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    className="tracking-tighter tabular-nums leading-none truncate text-[clamp(14px,4.5vw,22px)] text-[#0e9f6e]"
                  >
                    <span className="mr-0.5 text-[clamp(8px,2.2vw,10px)] text-[#57606F] font-normal">
                      {primaryCurrency}
                    </span>
                    {(commitmentData.monthlyIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>
                </div>
                <div className="w-8 h-8 rounded-lg bg-[#0e9f6e]/10 flex items-center justify-center text-[#0e9f6e] shrink-0">
                  <TrendingUp size={16} />
                </div>
              </div>

              {/* Right Column: Recurring Expenses */}
              <div className="flex-1 flex items-center justify-between sm:pl-4 pt-3 sm:pt-0">
                <div className="flex flex-col gap-[clamp(2px,1vw,4px)] min-w-0">
                  <span 
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                    className="font-normal text-[#57606F] tracking-wide leading-none text-[clamp(9px,2.5vw,11px)]"
                  >
                    Monthly recurring expenses
                  </span>
                  <h2 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    className="tracking-tighter tabular-nums leading-none truncate text-[clamp(14px,4.5vw,22px)] text-[#ff3f34]"
                  >
                    <span className="mr-0.5 text-[clamp(8px,2.2vw,10px)] text-[#57606F] font-normal">
                      {primaryCurrency}
                    </span>
                    {(commitmentData.monthlyExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>
                </div>
                <div className="w-8 h-8 rounded-lg bg-[#ff3f34]/10 flex items-center justify-center text-[#ff3f34] shrink-0">
                  <TrendingDown size={16} />
                </div>
              </div>
            </div>


            <AdContainer subscriptionTier={profile?.subscriptionTier} />
          </motion.div>
        )}

        {/* VIEW 2: HISTORICAL ANALYSIS */}
        {activeTimeline === 'past' && (
          <motion.div
            key="historical-analysis-stream"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {/* Context Filters Drawer row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Filter 1: Horizon */}
              <div 
                style={{ 
                  height: timeHorizon === 'custom' ? '128px' : '100px', 
                  borderRadius: '24px',
                  transition: 'height 0.2s ease-in-out'
                }}
                className="bento-glass border border-white/40 shadow-sm flex flex-col justify-center gap-1"
              >
                <div 
                  style={{ height: '54px', marginLeft: '0px', marginRight: '0px', marginTop: '0px' }}
                  className="grid grid-cols-3 gap-1 justify-items-center"
                >
                  {[
                    { id: '7d', label: '7d' },
                    { id: '30d', label: '30d' },
                    { id: 'ytd', label: 'YTD' },
                    { id: 'all', label: 'All' },
                    { id: 'custom', label: 'Date' }
                  ].map((h, idx) => {
                    let buttonStyle: any = {
                      height: '24px',
                      width: '70px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Google Sans', sans-serif",
                      padding: 0,
                      margin: 0,
                    };
                    if (idx === 0) {
                      buttonStyle.borderRadius = '15px';
                    } else if (idx === 1) {
                      buttonStyle.borderRadius = '15px';
                    } else if (idx === 2) {
                      buttonStyle.borderRadius = '15px';
                    } else if (idx === 3) {
                      buttonStyle.borderRadius = '15px';
                    } else if (idx === 4) {
                      buttonStyle.borderRadius = '15px';
                      buttonStyle.marginTop = '0px';
                    }
                    return (
                      <button
                        key={h.id}
                        onClick={() => setTimeHorizon(h.id as any)}
                        style={buttonStyle}
                        className={`transition-all duration-200 ease-linear border leading-none ${
                          timeHorizon === h.id 
                            ? 'bg-black text-[#A6DDB1] border-black font-bold' 
                            : 'bg-white border-neutral-200 hover:border-neutral-400 text-[#1E2229]'
                        }`}
                      >
                        {h.label}
                      </button>
                    );
                  })}
                </div>
                {timeHorizon === 'custom' && (
                  <div 
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif",
                      marginLeft: '0px',
                      marginTop: '25px',
                      height: '50px',
                      paddingLeft: '0px',
                      paddingRight: '0px',
                      paddingTop: '4px',
                      paddingBottom: '4px',
                      fontSize: '12px',
                      lineHeight: '12px',
                      fontWeight: 'normal'
                    }}
                    className="flex gap-1 justify-center w-full px-1"
                  >
                    <input 
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{ fontFamily: "'Google Sans', sans-serif", backgroundColor: '#ffffff', borderRadius: '10px' }}
                      className="w-full text-[10px] px-1.5 py-0.5 border border-[#E1E8ED] rounded-[10px] bg-white focus:outline-none focus:border-[#A6DDB1]"
                    />
                    <input 
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{ fontFamily: "'Google Sans', sans-serif", backgroundColor: '#ffffff', borderRadius: '10px' }}
                      className="w-full text-[10px] px-1.5 py-0.5 border border-[#E1E8ED] rounded-[10px] bg-white focus:outline-none focus:border-[#A6DDB1]"
                    />
                  </div>
                )}
              </div>

              {/* Filter 2: Grouping Category */}
              <div className="bento-glass p-2.5 border border-white/40 shadow-sm flex flex-col gap-1">
                <div className="flex flex-col gap-1">
                  {[
                    { id: 'category', label: 'By category' },
                    { id: 'account_type', label: 'By account type' },
                    { id: 'interval', label: 'Interval log' }
                  ].map(g => (
                    <button
                      key={g.id}
                      onClick={() => setGrouping(g.id as any)}
                      style={{ fontFamily: "'Google Sans', sans-serif", borderRadius: '8px', fontSize: '12.5px', height: '20px' }}
                      className={`py-1 px-3 text-left font-normal tracking-normal border transition-all duration-200 ease-linear flex items-center justify-between ${
                        grouping === g.id 
                          ? 'bg-black text-[#A6DDB1] border-black font-medium' 
                          : 'bg-white border-neutral-100 hover:border-neutral-300 text-[#1E2229] hover:bg-neutral-50/50'
                      }`}
                    >
                      <span>{g.label}</span>
                      {grouping === g.id && <Check size={14} className="text-[#A6DDB1]" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter 3: Chart View */}
              <div className="bento-glass p-2.5 border border-white/40 shadow-sm flex flex-col gap-1">
                <div className="flex flex-col gap-1">
                  {[
                    { id: 'bar', label: 'Bar matrix' },
                    { id: 'line', label: 'Line trace' },
                    { id: 'pie', label: 'Distribution pie' }
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => setChartType(c.id as any)}
                      style={{ fontFamily: "'Google Sans', sans-serif", borderRadius: '8px', fontSize: '12.5px', height: '20px' }}
                      className={`py-1 px-3 text-left font-normal tracking-normal border transition-all duration-200 ease-linear flex items-center justify-between ${
                        chartType === c.id 
                          ? 'bg-black text-[#A6DDB1] border-black font-medium' 
                          : 'bg-white border-neutral-100 hover:border-neutral-300 text-[#1E2229] hover:bg-neutral-50/50'
                      }`}
                    >
                      <span>{c.label}</span>
                      {chartType === c.id && <Check size={14} className="text-[#A6DDB1]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Account switchers below row */}
            <div className="bento-glass p-4 border border-white/40 shadow-sm flex flex-col gap-2.5">
              <div className="flex items-center justify-end">
                <button 
                  onClick={selectAll} 
                  style={{ fontSize: '12px', fontWeight: 'bold' }}
                  className="hover:text-[#A6DDB1] transition-colors text-neutral-500 tracking-wide"
                >
                  Select all accounts
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {accounts.filter(a => !a.isArchived).map((acc, idx) => {
                  const isSelected = selectedAccIds.has(acc.id);
                  const bal = accountBalances[acc.id] || 0;
                  return (
                    <button
                      key={`analytics-acc-btn-${acc.id || idx}-${idx}`}
                      onClick={() => toggleAccount(acc.id)}
                      className={`px-3 py-1 text-[10px] font-normal tracking-tight rounded-full border transition-colors flex items-center gap-1.5 ${
                        isSelected 
                          ? 'bg-neutral-900 text-white border-neutral-900 font-bold' 
                          : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <span>{acc.name}</span>
                      <span className="opacity-60">{bal < 0 ? '-' : ''}{Math.abs(bal).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Centralized Grouped Analysis centerpiece */}
            <div className="w-full flex justify-center px-4 sm:px-0 mt-2">
              <div 
                className="relative overflow-hidden transition-all duration-300 flex flex-col gap-2"
                style={{
                  height: '260px',
                  width: '300px',
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  marginLeft: '0px',
                  marginRight: '0px',
                  background: 'rgba(255, 255, 255, 0.55)',
                  backdropFilter: 'blur(22px)',
                  WebkitBackdropFilter: 'blur(22px)',
                  borderRadius: '20px',
                  border: '1px solid rgba(30, 34, 41, 0.08)',
                  boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.04)',
                }}
              >
                {/* Ambient background glow accent */}
                <div 
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none z-0"
                  style={{
                    background: 'rgba(166, 221, 177, 0.12)',
                    filter: 'blur(40px)'
                  }}
                />



                <VantageDataErrorBoundary>
                  {groupedChartData.length === 0 ? (
                    <div className="h-[185px] w-full flex items-center justify-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50/20 relative z-10">
                      <span className="text-[#1E2229] opacity-60 text-xs text-center tracking-wide" style={{ fontFamily: "'Google Sans', sans-serif" }}>No matching transactions in this path.</span>
                    </div>
                  ) : (
                    <div className="h-[185px] w-full relative z-10">
                      <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'bar' ? (
                          <BarChart data={groupedChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id="sageGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#A6DDB1" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#A6DDB1" stopOpacity={0.15} />
                              </linearGradient>
                              <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ffb3b5" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#ffb3b5" stopOpacity={0.15} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 34, 41, 0.05)" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.9rem)', fill: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.9rem)', fill: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid rgba(30, 34, 41, 0.08)',
                                borderRadius: '12px',
                                fontFamily: "'Google Sans', sans-serif"
                              }}
                            />
                            <Legend iconType="circle" />
                            <Bar dataKey="income" name="Inflow" fill="url(#sageGradient)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="expense" name="Outflow" fill="url(#outflowGradient)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : chartType === 'line' ? (
                          <AreaChart data={groupedChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                            <defs>
                              <linearGradient id="sageGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#A6DDB1" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#A6DDB1" stopOpacity={0.15} />
                              </linearGradient>
                              <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ffb3b5" stopOpacity={0.8} />
                                <stop offset="100%" stopColor="#ffb3b5" stopOpacity={0.15} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 34, 41, 0.05)" vertical={false} />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.9rem)', fill: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.9rem)', fill: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid rgba(30, 34, 41, 0.08)',
                                borderRadius: '12px',
                                fontFamily: "'Google Sans', sans-serif"
                              }}
                            />
                            <Legend iconType="circle" />
                            <Area 
                              type="monotone" 
                              dataKey="income" 
                              name="Inflow" 
                              stroke="#A6DDB1" 
                              strokeWidth={2.5} 
                              fill="url(#sageGradient)" 
                              fillOpacity={1} 
                            />
                            <Area 
                              type="monotone" 
                              dataKey="expense" 
                              name="Outflow" 
                              stroke="#ffb3b5" 
                              strokeWidth={2.5} 
                              fill="url(#outflowGradient)" 
                              fillOpacity={1} 
                            />
                          </AreaChart>
                        ) : (
                          <RePieChart>
                            <Pie
                              data={expenseByCategory}
                              cx="50%"
                              cy="45%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {expenseByCategory.map((entry, idx) => (
                                <Cell key={`expense-cell-${idx}`} fill={LUXURY_PALETTE[idx % LUXURY_PALETTE.length]} stroke="none" />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ 
                                background: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid rgba(30, 34, 41, 0.08)',
                                borderRadius: '12px',
                                fontFamily: "'Google Sans', sans-serif"
                              }}
                            />
                            <Legend 
                              iconType="circle" 
                              layout="horizontal" 
                              verticalAlign="bottom" 
                              align="center"
                              formatter={(value, entry: any) => {
                                const total = groupedChartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                                const percentage = total > 0 ? (((Number(entry.payload.value) || 0) / total) * 100).toFixed(1) : '0.0';
                                return <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.75rem, 1.8vw, 0.9rem)', fontWeight: 400, color: '#1E2229' }} className="pr-1">{value}: <span className="font-normal" style={{ fontWeight: 500 }}>{percentage}%</span></span>;
                              }}
                            />
                          </RePieChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  )}
                </VantageDataErrorBoundary>
              </div>
            </div>





            {/* Secondary graphs row */}
            <div className="w-full flex flex-col md:flex-row gap-4 justify-center items-center md:items-start px-4 sm:px-0 mt-2">
              {/* Profit & Loss Chart */}
              <div 
                className="p-5 bg-white border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col gap-3"
                style={{
                  width: '300px',
                }}
              >
                <span className="text-xs font-bold text-[#57606F] tracking-wide flex items-center gap-1.5"><Activity size={12} /> Profit & loss</span>
                <div className="h-[180px] w-full">
                  <VantageDataErrorBoundary>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pnlData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar stackId="a" dataKey="income" name="Settled" fill="#0e9f6e" />
                        <Bar stackId="a" dataKey="projectedIncome" name="Projected" fill="#A6DDB1" />
                        <Bar stackId="b" dataKey="expense" name="Outflow" fill="#ff3f34" />
                        <Bar stackId="b" dataKey="projectedExpense" name="Commitment" fill="#ff3f34" opacity={0.6} />
                      </BarChart>
                    </ResponsiveContainer>
                  </VantageDataErrorBoundary>
                </div>
              </div>

              {/* Spending Trends Chart */}
              <div 
                style={{
                  width: '300px',
                }}
              >
                <SpendingTrends
                  allTransactions={allTransactions}
                  selectedAccIds={selectedAccIds}
                  accounts={accounts}
                  baseCurrency={profile?.baseCurrency || profile?.currency || 'AED'}
                  getRateToAED={getRateToAED}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* VIEW 3: FORECAST PREDICTIONS */}
        {activeTimeline === 'future' && (
          <motion.div
            key="forecast-predictions-stream"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {/* AI Deep Forecasting interface */}
            <div id="analytics-predictions-ai-container" className="p-4 md:p-5 bg-black text-white rounded-2xl shadow-xl border border-neutral-850 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-44 h-44 bg-[#A6DDB1]/10 rounded-full blur-[70px] pointer-events-none" />
              
              <div className="flex items-center gap-2 relative z-10">
                <Sparkles size={16} className="text-[#A6DDB1]" />
                <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs font-bold tracking-wide text-[#A6DDB1]">Deep predictive AI advisor</span>
              </div>
              
              <div className="relative z-10 flex flex-col gap-2">
                <h4 style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-lg font-bold tracking-tight text-white leading-tight">180-day balance prediction</h4>
                <p className="text-xs text-neutral-455 leading-relaxed font-normal">Generate neural forecasting matrices to optimize risk indexes, cash operations, and passive capital yields.</p>
              </div>

              <div className="relative z-10 border-t border-white/10 pt-4 mt-1">
                {aiForecastLoading && (
                  <div className="flex flex-col gap-2 animate-pulse py-2">
                    <div className="h-4 bg-white/10 rounded w-full"></div>
                    <div className="h-4 bg-white/10 rounded w-4/5"></div>
                    <div className="h-4 bg-white/10 rounded w-3/5"></div>
                  </div>
                )}
                {!aiForecast && !aiForecastLoading && (
                  <button 
                    onClick={generateForecast}
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                    className="w-full py-4 rounded-xl bg-[#A6DDB1] text-black font-bold text-xs tracking-wide hover:scale-[1.01] active:scale-95 transition-all shadow-md"
                  >
                    Initiate projections scan
                  </button>
                )}
                {aiForecast && (
                  <div className="flex flex-col gap-3 py-1">
                    <p className="text-sm font-normal text-neutral-200 leading-relaxed italic border-l-2 border-[#A6DDB1]/40 pl-4">{aiForecast}</p>
                    <button onClick={() => setAiForecast(null)} className="text-[10px] text-neutral-400 hover:text-white font-bold tracking-wide mt-2 self-start">Reset projections</button>
                  </div>
                )}
              </div>
            </div>

            {/* Runways and Peaks estimations metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-white border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#A6DDB1]/10 flex items-center justify-center text-[#A6DDB1] shrink-0"><Clock size={14} /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#57606F] tracking-wide leading-none">Liquidity runway</span>
                    <span className="text-neutral-500 text-[10px] mt-0.5 tracking-wide font-normal">Time until liquid exhaustion</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-normal text-black font-mono">{liquidityRunway.toFixed(1)}</span>
                  <span className="text-sm tracking-wide text-[#57606F] font-normal">Months</span>
                </div>
                <p className="text-xs text-[#57606F] font-normal leading-normal">Derived from selected node capital total: ({totalCashOnHand.toLocaleString()} AED) vs average baseline outflows.</p>
              </div>

              <div className="p-5 bg-white border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center text-[#ff3f34] shrink-0"><TrendingDown size={14} /></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#57606F] tracking-wide leading-none">Peak projected outflow</span>
                    <span className="text-neutral-500 text-[10px] mt-0.5 tracking-wide font-normal">Highest spending node spike</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-normal text-[#ff3f34] font-mono">{forecastData.peak?.expense.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="text-sm tracking-wide text-[#57606F] font-normal">AED ({forecastData.peak?.month})</span>
                </div>
                <p className="text-xs text-[#57606F] font-normal leading-normal">Projections model factors average expenses + active scheduled payment schedules safely.</p>
              </div>
            </div>

            {/* Forward looking mathematical projection chart */}
            <div className="p-5 bg-white border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col gap-4">
              <span className="text-xs font-bold text-[#57606F] tracking-wide flex items-center gap-2"><Layers size={13} /> Multi-period cash outflow trend + predictions</span>
              
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastData.data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="expense" name="Dynamic Outflow (AED)" fill="#2F3542" radius={[3, 3, 0, 0]}>
                      {forecastData.data.map((entry, idx) => (
                        <Cell key={`forecast-cell-${idx}`} fill={entry.forecasted ? '#A6DDB1' : '#2F3542'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Multi-Scenario Financial Trajectory Visualizer */}
            <TrajectoryVisualizer 
              startingNetWorth={netWorth}
              baseCurrency={profile?.baseCurrency || profile?.currency || 'AED'}
              monthlySalary={dynamicBaseSalary}
            />

            {/* Android Homescreen Widgets Configurator & Simulator */}
            <QuickAddWidget uid={profile?.uid} />

            {/* Scheduled Operations / Top Upcoming Liabilities (Forecast Predictions and commitments) */}
            <div className="flex flex-col gap-3">
              <label 
                style={{ fontFamily: "'Google Sans', sans-serif" }}
                className="font-bold text-black tracking-wide text-sm"
              >
                Upcoming operations tracker
              </label>
              
              {(() => {
                const typesList = Object.keys(groupedUpcomingTransactions);

                if (typesList.length === 0) {
                  return (
                    <div className="p-8 bg-white border border-dashed border-[#E1E8ED] rounded-2xl flex items-center justify-center">
                      <span className="text-xs font-normal tracking-wide text-[#57606F]/50" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>No operations scheduled</span>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-3.5">
                    {typesList.map((typeKey) => {
                      const txsUnderType = groupedUpcomingTransactions[typeKey] || [];
                      const isCollapsed = expandedTypes[typeKey] === false;

                      const isExpense = typeKey.toLowerCase() === 'expense';
                      const isIncome = typeKey.toLowerCase() === 'income';
                      const amountColor = isIncome ? 'text-[#0e9f6e]' : isExpense ? 'text-[#ff3f34]' : 'text-neutral-700';
                      const amountSign = isIncome ? '+' : isExpense ? '-' : '';

                      return (
                        <div key={typeKey} className="flex flex-col gap-2 bg-white p-1.5 rounded-2xl border border-[#E1E8ED]">
                          {/* Category Header Row with Clickable Arrow Button */}
                          <div 
                            onClick={() => {
                              setExpandedTypes(prev => ({
                                ...prev,
                                [typeKey]: prev[typeKey] === undefined ? false : !prev[typeKey]
                              }));
                            }}
                            className="flex items-center justify-between p-3 bg-white border-b border-[#E1E8ED]/30 rounded-xl cursor-pointer hover:bg-neutral-50/50 transition-all select-none"
                          >
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                className="p-1 rounded-lg hover:bg-neutral-100 text-[#57606F] transition-colors"
                                aria-label={isCollapsed ? "Expand" : "Collapse"}
                              >
                                {isCollapsed ? (
                                  <ChevronRight size={14} className="stroke-[2.5]" />
                                ) : (
                                  <ChevronDown size={14} className="stroke-[2.5]" />
                                )}
                              </button>
                              <div className="flex items-center gap-2">
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  className="text-xs tracking-wide text-black/85"
                                >
                                  {typeKey.charAt(0).toUpperCase() + typeKey.slice(1)} projections
                                </span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full"
                                >
                                  {txsUnderType.length}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* List of transaction items inside if not collapsed */}
                          {!isCollapsed && (
                            <div className="flex flex-col gap-2 mt-1 px-1 pb-1">
                              {txsUnderType.map((tx, idx) => (
                                <div 
                                  key={`${tx.id}-${idx}`} 
                                  className="p-3.5 bg-white border border-[#E1E8ED] rounded-xl flex items-center justify-between transition-colors hover:bg-neutral-50/50"
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                >
                                  <div className="flex items-center gap-3.5 min-w-0 pr-4">
                                    {/* Date Marker Badge adhering strictly to Google Sans + weight 400 */}
                                    <div 
                                      className="flex flex-col items-center justify-center py-1 px-2.5 bg-neutral-50 border border-[#E1E8ED]/70 rounded-lg shrink-0 text-[#2F3542] min-w-[50px]"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    >
                                      <span className="text-[9px] tracking-wide leading-none text-neutral-500">
                                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short' })}
                                      </span>
                                      <span className="text-xs mt-1 leading-none font-normal">
                                        {new Date(tx.date).getDate()}
                                      </span>
                                    </div>

                                    {/* Text data strings & merchant names using regular style (400) exclusively */}
                                    <div className="flex flex-col min-w-0">
                                      <span 
                                        className="text-xs text-black truncate leading-none font-normal"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                      >
                                        {tx.category}
                                      </span>
                                      <span 
                                        className="text-[9px] text-[#57606F] tracking-wide mt-1.5 truncate leading-none font-normal"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                      >
                                        {accounts.find(a => a.id === tx.accountId)?.name || 'External Account'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Currency figures strictly utilizing Google Sans + bold style (700) exclusively */}
                                  <div className="flex items-center justify-end pl-4 border-l border-neutral-100 shrink-0 text-right">
                                    <span 
                                      className={`text-xs ${amountColor} whitespace-nowrap leading-none`}
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                    >
                                      {amountSign}{(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} AED
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
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
