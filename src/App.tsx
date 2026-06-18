import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, collection } from 'firebase/firestore';
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
import { Essentials } from './components/Essentials';
import { Accounts } from './components/Accounts';
import { VantageAI } from './components/VantageAI';
import { Transactions } from './components/Transactions';
import { Analytics } from './components/Analytics';

export type Tab = 'essentials' | 'accounts' | 'ai' | 'activity' | 'analytics';

const animation = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

// We isolate the internal application content so the parent Error Boundary can monitor its states
function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('essentials');
  
  // Feature Modal Interface Toggles
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAddAccountOpen] = useState(false);
  const [currentTourStep, setCurrentTourStep] = useState<number | null>(null);

  // Synchronized state pools for analytics routing
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accountBalances, setAccountBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab) setActiveTab(e.detail.tab);
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // Establish real-time persistent data pipe to flat root profile schema
        const profileRef = doc(db, 'users', currentUser.uid);
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data();
            setProfile({ uid: currentUser.uid, ...profileData });
            
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
      const balancesMap: Record<string, number> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        accList.push({ id: doc.id, ...data });
        balancesMap[doc.id] = (data.startingBalance) || 0;
      });
      setAccounts(accList);
      setAccountBalances(balancesMap);
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
    return <BiometricLogin />;
  }

  // GATE B: Defer advanced features until onboarding registration checks clear
  if (!profile || profile.hasAcceptedTerms === false || !profile.baseCurrency) {
    return <OnboardingFlow uid={user.uid} email={user.email} onSuccess={() => window.location.reload()} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isPremium={profile.subscriptionTier === 'premium'}
      isAIModalOpen={isAIModalOpen}
      setIsAIModalOpen={setIsAIModalOpen}
      isTxModalOpen={isTxModalOpen}
      setIsTxModalOpen={setIsTxModalOpen}
      profile={profile}
      accounts={accounts}
      transactions={transactions}
      accountBalances={accountBalances}
    >
     <AnimatePresence mode="wait">
  {activeTab === 'essentials' && (
    <motion.div key="essentials" {...animation}>
      <Essentials profile={profile} />
    </motion.div>
  )}
  {activeTab === 'accounts' && (
    <motion.div key="accounts" {...animation}>
      <Accounts profile={profile} accounts={accounts} />
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
      <Transactions uid={user.uid} accounts={accounts} profile={profile} />
    </motion.div>
  )}
{activeTab === 'analytics' && (
  <motion.div key="analytics" {...animation}>
    <Analytics 
      profile={profile} 
      allTransactions={transactions || []} // This must be exactly 'allTransactions'
      accounts={accounts || []} 
      accountBalances={accountBalances || {}}
    />
  </motion.div>
)}
  {activeTab === 'settings' && (
  <motion.div key="settings" {...animation}>
    <Settings profile={profile} />
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
      />

      <AddAccountModal 
        isOpen={isAccountModalOpen} 
        onClose={() => setIsAddAccountOpen(false)} 
        uid={user.uid} 
        onAccountAdded={() => {}} 
        profile={profile}
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
      <AppContent />
    </VantageDataErrorBoundary>
  );
};

export default App;