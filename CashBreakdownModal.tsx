import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, Wallet, TrendingUp, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  bankAccountType?: string;
  isArchived?: boolean;
}

interface CashBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  accountBalances: { [key: string]: number };
  primaryCurrency: string;
  exchangeRates: any;
  defaultRates: { [key: string]: number };
}

export const CashBreakdownModal: React.FC<CashBreakdownModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  primaryCurrency,
  exchangeRates,
  defaultRates,
}) => {
  const { t } = useTranslation();

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (defaultRates as any)[c] || 1;
  };

  const baseRateToAED = getRateToAED(primaryCurrency);

  // Criteria for cashOnHandAccounts from matching calculation:
  // ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash'
  const allNonArchived = accounts.filter(acc => !acc.isArchived);
  const cashAccounts = allNonArchived.filter(
    acc => ['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || 
           acc.bankAccountType === 'Checking' || 
           acc.bankAccountType === 'Savings' || 
           acc.bankAccountType === 'Cash'
  );

  const cashList = cashAccounts.map(acc => {
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

  const totalCash = cashList.reduce((sum, item) => sum + item.balanceInPrimary, 0);

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
                    {t('cash_breakdown.title', 'Cash Available Breakdown')}
                  </h3>
                  <p 
                    style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }}
                    className="text-neutral-500 text-[11px]"
                  >
                    {t('cash_breakdown.subtitle', 'Checking, savings, physical cash, and wallet accounts')}
                  </p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-neutral-100/50 bg-white/50 backdrop-blur-xs flex items-center justify-center hover:bg-white text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Calculations Breakdown Summary Card */}
              <div className="p-4 rounded-xl bg-white/40 border border-neutral-100/50 flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-neutral-500 text-[11px]">{t('cash_breakdown.liquidity_summary', 'Liquidity Summary')}</span>
                  <span style={{ fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }} className="text-emerald-600 text-[10px] bg-emerald-50/50 px-2 py-0.5 rounded-full">
                    {t('cash_breakdown.cash_available', 'Cash Available')}
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
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }} className="text-[11px]">{t('cash_breakdown.total_cash_available', 'Total Cash Available ({{currency}})', { currency: primaryCurrency })}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.15rem, 2.8vw, 1.45rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      whiteSpace: 'nowrap'
                    }} 
                    className={`tracking-tight tabular-nums ${totalCash < 0 ? 'text-rose-500' : 'text-neutral-800'}`}
                  >
                    {totalCash < 0 ? '-' : ''}{Math.abs(totalCash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Account Lists - Scrollable Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <TrendingUp size={14} className="text-[#10B981]" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('cash_breakdown.liquidity_accounts', 'Liquidity Accounts')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({cashList.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {cashList.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] font-normal py-4 text-center border border-dashed border-neutral-100/50 rounded-xl">
                        {t('cash_breakdown.no_accounts', 'No active liquidity accounts found.')}
                      </div>
                    ) : (
                      cashList.map(acc => {
                        const isBank = ['bank', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings';
                        return (
                          <div 
                            key={`cash-item-${acc.id}`}
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
                                {isBank ? <Landmark size={14} /> : <Wallet size={14} />}
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
                                  {acc.bankAccountType || acc.type} • {acc.currency}
                                </span>
                              </div>
                            </div>

                            {/* Soft translucent brand tint progress gauge */}
                            <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                              <div className="w-full h-1.5 rounded-full bg-[#A6DDB1]/15 overflow-hidden">
                                <div 
                                  style={{ 
                                    width: `${totalCash > 0 ? Math.min(100, (acc.balanceInPrimary / totalCash) * 100) : 0}%`,
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
                                  color: '#1E2229',
                                  whiteSpace: 'nowrap'
                                }} 
                                className="tabular-nums leading-none"
                              >
                                {acc.originalBalance < 0 ? '-' : ''}{Math.abs(acc.originalBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontWeight: 400, 
                                    fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)', 
                                    color: '#57606F' 
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
                                  ≈ {acc.balanceInPrimary < 0 ? '-' : ''}{Math.abs(acc.balanceInPrimary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {primaryCurrency}
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
                {t('cash_breakdown.footer', 'Reflects all checking, savings, cash, and digital liquidity wallets.')}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
