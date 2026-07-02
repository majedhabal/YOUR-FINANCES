import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Tab } from '../App';
import { VantageLogo } from './VantageLogo';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera } from 'lucide-react';
import { Settings } from './Settings';
import { NotificationDispatchHub } from './NotificationDispatchHub';
import { StreakTracker } from './StreakTracker';
import { ReceiptScannerModal } from './ReceiptScannerModal';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isPremium?: boolean;
  isAIModalOpen?: boolean;
  setIsAIModalOpen?: (open: boolean) => void;
  isTxModalOpen?: boolean;
  setIsTxModalOpen?: (open: boolean) => void;
  txMode?: 'expense' | 'income' | 'transfer';
  setTxMode?: (mode: 'expense' | 'income' | 'transfer') => void;
  profile?: any;
  accounts?: any[];
  transactions?: any[];
  accountBalances?: Record<string, number>;
  streakUpdated?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, activeTab, setActiveTab, isAIModalOpen, setIsAIModalOpen, isTxModalOpen, setIsTxModalOpen, txMode, setTxMode, profile, accounts, transactions, accountBalances, streakUpdated
}) => {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !navigator.onLine;
  });

  const [isFabMenuOpen, setIsFabMenuOpen] = React.useState(false);
  const navItems = [
    { id: 'essentials' as Tab, label: t('layout.essentials', 'Essentials'), icon: Home },
    { id: 'accounts' as Tab, label: t('layout.accounts', 'Accounts'), icon: Landmark },
    { id: 'ai' as Tab, label: t('layout.vantage_ai', 'Vantage AI'), icon: BrainCircuit },
    { id: 'activity' as Tab, label: t('activity.title'), icon: Activity },
    { id: 'analytics' as Tab, label: t('analytics.title'), icon: TrendingUp },
  ];

  const [isSalaryModalOpen, setIsSalaryModalOpen] = React.useState(false);
  const [isTxDetailModalOpen, setIsTxDetailModalOpen] = React.useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = React.useState(false);
  const [isAccountDetailModalOpen, setIsAccountDetailModalOpen] = React.useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = React.useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = React.useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = React.useState(false);
  const [isDebtMilestoneModalOpen, setIsDebtMilestoneModalOpen] = React.useState(false);
  const [isDispatchHubOpen, setIsDispatchHubOpen] = React.useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = React.useState(false);
  const [isStatementVaultOpen, setIsStatementVaultOpen] = React.useState(false);
  const [isBudgetDetailOpen, setIsBudgetDetailOpen] = React.useState(false);
  const [isSettingsSubViewOpen, setIsSettingsSubViewOpen] = React.useState(false);
  const [isBudgetTxModalOpen, setIsBudgetTxModalOpen] = React.useState(false);

  useEffect(() => {
    const handleSalaryModal = (e: any) => {
      setIsSalaryModalOpen(e.detail.isOpen);
    };
    const handleTxDetailModal = (e: any) => {
      setIsTxDetailModalOpen(e.detail.isOpen);
    };
    const handleAccountModal = (e: any) => {
      setIsAccountModalOpen(e.detail.isOpen);
    };
    const handleAccountDetailModal = (e: any) => {
      setIsAccountDetailModalOpen(e.detail.isOpen);
    };
    const handleBreakdownModal = (e: any) => {
      setIsBreakdownModalOpen(e.detail.isOpen);
    };
    const handleDebtModal = (e: any) => {
      setIsDebtModalOpen(e.detail.isOpen);
    };
    const handleMilestoneModal = (e: any) => {
      setIsMilestoneModalOpen(e.detail.isOpen);
    };
    const handleDebtMilestoneModal = (e: any) => {
      setIsDebtMilestoneModalOpen(e.detail.isOpen);
    };
    const handleDispatchHub = (e: any) => {
      setIsDispatchHubOpen(e.detail.isOpen);
    };
    const handleStatementVault = (e: any) => {
      setIsStatementVaultOpen(e.detail.isOpen);
    };
    const handleBudgetDetail = (e: any) => {
      setIsBudgetDetailOpen(e.detail.isOpen);
    };
    const handleSettingsSubView = (e: any) => {
      setIsSettingsSubViewOpen(e.detail.isOpen);
    };
    const handleBudgetTxModal = (e: any) => {
      setIsBudgetTxModalOpen(e.detail.isOpen);
    };
    window.addEventListener('salary-modal-toggled', handleSalaryModal);
    window.addEventListener('tx-detail-modal-toggled', handleTxDetailModal);
    window.addEventListener('account-modal-toggled', handleAccountModal);
    window.addEventListener('account-detail-modal-toggled', handleAccountDetailModal);
    window.addEventListener('breakdown-modal-toggled', handleBreakdownModal);
    window.addEventListener('debt-modal-toggled', handleDebtModal);
    window.addEventListener('milestone-modal-toggled', handleMilestoneModal);
    window.addEventListener('debt-milestone-modal-toggled', handleDebtMilestoneModal);
    window.addEventListener('dispatch-hub-toggled', handleDispatchHub);
    window.addEventListener('statement-vault-toggled', handleStatementVault);
    window.addEventListener('budget-detail-toggled', handleBudgetDetail);
    window.addEventListener('settings-subview-toggled', handleSettingsSubView);
    window.addEventListener('budget-tx-modal-toggled', handleBudgetTxModal);
    return () => {
      window.removeEventListener('salary-modal-toggled', handleSalaryModal);
      window.removeEventListener('tx-detail-modal-toggled', handleTxDetailModal);
      window.removeEventListener('account-modal-toggled', handleAccountModal);
      window.removeEventListener('account-detail-modal-toggled', handleAccountDetailModal);
      window.removeEventListener('breakdown-modal-toggled', handleBreakdownModal);
      window.removeEventListener('debt-modal-toggled', handleDebtModal);
      window.removeEventListener('milestone-modal-toggled', handleMilestoneModal);
      window.removeEventListener('debt-milestone-modal-toggled', handleDebtMilestoneModal);
      window.removeEventListener('dispatch-hub-toggled', handleDispatchHub);
      window.removeEventListener('statement-vault-toggled', handleStatementVault);
      window.removeEventListener('budget-detail-toggled', handleBudgetDetail);
      window.removeEventListener('settings-subview-toggled', handleSettingsSubView);
      window.removeEventListener('budget-tx-modal-toggled', handleBudgetTxModal);
    };
  }, []);

  const shouldHideHeaderFooter = isSalaryModalOpen || isTxDetailModalOpen || isAccountModalOpen || isAccountDetailModalOpen || isBreakdownModalOpen || isDebtModalOpen || isTxModalOpen || isMilestoneModalOpen || isDebtMilestoneModalOpen || isAIModalOpen || activeTab === 'ai' || isStatementVaultOpen || isBudgetDetailOpen || isSettingsSubViewOpen || isBudgetTxModalOpen;

  return (
    <div className="w-full h-screen flex flex-col bg-[#F8FAFC] text-black overflow-hidden relative">
      <AnimatePresence>
        {isFabMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setIsFabMenuOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 right-5 bg-white rounded-2xl shadow-xl p-2 flex flex-col gap-1 w-56 border border-neutral-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('transfer'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_transfer', 'New transfer')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setIsFabMenuOpen(false); window.dispatchEvent(new CustomEvent('trigger-debt-config')); }}>{t('layout.new_debt', 'New debt')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('income'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_income', 'New income')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('expense'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_expense', 'New expense')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setIsFabMenuOpen(false); window.dispatchEvent(new CustomEvent('trigger-savings-goal-config')); }}>{t('layout.new_saving_goal', 'New saving goal')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* BACKGROUND HALOS */}
      <div className="absolute inset-0 pointer-events-none z-0 select-none opacity-40">
        <div className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] rounded-full bg-[#A6DDB1]/10 blur-[120px]" />
      </div>

      {/* CORE BRAND HEADER UTILITY */}
      {!shouldHideHeaderFooter && (
        <header className="w-full sticky top-0 z-40 px-4 py-0 flex items-center justify-between select-none box-border border-b border-neutral-100 bg-white shrink-0 h-[81px] rounded-none">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('essentials')}>
            <div className="w-20 h-20 flex items-center justify-center Astro-Portrait-Mode">
              <VantageLogo size="100%" />
            </div>
            <div className="flex flex-col">
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isOffline && (
              <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono tracking-wide uppercase">
                <WifiOff size={10} />
                <span>{t('layout.offline', 'Offline')}</span>
              </div>
            )}
            {profile?.uid && (
              <div className="flex items-center gap-2">
                <StreakTracker streak={profile.dailyStreak} streakUpdated={streakUpdated} />
                <NotificationDispatchHub
                  uid={profile.uid}
                  accounts={accounts || []}
                  transactions={transactions || []}
                  accountBalances={accountBalances || {}}
                />
              </div>
            )}
            <button 
              onClick={() => setActiveTab('settings')}
              className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
            >
              <SettingsIcon size={20} className="text-neutral-400" />
            </button>
          </div>
        </header>
      )}

      {/* CONTENT CANVAS */}
      <main className={`flex-1 w-full relative z-10 box-border ${shouldHideHeaderFooter ? 'pb-0' : 'pb-28'} bg-[#F8FAFC] overflow-y-auto overflow-x-hidden`}>
        {children}
      </main>

      {/* UNIFIED STICKY FOOTER BOTTOM NAVIGATION DOCK */}
      {!shouldHideHeaderFooter && !isDispatchHubOpen && (
        <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[460px] box-border select-none shrink-0">
        {/* Receipt Scanner FAB (Camera) */}
        <button
          onClick={() => setIsReceiptScannerOpen(true)}
          className="fixed bottom-40 right-6 z-[60] w-14 h-14 bg-white border border-neutral-200 text-[#1E3A20] rounded-full flex items-center justify-center shadow-lg hover:bg-neutral-50 transition-all active:scale-95 group"
          title={t('layout.scan_receipt', 'Scan receipt with AI')}
        >
          <Camera size={22} className="text-[#1E3A20] group-hover:scale-105 transition-transform" />
          <span className="absolute -top-1 -right-1 bg-[#A6DDB1] text-[#1E3A20] text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-white flex items-center gap-0.5 shadow-sm">
            AI
          </span>
        </button>

        {/* FAB */}
        <button
          onClick={() => setIsFabMenuOpen(true)}
          className="fixed bottom-24 right-6 z-[60] w-14 h-14 bg-[#A6DDB1] rounded-full flex items-center justify-center shadow-lg hover:brightness-95 transition-all active:scale-95"
        >
          <Plus size={28} className="text-[#1E3A20]" />
        </button>

        <div 
          className="w-full p-2 flex items-center justify-around gap-1 transition-all duration-300"
          style={{
            background: '#F8FAFC',
            border: '1px solid #E1E8ED',
            borderRadius: '30px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  setActiveTab(item.id);
                }}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-full relative transition-all cursor-pointer outline-none group ${isActive ? 'bg-[#D3E3D1]' : 'bg-transparent'}`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon size={19} strokeWidth={isActive ? 2.5 : 2} style={{ color: isActive ? '#1E3A20' : '#4B5563' }} />
                </div>
                <span className={`text-[10px] font-semibold tracking-wide mt-1 transition-colors duration-200 ${isActive ? 'text-[#1E3A20]' : 'text-neutral-600'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      )}
      {profile?.uid && (
        <ReceiptScannerModal
          isOpen={isReceiptScannerOpen}
          onClose={() => setIsReceiptScannerOpen(false)}
          uid={profile.uid}
          profile={profile}
          accounts={accounts || []}
        />
      )}
    </div>
  );
};
