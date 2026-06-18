import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const AddTransactionModal: React.FC<any> = ({
  isOpen, onClose, uid, onSuccess, accounts = []
}) => {
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
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
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

  // --- Aesthetic Helpers ---
  const inputStyles = "w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm text-[#111c2d] focus:border-[#a6ddb1] outline-none transition-all";
  const labelStyles = "text-[10px] font-bold text-[#8c8c99] mb-1 block";

  const handleSave = async () => {
    if (!amount || !accountId) return;
    setLoading(true);
    try {
      const selectedCategoryEntry = categories.find(c => c.name === category);
      const transactionType = selectedCategoryEntry?.nature === 'Income' ? 'Inflow' : 'Outflow';
      
      const transactionData = {
        amount: Number(amount),
        notes: notes.trim(),
        category,
        subcategory,
        emoji: selectedCategoryEntry?.emoji || '📁',
        accountId,
        type: transactionType,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        status: 'confirmed',
        isRecurring
      };
      
      await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);
      
      if (isRecurring) {
          await addDoc(collection(db, 'users', uid, 'recurringTransactions'), {
              userId: uid,
              title: notes.trim() || 'Recurring Transaction',
              amount: Number(amount),
              transactionType: transactionType === 'Inflow' ? 'income' : 'outflow',
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
              sourceAccountId: accountId,
              nextExecutionDate: startDate,
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
          });
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Ledger distribution insert fault:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-white" />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-[400px] max-h-[95vh] overflow-y-auto bg-white rounded-[30px] shadow-xl border border-[#ececf1] p-6 pb-40 flex flex-col gap-5"
          >
            {/* Header */}
            <div>
              <h3 className="text-xl font-extrabold text-[#111c2d]">SUBMIT TRANSACTION</h3>
              <p className="text-[10px] font-bold text-[#8c8c99] tracking-widest uppercase">CONTROL</p>
            </div>

            {/* Inputs */}
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div>
                <label className={labelStyles}>SOURCE ACCOUNT (AED)</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputStyles}>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelStyles}>CATEGORY</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputStyles}>
                  {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelStyles}>SUB-CATEGORY</label>
                <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className={inputStyles}>
                    {categories.find(c => c.name === category)?.subcategories?.map((sub: string) => (
                        <option key={`${category}-${sub}`} value={sub}>{sub}</option>
                    )) || <option value="General">General</option>}
                </select>
              </div>

              <div>
                <label className={labelStyles}>INTERACTION AMOUNT</label>
                <div className="relative">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputStyles} pr-12`} placeholder="0 or e.g., 7000*6" />
                    <span className="absolute right-4 top-3 text-sm font-bold text-[#8c8c99]">AED</span>
                </div>
              </div>

              <div>
                <label className={labelStyles}>INTERACTION NOTE</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputStyles} h-24`} placeholder="DETAILS OF THE INTERACTION..." />
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-bold text-[#111c2d]">Recurring transaction</label>
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
                       <label className={labelStyles}>FREQUENCY</label>
                       <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputStyles}>
                         <option value="Weekly">Weekly</option>
                         <option value="Monthly">Monthly</option>
                         <option value="Yearly">Yearly</option>
                         <option value="Daily">Daily</option>
                       </select>
                   </div>
                   <div>
                       <label className={labelStyles}>INTERVAL</label>
                       <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} className={inputStyles} />
                   </div>
                   <div>
                       <label className={labelStyles}>DAY OPTION</label>
                       <select value={dayOption} onChange={(e) => setDayOption(e.target.value)} className={inputStyles}>
                         <option value="sameDate">Same Date</option>
                         <option value="sameWeekday">Same Weekday</option>
                         <option value="specificDay">Specific Day</option>
                       </select>
                   </div>
                   {dayOption === 'specificDay' && (
                       <div>
                           <label className={labelStyles}>SPECIFIC DAY OF MONTH</label>
                           <input type="number" min="1" max="31" value={specificDayOfMonth} onChange={(e) => setSpecificDayOfMonth(e.target.value)} className={inputStyles} placeholder="1-31" />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>DURATION</label>
                       <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputStyles}>
                         <option value="Indefinite">Indefinite</option>
                         <option value="Limited">Limited</option>
                       </select>
                   </div>
                   {duration === 'Limited' && (
                       <div>
                           <label className={labelStyles}>DURATION LIMIT</label>
                           <input type="text" value={durationLimit} onChange={(e) => setDurationLimit(e.target.value)} className={inputStyles} placeholder="E.g., 12 months, 2026-12-31" />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>START DATE</label>
                       <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputStyles} />
                   </div>
                   
                   <div className="flex items-center justify-between">
                       <label className="text-xs font-bold text-[#111c2d]">Sync to Google Calendar</label>
                       <button type="button" onClick={() => setIsSyncedToCalendar(!isSyncedToCalendar)} className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToCalendar ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}>
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToCalendar ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                   <div className="flex items-center justify-between">
                       <label className="text-xs font-bold text-[#111c2d]">Sync to Google Tasks</label>
                       <button type="button" onClick={() => setIsSyncedToTasks(!isSyncedToTasks)} className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToTasks ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}>
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToTasks ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                </div>
               )}

              {/* Action Button */}
              <button disabled={loading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all flex items-center justify-center">
                {loading ? <RefreshCw className="animate-spin" /> : "COMMIT ENTRY"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
