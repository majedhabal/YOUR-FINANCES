import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X } from 'lucide-react';

interface MilestoneRewardBannerProps {
  reward: any;
  onClose: () => void;
}

export const MilestoneRewardBanner: React.FC<MilestoneRewardBannerProps> = ({ reward, onClose }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-md bg-white border border-orange-200 rounded-2xl shadow-2xl p-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 rounded-full text-orange-600">
            <Gift size={20} />
          </div>
          <div>
            <div className="text-sm font-bold text-neutral-900">Milestone Reached!</div>
            <div className="text-xs text-neutral-600">Congratulations on all of your hard work, you have gotten a free {reward.title}</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600">
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
