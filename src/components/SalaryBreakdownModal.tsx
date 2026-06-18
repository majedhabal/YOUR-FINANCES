import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Calendar, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Check,
  Coins
} from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';

const migrateEnvelopesList = (list: string[]): string[] => {
  return list.map(key => {
    if (key === 'rent') return 'housing__rent';
    if (key === 'savings') return 'investments__savings';
    if (key === 'loans') return 'financial_expenses__loan';
    if (key === 'groceries') return 'food_&_drinks__groceries';
    if (key === 'shopping') return 'shopping__clothes';
    if (key === 'transportation') return 'vehicle__fuel'; 
    if (key === 'others') return 'financial_expenses__fees'; 
    return key;
  });
};

const migrateAllocations = (alloc: Record<string, number>): Record<string, number> => {
  const next: Record<string, number> = {};
  Object.keys(alloc).forEach(key => {
    let newKey = key;
    if (key === 'rent') newKey = 'housing__rent';
    else if (key === 'savings') newKey = 'investments__savings';
    else if (key === 'loans') newKey = 'financial_expenses__loan';
    else if (key === 'groceries') newKey = 'food_&_drinks__groceries';
    else if (key === 'shopping') newKey = 'shopping__clothes';
    else if (key === 'transportation') newKey = 'vehicle__fuel';
    else if (key === 'others') newKey = 'financial_expenses__fees';
    next[newKey] = alloc[key];
  });
  return next;
};

interface SalaryBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  budgets: any[];
  onSuccess: () => void;
}

interface CustomAuxiliaryIncome {
  id: string;
  title: string;
  amount: number;
  isOneTime?: boolean;
}

