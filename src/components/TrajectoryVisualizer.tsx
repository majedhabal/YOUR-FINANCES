import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Sparkles, Sliders, Calendar, Check, Shield } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface TrajectoryVisualizerProps {
  startingNetWorth: number;
  baseCurrency: string;
  monthlySalary: number;
}

export const TrajectoryVisualizer: React.FC<TrajectoryVisualizerProps> = ({
  startingNetWorth,
  baseCurrency,
  monthlySalary
}) => {
  const [yearsHorizon, setYearsHorizon] = useState<5 | 10 | 20>(10);
  const [annualGrowthRate, setAnnualGrowthRate] = useState<number>(7);

  const calculatedProjectionData = useMemo(() => {
    const dataPoints = [];
    let cumulativeWealth = startingNetWorth;
    const annualSavingsInput = monthlySalary * 12 * 0.35; // Standard 35% compound rule benchmark

    const currentYear = new Date().getFullYear();

    for (let year = 0; year <= yearsHorizon; year++) {
      dataPoints.push({
        label: `'${String(currentYear + year).substring(2)}`,
        wealth: Math.round(cumulativeWealth)
      });
      cumulativeWealth = (cumulativeWealth + annualSavingsInput) * (1 + annualGrowthRate / 100);
    }
    return dataPoints;
  }, [startingNetWorth, monthlySalary, yearsHorizon, annualGrowthRate]);

  return (
    <div 
      className="w-full p-5 flex flex-col gap-5 box-border transition-all duration-300"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        border: 'var(--glass-border)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-3 select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#A6DDB1]/10 border border-[#A6DDB1]/20 text-[#A6DDB1] flex items-center justify-center">
            <TrendingUp size={16} />
          </div>
          <div className="flex flex-col">
            <h4 className="text-sm font-bold text-white m-0 tracking-tight lowercase">runway trajectory</h4>
            <span className="text-[10px] text-neutral-400 font-medium mt-0.5">Predictive net worth compounding engine</span>
          </div>
        </div>

        {/* TIME CONTROLS BAR */}
        <div className="flex gap-1.5 p-1 bg-black/20 rounded-xl border border-white/5 self-start sm:self-auto">
          {([5, 10, 20] as const).map((horizon) => (
            <button
              key={horizon}
              onClick={() => setYearsHorizon(horizon)}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                yearsHorizon === horizon 
                  ? 'bg-[#A6DDB1] border-transparent text-[#1E2229]' 
                  : 'bg-transparent border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {horizon} years
            </button>
          ))}
        </div>
      </div>

      {/* CHART LAYER CONTAINER */}
      <div className="w-full h-[220px] relative overflow-hidden my-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={calculatedProjectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="vantageGrowthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgba(166, 221, 177, 0.25)" />
                <stop offset="95%" stopColor="rgba(166, 221, 177, 0)" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748B' }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(30, 34, 41, 0.85)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '8px 12px'
              }}
              labelStyle={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginBottom: '4px' }}
              itemStyle={{ fontSize: 11, fontWeight: 700, color: '#A6DDB1' }}
              formatter={(value) => [`${Number(value).toLocaleString()} ${baseCurrency}`, 'Net worth asset value']}
            />
            <Area type="monotone" dataKey="wealth" stroke="#A6DDB1" strokeWidth={2.5} fill="url(#vantageGrowthGradient)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* PARAMETER TUNING FOOTER ROW GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-3 select-none">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-wider text-neutral-400 pl-0.5">Compounding rate matrix ({annualGrowthRate}%)</span>
          <input 
            type="range" 
            min="1" 
            max="15" 
            value={annualGrowthRate} 
            onChange={(e) => setAnnualGrowthRate(Number(e.target.value))} 
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#A6DDB1]" 
          />
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-start gap-2.5">
          <Shield size={14} className="text-[#A6DDB1] shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-neutral-400 m-0">
            Calculations compound your net worth assuming an optimized baseline rate vector with a consistent monthly savings allocation rate.
          </p>
        </div>
      </div>
    </div>
  );
};