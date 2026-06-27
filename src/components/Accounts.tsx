import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Wallet, 
  Building2 as BankIcon, 
  Landmark, 
  CreditCard, 
  HandCoins, 
  Home, 
  ChevronRight, 
  Trash2, 
  Edit3, 
  Archive as ArchiveIcon,
  ArrowLeft,
  Info,
  History as HistoryIcon,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Settings as SettingsIcon,
  Files as DocumentsIcon,
  Search
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  updateDoc, 
  orderBy, 
  query,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { AddAccountModal } from './AddAccountModal';
import { AccountDetailModal } from './AccountDetailModal';
import { calculateAccountTrend, calculateAccountBalances, calculateAggregateTrend } from '../lib/trendUtils';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';

interface AccountsProps {
  profile: any;
  onNavigateToTransactions?: (accountId: string) => void;
}

interface Account {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
  currency: string;
  bankAccountNumber?: string;
  interestRate?: number;
  bankAccountType?: 'Checking' | 'Savings';
  minBalanceFloor?: number;
  defaultTransferFee?: number;
  isArchived?: boolean;
  totalGainLoss?: number;
  loanDirection?: string;
  includeInLiquidity?: boolean;
  creditLimit?: number;
  paymentDueDate?: string;
  recurringProtocol?: string;
  subAssets?: {
    id: string;
    name: string;
    principalInvested: number;
    currentValue: number;
    passiveIncome: number;
  }[];
}

