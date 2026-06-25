import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Home, Utensils, Car, Film, ShoppingBag, HelpCircle } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { useTranslation } from 'react-i18next';

import { formatLabel } from '../lib/stringUtils';

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
  compact?: boolean;
  onCardClick?: () => void;
  onPlusClick?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
  uiOverrides?: {
    container?: string;
    headerContainer?: string;
    iconContainer?: string;
    title?: string;
    category?: string;
    valuesContainer?: string;
    amount?: string;
    usage?: string;
    actionButtons?: string;
    progressBarContainer?: string;
    progressBarFill?: string;
  };
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
  uiOverrides,
}) => {
  const { t } = useTranslation();
  // Extract fields aligning with exact payload
  const maxLimit = budget.allocatedAmount !== undefined ? budget.allocatedAmount : (budget.maxBudget || budget.amount || 1);
  const spentVal = spent !== undefined ? spent : (budget.spentAmount !== undefined ? budget.spentAmount : (budget.spent || 0));
  const ratio = maxLimit > 0 ? spentVal / maxLimit : 0;
  const progress = Math.min(ratio * 100, 100);
  const isOver = spentVal > maxLimit;
  
  const titleText = budget.subcategory 
    ? t(`subcategories.${budget.subcategory}`, formatLabel(budget.subcategory))
    : formatLabel(
        (budget.categoryTitle?.includes(' > ') ? budget.categoryTitle.split(' > ').pop() : 
         budget.categoryTitle || budget.title || budget.category || t('budget_card.allocation'))
      );
     
  const IconComponent = getCategoryIcon(String(titleText));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onCardClick}
      className={uiOverrides?.container || "p-4 bg-white rounded-xl border border-[#E1E8ED] shadow-sm cursor-pointer"}
    >
      <div className={uiOverrides?.headerContainer || "flex items-center justify-between mb-4"}>
        {/* Icon & Title Information */}
        <div className="flex items-center gap-3">
          <div className={uiOverrides?.iconContainer || "w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700 shrink-0"}>
            <IconComponent size={20} />
          </div>
          <div>
            <div className={uiOverrides?.title || "text-sm font-bold text-[#111C2D]"} style={{ fontFamily: "'Google Sans', sans-serif" }}>
              {titleText}
            </div>
          </div>
        </div>

        {/* Numerical values & Action buttons */}
        <div className={uiOverrides?.valuesContainer || "text-right flex items-center gap-2"}>
            <div>
              <div className={uiOverrides?.amount || "text-sm font-bold text-[#111C2D]"} style={{ fontFamily: "'Google Sans', sans-serif" }}>
                {budget.currency || 'AED'} {spentVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / {maxLimit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className={uiOverrides?.usage || "text-xs text-neutral-400"} style={{ fontFamily: "'Google Sans', sans-serif" }}>
                {progress.toFixed(0)}% {t('budget_card.used', 'Used')}
              </div>
            </div>
          
            {/* Quick operational triggers */}
            <div className={uiOverrides?.actionButtons || "flex flex-col gap-1"}>
              {onPlusClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic(hapticPresets.medium);
                    onPlusClick(e);
                  }}
                  className="p-1 hover:bg-emerald-100 rounded text-emerald-700 flex items-center justify-center transition-all"
                >
                  <Plus size={14} />
                </button>
              )}
              {onDeleteClick && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(e);
                  }}
                  className="p-1 hover:bg-rose-100 rounded text-rose-500 flex items-center justify-center transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
        </div>
      </div>

      {/* Progress slider bar at the bottom */}
      <div className="text-[10px] text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('budget_card.used', 'Used')}</div>
      <div className={uiOverrides?.progressBarContainer || "w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden"}>
        <div 
          style={{ width: `${progress}%` }}
          className={uiOverrides?.progressBarFill || `h-full ${isOver ? 'bg-rose-500' : 'bg-[#A6DDB1]'}`}
        />
      </div>
    </motion.div>
  );
};

