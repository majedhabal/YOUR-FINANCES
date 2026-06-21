import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart as PieIcon, 
  Landmark, 
  Check, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  Zap,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { calculateAccountBalances } from '../lib/trendUtils';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';
import { generateAIContent } from '../lib/gemini';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area,
  Legend,
  LineChart,
  Line
} from 'recharts';

interface Account {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
  isArchived?: boolean;
  currency?: string;
  totalGainLoss?: number;
  includeInLiquidity?: boolean;
  creditLimit?: number;
  paymentDueDate?: string;
  recurringProtocol?: string;
  interestRate?: number;
  bankAccountType?: 'Checking' | 'Savings';
  minBalanceFloor?: number;
  subAssets?: {
    id: string;
    name: string;
    principalInvested: number;
    currentValue: number;
    passiveIncome: number;
    estimatedYield?: number;
    yieldPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  }[];
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  accountId: string;
  toAccountId?: string;
  transferSide?: 'sender' | 'receiver';
  hasMirror?: boolean;
  status?: string;
  isUpcomingSalaryAllocation?: boolean;
}

interface RecurringTransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  recurrency: string;
  interval: number;
  isActive: boolean;
}

interface ReportsProps {
  profile: any;
}

const LUXURY_PALETTE = ['#00FF88', '#2D3A30', '#8899A6', '#1A2022', '#FFFFFF', '#E0E6ED', '#00FF88AA'];

interface BudgetHistory {
  id: string;
  budgetId: string;
  title: string;
  amount: number;
  limit: number;
  period: string;
  startDate: string;
  endDate: string;
  createdAt: any;
}