export const SalaryBreakdownModal: React.FC<SalaryBreakdownModalProps> = ({
  isOpen,
  onClose,
  profile,
  budgets,
  onSuccess
}) => {
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  // Base onboarding parameters
  const [baseSalaryInput, setBaseSalaryInput] = useState<number>(5000);
  const [payday, setPayday] = useState<number>(28);
  const [selectedIncomes, setSelectedIncomes] = useState<string[]>([]);
  const [customAuxiliaries, setCustomAuxiliaries] = useState<CustomAuxiliaryIncome[]>([]);
  const [auxTitle, setAuxTitle] = useState('');
  const [auxAmount, setAuxAmount] = useState<number | ''>('');

  // Sourced active recurring incomes from Firestore
  const [dbRecurringIncomes, setDbRecurringIncomes] = useState<any[]>([]);

  // Track active visual budget envelope keys chosen by user
  const [activeEnvelopes, setActiveEnvelopes] = useState<string[]>([
    'housing__rent', 'investments__savings', 'financial_expenses__loan', 'food_&_drinks__groceries', 'shopping__clothes', 'vehicle__fuel', 'financial_expenses__fees'
  ]);

  // Track allocation inputs
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const [isIncomeListExpanded, setIsIncomeListExpanded] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Live states for inline schedule generator forms
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [dbAccounts, setDbAccounts] = useState<any[]>([]);
  const [newIncomeNotes, setNewIncomeNotes] = useState('Monthly Payroll');
  const [newIncomeAmount, setNewIncomeAmount] = useState<number | ''>(5000);
  const [newIncomeAccountId, setNewIncomeAccountId] = useState('');
  const [newIncomeRecurrency, setNewIncomeRecurrency] = useState('monthly');
  const [newIncomePayday, setNewIncomePayday] = useState(28);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [showClassificationPrompt, setShowClassificationPrompt] = useState(false);

  // Load user's recurring transactions where type is income to feed dynamic multi-income selection
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((item: any) => item.type === 'income' && item.isActive !== false);
      setDbRecurringIncomes(items);
    }, (err) => {
      console.warn("Failed to listen to recurring incomes for salary sourcing:", err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Load accounts for target deposit pairing
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = collection(db, `users/${profile.uid}/accounts`);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDbAccounts(items);
      if (items.length > 0 && !newIncomeAccountId) {
        setNewIncomeAccountId(items[0].id);
      }
    }, (err) => {
      console.error("Failed to fetch accounts context for recurring scheduling:", err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Automatic coupling of linked recurring incomes to checked selection
  useEffect(() => {
    if (dbRecurringIncomes.length > 0 && isOpen) {
      const hasAnySelected = selectedIncomes.some(id => 
        dbRecurringIncomes.some(inc => inc.id === id) || 
        customAuxiliaries.some(aux => aux.id === id)
      );
      if (!hasAnySelected) {
        setSelectedIncomes(dbRecurringIncomes.map(inc => inc.id));
      }
    }
  }, [dbRecurringIncomes, isOpen]);

  // Load saved blueprint arrangements for selected Year/Month or default settings
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const fetchBlueprintAndProfile = async () => {
      setIsLoading(true);
      try {
        // Fetch baseline payday and base salary from recurringTransactions exclusively
        const qRecIncomes = query(
          collection(db, `users/${profile.uid}/recurringTransactions`),
          where('type', '==', 'income')
        );
        const recSnap = await getDocs(qRecIncomes);
        const recItems = recSnap.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .filter(item => item.isActive !== false);

        let defaultSal = recItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        let defaultPayday = 28;
        const salaryItem = recItems.find((item: any) => item.category === 'Salary' && item.dayOption) || recItems.find((item: any) => item.dayOption);
        if (salaryItem) {
          defaultPayday = Number(salaryItem.dayOption);
        }

        // Fetch selected month's configurations
        const monthRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`);
        const monthSnap = await getDoc(monthRef);

        if (monthSnap.exists()) {
          const mData = monthSnap.data();
          setBaseSalaryInput(Number(mData.baseSalaryInput ?? defaultSal));
          setPayday(Number(mData.payday || defaultPayday));
          
          if (mData.selectedIncomes) {
            setSelectedIncomes(mData.selectedIncomes);
          } else {
            setSelectedIncomes([]);
          }

          if (mData.activeEnvelopes) {
            setActiveEnvelopes(migrateEnvelopesList(mData.activeEnvelopes));
          } else {
            setActiveEnvelopes(['housing__rent', 'investments__savings', 'financial_expenses__loan', 'food_&_drinks__groceries', 'shopping__clothes', 'vehicle__fuel', 'financial_expenses__fees']);
          }

          if (mData.customAuxiliaries) {
            setCustomAuxiliaries(mData.customAuxiliaries);
          } else {
            setCustomAuxiliaries([]);
          }

          setAllocations(migrateAllocations(mData.allocations || {}));
        } else {
          // Fallback or clone from previous month
          setBaseSalaryInput(defaultSal);
          setPayday(defaultPayday);
          setSelectedIncomes([]);
          setCustomAuxiliaries([]);
          setActiveEnvelopes(['housing__rent', 'investments__savings', 'financial_expenses__loan', 'food_&_drinks__groceries', 'shopping__clothes', 'vehicle__fuel', 'financial_expenses__fees']);

          // Fetch previous month's configurations context to clone active budget states
          const [yr, mo] = selectedYearMonth.split('-').map(Number);
          const prevDate = new Date(yr, mo - 2, 1);
          const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
          
          const prevRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${prevStr}`);
          const prevSnap = await getDoc(prevRef);
          
          if (prevSnap.exists()) {
            const pData = prevSnap.data();
            if (pData.activeEnvelopes) setActiveEnvelopes(migrateEnvelopesList(pData.activeEnvelopes));
            if (pData.allocations) setAllocations(migrateAllocations(pData.allocations));
            if (pData.selectedIncomes) setSelectedIncomes(pData.selectedIncomes);
            if (pData.customAuxiliaries) setCustomAuxiliaries(pData.customAuxiliaries);
          } else {
            // Set clean basic allocation state
            setAllocations({
              'housing__rent': 0,
              'investments__savings': 0,
              'financial_expenses__loan': 0,
              'food_&_drinks__groceries': 0,
              'shopping__clothes': 0,
              'vehicle__fuel': 0,
              'financial_expenses__fees': 0
            });
          }
        }
      } catch (err) {
        console.error("Failed to load blueprint details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlueprintAndProfile();
  }, [profile?.uid, selectedYearMonth, isOpen]);

  const activeBaseCurrency = profile?.baseCurrency || profile?.currency || 'AED';

  // Dynamic selector days count depending on calendar month & year context
  const maxSelectableDays = useMemo(() => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    // standard javascript formula: day index 0 of next month maps to last day of active month
    return new Date(year, month, 0).getDate();
  }, [selectedYearMonth]);

  // Adjust current selected payday in case it is larger than max selectable day of shortened month
  useEffect(() => {
    if (payday > maxSelectableDays) {
      setPayday(maxSelectableDays);
    }
  }, [maxSelectableDays, payday]);

  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const toggleCategoryExpanded = (categoryName: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Listen to user categories
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;
    const qStr = `users/${profile.uid}/custom_categories`;
    const unsub = onSnapshot(collection(db, qStr), async (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        try {
          const { fetchGlobalPresets } = await import('../lib/categoryUtils');
          const presets = await fetchGlobalPresets();
          list = presets.map((p, idx) => ({ id: `preset_${idx}`, ...p }));
        } catch (err) {
          list = MASTER_CATEGORIES.map((p, idx) => ({ id: `local_${idx}`, ...p }));
        }
      }
      setUserCategories(list);
    }, (err) => {
      console.warn("Failed to listen to user categories:", err);
    });
    return () => unsub();
  }, [profile?.uid, isOpen]);

  const uniqueDbAccounts = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    dbAccounts.forEach((acc: any) => {
      if (acc && acc.id && !seen.has(acc.id)) {
        seen.add(acc.id);
        list.push(acc);
      }
    });
    return list;
  }, [dbAccounts]);

  const sourceCategories = useMemo(() => {
    const raw = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;
    const uniqueCats: any[] = [];
    const seenNames = new Set<string>();
    raw.forEach((cat: any) => {
      if (cat && cat.name) {
        const normalized = cat.name.trim().toLowerCase();
        if (!seenNames.has(normalized)) {
          seenNames.add(normalized);
          uniqueCats.push(cat);
        }
      }
    });
    return uniqueCats;
  }, [userCategories]);

  // Master catalog of all available nested envelopes (Category > Sub-Category)
  const allAvailableEnvelopesCatalog = useMemo(() => {
    const list: any[] = [];
    
    // Add target dynamic transfer options from accounts
    uniqueDbAccounts.forEach((acc: any) => {
      // Avoid archived accounts
      if (acc.isArchived) return;
      list.push({
        key: `transfer__${acc.id}`,
        label: `Fund Transfer ➔ ${acc.name}`,
        category: 'ACCOUNT FUND TRANSFERS',
        subcategory: acc.name,
        emoji: '🔄',
        nature: 'Want',
        accountId: acc.id
      });
    });

    sourceCategories.forEach((cat: any) => {
      if (!cat || !cat.name) return;
      const subs = Array.from(new Set(cat.subcategories || []));
      const parentName = cat.name === 'Food & Drinks' ? 'Food & Drink' : cat.name;
      
      if (subs.length > 0) {
        subs.forEach((sub: string) => {
          const key = `${cat.name}__${sub}`.replace(/\s+/g, '_').toLowerCase();
          list.push({
            key,
            label: `${parentName} > ${sub}`,
            category: parentName,
            subcategory: sub,
            emoji: cat.emoji || '📁',
            nature: cat.nature || 'Want'
          });
        });
      } else {
        const key = `${cat.name}__general`.replace(/\s+/g, '_').toLowerCase();
        list.push({
          key,
          label: `${parentName} > General`,
          category: parentName,
          subcategory: 'General',
          emoji: cat.emoji || '📁',
          nature: cat.nature || 'Want'
        });
      }
    });

    const uniqueList: any[] = [];
    const seenKeys = new Set<string>();
    list.forEach(item => {
      if (!seenKeys.has(item.key)) {
        seenKeys.add(item.key);
        uniqueList.push(item);
      }
    });

    return uniqueList;
  }, [sourceCategories, uniqueDbAccounts]);

  const verifiedSalaryLedger = useMemo(() => {
    return dbRecurringIncomes.find(item => item.category === 'Salary' && Number(item.amount) > 0 && item.dayOption);
  }, [dbRecurringIncomes]);

  // Calculations: Calculate total aggregated budget drop by summing all checked multi-income sources
  const calculatedIncomeDrop = useMemo(() => {
    let sum = 0;
    dbRecurringIncomes.forEach(item => {
      if (selectedIncomes.includes(item.id)) {
        sum += Number(item.amount || 0);
      }
    });
    customAuxiliaries.forEach(item => {
      if (selectedIncomes.includes(item.id)) {
        sum += Number(item.amount || 0);
      }
    });
    return sum;
  }, [selectedIncomes, dbRecurringIncomes, customAuxiliaries]);

  // Calculations: Allocated envelopes sum
  const sumAllocated = useMemo(() => {
    let sum = 0;
    activeEnvelopes.forEach(key => {
      sum += Number(allocations[key] || 0);
    });
    return sum;
  }, [allocations, activeEnvelopes]);

  const unallocatedBalance = calculatedIncomeDrop - sumAllocated;
  const isPerfectAllocation = Math.abs(unallocatedBalance) < 0.01;

  const getSourceAccountId = () => {
    const activeDbRec = dbRecurringIncomes.find(inc => selectedIncomes.includes(inc.id));
    if (activeDbRec && activeDbRec.accountId) {
      return activeDbRec.accountId;
    }
    return dbAccounts[0]?.id || '';
  };

  const isFuturePeriod = useMemo(() => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const targetPeriodStartDate = new Date(year, month - 1, payday);
    const now = new Date();
    return now < targetPeriodStartDate;
  }, [selectedYearMonth, payday]);

  // Horizontal Navigation controls
  const handlePreviousMonth = () => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYearMonth(prevStr);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYearMonth(nextStr);
  };

  const getFriendlyMonthName = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  };

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });
    return `${monthName} Salary Breakdown`;
  };

  const getOperationalDateSpanText = (yrMo: string, paydayVal: number) => {
    const [year, month] = yrMo.split('-').map(Number);
    const startDate = new Date(year, month - 1, paydayVal);
    const endDate = new Date(year, month, paydayVal - 1);
    
    const getOrdinalSuffix = (num: number) => {
      if (num > 3 && num < 21) return 'th';
      switch (num % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };

    const startMonthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    const endMonthName = endDate.toLocaleDateString('en-US', { month: 'long' });

    return `From ${paydayVal}${getOrdinalSuffix(paydayVal)} of ${startMonthName} until ${endDate.getDate()}${getOrdinalSuffix(endDate.getDate())} of ${endMonthName}`;
  };

  const handleAllocationChange = (key: string, value: string) => {
    const numericValue = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setAllocations(prev => ({
      ...prev,
      [key]: numericValue
    }));
  };

  const toggleIncomeSelection = async (id: string) => {
    const isAdding = !selectedIncomes.includes(id);
    setSelectedIncomes(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    if (isAdding && profile?.uid) {
      const matchedInc = dbRecurringIncomes.find(x => x.id === id);
      if (matchedInc) {
        try {
          const incRef = doc(db, `users/${profile.uid}/recurringTransactions`, id);
          const yearMonthParts = selectedYearMonth.split('-');
          const year = parseInt(yearMonthParts[0]);
          const month = parseInt(yearMonthParts[1]);
          const nextDateStr = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;

          await setDoc(incRef, {
            dayOption: String(payday),
            nextGenerationDate: nextDateStr,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Failed to automatically align schedule date on selection:", err);
        }
      }
    }
  };

  const handleOpenClassificationPrompt = () => {
    if (!auxTitle.trim() || !auxAmount) return;
    setShowClassificationPrompt(true);
  };

  const handleSelectOneTime = () => {
    if (!auxTitle.trim() || !auxAmount) return;
    const newItem: CustomAuxiliaryIncome = {
      id: `aux_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: auxTitle.trim(),
      amount: Number(auxAmount),
      isOneTime: true
    };
    setCustomAuxiliaries(prev => [...prev, newItem]);
    setSelectedIncomes(prev => [...prev, newItem.id]);
    setAuxTitle('');
    setAuxAmount('');
    setShowClassificationPrompt(false);
  };

  const handleSelectRecurring = async () => {
    if (!profile?.uid || !auxTitle.trim() || !auxAmount) return;
    try {
      const recRef = doc(collection(db, `users/${profile.uid}/recurringTransactions`));
      
      const targetDay = payday;
      const yearMonthParts = selectedYearMonth.split('-');
      const year = parseInt(yearMonthParts[0]);
      const month = parseInt(yearMonthParts[1]);
      const nextDateStr = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;
      const lastDateStr = new Date().toISOString().split('T')[0];

      const docId = recRef.id;
      const exactPayload = {
        // Legacy compatibility
        id: docId,
        type: 'income',
        amount: Number(auxAmount),
        notes: auxTitle.trim(),
        recurrency: 'monthly',
        interval: 1,
        category: 'Salary',
        subcategory: 'Wages',
        accountId: dbAccounts[0]?.id || '',
        isActive: true,
        notification: true,
        lastGeneratedDate: lastDateStr,
        nextGenerationDate: nextDateStr,

        // Exact new payload
        recurringId: docId,
        userId: profile.uid,
        title: auxTitle.trim(),
        transactionType: 'income',
        frequency: 'Monthly',
        sourceAccountId: dbAccounts[0]?.id || '',
        destinationAccountId: null,
        startDate: lastDateStr,
        nextExecutionDate: nextDateStr,
        dayOption: Number(targetDay) || 28,
        isBreakdownConfigured: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(recRef, exactPayload);

      setSelectedIncomes(prev => [...prev, docId]);
      setAuxTitle('');
      setAuxAmount('');
      setShowClassificationPrompt(false);
    } catch (err) {
      console.error("Failed to write recurring transaction schedule rule:", err);
    }
  };

  const removeCustomIncomeStream = (id: string) => {
    setCustomAuxiliaries(prev => prev.filter(x => x.id !== id));
    setSelectedIncomes(prev => prev.filter(x => x !== id));
  };

  const handleSaveRecurringSchedule = async () => {
    if (!profile?.uid || !newIncomeAmount) return;
    setIsSavingSchedule(true);
    try {
      const recRef = doc(collection(db, `users/${profile.uid}/recurringTransactions`));
      
      const originalDate = new Date();
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      const lastDateStr = originalDate.toISOString().split('T')[0];

      const docId = recRef.id;
      const targetDay = nextDate.getDate();
      const freq = newIncomeRecurrency ? (newIncomeRecurrency.charAt(0).toUpperCase() + newIncomeRecurrency.slice(1)) : 'Monthly';

      const exactPayload = {
        // Legacy compatibility
        id: docId,
        type: 'income',
        amount: Number(newIncomeAmount),
        notes: newIncomeNotes.trim() || 'Monthly Payroll',
        recurrency: newIncomeRecurrency,
        interval: 1,
        category: 'Salary',
        subcategory: 'Wages',
        accountId: newIncomeAccountId || (dbAccounts[0]?.id || ''),
        isActive: true,
        notification: true,
        lastGeneratedDate: lastDateStr,
        nextGenerationDate: nextDateStr,

        // Exact new payload
        recurringId: docId,
        userId: profile.uid,
        title: newIncomeNotes.trim() || 'Monthly Payroll',
        transactionType: 'income',
        frequency: freq,
        sourceAccountId: newIncomeAccountId || (dbAccounts[0]?.id || ''),
        destinationAccountId: null,
        startDate: lastDateStr,
        nextExecutionDate: nextDateStr,
        dayOption: targetDay,
        isBreakdownConfigured: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(recRef, exactPayload);

      setSelectedIncomes(prev => [...prev, docId]);
      setIsCreatingSchedule(false);
    } catch (err) {
      console.error("Failed to save recurring income stream:", err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const [showMismatchWarning, setShowMismatchWarning] = useState(false);
  const [mismatchTargetDay, setMismatchTargetDay] = useState<number | null>(null);

  const commitAllocation = async (targetPayday: number) => {
    if (!profile?.uid) return;
    setIsLoading(true);
    setSaveStatus('idle');

    try {
      const batch = writeBatch(db);

      // Save user profile settings to keep synced
      const userRef = doc(db, `users/${profile.uid}`);
      batch.set(userRef, {
        baseSalary: baseSalaryInput,
        payday: targetPayday,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Save active month target variables inside the blueprint matching month
      const blueprintRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`);
      const selectedDbRecurring = dbRecurringIncomes.filter(inc => selectedIncomes.includes(inc.id));
      
      batch.set(blueprintRef, {
        baseSalary: calculatedIncomeDrop,
        baseSalaryInput,
        payday: targetPayday,
        allocations,
        selectedIncomes,
        activeEnvelopes,
        customAuxiliaries,
        selectedDbRecurringIncomes: selectedDbRecurring,
        allAvailableEnvelopesCatalog,
        isConfirmed: false, // Lives as pending/upcoming
        isBreakdownConfigured: true, // Configured flag to clear alert prompts
        confirmedAllocations: {}, // To track independent line confirms
        tier1Approved: false, // Baseline approval step
        yearMonth: selectedYearMonth,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Clean up any old pending transactions for this payroll period to avoid duplication
      const existingTxsQuery = query(
        collection(db, `users/${profile.uid}/transactions`),
        where('salaryBreakdownPeriod', '==', selectedYearMonth)
      );
      const existingTxsSnap = await getDocs(existingTxsQuery);
      existingTxsSnap.docs.forEach(docSnap => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, docSnap.id));
      });

      // Synchronize exact total value directly to selected recurring income documents inside the batch, and flag isBreakdownConfigured
      selectedDbRecurring.forEach(inc => {
        const ref = doc(db, `users/${profile.uid}/recurringTransactions`, inc.id);
        batch.update(ref, {
          isBreakdownConfigured: true,
          amount: Number(baseSalaryInput),
          updatedAt: serverTimestamp()
        });
      });

      // Commit the atomic batch
      await batch.commit();

      setSaveStatus('success');
      onSuccess();
      setTimeout(() => {
        onClose();
        setSaveStatus('idle');
      }, 1500);

    } catch (err) {
      console.error("Failed to commit breakdown parameters:", err);
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAllocation = async () => {
    const selectedDbRecurring = dbRecurringIncomes.filter(inc => selectedIncomes.includes(inc.id));
    const mismatchItem = selectedDbRecurring.find(inc => inc.dayOption && Number(inc.dayOption) !== Number(payday));

    if (mismatchItem) {
      setMismatchTargetDay(Number(mismatchItem.dayOption));
      setShowMismatchWarning(true);
      return;
    }

    await commitAllocation(payday);
  };

  const handleConfirmOverride = async () => {
    setShowMismatchWarning(false);
    if (mismatchTargetDay !== null) {
      setPayday(mismatchTargetDay);
      await commitAllocation(mismatchTargetDay);
    }
  };

  const toggleEnvelopeActiveState = (key: string) => {
    setActiveEnvelopes(prev => {
      const isSelected = prev.includes(key);
      if (isSelected) {
        // Toggle off
        return prev.filter(k => k !== key);
      } else {
        // Toggle on
        return [...prev, key];
      }
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="salary-breakdown-frame relative w-full max-w-[480px] bg-white border border-[#E1E8ED] rounded-[24px] shadow-2xl overflow-hidden flex flex-col h-[85vh] md:h-[780px] max-h-[90vh] select-none mx-auto"
          style={{}}
        >
          {/* Calendar Date Mismatch Guard Warning Modal */}
          <AnimatePresence>
            {showMismatchWarning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#000000]/95 backdrop-blur-md z-[400] flex flex-col items-center justify-center p-6 text-center animate-fade-in"
              >
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center text-amber-400 mb-4">
                  <AlertCircle size={22} />
                </div>
                
                <h3 className="text-white text-sm font-normal tracking-tight mb-2 leading-relaxed" style={{ fontWeight: 400 }}>
                  Payday Synchronization Mismatch
                </h3>
                
                <p className="text-neutral-400 text-xs leading-relaxed max-w-[280px] mb-6" style={{ fontWeight: 400 }}>
                  The chosen transaction timeline does not coordinate with your core payroll anchor parameters. Do you wish to override and adjust your system cycle?
                </p>

                <div className="flex flex-col gap-2 w-full max-w-[260px]">
                  <button
                    type="button"
                    onClick={handleConfirmOverride}
                    className="w-full py-2.5 bg-[#A6DDB1] text-[#1E293B] rounded-xl text-xs transition-all cursor-pointer hover:brightness-105 active:scale-95"
                    style={{ fontWeight: 700 }}
                  >
                    Confirm override and adjust
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMismatchWarning(false)}
                    className="w-full py-2.5 border border-white/10 hover:bg-white/5 text-neutral-300 rounded-xl text-xs transition-all cursor-pointer font-normal"
                    style={{ fontWeight: 400 }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <style>{`
            .salary-breakdown-frame,
            .salary-breakdown-frame * {
              font-family: 'Google Sans', sans-serif !important;
              color: #1E2229 !important;
              text-transform: none !important;
              letter-spacing: normal !important;
            }
            #breakdown-main-title {
              font-size: clamp(1.15rem, 2.6vw, 1.4rem) !important;
              font-weight: 600 !important;
            }
            .breakdown-primary-text {
              font-size: clamp(1rem, 2.2vw, 1.2rem) !important;
              font-weight: 500 !important;
            }
            .breakdown-secondary-text {
              font-size: clamp(0.8rem, 1.8vw, 0.95rem) !important;
              font-weight: 400 !important;
            }
          `}</style>

          {/* Premium white canvas loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-3 text-center animate-fade-in" style={{ padding: '12px' }}>
              <div className="w-10 h-10 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-neutral-800 text-sm premium-loader-heading mb-1 block">
                Confirming allocations...
              </span>
              <p className="text-xs text-neutral-500 premium-loader-subtext leading-relaxed max-w-[280px]">
                updating ledger balances and establishing planned envelopes
              </p>
            </div>
          )}

          {/* Header */}
          <div className="p-3 flex items-center justify-between border-b border-[#E1E8ED]/40 bg-transparent shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#A6DDB1]/10 flex items-center justify-center border border-[#A6DDB1]/20">
                <Calendar size={16} className="text-[#0E9F6E]" />
              </div>
              <div className="flex flex-col">
                <h2 className="breakdown-header-title text-[#1E2229] leading-tight" style={{ fontSize: '30px' }}>Salary Breakdown Structure</h2>
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#57606F] hover:text-[#1E2229] transition-colors cursor-pointer rounded-lg hover:bg-[#F3F5F7]/50"
            >
              <X size={18} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            {isCreatingSchedule ? (
              <motion.div
                key="create-schedule-pane"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 overflow-y-auto p-4 flex flex-col justify-between bg-transparent space-y-4"
              >
                <div className="space-y-4">
                  {/* Header inside creator */}
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#A6DDB1]/15 flex items-center justify-center border border-[#A6DDB1]/35">
                      <Coins size={14} className="text-[#A6DDB1]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="breakdown-secondary-text text-[#1E2229]">
                        CREATE RECURRING INCOME STREAM
                      </span>
                      <span className="breakdown-secondary-text text-[#57606F]">
                        Establish a dynamic incoming source
                      </span>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">Income Source Name</label>
                      <input 
                        type="text"
                        value={newIncomeNotes}
                        onChange={(e) => setNewIncomeNotes(e.target.value)}
                        placeholder="e.g., Monthly Payroll, Advisory Retainer"
                        className="w-full bg-[#ffffff] border border-[rgba(255,255,255,0.45)] text-[#1E2229] p-3 rounded-[20px] outline-none breakdown-secondary-text shadow-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">Amount ({activeBaseCurrency})</label>
                      <input 
                        type="number"
                        min="0"
                        value={newIncomeAmount}
                        onChange={(e) => setNewIncomeAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="e.g., 12000"
                        className="w-[90px] bg-[#ffffff] border border-[rgba(255,255,255,0.45)] text-[#1E2229] p-3 rounded-[20px] outline-none breakdown-secondary-text shadow-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">Destination Account</label>
                      <select
                        value={newIncomeAccountId}
                        onChange={(e) => setNewIncomeAccountId(e.target.value)}
                        className="w-full bg-[rgba(255,255,255,0.35)] backdrop-blur-[10px] border border-[rgba(255,255,255,0.45)] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer shadow-sm appearance-none"
                      >
                        <option value="" disabled>Select Target Account...</option>
                        {uniqueDbAccounts.map((acc, index) => (
                          <option key={`account-option-${acc.id}-${index}`} value={acc.id} className="bg-white text-[#1E2229]">
                            {acc.name} ({acc.currency})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">Recurrency Frequency</label>
                      <select
                        value={newIncomeRecurrency}
                        onChange={(e) => setNewIncomeRecurrency(e.target.value)}
                        className="w-full bg-[rgba(255,255,255,0.35)] backdrop-blur-[10px] border border-[rgba(255,255,255,0.45)] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer shadow-sm appearance-none"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">Payroll Day</label>
                      <select
                        value={newIncomePayday}
                        onChange={(e) => setNewIncomePayday(Number(e.target.value))}
                        className="w-full bg-[rgba(255,255,255,0.35)] backdrop-blur-[10px] border border-[rgba(255,255,255,0.45)] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer shadow-sm appearance-none"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                          <option key={`create-day-${day}`} value={day} className="bg-white text-[#1E2229]">
                            Day {day}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Save Button Row */}
                <div className="pt-4 border-t border-white/5 flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSchedule(false)}
                    className="flex-1 py-2.5 bg-[rgba(255,255,255,0.4)] border border-[#E1E8ED] text-[#1E2229] breakdown-secondary-text rounded-[10px] hover:bg-[rgba(255,255,255,0.6)] transition-all cursor-pointer font-normal text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSchedule || !newIncomeAmount}
                    onClick={handleSaveRecurringSchedule}
                    style={{ 
                      backgroundColor: newIncomeAmount ? '#A6DDB1' : 'rgba(255,255,255,0.02)',
                      color: newIncomeAmount ? '#1E293B' : 'rgba(255,255,255,0.2)' 
                    }}
                    className={`flex-1 py-2.5 breakdown-secondary-text rounded-xl transition-all font-normal text-center flex items-center justify-center gap-1.5 ${
                      newIncomeAmount ? 'hover:brightness-95 active:scale-95 cursor-pointer shadow-md' : 'cursor-not-allowed border border-white/5'
                    }`}
                  >
                    {isSavingSchedule ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span>Save & Link Stream</span>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="main-allocation-pane"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-hidden flex flex-col h-full bg-transparent"
              >
                <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide flex flex-col">
                  
                  {/* Timeline Horizontal Month Carousel Selector */}
                  <div className="bg-[rgba(255,255,255,0.45)] backdrop-blur-[10px] border border-[#E1E8ED]/60 rounded-[16px] p-2 shadow-sm flex flex-col gap-1 items-center justify-center shrink-0">
                    <div className="flex items-center justify-between w-full">
                      <button
                        type="button"
                        onClick={handlePreviousMonth}
                        className="flex items-center gap-1.5 px-2 py-1 bg-[#F3F5F7] hover:bg-[#E1E8ED] text-[#1E2229] rounded-[10px] breakdown-secondary-text transition-all cursor-pointer whitespace-nowrap border border-[#E1E8ED]"
                      >
                        <ChevronLeft size={11} className="shrink-0" />
                        <span className="font-normal" style={{ fontSize: '10px' }}>Previous</span>
                      </button>
                      
                      <div className="text-center select-none flex-1 px-1">
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }} 
                          className="breakdown-secondary-text text-[#1E2229] block"
                        >
                          {getSalaryBreakdownTitle(selectedYearMonth)}
                        </span>
                      </div>

                      <button 
                        type="button"
                        onClick={handleNextMonth}
                        className="flex items-center gap-1.5 px-2 py-1 bg-[#F3F5F7] hover:bg-[#E1E8ED] text-[#1E2229] rounded-[10px] breakdown-secondary-text transition-all cursor-pointer whitespace-nowrap border border-[#E1E8ED]"
                      >
                        <span className="font-normal" style={{ fontSize: '10px' }}>Next</span>
                        <ChevronRight size={11} className="shrink-0" />
                      </button>
                    </div>

                    <div className="text-center">
                      <span 
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '10px' }} 
                        className="breakdown-secondary-text text-[#0E9F6E] block leading-none"
                      >
                        {getOperationalDateSpanText(selectedYearMonth, payday)}
                      </span>
                    </div>
                  </div>

                  {/* Income Transactions and Payroll Settings Wrapper */}
                  <div className="space-y-2.5">
                    
                    {/* Dynamic Payroll Day of Month selection based on standard calendar counts */}
                    <div className="flex flex-col gap-2 bg-[rgba(255,255,255,0.45)] backdrop-blur-[10px] border border-[#E1E8ED]/60 p-5 rounded-[20px] shadow-sm">
                      <label className="breakdown-secondary-text text-[#1E2229]">Payroll Day of Month</label>
                      <div className="relative">
                        <select
                          value={payday}
                          onChange={(e) => setPayday(Number(e.target.value))}
                          className="w-full bg-[#F3F5F7]/70 border border-[#E1E8ED]/60 text-[#1E2229] p-3 pr-10 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer shadow-sm appearance-none font-normal"
                        >
                          <option value="" disabled>Select Payday (Based on Calendar Month)...</option>
                          {Array.from({ length: maxSelectableDays }, (_, i) => i + 1).map((day) => (
                            <option key={`main-day-${day}`} value={day} className="bg-white text-[#1E2229]">
                              Day {day} ({selectedYearMonth.split('-')[1]}/{day})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-500">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                    </div>

                    {/* SECTION HEADER: SELECT INCOME TRANSACTIONS */}
                    <div className="bg-white border border-[#E1E8ED]/60 rounded-[20px] shadow-sm p-4 space-y-3">
                      <div 
                        onClick={() => {
                          if (dbRecurringIncomes.length > 0) {
                            setIsIncomeListExpanded(!isIncomeListExpanded);
                          }
                        }}
                        className={`flex items-center justify-between group ${dbRecurringIncomes.length > 0 ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }} className="text-[clamp(0.85rem,1.8vw,0.95rem)] text-[#1E2229] opacity-70">SELECT INCOME TRANSACTIONS</span>
                        </div>
                        {/* No expand/collapse button */}
                      </div>

                      {/* DYNAMIC INCOME CHANNELS */}
                      <div className="pt-3 border-t border-[rgba(30,34,41,0.08)] space-y-2 flex flex-col w-full">
                        {dbRecurringIncomes.length === 0 && customAuxiliaries.length === 0 ? (
                          <div className="flex flex-col items-center text-center py-4">
                            <div className="w-10 h-10 rounded-full bg-[rgba(245,158,11,0.08)] flex items-center justify-center border border-[rgba(245,158,11,0.2)] text-[#B45309] mb-3">
                              <AlertCircle size={18} />
                            </div>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-sm text-[#1E2229] leading-relaxed max-w-[90%] opacity-70 mb-4">
                              No verified active salary protocol detected. Would you like to initialize a recurring paycheck archetype now?
                            </p>
                            <button
                              type="button"
                              onClick={() => setIsCreatingSchedule(true)}
                              style={{ backgroundColor: '#C1C1C1', color: '#000000', fontFamily: "'Google Sans', sans-serif", fontWeight: 600, fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)' }}
                              className="w-full py-4 rounded-[16px] hover:brightness-95 active:scale-95 transition-all cursor-pointer text-center shadow-sm"
                            >
                              <span style={{ color: '#000000' }}>Add salary source</span>
                            </button>
                            <button
                              type="button"
                              onClick={onClose}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}
                              className="w-full mt-2 py-2.5 rounded-lg border border-[#E1E8ED] text-[#57606F] hover:text-[#1E2229] hover:bg-[#F3F5F7] active:scale-95 transition-all cursor-pointer text-center"
                            >
                              Skip for now
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[200px] overflow-y-auto w-full">
                            {/* DB Recurring Incomes */}
                            {dbRecurringIncomes.map((inc, index) => (
                              <div 
                                key={`income-stream-${inc.id}-${index}`}
                                onClick={() => toggleIncomeSelection(inc.id)}
                                className={`h-[30px] rounded-[15px] border transition-all cursor-pointer flex items-center justify-between px-3 gap-2 ${
                                  selectedIncomes.includes(inc.id) ? 'bg-[#A6DDB1]/20 border-[#A6DDB1]' : 'bg-[rgba(255,255,255,0.4)] border-[#E1E8ED] hover:bg-[rgba(255,255,255,0.6)]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="checkbox"
                                    checked={selectedIncomes.includes(inc.id)}
                                    onChange={() => {}} // handled by parent onClick
                                    style={{ accentColor: '#0E9F6E' }}
                                    className="w-3.5 h-3.5 rounded-[4px] border-[rgba(0,0,0,0.15)] focus:ring-0 shrink-0 pointer-events-none"
                                  />
                                  <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[13px] text-slate-800 font-normal leading-none">
                                    {inc.emoji || '💰'} {inc.notes || inc.category || 'Recurring Income'}
                                  </span>
                                </div>
                                <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[13px] text-slate-800 font-normal leading-none shrink-0">
                                  +{activeBaseCurrency} {Number(inc.amount || 0).toLocaleString()}
                                </span>
                              </div>
                            ))}

                            {/* Custom ad-hoc additions */}
                            {customAuxiliaries.map((aux, index) => (
                              <div 
                                key={`auxiliary-${aux.id}-${index}`}
                                className="flex items-center justify-between gap-2 h-[30px]"
                              >
                                <div 
                                  onClick={() => toggleIncomeSelection(aux.id)}
                                  className={`flex-1 h-full rounded-[15px] border transition-all cursor-pointer flex items-center justify-between px-3 gap-2 ${
                                    selectedIncomes.includes(aux.id) ? 'bg-[#A6DDB1]/20 border-[#A6DDB1]' : 'bg-[rgba(255,255,255,0.4)] border-[#E1E8ED] hover:bg-[rgba(255,255,255,0.6)]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="checkbox"
                                      checked={selectedIncomes.includes(aux.id)}
                                      onChange={() => {}} // handled by parent onClick
                                      style={{ accentColor: '#0E9F6E' }}
                                      className="w-3.5 h-3.5 rounded-[4px] border-[rgba(0,0,0,0.15)] focus:ring-0 shrink-0 pointer-events-none"
                                    />
                                    <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[13px] text-slate-800 font-normal leading-none line-clamp-1">
                                      💰 {aux.title}
                                    </span>
                                  </div>
                                  <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[13px] text-slate-400 font-normal leading-none shrink-0">
                                    +{activeBaseCurrency} {Number(aux.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => removeCustomIncomeStream(aux.id)}
                                  className="w-[30px] h-[30px] rounded-[15px] hover:bg-red-50 hover:text-red-500 text-neutral-400 transition-colors cursor-pointer flex items-center justify-center shrink-0 border border-transparent hover:border-red-100"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}

                            {/* Add Custom Income Row */}
                            <div className="bg-[#ffffff] pl-0 pr-0 pt-[3px] pb-[3px] ml-[-1px] mr-0 w-[300px] border border-solid border-[#E1E8ED] rounded-[10px] flex flex-col gap-2">
                              <div className="flex items-center gap-2 w-[300px]">
                                <input 
                                  type="text"
                                  placeholder="Enter source name (e.g., Bonus, Wife's Income)..."
                                  value={auxTitle}
                                  onChange={(e) => setAuxTitle(e.target.value)}
                                  className="w-[160px] h-[34px] bg-white border border-[#ffffff] text-[clamp(11px,2.8vw,13px)] text-slate-800 placeholder-slate-400 rounded-[15px] pl-0 pr-0 pt-0 pb-0 font-normal outline-none focus:border-[#A6DDB1]"
                                />
                                <div className="relative flex items-center w-[80px] h-[34px] ml-0 mr-0">
                                  <span className="absolute left-1.5 text-[clamp(9px,2.5vw,11px)] text-neutral-500 font-normal">{activeBaseCurrency}</span>
                                  <input 
                                    type="number"
                                    placeholder="Amount"
                                    value={auxAmount}
                                    onChange={(e) => setAuxAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="w-[80px] h-full bg-white border border-[#ffffff] text-[clamp(11px,2.8vw,13px)] text-slate-800 text-right rounded-[15px] pr-[1px] pl-[1px] pt-0 pb-0 ml-0 mr-0 placeholder-slate-400 font-normal outline-none focus:border-[#A6DDB1]"
                                  />
                                </div>
                                <button 
                                  type="button"
                                  onClick={handleOpenClassificationPrompt}
                                  style={{ backgroundColor: '#A6DDB1', color: '#1E293B' }}
                                  className="w-[35px] h-[34px] pl-0 pr-0 rounded-[10px] hover:brightness-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0"
                                >
                                  <Plus size={12} className="shrink-0 pl-0" />
                                </button>
                              </div>
                            </div>

                            {/* Classification Decision Popup Dialog Overlay */}
                            <AnimatePresence>
                              {showClassificationPrompt && (
                                <div className="fixed inset-0 z-[400] bg-black/70 flex items-center justify-center p-4">
                                  <motion.div 
                                    initial={{ scale: 0.95, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.95, opacity: 0 }}
                                    className="bg-[#7a7a7a] border-0 rounded-[25px] p-5 w-full max-w-sm space-y-4 shadow-xl"
                                  >
                                    <div className="space-y-1">
                                      <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs uppercase tracking-wider text-white font-normal">
                                        Classify Inflow Type
                                      </h4>
                                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] text-neutral-400 font-normal">
                                        Decide if <span className="text-white">{auxTitle}</span> (+{activeBaseCurrency} {auxAmount}) is an isolated one-off or a repeating monthly source.
                                      </p>
                                    </div>

                                    <div className="space-y-2">
                                      {/* Choice 1: ONE-TIME CASH INFLOW */}
                                      <button
                                        type="button"
                                        onClick={handleSelectOneTime}
                                        className="w-full p-4 text-left bg-[#FFFFFF] border border-[#E1E8ED] hover:border-[#A6DDB1] rounded-2xl transition-all cursor-pointer flex flex-col gap-1 group shadow-sm"
                                      >
                                        <span className="text-[11px] font-bold tracking-wide text-[#0E9F6E] group-hover:brightness-110">
                                          ONE-TIME CASH INFLOW
                                        </span>
                                        <span className="text-[10px] text-[#57606F] font-normal leading-normal">
                                          Ideal for bonuses, commission, or seasonal side payouts.
                                        </span>
                                      </button>

                                      {/* Choice 2: RECURRING MONTHLY INCOME */}
                                      <button
                                        type="button"
                                        onClick={handleSelectRecurring}
                                        className="w-full p-4 text-left bg-[#FFFFFF] border border-[#E1E8ED] hover:border-[#A6DDB1] rounded-2xl transition-all cursor-pointer flex flex-col gap-1 group shadow-sm"
                                      >
                                        <span className="text-[11px] font-bold tracking-wide text-[#0E9F6E] group-hover:brightness-110">
                                          RECURRING MONTHLY INCOME
                                        </span>
                                        <span className="text-[10px] text-[#57606F] font-normal leading-normal">
                                          Ideal for shared house incomes or ongoing secondary wage streams.
                                        </span>
                                      </button>
                                    </div>

                                    <div className="pt-3 border-t border-[#F3F5F7] flex">
                                      <button
                                        type="button"
                                        onClick={() => setShowClassificationPrompt(false)}
                                        className="w-full py-2.5 bg-[#F3F5F7] text-[#57606F] hover:text-[#1E2229] rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all text-center select-none"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Envelope Categories List (Managed via custom wizard toggles) */}
                  <div className="flex flex-col gap-2 flex-1 min-h-[180px]">
                    
                    {/* Header with link button to manage active categories precisely */}
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[clamp(10px,2.5vw,12px)] text-neutral-400 font-normal">Budget Allocation</span>
                      <button
                        type="button"
                        onClick={() => setIsManageCategoriesOpen(true)}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="text-[#A6DDB1] hover:brightness-110 active:scale-95 text-[clamp(10px,2.5vw,11.5px)] pl-2 font-normal uppercase tracking-wider transition-all cursor-pointer bg-transparent border-none outline-none select-none"
                      >
                        Browse All Categories & Sub-Categories
                      </button>
                    </div>

                    {/* Inner lists wrapper */}
                    <div className="space-y-1.5 overflow-y-auto max-h-[220px] scrollbar-hide pr-1">
                      {allAvailableEnvelopesCatalog
                        .filter((cat) => activeEnvelopes.includes(cat.key))
                        .map((cat, index) => {
                          return (
                            <div 
                              key={`envelope-${cat.key}-${index}`}
                              className="h-[30px] bg-[rgba(255,255,255,0.4)] border border-[#E1E8ED] px-3 rounded-[15px] flex items-center justify-between gap-1.5 transition-all shrink-0 hover:bg-[rgba(255,255,255,0.6)]"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm shrink-0">{cat.emoji}</span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                  className="text-[13px] text-slate-800 font-normal leading-none truncate"
                                >
                                  {cat.label}
                                </span>
                                {isFuturePeriod && (
                                  <span 
                                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    className="text-[9px] text-[#0E9F6E] leading-none shrink-0 border border-[#A6DDB1]/40 px-1 py-0.5 rounded-[4px] bg-[#A6DDB1]/10"
                                  >
                                    Sch
                                  </span>
                                )}
                              </div>

                              <div className="relative flex items-center w-[100px] shrink-0 h-[22px]">
                                <span className="absolute left-2.5 text-[10px] text-zinc-400 font-normal uppercase leading-none pointer-events-none">{activeBaseCurrency}</span>
                                <input 
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  value={allocations[cat.key] || ''}
                                  onChange={(e) => handleAllocationChange(cat.key, e.target.value)}
                                  className="w-full h-full bg-[#ffffff] rounded-[11px] border border-[#E1E8ED] text-right focus:border-[#A6DDB1] pr-2.5 pl-9 text-xs text-[#1E2229] outline-none font-bold transition-all"
                                />
                              </div>
                            </div>
                          );
                      })}
                      
                      {activeEnvelopes.length === 0 && (
                        <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="p-8 text-center text-xs text-neutral-500 font-normal border border-dashed border-white/5 rounded-xl uppercase tracking-wider">
                          No active envelope categories selected.<br />Tap "Browse All Categories & Sub-Categories" to activate budget envelopes.
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Bottom Calculations Panel & Action Button (Fixed Footer) */}
                <div className="p-4 bg-[rgba(255,255,255,0.45)] backdrop-blur-[10px] border border-[#E1E8ED]/60 rounded-[24px] shadow-sm shrink-0 flex flex-col gap-3 mx-4 mb-4">
                  {/* Calculations Row Details */}
                  <div className="grid grid-cols-3 gap-2 py-1 text-center w-full">
                    <div className="flex flex-col gap-1">
                      <span className="breakdown-secondary-text text-[#1E2229]">Total Income</span>
                      <span className="breakdown-primary-text text-[#1E2229] font-bold">
                        {calculatedIncomeDrop.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="breakdown-secondary-text text-[#1E2229]">Total Expenses</span>
                      <span className="breakdown-primary-text text-[#1E2229] font-bold">
                        {sumAllocated.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="breakdown-secondary-text text-[#1E2229]">Remaining Income</span>
                      <span className={`breakdown-primary-text font-bold ${unallocatedBalance === 0 && calculatedIncomeDrop > 0 ? 'text-[#0E9F6E]' : unallocatedBalance < 0 ? 'text-[#D32F2F]' : 'text-[#D97706]'}`}>
                        {unallocatedBalance.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Display a visual success state only when the unallocated balance hits exactly 0 */}
                  {calculatedIncomeDrop === 0 ? (
                    <div className="p-3 rounded-[12px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] text-center text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#B45309] font-normal flex items-center justify-center gap-2 leading-relaxed w-full">
                      <HelpCircle size={14} className="shrink-0" />
                      <span>Please link/add an income stream to allocate balance</span>
                    </div>
                  ) : isPerfectAllocation ? (
                    <div 
                      className="p-3.5 rounded-[12px] text-center font-semibold flex items-center justify-center gap-2 shadow-sm select-none w-full"
                      style={{ backgroundColor: '#A6DDB1', color: '#1E2229', fontSize: '26px' }}
                    >
                      <CheckCircle size={16} className="shrink-0" />
                      <span>Balance perfectly allocated</span>
                    </div>
                  ) : unallocatedBalance < 0 ? (
                    <div className="p-3 rounded-[12px] bg-[rgba(211,47,47,0.08)] border border-[rgba(211,47,47,0.15)] text-center text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#D32F2F] font-normal flex items-center justify-center gap-2 leading-relaxed w-full">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>Allocation exceeds income by {Math.abs(unallocatedBalance).toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-[12px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.15)] text-center text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#B45309] font-normal flex items-center justify-center gap-2 leading-relaxed w-full">
                      <HelpCircle size={14} className="shrink-0" />
                      <span>Distribute remaining {unallocatedBalance.toLocaleString()} to reach 100%</span>
                    </div>
                  )}

                  {/* Confirm buttons */}
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2 sm:py-2.5 bg-[#F3F5F7] border border-[#E1E8ED] text-[#57606F] text-[clamp(10px,2.8vw,12px)] rounded-xl hover:bg-[#E1E8ED] transition-all cursor-pointer font-normal text-center h-[38px] md:h-[42px]"
                      style={{ textTransform: 'none', fontWeight: 400 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!isPerfectAllocation || isLoading || calculatedIncomeDrop === 0}
                      onClick={handleConfirmAllocation}
                      style={{ 
                        backgroundColor: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#A6DDB1' : '#F3F5F7',
                        color: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#1E2229' : '#57606F',
                        textTransform: 'none'
                      }}
                      className={`flex-1 py-1 px-2.5 text-[clamp(10px,2.8vw,12px)] rounded-xl transition-all font-bold text-center flex items-center justify-center gap-1.5 h-[38px] md:h-[42px] ${
                        (isPerfectAllocation && calculatedIncomeDrop > 0) ? 'hover:brightness-95 active:scale-95 cursor-pointer shadow-sm' : 'cursor-not-allowed border border-[#E1E8ED]'
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : saveStatus === 'success' ? (
                        <>
                          <CheckCircle size={11} className="shrink-0" />
                          <span>Applied / Refreshed!</span>
                        </>
                      ) : (
                        <span>Confirm allocation</span>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GRANULAR OVERLAY MATRIX: "Browse All Categories & Sub-Categories" Multi-select Drawer wizard */}
          <AnimatePresence>
            {isManageCategoriesOpen && (
              <motion.div 
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="absolute inset-x-0 bottom-0 top-0 md:top-[80px] md:mx-auto md:max-w-[480px] md:h-fit bg-[rgba(243,244,246,0.85)] backdrop-blur-[24px] border border-[#E1E8ED]/85 rounded-[24px] shadow-2xl z-50 flex flex-col overflow-hidden"
              >
                {/* Drawer header */}
                <div className="p-6 flex items-center justify-between shrink-0 border-b border-[rgba(30,34,41,0.04)]">
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }} className="text-[clamp(1.15rem,2.6vw,1.4rem)] text-[#1E2229]">
                      Browse All Categories
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsManageCategoriesOpen(false)}
                    style={{ backgroundColor: 'rgba(166, 221, 177, 0.4)', color: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                    className="px-6 py-2.5 text-[clamp(0.8rem,1.8vw,0.95rem)] rounded-[20px] hover:brightness-105 active:scale-95 transition-all cursor-pointer border border-[rgba(255,255,255,0.45)]"
                  >
                    Done
                  </button>
                </div>

                {/* Checklist options */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] leading-relaxed">
                    Expand categories below and check subcategories. Checking any item automatically appends it as an active high-density allocation budget envelope.
                  </p>

                  <div className="space-y-2">
                    {/* ACCOUNT FUND TRANSFERS Accordion Node */}
                    <div className="border border-[#E1E8ED] rounded-[24px] overflow-hidden bg-[#FFFFFF]">
                      {/* Parent Accordion Row */}
                      <div
                        onClick={() => toggleCategoryExpanded('ACCOUNT FUND TRANSFERS')}
                        className="p-4 flex items-center justify-between cursor-pointer transition-all select-none"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg shrink-0">🔄</span>
                          <span
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                            className="text-[clamp(1rem,2.2vw,1.2rem)] text-[#1E2229]"
                          >
                            Account Fund Transfers
                          </span>
                        </div>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] opacity-60"
                        >
                          {expandedCategories.includes('ACCOUNT FUND TRANSFERS') ? 'Collapse' : 'Expand'}
                        </span>
                      </div>

                      {/* Accordion Content: Accounts Multi-select */}
                      {expandedCategories.includes('ACCOUNT FUND TRANSFERS') && (
                        <div className="p-4 border-t border-[rgba(30,34,41,0.04)] space-y-2.5">
                          <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] leading-relaxed">
                            Select destination accounts for this transfer allocation:
                          </p>
                          
                          <div className="grid grid-cols-1 gap-1.5">
                            {uniqueDbAccounts.filter(acc => !acc.isArchived).map((acc: any, index: number) => {
                              const key = `transfer__${acc.id}`;
                              const isActive = activeEnvelopes.includes(key);

                              return (
                                <div
                                  key={`transfer-account-${acc.id}-${index}`}
                                  onClick={() => toggleEnvelopeActiveState(key)}
                                  style={{
                                    borderColor: isActive ? 'rgba(166,221,177,0.25)' : 'rgba(255,255,255,0.03)'
                                  }}
                                  className={`p-2 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                                    isActive ? 'bg-[#A6DDB1]/5 text-white' : 'bg-transparent text-neutral-400 hover:bg-neutral-900/40'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] font-normal leading-none">
                                    {acc.name} ({acc.institution || 'Direct'})
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: isActive ? '#A6DDB1' : 'transparent',
                                      borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.1)'
                                    }}
                                    className="w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0"
                                  >
                                    {isActive && (
                                      <Check size={8} className="text-[#1E293B] stroke-[3]" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {sourceCategories.map((cat: any, index: number) => {
                      const isExpanded = expandedCategories.includes(cat.name);
                      const subs = cat.subcategories || [];
                      const displayCatName = cat.name === 'Food & Drinks' ? 'Food & Drink' : cat.name;

                      return (
                        <div key={`category-row-${cat.key || cat.name || index}-${index}`} className="bg-[#FFFFFF] mb-[0.6rem] rounded-[24px] border border-[#E1E8ED] overflow-hidden">
                          {/* Parent Accordion Row */}
                          <div
                            onClick={() => toggleCategoryExpanded(cat.name)}
                            className="p-4 flex items-center justify-between cursor-pointer transition-all select-none"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg shrink-0">{cat.emoji || '📁'}</span>
                              <span
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                                className="text-[clamp(1rem,2.2vw,1.2rem)] text-[#1E2229]"
                              >
                                {displayCatName}
                              </span>
                            </div>
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] opacity-60"
                            >
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </span>
                          </div>

                          {/* Nested Subcategories List */}
                          {isExpanded && (
                            <div className="p-3 border-t border-[rgba(30,34,41,0.04)] space-y-1.5">
                              {subs.length === 0 ? (
                                <div
                                  onClick={() => {
                                    const key = `${cat.name}__general`.replace(/\s+/g, '_').toLowerCase();
                                    toggleEnvelopeActiveState(key);
                                  }}
                                  style={{
                                    borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? 'rgba(166,221,177,0.25)' : 'rgba(30,34,41,0.04)'
                                  }}
                                  className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                    activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? 'bg-[#A6DDB1]/20' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                    General
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : 'transparent',
                                      borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? 'transparent' : 'rgba(30, 34, 41, 0.1)'
                                    }}
                                    className="w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0"
                                  >
                                    {activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) && (
                                      <Check size={12} className="text-[#1E293B] stroke-[3]" />
                                    )}
                                  </div>
                                </div>
                              ) : (
                                subs.map((sub: string, subIndex: number) => {
                                  const key = `${cat.name}__${sub}`.replace(/\s+/g, '_').toLowerCase();
                                  const isActive = activeEnvelopes.includes(key);

                                  return (
                                    <div
                                      key={`subcategory-row-${key}-${subIndex}`}
                                      onClick={() => toggleEnvelopeActiveState(key)}
                                      style={{
                                        borderColor: isActive ? 'rgba(166,221,177,0.25)' : 'rgba(30,34,41,0.04)'
                                      }}
                                      className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                        isActive ? 'bg-[#A6DDB1]/20' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                      }`}
                                    >
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                        {sub}
                                      </span>

                                      <div
                                        style={{
                                          backgroundColor: isActive ? '#A6DDB1' : 'transparent',
                                          borderColor: isActive ? 'transparent' : 'rgba(30, 34, 41, 0.1)'
                                        }}
                                        className="w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0"
                                      >
                                        {isActive && (
                                          <Check size={12} className="text-[#1E293B] stroke-[3]" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                      </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer confirm inside check drawer */}
                <div className="p-3 bg-neutral-950 border-t border-neutral-900 flex justify-end shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsManageCategoriesOpen(false)}
                    style={{ backgroundColor: '#A6DDB1', color: '#1E293B', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-4 py-2 text-[10px] uppercase tracking-wider rounded-xl font-normal hover:brightness-105 active:scale-95 transition-all cursor-pointer text-center w-full"
                  >
                    Save Category Configuration (Active: {activeEnvelopes.length})
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
