import React, { useState } from 'react';
import { Flame, X, ChevronLeft, ChevronRight, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { REWARDS } from '../lib/badgeUtils';

interface StreakTrackerProps {
  profile: any;
  streakUpdated?: boolean;
  userLogins: any[];
}

export const StreakTracker: React.FC<StreakTrackerProps> = ({ profile, streakUpdated, userLogins }) => {
  const streak = profile?.dailyStreak || 0;
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate real streak
  const toLocalDateString = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const loginDateStrings = new Set(
    userLogins.map(login => {
      const loginDate = login.timestamp.toDate ? login.timestamp.toDate() : new Date(login.timestamp);
      return toLocalDateString(loginDate);
    })
  );

  const rewardMap = new Map();
  (profile.rewardHistory || []).forEach((r: any) => rewardMap.set(r.dateClaimed, r.id));

  // Upcoming rewards
  const upcomingRewardMap = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  REWARDS.forEach(reward => {
    if (streak < reward.streakThreshold) {
      const daysUntil = reward.streakThreshold - streak;
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntil);
      upcomingRewardMap.set(toLocalDateString(targetDate), reward.id);
    }
  });

  let calculatedStreak = 0;
  let checkDate = new Date();
  
  // If not logged in today, start checking from yesterday
  if (!loginDateStrings.has(toLocalDateString(checkDate))) {
      checkDate.setDate(checkDate.getDate() - 1);
  }

  while (loginDateStrings.has(toLocalDateString(checkDate))) {
      calculatedStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0-6 (Sun-Sat)

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  return (
    <div className="relative">
      <motion.div 
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF5E6] border border-[#FFD9A3]/50 cursor-pointer"
        onClick={() => setIsCalendarOpen(!isCalendarOpen)}
        animate={streakUpdated ? { scale: [1, 1.8, 1], rotate: [0, -15, 15, -15, 0] } : { scale: [1, 1.1, 1] }}
        transition={streakUpdated ? { duration: 0.25 } : { duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
      >
        <Flame size={14} className="text-orange-500 fill-orange-500" />
        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-xs text-neutral-800 font-normal">
          Streak:
        </span>
        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-sm text-neutral-900 font-bold">
          {profile?.dailyStreak || 0}
        </span>
      </motion.div>

      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-12 right-0 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl z-[60] p-4"
          >
            <div className="flex justify-between items-center mb-4">
              <button onClick={goToPrevMonth}><ChevronLeft size={16} /></button>
              <span className="font-bold text-sm">{monthName}</span>
              <button onClick={goToNextMonth}><ChevronRight size={16} /></button>
              <button onClick={() => setIsCalendarOpen(false)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-[10px] text-neutral-400 text-center">{day}</div>
              ))}
              {paddingDays.map((_, i) => <div key={`padding-${i}`} />)}
              {days.map((day) => {
                const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isActive = loginDateStrings.has(dateString);
                const isPast = new Date(year, month, day) < today;
                const isSkipped = isPast && !isActive;
                const rewardId = rewardMap.get(dateString);
                const upcomingRewardId = upcomingRewardMap.get(dateString);

                return (
                  <div 
                    key={day} 
                    className={`w-7 h-7 flex flex-col items-center justify-center text-xs rounded-full relative ${isActive ? 'bg-orange-500 text-white font-bold' : isSkipped ? 'bg-red-100 text-red-500 font-bold' : 'bg-neutral-100'}`}
                  >
                    {rewardId && <Gift size={10} className="absolute -top-1 -right-1 text-yellow-500" />}
                    {upcomingRewardId && !rewardId && <Gift size={12} className="absolute -top-1 -right-1 text-yellow-500 opacity-70" />}
                    <span>{day}</span>
                    {isSkipped && <span className="text-[8px] leading-none">X</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-100 flex justify-between items-center text-xs text-neutral-600" style={{ fontFamily: "'Google Sans', sans-serif" }}>
              <span>Streak Freezes</span>
              <div className="flex gap-1">
                {Array.from({ length: profile?.streakFreezes || 0 }).map((_, i) => (
                  <img key={i} src="/badges/Streak Freeze No BG.png" alt="Streak Freeze" className="w-5 h-5" />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