export const Reports: React.FC<ReportsProps> = ({ profile }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [selectedAccIds, setSelectedAccIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Advanced context controls & filters
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [timeHorizon, setTimeHorizon] = useState<'7d' | '30d' | 'ytd' | 'all' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [grouping, setGrouping] = useState<'category' | 'account_type' | 'interval'>('category');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');

  useEffect(() => {
    if (!profile?.uid) return;

    const accountsRef = collection(db, `users/${profile.uid}/accounts`);
    const transactionsRef = collection(db, `users/${profile.uid}/transactions`);
    const recurringRef = collection(db, `users/${profile.uid}/recurringTransactions`);
    const txQuery = query(transactionsRef, orderBy('date', 'desc'));

    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      const accList: any[] = [];
      snapshot.forEach(doc => {
        accList.push({ id: doc.id, ...doc.data() });
      });
      setAccounts(accList);
      
      setSelectedAccIds(prev => {
        const activeAccs = accList.filter(a => !a.isArchived);
        if (prev.size === 0) return new Set(activeAccs.map(a => a.id));
        return prev;
      });
    });

    const unsubTransactions = onSnapshot(txQuery, (snapshot) => {
      const txList: Transaction[] = [];
      snapshot.forEach(doc => {
        txList.push({ id: doc.id, ...doc.data() } as Transaction);
      });
      setTransactions(txList);
    });

    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      const recList: RecurringTransaction[] = [];
      snapshot.forEach(doc => {
        recList.push({ id: doc.id, ...doc.data() } as RecurringTransaction);
      });
      setRecurring(recList);
    });

    const unsubBudgets = onSnapshot(collection(db, `users/${profile.uid}/miniBudgets`), (snap) => {
      setMiniBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubAccounts();
      unsubTransactions();
      unsubRecurring();
      unsubBudgets();
    };
  }, [profile]);

  const now = useMemo(() => new Date(), []);

  const budgetHistory = useMemo(() => {
    if (miniBudgets.length === 0 || transactions.length === 0) return [];

    const historyItems: BudgetHistory[] = [];
    const today = new Date();

    // Generate historical checks for the last 3 calendar months (prior to today's month)
    for (let i = 1; i <= 3; i++) {
      const targetMonthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = targetMonthDate.getFullYear();
      const monthNumber = targetMonthDate.getMonth(); // 0-indexed
      const monthName = targetMonthDate.toLocaleString('default', { month: 'long' });
      
      const startDateStr = `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthNumber + 1, 0).getDate();
      const endDateStr = `${year}-${String(monthNumber + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      miniBudgets.forEach((budget) => {
        const matchingTx = transactions.filter((tx: any) => {
          if (tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
          if (tx.date < startDateStr || tx.date > endDateStr) return false;

          if (tx.type === 'transfer') {
            if (budget.category === 'ACCOUNT FUND TRANSFERS') {
              const matchId = budget.accountId && tx.toAccountId === budget.accountId;
              const matchSub = budget.subcategory && tx.notes?.toLowerCase().includes(budget.subcategory.toLowerCase());
              return tx.transferSide === 'sender' && (matchId || matchSub);
            }
            return false;
          }
          if (tx.budgetId === budget.id) return true;
          if (tx.category === budget.category) {
            if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
              return true;
            }
            return tx.subcategory === budget.subcategory;
          }
          return false;
        });

        const totalSpent = matchingTx.reduce((sum, tx) => sum + (tx.amount || 0), 0);

        if (totalSpent > 0) {
          historyItems.push({
            id: `${budget.id}-${year}-${monthNumber}`,
            budgetId: budget.id,
            title: budget.title,
            amount: totalSpent,
            limit: budget.maxBudget || 0,
            period: budget.period || 'monthly',
            startDate: startDateStr,
            endDate: `${monthName} ${year}`,
            createdAt: new Date(year, monthNumber, 1)
          });
        }
      });
    }

    return historyItems;
  }, [miniBudgets, transactions]);

  const realizedTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
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
  }, [transactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

  const projectedTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      const isAccSelected = selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      const txDate = new Date(tx.date);
      if (txDate <= now) return false;

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
  }, [transactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

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

  const accountBalances = useMemo(() => {
    return calculateAccountBalances(accounts, transactions as any);
  }, [accounts, transactions]);

  const estimatedMonthlyPassiveYield = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      // Savings Interest (Projected)
      if (acc.type === 'bank' && acc.bankAccountType === 'Savings' && acc.interestRate && acc.interestRate > 0) {
        const balance = accountBalances[acc.id] || 0;
        income += (balance * (acc.interestRate / 100)) / 12;
      }
      
      // Sub-Asset Estimated Passive Yield (Projected)
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

  // For backward compatibility / existing selectors
  const estimatedMonthlyInterest = estimatedMonthlyPassiveYield.income;

  const investmentGains = useMemo(() => {
    let realized = 0; // Currently we treat passive income as realized cash
    let unrealized = 0;

    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      if (acc.type === 'investment' && acc.subAssets) {
        acc.subAssets.forEach(sa => {
          realized += sa.passiveIncome;
          unrealized += (sa.currentValue - sa.principalInvested);
        });
      }
    });

    return [
      { name: 'Realized (Cash)', value: realized },
      { name: 'Unrealized (Market)', value: unrealized }
    ];
  }, [accounts, selectedAccIds]);

  const pnlData = useMemo(() => {
    const months: Record<string, { month: string, income: number, expense: number, projectedIncome: number, projectedExpense: number }> = {};
    
    // Show 4 months back + 2 months forward
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

    // Process all transactions (realized + projected)
    transactions.forEach(tx => {
      if (!selectedAccIds.has(tx.accountId) && !(tx.toAccountId && selectedAccIds.has(tx.toAccountId))) return;

      const d = new Date(tx.date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (months[key]) {
        const isProjected = d > now;
        // Realized Revenue: ONLY Category = 'Income/Wage'
        if (tx.type === 'income' && tx.category === 'Income/Wage') {
          if (isProjected) months[key].projectedIncome += tx.amount;
          else months[key].income += tx.amount;
        } 
        // Realized Outflow: Type = 'expense' AND Category is NOT 'Internal Transfer'
        else if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          if (isProjected) months[key].projectedExpense += tx.amount;
          else months[key].expense += tx.amount;
        }
      }
    });

    return Object.values(months);
  }, [transactions, selectedAccIds, now, estimatedMonthlyInterest]);

  const incomeByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      // Realized Revenue: ONLY sum transactions where Category = 'Income/Wage'
      // Exclude all 'Internal Transfers' or 'Movements'
      if (tx.type === 'income' && tx.category === 'Income/Wage') {
        cats[tx.category] = (cats[tx.category] || 0) + tx.amount;
      }
    });

    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      // Realized Outflow: ONLY sum transactions where Type = 'Debit' (expense) 
      // AND Category is NOT 'Internal Transfer' or 'Movements'
      if (tx.type === 'expense' && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        cats[tx.category] = (cats[tx.category] || 0) + tx.amount;
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const forecastData = useMemo(() => {
    const months: Record<string, { month: string, expense: number, netWealthTrend?: number, forecasted?: boolean }> = {};
    
    // Historical 4 months
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

    // Also include projected transactions for the CURRENT MONTH in its bucket to show the full expected total (spikes)
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
    
    // Trace forecasted projection
    const monthlyIncomeProj = estimatedMonthlyPassiveYield.income;
    const monthlyExpenseProj = estimatedMonthlyPassiveYield.expense;
    
    // Forecast 3 months forward
    for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = d.toLocaleString('default', { month: 'short' });
        
        // Sum ACTUAL scheduled transactions for this future month
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

        // Use the LARGER of the average or explicitly scheduled items for a safer forecast
        const totalForecasted = Math.max(avgExpense, scheduledSum) + monthlyExpenseProj;
        
        // Net Wealth Trend factors in projected yield + income - expense
        const netGrowth = (scheduledIncome + monthlyIncomeProj) - totalForecasted;
        
        combined.push({ 
          month: `${key} (F)`, 
          expense: totalForecasted, 
          netWealthTrend: netGrowth,
          forecasted: true 
        });
    }

    // Find Peak Outflow Day in the combined forecasted data
    const peakOutflow = combined.reduce((max, curr) => curr.expense > max.expense ? curr : max, { month: '', expense: 0 });

    return { data: combined, peak: peakOutflow };
  }, [realizedTransactions, projectedTransactions, selectedAccIds, now, estimatedMonthlyInterest]);

    // Realized Revenue: ONLY Category = 'Income/Wage'
    const totalIncome = incomeByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
    // Realized Outflow: Type = 'expense' AND Category is NOT 'Internal Transfer'
    const totalExpense = expenseByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
    const netProfit = totalIncome - totalExpense;

  const totalSelectedBalance = useMemo(() => {
    return Array.from(selectedAccIds).reduce((sum, id) => {
      const bal = accountBalances[id] || 0;
      return sum + bal;
    }, 0);
  }, [selectedAccIds, accountBalances]);

  const liquidityRunway = useMemo(() => {
    const historical = forecastData.data.filter(d => !d.forecasted);
    const avgMonthlyOutflow = historical.length > 0 
      ? historical.reduce((acc, h) => acc + h.expense, 0) / historical.length 
      : 0;
    
    // Total liquidity in selected accounts
    const totalLiquidity = Array.from(selectedAccIds).reduce((sum, id) => sum + (accountBalances[id] || 0), 0);
    
    return avgMonthlyOutflow > 0 ? totalLiquidity / avgMonthlyOutflow : 0;
  }, [forecastData, selectedAccIds, accountBalances]);

  const savingsRate = useMemo(() => {
    if (totalIncome <= 0) return 100; // If you have 0 income and 0 expenses, savings rate is 100% of potential? 
    // Specifically, user said: "Since your current expenses are 0, your Savings Rate should reflect 100% of that 1,100 AED income"
    // So if Income > 0 and Expense = 0, Rate = (Income-0)/Income = 100%.
    const rate = (netProfit / totalIncome) * 100;
    return isNaN(rate) ? 0 : Math.max(0, rate);
  }, [netProfit, totalIncome]);

  const topUpcomingLiabilities = useMemo(() => {
    return projectedTransactions
      .filter(tx => tx.type === 'expense' || (tx.type === 'transfer' && selectedAccIds.has(tx.accountId)))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 3);
  }, [projectedTransactions, selectedAccIds]);

  const commitmentsThisMonth = useMemo(() => {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return projectedTransactions
      .filter(tx => {
        const d = new Date(tx.date);
        return d > now && d <= endOfMonth && (tx.type === 'expense' || (tx.type === 'transfer' && selectedAccIds.has(tx.accountId)));
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [projectedTransactions, now, selectedAccIds]);

  const dynamicBaseSalary = useMemo(() => {
    const matches = transactions.filter((tx: any) => 
      tx.category === 'Income' && 
      (tx.subCategory === 'Wage' || tx.subcategory === 'Wage') && 
      tx.isRecurring === true
    );
    return matches.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [transactions]);

  const commitmentData = useMemo(() => {
    const activeRecs = recurring.filter(r => r.isActive);
    let monthlyExpense = 0;
    let recurrentIncome = 0;
    let hasSalaryTemplate = false;
    const itemized: any[] = [];

    activeRecs.forEach(r => {
      let monthlyAmount = Number(r.amount) || 0;
      const interval = Number(r.interval) || 1;
      const freq = (r.recurrency || (r as any).frequency || '').toLowerCase();

      if (freq === 'daily') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 30;
      } else if (freq === 'weekly') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 4.33;
      } else if (freq === 'monthly') {
        monthlyAmount = monthlyAmount / (interval || 1);
      } else if (freq === 'yearly') {
        monthlyAmount = monthlyAmount / ((interval || 1) * 12);
      }

      const isIncome = r.type === 'income' || (r as any).transactionType === 'income';
      if (isIncome) {
        recurrentIncome += monthlyAmount;
        const title = ((r as any).title || (r as any).notes || '').toLowerCase();
        const cat = ((r as any).category || '').toLowerCase();
        const subcat = ((r as any).subcategory || (r as any).subCategory || '').toLowerCase();
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

  const toggleAccount = (id: string) => {
    const next = new Set(selectedAccIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccIds(next);
  };

  const selectAll = () => {
    setSelectedAccIds(new Set(accounts.map(a => a.id)));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 pb-[148px] lg:pb-12 px-0 bg-vantage-background min-h-screen">
      <style>{`
        .recharts-legend-item-text {
          font-size: clamp(8px, 2.2vw, 11px) !important;
          font-weight: 800 !important;
          color: #2F3542 !important;
        }
        .recharts-cartesian-axis-tick text {
          font-size: clamp(8px, 1.8vw, 10px) !important;
          font-weight: 700 !important;
          fill: #57606F !important;
        }
        .recharts-tooltip-label, .recharts-tooltip-item {
          font-size: clamp(9px, 2vw, 11px) !important;
          font-weight: 800 !important;
        }
        .recharts-default-tooltip {
          border-radius: 8px !important;
          padding: 4px 8px !important;
          border: 1px solid #E2E8F0 !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
        }
        .ai-input-text {
          font-size: clamp(11px, 3.2vw, 13px) !important;
        }
        .ai-button-text {
          font-size: clamp(11px, 3.2vw, 13px) !important;
        }
        @media (min-width: 1024px) {
          .ai-input-text {
            font-size: clamp(14px, 1.1vw, 16px) !important;
          }
          .ai-button-text {
            font-size: clamp(13px, 1.1vw, 15px) !important;
          }
        }
      `}</style>

      <div className="w-[95%] md:w-full mx-auto md:mx-0 flex flex-col gap-1 pt-6 md:pt-12 px-1">
        <h2 
          style={{ fontSize: 'clamp(20px, 6vw, 26px)' }}
          className="font-bold tracking-tighter uppercase text-black leading-none"
        >
          Reports
        </h2>
        <p 
          style={{ fontSize: 'clamp(8px, 2.2vw, 11px)' }}
          className="text-[#2F3542] uppercase tracking-[0.3em] font-normal leading-none"
        >
          Financial Metrics Correlation
        </p>
      </div>

      {/* Mobile-only Compact Context SWIPE-TRACK (Height exactly 34px, gap-x-1.5, Google Sans, font-weight 400, clamp size) */}
      <div className="md:hidden flex overflow-x-auto gap-x-1.5 h-[34px] items-center px-2 py-0.5 no-scrollbar scroll-smooth whitespace-nowrap bg-neutral-100/60 border-y border-neutral-200/40 select-none">
        <button
          onClick={() => setIsFilterDrawerOpen(true)}
          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
          className="h-full px-2.5 flex items-center bg-white border border-neutral-200 rounded-lg text-neutral-600 transition-colors uppercase cursor-pointer shrink-0"
        >
          ⚙️ ADAPT CONTEXT
        </button>
        
        <button
          onClick={() => setIsFilterDrawerOpen(true)}
          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
          className="h-full px-2.5 flex items-center bg-white border border-neutral-200 rounded-lg text-neutral-650 uppercase cursor-pointer shrink-0"
        >
          Time: {timeHorizon === 'all' ? 'All Time' : timeHorizon === 'ytd' ? 'YTD' : timeHorizon === '30d' ? '30 Days' : timeHorizon === '7d' ? '7 Days' : 'Custom'}
        </button>

        <button
          onClick={() => setIsFilterDrawerOpen(true)}
          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
          className="h-full px-2.5 flex items-center bg-white border border-neutral-200 rounded-lg text-neutral-650 uppercase cursor-pointer shrink-0"
        >
          Group: {grouping === 'category' ? 'Category' : grouping === 'account_type' ? 'Account Type' : 'Interval'}
        </button>

        <button
          onClick={() => setIsFilterDrawerOpen(true)}
          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
          className="h-full px-2.5 flex items-center bg-white border border-neutral-200 rounded-lg text-neutral-650 uppercase cursor-pointer shrink-0"
        >
          Type: {chartType.toUpperCase()}
        </button>

        <button
          onClick={() => setIsFilterDrawerOpen(true)}
          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
          className="h-full px-2.5 flex items-center bg-white border border-neutral-200 rounded-lg text-neutral-650 uppercase cursor-pointer shrink-0"
        >
          Accounts: {selectedAccIds.size}
        </button>
      </div>

      {/* Dynamic Filtering/Grouping Row (Visible on Desktop/Tablet, exactly 30% each) */}
      <div className="hidden md:flex flex-row justify-between gap-[3.5%] w-[95%] md:w-full mx-auto md:mx-0 px-1 mb-2 select-none">
        
        {/* Block 1: Time Horizon - Exactly 30% wide */}
        <div className="w-[30%] p-3 md:p-3.5 bg-vantage-card border border-neutral-200 rounded-xl flex flex-col gap-2 shadow-sm min-h-[140px] shrink-0">
          <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-[#57606F] leading-none mb-1">Time Horizon</span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'ytd', label: 'YTD' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setTimeHorizon(item.id as any)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: timeHorizon === item.id ? 700 : 405, fontSize: "clamp(9px, 2vw, 11.5px)" }}
                className={`py-1 px-1 border rounded-lg transition-all text-center cursor-pointer whitespace-nowrap truncate ${
                  timeHorizon === item.id 
                    ? 'bg-vantage-green/10 border-[#10B981] text-[#10B981]' 
                    : 'bg-white border-neutral-200 hover:border-neutral-350 text-[#57606F]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {timeHorizon === 'custom' && (
            <div className="flex flex-col gap-1 mt-1">
              <input 
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full text-[10px] p-1 border border-neutral-200 rounded-md focus:outline-none focus:border-[#10B981]"
                placeholder="Start"
              />
              <input 
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full text-[10px] p-1 border border-neutral-200 rounded-md focus:outline-none focus:border-[#10B981]"
                placeholder="End"
              />
            </div>
          )}
        </div>

        {/* Block 2: Analytical Grouping - Exactly 30% wide */}
        <div className="w-[30%] p-3 md:p-3.5 bg-vantage-card border border-neutral-200 rounded-xl flex flex-col gap-2 shadow-sm min-h-[140px] shrink-0 font-sans">
          <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-[#57606F] leading-none mb-1">Grouping Metric</span>
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'category', label: 'By Category' },
              { id: 'account_type', label: 'By Account Type' },
              { id: 'interval', label: 'Interval Log' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setGrouping(item.id as any)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: grouping === item.id ? 700 : 405, fontSize: "clamp(9.5px, 2.2vw, 11.5px)" }}
                className={`py-1 px-2.5 border rounded-lg transition-all text-left cursor-pointer flex items-center justify-between ${
                  grouping === item.id 
                    ? 'bg-vantage-green/10 border-[#10B981] text-[#10B981]' 
                    : 'bg-white border-neutral-200 hover:border-neutral-350 text-[#57606F]'
                }`}
              >
                <span>{item.label}</span>
                {grouping === item.id && <Check size={10} className="stroke-[3]" />}
              </button>
            ))}
          </div>
        </div>

        {/* Block 3: Calculation Mapping - Exactly 30% wide */}
        <div className="w-[30%] p-3 md:p-3.5 bg-vantage-card border border-neutral-200 rounded-xl flex flex-col gap-2 shadow-sm min-h-[140px] shrink-0 font-sans">
          <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-[#57606F] leading-none mb-1">Mapping Layout</span>
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'bar', label: 'Bar Chart' },
              { id: 'line', label: 'Line Chart' },
              { id: 'pie', label: 'Pie Chart' }
            ].map(item => (
              <button
                key={item.id}
                onClick={() => setChartType(item.id as any)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: chartType === item.id ? 700 : 405, fontSize: "clamp(9.5px, 2.2vw, 11.5px)" }}
                className={`py-1 px-2.5 border rounded-lg transition-all text-left cursor-pointer flex items-center justify-between ${
                  chartType === item.id 
                    ? 'bg-vantage-green/10 border-[#10B981] text-[#10B981]' 
                    : 'bg-white border-neutral-200 hover:border-neutral-350 text-[#57606F]'
                }`}
              >
                <span>{item.label}</span>
                {chartType === item.id && <Check size={10} className="stroke-[3]" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Centerpiece Container Card: Grouped Analysis View */}
      <div className="w-[95%] md:w-full mx-auto md:mx-0 flex flex-col gap-2 px-1 mb-2">
        <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-3 md:p-4.5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-3 select-none">
            <div className="flex flex-col">
              <span 
                style={{ fontSize: 'clamp(8px, 2.2vw, 11px)' }} 
                className="text-[#57606F] uppercase tracking-[0.2em] font-normal leading-none"
              >
                Interactive Matrix
              </span>
              <h3 
                style={{ fontSize: 'clamp(12px, 3.5vw, 15px)' }} 
                className="font-extrabold text-[#2F3542] uppercase tracking-wide leading-tight mt-0.5"
              >
                Grouped Analysis View
              </h3>
            </div>
            
            <div className="flex items-center gap-1.5">
              {/* Account Quick multi-select action indicators */}
              <button
                onClick={() => setIsFilterDrawerOpen(true)}
                style={{ fontSize: 'clamp(9px, 2.5vw, 11px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-black uppercase tracking-wider leading-none rounded-lg cursor-pointer"
              >
                Scope: {selectedAccIds.size} Node(s)
              </button>
            </div>
          </div>

          <VantageDataErrorBoundary>
            {groupedChartData.length === 0 ? (
              <div className="h-[180px] md:h-[260px] w-full flex items-center justify-center border border-dashed border-neutral-200 rounded-xl bg-neutral-50/20">
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(11px, 3.2vw, 13px)" }} 
                  className="text-neutral-500 uppercase tracking-wider text-center px-6"
                >
                  No transactions match your current selection filter criteria.
                </span>
              </div>
            ) : (
              <motion.div 
                key={`${timeHorizon}-${chartType}-${grouping}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: 'linear' }}
                className="h-[200px] md:h-[280px] w-full select-none"
              >
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'bar' ? (
                    <BarChart data={groupedChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '5px' }} />
                      <Bar dataKey="income" name="Flow In (Income)" fill="#10B981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="expense" name="Flow Out (Expense)" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  ) : chartType === 'line' ? (
                    <LineChart data={groupedChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '5px' }} />
                      <Line type="monotone" dataKey="income" name="Flow In (Income)" stroke="#10B981" strokeWidth={2.5} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="expense" name="Flow Out (Expense)" stroke="#f43f5e" strokeWidth={2.5} activeDot={{ r: 5 }} />
                    </LineChart>
                  ) : (
                    <RePieChart>
                      <Pie
                        data={groupedChartData}
                        cx="50%"
                        cy="45%"
                        innerRadius={25}
                        outerRadius={55}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {groupedChartData.map((entry, index) => (
                          <Cell key={`grouped-${index}`} fill={LUXURY_PALETTE[index % LUXURY_PALETTE.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend 
                        iconType="circle" 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ paddingTop: '5px' }} 
                        formatter={(value, entry: any) => {
                          const total = groupedChartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                          const percentage = total > 0 ? (((Number(entry.payload.value) || 0) / total) * 100).toFixed(1) : '0.0';
                          return <span className="text-[#57606F] pr-1">{value}: <span className="text-black font-extrabold">{percentage}%</span></span>;
                        }}
                      />
                    </RePieChart>
                  )}
                </ResponsiveContainer>
              </motion.div>
            )}
          </VantageDataErrorBoundary>
        </div>
      </div>

      {/* Desktop Quick Accounts Multi-Selection Bar */}
      <div className="hidden md:flex flex-col gap-2 w-[95%] md:w-full mx-auto md:mx-0 px-1 mb-2 select-none">
        <div className="flex items-center justify-between px-1">
          <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-[#57606F] uppercase tracking-widest leading-none">Asset Scope Nodes</span>
          <button 
            onClick={selectAll}
            style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }}
            className="font-extrabold text-vantage-green uppercase tracking-[0.1em] hover:text-black transition-colors leading-none cursor-pointer"
          >
            All Accounts
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {accounts.filter(a => showArchived ? true : !a.isArchived).map((acc, idx) => {
            const isSelected = selectedAccIds.has(acc.id);
            const balance = accountBalances[acc.id] || 0;
            return (
              <motion.button
                key={`${acc.id}-${idx}`}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleAccount(acc.id)}
                className={`flex items-center gap-1.5 h-auto py-1 px-2.5 rounded-full border transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-vantage-green/10 border-[#10B981] text-[#10B981] font-extrabold shadow-sm' 
                    : 'bg-white border-neutral-200 text-[#57606F] opacity-75 hover:opacity-100 shadow-none'
                }`}
              >
                <span 
                  style={{ fontSize: 'clamp(10px, 3.2vw, 11px)', fontFamily: "'Google Sans', sans-serif" }}
                  className="uppercase font-normal tracking-tight truncate max-w-[120px] md:max-w-[160px]"
                >
                  {acc.name}
                </span>
                <span 
                  style={{ fontSize: 'clamp(10.5px, 3.2vw, 13px)', fontFamily: "'Google Sans', sans-serif" }}
                  className="font-normal leading-none"
                >
                  {balance < 0 ? '-' : ''}{Math.abs(balance).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                {isSelected && <Check size={8} className="text-[#10B981] shrink-0" strokeWidth={4} />}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="w-[95%] md:w-full mx-auto grid grid-cols-2 gap-2 px-1">
         <div className="p-2.5 md:p-3.5 bg-vantage-card border border-neutral-200 rounded-xl flex flex-col shadow-sm">
            <span style={{ fontSize: 'clamp(10px, 3vw, 11px)' }} className="font-extrabold text-[#57606F] uppercase tracking-wider leading-none mb-1">Realized Flow (In)</span>
            <span style={{ fontSize: 'clamp(12px, 3.5vw, 15px)' }} className="font-normal text-emerald-700">{(totalIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
         </div>
         <div className="p-2.5 md:p-3.5 bg-vantage-card border border-neutral-200 rounded-xl flex flex-col shadow-sm">
            <span style={{ fontSize: 'clamp(10px, 3vw, 11px)' }} className="font-extrabold text-[#57606F] uppercase tracking-wider leading-none mb-1">Realized Flow (Out)</span>
            <span style={{ fontSize: 'clamp(12px, 3.5vw, 15px)' }} className="font-normal text-rose-600">{(totalExpense || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
         </div>
         <div className="p-2.5 md:p-3.5 bg-vantage-card border border-[#10B981]/25 rounded-xl flex flex-col shadow-sm col-span-2">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-emerald-700 uppercase tracking-wider leading-none">Net Operating Balance</span>
              <span style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-neutral-400">{(savingsRate || 0).toFixed(1)}% Eff.</span>
            </div>
            <span style={{ fontSize: 'clamp(16px, 5.5vw, 24px)' }} className="font-normal text-black leading-none mt-1.5">{(totalSelectedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
         </div>
      </div>

      {/* Top 3 Upcoming Liabilities */}
      <div className="w-[95%] md:w-full mx-auto md:mx-0 flex flex-col gap-2 px-1">
        <label style={{ fontSize: 'clamp(9px, 2.5vw, 11px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em] px-1 italic">Scheduled Operations</label>
        <div className="flex flex-col gap-1.5 md:gap-2.5">
          {topUpcomingLiabilities.length > 0 ? topUpcomingLiabilities.map((tx, idx) => (
            <div key={`upcoming-tx-${tx.id}-${idx}`} className="py-2.5 px-3 md:p-4 bg-vantage-card border border-neutral-200 rounded-xl shadow-sm flex items-center justify-between">
              {/* 70% Information */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                <div style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} className="w-8 h-8 rounded-lg bg-[#57606F]/5 flex items-center justify-center text-[#57606F] font-normal shrink-0 border border-neutral-200/50">
                  {new Date(tx.date).getDate()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: 'clamp(11px, 3.2vw, 13px)', color: '#1F2937' }} className="font-normal uppercase truncate leading-tight">{tx.category}</span>
                  <span style={{ fontSize: 'clamp(9px, 2.5vw, 10px)' }} className="font-extrabold text-neutral-500 uppercase tracking-wider truncate leading-none mt-0.5">
                    {accounts.find(a => a.id === tx.accountId)?.name}
                  </span>
                </div>
              </div>
              {/* 30% Amount */}
              <div className="flex items-center justify-end pl-2 border-l border-neutral-150 h-6 shrink-0 text-right">
                <span style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} className="font-normal text-rose-600 leading-none">
                  -{(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          )) : (
            <div className="p-6 bg-vantage-card/50 border border-dashed border-neutral-200 rounded-xl flex items-center justify-center">
              <span style={{ fontSize: 'clamp(10px, 2.8vw, 11px)' }} className="font-extrabold text-[#57606F]/50 uppercase tracking-[0.2em]">No operations scheduled</span>
            </div>
          )}
        </div>
      </div>

      {/* Reports Matrix */}
      <div className="w-[95%] md:w-full mx-auto md:mx-0 flex flex-col gap-4 md:gap-y-6 md:flex-row md:flex-wrap md:justify-between px-1">
        
        {/* 1. Profit & Loss Report */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <Activity size={14} className="text-vantage-green" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Profit & Loss Analysis</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-2.5 md:p-3.5 shadow-sm flex flex-col">
              <VantageDataErrorBoundary>
                <div className="h-[140px] md:h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pnlData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="4" height="4">
                          <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" 
                                 style={{ stroke: 'rgba(0,0,0,0.05)', strokeWidth: 1 }} />
                        </pattern>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '8px' }} />
                      <Bar stackId="a" dataKey="income" name="Settled" fill="#10B981" radius={[0, 0, 0, 0]} />
                      <Bar stackId="a" dataKey="projectedIncome" name="Projected" fill="url(#diagonalHatch)" stroke="#10B981" radius={[2, 2, 0, 0]} />
                      
                      <Bar stackId="b" dataKey="expense" name="Outflow" fill="#f43f5e" radius={[0, 0, 0, 0]} />
                      <Bar stackId="b" dataKey="projectedExpense" name="Commitment" fill="url(#diagonalHatch)" stroke="#f43f5e" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </VantageDataErrorBoundary>
           </div>
        </section>

        {/* 1.1 Capital Performance */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <TrendingUp size={14} className="text-vantage-green" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Capital Performance</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-2.5 md:p-3.5 shadow-sm flex flex-col">
              <VantageDataErrorBoundary>
                <div className="h-[140px] md:h-[220px] w-full">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={investmentGains} layout="vertical" margin={{ top: 5, right: 10, left: 15, bottom: 5 }}>
                         <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                         <XAxis type="number" hide />
                         <YAxis 
                           dataKey="name" 
                           type="category" 
                           axisLine={false} 
                           tickLine={false} 
                         />
                         <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                         <Bar dataKey="value" fill="#10B981" radius={[0, 8, 8, 0]} barSize={16}>
                            {investmentGains.map((entry, index) => (
                               <Cell key={`investment-${index}`} fill={index === 0 ? '#10B981' : '#2F3542'} />
                            ))}
                         </Bar>
                      </BarChart>
                   </ResponsiveContainer>
                </div>
              </VantageDataErrorBoundary>
           </div>
        </section>

        {/* 2. Revenue Segmentation */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <ArrowUpRight size={14} className="text-emerald-700" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Revenue Segmentation</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-2.5 md:p-3.5 shadow-sm flex flex-col">
              <VantageDataErrorBoundary>
                <div className="h-[140px] md:h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={incomeByCategory}
                        cx="50%"
                        cy="45%"
                        innerRadius={25}
                        outerRadius={45}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {incomeByCategory.map((entry, index) => (
                          <Cell key={`income-${index}`} fill={LUXURY_PALETTE[index % LUXURY_PALETTE.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend 
                        iconType="circle" 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ paddingTop: '5px' }} 
                        formatter={(value, entry: any) => {
                          const total = incomeByCategory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                          const percentage = total > 0 ? (((Number(entry.payload.value) || 0) / total) * 100).toFixed(1) : '0.0';
                          return <span className="text-[#57606F] pr-1">{value}: <span className="text-black font-extrabold">{percentage}%</span></span>;
                        }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </VantageDataErrorBoundary>
           </div>
        </section>

        {/* 3. Distribution Matrix */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <ArrowDownLeft size={14} className="text-crimson" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Distribution Matrix</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-2.5 md:p-3.5 shadow-sm flex flex-col">
              <VantageDataErrorBoundary>
                <div className="h-[140px] md:h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={expenseByCategory}
                        cx="50%"
                        cy="45%"
                        innerRadius={25}
                        outerRadius={45}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {expenseByCategory.map((entry, index) => (
                          <Cell key={`expense-${index}`} fill={LUXURY_PALETTE[(index + 2) % LUXURY_PALETTE.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend 
                        iconType="circle" 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        wrapperStyle={{ paddingTop: '5px' }} 
                        formatter={(value, entry: any) => {
                          const total = expenseByCategory.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
                          const percentage = total > 0 ? (((Number(entry.payload.value) || 0) / total) * 100).toFixed(1) : '0.0';
                          return <span className="text-[#57606F] pr-1">{value}: <span className="text-black font-extrabold">{percentage}%</span></span>;
                        }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
              </VantageDataErrorBoundary>
           </div>
        </section>

        {/* 4. Forecast Report */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <Zap size={14} className="text-vantage-green" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Forecast Prediction</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-2.5 md:p-3.5 shadow-sm flex flex-col">
              <VantageDataErrorBoundary>
                <div className="h-[140px] md:h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastData.data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip />
                      <Area 
                        type="monotone" 
                        dataKey="expense" 
                        name="Flow Out"
                        stroke="#10B981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorExpense)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </VantageDataErrorBoundary>
           </div>
        </section>

        {/* 5. Budget History Section */}
        {budgetHistory.length > 0 && (
          <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
             <div className="flex items-center gap-2 px-1">
                <Calendar size={14} className="text-vantage-green" strokeWidth={3} />
                <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 750, fontSize: 'clamp(11px, 3vw, 13px)' }} className="text-[#2F3542] tracking-wide">Historical budget performance</h3>
             </div>
             <div className="flex flex-col w-full bg-[#FFFFFF] border-y border-neutral-100 rounded-none divide-y divide-neutral-100">
                {budgetHistory.sort((a,b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()).slice(0, 3).map((h, idx) => (
                   <div key={`${h.id || 'h'}-${idx}`} className="py-3 px-1 flex flex-col gap-1.5 bg-[#FFFFFF] shadow-none">
                      <div className="flex justify-between items-start">
                         <div className="flex flex-col min-w-0 flex-1 pr-1">
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(12px, 3.2vw, 14px)' }} className="text-[#2F3542] truncate leading-tight mb-0.5">{h.title}</span>
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.2vw, 11px)' }} className="text-neutral-400 tracking-wider">Reported: {h.endDate}</span>
                         </div>
                         <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2vw, 11px)' }} className={`px-2 py-0.5 rounded-full ${h.amount > h.limit ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>
                            {h.amount > h.limit ? 'Excessive' : 'Optimized'}
                         </span>
                      </div>
                      
                      <div className="space-y-1">
                         <div style={{ fontSize: 'clamp(10px, 2.5vw, 12px)' }} className="flex justify-between items-center text-neutral-600">
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                               Used: <strong style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-neutral-900">{h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                            </span>
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                               Limit: <strong style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-neutral-900">{h.limit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                            </span>
                         </div>
                         <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${h.amount > h.limit ? 'bg-rose-500' : 'bg-vantage-green'}`}
                              style={{ width: `${Math.min((h.amount / h.limit) * 100, 100)}%` }}
                            />
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </section>
        )}

        {/* 6. Recurring Debt-to-Income Analysis */}
        <section className="w-full md:w-[48%] flex flex-col gap-1.5 md:gap-2.5">
           <div className="flex items-center gap-2 px-1">
              <RotateCcw size={14} className="text-vantage-green" strokeWidth={3} />
              <h3 style={{ fontSize: 'clamp(10px, 3vw, 12px)' }} className="font-extrabold text-[#2F3542] uppercase tracking-[0.15em]">Commitment Logic</h3>
           </div>
           <div className="w-full bg-vantage-card border border-neutral-200 rounded-xl p-3 md:p-4 flex flex-col gap-3 relative overflow-hidden shadow-sm">
             <div className="flex flex-col gap-1">
                <span style={{ fontSize: 'clamp(9px, 2.5vw, 10px)' }} className="font-extrabold text-[#57606F] uppercase tracking-[0.15em] leading-none">Health Coefficient</span>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 'clamp(18px, 6vw, 24px)' }} className="font-normal text-black leading-none">{commitmentData.ratio.toFixed(1)}%</span>
                  <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)' }} className={`font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    commitmentData.status === 'Elite' ? 'bg-emerald-100 text-emerald-800' :
                    commitmentData.status === 'Stable' ? 'bg-amber-100 text-amber-800' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {commitmentData.status}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-full border border-neutral-200/50 flex items-center justify-center relative shrink-0">
                   <svg className="absolute inset-x-0 inset-y-0 w-full h-full -rotate-90">
                      <circle 
                        cx="24" cy="24" r="20" 
                        fill="transparent" 
                        stroke="rgba(0,0,0,0.02)" 
                        strokeWidth="3" 
                      />
                      <circle 
                        cx="24" cy="24" r="20" 
                        fill="transparent" 
                        stroke={commitmentData.ratio > 50 ? '#f43f5e' : '#10B981'} 
                        strokeWidth="3" 
                        strokeDasharray={`${(commitmentData.ratio / 100) * 125} 125`}
                        strokeLinecap="round"
                      />
                   </svg>
                   <Landmark size={14} className="text-[#57606F]" />
                </div>

                <div className="grid grid-cols-2 gap-2 flex-1 ml-4" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                   <div className="p-1.5 bg-white rounded-lg flex flex-col border border-neutral-100 shadow-sm">
                      <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-[#57606F] leading-none mb-1">Recurring In</span>
                      <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="font-bold text-black leading-none">
                        {commitmentData.monthlyIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                   </div>
                   <div className="p-1.5 bg-white rounded-lg flex flex-col border border-neutral-100 shadow-sm">
                      <span style={{ fontSize: 'clamp(8px, 1.8vw, 10px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="font-normal text-[#57606F] leading-none mb-1">Recurring Out</span>
                      <span style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="font-bold text-black leading-none">
                        {commitmentData.monthlyExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                   </div>
                </div>
              </div>

             {/* Itemized List */}
             <div className="flex flex-col gap-1.5 mt-1">
                <span style={{ fontSize: 'clamp(9px, 2.5vw, 10px)' }} className="font-extrabold text-[#57606F] uppercase tracking-[0.1em] px-0.5 italic mb-0.5">Itemized Protocols</span>
                <div className="flex flex-col gap-1.5">
                   {commitmentData.itemized.sort((a,b) => b.calculatedMonthly - a.calculatedMonthly).slice(0, 3).map((item, idx) => (
                      <div key={`${item.id || 'commitment'}-${idx}`} className="py-2 px-2.5 bg-white rounded-xl flex items-center justify-between border border-neutral-200 shadow-sm">
                        {/* 70% Information */}
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">
                           <div style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-crimson'}`}>
                              {item.emoji || (item.type === 'income' ? '💰' : '💸')}
                           </div>
                           <div className="flex flex-col min-w-0">
                              <span style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} className="font-normal text-black uppercase truncate leading-tight mb-0.5">{(item as any).notes || (item as any).category}</span>
                              <span style={{ fontSize: 'clamp(8px, 2.2vw, 10px)' }} className="font-extrabold text-neutral-400 uppercase tracking-wider truncate leading-none">
                                 {item.recurrency} • {item.interval}x
                              </span>
                           </div>
                        </div>
                        {/* 30% Amount */}
                        <div className="flex items-end flex-col shrink-0 pl-2 border-l border-neutral-150">
                           <span style={{ fontSize: 'clamp(11px, 3.2vw, 13px)' }} className={`font-normal leading-none ${item.type === 'income' ? 'text-emerald-700' : 'text-neutral-800'}`}>
                              {item.type === 'income' ? '+' : '-'}{item.calculatedMonthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                           </span>
                        </div>
                      </div>
                   ))}
                </div>
             </div>
           </div>
        </section>

      </div>

      {/* Sliding Slide-up Custom Context Drawer for Mobile Config selection */}
      <AnimatePresence>
        {isFilterDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs"
            />
            
            {/* Drawer Panel */}
            <motion.div
              key="drawer-panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 bg-white rounded-t-[2.25rem] p-5 pb-12 shadow-2xl z-[60] flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
            >
              {/* Header with restricted bold style */}
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex flex-col font-sans">
                  <span className="text-[9px] text-[#57606F] uppercase tracking-[0.2em] font-normal leading-none mb-1">Analytical Control Panel</span>
                  <h3 
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 800 }}
                    className="text-base text-black uppercase tracking-tight leading-none"
                  >
                    Configure Analysis Context
                  </h3>
                </div>
                <button 
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center text-neutral-500 hover:text-black transition-colors font-sans text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Time Horizon Section */}
              <div className="flex flex-col gap-1.5 font-sans">
                <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] font-normal text-[#57606F] uppercase tracking-wider">Time Horizon Selection</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '7d', label: '7 Days' },
                    { id: '30d', label: '30 Days' },
                    { id: 'ytd', label: 'YTD' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom' }
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setTimeHorizon(item.id as any)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
                      className={`py-2 px-1 border rounded-lg transition-all text-center uppercase cursor-pointer whitespace-nowrap truncate ${
                        timeHorizon === item.id 
                          ? 'bg-vantage-green/15 border-[#10B981] text-[#10B981]' 
                          : 'bg-white border-neutral-200 text-[#57606F]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {timeHorizon === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-400 uppercase tracking-widest pl-0.5 font-semibold">Start Date</span>
                      <input 
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full text-xs p-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-400 uppercase tracking-widest pl-0.5 font-semibold">End Date</span>
                      <input 
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full text-xs p-2 border border-neutral-200 rounded-lg focus:outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-select check rings to toggle target accounts */}
              <div className="flex flex-col gap-1.5 font-sans">
                <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] font-normal text-[#57606F] uppercase tracking-wider">Scope Active Wallet Nodes</label>
                <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                  {accounts.filter(a => showArchived ? true : !a.isArchived).map((acc) => {
                    const isSelected = selectedAccIds.has(acc.id);
                    return (
                      <button
                        key={acc.id}
                        onClick={() => toggleAccount(acc.id)}
                        className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer text-left ${
                          isSelected 
                            ? 'bg-neutral-50 border-neutral-300' 
                            : 'bg-white border-neutral-150 opacity-70'
                        }`}
                      >
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          className="text-xs uppercase text-[#2F3542] truncate max-w-[110px]"
                        >
                          {acc.name}
                        </span>
                        
                        {/* Check ring indicator */}
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'border-[#10B981] bg-[#10B981]/10' 
                            : 'border-neutral-300 bg-white'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Segmented grouping toggle in slide-up context drawer */}
              <div className="flex flex-col gap-1.5 font-sans">
                <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] font-normal text-[#57606F] uppercase tracking-wider">Group Fields Metric</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'category', label: 'Category' },
                    { id: 'account_type', label: 'Type' },
                    { id: 'interval', label: 'Interval' }
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setGrouping(item.id as any)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
                      className={`py-2 px-1 border rounded-lg transition-all text-center uppercase cursor-pointer whitespace-nowrap truncate ${
                        grouping === item.id 
                          ? 'bg-vantage-green/15 border-[#10B981] text-[#10B981]' 
                          : 'bg-white border-neutral-200 text-[#57606F]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Responsive Layout Mapping Segment */}
              <div className="flex flex-col gap-1.5 font-sans">
                <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] font-normal text-[#57606F] uppercase tracking-wider">Visual Interface Layout</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'bar', label: 'Bar UI' },
                    { id: 'line', label: 'Line UI' },
                    { id: 'pie', label: 'Pie UI' }
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setChartType(item.id as any)}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(10px, 2.8vw, 12px)" }}
                      className={`py-2 px-1 border rounded-lg transition-all text-center uppercase cursor-pointer whitespace-nowrap truncate ${
                        chartType === item.id 
                          ? 'bg-vantage-green/15 border-[#10B981] text-[#10B981]' 
                          : 'bg-white border-neutral-200 text-[#57606F]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Locked trigger confirm button */}
              <button
                onClick={() => setIsFilterDrawerOpen(false)}
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                className="w-full py-3 mt-2 bg-black hover:bg-neutral-900 border border-transparent rounded-xl text-white uppercase tracking-wider text-xs transition-colors cursor-pointer text-center font-bold"
              >
                CONFIRM SELECTIONS
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
};

