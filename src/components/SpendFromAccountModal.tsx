import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface SpendFromAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: any[];
  onSave: (accountId: string, amount: number) => void;
}

export const SpendFromAccountModal: React.FC<SpendFromAccountModalProps> = ({
  isOpen,
  onClose,
  accounts,
  onSave
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl p-6 w-full max-w-[400px]"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Spend from existing account</h3>
            <button onClick={onClose}><X size={20} /></button>
          </div>
          
          <div className="space-y-4">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full p-3 border rounded-lg"
            >
              <option value="" disabled>Select an account</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
            
            {selectedAccountId && accounts.find(acc => acc.id === selectedAccountId) && (
              (() => {
                const acc = accounts.find(a => a.id === selectedAccountId);
                if (!acc) return null;
                
                return (
                  <div className="text-sm space-y-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {acc.type?.toLowerCase() === 'credit card' || acc.creditLimit !== undefined ? (
                      <>
                        <p className="text-neutral-600 font-normal">
                          Debt Balance: <span className="font-bold text-slate-800">{Math.abs(acc.currentBalance).toFixed(2)} {acc.currency}</span>
                        </p>
                        <p className="text-neutral-600 font-normal">
                          Total Limit: <span className="font-bold text-slate-800">{(acc.creditLimit || 0).toFixed(2)} {acc.currency}</span>
                        </p>
                        <p className="text-neutral-600 font-normal">
                          Available: <span className="font-bold text-slate-800">{( (acc.creditLimit || 0) - Math.abs(acc.currentBalance)).toFixed(2)} {acc.currency}</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-neutral-600 font-normal">
                        Balance: <span className="font-bold text-slate-800">{acc.currentBalance.toFixed(2)} {acc.currency}</span>
                      </p>
                    )}
                  </div>
                );
              })()
            )}
            
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full p-3 border rounded-lg"
            />
            
            <button
              onClick={() => {
                if (selectedAccountId && amount) {
                  onSave(selectedAccountId, amount);
                  onClose();
                }
              }}
              className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold"
            >
              Confirm Spend
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
