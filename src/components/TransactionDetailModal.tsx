import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Edit3, Trash2, Save, Calendar, Tag, GitBranch, ArrowDownLeft, ArrowUpRight, ArrowRightLeft } from 'lucide-react';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { ConfirmationModal } from './ConfirmationModal';

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
  const [tx, setTx] = useState<any>(initialTx);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Balanced Form Fields
  const [notes, setNotes] = useState(tx?.notes || '');
  const [category, setCategory] = useState(tx?.category || '');
  const [amount, setAmount] = useState(tx?.amount || 0);

  useEffect(() => {
    if (initialTx) {
      setTx(initialTx);
      setNotes(initialTx.notes || '');
      setCategory(initialTx.category || '');
      setAmount(initialTx.amount || 0);
    }
  }, [initialTx]);

  if (!isOpen || !tx) return null;

  const handleUpdateEntry = async () => {
    if (!uid || !tx?.id) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', uid, 'transactions', tx.id), {
        notes, category, amount: Number(amount), updatedAt: serverTimestamp()
      });
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
      if (onDelete) {
        await onDelete(tx.id, tx.recurringId, tx.type === 'Transfer');
      } else {
        await deleteDoc(doc(db, 'users', uid, 'transactions', tx.id));
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
    return (categoryKey || 'Discretionary')
      .replace(/__/g, ' — ')
      .replace(/_/g, ' ')
      .toLowerCase();
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
          className="relative w-full max-w-[440px] flex flex-col overflow-hidden bg-white shadow-lg box-border max-h-[85vh]"
          style={{
            borderRadius: '16px',
            border: '1px solid #F2F4F7'
          }}
        >
          {/* HEADER ROW BLOCK */}
          <div className="p-5 flex justify-between items-center border-b border-[#F2F4F7] shrink-0 bg-white select-none">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${isInflow ? 'bg-primary-container/20 border-primary/20 text-primary' : (isTransfer ? 'bg-surface-container border-outline-variant/20 text-on-surface' : 'bg-surface-container border-outline-variant/20 text-on-surface')}`}>
                {isInflow ? <ArrowDownLeft size={16} /> : (isTransfer ? <ArrowRightLeft size={16} /> : <ArrowUpRight size={16} />)}
              </div>
              <span className="text-sm font-bold text-on-surface tracking-tight capitalize">{isEditing ? 'Modify entry parameters' : 'Transaction details'}</span>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center border border-outline-variant/20 transition-all cursor-pointer"><X size={16} /></button>
          </div>

          {/* TOTAL BALANCE METRIC DISPLAY */}
          <div className="p-6 text-center flex flex-col items-center border-b border-[#F2F4F7] shrink-0 bg-white select-none">
            {isEditing ? (
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="max-w-[200px] bg-white border border-outline-variant/30 rounded-xl py-2 px-3 text-center text-xl font-bold text-on-surface focus:border-primary outline-none tracking-tight" />
            ) : (
              <h2 className={`text-[clamp(1.75rem,4vw,2.35rem)] font-extrabold tracking-tight m-0 leading-none ${isInflow ? 'text-primary' : 'text-on-surface'}`}>
                {isInflow ? '+' : '-'}{amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            )}
            <span className="text-[9px] font-bold text-on-surface-variant tracking-widest uppercase mt-2">Verified statement value vector</span>
          </div>

          {/* ITEM SCROLLABLE FIELD BENTO */}
          <div className="p-5 space-y-4 flex-1 overflow-y-auto container-scroll-patch box-border">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant pl-1 select-none">Description memo</label>
              {isEditing ? (
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full bg-white border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:border-primary outline-none" />
              ) : (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-[#F2F4F7] text-sm font-semibold text-on-surface break-words">{notes || 'Unrecorded description memo statement'}</div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant pl-1 select-none">Tracking envelope</label>
              {isEditing ? (
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-white border border-outline-variant/30 rounded-xl py-2.5 px-4 text-sm text-on-surface focus:border-primary outline-none cursor-pointer">
                  {Object.entries(MASTER_CATEGORIES).map(([key, def]: [string, any]) => (<option key={key} value={key} className="bg-white text-on-surface capitalize">{def.label.toLowerCase()}</option>))}
                </select>
              ) : (
                <div className="p-3.5 rounded-xl bg-surface-container-low border border-[#F2F4F7] text-sm font-semibold text-on-surface capitalize flex items-center gap-2 select-none">
                  <Tag size={14} className="text-primary shrink-0" />
                  <span className="truncate">{formatCategoryLabel(category)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 select-none">
              <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant pl-1 select-none">Confirmation date</label>
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-[#F2F4F7] text-sm font-semibold text-on-surface flex items-center gap-2">
                <Calendar size={14} className="text-primary shrink-0" />
                <span className="font-mono text-xs">{tx.date}</span>
              </div>
            </div>

            {tx.isSplit && (
              <div className="p-4 rounded-xl bg-primary-container/10 border border-primary/10 flex flex-col gap-1.5 select-none">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary"><GitBranch size={14} /><span>Split allocation active</span></div>
                <p className="text-[11px] leading-relaxed text-on-surface-variant m-0">This transaction balances leave allocations distributed across family tracking trees.</p>
              </div>
            )}
          </div>

          {/* LOWER OPERATIONAL CONTROL TRIGGER BUTTONS */}
          <div className="p-5 border-t border-[#F2F4F7] flex gap-3 select-none shrink-0 bg-white box-border">
            {isEditing ? (
              <>
                <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-3 border border-outline-variant/30 rounded-xl bg-surface-container-low text-on-surface-variant text-xs font-bold hover:bg-surface-container transition-all cursor-pointer">Cancel</button>
                <button type="button" onClick={handleUpdateEntry} disabled={loading} className="flex-1 py-3 rounded-xl bg-primary text-on-primary text-xs font-bold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none"><Save size={13} /><span>Save changes</span></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setIsEditing(true)} className="flex-1 py-3 border border-outline-variant/30 rounded-xl bg-white text-on-surface text-xs font-bold hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5 cursor-pointer">Amend parameters</button>
                <button type="button" onClick={() => setIsDeleteConfirmOpen(true)} className="flex-1 py-3 rounded-xl bg-error-container/20 hover:bg-error-container/30 text-error border border-error/10 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer">Purge entry</button>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <ConfirmationModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} onConfirm={handleDeleteTrigger} title="Purge Record" message="Are you sure you want to permanently erase this financial ledger transaction index statement entry?" confirmLabel="Destroy record node" isLoading={loading} />
    </AnimatePresence>
  );
};