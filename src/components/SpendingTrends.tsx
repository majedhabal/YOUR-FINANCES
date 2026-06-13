import React, { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { TrendingDown, Activity, Calendar } from 'lucide-react';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';

interface SpendingTrendsProps {
  allTransactions: any[];
  selectedAccIds: Set<string>;
  accounts: any[];
  baseCurrency: string;
  getRateToAED: (curr: string) => number;
}

export const SpendingTrends: React.FC<SpendingTrendsProps> = ({
  allTransactions,
  selectedAccIds,
  accounts,
  baseCurrency,
  getRateToAED
}) => {
  const baseRateToAED = getRateToAED(baseCurrency);

  const chartData = useMemo(() => {
    // Generate the last 30 days
    const daysData: { dateStr: string; label: string; amount: number }[] = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      daysData.push({ dateStr, label, amount: 0 });
    }

    // Filter relevant realized expense transactions
    const expenseTransactions = allTransactions.filter(tx => {
      // Exclude non-confirmed transactions
      if (
        tx.status === 'draft' || 
        tx.status === 'scheduled' || 
        tx.status === 'pending' || 
        tx.status === 'upcoming' || 
        tx.isUpcomingSalaryAllocation || 
        (tx as any).interval !== undefined
      ) {
        return false;
      }

      // Check account selection
      const isAccSelected = selectedAccIds.has(tx.accountId) || 
        (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      // Check type is expense
      if (tx.type !== 'expense') return false;

      return true;
    });

    // Accumulate transaction amounts on their matching date
    expenseTransactions.forEach(tx => {
      if (!tx.date) return;
      
      // Normalize transaction date
      const txDateObj = new Date(tx.date);
      const yyyy = txDateObj.getFullYear();
      const mm = String(txDateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(txDateObj.getDate()).padStart(2, '0');
      const txDateStr = `${yyyy}-${mm}-${dd}`;

      const amtRaw = Number(tx.amount || 0);
      const rate = getRateToAED(tx.currency);
      const amtInAED = amtRaw * rate;
      const amtInBase = amtInAED / baseRateToAED;

      const matchedDay = daysData.find(d => d.dateStr === txDateStr);
      if (matchedDay) {
        matchedDay.amount += amtInBase;
      }
    });

    return daysData.map(day => ({
      name: day.label,
      spending: Math.round(day.amount * 100) / 100
    }));
  }, [allTransactions, selectedAccIds, baseCurrency, getRateToAED, baseRateToAED]);

  // Statistical calculations
  const stats = useMemo(() => {
    let total = 0;
    let peak = 0;
    let activeDaysCount = 0;

    chartData.forEach(day => {
      total += day.spending;
      if (day.spending > peak) {
        peak = day.spending;
      }
      if (day.spending > 0) {
        activeDaysCount++;
      }
    });

    const average = total / 30;

    return {
      total: Math.round(total * 100) / 100,
      average: Math.round(average * 100) / 100,
      peak: Math.round(peak * 100) / 100,
      activeDaysCount
    };
  }, [chartData]);

  // Format currency value cleanly
  const formatValue = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  return (
    <div 
      className="p-5 bg-[#FFFFFF] border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col gap-4 w-full"
      style={{ fontFamily: "'Google Sans', sans-serif" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-[#1E2229] tracking-tight flex items-center gap-1.5">
            <TrendingDown size={16} className="text-[#ec5c5c] shrink-0" />
            Spending trends
          </span>
          <span className="text-[11px] font-normal text-neutral-500 tracking-normal antialiased">
            Daily outflows over the last 30 days
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-normal text-neutral-400 bg-neutral-50 px-2.5 py-1 rounded-full border border-[#E1E8ED]/40">
          <Calendar size={11} />
          <span>Last 30d relative to current session</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 py-1 bg-neutral-50/50 rounded-xl p-2.5 border border-[#E1E8ED]/30">
        <div className="flex flex-col">
          <span className="text-[10px] font-normal text-neutral-500">Total spending</span>
          <span className="text-[14px] font-bold text-neutral-900 tracking-tight">
            {formatValue(stats.total)} <span className="text-[9px] font-normal text-neutral-400">{baseCurrency}</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-normal text-[#ec5c5c]">Daily average</span>
          <span className="text-[14px] font-bold text-[#ec5c5c] tracking-tight text-red-500">
            {formatValue(stats.average)} <span className="text-[9px] font-normal text-red-400">{baseCurrency}</span>
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-normal text-neutral-500">Peak single day</span>
          <span className="text-[14px] font-bold text-neutral-900 tracking-tight">
            {formatValue(stats.peak)} <span className="text-[9px] font-normal text-neutral-400">{baseCurrency}</span>
          </span>
        </div>
      </div>

      <div className="h-[180px] w-full mt-1.5">
        <VantageDataErrorBoundary>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ec5c5c" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#ec5c5c" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: '9px', fill: '#8A94A6', fontFamily: "'Google Sans', sans-serif" }}
                interval={4}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: '9px', fill: '#8A94A6', fontFamily: "'Google Sans', sans-serif" }}
              />
              <Tooltip 
                contentStyle={{ 
                  background: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid #E1E8ED',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                  fontFamily: "'Google Sans', sans-serif",
                  fontSize: '11px',
                  padding: '8px 12px'
                }}
                formatter={(value: any) => [
                  <span className="font-bold text-neutral-900">{formatValue(Number(value))} {baseCurrency}</span>,
                  <span className="text-neutral-400 font-normal">Outflow</span>
                ]}
                labelStyle={{ fontWeight: 500, color: '#57606F', marginBottom: '2px' }}
              />
              <Area 
                type="monotone" 
                dataKey="spending" 
                name="Spending" 
                stroke="#ec5c5c" 
                strokeWidth={2} 
                fill="url(#spendingGradient)" 
                dot={false}
                activeDot={{ r: 4, stroke: '#FFFFFF', strokeWidth: 2, fill: '#ec5c5c' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </VantageDataErrorBoundary>
      </div>
    </div>
  );
};
