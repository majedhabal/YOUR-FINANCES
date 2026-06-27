import React, { useState } from 'react';
import { Wallet, ShoppingBag, CreditCard, Home, Utensils, Trash2, Plus, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, Tooltip, ResponsiveContainer, XAxis } from 'recharts';
import { BudgetCard } from './BudgetCard';

const isTxMatchingBudget = (tx: any, budget: any) => {
  if (!tx) return false;
  if (tx.type === 'transfer') {
    if (budget.category === 'ACCOUNT FUND TRANSFERS') {
      const matchId = budget.accountId && tx.toAccountId === budget.accountId;
      const matchSub = budget.subcategory && tx.notes?.toLowerCase().includes(budget.subcategory.toLowerCase());
      return tx.transferSide === 'sender' && (matchId || matchSub);
    }
    return false;
  }
  if (tx.budgetId === budget.id) return true;

  if (budget.mappedCategories && Array.isArray(budget.mappedCategories) && budget.mappedCategories.length > 0) {
    if (budget.mappedCategories.includes(tx.category)) {
      if (budget.mappedSubCategories && Array.isArray(budget.mappedSubCategories) && budget.mappedSubCategories.length > 0) {
        return budget.mappedSubCategories.includes(tx.subcategory);
      }
      return true;
    }
    return false;
  }

  if (tx.category === (budget.category || budget.categoryTitle)) {
    if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
      return true;
    }
    return tx.subcategory === budget.subcategory;
  }
  return false;
};

const getGraphData = (budget: any, transactions: any[], locale: string) => {
  const data = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    
    const daySpent = transactions
      .filter(tx => isTxMatchingBudget(tx, budget) && tx.date === dStr)
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
      
    data.push({
      name: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      amount: daySpent
    });
  }
  return data;
};

