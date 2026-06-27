import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, query, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLabel } from '../lib/stringUtils';
import { getCachedAccessToken, createGoogleCalendarEvent, createGoogleTask, connectGoogleWorkspace } from '../lib/googleAuth';

// Helper to calculate next generation date for recurring logic
const calculateNextDate = (baseDate: string, freq: string, interval: number, dayOption: string = 'sameDate') => {
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
      if (d.getDate() < originalDay) d.setDate(0);
    } else {
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

export const AddTransactionModal: React.FC<any> = ({
  isOpen, onClose, uid, onSuccess, accounts = [], mode = 'expense', setMode, profile
}) => {
  const { t } = useTranslation();
  const isFree = !profile?.subscriptionTier || profile?.subscriptionTier?.toLowerCase() === 'free';
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, `users/${uid}/custom_categories`));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(list);
    });
    return () => unsubscribe();
  }, [uid]);

  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  
  useEffect(() => {
    if (categories.length > 0 && !category) {
        setCategory(categories[0].name);
    }
  }, [categories, category]);

  const [subcategory, setSubcategory] = useState('General');
  useEffect(() => {
     if (categories.length > 0) {
         const currentCat = categories.find(c => c.name === category);
         if (currentCat && currentCat.subcategories && currentCat.subcategories.length > 0) {
             setSubcategory(currentCat.subcategories[0]);
         } else {
             setSubcategory('General');
         }
     }
  }, [category, categories]);
  const activeAccounts = accounts.filter((acc: any) => !acc.isArchived);
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(activeAccounts[1]?.id || activeAccounts[0]?.id || '');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('Monthly');
  const [interval, setInterval] = useState('1');
  const [dayOption, setDayOption] = useState('sameDate');
  const [specificDayOfMonth, setSpecificDayOfMonth] = useState('');
  const [duration, setDuration] = useState('Indefinite');
  const [durationLimit, setDurationLimit] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSyncedToCalendar, setIsSyncedToCalendar] = useState(false);
  const [isSyncedToTasks, setIsSyncedToTasks] = useState(false);
  const [loading, setLoading] = useState(false);

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

  // --- Aesthetic Helpers ---
  const inputStyles = "w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm text-[#111c2d] focus:border-[#a6ddb1] outline-none transition-all";
  const labelStyles = "text-[10px] font-bold text-[#8c8c99] mb-1 block";

  const handleSave = async () => {
    if (!amount || !accountId) return;
    if (mode === 'transfer' && (!toAccountId || toAccountId === accountId)) return;
    
    setLoading(true);
    try {
      const selectedCategoryEntry = categories.find(c => c.name === category);
      
      const today = new Date().toISOString().split('T')[0];
      const isStartingToday = startDate === today;

      if (mode === 'transfer') {
        // --- TRANSFER LOGIC (Dual Entry) ---
        const sourceAcc = accounts.find((a: any) => a.id === accountId);
        const destAcc = accounts.find((a: any) => a.id === toAccountId);

        // 1. Create Outflow for Source
        const outflowData = {
          amount: Number(amount),
          notes: notes.trim() || `Transfer to ${destAcc?.name || 'Account'}`,
          category: 'Transfer',
          subcategory: 'Internal Transfer',
          emoji: '💸',
          accountId,
          toAccountId,
          type: 'Outflow', // Explicitly negative
          transactionType: 'transfer',
          date: today,
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          hasMirror: true // Mark as dual entry
        };

        // 2. Create Inflow for Destination
        const inflowData = {
          amount: Number(amount),
          notes: notes.trim() || `Transfer from ${sourceAcc?.name || 'Account'}`,
          category: 'Transfer',
          subcategory: 'Internal Transfer',
          emoji: '💰',
          accountId: toAccountId,
          fromAccountId: accountId,
          type: 'Inflow', // Explicitly positive
          transactionType: 'transfer',
          date: today,
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          hasMirror: true
        };

        await addDoc(collection(db, 'users', uid, 'transactions'), outflowData);
        await addDoc(collection(db, 'users', uid, 'transactions'), inflowData);

        // Atomic Balance Updates
        const sourceRef = doc(db, 'users', uid, 'accounts', accountId);
        const destRef = doc(db, 'users', uid, 'accounts', toAccountId);

        await updateDoc(sourceRef, {
          currentBalance: increment(-Number(amount)),
          updatedAt: serverTimestamp()
        });
        await updateDoc(destRef, {
          currentBalance: increment(Number(amount)),
          updatedAt: serverTimestamp()
        });

      } else {
        // --- STANDARD TRANSACTION LOGIC ---
        const transactionType = mode === 'income' ? 'Inflow' : 'Outflow';
        
        const transactionData = {
          amount: Number(amount),
          notes: notes.trim(),
          category,
          subcategory,
          emoji: selectedCategoryEntry?.emoji || '📁',
          accountId,
          type: transactionType,
          date: today,
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring
        };
        
        const shouldCreateNow = !isRecurring || (isRecurring && isStartingToday);

        if (shouldCreateNow) {
          await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);
          
          const accountRef = doc(db, 'users', uid, 'accounts', accountId);
          const amountChange = transactionType === 'Inflow' ? Number(amount) : -Number(amount);
          await updateDoc(accountRef, {
            currentBalance: increment(amountChange),
            updatedAt: serverTimestamp()
          });
        }
        
        if (isRecurring) {
            const nextGenDate = isStartingToday 
              ? calculateNextDate(startDate, frequency.toLowerCase(), Number(interval), dayOption)
              : startDate;

            await addDoc(collection(db, 'users', uid, 'recurringTransactions'), {
                userId: uid,
                title: notes.trim() || 'Recurring Transaction',
                amount: Number(amount),
                type: transactionType === 'Inflow' ? 'income' : 'expense',
                transactionType: transactionType === 'Inflow' ? 'income' : 'outflow',
                recurrency: frequency.toLowerCase(),
                frequency,
                interval: Number(interval),
                dayOption,
                specificDayOfMonth: dayOption === 'specificDay' ? Number(specificDayOfMonth) : null,
                duration,
                durationLimit,
                startDate,
                isSyncedToCalendar,
                isSyncedToTasks,
                category,
                subcategory,
                accountId,
                sourceAccountId: accountId,
                nextGenerationDate: nextGenDate,
                nextExecutionDate: nextGenDate,
                isActive: true,
                emoji: selectedCategoryEntry?.emoji || '📁',
                notes: notes.trim(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Google Workspace Sync... (omitted for brevity but kept in original code)
            if (isSyncedToCalendar || isSyncedToTasks) {
              try {
                let token = getCachedAccessToken();
                if (!token) token = await connectGoogleWorkspace();
                if (token) {
                  const accountName = accounts.find((a: any) => a.id === accountId)?.name || 'Account';
                  if (isSyncedToCalendar) {
                    await createGoogleCalendarEvent(token, {
                      title: notes.trim() || 'Recurring Transaction',
                      amount: Number(amount),
                      currency: 'AED',
                      accountName,
                      dueDate: startDate,
                      recurrency: frequency,
                      interval: Number(interval)
                    });
                  }
                  if (isSyncedToTasks) {
                    await createGoogleTask(token, {
                      title: notes.trim() || 'Recurring Transaction',
                      amount: Number(amount),
                      currency: 'AED',
                      accountName,
                      dueDate: startDate
                    });
                  }
                }
              } catch (syncErr) { console.error("Sync Error:", syncErr); }
            }
        }
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto bg-black/10 backdrop-blur-[2px]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0" />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-[400px] mt-8 mb-24 bg-white rounded-[30px] shadow-2xl border border-[#ececf1] p-6 pb-12 flex flex-col gap-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-[#111c2d]">
                  {mode === 'transfer' ? t('add_transaction.transfer_title', 'Create Transfer') : 
                   mode === 'income' ? t('add_transaction.income_title', 'Add Income') : 
                   t('add_transaction.expense_title', 'Add Expense')}
                </h3>
                <p className="text-[10px] font-bold text-[#8c8c99] tracking-widest uppercase">{t('add_transaction.control')}</p>
              </div>
              <div className="flex bg-[#f4f4f8] p-1 rounded-xl border border-[#d8d8e5]">
                <button 
                  type="button"
                  onClick={() => setMode('expense')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'expense' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_expense', 'Expense')}
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('income')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'income' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_income', 'Income')}
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('transfer')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'transfer' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_transfer', 'Transfer')}
                </button>
              </div>
            </div>

            {/* Inputs */}
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelStyles}>{mode === 'transfer' ? t('add_transaction.from_account', 'Source Account') : t('add_transaction.source_account')}</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputStyles}>
                    {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>

                {mode === 'transfer' && (
                  <div>
                    <label className={labelStyles}>{t('add_transaction.to_account', 'Destination Account')}</label>
                    <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className={inputStyles}>
                      {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {mode !== 'transfer' && (
                <>
                  <div>
                    <label className={labelStyles}>{t('add_transaction.category')}</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputStyles}>
                      {categories.map(cat => <option key={cat.id} value={cat.name}>{formatLabel(t(`categories.${cat.name}`, cat.name) as string)}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className={labelStyles}>{t('add_transaction.sub_category')}</label>
                    <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className={inputStyles}>
                        {categories.find(c => c.name === category)?.subcategories?.map((sub: string) => (
                            <option key={`${category}-${sub}`} value={sub}>{formatLabel(t(`subcategories.${sub}`, sub) as string)}</option>
                        )) || <option value="General">{t('subcategories.General', 'General')}</option>}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className={labelStyles}>{t('add_transaction.amount')}</label>
                <div className="relative">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputStyles} pr-12`} placeholder={t('add_transaction.amount_placeholder')} />
                    <span className="absolute right-4 top-3 text-sm font-bold text-[#8c8c99]">{t('add_transaction.amount_currency')}</span>
                </div>
              </div>

              <div>
                <label className={labelStyles}>{t('add_transaction.notes')}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputStyles} h-24`} placeholder={t('add_transaction.notes_placeholder')} />
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-bold text-[#111c2d]">{t('add_transaction.recurring_transaction')}</label>
                <button
                   type="button"
                   onClick={() => setIsRecurring(!isRecurring)}
                   className={`w-12 h-6 rounded-full p-1 transition-all ${isRecurring ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${isRecurring ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

               {isRecurring && (
                <div className="space-y-4 pt-2">
                   <div>
                       <label className={labelStyles}>{t('add_transaction.frequency')}</label>
                       <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputStyles}>
                         <option value="Weekly">{t('add_transaction.frequency_weekly')}</option>
                         <option value="Monthly">{t('add_transaction.frequency_monthly')}</option>
                         <option value="Yearly">{t('add_transaction.frequency_yearly')}</option>
                         <option value="Daily">{t('add_transaction.frequency_daily')}</option>
                       </select>
                   </div>
                   <div>
                       <label className={labelStyles}>{t('add_transaction.interval')}</label>
                       <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} className={inputStyles} />
                   </div>
                   <div>
                       <label className={labelStyles}>{t('add_transaction.day_option')}</label>
                       <select value={dayOption} onChange={(e) => setDayOption(e.target.value)} className={inputStyles}>
                         <option value="sameDate">{t('add_transaction.day_option_same')}</option>
                         <option value="sameWeekday">{t('add_transaction.day_option_weekday')}</option>
                         <option value="specificDay">{t('add_transaction.day_option_specific')}</option>
                       </select>
                   </div>
                   {dayOption === 'specificDay' && (
                       <div>
                           <label className={labelStyles}>{t('add_transaction.day_option_specific')}</label>
                           <input type="number" min="1" max="31" value={specificDayOfMonth} onChange={(e) => setSpecificDayOfMonth(e.target.value)} className={inputStyles} placeholder={t('add_transaction.day_option_specific_placeholder')} />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>{t('add_transaction.duration')}</label>
                       <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputStyles}>
                         <option value="Indefinite">{t('add_transaction.duration_indefinite')}</option>
                         <option value="Limited">{t('add_transaction.duration_limited')}</option>
                       </select>
                   </div>
                   {duration === 'Limited' && (
                       <div>
                           <label className={labelStyles}>{t('add_transaction.duration_limit')}</label>
                           <input type="text" value={durationLimit} onChange={(e) => setDurationLimit(e.target.value)} className={inputStyles} placeholder={t('add_transaction.duration_limit_placeholder')} />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>{t('add_transaction.start_date')}</label>
                       <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputStyles} />
                   </div>
                   
                   <div className="flex items-center justify-between">
                       <label className="text-[14px] font-bold text-[#111c2d]">{t('add_transaction.sync_calendar')}</label>
                       <button 
                         type="button" 
                         onClick={() => {
                           if (isFree) {
                             window.dispatchEvent(new CustomEvent('trigger-premium-modal'));
                           } else {
                             setIsSyncedToCalendar(!isSyncedToCalendar);
                           }
                         }} 
                         className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToCalendar ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                       >
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToCalendar ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                   {isFree && (
                       <span className="text-[10px] text-neutral-400 block -mt-2 mb-2 font-normal">Requires Tier 1, 2, or 3 upgrade to sync with Google Calendar.</span>
                   )}
                   <div className="flex items-center justify-between">
                       <label className="text-[14px] font-bold text-[#111c2d]">{t('add_transaction.sync_tasks')}</label>
                       <button 
                         type="button" 
                         onClick={() => {
                           if (isFree) {
                             window.dispatchEvent(new CustomEvent('trigger-premium-modal'));
                           } else {
                             setIsSyncedToTasks(!isSyncedToTasks);
                           }
                         }} 
                         className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToTasks ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                       >
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToTasks ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                   {isFree && (
                       <span className="text-[10px] text-neutral-400 block -mt-2 mb-2 font-normal">Requires Tier 1, 2, or 3 upgrade to sync with Google Tasks.</span>
                   )}
                </div>
               )}

              {/* Action Button */}
              <button disabled={loading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all flex items-center justify-center">
                {loading ? <RefreshCw className="animate-spin" /> : t('add_transaction.commit')}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
