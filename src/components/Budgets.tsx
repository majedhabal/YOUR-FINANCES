import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Plus, Trash2, AlertCircle, ChevronRight, TrendingUp, X, Edit2, Check, ArrowUpRight, Tag, ChevronDown, Landmark, Archive as ArchiveIcon } from 'lucide-react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { MASTER_CATEGORIES } from '../lib/constants';
import { BudgetDetailView } from './BudgetDetailView';
import { ConfirmationModal } from './ConfirmationModal';

interface Budget {
  id: string;
  budgetId?: string;
  categoryTitle?: string;
  title?: string;
  allocatedAmount?: number;
  maxBudget?: number;
  spentAmount?: number;
  iconAsset?: string;
  emoji?: string;
  categories: string[];
  subcategories: string[];
  accountIds: string[];
  limit: number;
  spent: number;
  period: string;
  currency: string;
  isArchived?: boolean;
}

interface BudgetsProps {
  profile: any;
}

export const Budgets: React.FC<BudgetsProps> = ({ profile }) => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // Detail/Edit Modal State
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Edit fields
  const [editLimit, setEditLimit] = useState('');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editSubcategories, setEditSubcategories] = useState<string[]>([]);
  const [editAccountIds, setEditAccountIds] = useState<string[]>([]);
  const [editPeriod, setEditPeriod] = useState('monthly');
  const [editCurrency, setEditCurrency] = useState('AED');

  useEffect(() => {
    if (!profile?.uid) return;

    // Listen to miniBudgets
    const qBudgets = query(collection(db, `users/${profile.uid}/miniBudgets`));
    const unsubscribeBudgets = onSnapshot(qBudgets, (snap) => {
      const list = snap.docs.map(doc => {
        const data = doc.data();
        const docId = doc.id;
        const limitVal = data.allocatedAmount !== undefined ? data.allocatedAmount : (data.limit !== undefined ? data.limit : (data.maxBudget || 1));
        const categoriesVal = data.category ? [data.category] : (data.categories || (data.categoryTitle ? [data.categoryTitle] : []));
        const spentVal = data.spentAmount !== undefined ? data.spentAmount : (data.spent || 0);
        return {
          id: docId,
          budgetId: docId,
          limit: limitVal,
          allocatedAmount: limitVal,
          maxBudget: limitVal,
          categories: categoriesVal,
          categoryTitle: data.categoryTitle || data.title || categoriesVal[0] || 'Global Allocation',
          subcategories: data.subcategory ? [data.subcategory] : (data.subcategories || []),
          accountIds: data.accountIds || (data.accountId ? [data.accountId] : []),
          period: data.period || 'daily',
          currency: data.currency || 'AED',
          spentAmount: spentVal,
          spent: spentVal,
          isArchived: data.isArchived || false,
          ...data
        } as any;
      });
      setBudgets(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${profile.uid}/miniBudgets`);
    });

    // Listen to transactions
    const qTransactions = query(collection(db, `users/${profile.uid}/transactions`));
    const unsubscribeTxs = onSnapshot(qTransactions, (snap) => {
      const txList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setTransactions(txList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${profile.uid}/transactions`);
      setLoading(false);
    });

    // Listen to accounts (changed from getDocs to onSnapshot for reactivity)
    const qAcc = query(collection(db, `users/${profile.uid}/accounts`));
    const unsubscribeAcc = onSnapshot(qAcc, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAccounts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${profile.uid}/accounts`);
    });

    // Listen to categories
    const qCat = query(collection(db, `users/${profile.uid}/custom_categories`));
    const unsubscribeCat = onSnapshot(qCat, async (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        try {
          const { fetchGlobalPresets } = await import('../lib/categoryUtils');
          const presets = await fetchGlobalPresets();
          list = presets.map((p, idx) => ({ id: `preset_${idx}`, ...p }));
        } catch (err) {
          list = MASTER_CATEGORIES.map((p, idx) => ({ id: `local_${idx}`, ...p }));
        }
      }
      setUserCategories(list);
    });

    return () => {
      unsubscribeBudgets();
      unsubscribeTxs();
      unsubscribeAcc();
      unsubscribeCat();
    };
  }, [profile?.uid]);

  useEffect(() => {
    const handleOpenDetail = (e: Event) => {
      const customEvent = e as CustomEvent;
      const budgetId = customEvent.detail?.budgetId;
      if (budgetId && budgets.length > 0) {
        const found = budgets.find(b => b.id === budgetId);
        if (found) {
          setSelectedBudget(found);
        }
      }
    };
    window.addEventListener('open-vantage-budget', handleOpenDetail);
    return () => {
      window.removeEventListener('open-vantage-budget', handleOpenDetail);
    };
  }, [budgets]);

  const effectiveCategories: any[] = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;

  const getFilteredTransactions = (budget: Budget) => {
    const now = new Date();
    let startDate = new Date();
    startDate.setHours(0, 0, 0, 0);

    if (budget.period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      const day = now.getDay() || 7;
      startDate.setDate(now.getDate() - day + 1);
    }

    const activeAccountIds = new Set(accounts.filter(a => !a.isArchived).map(a => a.id));

    return transactions.filter(tx => {
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      if (tx.type !== 'expense') return false;
      const txDate = new Date(tx.date);
      if (txDate < startDate || txDate > now) return false;
      
      // Filter by account selection in budget, but also ensure account is NOT archived
      if (budget.accountIds && budget.accountIds.length > 0) {
        const selectedActiveIds = budget.accountIds.filter(id => activeAccountIds.has(id));
        if (selectedActiveIds.length === 0) return false; // No active accounts in this budget
        if (!selectedActiveIds.includes(tx.accountId)) return false;
      } else {
        // If no accountIds specified, only show transactions from active accounts
        if (!activeAccountIds.has(tx.accountId)) return false;
      }

      if (budget.categories && budget.categories.length > 0 && !budget.categories.includes(tx.category)) return false;
      if (budget.subcategories && budget.subcategories.length > 0 && !budget.subcategories.includes(tx.subcategory)) return false;

      // Filter by currency
      if (budget.currency) {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc && acc.currency && acc.currency !== budget.currency) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const getFutureAllocatedTransactions = (budget: Budget) => {
    const now = new Date();
    let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (budget.period !== 'monthly') {
      const day = now.getDay() || 7;
      const sunday = new Date(now);
      sunday.setDate(now.getDate() + (7 - day));
      endDate = sunday;
      endDate.setHours(23, 59, 59, 999);
    }

    const activeAccountIds = new Set(accounts.filter(a => !a.isArchived).map(a => a.id));

    return transactions.filter(tx => {
      if (tx.status === 'draft' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      if (tx.type !== 'expense') return false;
      const txDate = new Date(tx.date);
      if (txDate <= now || txDate > endDate) return false;
      
      // Filter by account selection in budget, but also ensure account is NOT archived
      if (budget.accountIds && budget.accountIds.length > 0) {
        const selectedActiveIds = budget.accountIds.filter(id => activeAccountIds.has(id));
        if (selectedActiveIds.length === 0) return false; 
        if (!selectedActiveIds.includes(tx.accountId)) return false;
      } else {
        if (!activeAccountIds.has(tx.accountId)) return false;
      }

      if (budget.categories && budget.categories.length > 0 && !budget.categories.includes(tx.category)) return false;
      if (budget.subcategories && budget.subcategories.length > 0 && !budget.subcategories.includes(tx.subcategory || '')) return false;

      // Filter by currency
      if (budget.currency) {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc && acc.currency && acc.currency !== budget.currency) return false;
      }

      return true;
    });
  };

  const calculateSpent = (budget: Budget) => {
    return getFilteredTransactions(budget).reduce((acc, tx) => acc + tx.amount, 0);
  };

  const calculateAllocatedFuture = (budget: Budget) => {
    return getFutureAllocatedTransactions(budget).reduce((acc, tx) => acc + tx.amount, 0);
  };

  const handleEditBudget = (budget: Budget) => {
    setSelectedBudget(budget);
    setEditLimit(budget.limit?.toString() || '0');
    setEditCategories(budget.categories || []);
    setEditSubcategories(budget.subcategories || []);
    setEditAccountIds(budget.accountIds || []);
    setEditPeriod(budget.period);
    setEditCurrency(budget.currency || 'AED');
    setIsEditing(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    if (!selectedBudget || !editLimit || editCategories.length === 0 || editAccountIds.length === 0) return;
    
    setIsLoading(true);
    try {
      const budgetRef = doc(db, `users/${profile.uid}/miniBudgets`, selectedBudget.id);
      const limitVal = parseFloat(editLimit);
      await updateDoc(budgetRef, {
        budgetId: selectedBudget.id,
        id: selectedBudget.id, // compatibility
        categoryTitle: editCategories.join(', '),
        title: editCategories.join(', '), // compatibility
        category: editCategories[0] || 'Food & Drinks', // compatibility
        subcategory: editSubcategories[0] || null, // compatibility
        categories: editCategories, // compatibility
        subcategories: editSubcategories, // compatibility
        accountIds: editAccountIds, // compatibility
        allocatedAmount: limitVal,
        maxBudget: limitVal, // compatibility
        limit: limitVal, // compatibility
        period: editPeriod,
        currency: editCurrency,
        updatedAt: new Date().toISOString()
      });
      setIsEditing(false);
      // Update selectedBudget to reflect new changes in detail view
      const updated = budgets.find(b => b.id === selectedBudget.id);
      if (updated) setSelectedBudget(updated);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/miniBudgets/${selectedBudget.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (list: string[], setList: (val: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleArchive = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, `users/${profile.uid}/miniBudgets`, id), {
        isArchived: !currentStatus,
        updatedAt: new Date().toISOString()
      });
      if (selectedBudget?.id === id) {
        setSelectedBudget({ ...selectedBudget, isArchived: !currentStatus });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/miniBudgets/${id}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!budgetToDelete) return;
    setIsLoading(true);
    try {
      await deleteDoc(doc(db, `users/${profile.uid}/miniBudgets`, budgetToDelete.id));
      if (selectedBudget?.id === budgetToDelete.id) {
        setSelectedBudget(null);
        setIsEditing(false);
      }
      setBudgetToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/miniBudgets/${budgetToDelete.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteStatus = (id: string) => {
    // This is just a wrapper for the modal trigger
    const budget = budgets.find(b => b.id === id);
    if (budget) setBudgetToDelete(budget);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-vantage-green/20 border-t-vantage-green rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-20">
      <div className="flex justify-between items-end">
        <div className="flex flex-col gap-1">
          <h2 className="text-[clamp(24px,4.5vw,36px)] text-neutral-900" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>Budgets</h2>
          <div className="flex items-center gap-4">
            <p className="text-[clamp(10px,2.8vw,14px)] text-neutral-500 font-sans" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Status: Active</p>
            <button 
              onClick={() => setShowArchived(!showArchived)}
              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
              className={`text-[9.5px] px-2.5 py-1 rounded-xl border transition-colors ${showArchived ? 'bg-[#20C997] text-white border-[#20C997]' : 'text-neutral-500 border-neutral-200 hover:bg-neutral-50'}`}
            >
              {showArchived ? 'Showing Archived' : 'Show Archived'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 font-sans">
           <div style={{ backgroundColor: '#FFFFFF' }} className="p-3 md:p-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-end min-w-[120px]">
              <span 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className="text-[11px] text-[#57606F] mb-0.5"
              >
                Total Spent
              </span>
              <span 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                className="text-xl md:text-2xl text-emerald-600 font-bold"
              >
                <span className="text-[11px] text-neutral-500 mr-1 font-normal">{profile?.currency || 'AED'}</span>
                {budgets.filter(b => !b.isArchived).reduce((acc, b) => acc + (b.spentAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
           </div>
           <div style={{ backgroundColor: '#FFFFFF' }} className="p-3 md:p-4 rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-end min-w-[120px]">
              <span 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                className="text-[11px] text-[#57606F] mb-0.5"
              >
                Total Allocated
              </span>
              <span 
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                className="text-xl md:text-2xl text-neutral-950 font-bold"
              >
                <span className="text-[11px] text-neutral-500 mr-1 font-normal">{profile?.currency || 'AED'}</span>
                {budgets.filter(b => !b.isArchived).reduce((acc, b) => acc + (b.allocatedAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
           </div>
         </div>
      </div>

      {budgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-neutral-50 rounded-[2.5rem] border border-dashed border-neutral-200">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-neutral-100">
            <PieChart className="text-neutral-400" size={32} />
          </div>
          <span className="text-neutral-800 text-[11px]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>No Budgets Defined</span>
          <p className="text-[11px] text-neutral-500 mt-2 italic text-center max-w-[200px]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            Use the + button to initiate a new budget allocation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {budgets.filter(b => {
            const matchesArchive = showArchived ? b.isArchived : !b.isArchived;
            if (!matchesArchive) return false;

            const activeAccountIds = new Set(accounts.filter(a => !a.isArchived).map(a => a.id));
            if (b.accountIds && b.accountIds.length > 0) {
              return b.accountIds.some(id => activeAccountIds.has(id));
            }
            return true;
          }).map((budget, idx) => {
            const spent = calculateSpent(budget);
            const limit = budget.limit;
            const usage = (spent / limit) * 100;
            const isOver = usage >= 100;
            const isWarning = usage >= 80 && !isOver;
            const remaining = limit - spent;

            return (
              <motion.div
                key={`budget-list-item-${budget.id || 'none'}-${idx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setSelectedBudget(budget)}
                className="group relative bg-white border border-neutral-200 p-6 hover:bg-[#FAFBFD] transition-all flex flex-col cursor-pointer active:scale-95 shadow-sm rounded-2xl"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/10 shrink-0">
                      <TrendingUp className="text-emerald-600" size={24} />
                    </div>
                    <div>
                      <h4 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="text-[clamp(14px,3.8vw,18px)] text-[#1E293B] group-hover:text-emerald-700 transition-colors truncate max-w-[150px] font-sans tracking-tight"
                      >
                        {budget.categoryTitle || budget.title || 'Global Allocation'}
                      </h4>
                      
                      {/* Fractional Breakdown underneath Header */}
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="text-[clamp(11px,2.8vw,13px)] text-[#57606F] block mt-1"
                      >
                        {budget.currency || 'AED'} {spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent of {budget.currency || 'AED'} {limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      <div className="flex items-center gap-2 mt-1">
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          className="text-[clamp(9.5px,2.5vw,11.5px)] text-[#7F8C8D]"
                        >
                          {budget.period} reset period
                        </span>
                        {budget.isArchived && (
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="text-[9px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded"
                          >
                            Archived
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setBudgetToDelete(budget)}
                      className="p-2 text-[#57606F] hover:text-rose-500 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Criteria Summary */}
                <div className="flex flex-wrap gap-2 mb-6 pointer-events-none">
                   {budget.accountIds && budget.accountIds.length > 0 && (
                     <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 border border-neutral-200">
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-[#57606F]">Accounts:</span>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-800">{budget.accountIds.length} selected</span>
                     </div>
                   )}
                   {budget.subcategories && budget.subcategories.length > 0 && (
                     <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 border border-neutral-200">
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-[#57606F]">Subcategories:</span>
                        <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-800">{budget.subcategories.length} mapped</span>
                     </div>
                   )}
                </div>

                <div className="flex justify-between items-end mb-4 mt-auto">
                  <div className="flex flex-col">
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="text-[11.5px] text-[#57606F]"
                    >
                      Spent
                    </span>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(20px, 4.5vw, 24px)', fontWeight: 700 }}
                        className={isOver ? 'text-rose-600' : 'text-neutral-900'}
                      >
                        {budget.currency || 'AED'} {spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {isWarning && (
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          className="px-2 py-0.5 text-[clamp(9.5px,2.2vw,11.5px)] rounded-lg bg-amber-100 text-amber-700 border border-amber-200/40 shrink-0 font-sans"
                        >
                          Near Limit
                        </span>
                      )}
                    </div>
                    {/* Remaining Balance Descriptor */}
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(10.5px, 2.5vw, 13.5px)', fontWeight: 400 }}
                      className="text-neutral-500 leading-relaxed block font-sans"
                    >
                      {isOver ? (
                        <span className="text-rose-600">{(spent - budget.limit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {budget.currency} exceeded</span>
                      ) : (
                        <span>{(budget.limit - spent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {budget.currency} remaining</span>
                      )}
                    </span>
                    
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="text-[10px] text-emerald-700 mt-1.5 block"
                    >
                      Allocated: {budget.currency || 'AED'} {calculateAllocatedFuture(budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      className="text-[11.5px] text-[#57606F] mb-1"
                    >
                      Limit
                    </span>
                    <span 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(14px, 3.2vw, 18px)', fontWeight: 700 }}
                      className="text-neutral-600 font-sans font-bold"
                    >
                      {budget.currency || 'AED'} {budget.limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                {(() => {
                    const allocatedFuture = calculateAllocatedFuture(budget);
                    const totalCommitted = spent + allocatedFuture;
                    const committedUsage = (totalCommitted / budget.limit) * 100;
                    const spentUsage = (spent / budget.limit) * 100;
                    const isTotalOver = totalCommitted > budget.limit;

                    return (
                        <>
                            <div 
                              className="relative w-full bg-neutral-100 rounded-full overflow-hidden mb-4 border border-neutral-200"
                              style={{ height: 'clamp(5px, 1.5vw, 8px)' }}
                            >
                                {/* Layer 2: Projected/Allocated */}
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(committedUsage, 100)}%` }}
                                    transition={{ duration: 0.2 }}
                                    className={`absolute h-full transition-colors rounded-full opacity-30 ${isTotalOver ? 'bg-[#ff3f34]' : 'bg-[#20C997]'}`}
                                    style={{ 
                                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.1) 5px, rgba(255,255,255,0.1) 10px)'
                                    }}
                                />
                                {/* Layer 1: Actual Spent */}
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(spentUsage, 100)}%` }}
                                    transition={{ duration: 0.2 }}
                                    className={`absolute h-full transition-colors rounded-full ${isOver ? 'bg-[#ff3f34]' : isWarning ? 'bg-amber-500' : 'bg-[#20C997]'}`}
                                />
                            </div>

                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    {isOver ? (
                                        <AlertCircle className="text-rose-500 shrink-0" size={14} />
                                    ) : isWarning ? (
                                        <AlertCircle className="text-amber-500 shrink-0" size={14} />
                                    ) : (
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                    )}
                                    <span 
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                        className={`text-[clamp(10px,2.5vw,13px)] font-sans ${isOver ? 'text-rose-500' : isWarning ? 'text-amber-600' : 'text-emerald-600'}`}
                                    >
                                        {isOver ? 'Limit Exceeded' : isWarning ? 'Approaching Limit' : 'Within Limit'}
                                    </span>
                                </div>
                                <span 
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    className="text-[clamp(9.5px,2.4vw,11.5px)] text-[#57606F] font-sans"
                                >
                                    {committedUsage.toFixed(1)}% Committed
                                </span>
                            </div>
                        </>
                    );
                })()}
              </motion.div>
            );
          })}
        </div>
      )}


      {/* Detail Modal */}
      <AnimatePresence>
        {selectedBudget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-0 md:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedBudget(null); setIsEditing(false); }}
              className="absolute inset-0 bg-black/90 backdrop-blur-3xl"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 50 }}
              className={`relative bg-vantage-card border border-white/5 shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
                isEditing 
                  ? 'w-full max-w-2xl rounded-none md:rounded-[3rem] h-full md:h-[90vh]' 
                  : 'w-[95%] max-w-[380px] md:max-w-[440px] rounded-2xl md:rounded-[2rem] h-[86vh] md:h-[82vh] mx-auto'
              }`}
            >
              {isEditing ? (
                <>
                  <div className="p-8 pb-4 flex justify-between items-start border-b border-white/5">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight">
                        Edit Budget
                      </h3>
                      <span className="text-[10px] text-vantage-green uppercase tracking-[0.4em] font-black">
                        Update your budget settings
                      </span>
                    </div>
                    <button onClick={() => setIsEditing(false)} className="p-4 bg-vantage-muted-green/20 rounded-2xl text-vantage-blue-grey hover:text-white transition-colors">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 pt-4 scrollbar-hide">
                    <form id="edit-budget-form" onSubmit={handleUpdate} className="flex flex-col gap-8">
                      <div className="flex flex-col items-center gap-2 mt-4">
                        <span className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Budget Limit</span>
                        <div className="flex items-center gap-2">
                          <select 
                            value={editCurrency}
                            onChange={(e) => setEditCurrency(e.target.value)}
                            className="bg-[#F1F2F6] border border-[#E1E8ED] rounded-xl p-2 outline-none text-2xl font-black text-black appearance-none cursor-pointer text-center min-h-[44px]"
                            style={{ color: '#000000' }}
                          >
                            {['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'JPY'].map(c => <option key={c} value={c} className="bg-white text-black">{c}</option>)}
                          </select>
                          <input 
                            required
                            type="number"
                            value={editLimit}
                            onChange={(e) => setEditLimit(e.target.value)}
                            className="bg-[#F1F2F6] border border-[#E1E8ED] rounded-xl p-3 text-3xl font-black tracking-tight w-48 text-center placeholder:text-neutral-400 text-black outline-none min-h-[44px]"
                            style={{ color: '#000000' }}
                          />
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Target Accounts</label>
                          <div className="flex flex-wrap gap-2">
                            {accounts.map((acc, idx) => (
                              <button
                                key={`edit-budget-acc-${acc.id || idx}-${idx}`}
                                type="button"
                                onClick={() => toggleSelection(editAccountIds, setEditAccountIds, acc.id)}
                                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${editAccountIds.includes(acc.id) ? 'bg-[#00FF88] text-black border-[#00FF88]' : 'bg-[#F1F2F6] border-[#E1E8ED] text-black'}`}
                              >
                                {acc.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Monitored Categories</label>
                           <div className="flex flex-wrap gap-2">
                            {effectiveCategories.map((cat, idx) => (
                              <button
                                key={`edit-budget-cat-${cat.id || cat.name || idx}-${idx}`}
                                type="button"
                                onClick={() => {
                                  toggleSelection(editCategories, setEditCategories, cat.name);
                                  if (editCategories.includes(cat.name)) {
                                    setEditSubcategories(editSubcategories.filter(s => !cat.subcategories.includes(s)));
                                  }
                                }}
                                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${editCategories.includes(cat.name) ? 'bg-[#00FF88] text-black border-[#00FF88]' : 'bg-[#F1F2F6] border-[#E1E8ED] text-black'}`}
                              >
                                {cat.emoji} {cat.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {editCategories.length > 0 && (
                          <div className="flex flex-col gap-3">
                            <label className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Refined Categories</label>
                            <div className="flex flex-wrap gap-2">
                               {effectiveCategories
                                 .filter(c => editCategories.includes(c.name))
                                 .map((cat, idx) => (
                                    <React.Fragment key={`budget-cat-edit-${cat.id || cat.name || idx}`}>
                                      {(cat.subcategories || []).map((sub, sIdx) => (
                                        <button
                                          key={`budget-sub-edit-${cat.name}-${sub}-${cat.id || sIdx}`}
                                          type="button"
                                          onClick={() => toggleSelection(editSubcategories, setEditSubcategories, sub)}
                                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${editSubcategories.includes(sub) ? 'bg-[#00FF88] text-black border-[#00FF88]' : 'bg-[#F1F2F6] border-[#E1E8ED] text-black'}`}
                                        >
                                          {sub}
                                        </button>
                                      ))}
                                    </React.Fragment>
                                 ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-3">
                          <label className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Refresh Cycle</label>
                          <select 
                            value={editPeriod}
                            onChange={(e) => setEditPeriod(e.target.value)}
                            className="w-full bg-[#F1F2F6] border border-[#E1E8ED] rounded-xl p-4 text-[10px] text-black font-black uppercase tracking-widest outline-none min-h-[44px]"
                            style={{ color: '#000000' }}
                          >
                            {['monthly', 'weekly'].map(p => (
                              <option key={p} value={p} className="bg-white text-black text-xs uppercase">{p}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </form>
                  </div>

                  <div className="p-8 border-t border-white/5 bg-vantage-card/95 flex gap-4">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="flex-1 py-4 bg-vantage-muted-green/10 border border-white/5 text-vantage-blue-grey font-black uppercase tracking-widest text-[10px] rounded-[1.5rem] hover:text-white transition-colors active:scale-95"
                    >
                      Cancel
                    </button>
                    <button 
                      form="edit-budget-form"
                      type="submit"
                      disabled={isLoading}
                      style={{ height: '44px' }}
                      className="flex-[2] bg-[#00FF88] text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><Check size={18} /> Apply Changes</>}
                    </button>
                  </div>
                </>
              ) : (
                <BudgetDetailView 
                  budget={selectedBudget}
                  transactions={transactions}
                  accounts={accounts}
                  uid={profile.uid}
                  onBack={() => setSelectedBudget(null)}
                  onEdit={() => handleEditBudget(selectedBudget)}
                  onArchive={handleArchive}
                />
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={budgetToDelete !== null}
        onClose={() => setBudgetToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Budget?"
        message="This will stop tracking these accounts against this limit, but your transaction history will remain safe."
        confirmLabel="Destroy Allocation"
        isLoading={isLoading}
        type="mint"
      />
    </div>
  );
};
