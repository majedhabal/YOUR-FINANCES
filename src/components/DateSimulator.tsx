
import React, { useState } from 'react';
import { setSimulatedDate } from '../lib/dateSimulator';
import { db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

interface DateSimulatorProps {
  uid: string;
}

export const DateSimulator: React.FC<DateSimulatorProps> = ({ uid }) => {
  const [date, setDate] = useState('');

  const handleSetDate = () => {
    setSimulatedDate(date);
    window.location.reload();
  };

  const handleClear = async () => {
    setSimulatedDate(null);
    
    // Clear userLogins
    const loginsRef = collection(db, 'users', uid, 'userLogins');
    const snapshot = await getDocs(loginsRef);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'users', uid, 'userLogins', d.id)));
    await Promise.all(deletePromises);

    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2 bg-neutral-50 p-2 border border-neutral-200 rounded-lg" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <input 
        type="date" 
        value={date} 
        onChange={(e) => setDate(e.target.value)}
        className="border p-1 text-[10px] rounded"
      />
      <div className="flex gap-1">
        <button onClick={handleSetDate} className="bg-blue-500 text-white text-[10px] px-2 py-1 rounded">Set</button>
        <button onClick={handleClear} className="bg-red-500 text-white text-[10px] px-2 py-1 rounded">Clear</button>
      </div>
    </div>
  );
};
