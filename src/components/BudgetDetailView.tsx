import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Edit3, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Share2,
  Calendar,
  Archive as ArchiveIcon,
  Trash2,
  Lock,
  Clock
} from 'lucide-react';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { doc, deleteDoc, writeBatch, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
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
  amount: number;
  date: string;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  accountId: string;
  type: string;
  status?: string;
  isUpcomingSalaryAllocation?: boolean;
}

interface Budget {
  id: string;
  categories: string[];
  subcategories: string[];
  accountIds: string[];
  limit: number;
  currency: string;
  period: string;
  isArchived?: boolean;
}

interface BudgetDetailViewProps {
  budget: Budget;
  transactions: Transaction[];
  accounts: any[];
  uid: string;
  onBack: () => void;
  onEdit: () => void;
  onArchive?: (id: string, currentStatus: boolean) => void;
}

export const BudgetDetailView: React.FC<BudgetDetailViewProps> = ({ 
  budget, 
  transactions, 
  accounts, 
  uid,
  onBack,
  onEdit,
  onArchive
}) => {
  const [selectedTx, setSelectedTx] = React.useState<Transaction | null>(null);
  const [txToDelete, setTxToDelete] = React.useState<any | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dayOfMonth = now.getDate();

  // Helper to filter transactions for this budget
  const filterBudgetTransactions = (txs: Transaction[]) => {
    const activeAccountIds = new Set(accounts.filter(a => !a.isArchived).map(a => a.id));
    const nowDate = new Date();

    return txs.filter(tx => {
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      if (tx.type !== 'expense') return false;
      if (new Date(tx.date) > nowDate) return false;
      
      // Filter by accounts selection + archive status
      if (budget.accountIds && budget.accountIds.length > 0) {
        const selectedActiveIds = budget.accountIds.filter(id => activeAccountIds.has(id));
        if (selectedActiveIds.length === 0) return false;
        if (!selectedActiveIds.includes(tx.accountId)) return false;
      } else {
        if (!activeAccountIds.has(tx.accountId)) return false;
      }
      
      // Filter by category
      if (budget.categories && budget.categories.length > 0) {
        if (!budget.categories.includes(tx.category)) return false;
      }
      
      // Filter by subcategory
      if (budget.subcategories && budget.subcategories.length > 0) {
        if (!budget.subcategories.includes(tx.subcategory || '')) return false;
      }

      // Filter by currency
      if (budget.currency) {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc && acc.currency && acc.currency !== budget.currency) return false;
      }
      
      return true;
    });
  };

  const upcomingTxs = useMemo(() => {
    const nowDate = new Date();
    nowDate.setHours(23, 59, 59, 999);

    return transactions.filter(tx => {
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      if (tx.type !== 'expense') return false;
      const txDate = new Date(tx.date);
      if (txDate <= nowDate) return false;
      
      // Month check
      if (txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) return false;

      // Category check
      if (budget.categories?.length > 0 && !budget.categories.includes(tx.category)) return false;
      
      // Subcategory check
      if (budget.subcategories?.length > 0 && !budget.subcategories.includes(tx.subcategory || '')) return false;

      // Account check
      if (budget.accountIds?.length > 0 && !budget.accountIds.includes(tx.accountId)) return false;

      return true;
    });
  }, [transactions, budget, currentMonth, currentYear]);

  const totalPlannedUpcoming = upcomingTxs.reduce((sum, tx) => sum + tx.amount, 0);

  const budgetTxs = useMemo(() => filterBudgetTransactions(transactions), [transactions, budget]);

  // Current Month Data
  const currentMonthTxs = budgetTxs.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const spentThisMonth = currentMonthTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const totalAllocatedFuture = totalPlannedUpcoming;
  const totalCommitted = spentThisMonth + totalAllocatedFuture;
  const remainingAfterAllocation = Math.max(0, budget.limit - totalCommitted);
  
  const committedUsage = (totalCommitted / budget.limit) * 100;
  const spentUsage = (spentThisMonth / budget.limit) * 100;
  const isRemainingLow = remainingAfterAllocation < (budget.limit * 0.1);

  // Prev Month Data
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthTxs = budgetTxs.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });
  const spentPrevMonth = prevMonthTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const diffPercent = spentPrevMonth > 0 ? ((spentThisMonth - spentPrevMonth) / spentPrevMonth) * 100 : 0;

  // Trend Data (Cumulative)
  const trendData = useMemo(() => {
    const data = [];
    let cumulative = 0;
    const dailyAvg = spentThisMonth / dayOfMonth;

    for (let i = 1; i <= daysInMonth; i++) {
      const dayTxs = currentMonthTxs.filter(tx => new Date(tx.date).getDate() === i);
      const dayTotal = dayTxs.reduce((sum, tx) => sum + tx.amount, 0);
      
      if (i <= dayOfMonth) {
        cumulative += dayTotal;
        data.push({
          day: `${i}/${currentMonth + 1}`,
          spent: cumulative,
          forecast: cumulative,
          limit: budget.limit
        });
      } else {
        const forecastValue = cumulative + (dailyAvg * (i - dayOfMonth));
        data.push({
          day: `${i}/${currentMonth + 1}`,
          forecast: forecastValue,
          limit: budget.limit
        });
      }
    }
    return data;
  }, [currentMonthTxs, spentThisMonth, dayOfMonth, daysInMonth, budget.limit]);

  // Forecast Stats
  const dailyAverage = spentThisMonth / dayOfMonth;
  const daysRemaining = daysInMonth - dayOfMonth;
  const dailyRecommended = daysRemaining > 0 ? remainingAfterAllocation / daysRemaining : 0;
  const projectTotal = dailyAverage * daysInMonth;
  const riskOfOverspend = projectTotal > budget.limit;
  const predictedExhaustionDay = dailyAverage > 0 ? Math.floor(budget.limit / dailyAverage) : daysInMonth;

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete || !uid) return;
    setIsDeleting(true);
    try {
      if (txToDelete.type === 'transfer') {
        const batch = writeBatch(db);
        batch.delete(doc(db, `users/${uid}/transactions`, txToDelete.id));
        const q = query(collection(db, `users/${uid}/transactions`), where("transferId", "==", txToDelete.id));
        const snapshot = await getDocs(q);
        snapshot.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, `users/${uid}/transactions`, txToDelete.id));
      }
      setTxToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/transactions/${txToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-vantage-deep-slate text-white overflow-hidden p-4 md:p-5"
      style={{ fontFamily: "'Google Sans', sans-serif" }}
    >
      {/* Header Area */}
      <div className="flex items-center justify-between pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button 
            onClick={onBack} 
            className="p-2.5 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-vantage-blue-grey hover:text-white cursor-pointer shrink-0 animate-pulse"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex flex-col min-w-0 text-left">
            <span 
              className="text-[9px] text-vantage-blue-grey uppercase tracking-[0.25em]"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            >
              BUDGET PROTOCOL DETAILED VIEW
            </span>
            <h3 
              className="text-[clamp(13px,3.8vw,16px)] text-white uppercase tracking-tight truncate font-sans"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            >
              {budget.categories?.join(', ').toUpperCase() || 'GLOBAL ALLOCATION'}
              {budget.subcategories?.length > 0 && ` > ${budget.subcategories.join(', ').toUpperCase()}`}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button 
            onClick={() => onArchive?.(budget.id, !!budget.isArchived)}
            className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-vantage-blue-grey hover:text-white cursor-pointer"
            title={budget.isArchived ? "Unarchive" : "Archive"}
          >
            <ArchiveIcon size={15} />
          </button>
          <button 
            onClick={onEdit} 
            className="p-2 bg-[#A6DDB1]/10 rounded-xl hover:bg-[#A6DDB1]/20 transition-colors text-[#A6DDB1] cursor-pointer"
            title="Edit"
          >
            <Edit3 size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable Container Detail Content */}
      <div className="flex-1 overflow-y-auto mt-3 pr-0.5 space-y-3.5 scrollbar-hide">
        {/* Aggregated Spending Status Card */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <span 
              className="text-[9.5px] text-vantage-blue-grey uppercase tracking-widest text-left"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
            >
              {now.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase()} period
            </span>
            <span 
              className={`text-[8.5px] uppercase tracking-widest px-2 py-0.5 rounded-full ${diffPercent > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-[#A6DDB1]/10 text-[#A6DDB1]'}`}
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            >
              {diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(0)}% vs Prev
            </span>
          </div>

          <div className="flex justify-between items-baseline">
            <span 
              className="text-[clamp(21px,5vw,26px)] text-white font-sans text-left"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            >
              {budget.currency} {budget.limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span 
              className="text-[10px] text-vantage-blue-grey uppercase tracking-wider font-sans text-right"
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
            >
              Limit
            </span>
          </div>

          {/* Spent vs Remaining Status Track */}
          <div className="flex flex-col gap-1.5 text-left">
             <div 
               className="flex justify-between text-[clamp(9.5px,2.5vw,11.5px)] uppercase tracking-wider px-0.5 text-vantage-blue-grey font-sans" 
               style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
             >
                <span>Spent: <span className="text-white" style={{ fontWeight: 700 }}>{budget.currency} {spentThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                <span>Remaining: <span className={isRemainingLow ? 'text-rose-500 font-sans' : 'text-[#A6DDB1] font-sans'} style={{ fontWeight: 700 }}>{budget.currency} {remainingAfterAllocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
             </div>
             
             {/* Progress bar track */}
             <div className="relative w-full bg-white/5 rounded-full overflow-hidden border border-white/5" style={{ height: 'clamp(6px, 1.5vw, 10px)' }}>
                {/* Layer 2: Allocated/Projected */}
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(committedUsage, 100)}%` }}
                    className={`absolute inset-0 rounded-full opacity-25 ${totalCommitted > budget.limit ? 'bg-rose-500' : 'bg-[#A6DDB1]'}`}
                    style={{ 
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)'
                     }}
                 />
                 {/* Layer 1: Actual Spent */}
                 <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(spentUsage, 100)}%` }}
                    className={`absolute inset-0 rounded-full ${spentThisMonth > budget.limit ? 'bg-rose-500' : spentThisMonth >= (budget.limit * 0.8) ? 'bg-amber-500' : 'bg-[#A6DDB1] shadow-[0_0_10px_rgba(166,221,177,0.2)]'}`}
                 />
              </div>

              <div 
                className="flex justify-between text-[8px] md:text-[9.5px] uppercase tracking-wider px-0.5 text-vantage-blue-grey font-sans" 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              >
                 <span>Usage: {spentUsage.toFixed(1)}%</span>
                 <span>Committed: <span className="text-white/60">{budget.currency} {totalCommitted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
              </div>
          </div>
        </div>

        {/* Configuration Details Card Stacked */}
        <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 space-y-3 shrink-0 text-left">
           <span 
             className="text-[9.5px] text-vantage-blue-grey uppercase tracking-widest block border-b border-white/5 pb-1.5"
             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
           >
             Configuration Parameters
           </span>

           <div className="grid grid-cols-2 gap-3">
             <div className="flex flex-col">
               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-vantage-blue-grey uppercase tracking-wider">Reset Schedule</span>
               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11.5px] text-white uppercase mt-0.5">{budget.period} reset</span>
             </div>
             <div className="flex flex-col">
               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-vantage-blue-grey uppercase tracking-wider">Target Accounts</span>
               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[11.5px] text-neutral-300 truncate mt-0.5">
                 {budget.accountIds && budget.accountIds.length > 0 
                   ? `${budget.accountIds.length} Mapped`
                   : 'All Accounts'
                 }
               </span>
             </div>
           </div>

           {budget.categories && budget.categories.length > 0 && (
             <div className="flex flex-col gap-1 pt-1.5 border-t border-white/5">
               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-vantage-blue-grey uppercase tracking-wider">Monitored Classes</span>
               <div className="flex flex-wrap gap-1.5 mt-1">
                 {budget.categories.map((c, idx) => (
                   <span 
                     key={`cat-${c}-${idx}`}
                     style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                     className="text-[8.5px] uppercase tracking-wider px-2 py-0.5 bg-white/5 rounded border border-white/5 text-neutral-300 font-sans"
                   >
                     {c}
                   </span>
                 ))}
                 {budget.subcategories?.map((s, idx) => (
                   <span 
                     key={`sub-${s}-${idx}`} 
                     style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                     className="text-[8.5px] uppercase tracking-wider px-2 py-0.5 bg-[#A6DDB1]/10 rounded border border-[#A6DDB1]/20 text-[#A6DDB1]"
                   >
                     {s}
                   </span>
                 ))}
               </div>
             </div>
           )}
        </div>

        {/* Dynamic Warning Alert payload */}
        {riskOfOverspend && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 shrink-0 text-left">
            <div className="w-8 h-8 bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-500 shrink-0">
              <AlertCircle size={16} />
            </div>
            <div className="flex flex-col min-w-0">
              <span 
                className="text-[10px] text-rose-500 uppercase tracking-tight"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
              >
                Warning: Overspend Imminent
              </span>
              <span 
                className="text-[9.5px] text-rose-500/80 uppercase truncate"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              >
                Projected breach by day {predictedExhaustionDay <= daysInMonth ? predictedExhaustionDay : 'this cycle'}
              </span>
            </div>
          </div>
        )}

        {/* HISTORIC AUDIT LEDGER */}
        <div className="flex flex-col gap-2">
           <div className="flex items-center justify-between px-0.5 pb-1 border-b border-white/5">
              <div className="flex flex-col text-left">
                 <h4 
                   className="text-[11px] text-white uppercase tracking-wider font-sans"
                   style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                 >
                   HISTORIC AUDIT LEDGER
                 </h4>
                 <span 
                   className="text-[8px] text-vantage-blue-grey uppercase tracking-widest font-sans"
                   style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                 >
                   ALL TRANSACTION RECORDS FOR THIS CYCLE
                 </span>
              </div>
              <span 
                className="text-[10px] text-vantage-blue-grey uppercase font-mono font-sans"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              >
                {currentMonthTxs.length} ROWS
              </span>
           </div>

           {/* Ledger entries row layout with max stack constraint & compact height h-[50px] */}
           <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-0.5 scrollbar-hide">
              {currentMonthTxs.map((tx, idx) => (
                 <div 
                    key={tx.id || `tx-${idx}`} 
                    onClick={() => setSelectedTx(tx)}
                    className="flex items-center justify-between h-[50px] px-2.5 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all cursor-pointer group shrink-0"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '50px' }}
                 >
                    {/* 70% Left: Date and Notes */}
                    <div className="w-[70%] flex items-center gap-2 pr-2 min-w-0 text-left">
                       <div className="w-7.5 h-7.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm shrink-0">
                          {(tx as any).emoji || '💸'}
                       </div>
                       <div className="flex flex-col min-w-0">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="text-[clamp(11px,2.8vw,13px)] text-white uppercase tracking-tight truncate font-sans"
                          >
                            {(tx as any).notes || tx.category}
                          </span>
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="text-[9px] text-vantage-blue-grey uppercase tracking-wider mt-0.5 truncate font-sans"
                          >
                            {new Date(tx.date).toLocaleDateString()} • {accounts.find(a => a.id === tx.accountId)?.name || 'Account'}
                          </span>
                       </div>
                    </div>
                    {/* 30% Right: Ledger column value amount with regular font size and weight */}
                    <div className="w-[30%] flex items-center justify-end gap-1 text-right shrink-0">
                       <span 
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         className="text-[clamp(11px,2.8vw,13px)] text-[#A6DDB1] font-sans"
                       >
                          -{budget.currency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </span>
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           setTxToDelete(tx);
                         }}
                         className="p-1 text-vantage-blue-grey hover:text-rose-500 transition-all active:scale-95 cursor-pointer shrink-0"
                       >
                         <Trash2 size={11} />
                       </button>
                    </div>
                 </div>
              ))}

              {currentMonthTxs.length === 0 && (
                <div className="py-7 border border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center">
                   <span 
                     className="text-[9px] text-vantage-blue-grey uppercase tracking-widest font-mono font-sans"
                     style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                   >
                     No Ledger Records Found
                   </span>
                </div>
              )}
           </div>
        </div>

        {/* Mini Analytics Chart (Clean cumulative progress overview for desktops/tablets) */}
        <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-3.5 flex flex-col gap-1.5 shrink-0 text-left">
          <span 
            className="text-[9.5px] text-vantage-blue-grey uppercase tracking-widest block border-b border-white/5 pb-1 font-sans"
            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
          >
            Cumulative Forecast
          </span>
          <div className="h-[95px] w-full mt-1.5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 2, right: 2, left: -25, bottom: 0 }}>
                <defs>
                   <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A6DDB1" stopOpacity={0.12}/>
                      <stop offset="95%" stopColor="#A6DDB1" stopOpacity={0}/>
                   </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.02)" />
                <XAxis 
                   dataKey="day" 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{ fontSize: 7, fill: '#8899A6', fontWeight: 'bold' }}
                />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip 
                   contentStyle={{ 
                      backgroundColor: '#1E293B', 
                      borderRadius: '10px', 
                      border: '1px solid rgba(255,255,255,0.05)', 
                      fontSize: '8.5px'
                   }}
                   labelStyle={{ color: '#A6DDB1', fontWeight: 'bold', textTransform: 'uppercase' }}
                />
                <Area 
                   type="monotone" 
                   dataKey="spent" 
                   stroke="#A6DDB1" 
                   strokeWidth={2} 
                   fillOpacity={1} 
                   fill="url(#colorSpent)" 
                   name="Actual"
                />
                <Area 
                   type="monotone" 
                   dataKey="forecast" 
                   stroke="#3B82F6" 
                   strokeDasharray="4 4"
                   strokeWidth={1.5} 
                   fill="none" 
                   name="Forecast"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Main Action Buttons at Bottom */}
      <div className="pt-2 border-t border-white/5 flex gap-2 shrink-0 mt-2">
         <button 
           onClick={onBack}
           className="w-full py-2.5 bg-[#A6DDB1]/10 border border-[#A6DDB1]/15 text-[#A6DDB1] uppercase tracking-widest text-[9.5px] rounded-xl hover:bg-[#A6DDB1]/20 transition-all active:scale-95 cursor-pointer font-sans"
           style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
         >
           DISMISS CONTROLLER
         </button>
      </div>

      <TransactionDetailModal 
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        uid={uid}
      />

      <ConfirmationModal 
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title="Are you sure you want to proceed?"
        message="Are you sure you want to delete this transaction from the database? This action is irreversible."
        confirmLabel="Destroy Record"
        isLoading={isDeleting}
      />
    </div>
  );
};
