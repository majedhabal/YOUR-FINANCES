import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Brain, Zap, Target, TrendingDown, Lightbulb, MessageCircle, Send, Camera as CameraIcon, CheckCircle2, Lock as LockIcon, Crown } from 'lucide-react';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { PremiumModal } from './PremiumModal';
import { auth, db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { AdContainer } from './AdContainer';

interface AIInsightsProps {
  profile: any;
  onUpdateProfile: (profile: any) => void;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ profile, onUpdateProfile }) => {
  const { t } = useTranslation();
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [forecast, setForecast] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  const isPremium = !!(profile?.isPremium || (profile?.subscriptionTier && profile.subscriptionTier.toLowerCase() !== 'free') || (profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()));

  const generateForecast = async () => {
    const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
    const tokenCost = 50; // Deep Financial Forecast and Pivot points

    if (currentTokens < tokenCost) {
      setForecast(`No Vantage AI tokens remaining! Deep forecasting requires ${tokenCost} tokens, but you only have ${currentTokens} remaining. Please upgrade your plan in settings or claim sandbox tokens.`);
      return;
    }

    setForecastLoading(true);
    try {
      const context = await getFinancialContext();
      const txContext = context.transactions.map(t => `${t.date} | ${t.category}: ${t.amount} (${t.notes || 'No notes'})`).join('; ');
      const prompt = `You are Vantage AI. Perform a DEEP FINANCIAL FORECAST for the next 6 months based on:
         Balance: $${context.balance}
         Recent Transactions: ${txContext}
         Predict trajectory and suggest 3 pivot points for wealth maximization. Concisely.
         CRITICAL RULE: You must NEVER give direct recommendations or tips. You must ALWAYS phrase any advice, suggestions, or insights as "Based on research...", "Online sources suggest...", or "According to financial research...". Never state recommendations or tips directly.`;
      
      const text = await executeVantageAITask('generate_financial_forecast', { prompt });
      setForecast(text || "Forecast unavailable.");

      // Decrement tokens dynamically
      if (profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        const nextTokens = Math.max(0, currentTokens - tokenCost);
        await updateDoc(userRef, { vantageAiTokens: nextTokens });
      }
    } catch (err: any) {
      console.error('Forecast Error:', err);
      setForecast(err.message || "Strategic forecasting requires more historical data.");
    } finally {
      setForecastLoading(false);
    }
  };

  const getFinancialContext = async () => {
    try {
      const user = auth.currentUser;
      const idToken = await user?.getIdToken();
      
      const [balRes, txRes] = await Promise.all([
        fetch('/api/balance', { headers: { 'X-Vantage-Authorization': `Bearer ${idToken}` } }),
        fetch('/api/transactions', { headers: { 'X-Vantage-Authorization': `Bearer ${idToken}` } })
      ]);

      const getSafeJson = async (res: Response) => {
        if (!res.ok) {
           console.warn(`API Error ${res.status}:`, await res.text().catch(() => "unknown"));
           return null;
        }
        try {
          return await res.json();
        } catch (e) {
          console.warn("API returned invalid JSON:", await res.text().catch(() => "unknown"));
          return null;
        }
      };

      const balData = await getSafeJson(balRes);
      const txData = await getSafeJson(txRes);
      
      return { 
        balance: balData ? (balData.startingBalance || balData.balance) : 'Unknown', 
        transactions: (txData && Array.isArray(txData)) ? txData.slice(-5) : [] 
      };
    } catch (err) {
      console.error("Context Fetch Failure:", err);
      return { balance: 'Unknown', transactions: [] };
    }
  };

  const generateInsight = async (customPrompt?: string) => {
    const isGeneral = !customPrompt;
    if (isGeneral) setInsightLoading(true);
    else setChatLoading(true);

    const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
    let tokenCost = 0;

    if (!isGeneral && customPrompt) {
      const lowerMessage = customPrompt.toLowerCase();
      const keywords = ['trend', 'forecast', 'predict', 'analyze', 'analysis', 'spending', 'habit', 'chart', 'comprehensive', 'history', 'pattern', 'future', 'projection', 'growth', 'budget', 'health'];
      const isTrendOrForecast = keywords.some(kw => lowerMessage.includes(kw));
      tokenCost = isTrendOrForecast ? 50 : 10;

      if (currentTokens < tokenCost) {
        setInsight(`No Vantage AI tokens remaining! This request requires ${tokenCost} tokens, but you only have ${currentTokens} remaining. Please upgrade your plan in settings or claim sandbox tokens.`);
        setInsightLoading(false);
        setChatLoading(false);
        return;
      }
    }

    try {
      const context = await getFinancialContext();
      const txContext = context.transactions.map(t => `${t.date} | ${t.category}: ${t.amount} (${t.notes || 'No notes'})`).join('; ');
      const promptText = customPrompt || 'Give me a general financial health summary based on my profile.';
      const prompt = `You are Vantage AI, a premium, witty financial advisor. 
        Current User Balance: $${context.balance}. 
        Recent Transaction History: ${txContext}.
        User Question/Request: "${promptText}"
        Give a concise (max 60 words), witty, and strategically sound answer. Be honest about their health but stay high-end.
        CRITICAL RULE: You must NEVER give direct recommendations or tips. You must ALWAYS phrase any advice, tips, suggestions, or insights as "Based on research...", "Online sources suggest...", or "According to financial research...". Never state recommendations or tips directly.`;
      
      const text = await executeVantageAITask('summarize_document', { prompt });
      setInsight(text || "Insight unavailable.");

      // Decrement tokens dynamically if user-initiated manual question
      if (!isGeneral && customPrompt && profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        const nextTokens = Math.max(0, currentTokens - tokenCost);
        await updateDoc(userRef, { vantageAiTokens: nextTokens });
      }
    } catch (err: any) {
      console.error('AI Insight Error:', err);
      setInsight(err.message || "Our AI advisors are currently busy with high-profile consultations. Please try again shortly.");
    } finally {
      setInsightLoading(false);
      setChatLoading(false);
    }
  };

  const handleAskVantage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await generateInsight(query);
    setQuery('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
    const tokenCost = 100; // Receipt scanning is 100 tokens

    if (currentTokens < tokenCost) {
      alert(`No Vantage AI tokens remaining! Receipt scanning requires ${tokenCost} tokens, but you only have ${currentTokens} remaining.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      setScanLoading(true);
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const prompt = "Extract the Store Name, Date, and Total Amount from this receipt. Return ONLY a JSON object with keys: storeName, date, amount.";
        
        const text = await executeVantageAITask('parse_receipt_image', {
          prompt,
          image: { data: base64Data, mimeType: file.type }
        });
        const cleanJson = text?.replace(/```json|```/g, "").trim();
        if (cleanJson) {
          setScanResult(JSON.parse(cleanJson));

          // Decrement tokens dynamically on successful scan
          if (profile?.uid) {
            const userRef = doc(db, 'users', profile.uid);
            const nextTokens = Math.max(0, currentTokens - tokenCost);
            await updateDoc(userRef, { vantageAiTokens: nextTokens });
          }
        }
      } catch (err) {
        console.error('Scan Error:', err);
      } finally {
        setScanLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isPremium) {
      generateInsight();
    }
  }, [isPremium]);

  return (
    <div className="flex flex-col gap-8 pb-24">
      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        uid={profile.uid}
        profile={profile}
        onSuccess={onUpdateProfile}
      />

      <div className="flex flex-col gap-1">
        <h2 className="text-3xl font-black text-vantage-green uppercase tracking-[0.4em] p-2 border-l-4 border-vantage-green bg-vantage-card">{t('ai.financial_advisor')}</h2>
        <p className="text-[12px] text-vantage-blue-grey uppercase tracking-[0.2em] font-medium mt-1 p-2">{t('ai.smart_strategy_center')}</p>
      </div>

      {!isPremium ? (
        <div className="flex flex-col gap-8">
          <PremiumMarketingCard 
            featureName={t('ai.financial_advisor')}
            description={t('ai.unlock_advantages')} 
          />
          <AdContainer subscriptionTier={profile?.subscriptionTier || 'free'} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <form onSubmit={handleAskVantage} className="relative group">
              <div className="absolute inset-0 bg-vantage-green/5 blur-xl group-focus-within:bg-vantage-green/10 transition-all rounded-3xl"></div>
              <div className="relative flex items-center bg-vantage-muted-green/30 border border-white/5 rounded-3xl p-2 pr-4 focus-within:border-vantage-green transition-colors">
                 <div className="w-12 h-12 flex items-center justify-center text-vantage-green bg-black/40 rounded-2xl ml-1">
                  {chatLoading ? <Zap size={22} className="animate-spin text-vantage-green" /> : <MessageCircle size={22} />}
                </div>
                <input 
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('ai.ask_question')}
                  className="flex-1 bg-transparent border-none outline-none text-sm py-3 px-4 placeholder:text-neutral-600 font-medium text-white"
                />
                <button 
                  type="submit"
                  disabled={chatLoading || !query.trim()}
                  className="p-3 bg-vantage-green text-black rounded-2xl disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-[0_4px_15px_rgba(32,201,151,0.2)]"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </div>

          {/* Main Insight Card */}
          <motion.div 
            layout
            className="p-8 rounded-[2.5rem] bg-vantage-card border border-white/5 shadow-2xl shadow-black/50 relative overflow-hidden group hover:border-vantage-green/20 transition-colors"
          >
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity rotate-12">
              <Sparkles size={120} className="text-vantage-green" />
            </div>
            
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-14 h-14 bg-black/40 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner">
                <Brain size={28} className="text-vantage-green" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-vantage-blue-grey uppercase tracking-[0.3em] leading-none mb-2">{t('ai.expert_system')}</span>
                <span className="text-lg font-black uppercase text-vantage-green leading-none tracking-tighter">{t('ai.ai_advisory_pulse')}</span>
              </div>
            </div>

            <div className="relative z-10">
              {insightLoading ? (
                <div className="flex flex-col gap-5 animate-pulse">
                   <div className="h-5 bg-white/5 rounded-xl w-full"></div>
                   <div className="h-5 bg-white/5 rounded-xl w-[92%]"></div>
                   <div className="h-5 bg-white/5 rounded-xl w-[85%]"></div>
                </div>
              ) : (
                <p className="text-xl font-medium leading-relaxed text-white/90 tracking-tight">
                  {insight}
                </p>
              )}
            </div>
          </motion.div>

          {/* Receipt Scanner */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <span className="text-[10px] items-center font-black text-vantage-blue-grey uppercase tracking-[0.4em]">{t('ai.vision_recognition')}</span>
              </div>
              <div className="rounded-[2.5rem] bg-vantage-card border border-white/5 p-8 flex flex-col gap-4 relative overflow-hidden group hover:border-vantage-green/20 transition-all shadow-xl">
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex flex-col gap-1">
                    <span className="text-xl font-black text-white uppercase tracking-tighter">{t('ai.receipt_scanning')}</span>
                    <span className="text-xs text-vantage-blue-grey uppercase tracking-widest font-bold">{t('ai.smart_optical_recognition')}</span>
                  </div>
                <label className="cursor-pointer p-6 bg-vantage-green text-black rounded-[1.5rem] hover:scale-105 transition-all active:scale-95 shadow-2xl shadow-vantage-green/20 flex items-center justify-center">
                    {scanLoading ? <Zap size={28} className="animate-spin" /> : <CameraIcon size={28} />}
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>

              <AnimatePresence>
                {scanResult && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-8 pt-8 border-t border-white/5 flex flex-col gap-5"
                  >
                    <div className="flex items-center gap-3 text-vantage-green">
                      <div className="w-2 h-2 rounded-full bg-vantage-green animate-ping" />
                      <span className="text-[10px] font-black uppercase tracking-[0.3em]">{t('ai.extraction_complete')}</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/40 border border-white/5 p-6 rounded-[1.5rem] shadow-inner">
                       <div className="flex flex-col">
                          <span className="text-[10px] text-vantage-blue-grey uppercase tracking-widest mb-1 font-bold">{t('ai.store_agent')}</span>
                          <span className="text-lg font-black text-white tracking-tight">{scanResult.storeName}</span>
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-[10px] text-vantage-blue-grey uppercase tracking-widest mb-1 font-bold">{t('ai.liquid_value')}</span>
                          <span className="text-xl font-black text-vantage-green tracking-tight">{scanResult.amount} <span className="text-[10px] text-vantage-blue-grey uppercase">CUR</span></span>
                       </div>
                    </div>
                    <button className="text-center text-[10px] font-black text-vantage-blue-grey hover:text-white uppercase tracking-[0.2em] mt-2 transition-colors" onClick={() => setScanResult(null)}>
                      {t('ai.clear_extraction_cache')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Deep Forecasting */}
          <div className="flex flex-col gap-4">
             <div className="flex items-center justify-between px-2">
                <span className="text-[10px] items-center font-black text-vantage-blue-grey uppercase tracking-[0.4em]">{t('ai.strategic_horizon')}</span>
              </div>
              <div className="p-8 rounded-[2.5rem] bg-vantage-card border border-white/5 relative overflow-hidden group hover:border-vantage-green/20 transition-all shadow-2xl shadow-black/50">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                   <Zap size={180} className="text-vantage-green" />
                </div>

                <div className="relative z-10 flex flex-col gap-6">
                   {!forecast && !forecastLoading && (
                     <div className="flex flex-col items-center gap-8 py-4">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-vantage-green/5 border border-vantage-green/10 flex items-center justify-center">
                           <Target className="text-vantage-green" size={32} />
                        </div>
                        <div className="flex flex-col items-center gap-2 text-center">
                           <h4 className="text-xl font-black text-white uppercase tracking-tighter">{t('ai.balance_prediction')}</h4>
                           <p className="text-xs text-vantage-blue-grey font-medium max-w-[280px] leading-relaxed">{t('ai.prediction_desc')}</p>
                        </div>
                        <button 
                          onClick={generateForecast}
                          className="px-10 py-5 rounded-[1.5rem] bg-vantage-green text-black font-black text-[10px] uppercase tracking-[0.3em] shadow-2xl shadow-vantage-green/20 hover:scale-105 active:scale-95 transition-all w-full"
                        >
                          {t('ai.run_prediction')}
                        </button>
                     </div>
                   )}
                   {forecastLoading && (
                      <div className="flex flex-col gap-5 animate-pulse py-4">
                         <div className="h-5 bg-white/5 rounded-xl w-full"></div>
                         <div className="h-5 bg-white/5 rounded-xl w-[95%]"></div>
                         <div className="h-5 bg-white/5 rounded-xl w-[88%]"></div>
                         <div className="flex items-center gap-3 mt-4 self-center">
                            <Zap size={20} className="text-vantage-green animate-bounce" />
                            <span className="text-[10px] font-black text-vantage-green uppercase tracking-widest">{t('ai.simulating')}</span>
                         </div>
                      </div>
                   )}
                   {forecast && (
                      <div className="flex flex-col gap-6">
                         <div className="flex items-center gap-3 text-vantage-green">
                           <div className="w-1.5 h-6 bg-vantage-green rounded-full shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
                           <span className="text-[10px] font-black uppercase tracking-[0.3em]">{t('ai.forecast_results')}</span>
                         </div>
                         <p className="text-xl font-medium text-white/90 leading-relaxed italic border-l-4 border-vantage-green/20 pl-8 tracking-tight">
                           {forecast}
                         </p>
                         <button onClick={() => setForecast(null)} className="text-[10px] text-vantage-blue-grey hover:text-vantage-green uppercase font-black tracking-[0.2em] self-start mt-4 transition-colors">{t('ai.close_prediction')}</button>
                      </div>
                   )}
                </div>
              </div>
          </div>

          {/* Proactive Tip */}
          <div className="p-8 rounded-[2.5rem] bg-vantage-green/5 border border-vantage-green/10 flex gap-6 shadow-xl">
             <div className="w-14 h-14 bg-vantage-green/10 rounded-2xl flex items-center justify-center shrink-0 border border-vantage-green/20 shadow-inner">
               <Lightbulb className="text-vantage-green" size={28} />
             </div>
             <div className="flex flex-col gap-2">
               <span className="text-[10px] font-black text-vantage-green uppercase tracking-[0.3em] mb-1">{t('ai.vantage_insight')}</span>
               <p className="text-sm text-vantage-blue-grey leading-relaxed font-medium">
                 {t('ai.thursday_insight', { limit: t('ai.thursday_guard') })}
               </p>
             </div>
          </div>
        </>
      )}
    </div>
  );
};
