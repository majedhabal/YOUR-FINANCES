import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export interface ProductTourProps {
  step: number;
  activeTab: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

interface TourStepDef {
  step: number;
  anchorId: string;
  title: string;
  text: string;
}

const STEPS: TourStepDef[] = [
  { step: 1, anchorId: '', title: "App Introduction", text: "Your future financial freedom starts with YOUR FINANCES. Let’s take a brief tour to show you how to effortlessly manage your net worth, monitor budgets, and achieve your financial goals with absolute clarity." },
  { step: 2, anchorId: 'tour-net-worth-card', title: "Financial Summary", text: "This is your financial reporting. Get a real-time overview of your combined Net Worth, Available Cash , and Total Assets tracked safely in one dashboard layer." },
  { step: 3, anchorId: 'nav-item-accounts', title: "Accounts Hub", text: "This is where your financial infrastructure lives. Tap here to manage your liquid bank accounts, review physical cash, and track outstanding credit card liabilities." },
  { step: 4, anchorId: 'nav-item-transactions', title: "Transactions Details", text: "Your transaction history, simplified. Keep tabs on standard daily cash sependings and review transaction groups to see exactly where your money moves." },
  { step: 5, anchorId: 'tour-essentials-budgets-container', title: "Income & Envelopes", text: "Track your budget boundaries without the stress. This area showcases your automated income allocation and personalized framework mini-budgets, living safely right here under your active Essentials tab." },
  { step: 6, anchorId: 'tour-savings-milestones', title: "Saving Goals", text: "Keep an eye on your long-term goals. Watch your milestone targets grow and track allocation toward your goals." },
  { step: 7, anchorId: 'tour-debt-rows', title: "Debt Management", text: "Eliminate your debts. Monitor card statements and outstanding debt limits seamlessly over an aggregated, pressure-free space." },
  { step: 8, anchorId: 'tour-fab-plus', title: "Quick Action", text: "Ready to add a new transaction, transfer funds between accounts, or update an envelope target? Tap this central button to initiate a fresh action instantly from any screen." },
  { step: 9, anchorId: 'tour-notification-bell', title: "Smart Alerts", text: "Never miss a critical financial notification. Tap here to view alerts, payment due date notices, set your own reminders and strategic tracking insights." },
  { step: 10, anchorId: 'nav-item-settings', title: "Profile & Settings", text: "Customize your profile and app. Tap here to modify your base currency choice, update personal goals, configure notifications, or review our legal policies safely." }
];

export const ProductTour: React.FC<ProductTourProps> = ({
  step,
  activeTab,
  onBack,
  onNext,
  onSkip,
}) => {
  const currentStep = STEPS[step - 1];
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number; isBelow: boolean } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (step === 1) {
        setCoords(null);
        return;
      }
      if (!currentStep) return;

      const el = document.getElementById(currentStep.anchorId);
      if (el) {
        const rect = el.getBoundingClientRect();
        const isBelow = rect.top < window.innerHeight / 2;
        setCoords({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          isBelow
        });
      } else {
        setCoords(null);
      }
    };
    
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [step, activeTab, currentStep]);

  if (!currentStep) return null;

  // Pure Theme Configuration Styles Object Object Mapping
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    width: 'calc(100vw - 2rem)',
    maxWidth: '400px', // Uniform bento design alignment limit
    left: '50%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    
    /* 🌟 Forced Glassmorphic Tokens Override */
    background: 'rgba(255, 255, 255, 0.45)',
    backdropFilter: 'blur(30px) saturate(190%)',
    WebkitBackdropFilter: 'blur(30px) saturate(190%)',
    border: '1px solid rgba(255, 255, 255, 0.55)',
    borderRadius: '24px',
    boxShadow: '0 12px 40px 0 rgba(30, 34, 41, 0.25)',
  };

  if (coords) {
    if (coords.isBelow) {
      tooltipStyle.top = `${coords.top + coords.height + 16}px`;
      tooltipStyle.transform = 'translateX(-50%)';
    } else {
      tooltipStyle.bottom = `${window.innerHeight - coords.top + 16}px`;
      tooltipStyle.transform = 'translateX(-50%)';
    }
  } else {
    tooltipStyle.top = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <>
      {/* 1. BLUR BACKGROUND BACKDROP */}
      <div
        className="fixed inset-0 bg-[#1E2229]/60 backdrop-blur-sm z-[980] pointer-events-auto transition-all"
        onClick={onSkip}
      />

      {/* 2. SECURITY SPOTLIGHT PULSING RING */}
      {coords && (
        <motion.div
          className="fixed pointer-events-none border-2 border-[#A6DDB1] rounded-2xl shadow-[0_0_20px_rgba(166,221,177,0.5)] z-[990]"
          animate={{ scale: [1, 1.03, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            top: coords.top - 6,
            left: coords.left - 6,
            width: coords.width + 12,
            height: coords.height + 12,
          }}
        />
      )}

      {/* 3. PREMIUM UNIFIED GLASS CARD CONTAINER */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        style={tooltipStyle}
        className="p-5 select-none"
      >
        
        {/* PROGRESS TOOLBAR HEADER ROW (Fluid Text scaling bounds) */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/10 dark:border-white/10 flex-nowrap">
          <span 
            className="font-medium text-[clamp(0.8rem,1.8vw,0.95rem)]"
            style={{ color: '#1E2229' }}
          >
            {currentStep.title} — Step {step} of 10
          </span>
          <button 
            onClick={onSkip} 
            className="cursor-pointer font-bold text-xs bg-transparent border-none p-0 transition-opacity duration-200 hover:opacity-70"
            style={{ color: 'rgba(30, 34, 41, 0.5)' }}
          >
            Skip Tour
          </button>
        </div>

        {/* PARAGRAPH INFO CONTENT PANEL */}
        <div className="flex flex-col mb-4">
          <p 
            className="font-normal leading-relaxed text-left m-0 text-[clamp(0.95rem,2.2vw,1.1rem)]"
            style={{ color: '#1E2229' }}
          >
            {currentStep.text}
          </p>
        </div>

        {/* ACTION COMMAND CONTROLLER FOOTER ROW */}
        <div className="flex items-center justify-between pt-3 border-t border-black/10 dark:border-white/10 flex-nowrap w-full">
          {step > 1 ? (
            <button
              onClick={onBack}
              className="cursor-pointer font-medium rounded-full bg-black/5 hover:bg-black/10 transition-all px-4 py-2 border border-black/10 text-[clamp(0.9rem,2vw,1.05rem)]"
              style={{ color: '#1E2229' }}
            >
              Back
            </button>
          ) : <div />}

          <button 
            onClick={onNext} 
            className="cursor-pointer px-6 py-2 bg-[#A6DDB1] hover:opacity-90 active:scale-95 transition-all rounded-full font-semibold border-none text-[clamp(0.9rem,2vw,1.05rem)]"
            style={{ color: '#1E2229' }}
          >
            {step === 10 ? 'Done' : 'Next'}
          </button>
        </div>
      </motion.div>
    </>
  );
};
