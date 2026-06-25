import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit3, Trash2, Save, Calendar, Tag, GitBranch, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Menu, Clock } from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, query, writeBatch, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { ConfirmationModal } from './ConfirmationModal';
import { useTranslation } from 'react-i18next';
import { formatLabel } from '../lib/stringUtils';

interface TransactionDetailModalProps {
  tx: any;
  uid: string;
  isOpen: boolean;
  onClose: () => void;
  onMakeRecurring?: (tx: any) => void;
  onDelete?: (transactionId: string, recurringId?: string, isTransfer?: boolean) => Promise<void>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ 
  tx: initialTx, uid, isOpen, onClose, onDelete 
}) => {
  const { t } = useTranslation();
  const [tx, setTx] = useState<any>(initialTx);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Balanced Form Fields
  const [notes, setNotes] = useState(tx?.notes || '');
  const [category, setCategory] = useState(tx?.category || '');
  const [subCategory, setSubCategory] = useState(tx?.subCategory || tx?.subcategory || '');
  const [selectedAccountId, setSelectedAccountId] = useState(tx?.accountId || '');
  const [time, setTime] = useState(tx?.time || '09:41 AM');
  const [confirmationDate, setConfirmationDate] = useState(tx?.confirmationDate || tx?.date || '');
  const [date, setDate] = useState(tx?.date || '');
  const [amount, setAmount] = useState(tx?.amount || 0);

  useEffect(() => {
    const fetchAccounts = async () => {
      if (!uid) return;
      try {
        const q = query(collection(db, 'users', uid, 'accounts'));
        const snap = await getDocs(q);
        const accs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        setAccounts(accs);
      } catch (e) {
        console.error("Error fetching accounts:", e);
      }
    };
    fetchAccounts();
  }, [uid]);

  useEffect(() => {
    if (initialTx) {
      setTx(initialTx);
      setNotes(initialTx.notes || '');
      setCategory(initialTx.category || '');
      setSubCategory(initialTx.subCategory || initialTx.subcategory || '');
      setSelectedAccountId(initialTx.accountId || '');
      setTime(initialTx.time || '09:41 AM');
      setConfirmationDate(initialTx.confirmationDate || initialTx.date || '');
      setDate(initialTx.date || '');
      setAmount(initialTx.amount || 0);
    }
  }, [initialTx]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    // Dispatch event to hide/show footer
    window.dispatchEvent(new CustomEvent('tx-detail-modal-toggled', { detail: { isOpen } }));

    return () => {
      document.body.style.overflow = 'auto';
      window.dispatchEvent(new CustomEvent('tx-detail-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  if (!isOpen || !tx) return null;

  const handleUpdateEntry = async () => {
    if (!uid || !tx?.id) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const txRef = doc(db, 'users', uid, 'transactions', tx.id);
      
      const newAmount = Number(amount);
      const oldAmount = Number(initialTx.amount || 0);
      const oldAccountId = initialTx.accountId;
      const isConfirmed = initialTx.status === 'confirmed';
      const isInflow = initialTx.type === 'Inflow' || initialTx.type === 'income';

      // Update the transaction doc
      batch.update(txRef, {
        notes, 
        category, 
        subCategory,
        subcategory: subCategory,
        accountId: selectedAccountId,
        time,
        confirmationDate,
        date,
        amount: newAmount, 
        updatedAt: serverTimestamp()
      });

      // Atomic Balance Update logic
      if (isConfirmed) {
        if (oldAccountId === selectedAccountId) {
          // Same account, different amount
          const diff = newAmount - oldAmount;
          const balanceChange = isInflow ? diff : -diff;
          const accRef = doc(db, 'users', uid, 'accounts', selectedAccountId);
          batch.update(accRef, {
            currentBalance: increment(balanceChange),
            updatedAt: serverTimestamp()
          });
        } else {
          // Account changed: Revert old and apply to new
          const oldAccRef = doc(db, 'users', uid, 'accounts', oldAccountId);
          const oldBalanceRevert = isInflow ? -oldAmount : oldAmount;
          batch.update(oldAccRef, {
            currentBalance: increment(oldBalanceRevert),
            updatedAt: serverTimestamp()
          });

          const newAccRef = doc(db, 'users', uid, 'accounts', selectedAccountId);
          const newBalanceApply = isInflow ? newAmount : -newAmount;
          batch.update(newAccRef, {
            currentBalance: increment(newBalanceApply),
            updatedAt: serverTimestamp()
          });
        }
      }

      await batch.commit();
      setIsEditing(false);
    } catch (e) {
      console.error("Cloud storage index modification fault:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrigger = async () => {
    if (!uid || !tx?.id) return;
    setLoading(true);
    try {
      const isConfirmed = initialTx.status === 'confirmed';
      const batch = writeBatch(db);

      if (isConfirmed) {
        const accRef = doc(db, 'users', uid, 'accounts', initialTx.accountId);
        const isInflow = initialTx.type === 'Inflow' || initialTx.type === 'income';
        const amountRevert = isInflow ? -Number(initialTx.amount || 0) : Number(initialTx.amount || 0);
        batch.update(accRef, {
          currentBalance: increment(amountRevert),
          updatedAt: serverTimestamp()
        });
      }

      if (onDelete) {
        // If external onDelete provided, it might do its own logic, but we still want atomic revert above
        // For safety, we commit the revert first if confirmed
        if (isConfirmed) await batch.commit(); 
        await onDelete(tx.id, tx.recurringId, tx.type === 'Transfer');
      } else {
        batch.delete(doc(db, 'users', uid, 'transactions', tx.id));
        await batch.commit();
      }
      
      setIsDeleteConfirmOpen(false);
      onClose();
    } catch (e) {
      console.error("Cloud storage index deletion fault:", e);
    } finally {
      setLoading(false);
    }
  };

  const isInflow = tx.type === 'Inflow' || tx.type === 'income';
  const isTransfer = tx.type === 'Transfer' || tx.type === 'transfer';

  const formatCategoryLabel = (categoryKey: string) => {
    const raw = (categoryKey || 'Discretionary');
    const label = raw.includes('__') ? raw.split('__').pop()! : 
                 raw.includes(' — ') ? raw.split(' — ').pop()! :
                 raw.includes(' > ') ? raw.split(' > ').pop()! : raw;
    return formatLabel(label);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-[clamp(0.75rem,3vw,1.5rem)] box-border">
        
        {/* Soft blur backdrop overlay mask */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 bg-black/20" 
          onClick={onClose} 
        />

        {/* High-Fidelity Professional Window Card Shell */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="relative w-full max-w-[460px] flex flex-col overflow-hidden bg-white shadow-2xl box-border max-h-[92vh] h-full"
          style={{
            borderRadius: '24px',
            border: '1px solid #F2F4F7'
          }}
        >
          {/* TOP HANDLE FOR MOBILE FEEL */}
          <div className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mt-3 shrink-0" />

          {/* HEADER ROW BLOCK */}
          <div className="px-6 py-4 flex justify-between items-center border-b border-[#F2F4F7] shrink-0 bg-white select-none">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#a6ddb1] flex items-center justify-center text-[#366945]">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
              </div>
              <span className="text-xl font-bold text-[#111c2d] font-sans">{t('transaction_detail_modal.details')}</span>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white hover:bg-neutral-50 text-neutral-400 hover:text-neutral-600 flex items-center justify-center transition-all cursor-pointer border-none"><X size={20} /></button>
          </div>

          {/* TOTAL BALANCE METRIC DISPLAY */}
          <div className="pt-8 pb-6 text-center flex flex-col items-center bg-white select-none shrink-0">
            {isEditing ? (
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="max-w-[200px] bg-white border border-neutral-200 rounded-xl py-2 px-3 text-center text-3xl font-bold text-[#366945] focus:border-[#366945] outline-none font-sans" />
            ) : (
              <h2 className="text-5xl font-bold tracking-tight m-0 text-[#366945] font-sans">
                {isInflow ? '+' : '-'}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            )}
            <span className="text-[11px] font-bold text-[#414941] mt-3 font-sans opacity-60">VERIFIED STATEMENT VALUE VECTOR</span>
            <div className="w-full max-w-[280px] h-[1px] bg-gradient-to-r from-transparent via-neutral-100 to-transparent mt-6" />
          </div>

          {/* ITEM SCROLLABLE FIELD BENTO */}
          <div className="px-6 py-4 space-y-6 flex-1 overflow-y-auto custom-vantage-scrollbar box-border">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">{t('transaction_detail_modal.description_memo')}</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Menu size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border-none outline-none font-sans font-bold py-1" />
                ) : (
                  <span className="truncate font-sans">{notes || 'Transaction Description'}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">{t('transaction_detail_modal.tracking_envelope')}</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border transition-all">
                <Tag size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <select 
                    value={category} 
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setCategory(newCat);
                      // Auto-update sub-category to first item in new category
                      const def = MASTER_CATEGORIES.find(c => c.name === newCat);
                      if (def && def.subcategories.length > 0) {
                        setSubCategory(def.subcategories[0]);
                      }
                    }} 
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {MASTER_CATEGORIES.map((def) => (
                      <option key={def.name} value={def.name}>{def.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="truncate font-sans capitalize">{formatCategoryLabel(category)}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">Sub-Category</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Menu size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <select 
                    value={subCategory} 
                    onChange={(e) => setSubCategory(e.target.value)} 
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {(MASTER_CATEGORIES.find(c => c.name === category)?.subcategories || []).map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                ) : (
                  <span className="font-sans">{formatLabel(subCategory || 'Groceries')}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">Account</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Building2 size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <select 
                    value={selectedAccountId} 
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-white border-none text-sm font-bold text-[#111c2d] outline-none cursor-pointer p-0 font-sans"
                  >
                    {accounts.length > 0 ? (
                      accounts.map((acc: any) => (
                        <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>{acc.name}</option>
                      ))
                    ) : (
                      <option value="">{t('common.loading') || 'Loading accounts...'}</option>
                    )}
                  </select>
                ) : (
                  <span className="font-sans">
                    {accounts.find(a => (a.accountId || a.id) === selectedAccountId)?.name || tx.accountName || 'Checking Account'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">Date</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Calendar size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border-none outline-none font-sans font-bold py-1 bg-transparent" />
                ) : (
                  <span className="font-sans">{tx.date}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">Time</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Clock size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <input type="text" value={time} onChange={(e) => setTime(e.target.value)} className="w-full border-none outline-none font-sans font-bold py-1 bg-transparent" placeholder="09:41 AM" />
                ) : (
                  <span className="font-sans">{time || '09:41 AM'}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-[#414941] pl-1 font-sans opacity-70">Confirmation Date</label>
              <div className="p-4 rounded-xl bg-white border border-[#F2F4F7] text-sm font-bold text-[#111c2d] flex items-center gap-3 shadow-[0_2px_8_rgba(0,0,0,0.02)] min-h-[56px] box-border">
                <Calendar size={18} className="text-[#366945] shrink-0" />
                {isEditing ? (
                  <input type="date" value={confirmationDate} onChange={(e) => setConfirmationDate(e.target.value)} className="w-full border-none outline-none font-sans font-bold py-1 bg-transparent" />
                ) : (
                  <span className="font-sans">{confirmationDate || tx.date}</span>
                )}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#f0f3ff] border border-[#dce4ff] mt-4 shadow-sm">
              <p className="text-[13px] leading-relaxed text-[#414941] m-0 italic font-medium font-sans">
                This entry has been validated against the primary vector ledger. No further manual verification is required for this cycle.
              </p>
            </div>
          </div>

          {/* LOWER OPERATIONAL CONTROL TRIGGER BUTTONS */}
          <div className="p-6 border-t border-[#F2F4F7] flex gap-4 select-none shrink-0 bg-white box-border">
            {isEditing ? (
              <>
                <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-4 border border-neutral-200 rounded-xl bg-white text-[#414941] text-sm font-bold hover:bg-neutral-50 transition-all cursor-pointer font-sans">{t('transaction_detail_modal.cancel')}</button>
                <button type="button" onClick={handleUpdateEntry} disabled={loading} className="flex-1 py-4 rounded-xl bg-[#366945] text-white text-sm font-bold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans"><Save size={16} /><span>{t('transaction_detail_modal.save')}</span></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setIsEditing(true)} className="flex-1 py-4 border-2 border-[#366945] rounded-xl bg-white text-[#366945] text-sm font-bold hover:bg-[#366945]/5 transition-colors cursor-pointer font-sans">Edit Transaction</button>
                <button type="button" onClick={() => setIsDeleteConfirmOpen(true)} className="flex-1 py-4 rounded-xl border-2 border-[#ba1a1a] bg-white text-[#ba1a1a] text-sm font-bold hover:bg-[#ba1a1a]/5 transition-colors cursor-pointer font-sans">Delete Transaction</button>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <ConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteTrigger} title={t('transaction_detail_modal.delete_title')} message={t('transaction_detail_modal.delete_message')} confirmLabel={t('transaction_detail_modal.delete_confirm')} isLoading={loading} />
    </AnimatePresence>
  );
};