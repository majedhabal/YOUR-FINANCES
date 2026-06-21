import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ListTodo, Plus, RefreshCw, AlertCircle, TrendingUp, Tag, Percent } from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BudgetCard } from './BudgetCard';
import { BudgetDetailView } from './BudgetDetailView';

interface BudgetsProps {
  profile: any;
}

export const Budgets: React.FC<BudgetsProps> = ({ profile }) => {
  const [envelopes, setEnvelopes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    setLoading(true);

    const bQuery = query(collection(db, 'users', profile.uid, 'miniBudgets'));
    const unsubscribe = onSnapshot(bQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setEnvelopes(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed synchronization pipeline inside budget sheets:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 box-border flex flex-col gap-6">
      
      {/* SUB-TAB ROUTING VIEWS CHANGER PANEL */}
      <div 
        className="w-full p-5 flex items-center justify-between select-none"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          borderRadius: '24px'
        }}
      >
        <div className="flex items-center gap-2.5">
          <ListTodo size={18} className="text-[#A6DDB1]" />
          <div className="flex flex-col">
            <h4 className="text-sm font-bold text-white m-0 lowercase">envelope budget pools</h4>
            <span className="text-[10px] text-neutral-400 font-medium mt-0.5">Automated salary breakdowns and spending caps</span>
          </div>
        </div>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('open-add-tx-modal'))}
          className="px-4 py-2.5 rounded-full font-bold text-xs bg-[#A6DDB1] text-[#1E2229] transition-all hover:brightness-105 active:scale-95 cursor-pointer border-none flex items-center gap-1.5"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>Configure target envelope</span>
        </button>
      </div>

      {/* CORE CARDS WRAPPER CONTAINER */}
      {loading ? (
        <div className="py-20 text-center flex items-center justify-center gap-2 text-neutral-400 text-xs font-mono select-none">
          <RefreshCw size={14} className="animate-spin text-[#A6DDB1]" />
          <span>Syncing active constraints...</span>
        </div>
      ) : envelopes.length === 0 ? (
        <div 
          className="p-10 text-center flex flex-col items-center justify-center gap-3 select-none"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            border: 'var(--glass-border)',
            borderRadius: '24px'
          }}
        >
          <span className="text-sm font-semibold text-neutral-400">No active tracking envelopes initiated</span>
          <p className="text-xs text-neutral-500 m-0 max-w-[280px] leading-relaxed">
            Initialize an envelope allocation parameters target block from your transaction creation window panels to automate allocations.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full box-border">
          {envelopes.map((budget) => (
            <BudgetCard 
              key={budget.id} 
              budget={{
                ...budget,
                maxBudget: budget.limit || budget.maxBudget || 0,
                title: budget.title || budget.category || 'Envelope limit'
              }} 
              spent={budget.spent || 0}
              onCardClick={() => setSelectedBudget(budget)} 
            />
          ))}
        </div>
      )}

      {/* MODAL CONTAINER INNER INTERCEPT VIEW LAYER */}
      <AnimatePresence>
        {selectedBudget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 box-border">
            <div className="absolute inset-0 bg-[#1E2229]/80 backdrop-blur-md" onClick={() => setSelectedBudget(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.97, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.97, y: 15 }}
              className="relative w-full max-w-[500px] bg-[#1E2229] border border-white/10 rounded-3xl p-6 box-border max-h-[90vh] overflow-y-auto container-scroll-patch shadow-2xl"
            >
              <BudgetDetailView 
                budget={selectedBudget} 
                transactions={[]} 
                accounts={[]} 
                uid={profile.uid} 
                onBack={() => setSelectedBudget(null)} 
                onEdit={() => {}} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};