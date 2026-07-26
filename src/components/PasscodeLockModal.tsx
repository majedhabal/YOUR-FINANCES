import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getPasscode } from '../lib/passcode';
import { NumberPad } from './NumberPad';

interface PasscodeLockModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const PasscodeLockModal: React.FC<PasscodeLockModalProps> = ({ isOpen, onSuccess }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError('');
    }
  }, [isOpen]);

  const handleNumber = (num: string) => {
    if (code.length < 4) {
      setCode(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setCode(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    if (code.length === 4) {
      if (getPasscode() === code) {
        onSuccess();
      } else {
        setError('Incorrect passcode');
        setCode('');
      }
    }
  }, [code, onSuccess]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-white"
      >
        <div className="flex flex-col items-center w-full max-w-sm p-6">
          <h2 className="mb-8 text-2xl font-bold font-['Google_Sans'] text-neutral-900">Enter Passcode</h2>
          
          <div className="flex gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${i < code.length ? 'bg-neutral-900' : 'bg-neutral-300'}`}
              />
            ))}
          </div>

          {error && <p className="mb-4 text-sm text-red-500 font-['Google_Sans'] font-normal">{error}</p>}

          <NumberPad onNumberPress={handleNumber} onDelete={handleBackspace} />
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
