import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { evaluateMathExpression } from '../lib/constants';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export const BudgetTransactionModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess?: () => void;
  budget: any; // The budget object
  accounts: any[]; 
  profile: any;
}> = ({ isOpen, onClose, onSuccess, budget, accounts, profile }) => {
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [type, setType] = useState<'expense' | 'transfer'>('expense');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (accounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(accounts[0].id);
    }
  }, [accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !sourceAccountId || !amount) return;
    if (type === 'transfer' && !destinationAccountId) return;
    setIsLoading(true);

    try {
      const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
      const today = new Date().toLocaleDateString('en-CA');

      const txData = {
        id: txRef.id,
        userId: profile.uid,
        accountId: sourceAccountId,
        amount: parseFloat(evaluateMathExpression(amount)),
        type: type === 'transfer' ? 'transfer' : 'expense',
        category: 'Budget',
        subcategory: budget.categoryTitle || budget.name,
        destinationAccountId: type === 'transfer' ? destinationAccountId : null,
        notes: note || `${type === 'transfer' ? 'Budget transfer' : 'Budget expense'}: ${budget.categoryTitle || budget.name}`,
        date: today,
        createdAt: serverTimestamp(),
        budgetId: budget.id
      };

      await setDoc(txRef, txData);

      onSuccess?.();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/transactions`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-[400px] bg-white border border-[#E1E8ED] rounded-[1.5rem] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h4 className="font-bold text-lg mb-4 text-[#111c2d] uppercase">Add Transaction - {budget.categoryTitle || budget.name}</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest px-1">Transaction Type</label>
                <select value={type} onChange={e => setType(e.target.value as 'expense' | 'transfer')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest px-1">Source Account</label>
                <select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              {type === 'transfer' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest px-1">Destination Account</label>
                  <select value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                    <option value="">Select Account</option>
                    {accounts.filter(acc => acc.id !== sourceAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest px-1">Amount</label>
                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))} onBlur={() => setAmount(prev => evaluateMathExpression(prev))} placeholder="0" className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#8c8c99] uppercase tracking-widest px-1">Note</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Note..." className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <button type="submit" disabled={isLoading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all">
                {isLoading ? <RefreshCw className="animate-spin h-5 w-5 mx-auto"/> : "COMMIT ENTRY"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
