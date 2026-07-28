import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Calendar } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface SalaryOverviewSectionProps {
  salary: number;
  currency: string;
  onOpenBreakdown: () => void;
}

export const SalaryOverviewSection: React.FC<SalaryOverviewSectionProps> = ({
  salary,
  currency,
  onOpenBreakdown,
}) => {
  const { t } = useTranslation();

  return (
    <div 
      className="p-6 bg-white rounded-2xl border border-[#E1E8ED] shadow-sm flex items-center justify-between cursor-pointer hover:border-neutral-300 transition-all"
      onClick={() => {
        triggerHaptic(hapticPresets.medium);
        onOpenBreakdown();
      }}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#F0FDF4] flex items-center justify-center text-[#166534]">
          <Coins size={24} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#111C2D]">
            {t('salary_overview.title', 'Monthly Salary')}
          </h3>
          <p className="text-sm text-neutral-500">
            {t('salary_overview.subtitle', 'Click to manage your allocation')}
          </p>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xl font-bold text-[#111C2D]">
          {salary.toLocaleString()} {currency}
        </div>
        <div className="text-xs text-neutral-400 mt-1 flex items-center justify-end gap-1">
          <Calendar size={12} />
          {t('salary_overview.view_breakdown', 'View breakdown')}
        </div>
      </div>
    </div>
  );
};
