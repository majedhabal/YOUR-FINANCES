import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, MessageSquare, Crown, Mic, Camera } from 'lucide-react';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface VantageAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  profile: any;
}

export const VantageAIModal: React.FC<VantageAIModalProps> = ({ isOpen, onClose, uid, accounts, transactions, accountBalances, profile }) => {
  const { t } = useTranslation();
  const tierClean = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const hasAIAccess = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now());
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [responseHeader, setResponseHeader] = useState<string | null>(null);
  const [responseFooter, setResponseFooter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      console.log("Photo captured:", e.target.files[0]);
      // Placeholder for future receipt scanning integration in chat
      setQueryInput(t('vantage_ai_modal.photo_attached', 'Photo attached: ') + e.target.files[0].name);
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'en-US'; // Defaulting to English, could be adjusted to locale
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQueryInput(transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const suggestions = [
    t('vantage_ai_modal.q1'),
    t('vantage_ai_modal.q2'),
    t('vantage_ai_modal.q3')
  ];

  const handleClaimSandboxTokens = async () => {
    if (!profile?.uid) return;
    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, { 
        vantageAiTokens: 50000,
        subscriptionTier: 'tier 3',
        isPremium: true
      });
    } catch (err) {
      console.error("Error claiming sandbox tokens:", err);
    }
  };

  const handleQuery = async (text: string) => {
    if (!text.trim()) return;

    const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
    const tokenCost = 50; // Comprehensive record reading and trend analysis advisor

    if (currentTokens < tokenCost) {
      setResponse(`No Vantage AI tokens remaining! This request requires ${tokenCost} tokens, but you only have ${currentTokens} remaining. Please upgrade your plan in settings to Tier 2 or Tier 3 to receive more tokens.`);
      return;
    }

    setLoading(true);
    setActiveQuery(text);
    setResponse(null);

    try {
      // Filter last 30 days for context
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentTxs = transactions
        .filter(tx => new Date(tx.date) >= thirtyDaysAgo)
        .map(tx => ({
          date: new Date(tx.date).toLocaleDateString(),
          amount: tx.amount,
          type: tx.type,
          category: tx.category,
          account: accounts.find(a => a.id === tx.accountId)?.name || 'Unknown'
        }));

      const balancesContext = accounts.map(acc => ({
        name: acc.name,
        balance: accountBalances[acc.id] || 0
      }));

      const lifeProfile = `
        Financial Profile:
        User identity: ${profile.fullName || 'Sara Spence'}, Origin: ${profile.dob || 'Unknown'}, Status: ${profile.maritalStatus || 'Standard'} with ${profile.hasKids ? 'Family' : 'No dependents'}. 
        Core Directive: ${profile.financialGoals || 'Wealth Optimization'}.
      `;

      const context = `
        Financial Data Context (Last 30 Days):
        - Active Account Balances: ${balancesContext.map(b => `${b.name}: ${b.balance}`).join(', ')}
        - Recent Transaction History: ${recentTxs.map(t => `${t.date} | ${t.category}: ${t.amount} (${t.account})`).join('; ')}
        
        ${lifeProfile}
        
        System Instruction: You are VANTAGE, a professional and highly skilled financial advisor. 
        Your goal is to provide precise, helpful, and clear financial insights based on the user's data and financial profile.
        Be helpful, professional, and maintain a premium tone. Use standard financial terminology.
        CRITICAL RULE: You must NEVER give direct recommendations or tips. You must ALWAYS phrase any advice, tips, suggestions, or insights as "Based on research...", "Online sources suggest...", "General industry research indicates...", or "According to financial research and online resources...". Never state recommendations or tips directly or as personal instructions.
        CRITICAL SAFETY RESTRICTION: If the user asks for financial advice, investment advice, asset selection, or 'Should I' financial choices, you MUST prepend the following text to your response: '[ADVICE_HEADER]I cannot provide financial or investment advice.\n\n' AND append the following text to the end of your response block: '\n\n[ADVICE_FOOTER]DISCLAIMER: YOUR FINANCES IS AN AUTOMATED ANALYTICAL UTILITY OPERATED BY ME VANTAGE FZE LLC. INSIGHTS ARE SCALED DATA SUMMARIES GENERATED COMPLETELY FOR EDUCATIONAL AND ORGANIZATIONAL MANAGEMENT INTERFACES AND DO NOT CONSTITUTE REGISTERED FINANCIAL PLANNING, INVESTMENT ADVICE, OR TAX ASSURANCES. MANUALLY VERIFY ALL METRICS BEFORE UNDERTAKING ECONOMIC DEBT ALTERATIONS.'
        If the user is NOT asking for financial advice, do NOT include these markers.
        Prioritize optimization strategies.
        If asked about affordability, correlate total liquidity vs average spending rate.
        Format your response in plain text.
      `;

      const textResponse = await executeVantageAITask('portfolio_optimization', {
        prompt: `${context}\n\nUser Query: ${text}`
      });
      
      if (textResponse) {
        const headerMatch = textResponse.match(/\[ADVICE_HEADER\]([\s\S]*?)(?=\[ADVICE_FOOTER\]|$)/);
        const footerMatch = textResponse.match(/\[ADVICE_FOOTER\]([\s\S]*)/);
        
        let cleanedResponse = textResponse;
        if (headerMatch) {
           setResponseHeader(headerMatch[1].trim());
           cleanedResponse = cleanedResponse.replace(headerMatch[0], '');
        } else {
           setResponseHeader(null);
        }
        
        if (footerMatch) {
           setResponseFooter(footerMatch[1].trim());
           cleanedResponse = cleanedResponse.replace(footerMatch[0], '');
        } else {
           setResponseFooter(null);
        }
        
        setResponse(cleanedResponse.trim() || t('vantage_ai_modal.neural_fail'));
      } else {
        setResponse(t('vantage_ai_modal.neural_fail'));
      }

      // Decrement AI tokens dynamically
      if (profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        const nextTokens = Math.max(0, currentTokens - tokenCost);
        await updateDoc(userRef, { vantageAiTokens: nextTokens });
      }
    } catch (error: any) {
      console.error("Vantage AI Error:", error);
      setResponse(error.message || t('vantage_ai_modal.unstable_fail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-[92%] bg-vantage-card border border-[#E1E8ED] rounded-[1.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-6 pb-4 flex items-center justify-between border-b border-[#E1E8ED]">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-2xl bg-vantage-green/10 flex items-center justify-center">
                    <Sparkles size={18} className="text-vantage-green" />
                 </div>
                 <div className="flex flex-col">
                    <h2 className="text-[3vw] font-bold text-vantage-green leading-none" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      {t('vantage_ai_modal.advisor_ai', 'Advisor AI')}
                    </h2>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-[2vw] text-vantage-muted font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {hasAIAccess ? t('vantage_ai_modal.tokens_remaining', { count: typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0' }) : t('vantage_ai_modal.premium_interface', 'Premium Assistant Interface')}
                      </span>
                      <button
                        onClick={handleClaimSandboxTokens}
                        className="px-2.5 py-0.5 text-[1.5vw] md:text-xs font-bold text-vantage-green bg-vantage-green/10 border border-vantage-green/25 rounded-full hover:bg-vantage-green/20 transition-colors cursor-pointer"
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                      >
                        {t('vantage_ai.claim_sandbox_tokens')}
                      </button>
                    </div>
                 </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 text-vantage-muted hover:text-vantage-text transition-colors active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-10 scrollbar-hide" ref={scrollRef}>
              {!hasAIAccess ? (
                <div className="flex flex-col gap-4 py-4">
                   <PremiumMarketingCard 
                     featureName={t('vantage_ai_modal.advisor_ai')} 
                     description={t('vantage_ai_modal.premium_description')} 
                   />
                </div>
              ) : !response && !loading ? (
                <div className="flex flex-col gap-10 py-4">
                  <div className="space-y-4">
                    <h3 className="text-[8vw] font-bold text-vantage-text leading-[1.1] tracking-tighter" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      {t('vantage_ai_modal.optimize_capital', 'Optimize Capital. Query YOUR FINANCES.')}
                    </h3>
                    <p className="text-[2.5vw] text-vantage-muted font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      {t('vantage_ai_modal.secure_link', 'Secure Link: Synchronized with Account Records.')}
                    </p>
                  </div>

                  <div className="flex flex-col gap-4">
                     <span className="text-[2.5vw] font-bold text-vantage-muted pl-1" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                       {t('vantage_ai_modal.quick_questions', 'Quick Questions')}
                     </span>
                     <div className="flex flex-col gap-3">
                        {suggestions.map((s, i) => (
                           <button 
                             key={`action-item-${i}`}
                             onClick={() => handleQuery(s)}
                             className="p-6 bg-vantage-text/5 border border-vantage-text/10 rounded-[1.5rem] text-[3vw] text-vantage-muted font-bold hover:border-vantage-green hover:bg-vantage-green/5 transition-all text-left group flex items-center justify-between shadow-sm"
                             style={{ fontFamily: "'Google Sans', sans-serif" }}
                           >
                              {s}
                              <Send size={16} className="opacity-0 group-hover:opacity-100 transition-all text-vantage-green" />
                           </button>
                        ))}
                     </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-10">
                   {/* User Message */}
                   <div className="flex flex-col items-end gap-3">
                      <div className="bg-vantage-text/5 rounded-3xl rounded-tr-none p-6 max-w-[85%] border border-vantage-text/10 shadow-sm">
                         <p className="text-[3.5vw] text-vantage-text font-bold tracking-tight leading-relaxed" style={{ fontFamily: "'Google Sans', sans-serif" }}>{activeQuery}</p>
                      </div>
                      <span className="text-[2vw] text-vantage-muted font-normal pr-2" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {t('vantage_ai_modal.request_processed', 'Request Processed')}
                      </span>
                   </div>

                   {/* AI Agent Response */}
                   <div className="flex flex-col gap-5">
                      <div className="flex items-center gap-3 px-1">
                         <div className="w-8 h-8 rounded-xl bg-vantage-green/10 flex items-center justify-center">
                            <Sparkles size={14} className="text-vantage-green" />
                         </div>
                         <span className="text-[2.5vw] font-bold text-vantage-green" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                           {t('vantage_ai_modal.advisor_response', 'Advisor AI Response')}
                         </span>
                      </div>
                      
                      {loading ? (
                        <div className="p-12 border border-[#E1E8ED] rounded-[1.5rem] flex flex-col items-center gap-6 shadow-sm" style={{ backgroundColor: '#FFFFFF' }}>
                           <div className="w-10 h-10 border-[3px] border-vantage-green/20 border-t-vantage-green rounded-full animate-spin"></div>
                           <span className="text-[3vw] text-neutral-800 tracking-wide text-center" style={{ fontFamily: '"Google Sans", system-ui, sans-serif', fontWeight: 400 }}>
                              {t('vantage_ai_modal.analyzing', 'Analyzing capital matrices via YOUR FINANCES Advisor AI...')}
                           </span>
                        </div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 bg-vantage-text/5 border border-vantage-text/10 rounded-[1.5rem] relative shadow-sm overflow-hidden"
                        >
                           <div className="text-[3.5vw] text-vantage-text leading-relaxed font-medium whitespace-pre-wrap selection:bg-vantage-green/20 relative z-10 tracking-tight" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                              {responseHeader && <div className="font-bold text-red-600 mb-4">{responseHeader}</div>}
                               {response}
                               {responseFooter && <div className="mt-4 text-xs text-vantage-muted italic">{responseFooter}</div>}
                           </div>
                           <div className="mt-10 pt-8 border-t border-vantage-text/10 flex justify-center relative z-10">
                              <button 
                                onClick={onClose}
                                className="px-10 py-4 bg-white border border-vantage-text/10 rounded-xl text-[2.5vw] font-bold text-vantage-muted hover:text-vantage-green hover:border-vantage-green transition-all shadow-sm active:scale-95"
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                              >
                                {t('vantage_ai_modal.close', 'Close Assistant')}
                              </button>
                           </div>
                        </motion.div>
                      )}
                   </div>
                </div>
              )}
            </div>

            {/* Search Input Bar */}
            {!loading && hasAIAccess && (
              <div className="p-6 pt-4 bg-vantage-card border-t border-[#E1E8ED]">
                <div className="relative w-full">
                    <input 
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleQuery(queryInput)}
                      placeholder={t('vantage_ai_modal.placeholder', 'Ask a question...')}
                      className="w-full bg-white border border-vantage-text/10 rounded-[1.5rem] py-5 pl-7 pr-52 text-[3.5vw] text-vantage-text focus:border-vantage-green outline-none transition-all placeholder:text-vantage-muted font-bold shadow-sm"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleCameraChange}
                      className="hidden"
                    />
                    <div className="absolute right-2 top-1.5 flex items-center gap-1">
                         <button
                            onClick={() => cameraInputRef.current?.click()}
                            className="w-11 h-11 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-all flex items-center justify-center"
                         >
                            <Camera size={22} className="text-vantage-muted" />
                         </button>
                         <button
                            onClick={toggleListening}
                            className={`w-11 h-11 rounded-xl transition-all flex items-center justify-center ${isListening ? 'bg-red-500 animate-pulse' : 'bg-neutral-100 hover:bg-neutral-200'}`}
                         >
                            <Mic size={22} className={isListening ? 'text-white' : 'text-vantage-muted'} />
                         </button>
                         <button 
                          onClick={() => handleQuery(queryInput)}
                          disabled={!queryInput.trim()}
                          className="w-11 h-11 bg-vantage-green text-white rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
                        >
                          <Send size={22} strokeWidth={3} />
                        </button>
                    </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
