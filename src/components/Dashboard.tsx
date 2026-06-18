import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, ArrowDownLeft, ArrowRight, TrendingUp, TrendingDown, 
  Wallet, Sparkles, Plus, Landmark, CreditCard, Home, ShieldAlert, Activity, 
  Layers, ListTodo, PiggyBank, CalendarClock, BrainCircuit
} from 'lucide-react';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useVantageActions } from '../hooks/useVantageActions';
import { NetWorthBreakdownModal } from './NetWorthBreakdownModal';
import { CashBreakdownModal } from './CashBreakdownModal';
import { DebtBreakdownModal } from './DebtBreakdownModal';
import { BudgetCard } from './BudgetCard';
import { TrajectoryVisualizer } from './TrajectoryVisualizer';
import { SpendingTrends } from './SpendingTrends';
import { DailyLog } from './DailyLog';

interface DashboardProps {
  profile: any;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  onNavigateToTransactions: (accountId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  accounts = [],
  transactions = [],
  accountBalances = {},
  onNavigateToTransactions
}) => {
  const [isNetWorthOpen, setIsNetWorthOpen] = useState(false);
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isDebtOpen, setIsDebtOpen] = useState(false);

  const primaryCurrency = profile?.baseCurrency || 'AED';

  // Core Math Calculations Engine for Main Bento Summary Cards
  const metrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;

    accounts.forEach(acc => {
      // FIX: Added clear parenthetical scoping to satisfy operator precedence rules
      const balance = (accountBalances[acc.id] ?? acc.startingBalance) || 0;
      const isDebt = ['credit', 'loan', 'mortgage'].includes(acc.type?.toLowerCase());
      
      if (isDebt) {
        totalLiabilities += Math.abs(balance);
      } else {
        totalAssets += balance;
      }
    });

    return {
      netWorth: totalAssets - totalLiabilities,
      cashAvailable: totalAssets,
      debtTotal: totalLiabilities
    };
  }, [accounts, accountBalances]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="w-full flex flex-col gap-6 box-border max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-4">
      
      {/* 📊 SECTION 1: HIGH-FIDELITY SUMMARY BENTO TILES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full box-border">
        
        {/* CARD A: NET WORTH PROTOCOL */}
        <div 
          onClick={() => setIsNetWorthOpen(true)}
          className="p-5 flex flex-col justify-between min-h-[130px] rounded-3xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-all shadow-[var(--shadow-card)] select-none"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">Net wealth matrix</span>
            <Layers size={14} className="text-[#A6DDB1]" />
          </div>
          <div className="flex flex-col mt-4">
            <h2 className="text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold text-white tracking-tight m-0 leading-none">
              {metrics.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-[9px] font-mono text-[#A6DDB1] tracking-wide mt-2 uppercase flex items-center gap-1">
              <Activity size={10} /> Active evaluation index
            </span>
          </div>
        </div>

        {/* CARD B: CASH AVAILABLE LIQUIDITY */}
        <div 
          onClick={() => setIsCashOpen(true)}
          className="p-5 flex flex-col justify-between min-h-[130px] rounded-3xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-all shadow-[var(--shadow-card)] select-none"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">Liquid assets pool</span>
            <Wallet size={14} className="text-emerald-400" />
          </div>
          <div className="flex flex-col mt-4">
            <h2 className="text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold text-white tracking-tight m-0 leading-none">
              {metrics.cashAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-[9px] font-mono text-emerald-400 tracking-wide mt-2 uppercase">Total wallet reserves</span>
          </div>
        </div>

        {/* CARD C: LIABILITY EXPOSURE */}
        <div 
          onClick={() => setIsDebtOpen(true)}
          className="p-5 flex flex-col justify-between min-h-[130px] rounded-3xl border border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-all shadow-[var(--shadow-card)] select-none"
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">Outstanding liabilities</span>
            <ShieldAlert size={14} className="text-rose-400" />
          </div>
          <div className="flex flex-col mt-4">
            <h2 className="text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold text-white tracking-tight m-0 leading-none">
              -{metrics.debtTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <span className="text-[9px] font-mono text-rose-400 tracking-wide mt-2 uppercase">Total leverage balance</span>
          </div>
        </div>

      </div>

      {/* 📊 SECTION 2: CHARTS & CORE PREDICTIVE ENGINES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full box-border">
        <SpendingTrends allTransactions={transactions} selectedAccIds={new Set()} accounts={accounts} baseCurrency={primaryCurrency} getRateToAED={() => 1} />
        <TrajectoryVisualizer startingNetWorth={metrics.netWorth} baseCurrency={primaryCurrency} monthlySalary={profile?.monthlySalary || 0} />
      </div>

      {/* 📊 SECTION 3: RECENT ACTIVITIES LOG FEED */}
      <div 
        className="p-5 flex flex-col gap-4 box-border w-full"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          borderRadius: '24px'
        }}
      >
        <div className="flex items-center justify-between select-none border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-[#A6DDB1]" />
            <h4 className="text-sm font-bold text-white m-0 lowercase">recent cash movements</h4>
          </div>
          <span className="text-[10px] text-neutral-400 font-medium">Last 5 activities</span>
        </div>

        <div className="flex flex-col w-full divide-y divide-white/5">
          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 font-medium select-none">No transactions registered in this vault ledger layer yet.</div>
          ) : (
            recentTransactions.map((tx) => {
              const isInflow = tx.type === 'Inflow' || tx.type === 'income';
              return (
                <div key={tx.id} onClick={() => onNavigateToTransactions(tx.accountId)} className="w-full flex items-center justify-between py-3 bg-transparent cursor-pointer group transition-all">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${isInflow ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                      {isInflow ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1 select-none">
                      <span className="text-xs font-semibold text-white group-hover:text-[#A6DDB1] transition-colors truncate">{tx.notes || 'Unrecorded entry'}</span>
                      <span className="text-[10px] text-neutral-400 font-medium capitalize mt-0.5 truncate">{tx.category?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <div className="text-right pl-4 select-none flex flex-col items-end">
                    <span className={`text-sm font-bold tracking-tight whitespace-nowrap ${isInflow ? 'text-emerald-400' : 'text-white'}`}>
                      {isInflow ? '+' : '-'}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] font-mono text-neutral-500 mt-0.5">{tx.date}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODALS RENDER STREAMS */}
      <NetWorthBreakdownModal isOpen={isNetWorthOpen} onClose={() => setIsNetWorthOpen(false)} accounts={accounts} accountBalances={accountBalances} primaryCurrency={primaryCurrency} exchangeRates={{}} defaultRates={{}} />
      <CashBreakdownModal isOpen={isCashOpen} onClose={() => setIsCashOpen(false)} accounts={accounts} accountBalances={accountBalances} primaryCurrency={primaryCurrency} exchangeRates={{}} defaultRates={{}} />
      <DebtBreakdownModal isOpen={isDebtOpen} onClose={() => setIsDebtOpen(false)} accounts={accounts} accountBalances={accountBalances} primaryCurrency={primaryCurrency} exchangeRates={{}} defaultRates={{}} />
    </div>
  );
};