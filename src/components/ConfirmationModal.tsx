import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  type?: 'danger' | 'warning' | 'mint';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to perform this action? This cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isLoading = false,
  type = 'danger'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm border border-[#E1E8ED] rounded-[1.5rem] p-6 flex flex-col items-center text-center gap-4 shadow-2xl"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              type === 'danger' ? 'bg-rose-500/10 text-rose-500' : 
              type === 'mint' ? 'bg-vantage-green/10 text-vantage-green' :
              'bg-vantage-green/10 text-vantage-green'
            }`}>
              <AlertCircle size={24} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 
                className="text-[#1F2937] tracking-tight leading-none"
                style={{ fontSize: 'clamp(12px, 3.2vw, 15px)', fontFamily: '"Google Sans", system-ui, sans-serif', fontWeight: 700 }}
              >
                {title}
              </h3>
              <p 
                className="text-neutral-500 leading-relaxed mt-2"
                style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: '"Google Sans", system-ui, sans-serif', fontWeight: 400 }}
              >
                {message}
              </p>
            </div>
            <div className="flex flex-col w-full gap-2 mt-2">
              <button
                onClick={onConfirm}
                disabled={isLoading}
                style={{ height: '38px', fontSize: 'clamp(11px, 2.5vw, 13px)', fontFamily: '"Google Sans", sans-serif', fontWeight: 600 }}
                className={`w-full flex items-center justify-center ${
                  type === 'danger' ? 'bg-rose-500 hover:bg-rose-600' : 
                  type === 'mint' ? 'bg-vantage-green hover:bg-vantage-green-dark' :
                  'bg-neutral-800 hover:bg-neutral-900'
                } text-white rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50`}
              >
                {isLoading ? "Processing..." : confirmLabel}
              </button>
              <button
                onClick={onClose}
                style={{ height: '38px', fontSize: 'clamp(11px, 2.5vw, 13px)', fontFamily: '"Google Sans", sans-serif', fontWeight: 500 }}
                className="w-full flex items-center justify-center text-neutral-500 hover:text-[#1F2937] transition-colors"
                type="button"
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
