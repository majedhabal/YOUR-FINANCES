import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Bot, RefreshCw } from 'lucide-react';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { useTranslation } from 'react-i18next';

interface VantageAIProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  profile: any;
  refreshGlobalBalances?: () => Promise<void>;
  isInline?: boolean;
}

export const VantageAI: React.FC<VantageAIProps> = ({
  isOpen,
  onClose,
  uid,
  accounts,
  transactions,
  accountBalances,
  profile
}) => {
  const { t } = useTranslation();
  const [queryInput, setQueryInput] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeQuery, setActiveQuery] = useState('');

  if (!isOpen) return null;

  const isPremium = profile?.subscriptionTier === 'premium';

  const handleExecuteInsightTask = async () => {
    if (!queryInput.trim()) return;
    setLoading(true);
    setActiveQuery(queryInput);
    setQueryInput('');
    setResponse(null);

    try {
      const payload = {
        prompt: queryInput,
        profile,
        accounts,
        accountBalances,
        recentHistory: transactions.slice(0, 30)
      };
      const result = await executeVantageAITask('clean_text', payload);
      setResponse(result || t('vantage_ai.empty_response'));
    } catch (err) {
      console.error("Assistant execution failure:", err);
      setResponse(t('vantage_ai.error_response'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-end p-4 box-border">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm" onClick={onClose} />
        
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="relative w-full max-w-[440px] h-[calc(100vh-2rem)] flex flex-col overflow-hidden box-border bg-white"
          style={{
            borderRadius: '24px',
            boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.05)',
            border: '1px solid #E1E8ED'
          }}
        >
          {/* HEADER ROW BAR */}
          <div className="p-5 flex justify-between items-center border-b border-neutral-100 bg-white shrink-0 select-none">
            <div className="flex items-center gap-2.5">
              <Sparkles size={16} className="text-[#366945]" />
              <h3 className="font-headline-md text-base text-neutral-800 m-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t('vantage_ai.title')}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 text-neutral-500 hover:text-neutral-800 cursor-pointer transition-colors"><X size={16} /></button>
          </div>

          {/* MESSAGE STREAM CHAT LOG VIEWPORT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 container-scroll-patch box-border">
            {!isPremium ? (
              <div className="h-full flex items-center justify-center">
                <PremiumMarketingCard featureName="Vantage Core AI" description="Unlock localized natural language processing, predictive envelope warnings, and automated account matching vectors instantly." />
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {!activeQuery && (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 text-sm text-neutral-600 leading-relaxed font-body-md select-none">
                    {t('vantage_ai.private_context')}
                  </div>
                )}
                {activeQuery && (
                  <div className="flex flex-col items-end w-full pl-6 select-none box-border">
                    <div className="p-4 bg-primary-container text-neutral-800 text-sm font-body-md rounded-2xl rounded-br-sm border border-primary/10 break-words max-w-full">{activeQuery}</div>
                  </div>
                )}
                {loading && (
                  <div className="flex items-center gap-2 text-sm font-body-md text-neutral-500 py-1 select-none">
                    <RefreshCw size={14} className="animate-spin text-[#366945]" />
                    <span>{t('vantage_ai.processing')}</span>
                  </div>
                )}
                {response && (
                  <div className="flex gap-3 items-start pr-6 leading-relaxed w-full box-border">
                    <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary/20 flex items-center justify-center text-[#366945] mt-0.5 shrink-0 select-none"><Bot size={16} /></div>
                    <div className="p-4 bg-neutral-50 text-neutral-800 font-body-md text-sm rounded-2xl rounded-bl-sm border border-neutral-100 space-y-2 break-words whitespace-pre-wrap flex-1">{response}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* INTERACTIVE INPUT TRAIL CONTROL FOR PREALS ROW */}
          {isPremium && (
            <div className="p-4 bg-white border-t border-neutral-100 shrink-0 box-border">
              <div className="relative flex items-center w-full max-w-full">
                <input 
                  type="text" 
                  value={queryInput} 
                  onChange={(e) => setQueryInput(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleExecuteInsightTask()}
                  placeholder={t('vantage_ai.placeholder')} 
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-full py-3 pl-4 pr-12 text-sm text-neutral-800 focus:border-[#366945] outline-none placeholder:text-neutral-400 font-body-md box-border"
                />
                <button onClick={handleExecuteInsightTask} disabled={!queryInput.trim() || loading} className="absolute right-1.5 p-2 bg-[#A6DDB1] text-[#366945] rounded-full hover:opacity-90 active:scale-95 transition-all cursor-pointer border-none flex items-center justify-center disabled:opacity-40"><Send size={16} strokeWidth={2.5} /></button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};