import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Shield, Info } from 'lucide-react';

interface AdContainerProps {
  subscriptionTier: string;
}

export const AdContainer: React.FC<AdContainerProps> = ({ subscriptionTier }) => {
  if (subscriptionTier && subscriptionTier.toLowerCase() !== 'free') return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-[90%] mx-auto mt-4 mb-4 p-6 rounded-[1.5rem] bg-white border-[1.5px] border-[#E1E8ED] relative overflow-hidden group shadow-sm"
    >
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Sparkles size={64} className="text-vantage-green" />
      </div>
      
      <div className="flex flex-col gap-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-vantage-green/10 flex items-center justify-center">
              <Shield size={12} className="text-vantage-green" />
            </div>
            <span className="text-[2.5vw] font-black text-[#57606F] uppercase tracking-[0.2em]">Secure Advertisement</span>
          </div>
          <button className="text-[2vw] text-[#57606F]/50 hover:text-black transition-colors flex items-center gap-1 uppercase tracking-widest font-black">
            <Info size={10} />
            Sponsored
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <h4 className="text-[3.5vw] font-black text-black tracking-tight uppercase">Unlock Strategic Advantages</h4>
          <p className="text-[2.5vw] text-[#57606F] leading-relaxed font-black">
            Tired of ads? YOUR FINANCES Premium provides AI insights, biometric encryption, and an ad-free experience.
          </p>
        </div>

        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('open-premium-modal'))}
          className="bg-vantage-green py-3 rounded-[1rem] text-[2.5vw] font-black text-white uppercase tracking-[0.4em] shadow-lg shadow-vantage-green/20 hover:scale-[1.02] active:scale-95 transition-all w-full text-center"
        >
          Upgrade to Premium Protocol
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
    </motion.div>
  );
};
