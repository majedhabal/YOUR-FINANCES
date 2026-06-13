import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, ReceiptText, ListTodo, Settings as SettingsIcon, Wallet, PieChart, Landmark, CircuitBoard, Activity, Sparkles, Bell, WifiOff } from 'lucide-react';
import { Tab } from '../App';
import { VantageLogo } from './VantageLogo';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isPremium?: boolean;
  isAIModalOpen?: boolean;
  setIsAIModalOpen?: (open: boolean) => void;
  profile?: any;
  accounts?: any[];
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, isPremium, isAIModalOpen, setIsAIModalOpen, profile, accounts = [] }) => {
  const [shouldGlowAccounts, setShouldGlowAccounts] = React.useState(false);
  const [randomPlaceholder] = React.useState<string>(() => {
    const list = ['John Doe', 'Sara Spence', 'Alex Mercer', 'Taylor Vance', 'Jordan Reed', 'Morgan Chase', 'Kelly Palmer'];
    return list[Math.floor(Math.random() * list.length)];
  });

  const [isOffline, setIsOffline] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const sim = localStorage.getItem('vantage_simulated_offline') === 'true';
    return !navigator.onLine || sim;
  });

  React.useEffect(() => {
    const handleOnline = () => {
      const sim = localStorage.getItem('vantage_simulated_offline') === 'true';
      setIsOffline(sim);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    const handleSimChange = () => {
      const sim = localStorage.getItem('vantage_simulated_offline') === 'true';
      setIsOffline(!navigator.onLine || sim);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('vantage-offline-simulation-update', handleSimChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('vantage-offline-simulation-update', handleSimChange);
    };
  }, []);

  const [unreadCount, setUnreadCount] = React.useState<number>(() => {
    return (window as any).__vantageNotificationsCount || 0;
  });

  React.useEffect(() => {
    const handleUpdate = (e: any) => {
      setUnreadCount(e.detail?.count || 0);
    };
    window.addEventListener('vantage-notifications-count-update', handleUpdate);
    return () => window.removeEventListener('vantage-notifications-count-update', handleUpdate);
  }, []);

  const [greeting, setGreeting] = React.useState<string>('Good morning');

  React.useEffect(() => {
    const hr = new Date().getHours();
    let computed = 'Good morning';
    if (hr >= 0 && hr <= 11) {
      computed = 'Good morning';
    } else if (hr >= 12 && hr <= 16) {
      computed = 'Good afternoon';
    } else {
      computed = 'Good evening';
    }
    setGreeting(computed);
  }, []);

  const getFirstName = () => {
    const rawName = profile?.displayName || profile?.fullName || profile?.name || randomPlaceholder;
    return rawName.split(' ')[0] || 'User';
  };

  const getInitials = (fullName?: string) => {
    if (!fullName) return 'U';
    return fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };

  React.useEffect(() => {
    const handleGlow = () => {
      setShouldGlowAccounts(true);
      setTimeout(() => {
        setShouldGlowAccounts(false);
      }, 3000);
    };
    window.addEventListener('vantage-accounts-glow', handleGlow);
    return () => window.removeEventListener('vantage-accounts-glow', handleGlow);
  }, []);

  const navItems = [
    { id: Tab.DAILY_LOG, label: 'Essentials', icon: ListTodo },
    { id: Tab.TRANSACTIONS, label: 'Activity', icon: ReceiptText },
    { id: 'vantage_ai', label: 'Advisor AI', icon: Sparkles },
    { id: Tab.ANALYTICS, label: 'Analytics', icon: Activity },
    { id: Tab.ACCOUNTS, label: 'Accounts', icon: Wallet },
  ];

  return (
    <div className="h-[100dvh] flex flex-col bg-white text-[#1E2229] selection:bg-[#A6DDB1] selection:text-white font-sans overflow-hidden transition-colors duration-300 relative">
      {/* Premium Ambient Light Glow Vectors */}
      <div className="pointer-events-none absolute top-[-10%] left-[-10%] w-[50dvw] h-[50dvh] rounded-full bg-[#A6DDB1]/15 blur-[120px] z-0 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] w-[50dvw] h-[50dvh] rounded-full bg-[#A6DDB1]/15 blur-[120px] z-0 animate-pulse" style={{ animationDuration: '10s' }} />
      <div className="pointer-events-none absolute top-[40%] left-[50%] w-[35dvw] h-[35dvh] rounded-full bg-[#A6DDB1]/10 blur-[100px] z-0 animate-pulse" style={{ animationDuration: '12s' }} />

      {/* Header */}
      <header 
        style={{ 
          background: 'rgba(255, 255, 255, 0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderWidth: '0px',
          borderRadius: '24px',
          zIndex: 100
        }}
        className="fixed top-6 left-1/2 -translate-x-1/2 w-[350px] flex items-center justify-between p-3 px-4 sm:px-5 shadow-[0_8px_32px_rgba(30,34,41,0.05)] select-none !h-[50px]"
      >
        {/* Left Side: Avatar and Greeting */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* User Profile avatar circular layout shield container with 3px soft glowing border */}
          <div 
            id="header-user-profile-avatar"
            onClick={() => {
              triggerHaptic(hapticPresets.light);
              setActiveTab(Tab.DAILY_LOG);
            }}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white border-[3px] border-[#A6DDB1] shadow-[0_0_8px_rgba(166,221,177,0.3)] flex items-center justify-center cursor-pointer active:scale-95 transition-all duration-300 shrink-0 overflow-hidden"
          >
            <span className="text-[10px] md:text-xs font-bold text-[#1E2229] tracking-tight">
              {getInitials(profile?.displayName || profile?.fullName || profile?.name || randomPlaceholder)}
            </span>
          </div>
 
          <div className="flex flex-col min-w-0 flex-1 p-2 rounded-2xl" style={{ 
            background: 'rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
          }}>
            <span 
              style={{ fontSize: '16px', fontWeight: 'normal', lineHeight: '25px', fontStyle: 'normal', textDecoration: 'none', fontFamily: "'Google Sans', sans-serif" }}
              className="text-[#1E2229] whitespace-nowrap block truncate text-ellipsis overflow-hidden"
            >
              {greeting}, {getFirstName()}
            </span>
          </div>
        </div>

        {/* Right Side: Action Triggers (Settings and Notification Bell perfectly square) */}
        <div className="flex items-center gap-2 shrink-0">
          {isOffline && (
            <div 
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200/50 rounded-full text-amber-600 text-[11px] shrink-0 select-none animate-pulse"
              title="Vantage is running in offline mode. Your ledger entries are stored on-device and will automatically synchronize upon reconnection."
            >
              <WifiOff size={12} strokeWidth={2.5} className="shrink-0" />
              <span className="font-normal hidden xs:inline">Offline</span>
            </div>
          )}
          {/* Settings button */}
          <button 
            id="nav-item-settings"
            onClick={() => {
              triggerHaptic(hapticPresets.medium);
              setActiveTab(Tab.SETTINGS);
            }}
            className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-250 border active:scale-95 ${
               activeTab === Tab.SETTINGS 
                ? 'bg-[#A6DDB1]/15 border-[#A6DDB1] text-[#A6DDB1] shadow-xs' 
                : 'bg-white/45 border-neutral-200/50 text-[#1E2229]/65 hover:text-[#A6DDB1] hover:border-[#A6DDB1]/30'
            }`}
          >
             <SettingsIcon size={16} className="md:size-[18px]" />
          </button>

          {/* Smart alert notification bell on the far right of the top header */}
          {/*
          <button 
            id="header-notification-bell-toggle"
            onClick={() => window.dispatchEvent(new CustomEvent('vantage-toggle-notifications'))}
            className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/45 backdrop-blur-md border border-neutral-200/50 flex items-center justify-center text-neutral-800 hover:text-[#A6DDB1] hover:border-[#A6DDB1]/30 relative cursor-pointer active:scale-95 transition-all duration-250 shadow-xs"
          >
            <Bell size={16} className="md:size-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#A6DDB1] text-white text-[9px] font-bold h-4.5 w-4.5 rounded-full flex items-center justify-center border border-white shadow-xs leading-none">
                {unreadCount}
              </span>
            )}
          </button>
          */}
        </div>
      </header>

      {/* Main Container structure layout split */}
      <div className="flex flex-1 overflow-hidden pt-24 md:pt-[104px]">
        {/* Left Navigation Slim Rail (Desktop/Tablet) - width: 72px */}
        <nav className="hidden lg:flex flex-col items-center py-6 w-[72px] vantage-glass-base z-40 shadow-sm gap-5 select-none h-full shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'vantage_ai' ? !!isAIModalOpen : activeTab === item.id;
            return (
              <button
                key={`rail-${item.id}`}
                id={`nav-item-rail-${item.id}`}
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  if (item.id === 'vantage_ai') {
                    setIsAIModalOpen?.(true);
                  } else {
                    setActiveTab(item.id as Tab);
                  }
                }}
                className={`flex flex-col items-center gap-1 transition-all duration-300 relative group w-14 p-2 rounded-2xl ${
                  isActive ? 'text-vantage-green' : 'text-[#57606F] hover:text-vantage-text'
                }`}
              >
                <motion.div 
                  animate={item.id === Tab.ACCOUNTS && shouldGlowAccounts ? {
                    scale: [1, 1.25, 1, 1.25, 1],
                    boxShadow: [
                      "0 0 0px rgba(0,255,136,0)",
                      "0 0 25px rgba(0,255,136,1)",
                      "0 0 0px rgba(0,255,136,0)",
                      "0 0 25px rgba(0,255,136,1)",
                      "0 0 0px rgba(0,255,136,0)"
                    ],
                    borderColor: [
                      "rgba(0,255,136,0)",
                      "rgba(0,255,136,1)",
                      "rgba(0,255,136,0)",
                      "rgba(0,255,136,1)",
                      "rgba(0,255,136,0)"
                    ],
                    borderWidth: 2
                  } : {}}
                  transition={{ duration: 2.2, ease: "easeInOut" }}
                  className={`p-2 rounded-2xl transition-all duration-300 ${isActive ? 'bg-[#2D3A30] shadow-[0_4px_15px_rgba(0,0,0,0.1)] text-vantage-green' : 'active:scale-95 group-hover:bg-vantage-text/5'}`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </motion.div>
                <span 
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                  className="text-[9px] tracking-wide scale-90 group-hover:scale-100 transition-all opacity-80 leading-none font-normal"
                >
                  {item.label}
                </span>
                {isActive && (
                  <motion.div 
                    layoutId="active-rail-pill"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-vantage-green rounded-full shadow-[0_0_10px_currentColor]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Scrollable Content Pane */}
        <div className="flex-1 overflow-y-auto [WebkitOverflowScrolling:touch] pb-24 lg:pb-8">
          <main className="w-full px-4 sm:px-6 pt-4 lg:pt-8 pb-10 p-[5px]">
            {children}
            
            {/* AdMob Placeholder */}
            {!isPremium && (
              <div className="mt-8 mb-4 p-4 bg-luxury-grey/10 border border-dashed border-white/10 rounded-[1.5rem] flex flex-col items-center justify-center gap-1 opacity-50">
                 <span className="text-[0.5rem] font-bold tracking-wide text-neutral-600">Sponsored</span>
                 <div className="w-full h-12 bg-neutral-900/50 rounded flex items-center justify-center">
                    <span className="text-[0.625rem] text-neutral-700 italic font-mono">Google AdMob Slot [320x50]</span>
                 </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Bottom Navigation (Floating glassmorphic capsule dock) */}
      <nav 
        style={{ 
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(30, 34, 41, 0.08)'
        }}
        className="fixed bottom-4 inset-x-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-[600px] rounded-full flex items-center justify-between p-3 z-50 shadow-[0_12px_40px_rgba(30,34,41,0.08)]"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === 'vantage_ai' ? !!isAIModalOpen : activeTab === item.id;
          const isVantageAI = item.id === 'vantage_ai';
          return (
            <button
              key={`bottom-${item.id}`}
              id={`nav-item-${item.id}`}
              onClick={() => {
                triggerHaptic(hapticPresets.light);
                if (item.id === 'vantage_ai') {
                  setIsAIModalOpen?.(true);
                } else {
                  setActiveTab(item.id as Tab);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer active:scale-95 py-1 ${
                isActive ? 'text-[#A6DDB1]' : 'text-[#1E2229]/50 hover:text-[#1E2229]/80'
              }`}
            >
              <motion.div 
                animate={item.id === Tab.ACCOUNTS && shouldGlowAccounts ? {
                  scale: [1, 1.25, 1, 1.3, 1],
                  boxShadow: [
                    "0 0 0px rgba(166,221,177,0)",
                    "0 0 20px rgba(166,221,177,1)",
                    "0 0 0px rgba(166,221,177,0)",
                    "0 0 20px rgba(166,221,177,1)",
                    "0 0 0px rgba(166,221,177,0)"
                  ]
                } : {}}
                transition={{ duration: 2.2, ease: "easeInOut" }}
                className={`${isVantageAI ? 'p-0.5' : 'p-1'} transition-all duration-300 flex items-center justify-center bg-transparent`}
              >
                <Icon 
                  strokeWidth={isVantageAI ? 1.5 : (isActive ? 2.5 : 2)} 
                  className={`${
                    isVantageAI 
                      ? 'w-[clamp(26px,5vw,32px)] h-[clamp(26px,5vw,32px)]' 
                      : 'w-[clamp(18px,4vw,22px)] h-[clamp(18px,4vw,22px)]'
                  } transition-transform duration-300`}
                  fill={isVantageAI ? '#A6DDB1' : 'none'}
                  stroke={isActive || isVantageAI ? '#A6DDB1' : 'currentColor'}
                />
              </motion.div>
              <span 
                style={{ 
                  fontFamily: "'Google Sans', sans-serif", 
                  fontSize: 'clamp(0.7rem, 1.8vw, 0.85rem)', 
                  fontWeight: 500 
                }}
                className={`tracking-wide transition-all mt-0.5 whitespace-nowrap text-center ${
                  isActive ? 'scale-105 opacity-100 font-medium text-[#A6DDB1]' : 'opacity-100'
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <motion.div 
                  layoutId="active-bottom-indicator"
                  className="absolute bottom-[-2px] w-6 h-[2.5px] bg-[#A6DDB1] rounded-full shadow-[0_0_8px_rgba(166,221,177,0.8)]"
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
