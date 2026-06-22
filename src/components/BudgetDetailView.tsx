import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { 
  ChevronLeft,
  MoreHorizontal,
  Home,
  Zap,
  Droplets,
  CreditCard,
} from 'lucide-react';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { doc, deleteDoc, writeBatch, query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

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
  emoji?: string;
  notes?: string;
}

interface Budget {
  id: string;
  categoryTitle: string; // Add this
  categories: string[];
  subcategories: string[];
  accountIds: string[];
  limit: number;
  currency: string;
  period: string;
  allocatedAmount?: number;
  spentAmount?: number;
  iconAsset?: string;
  isArchived?: boolean;
}

interface BudgetDetailViewProps {
  budget: any;
  transactions: Transaction[];
  accounts: any[];
  uid: string;
  onBack: () => void;
  onEdit: () => void;
}

const renderIcon = (asset: string | undefined) => {
  switch (asset) {
    case 'home': return <Home className="text-gray-800" size={24} />;
    case 'zap': return <Zap className="text-gray-800" size={24} />;
    case 'droplets': return <Droplets className="text-gray-800" size={24} />;
    default: return <CreditCard className="text-gray-800" size={24} />;
  }
};

export const BudgetDetailView: React.FC<BudgetDetailViewProps> = ({ 
  budget, 
  transactions, 
  accounts, 
  uid,
  onBack,
  onEdit
}) => {
  const { t } = useTranslation();
  const [selectedTx, setSelectedTx] = React.useState<Transaction | null>(null);
  const [txToDelete, setTxToDelete] = React.useState<any | null>(null);
  
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
        if (!budget.subcategories.includes(tx.subcategory || tx.subCategory || '')) return false;
      }
      
      return true;
    });
  };

  const budgetTxs = useMemo(() => filterBudgetTransactions(transactions).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [transactions, budget]);
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const currentMonthTxs = budgetTxs.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const spentThisMonth = currentMonthTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const limit = budget.limit || budget.allocatedAmount || 0;
  const spentUsage = limit > 0 ? (spentThisMonth / limit) * 100 : 0;

  return (
    <div className="bg-surface min-h-screen flex flex-col font-sans mt-[80px]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Navigation Bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <button onClick={onBack} aria-label="Go back" className="p-2 rounded-full hover:bg-black/5 transition-colors text-[#111c2d]">
          <ChevronLeft size={24} />
        </button>
      </div>

      {/* Budget Header */}
      <header className="mt-[50px] px-0 py-0 flex items-center justify-center">
        <h1 className="text-[36px] font-bold text-[#111c2d] mt-[-70px]">{budget.categoryTitle}</h1>
      </header>

      {/* Budget Summary Card */}
      <section className="mx-[15px] pb-lg">
        <div className="bg-white py-[20px] px-[10px] rounded-[15px] border border-[#F2F4F7] shadow-sm h-[150px] flex flex-col justify-between">
          <div className="flex justify-between items-center mb-xs">
            <span className="font-bold text-[#5f5e5e] text-xs">{t('budget_detail.total_spent')}</span>
            <div className="bg-[#e6f7ef] text-[#366945] px-sm py-xs rounded-full text-xs font-bold uppercase">
              {Math.min(spentUsage, 100).toFixed(0)}% {t('budget_detail.used')}
            </div>
          </div>

          <h2 className="text-4xl font-extrabold text-[#111c2d]">{spentThisMonth.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</h2>

          <div className="flex justify-between text-xs mb-xs">
            <span className="text-[#5f5e5e]">{t('budget_detail.budget_limit')} {limit.toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</span>
            <span className="font-bold text-[#111c2d]">{Math.max(0, limit - spentThisMonth).toLocaleString(undefined, { style: 'currency', currency: 'USD' })} {t('budget_detail.remaining')}</span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-[#e6f7ef] h-3 rounded-full overflow-hidden">
            <div 
              className="bg-[#a6ddb1] h-full rounded-full" 
              style={{ width: `${Math.min(spentUsage, 100)}%` }}
            ></div>
          </div>
        </div>
      </section>

      {/* Auto-Pay & Due Date Cards */}
      <section className="mx-[15px] pb-lg grid grid-cols-2 gap-md pt-[15px]">
        <div className="bg-white p-md rounded-[20px] border border-[#F2F4F7] shadow-sm px-[10px] mr-[10px]">
          <span className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mt-[5px]">{t('budget_detail.auto_pay')}</span>
          <p className="text-lg font-bold text-on-surface mt-[5px]">{t('budget_detail.active')}</p>
        </div>
        <div className="bg-white p-md rounded-[20px] border border-[#F2F4F7] shadow-sm px-[10px] ml-[10px] h-[65px]">
          <span className="font-label-md text-on-surface-variant uppercase tracking-widest text-xs mt-[5px]">{t('budget_detail.due_date')}</span>
          <p className="text-lg font-bold text-on-surface mt-[5px]">Oct 1st</p>
        </div>
      </section>

      {/* Main Content List */}
      <main className="content-area flex-1 bg-surface-container-lowest mx-[15px] px-[10px] mt-[15px]">
        <div className="flex justify-between items-center mb-md">
          <h3 className="text-lg font-bold text-on-surface">{t('budget_detail.recent_transactions')}</h3>
          <span className="text-[#A6DDB1] font-bold text-sm cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'activity' } }))}>{t('budget_detail.view_all')}</span>
        </div>
        <div className="space-y-md">
          {currentMonthTxs.map((tx) => (
            <div key={tx.id} className="flex items-center gap-md">
              <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center border border-outline-variant/20">
                {renderIcon(tx.emoji)}
              </div>
              <div className="flex-1">
                <p className="text-base font-bold text-on-surface">{tx.notes || tx.category}</p>
                <p className="text-xs text-on-surface-variant">
                  {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {tx.subcategory || tx.category}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-on-surface">
                  -${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          ))}
          {currentMonthTxs.length === 0 && <p className="text-on-surface-variant">{t('budget_detail.no_transactions')}</p>}
        </div>
      </main>
    </div>
  );
};
