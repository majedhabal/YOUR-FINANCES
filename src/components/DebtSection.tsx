import React from 'react';
import { Landmark, TrendingDown, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const DebtSection: React.FC<{ 
  accounts: any[], 
  transactions: any[], 
  onDeleteDebt: (acc: any) => void,
  onAddDebtTransaction: (acc: any) => void,
  currency: string
}> = ({ accounts, transactions, onDeleteDebt, onAddDebtTransaction, currency }) => {
  const { t } = useTranslation();
  const debtAccounts = accounts.filter(acc => 
    ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type)
  );
  
  const totalDebt = debtAccounts.reduce((sum, acc) => sum + Math.abs(acc.currentBalance || 0), 0);
  const startingTotal = debtAccounts.reduce((sum, acc) => sum + Math.abs(acc.startingBalance || 0), 0);
  const paid = startingTotal - totalDebt;
  const progress = startingTotal > 0 ? (paid / startingTotal) * 100 : 0;

  return (
    <section>
      <h3 className="text-xl font-bold text-[#111C2D] mb-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        {t('essentials.debt_management', 'Debt Management')}
      </h3>

      {/* Total Debt Card */}
      <div className="bg-white rounded-2xl border border-[#E1E8ED] p-5 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[10px] text-neutral-400">
            {t('debt_section.total_combined_debt', 'Total combined debt')}
          </div>
          <div className="bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-0.5">
              <TrendingDown size={10} /> -2.4%
          </div>
        </div>
        <div className="text-3xl font-bold text-[#111C2D] mb-2" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {currency} {totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-xs text-[#111C2D] mb-1">
          {t('debt_section.principal_paid_progress', 'Principal Paid Progress')} <span className="font-bold">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-neutral-100 rounded-full h-1.5 mb-2">
          <div className="bg-[#A6DDB1] h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="flex justify-between text-[10px] text-neutral-400">
          <span>{currency} {paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('debt_section.paid', 'paid')}</span>
          <span>{currency} {startingTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('debt_section.total', 'total')}</span>
        </div>
      </div>

      {/* Active Liabilities */}
      <h3 className="text-xs font-bold text-gray-500 mb-4" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        {t('debt_section.active_liabilities', 'Active liabilities')}
      </h3>
      <div className="flex flex-col gap-3">
        {debtAccounts.length > 0 ? (
          debtAccounts.map(acc => {
            const payoffProgress = Math.abs(acc.startingBalance || 0) > 0 ? ((Math.abs(acc.startingBalance || 0) - Math.abs(acc.currentBalance || 0)) / Math.abs(acc.startingBalance || 0)) * 100 : 0;
            return (
              <div key={acc.accountId} className="p-4 bg-white rounded-xl border border-[#E1E8ED]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#F0F3FF] flex items-center justify-center text-[#366945]">
                      <Landmark size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#111C2D]">{acc.name}</div>
                      <div className="text-xs text-neutral-500">{t('debt_section.rate_label', 'Rate:')} {acc.interestRate || '0.0'}%</div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                     <div>
                        <div className="text-sm font-bold text-[#111C2D]">-{currency} {Math.abs(acc.currentBalance || 0).toLocaleString()}</div>
                        <div className="text-xs text-neutral-400">
                          {t('debt_section.due_in_days', 'Due in {{count}} days', { count: Math.floor(Math.random() * 30) + 1 })}
                        </div>
                     </div>
                     <div className="flex flex-col gap-1">
                       <button onClick={() => onAddDebtTransaction(acc)} className="p-1 hover:bg-gray-100 rounded text-neutral-400 hover:text-[#111C2D] cursor-pointer bg-transparent border-none">
                          <Plus size={14} />
                       </button>
                       <button onClick={() => onDeleteDebt(acc)} className="p-1 hover:bg-rose-100 text-rose-500 rounded cursor-pointer bg-transparent border-none">
                          <Trash2 size={14} />
                       </button>
                     </div>
                  </div>
                </div>
                <div className="text-[10px] text-neutral-400 mb-1">{t('debt_section.payoff_progress', 'Payoff progress')}</div>
                <div className="w-full bg-neutral-100 rounded-full h-1">
                  <div className="bg-[#A6DDB1] h-1 rounded-full" style={{ width: `${payoffProgress}%` }}></div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-sm text-neutral-400">
            {t('debt_section.no_liabilities_found', 'No active liabilities found.')}
          </div>
        )}
      </div>
    </section>
  );
};
