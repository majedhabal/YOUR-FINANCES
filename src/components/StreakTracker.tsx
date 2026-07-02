import React from 'react';
import { Flame } from 'lucide-react';
import { motion } from 'motion/react';

interface StreakTrackerProps {
  streak: number;
  streakUpdated?: boolean;
}

export const StreakTracker: React.FC<StreakTrackerProps> = ({ streak, streakUpdated }) => {
  return (
    <motion.div 
      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF5E6] border border-[#FFD9A3]/50"
      animate={streakUpdated ? { scale: [1, 1.5, 1], rotate: [0, -10, 10, -10, 0] } : { scale: [1, 1.03, 1] }}
      transition={streakUpdated ? { duration: 0.5 } : { duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <Flame size={14} className="text-orange-500 fill-orange-500" />
      <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs text-neutral-800 font-normal">
        Streak:
      </span>
      <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-sm text-neutral-900 font-bold">
        {streak || 0}
      </span>
    </motion.div>
  );
};
