import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Wallet, 
  Building2 as BankIcon, 
  Landmark, 
  CreditCard, 
  HandCoins, 
  Home, 
  Trash2, 
  Edit3, 
  ChevronRight,
  Archive as ArchiveIcon,
  ArrowLeft,
  Info,
  History as HistoryIcon,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Settings as SettingsIcon,
  X,
  Sparkles,
  Files as DocumentsIcon,
  CalendarDays,
  Percent,
  ShieldCheck,
  Ban
} from 'lucide-react';
import { 
  doc, 
  deleteDoc, 
  updateDoc, 
  writeBatch,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { AccountInsightsView } from './AccountInsightsView';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';

interface Account {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
  currency: string;
  bankAccountNumber?: string;
  interestRate?: number;
  isArchived?: boolean;
  totalGainLoss?: number;
  includeInLiquidity?: boolean;
  creditLimit?: number;
  paymentDueDate?: string;
  recurringProtocol?: string;
  bankAccountType?: 'Checking' | 'Savings';
  minBalanceFloor?: number;
  defaultTransferFee?: number;
  atmAutoSync?: boolean;
  dailySpendReminder?: boolean;
  subAssets?: {
    id: string;
    name: string;
    principalInvested: number;
    currentValue: number;
    passiveIncome: number;
    estimatedYield?: number;
    yieldPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'Yearly';
    assetId?: string;
    assetName?: string;
    investmentValue?: number;
  }[];
}

interface AccountDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTransaction?: () => void;
  onNavigateToTransactions?: (accountId: string) => void;
  account: Account | null;
  accounts: Account[];
  accountBalances: Record<string, number>;
  profile: any;
  transactions: any[];
  initialShowInsights?: boolean;
  initialIsManageMode?: boolean;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({ 
  isOpen, 
  onClose, 
  onAddTransaction,
  onNavigateToTransactions,
  account, 
  accounts,
  accountBalances,
  profile,
  transactions,
  initialShowInsights = false,
  initialIsManageMode = false
}) => {
  const [showInsights, setShowInsights] = useState(initialShowInsights);
  const [isManageMode, setIsManageMode] = useState(initialIsManageMode);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    type: 'archive' | 'delete' | null;
  }>({ isOpen: false, type: null });
  const [isHardDeleteMode, setIsHardDeleteMode] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [txToDelete, setTxToDelete] = useState<any>(null);

  // Form state for editing
  const [editName, setEditName] = useState(account?.name || '');
  const [editBalance, setEditBalance] = useState(account?.startingBalance?.toString() || '');
  const [atmAutoSync, setAtmAutoSync] = useState(account?.atmAutoSync || false);
  const [dailySpendReminder, setDailySpendReminder] = useState(account?.dailySpendReminder || false);
  const [minBalanceFloor, setMinBalanceFloor] = useState(account?.minBalanceFloor?.toString() || '');
  const [defaultTransferFee, setDefaultTransferFee] = useState(account?.defaultTransferFee?.toString() || '');
  const [bankAccountType, setBankAccountType] = useState<'Checking' | 'Savings'>(account?.bankAccountType || 'Checking');
  const [subAssets, setSubAssets] = useState<any[]>((account?.subAssets || []).map(sa => {
    const assetId = sa.assetId || sa.id || Math.random().toString(36).substring(2, 12);
    const assetName = sa.assetName || sa.name || '';
    const investmentValue = sa.investmentValue !== undefined ? sa.investmentValue : sa.currentValue || 0;
    return {
      ...sa,
      assetId,
      id: assetId,
      assetName,
      name: assetName,
      investmentValue,
      currentValue: investmentValue
    };
  }));
  const [paymentDueDate, setPaymentDueDate] = useState(account?.paymentDueDate || '');
  const [creditLimit, setCreditLimit] = useState(account?.creditLimit?.toString() || '');
  const [editType, setEditType] = useState(account?.type || 'cash');
  const [editInterestRate, setEditInterestRate] = useState(account?.interestRate?.toString() || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAllocationOpen, setIsAllocationOpen] = useState(false);
  const [allocationAmount, setAllocationAmount] = useState('');
  const [allocationSaId, setAllocationSaId] = useState('');
  
  const [subAssetTransactionModal, setSubAssetTransactionModal] = useState<{ saId: string, saName: string } | null>(null);
  const [saTxType, setSaTxType] = useState<'income' | 'appreciation' | 'expense'>('income');
  const [saTxAmount, setSaTxAmount] = useState('');
  const [saTxNote, setSaTxNote] = useState('');

  const currentBalance = account?.id ? (accountBalances[account.id] || 0) : 0;

  const auditData = React.useMemo(() => {
    if (!transactions || !account) return null;
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const relevantTxs = transactions.filter(tx => 
      tx.status !== 'draft' && 
      (tx as any).interval === undefined &&
      new Date(tx.date) <= todayEnd && 
      (tx.accountId === account.id || tx.toAccountId === account.id)
    );

    let totalIn = 0;
    let totalOut = 0;

    relevantTxs.forEach(tx => {
      const amount = Number(tx.amount || 0);
      if (tx.type === 'transfer') {
        const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === account.id && !tx.transferSide);
        const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === account.id && !tx.transferSide && !tx.hasMirror);

        if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === account.id : String(tx.toAccountId) === account.id)) {
           totalIn += amount;
        } else if (isSender && String(tx.accountId) === account.id) {
           totalOut += amount;
        }
      } else if (tx.type === 'income') {
        if (tx.accountId === account.id) totalIn += amount;
      } else if (tx.type === 'expense') {
        if (tx.accountId === account.id) totalOut += amount;
      }
    });

    return {
      starting: Number(account.startingBalance || 0),
      totalIn,
      totalOut,
      count: relevantTxs.length,
      cashPosition: Number(account.startingBalance || 0) + totalIn - totalOut
    };
  }, [transactions, account]);

  const totalPrincipal = React.useMemo(() => {
    return (account?.subAssets || []).reduce((sum, sa) => sum + Number(sa.principalInvested || 0), 0);
  }, [account?.subAssets]);

  const unallocatedCash = React.useMemo(() => {
    if (!auditData) return 0;
    return auditData.cashPosition - totalPrincipal;
  }, [auditData, totalPrincipal]);
  
  const nonLiquidAssets = React.useMemo(() => {
    return (account?.subAssets || []).reduce((sum, sa) => sum + Number(sa.currentValue || sa.principalInvested || 0), 0);
  }, [account?.subAssets]);

  const totalAccountValue = React.useMemo(() => {
    if (account?.type === 'investment') {
      return unallocatedCash + nonLiquidAssets;
    }
    return currentBalance;
  }, [account?.type, unallocatedCash, nonLiquidAssets, currentBalance]);

  const projectedBalance = React.useMemo(() => {
    if (!transactions || !account) return currentBalance;
    
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    const futureDelta = transactions
      .filter(tx => tx.status !== 'draft' && (tx as any).interval === undefined && new Date(tx.date) > todayEnd && (tx.accountId === account.id || tx.toAccountId === account.id))
      .reduce((sum, tx) => {
        const amount = Number(tx.amount);
        if (tx.type === 'transfer') {
           if (tx.toAccountId === account.id) return sum + amount;
           if (tx.accountId === account.id) return sum - amount;
           
           // Legacy side handlers
           if (tx.transferSide === 'receiver') return sum + amount;
           if (tx.transferSide === 'sender') return sum - amount;
        } else if (tx.type === 'income') {
           if (tx.accountId === account.id) return sum + amount;
        } else if (tx.type === 'expense') {
           if (tx.accountId === account.id) return sum - amount;
        }
        return sum;
      }, 0);
    
    return currentBalance + futureDelta;
  }, [transactions, account, currentBalance]);

  React.useEffect(() => {
    if (account) {
      setEditName(account.name);
      setEditBalance(account.startingBalance?.toString() || '0');
      setAtmAutoSync(account.atmAutoSync || false);
      setDailySpendReminder(account.dailySpendReminder || false);
      setMinBalanceFloor(account.minBalanceFloor?.toString() || '');
      setDefaultTransferFee(account.defaultTransferFee?.toString() || '');
      setBankAccountType(account.bankAccountType || 'Checking');
      setSubAssets((account.subAssets || []).map(sa => {
        const assetId = sa.assetId || sa.id || Math.random().toString(36).substring(2, 12);
        const assetName = sa.assetName || sa.name || '';
        const investmentValue = sa.investmentValue !== undefined ? sa.investmentValue : sa.currentValue || 0;
        return {
          ...sa,
          assetId,
          id: assetId,
          assetName,
          name: assetName,
          investmentValue,
          currentValue: investmentValue
        };
      }));
      setPaymentDueDate(account.paymentDueDate || '');
      setCreditLimit(account.creditLimit?.toString() || '');
      setEditType(account.type || 'cash');
      setEditInterestRate(account.interestRate?.toString() || '');
      setIsManageMode(initialIsManageMode);
      setIsEditMode(false);
      setShowInsights(initialShowInsights);
    }
  }, [account, initialShowInsights, initialIsManageMode]);

  const handleSubAssetTransaction = async () => {
    if (!subAssetTransactionModal || !profile?.uid || !account) return;
    const amount = parseFloat(saTxAmount) || 0;
    if (amount === 0 && saTxType !== 'appreciation') return;

    setIsLoading(true);
    try {
      const saId = subAssetTransactionModal.saId;
      const updatedSubAssets = (account.subAssets || []).map(sa => {
        if (sa.id === saId) {
          if (saTxType === 'income') return { ...sa, passiveIncome: (sa.passiveIncome || 0) + amount };
          if (saTxType === 'expense') return { ...sa, passiveIncome: (sa.passiveIncome || 0) - amount };
          if (saTxType === 'appreciation') return { ...sa, currentValue: (sa.currentValue || 0) + amount };
        }
        return sa;
      });

      await updateDoc(doc(db, `users/${profile.uid}/accounts`, account.id), {
        subAssets: updatedSubAssets
      });

      if (saTxType === 'income' || saTxType === 'expense') {
        await addDoc(collection(db, `users/${profile.uid}/transactions`), {
          accountId: account.id,
          amount: amount,
          category: 'Passive Interest',
          date: new Date().toISOString().split('T')[0],
          type: saTxType === 'income' ? 'income' : 'expense',
          note: `Asset: ${subAssetTransactionModal.saName}. ${saTxNote}`,
          status: 'confirmed',
          createdAt: serverTimestamp()
        });
      }

      setSubAssetTransactionModal(null);
      setSaTxAmount('');
      setSaTxNote('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${account.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAllocate = async () => {
    if (!profile?.uid || !account || !allocationAmount || !allocationSaId) return;
    const amount = parseFloat(allocationAmount);
    if (amount <= 0 || amount > unallocatedCash) return;

    setIsLoading(true);
    try {
      const updatedSubAssets = (account.subAssets || []).map(sa => {
        if (sa.id === allocationSaId) {
          const newPrincipal = Number(sa.principalInvested || 0) + amount;
          // If currentValue is 0, we also set it to the new principal to avoid "negative return" on new assets
          const newValue = Number(sa.currentValue || 0) === 0 ? newPrincipal : Number(sa.currentValue || 0) + amount;
          return {
            ...sa,
            principalInvested: newPrincipal,
            currentValue: newValue
          };
        }
        return sa;
      });

      await updateDoc(doc(db, `users/${profile.uid}/accounts`, account.id), {
        subAssets: updatedSubAssets
      });

      setIsAllocationOpen(false);
      setAllocationAmount('');
      setAllocationSaId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${account.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account) return null;

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

  const handleArchiveAccount = async () => {
    try {
      await updateDoc(doc(db, `users/${profile.uid}/accounts`, account.id), {
        isArchived: !account.isArchived
      });
      setConfirmModalConfig({ isOpen: false, type: null });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${account.id}`);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate Investment Principal
    if (editType === 'investment') {
      const totalPrincipalLocal = subAssets.reduce((sum, sa) => sum + (parseFloat(sa.principalInvested as any) || 0), 0);
      const totalValueLocal = subAssets.reduce((sum, sa) => sum + (parseFloat(sa.currentValue as any) || 0), 0);
      const unrealizedGains = totalValueLocal - totalPrincipalLocal;
      const walletBalance = currentBalance - unrealizedGains;

      if (totalPrincipalLocal > walletBalance) {
        setErrorMessage(`Allocation exceeded: Principal (${totalPrincipalLocal.toLocaleString()}) must be sourced from available Wallet Balance (${walletBalance.toLocaleString()}).`);
        return;
      }
    }

    setErrorMessage(null);
    try {
      let parsedStartingBalance = parseFloat(editBalance) || 0;
      if (['loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(editType)) {
        parsedStartingBalance = -Math.abs(parsedStartingBalance);
      }

      const updateData: any = {
        name: editName,
        startingBalance: parsedStartingBalance,
        type: editType,
        atmAutoSync,
        dailySpendReminder,
        minBalanceFloor: parseFloat(minBalanceFloor) || 0,
        defaultTransferFee: parseFloat(defaultTransferFee) || 0,
        bankAccountType,
        subAssets: subAssets.map(sa => {
          const assetId = sa.assetId || sa.id || Math.random().toString(36).substring(2, 12);
          const assetName = sa.assetName || sa.name || '';
          const investmentValue = typeof sa.investmentValue !== 'undefined' ? Number(sa.investmentValue) : (typeof sa.currentValue === 'string' ? parseFloat(sa.currentValue) : Number(sa.currentValue || 0));
          const principalInvested = typeof sa.principalInvested === 'string' ? parseFloat(sa.principalInvested) : Number(sa.principalInvested || 0);
          const passiveIncome = typeof sa.passiveIncome === 'string' ? parseFloat(sa.passiveIncome) : Number(sa.passiveIncome || 0);
          const estimatedYield = typeof sa.estimatedYield === 'string' ? parseFloat(sa.estimatedYield) : Number(sa.estimatedYield || 0);
          const yieldPeriod = sa.yieldPeriod || 'Yearly';

          return {
            assetId,
            id: assetId,
            assetName,
            name: assetName,
            investmentValue,
            currentValue: investmentValue,
            principalInvested,
            passiveIncome,
            estimatedYield,
            yieldPeriod
          };
        })
      };

      if (editType === 'investment') {
        updateData.currentBalance = updateData.subAssets.reduce((sum: number, sa: any) => sum + sa.investmentValue, 0);
      }

      if (['credit', 'Credit Card'].includes(editType)) {
        updateData.creditLimit = parseFloat(creditLimit) || 0;
      }

      if (['credit', 'Credit Card', 'loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(editType)) {
        updateData.interestRate = parseFloat(editInterestRate) || 0;
        updateData.paymentDueDate = paymentDueDate;
      }

      await updateDoc(doc(db, `users/${profile.uid}/accounts`, account.id), updateData);
      setIsEditMode(false);
      setIsManageMode(false);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}/accounts/${account.id}`);
    }
  };

  const handleDeleteAccount = async () => {
    if (!profile?.uid || !account) return;
    
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      
      if (isHardDeleteMode) {
        // Implementation of "Ghost Entry" logic for hard delete:
        // Identify all transfers where this account was the sender or receiver.
        const transfers = transactions.filter(tx => 
          tx.type === 'transfer' && 
          (tx.accountId === account.id || tx.toAccountId === account.id)
        );

        transfers.forEach(tx => {
          const isSource = tx.accountId === account.id;
          const counterpartyId = isSource ? tx.toAccountId : tx.accountId;
          
          if (counterpartyId && counterpartyId !== account.id) {
            // Convert the transfer in the OTHER account to a permanent "Settlement" expense.
            // This prevents the other account's balance from rebounding incorrectly.
            batch.update(doc(db, `users/${profile.uid}/transactions`, tx.id), {
              type: 'expense',
              accountId: counterpartyId,
              toAccountId: null,
              category: 'Settlement',
              note: `[ARCHIVE] Settlement for Deleted Account: ${account.name}. Original Note: ${tx.note || ''}`,
              status: 'confirmed',
              transferId: null,
              hasMirror: false
            });
          } else {
            // Internal movement within same account or orphan - delete
            batch.delete(doc(db, `users/${profile.uid}/transactions`, tx.id));
          }
        });

        // Delete other non-transfer history for THIS account
        const otherTxs = transactions.filter(tx => 
          tx.type !== 'transfer' && 
          (tx.accountId === account.id || tx.toAccountId === account.id)
        );
        otherTxs.forEach(d => {
          batch.delete(doc(db, `users/${profile.uid}/transactions`, d.id));
        });
      }

      batch.delete(doc(db, `users/${profile.uid}/accounts`, account.id));
      await batch.commit();
      
      setConfirmModalConfig({ isOpen: false, type: null });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/accounts/${account.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete || !profile?.uid) return;
    
    setIsLoading(true);
    try {
      if (txToDelete.type === 'transfer') {
        const batch = writeBatch(db);
        batch.delete(doc(db, `users/${profile.uid}/transactions`, txToDelete.id));
        const q = query(collection(db, `users/${profile.uid}/transactions`), where("transferId", "==", txToDelete.id));
        const snapshot = await getDocs(q);
        snapshot.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } else {
        await deleteDoc(doc(db, `users/${profile.uid}/transactions`, txToDelete.id));
      }
      setTxToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${profile.uid}/transactions/${txToDelete.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const hasFutureTxs = projectedBalance !== currentBalance;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 md:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative w-full overflow-y-auto max-h-[95vh] bg-white border border-[#E1E8ED] rounded-[1.25rem] shadow-2xl [WebkitOverflowScrolling:touch] flex flex-col mx-auto transition-all duration-300 ${
                isEditMode
                  ? 'max-w-[92%] md:max-w-2xl p-4 md:p-6 gap-4 md:gap-6'
                  : isManageMode 
                    ? 'max-w-[360px] md:max-w-[420px] p-[clamp(14px,3.5vw,18px)] gap-[clamp(8px,2.2vw,12px)]' 
                    : 'max-w-full md:w-[35%] md:max-w-[35%] md:min-w-[35%] lg:w-[35%] lg:max-w-[35%] lg:min-w-[35%] gap-2.5'
              }`}
            >
              {showInsights ? (
                <AccountInsightsView 
                  account={account!} 
                  accounts={accounts}
                  transactions={transactions} 
                  onBack={() => setShowInsights(false)} 
                  onAddTransaction={() => {
                    onAddTransaction?.();
                    onClose();
                  }}
                  onNavigateToTransactions={(accountId) => {
                    onNavigateToTransactions?.(accountId);
                    onClose();
                  }}
                  onSelectTransaction={setSelectedTx}
                  onDeleteTransaction={setTxToDelete}
                />
              ) : isEditMode ? (
                <form id="edit-account-form" onSubmit={handleUpdateAccount} className="w-full flex flex-col gap-4 p-4 bg-[#FFFFFF] rounded-2xl border border-neutral-100 font-g-sans" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}>
                  {/* Title Block - Natural Title case */}
                  <div className="flex justify-between items-center w-full pb-3 border-b border-neutral-100" id="edit-account-header">
                    <div className="flex flex-col gap-0.5" id="edit-account-title-container">
                      <h3 style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} className="text-[17px] text-neutral-800" id="edit-account-heading">
                        Edit account
                      </h3>
                      <p style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 400 }} className="text-[12px] text-neutral-500" id="edit-account-subtitle">
                        Modify your account family parameters and limits
                      </p>
                    </div>
                    <button type="button" onClick={() => setIsEditMode(false)} className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-50 transition-colors rounded-lg cursor-pointer" id="edit-account-close-button">
                      <X size={16} />
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-normal" style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }} id="edit-account-error">
                      {errorMessage}
                    </div>
                  )}

                  {/* Settings style list group - Identity parameters */}
                  <div className="flex flex-col gap-1.5 w-full" id="edit-account-identity-section">
                    <span 
                      className="text-neutral-500 font-normal text-[12px] px-1 font-g-sans" 
                      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
                    >
                      Identity parameters
                    </span>
                    <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB]">
                      {/* Row 1: Account name */}
                      <div className="flex items-center justify-between py-1.5 px-3" id="edit-name-group">
                        <label 
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                          className="text-[#333333] text-[13px] font-bold" 
                          id="edit-name-label"
                        >
                          Account name
                        </label>
                        <input 
                          required
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Account name"
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right' }}
                          className="w-1/2 bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7"
                          id="edit-name-input"
                        />
                      </div>

                      {/* Row 2: Account type */}
                      <div className="flex items-center justify-between py-1.5 px-3" id="edit-type-group">
                        <label 
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                          className="text-[#333333] text-[13px] font-bold" 
                          id="edit-type-label"
                        >
                          Account type
                        </label>
                        <div className="relative flex items-center justify-end">
                          <select 
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as any)}
                            style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right', direction: 'rtl' }}
                            className="bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none appearance-none cursor-pointer pr-4 py-0.5 h-7 leading-tight"
                            id="edit-type-select"
                          >
                            <option value="cash">Cash account</option>
                            <option value="bank">Bank account</option>
                            <option value="investment">Investment portfolio</option>
                            <option value="credit">Credit card</option>
                            <option value="loan">Personal loan</option>
                            <option value="mortgage">Mortgage</option>
                          </select>
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                            <ChevronRight size={10} className="rotate-90" />
                          </div>
                        </div>
                      </div>

                      {/* Row 3: Currency */}
                      <div className="flex items-center justify-between py-1.5 px-3" id="edit-currency-group">
                        <label 
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                          className="text-[#333333] text-[13px] font-bold" 
                          id="edit-currency-label"
                        >
                          Currency
                        </label>
                        <span 
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 400 }} 
                          className="text-right text-[13px] text-neutral-400 py-0.5 pr-1 font-normal"
                          id="edit-currency-select"
                        >
                          {account.currency}
                        </span>
                      </div>

                      {/* Row 4: Current balance */}
                      <div className="flex items-center justify-between py-1.5 px-3" id="edit-balance-group">
                        <label 
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                          className="text-[#333333] text-[13px] font-bold" 
                          id="edit-balance-label"
                        >
                          Current balance
                        </label>
                        <input 
                          required
                          type="text"
                          value={editBalance}
                          onChange={(e) => setEditBalance(e.target.value)}
                          placeholder="Current balance"
                          style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right' }}
                          className="w-1/2 bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7"
                          id="edit-balance-input"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Settings style list group - Financial boundaries block, conditional */}
                  {((editType === 'bank') || (['credit', 'Credit Card', 'loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(editType))) && (
                    <div className="flex flex-col gap-1.5 w-full" id="edit-account-boundaries-section">
                      <span 
                        className="text-neutral-500 font-normal text-[12px] px-1 font-g-sans" 
                        style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
                      >
                        Financial boundaries
                      </span>
                      <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB]">
                        {/* Bank type:Checking vs Savings segmented switch inline row */}
                        {editType === 'bank' && (
                          <div className="flex items-center justify-between py-1.5 px-3" id="edit-banktype-group">
                            <label 
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                              className="text-[#333333] text-[13px] font-bold" 
                              id="edit-banktype-label"
                            >
                              Account sub-type
                            </label>
                            <div className="flex bg-neutral-100 p-0.5 rounded-lg border border-[#E5E7EB]" id="edit-banktype-grid">
                              {['Checking', 'Savings'].map((t) => (
                                <button
                                  key={`edit-bank-sub-${t}`}
                                  type="button"
                                  onClick={() => setBankAccountType(t as any)}
                                  style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif" }}
                                  className={`px-3 py-1 text-xs rounded-md transition-all cursor-pointer ${bankAccountType === t ? 'bg-white text-[#0D9488] font-bold shadow-xs' : 'text-neutral-500 font-normal'}`}
                                  id={`edit-banktype-btn-${t}`}
                                >
                                  {t}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bank type:Min Balance Floor */}
                        {editType === 'bank' && (
                          <div className="flex items-center justify-between py-1.5 px-3" id="edit-minbalance-group">
                            <label 
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                              className="text-[#333333] text-[13px] font-bold" 
                              id="edit-minbalance-label"
                            >
                              Min balance floor
                            </label>
                            <input 
                              type="text"
                              value={minBalanceFloor}
                              onChange={(e) => setMinBalanceFloor(e.target.value)}
                              placeholder="0"
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right' }}
                              className="w-1/2 bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7"
                              id="edit-minbalance-input"
                            />
                          </div>
                        )}

                        {/* Credit rate */}
                        {(['credit', 'Credit Card', 'loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(editType)) && (
                          <div className="flex items-center justify-between py-1.5 px-3" id="edit-interest-group">
                            <label 
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                              className="text-[#333333] text-[13px] font-bold" 
                              id="edit-interest-label"
                            >
                              Interest rate
                            </label>
                            <input 
                              type="text"
                              value={editInterestRate}
                              onChange={(e) => setEditInterestRate(e.target.value.replace(/[^0-9.]/g, ''))}
                              placeholder="0%"
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right' }}
                              className="w-1/2 bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7"
                              id="edit-interest-input"
                            />
                          </div>
                        )}

                        {/* Credit / Debt Payment due date */}
                        {(['credit', 'Credit Card', 'loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(editType)) && (
                          <div className="flex items-center justify-between py-1.5 px-3" id="edit-duedate-group">
                            <label 
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                              className="text-[#333333] text-[13px] font-bold" 
                              id="edit-duedate-label"
                            >
                              Due date
                            </label>
                            <input 
                              type="date"
                              value={paymentDueDate}
                              onChange={(e) => setPaymentDueDate(e.target.value)}
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right', direction: 'rtl' }}
                              className="bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7 [color-scheme:light]"
                              id="edit-duedate-input"
                            />
                          </div>
                        )}

                        {/* Credit Limit for Credit Card */}
                        {(['credit', 'Credit Card'].includes(editType)) && (
                          <div className="flex items-center justify-between py-1.5 px-3" id="edit-creditlimit-row">
                            <label 
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }} 
                              className="text-[#333333] text-[13px] font-bold" 
                              id="edit-creditlimit-label"
                            >
                              Credit limit
                            </label>
                            <input 
                              type="text"
                              value={creditLimit}
                              onChange={(e) => setCreditLimit(e.target.value)}
                              placeholder="Credit limit"
                              style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700, textAlign: 'right' }}
                              className="w-1/2 bg-transparent text-right text-[13.5px] text-[#333333] focus:text-[#0D9488] focus:outline-none transition-colors py-0.5 px-1 h-7"
                              id="edit-creditlimit-input"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Submit buttons with weight 700 exclusively applied to active save pathway */}
                  <div className="flex gap-3 pt-3 border-t border-neutral-100 w-full" id="edit-account-actions">
                    <button 
                      type="button"
                      onClick={() => setIsEditMode(false)}
                      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 400 }}
                      className="px-5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded-xl transition-all flex items-center justify-center cursor-pointer font-normal border border-transparent"
                      id="edit-account-cancel-button"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isLoading}
                      style={{ fontFamily: "'Google Sans', 'Plus Jakarta Sans', sans-serif", fontWeight: 700 }}
                      className="flex-1 bg-[#0D9488] hover:bg-[#0D9488]/90 text-white text-xs rounded-xl active:scale-[0.98] transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 font-bold shadow-xs border border-transparent"
                      id="edit-account-save-button"
                    >
                      {isLoading ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={isManageMode ? 'p-0 flex flex-col gap-[clamp(8px,2.2vw,12px)] w-full' : 'p-3 md:p-5 flex flex-col gap-y-2 md:gap-y-3.5 w-full'}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center shrink-0">
                        {React.createElement(getAccountIcon(account.type), { className: "text-neutral-800", size: 24 })}
                      </div>
                      <div className="flex flex-col">
                        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm md:text-base text-black uppercase tracking-tight leading-none">{account.name}</h3>
                        <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-[#57606F] uppercase tracking-[0.2em] font-normal leading-normal mt-0.5">{account.type} Account</p>
                      </div>
                    </div>
                    <button 
                      onClick={onClose} 
                      className="p-2 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-colors text-neutral-500 hover:text-black cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {!isManageMode ? (
                    <>
                      <div className="flex flex-col gap-y-2">
                      {account.type === 'investment' && (
                        <div className="grid grid-cols-2 gap-2">
                           <div className="p-2.5 rounded-xl bg-[#edc091]/5 border border-[#edc091]/25 flex flex-col gap-y-1">
                               <div className="flex justify-between items-center">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-[#b16f39] uppercase tracking-widest flex items-center gap-1 leading-none">
                                     <Wallet size={10} style={{ display: 'inline' }} /> LIQUID ASSETS
                                  </span>
                                  {unallocatedCash > 0 && (
                                     <button 
                                       onClick={() => setIsAllocationOpen(true)}
                                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '18px' }}
                                       className="text-[7px] text-white uppercase tracking-widest bg-[#b16f39] px-1.5 rounded shadow-sm active:scale-95 cursor-pointer leading-none flex items-center justify-center font-normal"
                                     >
                                       Allocate
                                     </button>
                                  )}
                               </div>
                               <div className="flex items-baseline gap-1 mt-0.5">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(18px, 5.5vw, 24px)", lineHeight: "1.1" }} className="text-neutral-800">{ (unallocatedCash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }</span>
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-400">{account.currency}</span>
                                </div>
                               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7px] text-[#b16f39]/80 uppercase tracking-wide leading-none mt-0.5">Capital Available for Allocation</span>
                           </div>
                           
                           <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-y-1">
                               <div className="flex justify-between items-center">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-500 uppercase tracking-widest flex items-center gap-1 leading-none">
                                     <HistoryIcon size={10} style={{ display: 'inline' }} /> NON-LIQUID ASSETS
                                  </span>
                                </div>
                               <div className="flex items-baseline gap-1 mt-0.5">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(18px, 5.5vw, 24px)", lineHeight: "1.1" }} className="text-neutral-800">
                                    { (nonLiquidAssets || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }
                                  </span>
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-400">{account.currency}</span>
                                </div>
                               <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7px] text-neutral-500 uppercase tracking-wide leading-none mt-0.5">Deployed Capital in Sub-Assets</span>
                           </div>
                        </div>
                      )}

                      <div className="p-3 rounded-xl bg-[#426A5A]/5 border border-[#426A5A]/15 flex flex-col gap-y-1">
                          <div className="flex justify-between items-start">
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[8px] text-neutral-500 uppercase tracking-widest flex items-center gap-1 leading-none">
                                {account.type === 'investment' ? <Sparkles size={10} className="text-[#b16f39]" /> : <HistoryIcon size={10} />} 
                                {account.type === 'investment' ? 'TOTAL ACCOUNT VALUE' : 'CURRENT LIQUIDITY'}
                             </span>
                          </div>
                          <div className="flex items-baseline gap-1 mt-0.5">
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: "clamp(22px, 6.5vw, 32px)", lineHeight: "1.1" }} className={`tracking-tighter ${isLiability(account.type) ? 'text-[#b16f39]' : 'text-neutral-800'}`}>{(totalAccountValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-400">{account.currency}</span>
                          </div>
                      </div>
                         
                         {account.type === 'bank' && (
                            <div className="flex flex-col gap-2">
                               <div className="grid grid-cols-2 gap-2">
                                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-1 shadow-xs">
                                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-[#57606F] uppercase tracking-widest leading-none">ACCOUNT TYPE</span>
                                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-800 uppercase tracking-tight mt-0.5 leading-none">{account.bankAccountType || 'Checking'}</span>
                                  </div>
                                  <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-1 shadow-xs">
                                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-[#57606F] uppercase tracking-widest leading-none">MIN BALANCE FLOOR</span>
                                    <div className="flex items-center gap-1 mt-0.5 leading-none">
                                      <ShieldCheck size={10} className={currentBalance < (account.minBalanceFloor || 0) ? "text-[#b16f39]" : "text-emerald-600"} />
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`text-[9px] uppercase tracking-tight ml-1 ${currentBalance < (account.minBalanceFloor || 0) ? 'text-[#b16f39]' : 'text-neutral-800'}`}>
                                        {account.currency} {(account.minBalanceFloor || 0).toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                               </div>

                               {account.bankAccountType === 'Savings' && typeof account.interestRate === 'number' && account.interestRate > 0 && (
                                 <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col gap-1 shadow-xs">
                                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-emerald-800 uppercase tracking-widest flex items-center gap-1 leading-none">
                                       <Percent size={10} style={{ display: 'inline' }} /> ESTIMATED MONTHLY GROWTH
                                    </span>
                                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-neutral-800 mt-0.5">
                                       {account.currency} {(((currentBalance || 0) * (account.interestRate / 100)) / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7px] text-emerald-700/60 uppercase tracking-widest leading-none mt-0.5 font-normal">Based on {account.interestRate}% APR</p>
                                 </div>
                               )}
                            </div>
                         )}

                         {account.type === 'investment' && (
                           <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-3 gap-3">
                           <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                             <span className="text-[7.5px] text-neutral-500 uppercase tracking-widest font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>TOTAL INVESTED</span>
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9.5px] text-neutral-800 font-normal mt-0.5 leading-none">
                               {account.currency} {(account.subAssets?.reduce((sum, sa) => sum + sa.principalInvested, 0) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                             </span>
                           </div>
                           <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                             <span className="text-[7.5px] text-neutral-500 uppercase tracking-widest font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>CURRENT VALUE</span>
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9.5px] text-neutral-800 font-normal mt-0.5 leading-none">
                               {account.currency} {(account.subAssets?.reduce((sum, sa) => sum + sa.currentValue, 0) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                             </span>
                           </div>
                           <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col gap-0.5">
                             <span className="text-[7.5px] text-emerald-850 uppercase tracking-widest font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>TOTAL RETURN</span>
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9.5px] text-emerald-800 font-bold mt-0.5 leading-none">
                               {(() => {
                                  const totalInv = account.subAssets?.reduce((sum, sa) => sum + sa.principalInvested, 0) || 0;
                                  const totalVal = account.subAssets?.reduce((sum, sa) => sum + sa.currentValue, 0) || 0;
                                  if (totalInv === 0) return '0.00%';
                                   const res = ((totalVal - totalInv) / totalInv) * 100;
                                   return `${(isNaN(res) ? 0 : res).toFixed(2)}%`;
                               })()}
                             </span>
                           </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 mt-2">
                           <div className="flex justify-between items-center px-1">
                              <span className="text-[8px] text-neutral-500 uppercase tracking-widest font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>SUB-ASSET PERFORMANCE</span>
                           </div>
                            <div className="flex flex-col gap-1.5">
                               {account.subAssets?.map((sa, idx) => {
                                const gain = sa.currentValue - sa.principalInvested;
                                const returns = sa.principalInvested > 0 ? (gain / sa.principalInvested) * 100 : 0;
                                return (
                                  <div key={`sa-detail-${sa.id || 'none'}-${idx}`} className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-1 shadow-xs">
                                     <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-800 uppercase tracking-tight">{sa.name}</span>
                                           <button 
                                             onClick={() => setSubAssetTransactionModal({ saId: sa.id, saName: sa.name })}
                                             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7px] text-emerald-800 uppercase tracking-widest flex items-center gap-1 mt-0.5 cursor-pointer leading-none"
                                           >
                                             <Plus size={8} /> Add Transaction
                                           </button>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`text-[9px] ${gain >= 0 ? 'text-emerald-800' : 'text-[#b16f39]'}`}>
                                              {gain >= 0 ? '+' : ''}{gain.toLocaleString(undefined, { minimumFractionDigits: 0 })} {account.currency}
                                           </span>
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`text-[7px] px-1.5 py-0.5 rounded leading-none ${gain >= 0 ? 'bg-emerald-50 text-emerald-850' : 'bg-[#edc091]/15 text-[#b16f39]'}`}>
                                              {Number(sa.currentValue) === 0 ? 'NEW' : (returns >= 0 ? '+' : '') + (isNaN(returns) ? 0 : returns).toFixed(1) + '%'}
                                           </span>
                                        </div>
                                     </div>
                                     <div className="grid grid-cols-2 gap-2 mt-0.5 pt-1.5 border-t border-neutral-200">
                                        <div className="flex flex-col">
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[6px] text-neutral-400 uppercase tracking-widest leading-none">Projected (Future)</span>
                                           <div className="flex items-center gap-1 mt-0.5 leading-none">
                                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`text-[10px] ${(sa.estimatedYield || 0) < 0 ? 'text-[#b16f39]' : 'text-emerald-800'}`}>
                                                 {((sa.estimatedYield || 0) >= 0 ? '+' : '')}{(sa.estimatedYield || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                              </span>
                                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[6px] text-neutral-400 uppercase">/ {sa.yieldPeriod || 'mo'}</span>
                                           </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[6px] text-neutral-400 uppercase tracking-widest leading-none">Received (Current)</span>
                                           <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-emerald-800 mt-0.5 leading-none font-normal">{(sa.passiveIncome || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                     </div>
                                  </div>
                                );
                               })}
                           </div>
                        </div>
 
                         <div className="grid grid-cols-1 gap-4">
                            <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest">Asset Allocation Status</span>
                              <div className="flex items-center gap-1.5 mt-1 leading-none">
                                {unallocatedCash > 0 ? <AlertCircle size={10} className="text-[#b16f39]" /> : <ShieldCheck size={10} className="text-emerald-600" />}
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-neutral-800 uppercase tracking-tight">
                                   {unallocatedCash > 0 ? 'Liquid Assets Present' : 'Fully Allocated Assets'}
                                </span>
                              </div>
                            </div>
                         </div>
                           </div>
                         )}

                         {['credit', 'Credit Card'].includes(account.type) && (
                           <div className="grid grid-cols-2 gap-2">
                              <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest leading-none">CREDIT LIMIT</span>
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-800 mt-1 leading-none font-normal">
                                  {account.currency} { (account.creditLimit || 0).toLocaleString() }
                                </span>
                              </div>
                              <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest leading-none">PAYMENT DUE DATE</span>
                                <div className="flex items-center gap-1 mt-1 leading-none">
                                  <CalendarDays size={10} className="text-emerald-600" />
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-neutral-800 uppercase tracking-tight ml-1">{account.paymentDueDate || 'Not Set'}</span>
                                </div>
                              </div>
                           </div>
                         )}
 
                         {['loan', 'Personal Loan', 'mortgage', 'Mortgage'].includes(account.type) && (
                           <div className="grid grid-cols-2 gap-2">
                              <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest leading-none">INTEREST RATE</span>
                                <div className="flex items-center gap-1 mt-1 leading-none">
                                  <Percent size={10} className="text-emerald-600" />
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-neutral-800 uppercase tracking-tight ml-1">{account.interestRate}% APR</span>
                                </div>
                              </div>
                              <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-0.5">
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest leading-none">PAYMENT PROTOCOL</span>
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9px] text-neutral-800 mt-1.5 leading-none font-normal uppercase">{account.recurringProtocol || 'Manual'}</span>
                              </div>
                           </div>
                         )}
                         
                         {hasFutureTxs && (
                           <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col gap-1.5 shadow-xs">
                               <div className="flex justify-between items-start">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-emerald-850 uppercase tracking-widest flex items-center gap-1">
                                     <Sparkles size={10} style={{ display: 'inline' }} /> PROJECTED LIQUIDITY
                                  </span>
                                  <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`px-2 py-0.5 rounded text-[6.5px] font-bold uppercase ${projectedBalance >= currentBalance ? 'bg-emerald-100 text-emerald-800' : 'bg-[#edc091]/20 text-[#b16f39]'}`}>
                                     {projectedBalance >= currentBalance ? 'Surplus Expected' : 'Deficit Expected'}
                                  </div>
                                </div>
                               <div className="flex items-baseline gap-1 mt-1 leading-none">
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-2xl text-neutral-800 tracking-tight font-normal">{(projectedBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[9.5px] text-neutral-400 font-normal">{account.currency}</span>
                               </div>
                           </div>
                         )}
 
                         <div className="p-2.5 rounded-xl bg-neutral-50 border border-[#E1E8ED] flex flex-col gap-1 shadow-xs">
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[7.5px] text-neutral-400 uppercase tracking-widest flex items-center gap-1">
                                <Info size={10} style={{ display: 'inline' }} /> ACCOUNT STATUS
                             </span>
                             <div className="flex items-center gap-2 mt-1 leading-none">
                                <div className={`w-2 h-2 rounded-full ${account.isArchived ? 'bg-neutral-300' : 'bg-emerald-500'}`}></div>
                                <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className={`text-[10px] uppercase tracking-widest font-normal ${account.isArchived ? 'text-neutral-400' : 'text-neutral-800'}`}>
                                  {account.isArchived ? 'ARCHIVED' : 'ACTIVE'}
                                </span>
                             </div>
                         </div>
 
                         {auditData && (
                           <div className="p-3 rounded-xl bg-vantage-text/5 border border-vantage-text/10 dark:border-white/10 flex flex-col gap-1.5 shadow-xs">
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[8px] text-vantage-muted uppercase tracking-widest flex items-center gap-1">
                                 <HistoryIcon size={10} style={{ display: 'inline' }} /> BALANCE AUDIT (LIVE LEDGER)
                              </span>
                              <div className="space-y-2">
                                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="flex justify-between text-[9px] text-vantage-muted">
                                  <span>STARTING EQUILIBRIUM</span>
                                  <span className="text-vantage-text">+{Number(auditData.starting).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="flex justify-between text-[9px] text-vantage-muted">
                                  <span>GROSS INFLOW ({auditData.count} DOCS)</span>
                                  <span className="text-[#065F46] dark:text-[#20C997]">+{Number(auditData.totalIn).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="flex justify-between text-[9px] text-vantage-muted">
                                  <span>GROSS OUTFLOW</span>
                                  <span className="text-[#edc091]">-{Number(auditData.totalOut).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="h-px bg-vantage-text/10 my-1" />
                                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="flex justify-between text-[10px] uppercase">
                                  <span className="text-vantage-muted tracking-tighter italic">NET LIQUIDITY RESULT:</span>
                                  <span className="text-vantage-text">{(Number(auditData.starting) + Number(auditData.totalIn) - Number(auditData.totalOut)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                
                                {Math.abs((Number(auditData.starting) + Number(auditData.totalIn) - Number(auditData.totalOut)) - currentBalance) > 0.01 && (
                                  <div className="mt-2 p-2 bg-amber-500/10 rounded-lg flex items-center gap-2">
                                    <AlertCircle size={12} className="text-amber-500" />
                                    <span className="text-[8px] text-amber-500 font-bold uppercase tracking-tight">Sync Divergence Detected!</span>
                                  </div>
                                )}
                              </div>
                           </div>
                         )}
                      </div>

                       <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => setIsManageMode(true)}
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '38px' }} className="w-full bg-vantage-text/5 border border-[#edc091]/20 dark:border-[#edc091]/10 hover:bg-[#edc091]/10 text-vantage-text uppercase tracking-widest text-[10px] rounded-xl transition-all flex items-center justify-center gap-3 active:scale-98 hover:border-[#edc091]"
                        >
                          <SettingsIcon size={16} /> Manage Selected Account
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setIsEditMode(true);
                            setIsManageMode(false);
                          }}
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '38px' }} className="w-full bg-[#10B981] hover:bg-emerald-500 text-black uppercase tracking-widest text-[10px] rounded-xl transition-all flex items-center justify-center gap-3 active:scale-98 cursor-pointer"
                          id="detail-edit-account-button"
                        >
                          <Edit3 size={16} /> Edit Account
                        </button>
                        <button 
                          onClick={() => setShowInsights(true)}
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, height: '38px' }} className="w-full bg-[#edc091] text-white uppercase tracking-widest text-[10px] rounded-xl transition-all flex items-center justify-center gap-3 active:scale-98 shadow-lg shadow-[#edc091]/20 hover:bg-[#edc091]/90"
                        >
                          <TrendingUp size={16} /> View Account Details
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-[clamp(10px,2.5vw,14px)] w-full">
                      {/* Left configuration pane */}
                      <div className="flex flex-col gap-[clamp(10px,2.5vw,14px)] w-full">
                        <div className="p-[clamp(12px,3vw,16px)] rounded-xl bg-white border border-neutral-200 flex flex-col gap-y-[clamp(8px,2.2vw,12px)] shadow-sm w-full">
                          <span 
                            className="text-[#1F2937] uppercase tracking-[0.2em] flex items-center gap-2"
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 'clamp(10px, 2.8vw, 12px)' }}
                          >
                             <Edit3 size={12} className="text-[#1F2937]" /> ACCOUNT SETTINGS
                          </span>
                          
                          <div className="flex flex-col gap-y-[clamp(8px,2.2vw,12px)] w-full">
                            <div className="flex flex-col gap-[clamp(2px,0.8vw,4px)] w-full">
                              <label 
                                className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: 'clamp(8.5px, 2.2vw, 10.5px)' }}
                              >
                                Name
                              </label>
                              <input 
                                type="text"
                                disabled={account.isArchived}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className={`w-full bg-white border border-neutral-300 rounded-xl px-[clamp(10px,2.5vw,14px)] py-1.5 text-[#1F2937] focus:border-vantage-green outline-none transition-all ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.6vw, 13px)', height: 'clamp(32px, 8vw, 38px)' }}
                              />
                            </div>

                            {['credit', 'Credit Card'].includes(account.type) && (
                              <div className="grid grid-cols-2 gap-3 w-full">
                                <div className="flex flex-col gap-1">
                                  <label 
                                    className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                                  >
                                    Credit Limit
                                  </label>
                                  <input 
                                    type="number"
                                    disabled={account.isArchived}
                                    step="0.01"
                                    value={creditLimit}
                                    onChange={(e) => setCreditLimit(e.target.value)}
                                    className={`w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 font-mono text-[#1F2937]/90 focus:border-vantage-green outline-none transition-all ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)', height: '38px', maxHeight: '38px' }}
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label 
                                    className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                                  >
                                    Payment Due Date
                                  </label>
                                  <input 
                                    type="date"
                                    disabled={account.isArchived}
                                    value={paymentDueDate}
                                    onChange={(e) => setPaymentDueDate(e.target.value)}
                                    className={`w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 text-[#1F2937] focus:border-vantage-green outline-none transition-all [color-scheme:light] ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)', height: '38px', maxHeight: '38px' }}
                                  />
                                </div>
                              </div>
                            )}

                            {account.type === 'bank' && (
                              <div className="flex flex-col gap-y-2.5 w-full">
                                 <div className="flex flex-col gap-1 w-full">
                                    <label 
                                      className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                                    >
                                      Account Sub-Type
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 w-full">
                                       {['Checking', 'Savings'].map((t) => (
                                         <button
                                           key={t}
                                           type="button"
                                           disabled={account.isArchived}
                                           onClick={() => setBankAccountType(t as any)}
                                           style={{ height: '34px', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                           className={`py-0 flex items-center justify-center rounded-xl border uppercase tracking-[0.1em] text-[clamp(9.5px,2.5vw,11.5px)] transition-all ${bankAccountType === t ? 'bg-vantage-green/10 border-vantage-green text-[#065F46]' : 'bg-neutral-50 border-neutral-200 text-[#1F2937]/80'} ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                         >
                                           {t}
                                         </button>
                                       ))}
                                    </div>
                                 </div>
                                 <div className="grid grid-cols-2 gap-3 w-full">
                                    <div className="flex flex-col gap-1">
                                      <label 
                                        className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                                      >
                                        Min Balance
                                      </label>
                                      <input 
                                        type="number"
                                        disabled={account.isArchived}
                                        step="0.01"
                                        value={minBalanceFloor}
                                        onChange={(e) => setMinBalanceFloor(e.target.value)}
                                        className={`w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 font-mono text-[#1F2937] focus:border-vantage-green outline-none transition-all ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)', height: '38px', maxHeight: '38px' }}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label 
                                        className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                                      >
                                        Transfer Fee
                                      </label>
                                      <input 
                                        type="number"
                                        disabled={account.isArchived}
                                        step="0.01"
                                        value={defaultTransferFee}
                                        onChange={(e) => setDefaultTransferFee(e.target.value)}
                                        className={`w-full bg-white border border-neutral-300 rounded-xl px-3 py-2 font-mono text-[#1F2937] focus:border-vantage-green outline-none transition-all ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)', height: '38px', maxHeight: '38px' }}
                                      />
                                    </div>
                                 </div>
                              </div>
                            )}
                            <div className="flex flex-col gap-1 w-full">
                              <label 
                                className="text-[#1F2937]/75 uppercase tracking-wider pl-1"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
                              >
                                Starting Balance
                              </label>
                              <input 
                                type="number"
                                disabled={account.isArchived}
                                step="0.01"
                                value={editBalance}
                                onChange={(e) => setEditBalance(e.target.value)}
                                className={`w-full bg-white border border-neutral-300 rounded-xl px-4 py-2 font-mono text-sm text-[#065F46] focus:border-vantage-green outline-none transition-all ${account.isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 2.8vw, 13px)', height: '38px', maxHeight: '38px' }}
                              />
                              {errorMessage && (
                                <div className="mt-2 p-2 bg-[#edc091]/10 border border-[#edc091]/20 rounded-xl flex items-center gap-2">
                                   <X size={14} className="text-[#edc091]" />
                                   <span className="text-[9px] font-normal text-[#edc091] uppercase tracking-tight" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{errorMessage}</span>
                                </div>
                              )}
                              <div className="flex flex-col gap-1 mt-1 pl-1">
                                 <span 
                                   className="uppercase tracking-widest text-[#1F2937]/85"
                                   style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.6vw, 11.5px)' }}
                                 >
                                   Calculated Balance: <span className="text-[#065F46] font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>{currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {account.currency}</span>
                                 </span>
                                 <p 
                                   className="text-neutral-500 uppercase tracking-wide leading-tight mt-0.5"
                                   style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.3vw, 10.5px)' }}
                                 >
                                   New Projection: {(parseFloat(editBalance || '0') + (auditData?.totalIn || 0) - (auditData?.totalOut || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })} {account.currency}
                                 </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
 
                      {/* Right configuration / detail buttons pane */}
                      <div className="flex flex-col gap-3.5 w-full">
                        <div className="flex flex-col gap-3.5 w-full">
                          {account.type === 'investment' && (
                            <div className="p-[clamp(12px,3vw,16px)] rounded-xl bg-white border border-neutral-200 flex flex-col gap-y-[clamp(6px,1.8vw,10px)] shadow-sm w-full">
                               <div className="flex justify-between items-center px-1">
                                  <span 
                                    className="text-[#1F2937] uppercase tracking-widest font-semibold"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 'clamp(10px, 2.6vw, 12px)' }}
                                  >
                                    SUB-ASSET MANAGER
                                  </span>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const newId = Math.random().toString(36).substring(2, 12);
                                      setSubAssets([...subAssets, {
                                        assetId: newId,
                                        id: newId,
                                        assetName: '',
                                        name: '',
                                        principalInvested: '',
                                        investmentValue: '',
                                        currentValue: '',
                                        passiveIncome: '',
                                        estimatedYield: '',
                                        yieldPeriod: 'Yearly'
                                      } as any]);
                                    }}
                                    style={{ height: 'clamp(28px, 7vw, 32px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                                    className="text-[clamp(8.5px, 2.2vw, 10px)] text-vantage-green uppercase tracking-widest flex items-center gap-1 hover:text-[#1F2937] transition-colors cursor-pointer"
                                  >
                                    <Plus size={8} /> ADD ASSET
                                  </button>
                               </div>
                               <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                                  {subAssets.map((sa, idx) => (
                                    <div key={`sa-detail-edit-${sa.id || 'none'}-${idx}`} className="p-[clamp(8px,2.2vw,12px)] bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col gap-[clamp(6px,1.8vw,10px)]">
                                       <div className="flex justify-between items-center">
                                          <input 
                                            type="text"
                                            placeholder="Asset Name"
                                            value={sa.name || sa.assetName}
                                            onChange={(e) => {
                                              const newAssets = [...subAssets];
                                              newAssets[idx].name = e.target.value;
                                              newAssets[idx].assetName = e.target.value;
                                              setSubAssets(newAssets);
                                            }}
                                            className="bg-transparent border-none font-normal text-[#1F2937] outline-none placeholder:text-neutral-400 w-full"
                                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 3.2vw, 13px)' }}
                                          />
                                          <button 
                                            type="button"
                                            onClick={() => setSubAssets(subAssets.filter((_, i) => i !== idx))}
                                            className="text-neutral-400 hover:text-rose-500 transition-colors"
                                          >
                                            <X size={14} />
                                          </button>
                                       </div>
                                       <div className="grid grid-cols-4 gap-2">
                                          <div className="flex flex-col gap-1">
                                             <label 
                                               className="font-bold text-neutral-500 uppercase tracking-widest pl-0.5"
                                               style={{ fontSize: 'clamp(8px, 2vw, 9px)' }}
                                             >
                                               Principal
                                             </label>
                                             <input 
                                               type="number"
                                               value={sa.principalInvested}
                                               onChange={(e) => {
                                                 const newAssets = [...subAssets];
                                                 newAssets[idx].principalInvested = e.target.value;
                                                 setSubAssets(newAssets);
                                               }}
                                               className="bg-white border border-neutral-300 rounded-lg p-1 font-mono text-[#1F2937] outline-none w-full"
                                               style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}
                                             />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                             <label 
                                               className="font-bold text-neutral-500 uppercase tracking-widest pl-0.5"
                                               style={{ fontSize: 'clamp(8px, 2vw, 9px)' }}
                                             >
                                               Value
                                             </label>
                                             <input 
                                               type="number"
                                               value={sa.currentValue !== undefined ? sa.currentValue : sa.investmentValue}
                                               onChange={(e) => {
                                                 const newAssets = [...subAssets];
                                                 newAssets[idx].currentValue = e.target.value; newAssets[idx].investmentValue = e.target.value;
                                                 setSubAssets(newAssets);
                                               }}
                                               className="bg-white border border-neutral-300 rounded-lg p-1 font-mono text-[#1F2937] outline-none w-full"
                                               style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}
                                             />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                             <label 
                                               className="font-bold text-neutral-500 uppercase tracking-widest pl-0.5"
                                               style={{ fontSize: 'clamp(8px, 2vw, 9px)' }}
                                             >
                                               Yield
                                             </label>
                                             <input 
                                               type="number"
                                               value={sa.estimatedYield}
                                               onChange={(e) => {
                                                 const newAssets = [...subAssets];
                                                 newAssets[idx].estimatedYield = e.target.value;
                                                 setSubAssets(newAssets);
                                               }}
                                               placeholder="Yield"
                                               className="bg-white border border-neutral-300 rounded-lg p-1 font-mono text-[#1F2937] outline-none w-full"
                                               style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}
                                             />
                                          </div>
                                          <div className="flex flex-col gap-1">
                                             <label 
                                               className="font-bold text-neutral-500 uppercase tracking-widest pl-0.5"
                                               style={{ fontSize: 'clamp(8px, 2vw, 9px)' }}
                                             >
                                               Period
                                             </label>
                                             <select 
                                               value={sa.yieldPeriod || 'monthly'}
                                               onChange={(e) => {
                                                 const newAssets = [...subAssets];
                                                 newAssets[idx].yieldPeriod = e.target.value;
                                                 setSubAssets(newAssets);
                                               }}
                                               className="bg-white border border-neutral-300 rounded-lg p-0.5 font-mono text-[#1F2937] outline-none appearance-none w-full h-[25px] text-center"
                                               style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}
                                             >
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                                <option value="yearly">Yearly</option>
                                             </select>
                                          </div>
                                       </div>
                                       <div className="flex flex-col gap-1">
                                         <label 
                                           className="font-bold text-[#1F2937]/70 uppercase tracking-widest pl-0.5"
                                           style={{ fontSize: 'clamp(9px, 2.2vw, 10px)' }}
                                         >
                                           Received (Realized) Income
                                         </label>
                                         <input 
                                           type="number"
                                           value={sa.passiveIncome}
                                           onChange={(e) => {
                                             const newAssets = [...subAssets];
                                             newAssets[idx].passiveIncome = e.target.value;
                                             setSubAssets(newAssets);
                                           }}
                                           className="bg-white border border-neutral-300 rounded-lg p-1 font-mono text-[#1F2937] outline-none w-full"
                                           style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}
                                         />
                                       </div>
                                    </div>
                                  ))}
                               </div>
                            </div>
                          )}
 
                          {(account.type === 'cash' || account.type === 'Cash') && (
                            <div className="flex flex-col gap-y-[clamp(10px,2.5vw,14px)] p-[clamp(12px,3vw,16px)] bg-white border border-neutral-200 rounded-xl shadow-sm text-[#1F2937]">
                               <span 
                                 className="font-normal uppercase tracking-[0.2em] flex items-center gap-2"
                                 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 3.2vw, 13px)' }}
                               >
                                  <Sparkles size={12} className="text-[#1F2937]" /> AUTOMATION FEATURES
                                </span>
                               
                               <div className="flex items-center justify-between">
                                  <div className="flex flex-col gap-0.5">
                                     <span 
                                       className="font-normal text-[#1F2937] uppercase tracking-tight"
                                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 3.2vw, 13px)' }}
                                     >
                                       ATM Auto-Sync
                                     </span>
                                     <p 
                                       className="text-neutral-500 font-normal uppercase tracking-wide leading-tight"
                                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.8vw, 11px)' }}
                                     >
                                       Auto-transfer on ATM checkouts
                                     </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setAtmAutoSync(!atmAutoSync)}
                                    className={`w-10 h-5 rounded-full p-1 transition-colors ${atmAutoSync ? 'bg-[#065F46]' : 'bg-neutral-200'}`}
                                  >
                                    <motion.div 
                                      animate={{ x: atmAutoSync ? 20 : 0 }}
                                      className="w-3 h-3 bg-white rounded-full shadow-sm"
                                    />
                                  </button>
                               </div>
 
                               <div className="flex items-center justify-between">
                                  <div className="flex flex-col gap-0.5">
                                     <span 
                                       className="font-normal text-[#1F2937] uppercase tracking-tight"
                                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(11px, 3.2vw, 13px)' }}
                                     >
                                       Daily Spend Reminder
                                     </span>
                                     <p 
                                       className="text-neutral-500 font-normal uppercase tracking-wide leading-tight"
                                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.8vw, 11px)' }}
                                     >
                                       Receive GST reminders
                                     </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setDailySpendReminder(!dailySpendReminder)}
                                    className={`w-10 h-5 rounded-full p-1 transition-colors ${dailySpendReminder ? 'bg-[#065F46]' : 'bg-neutral-200'}`}
                                  >
                                    <motion.div 
                                      animate={{ x: dailySpendReminder ? 20 : 0 }}
                                      className="w-3 h-3 bg-white rounded-full shadow-sm"
                                    />
                                  </button>
                               </div>
                            </div>
                          )}
                        </div>
 
                        {/* Interactive setting actions and decision button bars */}
                        <div className="flex flex-col gap-[clamp(8px,2.2vw,12px)] mt-2">
                          <div className="grid grid-cols-2 gap-[clamp(8px,2vw,12px)]">
                            <button 
                              onClick={() => {
                                if (account.isArchived) {
                                  handleArchiveAccount();
                                } else {
                                  setConfirmModalConfig({ isOpen: true, type: 'archive' });
                                }
                              }}
                              style={{ height: 'clamp(32px, 8vw, 38px)', fontSize: 'clamp(9px, 2.2vw, 11px)', fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                              className={`rounded-xl uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 border ${
                                account.isArchived 
                                ? 'bg-[#1F2937]/10 border-[#1F2937] text-[#1F2937]' 
                                : 'bg-neutral-50 border-neutral-300 text-[#1F2937]/80 hover:bg-neutral-100'
                              }`}
                            >
                              <ArchiveIcon size={11} /> {account.isArchived ? 'Restore' : 'Archive'}
                            </button>
                            <button 
                               onClick={() => {
                                 setConfirmModalConfig({ isOpen: true, type: 'delete' });
                               }}
                               className="bg-[#edc091]/10 border border-[#edc091]/30 text-[#edc091] hover:bg-[#edc091]/25 uppercase tracking-[0.1em] rounded-xl transition-all flex items-center justify-center gap-2"
                               style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, height: 'clamp(32px, 8vw, 38px)', fontSize: 'clamp(9px, 2.2vw, 11px)' }}
                            >
                              <Trash2 size={11} /> Remove Account
                            </button>
                          </div>
 
                          <div className="flex gap-[clamp(8px,2.2vw,12px)]">
                            {!account.isArchived && (
                              <button 
                                onClick={handleUpdateAccount}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, height: 'clamp(32px, 8vw, 38px)', fontSize: 'clamp(9px, 2.2vw, 11px)' }}
                                className="flex-1 bg-[#10B981] hover:bg-[#059669] text-white uppercase tracking-[0.15em] rounded-xl active:scale-95 transition-all flex items-center justify-center"
                              >
                                Apply Changes
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setIsEditMode(false);
                                setIsManageMode(false);
                              }}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, height: 'clamp(32px, 8vw, 38px)', fontSize: 'clamp(9px, 2.2vw, 11px)' }}
                              className={`${account.isArchived ? 'w-full' : 'px-4'} bg-neutral-100 border border-neutral-300 text-[#1F2937]/70 uppercase tracking-[0.15em] rounded-xl hover:bg-neutral-200 hover:text-[#1F2937] transition-all flex items-center justify-center`}
                            >
                              {account.isArchived ? 'Go Back' : 'Cancel'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
         {confirmModalConfig.isOpen && (
           <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
             <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setConfirmModalConfig({ isOpen: false, type: null })}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm"
               id="confirm-modal-backdrop"
             />
             <motion.div
               initial={{ scale: 0.95, opacity: 0, y: 15 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 15 }}
               transition={{ ease: "easeOut", duration: 0.2 }}
               className="relative w-full max-w-[340px] md:max-w-[380px] bg-white border border-neutral-200 rounded-[1.25rem] p-5 flex flex-col items-center text-center gap-4 shadow-xl z-10"
               id="confirm-modal-card"
             >
               {/* Card Header block - bold font weight 700 exactly restricted here */}
               <h3 
                 className="text-neutral-800 uppercase tracking-wider text-[clamp(13px,3.8vw,16px)]"
                 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                 id="confirm-modal-title"
               >
                 {confirmModalConfig.type === 'delete' ? 'DELETE ACCOUNT' : 'ARCHIVE ACCOUNT'}
               </h3>

               {/* Bounding inner canvas prompt text - font weight 400 Google Sans */}
               <p 
                 className="text-neutral-500 leading-relaxed text-[clamp(11.5px,2.8vw,13.5px)] px-1"
                 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                 id="confirm-modal-warning-text"
               >
                 {confirmModalConfig.type === 'delete' 
                   ? 'Are you sure you want to delete this account?' 
                   : 'Are you sure you want to archive this account?'
                 }
               </p>

               {/* Execution action stacking block - gap of 3 */}
               <div className="flex flex-col w-full gap-3 mt-1" id="confirm-modal-actions">
                 <button 
                   onClick={async () => {
                     if (confirmModalConfig.type === 'delete') {
                       setIsHardDeleteMode(true);
                       await handleDeleteAccount();
                     } else {
                       await handleArchiveAccount();
                     }
                     setConfirmModalConfig({ isOpen: false, type: null });
                   }}
                   disabled={isLoading}
                   style={{ 
                     fontFamily: "'Google Sans', sans-serif", 
                     fontWeight: 400,
                     fontSize: 'clamp(11px, 2.8vw, 13px)'
                   }}
                   className="w-full h-[38px] md:h-[42px] bg-[#A6DDB1] hover:bg-[#86CA93] active:scale-95 text-neutral-800 transition-all rounded-xl uppercase tracking-wider flex items-center justify-center cursor-pointer disabled:opacity-50"
                   id="confirm-modal-proceed-button"
                 >
                   {isLoading ? 'Processing...' : 'PROCEED'}
                 </button>

                 <button 
                   onClick={() => setConfirmModalConfig({ isOpen: false, type: null })}
                   disabled={isLoading}
                   style={{ 
                     fontFamily: "'Google Sans', sans-serif", 
                     fontWeight: 400,
                     fontSize: 'clamp(11px, 2.8vw, 13px)'
                   }}
                   className="w-full text-neutral-400 hover:text-neutral-600 transition-colors uppercase tracking-wider text-center cursor-pointer py-1 disabled:opacity-50"
                   id="confirm-modal-cancel-button"
                 >
                   CANCEL
                 </button>
               </div>
             </motion.div>
           </div>
         )}
      </AnimatePresence>

      <AnimatePresence>
         {subAssetTransactionModal && (
           <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
             <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSubAssetTransactionModal(null)}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
             />
             <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="relative w-full max-w-sm bg-luxury-black thin-border rounded-[2.5rem] p-8 flex flex-col gap-6"
             >
                <div className="flex flex-col gap-1">
                   <h3 className="text-xl font-bold text-white uppercase tracking-tight">Add Asset Transaction</h3>
                   <p className="text-[10px] text-gold uppercase tracking-widest">{subAssetTransactionModal.saName}</p>
                </div>

                <div className="flex flex-col gap-4">
                   <div className="grid grid-cols-3 gap-2">
                      <button 
                        onClick={() => setSaTxType('income')}
                        className={`py-3 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${saTxType === 'income' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white/5 border-white/10 text-neutral-500'}`}
                      >
                         Rent/Div
                      </button>
                      <button 
                        onClick={() => setSaTxType('appreciation')}
                        className={`py-3 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${saTxType === 'appreciation' ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-white/5 border-white/10 text-neutral-500'}`}
                      >
                         Value Up
                      </button>
                      <button 
                        onClick={() => setSaTxType('expense')}
                        className={`py-3 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${saTxType === 'expense' ? 'bg-rose-500/10 border-rose-500 text-rose-500' : 'bg-white/5 border-white/10 text-neutral-500'}`}
                      >
                         Expense
                      </button>
                   </div>

                   <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-neutral-500 uppercase tracking-wider pl-1">Amount</label>
                      <input 
                        type="number"
                        value={saTxAmount}
                        onChange={(e) => setSaTxAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gold focus:border-gold outline-none"
                      />
                   </div>

                   <div className="flex flex-col gap-1.5">
                      <label className="text-[8px] font-black text-neutral-500 uppercase tracking-wider pl-1">Note (Optional)</label>
                      <input 
                        type="text"
                        value={saTxNote}
                        onChange={(e) => setSaTxNote(e.target.value)}
                        placeholder="e.g. Q1 Dividend"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-gold outline-none"
                      />
                   </div>
                </div>

                <div className="flex flex-col gap-3">
                   <button 
                     onClick={handleSubAssetTransaction}
                     disabled={isLoading || !saTxAmount}
                     className="w-full py-4 bg-gold text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-lg shadow-gold/20 active:scale-95 transition-all disabled:opacity-50"
                   >
                     {isLoading ? "Processing..." : "Commit Transaction"}
                   </button>
                   <button 
                     onClick={() => setSubAssetTransactionModal(null)}
                     className="w-full py-4 text-neutral-500 font-black uppercase tracking-[0.2em] text-[10px] hover:text-white transition-colors"
                   >
                     Cancel
                   </button>
                </div>
             </motion.div>
           </div>
         )}
      </AnimatePresence>

      <AnimatePresence>
         {isAllocationOpen && (
           <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
             <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsAllocationOpen(false)}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
             />
             <motion.div
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="relative w-full max-w-sm bg-luxury-black thin-border rounded-[2.5rem] p-8 flex flex-col gap-6 shadow-[0_20px_50px_rgba(218,165,32,0.15)]"
             >
                <div className="flex flex-col gap-1">
                   <h3 className="text-xl font-bold text-white uppercase tracking-tight">Allocate Sourced Funds</h3>
                   <div className="flex items-center gap-2">
                      <p className="text-[10px] text-gold uppercase tracking-widest font-bold">Unallocated: {unallocatedCash.toLocaleString()} {account.currency}</p>
                   </div>
                </div>

                <div className="flex flex-col gap-4">
                   <div className="flex flex-col gap-2">
                      <label className="text-[8px] font-black text-neutral-500 uppercase tracking-wider pl-1 font-bold">Transfer Amount to Asset</label>
                      <input 
                        type="number"
                        value={allocationAmount}
                        max={unallocatedCash}
                        onChange={(e) => setAllocationAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gold focus:border-gold outline-none"
                      />
                   </div>

                   <div className="flex flex-col gap-2">
                      <label className="text-[8px] font-black text-neutral-500 uppercase tracking-wider pl-1 font-bold">Select Destination Asset</label>
                      <div className="flex flex-col gap-2">
                         {account.subAssets?.map((sa, idx) => (
                           <button
                             key={`sa-alloc-${sa.id || 'none'}-${idx}`}
                             onClick={() => setAllocationSaId(sa.id)}
                             className={`p-4 rounded-xl border text-[10px] font-black uppercase text-left transition-all ${allocationSaId === sa.id ? 'bg-gold/10 border-gold text-gold' : 'bg-white/5 border-white/10 text-neutral-500'}`}
                           >
                             {sa.name}
                           </button>
                         ))}
                      </div>
                   </div>
                </div>

                <div className="flex flex-col gap-3">
                   <button 
                     onClick={handleAllocate}
                     disabled={isLoading || !allocationAmount || !allocationSaId || parseFloat(allocationAmount) > unallocatedCash}
                     className="w-full py-5 bg-gold text-black font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-lg shadow-gold/20 active:scale-95 transition-all disabled:opacity-50"
                   >
                     {isLoading ? "Processing..." : "Assign to Principal"}
                   </button>
                   <button 
                     onClick={() => setIsAllocationOpen(false)}
                     className="w-full py-4 text-neutral-500 font-black uppercase tracking-[0.2em] text-[10px] hover:text-white transition-colors"
                   >
                     Keep in Wallet
                   </button>
                </div>
             </motion.div>
           </div>
         )}
      </AnimatePresence>

      <TransactionDetailModal 
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        uid={profile.uid}
      />

      <ConfirmationModal 
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action will permanently remove the record from your ledger."
        confirmLabel="Destroy Record"
        isLoading={isLoading}
      />
    </>
  );
};
