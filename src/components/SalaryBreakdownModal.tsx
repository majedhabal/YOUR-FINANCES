import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatLabel } from '../lib/stringUtils';

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
  if (!alloc) return next;
  Object.keys(alloc).forEach(key => {
    let newKey = key;
    if (key === 'rent') newKey = 'housing__rent';
    else if (key === 'savings') newKey = 'investments__savings';
    else if (key === 'loans') newKey = 'financial_expenses__loan';
    else if (key === 'groceries') newKey = 'food_&_drinks__groceries';
    else if (key === 'shopping') newKey = 'shopping__clothes';
    else if (key === 'transportation') newKey = 'vehicle__fuel';
    else if (key === 'others') newKey = 'financial_expenses__fees';
    
    const val = alloc[key];
    next[newKey] = (typeof val === 'number' && !isNaN(val)) ? val : 0;
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

interface Transaction {
  id: string;
  amount: number;
  category: string;
  subCategory?: string;
  date: string;
  notes?: string;
  type: 'income' | 'expense' | 'transfer';
  accountId: string;
  isRecurring?: boolean;
}

export const SalaryBreakdownModal: React.FC<SalaryBreakdownModalProps> = ({
  isOpen,
  onClose,
  profile,
  budgets,
  onSuccess
}) => {
  const { t, i18n } = useTranslation();
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  // Base onboarding parameters
  const [payday, setPayday] = useState<number>(28);
  const [selectedIncomes, setSelectedIncomes] = useState<string[]>([]);
  const [customAuxiliaries, setCustomAuxiliaries] = useState<CustomAuxiliaryIncome[]>([]);
  const [auxTitle, setAuxTitle] = useState('');
  const [auxAmount, setAuxAmount] = useState<number | ''>('');

  // Sourced active recurring incomes from Firestore
  const [dbRecurringIncomes, setDbRecurringIncomes] = useState<any[]>([]);
  const [recentIncomeTransactions, setRecentIncomeTransactions] = useState<Transaction[]>([]);

  // Track active visual budget envelope keys chosen by user
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen } }));
  }, [isOpen]);

  const [activeEnvelopes, setActiveEnvelopes] = useState<string[]>([
    'housing__rent', 'investments__savings', 'financial_expenses__loan', 'food_&_drinks__groceries', 'shopping__clothes', 'vehicle__fuel', 'financial_expenses__fees'
  ]);

  // Track allocation inputs
  const [allocations, setAllocations] = useState<Record<string, number>>({});

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
  const [newIncomeType, setNewIncomeType] = useState<'recurring' | 'onetime'>('recurring');
  const [newIncomeRecurrency, setNewIncomeRecurrency] = useState('monthly');
  const [newIncomePayday, setNewIncomePayday] = useState(28);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [showClassificationPrompt, setShowClassificationPrompt] = useState(false);

  // Load user's recurring transactions where type or transactionType is income to feed dynamic multi-income selection
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((item: any) => {
          const isIncome = item.transactionType === 'income' || item.type === 'income' || item.title === 'Recurring Transaction';
          return isIncome && item.isActive !== false;
        });
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

  // Load recent confirmed income transactions to suggest for linking
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = query(
      collection(db, `users/${profile.uid}/transactions`),
      where('type', '==', 'income'),
      where('category', '==', 'Income')
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      // Sort by date desc
      const sorted = items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentIncomeTransactions(sorted.slice(0, 5));
    }, (err) => {
      console.warn("Failed to catch recent income transactions:", err);
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
        const qRecIncomes = collection(db, `users/${profile.uid}/recurringTransactions`);
        const recSnap = await getDocs(qRecIncomes);
        const recItems = recSnap.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .filter(item => {
            const isIncome = item.transactionType === 'income' || item.type === 'income' || item.title === 'Recurring Transaction';
            return isIncome && item.isActive !== false;
          });

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
    return date.toLocaleDateString(i18n.language || 'en-US', { month: 'long', year: 'numeric' });
  };

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });
    return `${monthName} ${t('salary_breakdown_modal.title', 'Salary Breakdown')}`;
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

    const startMonthName = startDate.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });
    const endMonthName = endDate.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });

    if (i18n.language && i18n.language !== 'en') {
      if (i18n.language === 'hi') {
        return `${startMonthName} के ${paydayVal} से ${endMonthName} के ${endDate.getDate()} तक`;
      }
      if (i18n.language === 'es') {
        return `Del ${paydayVal} de ${startMonthName} al ${endDate.getDate()} de ${endMonthName}`;
      }
      if (i18n.language === 'ru') {
        return `С ${paydayVal} ${startMonthName} по ${endDate.getDate()} ${endMonthName}`;
      }
      if (i18n.language === 'ar') {
        return `من ${paydayVal} ${startMonthName} إلى ${endDate.getDate()} ${endMonthName}`;
      }
      if (i18n.language === 'ko') {
        return `${startMonthName} ${paydayVal}일부터 ${endMonthName} ${endDate.getDate()}日まで`;
      }
      if (i18n.language === 'ur') {
        return `${paydayVal} ${startMonthName} سے ${endDate.getDate()} ${endMonthName} تک`;
      }
    }

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
      if (newIncomeType === 'onetime') {
        // Handle One-time Bonus / Income
        const newAux: CustomAuxiliaryIncome = {
          id: `aux-${Date.now()}`,
          title: newIncomeNotes.trim() || 'One-time Bonus',
          amount: Number(newIncomeAmount),
          isOneTime: true
        };
        setCustomAuxiliaries(prev => [...prev, newAux]);
        setSelectedIncomes(prev => [...prev, newAux.id]);
        setIsCreatingSchedule(false);
        setIsSavingSchedule(false);
        return;
      }

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
        baseSalary: calculatedIncomeDrop,
        payday: targetPayday,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Save active month target variables inside the blueprint matching month
      const blueprintRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`);
      const selectedDbRecurring = dbRecurringIncomes.filter(inc => selectedIncomes.includes(inc.id));
      
      batch.set(blueprintRef, {
        baseSalary: calculatedIncomeDrop,
        baseSalaryInput: calculatedIncomeDrop,
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
      // CRITICAL: Only overwrite the amount if there is EXACTLY one income source to avoid multi-income corruption.
      const totalIncomeSourcesCount = selectedDbRecurring.length + customAuxiliaries.length;
      selectedDbRecurring.forEach(inc => {
        const ref = doc(db, `users/${profile.uid}/recurringTransactions`, inc.id);
        batch.update(ref, {
          isBreakdownConfigured: true,
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

    // New logic: auto-create/update budget records in Firestore for the current month
    // based on the successfully committed allocations.
    try {
      if (profile?.uid) {
        const batch = writeBatch(db);
        
        // Loop through all active envelope allocations and create/update budget doc
        for (const [envelopeKey, amount] of Object.entries(allocations)) {
          if (Number(amount) > 0) {
            // Envelope keys are "category__subcategory".
            const [parent, leaf] = envelopeKey.includes('__') 
              ? envelopeKey.split('__') 
              : [envelopeKey, envelopeKey];
            
            // Use the full name for the categoryTitle.
            const name = envelopeKey.replace('__', ' > ');
            
            // Map nature to categoryGroup
            const envelopeInfo = allAvailableEnvelopesCatalog.find(e => e.key === envelopeKey);
            const nature = envelopeInfo?.nature || 'Want';
            const categoryGroup = nature.toLowerCase() === 'need' ? 'needs' : 
                                nature.toLowerCase() === 'saving' ? 'savings' : 'wants';

            // Use a deterministic ID to avoid duplicates for the same month/category
            const deterministicId = `${selectedYearMonth}_${envelopeKey.replace(/\s+/g, '_').toLowerCase()}`;
            const budRef = doc(db, `users/${profile.uid}/miniBudgets`, deterministicId);
            
            batch.set(budRef, {
              userId: profile.uid,
              categoryTitle: name,
              category: parent,
              subcategory: leaf,
              allocatedAmount: Number(amount),
              spentAmount: 0,
              currency: activeBaseCurrency,
              period: selectedYearMonth,
              categoryGroup: categoryGroup,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to auto-create budgets from allocation:", err);
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
      <div className="fixed inset-0 z-50 bg-[#d5d5d5] flex items-center justify-center p-4">
        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-[320px] max-w-[320px] max-h-[90vh] bg-white flex flex-col rounded-2xl overflow-hidden"
        >
          {/* Calendar Date Mismatch Guard Warning Modal */}
          <AnimatePresence>
            {showMismatchWarning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-6 text-center animate-fade-in"
              >
                <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center text-amber-500 mb-6">
                  <AlertCircle size={28} />
                </div>
                
                <h3 className="text-[#111C2D] text-[18px] font-bold mb-3 leading-tight" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  Payday Synchronization Mismatch
                </h3>
                
                <p className="text-[#57606F] text-[14px] leading-relaxed max-w-[260px] mb-8" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                  The chosen transaction timeline does not coordinate with your core payroll anchor parameters. Do you wish to override and adjust your system cycle?
                </p>

                <div className="flex flex-col gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleConfirmOverride}
                    className="w-full py-3.5 bg-[#A6DDB1] text-[#1E293B] rounded-[14px] text-[14px] transition-all cursor-pointer hover:brightness-105 active:scale-[0.98] font-bold shadow-sm"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    Confirm override and adjust
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMismatchWarning(false)}
                    className="w-full py-3.5 bg-white border border-[#E1E8ED] text-[#57606F] rounded-[14px] text-[14px] transition-all cursor-pointer hover:bg-neutral-50 font-normal"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Removed legacy style overrides */}

          {/* Premium white canvas loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-3 text-center animate-fade-in" style={{ padding: '12px' }}>
              <div className="w-10 h-10 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-neutral-800 text-sm premium-loader-heading mb-1 block">
                {t('salary_breakdown_modal.confirming_allocations', 'Confirming allocations...')}
              </span>
              <p className="text-xs text-neutral-500 premium-loader-subtext leading-relaxed max-w-[280px]">
                {t('salary_breakdown_modal.updating_ledger', 'updating ledger balances and establishing planned envelopes')}
              </p>
            </div>
          )}

           <div className="sticky top-0 z-20 bg-white border-b border-[#E1E8ED] w-full">
             <div className="flex items-center justify-between p-4 w-full">
               <h2 className="text-[#111C2D] text-lg font-bold leading-tight">
                 {t('salary_breakdown_modal.title', 'Salary Breakdown Structure')}
               </h2>
               <button type="button" onClick={onClose} className="p-2 hover:bg-neutral-50 rounded-full transition-colors">
                 <X size={20} className="text-[#111C2D]" />
               </button>
             </div>
             {/* Month Selector */}
             <div className="flex flex-col items-center pb-4 text-[#111C2D] w-full">
               <div className="flex items-center justify-between w-full px-4">
                 <button onClick={handlePreviousMonth} className="flex items-center gap-1 text-[#111C2D] group">
                   <div className="rounded-full bg-neutral-50 p-2 group-hover:bg-neutral-100 transition-colors">
                     <ChevronLeft size={16} />
                   </div>
                   <span className="text-sm font-medium">{t('salary_breakdown_modal.previous', 'Previous')}</span>
                 </button>
                 <h4 className="text-[#111C2D] font-bold text-base">{getFriendlyMonthName(selectedYearMonth)}</h4>
                 <button onClick={handleNextMonth} className="flex items-center gap-1 text-[#111C2D] group">
                   <span className="text-sm font-medium">{t('salary_breakdown_modal.next', 'Next')}</span>
                   <div className="rounded-full bg-neutral-50 p-2 group-hover:bg-neutral-100 transition-colors">
                     <ChevronRight size={16} />
                   </div>
                 </button>
               </div>
               <p className="text-[#57606F] text-xs font-medium mt-1">
                 {getOperationalDateSpanText(selectedYearMonth, payday)}
               </p>
             </div>
           </div>

          <AnimatePresence mode="wait">
            {isCreatingSchedule ? (
              <motion.div
                key="create-schedule-pane"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 overflow-y-auto p-4 flex flex-col justify-between bg-white space-y-4"
              >
                <div className="space-y-4">
                  {/* Header inside creator */}
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#A6DDB1] flex items-center justify-center border border-[#366945]">
                      <Coins size={14} className="text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="breakdown-secondary-text text-[#1E2229]">
                        {newIncomeType === 'recurring' 
                          ? t('salary_breakdown_modal.create_income_stream', 'Create recurring income stream')
                          : t('salary_breakdown_modal.create_onetime_income', 'Log one-time income / bonus')}
                      </span>
                      <span className="breakdown-secondary-text text-[#57606F]">
                        {newIncomeType === 'recurring'
                          ? t('salary_breakdown_modal.establish_source', 'Establish a dynamic incoming source')
                          : t('salary_breakdown_modal.establish_onetime_source', 'Add a unique income for this period')}
                      </span>
                    </div>
                  </div>

                  {/* Type Selector */}
                  <div className="flex p-1 bg-neutral-50 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setNewIncomeType('recurring')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${newIncomeType === 'recurring' ? 'bg-white text-[#111C2D] shadow-sm' : 'text-[#57606F] hover:text-[#111C2D]'}`}
                    >
                      {t('salary_breakdown_modal.recurring', 'Recurring')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewIncomeType('onetime')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${newIncomeType === 'onetime' ? 'bg-white text-[#111C2D] shadow-sm' : 'text-[#57606F] hover:text-[#111C2D]'}`}
                    >
                      {t('salary_breakdown_modal.onetime_bonus', 'One-time / Bonus')}
                    </button>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.income_source_name', 'Income Source Name')}</label>
                      <input 
                        type="text"
                        value={newIncomeNotes}
                        onChange={(e) => setNewIncomeNotes(e.target.value)}
                        placeholder="Enter source name (e.g., Monthly Payroll)"
                        className="flex-1 bg-white border border-[#D1D5DB] text-sm text-[#111C2D] p-3 rounded-[12px] outline-none"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.amount', 'Amount')} ({activeBaseCurrency})</label>
                      <input 
                        type="number"
                        min="0"
                        value={(newIncomeAmount === '' || isNaN(Number(newIncomeAmount))) ? '' : newIncomeAmount}
                        onChange={(e) => setNewIncomeAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="e.g., 12000"
                        className="w-[273px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text"
                      />
                    </div>

                    <div className="w-[273px] ml-0 pl-0 mb-0 flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.destination_account', 'Destination Account')}</label>
                      <select
                        value={newIncomeAccountId}
                        onChange={(e) => setNewIncomeAccountId(e.target.value)}
                        className="w-[273px] ml-0 bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 pl-[10px] pr-[10px] rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                      >
                        <option value="" disabled>{t('salary_breakdown_modal.select_account', 'Select Target Account...')}</option>
                        {uniqueDbAccounts.map((acc, index) => (
                          <option key={`account-option-${acc.id}-${index}`} value={acc.id} className="bg-white text-[#1E2229]">
                            {acc.name} ({acc.currency})
                          </option>
                        ))}
                      </select>
                    </div>

                    {newIncomeType === 'recurring' && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.frequency', 'Recurrency Frequency')}</label>
                          <select
                            value={newIncomeRecurrency}
                            onChange={(e) => setNewIncomeRecurrency(e.target.value)}
                            className="w-[273px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                            style={{ width: '273px' }}
                          >
                            <option value="daily">{t('frequency_daily', 'Daily')}</option>
                            <option value="weekly">{t('frequency_weekly', 'Weekly')}</option>
                            <option value="monthly">{t('frequency_monthly', 'Monthly')}</option>
                            <option value="yearly">{t('frequency_yearly', 'Yearly')}</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.payroll_day', 'Payroll Day')}</label>
                          <select
                            value={isNaN(newIncomePayday) ? 28 : newIncomePayday}
                            onChange={(e) => setNewIncomePayday(Number(e.target.value) || 28)}
                            className="w-[273px] bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                            style={{ width: '273px' }}
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <option key={`create-day-${day}`} value={day} className="bg-white text-[#1E2229]">
                                {t('salary_breakdown_modal.day', 'Day')} {day}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Save Button Row */}
                <div className="pt-4 border-t border-neutral-200 flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSchedule(false)}
                    className="flex-1 py-2.5 bg-white border border-[#E1E8ED] text-[#1E2229] breakdown-secondary-text rounded-[10px] hover:bg-neutral-50 transition-all cursor-pointer font-normal text-center"
                  >
                    {t('salary_breakdown_modal.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSchedule || !newIncomeAmount}
                    onClick={handleSaveRecurringSchedule}
                    style={{ 
                      backgroundColor: newIncomeAmount ? '#A6DDB1' : '#F3F5F7',
                      color: newIncomeAmount ? '#1E293B' : '#9CA3AF' 
                    }}
                    className={`flex-1 py-2.5 breakdown-secondary-text rounded-xl transition-all font-normal text-center flex items-center justify-center gap-1.5 ${
                      newIncomeAmount ? 'hover:brightness-95 active:scale-95 cursor-pointer' : 'cursor-not-allowed border border-neutral-200'
                    }`}
                  >
                    {isSavingSchedule ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span style={{ fontSize: '16px' }}>{t('salary_breakdown_modal.save_link_stream', 'Save & Link Stream')}</span>
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
                className="flex-1 overflow-y-auto bg-white w-[320px]"
              >
                <div className="px-4 py-2 space-y-2 flex flex-col w-full">

                  {/* Income Transactions and Payroll Settings Wrapper */}
                  <div className="space-y-2.5 w-full">
                    
                    <div className="flex flex-col items-center justify-center p-0 ml-0 w-full">
                      <label className="text-xs text-[#57606F] font-bold">
                        {t('salary_breakdown_modal.payroll_day_of_month', 'Payroll Day of Month')}
                      </label>
                      <div className="relative group">
                          <select
                            value={isNaN(payday) ? 28 : payday}
                            onChange={(e) => setPayday(Number(e.target.value) || 28)}
                            className="w-[160px] h-12 bg-white border border-[#E1E8ED] rounded-lg px-4 appearance-none focus:border-[#A6DDB1] focus:ring-1 focus:ring-[#A6DDB1] outline-none transition-all text-[#111C2D]"
                          >
                            {Array.from({ length: maxSelectableDays }, (_, i) => i + 1).map((day) => (
                              <option key={`day-${day}`} value={day}>
                                {t('salary_breakdown_modal.day', 'Day')} {day} ({selectedYearMonth.split('-')[1]}/{String(day).padStart(2, '0')})
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-3.5 pointer-events-none text-[#57606F]" size={20} />
                      </div>
                    </div>

                    {/* SECTION HEADER: SELECT INCOME TRANSACTIONS */}
                    <div className="bg-white border border-[#E1E8ED] rounded-[20px] p-4 space-y-3">
                      <div 
                        onClick={() => {
                          if (dbRecurringIncomes.length > 0) {
                            setIsIncomeListExpanded(!isIncomeListExpanded);
                          }
                        }}
                        className={`flex items-center justify-between group ${dbRecurringIncomes.length > 0 ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }} className="text-[12px] text-[#57606F] font-bold">{t('salary_breakdown_modal.select_income_transactions', 'Select Income Transactions')}</span>
                        </div>
                      </div>

                      {/* DYNAMIC INCOME CHANNELS */}
                      <div className="flex flex-col w-[300px] ml-0 mr-[-27px] p-2 space-y-3">
                        {dbRecurringIncomes.length === 0 && customAuxiliaries.length === 0 ? (
                           <div className="flex flex-col items-center text-center py-8 bg-white rounded-xl border border-[#E1E8ED] space-y-4">
                             <div className="h-12 w-12 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400">
                               <Coins size={24} />
                             </div>
                             <div className="space-y-1">
                               <p className="text-sm font-bold text-[#111C2D]">{t('salary_overview.no_income_sources_linked', 'No income sources linked')}</p>
                               <p className="text-xs text-[#57606F]">{t('salary_overview.link_recurring_stream', 'Link a recurring stream to begin allocation')}</p>
                             </div>
                             <button
                               type="button"
                               onClick={() => setIsCreatingSchedule(true)}
                               className="px-4 py-2 bg-[#A6DDB1] text-[#366945] rounded-lg text-xs font-bold hover:brightness-95 active:scale-95 transition-all cursor-pointer shadow-sm"
                             >
                               <span>{t('salary_overview.link_first_income_source', 'Link First Income Source')}</span>
                             </button>
                           </div>
                        ) : (
                          <div className="space-y-3 w-full">
                            {/* DB Recurring Incomes */}
                            {dbRecurringIncomes.map((inc, index) => (
                              <div 
                                key={`income-stream-${inc.id}-${index}`}
                                onClick={() => toggleIncomeSelection(inc.id)}
                                className="bg-white border border-[#E1E8ED] rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer transition-all w-full min-w-0"
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="h-10 w-10 rounded-full bg-[#E8F5E9] flex items-center justify-center text-[#2E7D32] shrink-0">
                                      <Coins size={20} />
                                  </div>
                                  <div className="min-w-0 flex-1 text-left rtl:text-right">
                                      <p 
                                        className="text-sm text-[#111C2D]" 
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                      >
                                        {inc.notes || inc.title || 'Income'}
                                      </p>
                                      <p 
                                        className="text-xs text-[#57606F]"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                      >
                                        Primary Source
                                      </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    <p 
                                      className="text-sm"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, color: '#1B5E20' }}
                                    >
                                      +{activeBaseCurrency} {Number(inc.amount || 0).toLocaleString()}
                                    </p>
                                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${selectedIncomes.includes(inc.id) ? 'bg-[#2E7D32] border-[#2E7D32]' : 'bg-white border-[#D1D5DB]'}`}>
                                      {selectedIncomes.includes(inc.id) && <Check size={16} className="text-white" />}
                                    </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Custom Auxiliaries */}
                            {customAuxiliaries.map((aux, index) => (
                              <div 
                                key={`custom-aux-${aux.id}-${index}`}
                                onClick={() => toggleIncomeSelection(aux.id)}
                                className="bg-white border border-[#E1E8ED] rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer transition-all w-full min-w-0"
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="h-10 w-10 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#1976D2] shrink-0">
                                    <Coins size={20} />
                                  </div>
                                  <div className="min-w-0 flex-1 text-left rtl:text-right">
                                    <p className="text-sm text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                                      {aux.title}
                                    </p>
                                    <p className="text-xs text-[#57606F]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                      {t('special_linked_source', 'Special Linked Source')}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <p className="text-sm font-bold text-[#1B5E20]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                    +{activeBaseCurrency} {Number(aux.amount || 0).toLocaleString()}
                                  </p>
                                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${selectedIncomes.includes(aux.id) ? 'bg-[#2E7D32] border-[#2E7D32]' : 'bg-white border-[#D1D5DB]'}`}>
                                    {selectedIncomes.includes(aux.id) && <Check size={16} className="text-white" />}
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => setIsCreatingSchedule(true)}
                              className="w-full flex items-center justify-center gap-2 p-3 mt-1 bg-white border border-dashed border-[#E5E7EB] text-[#57606F] rounded-xl hover:bg-neutral-50 hover:border-[#A6DDB1] hover:text-[#366945] transition-all cursor-pointer group"
                            >
                              <Plus size={16} className="text-[#57606F] group-hover:text-[#366945]" />
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }} className="text-xs">{t('add_different_income_source', 'Add different income source')}</span>
                            </button>

                            {/* Detected Recent Transactions */}
                            {recentIncomeTransactions.length > 0 && (
                              <div className="pt-4 space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  <div className="h-1 w-1 rounded-full bg-[#A6DDB1]" />
                                  <span className="text-[10px] font-normal text-[#57606F]">{t('detected_recent_incomes', 'Detected Recent Incomes')}</span>
                                </div>
                                
                                {recentIncomeTransactions.filter(tx => !dbRecurringIncomes.some(inc => inc.title === tx.notes || inc.notes === tx.notes)).map((tx, index) => (
                                  <div 
                                    key={`detected-tx-${tx.id}-${index}`}
                                    className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 flex items-center justify-between opacity-80 hover:opacity-100 transition-all group"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="h-9 w-9 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-neutral-400">
                                        <Calendar size={16} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                          {tx.notes || t('income_transaction', 'Income Transaction')}
                                        </p>
                                        <p className="text-[10px] text-[#57606F]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                          {t('recorded_on', 'Recorded on')} {new Date(tx.date).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        setNewIncomeNotes(tx.notes || 'Monthly Payroll');
                                        setNewIncomeAmount(tx.amount);
                                        setNewIncomeAccountId(tx.accountId);
                                        setIsCreatingSchedule(true);
                                      }}
                                      className="px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#111C2D] rounded-lg text-[10px] font-bold hover:border-[#A6DDB1] hover:text-[#366945] transition-all"
                                    >
                                      {t('link_source', 'Link Source')}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Envelope Categories List (Managed via custom wizard toggles) */}
                  <div className="flex flex-col gap-2 flex-1 min-h-[180px] w-[280px]">
                    
                    {/* Header with link button to manage active categories precisely */}
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[clamp(10px,2.5vw,12px)] text-neutral-400 font-normal">{t('budget_allocation', 'Budget Allocation')}</span>
                      <button
                        type="button"
                        onClick={() => setIsManageCategoriesOpen(true)}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="text-[#A6DDB1] hover:brightness-110 active:scale-95 text-[clamp(10px,2.5vw,11.5px)] pl-2 font-normal transition-all cursor-pointer bg-white border-none outline-none select-none"
                      >
                        <span>{t('salary_overview.browse_all_categories', 'Browse All Categories & Sub-Categories')}</span>
                      </button>
                    </div>

                    {/* Inner lists wrapper */}
                    <div className="space-y-1.5 overflow-y-auto max-h-[220px] scrollbar-hide pr-1 border border-[#E1E8ED] rounded-[12px] p-2">
                      {allAvailableEnvelopesCatalog
                        .filter((cat) => activeEnvelopes.includes(cat.key))
                        .map((cat, index) => {
                          return (
                            <div 
                              key={`envelope-${cat.key}-${index}`}
                              className="h-[45px] bg-white border border-[#E1E8ED] px-2 rounded-[12px] flex items-center justify-between gap-1 transition-all shrink-0 hover:bg-neutral-50"
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm shrink-0">{cat.emoji}</span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                                  className="text-[14px] leading-[14px] text-slate-800 font-normal truncate"
                                >
                                  {t(`categories.${cat.category}`, formatLabel(cat.category))} - {t(`subcategories.${cat.subcategory}`, formatLabel(cat.subcategory))}
                                </span>
                                {isFuturePeriod && (
                                  <span 
                                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    className="text-[9px] text-[#2E7D32] leading-none shrink-0 border border-[#A6DDB1] px-1 py-0.5 rounded-[4px] bg-[#E8F5E9]"
                                  >
                                    Sch
                                  </span>
                                )}
                              </div>

                              <div className="relative flex items-center w-[80px] shrink-0 h-[30px]">
                                <span className="absolute left-2 text-[9px] text-zinc-400 font-normal leading-none pointer-events-none">{activeBaseCurrency}</span>
                                <input 
                                  type="number"
                                  placeholder="0"
                                  min="0"
                                  value={(allocations[cat.key] === undefined || isNaN(allocations[cat.key])) ? '' : allocations[cat.key]}
                                  onChange={(e) => handleAllocationChange(cat.key, e.target.value)}
                                                                    className="w-full h-full bg-[#ffffff] rounded-[10px] border border-[#E1E8ED] text-right focus:border-[#A6DDB1] pr-1.5 pl-6 text-[13px] text-[#1E2229] outline-none font-bold transition-all"
                                />
                              </div>
                            </div>
                          );
                      })}
                      
                      {activeEnvelopes.length === 0 && (
                        <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="p-8 text-center text-xs text-neutral-500 font-normal border border-dashed border-neutral-300 rounded-xl">
                          {t('no_categories_selected', 'No active envelope categories selected.')}<br />{t('tap_to_activate', 'Tap "Browse All Categories & Sub-Categories" to activate budget envelopes.')}
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Bottom Calculations Panel & Action Button (Fixed Footer) */}
                <div className="p-4 bg-white border border-[#E1E8ED] rounded-[24px] shrink-0 flex flex-col gap-3 mx-auto mb-4 w-[280px]">
                  {/* Calculations Row Details */}
                  <div className="grid grid-cols-3 gap-2 py-4 text-center w-full bg-[#EAEDF5] rounded-xl mb-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.income")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {calculatedIncomeDrop.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-[#D1D5DB]">
                      <span className="text-[10px] text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.expenses")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {sumAllocated.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-[#D1D5DB]">
                      <span className="text-[10px] text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.remaining")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {unallocatedBalance.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Display a visual success state only when the unallocated balance hits exactly 0 */}
                  {calculatedIncomeDrop === 0 ? (
                    <div className="p-3.5 rounded-[14px] bg-white border border-[#E1E8ED] text-center text-[13px] text-[#57606F] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <HelpCircle size={16} className="text-amber-500 shrink-0" />
                      <span>{t("salary_breakdown_modal.link_income_stream")}</span>
                    </div>
                  ) : isPerfectAllocation ? (
                    <div 
                      className="p-3.5 rounded-[14px] text-center font-bold flex items-center justify-center gap-2.5 select-none w-full bg-[#E8F5E9] border border-[#A6DDB1] text-[#2E7D32] shadow-sm"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                    >
                      <CheckCircle size={18} className="shrink-0" />
                      <span>{t("salary_breakdown_modal.perfectly_allocated")}</span>
                    </div>
                  ) : unallocatedBalance < 0 ? (
                    <div className="p-3.5 rounded-[14px] bg-[#FFF5F5] border border-[#FECACA] text-center text-[13px] text-[#DC2626] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{t("salary_breakdown_modal.allocation_exceeds", { amount: Math.abs(unallocatedBalance).toLocaleString() })}</span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[14px] bg-white border border-[#E1E8ED] text-center text-[13px] text-[#57606F] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <HelpCircle size={16} className="text-amber-500 shrink-0" />
                      <span>{t("salary_breakdown_modal.distribute_remaining", { amount: unallocatedBalance.toLocaleString() })}</span>
                    </div>
                  )}

                  {/* Confirm buttons */}
                  <div className="flex gap-4 w-full mt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-3 bg-white border border-[#344E41] text-[#344E41] text-[14px] rounded-full hover:bg-neutral-50 transition-all cursor-pointer font-bold text-center"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                    >
                      {t("salary_breakdown_modal.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={!isPerfectAllocation || isLoading || calculatedIncomeDrop === 0}
                      onClick={handleConfirmAllocation}
                      style={{ 
                        backgroundColor: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#344E41' : '#F3F5F7',
                        color: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#FFFFFF' : '#57606F',
                        fontFamily: "'Google Sans', sans-serif"
                      }}
                      className={`flex-1 py-3 text-[14px] rounded-full transition-all font-bold text-center flex items-center justify-center gap-1.5 ${
                        (isPerfectAllocation && calculatedIncomeDrop > 0) ? 'hover:brightness-95 active:scale-95 cursor-pointer' : 'cursor-not-allowed'
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : saveStatus === 'success' ? (
                        <>
                          <CheckCircle size={14} className="shrink-0" />
                          <span>{t("salary_breakdown_modal.applied")}</span>
                        </>
                      ) : (
                        <span>{t("salary_breakdown_modal.confirm_allocation")}</span>
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
                className="absolute inset-x-0 bottom-0 top-0 md:top-[80px] md:mx-auto md:max-w-[480px] md:h-fit bg-[#FFFFFF] border border-[#E1E8ED] rounded-[24px] z-50 flex flex-col overflow-hidden"
              >
                {/* Drawer header */}
                <div className="p-6 flex items-center justify-between shrink-0 bg-white relative w-full">
                  <div className="flex items-center gap-2 text-left">
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }} className="text-[clamp(1.15rem,2.6vw,1.4rem)] text-[#1E2229]">
                      {t("salary_breakdown_modal.browse_all_categories", "Browse All Categories")}
                    </span>
                  </div>
                  <div>
                    <button 
                      type="button"
                      onClick={() => setIsManageCategoriesOpen(false)}
                      style={{ backgroundColor: '#A6DDB1', color: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }}
                      className="px-6 py-2.5 text-[clamp(0.8rem,1.8vw,0.95rem)] rounded-[20px] hover:brightness-105 active:scale-95 transition-all cursor-pointer border border-neutral-100"
                    >
                      {t("salary_breakdown_modal.done")}
                    </button>
                  </div>
                </div>

                {/* Checklist options */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 w-full bg-white">
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] leading-relaxed">
                    {t("salary_breakdown_modal.expand_categories_description", "Expand categories below and check subcategories. Checking any item automatically appends it as an active high-density allocation budget envelope.")}
                  </p>

                  <div className="space-y-2">
                    {/* ACCOUNT FUND TRANSFERS Accordion Node */}
                    <div className="border border-[#E1E8ED] rounded-[24px] overflow-hidden bg-[#FFFFFF]">
                      {/* Parent Accordion Row */}
                      <div
                        onClick={() => toggleCategoryExpanded('ACCOUNT FUND TRANSFERS')}
                        className="p-4 flex items-center justify-between cursor-pointer transition-all select-none hover:bg-neutral-50"
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
                          className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-neutral-500"
                        >
                          {expandedCategories.includes('ACCOUNT FUND TRANSFERS') ? 'Collapse' : 'Expand'}
                        </span>
                      </div>

                      {/* Accordion Content: Accounts Multi-select */}
                      {expandedCategories.includes('ACCOUNT FUND TRANSFERS') && (
                        <div className="p-4 border-t border-neutral-100 space-y-2.5">
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
                                    borderColor: isActive ? '#A6DDB1' : '#F3F4F6'
                                  }}
                                  className={`p-2 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                                    isActive ? 'bg-[#f0f9f1] text-[#111c2d]' : 'bg-[#FFFFFF] text-neutral-400 hover:bg-neutral-100'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[10px] font-normal leading-none">
                                    {acc.name} ({acc.institution || 'Direct'})
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: isActive ? '#A6DDB1' : '#FFFFFF',
                                      borderColor: isActive ? '#A6DDB1' : '#E5E7EB'
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
                        <div key={`category-row-${cat.key || cat.name || index}-${index}`} className="bg-white mb-4 rounded-[24px] border border-neutral-100 overflow-hidden">
                          {/* Parent Accordion Row */}
                          <div
                            onClick={() => toggleCategoryExpanded(cat.name)}
                            className="p-4 flex items-center justify-between cursor-pointer transition-all select-none hover:bg-neutral-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg shrink-0">{cat.emoji || '📁'}</span>
                              <span
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                                className="text-[clamp(1rem,2.2vw,1.2rem)] text-[#1E2229]"
                              >
                                {t(`categories.${cat.name}`, displayCatName) as string}
                              </span>
                            </div>
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-neutral-500"
                            >
                              {isExpanded ? t('common.collapse', 'Collapse') : t('common.expand', 'Expand')}
                            </span>
                          </div>

                          {/* Nested Subcategories List */}
                          {isExpanded && (
                            <div className="p-3 border-t border-neutral-100 space-y-1.5">
                              {subs.length === 0 ? (
                                <div
                                  onClick={() => {
                                    const key = `${cat.name}__general`.replace(/\s+/g, '_').toLowerCase();
                                    toggleEnvelopeActiveState(key);
                                  }}
                                  style={{
                                    borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#F3F4F6'
                                  }}
                                  className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                    activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? 'bg-[#f0f9f1]' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                    {t('common.general', 'General')}
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#FFFFFF',
                                      borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#E5E7EB'
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
                                        borderColor: isActive ? '#A6DDB1' : '#F3F4F6'
                                      }}
                                      className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                        isActive ? 'bg-[#f0f9f1]' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                      }`}
                                    >
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                        {t(`subcategories.${sub}`, formatLabel(sub))}
                                      </span>

                                      <div
                                        style={{
                                          backgroundColor: isActive ? '#A6DDB1' : '#FFFFFF',
                                          borderColor: isActive ? '#A6DDB1' : '#E5E7EB'
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
                <div className="p-3 bg-white border-t border-neutral-100 flex justify-end shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsManageCategoriesOpen(false)}
                    style={{ backgroundColor: '#A6DDB1', color: '#1E293B', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-4 py-2 text-[10px] rounded-xl font-normal hover:brightness-105 active:scale-95 transition-all cursor-pointer text-center w-full"
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
