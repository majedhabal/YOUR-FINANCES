import React from 'react';
import { Target, Trash2, TrendingUp, Plus } from 'lucide-react';

export const SavingsSection: React.FC<{ 
  milestones: any[], 
  accounts: any[], 
  accountBalances: Record<string, number>,
  transactions: any[],
  onDeleteMilestone: (ms: any) => void,
  onAddTransaction: (ms: any) => void,
  onAddGoal: () => void,
  currency: string
}> = ({ milestones, accounts, accountBalances, transactions, onDeleteMilestone, onAddTransaction, onAddGoal, currency }) => {
  // Use optional chaining and default to empty array to prevent crashes
  const activeMilestones = Array.isArray(milestones) 
    ? milestones.filter(m => !m.isArchived) 
    : [];

  // Calculate total saved
  const totalSaved = activeMilestones.reduce((sum, m) => {
    const linkedAccountIds = m.linkedAccountIds || [];
    const linkedBalancesSum = linkedAccountIds.reduce((s: number, id: string) => s + (accountBalances[id] || 0), 0);
    const effectiveCurrentValue = linkedAccountIds.length > 0 ? linkedBalancesSum : (Number(m.currentValue) || 0);
    return sum + effectiveCurrentValue;
  }, 0);

  return (
    <section>
      <h2 className="text-xl font-bold text-[#111C2D] mb-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>Savings Goals</h2>
      
      {/* Total Saved Card */}
      <div className="bg-white rounded-2xl border border-[#E1E8ED] p-5 mb-6 shadow-sm">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>TOTAL SAVED</div>
        <div className="text-3xl font-bold text-[#111C2D] mb-2" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {currency} {totalSaved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E8F8EE] text-[#366945] text-xs font-bold">
          <TrendingUp size={12} />
          +4.2% from last month
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            ACTIVE GOALS
        </h3>
        <button onClick={onAddGoal} className="text-xs text-[#366945] font-bold flex items-center gap-1">
          <Plus size={14} /> Add Goal
        </button>
      </div>

      {/* Goals List */}
      <div className="flex flex-col gap-4">
        {activeMilestones.length > 0 ? (
          activeMilestones.map(m => {
            // Find linked accounts
            const linkedAccountIds = m.linkedAccountIds || []; 
            const linkedBalancesSum = linkedAccountIds.reduce((sum: number, id: string) => sum + (accountBalances[id] || 0), 0);
            
            // Updated current value to use linked account balances if available, otherwise fallback
            const effectiveCurrentValue = linkedAccountIds.length > 0 ? linkedBalancesSum : (Number(m.currentValue) || 0);
            const tar = Number(m.targetAmount) || 0;
            const progress = tar > 0 ? Math.min((effectiveCurrentValue / tar) * 100, 100) : 0;

            // Calculate estimated completion
            const remaining = Math.max(0, tar - effectiveCurrentValue);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const recentCredits = transactions.filter(t => 
              linkedAccountIds.includes(t.toAccountId) && 
              t.amount > 0 && 
              new Date(t.date) >= threeMonthsAgo
            );
            const avgMonthlyContribution = recentCredits.reduce((sum, t) => sum + t.amount, 0) / 3;
            
            let estCompletionDate = null;
            if (avgMonthlyContribution > 0 && remaining > 0) {
              const monthsNeeded = remaining / avgMonthlyContribution;
              const date = new Date();
              date.setMonth(date.getMonth() + Math.ceil(monthsNeeded));
              estCompletionDate = date;
            }

            return (
              <div key={m.id || Math.random()} className="p-4 bg-white rounded-2xl border border-[#E1E8ED] shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 bg-[#f0f3ff] rounded-lg flex items-center justify-center'>
                      <Target size={20} className="text-[#366945]" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#111C2D]">{m.name || 'Unnamed Goal'}</div>
                      <div className="text-[10px] text-gray-500">
                        Est. completion: <span className="font-bold text-gray-900">{estCompletionDate ? estCompletionDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#111C2D]">{currency} {effectiveCurrentValue.toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400">of {currency} {tar.toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col gap-1 -mt-2">
                      <button onClick={() => onAddTransaction(m)} className="text-gray-400 hover:text-[#111C2D] transition-colors">
                        <Plus size={16} />
                      </button>
                      <button onClick={() => onDeleteMilestone(m)} className="text-rose-400 hover:text-rose-600 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-[#A6DDB1] rounded-full transition-all duration-500" 
                    style={{ width: `${progress}%` }} 
                  />
                </div>
                
                <div className="text-[10px] font-bold text-[#366945]">
                  {progress.toFixed(0)}% reached
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-sm text-neutral-400">No active savings goals.</div>
        )}
      </div>
    </section>
  );
};