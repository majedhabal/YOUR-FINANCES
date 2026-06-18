import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
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

    allTransactions.forEach(tx => {
      if (tx.type !== 'expense' && tx.type !== 'Outflow') return;
      if (selectedAccIds.size > 0 && !selectedAccIds.has(tx.accountId)) return;

      const txDateStr = typeof tx.date === 'string' ? tx.date.substring(0, 10) : '';
      const matchDay = daysData.find(d => d.dateStr === txDateStr);
      
      if (matchDay) {
        const txAccount = accounts.find(a => a.id === tx.accountId);
        const txCurrency = txAccount?.currency || baseCurrency;
        
        let amountInAED = tx.amount || 0;
        if (txCurrency !== 'AED') {
          const rateToAED = getRateToAED(txCurrency);
          amountInAED = amountInAED * rateToAED;
        }

        const amountInBase = amountInAED / baseRateToAED;
        matchDay.amount += amountInBase;
      }
    });

    return daysData.map(d => ({
      name: d.label,
      spending: parseFloat(d.amount.toFixed(2))
    }));
  }, [allTransactions, selectedAccIds, accounts, baseCurrency, baseRateToAED, getRateToAED]);

  const totalPeriodBurn = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.spending, 0);
  }, [chartData]);

  return (
    <VantageDataErrorBoundary>
      <div 
        className="w-full p-5 flex flex-col gap-4 box-border transition-all duration-300"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          borderRadius: '24px',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        {/* SUMMARY INSIGHT ROW */}
        <div className="flex items-center justify-between select-none border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <TrendingDown size={16} />
            </div>
            <div className="flex flex-col">
              <h4 className="text-sm font-bold text-white m-0 tracking-tight lowercase">spending trends</h4>
              <span className="text-[10px] text-neutral-400 font-medium mt-0.5">Rolling 30-day allocation timeline</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <span className="text-sm font-mono font-bold text-white tracking-tight">
              {totalPeriodBurn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {baseCurrency}
            </span>
            <span className="text-[9px] font-mono tracking-widest text-neutral-500 uppercase mt-0.5">Aggregated burn</span>
          </div>
        </div>

        {/* VECTOR CHART AREA CANVAS */}
        <div className="w-full h-[220px] mt-2 relative overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="vantageBurnGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(244, 63, 94, 0.2)" />
                  <stop offset="95%" stopColor="rgba(244, 63, 94, 0)" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'system-ui' }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 9, fill: '#64748B', fontFamily: 'system-ui' }} 
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(30, 34, 41, 0.85)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px 0 rgba(0,0,0,0.3)',
                  padding: '8px 12px'
                }}
                labelStyle={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}
                itemStyle={{ fontSize: 11, fontWeight: 700, color: '#F43F5E' }}
                formatter={(value) => [`${Number(value).toLocaleString()} ${baseCurrency}`, 'Outflow']}
              />
              <Area 
                type="monotone" 
                dataKey="spending" 
                stroke="#F43F5E" 
                strokeWidth={2} 
                fill="url(#vantageBurnGradient)" 
                dot={false}
                activeDot={{ r: 4, stroke: '#1E2229', strokeWidth: 2, fill: '#F43F5E' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </VantageDataErrorBoundary>
  );
};