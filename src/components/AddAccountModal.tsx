import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Building2 as BankIcon, Landmark, CreditCard, HandCoins, Home, ChevronRight, Check, Plus } from 'lucide-react';
import { collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useVantageActions } from '../hooks/useVantageActions';
import { evaluateMathExpression } from '../lib/constants';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onAccountAdded: () => void;
  profile?: any;
}

type AccountType = 'cash' | 'bank' | 'investment' | 'credit' | 'loan' | 'mortgage';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  focused: boolean;
  prefixElement?: React.ReactNode;
}

const GlassInput: React.FC<GlassInputProps> = ({ label, focused, prefixElement, className, style, ...props }) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <label 
        style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} 
        className="px-1 text-left"
      >
        {label}
      </label>
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#FFFFFF',
          borderRadius: '12px',
          border: focused ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
          boxShadow: focused ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
          padding: '0 1rem',
          transition: 'all 0.2s ease',
          outline: 'none',
          fontFamily: "'Google Sans', sans-serif",
          color: '#1E2229',
          width: '100%',
        }}
        className="h-12 min-h-[48px]"
      >
        {prefixElement && (
          <div className="flex items-center shrink-0 pr-2 border-r border-vantage-text/10 mr-2 select-none">
            {prefixElement}
          </div>
        )}
        <input
          {...props}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
            fontWeight: 500,
            color: '#1E2229',
            fontFamily: "'Google Sans', sans-serif",
            width: '100%',
            padding: '0',
            ...style,
          }}
        />
      </div>
    </div>
  );
};

interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  focused: boolean;
}

