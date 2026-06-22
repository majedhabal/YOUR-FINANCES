import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Home, Utensils, Car, Film, ShoppingBag, HelpCircle } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { useTranslation } from 'react-i18next';

export interface BudgetCategory {
  id: string;
  budgetId?: string; // exact payload compatibility
  title?: string;
  categoryTitle?: string; // exact payload compatibility
  maxBudget?: number;
  allocatedAmount?: number; // exact payload compatibility
  amount?: number; // fallback
  currency: string;
  category?: string;
  subcategory?: string | null;
  emoji?: string;
  iconAsset?: string; // exact payload compatibility
  spentAmount?: number; // exact payload compatibility
  spent?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  lastHistorySnapshotDate?: any;
  createdAt?: any;
}

interface BudgetCardProps {
  budget: BudgetCategory;
  spent?: number;
  compact?: boolean; // If true, rendering is simpler/more condensed
  onCardClick?: () => void;
  onPlusClick?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
}

const getCategoryIcon = (category: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('house') || cat.includes('housing') || cat.includes('rent') || cat.includes('home') || cat.includes('utilities')) {
    return Home;
  }
  if (cat.includes('food') || cat.includes('drink') || cat.includes('grocery') || cat.includes('groceries') || cat.includes('supermarket') || cat.includes('dining') || cat.includes('restaurant')) {
    return Utensils;
  }
  if (cat.includes('transport') || cat.includes('car') || cat.includes('vehicle') || cat.includes('fuel') || cat.includes('gas') || cat.includes('commute')) {
    return Car;
  }
  if (cat.includes('entertainment') || cat.includes('movie') || cat.includes('sub') || cat.includes('netflix') || cat.includes('leisure') || cat.includes('spotify') || cat.includes('play')) {
    return Film;
  }
  if (cat.includes('shopping') || cat.includes('bag') || cat.includes('clothes') || cat.includes('clothing') || cat.includes('electronics')) {
    return ShoppingBag;
  }
  return HelpCircle;
};

export const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  spent,
  compact = false,
  onCardClick,
  onPlusClick,
  onDeleteClick,
}) => {
  const { t } = useTranslation();
  // Extract fields aligning with exact payload
  const maxLimit = budget.allocatedAmount !== undefined ? budget.allocatedAmount : (budget.maxBudget || budget.amount || 1);
  const spentVal = spent !== undefined ? spent : (budget.spentAmount !== undefined ? budget.spentAmount : (budget.spent || 0));
  const ratio = maxLimit > 0 ? spentVal / maxLimit : 0;
  const progress = Math.min(ratio * 100, 100);
  const isOver = spentVal > maxLimit;
  
  const titleText = budget.categoryTitle || budget.title || budget.category || t('budget_card.allocation');
  const categoryText = budget.subcategory || budget.category || t('budget_card.rent_and_utilities');

  const IconComponent = getCategoryIcon(titleText);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onCardClick}
      className={`w-full relative overflow-hidden group bg-white border border-neutral-150 hover:bg-neutral-50/50 cursor-pointer rounded-2xl p-4 flex flex-col justify-between transition-all duration-300 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]`}
    >
      <div className="flex items-start justify-between w-full mb-3 gap-3">
        {/* Left Side: Icon & Title Information */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-neutral-100 text-[#366945] border border-neutral-150/40 shrink-0 group-hover:bg-primary-container/20 transition-all duration-300">
            <IconComponent size={18} className="text-[#366945]" />
          </div>
          <div className="flex flex-col min-w-0 select-none">
            <span className="text-neutral-900 group-hover:text-emerald-700 transition-colors truncate font-bold text-sm leading-tight"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
              {titleText}
            </span>
            <span className="text-xs text-neutral-400 mt-1 truncate font-normal"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
              {categoryText}
            </span>
          </div>
        </div>

        {/* Right Side: Numerical ratio values */}
        <div className="text-right flex flex-col shrink-0 items-end select-all">
          <span className="text-neutral-900 text-sm font-bold leading-tight"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
            {budget.currency || 'AED'} {spentVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / {maxLimit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-neutral-400 mt-1 font-normal leading-none"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
            {progress.toFixed(0)}% {t('budget_card.used')}
          </span>
        </div>
      </div>

      {/* Progress slider bar container */}
      <div className="w-full relative">
        <div className="w-full bg-neutral-100 rounded-full overflow-hidden"
             style={{ height: '4px' }}>
          <div 
            style={{ width: `${progress}%` }}
            className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : 'bg-[#A6DDB1]'}`}
          />
        </div>
      </div>

      {/* Quick operational triggers for deletion or quick allocation */}
      {(onDeleteClick || onPlusClick) && (
        <div className="flex items-center justify-end gap-1 mt-2.5 pt-1.5 border-t border-neutral-50">
          {onPlusClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(hapticPresets.medium);
                onPlusClick(e);
              }}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="flex items-center gap-1 px-2 py-1 bg-neutral-50 hover:bg-[#A6DDB1]/10 text-neutral-500 hover:text-emerald-800 text-[10px] rounded-lg transition-all"
            >
              <Plus size={10} /> {t('budget_card.add_spend')}
            </button>
          )}
          {onDeleteClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick(e);
              }}
              className="p-1 text-neutral-300 hover:text-rose-500 transition-all cursor-pointer"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

