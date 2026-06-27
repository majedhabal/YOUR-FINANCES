import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, MessageSquare, Trash2, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AIConversationsHistoryViewProps {
  uid: string;
  onBack: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export const AIConversationsHistoryView: React.FC<AIConversationsHistoryViewProps> = ({ uid, onBack }) => {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const loadHistory = () => {
    if (!uid) return;
    const historyKey = `vantage_ai_history_${uid}`;
    try {
      const stored = localStorage.getItem(historyKey);
      if (stored) {
        let list = JSON.parse(stored);
        
        // Migrate multiple separate conversation entries into a single continuous Vantage AI chat
        if (Array.isArray(list) && list.length > 1) {
          const sortedConvos = [...list].sort((a, b) => a.timestamp - b.timestamp);
          const allMessages: Message[] = [];
          
          sortedConvos.forEach(c => {
            if (Array.isArray(c.messages)) {
              allMessages.push(...c.messages);
            }
          });
          
          const combinedConvo: Conversation = {
            id: 'vantage_ai_global_chat',
            title: 'Vantage AI Assistant Chat',
            timestamp: list[0]?.timestamp || Date.now(),
            messages: allMessages
          };
          
          list = [combinedConvo];
          localStorage.setItem(historyKey, JSON.stringify(list));
        }
        
        setConversations(list);
      } else {
        setConversations([]);
      }
    } catch (e) {
      console.error("Failed to load AI conversations history:", e);
    }
  };

  useEffect(() => {
    loadHistory();

    // Listen to changes from any active sessions in bottom panel
    window.addEventListener('vantage-ai-history-updated', loadHistory);
    return () => {
      window.removeEventListener('vantage-ai-history-updated', loadHistory);
    };
  }, [uid]);

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering open
    if (!confirm(t('ai_history.confirm_delete'))) return;

    const historyKey = `vantage_ai_history_${uid}`;
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    try {
      localStorage.setItem(historyKey, JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenConversation = (convo: Conversation) => {
    (window as any).__vantage_active_chat = convo;
    // Fire event to open in the active chat overlay drawer modal
    window.dispatchEvent(new CustomEvent('open-vantage-ai-chat', { detail: convo }));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-white dark:bg-[#0E0F11] text-vantage-text dark:text-neutral-150 flex flex-col pt-6 pb-24 font-sans selection:bg-neutral-200"
    >
      {/* Top Controls Header */}
      <div className="w-full max-w-4xl mx-auto px-6 mb-8 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="p-3 bg-neutral-950 text-white rounded-2xl border border-neutral-900 dark:border-white/10 hover:bg-neutral-900 transition-all active:scale-95 shadow-md flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-[10px] sm:text-xs font-normal text-vantage-muted">{t('ai_history.archived_dialogues')}</span>
      </div>

      <div className="w-full max-w-2xl mx-auto px-6 flex-1 flex flex-col gap-6">
        {/* Section Headline */}
        <div className="flex flex-col gap-1.5 border-b border-neutral-100 dark:border-white/5 pb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-vantage-text dark:text-white tracking-tight">{t('ai_history.previous_ai_conversations')}</h1>
          <p className="text-xs text-vantage-muted font-normal">
            {t('ai_history.history_description')}
          </p>
        </div>

        {conversations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-neutral-50 dark:bg-vantage-card/30 rounded-[2rem] border border-neutral-100 dark:border-white/5 gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-vantage-muted">
              <MessageSquare size={22} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold text-vantage-text dark:text-neutral-200">{t('ai_history.no_conversations_found')}</h3>
              <p className="text-[11px] text-vantage-muted max-w-xs font-normal leading-relaxed">
                {t('ai_history.no_conversations_desc')}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence>
              {conversations.map((convo) => {
                const dateStr = new Date(convo.timestamp).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <motion.div
                    key={convo.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => handleOpenConversation(convo)}
                    className="group w-full p-4 bg-white dark:bg-[#121316] hover:bg-neutral-50 dark:hover:bg-[#16181C] border border-neutral-200 dark:border-white/5 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all active:scale-[0.99] shadow-sm md:shadow-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-vantage-green flex items-center justify-center shrink-0">
                        <MessageSquare size={18} />
                      </div>
                      <div className="flex flex-col min-w-0 gap-1 select-none">
                        <span className="font-bold text-vantage-text dark:text-neutral-150 text-xs sm:text-sm truncate pr-2 group-hover:text-emerald-600 dark:group-hover:text-vantage-green transition-colors">
                          {convo.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 font-normal text-[9px]">
                          <Calendar size={10} />
                          <span>{dateStr}</span>
                          <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700"></span>
                          <span>{t('ai_history.messages_count', { count: convo.messages.length })}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteConversation(convo.id, e)}
                      title={t('ai_history.delete_log')}
                      className="p-2 sm:p-2.5 rounded-xl text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-100 group-hover:opacity-100 md:opacity-0 group-hover:block shrink-0 active:scale-90"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};
