import React from 'react';
import { Wallet, ShoppingBag, CreditCard, Home, Utensils, Trash2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const BudgetSection: React.FC<{ 
  budgets: any[], 
  accounts: any[], 
  transactions: any[], 
  onDelete: (budget: any) => void, 
  onBudgetClick: (budget: any) => void, 
  onAddExpense: (budget: any) => void,
  baseCurrency?: string
}> = ({ budgets, accounts, transactions, onDelete, onBudgetClick, onAddExpense, baseCurrency = 'AED' }) => {
  const { t } = useTranslation();
  const totalBudgeted = budgets.reduce((sum, b) => sum + (b.allocatedAmount || b.maxBudget || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
  const spentPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const getSubLabel = (title: string, group: string) => {
    const tLabel = title.toLowerCase();
    if (tLabel.includes('rent') || tLabel.includes('util') || tLabel.includes('hous') || tLabel === 'housing') return 'budget_section.rent_and_utilities';
    if (tLabel.includes('grocer') || tLabel.includes('dine') || tLabel.includes('food') || tLabel === 'groceries') return 'budget_section.food_and_dining';
    if (tLabel.includes('fuel') || tLabel.includes('car') || tLabel.includes('transport') || tLabel === 'fuel') return 'budget_section.travel_and_fuel';
    if (tLabel.includes('gym') || tLabel.includes('fitness') || tLabel.includes('sport') || tLabel.includes('clothes') || tLabel.includes('shop') || tLabel === 'fitness') return 'budget_section.shopping_and_lifestyle';
    if (tLabel.includes('saving') || tLabel.includes('invest') || tLabel.includes('estate') || tLabel === 'savings') return 'budget_section.savings_and_growth';
    if (group) {
        // Simple map for now based on group
        if (group === 'needs') return 'budget_section.essential_needs';
        if (group === 'wants') return 'budget_section.personal_wants';
        return `budget_section.${group.toLowerCase()}`;
    }
    return 'budget_section.allocated_budget';
  };

  const renderIcon = (iconAsset: string | undefined, categoryTitle?: string) => {
    const asset = iconAsset || '';
    const title = (categoryTitle || '').toLowerCase();
    
    if (asset === 'shopping-bag' || title.includes('want') || title.includes('shop') || title.includes('clothes') || title.includes('gym')) {
      return <ShoppingBag size={22} className="text-[#134E35]" />;
    }
    if (asset === 'credit-card' || title.includes('debt') || title.includes('credit')) {
      return <CreditCard size={22} className="text-[#134E35]" />;
    }
    if (asset === 'home' || title.includes('rent') || title.includes('util') || title.includes('hous')) {
      return <Home size={22} className="text-[#134E35]" />;
    }
    if (asset === 'food' || title.includes('grocer') || title.includes('dine') || title.includes('food') || title.includes('coffe')) {
      return <Utensils size={22} className="text-[#134E35]" />;
    }
    return <Wallet size={22} className="text-[#134E35]" />;
  };

  const renderBudgetCard = (b: any, bIdx?: number) => {
    const bSpent = b.spentAmount || 0;
    const bAllocated = b.allocatedAmount || 1;
    const bProgress = Math.min((bSpent / bAllocated) * 100, 100);
    const subLabel = getSubLabel(b.categoryTitle || '', b.categoryGroup || '');
    const currencySymbol = baseCurrency === 'USD' ? '$' : '';
    const currencySuffix = baseCurrency !== 'USD' ? ` ${baseCurrency}` : '';

    return (
      <div 
        key={`${b.id || 'b'}-${bIdx || 0}`} 
        id={`budget-card-${b.id}`}
        style={{ fontFamily: "'Google Sans', sans-serif" }}
        className="p-5 bg-white border border-[#E1E8ED] rounded-2xl flex flex-col justify-between gap-3 shadow-sm mb-3.5 cursor-pointer hover:border-neutral-300 transition-all" 
        onClick={() => onBudgetClick(b)}
      >
        {/* Main Content Row */}
        <div className="flex justify-between items-start pointer-events-none">
          {/* Left Element: Icon + Label */}
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 bg-[#EFF4FF] rounded-2xl flex items-center justify-center shrink-0">
              {renderIcon(b.iconAsset, b.categoryTitle)}
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold text-neutral-900 leading-snug" style={{ fontWeight: 700 }}>
                {b.categoryTitle}
              </span>
              <span className="text-[12px] text-neutral-500 font-normal mt-0.5" style={{ fontWeight: 400 }}>
                {t(subLabel)}
              </span>
            </div>
          </div>

          {/* Right Element: Amounts + Percent Used */}
          <div className="flex flex-col items-end">
            <span className="text-[15px] font-bold text-neutral-950" style={{ fontWeight: 700 }}>
              {currencySymbol}{bSpent.toLocaleString()}{currencySuffix} / {currencySymbol}{bAllocated.toLocaleString()}{currencySuffix}
            </span>
            <span className="text-[12px] text-neutral-500 font-medium mt-0.5" style={{ fontWeight: 500 }}>
              {bProgress.toFixed(0)}% {t('budget_section.used')}
            </span>
          </div>
        </div>

        {/* Actions Button Row (aligned right) */}
        <div className="flex justify-end gap-2 mt-1">
          <button 
            id={`budget-add-expense-${b.id}`}
            onClick={(e) => { e.stopPropagation(); onAddExpense(b); }}
            className="w-[34px] h-[34px] bg-[#EBF5EF] hover:bg-[#D5EADF] text-[#134E35] rounded-full flex items-center justify-center pointer-events-auto transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={18} />
          </button>
          <button 
            id={`budget-delete-${b.id}`}
            onClick={(e) => { e.stopPropagation(); onDelete(b); }}
            className="w-[34px] h-[34px] bg-[#FDF2F2] hover:bg-[#FDE2E2] text-[#9B1C1C] rounded-full flex items-center justify-center pointer-events-auto transition-all active:scale-95 cursor-pointer"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-[6px] bg-[#F1F5F9] rounded-full overflow-hidden mt-1">
          <div 
            className="h-full bg-[#82D08E] rounded-full transition-all duration-500" 
            style={{ width: `${bProgress}%` }} 
          />
        </div>
      </div>
    );
  };

  const needsBudgets = budgets.filter(b => b.categoryGroup === 'needs');
  const wantsBudgets = budgets.filter(b => b.categoryGroup === 'wants');
  const savingsBudgets = budgets.filter(b => b.categoryGroup === 'savings' || (!b.categoryGroup && b.categoryTitle !== 'Essential Needs' && b.categoryTitle !== 'Personal Wants'));

  return (
    <section className="bg-white rounded-2xl border border-[#E1E8ED] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold mb-0 text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {t('budget_section.budget_allocation')}
        </h3>
      </div>
      
      {/* Visual Indicator */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative w-48 h-48 flex items-center justify-center mb-2">
           <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100">
             <circle className="text-neutral-100" strokeWidth="10" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
             <circle 
                className="text-[#A6DDB1]" 
                strokeWidth="10" 
                strokeDasharray={251.2} 
                strokeDashoffset={251.2 - (251.2 * Math.min(spentPercentage, 100) / 100)} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" cx="50" cy="50" 
             />
           </svg>
           <div className="absolute text-center">
             <div className="text-[10px] text-neutral-400" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{spentPercentage.toFixed(0)}% spent</div>
             <div className="text-lg font-bold text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalSpent.toLocaleString()}</div>
           </div>
        </div>
      </div>
      
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Total budgeted</div>
           <div className="font-bold text-[#111C2D] text-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalBudgeted.toLocaleString()}</div>
        </div>
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Remaining</div>
           <div className="font-bold text-[#366945] text-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {(totalBudgeted - totalSpent).toLocaleString()}</div>
        </div>
      </div>

      {/* Budget List */}
      <div className="flex flex-col gap-4">
        {needsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-2">Essential Needs</h4>
            {needsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}

        {wantsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-4">Personal Wants</h4>
            {wantsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}

        {savingsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-4">Emergency Funds</h4>
            {savingsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}
      </div>
    </section>
  );
};
