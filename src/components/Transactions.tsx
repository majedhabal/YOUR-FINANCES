import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, FileDown, RefreshCw, ChevronRight, Plus, Mic, GitBranch, CalendarClock, ShoppingCart, Car, Activity, Tag } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import i18nextInstance from '../lib/i18n';
import { TransactionDetailModal } from './TransactionDetailModal';
import { AddTransactionModal } from './AddTransactionModal';
import { MASTER_CATEGORIES } from '../lib/constants';
import { getAuth } from 'firebase/auth';
import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';

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
  time?: string;
  confirmationDate?: string;
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
  const [recurringTransactions, setRecurringTransactions] = useState<Transaction[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'future'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Inflow' | 'Outflow'>('All');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Custom filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    const filterAccId = localStorage.getItem('transactions_filter_account_id');
    if (filterAccId) {
      setSelectedAccountId(filterAccId);
      setIsFilterDrawerOpen(true);
      localStorage.removeItem('transactions_filter_account_id');
    }
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab === 'activity' && e.detail?.accountId) {
        setSelectedAccountId(e.detail.accountId);
        setIsFilterDrawerOpen(true);
      }
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const txQuery = query(collection(db, 'users', uid, 'transactions'), orderBy('date', 'desc'));
    const recQuery = query(collection(db, 'users', uid, 'recurringTransactions'));
    const catQuery = query(collection(db, `users/${uid}/custom_categories`));
    
    const unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
      const items: Transaction[] = [];
      snapshot.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as Transaction); });
      setTransactions(items);
      setLoading(false);
    });

    const unsubscribeRec = onSnapshot(recQuery, (snapshot) => {
      const items: Transaction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const nextDateValue = data.nextExecutionDate || data.nextGenerationDate;
        let dateStr = nextDateValue;
        if (nextDateValue && typeof nextDateValue.toDate === 'function') {
          dateStr = nextDateValue.toDate().toISOString().split('T')[0];
        } else if (nextDateValue instanceof Date) {
            dateStr = nextDateValue.toISOString().split('T')[0];
        }

        console.log("Recurring TX found:", doc.id, dateStr);
        if (dateStr) {
          items.push({
            id: doc.id,
            date: dateStr,
            amount: data.amount,
            notes: data.title || data.notes || 'Recurring Transaction',
            category: data.category,
            type: data.transactionType || data.type || 'expense',
            accountId: data.sourceAccountId || data.accountId,
            isUpcoming: true
          } as Transaction);
        }
      });
      setRecurringTransactions(items);
    });

    const unsubscribeCat = onSnapshot(catQuery, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setCategories(items);
    });

    return () => { 
      unsubscribeTx(); 
      unsubscribeRec(); 
      unsubscribeCat();
    };
  }, [uid]);

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingTransactions = [
    ...transactions.filter(t => t.date > todayStr).map(t => ({ ...t, isUpcoming: true })), 
    ...recurringTransactions.filter(r => r.date > todayStr).map(t => ({ ...t, isUpcoming: true }))
  ];
  const historicalTransactions = transactions.filter(t => t.date <= todayStr);

  const filterAndSearchList = (list: Transaction[]) => {
    return list.filter(t => {
      const matchesSearch = (t.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (t.category || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = selectedType === 'All' || 
                          t.type === selectedType || 
                          (selectedType === 'Inflow' && (t.type === 'income' || t.type === 'Inflow')) ||
                          (selectedType === 'Outflow' && (t.type === 'expense' || t.type === 'Outflow'));

      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && t.date >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && t.date <= endDate;
      }

      const matchesAccount = selectedAccountId === 'All' || 
                            t.accountId === selectedAccountId ||
                            (() => {
                              const selectedAcc = accounts.find(a => (a.accountId || a.id) === selectedAccountId);
                              return selectedAcc ? (t.accountId === selectedAcc.id || t.accountId === selectedAcc.accountId) : false;
                            })();
      const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;

      return matchesSearch && matchesType && matchesDate && matchesAccount && matchesCategory;
    });
  };

  const groupTransactionsByDate = (list: Transaction[]) => {
    const groups: { [key: string]: Transaction[] } = {};
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(tx => {
      if (!groups[tx.date]) groups[tx.date] = [];
      groups[tx.date].push(tx);
    });
    return groups;
  };

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const formattedDate = date.toLocaleDateString(i18nextInstance.language, { month: 'short', day: 'numeric' });
    
    if (isToday) return `${t('activity.today')}, ${formattedDate}`;
    if (isYesterday) return `${t('activity.yesterday')}, ${formattedDate}`;
    return date.toLocaleDateString(i18nextInstance.language, { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const filteredUpcoming = filterAndSearchList(upcomingTransactions);
  const filteredHistorical = filterAndSearchList(historicalTransactions);
  const groupedHistorical = groupTransactionsByDate(filteredHistorical);
  const groupedUpcoming = groupTransactionsByDate(filteredUpcoming);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 box-border flex flex-col gap-6">
      
      {/* UNIFIED CONTROLLER HEADER BAR */}
      <div className="w-full flex flex-col gap-4">
        <div className="w-full p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px]">
          <div className="relative w-full sm:max-w-[380px] flex items-center">
            <Search size={18} className="absolute left-4 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('activity.search_transactions')}
              className="w-full bg-[#FFFFFF] border border-[#E5E7EB] rounded-full py-2.5 pl-11 pr-12 text-sm text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all placeholder:text-neutral-400 font-medium font-sans"
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

        <div className="w-full flex justify-between items-center bg-white rounded-[24px]">
          <div className="flex gap-2">
            <button 
              onClick={() => setViewMode('future')}
              className={`p-[6px] rounded-[20px] h-[40px] text-[14px] w-[150px] transition-all font-bold flex items-center justify-center ${viewMode === 'future' ? 'text-[#111C2D] bg-[#A6DDB1]' : 'text-[#57606F]'}`}
            >
              {t('activity.future_transactions')}
            </button>
            <button 
              onClick={() => setViewMode('current')}
              className={`p-[6px] rounded-[20px] h-[40px] text-[14px] w-[150px] transition-all font-bold flex items-center justify-center ${viewMode === 'current' ? 'text-[#111C2D] bg-[#A6DDB1]' : 'text-[#57606F]'}`}
            >
              {t('activity.current_transactions')}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFilterDrawerOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }} 
            className="w-full bg-white border border-[#E5E7EB] rounded-[24px] p-5 flex flex-col gap-4 shadow-xs overflow-hidden shrink-0"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Type / Flow filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_type', 'Transaction Type')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {(['All', 'Inflow', 'Outflow'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer"
                      style={{
                        backgroundColor: selectedType === type ? '#A6DDB1' : '#F3F4F6',
                        borderColor: selectedType === type ? 'transparent' : '#E5E7EB',
                        color: selectedType === type ? '#111C2D' : '#4B5563'
                      }}
                    >
                      {type === 'All' ? t('activity.all_records') : (type === 'Inflow' ? t('activity.confirmed_inflows') : t('activity.outflow_statements'))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_account', 'Account')}
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl py-2 px-3 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                >
                  <option value="All">{t('activity.all_accounts', 'All Accounts')}</option>
                  {accounts.filter(a => !a.isArchived || (a.accountId || a.id) === selectedAccountId).map(acc => {
                    const accId = acc.accountId || acc.id;
                    return (
                      <option key={accId} value={accId}>
                        {acc.name} ({acc.currency})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Category filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_category', 'Category')}
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-white border border-[#E5E7EB] rounded-xl py-2 px-3 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                >
                  <option value="All">{t('activity.all_categories', 'All Categories')}</option>
                  {categories.map(cat => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {translateCategoryOrSubcategory(cat.name, t)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_date', 'Date Range')}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-[#E5E7EB] rounded-xl py-1.5 px-2 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                  />
                  <span className="text-gray-400 text-xs font-normal">{t('activity.to', 'to')}</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white border border-[#E5E7EB] rounded-xl py-1.5 px-2 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                  />
                </div>
              </div>
            </div>

            {/* Clear filter option if active */}
            {(selectedType !== 'All' || selectedAccountId !== 'All' || selectedCategory !== 'All' || startDate || endDate) && (
              <div className="flex justify-end pt-2 border-t border-neutral-100">
                <button
                  onClick={() => {
                    setSelectedType('All');
                    setSelectedAccountId('All');
                    setSelectedCategory('All');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs text-red-500 hover:text-red-600 font-bold cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
                >
                  {t('activity.clear_filters', 'Clear Filters')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORICAL LOG CARDS GRID CONTAINER */}
      <div className="w-full flex flex-col gap-10">
        {viewMode === 'future' ? (
           <div className="flex flex-col gap-8">
             {filteredUpcoming.length > 0 ? (
                Object.entries(groupedUpcoming).map(([date, items]) => (
                  <div key={date} className="flex flex-col gap-4">
                    <h3 className="text-xl font-bold text-[#111c2d] pl-1 font-sans">{formatDateHeader(date)}</h3>
                    <div className="bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] overflow-hidden">
                      {items.map((tx, idx) => (
                        <React.Fragment key={tx.id}>
                          <TransactionRow tx={tx} accounts={accounts} onClick={() => setSelectedTx(tx)} />
                          {idx < items.length - 1 && <div className="mx-6 border-b border-neutral-100" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))
             ) : (
                <div className="p-10 text-center bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] text-neutral-400 font-bold text-sm">
                  {t('activity.no_future_found')}
                </div>
             )}
           </div>
        ) : (
          <div className="flex flex-col gap-8">
            {loading ? (
              <div className="w-full p-12 flex justify-center items-center bg-white border border-[#F2F4F7] rounded-[24px] text-neutral-400 font-bold text-sm gap-3">
                <RefreshCw size={20} className="animate-spin text-[#366945]" />
                <span>{t('activity.syncing_db')}</span>
              </div>
            ) : filteredHistorical.length === 0 ? (
              <div className="w-full p-16 flex flex-col justify-center items-center bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] text-center">
                <span className="text-neutral-400 font-bold text-base">{t('activity.no_recorded_logs')}</span>
              </div>
            ) : (
              Object.entries(groupedHistorical).map(([date, items]) => (
                <div key={date} className="flex flex-col gap-4">
                  <h3 className="text-xl font-bold text-[#111c2d] pl-1 font-sans">{formatDateHeader(date)}</h3>
                  <div className="bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] overflow-hidden">
                    {items.map((tx, idx) => (
                      <React.Fragment key={tx.id}>
                        <TransactionRow tx={tx} accounts={accounts} onClick={() => setSelectedTx(tx)} />
                        {idx < items.length - 1 && <div className="mx-6 border-b border-[#F9FAFB]" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))
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
  const { t } = useTranslation();
  const isInflow = ['Inflow', 'income'].includes(tx.type);
  const isOutflow = ['Outflow', 'expense'].includes(tx.type);
  const targetAccount = accounts.find(a => (a.accountId || a.id) === tx.accountId);
  const rawCat = tx.subCategory || tx.subcategory || tx.category || t('common.general');
  const displayCategory = formatLabel(rawCat.includes(' > ') ? rawCat.split(' > ').pop()! : rawCat);

  const translatedCategory = t(`categories.${displayCategory}`, t(`subcategories.${displayCategory}`, displayCategory));
  const getCatIcon = () => {
    const name = displayCategory.toLowerCase();
    if (name.includes('transfer')) return <RefreshCw size={20} />;
    if (name.includes('grocer')) return <ShoppingCart size={20} />;
    if (name.includes('transp')) return <Car size={20} />;
    if (name.includes('health')) return <Activity size={20} />;
    if (name.includes('shop')) return <Tag size={20} />;
    if (name.includes('income') || name.includes('wage')) return <ArrowDownLeft size={20} />;
    return <ShoppingCart size={20} />;
  };

  const getCatStyles = () => {
    const name = displayCategory.toLowerCase();
    if (name.includes('transfer')) return { bg: 'bg-[#F0F4FF]', text: 'text-[#3B82F6]' };
    if (name.includes('grocer')) return { bg: 'bg-[#e8f5e9]', text: 'text-[#366945]' };
    if (name.includes('transp')) return { bg: 'bg-[#f0f4ff]', text: 'text-[#3f51b5]' };
    if (name.includes('health')) return { bg: 'bg-[#fff0f0]', text: 'text-[#d32f2f]' };
    if (name.includes('shop')) return { bg: 'bg-[#ffedfa]', text: 'text-[#c2185b]' };
    if (name.includes('income') || name.includes('wage')) return { bg: 'bg-[#e8f5e9]', text: 'text-[#366945]' };
    return { bg: 'bg-[#FFFFFF] border border-[#E5E7EB]', text: 'text-neutral-500' };
  };

  const styles = getCatStyles();

  return (
    <div 
      onClick={onClick} 
      className="w-full flex items-center justify-between p-6 bg-white cursor-pointer hover:bg-[#F9FAFB] transition-colors active:scale-[0.99] select-none"
    >
      <div className="flex items-center gap-5 min-w-0 flex-1">
        <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center ${styles.bg} ${styles.text}`}>
          {getCatIcon()}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[14px] font-normal text-[#111C2D] truncate font-sans">
            {tx.isUpcoming ? `${translatedCategory} — ${new Date(tx.date).toLocaleDateString(i18nextInstance.language, { month: 'short', day: 'numeric', year: 'numeric' })}` : translatedCategory}
          </span>
          <div className="flex items-center gap-1.5 text-[14px] text-neutral-400 font-bold mt-0.5 font-sans">
            <span className="truncate">{targetAccount?.name || t('common.checking_account')}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 pl-4 text-right flex flex-col items-end">
        <span className={`text-[14px] font-bold font-sans ${isInflow ? 'text-[#366945]' : 'text-[#111C2D]'}`}>
          {isInflow ? '+' : '-'}{targetAccount?.currency || 'AED'} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-[11px] text-neutral-400 font-bold font-sans mt-0.5">
          {tx.time || '10:42 AM'}
        </span>
      </div>
    </div>
  );
};