import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  type?: 'danger' | 'warning' | 'mint';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isLoading = false,
  type = 'danger'
}) => {
  const { t } = useTranslation();

  // Helper to lookup translation keys based on standard english props passed
  const getTranslationOf = (text?: string, defaultKey?: string, defaultVal?: string) => {
    if (!text) {
      if (defaultKey) {
        return t(defaultKey, defaultVal);
      }
      return '';
    }

    switch (text.trim()) {
      // Titles (exact or close checks)
      case "Confirm Action":
        return t("confirmation_modal.confirm_action", "Confirm Action");
      case "Delete Schedule?":
        return t("confirmation_modal.delete_schedule_title", "Delete Schedule?");
      case "Delete Budget?":
        return t("confirmation_modal.delete_budget_title", "Delete Budget?");
      case "Delete Debt Milestone?":
        return t("confirmation_modal.delete_debt_milestone_title", "Delete Debt Milestone?");
      case "Purge Record":
        return t("confirmation_modal.purge_record_title", "Purge Record");
      case "Reject Draft":
        return t("confirmation_modal.reject_draft_title", "Reject Draft");
      case "Destroy Record Segment":
        return t("confirmation_modal.destroy_record_segment_title", "Destroy Record Segment");

      // Confirm labels
      case "Confirm":
        return t("confirmation_modal.confirm", "Confirm");
      case "Confirm Delete":
        return t("confirmation_modal.confirm_delete", "Confirm Delete");
      case "Confirm Deletion":
        return t("confirmation_modal.confirm_deletion", "Confirm Deletion");
      case "Confirm Delete Milestone":
        return t("confirmation_modal.confirm_delete_milestone", "Confirm Delete Milestone");
      case "Destroy record node":
        return t("confirmation_modal.destroy_record_node", "Destroy record node");
      case "Reject Transaction":
        return t("confirmation_modal.reject_transaction", "Reject Transaction");
      case "Destroy record node statement":
        return t("confirmation_modal.destroy_record_node_statement", "Destroy record node statement");
        
      // Cancel labels
      case "Cancel":
        return t("confirmation_modal.cancel", "Cancel");

      default:
        return text;
    }
  };

  const displayTitle = getTranslationOf(title, "confirmation_modal.confirm_action", "Confirm Action");
  // Only translate if message is a string
  const displayMessage = typeof message === 'string' ? getTranslationOf(message, "confirmation_modal.confirm_body", "Are you sure you want to perform this action? This cannot be undone.") : message;
  const displayConfirmLabel = getTranslationOf(confirmLabel, "confirmation_modal.confirm", "Confirm");
  const displayCancelLabel = getTranslationOf(cancelLabel, "confirmation_modal.cancel", "Cancel");
  const displayProcessing = t("confirmation_modal.processing", "Processing...");

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="confirm-modal-wrapper" className="fixed inset-0 z-[11000] flex items-center justify-center p-6">
          <motion.div
            key="confirm-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            key="confirm-modal-content"
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
            <div className="flex flex-col gap-2 w-full">
              <h3 
                className="text-[#1F2937] tracking-tight leading-none"
                style={{ fontSize: 'clamp(12px, 3.2vw, 15px)', fontFamily: '"Google Sans", system-ui, sans-serif', fontWeight: 700 }}
              >
                {displayTitle}
              </h3>
              <div 
                className="text-neutral-500 leading-relaxed mt-2"
                style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontFamily: '"Google Sans", system-ui, sans-serif', fontWeight: 400 }}
              >
                {displayMessage}
              </div>
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
                {isLoading ? displayProcessing : displayConfirmLabel}
              </button>
              <button
                onClick={onClose}
                style={{ height: '38px', fontSize: 'clamp(11px, 2.5vw, 13px)', fontFamily: '"Google Sans", sans-serif', fontWeight: 500 }}
                className="w-full flex items-center justify-center text-neutral-500 hover:text-[#1F2937] transition-colors"
                type="button"
              >
                {displayCancelLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
