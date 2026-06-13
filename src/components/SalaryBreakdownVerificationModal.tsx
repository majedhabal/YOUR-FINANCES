import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Check, AlertCircle, RefreshCw, ArrowRight, ShieldCheck, Sparkles, Building, Landmark, ChevronRight, CheckSquare 
} from 'lucide-react';
import { 
  collection, doc, getDocs, query, where, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface SalaryBreakdownVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  sb: any;
  accounts: any[];
  miniBudgets: any[];
  uid: string;
  onTransactionApproved?: () => void;
}

export const SalaryBreakdownVerificationModal: React.FC<SalaryBreakdownVerificationModalProps> = ({
  isOpen,
  onClose,
  sb,
  accounts,
  miniBudgets,
  uid,
  onTransactionApproved
}) => {
  const [isProcessingTier1, setIsProcessingTier1] = useState(false);
  const [processingItemsStates, setProcessingItemsStates] = useState<Record<string, boolean>>({});

  // Parse states
  const isTier1Approved = sb?.tier1Approved === true;
  const confirmedAllocations = useMemo<string[]>(() => sb?.confirmedAllocations || [], [sb]);

  const yearMonthStr = sb?.id || '';
  const [year, month] = yearMonthStr.split('-');
  const monthName = yearMonthStr 
    ? new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', { month: 'long' })
    : '';

  // Filter all active allocation items
  const activeAllocationRows = useMemo(() => {
    if (!sb) return [];
    const activeEnvelopes = sb.activeEnvelopes || [];
    const allocations = sb.allocations || {};
    return (sb.allAvailableEnvelopesCatalog || []).filter((item: any) => {
      return activeEnvelopes.includes(item.key) && Number(allocations[item.key] || 0) > 0;
    });
  }, [sb]);

  // Compute status statistics
  const totalItemsCount = activeAllocationRows.length;
  const confirmedItemsCount = activeAllocationRows.filter((item: any) => 
    confirmedAllocations.includes(item.key)
  ).length;

  const currentProgressPercent = totalItemsCount > 0 
    ? Math.round((confirmedItemsCount / totalItemsCount) * 100) 
    : 0;

  // Execute Tier 1 (Confirm parent salary payout drop)
  const handleApproveTier1 = async () => {
    if (!uid || !sb) return;
    setIsProcessingTier1(true);
    try {
      const batch = writeBatch(db);

      // A. Update the Breakdown overall document to mark Tier 1 as approved
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        tier1Approved: true,
        confirmedAllocations: [],
        updatedAt: serverTimestamp()
      });

      // B. Retrieve and confirm all pending salary income flows for this breakdown month
      const txsRef = collection(db, `users/${uid}/transactions`);
      const q = query(
        txsRef, 
        where('salaryBreakdownPeriod', '==', sb.id), 
        where('type', '==', 'income'), 
        where('status', '==', 'pending')
      );
      const qSnap = await getDocs(q);
      
      qSnap.docs.forEach(d => {
        batch.update(doc(db, `users/${uid}/transactions/${d.id}`), {
          status: 'confirmed',
          isUpcomingSalaryAllocation: false,
          executedAt: new Date().toISOString(),
          updatedAt: serverTimestamp()
        });
      });

      // C. Set recurring incomes generated calendar dates
      for (const inc of sb.selectedDbRecurringIncomes || []) {
        const incRef = doc(db, `users/${uid}/recurringTransactions`, inc.id);
        const yearMonthParts = sb.id.split('-');
        const y = parseInt(yearMonthParts[0]);
        const m = parseInt(yearMonthParts[1]);
        const nextDateStr = `${y}-${String(m).padStart(2, '0')}-${String(sb.payday || 28).padStart(2, '0')}`;
        
        batch.set(incRef, {
          dayOption: String(sb.payday || 28),
          nextGenerationDate: nextDateStr,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

    } catch (err) {
      console.error('Failed to execute Tier 1 salary validation:', err);
    } finally {
      setIsProcessingTier1(false);
    }
  };

  // Execute Tier 2 (Approve individual allocation category)
  const handleApproveTier2 = async (item: any) => {
    if (!uid || !sb) return;
    setProcessingItemsStates(prev => ({ ...prev, [item.key]: true }));
    try {
      const batch = writeBatch(db);
      const isTransfer = item.key.startsWith('transfer__');

      if (isTransfer) {
        // Enforce Account Transfer Accounting Rules: Find and approve the actual transfer sender/receiver transaction pairs
        const txsRef = collection(db, `users/${uid}/transactions`);
        const q = query(
          txsRef, 
          where('salaryBreakdownPeriod', '==', sb.id), 
          where('type', '==', 'transfer'), 
          where('status', '==', 'pending')
        );
        const qSnap = await getDocs(q);

        // Find matches for this destination account ID (item.accountId represents the receiver portfolio)
        qSnap.docs.forEach(d => {
          const tData = d.data();
          const matchesAccount = tData.accountId === item.accountId || tData.toAccountId === item.accountId;
          if (matchesAccount) {
            batch.update(doc(db, `users/${uid}/transactions/${d.id}`), {
              status: 'confirmed',
              isUpcomingSalaryAllocation: false,
              executedAt: new Date().toISOString(),
              updatedAt: serverTimestamp()
            });
          }
        });
      } else {
        // Normal envelope allocation: update user limits inside miniBudgets collection
        const matchedBudget = miniBudgets.find(b => 
          b.category === item.category && 
          ((!item.subcategory && !b.subcategory) || b.subcategory === item.subcategory)
        );

        const allocatedAmount = Number(sb.allocations?.[item.key] || 0);

        if (matchedBudget) {
          const isBudgetUnchanged = matchedBudget.maxBudget === allocatedAmount &&
                                    (matchedBudget.accountId === (item.accountId || null));
          if (isBudgetUnchanged) {
            // Core budgetary values are completely unchanged, abort save immediately!
            return;
          }

          const budgetDocRef = doc(db, `users/${uid}/miniBudgets`, matchedBudget.id);
          batch.set(budgetDocRef, {
            maxBudget: allocatedAmount,
            accountId: item.accountId || null,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else if (allocatedAmount > 0) {
          const newBudgetRef = doc(collection(db, `users/${uid}/miniBudgets`));
          const parsedTitle = item.label.includes('➔') 
            ? item.label.split('➔')[1]?.trim() 
            : item.label.split(' > ')[0];

          batch.set(newBudgetRef, {
            id: newBudgetRef.id,
            title: parsedTitle || item.label,
            maxBudget: allocatedAmount,
            currency: sb.currency || 'AED',
            category: item.category,
            subcategory: item.subcategory || null,
            period: 'monthly',
            emoji: item.emoji || '📁',
            accountId: item.accountId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Compute status propagation list
      const nextConfirmed = [...confirmedAllocations, item.key];
      
      const activeEnvelopes = sb.activeEnvelopes || [];
      const allocations = sb.allocations || {};
      const allActiveAllocatedKeys = (sb.allAvailableEnvelopesCatalog || [])
        .filter((catItem: any) => activeEnvelopes.includes(catItem.key) && Number(allocations[catItem.key] || 0) > 0)
        .map((catItem: any) => catItem.key);

      const allApproved = allActiveAllocatedKeys.every((key: string) => nextConfirmed.includes(key));

      // Commit changes to the salary breakdown settings status document
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        confirmedAllocations: nextConfirmed,
        isConfirmed: allApproved,
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

    } catch (err) {
      console.error(`Failed to lock in itemized allocation for ${item.label}:`, err);
    } finally {
      setProcessingItemsStates(prev => ({ ...prev, [item.key]: false }));
    }
  };

  if (!isOpen || !sb) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[300] flex items-center justify-center p-3 md:p-6"
        style={{ fontFamily: "'Google Sans', sans-serif" }}
      >
        {/* Style injection securing Google Sans regular font-weight: 400 with strict natural text transformation mandates */}
        <style>{`
          .google-sans-token-reset,
          .google-sans-token-reset * {
            font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
            text-transform: none !important;
          }
        `}</style>

        {/* Gray Backdrop overlay wrapper */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#0E1111]/70 pointer-events-auto"
        />

        {/* Modal Outer frame */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          className="google-sans-token-reset relative w-full max-w-[1080px] bg-[#FFFFFF] border border-neutral-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-neutral-800"
          id="salary-verification-overlay-modal"
          style={{
            padding: 'clamp(14px, 1.8vw, 24px)',
            gap: 'clamp(12px, 1.5vw, 20px)'
          }}
        >
          {/* Flat beautiful white canvas loading overlay */}
          {isProcessingTier1 && (
            <div className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-6 text-center animate-fade-in" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              <div className="w-10 h-10 border-4 border-indigo-650 border-[#4F46E5] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-neutral-800 text-sm tracking-normal mb-1 block" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, textTransform: 'none' }}>
                Validating payroll...
              </span>
              <p className="text-xs text-[#57606F] leading-relaxed max-w-[280px]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, textTransform: 'none' }}>
                updating ledger balances and committing payroll confirmation
              </p>
            </div>
          )}

          {/* Header row containing close controls */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <span className="text-neutral-800 text-base font-bold tracking-tight" style={{ fontWeight: 700 }}>
                  Verify monthly budget allocations
                </span>
                <span className="text-[11px] text-neutral-400 font-normal">
                  Configure and lock payroll entries for {monthName} {year}
                </span>
              </div>
            </div>

            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-50 hover:bg-neutral-150 transition-colors flex items-center justify-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Dual-grid Desktop Layout / Stacked Mobile structure */}
          <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 [WebkitOverflowScrolling:touch]">
            
            {/* LEFT SIDE COLUMN (col-span-12 on mobile, col-span-5 on desktop): Master Payout details */}
            <div className="md:col-span-5 flex flex-col gap-4">
              
              {/* PRIMARY CARD (Tier 1 Payout Approval Indicator) */}
              <div 
                className="p-5 border rounded-2xl flex flex-col transition-all bg-[#FFFFFF]"
                style={{
                  borderColor: isTier1Approved ? '#E2E8F0' : '#E0E7FF',
                  boxShadow: isTier1Approved ? 'none' : '0 4px 14px -4px rgba(79, 70, 229, 0.12)'
                }}
              >
                <div className="flex items-center justify-between gap-1 mb-3">
                  <span className="text-neutral-500 text-[11px] font-normal" style={{ fontWeight: 400 }}>
                    Tier 1: Parent payroll validation
                  </span>
                  
                  {isTier1Approved ? (
                    <span className="text-[10px] bg-emerald-50 text-emerald-650 border border-emerald-100 px-2.5 py-0.5 rounded-full font-bold">
                      Payout confirmed
                    </span>
                  ) : (
                    <span className="text-[10px] bg-indigo-50 text-indigo-650 border border-indigo-100 px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                      Awaiting payout
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-1 mt-1 mb-4">
                  <span className="text-neutral-900 text-2xl font-bold tracking-tight" style={{ fontWeight: 700 }}>
                    {sb.currency || 'AED'} {sb.baseSalaryInput?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-neutral-400 text-xs font-normal">
                    total drop
                  </span>
                </div>

                <p className="text-xs text-neutral-500 mb-5 leading-relaxed font-normal" style={{ fontWeight: 400 }}>
                  Confirming this main tier locks in the total incoming cash injection value, updates the parent salary account balance, and activates the individual breakdown review states.
                </p>

                {!isTier1Approved ? (
                  <button
                    disabled={isProcessingTier1}
                    onClick={handleApproveTier1}
                    className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ fontWeight: 700 }}
                  >
                    {isProcessingTier1 ? (
                      <React.Fragment>
                        <RefreshCw size={13} className="animate-spin" />
                        Validating payroll...
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <ShieldCheck size={14} />
                        Confirm payout
                      </React.Fragment>
                    )}
                  </button>
                ) : (
                  <div className="w-full py-2.5 bg-emerald-50 border border-emerald-150 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 select-none font-sans" style={{ fontWeight: 700 }}>
                    <Check size={14} />
                    Verified on salary day
                  </div>
                )}
              </div>

              {/* STATS DETAILS FLAT CONTAINER CARD */}
              <div className="p-4 border border-neutral-150/90 rounded-2xl flex flex-col gap-3 bg-[#FFFFFF]">
                <span className="text-neutral-800 text-xs font-bold tracking-tight border-b border-neutral-100 pb-1.5" style={{ fontWeight: 700 }}>
                  Allocation statistics
                </span>
                
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-normal">Income cycle month</span>
                  <span className="text-neutral-800 font-bold" style={{ fontWeight: 700 }}>{monthName} {year}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-normal">Scheduled payday</span>
                  <span className="text-neutral-800 font-bold" style={{ fontWeight: 700 }}>Day {sb.payday || 28}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-normal">Budget items progress</span>
                  <span className="text-neutral-800 font-bold" style={{ fontWeight: 700 }}>
                    {confirmedItemsCount} / {totalItemsCount}
                  </span>
                </div>

                {/* Progress bar container */}
                <div className="mt-1">
                  <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${currentProgressPercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] text-neutral-400 font-normal">Completion percentage</span>
                    <span className="text-[10px] text-indigo-650 font-bold" style={{ fontWeight: 700 }}>{currentProgressPercent}%</span>
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT SIDE COLUMN (col-span-12 on mobile, col-span-7 on desktop): Active itemized checklist queue */}
            <div className="md:col-span-7 flex flex-col gap-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-neutral-500 text-[11px] font-bold tracking-tight" style={{ fontWeight: 700, textTransform: 'none' }}>
                  Itemized allocation checklist
                </span>
                <span className="text-[10px] bg-neutral-50 text-neutral-500 border border-neutral-150 px-2 py-0.5 rounded-full font-sans">
                  {totalItemsCount - confirmedItemsCount} remaining
                </span>
              </div>

              {/* CHECKLIST INNER SCROLL AREA */}
              <div 
                className="flex-1 flex flex-col gap-2 relative"
                style={{
                  gap: 'clamp(6px, 1.1vw, 10px)'
                }}
              >
                {!isTier1Approved && (
                  <div className="absolute inset-0 bg-[#FFFFFF]/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-neutral-200">
                    <AlertCircle size={22} className="text-neutral-400 mb-2 stroke-[1.5]" />
                    <span className="text-sm text-neutral-800 font-bold mb-1" style={{ fontWeight: 700 }}>
                      Checklist locked
                    </span>
                    <p className="text-xs text-neutral-400 max-w-[280px]">
                      Approve Tier 1 payroll validation first to activate itemized review queues.
                    </p>
                  </div>
                )}

                {activeAllocationRows.length === 0 ? (
                  <div className="py-12 text-center border rounded-2xl bg-neutral-50 border-neutral-150-90 flex flex-col items-center justify-center gap-1.5">
                    <CheckSquare size={18} className="text-neutral-300" />
                    <span className="text-xs text-neutral-500 font-normal">
                      No active envelope allocations configured for this period
                    </span>
                  </div>
                ) : (
                  activeAllocationRows.map((item: any) => {
                    const isItemConfirmed = confirmedAllocations.includes(item.key);
                    const isItemLoading = processingItemsStates[item.key] === true;
                    const allocatedAmount = Number(sb.allocations?.[item.key] || 0);
                    const isTransfer = item.key.startsWith('transfer__');

                    return (
                      <div
                        key={`modal-item-row-${item.key}`}
                        className="border border-neutral-150/90 rounded-2xl flex items-center justify-between bg-[#FFFFFF] hover:border-neutral-250 transition-colors"
                        style={{
                          padding: 'clamp(8px, 1.3vw, 16px)'
                        }}
                      >
                        {/* Title, Emoji, Type with layout clamping */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isTransfer ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-neutral-50 text-neutral-600 border border-neutral-150/70'}`}>
                            <span className="text-sm">{item.emoji || '📁'}</span>
                          </div>
                          
                          <div className="flex flex-col min-w-0">
                            <span className="text-neutral-800 font-bold truncate tracking-tight" style={{ fontSize: 'clamp(11px, 1.25vw, 13px)', fontWeight: 700 }}>
                              {item.label}
                            </span>
                            <span className="text-[9px] text-neutral-400 font-normal" style={{ textTransform: 'none' }}>
                              {isTransfer ? 'Account transfer' : 'Budget envelope'}
                            </span>
                          </div>
                        </div>

                        {/* Amount/Confirm triggers alignment */}
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className="text-neutral-900 font-bold tracking-tight text-right font-mono" style={{ fontSize: 'clamp(11px, 1.2vw, 13.5px)', fontWeight: 700 }}>
                            {sb.currency || 'AED'} {allocatedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>

                          {isItemConfirmed ? (
                            <div className="flex items-center justify-center w-[120px] py-1.5 bg-emerald-50 border border-emerald-150 rounded-xl text-emerald-700 text-[10px] font-bold gap-1 font-sans select-none" style={{ fontWeight: 700 }}>
                              <Check size={11} className="stroke-[2.5]" />
                              Confirmed
                            </div>
                          ) : (
                            <button
                              disabled={!isTier1Approved || isItemLoading}
                              onClick={() => handleApproveTier2(item)}
                              className="w-[120px] py-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 text-[#FFFFFF] rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                              style={{ fontWeight: 700 }}
                            >
                              {isItemLoading ? (
                                <RefreshCw size={10} className="animate-spin" />
                              ) : (
                                <React.Fragment>
                                  Confirm allocation
                                </React.Fragment>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
