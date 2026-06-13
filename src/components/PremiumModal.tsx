import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ShieldCheck, Zap, Camera, Brain, X, Check, CreditCard } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onSuccess: (profile: any) => void;
  profile: any;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, uid, onSuccess, profile }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'benefits' | 'payment' | 'success'>('benefits');
  const [hasReadTerms, setHasReadTerms] = useState(!!profile?.hasAcceptedTerms);

  const benefits = [
    {
      icon: ShieldCheck,
      title: 'Ad-Free Experience',
      desc: 'Focus on your wealth without distractions. Zero third-party interruptions.',
      color: 'text-vantage-green',
      bg: 'bg-vantage-green/10'
    },
    {
      icon: Camera,
      title: 'Vision Receipt Scanning',
      desc: 'Automatic expense extraction. Stop manual entry, start living.',
      color: 'text-vantage-green',
      bg: 'bg-vantage-green/10'
    },
    {
      icon: Brain,
      title: 'AI Wealth Advisor',
      desc: 'Deep forecasting, proactive portfolio pivots, and 24/7 strategic chat.',
      color: 'text-vantage-green',
      bg: 'bg-vantage-green/10'
    }
  ];

  const handleSubscribe = async () => {
    if (!hasReadTerms) return;
    setIsProcessing(true);
    // Mock payment delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { 
        subscriptionTier: 'premium',
        isPremium: true,
        premiumSince: new Date().toISOString(),
        hasAcceptedTerms: true
      });
      onSuccess({ ...profile, subscriptionTier: 'premium', isPremium: true, hasAcceptedTerms: true });
      setStep('success');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-[92%] bg-vantage-card border border-[#E1E8ED] rounded-[1.5rem] overflow-hidden shadow-2xl"
          >
            {step === 'benefits' && (
              <div className="p-8 flex flex-col gap-8">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-vantage-green" size={24} />
                      <h3 className="text-[5vw] font-bold tracking-tight text-vantage-green leading-tight">YOUR FINANCES Premium</h3>
                    </div>
                    <p className="text-[2.5vw] text-vantage-muted tracking-wide font-bold">The strategic edge</p>
                  </div>
                  <button onClick={onClose} className="p-3 text-vantage-muted hover:text-vantage-text transition-colors active:scale-90">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex flex-col gap-6">
                  {benefits.map((b, i) => (
                    <div key={i} className="flex gap-5 group">
                      <div className={`w-14 h-14 rounded-2xl ${b.bg} flex items-center justify-center shrink-0`}>
                        <b.icon className={b.color} size={24} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[4vw] font-bold text-vantage-text tracking-tight">{b.title}</span>
                        <p className="text-[3vw] text-vantage-muted leading-relaxed font-medium tracking-wide">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-4">
                   <div className="p-6 rounded-2xl bg-vantage-text/5 border border-vantage-text/10 flex justify-between items-center">
                      <div className="flex flex-col">
                         <span className="text-[2.5vw] font-bold text-vantage-green tracking-wide">Signature plan</span>
                         <span className="text-[6vw] font-bold text-vantage-text leading-none">$19.99 <span className="text-[3vw] text-vantage-muted tracking-tight">/ month</span></span>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="text-[2vw] text-vantage-green font-bold tracking-wide px-3 py-1 rounded-full bg-vantage-green/10 border border-vantage-green/20">Secure</span>
                      </div>
                   </div>

                   <button 
                    onClick={() => setStep('payment')}
                    className="w-full py-5 bg-vantage-green text-white font-bold tracking-wide rounded-xl shadow-sm active:scale-95 transition-all text-[3vw]"
                   >
                     Initialize upgrade
                   </button>
                   <p className="text-[2vw] text-center text-vantage-muted font-bold tracking-wide">Cancel anytime. Your privacy is our highest mandate.</p>
                </div>
              </div>
            )}

            {step === 'payment' && (
              <div className="p-8 flex flex-col gap-8">
                 <div className="flex justify-between items-start">
                  <button onClick={() => setStep('benefits')} className="text-[2.5vw] font-bold text-vantage-muted tracking-wide hover:text-vantage-green transition-colors">
                    Back to benefits
                  </button>
                  <h3 className="text-[4vw] font-bold tracking-tight text-vantage-text">Premium authorization</h3>
                  <div className="w-10"></div>
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[2.5vw] font-bold text-vantage-muted tracking-wide px-2">Payment instrument</label>
                    <div className="p-6 rounded-2xl bg-vantage-text/5 border border-vantage-text/10 flex items-center justify-between">
                       <div className="flex items-center gap-4">
                          <CreditCard className="text-vantage-muted" size={20} />
                          <span className="text-[3.5vw] font-bold text-vantage-text">•••• •••• •••• 8812</span>
                       </div>
                       <span className="text-[2vw] font-bold text-vantage-muted tracking-wide">Mock card</span>
                    </div>
                  </div>

                   <div className="flex flex-col gap-3">
                     <div className="flex justify-between px-2">
                        <span className="text-[3vw] text-vantage-muted font-bold">Transaction value</span>
                        <span className="text-[3vw] font-bold text-vantage-text">$19.99</span>
                     </div>
                     <div className="flex justify-between px-2">
                        <span className="text-[3vw] text-vantage-muted font-bold">Service period</span>
                        <span className="text-[3vw] font-bold text-vantage-text">Monthly recurring</span>
                     </div>
                  </div>

                  {/* Terms Acceptance Checkbox */}
                  <div className="flex items-start gap-4 p-5 bg-white/[0.02] border border-white/5 rounded-2xl">
                    <input 
                      type="checkbox" 
                      id="opt-terms-check"
                      checked={hasReadTerms}
                      onChange={(e) => setHasReadTerms(e.target.checked)}
                      className="mt-1.5 w-4 h-4 rounded border-white/10 bg-neutral-950 text-vantage-green focus:ring-vantage-green cursor-pointer"
                    />
                    <label htmlFor="opt-terms-check" className="text-[2.8vw] sm:text-[11px] text-vantage-muted font-bold leading-relaxed cursor-pointer select-none tracking-wide">
                      I have read and agree to the <span className="text-white underline decoration-vantage-green cursor-pointer">Terms of Engagement</span> of YOUR FINANCES.
                    </label>
                  </div>
                </div>

                <button 
                  disabled={isProcessing || !hasReadTerms}
                  onClick={handleSubscribe}
                  className={`w-full py-5 text-white font-bold tracking-wide rounded-xl shadow-sm flex items-center justify-center gap-3 transition-all text-[3vw] ${isProcessing || !hasReadTerms ? 'bg-neutral-800 text-neutral-500 opacity-60 cursor-not-allowed' : 'bg-vantage-green hover:bg-emerald-600 active:scale-95 text-white'}`}
                >
                   {isProcessing ? (
                     <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                   ) : (
                     <>
                        <ShieldCheck size={20} />
                        Confirm strategic upgrade
                     </>
                   )}
                </button>
              </div>
            )}

            {step === 'success' && (
              <div className="p-[3rem] flex flex-col items-center gap-6 text-center">
                   <motion.div 
                   initial={{ scale: 0 }}
                   animate={{ scale: 1 }}
                   transition={{ type: 'spring', damping: 12, stiffness: 300 }}
                   className="w-[6rem] h-[6rem] rounded-full bg-emerald-500/10 flex items-center justify-center"
                 >
                    <Check className="text-emerald-500" size={48} />
                 </motion.div>
                 
                 <div className="flex flex-col gap-2">
                    <h3 className="text-[1.8rem] font-medium tracking-tight text-vantage-green leading-tight">Welcome to YOUR FINANCES Premium</h3>
                    <p className="text-[0.8rem] text-vantage-blue-grey font-medium">Your strategic advantages have been provisioned in the YOUR FINANCES Dashboard.</p>
                 </div>

                 <button 
                   onClick={onClose}
                   className="mt-[1rem] px-[2.5rem] py-[1.25rem] bg-vantage-green text-black font-bold tracking-wide rounded-full shadow-2xl shadow-vantage-green/30 active:scale-95 transition-all text-[0.75rem]"
                 >
                    Enter private sector
                 </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
