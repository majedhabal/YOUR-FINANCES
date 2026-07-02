import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Trash2, Calendar, Clock, ChevronLeft, Landmark, AlertCircle, ToggleLeft as Toggle, ToggleRight, Edit2, X, Check, ChevronDown, Filter, Tag, ShieldCheck, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from 'lucide-react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { ConfirmationModal } from './ConfirmationModal';
import { MASTER_CATEGORIES } from '../lib/constants';
import { 
  getCachedAccessToken, 
  connectGoogleWorkspace, 
  createGoogleCalendarEvent, 
  fetchUpcomingFilesAndEvents,
  GoogleCalendarEventItem,
  deleteGoogleCalendarEvent
} from '../lib/googleAuth';

interface RecurringTransaction {
  id: string;
  type: 'income' | 'expense' | 'transfer' | 'Inflow' | 'Outflow' | 'Transfer' | string;
  transactionType?: 'income' | 'expense' | 'transfer' | 'inflow' | 'outflow' | string;
  amount: number;
  accountId: string;
  sourceAccountId?: string;
  destinationAccountId?: string | null;
  category: string;
  subcategory?: string;
  recurrency: string;
  frequency?: string;
  interval: number;
  dayOption: string;
  duration: string;
  durationLimit?: string;
  nextGenerationDate: string;
  nextExecutionDate?: string;
  lastGeneratedDate?: string;
  isActive: boolean;
  emoji: string;
  notes: string;
  title?: string;
  startDate?: string;
  notification?: string;
  updatedAt?: any;
  isSyncedToCalendar?: boolean;
  gCalendarEventId?: string;
}

interface RecurringTransactionsViewProps {
  uid: string;
  accounts: any[];
  onBack: () => void;
}

