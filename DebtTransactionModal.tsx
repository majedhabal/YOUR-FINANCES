import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { evaluateMathExpression } from '../lib/constants';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useTranslation } from 'react-i18next';

export const DebtTransactionModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSuccess?: () => void;
  debt: any; // The debt object
  accounts: any[]; 
  profile: any;
}> = ({ isOpen, onClose, onSuccess, debt, accounts, profile }) => {
  const { t } = useTranslation();
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [actionType, setActionType] = useState<'income' | 'transfer'>('income');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const activeAccounts = accounts.filter(acc => !acc.isArchived);
  useEffect(() => {
    if (activeAccounts.length > 0 && !sourceAccountId) {
      setSourceAccountId(activeAccounts[0].id);
    }
  }, [activeAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !sourceAccountId || !amount) return;
    if (actionType === 'transfer' && !destinationAccountId) return;
    setIsLoading(true);

    try {
      const txRef = doc(collection(db, `users/${profile.uid}/transactions`));
      const today = new Date().toLocaleDateString('en-CA');

      const txData = {
        id: txRef.id,
        userId: profile.uid,
        accountId: sourceAccountId,
        amount: parseFloat(evaluateMathExpression(amount)),
        type: actionType === 'transfer' ? 'transfer' : 'income',
        category: 'Debt Payment',
        subcategory: debt.name,
        destinationAccountId: actionType === 'transfer' ? destinationAccountId : null,
        notes: note || `${actionType === 'transfer' ? t('debt_transaction_modal.deposit_transfer', 'Transfer deposit: ') : t('debt_transaction_modal.deposit_income', 'Income deposit: ')}${debt.name}`,
        date: today,
        createdAt: serverTimestamp(),
        debtAccountId: debt.accountId
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
        <div className="fixed inset-0 z-[300] flex items-start justify-center p-3 sm:p-4 overflow-y-auto bg-black/20 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0" />
          <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-[400px] mt-8 mb-24 bg-white border border-[#E1E8ED] rounded-[1.5rem] p-6 pb-12 shadow-2xl">
            <h4 className="font-bold text-lg mb-4 text-[#111c2d]">{t('debt_transaction_modal.add_transaction', 'Add Transaction')} - {debt.name}</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('debt_transaction_modal.transaction_type', 'Transaction Type')}</label>
                <select value={actionType} onChange={e => setActionType(e.target.value as 'income' | 'transfer')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  <option value="income">{t('debt_transaction_modal.option_income', 'Income')}</option>
                  <option value="transfer">{t('debt_transaction_modal.option_transfer', 'Transfer')}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('debt_transaction_modal.source_account', 'Source Account')}</label>
                <select value={sourceAccountId} onChange={e => setSourceAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                  {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              {actionType === 'transfer' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#8c8c99] px-1">{t('debt_transaction_modal.destination_account', 'Destination Account')}</label>
                  <select value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none">
                    <option value="">{t('debt_transaction_modal.select_account', 'Select Account')}</option>
                    {activeAccounts.filter(acc => acc.id !== sourceAccountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('debt_transaction_modal.amount', 'Amount')}</label>
                <input type="text" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))} onBlur={() => setAmount(prev => evaluateMathExpression(prev))} placeholder="0" className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#8c8c99] px-1">{t('debt_transaction_modal.note', 'Note')}</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('debt_transaction_modal.placeholder_note', 'Note...')} className="w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm focus:border-[#a6ddb1] outline-none" />
              </div>

              <button type="submit" disabled={isLoading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all">
                {isLoading ? <RefreshCw className="animate-spin h-5 w-5 mx-auto"/> : t('debt_transaction_modal.btn_commit_entry', 'Commit Entry')}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
