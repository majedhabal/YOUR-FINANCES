import React, { useMemo } from 'react';
import { motion } from 'motion/react';

interface LoginHeatmapProps {
  userLogins: any[];
}

export const LoginHeatmap: React.FC<LoginHeatmapProps> = ({ userLogins }) => {
  const last30Days = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  }, []);

  const loginDates = useMemo(() => {
    const dates = new Set();
    userLogins.forEach(login => {
      const date = login.timestamp.toDate ? login.timestamp.toDate() : new Date(login.timestamp);
      dates.add(date.toISOString().split('T')[0]);
    });
    return dates;
  }, [userLogins]);

  return (
    <div className="bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-xs" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      <h3 className="text-sm font-bold text-neutral-900 mb-4">Login Activity (Last 30 Days)</h3>
      <div className="grid grid-cols-10 gap-2">
        {last30Days.map(date => {
          const isActive = loginDates.has(date);
          return (
            <motion.div
              key={date}
              className={`w-6 h-6 rounded-md ${isActive ? 'bg-orange-500' : 'bg-neutral-100'}`}
              title={date}
              whileHover={{ scale: 1.1 }}
            />
          );
        })}
      </div>
    </div>
  );
};