export const RecurringTransactionsView: React.FC<RecurringTransactionsViewProps> = ({ uid, accounts, onBack }) => {
  const { t } = useTranslation();
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<RecurringTransaction | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Google Integration states
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [previewEvents, setPreviewEvents] = useState<GoogleCalendarEventItem[]>([]);
  const [fetchingEvents, setFetchingEvents] = useState(false);

  // Edit Form State
  const [editAmount, setEditAmount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRecurrency, setEditRecurrency] = useState<string>('monthly');
  const [editInterval, setEditInterval] = useState('1');
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const [editNotification, setEditNotification] = useState('sameDay');
  const [editStartDate, setEditStartDate] = useState('');

  useEffect(() => {
    const token = getCachedAccessToken();
    setGoogleToken(token);
  }, []);

  useEffect(() => {
    if (!googleToken) return;
    const loadEvents = async () => {
      setFetchingEvents(true);
      try {
        const events = await fetchUpcomingFilesAndEvents(googleToken);
        setPreviewEvents(events);
      } catch (err) {
        console.error('Error fetching calendar preview:', err);
      } finally {
        setFetchingEvents(false);
      }
    };
    loadEvents();
  }, [googleToken]);

  const handleLinkGoogle = async () => {
    try {
      const token = await connectGoogleWorkspace();
      setGoogleToken(token);
    } catch (err: any) {
      alert("Failed to link Google Account: " + err.message);
    }
  };

  const handleToggleSyncToCalendar = async (rec: RecurringTransaction) => {
    try {
      let token = googleToken;
      if (!token) {
        token = await connectGoogleWorkspace();
        setGoogleToken(token);
      }
      if (!token) {
        alert("Google authorization is required to sync to Google Calendar.");
        return;
      }

      const accId = rec.sourceAccountId || rec.accountId;
      const acc = accounts?.find(a => a.id === accId);
      const titleStr = rec.notes || rec.title || rec.category;
      const details = {
        title: rec.emoji ? `${rec.emoji} ${titleStr}` : `💸 ${titleStr}`,
        amount: rec.amount,
        currency: acc?.currency || 'AED',
        accountName: acc?.name || 'Account',
        dueDate: rec.nextExecutionDate || rec.nextGenerationDate,
        recurrency: rec.recurrency || rec.frequency || 'Monthly',
        interval: rec.interval || 1
      };

      const res = await createGoogleCalendarEvent(token, details);
      if (res && res.id) {
        const recRef = doc(db, `users/${uid}/recurringTransactions`, rec.id);
        await updateDoc(recRef, {
          isSyncedToCalendar: true,
          gCalendarEventId: res.id
        });
        
        const refreshed = await fetchUpcomingFilesAndEvents(token);
        setPreviewEvents(refreshed);
        alert(`Successfully synced "${titleStr}" to Google Calendar!`);
      }
    } catch (err: any) {
      console.error(err);
      alert("Error syncing: " + err.message);
    }
  };

  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, `users/${uid}/recurringTransactions`));
    const unsub = onSnapshot(q, (snap) => {
      setRecurring(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringTransaction)));
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  const handleDelete = async (id: string) => {
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const item = recurring.find(r => r.id === itemToDelete);
      if (item && item.isSyncedToCalendar && item.gCalendarEventId) {
        let token = googleToken || getCachedAccessToken();
        if (!token) {
          try {
            token = await connectGoogleWorkspace();
            if (token) {
              setGoogleToken(token);
            }
          } catch (tokenErr) {
            console.warn("Could not acquire token for Google Calendar event deletion during deletion:", tokenErr);
          }
        }
        
        if (token) {
          try {
            await deleteGoogleCalendarEvent(token, item.gCalendarEventId);
            const refreshed = await fetchUpcomingFilesAndEvents(token);
            setPreviewEvents(refreshed);
          } catch (calErr: any) {
            console.error("Failed to automatically delete synced Google Calendar event:", calErr);
          }
        }
      }

      await deleteDoc(doc(db, `users/${uid}/recurringTransactions`, itemToDelete));
      setItemToDelete(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/recurringTransactions/${itemToDelete}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleStatus = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, `users/${uid}/recurringTransactions`, id), {
        isActive: !current
      });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/recurringTransactions/${id}`);
    }
  };

  const startEdit = (item: RecurringTransaction) => {
    setEditingItem(item);
    setEditAmount(item.amount.toString());
    setEditNotes(item.notes || item.title || '');
    setEditRecurrency((item.recurrency || item.frequency || 'Monthly').toLowerCase());
    setEditInterval((item.interval || 1).toString());
    setEditCategory(item.category || '');
    setEditSubcategory(item.subcategory || '');
    setEditNotification(item.notification || 'sameDay');
    
    const dateStr = item.lastGeneratedDate || item.startDate || '';
    setEditStartDate(dateStr.includes('T') ? dateStr.split('T')[0] : dateStr);
  };

  const calculateNextDate = (baseDate: string, freq: string, interval: number, selectedDayOption: string = 'sameDate') => {
    const [year, month, day] = baseDate.split('-').map(Number);
    const d = new Date(year, month - 1, day, 12, 0, 0);
    const originalDay = d.getDate();
    const originalWeekday = d.getDay();

    if (freq === 'daily') {
      d.setDate(d.getDate() + interval);
    } else if (freq === 'weekly') {
      d.setDate(d.getDate() + (interval * 7));
    } else if (freq === 'monthly') {
      if (selectedDayOption === 'sameDate') {
        d.setMonth(d.getMonth() + interval);
        if (d.getDate() < originalDay) {
           d.setDate(0);
        }
      } else {
        const targetMonth = d.getMonth() + interval;
        d.setMonth(targetMonth);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    } else if (freq === 'yearly') {
      if (selectedDayOption === 'sameDate') {
        d.setFullYear(d.getFullYear() + interval);
      } else {
        d.setFullYear(d.getFullYear() + interval);
        const diff = originalWeekday - d.getDay();
        d.setDate(d.getDate() + diff);
      }
    }
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    setIsUpdating(true);
    try {
      const intervalNum = parseInt(editInterval) || 1;
      const newNextDate = calculateNextDate(editStartDate, editRecurrency, intervalNum, editingItem.dayOption);
      const freqLabel = editRecurrency.charAt(0).toUpperCase() + editRecurrency.slice(1);

      await updateDoc(doc(db, `users/${uid}/recurringTransactions`, editingItem.id), {
        // legacy
        amount: parseFloat(editAmount),
        notes: editNotes,
        recurrency: editRecurrency,
        interval: intervalNum,
        category: editCategory,
        subcategory: editSubcategory,
        notification: editNotification,
        lastGeneratedDate: editStartDate,
        nextGenerationDate: newNextDate,

        // exact schema
        title: editNotes,
        frequency: freqLabel,
        nextExecutionDate: newNextDate,
        updatedAt: serverTimestamp()
      });
      setEditingItem(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/recurringTransactions/${editingItem.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sans select-none text-neutral-800">
      <header className="flex items-center gap-4 px-1">
        <button 
          onClick={onBack} 
          className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-full transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col">
          <h2 className="text-xl font-bold text-neutral-900 tracking-tight">{t('recurring_transactions_view.header_title')}</h2>
          <p className="text-xs text-neutral-500 font-normal mt-0.5">{t('recurring_transactions_view.header_desc')}</p>
        </div>
      </header>

      {/* Google Integration Protocol Card - Light Minimal Studio Styling */}
      <div className="p-5 rounded-2xl border border-neutral-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${googleToken ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'} shrink-0`}>
            <ShieldCheck size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-neutral-800">{t('recurring_transactions_view.google_sync')}</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${googleToken ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
              <span className="text-[10px] font-normal text-neutral-500">
                {googleToken ? t('recurring_transactions_view.sync_active') : t('recurring_transactions_view.sync_disconnected')}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleLinkGoogle}
          className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[40px] flex items-center ${
            googleToken 
              ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 border border-neutral-200' 
              : 'bg-neutral-900 hover:bg-neutral-800 text-white shadow-sm'
          }`}
        >
          {googleToken ? t('recurring_transactions_view.sync_reconnect') : t('recurring_transactions_view.sync_connect')}
        </button>
      </div>

      {/* Dual Pane Layout: Responsive Flex Grid */}
      <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
        {/* Left Side: Schedules List */}
        <div className="flex-1 w-full flex flex-col gap-4" style={{ minHeight: '100px' }}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-neutral-500">{t('recurring_transactions_view.active_schedules')}</span>
              <span className="text-xs font-bold text-neutral-700">{recurring.length} {t('recurring_transactions_view.schedules_total')}</span>
            </div>

            <div className="flex p-1 bg-neutral-100 rounded-xl">
              <button 
                onClick={() => setActiveTab('income')} 
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                <ArrowUpRight size={14} />
                {t('recurring_transactions_view.income', 'Income')} ({recurring.filter(r => {
                  const tLow = r.type?.toLowerCase();
                  const ttLow = r.transactionType?.toLowerCase();
                  return tLow === 'income' || tLow === 'inflow' || ttLow === 'income' || ttLow === 'inflow';
                }).length})
              </button>
              <button 
                onClick={() => setActiveTab('expense')} 
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'expense' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                <ArrowDownLeft size={14} />
                {t('recurring_transactions_view.expense', 'Expense')} ({recurring.filter(r => {
                  const tLow = r.type?.toLowerCase();
                  const ttLow = r.transactionType?.toLowerCase();
                  return tLow === 'expense' || tLow === 'outflow' || ttLow === 'expense' || ttLow === 'outflow' || tLow === 'outflow';
                }).length})
              </button>
              <button 
                onClick={() => setActiveTab('transfer')} 
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'transfer' ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
              >
                <ArrowRightLeft size={14} />
                {t('recurring_transactions_view.transfer', 'Transfer')} ({recurring.filter(r => {
                  const tLow = r.type?.toLowerCase();
                  const ttLow = r.transactionType?.toLowerCase();
                  return tLow === 'transfer' || ttLow === 'transfer';
                }).length})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3 bg-white border border-neutral-200 rounded-2xl">
              <RefreshCw className="text-neutral-400 animate-spin" size={24} />
              <span className="text-xs text-neutral-500 font-normal">{t('recurring_transactions_view.loading')}</span>
            </div>
          ) : recurring.length === 0 ? (
            <div className="py-16 border border-dashed border-neutral-200 rounded-2xl flex flex-col items-center text-center gap-4 bg-white px-8">
              <div className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400 border border-neutral-100">
                <RefreshCw size={24} />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <span className="text-sm font-bold text-neutral-700">{t('recurring_transactions_view.no_routines')}</span>
                <p className="text-xs text-neutral-500 leading-relaxed font-normal">{t('recurring_transactions_view.no_routines_desc')}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {recurring
                .filter(rec => {
                  const tLow = rec.type?.toLowerCase();
                  const ttLow = rec.transactionType?.toLowerCase();
                  const isIncome = tLow === 'income' || tLow === 'inflow' || ttLow === 'income' || ttLow === 'inflow';
                  const isTransfer = tLow === 'transfer' || ttLow === 'transfer';
                  const isExpense = tLow === 'expense' || tLow === 'outflow' || ttLow === 'expense' || ttLow === 'outflow' || tLow === 'outflow';

                  if (activeTab === 'income') return isIncome;
                  if (activeTab === 'transfer') return isTransfer;
                  return isExpense;
                })
                .map((rec, idx) => {
                const accId = rec.sourceAccountId || rec.accountId;
                const acc = accounts?.find(a => a.id === accId);
                const titleStr = rec.title || rec.notes || rec.category;
                const recLabel = rec.frequency || (rec.recurrency ? (rec.recurrency.charAt(0).toUpperCase() + rec.recurrency.slice(1)) : 'Monthly');
                const isIncome = rec.transactionType === 'income' || rec.type === 'income';

                return (
                  <motion.div
                    key={`recurring-row-${rec.id || idx}-${idx}`}
                    layout
                    className={`p-5 rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all ${rec.isActive ? 'opacity-100' : 'opacity-60'}`}
                  >
                    <div className="flex w-full items-center justify-between gap-4">
                      {/* Left side info */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-neutral-50 flex items-center justify-center text-xl shrink-0 border border-neutral-200">
                          {rec.emoji || (isIncome ? '💰' : '💸')}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-neutral-900 truncate">{titleStr}</span>
                          <span className="text-xs text-neutral-500 font-normal mt-0.5">
                            Every {rec.interval || 1} {recLabel.toLowerCase()}
                          </span>
                        </div>
                      </div>

                      {/* Right side value */}
                      <div className="flex flex-col items-end text-right shrink-0">
                        <span className={`text-sm font-bold ${isIncome ? 'text-emerald-600' : 'text-neutral-900'}`}>
                          {isIncome ? '' : '-'}{acc?.currency || 'AED'} {(rec.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-normal mt-0.5 truncate max-w-[120px]">
                          {acc?.name || 'Vantage wallet'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-neutral-100">
                      <div className="col-span-2 p-3 bg-neutral-50 rounded-xl flex items-center justify-between gap-2 border border-neutral-100">
                        <span 
                          className="text-xs text-neutral-600 flex items-center gap-1.5 font-normal"
                        >
                          <Calendar size={13} className="text-neutral-400 shrink-0" />
                          {(() => {
                            const dateStr = rec.nextExecutionDate || rec.nextGenerationDate || '';
                            if (!dateStr) return 'Next execution pending';
                            const parts = dateStr.split('-');
                            let formatted = '';
                            if (parts.length === 3) {
                              const year = parseInt(parts[0], 10);
                              const month = parseInt(parts[1], 10) - 1;
                              const day = parseInt(parts[2], 10);
                              const dateObj = new Date(year, month, day);
                              formatted = dateObj.toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              });
                            } else {
                              const dateObj = new Date(dateStr);
                              if (isNaN(dateObj.getTime())) {
                                return 'Invalid schedule date';
                              }
                              formatted = dateObj.toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              });
                            }
                            return `Next payout: ${formatted}`;
                          })()}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-normal">
                          Confirmed
                        </span>
                      </div>
                      
                      <div className="p-3 bg-neutral-50 rounded-xl flex flex-col gap-0.5 col-span-2 border border-neutral-100">
                        <span className="text-[10px] font-normal text-neutral-400 flex items-center gap-1">
                          <Clock size={10} className="text-neutral-400" /> Reminder offset
                        </span>
                        <span className="text-xs font-bold text-neutral-700 mt-0.5">
                          {typeof rec.notification === 'string' 
                            ? rec.notification.replace('1DayBefore', '24 hours early').replace('3DaysBefore', '72 hours early').replace('sameDay', 'On schedule day') 
                            : 'On schedule day'}
                        </span>
                      </div>
                    </div>

                    {/* Google Calendar Sync Panel (Inlist widget) */}
                    <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl mt-3 border border-neutral-100">
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className={rec.isSyncedToCalendar ? 'text-emerald-500' : 'text-neutral-400'} />
                        <span className="text-[10px] font-normal text-neutral-600">Google calendar sync</span>
                      </div>
                      <button 
                        onClick={() => handleToggleSyncToCalendar(rec)}
                        className={`flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[10px] font-bold transition-all ${
                          rec.isSyncedToCalendar 
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' 
                            : 'text-neutral-600 border border-neutral-200 bg-white hover:bg-neutral-50 hover:text-neutral-900'
                        }`}
                      >
                        {rec.isSyncedToCalendar ? (
                          <>
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            Active
                          </>
                        ) : (
                          'Sync row'
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-100">
                      <button 
                        onClick={() => toggleStatus(rec.id, rec.isActive)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all outline-none min-h-[36px] ${rec.isActive ? 'bg-neutral-900 hover:bg-neutral-800 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-500 border border-neutral-200'}`}
                      >
                        {rec.isActive ? (
                          <><RefreshCw size={11} className="animate-spin-slow" /> Active</>
                        ) : (
                          <><AlertCircle size={11} /> Paused</>
                        )}
                      </button>
                      <button 
                        onClick={() => handleDelete(rec.id)}
                        className="p-2 bg-white border border-neutral-200 text-neutral-500 hover:text-red-500 hover:border-red-200 rounded-xl transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                      <button 
                        onClick={() => startEdit(rec)}
                        className="p-2 bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300 rounded-xl transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Google Calendar Live Preview Panel */}
        <div className="w-full lg:w-[320px] shrink-0">
          <div className="p-5 rounded-2xl border border-neutral-200 bg-white flex flex-col gap-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-neutral-500" />
                <span className="text-xs font-bold text-neutral-800">{t('recurring_transactions_view.live_preview_title')}</span>
              </div>
            </div>

            {fetchingEvents ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="text-neutral-400 animate-spin" size={16} />
                <span className="text-[10px] text-neutral-400 font-normal">{t('recurring_transactions_view.accessing_stream')}</span>
              </div>
            ) : !googleToken ? (
              <div className="py-8 flex flex-col items-center text-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-50 border border-neutral-200 flex items-center justify-center text-neutral-400 text-sm">
                  📅
                </div>
                <div className="flex flex-col gap-1 max-w-[200px]">
                  <span className="text-xs font-bold text-neutral-700">{t('recurring_transactions_view.calendar_inactive')}</span>
                  <p className="text-[10px] text-neutral-400 leading-normal font-normal">
                    {t('recurring_transactions_view.connect_workspace_desc')}
                  </p>
                </div>
                <button
                  onClick={handleLinkGoogle}
                  className="mt-2 py-1.5 px-3 bg-neutral-900 hover:bg-neutral-800 rounded-lg text-[10px] font-bold text-white transition-all min-h-[28px]"
                >
                  {t('recurring_transactions_view.sync_authorize')}
                </button>
              </div>
            ) : previewEvents.length === 0 ? (
              <div className="py-8 flex flex-col items-center text-center gap-2">
                <span className="text-[10px] font-bold text-neutral-500 italic">{t('recurring_transactions_view.no_events_mapped')}</span>
                <p className="text-[10px] text-neutral-400 leading-relaxed max-w-[190px] font-normal">
                  {t('recurring_transactions_view.no_events_desc')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                {previewEvents.map((event, idx) => (
                  <div 
                    key={`${event.id || 'evt'}-${idx}-${event.start?.dateTime || 'start'}`}
                    className="p-3 rounded-xl bg-neutral-50 border border-neutral-100 hover:border-neutral-200 transition-colors flex flex-col gap-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-neutral-700 truncate max-w-[140px]">
                        {event.summary}
                      </span>
                      <span className="text-[9px] text-neutral-400 font-normal shrink-0">
                        {event.start?.dateTime 
                          ? new Date(event.start.dateTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                          : event.start?.date 
                            ? new Date(event.start.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : 'Pending'
                        }
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-[10px] text-neutral-400 font-normal leading-normal line-clamp-2">
                        {event.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal 
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        title="Delete Schedule?"
        message="Are you sure you want to stop this recurring schedule? Future iterations will no longer trigger, but historical transactions remain safe."
        confirmLabel="Confirm Delete"
        type="danger"
      />

      {/* Edit Form Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setEditingItem(null)}
               className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            />
            <motion.div
               initial={{ scale: 0.95, opacity: 0, y: 15 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.95, opacity: 0, y: 15 }}
               className="relative w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
               <div className="p-6 border-b border-neutral-100 flex justify-between items-center bg-neutral-50">
                  <div className="flex flex-col">
                     <h3 className="text-base font-bold text-neutral-900">Edit schedule configuration</h3>
                     <p className="text-[11px] text-neutral-500 font-normal mt-0.5">Modify parameters for upcoming automation generation</p>
                  </div>
                  <button onClick={() => setEditingItem(null)} className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors">
                     <X size={16} className="text-neutral-500" />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-hide">
                  <div className="flex flex-col items-center gap-1">
                     <span className="text-[10px] font-bold text-neutral-400">Transaction amount</span>
                     <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-neutral-400">
                          {accounts?.find(a => a.id === (editingItem.sourceAccountId || editingItem.accountId))?.currency || 'AED'}
                        </span>
                        <input 
                           type="number"
                           step="0.01"
                           value={editAmount}
                           onChange={(e) => setEditAmount(e.target.value)}
                           className="bg-transparent border-none outline-none text-3xl font-bold text-neutral-900 w-36 text-center tracking-tight"
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 px-1">Category</label>
                        <div className="relative">
                           <select 
                              value={editCategory}
                              onChange={(e) => {
                                 setEditCategory(e.target.value);
                                 setEditSubcategory('');
                              }}
                              className="w-full bg-white border border-neutral-200 rounded-xl p-3 pl-10 text-xs text-neutral-700 outline-none focus:border-neutral-400 appearance-none transition-all hover:bg-neutral-50 min-h-[40px]"
                           >
                              {MASTER_CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                           </select>
                           <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                           <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={12} />
                        </div>
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 px-1">Subcategory</label>
                        <div className="relative">
                           <select 
                              value={editSubcategory}
                              onChange={(e) => setEditSubcategory(e.target.value)}
                              className="w-full bg-white border border-neutral-200 rounded-xl p-3 pl-10 text-xs text-neutral-700 outline-none focus:border-neutral-400 appearance-none transition-all hover:bg-neutral-50 min-h-[40px]"
                           >
                              <option value="">None</option>
                              {MASTER_CATEGORIES.find(c => c.name === editCategory)?.subcategories?.map((s, idx) => (
                                 <option key={`sub-recur-opt-${s}-${idx}`} value={s}>{s}</option>
                              ))}
                           </select>
                           <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                           <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={12} />
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 px-1">Frequence type</label>
                        <div className="relative">
                           <select 
                              value={editRecurrency}
                              onChange={(e) => setEditRecurrency(e.target.value)}
                              className="w-full bg-white border border-neutral-200 rounded-xl p-3 pl-10 text-xs text-neutral-700 outline-none focus:border-neutral-400 appearance-none transition-all hover:bg-neutral-50 min-h-[40px]"
                           >
                              {['daily', 'weekly', 'monthly', 'yearly'].map(p => <option key={p} value={p}>Every {p.replace('ly', '')}</option>)}
                           </select>
                           <RefreshCw className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                           <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={12} />
                        </div>
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 px-1">Multiplier index</label>
                        <input 
                           type="number"
                           min="1"
                           value={editInterval}
                           onChange={(e) => setEditInterval(e.target.value)}
                           className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-neutral-700 outline-none focus:border-neutral-400 transition-all font-mono min-h-[40px]"
                        />
                     </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <label className="text-[10px] font-bold text-neutral-400 px-1">Schedule label notes</label>
                     <textarea 
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full bg-white border border-neutral-200 rounded-xl p-3 text-xs text-neutral-700 outline-none focus:border-neutral-400 min-h-[60px] resize-none"
                        placeholder="Add dynamic description label details..."
                     />
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <label className="text-[10px] font-bold text-neutral-400 px-1">Schedule index date</label>
                     <div className="relative">
                        <input 
                           type="date"
                           value={editStartDate}
                           onChange={(e) => setEditStartDate(e.target.value)}
                           className="w-full bg-white border border-neutral-200 rounded-xl p-3 pl-10 text-xs text-neutral-700 outline-none focus:border-neutral-400 [color-scheme:light] transition-all min-h-[40px]"
                        />
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" size={14} />
                     </div>
                  </div>
               </div>

               <div className="p-4 border-t border-neutral-100 bg-neutral-50 flex gap-3">
                  <button 
                     onClick={() => setEditingItem(null)}
                     className="flex-1 min-h-[38px] bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center animate-fade-in"
                  >
                     Abort changes
                  </button>
                  <button 
                     onClick={handleUpdate}
                     disabled={isUpdating}
                     className="flex-[2] min-h-[38px] bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                  >
                     {isUpdating ? "Saving..." : "Confirm update"}
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