export const BudgetSection: React.FC<{ 
  budgets: any[], 
  accounts: any[], 
  transactions: any[], 
  onDelete: (budget: any) => void, 
  onBudgetClick: (budget: any) => void, 
  onAddExpense: (budget: any) => void,
  baseCurrency?: string,
  currentPeriod?: string,
  payday?: number,
  onPeriodChange?: (period: string) => void,
  isCurrentPeriod?: boolean
}> = ({ budgets, accounts, transactions, onDelete, onBudgetClick, onAddExpense, baseCurrency = 'AED', currentPeriod, payday = 28, onPeriodChange, isCurrentPeriod = true }) => {
  const { t, i18n } = useTranslation();
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString(i18n.language, { month: 'long' });
    return `${monthName}`;
  };

  const calculateSpentForBudget = (budget: any) => {
    if (!currentPeriod) {
      const currentMonthStr = new Date().toISOString().substring(0, 7);
      return transactions
        .filter(tx => isTxMatchingBudget(tx, budget) && tx.date?.startsWith(currentMonthStr))
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    }

    // Parse YYYY-MM
    const [year, month] = currentPeriod.split('-').map(Number);
    // Start date is year-month-payday
    // End date is one month later, payday - 1
    const startDate = new Date(year, month - 1, payday);
    const endDate = new Date(year, month, payday - 1, 23, 59, 59);

    const startStr = startDate.toLocaleDateString('en-CA');
    const endStr = endDate.toLocaleDateString('en-CA');

    return transactions
      .filter(tx => {
        const matches = isTxMatchingBudget(tx, budget);
        const isInRange = tx.date && tx.date >= startStr && tx.date <= endStr;
        return matches && isInRange;
      })
      .reduce((sum, tx) => sum + (tx.amount || 0), 0);
  };

  const filteredBudgets = currentPeriod 
    ? budgets.filter(b => b.period === currentPeriod)
    : budgets;

  const budgetsWithDynamicSpent = filteredBudgets.map(b => ({
    ...b,
    spentAmount: calculateSpentForBudget(b)
  }));

  const totalBudgeted = budgetsWithDynamicSpent.reduce((sum, b) => sum + (b.allocatedAmount || b.maxBudget || 0), 0);
  const totalSpent = budgetsWithDynamicSpent.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
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
    const isExpanded = expandedBudgetId === b.id;
    const graphData = isExpanded ? getGraphData(b, transactions, i18n.language) : [];

    return (
      <div key={`${b.id || 'b'}-${bIdx || 0}`} className="flex flex-col gap-2">
        <BudgetCard 
          budget={b}
          onCardClick={() => {
            setExpandedBudgetId(isExpanded ? null : b.id);
          }}
          onPlusClick={isCurrentPeriod ? (e) => { e.stopPropagation(); onAddExpense(b); } : undefined}
          onDeleteClick={(e) => { e.stopPropagation(); onDelete(b); }}
          uiOverrides={{
            container: `p-4 bg-white rounded-xl border transition-all cursor-pointer ${isExpanded ? 'border-[#A6DDB1] shadow-md' : 'border-[#E1E8ED]'}`,
            headerContainer: "flex items-center justify-between mb-2",
            iconContainer: "w-10 h-10 rounded-lg bg-[#F0F3FF] flex items-center justify-center text-[#366945]",
            title: "text-sm font-bold text-[#111C2D]",
            category: "text-xs text-neutral-500",
            valuesContainer: "text-right flex items-center gap-2",
            amount: "text-sm font-bold text-[#111C2D]",
            usage: "text-xs text-neutral-400",
            actionButtons: "flex flex-col gap-1",
            progressBarContainer: "w-full bg-neutral-100 rounded-full h-1",
            progressBarFill: "bg-[#A6DDB1] h-1 rounded-full",
          }}
        />
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-neutral-50 rounded-xl border border-neutral-100 p-4"
            >
               <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-neutral-400 tracking-wider" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('budget_section.spending_trend_14_days', 'Spending Trend (Last 14 Days)')}</span>
                  <span className="text-[10px] font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{b.currency || 'AED'}</span>
               </div>
               <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={graphData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`colorAmount-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A6DDB1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#A6DDB1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '12px', 
                          border: 'none', 
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          fontFamily: "'Google Sans', sans-serif",
                          fontSize: '12px'
                        }}
                        labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
                      />
                      <XAxis 
                        dataKey="name" 
                        hide={false} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 8, fill: '#94a3b8', fontWeight: 500 }} 
                        interval="preserveStartEnd"
                        minTickGap={15}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="amount" 
                        stroke="#A6DDB1" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill={`url(#colorAmount-${b.id})`} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const needsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'needs');
  const wantsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'wants');
  const savingsBudgets = budgetsWithDynamicSpent.filter(b => b.categoryGroup === 'savings' || (!b.categoryGroup && b.categoryTitle !== 'Essential Needs' && b.categoryTitle !== 'Personal Wants'));

  return (
    <section className="bg-white rounded-2xl border border-[#E1E8ED] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold mb-0 text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {t('budget_section.budget_allocation')}
        </h3>
      </div>

      {/* Month Selection UI */}
      {currentPeriod && onPeriodChange && (
        <div className="flex items-center justify-between bg-[#F8FAFC] border border-[#E1E8ED] rounded-xl p-3 mb-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          <div className="flex flex-col">
            <span className="text-[14px] text-[#57606F] font-normal">
              {t('essentials.active_viewing_period', 'Active Viewing Period')}
            </span>
            <span className="text-[14px] text-black font-bold">
              {getSalaryBreakdownTitle(currentPeriod)} {t('essentials.breakdown', 'Breakdown')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                const [y, m] = currentPeriod.split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                onPeriodChange(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200 transition-all active:scale-95 shadow-xs bg-white"
            >
              <Calendar size={14} className="text-neutral-400 rotate-180" />
            </button>
            <button 
              onClick={() => {
                const [y, m] = currentPeriod.split('-').map(Number);
                const next = new Date(y, m, 1);
                onPeriodChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
              }}
              className="p-1.5 hover:bg-white rounded-lg border border-neutral-200 transition-all active:scale-95 shadow-xs bg-white"
            >
              <Calendar size={14} className="text-neutral-400" />
            </button>
          </div>
        </div>
      )}
      
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
             <div className="text-[10px] text-neutral-400" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.spent_percent', '{{percent}}% spent', { percent: spentPercentage.toFixed(0) })}</div>
             <div className="text-lg font-bold text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalSpent.toLocaleString()}</div>
           </div>
        </div>
      </div>
      
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.total_budgeted', 'Total budgeted')}</div>
           <div className="font-bold text-[#111C2D] text-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {totalBudgeted.toLocaleString()}</div>
        </div>
        <div className="text-center">
           <div className="text-xs text-neutral-400 mb-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{t('budget_section.remaining', 'Remaining')}</div>
           <div className="font-bold text-[#366945] text-lg" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>{baseCurrency} {(totalBudgeted - totalSpent).toLocaleString()}</div>
        </div>
      </div>

      {/* Budget List */}
      <div className="flex flex-col gap-4">
        {needsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-2">{t('budget_section.essential_needs_header', 'Essential Needs')}</h4>
            {needsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}

        {wantsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-4">{t('budget_section.personal_wants_header', 'Personal Wants')}</h4>
            {wantsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}

        {savingsBudgets.length > 0 && (
          <>
            <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: "20px" }} className="text-[20px] font-bold text-[#111C2D] mb-1.5 mt-4">{t('budget_section.emergency_funds_header', 'Emergency Funds')}</h4>
            {savingsBudgets.map((b, idx) => renderBudgetCard(b, idx))}
          </>
        )}
      </div>
    </section>
  );
};
