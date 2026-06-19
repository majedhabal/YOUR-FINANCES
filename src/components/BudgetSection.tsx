import React from 'react';
import { Wallet, ShoppingBag, CreditCard, Home, Utensils, Trash2, Plus } from 'lucide-react';

export const BudgetSection: React.FC<{ budgets: any[], accounts: any[], transactions: any[], onDelete: (budget: any) => void, onBudgetClick: (budget: any) => void, onAddExpense: (budget: any) => void }> = ({ budgets, accounts, transactions, onDelete, onBudgetClick, onAddExpense }) => {
  const totalBudgeted = budgets.reduce((sum, b) => sum + (b.allocatedAmount || b.maxBudget || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spentAmount || 0), 0);
  const spentPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  const renderIcon = (iconAsset: string | undefined) => {
    switch (iconAsset) {
      case 'shopping-bag': return <ShoppingBag size={20} className="text-[#1E3A20]" />;
      case 'credit-card': return <CreditCard size={20} className="text-[#1E3A20]" />;
      case 'home': return <Home size={20} className="text-[#1E3A20]" />;
      case 'food': return <Utensils size={20} className="text-[#1E3A20]" />;
      default: return <Wallet size={20} className="text-[#1E3A20]" />;
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-[#E1E8ED] p-6 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold mb-0 text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          Budget Allocation
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
             <div className="text-[10px] uppercase text-neutral-400">{spentPercentage.toFixed(0)}% Spent</div>
             <div className="text-lg font-bold text-[#111C2D]">${totalSpent.toLocaleString()}</div>
           </div>
        </div>
      </div>
      
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="text-center">
           <div className="text-xs uppercase text-neutral-400 mb-1">Total Budgeted</div>
           <div className="font-bold text-[#111C2D] text-lg">${totalBudgeted.toLocaleString()}</div>
        </div>
        <div className="text-center">
           <div className="text-xs uppercase text-neutral-400 mb-1">Remaining</div>
           <div className="font-bold text-[#366945] text-lg">${(totalBudgeted - totalSpent).toLocaleString()}</div>
        </div>
      </div>

      {/* Budget List */}
      <div className="flex flex-col gap-4">
        {budgets.map(b => {
          const bSpent = b.spentAmount || 0;
          const bAllocated = b.allocatedAmount || 1;
          const bProgress = Math.min((bSpent / bAllocated) * 100, 100);
          return (
            <div key={b.id} className="p-1 px-[10px] rounded-lg bg-white cursor-pointer hover:bg-neutral-50" onClick={() => onBudgetClick(b)}>
              <div className="flex justify-between items-center mb-3 pointer-events-none">
                <div className='flex items-center gap-3'>
                  <div className='w-10 h-10 bg-[#A6DDB1] border border-[#E1E8ED] rounded-lg flex items-center justify-center'>
                    {renderIcon(b.iconAsset)}
                  </div>
                  <div className='flex flex-col'>
                    <div className="text-sm font-normal text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{b.categoryTitle}</div>
                    <div className="text-[9px] text-neutral-400 uppercase">{b.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <div className="text-sm font-normal text-[#111C2D] whitespace-nowrap" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      ${bSpent.toLocaleString()} / ${bAllocated.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-neutral-400">{bProgress.toFixed(0)}% Used</div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAddExpense(b); }}
                      className="text-gray-400 hover:text-green-600 p-1 transition-colors self-center pointer-events-auto flex items-center justify-center"
                    >
                      <Plus size={16} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(b); }}
                      className="text-gray-400 hover:text-rose-500 p-1 transition-colors self-center pointer-events-auto flex items-center justify-center"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#A6DDB1] rounded-full transition-all duration-500" 
                  style={{ width: `${bProgress}%` }} 
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
