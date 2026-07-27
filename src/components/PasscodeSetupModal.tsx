import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { setPasscode } from '../lib/passcode';
import { NumberPad } from './NumberPad';

interface PasscodeSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasscodeSetupModal: React.FC<PasscodeSetupModalProps> = ({ isOpen, onClose }) => {
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
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

  const handleSave = () => {
    if (code.length === 4) {
      setPasscode(code);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-white"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          value={code}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '');
            if (val.length <= 4) setCode(val);
          }}
          className="opacity-0 absolute h-0 w-0"
        />
        <div className="flex flex-col items-center w-full max-w-sm p-6">
          <h2 className="mb-8 text-2xl font-bold font-['Google_Sans'] text-neutral-900">Set Passcode</h2>
          <p className="mb-4 text-neutral-600 font-['Google_Sans'] font-normal">Use your keyboard or the pad below to set your 4-digit code.</p>
          
          <div className="flex gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full ${i < code.length ? 'bg-neutral-900' : 'bg-neutral-300'}`}
              />
            ))}
          </div>

          <NumberPad onNumberPress={handleNumber} onDelete={handleBackspace} />
          <button
            onClick={handleSave}
            disabled={code.length !== 4}
            className="mt-6 px-8 py-3 bg-neutral-900 text-white rounded-full disabled:bg-neutral-300 font-bold font-['Google_Sans'] w-full max-w-[200px]"
          >
            Save
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
