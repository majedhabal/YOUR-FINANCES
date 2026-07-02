import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Bot, RefreshCw } from 'lucide-react';
import { executeVantageAITask } from '../lib/VantageAIRouter';
import { PremiumMarketingCard } from './PremiumMarketingCard';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ReactMarkdown from 'react-markdown';

declare global {
  interface Window {
    __vantage_active_chat?: any;
  }
}

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

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-base font-bold text-neutral-900 mb-2 mt-3" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-sm font-bold text-neutral-900 mb-1.5 mt-2.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xs font-bold text-neutral-900 mb-1 mt-2" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p className="mb-2 last:mb-0 leading-relaxed font-normal text-neutral-700" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside mb-2 pl-2 space-y-1 text-neutral-700" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside mb-2 pl-2 space-y-1 text-neutral-700" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </ol>
  ),
  li: ({ children }: any) => (
    <li className="text-neutral-700 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </li>
  ),
  strong: ({ children }: any) => (
    <strong className="font-bold text-neutral-900" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {children}
    </strong>
  ),
};

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
  const [messages, setMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

    // Listen for historical chat opening events and pending chat global on mount
  useEffect(() => {
    const handleOpenChat = (e: any) => {
      const convo = e.detail;
      if (convo && convo.messages) {
        setMessages(convo.messages.map((m: any) => ({
          sender: m.sender,
          text: m.text
        })));
        setActiveQuery('loaded');
      } else if (convo && convo.prompt) {
        setQueryInput(convo.prompt);
        // Trigger execution directly after prompt is set
        setTimeout(() => {
          handleExecuteInsightTaskDirect(convo.prompt);
        }, 100);
      }
    };

    if (window.__vantage_active_chat) {
      const convo = window.__vantage_active_chat;
      if (convo && convo.messages) {
        setMessages(convo.messages.map((m: any) => ({
          sender: m.sender,
          text: m.text
        })));
        setActiveQuery('loaded');
      }
      window.__vantage_active_chat = null;
    }

    window.addEventListener('open-vantage-ai-chat', handleOpenChat);
    return () => {
      window.removeEventListener('open-vantage-ai-chat', handleOpenChat);
    };
  }, []);

  // Auto scroll to bottom of chat when messages grow or loading changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  if (!isOpen) return null;

  const tierClean = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const isPremium = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium' || !!(profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now());

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

  const handleExecuteInsightTaskDirect = async (userMessage: string) => {
    if (!userMessage) return;

    const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
    
    // Check if trends, forecasting, or comprehensive record reading keywords are present
    const lowerMessage = userMessage.toLowerCase();
    const keywords = ['trend', 'forecast', 'predict', 'analyze', 'analysis', 'spending', 'habit', 'chart', 'comprehensive', 'history', 'pattern', 'future', 'projection', 'growth', 'budget', 'health'];
    const isTrendOrForecast = keywords.some(kw => lowerMessage.includes(kw));
    const tokenCost = isTrendOrForecast ? 50 : 10;

    if (currentTokens < tokenCost) {
      setResponse(`No Vantage AI tokens remaining! This request requires ${tokenCost} tokens, but you only have ${currentTokens} remaining. Please upgrade your plan in settings to Tier 2 or Tier 3 to receive more tokens.`);
      return;
    }

    setLoading(true);
    setActiveQuery(userMessage);
    setQueryInput('');
    setResponse(null);
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);

    try {
      const enrichedPrompt = `${userMessage}\n\nSystem Instruction Constraint: You are Vantage AI. You must NEVER give direct recommendations or tips. You must ALWAYS phrase any advice, tips, suggestions, or insights as "Based on research...", "Online sources suggest...", or "According to financial research...". Never state recommendations or tips directly. You must ALWAYS structure your response using clear Markdown headers, a short summary, elegant bullet points, and bold text for important financial figures, account names, and key metrics. Never output a single plain block of text. CRITICAL SAFETY RESTRICTION: If the user asks for investment opinions, asset selection, or 'Should I' financial choices or 'Should I buy', you must explicitly state in your first sentence that you cannot provide financial or investment advice. Furthermore, you must append this exact uppercase string to the end of your response block: 'DISCLAIMER: YOUR FINANCES IS AN AUTOMATED ANALYTICAL UTILITY OPERATED BY ME VANTAGE FZE LLC. INSIGHTS ARE SCALED DATA SUMMARIES GENERATED COMPLETELY FOR EDUCATIONAL AND ORGANIZATIONAL MANAGEMENT INTERFACES AND DO NOT CONSTITUTE REGISTERED FINANCIAL PLANNING, INVESTMENT ADVICE, OR TAX ASSURANCES. MANUALLY VERIFY ALL METRICS BEFORE UNDERTAKING ECONOMIC DEBT ALTERATIONS.'`;
      const payload = {
        prompt: enrichedPrompt,
        profile,
        accounts,
        accountBalances,
        recentHistory: transactions.slice(0, 30)
      };
      const taskType = isTrendOrForecast ? 'generate_financial_forecast' : 'clean_text';
      const result = await executeVantageAITask(taskType, payload);
      const aiResponse = result || t('vantage_ai.empty_response');
      
      setResponse(aiResponse);
      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);

      // Save complete new chat entry into local storage under the active user's key
      if (uid) {
        const historyKey = `vantage_ai_history_${uid}`;
        try {
          const existing = localStorage.getItem(historyKey);
          const list: any[] = existing ? JSON.parse(existing) : [];
          
          const newConvo = {
            id: Math.random().toString(36).substring(2, 9),
            title: userMessage.slice(0, 40) + (userMessage.length > 40 ? '...' : ''),
            timestamp: Date.now(),
            messages: [
              {
                id: Math.random().toString(36).substring(2, 9),
                sender: 'user',
                text: userMessage,
                timestamp: Date.now() - 1000
              },
              {
                id: Math.random().toString(36).substring(2, 9),
                sender: 'ai',
                text: aiResponse,
                timestamp: Date.now()
              }
            ]
          };
          
          list.unshift(newConvo);
          localStorage.setItem(historyKey, JSON.stringify(list));
          window.dispatchEvent(new CustomEvent('vantage-ai-history-updated'));
        } catch (e) {
          console.error("Failed to write to AI history storage:", e);
        }
      }

      // Decrement AI tokens dynamically
      if (profile?.uid) {
        const userRef = doc(db, 'users', profile.uid);
        const nextTokens = Math.max(0, currentTokens - tokenCost);
        await updateDoc(userRef, { vantageAiTokens: nextTokens });
      }
    } catch (err) {
      console.error("Assistant execution failure:", err);
      const errResponse = t('vantage_ai.error_response');
      setResponse(errResponse);
      setMessages(prev => [...prev, { sender: 'ai', text: errResponse }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteInsightTask = async () => {
    await handleExecuteInsightTaskDirect(queryInput);
  };

  const handleResetChat = () => {
    setMessages([]);
    setActiveQuery('');
    setResponse(null);
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
              <div className="flex flex-col">
                <h3 className="font-headline-md text-base text-neutral-800 m-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t('vantage_ai.title')}</h3>
                <div className="flex flex-col gap-1 mt-0.5">
                  <span className="text-[10px] text-[#366945] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {t('vantage_ai.tokens', { count: typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens.toLocaleString() : '0' })}
                  </span>
                  <button
                    onClick={handleClaimSandboxTokens}
                    className="px-2 py-0.5 text-[9px] font-bold text-[#366945] bg-[#366945]/10 border border-[#366945]/25 rounded-full hover:bg-[#366945]/20 transition-colors cursor-pointer w-fit"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    {t('vantage_ai.claim_sandbox_tokens')}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex items-center">
              {(messages.length > 0 || activeQuery) && (
                <button
                  onClick={handleResetChat}
                  className="mr-2 px-3 py-1.5 text-[10px] font-bold text-neutral-500 hover:text-neutral-800 bg-neutral-50 border border-neutral-100 rounded-full transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  <RefreshCw size={10} />
                  New Chat
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 text-neutral-500 hover:text-neutral-800 cursor-pointer transition-colors"><X size={16} /></button>
            </div>
          </div>

          {/* MESSAGE STREAM CHAT LOG VIEWPORT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 container-scroll-patch box-border" ref={scrollRef}>
            {!isPremium ? (
              <div className="h-full flex items-center justify-center">
                <PremiumMarketingCard featureName="Vantage Core AI" description={t('vantage_ai.premium_description')} />
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {messages.length === 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-neutral-800 font-body-md mb-4" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      Hello there, please tell me how I can help you today?
                    </p>
                    <div className="flex flex-col gap-2">
                      {[
                        "Do you want to see your financial data?",
                        "Shall I bring up your upcoming transactions?",
                        "How about we check your budget consumption for this month?",
                        "Do you want to know how much money do you have left?"
                      ].map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleExecuteInsightTaskDirect(suggestion)}
                          className="p-3 text-sm text-left text-neutral-700 bg-neutral-50 border border-neutral-100 rounded-xl hover:border-[#366945] hover:bg-neutral-100 transition-all cursor-pointer font-body-md"
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {messages.map((msg, index) => (
                  <div key={index} className={`flex w-full ${msg.sender === 'user' ? 'justify-end pl-6' : 'justify-start pr-6'} leading-relaxed box-border`}>
                    {msg.sender === 'user' ? (
                      <div className="p-4 bg-primary-container text-neutral-800 text-sm font-body-md rounded-2xl rounded-br-sm border border-primary/10 break-words max-w-full">
                        {msg.text}
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start w-full box-border">
                        <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary/20 flex items-center justify-center text-[#366945] mt-0.5 shrink-0 select-none">
                          <Bot size={16} />
                        </div>
                        <div className="p-4 bg-neutral-50 text-neutral-800 font-body-md text-sm rounded-2xl rounded-bl-sm border border-neutral-100 break-words flex-1">
                          <ReactMarkdown components={markdownComponents}>{msg.text}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {messages.length === 0 && activeQuery && (
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
                
                {messages.length === 0 && response && (
                  <div className="flex gap-3 items-start pr-6 leading-relaxed w-full box-border">
                    <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary/20 flex items-center justify-center text-[#366945] mt-0.5 shrink-0 select-none"><Bot size={16} /></div>
                    <div className="p-4 bg-neutral-50 text-neutral-800 font-body-md text-sm rounded-2xl rounded-br-sm border border-neutral-100 break-words flex-1">
                      <ReactMarkdown components={markdownComponents}>{response}</ReactMarkdown>
                    </div>
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
