import { Transaction } from '../components/Transactions';

export interface AccountTrend {
  percentage: number;
  direction: 'up' | 'down' | 'neutral';
  isNew: boolean;
}

export const calculateAccountTrend = (
  accountId: string,
  currentBalance: number,
  transactions: Transaction[],
  accountType: string = 'cash',
  loanDirection?: string
): AccountTrend => {
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const accountTxs = transactions.filter(tx => (tx.accountId === accountId || tx.toAccountId === accountId) && (tx.status as any) !== 'draft' && (tx.status as any) !== 'pending' && (tx.status as any) !== 'upcoming' && (tx.status as any) !== 'pending_confirmation' && !tx.isUpcomingSalaryAllocation && (tx as any).interval === undefined);
  const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(accountType) && loanDirection !== 'lent';

  // Since currentBalance is the state AT NOW, balance at date X is:
  // currentBalance - (sum of transactions from date X to NOW)
  const getBalanceAtDate = (targetDate: Date) => {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const delta = accountTxs.reduce((sum, tx) => {
      const txDate = new Date(tx.date);
      // If transaction is AFTER targetDate and BEFORE/AT now, it contributes to the delta
      if (txDate > targetDate && txDate <= todayEnd) {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'transfer') {
          // Use the same refined logic as calculateAccountBalances
          const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === accountId && !tx.transferSide);
          const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === accountId && !tx.transferSide && !tx.hasMirror);

          if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === accountId : String(tx.toAccountId) === accountId)) {
            return sum + amount;
          } else if (isSender && String(tx.accountId) === accountId) {
            return sum - amount;
          }
        } else if (tx.type === 'income' || tx.type === 'Inflow') {
          return sum + amount;
        } else if (tx.type === 'expense' || tx.type === 'Outflow') {
          return sum - amount;
        }
      }
      return sum;
    }, 0);
    return currentBalance - delta;
  };

  const balanceNow = currentBalance;
  const balanceThen = getBalanceAtDate(thirtyDaysAgo);

  if (accountTxs.length === 0) {
    return { percentage: 0, direction: 'neutral', isNew: true };
  }

  if (balanceThen === 0) {
    const dir = isLiability ? (balanceNow > 0 ? 'down' : 'up') : (balanceNow > 0 ? 'up' : 'down');
    return { percentage: balanceNow !== 0 ? 100 : 0, direction: balanceNow === 0 ? 'neutral' : (dir as any), isNew: false };
  }

  const diff = balanceNow - balanceThen;
  const percentage = balanceThen !== 0 ? (diff / Math.abs(balanceThen)) * 100 : (balanceNow !== 0 ? 100 : 0);

  // Since balances are now signed (liabilities are negative),
  // a positive increase in balance is always an UP trend for wealth.
  let direction: 'up' | 'down' | 'neutral' = 'neutral';
  if (!isNaN(percentage) && Math.abs(percentage) > 0.05) {
    direction = percentage > 0 ? 'up' : 'down';
  }

  return {
    percentage: isNaN(percentage) ? 0 : parseFloat(percentage.toFixed(1)),
    direction,
    isNew: false
  };
};

export const calculateExpectedBankBalance = (
  acc: any,
  transactions: any[]
): number => {
  const accountId = String(acc.id);
  let total = Number(acc.startingBalance || 0);

  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  transactions.forEach(tx => {
    if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.status === 'pending_confirmation' || tx.isUpcomingSalaryAllocation || (tx as any).interval !== undefined) return;
    
    const txDate = new Date(tx.date);
    if (isNaN(txDate.getTime())) return;
    if (txDate > todayEnd) return;

    if (tx.notes === 'Starting Balance' || tx.subcategory === 'Starting Balance') return;

    const amount = Number(tx.amount || 0);
    
    if (tx.type === 'transfer') {
      const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === accountId && !tx.transferSide);
      const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === accountId && !tx.transferSide && !tx.hasMirror);

      if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === accountId : String(tx.toAccountId) === accountId)) {
        total += amount;
      } else if (isSender && String(tx.accountId) === accountId) {
        total -= amount;
      }
    } else if (tx.type === 'income' || tx.type === 'Inflow') {
      if (String(tx.accountId) === accountId) {
        total += amount;
      }
    } else if (tx.type === 'expense' || tx.type === 'Outflow') {
      if (String(tx.accountId) === accountId) {
        total -= amount;
      }
    }
  });

  return total;
};

