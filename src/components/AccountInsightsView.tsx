import React from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Edit3, 
  Plus, 
  TrendingUp, 
  TrendingDown,
  CreditCard,
  Wallet,
  Building2 as BankIcon,
  Landmark,
  HandCoins,
  Home,
  ChevronRight,
  Gift,
  ShoppingCart,
  Fuel,
  Stethoscope,
  Utensils,
  Lightbulb,
  Bus,
  Tv,
  Package,
  Layers,
  Trash2
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  date: string;
  description: string;
  notes?: string;
  toAccountId?: string;
  type: 'income' | 'expense' | 'transfer';
  status?: string;
  transferSide?: 'sender' | 'receiver';
  hasMirror?: boolean;
}

interface Account {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
  currency: string;
  bankAccountNumber?: string;
  interestRate?: number;
  isArchived?: boolean;
  totalGainLoss?: number;
  includeInLiquidity?: boolean;
  creditLimit?: number;
  paymentDueDate?: string;
  recurringProtocol?: string;
  bankAccountType?: 'Checking' | 'Savings';
  minBalanceFloor?: number;
  defaultTransferFee?: number;
}

interface AccountInsightsViewProps {
  account: Account;
  accounts: Account[];
  transactions: Transaction[];
  onBack: () => void;
  onAddTransaction?: () => void;
  onNavigateToTransactions?: (accountId: string) => void;
  onSelectTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (tx: Transaction) => void;
}

const CATEGORY_MAP: Record<string, { icon: any, color: string }> = {
  'Charity': { icon: Gift, color: '#22C55E' },
  'Groceries': { icon: ShoppingCart, color: '#EF4444' },
  'Fuel': { icon: Fuel, color: '#A855F7' },
  'Health': { icon: Stethoscope, color: '#22C55E' },
  'Food': { icon: Utensils, color: '#F97316' },
  'Bills': { icon: Lightbulb, color: '#EAB308' },
  'Transport': { icon: Bus, color: '#3B82F6' },
  'Entertainment': { icon: Tv, color: '#D946EF' },
  'Shopping': { icon: Package, color: '#EC4899' },
  'Other': { icon: Layers, color: '#6366F1' },
};

