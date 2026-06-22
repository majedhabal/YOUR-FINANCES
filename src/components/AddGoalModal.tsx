import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, collection, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface AddGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  currency: string;
}

export const AddGoalModal: React.FC<AddGoalModalProps> = ({ isOpen, onClose, uid, currency }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentValue, setCurrentValue] = useState('');

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name || !targetAmount) return;

    try {
      const milestoneRef = doc(collection(db, `users/${uid}/milestones`));
      await setDoc(milestoneRef, {
        id: milestoneRef.id,
        name,
        targetAmount: parseFloat(targetAmount),
        currentValue: parseFloat(currentValue || '0'),
        currency,
        isArchived: false,
        createdAt: new Date().toISOString(),
      });
      onClose();
      setName('');
      setTargetAmount('');
      setCurrentValue('');
    } catch (error) {
      console.error('Error adding goal:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4 font-sans text-neutral-900">Add Goal</h2>
        <input
          type="text"
          placeholder="Goal Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 mb-4 border border-neutral-200 rounded font-sans text-neutral-900"
        />
        <input
          type="number"
          placeholder="Target Amount"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          className="w-full p-2 mb-4 border border-neutral-200 rounded font-sans text-neutral-900"
        />
        <input
          type="number"
          placeholder="Current Saved Amount"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          className="w-full p-2 mb-4 border border-neutral-200 rounded font-sans text-neutral-900"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-normal text-neutral-600 font-sans">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-bold bg-[#366945] text-white rounded font-sans">Save</button>
        </div>
      </div>
    </div>
  );
};
