/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layout } from './components/Layout';
import { Analytics } from './components/Analytics';
import { Transactions } from './components/Transactions';
import { DailyLog } from './components/DailyLog';
import { Settings } from './components/Settings';
import { Budgets } from './components/Budgets';
import { Accounts } from './components/Accounts';
import { BiometricLogin } from './components/BiometricLogin';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { GeminiAssistant } from './components/GeminiAssistant';
import { projectRecurringTransactions } from './lib/projection';
import { Plus, Sparkles } from 'lucide-react';
import { collection, query, where, getDocs, writeBatch, onSnapshot, orderBy, doc, getDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from './lib/firebase';
import { calculateAccountBalances, calculateExpectedBankBalance } from './lib/trendUtils';
import { handleFirestoreError, OperationType } from './lib/firebaseUtils';
import { useTheme, Theme } from './hooks/useTheme';
import { OnboardingFlow } from './components/OnboardingFlow';
import { PremiumModal } from './components/PremiumModal';
import { ProductTour } from './components/ProductTour';
import { NotificationDispatchHub } from './components/NotificationDispatchHub';
import { triggerHaptic, hapticPresets } from './lib/haptics';

export enum Tab {
  ANALYTICS = 'analytics',
  TRANSACTIONS = 'transactions',
  BUDGETS = 'budgets',
  DAILY_LOG = 'daily_log',
  SETTINGS = 'settings',
  ACCOUNTS = 'accounts',
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DAILY_LOG);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const { theme, setTheme } = useTheme((userProfile?.theme as Theme) || (userProfile?.isOnboarded ? 'light' : 'dark'));

  const handleSessionExpiration = React.useCallback(() => {
    localStorage.removeItem('vantage_session_token');
    localStorage.removeItem('vantage_active_session_profile');
    setUserProfile(null);
    setActiveTab(Tab.DAILY_LOG);
    signOut(auth).catch(() => {});
  }, []);

  const handleLoginSuccess = React.useCallback((profile: any) => {
    if (profile) {
      localStorage.setItem('vantage_session_token', profile.uid);
      localStorage.setItem('vantage_active_session_profile', JSON.stringify(profile));
      setUserProfile(profile);
      setActiveTab(Tab.ANALYTICS);
    }
  }, []);

  useEffect(() => {
    const handleVantageLogout = () => {
      setUserProfile(null);
      setActiveTab(Tab.DAILY_LOG);
    };
    window.addEventListener('vantage-logout', handleVantageLogout);

    // Initial check for cached session (instant Auto-Login experience)
    const storedToken = localStorage.getItem('vantage_session_token');
    const storedProfileStr = localStorage.getItem('vantage_active_session_profile');
    if (storedToken && storedProfileStr) {
      try {
        const cachedProfile = JSON.parse(storedProfileStr);
        if (cachedProfile && cachedProfile.uid === storedToken) {
          setUserProfile(cachedProfile);
          setActiveTab(Tab.ANALYTICS);
        }
      } catch (e) {
        console.warn("Failed loading cached user profile on initial boot:", e);
      }
    }

    // Setup real-time Firebase Auth standard observer
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const freshProfile = { ...userSnap.data(), uid: user.uid };
            setUserProfile(freshProfile);
            localStorage.setItem('vantage_session_token', user.uid);
            localStorage.setItem('vantage_active_session_profile', JSON.stringify(freshProfile));
          } else {
            const newProfileObj = {
              uid: user.uid,
              fullName: user.displayName || '',
              displayName: user.displayName ? user.displayName.split(' ')[0] : '',
              email: user.email || 'vantage.user@private.com',
              dob: "1990-01-01T00:00:00Z",
              maritalStatus: "Single",
              dependents: [],
              baseCurrency: "AED",
              enabledCurrencies: ["AED", "USD"],
              financialExperience: 3,
              financialGoals: "Buy a family villa, optimize long-term savings",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              geminiInsightsEnabled: true,
              hasAcceptedTerms: false,
              onboardedAt: "",
              lastLogin: new Date().toISOString(),
              subscriptionTier: "Premium",
              isOnboarded: false
            };
            setUserProfile(newProfileObj);
            localStorage.setItem('vantage_session_token', user.uid);
            localStorage.setItem('vantage_active_session_profile', JSON.stringify(newProfileObj));
          }
        } catch (err: any) {
          console.warn("Background Firebase database profile lookup failed:", err);
          if (err.code === 'permission-denied' || err.message?.includes("Missing or insufficient permissions")) {
            handleSessionExpiration();
          }
        }
      } else {
        const activeToken = localStorage.getItem('vantage_session_token');
        if (activeToken && !activeToken.startsWith('usr_') && activeToken !== 'dev-sandbox-user' && activeToken !== 'vantage-admin') {
          handleSessionExpiration();
        }
      }
      setIsLoadingAuth(false);
    });

    const fallbackTimer = setTimeout(() => {
      setIsLoadingAuth(false);
    }, 1200);

    return () => {
      unsubscribeAuth();
      clearTimeout(fallbackTimer);
      window.removeEventListener('vantage-logout', handleVantageLogout);
    };
  }, [handleSessionExpiration]);

  useEffect(() => {
    if (userProfile?.theme) {
      setTheme(userProfile.theme);
    }
  }, [userProfile?.theme, setTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const size = userProfile?.fontSize || localStorage.getItem('vantage_font_size') || 'normal';
    let sizePx = '16px';
    if (size === 'small') sizePx = '14px';
    else if (size === 'normal') sizePx = '16px';
    else if (size === 'large') sizePx = '18px';
    else if (size === 'xlarge') sizePx = '20px';
    root.style.fontSize = sizePx;
    root.style.setProperty('--app-base-font-size', sizePx);

    const font = userProfile?.fontFamily || localStorage.getItem('vantage_font_family') || 'Google Sans';
    let fontFamilyVal = "'Google Sans', sans-serif";
    if (font === 'Plus Jakarta Sans') {
      fontFamilyVal = "'Plus Jakarta Sans', sans-serif";
    } else if (font === 'JetBrains Mono') {
      fontFamilyVal = "'JetBrains Mono', monospace";
    } else if (font === 'System Sans') {
      fontFamilyVal = "sans-serif";
    } else if (font === 'System Serif') {
      fontFamilyVal = "serif";
    }
    root.style.setProperty('--app-font-family', fontFamilyVal);
  }, [userProfile?.fontSize, userProfile?.fontFamily]);

  useEffect(() => {
    const handleOpenDailyLogBudget = () => {
      setActiveTab(Tab.DAILY_LOG);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('trigger-daily-log-budget-config'));
      }, 150);
    };
    const handleRouteEssentialsSubtab = (e: Event) => {
      const customEvent = e as CustomEvent;
      const subtab = customEvent.detail?.subtab;
      setActiveTab(Tab.DAILY_LOG);
      if (subtab) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('set-daily-log-subtab', { detail: { subtab } }));
        }, 150);
      }
    };
    const handleNavigateTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      const targetTab = customEvent.detail?.tab;
      if (targetTab) {
        setActiveTab(targetTab);
      }
    };
    const handleOpenAI = () => {
      setIsAIModalOpen(true);
    };
    const handleOpenTx = (e: Event) => {
      const customEvent = e as CustomEvent;
      const tData = customEvent.detail || null;
      setInitialTxData(tData);
      setIsTxModalOpen(true);
    };
    window.addEventListener('open-daily-log-budget-modal', handleOpenDailyLogBudget);
    window.addEventListener('route-essentials-subtab', handleRouteEssentialsSubtab);
    window.addEventListener('vantage-navigate-tab', handleNavigateTab);
    window.addEventListener('open-vantage-ai', handleOpenAI);
    window.addEventListener('open-vantage-add-transaction', handleOpenTx);
    return () => {
      window.removeEventListener('open-daily-log-budget-modal', handleOpenDailyLogBudget);
      window.removeEventListener('route-essentials-subtab', handleRouteEssentialsSubtab);
      window.removeEventListener('vantage-navigate-tab', handleNavigateTab);
      window.removeEventListener('open-vantage-ai', handleOpenAI);
      window.removeEventListener('open-vantage-add-transaction', handleOpenTx);
    };
  }, []);

  // Deeplinking / URL Query params routing parser for background notification clicks
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab');
      const urlSubTab = params.get('subTab') || params.get('subtab');
      const isQuickAdd = params.get('quickadd') === 'true';

      if (isQuickAdd) {
        setActiveTab(Tab.ANALYTICS);
        setTimeout(() => {
          const element = document.getElementById('android-widget-configurator');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            // Apply a nice focus transition/glow
            element.classList.add('ring-4', 'ring-[#A6DDB1]/45');
            setTimeout(() => {
              element.classList.remove('ring-4', 'ring-[#A6DDB1]/45');
            }, 3000);
          }
        }, 800);
      } else if (urlTab) {
        if (urlTab === 'daily_log') {
          setActiveTab(Tab.DAILY_LOG);
          if (urlSubTab === 'daily' || urlSubTab === 'savings' || urlSubTab === 'debt') {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('set-daily-log-subtab', { detail: { subtab: urlSubTab } }));
            }, 300);
          }
        } else {
          const matchedTab = Object.values(Tab).find(t => t === urlTab);
          if (matchedTab) {
            setActiveTab(matchedTab);
          }
        }
      }
    } catch (e) {
      console.warn("URL query router failed:", e);
    }
  }, []);
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [initialTxData, setInitialTxData] = useState<any>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);

  // Product Tour System State
  const [currentTourStep, setCurrentTourStep] = useState<number | null>(null);

  // Initialize product tour from userProfile setting
  useEffect(() => {
    if (userProfile?.isOnboarded && userProfile?.isProductTourActive && currentTourStep === null) {
      setCurrentTourStep(1);
      setActiveTab(Tab.ANALYTICS);
    }
  }, [userProfile, currentTourStep]);

  const handleNextTourStep = () => {
    if (currentTourStep === null) return;
    if (currentTourStep < 10) {
      const nextStep = currentTourStep + 1;
      
      // Map steps to tabs
      if (nextStep === 2) setActiveTab(Tab.ANALYTICS);
      if (nextStep === 3) setActiveTab(Tab.ACCOUNTS);
      if (nextStep === 4) setActiveTab(Tab.TRANSACTIONS);
      if (nextStep === 5 || nextStep === 6 || nextStep === 7) setActiveTab(Tab.DAILY_LOG);
      
      setCurrentTourStep(nextStep);
    } else {
      handleFinishTour();
    }
  };

  const handlePreviousTourStep = () => {
    if (currentTourStep === null) return;
    if (currentTourStep > 1) {
      const prevStep = currentTourStep - 1;
      
      // Map steps to tabs
      if (prevStep === 2) setActiveTab(Tab.ANALYTICS);
      if (prevStep === 3) setActiveTab(Tab.ACCOUNTS);
      if (prevStep === 4) setActiveTab(Tab.TRANSACTIONS);
      if (prevStep === 5 || prevStep === 6 || prevStep === 7) setActiveTab(Tab.DAILY_LOG);

      setCurrentTourStep(prevStep);
    }
  };

  const handleFinishTour = async () => {
    setCurrentTourStep(null);
    const updated = { ...userProfile, isProductTourActive: false };
    setUserProfile(updated);
    
    localStorage.setItem(`vantage_offline_profile_${userProfile.uid}`, JSON.stringify(updated));
    
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', userProfile.uid);
      setDoc(userRef, { isProductTourActive: false }, { merge: true }).catch(err => {
        console.warn("Optimistic background sync (tour disabled):", err);
      });
    } catch (e) {
      console.warn("Error background synching-off tour state:", e);
    }
  };

  // Global Data State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [recurringRules, setRecurringRules] = useState<any[]>([]);
  const [accountBalances, setAccountBalances] = useState<Record<string, number>>({});

  const transactionsWithProjections = React.useMemo(() => {
    const projected = projectRecurringTransactions(recurringRules, transactions, 60);
    return [...transactions, ...projected];
  }, [transactions, recurringRules]);

  useEffect(() => {
    if (!userProfile?.uid) return;

    const handleSnapshotErr = (err: any) => {
      if (err && (err.code === 'permission-denied' || err.message?.includes("Missing or insufficient permissions") || err.message?.includes("permission-denied"))) {
        console.warn("Snapshot subscription hit permission denied. Expiring session...");
        handleSessionExpiration();
      }
    };

    // 1. Fetch Accounts
    const accRef = collection(db, `users/${userProfile.uid}/accounts`);
    const unsubAcc = onSnapshot(accRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length === 0) {
        // Safe offline recovery fallback
        const offlineAccs = localStorage.getItem(`vantage_offline_accounts_${userProfile.uid}`);
        if (offlineAccs) {
          try {
            setAccounts(JSON.parse(offlineAccs));
            return;
          } catch (_) {}
        }
      }
      setAccounts(list);
    }, (error) => {
      console.warn("Real-time accounts connection dropped. Initializing local workspace cache.");
      handleSnapshotErr(error);
      const offlineAccs = localStorage.getItem(`vantage_offline_accounts_${userProfile.uid}`);
      if (offlineAccs) {
        try {
          setAccounts(JSON.parse(offlineAccs));
        } catch (_) {}
      }
    });

    // 2. Fetch Transactions
    const txRef = collection(db, `users/${userProfile.uid}/transactions`);
    const qTx = query(txRef, orderBy('date', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(list);
    }, (error) => {
      console.warn("Real-time transactions connection dropped. Relying on local persistent state.");
      handleSnapshotErr(error);
    });

    // 2.5 Fetch Recurring rules globally
    const recRef = collection(db, `users/${userProfile.uid}/recurringTransactions`);
    const unsubRec = onSnapshot(recRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecurringRules(list);
    }, (error) => {
      console.warn("Failed to subscribe to recurring transactions globally:", error);
    });

    // 3. Migrate Transfers (existing logic)
    const migrateTransfers = async () => {
      try {
        const trRef = collection(db, `users/${userProfile.uid}/transactions`);
        const q = query(
          trRef,
          where('type', '==', 'transfer'),
          where('category', '==', 'Internal Movement')
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            batch.update(d.ref, { category: 'Internal Transfer' });
          });
          await batch.commit();
        }
      } catch (err) {
        console.warn("Migration update deferred (will retry when connection established):", err);
      }
    };
    migrateTransfers();

    return () => {
      unsubAcc();
      unsubTx();
      unsubRec();
    };
  }, [userProfile?.uid, handleSessionExpiration]);

  // Derived Balances & Real-Time Sync
  useEffect(() => {
    if (accounts.length > 0) {
      const balances = calculateAccountBalances(accounts, transactions);
      setAccountBalances(balances);
    } else if (accounts.length === 0) {
      setAccountBalances({});
    }
  }, [accounts, transactions]);

  // Recheck all accounts on Firebase and cross-check against transactions
  useEffect(() => {
    if (!userProfile?.uid || accounts.length === 0) return;
    
    const balances = calculateAccountBalances(accounts, transactions);
    
    accounts.forEach(async (acc) => {
      const calculatedBal = balances[acc.id] ?? Number(acc.startingBalance || 0);
      const currentStoredBal = Number(acc.currentBalance);
      
      // If there is a sync mismatch (greater than tiny rounding tolerance)
      if (Math.abs(calculatedBal - currentStoredBal) > 0.01) {
        console.log(`Reconciling Firestore account ${acc.id} (${acc.name}): stored currentBalance is ${currentStoredBal}, real-time ledger balance is ${calculatedBal}`);
        try {
          const accRef = doc(db, `users/${userProfile.uid}/accounts/${acc.id}`);
          await updateDoc(accRef, {
            currentBalance: calculatedBal,
            updatedAt: new Date().toISOString()
          });
        } catch (err) {
          console.warn(`Failed to reconcile Firestore account ${acc.id} balance:`, err);
        }
      }
    });
  }, [accounts, transactions, userProfile?.uid]);

  const refreshGlobalBalances = React.useCallback(async () => {
    if (!userProfile?.uid) return;
    try {
      console.log("Forcing tactical global balances hydration...");
      const accRef = collection(db, `users/${userProfile.uid}/accounts`);
      const accSnap = await getDocs(accRef);
      const accList = accSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(accList);

      const txRef = collection(db, `users/${userProfile.uid}/transactions`);
      const qTx = query(txRef, orderBy('date', 'desc'));
      const txSnap = await getDocs(qTx);
      const txList = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(txList);
      
      const balances = calculateAccountBalances(accList as any, txList as any);
      setAccountBalances(balances);
    } catch (e) {
      console.error("refreshGlobalBalances manual override execution hit error:", e);
    }
  }, [userProfile?.uid]);

  const handleAddTransaction = React.useCallback(() => setIsTxModalOpen(true), []);
  const handleAddAccount = React.useCallback(() => setIsAddAccountOpen(true), []);
  const handleAIModalClose = React.useCallback(() => setIsAIModalOpen(false), []);
  const handleNavigateToTransactions = React.useCallback((accId?: string) => {
    setFilterAccountId(accId || null);
    setActiveTab(Tab.TRANSACTIONS);
  }, []);

  // Smart Retention Notifications
  useEffect(() => {
    if (!userProfile?.uid || accounts.length === 0) return;

    const checkReminder = () => {
      if (!("Notification" in window)) return;
      
      const now = new Date();
      // Trigger at 8:00 PM (20:00)
      if (now.getHours() >= 20) {
        const today = now.toISOString().split('T')[0];
        const lastSent = localStorage.getItem(`vantage_last_reminder_${userProfile.uid}`);
        
        if (lastSent !== today) {
          // Check if any cash account has dailySpendReminder enabled
          const hasReminderEnabled = accounts.some(a => (a.type === 'cash' || a.type === 'Cash') && a.dailySpendReminder === true);
          
          if (hasReminderEnabled) {
            if (Notification.permission === 'granted') {
              const notification = new Notification('Vantage Cash Reminder 💸', {
                body: 'Did you spend any cash today? Log your quick spends to keep your net surplus accurate.',
                tag: 'daily-spend-reminder'
              });
              notification.onclick = () => {
                setActiveTab(Tab.DAILY_LOG);
                window.focus();
              };
              localStorage.setItem(`vantage_last_reminder_${userProfile.uid}`, today);
            } else if (Notification.permission === 'default') {
              Notification.requestPermission();
            }
          }
        }
      }
    };

    // Check every 5 minutes to be efficient
    const interval = setInterval(checkReminder, 1000 * 60 * 5);
    checkReminder();

    return () => clearInterval(interval);
  }, [userProfile?.uid, accounts, setActiveTab]);

  const renderContent = () => {
    if (!userProfile) return null;
    switch (activeTab) {
      case Tab.TRANSACTIONS:
        return (
          <Transactions 
            key="transactions" 
            profile={userProfile} 
            onUpdateProfile={setUserProfile}
            filterAccountId={filterAccountId}
            accounts={accounts}
            accountBalances={accountBalances}
            onClearFilter={() => setFilterAccountId(null)}
            onBackToDashboard={() => {
              setFilterAccountId(null);
              setActiveTab(Tab.ANALYTICS);
            }}
            refreshGlobalBalances={refreshGlobalBalances}
          />
        );
      case Tab.BUDGETS:
        return <Budgets key="budgets" profile={userProfile} />;
      case Tab.DAILY_LOG:
        return <DailyLog key="daily_log" profile={userProfile} />;
      case Tab.SETTINGS:
        return <Settings key="settings" profile={userProfile} accounts={accounts} onUpdateProfile={setUserProfile} />;
      case Tab.ACCOUNTS:
        return (
          <Accounts 
            key="accounts" 
            profile={userProfile} 
            onNavigateToTransactions={handleNavigateToTransactions} 
          />
        );
      case Tab.ANALYTICS:
      default:
        return (
          <Analytics 
            key="analytics" 
            profile={userProfile} 
            onUpdateProfile={setUserProfile} 
            onAddTransaction={handleAddTransaction}
            onAddAccount={handleAddAccount}
            accounts={accounts}
            allTransactions={transactionsWithProjections}
            accountBalances={accountBalances}
            onNavigateToTransactions={handleNavigateToTransactions} 
          />
        );
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#FFFFFF] flex flex-col items-center justify-center font-sans" style={{ fontFamily: '"Google Sans", "Plus Jakarta Sans", sans-serif' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-[38px] h-[38px] border-2 border-neutral-200 border-t-black rounded-full animate-spin"></div>
          <p className="text-[#57606F] text-[10px] tracking-wide font-normal" style={{ fontWeight: 400 }}>
            Verifying security handshake
          </p>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    return <BiometricLogin onSuccess={handleLoginSuccess} />;
  }

  if (!userProfile.isOnboarded) {
    return (
      <OnboardingFlow 
        uid={userProfile.uid} 
        profile={userProfile} 
        onSuccess={(updatedProfile) => {
          localStorage.setItem('vantage_session_token', updatedProfile.uid);
          localStorage.setItem('vantage_active_session_profile', JSON.stringify(updatedProfile));
          setUserProfile(updatedProfile);
          setActiveTab(Tab.ANALYTICS);
        }} 
      />
    );
  }

  const isPremium = userProfile.subscriptionTier === 'premium';

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} isPremium={isPremium} isAIModalOpen={isAIModalOpen} setIsAIModalOpen={setIsAIModalOpen} profile={userProfile} accounts={accounts}>
      <AnimatePresence mode="wait">
        <motion.div
           key={activeTab}
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           exit={{ opacity: 0, y: -10 }}
           transition={{ duration: 0.15, ease: 'easeOut' }}
           className="w-full"
        >

          {renderContent()}
        </motion.div>
      </AnimatePresence>

      {/* Floating Action Buttons */}
      <AnimatePresence>
        {!isTxModalOpen && (
          <div className="fixed bottom-[130px] lg:bottom-8 right-6 flex flex-col items-center gap-3.5 z-50">
            {/* Vantage Dispatch Hub */}
            <NotificationDispatchHub 
              uid={userProfile.uid}
              accounts={accounts}
              transactions={transactions}
              accountBalances={accountBalances}
            />

            {/* Global Plus Button */}
            <motion.button
               id="tour-fab-plus"
               key="fab-plus"
               initial={{ opacity: 0, scale: 0.8, rotate: -45 }}
               animate={{ opacity: 1, scale: 1, rotate: 0 }}
               exit={{ opacity: 0, scale: 0.8, rotate: 45 }}
               transition={{ duration: 0.15 }}
               whileHover={{ scale: 1.05 }}
               whileTap={{ scale: 0.95 }}
               onClick={() => {
                 triggerHaptic(hapticPresets.heavy);
                 setIsTxModalOpen(true);
               }}
               className="w-[60px] h-[60px] max-w-[60px] max-h-[60px] bg-vantage-green dark:bg-white rounded-full shadow-2xl shadow-vantage-green/30 dark:shadow-white/10 flex items-center justify-center text-black"
            >
              <Plus size={28} strokeWidth={3} />
            </motion.button>
          </div>
        )}
      </AnimatePresence>

      <AddTransactionModal 
        isOpen={isTxModalOpen} 
        onClose={() => {
          setIsTxModalOpen(false);
          setInitialTxData(null);
        }} 
        uid={userProfile.uid}
        isPremium={!!(userProfile?.isPremium || userProfile?.subscriptionTier === 'premium')}
        onSuccess={() => {}}
        onNewAccount={() => {
          setIsTxModalOpen(false);
          setIsAddAccountOpen(true);
        }}
        initialTransactionData={initialTxData}
        profile={userProfile}
        accounts={accounts}
        allTransactions={transactions}
      />

      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        uid={userProfile.uid}
        profile={userProfile}
        onAccountAdded={() => {}}
      />

      {isAIModalOpen && (
        <GeminiAssistant 
          isOpen={isAIModalOpen}
          onClose={handleAIModalClose}
          uid={userProfile.uid}
          accounts={accounts}
          transactions={transactions}
          accountBalances={accountBalances}
          profile={userProfile}
          refreshGlobalBalances={refreshGlobalBalances}
        />
      )}

      <PremiumModal 
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        uid={userProfile.uid}
        profile={userProfile}
        onSuccess={setUserProfile}
      />

      {/* Product Tour Modal Component Overlay Layer */}
      <AnimatePresence>
        {currentTourStep !== null && (
          <ProductTour
            step={currentTourStep}
            activeTab={activeTab}
            onBack={handlePreviousTourStep}
            onNext={handleNextTourStep}
            onSkip={handleFinishTour}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
