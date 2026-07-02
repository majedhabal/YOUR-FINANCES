import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection, updateDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { Layout } from './components/Layout';
import { Settings } from './components/Settings';
import { BiometricLogin } from './components/BiometricLogin';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProductTour } from './components/ProductTour';
import { AddTransactionModal } from './components/AddTransactionModal';
import { AddAccountModal } from './components/AddAccountModal';
import { VantageDataErrorBoundary } from './components/VantageDataErrorBoundary';
import { RefreshCw } from 'lucide-react';
import i18n from './lib/i18n';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Essentials, MilestoneConfigModal } from './components/Essentials';
import { DebtMilestoneConfigModal } from './components/DebtMilestoneConfigModal';
import { Accounts } from './components/Accounts';
import { VantageAI } from './components/VantageAI';
import { Transactions } from './components/Transactions';
import { Analytics } from './components/Analytics';
import { SalaryBreakdownModal } from './components/SalaryBreakdownModal';
import { StreakAnimation } from './components/StreakAnimation';
import { DEFAULT_RATES, syncExchangeRates } from './lib/exchangeRates';
import { calculateAccountBalances } from './lib/trendUtils';

export type Tab = 'essentials' | 'accounts' | 'ai' | 'activity' | 'analytics' | 'settings' | 'salary-breakdown';

const animation = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

