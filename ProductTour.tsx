import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

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
  sKey: string;
}

const STEPS_KEYS: TourStepDef[] = [
  { step: 1, anchorId: '', sKey: "s1" },
  { step: 2, anchorId: 'tour-net-worth-card', sKey: "s2" },
  { step: 3, anchorId: 'nav-item-accounts', sKey: "s3" },
  { step: 4, anchorId: 'nav-item-transactions', sKey: "s4" },
  { step: 5, anchorId: 'tour-essentials-budgets-container', sKey: "s5" },
  { step: 6, anchorId: 'tour-savings-milestones', sKey: "s6" },
  { step: 7, anchorId: 'tour-debt-rows', sKey: "s7" },
  { step: 8, anchorId: 'tour-fab-plus', sKey: "s8" },
  { step: 9, anchorId: 'tour-notification-bell', sKey: "s9" },
  { step: 10, anchorId: 'nav-item-settings', sKey: "s10" }
];

export const ProductTour: React.FC<ProductTourProps> = ({
  step,
  activeTab,
  onBack,
  onNext,
  onSkip,
}) => {
  const { t } = useTranslation();
  const currentStepKey = STEPS_KEYS[step - 1];
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number; isBelow: boolean } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (step === 1) {
        setCoords(null);
        return;
      }
      if (!currentStepKey) return;

      const el = document.getElementById(currentStepKey.anchorId);
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
  }, [step, activeTab, currentStepKey]);

  if (!currentStepKey) return null;

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
    
    /* 🌟 Solid Flat White Theme Override (No Glass) */
    background: '#FFFFFF',
    border: '1px solid rgba(30, 34, 41, 0.08)',
    borderRadius: '24px',
    boxShadow: '0 12px 40px 0 rgba(30, 34, 41, 0.15)',
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
      <div
        className="fixed inset-0 bg-[#1E2229]/60 backdrop-blur-sm z-[980] pointer-events-auto transition-all"
        onClick={onSkip}
      />

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

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        style={tooltipStyle}
        className="p-5 select-none"
      >
        
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-black/10 dark:border-white/10 flex-nowrap">
          <span 
            className="font-medium text-[clamp(0.8rem,1.8vw,0.95rem)]"
            style={{ color: '#1E2229' }}
          >
            {t(`product_tour.steps.${currentStepKey.sKey}.title`)} — {t('product_tour.controls.step_counter', { step })}
          </span>
          <button 
            onClick={onSkip} 
            className="cursor-pointer font-bold text-xs bg-transparent border-none p-0 transition-opacity duration-200 hover:opacity-70"
            style={{ color: 'rgba(30, 34, 41, 0.5)' }}
          >
            {t('product_tour.controls.skip')}
          </button>
        </div>

        <div className="flex flex-col mb-4">
          <p 
            className="font-normal leading-relaxed text-left m-0 text-[clamp(0.95rem,2.2vw,1.1rem)]"
            style={{ color: '#1E2229' }}
          >
            {t(`product_tour.steps.${currentStepKey.sKey}.text`)}
          </p>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-black/10 dark:border-white/10 flex-nowrap w-full">
          {step > 1 ? (
            <button
              onClick={onBack}
              className="cursor-pointer font-medium rounded-full bg-black/5 hover:bg-black/10 transition-all px-4 py-2 border border-black/10 text-[clamp(0.9rem,2vw,1.05rem)]"
              style={{ color: '#1E2229' }}
            >
              {t('product_tour.controls.back')}
            </button>
          ) : <div />}

          <button 
            onClick={onNext} 
            className="cursor-pointer px-6 py-2 bg-[#A6DDB1] hover:opacity-90 active:scale-95 transition-all rounded-full font-semibold border-none text-[clamp(0.9rem,2vw,1.05rem)]"
            style={{ color: '#1E2229' }}
          >
            {step === 10 ? t('product_tour.controls.done') : t('product_tour.controls.next')}
          </button>
        </div>
      </motion.div>
    </>
  );
};
