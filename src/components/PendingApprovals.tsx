import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Trash2, Clock, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownLeft, Landmark, Calendar, ShieldCheck } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp, getDocs, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { TransactionDetailModal } from './TransactionDetailModal';
import { ConfirmationModal } from './ConfirmationModal';
import { getCachedAccessToken, connectGoogleWorkspace, createGoogleTask } from '../lib/googleAuth';

interface PendingApprovalsProps {
  uid: string;
  accounts: any[];
  onTransactionApproved?: () => void;
}

export const PendingApprovals: React.FC<PendingApprovalsProps> = ({ uid, accounts, onTransactionApproved }) => {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [recurringTxs, setRecurringTxs] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);

  const handleToggleSyncToTasks = async (tx: any, acc: any) => {
    try {
      let token = getCachedAccessToken();
      if (!token) {
        token = await connectGoogleWorkspace();
      }
      if (!token) {
        alert("Google authorization is required to sync to Google Tasks.");
        return;
      }

      const taskDetails = {
        title: tx.notes || 'Scheduled Transfer',
        amount: tx.amount,
        currency: acc?.currency || 'AED',
        accountName: acc?.name || 'Account',
        dueDate: tx.date || new Date().toISOString().split('T')[0]
      };

      const res = await createGoogleTask(token, taskDetails);
      if (res && res.id) {
        const txRef = doc(db, `users/${uid}/transactions`, tx.id);
        await updateDoc(txRef, {
          isSyncedToTasks: true,
          googleTaskId: res.id
        });
        alert(`Successfully synced "${tx.notes}" as a task in Google Tasks!`);
      }
    } catch (err: any) {
      console.error(err);
      alert("Error syncing to Google Tasks: " + err.message);
    }
  };

  useEffect(() => {
    if (!uid) return;

    // Listen to Draft Transactions
    const qDrafts = query(
      collection(db, `users/${uid}/transactions`),
      where('status', '==', 'draft')
    );
    const unsubDrafts = onSnapshot(qDrafts, (snap) => {
      setDrafts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Listen to Recurring Definitions to auto-generate drafts if needed
    const qRecurring = query(
      collection(db, `users/${uid}/recurringTransactions`),
      where('isActive', '==', true)
    );
    const unsubRecurring = onSnapshot(qRecurring, (snap) => {
      const recs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecurringTxs(recs);
      checkAndGenerateDrafts(recs);
    });

    return () => {
      unsubDrafts();
      unsubRecurring();
    };
  }, [uid]);

  const calculateNextDate = (baseDate: string, freq: string, interval: number, dayOption: 'sameDay' | 'sameDate' = 'sameDate') => {
    // Create date from YYYY-MM-DD at noon local time to avoid timezone shifts
    const [year, month, day] = baseDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    if (freq === 'daily') {
      d.setDate(d.getDate() + interval);
    } else if (freq === 'weekly') {
      d.setDate(d.getDate() + (interval * 7));
    } else if (freq === 'monthly') {
      if (dayOption === 'sameDate') {
        d.setMonth(d.getMonth() + interval);
        // Handle end of month slipping (e.g. Jan 31 -> Feb 28)
        if (d.getDate() < originalDay) {
           // We slipped to next month, go back to last day of intended month
           d.setDate(0);
        }
      } else {
        // sameDay: Find the same weekday in the target month
        d.setMonth(d.getMonth() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    } else if (freq === 'yearly') {
      if (dayOption === 'sameDate') {
        d.setFullYear(d.getFullYear() + interval);
      } else {
        d.setFullYear(d.getFullYear() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    }
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const checkAndGenerateDrafts = async (recs: any[]) => {
    // Use local YYYY-MM-DD for today to avoid UTC offset issues
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;

    const batch = writeBatch(db);
    let hasChanges = false;

    for (const rec of recs) {
      let nextDate = rec.nextGenerationDate;
      
      // If today is past or equal to next generation date
      if (nextDate && nextDate <= today) {
        // Double check if we already generated a draft for this date to avoid duplicates 
        // (though in a real system we'd have a more robust way)
        
        const txRef = doc(collection(db, `users/${uid}/transactions`));
        const draftData = {
          id: txRef.id,
          userId: uid,
          type: rec.type,
          amount: rec.amount,
          accountId: rec.accountId,
          category: rec.category,
          subcategory: rec.subcategory || null,
          emoji: rec.emoji || null,
          notes: rec.notes ? `${rec.notes} (Recurring)` : 'Recurring Transaction',
          date: nextDate,
          status: 'draft',
          recurringId: rec.id,
          createdAt: serverTimestamp()
        };

        batch.set(txRef, draftData);
        
        // Update recurring definition
        const updatedNextDate = calculateNextDate(nextDate, rec.recurrency, rec.interval, rec.dayOption);
        const recRef = doc(db, `users/${uid}/recurringTransactions`, rec.id);
        
        // Check duration limit
        let isActive = true;
        let eventsRemaining = rec.eventsRemaining;

        if (rec.duration === 'untilDate' && rec.durationLimit && updatedNextDate > rec.durationLimit) {
            isActive = false;
        } else if (rec.duration === 'numEvents' && typeof eventsRemaining === 'number') {
            eventsRemaining -= 1;
            if (eventsRemaining <= 0) {
                isActive = false;
            }
        }
        
        batch.update(recRef, {
          lastGeneratedDate: nextDate,
          nextGenerationDate: updatedNextDate,
          eventsRemaining: eventsRemaining ?? null,
          isActive
        });
        
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        await batch.commit();
      } catch (err) {
        console.error("Error generating recurring drafts:", err);
      }
    }
  };

  const handleApprove = async (tx: any) => {
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);

      // Operation 1 (Ledger Write): Update transaction status to confirmed
      const txRef = doc(db, `users/${uid}/transactions`, tx.id);
      batch.update(txRef, {
        status: 'confirmed',
        updatedAt: serverTimestamp()
      });

      // Operation 2 (Atomic Budget Increment): Find matching envelope and increment spentAmount
      const queryBudgets = query(
        collection(db, `users/${uid}/miniBudgets`),
        where('userId', '==', uid)
      );
      const querySnap = await getDocs(queryBudgets);
      const matchingBudgetDoc = querySnap.docs.find(docSnap => {
        const data = docSnap.data();
        return data.categoryTitle === tx.category || data.category === tx.category;
      });

      if (matchingBudgetDoc) {
        const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudgetDoc.id);
        batch.update(budgetRef, {
          spentAmount: increment(Number(tx.amount || 0)),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      onTransactionApproved?.();
    } catch (err: any) {
       handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transactions/${tx.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteTx = async () => {
    if (!txToDelete) return;
    setIsProcessing(true);
    try {
      const txRef = doc(db, `users/${uid}/transactions`, txToDelete.id);
      await deleteDoc(txRef);
      setTxToDelete(null);
    } catch (err: any) {
       handleFirestoreError(err, OperationType.DELETE, `users/${uid}/transactions/${txToDelete.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (drafts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
            <Clock size={12} className="text-gold animate-pulse" />
            <span className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.4em]">Pending Approvals</span>
        </div>
        <span className="bg-gold text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
            {drafts.length} Action{drafts.length > 1 ? 's' : ''} Required
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {drafts.map((tx, idx) => {
            const acc = accounts.find(a => a.id === tx.accountId);
            return (
              <motion.div
                key={`draft-tx-${tx.id}-${idx}`}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => setSelectedTx(tx)}
                className="p-4 bg-gold/5 border border-gold/20 rounded-[2rem] flex flex-col gap-4 shadow-xl shadow-gold/5 cursor-pointer hover:bg-gold/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${tx.type === 'income' ? 'bg-[#20C997]/10 text-[#20C997]' : 'bg-[#F43F5E]/10 text-[#F43F5E]'}`}>
                      {tx.type === 'income' ? <ArrowUpRight size={18} strokeWidth={3} /> : <ArrowDownLeft size={18} strokeWidth={3} />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-white uppercase tracking-wider">{tx.notes}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Landmark size={10} className="text-neutral-500" />
                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{acc?.name} ({acc?.currency})</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-lg font-mono font-bold ${tx.type === 'income' ? 'text-[#20C997]' : 'text-[#F43F5E]'}`}>
                      {tx.type === 'income' ? '+' : '-'}{acc?.currency} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[8px] font-black text-neutral-600 uppercase tracking-widest">Scheduled Date: {new Date(tx.date).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Google Tasks Sync Bar */}
                <div 
                  className="flex items-center justify-between p-2 rounded-xl bg-black/40 hover:bg-black/60 transition-colors border border-white/[0.02]"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={12} className={tx.isSyncedToTasks ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'} />
                    <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Sync to Google Tasks</span>
                  </div>
                  <button 
                    onClick={() => handleToggleSyncToTasks(tx, acc)}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                      tx.isSyncedToTasks 
                        ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-sm shadow-emerald-500/5' 
                        : 'text-neutral-400 border border-white/5 bg-[#0D0E12] hover:text-white hover:border-white/10'
                    }`}
                  >
                    {tx.isSyncedToTasks ? (
                      <>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shrink-0" />
                        Synced
                      </>
                    ) : (
                      'Toggle Sync'
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button 
                    disabled={isProcessing}
                    onClick={() => handleApprove(tx)}
                    className="flex-1 py-3 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <Check size={14} /> Approve Flow
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={() => setTxToDelete(tx)}
                    className="flex-none w-12 py-3 bg-neutral-900 border border-white/5 text-neutral-500 rounded-xl hover:text-[#F43F5E] transition-colors flex items-center justify-center active:scale-95 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <TransactionDetailModal 
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        uid={uid}
      />

      <ConfirmationModal 
        isOpen={txToDelete !== null}
        onClose={() => setTxToDelete(null)}
        onConfirm={handleConfirmDeleteTx}
        title="Reject Draft"
        message="Are you sure you want to reject this draft transaction? It will be removed from your pending queue."
        confirmLabel="Reject Transaction"
        isLoading={isProcessing}
      />
    </div>
  );
};