// We isolate the internal application content so the parent Error Boundary can monitor its states
function AppContent() {
  const { i18n: i18nextInstance } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('essentials');
  const [streakUpdated, setStreakUpdated] = useState(false);
  const [showStreakAnimation, setShowStreakAnimation] = useState(false);
  const [animatingStreak, setAnimatingStreak] = useState(0);
  const [isBonusStreak, setIsBonusStreak] = useState(false);
  
  // Feature Modal Interface Toggles
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txMode, setTxMode] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [isAccountModalOpen, setIsAddAccountOpen] = useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [isDebtMilestoneModalOpen, setIsDebtMilestoneModalOpen] = useState(false);
  const [currentTourStep, setCurrentTourStep] = useState<number | null>(null);

  // Synchronized state pools for analytics routing
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);

  const isRTL = ['ar', 'ur'].includes(i18nextInstance.language);

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }, [i18nextInstance.language, isRTL]);

  const accountBalances = React.useMemo(() => {
    return calculateAccountBalances(accounts, transactions);
  }, [accounts, transactions]);

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };

  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Safe suppressor
      }
    };
    loadRates();
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab) setActiveTab(e.detail.tab);
    };
    const handleOpenAIChat = () => {
      setIsAIModalOpen(true);
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    window.addEventListener('open-vantage-ai-chat', handleOpenAIChat);
    return () => {
      window.removeEventListener('switch-tab', handleSwitchTab);
      window.removeEventListener('open-vantage-ai-chat', handleOpenAIChat);
    };
  }, []);

  useEffect(() => {
    const handleForwardSavings = () => {
      setIsMilestoneModalOpen(true);
    };
    const handleForwardDebt = () => {
      setIsDebtMilestoneModalOpen(true);
    };

    window.addEventListener('trigger-savings-goal-config', handleForwardSavings);
    window.addEventListener('trigger-debt-config', handleForwardDebt);
    return () => {
      window.removeEventListener('trigger-savings-goal-config', handleForwardSavings);
      window.removeEventListener('trigger-debt-config', handleForwardDebt);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('milestone-modal-toggled', { detail: { isOpen: isMilestoneModalOpen } }));
  }, [isMilestoneModalOpen]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('debt-milestone-modal-toggled', { detail: { isOpen: isDebtMilestoneModalOpen } }));
  }, [isDebtMilestoneModalOpen]);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // Establish real-time persistent data pipe to flat root profile schema
        const profileRef = doc(db, 'users', currentUser.uid);

        const unsubProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data();
            
            // Streak Calculation Logic
            const today = new Date().toISOString().split('T')[0];
            const lastLoginDate = profileData.lastLoginDate || "";
            
            console.log("Streak check:", { today, lastLoginDate, dailyStreak: profileData.dailyStreak });
            
            if (lastLoginDate !== today) {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];
              
              let newStreak = 1;
              if (lastLoginDate === yesterdayStr) {
                newStreak = (profileData.dailyStreak || 0) + 1;
              }
              
              console.log("Updating streak:", newStreak);
              const updateData: any = {
                dailyStreak: newStreak,
                lastLoginDate: today
              };

              if (newStreak % 30 === 0) {
                updateData.aiTokens = (profileData.aiTokens || 0) + 500;
                setIsBonusStreak(true);
              } else {
                setIsBonusStreak(false);
              }

              await updateDoc(profileRef, updateData);
              setStreakUpdated(true);
              setAnimatingStreak(newStreak);
              setShowStreakAnimation(true);
              setTimeout(() => setStreakUpdated(false), 3000);
            }

            setProfile({ uid: currentUser.uid, ...profileData });
            
            // Sync saved language if available
            if (profileData.language) {
              i18n.changeLanguage(profileData.language);
            }
            
            // Trigger tactical tour sequence dynamically if onboarding just cleared
            if (profileData.hasAcceptedTerms && !localStorage.getItem(`vantage_tour_completed_${currentUser.uid}`)) {
              setCurrentTourStep(1);
            }
          } else {
            // Un-onboarded flat user state catch pass
            setProfile({ uid: currentUser.uid, hasAcceptedTerms: false });
          }
          setLoading(false);
        }, (error) => {
          console.error("Profile security stream intercept error:", error);
          setLoading(false);
        });

        return () => unsubProfile();
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Sync structural account balances matrices downstream when active user logs exist
  useEffect(() => {
    if (!user) return;

    const accountsRef = collection(db, 'users', user.uid, 'accounts');
    const unsubAccounts = onSnapshot(accountsRef, (snapshot) => {
      const accList: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        accList.push({ id: doc.id, ...data });
      });
      setAccounts(accList);
    }, (error) => {
      console.warn("Accounts streaming transport errored safely:", error);
    });

    const txRef = collection(db, 'users', user.uid, 'transactions');
    const unsubTx = onSnapshot(txRef, (snapshot) => {
      const txList: any[] = [];
      snapshot.forEach(doc => txList.push({ id: doc.id, ...doc.data() }));
      setTransactions(txList);
    }, (error) => {
      console.warn("Ledger streaming transport errored safely:", error);
    });

    return () => {
      unsubAccounts();
      unsubTx();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-[#1E2229] flex flex-col items-center justify-center select-none">
        <RefreshCw size={24} className="text-[#A6DDB1] animate-spin" />
        <span className="text-xs font-mono tracking-wider text-neutral-400 mt-3 uppercase">Syncing cockpit arrays...</span>
      </div>
    );
  }

  // GATE A: Enforce password authentication wall
  if (!user) {
    return <BiometricLogin onSuccess={(profileData) => { setUser({ uid: profileData.uid, email: profileData.email }); setProfile(profileData); }} />;
  }

  // GATE B: Defer advanced features until onboarding registration checks clear
  if (!profile || profile.hasAcceptedTerms === false || !profile.baseCurrency) {
    return <OnboardingFlow uid={user.uid} profile={profile} onSuccess={() => window.location.reload()} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isPremium={!!(profile.isPremium || (profile.subscriptionTier && profile.subscriptionTier.toLowerCase() !== 'free') || (profile.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()))}
      isAIModalOpen={isAIModalOpen}
      setIsAIModalOpen={setIsAIModalOpen}
      isTxModalOpen={isTxModalOpen}
      setIsTxModalOpen={setIsTxModalOpen}
      txMode={txMode}
      setTxMode={setTxMode}
      profile={profile}
      accounts={accounts}
      transactions={transactions}
      accountBalances={accountBalances}
      streakUpdated={streakUpdated}
    >
      {showStreakAnimation && (
        <StreakAnimation 
          streak={animatingStreak} 
          isBonusStreak={isBonusStreak}
          onComplete={() => setShowStreakAnimation(false)} 
        />
      )}
     <AnimatePresence mode="wait">
  {activeTab === 'essentials' && (
    <motion.div key="essentials" {...animation}>
      <Essentials profile={profile} />
    </motion.div>
  )}
  {activeTab === 'accounts' && (
    <motion.div key="accounts" {...animation}>
      <Accounts profile={profile} />
    </motion.div>
  )}
{activeTab === 'ai' && (
  <motion.div key="ai" {...animation}>
    <VantageAI 
      isOpen={true} // Set to true to show it in the tab
      onClose={() => setActiveTab('essentials')} // Redirect back to home
      uid={user.uid}
      profile={profile}
      accounts={accounts}
      transactions={transactions}
      accountBalances={accountBalances}
    />
  </motion.div>
)}
  {activeTab === 'activity' && (
    <motion.div key="activity" {...animation}>
      <Transactions 
        uid={user.uid} 
        accounts={accounts} 
        profile={profile} 
        baseCurrency={profile.baseCurrency || 'AED'} 
        getRateToAED={getRateToAED} 
      />
    </motion.div>
  )}
{activeTab === 'analytics' && (
  <motion.div key="analytics" {...animation}>
    <Analytics 
      onNavigateToTransactions={() => setActiveTab('activity')}
      profile={profile} 
      allTransactions={transactions || []} // This must be exactly 'allTransactions'
      accounts={accounts || []} 
      accountBalances={accountBalances || {}}
    />
  </motion.div>
)}
  {activeTab === 'settings' && (
  <motion.div key="settings" {...animation}>
    <Settings 
      profile={profile} 
      accounts={accounts} 
      onUpdateProfile={(updated) => setProfile(updated)} 
    />
  </motion.div>
)}

</AnimatePresence>

      {/* FLOATING ACTION OVERLAYS PANEL HUB */}
      <AnimatePresence>
        {isAIModalOpen && (
          <VantageAI
            isOpen={isAIModalOpen}
            onClose={() => setIsAIModalOpen(false)}
            uid={user.uid}
            accounts={accounts}
            transactions={transactions}
            accountBalances={accountBalances}
            profile={profile}
          />
        )}
      </AnimatePresence>

      <AddTransactionModal 
        isOpen={isTxModalOpen} 
        onClose={() => setIsTxModalOpen(false)} 
        uid={user.uid} 
        onSuccess={() => {}} 
        accounts={accounts}
        profile={profile}
        mode={txMode}
        setMode={setTxMode}
      />

      <AddAccountModal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAddAccountOpen(false)} 
        uid={user.uid} 
        onAccountAdded={() => {}} 
        profile={profile}
      />

      <MilestoneConfigModal 
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        profile={profile}
        editingMilestone={null}
        accounts={accounts}
        allTransactions={transactions}
        exchangeRates={exchangeRates}
      />

      <DebtMilestoneConfigModal
        isOpen={isDebtMilestoneModalOpen}
        onClose={() => setIsDebtMilestoneModalOpen(false)}
        profile={profile}
        editingMilestone={null}
        accounts={accounts}
        exchangeRates={exchangeRates}
      />

      {/* PRODUCT TOUR OVERLAY LAYER */}
      <AnimatePresence>
        {currentTourStep !== null && (
          <ProductTour
            step={currentTourStep}
            activeTab={activeTab}
            onBack={() => setCurrentTourStep(prev => prev ? prev - 1 : null)}
            onNext={() => currentTourStep < 5 ? setCurrentTourStep(prev => prev! + 1) : setCurrentTourStep(null)}
            onSkip={() => {
              localStorage.setItem(`vantage_tour_completed_${user.uid}`, 'true');
              setCurrentTourStep(null);
            }}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}


// 🛡️ MASTER MOUNT: Guarding the full component tree with native fallback triggers
export const App = () => {
  return (
    <VantageDataErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <AppContent />
      </I18nextProvider>
    </VantageDataErrorBoundary>
  );
};


export default App;