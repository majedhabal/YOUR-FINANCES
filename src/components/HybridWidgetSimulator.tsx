import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, Plus, Check, Loader2, ArrowRight } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface MiniBudget {
  id: string;
  categoryTitle?: string;
  category: string;
  subcategory?: string;
  allocatedAmount?: number;
  spentAmount?: number;
  currency?: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  currentBalance: number;
}

interface HybridWidgetSimulatorProps {
  uid: string;
  budgets: MiniBudget[];
  accounts: Account[];
}

export const HybridWidgetSimulator: React.FC<HybridWidgetSimulatorProps> = ({ uid, budgets, accounts }) => {
  const { t } = useTranslation();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleQuickAdd = async (budget: MiniBudget) => {
    const rawAmt = amounts[budget.id] || '';
    if (!rawAmt) return;

    const txAmount = parseFloat(rawAmt);
    if (isNaN(txAmount) || txAmount <= 0) return;

    // We pick the first matching account by currency if possible, or just the first account
    const account = accounts.find(a => a.currency === budget.currency) || accounts[0];

    if (!account) {
      alert("No linked account found to deduct from.");
      return;
    }

    setSubmittingId(budget.id);
    triggerHaptic(hapticPresets.heavy);

    try {
      await runTransaction(db, async (trans) => {
        const accountRef = doc(db, `users/${uid}/accounts/${account.id}`);
        const budgetRef = doc(db, `users/${uid}/miniBudgets/${budget.id}`);
        const transactionRef = doc(collection(db, `users/${uid}/transactions`));

        const accountSnap = await trans.get(accountRef);
        const budgetSnap = await trans.get(budgetRef);

        if (!accountSnap.exists()) throw new Error("Linked account not found");
        if (!budgetSnap.exists()) throw new Error("Linked budget not found");

        const currentBal = Number(accountSnap.data()?.currentBalance) || 0;
        const currentSpent = Number(budgetSnap.data()?.spentAmount) || 0;

        trans.update(accountRef, {
          currentBalance: currentBal - txAmount,
          updatedAt: serverTimestamp()
        });

        trans.update(budgetRef, {
          // (Removed spentAmount update: relying on ledger re-calculation)
          updatedAt: serverTimestamp()
        });

        trans.set(transactionRef, {
          transactionId: transactionRef.id,
          id: transactionRef.id,
          userId: uid,
          amount: txAmount,
          type: 'expense',
          status: 'confirmed',
          accountId: account.id,
          category: budget.category,
          subcategory: budget.subcategory || null,
          notes: `Hybrid Widget: ${budget.categoryTitle}`,
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          budgetId: budget.id
        });
      });

      setAmounts(prev => ({ ...prev, [budget.id]: '' }));
      setSuccessId(budget.id);
      triggerHaptic(hapticPresets.success);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (err) {
      console.error("Hybrid Widget transaction failed:", err);
      alert("Transaction failed. Please try again.");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="w-full max-w-[320px] mx-auto bg-white rounded-[40px] p-4 border-[6px] border-neutral-200 shadow-2xl relative overflow-hidden aspect-[9/16] flex flex-col">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-neutral-200 rounded-b-2xl z-20"></div>

      {/* Widget Content */}
      <div className="mt-8 flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Status Bar */}
        <div className="flex justify-between items-center px-2 mb-2">
          <span className="text-[10px] text-black/50 font-bold">12:30</span>
          <div className="flex gap-1 text-black/20">
             <div className="w-2 h-2 rounded-full bg-current opacity-50" />
             <div className="w-2 h-2 rounded-full bg-current opacity-50" />
          </div>
        </div>

        {/* Hybrid Widget Container */}
        <div className="bg-[#f8f9fa] rounded-3xl p-3 border border-neutral-200 flex flex-col gap-3 h-full overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[11px] font-bold text-black uppercase tracking-widest">
              {t('quick_add_widgets.hybrid_widget_title', 'HYBRID BUDGETS')}
            </h4>
            <Smartphone size={12} className="text-black/10" />
          </div>

          {/* Scrolling List - Mimics RemoteViews ListView */}
          <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2 pb-4">
            {budgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-[10px] text-white/30 italic">No budgets configured. Add them in Essentials to see them here.</p>
              </div>
            ) : (
              budgets.map((budget) => {
                const isSubmitting = submittingId === budget.id;
                const isSuccess = successId === budget.id;
                const max = budget.allocatedAmount || 1;
                const spent = budget.spentAmount || 0;
                const progress = Math.min((spent / max) * 100, 100);

                return (
                  <motion.div 
                    key={budget.id}
                    layout
                    className="bg-white rounded-2xl p-2.5 border border-neutral-100 flex flex-col gap-2 shadow-sm"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold text-black block truncate">{budget.categoryTitle}</span>
                        <span className="text-[9px] text-black/40 block">
                          {budget.currency} {spent.toLocaleString()} / {max.toLocaleString()}
                        </span>
                      </div>
                      
                      {/* Progress Dot */}
                      <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: progress >= 100 ? '#EF4444' : '#A6DDB1' }} />
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1 bg-black/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className={`h-full ${progress >= 100 ? 'bg-rose-500' : 'bg-[#A6DDB1]'}`}
                      />
                    </div>

                    {/* Quick Add Interface */}
                    <div className="flex gap-2 mt-1">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="Amount"
                          value={amounts[budget.id] || ''}
                          onChange={(e) => setAmounts(prev => ({ ...prev, [budget.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd(budget)}
                          className="w-full h-8 bg-neutral-50 rounded-lg px-2 text-[11px] text-black placeholder:text-black/20 outline-none border border-neutral-200 focus:border-[#A6DDB1]/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                      <button
                        onClick={() => handleQuickAdd(budget)}
                        disabled={isSubmitting || !amounts[budget.id]}
                        className={`h-8 px-3 rounded-lg flex items-center justify-center transition-all ${
                          isSuccess 
                            ? 'bg-emerald-500 text-white' 
                            : 'bg-[#A6DDB1] hover:bg-[#8ec599] text-[#1E293B] disabled:opacity-30 disabled:grayscale'
                        }`}
                      >
                        {isSubmitting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : isSuccess ? (
                          <Check size={12} strokeWidth={3} />
                        ) : (
                          <Plus size={12} strokeWidth={3} />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Home Indicator */}
      <div className="mt-4 mb-2 flex flex-col items-center gap-1 opacity-20">
        <div className="w-32 h-1 bg-black rounded-full"></div>
      </div>
    </div>
  );
};