export const calculateAccountBalances = (
  accounts: any[],
  transactions: Transaction[]
): Record<string, number> => {
  const balances: Record<string, number> = {};
  
  // Use today at 23:59:59 to include everything happening today as 'current'
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  
    accounts.forEach(acc => {
    const accountId = String(acc.id);

    const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type) && acc.loanDirection !== 'lent';
    
    // Standard Rule: (Starting Balance) + (Sum of all Income) - (Sum of all Expenses)
    // For liabilities, we start with a negative balance representing debt
    let total = Number(acc.startingBalance);
    if (isNaN(total)) total = 0;
    if (isLiability && total > 0) total = -total;
    
    transactions.forEach(tx => {
      // 1. Skip Drafts, Scheduled Projections, Pending/Upcoming allocations, and transactions with interval
      if ((tx.status as any) === 'draft' || (tx.status as any) === 'scheduled' || (tx.status as any) === 'pending' || (tx.status as any) === 'upcoming' || (tx.status as any) === 'pending_confirmation' || tx.isUpcomingSalaryAllocation || (tx as any).interval !== undefined) return;
      
      // 2. Date Filter: Only include transactions up to today for Current Balance
      const txDate = new Date(tx.date);
      if (isNaN(txDate.getTime())) return;
      if (txDate > todayEnd) return;

      const amount = Number(tx.amount || 0);
      
      if (tx.type === 'transfer') {
        const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === accountId && !tx.transferSide);
        const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === accountId && !tx.transferSide && !tx.hasMirror);

        if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === accountId : String(tx.toAccountId) === accountId)) {
          total += amount; // Payment into CC reduces negative balance (moves toward zero)
        } else if (isSender && String(tx.accountId) === accountId) {
          total -= amount; // Sending from CC increases debt (moves more negative)
        }
      } else if (tx.type === 'income' || tx.type === 'Inflow') {
        // Income/Payment is a credit to the specified account
        if (String(tx.accountId) === accountId) {
          total += amount;
        }
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        // Expense is a debit from the specified account
        if (String(tx.accountId) === accountId) {
          total -= amount;
        }
      }
    });

    // Rule for Investment: Add Unrealized Gains/Losses (Value - Principal)
    if (acc.type === 'investment' || acc.type === 'Investment' || (acc.type || '').toLowerCase() === 'investment') {
      const subAssets = acc.subAssets || [];
      const totalValue = subAssets.reduce((sum: number, sa: any) => sum + (Number(sa.investmentValue !== undefined ? sa.investmentValue : (sa.currentValue !== undefined ? sa.currentValue : (sa.principalInvested || 0))) || 0), 0);
      const totalPrincipal = subAssets.reduce((sum: number, sa: any) => sum + (Number(sa.principalInvested) || 0), 0);
      // Unrealized Gain/Loss = Total Asset Value - Total Principal Invested
      // This is added to the "Cash position" calculated above
      total += (totalValue - totalPrincipal);
    }
    
    balances[accountId] = total;
  });
  
  return balances;
};

export const calculateAggregateTrend = (
  selectedAccIds: Set<string>,
  accounts: any[],
  transactions: Transaction[]
): AccountTrend => {
  if (selectedAccIds.size === 0) return { percentage: 0, direction: 'neutral', isNew: true };

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const balances = calculateAccountBalances(accounts, transactions);
  const balanceNow = accounts
    .filter(acc => selectedAccIds.has(acc.id))
    .reduce((sum, acc) => {
      const bal = balances[acc.id] || 0;
      return sum + bal;
    }, 0);

  // We'll calculate both total balance history (for sparkline reference if needed) 
  // and an "Organic Delta" (excluding transfers) for the growth percentage
  let balanceThen = 0;
  let totalOrganicDelta = 0;

  const selectedAccounts = accounts.filter(acc => selectedAccIds.has(acc.id));
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  selectedAccounts.forEach(acc => {
    const currentAccBal = balances[acc.id] || 0;
    const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type);
    
    // Total Delta (All transactions) - used to derive accurate past balance
    const totalDelta = transactions.filter(tx => 
      (tx.status as any) !== 'draft' &&
      (tx.status as any) !== 'pending' &&
      (tx.status as any) !== 'upcoming' &&
      (tx.status as any) !== 'pending_confirmation' &&
      !tx.isUpcomingSalaryAllocation &&
      (tx as any).interval === undefined &&
      (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
      new Date(tx.date) > thirtyDaysAgo &&
      new Date(tx.date) <= todayEnd
    ).reduce((sum, tx) => {
      const amount = tx.amount || 0;
      if (tx.type === 'transfer') {
        const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
        const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

        if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
          return sum + amount; 
        } else if (isSender && String(tx.accountId) === acc.id) {
          return sum - amount;
        }
      } else if (tx.type === 'income' || tx.type === 'Inflow') {
        if (String(tx.accountId) === acc.id) {
          return sum + amount;
        }
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (String(tx.accountId) === acc.id) {
          return sum - amount;
        }
      }
      return sum;
    }, 0);

    // Organic Delta (Exclude Transfers) - used for growth percentage
    const organicDelta = transactions.filter(tx => 
      (tx.status as any) !== 'draft' &&
      (tx.status as any) !== 'pending' &&
      (tx.status as any) !== 'upcoming' &&
      (tx.status as any) !== 'pending_confirmation' &&
      !tx.isUpcomingSalaryAllocation &&
      (tx as any).interval === undefined &&
      tx.type !== 'transfer' &&
      (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
      new Date(tx.date) > thirtyDaysAgo &&
      new Date(tx.date) <= todayEnd
    ).reduce((sum, tx) => {
      const amount = tx.amount || 0;
      if (tx.type === 'income' || tx.type === 'Inflow') {
        if (String(tx.accountId) === acc.id) {
           return sum + amount;
        }
      } else if (tx.type === 'expense' || tx.type === 'Outflow') {
        if (String(tx.accountId) === acc.id) {
           return sum - amount;
        }
      }
      return sum;
    }, 0);
    
    const pastAccBal = (currentAccBal - totalDelta);
    balanceThen += pastAccBal;
    totalOrganicDelta += organicDelta;
  });

  if (transactions.length === 0) {
    return { percentage: 0, direction: 'neutral', isNew: true };
  }

  if (balanceThen === 0) {
    return { percentage: balanceNow !== 0 ? 100 : 0, direction: balanceNow > 0 ? 'up' : balanceNow < 0 ? 'down' : 'neutral', isNew: false };
  }

  // Use organic delta (Income - Expense) for the growth percentage as requested
  const percentage = balanceThen !== 0 ? (totalOrganicDelta / Math.abs(balanceThen)) * 100 : (totalOrganicDelta !== 0 ? 100 : 0);

  return {
    percentage: isNaN(percentage) ? 0 : parseFloat(percentage.toFixed(1)),
    direction: percentage > 0.05 ? 'up' : percentage < -0.05 ? 'down' : 'neutral',
    isNew: false
  };
};