export const Accounts: React.FC<AccountsProps> = ({ profile, onNavigateToTransactions }) => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // Form state for editing
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');

  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [modalIsManageMode, setModalIsManageMode] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  // No auto-seeding of dummy account anymore
  useEffect(() => {
    if (!profile?.uid || isLoading) return;
  }, [profile?.uid, accounts.length, isLoading]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Warning logged in VantageDataErrorBoundary
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    if (!profile?.uid) return;

    // Fetch Accounts
    const qAcc = query(collection(db, `users/${profile.uid}/accounts`), orderBy('name', 'asc'));
    const unsubscribeAcc = onSnapshot(qAcc, (snapshot) => {
      console.log('New Data Detected', { collection: 'accounts', count: snapshot.size });
      const accData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Account[];
      setAccounts(accData);
      setIsLoading(prev => transactions.length > 0 ? false : prev);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${profile.uid}/accounts`);
    });

    // Fetch Transactions for Live Balances
    const qTx = query(collection(db, `users/${profile.uid}/transactions`), orderBy('date', 'desc'));
    const unsubscribeTx = onSnapshot(qTx, (snapshot) => {
      console.log('New Data Detected', { collection: 'accounts_txs', count: snapshot.size });
      const txData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(txData);
      setIsLoading(false);
    });

    return () => {
      unsubscribeAcc();
      unsubscribeTx();
    };
  }, [profile?.uid]);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('account-detail-modal-toggled', { 
      detail: { isOpen: selectedAccount !== null } 
    }));
  }, [selectedAccount]);

  const handleDeleteAccount = async () => {
    if (!selectedAccount || !profile?.uid) return;
    
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Delete associated transactions
      const txToDelete = transactions.filter(tx => tx.accountId === selectedAccount.id);
      txToDelete.forEach(tx => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, tx.id));
      });
      
      // 2. Delete the account itself
      batch.delete(doc(db, `users/${profile.uid}/accounts`, selectedAccount.id));
      
      await batch.commit();
      
      setSelectedAccount(null);
      setIsDeleteConfirmOpen(false);
      setIsEditMode(false);
      setIsManageMode(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/accounts/${selectedAccount.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(accounts, transactions);
  }, [accounts, transactions]);

  // 1. Calculate active base currency and conversion rate
  const activeBaseCurr = profile?.baseCurrency || profile?.currency || 'AED';
  const baseRateToAED = (exchangeRates && exchangeRates[activeBaseCurr]) || DEFAULT_RATES[activeBaseCurr as keyof typeof DEFAULT_RATES] || 1;

  // 2. Filter list of accounts
  const filteredAndSearchedAccounts = React.useMemo(() => {
    return accounts.filter(a => {
      const matchesArchived = showArchived ? a.isArchived : !a.isArchived;
      if (!matchesArchived) return false;
      if (!searchTerm.trim()) return true;
      
      const lowerSearch = searchTerm.toLowerCase();
      return (
        a.name.toLowerCase().includes(lowerSearch) ||
        (a.bankAccountType || '').toLowerCase().includes(lowerSearch) ||
        (a.type || '').toLowerCase().includes(lowerSearch) ||
        (a.currency || '').toLowerCase().includes(lowerSearch)
      );
    });
  }, [accounts, showArchived, searchTerm]);

  // 3. Compute active account IDs & Aggregate trend details
  const activeAccIds = React.useMemo(() => {
    return new Set(accounts.filter(a => !a.isArchived).map(a => a.id));
  }, [accounts]);

  const aggregateTrend = React.useMemo(() => {
    return calculateAggregateTrend(activeAccIds, accounts, transactions);
  }, [activeAccIds, accounts, transactions]);

  const totalCombinedBalance = React.useMemo(() => {
    return accounts
      .filter(a => !a.isArchived)
      .reduce((sum, account) => {
        const currentBalance = accountBalances[account.id] || 0;
        const rate = (exchangeRates && exchangeRates[account.currency]) || DEFAULT_RATES[account.currency as keyof typeof DEFAULT_RATES] || 1;
        const translatedBalance = (currentBalance * rate) / baseRateToAED;
        return sum + translatedBalance;
      }, 0);
  }, [accounts, accountBalances, exchangeRates, baseRateToAED]);

  const trendText = React.useMemo(() => {
    if (aggregateTrend.direction === 'up') {
      return `+${aggregateTrend.percentage}% past 30 days`;
    } else if (aggregateTrend.direction === 'down') {
      return `${aggregateTrend.percentage}% past 30 days`;
    } else {
      return 'Stable past 30 days';
    }
  }, [aggregateTrend]);

  const trendColorClass = React.useMemo(() => {
    if (aggregateTrend.direction === 'up') {
      return 'text-[#0D9488] bg-teal-50 border border-teal-100';
    } else if (aggregateTrend.direction === 'down') {
      return 'text-amber-700 bg-amber-50 border border-amber-100';
    } else {
      return 'text-neutral-500 bg-neutral-50 border border-neutral-100';
    }
  }, [aggregateTrend]);

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'cash':
      case 'Cash': return Wallet;
      case 'bank':
      case 'Bank': return BankIcon;
      case 'investment': return TrendingUp;
      case 'credit':
      case 'Credit Card': return CreditCard;
      case 'loan':
      case 'Personal Loan': return DocumentsIcon;
      case 'mortgage':
      case 'Mortgage': return Home;
      default: return Wallet;
    }
  };

  const isLiability = (type: string) => {
    return ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(type);
  };

  const handleArchiveAccount = async (accountId: string, currentStatus?: boolean) => {
    try {
      await updateDoc(doc(db, `users/${profile.uid}/accounts`, accountId), {
        isArchived: !currentStatus
      });
      setSelectedAccount(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${accountId}`);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    try {
      await updateDoc(doc(db, `users/${profile.uid}/accounts`, selectedAccount.id), {
        name: editName,
        startingBalance: parseFloat(editBalance)
      });
      setIsEditMode(false);
      setSelectedAccount(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${selectedAccount.id}`);
    }
  };

  const openEditMode = (account: Account) => {
    setEditName(account.name);
    setEditBalance(account.startingBalance?.toString() || '0');
    setIsEditMode(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-12 h-12 border-4 border-vantage-green/20 border-t-vantage-green rounded-full animate-spin" />
        <span className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">{t('accounts.syncing_accounts')}</span>
      </div>
    );
  }

  const getAccountDetailsText = (account: Account) => {
    if (account.name === 'ADCB') {
      return 'Checkings AED';
    }
    if (account.name === 'AALCB') {
      return 'Savings AED';
    }
    if (account.type === 'credit' || account.type === 'Credit Card') {
      return `Credit Card ${account.currency}`;
    }
    if (account.type === 'loan' || account.type === 'Personal Loan') {
      return `${account.loanDirection === 'lent' ? 'Lent' : 'Personal Loan'} ${account.currency}`;
    }
    if (account.type === 'mortgage' || account.type === 'Mortgage') {
      return `Mortgage ${account.currency}`;
    }
    const accTypeStr = account.bankAccountType ? `${account.bankAccountType}` : 'Checking';
    return `${accTypeStr} ${account.currency}`;
  };

  const getCustomVectorIcon = (account: Account) => {
    const iconSizeStyle = {
      width: 'clamp(16px, 4.2svw, 20px)',
      height: 'clamp(16px, 4.2svw, 20px)'
    };
    if (account.name === 'ADCB') {
      return (
        <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <path d="M12 2L4 7L12 12L20 7L12 2Z" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17L12 22L20 17" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 12V17" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 12V17" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    
    if (account.name === 'AALCB') {
      return (
        <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" className="shrink-0">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="#0D9488" strokeWidth="2" />
          <path d="M9 17V7L15 17V7" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }

    switch (account.type) {
      case 'cash':
        return (
          <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 12h.01M18 12h.01" />
          </svg>
        );
      case 'bank':
        return (
          <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M11 10v11M15 10v11M20 10v11" />
          </svg>
        );
      case 'investment':
        return (
          <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        );
      case 'credit':
        return (
          <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
        );
      default:
        return (
          <svg style={iconSizeStyle} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M13 10h.01M17 10h.01" />
          </svg>
        );
    }
  };

  // Memo structures moved above early loading-state returns for Rules of Hooks compliance

  return (
    <div className="flex flex-col gap-6 pb-[12vh] px-0 bg-[#F8F9FA] min-h-screen font-g-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .font-g-sans {
          font-family: 'Google Sans', sans-serif !important;
        }
        .text-casing-natural {
          text-transform: none !important;
        }
      `}</style>

      {/* Welcome Header */}
      <header className="w-full flex justify-between items-center pt-8 px-4 md:px-6">
        <div className="flex flex-col gap-1">
          <h2 className="tracking-tight text-neutral-900 leading-none">
            <span className="font-bold text-[28px] text-neutral-900 font-g-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('accounts.overview_title')}</span>
          </h2>
          <p className="text-[14px] text-neutral-500 font-normal font-g-sans mt-1">
            {t('accounts.overview_description')}
          </p>
        </div>
      </header>

      {/* Total Combined Balance Card (Ambient Design) */}
      <div className="px-4 md:px-6 w-full">
        <div className="relative overflow-hidden rounded-2xl p-6 bg-white border-0 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-[#0D9488]/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="relative z-10">
            <span className="text-[13px] text-neutral-500 font-medium font-g-sans uppercase tracking-wider">{t('accounts.total_combined_balance')}</span>
            <div className="flex flex-wrap items-baseline gap-3 mt-1.5">
              <span className="font-g-sans text-4xl font-bold text-neutral-900">
                {activeBaseCurr} {totalCombinedBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[12px] px-2.5 py-1 rounded-full font-g-sans font-medium shrink-0 ${trendColorClass}`}>
                {trendText}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Tools Bar */}
      <div className="px-4 md:px-6 py-2 flex flex-col sm:flex-row gap-4 justify-between items-center w-full">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
          <input 
            type="text"
            placeholder={t('accounts.search_accounts')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-10 py-2 bg-white border-0 rounded-xl text-[14px] font-normal leading-normal text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#0D9488]/20 focus:border-[#0D9488]/40 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] font-g-sans"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 font-normal text-xs font-g-sans"
              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
            >
              {t('accounts.clear_search')}
            </button>
          )}
        </div>

        <div className="flex gap-2 items-center shrink-0 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-[13px] text-neutral-500 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
            {showArchived ? t('accounts.showing_archived') : t('accounts.showing_active')}
          </span>
          <button 
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-neutral-600 hover:text-[#0D9488] border-0 bg-white px-3 py-1.5 rounded-xl font-medium font-g-sans transition-colors cursor-pointer"
            style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
          >
            {showArchived ? t('accounts.show_active') : t('accounts.show_archived')}
          </button>
        </div>
      </div>

      {/* Interactive Bento & Accounts Grid */}
      <div className="px-4 md:px-6 w-full">
        {filteredAndSearchedAccounts.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center text-center gap-3 bg-white rounded-2xl border-0 shadow-sm px-4">
            <div className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400">
              <Landmark size={26} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-neutral-800 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>{t('accounts.no_accounts_found')}</span>
              <p className="text-[13px] text-neutral-400 font-normal leading-normal max-w-[260px] mx-auto font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
                {t('accounts.try_refining')}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {(() => {
              const groups: { [key: string]: Account[] } = {
                'Bank Accounts': [],
                'Cash & Wallets': [],
                'Investments': [],
                'Liabilities & Loans': [],
                'Other Accounts': []
              };

              filteredAndSearchedAccounts.forEach(account => {
                const accType = (account.type || '').toLowerCase();
                if (accType === 'bank') {
                  groups['Bank Accounts'].push(account);
                } else if (accType === 'cash') {
                  groups['Cash & Wallets'].push(account);
                } else if (accType === 'investment') {
                  groups['Investments'].push(account);
                } else if (['credit', 'loan', 'mortgage', 'credit card', 'personal loan', 'mortgage'].includes(accType)) {
                  groups['Liabilities & Loans'].push(account);
                } else {
                  groups['Other Accounts'].push(account);
                }
              });

              return (Object.keys(groups) as Array<keyof typeof groups>).map((groupName) => {
                const accountsInGroup = groups[groupName];
                if (accountsInGroup.length === 0) return null;

                return (
                  <div key={groupName} className="flex flex-col gap-3">
                    <h4 
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} 
                      className="text-[17px] font-bold text-neutral-800 tracking-tight font-g-sans"
                    >
                      {groupName === 'Bank Accounts' ? t('accounts.bank_accounts') : groupName === 'Cash & Wallets' ? t('accounts.cash_wallets') : groupName === 'Investments' ? t('accounts.investments') : groupName === 'Liabilities & Loans' ? t('accounts.liabilities_loans') : t('accounts.other_accounts')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {accountsInGroup.map((account, accountIndex) => {
                        const currentBalance = accountBalances[account.id] || 0;
                        const rate = (exchangeRates && exchangeRates[account.currency]) || DEFAULT_RATES[account.currency as keyof typeof DEFAULT_RATES] || 1;
                        const translatedBalance = (currentBalance * rate) / baseRateToAED;

                        // Calculate Loan/Mortgage repayment progress dynamically
                        const absStart = Math.abs(account.startingBalance || 0);
                        const absCurr = Math.abs(currentBalance || 0);
                        const totalDebtProgress = absStart > 0 && absStart > absCurr 
                          ? Math.min(100, Math.max(0, Math.round(((absStart - absCurr) / absStart) * 100))) 
                          : 0;

                        return (
                          <motion.div
                            whileHover={{ y: -4, boxShadow: '0px 10px 30px rgba(16, 185, 129, 0.06)' }}
                            whileTap={{ scale: 0.98 }}
                            key={`act-grid-${account.id || 'none'}-${accountIndex}`}
                            onClick={() => {
                              setSelectedAccount(account);
                              setModalIsManageMode(false);
                            }}
                            className={`bg-white p-6 rounded-[24px] border border-neutral-100 flex flex-col justify-between min-h-[195px] cursor-pointer transition-all duration-200 relative group overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.015)] ${
                              account.isArchived ? 'opacity-65 grayscale' : ''
                            }`}
                          >
                            {/* Top Block: Casing tags, name stack, custom rounded emblem */}
                            <div className="flex justify-between items-start w-full gap-2">
                              <div className="flex flex-col min-w-0 pr-1 leading-none">
                                <span 
                                  className="text-[10px] font-bold tracking-wider text-neutral-400 font-g-sans leading-none"
                                  style={{ fontFamily: "'Google Sans', sans-serif", letterSpacing: '0.04em' }}
                                >
                                  {(() => {
                                    const accType = (account.type || '').toLowerCase();
                                    if (accType === 'bank') return t('account_detail.checking');
                                    if (accType === 'cash') return t('account_detail.cash');
                                    if (accType === 'investment') return t('account_detail.investment');
                                    if (accType === 'credit' || accType === 'credit card') return t('account_detail.credit');
                                    if (accType === 'loan' || accType === 'personal loan') return t('account_detail.loan');
                                    if (accType === 'mortgage') return t('account_detail.mortgage');
                                    return `${account.type} ${t('account_insights.type_suffix')}`;
                                  })()}
                                </span>

                                {(() => {
                                  const nameParts = account.name.split(' ');
                                  const firstLine = nameParts[0] || '';
                                  const secondLine = nameParts.slice(1).join(' ') || (account.type === 'bank' ? 'Account' : '');
                                  return (
                                    <div className="flex flex-col mt-1.5 leading-[1.15] select-none">
                                      <span 
                                        className="text-[19px] font-bold text-[#1C2C40] tracking-tight truncate leading-[1.15] font-g-sans"
                                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                                      >
                                        {firstLine}
                                      </span>
                                      {secondLine && (
                                        <span 
                                          className="text-[19px] font-bold text-[#1C2C40] tracking-tight truncate leading-[1.15] font-g-sans"
                                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                                        >
                                          {secondLine}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Custom emblem container */}
                              {(() => {
                                const accType = (account.type || '').toLowerCase();
                                let bgClass = 'bg-slate-50 border-slate-100 text-slate-500';
                                if (accType === 'bank') bgClass = 'bg-[#EAF7EE] border-[#EAF7EE] text-[#0F5B46]';
                                else if (accType === 'cash') bgClass = 'bg-[#FCF5EC] border-[#FCF5EC] text-[#B16F39]';
                                else if (accType === 'credit' || accType === 'credit card') bgClass = 'bg-[#FDF2F2] border-[#FDF2F2] text-[#9B1C1C]';
                                else if (accType === 'investment') bgClass = 'bg-[#EEF2FF] border-[#EEF2FF] text-[#312E81]';
                                else if (accType === 'loan' || accType === 'personal loan' || accType === 'mortgage') bgClass = 'bg-[#F5F3FF] border-[#F5F3FF] text-[#5B21B6]';

                                return (
                                  <div 
                                    className={`w-11 h-11 flex items-center justify-center shrink-0 border shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] ${bgClass}`}
                                    style={{ borderRadius: '14px' }}
                                  >
                                    {getCustomVectorIcon(account)}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Middle Block: Balances */}
                            <div className="flex flex-col mt-2.5 leading-none select-none">
                              <span 
                                className="text-[11px] text-neutral-400 font-normal leading-none font-g-sans"
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                              >
                                {t('accounts.current_balance')}
                              </span>
                              <div className="flex items-baseline mt-1.5 leading-none">
                                <span 
                                  className={`text-[25px] font-bold ${
                                    (account.type === 'bank' || account.type === 'cash') && 
                                    account.minBalanceFloor !== undefined && 
                                    currentBalance < account.minBalanceFloor 
                                      ? 'text-red-500' 
                                      : 'text-[#1C2C40]'
                                  } tracking-tight leading-none font-g-sans`}
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                >
                                  {currentBalance < 0 ? '-' : ''}{(Math.abs(currentBalance)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span 
                                  className="text-[12px] font-bold text-neutral-500 ml-1 leading-none font-g-sans uppercase tracking-wide"
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                >
                                  {account.currency}
                                </span>
                              </div>
                              
                              {account.currency !== activeBaseCurr && (
                                <span 
                                  className="text-[9.5px] text-neutral-400 font-normal mt-1 leading-none font-g-sans"
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                >
                                  ≈ {activeBaseCurr} {translatedBalance < 0 ? '-' : ''}{Math.abs(translatedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>

                            {/* Bottom Block: Responsive pill badges or debt progress */}
                            <div className="w-full mt-3">
                              {(() => {
                                const assetTrend = calculateAccountTrend(account.id, currentBalance, transactions, account.type, account.loanDirection);
                                
                                let pillBg = 'bg-[#EAF7EE] text-[#0F5B46]';
                                let trendSymbol = '↗';
                                let trendSign = '+';
                                let percentageText = '12.5%';

                                if (assetTrend.direction === 'down') {
                                  pillBg = 'bg-[#FDF2F2] text-[#9B1C1C]';
                                  trendSymbol = '↘';
                                  trendSign = '-';
                                  percentageText = `${Math.abs(assetTrend.percentage).toFixed(1)}%`;
                                } else if (assetTrend.direction === 'up') {
                                  pillBg = 'bg-[#EAF7EE] text-[#0F5B46]';
                                  trendSymbol = '↗';
                                  trendSign = '+';
                                  percentageText = `${Math.abs(assetTrend.percentage).toFixed(1)}%`;
                                } else {
                                  pillBg = 'bg-[#F8FAFC] text-[#475569]';
                                  trendSymbol = '→';
                                  trendSign = '';
                                  percentageText = '0.0%';
                                }

                                const isDebt = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(account.type);
                                if (isDebt && totalDebtProgress > 0) {
                                  return (
                                    <div className="w-full">
                                      <div className="flex justify-between text-[11px] text-neutral-400 mb-1 font-g-sans">
                                        <span>{t('accounts.repaid')}</span>
                                        <span className="text-[#0D9488] font-bold">{totalDebtProgress}%</span>
                                      </div>
                                      <div className="w-full bg-neutral-100 h-1 rounded-full overflow-hidden">
                                        <div 
                                          className="bg-[#0D9488] h-full rounded-full transition-all duration-300" 
                                          style={{ width: `${totalDebtProgress}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div 
                                    className={`w-full flex items-center justify-center gap-1 py-1.5 rounded-full font-bold text-[11px] leading-none select-none transition-all duration-200 group-hover:brightness-98 ${pillBg}`}
                                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                                  >
                                    <span>{trendSymbol}</span>
                                    <span>{trendSign}{percentageText} {t('accounts.this_month')}</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Call to Action Section / Interactive Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6 w-full font-g-sans">
        <motion.div 
          onClick={() => setIsAddModalOpen(true)}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="bg-teal-50/40 border border-teal-100 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all hover:bg-teal-50/70 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <div 
            className="bg-white p-3 rounded-xl shadow-xs text-[#0D9488] border border-teal-50 shrink-0"
            style={{ borderRadius: '20px' }} // User requested rounded-20px for icons
          >
            <Plus size={20} />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-neutral-800 font-g-sans leading-tight">Connect New Account</h4>
            <p className="text-[12px] text-neutral-500 font-normal mt-1 font-g-sans leading-normal">
              Securely link or log another financial asset or liability.
            </p>
          </div>
        </motion.div>

        <motion.div 
          onClick={() => {
            window.dispatchEvent(new CustomEvent('vantage-navigate-tab', { detail: { tab: 'analytics' } }));
          }}
          whileHover={{ y: -2, scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="bg-neutral-100/40 border border-neutral-200/60 rounded-2xl p-5 flex items-center gap-4 cursor-pointer transition-all hover:bg-neutral-100/70 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
        >
          <div 
            className="bg-white p-3 rounded-xl shadow-xs text-neutral-600 border border-neutral-100 shrink-0"
            style={{ borderRadius: '20px' }} // User requested rounded-20px for icons
          >
            <TrendingUp size={20} />
          </div>
          <div>
            <h4 className="text-[14px] font-bold text-neutral-800 font-g-sans leading-tight font-bold">Monthly Insights</h4>
            <p className="text-[12px] text-neutral-500 font-normal mt-1 font-g-sans leading-normal">
              See how your combined balances and net worth change dynamically.
            </p>
          </div>
        </motion.div>
      </div>

      <AccountDetailModal 
        isOpen={selectedAccount !== null}
        onClose={() => setSelectedAccount(null)}
        account={selectedAccount}
        accounts={accounts}
        accountBalances={accountBalances}
        profile={profile}
        transactions={transactions}
        onNavigateToTransactions={onNavigateToTransactions}
        initialIsManageMode={modalIsManageMode}
      />

      <AddAccountModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        uid={profile.uid}
        profile={profile}
        onAccountAdded={() => setIsAddModalOpen(false)}
      />
    </div>
  );
};