const GlassSelect: React.FC<GlassSelectProps> = ({ label, focused, children, style, ...props }) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <label 
        style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} 
        className="px-1 text-left"
      >
        {label}
      </label>
      <div style={{ position: 'relative', width: '100%' }}>
        <select
          {...props}
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: focused ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
            boxShadow: focused ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
            padding: '1rem',
            paddingRight: '2.5rem',
            fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
            fontWeight: 500,
            color: '#1E2229',
            transition: 'all 0.2s ease',
            outline: 'none',
            fontFamily: "'Google Sans', sans-serif",
            width: '100%',
            appearance: 'none',
            cursor: 'pointer',
            ...style,
          }}
        >
          {children}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-vantage-muted">
          <ChevronRight size={16} className="rotate-90 text-[#1E2229]" />
        </div>
      </div>
    </div>
  );
};

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, uid, onAccountAdded, profile }) => {
  const { createAccount, addTransaction } = useVantageActions(uid);
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [interestRate, setInterestRate] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setCurrency(profile?.baseCurrency || profile?.currency || 'AED');
    }
  }, [isOpen, profile]);
  
  // New Fields
  const [totalGainLoss, setTotalGainLoss] = useState('');
  const [includeInLiquidity, setIncludeInLiquidity] = useState(true);
  const [creditLimit, setCreditLimit] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [recurringProtocol, setRecurringProtocol] = useState('');
  
  // Bank Account Specific Fields
  const [bankAccountType, setBankAccountType] = useState<'Checking' | 'Savings'>('Checking');
  const [minBalanceFloor, setMinBalanceFloor] = useState('');
  const [defaultTransferFee, setDefaultTransferFee] = useState('');

  // Sub-Assets for Investment
  const [subAssets, setSubAssets] = useState<{ id: string; name: string; principalInvested: string; currentValue: string; passiveIncome: string; estimatedYield: string; yieldPeriod: string; }[]>([]);
  const [platformFees, setPlatformFees] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const calculateTotalPrincipal = () => {
    return subAssets.reduce((sum, sa) => sum + (parseFloat(sa.principalInvested) || 0), 0);
  };

  const accountTypes = [
    { id: 'bank', label: 'Bank Account', icon: BankIcon, desc: 'Savings, checking, or current' },
    { id: 'cash', label: 'Cash Account', icon: Wallet, desc: 'Physical currency or petty cash' },
    { id: 'credit', label: 'Credit Card', icon: CreditCard, desc: 'Visa, Mastercard, or Amex' },
    { id: 'investment', label: 'Investment Portfolio', icon: Landmark, desc: 'Stocks, crypto, real estate, or Sarwa' },
  ];

  const handleSelectType = (type: any) => {
    setSelectedType(type.id);
    setStep('details');
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;
    
    // Validate Investment Principal
    if (selectedType === 'investment') {
      const totalPrincipal = calculateTotalPrincipal();
      const sBalance = parseFloat(evaluateMathExpression(startingBalance)) || 0;
      if (totalPrincipal > sBalance) {
        setErrorMessage(`ALLOCATION EXCEEDED: Principal (${totalPrincipal.toLocaleString()}) must be sourced from available Wallet Balance (${sBalance.toLocaleString()}).`);
        return;
      }
    }

    setErrorMessage(null);
    setIsLoading(true);
    try {
      let parsedStartingBalance = parseFloat(evaluateMathExpression(startingBalance));
      if (selectedType === 'loan' || selectedType === 'mortgage') {
        parsedStartingBalance = -Math.abs(parsedStartingBalance);
      }

      const accountData: any = {
        name,
        type: selectedType,
        startingBalance: 0, // permanently locked at 0
        initialStartingBalance: parsedStartingBalance, // Pass to createAccount to handle atomically
        currency,
        createdAt: serverTimestamp(),
      };

      if (selectedType === 'cash') {
        accountData.atmAutoSync = false;
        accountData.dailySpendReminder = false;
      }

      if (selectedType === 'bank') {
        accountData.bankAccountNumber = bankAccountNumber;
        accountData.interestRate = parseFloat(evaluateMathExpression(interestRate)) || 0;
        accountData.bankAccountType = bankAccountType;
        accountData.minBalanceFloor = parseFloat(evaluateMathExpression(minBalanceFloor)) || 0;
        accountData.defaultTransferFee = parseFloat(evaluateMathExpression(defaultTransferFee)) || 0;
      }

      if (selectedType === 'investment') {
        accountData.totalGainLoss = parseFloat(evaluateMathExpression(totalGainLoss)) || 0;
        accountData.includeInLiquidity = includeInLiquidity;
        accountData.platformFees = parseFloat(evaluateMathExpression(platformFees)) || 0;
        accountData.subAssets = subAssets.map(sa => {
          const assetId = sa.id || Math.random().toString(36).substring(2, 12);
          const assetName = sa.name || '';
          const investmentValue = parseFloat(evaluateMathExpression(sa.currentValue)) || 0;
          const principalInvested = parseFloat(evaluateMathExpression(sa.principalInvested)) || 0;
          const passiveIncome = parseFloat(evaluateMathExpression(sa.passiveIncome)) || 0;
          const estimatedYield = parseFloat(evaluateMathExpression(sa.estimatedYield)) || 0;
          const yieldPeriod = sa.yieldPeriod || 'Yearly';

          return {
            assetId,
            id: assetId,
            assetName,
            name: assetName,
            investmentValue,
            currentValue: investmentValue,
            principalInvested,
            passiveIncome,
            estimatedYield,
            yieldPeriod
          };
        });
        // The dynamic currentBalance is calculated as the sum of all subAssets' investmentValue
        accountData.currentBalance = accountData.subAssets.reduce((sum: number, sa: any) => sum + sa.investmentValue, 0);
      }

      if (selectedType === 'credit') {
        accountData.creditLimit = parseFloat(evaluateMathExpression(creditLimit)) || 0;
        accountData.paymentDueDate = paymentDueDate;
      }

      if (selectedType === 'loan' || selectedType === 'mortgage') {
        accountData.interestRate = parseFloat(evaluateMathExpression(interestRate)) || 0;
        accountData.recurringProtocol = recurringProtocol;
      }
      
      await createAccount(accountData);

      onAccountAdded();
      handleClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/accounts`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('type');
    setSelectedType(null);
    setName('');
    setStartingBalance('');
    setCurrency(profile?.baseCurrency || profile?.currency || 'AED');
    setBankAccountNumber('');
    setInterestRate('');
    setTotalGainLoss('');
    setPlatformFees('');
    setIncludeInLiquidity(true);
    setCreditLimit('');
    setPaymentDueDate('');
    setRecurringProtocol('');
    setBankAccountType('Checking');
    setMinBalanceFloor('');
    setDefaultTransferFee('');
    setSubAssets([]);
    onClose();
  };

  const baseCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  const enabledCurrencies = profile?.enabledCurrencies || [];
  const currencies = Array.from(new Set([baseCurrency, ...enabledCurrencies]));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-[#1E2229]/60 backdrop-blur-[6px]"
          />
          
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.15 }}
              style={{
                fontFamily: "'Google Sans', sans-serif",
                background: 'rgba(255, 255, 255, 0.55)',
                backdropFilter: 'blur(22px)',
                WebkitBackdropFilter: 'blur(22px)',
                borderRadius: '24px',
                border: '1px solid rgba(30, 34, 41, 0.08)',
              }}
              className="relative w-full max-w-[92%] md:max-w-[450px] max-h-[90dvh] overflow-y-auto shadow-2xl [WebkitOverflowScrolling:touch]"
            >
            <div className="p-6 md:p-8 flex flex-col gap-5">
              <div className="flex justify-between items-center">
                <div className="flex flex-col gap-0.5 animate-none">
                  <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(1.3rem, 4vw, 1.5rem)', color: '#1E2229' }} className="font-bold tracking-tight leading-tight">
                    {step === 'type' ? 'Define identity' : 'Account details'}
                  </h3>
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)', color: '#57606F' }} className="tracking-wide font-normal leading-tight">
                    {step === 'type' ? 'Select account source' : `${selectedType ? selectedType.charAt(0).toUpperCase() + selectedType.slice(1) : ''} configuration`}
                  </p>
                </div>
                <button onClick={handleClose} className="p-2 text-vantage-muted hover:text-vantage-text transition-colors active:scale-90 cursor-pointer">
                  <X size={20} style={{ color: '#1E2229' }} />
                </button>
              </div>

              {step === 'type' ? (
                <div className="max-h-[75vh] overflow-y-auto pr-1 [WebkitOverflowScrolling:touch] flex flex-col gap-3 w-full animate-none">
                  {accountTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleSelectType(type)}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        background: 'rgba(255, 255, 255, 0.40)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        borderRadius: '16px',
                        border: '1px solid rgba(30, 34, 41, 0.08)',
                      }}
                      className="group w-full flex items-center justify-between py-3 px-4 hover:border-[#A6DDB1] hover:bg-white/60 hover:shadow-[0_0_12px_rgba(166,221,177,0.20)] transition-all text-left shadow-sm min-h-[58px]"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 max-w-[85%]">
                        <div className="w-10 h-10 rounded-xl bg-[#A6DDB1]/10 flex items-center justify-center shrink-0 group-hover:bg-[#A6DDB1]/20 transition-colors">
                          <type.icon className="text-[#1E2229] shrink-0" size={20} />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(1rem, 3.2vw, 1.15rem)' }} 
                            className="font-bold text-[#1E2229] group-hover:text-[#20C997] transition-colors truncate whitespace-nowrap overflow-hidden"
                          >
                            {type.label}
                          </span>
                          <p 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)' }} 
                            className="text-[#57606F] tracking-tight font-normal truncate whitespace-nowrap overflow-hidden"
                          >
                            {type.desc}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-[#1E2229]/5 flex items-center justify-center shrink-0 group-hover:bg-[#A6DDB1]/20 transition-all">
                        <ChevronRight size={16} className="text-[#57606F] group-hover:text-[#1E2229] transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleAddAccount} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 w-full max-h-[75vh] md:max-h-none overflow-y-auto p-1 custom-scrollbar">
                    {/* Account Label */}
                    <GlassInput
                      required
                      type="text"
                      label="Account label"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Personal Savings"
                      focused={focusedField === 'name'}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                    />

                    {/* Currency */}
                    <GlassSelect
                      label="Currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      focused={focusedField === 'currency'}
                      onFocus={() => setFocusedField('currency')}
                      onBlur={() => setFocusedField(null)}
                    >
                      {currencies.map(c => <option key={c} value={c} className="bg-white text-black">{c}</option>)}
                    </GlassSelect>

                    {/* Starting Balance */}
                    <GlassInput
                      required
                      type="text"
                      label="Starting balance"
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                      onBlur={() => {
                        setStartingBalance(prev => evaluateMathExpression(prev));
                        setFocusedField(null);
                      }}
                      placeholder="0 or e.g., 7000*6"
                      prefixElement={
                        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229] select-none whitespace-nowrap">
                          {currency}
                        </span>
                      }
                      focused={focusedField === 'startingBalance'}
                      onFocus={() => setFocusedField('startingBalance')}
                    />

                    {selectedType === 'bank' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="w-full flex flex-col gap-4 animate-none"
                      >
                        {/* Account Sub-Type */}
                        <div className="w-full flex flex-col gap-1.5 animate-none">
                           <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} className="px-1 text-left">
                             Account sub-type
                           </label>
                           <div className="grid grid-cols-2 gap-3 w-full animate-none">
                              {['Checking', 'Savings'].map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setBankAccountType(t as any)}
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif",
                                    fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
                                    fontWeight: bankAccountType === t ? 700 : 400,
                                    background: bankAccountType === t ? '#A6DDB1' : 'rgba(255, 255, 255, 0.40)',
                                    border: bankAccountType === t ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
                                    color: '#1E2229',
                                    boxShadow: bankAccountType === t ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
                                    borderRadius: '12px'
                                  }}
                                  className="h-12 min-h-[48px] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                                >
                                  {t}
                                </button>
                              ))}
                           </div>
                        </div>

                        {/* Bank Account Number */}
                        <GlassInput
                          label="Bank account number (IBAN)"
                          placeholder="AE00 0000 0000 0000"
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                          focused={focusedField === 'bankAccountNumber'}
                          onFocus={() => setFocusedField('bankAccountNumber')}
                          onBlur={() => setFocusedField(null)}
                        />

                        {/* Interest Rate */}
                        <GlassInput
                          label="Interest rate (%)"
                          placeholder="0 or e.g., 1.50+0.50"
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setInterestRate(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">%</span>}
                          focused={focusedField === 'interestRate'}
                          onFocus={() => setFocusedField('interestRate')}
                        />

                        {/* Min Balance Floor */}
                        <GlassInput
                          label="Min balance floor"
                          placeholder="0 or e.g., 1000*3"
                          value={minBalanceFloor}
                          onChange={(e) => setMinBalanceFloor(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setMinBalanceFloor(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'minBalanceFloor'}
                          onFocus={() => setFocusedField('minBalanceFloor')}
                        />

                        {/* Default Transfer Fee */}
                        <GlassInput
                          label="Default transfer fee"
                          placeholder="0 or e.g., 1+1.5"
                          value={defaultTransferFee}
                          onChange={(e) => setDefaultTransferFee(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setDefaultTransferFee(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'defaultTransferFee'}
                          onFocus={() => setFocusedField('defaultTransferFee')}
                        />
                      </motion.div>
                    )}

                    {selectedType === 'investment' && (
                      <div className="w-full flex flex-col gap-4 animate-none">
                        {/* Platform Fees */}
                        <GlassInput
                          label="Platform fees"
                          placeholder="0 or e.g., 5.00"
                          value={platformFees}
                          onChange={(e) => setPlatformFees(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setPlatformFees(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'platformFees'}
                          onFocus={() => setFocusedField('platformFees')}
                        />

                        {/* Total Gain/Loss */}
                        <GlassInput
                          label="Total gain/loss"
                          placeholder="0 or e.g., 2000-500"
                          value={totalGainLoss}
                          onChange={(e) => setTotalGainLoss(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setTotalGainLoss(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'totalGainLoss'}
                          onFocus={() => setFocusedField('totalGainLoss')}
                        />

                        {/* Liquid Asset Switch */}
                        <div 
                          style={{
                            background: 'rgba(255, 255, 255, 0.40)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            borderRadius: '12px',
                            border: '1px solid rgba(30, 34, 41, 0.08)',
                          }}
                          className="w-full flex items-center justify-between px-4 h-14 shrink-0 animate-none"
                        >
                           <div className="flex flex-col gap-0.5 animate-none">
                             <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', fontWeight: 700, color: '#1E2229' }} className="tracking-wide text-left justify-start">Liquid asset</span>
                             <p style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#57606F' }} className="text-left font-normal capitalize-none leading-tight">Include in cash liquidity</p>
                           </div>
                           <button 
                             type="button"
                             onClick={() => setIncludeInLiquidity(!includeInLiquidity)}
                             style={{
                               backgroundColor: includeInLiquidity ? '#A6DDB1' : 'rgba(30, 34, 41, 0.08)',
                             }}
                             className="w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer"
                           >
                             <motion.div 
                                animate={{ x: includeInLiquidity ? 22 : 2 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md"
                             />
                           </button>
                        </div>

                        {/* Sub-Asset Manager Title & Trigger */}
                        <div className="w-full flex justify-between items-center px-1 mt-1 shrink-0 select-none animate-none">
                            <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.95rem, 2vw, 1.1rem)', fontWeight: 700, color: '#1E2229' }} className="tracking-wide">Sub-asset manager</span>
                            <button 
                              type="button"
                              onClick={() => setSubAssets([...subAssets, { id: Math.random().toString(36).substring(2, 12), name: '', principalInvested: '', currentValue: '', passiveIncome: '', estimatedYield: '', yieldPeriod: 'monthly' }])}
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="text-[13px] text-[#20C997] font-bold tracking-normal flex items-center gap-1 hover:text-[#1E2229] transition-colors cursor-pointer"
                            >
                              <Plus size={14} /> Add asset
                            </button>
                        </div>

                        {/* Sub-Asset List Container */}
                        <div className="w-full flex flex-col gap-3 max-h-[220px] overflow-y-auto pr-1 shrink-0">
                            {subAssets.map((sa, idx) => (
                              <div 
                                key={sa.id || `sa-add-edit-${idx}`} 
                                style={{
                                  background: 'rgba(255, 255, 255, 0.25)',
                                  borderRadius: '16px',
                                  border: '1px solid rgba(30, 34, 41, 0.06)'
                                }}
                                className="p-3 flex flex-col gap-3 animate-none"
                              >
                                 <div className="flex justify-between items-center gap-2">
                                    <input 
                                      type="text"
                                      placeholder="Asset name (e.g. BTC, rental unit)"
                                      value={sa.name}
                                      onChange={(e) => {
                                        const newAssets = [...subAssets];
                                        newAssets[idx].name = e.target.value;
                                        setSubAssets(newAssets);
                                      }}
                                      style={{ 
                                        fontFamily: "'Google Sans', sans-serif",
                                        background: 'rgba(255, 255, 255, 0.50)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(30, 34, 41, 0.06)'
                                      }}
                                      className="w-full px-3 text-sm font-bold text-[#1E2229] outline-none placeholder:text-[#57606F]/50 h-10 min-h-[40px]"
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => setSubAssets(subAssets.filter((_, i) => i !== idx))}
                                      className="text-[#57606F] hover:text-rose-500 transition-colors shrink-0 p-1 cursor-pointer"
                                    >
                                      <X size={16} />
                                    </button>
                                 </div>
                                 <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div className="flex flex-col gap-1">
                                       <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[11px] font-normal text-[#57606F] tracking-wide px-1">Principal</label>
                                       <input 
                                         type="number"
                                         placeholder="0"
                                         value={sa.principalInvested}
                                         onChange={(e) => {
                                           const newAssets = [...subAssets];
                                           newAssets[idx].principalInvested = e.target.value;
                                           setSubAssets(newAssets);
                                         }}
                                         style={{ 
                                           fontFamily: "'Google Sans', sans-serif",
                                           background: 'rgba(255, 255, 255, 0.50)',
                                           borderRadius: '10px',
                                           border: '1px solid rgba(30, 34, 41, 0.06)'
                                         }}
                                         className="px-2 text-sm text-[#1E2229] outline-none focus:border-[#A6DDB1] h-10 min-h-[40px]"
                                       />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                       <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[11px] font-normal text-[#57606F] tracking-wide px-1">Value</label>
                                       <input 
                                         type="number"
                                         placeholder="0"
                                         value={sa.currentValue}
                                         onChange={(e) => {
                                           const newAssets = [...subAssets];
                                           newAssets[idx].currentValue = e.target.value;
                                           setSubAssets(newAssets);
                                         }}
                                         style={{ 
                                           fontFamily: "'Google Sans', sans-serif",
                                           background: 'rgba(255, 255, 255, 0.50)',
                                           borderRadius: '10px',
                                           border: '1px solid rgba(30, 34, 41, 0.06)'
                                         }}
                                         className="px-2 text-sm text-[#1E2229] outline-none focus:border-[#A6DDB1] h-10 min-h-[40px]"
                                       />
                                    </div>
                                 </div>
                                 <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div className="flex flex-col gap-1">
                                       <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[11px] font-normal text-[#57606F] tracking-wide px-1">Est. passive yield</label>
                                       <input 
                                         type="number"
                                         placeholder="Yield"
                                         value={sa.estimatedYield}
                                         onChange={(e) => {
                                           const newAssets = [...subAssets];
                                           newAssets[idx].estimatedYield = e.target.value;
                                           setSubAssets(newAssets);
                                         }}
                                         style={{ 
                                           fontFamily: "'Google Sans', sans-serif",
                                           background: 'rgba(255, 255, 255, 0.50)',
                                           borderRadius: '10px',
                                           border: '1px solid rgba(30, 34, 41, 0.06)'
                                         }}
                                         className="px-2 text-sm text-[#1E2229] outline-none focus:border-[#A6DDB1] h-10 min-h-[40px]"
                                       />
                                    </div>
                                    <div className="flex flex-col gap-1 relative">
                                       <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[11px] font-normal text-[#57606F] tracking-wide px-1">Yield period</label>
                                       <select 
                                         value={sa.yieldPeriod || 'monthly'}
                                         onChange={(e) => {
                                           const newAssets = [...subAssets];
                                           newAssets[idx].yieldPeriod = e.target.value;
                                           setSubAssets(newAssets);
                                         }}
                                         style={{ 
                                           fontFamily: "'Google Sans', sans-serif",
                                           background: 'rgba(255, 255, 255, 0.50)',
                                           borderRadius: '10px',
                                           border: '1px solid rgba(30, 34, 41, 0.06)'
                                         }}
                                         className="w-full px-2 text-sm text-[#1E2229] outline-none focus:border-[#A6DDB1] appearance-none font-bold cursor-pointer h-10 min-h-[40px]"
                                       >
                                          <option value="daily" className="bg-white text-[#1E2229]">Daily</option>
                                          <option value="weekly" className="bg-white text-[#1E2229]">Weekly</option>
                                          <option value="monthly" className="bg-white text-[#1E2229]">Monthly</option>
                                          <option value="yearly" className="bg-white text-[#1E2229]">Yearly</option>
                                       </select>
                                    </div>
                                 </div>
                                 <div className="flex flex-col gap-1 mt-1">
                                    <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[11px] font-normal text-[#57606F] tracking-wide px-1">Received (realized) income</label>
                                    <input 
                                      type="text"
                                      placeholder="0 or e.g., 7000*6"
                                      value={sa.passiveIncome}
                                      onChange={(e) => {
                                        const newAssets = [...subAssets];
                                        newAssets[idx].passiveIncome = e.target.value.replace(/[^0-9+\-*/.()]/g, '');
                                        setSubAssets(newAssets);
                                      }}
                                      onBlur={() => {
                                        const newAssets = [...subAssets];
                                        newAssets[idx].passiveIncome = evaluateMathExpression(sa.passiveIncome);
                                        setSubAssets(newAssets);
                                      }}
                                      style={{ 
                                        fontFamily: "'Google Sans', sans-serif",
                                        background: 'rgba(255, 255, 255, 0.50)',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(30, 34, 41, 0.06)'
                                      }}
                                      className="px-2 text-sm text-[#1E2229] outline-none focus:border-[#A6DDB1] h-10 min-h-[40px]"
                                    />
                                 </div>
                              </div>
                            ))}
                            {subAssets.length === 0 && (
                              <p style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs text-[#57606F] italic text-center py-4 bg-white/20 rounded-xl border border-dashed border-vantage-text/10 w-full shrink-0 select-none">No sub-assets defined. Add physical or digital assets to track granular performance.</p>
                            )}
                         </div>
                      </div>
                    )}

                    {selectedType === 'credit' && (
                      <div className="w-full flex flex-col gap-4 animate-none">
                        {/* Credit Limit */}
                        <GlassInput
                          label="Credit limit"
                          placeholder="0 or e.g., 7000*6"
                          value={creditLimit}
                          onChange={(e) => setCreditLimit(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setCreditLimit(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'creditLimit'}
                          onFocus={() => setFocusedField('creditLimit')}
                        />

                        {/* Payment Due Date */}
                        <GlassInput
                          label="Payment due date"
                          type="date"
                          placeholder=""
                          value={paymentDueDate}
                          onChange={(e) => setPaymentDueDate(e.target.value)}
                          focused={focusedField === 'paymentDueDate'}
                          onFocus={() => setFocusedField('paymentDueDate')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </div>
                    )}

                    {(selectedType === 'loan' || selectedType === 'mortgage') && (
                      <div className="w-full flex flex-col gap-4 animate-none">
                        {/* Interest Rate */}
                        <GlassInput
                          label="Interest rate (%)"
                          placeholder="0 or e.g., 4+0.5"
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value)}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">%</span>}
                          focused={focusedField === 'interestRate'}
                          onFocus={() => setFocusedField('interestRate')}
                          onBlur={() => setFocusedField(null)}
                        />

                        {/* Recurring Payment Protocol */}
                        <GlassInput
                          label="Recurring payment protocol"
                          placeholder="e.g. AED 2,500 Monthly"
                          value={recurringProtocol}
                          onChange={(e) => setRecurringProtocol(e.target.value)}
                          focused={focusedField === 'recurringProtocol'}
                          onFocus={() => setFocusedField('recurringProtocol')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </div>
                    )}
                  </div>

                  {errorMessage && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)' }} className="p-3.5 rounded-xl flex items-center gap-2 animate-none">
                       <X size={16} className="text-[#EF4444]" />
                       <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.85rem, 2vw, 0.95rem)', fontWeight: 400 }} className="text-[#EF4444] tracking-normal text-left">
                         {errorMessage}
                       </span>
                    </div>
                  )}

                  <div className="flex gap-4 pt-2 w-full mt-2 shrink-0 animate-none">
                    <button 
                      type="button"
                      onClick={() => setStep('type')}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                        fontWeight: 400,
                        background: 'rgba(255, 255, 255, 0.40)',
                        border: '1px solid rgba(30, 34, 41, 0.08)',
                        color: '#1E2229'
                      }}
                      className="flex-1 py-1 rounded-xl shadow-sm transition-all active:scale-95 h-12 md:h-14 flex items-center justify-center cursor-pointer"
                    >
                      Back
                    </button>
                    <button 
                      disabled={isLoading}
                      type="submit"
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                        fontWeight: 700,
                        background: '#A6DDB1',
                        border: '1.5px solid #A6DDB1',
                        color: '#1E2229',
                        boxShadow: '0 4px 15px rgba(166, 221, 177, 0.25)'
                      }}
                      className="flex-[2] py-1 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 h-12 md:h-14 cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-[#1E2229]/20 border-t-[#1E2229] rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check size={18} />
                          <span>Create Account</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
