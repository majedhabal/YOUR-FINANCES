import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, FileDown, RefreshCw, ChevronRight, Plus, Mic, GitBranch, CalendarClock } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TransactionDetailModal } from './TransactionDetailModal';
import { AddTransactionModal } from './AddTransactionModal';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  notes: string;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  accountId: string;
  type: 'Inflow' | 'Outflow' | 'Transfer' | 'income' | 'expense' | 'transfer' | string;
  status?: string;
  recurringId?: string;
  emoji?: string;
  isUpcoming?: boolean;
  toAccountId?: string;
  transferSide?: string;
  isUpcomingSalaryAllocation?: boolean;
  hasMirror?: boolean;
}

interface TransactionsProps {
  uid: string;
  accounts: any[];
  baseCurrency: string;
  getRateToAED: (curr: string) => number;
  profile: any;
}

export const Transactions: React.FC<TransactionsProps> = ({
  uid, accounts, baseCurrency, getRateToAED, profile
}) => {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'future'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Inflow' | 'Outflow'>('All');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const txQuery = query(collection(db, 'users', uid, 'transactions'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(txQuery, (snapshot) => {
      const items: Transaction[] = [];
      snapshot.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as Transaction); });
      setTransactions(items);
      setLoading(false);
    }, (err) => { 
      console.error("Database tracking link block error:", err); 
      setLoading(false); 
    });
    return () => unsubscribe();
  }, [uid]);

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingTransactions = transactions.filter(t => t.date > todayStr);
  const historicalTransactions = transactions.filter(t => t.date <= todayStr);

  const filterAndSearchList = (list: Transaction[]) => {
    return list.filter(t => {
      const matchesSearch = (t.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (t.category || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = selectedType === 'All' || t.type === selectedType;
      return matchesSearch && matchesType;
    });
  };

  const filteredUpcoming = filterAndSearchList(upcomingTransactions);
  const filteredHistorical = filterAndSearchList(historicalTransactions);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 box-border flex flex-col gap-6">
      
      {/* UNIFIED CONTROLLER HEADER BAR */}
      <div className="w-full flex flex-col gap-4">
        <div className="w-full p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white border border-[#F2F4F7] rounded-[24px] shadow-sm">
          <div className="relative w-full sm:max-w-[380px] flex items-center">
            <Search size={18} className="absolute left-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('activity.search_transactions')}
              className="w-full bg-[#F9FAFB] border border-[#E5E7EB] rounded-full py-2.5 pl-11 pr-12 text-sm text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all placeholder:text-neutral-400 font-medium font-sans"
            />
            <Filter 
              size={18} 
              className={`absolute right-12 cursor-pointer ${isFilterDrawerOpen ? 'text-[#366945]' : 'text-neutral-500'}`}
              onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            />
            <FileDown size={18} className="absolute right-4 text-neutral-500" />
          </div>

          <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
            <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-transparent font-bold text-sm bg-[#A6DDB1] text-[#1E2229] transition-all hover:brightness-105 active:scale-95 cursor-pointer"><Plus size={16} strokeWidth={2.5} /><span>{t('activity.add_entry')}</span></button>
          </div>
        </div>

        <div className="w-full p-2 flex justify-between items-center bg-[#F2F4F7] border border-[#E1E8ED] rounded-[24px]">
          <div className="flex bg-white rounded-full p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('future')}
              className={`px-6 py-2.5 rounded-full text-sm transition-all ${viewMode === 'future' ? 'font-bold text-[#111C2D] bg-[#A6DDB1] shadow-sm' : 'font-normal text-[#57606F]'}`}>{t('activity.future_transactions')}</button>
            <button 
              onClick={() => setViewMode('current')}
              className={`px-6 py-2.5 rounded-full text-sm transition-all ${viewMode === 'current' ? 'font-bold text-[#111C2D] bg-[#A6DDB1] shadow-sm' : 'font-normal text-[#57606F]'}`}>{t('activity.current_transactions')}</button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFilterDrawerOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full flex gap-2 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl overflow-hidden shrink-0">
            {(['All', 'Inflow', 'Outflow'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer"
                style={{
                  backgroundColor: selectedType === type ? '#A6DDB1' : '#F3F4F6',
                  borderColor: selectedType === type ? 'transparent' : '#E5E7EB',
                  color: selectedType === type ? '#111C2D' : '#4B5563'
                }}
              >

                {type === 'All' ? t('activity.all_records') : (type === 'Inflow' ? t('activity.confirmed_inflows') : t('activity.outflow_statements'))}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORICAL LOG CARDS GRID CONTAINER */}
      <div className="w-full flex flex-col gap-6">
        {viewMode === 'future' ? (
           <div className="p-5 flex flex-col gap-3 bg-white border border-[#F2F4F7] rounded-[24px] shadow-sm">
             <h3 className="text-[clamp(1.05rem,2.4vw,1.25rem)] font-semibold text-[#111C2D] m-0 flex items-center gap-2 select-none"><CalendarClock size={18} className="text-[#366945]" /><span>{t('activity.upcoming_transactions')}</span></h3>
             <div className="flex flex-col w-full divide-y divide-gray-100">
               {filteredUpcoming.length > 0 ? (
                 filteredUpcoming.map((tx) => (<TransactionRow key={tx.id} tx={tx} accounts={accounts} onClick={() => setSelectedTx(tx)} />))
               ) : (
                 <div className="py-8 text-center text-gray-400 text-sm">{t('activity.no_future_found')}</div>
               )}
             </div>
           </div>
        ) : (
          <div className="p-5 flex flex-col gap-3 min-h-[250px] bg-white border border-[#F2F4F7] rounded-[24px] shadow-sm">
            <h3 className="text-[clamp(1.05rem,2.4vw,1.25rem)] font-semibold text-[#111C2D] m-0 flex items-center gap-2 select-none"><RefreshCw size={18} className="text-[#366945]" /><span>{t('activity.title')}</span></h3>

            {loading ? (
              <div className="flex-1 flex justify-center items-center py-12 text-neutral-400 font-medium text-sm gap-2 select-none"><RefreshCw size={16} className="animate-spin text-[#A6DDB1]" /><span>{t('activity.syncing_db')}</span></div>
            ) : filteredHistorical.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center py-16 text-center select-none"><span className="text-neutral-400 font-semibold text-sm">{t('activity.no_recorded_logs')}</span></div>
            ) : (
              <div className="flex flex-col w-full divide-y divide-white/5">
                {filteredHistorical.map((tx) => (<TransactionRow key={tx.id} tx={tx} accounts={accounts} onClick={() => setSelectedTx(tx)} />))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTx && (
          <TransactionDetailModal tx={selectedTx} uid={uid} isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} />
        )}
        {isAddModalOpen && (
          <AddTransactionModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} uid={uid} accounts={accounts} onSuccess={() => {}} />
        )}
      </AnimatePresence>
    </div>
  );
};

/* ==========================================================================
   TRANSACTION ROW CHILD CONTAINER SUB-ELEMENT
   ========================================================================== */
const TransactionRow: React.FC<{ tx: Transaction; accounts: any[]; onClick: () => void }> = ({ accounts, tx, onClick }) => {
  const isInflow = tx.type === 'Inflow';
  const targetAccount = accounts.find(a => a.id === tx.accountId);
  const displayCategory = (tx.category || 'Discretionary').replace(/__/g, ' — ').replace(/_/g, ' ').toLowerCase();

  return (
    <div onClick={onClick} className="w-full flex items-center justify-between py-3.5 bg-white border-0 border-b border-gray-100 last:border-0 cursor-pointer group transition-all">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-colors ${isInflow ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {isInflow ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </div>
        <div className="flex flex-col min-w-0 flex-1 select-none">
          <span className="text-[clamp(0.95rem,2.2vw,1.1rem)] font-semibold text-[#111C2D] group-hover:text-[#366945] transition-colors truncate text-human-sentence">{tx.notes || 'Unrecorded financial transaction line log'}</span>
          <div className="flex items-center gap-2 text-xs text-[#8c8c99] font-medium mt-0.5 capitalize truncate">
            <span className="truncate text-human-sentence">{displayCategory}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
            <span className="truncate">{targetAccount?.name || 'Vantage Wallet'}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 pl-4 text-right">
        {tx.isSplit && <div className="p-1.5 rounded-lg bg-[#366945]/10 border border-[#366945]/20 text-[#366945] shrink-0"><GitBranch size={13} /></div>}
        <div className="flex flex-col items-end select-none">
          <span className={`text-[clamp(1.05rem,2.5vw,1.25rem)] font-bold tracking-tight whitespace-nowrap ${isInflow ? 'text-emerald-600' : 'text-[#111C2D]'}`}>
            {isInflow ? '+' : '-'}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-gray-400 font-mono tracking-wider mt-0.5 shrink-0">{tx.date}</span>
        </div>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-[#111C2D] group-hover:translate-x-0.5 transition-all hidden sm:block" />
      </div>
    </div>
  );
};