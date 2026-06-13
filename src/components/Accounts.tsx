import React, { useState, useEffect } from 'react';
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
import { calculateAccountTrend, calculateAccountBalances } from '../lib/trendUtils';
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
        <span className="text-[10px] font-bold text-vantage-blue-grey uppercase tracking-widest">Synchronizing Accounts...</span>
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

  return (
    <div className="flex flex-col gap-6 pb-[12vh] px-0 bg-[#F8F9FA] min-h-screen font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .font-g-sans {
          font-family: 'Google Sans', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        }
        .text-casing-natural {
          text-transform: none !important;
        }
      `}</style>

      {/* Header Container */}
      <header className="w-full flex justify-between items-center pt-8 px-4 md:px-6">
        <div className="flex flex-col gap-1">
          <h2 className="tracking-tight text-neutral-900 leading-none">
            <span className="font-bold text-[28px] text-neutral-900 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>Accounts</span>
          </h2>
        </div>
      </header>

      {/* Search Input Bar with Rounded Edges */}
      <div className="px-4 md:px-6 w-full">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
          <input 
            type="text"
            placeholder="Search accounts"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-10 py-2.5 bg-white border border-neutral-200 rounded-xl text-[14px] font-normal leading-normal text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#0D9488]/20 focus:border-[#0D9488]/40 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.01)] font-g-sans"
            style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 font-normal text-xs font-g-sans"
              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active/Archived Filter Row */}
      <div className="px-4 md:px-6 flex justify-between items-center">
        <span className="text-[13px] text-neutral-500 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
          {showArchived ? "Showing archived accounts" : "Showing active accounts"}
        </span>
        <button 
          onClick={() => setShowArchived(!showArchived)}
          className="text-xs text-neutral-600 hover:text-[#0D9488] border border-neutral-200 bg-white px-2.5 py-1.5 rounded-xl font-medium font-g-sans transition-colors cursor-pointer"
          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
        >
          {showArchived ? "Show active" : "Show archived"}
        </button>
      </div>

      {/* Structured Category Lists */}
      <div className="flex flex-col gap-6 px-4 md:px-6 w-full">
        {(() => {
          const filteredAndSearchedAccounts = accounts.filter(a => {
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

          if (filteredAndSearchedAccounts.length === 0) {
            return (
              <div className="w-full py-16 flex flex-col items-center justify-center text-center gap-3 bg-white rounded-2xl border border-neutral-200 shadow-sm px-4">
                <div className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400">
                  <Landmark size={26} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[14px] font-semibold text-neutral-800 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>No accounts found</span>
                  <p className="text-[13px] text-neutral-400 font-normal leading-normal max-w-[260px] mx-auto font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
                    Try refining your search terms or adding a new account.
                  </p>
                </div>
              </div>
            );
          }

          const bankAccounts = filteredAndSearchedAccounts.filter(a => a.type === 'bank' || a.type === 'Bank' || a.type === 'cash' || a.type === 'Cash' || a.bankAccountType === 'Checking' || a.bankAccountType === 'Savings' || a.bankAccountType === 'Cash');
          const investmentAccounts = filteredAndSearchedAccounts.filter(a => a.type === 'investment');
          const debtAccounts = filteredAndSearchedAccounts.filter(a => ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(a.type));
          const otherAccounts = filteredAndSearchedAccounts.filter(a => !['bank', 'Bank', 'cash', 'Cash', 'investment', 'credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(a.type) && a.bankAccountType !== 'Checking' && a.bankAccountType !== 'Savings' && a.bankAccountType !== 'Cash');

          const renderSection = (title: string, groupAccounts: Account[]) => {
            if (groupAccounts.length === 0) return null;

            const activeBaseCurr = profile?.baseCurrency || profile?.currency || 'AED';
            const baseRateToAED = (exchangeRates && exchangeRates[activeBaseCurr]) || DEFAULT_RATES[activeBaseCurr as keyof typeof DEFAULT_RATES] || 1;

            const totalTranslatedSum = groupAccounts.reduce((sum, account) => {
              const currentBalance = accountBalances[account.id] || 0;
              const rate = (exchangeRates && exchangeRates[account.currency]) || DEFAULT_RATES[account.currency as keyof typeof DEFAULT_RATES] || 1;
              const translatedBalance = (currentBalance * rate) / baseRateToAED;
              return sum + translatedBalance;
            }, 0);

            return (
              <div className="flex flex-col gap-2.5 w-full font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
                <div className="flex justify-between items-center px-1">
                  <span 
                    className="text-[14px] font-normal font-g-sans"
                    style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", color: '#666666' }}
                  >
                    {title}
                  </span>
                  <span 
                    className="text-[13px] text-neutral-400 font-normal font-g-sans"
                    style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
                  >
                    Total: {activeBaseCurr} {Math.abs(totalTranslatedSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden divide-y divide-neutral-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                  {groupAccounts.map((account, idx) => {
                    const currentBalance = accountBalances[account.id] || 0;
                    const rate = (exchangeRates && exchangeRates[account.currency]) || DEFAULT_RATES[account.currency as keyof typeof DEFAULT_RATES] || 1;
                    const translatedBalance = (currentBalance * rate) / baseRateToAED;

                    return (
                      <div 
                        key={`account-${account.id || 'id-missing'}-${idx}`}
                        onClick={() => {
                          setSelectedAccount(account);
                          setModalIsManageMode(false);
                        }}
                        className={`group flex items-center justify-between py-[clamp(8px,1.9svw,10px)] px-[clamp(12px,3.2svw,16px)] hover:bg-[#F8F9FA]/60 transition-all duration-150 cursor-pointer ${account.isArchived ? 'opacity-60 grayscale' : ''}`}
                      >
                        <div className="flex items-center gap-[clamp(10px,2.4svw,14px)] min-w-0 pr-4">
                          <div 
                            className="flex items-center justify-center shrink-0 border border-neutral-100/80 bg-neutral-50/50 rounded-lg transition-all group-hover:border-[#0D9488]/20 group-hover:bg-[#0D9488]/5"
                            style={{ 
                              width: 'clamp(32px, 8.5svw, 38px)', 
                              height: 'clamp(32px, 8.5svw, 38px)', 
                              borderRadius: 'clamp(8px, 1.8svw, 11px)'
                            }}
                          >
                            {getCustomVectorIcon(account)}
                          </div>

                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-[clamp(6px,1.5svw,10px)] flex-wrap">
                              <span 
                                className="text-[#333333] tracking-tight truncate leading-tight font-g-sans group-hover:text-[#0D9488] transition-colors"
                                style={{ 
                                  fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                  fontWeight: 700,
                                  fontSize: 'clamp(14px, 3.8svw, 16px)'
                                }}
                              >
                                {account.name}
                              </span>
                              {(account.name === 'ADCB' || !!(account.interestRate && account.interestRate > 0)) && (
                                <span 
                                  className="px-1.5 py-0.5 text-[#0D9488] bg-[#0D9488]/8 border border-[#0D9488]/15 rounded-md font-g-sans font-medium"
                                  style={{ 
                                    fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                    fontSize: 'clamp(10px, 2.5svw, 11px)',
                                    fontWeight: 500
                                  }}
                                >
                                  Premium
                                </span>
                              )}
                            </div>
                            <span 
                              className="text-neutral-500 font-normal leading-tight font-g-sans mt-0.5"
                              style={{ 
                                fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                fontSize: 'clamp(11px, 2.8svw, 12.5px)',
                                fontWeight: 400
                              }}
                            >
                              {getAccountDetailsText(account)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-[clamp(8px,2svw,12px)] shrink-0 pr-0.5">
                          <div className="flex items-baseline gap-[clamp(4px,1.2svw,8px)] justify-end font-g-sans">
                            <span 
                              className="text-[#333333] tracking-tight whitespace-nowrap font-g-sans"
                              style={{ 
                                fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                fontSize: 'clamp(14px, 3.8svw, 16px)',
                                fontWeight: 700
                              }}
                            >
                              {Math.abs(currentBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span 
                              className="text-[#888888] font-g-sans"
                              style={{ 
                                fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                fontSize: 'clamp(11px, 2.8svw, 13px)',
                                fontWeight: 400
                              }}
                            >
                              {account.currency}
                            </span>
                            {account.currency !== activeBaseCurr && (
                              <span 
                                className="text-[#999999] whitespace-nowrap hidden sm:inline font-g-sans"
                                style={{ 
                                  fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif",
                                  fontSize: 'clamp(11px, 2.8svw, 12px)',
                                  fontWeight: 400
                                }}
                              >
                                (≈ {activeBaseCurr} {Math.abs(translatedBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                            )}
                          </div>
                          <ChevronRight 
                            className="text-[#888888] group-hover:text-neutral-600 group-hover:translate-x-0.5 transition-all shrink-0" 
                            style={{ 
                              width: 'clamp(14px, 3.5svw, 16px)', 
                              height: 'clamp(14px, 3.5svw, 16px)' 
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };

          return (
            <div className="flex flex-col gap-6 w-full animate-none">
              {renderSection("Bank Accounts", bankAccounts)}
              {renderSection("Investments", investmentAccounts)}
              {renderSection("Credit Cards and Debt", debtAccounts)}
              {renderSection("Other Accounts", otherAccounts)}
            </div>
          );
        })()}
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
