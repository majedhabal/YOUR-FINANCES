import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, X } from 'lucide-react';

interface FullMilestoneOverlayProps {
  reward: any;
  onClose: () => void;
}

export const FullMilestoneOverlay: React.FC<FullMilestoneOverlayProps> = ({ reward, onClose }) => {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-orange-500 flex flex-col items-center justify-center p-6 text-white"
      >
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <div className="text-8xl font-bold mb-4">{reward.streakThreshold}</div>
          <div className="text-3xl font-bold mb-6">Milestone Reached!</div>
          <div className="bg-white/20 p-6 rounded-2xl mb-8">
            <div className="text-xl font-bold">Reward Unlocked!</div>
            <div className="text-lg">{reward.title}</div>
          </div>
          <button 
            onClick={onClose} 
            className="px-8 py-3 bg-white text-orange-600 font-bold rounded-full hover:bg-orange-50"
          >
            Claim Reward
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
