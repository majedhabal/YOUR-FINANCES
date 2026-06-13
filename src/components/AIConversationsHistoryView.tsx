import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, MessageSquare, Trash2, Calendar, Sparkles } from 'lucide-react';

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
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const loadHistory = () => {
    if (!uid) return;
    const historyKey = `vantage_ai_history_${uid}`;
    try {
      const stored = localStorage.getItem(historyKey);
      if (stored) {
        setConversations(JSON.parse(stored));
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
    if (!confirm("Are you sure you want to delete this conversation from your secure ledger archive?")) return;

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
        <span className="text-[10px] sm:text-xs font-black uppercase text-vantage-muted tracking-[0.2em]">Archived Dialogues</span>
      </div>

      <div className="w-full max-w-2xl mx-auto px-6 flex-1 flex flex-col gap-6">
        {/* Section Headline */}
        <div className="flex flex-col gap-1.5 border-b border-neutral-100 dark:border-white/5 pb-4">
          <h1 className="text-2xl sm:text-3xl font-black uppercase text-vantage-text dark:text-white tracking-tight">Previous AI Conversations</h1>
          <p className="text-xs text-vantage-muted tracking-wide font-semibold">
            Instantly recall, inspect, and continue historical financial portfolio briefings.
          </p>
        </div>

        {conversations.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-neutral-50 dark:bg-vantage-card/30 rounded-[2rem] border border-neutral-100 dark:border-white/5 gap-4">
            <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-vantage-muted">
              <MessageSquare size={22} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-extrabold uppercase text-vantage-text dark:text-neutral-200 tracking-wider">No Conversations Found</h3>
              <p className="text-[11px] text-vantage-muted max-w-xs font-semibold leading-relaxed">
                No portfolio conversations recorded inside your local ledger vault. Run a search or inquiry in the AI console below to launch a strategy session.
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
                        <span className="font-extrabold text-vantage-text dark:text-neutral-150 text-xs sm:text-sm truncate pr-2 group-hover:text-emerald-600 dark:group-hover:text-vantage-green transition-colors">
                          {convo.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500 font-mono text-[9px]">
                          <Calendar size={10} />
                          <span>{dateStr}</span>
                          <span className="w-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700"></span>
                          <span>{convo.messages.length} messages</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteConversation(convo.id, e)}
                      title="Delete log"
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
