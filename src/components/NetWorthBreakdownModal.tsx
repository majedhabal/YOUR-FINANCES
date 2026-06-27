import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, TrendingUp, TrendingDown, ArrowRight, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  bankAccountType?: string;
  loanDirection?: string;
  isArchived?: boolean;
  startingBalance?: number;
}

interface NetWorthBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  accountBalances: { [key: string]: number };
  primaryCurrency: string;
  exchangeRates: any;
  defaultRates: { [key: string]: number };
  transactions?: any[];
  selectedAccIds?: Set<string>;
}

export const NetWorthBreakdownModal: React.FC<NetWorthBreakdownModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  primaryCurrency,
  exchangeRates,
  defaultRates,
  transactions = [],
  selectedAccIds = new Set(accounts.map(a => a.id)),
}) => {
  const { t } = useTranslation();
  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (defaultRates as any)[c] || 1;
  };

  const baseRateToAED = getRateToAED(primaryCurrency);

  // Filter accounts according to standard Net Worth rules
  const allNonArchived = accounts.filter(acc => !acc.isArchived);
  const liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'];
  const assetAccounts = allNonArchived.filter(acc => !liabilityTypes.includes(acc.type) || acc.loanDirection === 'lent');
  const liabilityAccounts = allNonArchived.filter(acc => liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent');

  // Map and calculate amounts for Assets
  const assetsList = assetAccounts.map(acc => {
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

  // Map and calculate amounts for Liabilities
  const liabilitiesList = liabilityAccounts.map(acc => {
    const bal = accountBalances[acc.id] || 0;
    const rate = getRateToAED(acc.currency);
    // Standard rule: liabilities represent debt, we store absolute positive values for lists as debt total
    const balInAED = Math.abs(bal) * rate;
    const balInPrimary = balInAED / baseRateToAED;
    return {
      ...acc,
      originalBalance: bal,
      balanceInPrimary: balInPrimary,
    };
  });

  const totalAssets = assetsList.reduce((sum, item) => sum + item.balanceInPrimary, 0);
  const totalLiabilities = liabilitiesList.reduce((sum, item) => sum + item.balanceInPrimary, 0);

  // User requested formula: Net Worth = Confirmed income - Total Debt
  // Refined to include both 'income' and 'Inflow' types and only asset account starting balances
  // We must avoid double-counting if a starting balance is already ledgered as a transaction.
  const confirmedIncomeTxSum = transactions
    .filter(tx => 
      (tx.type === 'income' || tx.type === 'Inflow') && 
      tx.status !== 'draft' && 
      tx.status !== 'pending' && 
      tx.status !== 'upcoming' &&
      tx.status !== 'Pending Schedule' &&
      !tx.isUpcomingSalaryAllocation &&
      selectedAccIds.has(tx.accountId)
    )
    .reduce((sum, tx) => sum + (Number(tx.amount || 0) * getRateToAED(tx.currency || 'AED')), 0);

  const startingBalancesSum = accounts
    .filter(acc => 
      !acc.isArchived && 
      selectedAccIds.has(acc.id) && 
      !liabilityTypes.includes(acc.type) && 
      acc.loanDirection !== 'lent'
    )
    .reduce((sum, acc) => {
      const accountId = String(acc.id);
      const hasLedgeredStartingBalance = transactions.some(tx => 
        (tx.accountId === accountId || tx.toAccountId === accountId) && 
        (tx.subcategory === 'starting_balance' || tx.notes === 'Initial Balance Setup' || tx.notes === 'Starting Balance' || tx.subcategory === 'Starting Balance')
      );
      // If it's already in the ledger, don't add it from the account field
      if (hasLedgeredStartingBalance) return sum;
      return sum + (Number(acc.startingBalance || 0) * getRateToAED(acc.currency || 'AED'));
    }, 0);

  const totalConfirmedIncome = (confirmedIncomeTxSum + startingBalancesSum) / baseRateToAED;
  const netWorthValue = totalConfirmedIncome - totalLiabilities;

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
                      fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      color: '#1E2229'
                    }}
                    className="tracking-tight"
                  >
                    {t('net_worth_breakdown_modal.title', 'Net Worth Calculations')}
                  </h3>
                  <p 
                    style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }}
                    className="text-neutral-500 text-[11px]"
                  >
                    {t('net_worth_breakdown_modal.subtitle', 'Accounts included under assets and liabilities')}
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
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-neutral-500 text-[11px]">{t('net_worth_breakdown_modal.formula', 'Formula')}</span>
                  <span style={{ fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }} className="text-neutral-600 text-[10px] bg-neutral-200/40 px-2 py-0.5 rounded-full">
                    {t('net_worth_breakdown_modal.formula_text', 'Confirmed income - Total Debt')}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 items-center text-center">
                  <div className="flex flex-col p-2 bg-white/50 rounded-lg border border-neutral-100/50">
                    <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#57606F' }} className="text-[10px]">{t('net_worth_breakdown_modal.total_assets', 'Confirmed income')}</span>
                    <span 
                      style={{ 
                        fontWeight: 600,
                        fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
                        fontFamily: "'Google Sans', sans-serif"
                      }}
                      className="text-emerald-600 tracking-tight tabular-nums mt-0.5"
                    >
                      {totalConfirmedIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-neutral-300 font-g-sans">-</div>
                  <div className="flex flex-col p-2 bg-white/50 rounded-lg border border-neutral-100/50">
                    <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#57606F' }} className="text-[10px]">{t('net_worth_breakdown_modal.total_liabilities', 'Total Debt')}</span>
                    <span 
                      style={{ 
                        fontWeight: 600,
                        fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
                        fontFamily: "'Google Sans', sans-serif"
                      }}
                      className="text-rose-500 tracking-tight tabular-nums mt-0.5"
                    >
                      {totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="border-t border-dashed border-neutral-200/50 pt-2.5 flex items-center justify-between">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }} className="text-[11px]">{t('net_worth_breakdown_modal.net_worth_label', 'Net Worth ({{currency}})', { currency: primaryCurrency })}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.2rem, 3vw, 1.5rem)',
                      fontFamily: "'Google Sans', sans-serif"
                    }} 
                    className={`tracking-tight tabular-nums ${netWorthValue < 0 ? 'text-rose-500' : 'text-emerald-600'}`}
                  >
                    {netWorthValue < 0 ? '-' : ''}{Math.abs(netWorthValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Account Lists - Scrollable Area */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Asset Accounts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <TrendingUp size={14} className="text-[#10B981]" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1.0rem, 2.2vw, 1.2rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('net_worth_breakdown_modal.asset_accounts', 'Asset Accounts')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({assetsList.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {assetsList.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] font-normal py-4 text-center border border-dashed border-neutral-100/50 rounded-xl">
                        {t('net_worth_breakdown_modal.no_assets', 'No active asset accounts found.')}
                      </div>
                    ) : (
                      assetsList.map(acc => (
                        <div 
                          key={`asset-item-${acc.id}`}
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
                              <Landmark size={14} />
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
                                {acc.loanDirection === 'lent' ? t('net_worth_breakdown_modal.lent_loan', 'Lent Loan') : (acc.bankAccountType || acc.type)} • {acc.currency}
                              </span>
                            </div>
                          </div>

                          {/* Soft translucent brand tint progress gauge */}
                          <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                            <div className="w-full h-1.5 rounded-full bg-[#A6DDB1]/15 overflow-hidden">
                              <div 
                                style={{ 
                                  width: `${totalAssets > 0 ? Math.min(100, (acc.balanceInPrimary / totalAssets) * 100) : 0}%`,
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
                      ))
                    )}
                  </div>
                </div>

                {/* Liability Accounts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <TrendingDown size={14} className="text-rose-500" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1.0rem, 2.2vw, 1.2rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('net_worth_breakdown_modal.liability_accounts', 'Liability Accounts')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({liabilitiesList.length})</span>
                  </div>

                  <div className="space-y-1.5">
                    {liabilitiesList.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] font-normal py-4 text-center border border-dashed border-neutral-100/50 rounded-xl">
                        {t('net_worth_breakdown_modal.no_liabilities', 'No active liability accounts found.')}
                      </div>
                    ) : (
                      liabilitiesList.map(acc => (
                        <div 
                          key={`liability-item-${acc.id}`}
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
                              <Shield size={14} />
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
                                {acc.type} • {acc.currency}
                              </span>
                            </div>
                          </div>

                          {/* Soft translucent liability progress gauge */}
                          <div className="hidden sm:flex items-center justify-center flex-1 max-w-[80px] px-2 min-w-0 shrink-0">
                            <div className="w-full h-1.5 rounded-full bg-rose-500/10 overflow-hidden">
                              <div 
                                style={{ 
                                  width: `${totalLiabilities > 0 ? Math.min(100, (acc.balanceInPrimary / totalLiabilities) * 100) : 0}%`,
                                  backgroundColor: '#F43F5E'
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
                              {acc.originalBalance < 0 ? '-' : ''}{Math.abs(acc.originalBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                ≈ {acc.balanceInPrimary < 0 ? '-' : ''}{Math.abs(acc.balanceInPrimary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {primaryCurrency}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              
              {/* Disclaimer text footer */}
              <div style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] text-neutral-400 text-center border-t border-neutral-200/55 pt-2 leading-tight shrink-0">
                {t('net_worth_breakdown_modal.footer', 'Only active non-archived accounts are evaluated under standard Net Worth rules.')}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
