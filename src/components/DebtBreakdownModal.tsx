import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, CreditCard, TrendingDown, Percent, Calendar } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  creditLimit?: number;
  interestRate?: number;
  paymentDueDate?: string;
  loanDirection?: string;
  isArchived?: boolean;
}

interface DebtBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  accountBalances: { [key: string]: number };
  primaryCurrency: string;
  exchangeRates: any;
  defaultRates: { [key: string]: number };
}

export const DebtBreakdownModal: React.FC<DebtBreakdownModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  primaryCurrency,
  exchangeRates,
  defaultRates,
}) => {
  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (defaultRates as any)[c] || 1;
  };

  const baseRateToAED = getRateToAED(primaryCurrency);

  // Criteria matching:
  // liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage']
  // And acc.loanDirection !== 'lent'
  const allNonArchived = accounts.filter(acc => !acc.isArchived);
  const liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'];
  const liabilityAccounts = allNonArchived.filter(
    acc => liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent'
  );

  const debtList = liabilityAccounts.map(acc => {
    const bal = accountBalances[acc.id] || 0;
    const rate = getRateToAED(acc.currency);
    const balInAED = bal * rate;
    const balInPrimary = balInAED / baseRateToAED;
    return {
      ...acc,
      originalBalance: bal,
      balanceInPrimary: balInPrimary,
    };
  });

  // Since debts are negative in balances, we represent total debt as positive (or negative with minus sign)
  const totalDebt = debtList.reduce((sum, item) => {
    return sum + (item.balanceInPrimary < 0 ? Math.abs(item.balanceInPrimary) : 0);
  }, 0);

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
                    Total Debts Breakdown
                  </h3>
                  <p 
                    style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }}
                    className="text-neutral-500 text-[11px]"
                  >
                    Credit cards, personal loans, and active mortgages
                  </p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-neutral-100/50 bg-white/50 backdrop-blur-xs flex items-center justify-center hover:bg-white text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Calculations Summary Card */}
              <div className="p-4 rounded-xl bg-white/40 border border-neutral-100/50 flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-neutral-500 text-[11px]">Liability Summary</span>
                  <span style={{ fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }} className="text-rose-600 text-[10px] bg-rose-50/50 px-2 py-0.5 rounded-full">
                    Outstanding Debt
                  </span>
                </div>
                
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'nowrap',
                  width: '100%'
                }} className="flex items-center justify-between flex-nowrap w-full">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }} className="text-[11px]">Total Outstanding Debt ({primaryCurrency})</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.15rem, 2.8vw, 1.45rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      whiteSpace: 'nowrap'
                    }} 
                    className="tracking-tight tabular-nums text-rose-500"
                  >
                    -{totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Account Lists - Scrollable Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <TrendingDown size={14} className="text-rose-500" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      Liability Accounts
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({debtList.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {debtList.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] font-normal py-4 text-center border border-dashed border-neutral-100/50 rounded-xl">
                        No active debt accounts found.
                      </div>
                    ) : (
                      debtList.map(acc => {
                        const isCreditCard = ['credit', 'Credit Card'].includes(acc.type);
                        const interestInfo = acc.interestRate !== undefined ? `${acc.interestRate}% Interest` : '';
                        const limitInfo = (isCreditCard && acc.creditLimit !== undefined) ? `Limit: ${acc.creditLimit.toLocaleString()}` : '';
                        const dueInfo = (isCreditCard && acc.paymentDueDate) ? `Due: ${acc.paymentDueDate}` : '';
                        
                        const extraDetails = [interestInfo, limitInfo, dueInfo].filter(Boolean).join(' • ');

                        return (
                          <div 
                            key={`debt-item-${acc.id}`}
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
                                {isCreditCard ? <CreditCard size={14} /> : <Landmark size={14} />}
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
                                  {acc.name}
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
                                  {acc.type} • {acc.currency} {extraDetails ? `• ${extraDetails}` : ''}
                                </span>
                              </div>
                            </div>

                            {/* Soft translucent brand tint progress gauge */}
                            <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                              <div className="w-full h-1.5 rounded-full bg-[#A6DDB1]/15 overflow-hidden">
                                <div 
                                  style={{ 
                                    width: `${totalDebt > 0 ? Math.min(100, (Math.abs(acc.balanceInPrimary) / totalDebt) * 100) : 0}%`,
                                    backgroundColor: '#A6DDB1'
                                  }} 
                                  className="h-full rounded-full" 
                                />
                              </div>
                            </div>

                            {/* Balance */}
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
                                -{Math.abs(acc.originalBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontWeight: 400, 
                                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                    color: '#EF4444' 
                                  }} 
                                  className="ml-1"
                                >
                                  {acc.currency}
                                </span>
                              </span>
                              {acc.currency !== primaryCurrency && (
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontWeight: 400, 
                                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                    color: '#7F8C8D' 
                                  }} 
                                  className="tabular-nums mt-1 leading-none"
                                >
                                  ≈ -{Math.abs(acc.balanceInPrimary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {primaryCurrency}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              
              {/* Disclaimer text footer */}
              <div style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] text-neutral-400 text-center border-t border-neutral-200/55 pt-2 leading-tight shrink-0">
                Reflects all credit card balances, loan liabilities, and mortgage obligations.
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
