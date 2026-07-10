import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Landmark, Info, Wallet } from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { evaluateMathExpression } from '../lib/constants';
import { useTranslation } from 'react-i18next';

interface DebtMilestoneConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  editingMilestone: any | null;
  accounts: any[];
  exchangeRates: any;
}

export const DebtMilestoneConfigModal: React.FC<DebtMilestoneConfigModalProps> = ({
  isOpen,
  onClose,
  profile,
  editingMilestone,
  accounts,
  exchangeRates
}) => {
  const { t } = useTranslation();
  const [debtType, setDebtType] = useState<'Loan' | 'Mortgage'>('Loan');
  const [loanDirection, setLoanDirection] = useState<'borrowed' | 'lent'>('borrowed');
  const [name, setName] = useState('');
  const [principleAmount, setPrincipleAmount] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('Monthly');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [minBalanceFloor, setMinBalanceFloor] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(profile?.baseCurrency || profile?.currency || 'AED');
  const [isLoading, setIsLoading] = useState(false);

  const activeBaseCurr = profile?.baseCurrency || profile?.currency || 'AED';
  const enabledCurrencies = profile?.enabledCurrencies || [activeBaseCurr];

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('debt-modal-toggled', { detail: { isOpen } }));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (editingMilestone) {
        setName(editingMilestone.name || '');
        setPrincipleAmount(editingMilestone.principleAmount?.toString() || '');
        setPaymentFrequency(editingMilestone.paymentFrequency || 'Monthly');
        setPaymentAmount(editingMilestone.paymentAmount?.toString() || '');
        setSelectedCurrency(editingMilestone.currency || activeBaseCurr);
        
        // Match existing linked account details if available
        const linkedAcc = accounts.find(a => a.id === editingMilestone.accountId);
        if (linkedAcc) {
          const matchedType = (linkedAcc.type === 'mortgage' || linkedAcc.type === 'Mortgage') ? 'Mortgage' : 'Loan';
          setDebtType(matchedType);
          setLoanDirection(linkedAcc.loanDirection || 'borrowed');
          setInterestRate(linkedAcc.interestRate?.toString() || '');
          setMinBalanceFloor(linkedAcc.minBalanceFloor?.toString() || '');
        } else {
          setDebtType('Loan');
          setLoanDirection(editingMilestone.loanDirection || 'borrowed');
          setInterestRate('');
          setMinBalanceFloor('');
        }
      } else {
        setName('');
        setPrincipleAmount('');
        setPaymentFrequency('Monthly');
        setPaymentAmount('');
        setDebtType('Loan');
        setLoanDirection('borrowed');
        setInterestRate('');
        setMinBalanceFloor('');
        setSelectedCurrency(activeBaseCurr);
      }
    }
  }, [editingMilestone, isOpen, accounts, activeBaseCurr]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !name || !principleAmount || !paymentAmount) return;
    setIsLoading(true);

    try {
      let finalAccountId = editingMilestone?.accountId || '';

      const parsedPrinciple = parseFloat(evaluateMathExpression(principleAmount)) || 0;
      const parsedInterest = parseFloat(interestRate) || 0;
      const parsedMinFloor = parseFloat(evaluateMathExpression(minBalanceFloor)) || 0;

      const savedType = debtType === 'Loan' ? 'Personal Loan' : 'Mortgage';
      const savedDirection = debtType === 'Loan' ? loanDirection : 'borrowed';
      const formattedProtocol = `${selectedCurrency} ${(parseFloat(evaluateMathExpression(paymentAmount)) || 0).toLocaleString()} ${paymentFrequency}`;

      // 1. BACKGROUND WRITE TRIGGER: Automatically spawn or update corresponding liability tracking document in master accounts
      if (!finalAccountId) {
        const accountRef = doc(collection(db, `users/${profile.uid}/accounts`));
        const docId = accountRef.id;

        await setDoc(accountRef, {
          accountId: docId,
          id: docId, // set for backwards compatibility
          userId: profile.uid,
          type: savedType,
          loanDirection: savedDirection,
          name: name,
          currency: selectedCurrency,
          startingBalance: savedDirection === 'lent' ? Math.abs(parsedPrinciple) : -Math.abs(parsedPrinciple),
          currentBalance: savedDirection === 'lent' ? Math.abs(parsedPrinciple) : -Math.abs(parsedPrinciple),
          interestRate: parsedInterest,
          recurringProtocol: formattedProtocol,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        finalAccountId = docId;
      } else {
        // Update the existing linked account document
        const accountRef = doc(db, `users/${profile.uid}/accounts`, finalAccountId);
        await setDoc(accountRef, {
          name: name,
          type: savedType,
          loanDirection: savedDirection,
          currency: selectedCurrency,
          startingBalance: savedDirection === 'lent' ? Math.abs(parsedPrinciple) : -Math.abs(parsedPrinciple),
          currentBalance: savedDirection === 'lent' ? Math.abs(parsedPrinciple) : -Math.abs(parsedPrinciple),
          interestRate: parsedInterest,
          recurringProtocol: formattedProtocol,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 2. Register/Update the Debt Milestone record referencing this account Node
      const milestoneRef = editingMilestone
        ? doc(db, `users/${profile.uid}/debtMilestones`, editingMilestone.id)
        : doc(collection(db, `users/${profile.uid}/debtMilestones`));

      await setDoc(milestoneRef, {
        id: milestoneRef.id,
        name,
        currency: selectedCurrency,
        principleAmount: parsedPrinciple,
        paymentFrequency,
        paymentAmount: parseFloat(evaluateMathExpression(paymentAmount)),
        accountId: finalAccountId,
        loanDirection: savedDirection,
        isArchived: editingMilestone?.isArchived || false,
        createdAt: editingMilestone?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      window.dispatchEvent(new CustomEvent('route-essentials-subtab', { detail: { subtab: 'debt' } }));
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/debtMilestones`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="debt-milestone-modal-container" className="fixed inset-0 z-[200] flex items-center justify-center p-3">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.9, opacity: 0 }} 
            className="relative w-full max-w-full md:w-[35%] md:min-w-[35%] md:max-w-[35%] bg-white border border-[#E1E8ED] rounded-2xl p-4 md:p-6 shadow-2xl flex flex-col gap-3.5 overflow-y-auto max-h-[95vh] mx-auto select-none"
          >
            {/* Header Area */}
            <div className="flex flex-col items-center gap-0.5 mb-1 text-center">
              <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-black text-sm md:text-base">
                {editingMilestone ? t('debt_milestone_modal.refine_title', 'Refine Long-Term Liability') : t('debt_milestone_modal.configure_title', 'Configure Long-Term Liability')}
              </h4>
              <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-400 text-[10px] mt-0.5">
                {t('debt_milestone_modal.subtitle', 'Debt Management Repayment Settings')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
              
              {/* Liability Type Select: Loan or Mortgage */}
              <div className="space-y-1">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                  {t('debt_milestone_modal.liability_type', 'Liability Type')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDebtType('Loan')}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: debtType === 'Loan' ? 700 : 400 }}
                    className={`h-[36px] rounded-lg border text-xs px-3 text-center cursor-pointer transition-all ${
                      debtType === 'Loan' 
                        ? 'bg-black text-white border-black font-bold' 
                        : 'bg-white text-neutral-600 border-[#E1E8ED] font-normal hover:bg-neutral-50'
                    }`}
                  >
                    {t('debt_milestone_modal.personal_loan', 'Personal Loan')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDebtType('Mortgage')}
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: debtType === 'Mortgage' ? 700 : 400 }}
                    className={`h-[36px] rounded-lg border text-xs px-3 text-center cursor-pointer transition-all ${
                      debtType === 'Mortgage' 
                        ? 'bg-black text-white border-black font-bold' 
                        : 'bg-white text-neutral-600 border-[#E1E8ED] font-normal hover:bg-neutral-50'
                    }`}
                  >
                    {t('debt_milestone_modal.mortgage', 'Mortgage')}
                  </button>
                </div>
              </div>

              {/* Loan Option Select (I borrowed or I lent - spawned conditionally) */}
              {debtType === 'Loan' && (
                <div className="space-y-1">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                    {t('debt_milestone_modal.loan_option', 'Loan Option')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLoanDirection('borrowed')}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: loanDirection === 'borrowed' ? 700 : 400 }}
                      className={`h-[36px] rounded-lg border text-xs px-3 text-center cursor-pointer transition-all ${
                        loanDirection === 'borrowed' 
                          ? 'bg-black text-white border-black font-bold' 
                          : 'bg-white text-neutral-600 border-[#E1E8ED] font-normal hover:bg-neutral-50'
                      }`}
                    >
                      {t('debt_milestone_modal.i_borrowed', 'I borrowed')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoanDirection('lent')}
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: loanDirection === 'lent' ? 700 : 400 }}
                      className={`h-[36px] rounded-lg border text-xs px-3 text-center cursor-pointer transition-all ${
                        loanDirection === 'lent' 
                          ? 'bg-black text-white border-black font-bold' 
                          : 'bg-white text-neutral-600 border-[#E1E8ED] font-normal hover:bg-neutral-50'
                      }`}
                    >
                      {t('debt_milestone_modal.i_lent', 'I lent')}
                    </button>
                  </div>
                </div>
              )}

              {/* Debt Name */}
              <div className="space-y-1">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                  {debtType === 'Loan' && loanDirection === 'lent' ? t('debt_milestone_modal.asset_name_label', 'Asset Account Name / Label') : t('debt_milestone_modal.liability_name_label', 'Liability Account Name / Label')}
                </label>
                <input 
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={debtType === 'Loan' && loanDirection === 'lent' ? t('debt_milestone_modal.placeholder_asset_name', 'e.g., Loan to Mum, Friend Loan') : t('debt_milestone_modal.placeholder_liability_name', 'e.g., ADCB Car Loan, HSBC Home Mortgage')}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: '12px',
                    height: '36px',
                  }}
                  className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg px-3 py-2 text-black focus:border-black outline-none transition-all placeholder:text-[#57606F]/40"
                />
              </div>

              {/* Currency Select */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                    {t('debt_milestone_modal.currency_label', 'Currency')}
                  </label>
                  {selectedCurrency !== activeBaseCurr && exchangeRates && exchangeRates[selectedCurrency] && (
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[10px]">
                      1 {selectedCurrency} ≈ {parseFloat(exchangeRates[selectedCurrency]).toFixed(2)} {activeBaseCurr}
                    </span>
                  )}
                </div>
                <select
                  value={selectedCurrency}
                  onChange={e => setSelectedCurrency(e.target.value)}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: '12px',
                    height: '36px',
                  }}
                  className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg px-2.5 py-1.5 text-neutral-700 focus:border-black outline-none transition-all"
                >
                  {enabledCurrencies.map((curr) => (
                    <option key={curr} value={curr}>{curr}</option>
                  ))}
                </select>
              </div>

              {/* Principal Liability Amount */}
              <div className="space-y-1">
                <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                  {debtType === 'Loan' && loanDirection === 'lent' ? t('debt_milestone_modal.principal_lent_label', 'Principal Amount Lent') : t('debt_milestone_modal.principal_debt_label', 'Principal Debt Amount')}
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    required
                    placeholder="e.g., 350000"
                    value={principleAmount}
                    onChange={e => setPrincipleAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                    onBlur={() => setPrincipleAmount(prev => evaluateMathExpression(prev))}
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 700,
                      fontSize: '12px',
                      height: '36px',
                    }}
                    className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg pl-3 pr-12 py-2 text-black font-bold focus:border-black outline-none transition-all placeholder:text-[#57606F]/40"
                  />
                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="absolute right-3 top-1/2 -translate-y-1/2 text-black/40 text-[10px] pointer-events-none">
                    {activeBaseCurr}
                  </span>
                </div>
              </div>

              {/* Interest Rate & Min Floor (Col 2) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                    {t('debt_milestone_modal.interest_rate_label', 'Interest Rate % (P.A.)')}
                  </label>
                  <div className="relative">
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="e.g., 4.5"
                      value={interestRate}
                      onChange={e => setInterestRate(e.target.value)}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif", 
                        fontWeight: 400,
                        fontSize: '12px',
                        height: '36px',
                      }}
                      className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg pl-3 pr-6 py-1.5 text-black focus:border-black outline-none transition-all"
                    />
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="absolute right-2 top-1/2 -translate-y-1/2 text-charcoal/40 text-[11px] pointer-events-none">
                      %
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block">
                    {t('debt_milestone_modal.min_balance_floor', 'Min Balance Floor')}
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="0.00"
                      value={minBalanceFloor}
                      onChange={e => setMinBalanceFloor(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                      onBlur={() => setMinBalanceFloor(prev => evaluateMathExpression(prev))}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif", 
                        fontWeight: 400,
                        fontSize: '12px',
                        height: '36px',
                      }}
                      className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg pl-2 pr-10 py-1.5 text-black focus:border-black outline-none transition-all"
                    />
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 text-[10px] pointer-events-none">
                      {activeBaseCurr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Frequency & Installment Amount (Col 2) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block whitespace-nowrap">
                    {t('debt_milestone_modal.payment_frequency', 'Payment Frequency')}
                  </label>
                  <select
                    value={paymentFrequency}
                    onChange={e => setPaymentFrequency(e.target.value)}
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400,
                      fontSize: '12px',
                      height: '36px',
                    }}
                    className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg px-2.5 py-1.5 text-neutral-700 focus:border-black outline-none transition-all"
                  >
                    <option value="Weekly" style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }}>{t('debt_milestone_modal.option_weekly', 'Weekly')}</option>
                    <option value="Bi-Weekly" style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }}>{t('debt_milestone_modal.option_biweekly', 'Bi-Weekly')}</option>
                    <option value="Monthly" style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }}>{t('debt_milestone_modal.option_monthly', 'Monthly')}</option>
                    <option value="Quarterly" style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }}>{t('debt_milestone_modal.option_quarterly', 'Quarterly')}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[#57606F] text-[11px] block whitespace-nowrap">
                    {debtType === 'Loan' && loanDirection === 'lent' ? t('debt_milestone_modal.repayment_received_label', 'Repayment Received') : t('debt_milestone_modal.installment_amount_label', 'Installment Amount')}
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      required
                      placeholder="e.g., 5000"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                      onBlur={() => setPaymentAmount(prev => evaluateMathExpression(prev))}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif", 
                        fontWeight: 700,
                        fontSize: '12px',
                        height: '36px',
                      }}
                      className="w-full bg-neutral-50 border border-[#E1E8ED]/80 rounded-lg pl-3 pr-10 py-2 text-black font-bold focus:border-black outline-none transition-all placeholder:text-[#57606F]/40"
                    />
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="absolute right-2 top-1/2 -translate-y-1/2 text-black/40 text-[10px] pointer-events-none">
                      {activeBaseCurr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recommendation summary note */}
              <div className="bg-[#E1E8ED]/20 border border-[#E1E8ED]/40 rounded-xl p-2.5 flex items-start gap-1.5 select-none">
                <Info size={12} className="text-[#57606F] mt-0.5 shrink-0" />
                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-neutral-500 text-[10px] leading-normal font-normal">
                  {t('debt_milestone_modal.info_note', 'Saving this configuration automatically triggers a background write to establish your corresponding accounts collection ledger records.')}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-1.5 pb-0.5">
                <button 
                  type="button" 
                  onClick={onClose}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: '12px',
                    height: '38px',
                  }}
                  className="flex-1 border border-[#E1E8ED] rounded-xl text-neutral-600 hover:bg-neutral-50 cursor-pointer text-center bg-white transition-all active:scale-95"
                >
                  {t('debt_milestone_modal.cancel', 'Cancel')}
                </button>
                <button 
                  type="submit" 
                  disabled={isLoading || !name || !principleAmount || !paymentAmount}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 700,
                    fontSize: '12px',
                    height: '38px',
                  }}
                  className="flex-1 bg-black text-white rounded-xl font-bold shadow-sm hover:bg-neutral-800 cursor-pointer text-center transition-all disabled:opacity-50 active:scale-95"
                >
                  {isLoading ? t('debt_milestone_modal.saving', 'Saving...') : t('debt_milestone_modal.save_configuration', 'Save Configuration')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
