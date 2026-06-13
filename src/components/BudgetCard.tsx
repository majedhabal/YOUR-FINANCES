import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

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

const getIconComponent = (name?: string) => {
  if (!name) return null;
  
  // Convert kebab-case (e.g. shopping-cart) to PascalCase (e.g. ShoppingCart)
  const pascalName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  
  const IconComponent = (LucideIcons as any)[pascalName] || (LucideIcons as any)[name];
  return IconComponent || null;
};

export const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  spent,
  compact = false,
  onCardClick,
  onPlusClick,
  onDeleteClick,
}) => {
  // Extract fields aligning with exact payload
  const maxLimit = budget.allocatedAmount !== undefined ? budget.allocatedAmount : (budget.maxBudget || budget.amount || 1);
  const spentVal = spent !== undefined ? spent : (budget.spentAmount !== undefined ? budget.spentAmount : (budget.spent || 0));
  const ratio = maxLimit > 0 ? spentVal / maxLimit : 0;
  const progress = Math.min(ratio * 100, 100);
  const isOver = spentVal > maxLimit;
  const isNearLimit = (ratio >= 0.80 && ratio < 1.0);
  
  const titleText = budget.categoryTitle || budget.title || budget.category || 'Allocation';
  const categoryText = budget.category || 'Budget Envelope';
  const cycleText = budget.period ? `${budget.period.charAt(0).toUpperCase()}${budget.period.slice(1)}` : 'Monthly';

  // Resolve custom icon asset
  const IconComp = getIconComponent(budget.iconAsset);
  const emojiStr = budget.emoji || (budget.iconAsset && budget.iconAsset.length === 1 ? budget.iconAsset : '🍟');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onCardClick}
      className={`w-full relative overflow-hidden group vantage-glass-base glass-card border-[1px] ${isOver ? 'border-[#ff3f34] bg-[#ff3f34]/5' : (isNearLimit ? 'border-amber-300 bg-amber-500/5' : 'border-neutral-200')} cursor-pointer rounded-2xl flex flex-col justify-between`}
      style={{
        padding: compact ? '12px' : 'clamp(14px, 3vw, 20px)',
        minHeight: compact ? 'clamp(76px, 16vw, 95px)' : 'clamp(120px, 26vw, 140px)',
      }}
    >
      {/* Subtle progress bar background overlay */}
      <div 
        className={`absolute inset-y-0 left-0 ${isOver ? 'bg-[#ff3f34]/5' : (isNearLimit ? 'bg-amber-500/5' : 'bg-vantage-green/5')} transition-all duration-500 ease-out z-0 pointer-events-none`}
        style={{ width: `${progress}%` }}
      />

      <div className="relative flex items-center justify-between z-10 w-full gap-2 sm:gap-3">
        {/* Information Section */}
        <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0 pr-1">
          <div className="rounded-xl flex items-center justify-center bg-neutral-100 text-[#1E293B] border border-neutral-200 text-sm shrink-0"
               style={{
                 width: compact ? 'clamp(28px, 6vw, 36px)' : '42px',
                 height: compact ? 'clamp(28px, 6vw, 36px)' : '42px',
               }}>
            {IconComp ? (
              <IconComp size={compact ? 16 : 20} className="text-[#57606F]" />
            ) : (
              <span style={{ fontFamily: "inherit" }}>{emojiStr}</span>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="tracking-tight text-neutral-900 truncate leading-none"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 700,
                      fontSize: compact ? 'clamp(11px, 3.4vw, 14px)' : 'clamp(12px, 3.8vw, 15px)' 
                    }}>
                {titleText}
              </span>
              <span 
                className="px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] text-[#57606F] border border-neutral-200 leading-none scale-90 shrink-0 font-normal"
                style={{ fontFamily: "'Google Sans', sans-serif" }}
              >
                {cycleText}
              </span>
            </div>
            
            {/* Fractional numerical breakdowns directly underneath the card headers */}
            <span className="tracking-tight text-[#57606F] block font-normal leading-normal mb-1"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: compact ? 'clamp(10px, 3.2vw, 11px)' : 'clamp(11px, 2.2vw, 12.5px)' 
                  }}>
              {budget.currency || 'AED'} {(spentVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent of {budget.currency || 'AED'} {maxLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            
            <span className="tracking-tight text-[#7F8C8D] truncate leading-none font-normal"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontSize: compact ? 'clamp(8.5px, 2.8vw, 10px)' : 'clamp(9.5px, 1.8vw, 10.5px)' 
                  }}>
              {categoryText}
            </span>
          </div>
        </div>

        {/* Interaction/Spent Section */}
        <div className="flex-none flex flex-col items-end border-l border-neutral-200 pl-2 sm:pl-3 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 leading-none">
            <span className="tracking-tight whitespace-nowrap"
                  style={{
                    fontFamily: "'Google Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: compact ? 'clamp(11px, 3.4vw, 14px)' : 'clamp(12px, 3.8vw, 16px)',
                    color: isOver ? '#ff3f34' : (isNearLimit ? '#D97706' : '#20C997')
                  }}>
              {(spentVal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {onPlusClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic(hapticPresets.medium);
                  onPlusClick(e);
                }}
                className="rounded-full bg-vantage-green flex items-center justify-center text-white shadow-lg shadow-vantage-green/20 hover:scale-105 active:scale-95 transition-all shrink-0 animate-fade-in"
                style={{
                  width: compact ? 'clamp(16px, 4vw, 20px)' : 'clamp(18px, 4.5vw, 22px)',
                  height: compact ? 'clamp(16px, 4vw, 20px)' : 'clamp(18px, 4.5vw, 22px)',
                }}
              >
                <Plus size={compact ? 8 : 10} strokeWidth={4} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 mt-0.5 leading-none">
            <span className="text-[#57606F] tracking-tight leading-none whitespace-nowrap font-normal"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontSize: compact ? 'clamp(10px, 3.2vw, 12px)' : 'clamp(10px, 2vw, 11px)' 
                  }}>
              /{maxLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {budget.currency || 'AED'}
            </span>
            {onDeleteClick && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(e);
                }}
                className="p-1 text-[#57606F] hover:text-[#ff3f34] transition-all active:scale-95 shrink-0"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bar indicator - full details or clean layout */}
      <div className="w-full relative z-10 mt-1">
        <div className="w-full bg-neutral-150 rounded-full overflow-hidden"
             style={{ height: 'clamp(5px, 1.8vw, 8px)' }}>
          <div 
            style={{ width: `${progress}%` }}
            className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-[#ff3f34]' : (isNearLimit ? 'bg-amber-500' : 'bg-vantage-green')}`}
          />
        </div>
        <div className="flex items-center justify-between mt-1 text-neutral-500 font-normal"
             style={{ 
               fontFamily: "'Google Sans', sans-serif", 
               fontSize: compact ? 'clamp(10px, 3.2vw, 12px)' : 'clamp(10.5px, 2vw, 11.5px)' 
             }}>
          <span>{progress.toFixed(0)}% Used</span>
          <span style={{ fontWeight: 700 }} className={isOver ? 'text-[#ff3f34]' : (isNearLimit ? 'text-amber-500' : 'text-emerald-700')}>
            {isOver ? 'Limit Exceeded' : (isNearLimit ? 'Near Limit' : 'Within Budget')}
          </span>
         </div>
      </div>
    </motion.div>
  );
};

