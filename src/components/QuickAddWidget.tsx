import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../lib/firebase';
import { collection, doc, query, onSnapshot, setDoc, deleteDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, Smartphone, HelpCircle, Check, Sparkles, Sliders, ChevronDown, ChevronUp, AlertCircle, Info, Landmark, Wallet, PlusCircle } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface QuickAddWidgetProps {
  uid: string;
}

interface MiniBudget {
  id: string;
  categoryTitle?: string;
  category: string;
  subcategory?: string;
  allocatedAmount?: number;
  spentAmount?: number;
  currency?: string;
}

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  currentBalance: number;
}

interface CustomWidget {
  id: string;
  name: string;
  budgetId: string;
  accountId: string;
  theme: 'green' | 'charcoal' | 'gold' | 'neon';
  createdAt: any;
}

export const QuickAddWidget: React.FC<QuickAddWidgetProps> = ({ uid }) => {
  // Data subscriptions
  const [budgets, setBudgets] = useState<MiniBudget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [widgets, setWidgets] = useState<CustomWidget[]>([]);
  const [loading, setLoading] = useState(true);

  // Form & Interaction state
  const [isAdding, setIsAdding] = useState(false);
  const [widgetName, setWidgetName] = useState('');
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [widgetTheme, setWidgetTheme] = useState<'green' | 'charcoal' | 'gold' | 'neon'>('green');
  
  // Quick transition alert state
  const [successToast, setSuccessToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Widget transaction entries
  const [widgetAmounts, setWidgetAmounts] = useState<Record<string, string>>({});
  const [submittingWidgetId, setSubmittingWidgetId] = useState<string | null>(null);

  // Listeners setup
  useEffect(() => {
    if (!uid) return;

    setLoading(true);

    // 1. Listen to miniBudgets
    const budgetsQuery = query(collection(db, `users/${uid}/miniBudgets`));
    const unsubBudgets = onSnapshot(budgetsQuery, (snap) => {
      const list: MiniBudget[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          categoryTitle: d.categoryTitle || d.title || d.category || 'General',
          category: d.category || 'General',
          subcategory: d.subcategory || '',
          allocatedAmount: d.allocatedAmount || d.limit || 0,
          spentAmount: d.spentAmount || d.spent || 0,
          currency: d.currency || 'AED',
        });
      });
      setBudgets(list);
    }, (err) => console.error("Error listening budgets in Widget Configurator:", err));

    // 2. Listen to accounts
    const accountsQuery = query(collection(db, `users/${uid}/accounts`));
    const unsubAccounts = onSnapshot(accountsQuery, (snap) => {
      const list: Account[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.isArchived) return;
        list.push({
          id: doc.id,
          name: d.name || 'Account',
          type: d.type || 'Bank',
          currency: d.currency || 'AED',
          currentBalance: d.currentBalance !== undefined ? d.currentBalance : 0,
        });
      });
      setAccounts(list);
    }, (err) => console.error("Error listening accounts in Widget Configurator:", err));

    // 3. Listen to quick-add widgets
    const widgetsQuery = query(collection(db, `users/${uid}/homescreenWidgets`));
    const unsubWidgets = onSnapshot(widgetsQuery, (snap) => {
      const list: CustomWidget[] = [];
      snap.forEach((doc) => {
        const d = doc.data();
        list.push({
          id: doc.id,
          name: d.name || 'Quick Button',
          budgetId: d.budgetId || '',
          accountId: d.accountId || '',
          theme: d.theme || 'green',
          createdAt: d.createdAt,
        });
      });
      // Sort oldest first or creation order
      setWidgets(list);
      setLoading(false);
    }, (err) => {
      console.error("Error listening widgets in Widget Configurator:", err);
      setLoading(false);
    });

    return () => {
      unsubBudgets();
      unsubAccounts();
      unsubWidgets();
    };
  }, [uid]);

  // Listener for Real-time Transaction synchronizations posted by Android launcher widget interactions
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'VANTAGE_WIDGET_TRANS_SUCCESS') {
        const { amount } = event.data.payload;
        showToast(`Real-time Android Sync: Recorded outflow of AED ${parseFloat(amount).toFixed(2)} from your homescreen!`);
        triggerHaptic(hapticPresets.success);
      }
    };

    window.addEventListener('message', handleServiceWorkerMessage);
    return () => window.removeEventListener('message', handleServiceWorkerMessage);
  }, []);

  // Sync PWA Widget template payload choices database & ID Token to Cache boundaries
  useEffect(() => {
    if (!uid || loading) return;

    const syncWidgetChoicesCacheAndToken = async () => {
      try {
        const choices = widgets.map(w => {
          const b = budgets.find(b => b.id === w.budgetId);
          const a = accounts.find(a => a.id === w.accountId);
          return {
            title: `${w.name} (${b?.categoryTitle || 'General'} via ${a?.name || 'Account'})`,
            value: w.id
          };
        });

        const widgetData = {
          defaultWidgetId: widgets[0]?.id || "none",
          choices: choices.length > 0 ? choices : [{ title: "Configure in Vantage App first", value: "none" }]
        };

        const cache = await caches.open('vantage-widget-cache');
        await cache.put(
          new Request('/api/pwa-widget-choices'),
          new Response(JSON.stringify(widgetData), {
            headers: { 'Content-Type': 'application/json' }
          })
        );
        console.log("[Vantage PWA] Service Worker Widget choices synchronized successfully.");

        const currentUser = auth.currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken(true);
          await cache.put(
            new Request('/api/pwa-token'),
            new Response(token, {
              headers: { 'Content-Type': 'text/plain' }
            })
          );
          console.log("[Vantage PWA] Service Worker JWT token refreshed in Cache layout.");
        }
      } catch (err) {
        console.warn("[Vantage PWA] Error synchronizing widget cache assets in background:", err);
      }
    };

    syncWidgetChoicesCacheAndToken();

    const refreshInterval = setInterval(async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken(true);
          const cache = await caches.open('vantage-widget-cache');
          await cache.put(
            new Request('/api/pwa-token'),
            new Response(token, { headers: { 'Content-Type': 'text/plain' } })
          );
          console.log("[Vantage PWA] Refreshed background token proactively.");
        }
      } catch (e) {
        console.warn("Background proactive token refresh failed:", e);
      }
    }, 600000); // 10 mins

    return () => clearInterval(refreshInterval);
  }, [uid, widgets, budgets, accounts, loading]);

  // Handle widget deletion
  const handleDeleteWidget = async (widgetId: string) => {
    triggerHaptic(hapticPresets.light);
    try {
      await deleteDoc(doc(db, `users/${uid}/homescreenWidgets`, widgetId));
      showToast("Widget successfully removed from your Homescreen profile.");
    } catch (err) {
      console.error("Error deleting widget:", err);
    }
  };

  // Helper toast notifier
  const showToast = (msg: string) => {
    setSuccessToast({ show: true, msg });
    setTimeout(() => {
      setSuccessToast({ show: false, msg: '' });
    }, 4500);
  };

  // Handle creating a new widget
  const handleCreateWidget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!widgetName.trim() || !selectedBudgetId || !selectedAccountId) return;

    triggerHaptic(hapticPresets.medium);
    try {
      const newWidgetId = 'widget_' + Math.random().toString(36).substring(2, 12);
      const widgetRef = doc(db, `users/${uid}/homescreenWidgets`, newWidgetId);

      await setDoc(widgetRef, {
        id: newWidgetId,
        widgetId: newWidgetId,
        userId: uid,
        name: widgetName.trim(),
        budgetId: selectedBudgetId,
        accountId: selectedAccountId,
        theme: widgetTheme,
        createdAt: serverTimestamp()
      });

      // Reset form
      setWidgetName('');
      setSelectedBudgetId('');
      setSelectedAccountId('');
      setWidgetTheme('green');
      setIsAdding(false);
      showToast("Beautiful new Quick-Add widget placed on your virtual Android homescreen!");
    } catch (err) {
      console.error("Error creating homescreen widget:", err);
      alert("Could not create widget. Please check parameters.");
    }
  };

  // Record transaction directly from simulator widget
  const handleWidgetTransaction = async (widget: CustomWidget) => {
    const rawAmt = widgetAmounts[widget.id] || '';
    if (!rawAmt) return;

    const txAmount = parseFloat(rawAmt);
    if (isNaN(txAmount) || txAmount <= 0) {
      alert("Please enter a valid amount greater than zero.");
      return;
    }

    const budget = budgets.find(b => b.id === widget.budgetId);
    const account = accounts.find(a => a.id === widget.accountId);

    if (!budget || !account) {
      alert("Cannot complete transaction: linked budget or account files are missing.");
      return;
    }

    setSubmittingWidgetId(widget.id);
    triggerHaptic(hapticPresets.heavy);

    try {
      await runTransaction(db, async (trans) => {
        const accountRef = doc(db, `users/${uid}/accounts/${widget.accountId}`);
        const budgetRef = doc(db, `users/${uid}/miniBudgets/${widget.budgetId}`);
        const transactionRef = doc(collection(db, `users/${uid}/transactions`));

        const accountSnap = await trans.get(accountRef);
        const budgetSnap = await trans.get(budgetRef);

        if (!accountSnap.exists()) throw new Error("Linked account not found");
        if (!budgetSnap.exists()) throw new Error("Linked budget not found");

        const currentBal = Number(accountSnap.data()?.currentBalance) || 0;
        const currentSpent = Number(budgetSnap.data()?.spentAmount) || 0;

        // Step 1: Subtract from cash/checking balance (atomic ledger update)
        trans.update(accountRef, {
          currentBalance: currentBal - txAmount,
          updatedAt: serverTimestamp()
        });

        // Step 2: Increment mini-budget spent accumulation
        trans.update(budgetRef, {
          spentAmount: currentSpent + txAmount,
          spent: currentSpent + txAmount, // legacy fallback Compatibility
          updatedAt: serverTimestamp()
        });

        // Step 3: Insert the actual transaction ledger document
        trans.set(transactionRef, {
          transactionId: transactionRef.id,
          id: transactionRef.id,
          userId: uid,
          amount: txAmount,
          type: 'expense',
          status: 'confirmed',
          accountId: widget.accountId,
          category: budget.category,
          subcategory: budget.subcategory || null,
          notes: `Android Widget: ${widget.name}`,
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          emoji: getCategoryEmoji(budget.category)
        });
      });

      // Clear the input
      setWidgetAmounts(prev => ({ ...prev, [widget.id]: '' }));
      showToast(`Recorded! ${txAmount.toFixed(2)} ${account.currency} deducted from ${account.name} & recorded into ${budget.categoryTitle}.`);
      triggerHaptic(hapticPresets.success);
    } catch (err) {
      console.error("Widget double-write transaction failed:", err);
      alert("An error occurred during secure commitment. Ledger has rolled back safely.");
    } finally {
      setSubmittingWidgetId(null);
    }
  };

  const getCategoryEmoji = (category: string): string => {
    const cat = category.toLowerCase();
    if (cat.includes('food') || cat.includes('dining') || cat.includes('restaurant')) return '🍔';
    if (cat.includes('grocery') || cat.includes('supermarket') || cat.includes('groceries')) return '🛒';
    if (cat.includes('coffee') || cat.includes('cafe')) return '☕';
    if (cat.includes('fuel') || cat.includes('transport') || cat.includes('taxi')) return '🚗';
    if (cat.includes('shopping') || cat.includes('clothes')) return '🛍️';
    if (cat.includes('rent') || cat.includes('home') || cat.includes('mortgage')) return '🏠';
    return '💸';
  };

  const getThemeColor = (theme: string, type: 'bg' | 'text' | 'button' | 'progress') => {
    switch (theme) {
      case 'charcoal':
        return type === 'bg' ? 'bg-[#2F3542]' : type === 'text' ? 'text-white' : type === 'button' ? 'bg-white/15 hover:bg-white/25 text-white' : 'bg-white/20';
      case 'gold':
        return type === 'bg' ? 'bg-[#FFDF00]/10 border-[#FFDF00]/30' : type === 'text' ? 'text-[#845E00]' : type === 'button' ? 'bg-[#FFDF00] hover:bg-[#E5C400] text-black' : 'bg-[#FFDF00]/20';
      case 'neon':
        return type === 'bg' ? 'bg-[#E0F8FF] border-[#31D0F5]/30' : type === 'text' ? 'text-[#0C6D85]' : type === 'button' ? 'bg-[#31D0F5] hover:bg-[#1BB6DA] text-white' : 'bg-[#31D0F5]/20';
      case 'green':
      default:
        return type === 'bg' ? 'bg-[#F2FAF4] border-[#A6DDB1]/30' : type === 'text' ? 'text-[#2D5A3A]' : type === 'button' ? 'bg-[#A6DDB1] hover:bg-[#8ec599] text-white' : 'bg-[#A6DDB1]/20';
    }
  };

  return (
    <div 
      id="android-widget-configurator"
      className="bg-white border border-neutral-100 rounded-3xl p-5 md:p-6 shadow-[0_4px_24px_rgba(30,34,41,0.02)] select-none text-[#1E2229] relative scroll-mt-24"
      style={{ fontFamily: "'Google Sans', sans-serif" }}
    >
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-black flex items-center gap-2">
            <Smartphone className="text-[#A6DDB1]" size={20} strokeWidth={2.5} />
            Android Homescreen Widgets Configurator
          </h2>
          <p className="text-xs font-normal text-[#57606F] mt-1">
            Build and linked custom tracking shortcuts. Simulates tactile PWA Android homescreen widgets.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              triggerHaptic(hapticPresets.light);
              setIsHelpOpen(!isHelpOpen);
            }}
            className="px-3.5 py-1.5 hover:bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-[#1E2229] transition-all flex items-center gap-1.5"
          >
            <HelpCircle size={14} className="text-neutral-500" />
            Android PWA Setup Guide
          </button>
          
          <button
            onClick={() => {
              triggerHaptic(hapticPresets.light);
              setIsAdding(!isAdding);
            }}
            className="px-4 py-1.5 bg-[#A6DDB1] hover:bg-[#8ec599] text-white text-xs font-bold rounded-xl transition-all shadow-[0_3px_12px_rgba(166,221,177,0.35)] flex items-center gap-1.5"
          >
            <Plus size={14} strokeWidth={3} />
            Create Widget
          </button>
        </div>
      </div>

      {/* Setup Guide Overlay Notification */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="p-4 bg-[#F2FAF4] border border-[#A6DDB1]/20 rounded-2xl text-[13px] text-[#2D5A3A] leading-relaxed relative">
              <div className="flex gap-2.5 items-start">
                <Info size={16} className="text-[#2D5A3A] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold block text-sm text-[#1E2229] mb-1">Android Widgets Integration Guide</span>
                  <p className="mb-2">
                    Our platform utilizes standard Progressive Web App (PWA) configurations. To enable widgets and fast Launchpads on your actual mobile phone:
                  </p>
                  <ul className="list-decimal pl-4 space-y-1.5 text-[#57606F] font-normal leading-normal">
                    <li>Open this web suite inside <strong>Google Chrome</strong> or similar on your Android device.</li>
                    <li>Tap the browser context menu (three dots icon in top-right) and choose <strong className="text-black">"Add to Home screen"</strong> or <strong className="text-black">"Install App"</strong>.</li>
                    <li>Long press anywhere on your Android desktop wallpaper space and tap <strong className="text-black">"Widgets"</strong>.</li>
                    <li>Look up <strong className="text-black">YOUR FINANCES</strong> to drag and drop these configured quick-add widget modules onto your home grids! They will map directly to your live budget envelopes.</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Widget Form Dialog */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-neutral-50/50 outline-none border border-neutral-200/60 rounded-2xl p-4 sm:p-5 mb-6"
          >
            <form onSubmit={handleCreateWidget} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Field 1: Widget Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500">Widget Name / Label</label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    value={widgetName}
                    onChange={(e) => setWidgetName(e.target.value)}
                    placeholder="e.g. Daily Espresso, Groceries Tracker"
                    className="p-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-normal outline-none focus:border-[#A6DDB1] transition-all"
                  />
                </div>

                {/* Field 2: Select Budget */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500">Connect with Mini-Budget</label>
                  <select
                    required
                    value={selectedBudgetId}
                    onChange={(e) => setSelectedBudgetId(e.target.value)}
                    className="p-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-normal outline-none focus:border-[#A6DDB1] transition-all cursor-pointer"
                  >
                    <option value="">Select an active budget category...</option>
                    {budgets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.categoryTitle} ({b.currency} {(b.allocatedAmount || 0).toLocaleString()})
                      </option>
                    ))}
                  </select>
                  {budgets.length === 0 && (
                    <span className="text-[10px] text-amber-500 flex items-center gap-1">
                      <AlertCircle size={10} /> Note: You must create at least one Mini-Budget under the Budgets tab first.
                    </span>
                  )}
                </div>

                {/* Field 3: Deduct Account */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500">Deduct Outflow From Account</label>
                  <select
                    required
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="p-2.5 px-3 bg-white border border-neutral-200 rounded-xl text-xs font-normal outline-none focus:border-[#A6DDB1] transition-all cursor-pointer"
                  >
                    <option value="">Choose payment source...</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency} {acc.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 4: Theme Color Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-neutral-500">Widget Card Style Theme</label>
                  <div className="flex items-center gap-2 h-10 mt-1">
                    {(['green', 'charcoal', 'gold', 'neon'] as const).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => {
                          triggerHaptic(hapticPresets.light);
                          setWidgetTheme(theme);
                        }}
                        className={`flex-1 h-full rounded-xl border text-xs font-bold flex items-center justify-center transition-all ${
                          widgetTheme === theme
                            ? 'border-black ring-1 ring-black bg-neutral-100 scale-95'
                            : 'border-neutral-200 bg-white hover:bg-neutral-50'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full mr-1.5 ${
                          theme === 'green' ? 'bg-[#A6DDB1]' :
                          theme === 'charcoal' ? 'bg-[#2F3542]' :
                          theme === 'gold' ? 'bg-[#FFDF00]' : 'bg-[#31D0F5]'
                        }`} />
                        {theme.charAt(0).toUpperCase() + theme.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(hapticPresets.light);
                    setIsAdding(false);
                  }}
                  className="px-4 py-2 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-bold text-[#1E2229] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Place Widget
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Dual-Column Builder Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Persisted Configured Widget Cards) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-neutral-400 tracking-wider">
            YOUR CONFIGURATIONS
          </h3>

          {loading ? (
            <div className="p-8 border border-neutral-100 rounded-2xl flex flex-col items-center justify-center text-neutral-400 h-40">
              <div className="w-5 h-5 border-2 border-neutral-300 border-t-black rounded-full animate-spin mb-2"></div>
              <span className="text-xs font-normal">Sourcing widgets...</span>
            </div>
          ) : widgets.length === 0 ? (
            <div className="p-6 border border-dashed border-neutral-200 rounded-2xl text-center text-neutral-400">
              <p className="text-xs font-normal leading-relaxed text-[#57606F]/70 mb-4" style={{ fontWeight: 400 }}>
                You haven't configured any Quick-Add widget buttons yet. Create one to instantly simulate recorded transactions.
              </p>
              <button
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  setIsAdding(true);
                }}
                className="mx-auto py-2 px-4 border border-[#A6DDB1] text-[#2D5A3A] bg-[#F2FAF4] hover:bg-[#e4f5e9] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <PlusCircle size={14} className="text-[#2D5A3A]" />
                Instantiate First Widget
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {widgets.map((widget) => {
                const linkedB = budgets.find(b => b.id === widget.budgetId);
                const linkedA = accounts.find(a => a.id === widget.accountId);
                return (
                  <div 
                    key={widget.id}
                    className="p-3.5 bg-white border border-neutral-200/80 rounded-2xl flex items-center justify-between gap-4 shadow-[0_1px_4px_rgba(0,0,0,0.015)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-black truncate">{widget.name}</span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${
                          widget.theme === 'green' ? 'bg-[#A6DDB1]/10 text-[#2D5A3A]' :
                          widget.theme === 'charcoal' ? 'bg-neutral-100 text-neutral-700' :
                          widget.theme === 'gold' ? 'bg-[#FFDF00]/20 text-[#845E00]' : 'bg-[#31D0F5]/10 text-[#0C6D85]'
                        }`}>
                          {widget.theme}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#57606F] font-normal leading-none" style={{ fontWeight: 400 }}>
                        <span className="flex items-center gap-1 shrink-0">
                          <Landmark size={12} className="text-neutral-400 shrink-0" />
                          To: {linkedB?.categoryTitle || 'General'}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Wallet size={12} className="text-neutral-400 shrink-0" />
                          From: {linkedA?.name || 'Account'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteWidget(widget.id)}
                      className="w-8 h-8 rounded-xl hover:bg-red-50 text-neutral-400 hover:text-red-500 flex items-center justify-center transition-all border border-transparent hover:border-red-100 shrink-0"
                      title="Delete Widget"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (Placeholder for actual Android Widget instructions) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 border-2 border-dashed border-neutral-200 rounded-3xl text-center">
            <Smartphone size={48} className="text-neutral-300 mb-4" />
            <h3 className="text-sm font-bold text-neutral-600 mb-2">Configure Your Live Widgets</h3>
            <p className="text-xs font-normal text-neutral-500 max-w-[300px]">
              Use the controls on the left to configure your quick-add widgets. Once added, install the app on your Android device (Add to Home Screen) to access them natively on your home grid.
            </p>
        </div>

      </div>

      {/* Floating Success Alert Trigger Bar */}
      <AnimatePresence>
        {successToast.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] bg-[#1E2229] text-white p-3.5 px-4 rounded-2xl flex items-center gap-2.5 shadow-25 text-xs font-normal"
            style={{ fontWeight: 400 }}
          >
            <div className="w-4.5 h-4.5 rounded-full bg-[#A6DDB1] flex items-center justify-center shrink-0">
              <Check size={11} className="text-black" strokeWidth={3} />
            </div>
            <span>{successToast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
