import React, { useState, useEffect } from 'react';
import { Plus, X, Check, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

interface ShoppingItem {
  id: string;
  text: string;
  completed: boolean;
}

export const ShoppingList: React.FC<{ uid: string }> = ({ uid }) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(collection(db, `users/${uid}/shoppingList`), (snap) => {
      if (snap.empty) {
        // Migrate from localStorage if exists
        const cacheKey = `vantage_shopping_list_${uid}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const batch = writeBatch(db);
              parsed.forEach((item: any) => {
                const docRef = doc(db, `users/${uid}/shoppingList/${item.id}`);
                batch.set(docRef, {
                  id: item.id,
                  text: item.text,
                  completed: !!item.completed,
                  createdAt: serverTimestamp()
                });
              });
              batch.commit().catch(e => console.error("Error migrating shopping list to firestore:", e));
            }
          } catch (e) {
            console.error("Failed to parse local shopping list for migration:", e);
          }
        }
        setItems([]);
      } else {
        const fetched = snap.docs.map(d => ({
          id: d.id,
          text: d.data().text || '',
          completed: !!d.data().completed
        }));
        setItems(fetched);
      }
    }, (err) => {
      console.warn("Shopping list offline fallback:", err);
    });

    return () => unsub();
  }, [uid]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim() || !uid) return;

    const itemId = `shop-${Date.now()}`;
    const newItem = {
      id: itemId,
      text: newItemText.trim(),
      completed: false,
      createdAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, `users/${uid}/shoppingList`, itemId), newItem);
      setNewItemText('');
    } catch (err) {
      console.error("Failed to add shopping list item:", err);
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/shoppingList/${itemId}`);
    }
  };

  const toggleItem = async (id: string) => {
    if (!uid) return;
    const item = items.find(i => i.id === id);
    if (!item) return;

    try {
      const itemRef = doc(db, `users/${uid}/shoppingList/${id}`);
      await updateDoc(itemRef, {
        completed: !item.completed,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to toggle shopping list item:", err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/shoppingList/${id}`);
    }
  };

  const deleteItem = async (id: string) => {
    if (!uid) return;

    try {
      const itemRef = doc(db, `users/${uid}/shoppingList/${id}`);
      await deleteDoc(itemRef);
    } catch (err) {
      console.error("Failed to delete shopping list item:", err);
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/shoppingList/${id}`);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <form onSubmit={addItem} className="flex gap-2">
        <input 
          type="text" 
          value={newItemText} 
          onChange={(e) => setNewItemText(e.target.value)}
          placeholder={t('notification_dispatch_hub.shopping_list_placeholder', 'Add an item...')}
          className="flex-1 p-2 border border-neutral-250 rounded-xl text-xs text-neutral-800 placeholder-neutral-450 outline-none focus:border-[#A6DDB1] transition-colors"
        />
        <button type="submit" className="w-10 h-10 bg-[#A6DDB1] text-neutral-900 rounded-xl flex items-center justify-center hover:brightness-105 transition-all">
          <Plus size={20} />
        </button>
      </form>
      <div className="flex flex-col gap-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 p-3 border border-neutral-200/60 rounded-xl bg-neutral-50/60">
            <button onClick={() => toggleItem(item.id)} className="text-[#A6DDB1]">
              {item.completed ? <Check size={18} /> : <Square size={18} />}
            </button>
            <span className={`flex-1 text-xs text-neutral-800 ${item.completed ? 'line-through text-neutral-400' : ''}`}>
              {item.text}
            </span>
            <button onClick={() => deleteItem(item.id)} className="text-neutral-400 hover:text-rose-500">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
