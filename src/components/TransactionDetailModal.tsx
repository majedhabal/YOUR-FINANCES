import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Edit3, Trash2, Save, Calendar, Tag, Filter, 
  MessageSquare, ArrowUpRight, ArrowDownLeft, ArrowRightLeft,
  ChevronDown, GitBranch, RefreshCw, Check
} from 'lucide-react';
import { 
  doc, runTransaction, serverTimestamp, collection, 
  query, getDocs, onSnapshot, deleteDoc, setDoc, where, writeBatch, getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { MASTER_CATEGORIES } from '../lib/constants';
import { ConfirmationModal } from './ConfirmationModal';
import { getCachedAccessToken, deleteGoogleCalendarEvent } from '../lib/googleAuth';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';

interface TransactionDetailModalProps {
  tx: any;
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  onMakeRecurring?: (tx: any) => void;
  onDelete?: (transactionId: string, recurringId?: string, isTransfer?: boolean) => Promise<void>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ tx: initialTx, uid, isOpen, onClose, onMakeRecurring, onDelete }) => {
  const [tx, setTx] = useState<any>(initialTx);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [splitGroup, setSplitGroup] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  // Edit States
  const [amount, setAmount] = useState('');
  const [type, setType] = useState(tx?.type || 'expense');
  const isTransfer = type?.toLowerCase() === 'transfer';
  const isTxTransfer = tx?.type?.toLowerCase() === 'transfer';
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    setTx(initialTx);
  }, [initialTx]);

  useEffect(() => {
    if (uid) {
      const getProfile = async () => {
         const profileRef = doc(db, "users", uid);
         const snap = await getDoc(profileRef);
         if (snap.exists()) {
            setProfile(snap.data());
         }
      };
      getProfile();
    }
  }, [uid]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        console.error("Failed to sync exchange rates:", err);
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    if (isOpen && tx) {
      setAmount(tx.amount.toString());
      setType(tx.type);
      setAccountId(tx.accountId);
      setToAccountId(tx.toAccountId || '');
      setCategory(tx.category || '');
      setSubcategory(tx.subcategory || '');
      setNotes(tx.notes || '');
      setDate(tx.date || '');
      
      // Fetch Accounts
      const fetchAccounts = async () => {
        const q = query(collection(db, `users/${uid}/accounts`));
        const snap = await getDocs(q);
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      };
      
      // Fetch Categories
      const qCat = query(collection(db, `users/${uid}/categories`));
      const unsubCat = onSnapshot(qCat, (snap) => {
        setUserCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      // Fetch Split Group if applicable
      if (tx.groupId) {
        const qSplit = query(collection(db, `users/${uid}/transactions`), where("groupId", "==", tx.groupId));
        getDocs(qSplit).then(snap => {
          setSplitGroup(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
      } else {
        setSplitGroup([]);
      }

      fetchAccounts();
      return () => {
        unsubCat();
      };
    }
  }, [isOpen, tx, uid]);

  // Ensure Source and Destination remain distinct during edit
  useEffect(() => {
    if (isEditing && isTransfer && accountId && toAccountId && accountId === toAccountId) {
       const other = accounts.find(a => a.id !== accountId);
       if (other) setToAccountId(other.id);
       else setToAccountId('');
    }
  }, [accountId, type, accounts, isEditing]);

  const effectiveCategories = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;
  const currentCategoryData = effectiveCategories.find(c => c.name === category);

  const handleUpdate = async () => {
    if (!tx || !uid) return;
    const txAmount = parseFloat(amount);
    
    if (isTransfer && accountId === toAccountId) {
      alert("Source and Destination cannot be the same.");
      return;
    }
    
    if (isNaN(txAmount)) {
      alert("Invalid numeric value for amount.");
      return;
    }

    setLoading(true);

    try {
      const userPath = `users/${uid}`;
      const txRef = doc(db, `${userPath}/transactions`, tx.id);
      
      // --- PREPARE TRANSACTION DATA ---
      let txUpdateData: any = {
         userId: uid,
         type,
         amount: txAmount,
         accountId,
         date,
         updatedAt: serverTimestamp()
      };

      if (isTransfer) {
         txUpdateData.toAccountId = toAccountId || null;
         if (notes.trim()) txUpdateData.notes = notes.trim();
         txUpdateData.category = 'Internal Transfer';
         txUpdateData.emoji = '🔄';
      } else {
         if (category) txUpdateData.category = category;
         if (subcategory) txUpdateData.subcategory = subcategory;
         if (notes.trim()) txUpdateData.notes = notes.trim();
         if (tx.emoji) txUpdateData.emoji = tx.emoji;
      }

      // Execute update on the transaction doc only
      await setDoc(txRef, txUpdateData, { merge: true });

      setIsEditing(false);
      onClose();
    } catch (err: any) {
      console.error("Strategic Update Failed:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transactions/${tx.id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tx || !uid) return;
    setLoading(true);
    try {
      if (onDelete) {
        await onDelete(tx.id, tx.recurringId, isTxTransfer);
        setIsDeleteConfirmOpen(false);
        onClose();
        return;
      }

      const userPath = `users/${uid}`;
      const txRef = doc(db, `${userPath}/transactions`, tx.id);
      
      // Try to clean up the associated recurring rule if this is a recurring transaction instance
      if (tx.recurringId) {
        try {
          const recRef = doc(db, `${userPath}/recurringTransactions`, tx.recurringId);
          const recSnap = await getDoc(recRef);
          if (recSnap.exists()) {
            const recData = recSnap.data();
            // Delete associated Google Calendar event if found
            if (recData.isSyncedToCalendar && recData.gCalendarEventId) {
              const token = getCachedAccessToken();
              if (token) {
                try {
                  await deleteGoogleCalendarEvent(token, recData.gCalendarEventId);
                } catch (calErr) {
                  console.error("Failed to automatically delete calendar event:", calErr);
                }
              }
            }
            await deleteDoc(recRef);
          }
        } catch (recurringErr) {
          console.error("Failed to delete associated recurring rule:", recurringErr);
        }
      }

      // 1. Gather all relationship group tokens for cascading deletion
      const tokens = new Set<string>();
      tokens.add(tx.id);
      if (tx.parentTransferId) tokens.add(tx.parentTransferId);
      if (tx.correlationGroupId) tokens.add(tx.correlationGroupId);
      if (tx.transferId) tokens.add(tx.transferId);

      // 2. Query and retrieve all matching docs sharing the tokens
      const txsColRef = collection(db, `${userPath}/transactions`);
      const docsToDelete = new Set<string>();
      docsToDelete.add(tx.id);

      for (const token of tokens) {
        const q1 = query(txsColRef, where("transferId", "==", token));
        const s1 = await getDocs(q1);
        s1.forEach(d => docsToDelete.add(d.id));

        const q2 = query(txsColRef, where("parentTransferId", "==", token));
        const s2 = await getDocs(q2);
        s2.forEach(d => docsToDelete.add(d.id));

        const q3 = query(txsColRef, where("correlationGroupId", "==", token));
        const s3 = await getDocs(q3);
        s3.forEach(d => docsToDelete.add(d.id));
      }

      // 3. Delete everything in a single write batch pipeline payload to prevent data asymmetry
      const batch = writeBatch(db);
      docsToDelete.forEach(docId => {
        batch.delete(doc(db, `${userPath}/transactions`, docId));
      });
      await batch.commit();
      
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (err) {
       console.error("Strategic Deletion Failed:", err);
       handleFirestoreError(err, OperationType.DELETE, `users/${uid}/transactions/${tx.id}`);
    } finally {
       setLoading(false);
    }
  };

  if (!tx) return null;

  const totalSplitAmount = splitGroup.reduce((sum, item) => sum + item.amount, 0);

  // Evaluate the native currency token string
  const selectedAccount = accounts.find(a => a.id === (isEditing ? accountId : tx.accountId));
  const nativeCurrency = selectedAccount?.currency || tx.nativeCurrency || tx.currency || 'AED';
  const profileBaseCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  
  const uniqueLegs = splitGroup.filter(item => item.transferSide !== 'receiver');
  const grandTotal = uniqueLegs.reduce((sum, item) => sum + item.amount, 0) || tx.amount;

  const rate = (exchangeRates && exchangeRates[nativeCurrency]) || DEFAULT_RATES[nativeCurrency as keyof typeof DEFAULT_RATES] || 1;
  const baseRateToAED = (exchangeRates && exchangeRates[profileBaseCurrency]) || DEFAULT_RATES[profileBaseCurrency as keyof typeof DEFAULT_RATES] || 1;
  const currentAmountValue = isEditing ? (parseFloat(amount) || 0) : (tx.amount || 0);
  const translatedAmount = (currentAmountValue * rate) / baseRateToAED;
  const hasConversion = nativeCurrency !== profileBaseCurrency;

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-black/20 backdrop-blur-md overscroll-none"
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300, duration: 0.3 }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`relative w-full sm:max-w-[480px] ${uniqueLegs.length > 0 ? 'lg:max-w-4xl' : '' } bg-[rgba(255,255,255,0.35)] backdrop-blur-[25px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] rounded-[24px] shadow-[0_0_20px_-5px_rgba(166,221,177,0.3)] flex flex-col max-h-[90vh] overflow-hidden pointer-events-auto`}
            style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}
          >
            {/* Header - Fixed & Compact */}
            <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-[rgba(30,34,41,0.08)] bg-transparent">
               <button onClick={onClose} className="p-1 text-neutral-400 hover:text-[#20C997] transition-colors active:scale-90">
                  <X size={18} />
               </button>
               <h2 className="flex items-center gap-2 text-[clamp(0.85rem,1.8vw,0.95rem)] tracking-wider text-neutral-500 font-medium" style={{ fontFamily: '"Google Sans", sans-serif', opacity: 0.7 }}>
                  TRANSACTION DETAILS
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-[#A6DDB1] bg-[rgba(166,221,177,0.1)] text-[#0E9F6E] font-medium">
                    <Check size={10} />
                    Verified
                  </span>
               </h2>
               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-1 rounded-lg transition-all ${isEditing ? 'bg-[#20C997] text-white shadow-sm' : 'text-neutral-400 hover:text-[#20C997]'} active:scale-90`}
                  >
                     <Edit3 size={15} />
                  </button>
               </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4.5 space-y-3.5 scrollbar-hide [WebkitOverflowScrolling:touch] bg-transparent">
               {/* Amount & Type Hero (Ultra Compact) */}
               <div className="flex flex-col items-center gap-1 py-2 sm:py-2.5 border-b border-neutral-100 bg-[#FFFFFF]">
                  {isEditing ? (
                    <div className="flex flex-col items-center gap-3 w-full">
                       <div className="flex gap-1 p-0.5 bg-neutral-100 rounded-lg border border-neutral-200">
                          {['expense', 'income', 'transfer'].map(t => (
                            <button
                               key={t}
                               type="button"
                               onClick={() => setType(t as any)}
                               className={`px-3 py-1 rounded-md text-[clamp(10px,2vw,12px)] tracking-wider transition-all ${type === t ? 'bg-[#20C997] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
                               style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}
                            >
                               {t === 'expense' ? 'Debit' : t === 'income' ? 'Credit' : 'Move'}
                            </button>
                          ))}
                       </div>
                       <div className="relative flex items-center justify-center w-full max-w-[200px] px-4">
                          <input 
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="bg-transparent text-[clamp(20px,5vw,28px)] text-center text-black outline-none w-full font-bold"
                            style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}
                          />
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-400 text-[clamp(11px,2.5vw,13px)] font-normal" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                             {nativeCurrency}
                          </span>
                       </div>
                    </div>
                  ) : (
                    <>
                       <div className="flex flex-col items-center gap-1.5 justify-center">
                          <div className="flex items-baseline gap-1.5 justify-center">
                             <span className={`${tx.type === 'income' ? 'text-[#20C997]' : 'text-neutral-900'} text-[clamp(20px,5vw,28px)] font-bold`} style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}>
                                {(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             </span>
                             <span className="text-[clamp(11px,2.5vw,13px)] text-neutral-500 tracking-wider font-normal" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                {nativeCurrency}
                             </span>
                          </div>
                          <div className="text-[clamp(11px,2.2vw,13px)] text-gray-500 font-normal flex items-baseline gap-1 justify-center mt-0.5" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                             <span className="font-normal" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>≈</span>
                             <span className="font-bold text-gray-700" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}>
                                {translatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             </span>
                             <span className="font-normal" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>{profileBaseCurrency}</span>
                          </div>
                       </div>
                    </>
                  )}
               </div>

               {/* Account Row */}
               <div className="flex items-center justify-between p-4 mx-3 bg-[rgba(255,255,255,0.35)] backdrop-blur-[25px] border border-[rgba(255,255,255,0.45)] rounded-[24px] transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-lg cursor-pointer">
                  <div className="flex items-center gap-3">
                     <RefreshCw className="w-5 h-5 text-neutral-600"/>
                     <span className="text-[clamp(0.95rem,2.2vw,1.1rem)] font-medium text-[#1E2229]" style={{ fontFamily: '"Google Sans", sans-serif' }}>Account: {accounts.find(a => a.id === tx.accountId)?.name || 'Unknown'}</span>
                  </div>
               </div>

               {/* Dual Column Layout Grid (Adaptive Desktop Lock) */}
               <div className={`grid grid-cols-1 ${uniqueLegs.length > 0 ? 'lg:grid-cols-2 lg:gap-6' : 'grid-cols-1'} gap-4`}>
                 
                 {/* Left Panel: Attributes & Edit Fields */}
                 <div className="space-y-2">
                    <span className="text-[clamp(10px,2vw,11px)] text-neutral-400 font-normal uppercase tracking-wider block mb-1">
                       Protocol Attributes
                    </span>

                    {isEditing ? (
                      <div className="bg-transparent border border-neutral-100 rounded-xl overflow-hidden p-3 space-y-3">
                         {/* Source Account select */}
                         <div className="flex flex-col gap-0.5">
                            <span className="text-[12px] text-[#000000] font-bold">Account</span>
                            <select 
                              value={accountId}
                              onChange={(e) => setAccountId(e.target.value)}
                              className="w-full bg-[#FFFFFF] border border-neutral-200 rounded-[30px] p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none cursor-pointer font-normal"
                              style={{ fontFamily: '"Google Sans", sans-serif' }}
                            >
                               {accounts.map((acc, idx) => (
                                 <option key={`tx-source-account-${acc.id || 'no-id'}-${idx}`} value={acc.id} className="bg-white text-black">
                                   {acc.name} ({acc.currency})
                                 </option>
                               ))}
                            </select>
                         </div>
                         {/* Destination Account select if transfer */}
                         {isTransfer && (
                            <div className="flex flex-col gap-0.5 pt-2">
                               <span className="text-[12px] text-[#000000] font-bold">Destination</span>
                               <select 
                                 value={toAccountId}
                                 onChange={(e) => setToAccountId(e.target.value)}
                                 className="w-full bg-[#FFFFFF] border border-neutral-200 rounded-[15px] p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none cursor-pointer font-normal"
                                 style={{ fontFamily: '"Google Sans", sans-serif' }}
                               >
                                  {accounts.filter(a => a.id !== accountId).map((acc, idx) => (
                                    <option key={`tx-dest-account-${acc.id || 'no-id'}-${idx}`} value={acc.id} className="bg-white text-black">
                                      {acc.name} ({acc.currency})
                                    </option>
                                  ))}
                               </select>
                            </div>
                         )}

                         {/* Category and Subcategory selects if not transfer */}
                         {!isTransfer && (
                            <div className="grid grid-cols-2 gap-2 pt-2">
                               <div className="flex flex-col gap-0.5">
                                  <span className="text-[12px] text-[#000000] font-bold">Category</span>
                                  <select 
                                    value={category}
                                    onChange={(e) => {
                                       setCategory(e.target.value);
                                       setSubcategory('');
                                    }}
                                    className="w-full bg-[#FFFFFF] border border-neutral-200 rounded-[15px] p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none cursor-pointer font-normal"
                                    style={{ fontFamily: '"Google Sans", sans-serif' }}
                                  >
                                     {effectiveCategories.map((c, idx) => (
                                       <option key={`tx-category-opt-${c.id || 'no-id'}-${c.name || 'no-name'}-${idx}`} value={c.name}>
                                         {c.name}
                                       </option>
                                     ))}
                                  </select>
                               </div>

                               <div className="flex flex-col gap-0.5">
                                  <span className="text-[12px] text-[#000000] font-bold">Subcategory</span>
                                  <select 
                                    value={subcategory}
                                    onChange={(e) => setSubcategory(e.target.value)}
                                    className="w-full bg-[#FFFFFF] border border-neutral-200 rounded-[15px] p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none cursor-pointer font-normal"
                                    style={{ fontFamily: '"Google Sans", sans-serif' }}
                                  >
                                     <option value="">None</option>
                                     {currentCategoryData?.subcategories?.map((s: string, idx: number) => (
                                       <option key={`sub-cat-opt-${category}-${s}-${idx}`} value={s}>
                                         {s}
                                       </option>
                                     ))}
                                  </select>
                               </div>
                            </div>
                         )}

                         {/* Date select */}
                         <div className="flex flex-col gap-0.5 pt-2">
                            <span className="text-[10px] text-neutral-400 font-normal tracking-wider">Temporal Marker</span>
                            <input 
                              type="date"
                              value={date}
                              onChange={(e) => setDate(e.target.value)}
                              className="w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-lg p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none font-normal"
                              style={{ fontFamily: '"Google Sans", sans-serif' }}
                            />
                         </div>

                         {/* Note textarea */}
                         <div className="flex flex-col gap-0.5 pt-2">
                            <span className="text-[10px] text-neutral-400 font-normal tracking-wider">Annotations</span>
                            <textarea 
                               value={notes}
                               onChange={(e) => setNotes(e.target.value)}
                               className="w-full bg-[#FFFFFF] border border-[#E1E8ED] rounded-lg p-2 text-[clamp(11px,2.5vw,13px)] text-black outline-none h-14 resize-none font-normal"
                               style={{ fontFamily: '"Google Sans", sans-serif' }}
                               placeholder="Append metadata..."
                            />
                         </div>
                      </div>
                    ) : (
                      <div className="bg-transparent border border-neutral-100 rounded-xl overflow-hidden divide-y divide-neutral-100">
                         {/* Execution Path (Source Wallet) */}
                         <div className="p-3">
                           <div className="flex justify-between items-center text-[clamp(11px,2.5vw,13px)]">
                             <span className="text-neutral-400 font-normal tracking-wider">Source Wallet</span>
                             <span className="text-neutral-800 font-normal" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                               {accounts.find(a => a.id === tx.accountId)?.name || 'Unknown Account'}
                             </span>
                           </div>
                         </div>

                         {isTxTransfer && (
                           <div className="p-3">
                             <div className="flex justify-between items-center text-[clamp(11px,2.5vw,13px)]">
                               <span className="text-neutral-400 font-normal tracking-wider">Destination</span>
                               <span className="text-neutral-800 font-normal" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                                 {accounts.find(a => a.id === tx.toAccountId)?.name || `Node ${tx.toAccountId?.slice(-4) || 'Unknown'}`}
                               </span>
                             </div>
                           </div>
                         )}

                         {!isTxTransfer && (
                           <div className="p-3">
                             <div className="flex justify-between items-center text-[clamp(11px,2.5vw,13px)]">
                               <span className="text-neutral-400 font-normal tracking-wider">Categorization</span>
                               <div className="text-right">
                                 <span className="text-neutral-800 font-normal" style={{ fontFamily: '"Google Sans", sans-serif' }}>{tx.category}</span>
                                 {tx.subcategory && (
                                   <span className="text-neutral-400 font-normal block text-[clamp(10px,2vw,11px)] leading-none mt-0.5" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                                     {tx.subcategory}
                                   </span>
                                 )}
                               </div>
                             </div>
                           </div>
                         )}

                         <div className="p-3">
                           <div className="flex justify-between items-center text-[clamp(11px,2.5vw,13px)]">
                             <span className="text-neutral-400 font-normal tracking-wider">Temporal Marker</span>
                             <span className="text-neutral-800 font-normal uppercase" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                               {new Date(tx.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                             </span>
                           </div>
                         </div>

                         <div className="p-3">
                           <div className="flex flex-col gap-1 text-[clamp(11px,2.5vw,13px)]">
                             <span className="text-neutral-400 font-normal tracking-wider">Annotations</span>
                             <p className="text-neutral-700 font-normal text-left leading-relaxed mt-0.5" style={{ fontFamily: '"Google Sans", sans-serif' }}>
                               {tx.notes || "No annotations recorded."}
                             </p>
                           </div>
                         </div>
                      </div>
                    )}
                 </div>

                 {/* Right Panel: Split Ledger allocation (Conditional layout) */}
                 {uniqueLegs.length > 0 && (
                    <div className="space-y-2">
                       <span className="text-[clamp(10px,2vw,11px)] text-neutral-400 font-normal tracking-wider block mb-1">
                          Split Ledger Allocation
                       </span>
                       
                       <div className="bg-transparent border border-neutral-100 rounded-xl p-2.5 sm:p-3 min-h-[90px] sm:min-h-[110px] flex flex-col justify-between">
                          <div className="text-[clamp(9.5px,2vw,10.5px)] text-neutral-400 font-normal tracking-wider pb-1.5 border-b border-neutral-100 mb-0.5 flex items-center justify-between">
                             <span>Allocation Matrix</span>
                             <span className="text-neutral-500 font-mono font-normal">
                                {uniqueLegs.length} legs resolved
                             </span>
                          </div>

                          {/* Split items list can scroll if overflowing, or align side-by-side on desktop */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 divide-y md:divide-y-0 divide-neutral-100 pointer-events-auto">
                             {uniqueLegs.map((item, index) => {
                                const legAccount = accounts.find(a => a.id === item.accountId);
                                const legCurrency = nativeCurrency;
                                const legRate = (exchangeRates && exchangeRates[legCurrency]) || DEFAULT_RATES[legCurrency as keyof typeof DEFAULT_RATES] || 1;
                                const legTranslatedAmount = (item.amount * legRate) / baseRateToAED;
                                const legHasConversion = legCurrency !== profileBaseCurrency;
                                const percentage = grandTotal > 0 ? (item.amount / grandTotal) * 100 : 0;

                                return (
                                   <div 
                                      key={`split-leg-item-${item.id || index}`}
                                      className="flex justify-between items-center py-1 sm:py-1.5 text-[clamp(10px,2vw,12px)] text-neutral-800 border-b border-neutral-100 md:border-b-0"
                                   >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                         <span className="font-normal truncate text-neutral-700">
                                            {legAccount?.name || 'Main Account'}
                                         </span>
                                         <span className="text-[9px] font-normal px-1 py-0.5 rounded-full bg-neutral-100/80 text-neutral-500 shrink-0 select-none border border-neutral-200/20">
                                            {percentage.toFixed(1)}%
                                         </span>
                                      </div>
                                      <div className="text-right shrink-0 flex flex-col items-end">
                                         <div className="flex items-baseline gap-1 justify-end">
                                            <span className="font-bold text-neutral-900" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}>
                                               {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="font-normal text-neutral-500 text-[10px]" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                               {legCurrency}
                                            </span>
                                         </div>
                                         <div className="text-gray-500 font-normal flex items-baseline gap-0.5 justify-end text-[clamp(9px,2vw,11px)] mt-0.5" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                                            <span className="font-normal text-gray-400" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>≈</span>
                                            <span className="font-bold text-gray-600" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}>
                                               {legTranslatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="font-normal text-gray-400 text-[10px]" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>{profileBaseCurrency}</span>
                                         </div>
                                      </div>
                                   </div>
                                );
                             })}
                          </div>
                       </div>
                    </div>
                 )}

               </div>
            </div>

            {/* Sticky Footer Actions (Compact) */}
            <div className="p-4 border-t border-[rgba(30,34,41,0.08)] bg-transparent flex flex-col gap-3">
               {/* Converted global base value calculation */}
               <div 
                  className="flex justify-between items-center text-[clamp(11px,2.2vw,12px)] text-neutral-500 font-normal select-none pb-0.5"
                  style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}
               >
                  <span className="font-normal text-neutral-500" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>Reference Valuation</span>
                  <span className="font-normal text-neutral-500" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 400 }}>
                     Total Base Value: <span className="font-bold text-neutral-950" style={{ fontFamily: '"Google Sans", sans-serif', fontWeight: 700 }}>{translatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {profileBaseCurrency}
                  </span>
               </div>

               <div className="flex items-center justify-between gap-3 w-full">
                  {isEditing ? (
                 <>
                   <button 
                     type="button"
                     onClick={() => setIsEditing(false)}
                     className="flex-1 py-4 bg-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.6)] backdrop-blur-sm border border-[rgba(255,255,255,0.2)] rounded-[14px] text-[clamp(11px,2.5vw,13px)] tracking-wider text-neutral-600 transition-all cursor-pointer font-medium"
                     style={{ fontFamily: '"Google Sans", sans-serif' }}
                   >
                      Discard
                   </button>
                   <button 
                     type="button"
                     onClick={handleUpdate}
                     disabled={loading}
                     className="flex-[2] py-4 bg-[#A6DDB1] hover:opacity-90 rounded-[15px] text-[clamp(11px,2.5vw,13px)] tracking-wider text-white shadow-sm disabled:opacity-50 transition-all cursor-pointer font-medium"
                     style={{ fontFamily: '"Google Sans", sans-serif' }}
                   >
                      {loading ? 'Processing...' : 'Commit changes'}
                   </button>
                 </>
               ) : (
                 <div className="flex gap-3 w-full">
                    {!tx.recurringId && (
                      <button 
                         type="button"
                         onClick={() => onMakeRecurring?.(tx)}
                         className="flex-1 py-3 bg-[#20C997]/10 text-[#20C997] hover:bg-[#20C997]/15 border border-[#20C997]/20 rounded-xl text-[clamp(11px,2.2vw,12px)] tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer font-normal"
                         style={{ fontFamily: '"Google Sans", sans-serif' }}
                      >
                         <RefreshCw size={13} /> Reoccur
                      </button>
                    )}
                    <button 
                       type="button"
                       onClick={handleDelete}
                       className="flex-1 py-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500/15 border border-rose-500/20 rounded-xl text-[clamp(11px,2.2vw,12px)] tracking-wide transition-all flex items-center justify-center gap-1.5 cursor-pointer font-normal"
                       style={{ fontFamily: '"Google Sans", sans-serif' }}
                    >
                       <Trash2 size={13} /> Delete Entry
                    </button>
                 </div>
               )}
               </div>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmationModal 
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Transaction"
        message="Are you sure you want to delete this transaction? This action will permanently remove the record and revert its impact on your balances."
        confirmLabel="Confirm Deletion"
        isLoading={loading}
      />
    </AnimatePresence>
  );
};