export const AccountInsightsView: React.FC<AccountInsightsViewProps> = ({ account, accounts, transactions, onBack, onAddTransaction, onNavigateToTransactions, onSelectTransaction, onDeleteTransaction }) => {
  // Sort transactions by date (only past and today)
  const now = new Date();
  const accountTransactions = transactions
    .filter(tx => {
      const isMine = tx.accountId === account.id;
      const isTargetingMe = tx.toAccountId === account.id;
      const isDraft = tx.status === 'draft';
      const isFuture = new Date(tx.date) > now;
      
      if (isDraft || isFuture || (tx as any).interval !== undefined) return false;
      
      // If dual-entry exists, we only show the record where we are the accountId
      // to avoid seeing both legs of the same transfer.
      // If it's a single entry where we are the toAccountId, we must show it.
      if (isMine) return true;
      if (isTargetingMe && !tx.hasMirror) return true;
      
      return false;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate daily balance for chart (last 30 days)
  const calculateChartData = () => {
    const data = [];
    const now = new Date();
    
    // Sort transactions ascending for cumulative calculation
    const chronTransactions = [...accountTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(account.type);
    let runningBalance = Number(account.startingBalance || 0);
    if (isLiability && runningBalance > 0) {
      runningBalance = -runningBalance;
    }
    const balanceMap: Record<string, number> = {};
    
    // Initial balance
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Filter transactions before 30 days ago to get baseline
    const pastTransactions = chronTransactions.filter(tx => new Date(tx.date) < thirtyDaysAgo);
    pastTransactions.forEach(tx => {
      if (tx.type === 'income') runningBalance += tx.amount;
      else if (tx.type === 'expense') runningBalance -= tx.amount;
      else if (tx.type === 'transfer') {
        const isReceiver = tx.transferSide === 'receiver' || (tx.toAccountId === account.id && !tx.transferSide);
        const isSender = tx.transferSide === 'sender' || (tx.accountId === account.id && !tx.transferSide);
        
        if (isReceiver && (tx.transferSide === 'receiver' ? tx.accountId === account.id : tx.toAccountId === account.id)) {
          runningBalance += tx.amount;
        } else if (isSender && tx.accountId === account.id) {
          runningBalance -= tx.amount;
        }
      }
    });

    // Calculate balances for the last 30 days
    for (let i = 30; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      const dayTransactions = chronTransactions.filter(tx => tx.date === dateStr);
      dayTransactions.forEach(tx => {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'income') runningBalance += amount;
        else if (tx.type === 'expense') runningBalance -= amount;
        else if (tx.type === 'transfer') {
          const isReceiver = tx.transferSide === 'receiver' || (tx.toAccountId === account.id && !tx.transferSide);
          const isSender = tx.transferSide === 'sender' || (tx.accountId === account.id && !tx.transferSide);
          
          if (isReceiver && (tx.transferSide === 'receiver' ? tx.accountId === account.id : tx.toAccountId === account.id)) {
            runningBalance += amount;
          } else if (isSender && tx.accountId === account.id) {
            runningBalance -= amount;
          }
        }
      });
      
      data.push({
        date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        fullDate: dateStr,
        balance: runningBalance
      });
    }
    
    return data;
  };

  const chartData = calculateChartData();
  const currentBalance = Number(chartData[chartData.length - 1]?.balance) || 0;
  const previousMonthBalance = Number(chartData[0]?.balance) || Number(account.startingBalance) || 0;
  const pChange = previousMonthBalance === 0 
    ? (currentBalance > 0 ? 100 : 0) 
    : ((currentBalance - previousMonthBalance) / Math.abs(previousMonthBalance)) * 100;
  const percentageChange = isNaN(pChange) ? 0 : pChange;

  const isLiabilityType = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(account.type);
  const chartColor = (isLiabilityType || percentageChange < 0) ? '#E28743' : '#20C997';

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'cash':
      case 'Cash': return Wallet;
      case 'bank':
      case 'Bank': return BankIcon;
      case 'investment': return TrendingUp;
      case 'credit':
      case 'Credit Card': return CreditCard;
      case 'loan':
      case 'Personal Loan': return HandCoins;
      case 'mortgage':
      case 'Mortgage': return Home;
      default: return Wallet;
    }
  };

  const getTransactionIcon = (tx: Transaction) => {
    const config = CATEGORY_MAP[tx.category] || CATEGORY_MAP['Other'];
    return config;
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    const txDate = new Date(d);
    txDate.setHours(0, 0, 0, 0);
    
    if (txDate.getTime() === today.getTime()) return 'Today';
    if (txDate.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col h-full bg-vantage-black text-white">
      {/* Header */}
      <div className="bg-vantage-card/30 p-6 pb-20 rounded-b-[2.5rem] relative z-0 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors text-vantage-blue-grey hover:text-white">
              <ArrowLeft size={22} />
            </button>
            <h2 className="text-xl font-black uppercase tracking-tight neon-glow-text">Account Detail</h2>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 -mt-16 px-4 pb-24 overflow-y-auto z-10 space-y-6 scrollbar-hide">
        {/* Account Info Card */}
        <div className="bg-vantage-card/40 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-2xl thin-border border-white/5">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-16 h-16 rounded-2xl bg-vantage-green/10 flex items-center justify-center text-vantage-green shadow-[0_0_15px_rgba(0,255,136,0.1)]">
               {React.createElement(getAccountIcon(account.type), { size: 32 })}
            </div>
            <div className="flex flex-col gap-0.5">
               <h3 className="text-xl font-black text-white uppercase tracking-tight">{account.name}</h3>
               <p className="text-[10px] font-black text-vantage-green/60 uppercase tracking-[0.3em]">{account.type.replace('_', ' ')} Account</p>
            </div>
          </div>

          <div className="flex justify-between items-end mb-6 px-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-vantage-blue-grey uppercase tracking-[0.2em] mb-2">Current Liquidity</span>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-mono font-bold text-white neon-glow-text">
                  {currentBalance < 0 ? '-' : ''}{account.currency} {Math.abs(currentBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-vantage-blue-grey uppercase tracking-[0.2em] mb-2">30D Delta</span>
              <span className={`text-xl font-black ${percentageChange >= 0 ? 'text-vantage-green' : 'text-[#E28743]'}`}>
                {percentageChange > 0 ? '+' : ''}{percentageChange.toFixed(0)}%
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="h-44 w-full mt-6">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                   <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor={chartColor} stopOpacity={0.2}/>
                         <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                      </linearGradient>
                   </defs>
                   <Area 
                     type="monotone" 
                     dataKey="balance" 
                     stroke={chartColor} 
                     strokeWidth={3}
                     fillOpacity={1} 
                     fill="url(#colorBalance)" 
                     isAnimationActive={true}
                   />
                   <XAxis 
                     dataKey="date" 
                     hide={true}
                   />
                   <YAxis hide={true} domain={['auto', 'auto']} />
                   <Tooltip 
                     contentStyle={{ 
                        backgroundColor: '#0F1416', 
                        borderRadius: '20px', 
                        border: `1px solid ${chartColor}22`, 
                        boxShadow: '0 10px 30px rgba(0,0,0,0.4)' 
                     }}
                     labelStyle={{ fontWeight: 'black', color: chartColor, textTransform: 'uppercase', fontSize: '10px' }}
                     itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                   />
                </AreaChart>
             </ResponsiveContainer>
             <div className="flex justify-between px-2 mt-4">
                {chartData.filter((_, i) => i % 10 === 0).map((d, i) => (
                  <span key={d.date} className="text-[10px] font-black text-neutral-700 uppercase tracking-widest">{d.date}</span>
                ))}
                <span className="text-[10px] font-black text-vantage-green uppercase tracking-widest">Today</span>
             </div>
          </div>
        </div>

        {/* Transactions Section */}
        <div className="space-y-6">
           <div className="px-2 flex flex-col gap-1">
              <h4 className="text-lg font-black text-white uppercase tracking-tight">Recent Activity</h4>
              <p className="text-[10px] font-black text-vantage-blue-grey uppercase tracking-[0.2em]">Live Interaction Log</p>
           </div>

           <div className="space-y-3">
              {accountTransactions.slice(0, 15).map((tx, idx) => {
                const config = getTransactionIcon(tx);
                
                // Unified Expense/Income logic for UI
                let isOutflow = false;
                if (tx.type === 'expense') isOutflow = true;
                else if (tx.type === 'transfer') {
                  const isReceiver = tx.transferSide === 'receiver' || (tx.toAccountId === account.id && !tx.transferSide);
                  const isSender = tx.transferSide === 'sender' || (tx.accountId === account.id && !tx.transferSide);
                  
                  if (isReceiver && (tx.transferSide === 'receiver' ? tx.accountId === account.id : tx.toAccountId === account.id)) {
                    isOutflow = false;
                  } else if (isSender && tx.accountId === account.id) {
                    isOutflow = true;
                  }
                }
                
                const displayCategory = tx.type === 'transfer' 
                  ? (tx.transferSide === 'receiver' ? `From ${accounts.find(a => a.id === tx.toAccountId)?.name || 'Account'}` : `To ${accounts.find(a => a.id === tx.toAccountId)?.name || 'Account'}`)
                  : tx.category;
                
                return (
                  <div 
                    key={`${tx.id}-${idx}`} 
                    onClick={() => onSelectTransaction?.(tx)}
                    className="flex items-center justify-between p-5 bg-vantage-card/30 thin-border border-white/5 rounded-[1.5rem] hover:bg-vantage-card/50 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div 
                           className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm"
                           style={{ backgroundColor: `${config.color}20`, border: `1px solid ${config.color}40` }}
                         >
                           <config.icon size={22} style={{ color: config.color }} />
                         </div>
                         <div className="absolute -right-1 -bottom-1 w-5 h-5 bg-vantage-black rounded-full flex items-center justify-center border border-white/5 shadow-xl">
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${isOutflow ? 'bg-[#E28743]' : 'bg-vantage-green'} text-black`}>
                              {isOutflow ? <TrendingDown size={8} className="font-black" /> : <Plus size={8} className="font-black" />}
                            </div>
                         </div>
                       </div>
                       <div className="flex flex-col gap-0.5">
                         <span className="text-[13px] font-black text-white uppercase tracking-tight line-clamp-1">{displayCategory}</span>
                         <span className="text-[10px] font-black text-vantage-blue-grey uppercase tracking-[0.1em]">{tx.notes || account.name}</span>
                       </div>
                     </div>
                     <div className="flex flex-col items-end gap-1 shrink-0">
                       <span className={`text-[13px] font-mono font-bold ${isOutflow ? 'text-[#E28743]' : 'text-vantage-green'}`}>
                         {isOutflow ? '-' : '+'}{account.currency} {(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                       </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-neutral-700 uppercase tracking-widest">{formatDateLabel(tx.date)}</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTransaction?.(tx);
                          }}
                          className="p-1.5 text-neutral-700 hover:text-[#E28743] transition-all active:scale-90"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-8 right-8">
        <button 
          onClick={onAddTransaction}
          className="w-16 h-16 bg-vantage-silver rounded-2xl flex items-center justify-center text-vantage-black shadow-[0_0_30px_rgba(224,230,237,0.2)] active:scale-90 transition-transform"
        >
           <Plus size={32} strokeWidth={3} />
        </button>
      </div>
    </div>
  );

};
