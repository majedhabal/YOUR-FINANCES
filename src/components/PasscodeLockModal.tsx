import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getPasscode } from '../lib/passcode';

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

          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleNumber(num.toString())}
                className="w-16 h-16 text-xl font-bold font-['Google_Sans'] text-neutral-900 bg-neutral-100 rounded-full hover:bg-neutral-200"
              >
                {num}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleNumber('0')}
              className="w-16 h-16 text-xl font-bold font-['Google_Sans'] text-neutral-900 bg-neutral-100 rounded-full hover:bg-neutral-200"
            >
              0
            </button>
            <button
              onClick={handleBackspace}
              className="w-16 h-16 text-sm font-normal font-['Google_Sans'] text-neutral-600 rounded-full hover:bg-neutral-100"
            >
              Back
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
