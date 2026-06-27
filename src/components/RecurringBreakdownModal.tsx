import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Calendar, Info } from 'lucide-react';

interface RecurringItem {
  id: string;
  title?: string;
  notes?: string;
  amount: number;
  type?: string;
  transactionType?: string;
  recurrency?: string;
  frequency?: string;
  interval?: number;
  category?: string;
  calculatedMonthly: number;
}

interface RecurringBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemized: RecurringItem[];
  monthlyIncome: number;
  monthlyExpense: number;
  primaryCurrency: string;
  ratio: number;
  status: string;
}

export const RecurringBreakdownModal: React.FC<RecurringBreakdownModalProps> = ({
  isOpen,
  onClose,
  itemized,
  monthlyIncome,
  monthlyExpense,
  primaryCurrency,
  ratio,
  status,
}) => {
  const { t } = useTranslation();
  const netSurplus = monthlyIncome - monthlyExpense;

  const incomes = itemized.filter(
    item => item.type === 'income' || item.transactionType === 'income'
  );
  const expenses = itemized.filter(
    item => item.type !== 'income' && item.transactionType !== 'income'
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/10 backdrop-blur-md"
          />

          {/* Centered maximum width system for floating bento capsule */}
          <div className="relative w-full max-w-[500px] flex items-center justify-center z-10">
            {/* Ambient deep glow backdrop behind the glass container */}
            <div 
              style={{
                position: 'absolute',
                width: '320px',
                height: '320px',
                borderRadius: '50%',
                background: '#A6DDB1',
                filter: 'blur(90px)',
                opacity: 0.22,
                zIndex: -1,
                pointerEvents: 'none'
              }}
            />

            {/* Modal Container */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              style={{ 
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(30, 34, 41, 0.08)',
                padding: '1.25rem',
                fontFamily: "'Google Sans', sans-serif",
                color: '#1E2229'
              }}
              className="relative w-[calc(100%-2rem)] sm:w-full border rounded-[20px] flex flex-col gap-5 shadow-2xl overflow-hidden max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3 shrink-0">
                <div className="flex flex-col">
                  <h3 
                    style={{ 
                      fontWeight: 500,
                      fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      color: '#1E2229'
                    }}
                    className="tracking-tight"
                  >
                    {t('recurring_breakdown_modal.title')}
                  </h3>
                  <p 
                    style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }}
                    className="text-neutral-500 text-[11px]"
                  >
                    {t('recurring_breakdown_modal.desc')}
                  </p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-neutral-100/50 bg-white/50 backdrop-blur-xs flex items-center justify-center hover:bg-white text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Top Overview Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                <div className="p-3 rounded-xl bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 flex flex-col gap-0.5">
                  <span style={{ fontWeight: 400, color: '#1E2229' }} className="text-[10px]">{t('recurring_breakdown_modal.income')}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)',
                      fontFamily: "'Google Sans', sans-serif"
                    }} 
                    className="text-emerald-600 tracking-tight tabular-nums"
                  >
                    {primaryCurrency} {monthlyIncome < 0 ? '-' : ''}{Math.abs(monthlyIncome).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                
                <div className="p-3 rounded-xl bg-white/40 border border-neutral-100/50 flex flex-col gap-0.5">
                  <span style={{ fontWeight: 400, color: '#1E2229' }} className="text-[10px]">{t('recurring_breakdown_modal.expense')}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)',
                      fontFamily: "'Google Sans', sans-serif"
                    }} 
                    className="text-rose-500 tracking-tight tabular-nums"
                  >
                    {primaryCurrency} {monthlyExpense < 0 ? '-' : ''}{Math.abs(monthlyExpense).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className={`p-3 rounded-xl border flex flex-col gap-0.5 ${
                  netSurplus >= 0 ? 'bg-[#A6DDB1]/10 border-[#A6DDB1]/20 text-[#1E2229]' : 'bg-rose-500/10 border-rose-500/20 text-[#1E2229]'
                }`}>
                  <span style={{ fontWeight: 400 }} className="text-[10px]">{t('recurring_breakdown_modal.surplus')}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)',
                      fontFamily: "'Google Sans', sans-serif"
                    }} 
                    className={`tracking-tight tabular-nums ${netSurplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
                  >
                    {primaryCurrency} {netSurplus < 0 ? '-' : ''}{Math.abs(netSurplus).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Health Coefficient Tracker Info */}
              <div className="px-4 py-2 bg-white/40 border border-neutral-100/50 rounded-xl flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-neutral-400" />
                  <span style={{ fontWeight: 400, color: '#1E2229' }} className="text-[11px]">{t('recurring_breakdown_modal.health_rate')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 600, color: '#1E2229' }} className="text-[12px]">{ratio.toFixed(1)}%</span>
                  <span 
                    style={{ fontWeight: 600, fontFamily: "'Google Sans', sans-serif" }}
                    className={`px-2 py-0.5 text-[9px] rounded-full ${
                      status === 'Elite' ? 'bg-[#A6DDB1]/25 text-emerald-800' :
                      status === 'Stable' ? 'bg-amber-100/60 text-amber-800' :
                      'bg-rose-100/60 text-rose-800'
                    }`}
                  >
                    {status}
                  </span>
                </div>
              </div>

              {/* Lists Scroll Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left">
                {/* Recurring Incomes list */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <ArrowUpRight size={14} className="text-[#10B981]" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('recurring_breakdown_modal.incomes_list')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({incomes.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {incomes.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] py-4 text-center border border-dashed border-neutral-100/50 rounded-xl font-normal">
                        {t('recurring_breakdown_modal.no_incomes')}
                      </div>
                    ) : (
                      incomes.map((item, idx) => (
                        <div 
                          key={`income-commit-${item.id || idx}-${idx}`}
                          style={{ 
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'nowrap',
                            gap: '0.75rem',
                            padding: '1.25rem',
                            fontFamily: "'Google Sans', sans-serif",
                            color: '#1E2229',
                            background: 'rgba(255, 255, 255, 0.55)',
                            backdropFilter: 'blur(22px)',
                            WebkitBackdropFilter: 'blur(22px)',
                            borderRadius: '20px',
                            border: '1px solid rgba(30, 34, 41, 0.08)',
                            boxShadow: '0 8px 32px 0 rgba(166, 221, 177, 0.12)'
                          }}
                          className="hover:bg-white/60 transition-colors w-full min-w-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100/50 flex items-center justify-center text-emerald-600 shrink-0">
                              <TrendingUp size={14} />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 500, 
                                  fontSize: 'clamp(0.95rem, 2.2vw, 1.15rem)', 
                                  color: '#1E2229' 
                                }} 
                                className="truncate leading-tight"
                              >
                                {item.title || item.notes || t('recurring_breakdown_modal.unnamed_salary')}
                              </span>
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 400, 
                                  fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                  color: '#57606F' 
                                }} 
                                className="truncate leading-none mt-1"
                              >
                                {item.category || t('recurring_breakdown_modal.income_cat')} • {item.recurrency || item.frequency || 'Monthly'}
                              </span>
                            </div>
                          </div>

                          {/* Soft translucent sage mint accent progress bar */}
                          <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                            <div className="w-full h-1.5 rounded-full bg-[#A6DDB1]/15 overflow-hidden">
                              <div 
                                style={{ 
                                  width: `${monthlyIncome > 0 ? Math.min(100, (item.calculatedMonthly / monthlyIncome) * 100) : 0}%`,
                                  backgroundColor: '#A6DDB1'
                                }} 
                                className="h-full rounded-full" 
                              />
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0 min-w-0">
                            <span 
                              style={{ 
                                fontWeight: 600, 
                                fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                                fontFamily: "'Google Sans', sans-serif", 
                                color: '#10B981',
                                whiteSpace: 'nowrap'
                              }} 
                              className="tabular-nums leading-none"
                            >
                              +{item.calculatedMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 400, 
                                  fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                  color: '#10B981' 
                                }} 
                                className="ml-1"
                              >
                                {primaryCurrency}
                              </span>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Recurring Expenses list */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <ArrowDownRight size={14} className="text-rose-500" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('recurring_breakdown_modal.expenses_list')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({expenses.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {expenses.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] py-4 text-center border border-dashed border-neutral-100/50 rounded-xl font-normal">
                        {t('recurring_breakdown_modal.no_expenses')}
                      </div>
                    ) : (
                      expenses.map((item, idx) => (
                        <div 
                          key={`expense-commit-${item.id || idx}-${idx}`}
                          style={{ 
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'nowrap',
                            gap: '0.75rem',
                            padding: '1.25rem',
                            fontFamily: "'Google Sans', sans-serif",
                            color: '#1E2229',
                            background: 'rgba(255, 255, 255, 0.55)',
                            backdropFilter: 'blur(22px)',
                            WebkitBackdropFilter: 'blur(22px)',
                            borderRadius: '20px',
                            border: '1px solid rgba(30, 34, 41, 0.08)',
                            boxShadow: '0 8px 32px 0 rgba(166, 221, 177, 0.12)'
                          }}
                          className="hover:bg-white/60 transition-colors w-full min-w-0"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                              <Calendar size={14} />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 500, 
                                  fontSize: 'clamp(0.95rem, 2.2vw, 1.15rem)', 
                                  color: '#1E2229' 
                                }} 
                                className="truncate leading-tight"
                              >
                                {item.title || item.notes || t('recurring_breakdown_modal.expense_title')}
                              </span>
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 400, 
                                  fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                  color: '#57606F' 
                                }} 
                                className="truncate leading-none mt-1"
                              >
                                {item.category || t('recurring_breakdown_modal.utilities_cat')} • {item.recurrency || item.frequency || 'Monthly'}
                              </span>
                            </div>
                          </div>

                          {/* Soft translucent sage mint accent progress bar */}
                          <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                            <div className="w-full h-1.5 rounded-full bg-[#A6DDB1]/15 overflow-hidden">
                              <div 
                                style={{ 
                                  width: `${monthlyExpense > 0 ? Math.min(100, (item.calculatedMonthly / monthlyExpense) * 100) : 0}%`,
                                  backgroundColor: '#A6DDB1'
                                }} 
                                className="h-full rounded-full" 
                              />
                            </div>
                          </div>

                          <div className="flex flex-col items-end shrink-0 min-w-0">
                            <span 
                              style={{ 
                                fontWeight: 600, 
                                fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                                fontFamily: "'Google Sans', sans-serif", 
                                color: '#EF4444',
                                whiteSpace: 'nowrap'
                              }} 
                              className="tabular-nums leading-none"
                            >
                              -{item.calculatedMonthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span 
                                style={{ 
                                  fontFamily: "'Google Sans', sans-serif", 
                                  fontWeight: 400, 
                                  fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                  color: '#EF4444' 
                                }} 
                                className="ml-1"
                              >
                                {primaryCurrency}
                              </span>
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Disclaimer text footer */}
              <div style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] text-neutral-400 text-center border-t border-neutral-200/55 pt-2 leading-tight shrink-0">
                {t('recurring_breakdown_modal.disclaimer')}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
