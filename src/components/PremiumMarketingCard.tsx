import React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Crown, Sparkles, Zap, ShieldCheck } from 'lucide-react';

interface PremiumMarketingCardProps {
  featureName: string;
  description: string;
}

export const PremiumMarketingCard: React.FC<PremiumMarketingCardProps> = ({ featureName, description }) => {
  const { t } = useTranslation();
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-[360px] md:max-w-[400px] p-5 md:p-6 bg-[#111214] border border-white/5 rounded-2xl relative overflow-hidden group flex flex-col items-center text-center gap-5 mx-auto shadow-2xl"
    >
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Crown size={80} className="text-vantage-green" />
      </div>

      <div className="w-12 h-12 rounded-xl bg-vantage-green/10 flex items-center justify-center relative shrink-0">
        <Crown size={24} className="text-vantage-green" />
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-1 -right-1 text-vantage-green"
        >
          <Sparkles size={12} />
        </motion.div>
      </div>

      <div className="flex flex-col gap-1.5 relative z-10 w-full">
        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-[clamp(14px,4.5vw,18px)] text-[#00FF88] tracking-wide leading-none">
          {t('premium_marketing_card.title', 'Vantage insights')}
        </h3>
        <h4 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(11px,3vw,13px)] text-white tracking-wide leading-snug mt-1 opacity-90">
          {t('premium_marketing_card.unlock', 'Unlock {{featureName}}', { featureName })}
        </h4>
        <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(10px,2.5vw,12px)] text-slate-300 max-w-[280px] leading-relaxed mx-auto tracking-wide mt-1.5">
          {description}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full">
        {[
          { icon: Zap, label: t('premium_marketing_card.instant_ai', 'Instant AI') },
          { icon: ShieldCheck, label: t('premium_marketing_card.dashboard_security', 'Dashboard security') }
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-white/5 border border-white/10 shadow-sm">
            <item.icon size={14} className="text-vantage-green shrink-0" />
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(9px,2.2vw,11px)] text-slate-200 tracking-wide">{item.label}</span>
          </div>
        ))}
      </div>

      <button 
        onClick={() => window.dispatchEvent(new CustomEvent('open-premium-modal'))}
        style={{ 
          fontFamily: "'Google Sans', sans-serif", 
          fontWeight: 700,
          backgroundColor: '#A6DDB1',
          color: '#1E293B'
        }}
        className="w-full h-[40px] md:h-[44px] rounded-xl text-[clamp(11px,2.8vw,13px)] tracking-wide shadow-sm hover:brightness-95 active:scale-95 transition-all relative z-10 flex items-center justify-center cursor-pointer border border-transparent outline-none select-none"
      >
        {t('premium_marketing_card.initialize', 'Initialize premium sequence')}
      </button>

      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(8px,2vw,10px)] text-neutral-400 tracking-wide leading-none mt-1">
        {t('premium_marketing_card.footer', 'Powered by Google Gemini // Access restricted to premium level nodes')}
      </p>
    </motion.div>
  );
};
