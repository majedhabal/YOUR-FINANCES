import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { 
  Bell, X, Check, Trash2, Calendar, Landmark, 
  AlertCircle, TrendingUp, Sparkles, AlertTriangle, 
  CheckSquare, Square, Plus, ShieldCheck
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch, getDocs, increment, runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { SalaryBreakdownVerificationModal } from './SalaryBreakdownVerificationModal';

interface NotificationDispatchHubProps {
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  onTransactionApproved?: () => void;
}

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  status?: 'active' | 'completed';
  scheduledAt?: string;
  notified?: boolean;
  date?: string;
  time?: string;
}

export interface BudgetAlertNode {
  id: string;
  budgetId: string;
  category: string;
  type: 'warning' | 'critical';
  title: string;
  spent: number;
  limit: number;
  currency: string;
  date: string;
  time: string;
  cleared: boolean;
  isDailySpends?: boolean;
}

export const NotificationDispatchHub: React.FC<NotificationDispatchHubProps> = ({
  uid,
  accounts,
  transactions,
  accountBalances,
  onTransactionApproved
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [foregroundQuietIncrement, setForegroundQuietIncrement] = useState(0);

  // Automatically open the notification drawer if the deep link parameters indicate a lock screen click
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openDispatch') === 'true') {
        setIsOpen(true);
      }
    } catch (e) {
      console.warn("Deep route gateway fail:", e);
    }
  }, []);

  // Listen for quiet foreground messages from sw.js and update badge counts quietly
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleQuietPayload = (event: MessageEvent) => {
        if (event.data && event.data.type === 'VANTAGE_FOREGROUND_ALERT') {
          setForegroundQuietIncrement(prev => prev + 1);
        }
      };
      navigator.serviceWorker.addEventListener('message', handleQuietPayload);
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleQuietPayload);
      };
    }
  }, []);

  // Reset the quiet background increment counter when the drawer is opened/dismissed
  useEffect(() => {
    if (isOpen) {
      setForegroundQuietIncrement(0);
    }
  }, [isOpen]);
  
  // Real-time Firestore streams
  const [drafts, setDrafts] = useState<any[]>([]);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Financial Checklist State (persisted inside localStorage)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  
  // Real-time Budget alarm/warnings stream logs state
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlertNode[]>([]);

  // Schedulers State
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true);
  const [salaryBreakdowns, setSalaryBreakdowns] = useState<any[]>([]);
  const [isProcessingConfirmSb, setIsProcessingConfirmSb] = useState<string | null>(null);
  const [verifyingSb, setVerifyingSb] = useState<any | null>(null);

  const [dbPayday, setDbPayday] = useState<number>(28);
  const [dbSalary, setDbSalary] = useState<number>(0);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, `users/${uid}/recurringTransactions`),
      where('type', '==', 'income')
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .filter((item) => item.isActive !== false);

      const computedSalary = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      setDbSalary(computedSalary);

      const payItem = items.find(item => item.category === 'Salary' && item.dayOption) || items.find(item => item.dayOption);
      if (payItem) {
        setDbPayday(Number(payItem.dayOption));
      } else {
        setDbPayday(28);
      }
    }, (err) => {
      console.warn("Could not read recurring transactions in hub:", err);
    });
    return () => unsub();
  }, [uid]);

  const getCurrentPeriodYearMonth = () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curDay = now.getDate();

    let initYear = curYear;
    let initMonth = curMonth;

    if (curDay < dbPayday) {
      const prevMonthDate = new Date(curYear, curMonth - 1, 1);
      initYear = prevMonthDate.getFullYear();
      initMonth = prevMonthDate.getMonth();
    }
    return `${initYear}-${String(initMonth + 1).padStart(2, '0')}`;
  };

  const isPrePaydayApproaching = React.useMemo(() => {
    if (!dbPayday || !dbSalary) return false;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const targetPaydayThisMonth = new Date(curYear, curMonth, dbPayday);
    const diffTime = targetPaydayThisMonth.getTime() - now.getTime();
    const daysRemaining = diffTime / (1000 * 60 * 60 * 24);
    if (daysRemaining >= 0 && daysRemaining <= 7) {
      return true;
    }
    if (daysRemaining < 0) {
      const targetPaydayNextMonth = new Date(curYear, curMonth + 1, dbPayday);
      const diffTimeNext = targetPaydayNextMonth.getTime() - now.getTime();
      const daysRemainingNext = diffTimeNext / (1000 * 60 * 60 * 24);
      if (daysRemainingNext >= 0 && daysRemainingNext <= 7) {
        return true;
      }
    }
    return false;
  }, [dbPayday, dbSalary]);

  const activeYearMonth = getCurrentPeriodYearMonth();
  const activeBreakdown = salaryBreakdowns.find(sb => sb.id === activeYearMonth);
  const lacksBreakdownConfig = !activeBreakdown || activeBreakdown.isBreakdownConfigured !== true;
  const showMissingSalaryAlert = isPrePaydayApproaching && lacksBreakdownConfig;

  const maturedPendingSalaryBreakdowns = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return salaryBreakdowns.filter(sb => {
      if (sb.isConfirmed !== false) return false;
      const payday = sb.payday || 28;
      const [year, month] = sb.id.split('-');
      const dueDateStr = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;
      return dueDateStr <= todayStr;
    });
  }, [salaryBreakdowns]);

  const [notifiedMaturedIds, setNotifiedMaturedIds] = React.useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(`vantage_notified_matured_sb_${uid}`);
      return cached ? JSON.parse(cached) : [];
    } catch (_) {
      return [];
    }
  });

  const saveNotifiedMaturedIds = (ids: string[]) => {
    setNotifiedMaturedIds(ids);
    localStorage.setItem(`vantage_notified_matured_sb_${uid}`, JSON.stringify(ids));
  };

  React.useEffect(() => {
    if (!uid || maturedPendingSalaryBreakdowns.length === 0) return;

    maturedPendingSalaryBreakdowns.forEach(sb => {
      if (!notifiedMaturedIds.includes(sb.id)) {
        // Step 1 - Income Receipt Phone Notification
        sendDeviceNotification(
          '🔔 Vantage Salary Payroll',
          'Salary payroll detected. Tap to confirm cash injection verification.',
          () => {
            setIsOpen(true); // Open the drawer
          }
        );
        playNotificationSound();
        
        const updated = [...notifiedMaturedIds, sb.id];
        saveNotifiedMaturedIds(updated);
      }
    });
  }, [uid, maturedPendingSalaryBreakdowns, notifiedMaturedIds]);

  const handleConfirmTier1 = async (sb: any, checkingAccId: string) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);

      // 1. Update break down tier1Approved
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        tier1Approved: true,
        updatedAt: serverTimestamp()
      });

      // 2. Mutate targeted checking bank account balance
      if (checkingAccId) {
        const targetAcc = accounts.find(a => a.id === checkingAccId);
        if (targetAcc) {
          const accRef = doc(db, `users/${uid}/accounts/${checkingAccId}`);
          batch.update(accRef, {
            startingBalance: Number(targetAcc.startingBalance || 0) + Number(sb.baseSalaryInput || 0),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 3. Write primary incoming payroll record safely to historical ledger
      const txRef = doc(collection(db, `users/${uid}/transactions`));
      batch.set(txRef, {
        id: txRef.id,
        userId: uid,
        type: 'income',
        amount: Number(sb.baseSalaryInput || 0),
        accountId: checkingAccId || '',
        category: 'Salary',
        subcategory: 'Wages',
        notes: 'Salary receipt',
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        salaryBreakdownPeriod: sb.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

      // Voice trigger push feedback
      sendDeviceNotification(
        '💵 Salary receipt confirmed',
        `Successfully added deposit of ${sb.currency || 'AED'} ${Number(sb.baseSalaryInput).toLocaleString()}`
      );
      playNotificationSound();

    } catch (err) {
      console.error("Failed to confirm Tier 1 salary receipt:", err);
    }
  };

  const handleConfirmAllocationLine = async (
    sb: any, 
    key: string, 
    allocatedAmt: number, 
    isTransfer: boolean,
    category: string,
    subcategory: string,
    label: string,
    checkingAccId: string
  ) => {
    if (!uid) return;
    try {
      const batch = writeBatch(db);

      // Updates database documents depending on line type
      if (isTransfer) {
        // If the row is a transfer: subtract checkings balance, add destination asset balance
        const destAccId = key.replace('transfer__', '');
        const srcAcc = accounts.find(a => a.id === checkingAccId);
        const destAcc = accounts.find(a => a.id === destAccId);

        if (srcAcc) {
          const srcRef = doc(db, `users/${uid}/accounts/${checkingAccId}`);
          batch.update(srcRef, {
            startingBalance: Number(srcAcc.startingBalance || 0) - allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }
        if (destAcc) {
          const destRef = doc(db, `users/${uid}/accounts/${destAccId}`);
          batch.update(destRef, {
            startingBalance: Number(destAcc.startingBalance || 0) + allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }
      } else {
        // If row is a spending category: subtract from active miniBudgets document, write to transactions ledger
        const matchedBudget = miniBudgets.find(b => b.category === category && b.subcategory === subcategory);
        if (matchedBudget) {
          const budRef = doc(db, `users/${uid}/miniBudgets`, matchedBudget.id);
          batch.update(budRef, {
            maxBudget: Number(matchedBudget.maxBudget || 0) - allocatedAmt,
            updatedAt: serverTimestamp()
          });
        }

        const txRef = doc(collection(db, `users/${uid}/transactions`));
        batch.set(txRef, {
          id: txRef.id,
          userId: uid,
          type: 'expense',
          amount: allocatedAmt,
          accountId: checkingAccId || '',
          category,
          subcategory,
          notes: `Allocation: ${label}`,
          date: new Date().toISOString().split('T')[0],
          status: 'confirmed',
          salaryBreakdownPeriod: sb.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Mark this specific allocation key as confirmed
      const sbRef = doc(db, `users/${uid}/salaryBreakdowns/${sb.id}`);
      batch.update(sbRef, {
        [`confirmedAllocations.${key}`]: true,
        updatedAt: serverTimestamp()
      });

      // Optimistic check: if all active allocations are confirmed, we mark the whole breakdown confirmed
      const activeAllocableKeys = (sb.activeEnvelopes || []).filter((k: string) => Number(sb.allocations?.[k] || 0) > 0);
      const nextConfirmedMap = { ...(sb.confirmedAllocations || {}), [key]: true };
      const isAllDone = activeAllocableKeys.every((k: string) => nextConfirmedMap[k] === true);

      if (isAllDone) {
        batch.update(sbRef, {
          isConfirmed: true,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();

      if (onTransactionApproved) {
        onTransactionApproved();
      }

      playNotificationSound();

    } catch (err) {
      console.error("Failed to commit independent line allocation:", err);
    }
  };

  // Initialize date/time with local timezone safe default
  useEffect(() => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISO = new Date(d.getTime() - tzOffset).toISOString();
    setSchedDate(localISO.split('T')[0]);
    setSchedTime(d.toTimeString().slice(0, 5));
  }, []);

  const handleToggleScheduler = () => {
    const nextState = !showScheduler;
    setShowScheduler(nextState);
    if (nextState && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  };

  // Two-step confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    message: '',
    onConfirm: () => {}
  });

  // Load and seed Checklist
  useEffect(() => {
    if (!uid) return;
    const cacheKey = `vantage_dispatch_checklist_${uid}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const normalized = parsed.map((item: any) => ({
          ...item,
          status: item.status || (item.completed ? 'completed' : 'active')
        }));
        setChecklist(normalized);
      } catch (_) {
        seedChecklist(cacheKey);
      }
    } else {
      seedChecklist(cacheKey);
    }

    // Load budget alerts
    const cacheKeyAlerts = `vantage_budget_alerts_log_${uid}`;
    const cachedAlerts = localStorage.getItem(cacheKeyAlerts);
    if (cachedAlerts) {
      try {
        setBudgetAlerts(JSON.parse(cachedAlerts));
      } catch (_) {}
    }
  }, [uid]);

  const saveBudgetAlerts = (newAlerts: BudgetAlertNode[]) => {
    setBudgetAlerts(newAlerts);
    localStorage.setItem(`vantage_budget_alerts_log_${uid}`, JSON.stringify(newAlerts));
  };

  const seedChecklist = (cacheKey: string) => {
    const defaultChecklist: ChecklistItem[] = [
      { id: 'itm-1', text: 'Verify daily spending budgets', completed: false, status: 'active' },
      { id: 'itm-2', text: 'Audit subscription schedules', completed: false, status: 'active' },
      { id: 'itm-3', text: 'Optimize active investment tiers', completed: false, status: 'active' }
    ];
    setChecklist(defaultChecklist);
    localStorage.setItem(cacheKey, JSON.stringify(defaultChecklist));
  };

  // Real-time Firestore Sync Streams
  useEffect(() => {
    if (!uid) return;

    // 1. Listen to Drafts
    const qDrafts = query(
      collection(db, `users/${uid}/transactions`),
      where('status', 'in', ['draft', 'pending_confirmation'])
    );
    const unsubDrafts = onSnapshot(qDrafts, (snap) => {
      setDrafts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched approvals offline fallback:", err);
    });

    // 2. Listen to miniBudgets
    const unsubBudgets = onSnapshot(collection(db, `users/${uid}/miniBudgets`), (snap) => {
      setMiniBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched budgets offline fallback:", err);
    });

    // 3. Listen to Milestones
    const unsubMilestones = onSnapshot(collection(db, `users/${uid}/milestones`), (snap) => {
      setMilestones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched milestones offline fallback:", err);
    });

    // 4. Listen to Salary Breakdowns
    const unsubSalary = onSnapshot(collection(db, `users/${uid}/salaryBreakdowns`), (snap) => {
      setSalaryBreakdowns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Dispatched salary breakdowns offline fallback:", err);
    });

    return () => {
      unsubDrafts();
      unsubBudgets();
      unsubMilestones();
      unsubSalary();
    };
  }, [uid]);

  // Helpers for Checklist Operations
  const saveChecklist = (updatedList: ChecklistItem[]) => {
    setChecklist(updatedList);
    localStorage.setItem(`vantage_dispatch_checklist_${uid}`, JSON.stringify(updatedList));
  };

  const handleToggleChecklist = (id: string) => {
    const updated = checklist.map(item => {
      if (item.id === id) {
        const nextCompleted = !item.completed;
        return {
          ...item,
          completed: nextCompleted,
          status: nextCompleted ? 'completed' : 'active'
        } as ChecklistItem;
      }
      return item;
    });
    saveChecklist(updated);
  };

  // Browser Notification native broadcast
  const sendDeviceNotification = (title: string, body: string, onClick?: () => void) => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const canUseSW = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
        if (canUseSW) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo.png',
              badge: '/icons/Your_Finances_Logo.png',
              tag: 'vantage-push-notification',
              data: {
                url: '/?tab=daily_log&subTab=daily'
              }
            }).catch(() => {
              const n = new Notification(title, {
                body: body,
                icon: '/icons/Your_Finances_Logo.png'
              });
              if (onClick) {
                n.onclick = () => {
                  window.focus();
                  onClick();
                };
              }
            });
          }).catch(() => {
            const n = new Notification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo.png'
            });
            if (onClick) {
              n.onclick = () => {
                window.focus();
                onClick();
              };
            }
          });
        } else {
          try {
            const n = new Notification(title, {
              body: body,
              icon: '/icons/Your_Finances_Logo.png'
            });
            if (onClick) {
              n.onclick = () => {
                window.focus();
                onClick();
              };
            }
          } catch (e) {
            console.warn("Desktop notification instantiation error:", e);
          }
        }
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            try {
              const n = new Notification(title, { body: body, icon: '/icons/Your_Finances_Logo.png' });
              if (onClick) {
                n.onclick = () => {
                  window.focus();
                  onClick();
                };
              }
            } catch (e) {}
          }
        });
      }
    }
  };

  // Web Audio synthetic vintage alert chimes
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        
        osc.start(start);
        osc.stop(start + duration);
      };
      
      const now = audioCtx.currentTime;
      // Precision vintage dual chime tones
      playTone(523.25, now, 0.4); 
      playTone(659.25, now + 0.15, 0.5); 
    } catch (err) {
      console.warn("Audio playback not supported or user interaction required:", err);
    }
  };

  // Background clock check poller for match precise scheduled timestamp
  useEffect(() => {
    if (!uid || checklist.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      let changed = false;

      const updatedChecklist = checklist.map(item => {
        if (item.scheduledAt && !item.notified && !item.completed) {
          const targetTime = new Date(item.scheduledAt);
          if (now >= targetTime) {
            changed = true;
            // Native lock screen push simulation via HTML5 Web notification
            sendDeviceNotification(
              `🔔 VANTAGE LEDGER DISPATCH`, 
              `${item.text}`
            );
            // Alert chime playing
            playNotificationSound();
            
            // Pop an attractive HTML5 feedback toast in viewport if iframe sandbox rejects Notifications
            const toastId = `vantage-toast-${Date.now()}`;
            const toastEl = document.createElement('div');
            toastEl.id = toastId;
            toastEl.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-[#1E293B] border-2 border-[#A6DDB1] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
            toastEl.style.fontFamily = "'Google Sans', sans-serif";
            toastEl.innerHTML = `
              <div class="text-[#A6DDB1] text-lg font-bold">🔔</div>
              <div class="flex flex-col text-left">
                <span class="text-[9px] font-bold text-[#A6DDB1] tracking-widest uppercase">DISPATCH LIVE ALERT</span>
                <span class="text-xs font-normal text-neutral-100 uppercase tracking-wide mt-0.5">${item.text}</span>
              </div>
            `;
            document.body.appendChild(toastEl);
            setTimeout(() => {
              toastEl.remove();
            }, 6000);

            return { ...item, notified: true };
          }
        }
        return item;
      });

      if (changed) {
        saveChecklist(updatedChecklist);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [uid, checklist]);

  const handleCreateChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    let scheduledAtStr: string | undefined = undefined;
    if (showScheduler && schedDate && schedTime) {
      try {
        const datetimeStr = `${schedDate}T${schedTime}`;
        const parsedDate = new Date(datetimeStr);
        if (!isNaN(parsedDate.getTime())) {
          scheduledAtStr = parsedDate.toISOString();
        }
      } catch (err) {
        console.warn("Error parsing scheduled reminder timestamp:", err);
      }
    }

    const newItem: ChecklistItem = {
      id: `itm-custom-${Date.now()}`,
      text: newItemText.trim(),
      completed: false,
      status: 'active',
      scheduledAt: scheduledAtStr,
      notified: false,
      date: showScheduler ? schedDate : undefined,
      time: showScheduler ? schedTime : undefined
    };

    saveChecklist([...checklist, newItem]);
    setNewItemText('');
    setShowScheduler(false);

    if (scheduledAtStr && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const handleDeleteChecklistItemWithConfirm = (id: string) => {
    setConfirmModal({
      isOpen: true,
      message: 'Are you sure you want to proceed with deleting this checklist item?',
      onConfirm: () => {
        const updated = checklist.filter(item => item.id !== id);
        saveChecklist(updated);
      }
    });
  };

  // Firestore transaction approvals
  const handleApproveDraft = async (tx: any) => {
    setIsProcessing(tx.id);
    try {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db, `users/${uid}/transactions`, tx.id);
        const txSnap = await transaction.get(txRef);
        
        const txData = txSnap.exists() ? txSnap.data() : tx;
        const amt = Number(txData.amount || 0);

        // Perform All Balance Updates and Mini-Budget Reads First
        const sourceAccountId = txData.accountId || txData.sourceAccountId;
        const txType = (txData.type || '').toLowerCase();
        const isTransfer = txType === 'transfer' || txData.transferSide === 'sender';
        const destAccountId = txData.toAccountId || txData.destinationAccountId;

        let sourceSnap: any = null;
        if (sourceAccountId) {
          const sourceRef = doc(db, `users/${uid}/accounts/${sourceAccountId}`);
          sourceSnap = await transaction.get(sourceRef);
        }

        let destSnap: any = null;
        if (isTransfer && destAccountId) {
          const destRef = doc(db, `users/${uid}/accounts/${destAccountId}`);
          destSnap = await transaction.get(destRef);
        }

        const matchingBudget = miniBudgets.find(
          (b) => (b.categoryTitle === txData.category || b.category === txData.category) && b.userId === uid
        );
        let budgetSnap: any = null;
        if (matchingBudget) {
          const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudget.id);
          budgetSnap = await transaction.get(budgetRef);
        }

        // NOW execute all WRITES
        transaction.update(txRef, {
          status: 'confirmed',
          updatedAt: serverTimestamp()
        });

        if (sourceSnap && sourceSnap.exists()) {
          const sourceRef = doc(db, `users/${uid}/accounts/${sourceAccountId}`);
          const sourceBal = Number(sourceSnap.data()?.currentBalance) || 0;
          const txType = (txData.type || '').toLowerCase();
          const change = (txType === 'income' || txType === 'inflow') ? amt : -amt;
          transaction.update(sourceRef, {
            currentBalance: sourceBal + change,
            updatedAt: serverTimestamp()
          });
        }

        if (isTransfer && destAccountId && destSnap && destSnap.exists()) {
          const destRef = doc(db, `users/${uid}/accounts/${destAccountId}`);
          const destBal = Number(destSnap.data()?.currentBalance) || 0;
          transaction.update(destRef, {
            currentBalance: destBal + amt,
            updatedAt: serverTimestamp()
          });
        }

        if (matchingBudget && budgetSnap && budgetSnap.exists()) {
          const budgetRef = doc(db, `users/${uid}/miniBudgets`, matchingBudget.id);
          const currentSpent = Number(budgetSnap.data()?.spentAmount) || 0;
          transaction.update(budgetRef, {
            spentAmount: currentSpent + amt,
            updatedAt: serverTimestamp()
          });
        }
      });

      onTransactionApproved?.();
    } catch (err) {
      console.error("Failed to approve transaction draft:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/transactions/${tx.id}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDismissDraftWithConfirm = (tx: any) => {
    setConfirmModal({
      isOpen: true,
      message: 'Are you sure you want to proceed with rejecting and removing this transaction approval draft?',
      onConfirm: async () => {
        setIsProcessing(tx.id);
        try {
          const txRef = doc(db, `users/${uid}/transactions`, tx.id);
          await deleteDoc(txRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${uid}/transactions/${tx.id}`);
        } finally {
          setIsProcessing(null);
        }
      }
    });
  };

  // Multi-theme Dynamic Calculations
  // 1. Budget Overruns
  const calculateBudgetSpent = (budget: any) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    
    const period = budget.period || 'daily';
    if (period === 'monthly') {
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const curDay = now.getDate();

      let initYear = curYear;
      let initMonth = curMonth;

      if (curDay < dbPayday) {
        const prevMonthDate = new Date(curYear, curMonth - 1, 1);
        initYear = prevMonthDate.getFullYear();
        initMonth = prevMonthDate.getMonth();
      }

      start = new Date(initYear, initMonth, dbPayday);
      end = new Date(initYear, initMonth + 1, dbPayday - 1, 23, 59, 59);
    } else if (period === 'weekly') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      monday.setHours(0,0,0,0);
      start = monday;
      end = new Date(monday);
      end.setDate(end.getDate() + 7);
    } else {
      // daily
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    return transactions.reduce((total, tx) => {
      if (tx.status === 'draft') return total;
      const txType = (tx.type || '').toLowerCase();
      if (txType !== 'expense' && txType !== 'outflow') return total;
      
      const txDate = new Date(tx.date);
      if (txDate >= start && txDate <= end) {
        if (tx.budgetId === budget.id) return total + Number(tx.amount || 0);
        if (tx.category === budget.category) {
          if (!budget.subcategory || budget.subcategory === 'All' || budget.subcategory === '') {
            return total + Number(tx.amount || 0);
          }
          if (tx.subcategory === budget.subcategory) {
            return total + Number(tx.amount || 0);
          }
        }
      }
      return total;
    }, 0);
  };

  // Helper to show dynamic browser-like banner style viewport toast if iframe blocks permissions
  const showViewportToast = (emoji: string, header: string, body: string) => {
    const toastId = `vantage-toast-${Date.now()}`;
    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[300] bg-[#1E293B] border-2 border-[#A6DDB1] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce";
    toastEl.style.fontFamily = "'Google Sans', sans-serif";
    toastEl.innerHTML = `
      <div class="text-[#A6DDB1] text-lg font-bold">${emoji}</div>
      <div class="flex flex-col text-left">
        <span class="text-[9px] font-bold text-[#A6DDB1] tracking-widest uppercase">${header}</span>
        <span class="text-xs font-normal text-neutral-100 uppercase tracking-wide mt-0.5">${body}</span>
      </div>
    `;
    document.body.appendChild(toastEl);
    setTimeout(() => {
      toastEl.remove();
    }, 6000);
  };

  // Real-time limit threshold listeners and locks monitoring
  useEffect(() => {
    if (!uid || miniBudgets.length === 0) return;

    // Load active alert locks to prevent repetitive notifications
    const lockKey = `vantage_locked_budget_alerts_${uid}`;
    let locks: Record<string, { warningFired?: boolean; criticalFired?: boolean; lastLimit?: number; monthKey?: string }> = {};
    try {
      const cachedLocks = localStorage.getItem(lockKey);
      if (cachedLocks) {
        locks = JSON.parse(cachedLocks);
      }
    } catch (_) {}

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let alarmsChanged = false;
    let locksChanged = false;
    const newAlertsLog = [...budgetAlerts];

    miniBudgets.forEach(b => {
      const spent = calculateBudgetSpent(b);
      const limit = Number(b.maxBudget || b.limit || 0);
      if (limit <= 0) return;

      const ratio = spent / limit;
      const percentage = Math.round(ratio * 100);
      const remainingBytes = limit - spent;
      const remainingAmountFormatted = Math.max(0, remainingBytes).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Daily Spends identification: b.period is daily or contains "daily"
      const isDailySpends = b.period === 'daily' || b.category?.toLowerCase().includes('daily') || b.title?.toLowerCase().includes('daily');
      const todayDateStr = now.toISOString().split('T')[0];
      
      // Strict daily key for daily limits vs monthly key for rest
      const dateLockKey = isDailySpends ? todayDateStr : currentMonthKey;

      // Clean or initialize lock key
      if (!locks[b.id]) {
        locks[b.id] = { lastLimit: limit, monthKey: dateLockKey };
        locksChanged = true;
      }

      // If allocation (limit) changes, or if tracking date lock key changes, reset locks
      if (locks[b.id].lastLimit !== limit || locks[b.id].monthKey !== dateLockKey) {
        locks[b.id].warningFired = false;
        locks[b.id].criticalFired = false;
        locks[b.id].lastLimit = limit;
        locks[b.id].monthKey = dateLockKey;
        locksChanged = true;
      }

      // If budget spent drops below 80% (e.g., transaction deleted), clear warning lock (ONLY for non-daily budgets)
      if (ratio < 0.80 && locks[b.id].warningFired) {
        if (!isDailySpends) {
          locks[b.id].warningFired = false;
          locksChanged = true;
        }
      }
      if (ratio < 1.0 && locks[b.id].criticalFired) {
        locks[b.id].criticalFired = false;
        locksChanged = true;
      }

      // 1. Warning State: spent reaches EXACTLY >= 80% and < 100% of allocation cap
      if (ratio >= 0.80 && ratio < 1.0) {
        if (!locks[b.id].warningFired) {
          locks[b.id].warningFired = true;
          locksChanged = true;

          const alertId = `budget-warning-${b.id}-${limit}-${Date.now()}`;
          const titleText = isDailySpends
            ? `Vantage Alert: You have consumed 80% of your Daily Spends budget. ${remainingAmountFormatted} ${b.currency || 'AED'} left for today.`
            : `Vantage Alert: You have consumed ${percentage}% of your ${b.category.toUpperCase()} budget. ${remainingAmountFormatted} ${b.currency || 'AED'} remaining.`;
          
          const alertNode: BudgetAlertNode = {
            id: alertId,
            budgetId: b.id,
            category: b.category,
            type: 'warning',
            title: titleText,
            spent,
            limit,
            currency: b.currency || 'AED',
            date: todayDateStr,
            time: now.toTimeString().slice(0, 5),
            cleared: false,
            isDailySpends: isDailySpends
          };

          newAlertsLog.push(alertNode);
          alarmsChanged = true;

          // Dispatch notifications with lock screen click navigations
          sendDeviceNotification(
            isDailySpends ? '⚠️ DAILY SPENDS OVERVIEW' : '⚠️ VANTAGE BUDGET WARNING', 
            titleText, 
            () => handleAlertClicked(b.id)
          );
          playNotificationSound();
          showViewportToast('⚠️', isDailySpends ? 'DAILY SPENDS NEAR LIMIT' : 'BUDGET NEAR CONSUMED', titleText);
        }
      }

      // 2. Critical State: expenses cross or touch 100% (ratio >= 1.0)
      if (ratio >= 1.0) {
        if (!locks[b.id].criticalFired) {
          locks[b.id].warningFired = true; // also prevent duplicate warning
          locks[b.id].criticalFired = true;
          locksChanged = true;

          const alertId = `budget-critical-${b.id}-${limit}-${Date.now()}`;
          const titleText = isDailySpends
            ? `Vantage Critical: Your Daily Spends budget has been breached at ${percentage}%!`
            : `Vantage Critical: Your ${b.category.toUpperCase()} budget has been breached at ${percentage}%!`;
          
          const alertNode: BudgetAlertNode = {
            id: alertId,
            budgetId: b.id,
            category: b.category,
            type: 'critical',
            title: titleText,
            spent,
            limit,
            currency: b.currency || 'AED',
            date: todayDateStr,
            time: now.toTimeString().slice(0, 5),
            cleared: false,
            isDailySpends: isDailySpends
          };

          newAlertsLog.push(alertNode);
          alarmsChanged = true;

          // Dispatch notifications with lock screen click navigations
          sendDeviceNotification(
            isDailySpends ? '🚨 DAILY SPENDS BREACHED' : '🚨 VANTAGE BUDGET EXHAUSTED', 
            titleText, 
            () => handleAlertClicked(b.id)
          );
          playNotificationSound();
          showViewportToast('🚨', isDailySpends ? 'DAILY LIMIT EXHAUSTED' : 'LIMIT OVERAGE VIOLATION', titleText);
        }
      }
    });

    if (alarmsChanged) {
      saveBudgetAlerts(newAlertsLog);
    }
    if (locksChanged) {
      localStorage.setItem(lockKey, JSON.stringify(locks));
    }
  }, [miniBudgets, transactions, uid]);

  const handleClearBudgetAlert = (alertId: string) => {
    const updated = budgetAlerts.map(a => a.id === alertId ? { ...a, cleared: true } : a);
    saveBudgetAlerts(updated);
  };

  const handleAlertClicked = (bId: string) => {
    // Navigate to Budgets tab
    window.dispatchEvent(new CustomEvent('vantage-navigate-tab', { detail: { tab: 'budgets' } }));
    setIsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-vantage-budget', { detail: { budgetId: bId } }));
    }, 200);
  };

  const computedBudgetReminders: any[] = [];
  miniBudgets.forEach(b => {
    const spent = calculateBudgetSpent(b);
    const limit = Number(b.maxBudget || b.limit || 0);
    if (limit > 0) {
      if (spent > limit) {
        computedBudgetReminders.push({
          type: 'overrun',
          title: `🚨 BUDGET OVERRUN: ${b.title || b.category}`,
          text: `You have spent ${b.currency || 'AED'} ${spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of ${b.currency || 'AED'} ${limit.toLocaleString()}, exceeding limit by ${b.currency || 'AED'} ${(spent - limit).toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          isOverrun: true
        });
      } else if (spent >= limit * 0.8) {
        const percentage = Math.round((spent / limit) * 100);
        computedBudgetReminders.push({
          type: 'warning',
          title: `⚠️ BUDGET APPROACHING LIMIT: ${b.title || b.category}`,
          text: `You have spent ${percentage}% (${b.currency || 'AED'} ${spent.toLocaleString()} of ${limit.toLocaleString()}) on this cycle. Keep margins tight.`,
          isOverrun: false
        });
      }
    }
  });

  // 2. Past due / Due liability accounts
  const computedLiabilityReminders: any[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  accounts.forEach(acc => {
    const isLiability = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type);
    if (isLiability) {
      const balanceVal = accountBalances[acc.id] ?? 0;
      // Outstanding balance is negative in Vantage (e.g. -AED 5,000)
      if (balanceVal < 0 && acc.paymentDueDate) {
        const isPastDue = acc.paymentDueDate < todayStr;
        const dueAbs = Math.abs(balanceVal);
        
        computedLiabilityReminders.push({
          type: isPastDue ? 'past-due' : 'due',
          title: isPastDue ? `⚠️ PAST DUE OUTSTANDING: ${acc.name}` : `⚡ UPCOMING DUE DATE: ${acc.name}`,
          text: `${acc.currency || 'AED'} ${dueAbs.toLocaleString(undefined, { minimumFractionDigits: 2 })} due on ${acc.paymentDueDate}. Outstanding liabilities reduce liquidity.`,
          isPastDue
        });
      }
    }
  });

  // 3. Milestone Updates
  const computedMilestoneReminders: any[] = [];
  milestones.forEach(m => {
    const target = Number(m.targetAmount || 0);
    const saved = Number(m.currentSavings || 0);
    if (target > 0) {
      const pct = (saved / target) * 100;
      if (pct >= 100) {
        computedMilestoneReminders.push({
          title: `🏆 SAVINGS GOAL ACHIEVED: ${m.title}`,
          text: `Congratulations! Your milestone target of ${m.currency || 'AED'} ${target.toLocaleString()} has been fully accumulated.`
        });
      } else if (pct >= 80) {
        computedMilestoneReminders.push({
          title: `📈 MILESTONE ALIGNED: ${m.title}`,
          text: `Your goal is ${pct.toFixed(0)}% complete (${m.currency || 'AED'} ${saved.toLocaleString()} accumulated). Almost there!`
        });
      }
    }
  });

  // Combine reminders and milestones
  const allRemindersAndMilestones = [
    ...computedLiabilityReminders,
    ...computedBudgetReminders,
    ...computedMilestoneReminders
  ];

  // Define eligibleDrafts (excluding pending_confirmation that have not yet reached today's date)
  const eligibleDrafts = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return drafts.filter(tx => {
      if (tx.status === 'draft') return true;
      if (tx.status === 'pending_confirmation') {
        return tx.date <= todayStr;
      }
      return false;
    });
  }, [drafts]);

  // Alert/notify the user about newly matured transactions requiring confirmation
  useEffect(() => {
    if (!uid || drafts.length === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Find unconfirmed items whose date is today (or past) and are eligible to confirm
    const matureTx = drafts.filter(tx => tx.status === 'pending_confirmation' && tx.date <= todayStr);
    
    if (matureTx.length > 0) {
      const sessionKey = `vantage_notified_txs_${uid}`;
      const notifiedIds = JSON.parse(sessionStorage.getItem(sessionKey) || '[]');
      
      const newToNotify = matureTx.filter(tx => !notifiedIds.includes(tx.id));
      
      if (newToNotify.length > 0) {
        newToNotify.forEach(tx => {
          const amtFormatted = Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
          const text = `Unconfirmed transaction "${tx.notes || tx.category}" for ${tx.currency || 'AED'} ${amtFormatted} requires confirmation today.`;
          
          sendDeviceNotification(
            '⏳ Transaction Confirmation Required',
            text,
            () => setIsOpen(true)
          );
          showViewportToast('⏳', 'CONFIRMATION REQUIRED', text);
          notifiedIds.push(tx.id);
        });
        
        sessionStorage.setItem(sessionKey, JSON.stringify(notifiedIds));
      }
    }
  }, [drafts, uid]);

  // Aggregated Counter logic
  const activeNotifications = checklist.filter(item => item.scheduledAt && item.notified && !item.completed && item.status !== 'completed');
  const activeNotificationsCount = activeNotifications.length;
  const activeBudgetAlerts = budgetAlerts.filter(a => !a.cleared);
  const activeBudgetAlertsCount = activeBudgetAlerts.length;
  const pendingChecklistsCount = checklist.filter(item => !item.scheduledAt && !item.completed && item.status !== 'completed').length;
  const completedReminders = checklist.filter(item => item.completed || item.status === 'completed');
  const totalCount = eligibleDrafts.length + computedLiabilityReminders.filter(cc => cc.isPastDue).length + pendingChecklistsCount + activeNotificationsCount + activeBudgetAlertsCount + foregroundQuietIncrement + maturedPendingSalaryBreakdowns.length + (showMissingSalaryAlert ? 1 : 0);
  const hasBadge = totalCount > 0;

  // Broadcast totalCount of active tasks and notifications
  useEffect(() => {
    const ev = new CustomEvent('vantage-notifications-count-update', { detail: { count: totalCount } });
    window.dispatchEvent(ev);
    (window as any).__vantageNotificationsCount = totalCount;
  }, [totalCount]);

  useEffect(() => {
    const handleToggle = () => {
      setIsOpen(prev => !prev);
    };
    window.addEventListener('vantage-toggle-notifications', handleToggle);
    return () => window.removeEventListener('vantage-toggle-notifications', handleToggle);
  }, []);

  return (
    <React.Fragment>
      {/* Floating Action Bell Button Node */}
      <motion.button
         id="tour-notification-bell"
         key="dispatch-fab-bell"
         initial={{ opacity: 0, scale: 0.8 }}
         animate={{ opacity: 1, scale: 1 }}
         exit={{ opacity: 0, scale: 0.8 }}
         transition={{ duration: 0.15 }}
         whileHover={{ scale: 1.05 }}
         whileTap={{ scale: 0.95 }}
         onClick={() => setIsOpen(!isOpen)}
         style={{ fontFamily: "'Google Sans', sans-serif" }}
         className="w-[30px] h-[30px] bg-[#FFFFFF] border-0 rounded-full shadow-2xl flex items-center justify-center text-neutral-800 hover:text-[#A6DDB1] relative cursor-pointer"
      >
        <Bell size={18} className={eligibleDrafts.length > 0 ? "animate-bounce" : ""} />
        
        {/* Dynamic High-Contrast Warning Count Badge */}
        <AnimatePresence>
          {hasBadge && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              id="dispatch-badge-counter"
              className="absolute -top-1 -right-1 bg-rose-600 text-white rounded-full text-[10px] font-bold h-5 w-5 flex items-center justify-center border-2 border-[#FFFFFF] shadow-md px-1"
            >
              <span className="font-sans font-bold leading-none">{totalCount}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Drawer Overlay Panel */}
      <AnimatePresence>
        {isOpen && (
          <React.Fragment>
            {/* Backdrop layer */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.35 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-[#0E1111]/60 z-50 pointer-events-auto"
            />

            {/* Panel Sheet */}
            <motion.div
              initial={{ y: '100%', opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.8 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 md:right-6 md:left-auto md:translate-x-0 w-[calc(100%-2rem)] max-w-[350px] md:max-w-[390px] max-h-[90vh] bg-[#FFFFFF] border border-neutral-200 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden text-neutral-800"
              id="dispatch-hub-overlay-drawer"
            >
              {/* Header section with Google Sans font weight: 700 */}
              <div className="p-4 border-b border-neutral-150 flex items-center justify-between bg-neutral-50/50">
                <div className="flex flex-col">
                  <span 
                    className="text-neutral-900 text-sm font-bold"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  >
                    Vantage dispatch hub
                  </span>
                  <span 
                    className="text-[10px] text-neutral-500 mt-0.5 tracking-wide"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  >
                    Aggregated streams & pending tasks
                  </span>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors flex items-center justify-center text-neutral-500 hover:text-neutral-800"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable list content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 [WebkitOverflowScrolling:touch]">
                
                 {/* UPCOMING PAYDAY ALERT & CONFIG SETUP */}
                 {showMissingSalaryAlert && (
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                       <span 
                         className="text-[11px] text-neutral-500 font-bold tracking-wide animate-pulse"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                       >
                         Upcoming payday alert
                       </span>
                     </div>
                     <div 
                       className="p-4 bg-[#FFFFFF] border border-neutral-150 rounded-2xl flex flex-col gap-3.5 shadow-sm"
                       style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                     >
                       <div className="flex items-start gap-3">
                         <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                           <Calendar size={18} className="text-amber-505 text-amber-600" />
                         </div>
                         <div className="flex-1 min-w-0 text-left">
                           <h4 className="text-neutral-800 text-sm font-normal tracking-tight" style={{ fontWeight: 400 }}>
                             Upcoming payday alert
                           </h4>
                           <p className="text-xs text-neutral-500 mt-1 leading-relaxed" style={{ fontWeight: 400 }}>
                             Your monthly base income is dropping soon on Day {dbPayday}. Configure your breakdown matrix to secure your budget allocation.
                           </p>
                         </div>
                       </div>
                       <div className="flex items-center justify-end gap-2.5 pt-1">
                         <button
                           onClick={() => {
                             window.dispatchEvent(new CustomEvent('open-salary-breakdown-modal'));
                             setIsOpen(false);
                           }}
                           className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-[#FFFFFF] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md"
                           style={{ fontWeight: 700 }}
                         >
                           Configure breakdown
                         </button>
                       </div>
                     </div>
                   </div>
                 )}

                 {/* SALARY BREAKDOWN CONVERSION ACTION ALERTS */}
                 {maturedPendingSalaryBreakdowns.length > 0 && (
                   <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between">
                       <span 
                         className="text-[11px] text-neutral-500 font-bold tracking-wide"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                       >
                         Upcoming allocations
                       </span>
                       <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-650 border border-indigo-100 font-bold">
                         {maturedPendingSalaryBreakdowns.length} pending
                       </span>
                     </div>
  
                     <div className="flex flex-col gap-2.5">
                       {maturedPendingSalaryBreakdowns.map((sb, sbIdx) => {
                         const yearMonthStr = sb.id;
                         const [year, month] = yearMonthStr.split('-');
                         const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', { month: 'long' });
                         const activeAllocableKeys = (sb.activeEnvelopes || []).filter((k: string) => {
                           const val = Number(sb.allocations?.[k] || 0);
                           return val > 0;
                         });
                         
                         return (
                           <div
                             key={`hub-sb-alert-${sb.id}-${sbIdx}`}
                             className="p-4 bg-[#FFFFFF] border border-neutral-150 rounded-2xl flex flex-col gap-3.5 shadow-sm transition-all"
                             style={{ fontFamily: "'Google Sans', sans-serif" }}

                           >
                             <div className="flex items-start gap-3">
                               <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                 <Sparkles size={18} className="text-indigo-600" />
                               </div>
                               <div className="flex-1 min-w-0">
                                 <div className="flex items-center justify-between gap-1">
                                   <h4 className="text-neutral-800 text-sm font-bold tracking-wide" style={{ fontWeight: 700 }}>
                                     {monthName} {year} Salary distribution
                                   </h4>
                                   <span className="text-neutral-900 text-sm font-bold tracking-tight shrink-0" style={{ fontWeight: 700 }}>
                                     {sb.baseSalaryInput?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                   </span>
                                 </div>
                                 <p className="text-xs text-neutral-500 mt-1 leading-relaxed" style={{ fontWeight: 400 }}>
                                   Your planned allocation is mature. Confirming will distribute the funds to your designated envelope budgets and execute internal transfers.
                                 </p>
                               </div>
                             </div>
                             
                             <div className="flex items-center justify-end gap-2.5 pt-1">
                               <div className="w-full">
                                 {!sb.tier1Approved ? (
                                   <button
                                     onClick={() => handleConfirmTier1(sb, sb.selectedDbRecurringIncomes?.[0]?.accountId || sb.selectedIncomes?.[0] || accounts[0]?.id || '')}
                                     className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-[#FFFFFF] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm hover:shadow-md"
                                     style={{ fontWeight: 700 }}
                                   >
                                     Verify salary receipt
                                   </button>
                                 ) : (
                                   <div className="w-full text-left mt-2 border-t border-neutral-100 pt-3 animate-fade-in">
                                     <div className="flex items-center justify-between mb-2">
                                       <span className="text-[11px] text-neutral-500 font-bold" style={{ fontWeight: 700 }}>
                                         Allocation checklist
                                       </span>
                                       <span className="text-[11px] text-indigo-600 font-bold" style={{ fontWeight: 700 }}>
                                         {activeAllocableKeys.filter(k => sb.confirmedAllocations?.[k] === true).length} / {activeAllocableKeys.length} Done
                                       </span>
                                     </div>
                                     <div className="divide-y divide-neutral-100 max-h-[160px] overflow-y-auto pr-1">
                                       {activeAllocableKeys.map((key: string, allocIdx: number) => {
                                         const isLineConfirmed = sb.confirmedAllocations?.[key] === true;
                                         const allocatedAmt = Number(sb.allocations?.[key] || 0);
                                         
                                         let label = key;
                                         let isTransfer = key.startsWith('transfer__');
                                         let category = '';
                                         let subcategory = '';

                                         if (isTransfer) {
                                           const destId = key.replace('transfer__', '');
                                           const destAcc = accounts.find(a => a.id === destId);
                                           label = `Transfer to ${destAcc?.name || destId}`;
                                         } else {
                                           const parts = key.split('__');
                                           category = parts[0] || '';
                                           subcategory = parts[1] || '';
                                           label = subcategory ? `${category} > ${subcategory}` : category;
                                         }

                                         return (
                                           <div key={`sb-alloc-key-${key}-${allocIdx}`} className="py-2 flex items-center justify-between gap-3 text-left animate-fade-in">
                                             <div className="flex flex-col min-w-0">
                                               <span className="text-xs text-neutral-700 truncate font-normal" style={{ fontWeight: 400 }}>
                                                 {label}
                                               </span>
                                               <span style={{ fontWeight: 700 }} className="text-xs text-neutral-900 mt-0.5">
                                                 {sb.currency || 'AED'} {allocatedAmt.toLocaleString()}
                                               </span>
                                             </div>

                                             {isLineConfirmed ? (
                                               <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-normal flex items-center gap-0.5" style={{ fontWeight: 400 }}>
                                                 <Check size={10} className="stroke-[3]" />
                                                 Confirmed
                                               </span>
                                             ) : (
                                               <button
                                                 onClick={() => handleConfirmAllocationLine(
                                                   sb, 
                                                   key, 
                                                   allocatedAmt, 
                                                   isTransfer, 
                                                   category, 
                                                   subcategory, 
                                                   label, 
                                                   sb.selectedDbRecurringIncomes?.[0]?.accountId || sb.selectedIncomes?.[0] || accounts[0]?.id || ''
                                                 )}
                                                 className="text-[10px] text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer font-bold"
                                                 style={{ fontWeight: 700 }}
                                               >
                                                 Confirm
                                               </button>
                                             )}
                                           </div>
                                         );
                                       })}
                                     </div>
                                   </div>
                                 )}
                               </div>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   </div>
                 )}

                {/* 1. SECTION: Pending Approvals Stream */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-[10px] text-neutral-500 font-bold"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    >
                      Pending approvals
                    </span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-650 border border-rose-100 font-bold font-sans">
                      {eligibleDrafts.length} Action{eligibleDrafts.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {eligibleDrafts.length === 0 ? (
                    <div className="py-5 px-3 bg-neutral-50/70 rounded-xl border border-neutral-200/80 text-center flex flex-col items-center justify-center gap-1.5">
                      <ShieldCheck size={18} className="text-[#A6DDB1] dark:text-emerald-600 opacity-80" />
                      <span className="text-[11px] text-neutral-500 leading-relaxed font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>Approval queue is empty</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <AnimatePresence mode="popLayout">
                        {eligibleDrafts.map((tx, txIdx) => {
                          const associatedAccount = accounts.find(a => a.id === tx.accountId);
                          return (
                            <motion.div
                              key={`hub-tx-card-${tx.id || txIdx}-${txIdx}`}
                              layout
                              initial={{ transform: 'scale(0.95)', opacity: 0 }}
                              animate={{ transform: 'scale(1)', opacity: 1 }}
                              exit={{ transform: 'scale(0.9)', x: 50, opacity: 0 }}
                              className="p-3 bg-neutral-50 border border-neutral-200 hover:border-neutral-300 rounded-xl flex flex-col gap-2.5 transition-colors shadow-xs"
                            >
                              <div className="flex items-start justify-between gap-2.5 min-w-0">
                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-605 border border-rose-100'}`}>
                                    <span className="text-sm font-bold">{tx.emoji || (tx.type === 'income' ? '📈' : '📉')}</span>
                                  </div>
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span 
                                      className="text-neutral-800 leading-tight truncate font-sans"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 2.8vw, 13px)", fontWeight: 400 }}
                                    >
                                      {tx.notes || 'Scheduled Transaction'}
                                    </span>
                                    <span className="text-[9px] text-neutral-500 mt-0.5 font-bold">
                                      {associatedAccount?.name || 'Vantage Account'} ({associatedAccount?.currency || 'AED'})
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span 
                                    className="text-xs font-bold text-neutral-900 font-mono"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  >
                                    {tx.type === 'income' ? '+' : '-'}{associatedAccount?.currency || 'AED'} {Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[8.5px] text-neutral-400 mt-0.5" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                    Sched: {tx.date || '07/05/2026'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                                <button
                                  type="button"
                                  disabled={isProcessing === tx.id}
                                  onClick={() => handleApproveDraft(tx)}
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                  className="flex-1 h-[32px] bg-[#A6DDB1] text-neutral-900 rounded-lg text-[10px] hover:bg-[#A6DDB1]/90 hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                                >
                                  {isProcessing === tx.id ? 'Processing...' : 'Approve'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isProcessing === tx.id}
                                  onClick={() => handleDismissDraftWithConfirm(tx)}
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                  className="px-3 h-[32px] bg-transparent border border-rose-250 hover:bg-rose-50 hover:text-rose-700 text-rose-600 rounded-lg text-[10px] active:scale-95 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* 1.5 SECTION: ACTIVE NOTIFICATION LOG VIEW */}
                {(activeNotifications.length > 0 || activeBudgetAlerts.length > 0) && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span 
                        className="text-[10px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                      >
                        Dispatch push logs
                      </span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100 font-bold animate-pulse">
                        {activeNotifications.length + activeBudgetAlerts.length} Active alert{(activeNotifications.length + activeBudgetAlerts.length) !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* Budget alerts */}
                      {activeBudgetAlerts.map((node, nodeIdx) => {
                        const isWarning = node.type === 'warning';
                        const isDailySpendsAlert = node.isDailySpends || node.category?.toLowerCase().includes('daily') || node.budgetId?.toLowerCase().includes('daily');
                        const displayName = isDailySpendsAlert ? "Daily Spends Overview" : node.category;

                        return (
                          <div 
                            key={`logged-budget-alert-${node.id || nodeIdx}-${nodeIdx}`}
                            onClick={() => handleAlertClicked(node.budgetId)}
                            className={`p-3 bg-[#F8FAFC] dark:bg-neutral-800/40 border ${
                              isDailySpendsAlert || isWarning ? 'border-amber-300 bg-amber-500/5' : 'border-rose-300 bg-rose-500/5'
                            } rounded-xl flex items-center justify-between gap-3 shadow-xs cursor-pointer transition-all hover:bg-neutral-50 dark:hover:bg-neutral-800`}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isDailySpendsAlert || isWarning ? 'bg-amber-100 text-amber-500 border border-amber-200/30' : 'bg-rose-100 text-rose-700 border border-rose-200/30'
                              }`}>
                                <AlertCircle size={15} />
                              </div>
                              <div className="flex flex-col min-w-0 text-left">
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "12px", fontWeight: 700 }}
                                  className={`leading-tight break-words ${
                                    isDailySpendsAlert || isWarning ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold'
                                  }`}
                                >
                                  {displayName}
                                </span>
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1 font-sans" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                  {isDailySpendsAlert 
                                    ? 'Near consumed warning for Daily Spends budget at 80% boundary. Spent: ' 
                                    : (isWarning ? 'Near consumed warning for category budget. Spent: ' : 'Exceeded allocation limit for category budget. Spent: ')}
                                  <span className="font-sans" style={{ fontWeight: 700, color: '#000000' }}>
                                    {node.currency} {node.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>{' '}
                                  of total budget{' '}
                                  <span className="font-sans" style={{ fontWeight: 700, color: '#000000' }}>
                                    {node.currency} {node.limit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </span>
                                <span className={`text-[8.5px] mt-0.5 font-sans font-normal ${
                                  isDailySpendsAlert || isWarning ? 'text-amber-500' : 'text-rose-500'
                                }`}>
                                  Fired: {node.date} • {node.time}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleClearBudgetAlert(node.id)}
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, backgroundColor: '#A6DDB1', color: '#1E293B' }}
                                className="h-[28px] px-2.5 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 active:scale-95 hover:opacity-90 border border-[#A6DDB1]/10 font-sans"
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Checklist alarms */}
                      {activeNotifications.map((noti, notiIdx) => (
                        <div 
                          key={`logged-alert-${noti.id || notiIdx}-${notiIdx}`}
                          className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-rose-100 border border-rose-200/35 flex items-center justify-center shrink-0 text-rose-650">
                              <Bell size={15} />
                            </div>
                            <div className="flex flex-col min-w-0 text-left">
                              <span 
                                className="text-neutral-800 leading-tight truncate"
                                style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 2.8vw, 13px)", fontWeight: 405 }}
                              >
                                {noti.text}
                              </span>
                              <span className="text-[8.5px] text-neutral-500 mt-1" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                Fired: {noti.date} • {noti.time}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleChecklist(noti.id)}
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="h-[28px] px-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-250 text-neutral-850 rounded-lg text-[10px] transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                          >
                            <Check size={11} strokeWidth={3} /> Clear
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. SECTION: Reminders & Milestones */}
                <div className="flex flex-col gap-2">
                  <span 
                    className="text-[10px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  >
                    Reminders & timeline milestones
                  </span>

                  {allRemindersAndMilestones.length === 0 ? (
                    <div className="py-5 px-3 bg-neutral-50 rounded-xl border border-neutral-200/60 text-center flex flex-col items-center justify-center gap-1.5">
                      <TrendingUp size={18} className="text-[#A6DDB1] dark:text-emerald-600 opacity-80" />
                      <span className="text-[11px] text-neutral-500 leading-relaxed font-normal" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>No active milestones</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {allRemindersAndMilestones.map((reminder, rIdx) => {
                        const isHighPriority = reminder.type === 'past-due' || reminder.type === 'overrun';
                        return (
                          <div 
                            key={`hub-reminder-${rIdx}`}
                            className={`p-3 rounded-xl border flex flex-col gap-1 shadow-xs leading-relaxed ${
                              isHighPriority 
                                ? 'bg-rose-50/50 border-rose-250' 
                                : 'bg-neutral-50 border-neutral-200'
                            }`}
                          >
                            <span 
                              className={`text-[9.5px] font-bold ${
                                isHighPriority ? 'text-rose-600' : 'text-[#A6DDB1] dark:text-emerald-700'
                              }`}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            >
                              {reminder.title}
                            </span>
                            <p 
                              className="text-neutral-600 mt-0.5 leading-relaxed font-normal"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontSize: "clamp(11px, 2.8vw, 13px)", fontWeight: 400 }}
                            >
                              {reminder.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}                 {/* 3. SECTION: Financial Checklist */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span 
                      className="text-[10px] font-bold text-[#A6DDB1] dark:text-emerald-700"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                    >
                      Personal financial checklist
                    </span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-650 border border-neutral-200 font-bold">
                      {pendingChecklistsCount} Pending
                    </span>
                  </div>

                  {/* Checklist entry list */}
                  <div className="flex flex-col gap-2">
                    {checklist
                      .filter(item => !item.notified && item.status !== 'completed' && !item.completed)
                      .map((item, idx) => {
                        const isScheduled = !!item.scheduledAt;
                        return (
                          <div 
                            key={`todo-${item.id || 'fallback'}-${idx}`} 
                            className="flex items-center justify-between h-[50px] px-3 bg-neutral-50/60 border border-neutral-200/80 rounded-xl transition-all hover:bg-neutral-100/70 group/chk"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleChecklist(item.id)}
                              className="flex-1 flex items-center gap-2.5 text-left min-w-0 h-full cursor-pointer"
                            >
                              <div className="shrink-0 text-neutral-400 hover:text-[#A6DDB1]">
                                <Square size={16} className="text-neutral-400 hover:text-[#A6DDB1]" />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif", 
                                    fontSize: "clamp(11px, 2.8vw, 13px)",
                                    fontWeight: 400 
                                  }}
                                  className="truncate text-neutral-800"
                                >
                                  {item.text}
                                </span>
                                {isScheduled && (
                                  <span className="text-[8.5px] text-[#A6DDB1]/80 dark:text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                                    <span>⏲️ Scheduled: {item.date} at {item.time}</span>
                                  </span>
                                )}
                              </div>
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleDeleteChecklistItemWithConfirm(item.id)}
                              className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-rose-600 opacity-0 group-hover/chk:opacity-100 transition-opacity cursor-pointer shrink-0"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  {/* Quick Append form with Scheduling Picker */}
                  <form onSubmit={handleCreateChecklistItem} className="flex flex-col gap-2 mt-1" id="dispatch-chk-append-form">
                    <div className="flex gap-1.5">
                      <input 
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder="Append quick action..."
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                        className="flex-grow h-[38px] bg-white border border-neutral-250 rounded-xl px-3 text-xs text-neutral-800 placeholder-neutral-450 outline-none focus:border-[#A6DDB1] transition-colors leading-tight"
                      />
                      
                      <button
                        type="button"
                        onClick={handleToggleScheduler}
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center border transition-all cursor-pointer ${showScheduler ? 'bg-[#A6DDB1]/20 border-[#A6DDB1] text-[#A6DDB1]' : 'bg-white border-neutral-250 text-neutral-450 hover:text-neutral-800 hover:border-neutral-300'}`}
                        title="Schedule dynamic alarm"
                      >
                        <Calendar size={15} />
                      </button>

                      <button
                        type="submit"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="w-[38px] h-[38px] rounded-xl bg-[#A6DDB1] text-neutral-900 flex items-center justify-center hover:brightness-105 active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {showScheduler && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex flex-col gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            className="text-[9px] text-[#A6DDB1] dark:text-emerald-700 font-bold"
                          >
                            ⏲️ Automated Dispatch Time
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[7.5px] text-[#57606F] font-bold px-1">Date</label>
                            <input 
                              type="date"
                              value={schedDate}
                              onChange={(e) => setSchedDate(e.target.value)}
                              required={showScheduler}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="w-full h-[32px] bg-white border border-neutral-200 rounded-lg px-2 text-[11px] text-neutral-800 outline-none focus:border-[#A6DDB1] transition-colors text-center font-sans select-none"
                            />
                          </div>
                          
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[7.5px] text-[#57606F] font-bold px-1">Time</label>
                            <input 
                              type="time"
                              value={schedTime}
                              onChange={(e) => setSchedTime(e.target.value)}
                              required={showScheduler}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="w-full h-[32px] bg-white border border-neutral-200 rounded-lg px-2 text-[11px] text-neutral-800 outline-none focus:border-[#A6DDB1] transition-colors text-center font-sans select-none"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </form>
                </div>

                {/* 4. SECTION: COMPLETED REMINDERS (COLLAPSIBLE ARCHIVAL LIST) */}
                {completedReminders.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-neutral-150 text-left">
                    <button
                      type="button"
                      onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="flex items-center justify-between w-full text-[10px] font-bold text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer outline-none"
                    >
                      <span className="flex items-center gap-1.5 font-sans" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                        🗄️ Completed reminders
                      </span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200 font-bold flex items-center gap-1">
                        {completedReminders.length} Archived {isCompletedExpanded ? '▲' : '▼'}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isCompletedExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-col gap-2 overflow-hidden mt-1"
                        >
                          <div className="flex flex-col gap-2">
                            {completedReminders.map((item, idx) => {
                              const isScheduled = !!item.scheduledAt;
                              return (
                                <motion.div 
                                  key={`completed-${item.id || 'fallback'}-${idx}`}
                                  layout
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="flex items-center justify-between h-[50px] px-3 bg-neutral-50/50 border border-neutral-200/50 rounded-xl opacity-60 hover:opacity-100 transition-opacity group/comp"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleToggleChecklist(item.id)}
                                    className="flex-1 flex items-center gap-2.5 text-left min-w-0 h-full cursor-pointer"
                                  >
                                    <div className="shrink-0 text-[#A6DDB1]">
                                      <CheckSquare size={16} strokeWidth={2.5} />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span 
                                        style={{ 
                                          fontFamily: "'Google Sans', sans-serif", 
                                          fontSize: "clamp(11px, 2.8vw, 13px)",
                                          fontWeight: 400,
                                          textDecoration: 'line-through' 
                                        }}
                                        className="truncate text-neutral-400 line-through"
                                      >
                                        {item.text}
                                      </span>
                                      {isScheduled && (
                                        <span className="text-[8px] text-neutral-400 font-bold mt-0.5 line-through decoration-neutral-300">
                                          Was scheduled: {item.date} at {item.time}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                  
                                  <div className="flex items-center gap-1.5 shrink-0 select-none font-sans">
                                    {/* Uncheck / Restore button */}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleChecklist(item.id)}
                                      title="Restore to active queue"
                                      className="px-2 h-7 rounded-md hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-[#A6DDB1] opacity-0 group-hover/comp:opacity-100 transition-opacity cursor-pointer text-[10px]"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    >
                                      Restore
                                    </button>

                                    {/* Delete button */}
                                    <button 
                                      type="button"
                                      onClick={() => handleDeleteChecklistItemWithConfirm(item.id)}
                                      title="Permanently remove"
                                      className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-405 hover:text-rose-500 opacity-0 group-hover/comp:opacity-100 transition-opacity cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                </div>
                </div>
              
              {/* Dispatch body close */}
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>

      {/* Two-step Confirmation Safeguard Modal Modal Popup */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Dark modal background blur */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/80 backdrop-blur-xs"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="bg-[#1E293B] border border-[#2F3542] rounded-2xl p-5 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center gap-4 text-white"
              id="dispatch-confirm-[safeguard]"
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/25 shrink-0 text-rose-500">
                <AlertTriangle size={22} />
              </div>

              <div className="flex flex-col gap-1">
                <h4 
                  className="text-sm font-bold text-rose-400"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                >
                  Confirm Proceeding
                </h4>
                <p 
                  className="text-xs text-neutral-300 mt-1 leading-relaxed"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                >
                  {confirmModal.message}
                </p>
              </div>

              <div className="flex items-center gap-2 w-full mt-1">
                <button
                  onClick={async () => {
                    const confirmFn = confirmModal.onConfirm;
                    await confirmFn();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  }}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  className="flex-1 h-[38px] bg-rose-500 hover:bg-rose-600 transition-colors text-white text-[10px] rounded-xl hover:brightness-105 active:scale-95 cursor-pointer"
                >
                  Proceed
                </button>
                <button
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="flex-1 h-[38px] bg-transparent hover:bg-neutral-800 transition-all border border-[#2F3542] text-neutral-300 text-[10px] rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <SalaryBreakdownVerificationModal
        isOpen={verifyingSb !== null}
        onClose={() => setVerifyingSb(null)}
        sb={verifyingSb}
        accounts={accounts}
        miniBudgets={miniBudgets}
        uid={uid}
        onTransactionApproved={onTransactionApproved}
      />

    </React.Fragment>
  );
};
