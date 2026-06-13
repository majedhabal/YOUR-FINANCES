import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Plus, Trash2, Edit3, Save, X, 
  ChevronRight, Sparkles, Filter, MoreVertical,
  Archive
} from 'lucide-react';
import { 
  collection, query, getDocs, doc, setDoc, 
  deleteDoc, updateDoc, writeBatch, onSnapshot,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { MASTER_CATEGORIES, CategoryDef } from '../lib/constants';

interface CategoryManagerProps {
  uid: string;
  onBack: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ uid, onBack }) => {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState<string | null>(null);
  const [newSubcategoryMap, setNewSubcategoryMap] = useState<Record<string, string>>({});

  // Form states for adding/editing
  const [editingObj, setEditingObj] = useState<{ id: string, type: 'category' | 'subcategory', parentId?: string, name: string, emoji?: string, nature?: string } | null>(null);
  
  const [addForm, setAddForm] = useState({ name: '', nature: 'Want', emoji: '📁' });

  const [showArchived, setShowArchived] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'delete-category' | 'delete-subcategory' | 'archive-category' | 'unarchive-category' | 'archive-subcategory' | 'unarchive-subcategory' | null;
    categoryData?: any;
    subcategoryData?: { catId: string; subcategories: string[]; index: number; isArchived?: boolean };
  }>({
    isOpen: false,
    type: null
  });

  useEffect(() => {
    const q = query(collection(db, `users/${uid}/custom_categories`));
    const unsubscribe = onSnapshot(q, async (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        try {
          const { fetchGlobalPresets } = await import('../lib/categoryUtils');
          const presets = await fetchGlobalPresets();
          list = presets.map((p, idx) => ({ id: `preset_${idx}`, ...p }));
        } catch (err) {
          list = MASTER_CATEGORIES.map((p, idx) => ({ id: `local_${idx}`, ...p }));
        }
      }
      setCategories(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [uid]);

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const batch = writeBatch(db);
      MASTER_CATEGORIES.forEach((cat) => {
        const ref = doc(collection(db, `users/${uid}/custom_categories`));
        batch.set(ref, cat);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/custom_categories (batch)`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleAddCategory = async () => {
    if (!addForm.name) return;
    try {
      const ref = doc(collection(db, `users/${uid}/custom_categories`));
      await setDoc(ref, {
        name: addForm.name,
        nature: addForm.nature,
        emoji: addForm.emoji,
        subcategories: []
      });
      setIsAddingCategory(false);
      setAddForm({ name: '', nature: 'Want', emoji: '📁' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/custom_categories`);
    }
  };

  const handleAddSubcategory = async (catId: string, currentSubs: string[]) => {
    const subName = newSubcategoryMap[catId];
    if (!subName) return;
    try {
      const ref = doc(db, `users/${uid}/custom_categories`, catId);
      await updateDoc(ref, {
        subcategories: [...currentSubs, subName]
      });
      setNewSubcategoryMap(prev => ({ ...prev, [catId]: '' }));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${catId}`);
    }
  };

  const executeDeleteCategory = async (cat: any) => {
    try {
      await deleteDoc(doc(db, `users/${uid}/custom_categories`, cat.id));
      if (selectedCategory?.id === cat.id) setSelectedCategory(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/custom_categories/${cat.id}`);
    }
  };

  const executeArchiveCategory = async (cat: any) => {
    try {
      const isArch = !!cat.isArchived;
      const ref = doc(db, `users/${uid}/custom_categories`, cat.id);
      await updateDoc(ref, {
        isArchived: !isArch
      });
      if (selectedCategory?.id === cat.id) {
        setSelectedCategory(prev => prev ? { ...prev, isArchived: !isArch } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${cat.id}`);
    }
  };

  const handleArchiveCategory = async (cat: any) => {
    setConfirmModal({
      isOpen: true,
      type: cat.isArchived ? 'unarchive-category' : 'archive-category',
      categoryData: cat
    });
  };

  const handleDeleteCategory = async (cat: any) => {
    setIsCheckingUsage(cat.id);
    try {
      // Check if any transactions use this category
      const q = query(collection(db, `users/${uid}/transactions`), where('category', '==', cat.name));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        alert(`This category is in use by ${snap.size} transactions. Please reassign transactions before deleting.`);
        return;
      }

      setConfirmModal({
        isOpen: true,
        type: 'delete-category',
        categoryData: cat
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/custom_categories/${cat.id}`);
    } finally {
      setIsCheckingUsage(null);
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingObj || editingObj.type !== 'category') return;
    try {
      const ref = doc(db, `users/${uid}/custom_categories`, editingObj.id);
      await updateDoc(ref, {
        name: editingObj.name,
        emoji: editingObj.emoji,
        nature: editingObj.nature
      });
      setEditingObj(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${editingObj.id}`);
    }
  };

  const handleUpdateSubcategory = async (catId: string, currentSubs: string[], oldName: string, newName: string) => {
    try {
      const updated = currentSubs.map(s => s === oldName ? newName : s);
      const ref = doc(db, `users/${uid}/custom_categories`, catId);
      await updateDoc(ref, {
        subcategories: updated
      });
      setEditingObj(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${catId}`);
    }
  };

  const executeDeleteSubcategory = async (catId: string, currentSubs: string[], index: number) => {
    try {
      const updated = currentSubs.filter((_, i) => i !== index);
      const ref = doc(db, `users/${uid}/custom_categories`, catId);
      await updateDoc(ref, {
        subcategories: updated
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${catId}`);
    }
  };

  const handleDeleteSubcategory = async (catId: string, currentSubs: string[], index: number) => {
    setConfirmModal({
      isOpen: true,
      type: 'delete-subcategory',
      subcategoryData: { catId, subcategories: currentSubs, index }
    });
  };

  const executeArchiveSubcategory = async (catId: string, currentSubs: string[], index: number, isArchived: boolean) => {
    try {
      const cat = categories.find(c => c.id === catId);
      if (!cat) return;
      const archivedSubs = cat.archivedSubcategories || [];
      
      let updatedSubs = [...currentSubs];
      let updatedArchived = [...archivedSubs];

      if (isArchived) {
        const subName = archivedSubs[index];
        updatedArchived = archivedSubs.filter((_, i) => i !== index);
        if (subName) {
          updatedSubs = [...currentSubs, subName];
        }
      } else {
        const subName = currentSubs[index];
        updatedSubs = currentSubs.filter((_, i) => i !== index);
        if (subName) {
          updatedArchived = [...archivedSubs, subName];
        }
      }

      const ref = doc(db, `users/${uid}/custom_categories`, catId);
      await updateDoc(ref, {
        subcategories: updatedSubs,
        archivedSubcategories: updatedArchived
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/custom_categories/${catId}`);
    }
  };

  const handleArchiveSubcategory = async (catId: string, currentSubs: string[], index: number, isArchived: boolean) => {
    setConfirmModal({
      isOpen: true,
      type: isArchived ? 'unarchive-subcategory' : 'archive-subcategory',
      subcategoryData: { catId, subcategories: currentSubs, index, isArchived }
    });
  };

  const natureColors: Record<string, string> = {
    Need: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    Want: 'bg-[#00FF88]/10 text-emerald-600 dark:text-[#00FF88] border-emerald-200 dark:border-[#00FF88]/20',
    Must: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20',
    Income: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  };

  return (
    <div className="flex flex-col gap-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <div className="flex items-center gap-6 px-2">
        <button 
          onClick={onBack}
          className="p-4 bg-[#E1E8ED]/20 dark:bg-vantage-muted-green/20 rounded-2xl border border-[#E1E8ED] dark:border-white/5 hover:bg-[#E1E8ED]/40 dark:hover:bg-vantage-muted-green/30 transition-all text-neutral-600 dark:text-vantage-blue-grey group active:scale-95 shadow-lg cursor-pointer"
          id="taxonomy-back-button"
        >
          <ChevronLeft size={24} className="group-hover:text-black dark:group-hover:text-white transition-colors" />
        </button>
        <div className="flex flex-col gap-1">
          <h2 
            className="text-[clamp(20px,3.5vw,28px)] text-neutral-900 dark:text-white uppercase tracking-tighter leading-tight"
            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            id="taxonomy-main-title"
          >
            TAXONOMY
          </h2>
          <p 
            className="text-[clamp(9px,2.8vw,12px)] text-emerald-600 dark:text-vantage-green uppercase tracking-[0.4em]"
            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            id="taxonomy-subtitle"
          >
            STRATEGIC MATRIX SETTINGS
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20">
          <div className="w-10 h-10 border-2 border-vantage-green/20 border-t-vantage-green rounded-full animate-spin"></div>
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-[#121212] rounded-[2.5rem] border border-[#E1E8ED] dark:border-white/5 gap-8 shadow-2xl">
           <div className="w-24 h-24 rounded-[2rem] bg-emerald-50 dark:bg-vantage-green/5 flex items-center justify-center border border-emerald-200 dark:border-vantage-green/10 shadow-[0_0_30px_rgba(0,255,136,0.1)]">
              <Sparkles className="text-emerald-600 dark:text-vantage-green" size={48} />
           </div>
           <div className="text-center flex flex-col gap-3">
              <h3 
                className="text-[clamp(16px,3.5vw,22px)] text-neutral-900 dark:text-white uppercase"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                id="init-title"
              >
                INITIALIZE SYSTEM
              </h3>
              <p 
                className="text-[clamp(9px,2.8vw,11px)] text-neutral-500 dark:text-vantage-blue-grey max-w-[280px] mx-auto uppercase leading-relaxed tracking-widest"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                 id="init-description"
              >
                 Taxonomy configuration required. Deploy Master List protocol?
              </p>
           </div>
           <button 
             onClick={handleInitialize}
             disabled={isInitializing}
             style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(10px, 2.5vw, 12px)' }}
             className="px-10 py-5 bg-[#A6DDB1] hover:bg-[#86CA93] text-neutral-900 rounded-[1.5rem] font-bold uppercase tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all w-full cursor-pointer"
             id="init-execute-button"
           >
             {isInitializing ? 'Deploying...' : 'Execute Deployment'}
           </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center px-4 gap-2" id="matrix-nodes-header">
             <span 
               className="text-[clamp(9px,2.8vw,12px)] text-neutral-500 dark:text-vantage-blue-grey uppercase tracking-[0.3em]"
               style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
               id="matrix-nodes-label"
             >
               MATRIX NODES
             </span>
             <div className="flex items-center gap-2">
               <button 
                 onClick={() => setShowArchived(!showArchived)}
                 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                 className="h-[32px] px-3 bg-neutral-100 dark:bg-[#1E293B] text-neutral-600 dark:text-neutral-300 rounded-lg hover:brightness-95 active:scale-95 transition-all shadow-md cursor-pointer text-[clamp(10px,2.2vw,12px)] uppercase tracking-wider border border-[#E1E8ED] dark:border-white/5"
                 id="toggle-archived-nodes-button"
               >
                 {showArchived ? 'SHOW ACTIVE NODES' : 'SHOW ARCHIVED NODES'}
               </button>
               <button 
                 onClick={() => setIsAddingCategory(true)}
                 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                 className="h-[32px] px-3 bg-[#A6DDB1] text-neutral-900 rounded-lg flex items-center gap-1.5 hover:brightness-95 active:scale-95 transition-all shadow-md cursor-pointer text-[clamp(10px,2.2vw,12px)] uppercase tracking-[0.05em]"
                 id="create-node-button"
               >
                 <Plus size={12} /> Create Node
               </button>
             </div>
          </div>

          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 px-2 max-w-[360px] sm:max-w-none mx-auto w-full animate-none"
            id="taxonomy-matrix-grid"
          >
             {categories
                .filter((cat) => showArchived ? true : !cat.isArchived)
                .map((cat) => (
                <div 
                  key={cat.id} 
                  className={`bg-white dark:bg-[#121212] rounded-xl border p-3 flex flex-col gap-2 transition-all hover:bg-neutral-50 dark:hover:bg-[#181812] shadow-md w-full ${cat.isArchived ? 'opacity-60 saturate-[0.15] border-dashed border-[#A6DDB1]/40' : 'border-[#E1E8ED] dark:border-white/[0.04]'}`}
                  id={`category-card-${cat.id}`}
                >
                   <div className="flex items-center justify-between gap-2">
                       <button 
                         onClick={() => setSelectedCategory(selectedCategory?.id === cat.id ? null : cat)}
                         className="flex-1 flex items-center gap-2 text-left min-w-0 cursor-pointer"
                         id={`category-toggle-button-${cat.id}`}
                       >
                         <div className="w-7 h-7 rounded bg-neutral-100 dark:bg-black/40 flex items-center justify-center text-sm border border-[#E1E8ED] dark:border-white/5 shrink-0">
                            {cat.emoji}
                         </div>
                         <div className="flex flex-col min-w-0">
                            <span 
                              className="text-[clamp(11.5px,2.8vw,13.5px)] text-black dark:text-white truncate uppercase tracking-tight leading-tight"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            >
                              {cat.name}
                            </span>
                            <span 
                              className="text-[clamp(9px,2.2vw,11px)] text-[#57606F] dark:text-[#8A95A5] uppercase tracking-wider mt-0.5"
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            >
                              {cat.subcategories.length} SUB-NODES
                            </span>
                         </div>
                       </button>
                       
                       <div className="flex items-center gap-0.5 shrink-0">
                         <button 
                           onClick={() => setEditingObj({ id: cat.id, type: 'category', name: cat.name, emoji: cat.emoji, nature: cat.nature })}
                           className="p-1 text-[#57606F] dark:text-vantage-blue-grey hover:text-black dark:hover:text-white transition-colors hover:bg-neutral-100 dark:hover:bg-white/5 rounded cursor-pointer"
                           style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                           id={`edit-category-${cat.id}`}
                         >
                           <Edit3 size={12} />
                         </button>
                         <button 
                           onClick={() => handleArchiveCategory(cat)}
                           className="p-1 text-[#57606F] dark:text-vantage-blue-grey hover:text-emerald-500 transition-colors hover:bg-neutral-100 dark:hover:bg-white/5 rounded cursor-pointer"
                           style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                           id={`archive-category-${cat.id}`}
                         >
                           <Archive size={12} className={cat.isArchived ? "text-emerald-500" : ""} />
                         </button>
                         <button 
                           onClick={() => handleDeleteCategory(cat)}
                           disabled={isCheckingUsage === cat.id}
                           className="p-1 text-[#57606F] dark:text-vantage-blue-grey hover:text-rose-500 transition-colors disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-white/5 rounded cursor-pointer"
                           style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                           id={`delete-category-${cat.id}`}
                         >
                           {isCheckingUsage === cat.id ? <div className="w-3 h-3 border border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /> : <Trash2 size={12} />}
                         </button>
                       </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#E1E8ED] dark:border-white/[0.03] pt-1.5 mt-0.5">
                       <span 
                         className={`text-[clamp(9px,2.2vw,11px)] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] border ${natureColors[cat.nature] || 'bg-neutral-100 dark:bg-white/5 text-[#57606F] dark:text-vantage-blue-grey border-[#E1E8ED] dark:border-white/10'}`}
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id={`category-nature-${cat.id}`}
                       >
                         {cat.nature}
                       </span>
                       <button 
                         onClick={() => setSelectedCategory(selectedCategory?.id === cat.id ? null : cat)}
                         className="text-[#57606F] dark:text-vantage-blue-grey hover:text-black dark:hover:text-white transition-all p-1 hover:bg-neutral-100 dark:hover:bg-white/5 rounded cursor-pointer"
                         style={{ transform: selectedCategory?.id === cat.id ? 'rotate(90deg)' : 'none', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id={`chevron-toggle-${cat.id}`}
                       >
                         <ChevronRight size={12} />
                       </button>
                    </div>
                    
                    <AnimatePresence>
                     {selectedCategory?.id === cat.id && (
                       <motion.div 
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: 'auto', opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         className="overflow-hidden border-t border-[#E1E8ED] dark:border-white/[0.05] mt-1.5 pt-1.5 flex flex-col gap-1 w-full"
                         id={`expanded-sub-nodes-${cat.id}`}
                       >
                          {cat.subcategories.map((sub: string, i: number) => (
                             <div 
                               key={`${cat.id}-sub-${i}`} 
                               className="flex items-center justify-between h-[36px] px-2 rounded hover:bg-neutral-100 dark:hover:bg-white/[0.02] group/sub w-full"
                               id={`sub-node-${cat.id}-${i}`}
                             >
                                <span 
                                  className="text-[clamp(11px,2.8vw,13px)] text-[#57606F] dark:text-vantage-blue-grey uppercase tracking-wider truncate mr-2"
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                >
                                  {sub}
                                </span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 focus-within/sub:opacity-100 transition-opacity shrink-0">
                                  <button 
                                    onClick={() => setEditingObj({ id: cat.id, type: 'subcategory', parentId: cat.id, name: sub })}
                                    className="p-1 text-[#57606F] dark:text-[#8A95A5] hover:text-black dark:hover:text-white transition-colors rounded cursor-pointer"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    id={`edit-sub-${cat.id}-${i}`}
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                  <button 
                                    onClick={() => handleArchiveSubcategory(cat.id, cat.subcategories, i, false)}
                                    className="p-1 text-[#57606F] dark:text-[#8A95A5] hover:text-[#A6DDB1] transition-colors rounded cursor-pointer"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    id={`archive-sub-${cat.id}-${i}`}
                                  >
                                    <Archive size={11} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteSubcategory(cat.id, cat.subcategories, i)}
                                    className="p-1 text-[#57606F] dark:text-[#8A95A5] hover:text-rose-400 transition-colors rounded cursor-pointer"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    id={`delete-sub-${cat.id}-${i}`}
                                  >
                                     <Trash2 size={11} />
                                  </button>
                                </div>
                             </div>
                          ))}
                          
                          {showArchived && (cat.archivedSubcategories || []).map((sub: string, i: number) => (
                             <div 
                               key={`${cat.id}-sub-archived-${i}`} 
                               className="flex items-center justify-between h-[36px] px-2 rounded bg-neutral-100/30 dark:bg-white/[0.01] hover:bg-neutral-100 dark:hover:bg-white/[0.02] group/sub w-full opacity-60 saturate-50"
                               id={`sub-node-archived-${cat.id}-${i}`}
                             >
                                <span 
                                  className="text-[clamp(11px,2.8vw,13px)] text-[#57606F] dark:text-vantage-blue-grey line-through uppercase tracking-wider truncate mr-2"
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                >
                                  {sub}
                                </span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/sub:opacity-100 focus-within/sub:opacity-100 transition-opacity shrink-0">
                                  <button 
                                    onClick={() => handleArchiveSubcategory(cat.id, cat.subcategories, i, true)}
                                    className="p-1 text-emerald-500 hover:text-emerald-600 transition-colors rounded cursor-pointer"
                                    style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                    id={`restore-sub-${cat.id}-${i}`}
                                    title="Unarchive Sub-category"
                                  >
                                    <Archive size={11} className="rotate-180" />
                                  </button>
                                </div>
                             </div>
                          ))}

                          <div className="flex gap-1.5 mt-2 pt-1.5 border-t border-[#E1E8ED] dark:border-white/[0.03] w-full" id={`add-subcategory-wrapper-${cat.id}`}>
                             <input 
                               type="text"
                               value={newSubcategoryMap[cat.id] || ''}
                              onChange={(e) => setNewSubcategoryMap(prev => ({ ...prev, [cat.id]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddSubcategory(cat.id, cat.subcategories)}
                              placeholder="Append..."
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.8vw, 11px)' }}
                              className="flex-1 h-8 bg-white dark:bg-[#1C1C1C] border border-[#E1E8ED] dark:border-neutral-800 text-black dark:text-white focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] outline-none placeholder-[#57606F] px-2 rounded-lg"
                              id={`input-sub-${cat.id}`}
                            />
                            <button 
                              onClick={() => handleAddSubcategory(cat.id, cat.subcategories)}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2.8vw, 11px)' }}
                              className="h-8 px-2.5 bg-[#A6DDB1] text-neutral-900 rounded-lg hover:bg-[#86CA93] transition-all flex items-center justify-center active:scale-95 uppercase tracking-wider cursor-pointer"
                              id={`btn-add-sub-${cat.id}`}
                            >
                              <Plus size={12} className="mr-0.5" /> ADD
                            </button>
                         </div>
                      </motion.div>
                    )}
                   </AnimatePresence>
                </div>
             ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingObj && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setEditingObj(null)} />
           <motion.div 
             initial={{ scale: 0.95, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="relative w-full max-w-sm bg-white dark:bg-[#121212] border border-[#E1E8ED] dark:border-white/[0.05] rounded-[1.25rem] p-6 flex flex-col gap-6 shadow-2xl"
             id="edit-modal-card"
           >
              <h3 
                className="text-[clamp(18px,3.5vw,22px)] text-black dark:text-white uppercase tracking-tighter"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                id="edit-modal-title"
              >
                MODIFY NODE
              </h3>
              
              <div className="flex flex-col gap-4" id="edit-modal-form">
                 <div className="flex flex-col gap-1.5">
                    <label 
                      className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest ml-1"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      id="edit-modal-label-display-name"
                    >
                      Display Name
                    </label>
                    <input 
                      type="text"
                      className="w-full bg-white dark:bg-[#161616] border border-[#E1E8ED] dark:border-white/10 rounded-xl p-3 text-[clamp(11.5px,2.5vw,13.5px)] text-black dark:text-white focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] outline-none placeholder-[#57606F] min-h-[44px]"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      value={editingObj.name}
                      onChange={(e) => setEditingObj({ ...editingObj, name: e.target.value })}
                      id="edit-modal-input-name"
                    />
                 </div>

                 {editingObj.type === 'category' && (
                   <>
                    <div className="flex flex-col gap-1.5">
                       <label 
                         className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest ml-1"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id="edit-modal-label-nature"
                       >
                         Nature
                       </label>
                       <div className="grid grid-cols-4 gap-2" id="edit-modal-nature-grid">
                          {['Need', 'Want', 'Must', 'Income'].map(n => (
                            <button
                              key={n}
                              onClick={() => setEditingObj({ ...editingObj, nature: n })}
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: 'clamp(9px, 2vw, 11px)' }}
                              className={`py-2 rounded-lg uppercase border transition-all cursor-pointer ${editingObj.nature === n ? 'bg-[#A6DDB1] text-neutral-900 border-[#A6DDB1]' : 'bg-neutral-50 dark:bg-white/5 text-[#57606F] dark:text-vantage-blue-grey border-[#E1E8ED] dark:border-white/5'}`}
                              id={`edit-nature-toggle-${n}`}
                            >
                              {n}
                            </button>
                          ))}
                       </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                       <label 
                         className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest ml-1"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id="edit-modal-label-graphic"
                       >
                         Graphic
                       </label>
                       <input 
                         type="text"
                         className="w-full bg-white dark:bg-[#161616] border border-[#E1E8ED] dark:border-white/10 rounded-xl p-3 text-center text-xl text-black dark:text-white focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] outline-none placeholder-[#57606F] min-h-[44px]"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         value={editingObj.emoji}
                         onChange={(e) => setEditingObj({ ...editingObj, emoji: e.target.value })}
                         id="edit-modal-input-emoji"
                       />
                    </div>
                   </>
                 )}
              </div>

              <div className="flex gap-3 mt-2" id="edit-modal-actions">
                 <button 
                   onClick={() => setEditingObj(null)}
                   style={{ height: '44px', borderRadius: '12px', fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }}
                   className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300 uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-neutral-800 cursor-pointer"
                   id="edit-modal-cancel-button"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={() => {
                     if (editingObj.type === 'category') {
                       handleUpdateCategory();
                     } else {
                        const cat = categories.find(c => c.id === editingObj.parentId);
                        handleUpdateSubcategory(editingObj.parentId!, cat.subcategories, editingObj.id, editingObj.name);
                     }
                   }}
                   style={{ height: '44px', borderRadius: '12px', fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }}
                   className="flex-[2] bg-[#A6DDB1] hover:bg-[#86CA93] text-neutral-900 uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                   id="edit-modal-save-button"
                 >
                   Update Protocol
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      {/* Add Category Modal */}
      {isAddingCategory && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setIsAddingCategory(false)} />
           <motion.div 
             initial={{ scale: 0.95, opacity: 0, y: 15 }}
             animate={{ scale: 1, opacity: 1, y: 0 }}
             className="relative w-full max-w-sm bg-white dark:bg-[#121212] border border-[#E1E8ED] dark:border-white/[0.05] rounded-[1.25rem] p-6 flex flex-col gap-6 shadow-2xl"
             id="add-modal-card"
           >
              <div className="flex flex-col gap-1" id="add-modal-header">
                <h3 
                  className="text-[clamp(18px,3.5vw,22px)] text-black dark:text-white uppercase tracking-tighter leading-tight"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  id="add-modal-title"
                >
                  DEFINE MASTER NODE
                </h3>
                <p 
                  className="text-[clamp(9px,2.8vw,12px)] text-emerald-600 dark:text-[#A6DDB1] uppercase tracking-[0.4em]"
                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                  id="add-modal-subtitle"
                >
                  STRATEGIC LOGIC FRAMEWORK
                </p>
              </div>

              <div className="flex flex-col gap-5" id="add-modal-form">
                 <div className="flex flex-col gap-2">
                    <label 
                      className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest px-1"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      id="add-modal-label-name"
                    >
                      Label
                    </label>
                    <input 
                      type="text"
                      autoFocus
                      placeholder="e.g. Subscriptions"
                      className="w-full bg-white dark:bg-[#161616] border border-[#E1E8ED] dark:border-white/10 rounded-xl p-3.5 text-[clamp(12px,2.5vw,14px)] text-black dark:text-white focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] outline-none placeholder-[#57606F] min-h-[44px]"
                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      id="add-modal-input-name"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4" id="add-modal-grid">
                    <div className="flex flex-col gap-2">
                       <label 
                         className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest px-1"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id="add-modal-label-nature"
                       >
                         Nature
                       </label>
                       <select 
                         className="w-full bg-white dark:bg-[#161616] border border-[#E1E8ED] dark:border-white/10 rounded-xl p-3 text-[clamp(12px,2.5vw,14px)] text-black dark:text-white outline-none appearance-none font-normal uppercase focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] min-h-[44px]"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         value={addForm.nature}
                         onChange={(e) => setAddForm({ ...addForm, nature: e.target.value })}
                         id="add-modal-select-nature"
                       >
                          {['Need', 'Want', 'Must', 'Income'].map(n => <option key={n} value={n} className="bg-white dark:bg-[#1C1C1C] text-black dark:text-white">{n}</option>)}
                       </select>
                    </div>
                    <div className="flex flex-col gap-2">
                       <label 
                         className="text-[clamp(9px,2.8vw,11px)] text-[#57606F] dark:text-vantage-blue-grey uppercase font-black tracking-widest px-1"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         id="add-modal-label-graphic"
                       >
                         Graphic
                       </label>
                       <input 
                         type="text"
                         className="w-full bg-white dark:bg-[#161616] border border-[#E1E8ED] dark:border-white/10 rounded-xl p-3 text-center text-xl text-black dark:text-white outline-none focus:border-[#A6DDB1] dark:focus:border-[#A6DDB1] placeholder-[#57606F] min-h-[44px]"
                         style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                         value={addForm.emoji}
                         onChange={(e) => setAddForm({ ...addForm, emoji: e.target.value })}
                         id="add-modal-input-emoji"
                       />
                    </div>
                 </div>
              </div>
              <div className="flex gap-4 pt-2" id="add-modal-actions">
                 <button 
                   onClick={() => setIsAddingCategory(false)}
                   style={{ height: '44px', borderRadius: '12px', fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }}
                   className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-300 uppercase tracking-[0.2em] hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                   id="add-modal-abort-button"
                 >
                    Abort
                 </button>
                 <button 
                   onClick={handleAddCategory}
                   style={{ height: '44px', borderRadius: '12px', fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '11px' }}
                   className="flex-[2] bg-[#A6DDB1] hover:bg-[#86CA93] text-neutral-900 uppercase tracking-[0.2em] shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                   id="add-modal-submit-button"
                 >
                    Establish Node
                 </button>
              </div>
           </motion.div>
        </div>
      )}

      {/* Confirmation warning modal for taxonomy modifications */}
      <AnimatePresence>
        {confirmModal.isOpen && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal({ isOpen: false, type: null })}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              id="confirm-modal-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ ease: "easeOut", duration: 0.2 }}
              className="relative w-full max-w-[340px] md:max-w-[380px] bg-white dark:bg-[#121212] border border-[#E1E8ED] dark:border-white/[0.05] rounded-[1.25rem] p-5 flex flex-col items-center text-center gap-4 shadow-xl z-10"
              id="confirm-modal-card"
            >
              <h3 
                className="text-neutral-800 dark:text-white uppercase tracking-wider text-[clamp(13px,3.8vw,16px)]"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                id="confirm-modal-title"
              >
                {confirmModal.type === 'delete-category' && 'DELETE CATEGORY'}
                {confirmModal.type === 'delete-subcategory' && 'DELETE SUB-CATEGORY'}
                {confirmModal.type === 'archive-category' && 'ARCHIVE CATEGORY'}
                {confirmModal.type === 'unarchive-category' && 'UNARCHIVE CATEGORY'}
                {confirmModal.type === 'archive-subcategory' && 'ARCHIVE SUB-CATEGORY'}
                {confirmModal.type === 'unarchive-subcategory' && 'UNARCHIVE SUB-CATEGORY'}
              </h3>

              <p 
                className="text-neutral-500 dark:text-[#8A95A5] leading-relaxed text-[clamp(11.5px,2.8vw,13.5px)] px-1"
                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                id="confirm-modal-warning-text"
              >
                {confirmModal.type === 'delete-category' && 'Are you sure you want to delete this category?'}
                {confirmModal.type === 'delete-subcategory' && 'Are you sure you want to delete this sub-category?'}
                {confirmModal.type === 'archive-category' && 'Are you sure you want to archive this category?'}
                {confirmModal.type === 'unarchive-category' && 'Are you sure you want to restore this category?'}
                {confirmModal.type === 'archive-subcategory' && 'Are you sure you want to archive this sub-category?'}
                {confirmModal.type === 'unarchive-subcategory' && 'Are you sure you want to restore this sub-category?'}
              </p>

              <div className="flex flex-col w-full gap-3 mt-1" id="confirm-modal-actions">
                <button 
                  onClick={async () => {
                    if (confirmModal.type === 'delete-category') {
                      if (confirmModal.categoryData) {
                        await executeDeleteCategory(confirmModal.categoryData);
                      }
                    } else if (confirmModal.type === 'delete-subcategory') {
                      if (confirmModal.subcategoryData) {
                        const { catId, subcategories, index } = confirmModal.subcategoryData;
                        await executeDeleteSubcategory(catId, subcategories, index);
                      }
                    } else if (confirmModal.type === 'archive-category' || confirmModal.type === 'unarchive-category') {
                      if (confirmModal.categoryData) {
                        await executeArchiveCategory(confirmModal.categoryData);
                      }
                    } else if (confirmModal.type === 'archive-subcategory' || confirmModal.type === 'unarchive-subcategory') {
                      if (confirmModal.subcategoryData) {
                        const { catId, subcategories, index, isArchived } = confirmModal.subcategoryData;
                        await executeArchiveSubcategory(catId, subcategories, index, !!isArchived);
                      }
                    }
                    setConfirmModal({ isOpen: false, type: null });
                  }}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400
                  }}
                  className="w-full h-[38px] md:h-[42px] bg-[#A6DDB1] hover:bg-[#86CA93] active:scale-95 text-neutral-900 transition-all rounded-xl uppercase tracking-wider flex items-center justify-center cursor-pointer font-bold text-[clamp(11px,2.8vw,13px)]"
                  id="confirm-modal-proceed-button"
                >
                  PROCEED
                </button>

                <button 
                  onClick={() => setConfirmModal({ isOpen: false, type: null })}
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: 'clamp(11px, 2.8vw, 13px)'
                  }}
                  className="w-full text-neutral-400 hover:text-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors uppercase tracking-wider text-center cursor-pointer py-1 font-normal"
                  id="confirm-modal-cancel-button"
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
