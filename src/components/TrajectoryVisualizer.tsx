import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Sparkles, 
  Plus, 
  X, 
  HelpCircle, 
  DollarSign, 
  Briefcase, 
  Home, 
  Car, 
  Check, 
  ChevronRight, 
  Info,
  Sliders,
  Calendar,
  Lock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

interface TrajectoryVisualizerProps {
  startingNetWorth: number;
  baseCurrency: string;
  monthlySalary: number;
}

// Custom milestone type
interface Milestone {
  id: string;
  title: string;
  description: string;
  impactYear: number;
  type: 'one_time_cost' | 'salary_boost' | 'expense_reduction';
  value: number; // AED cost or percentage boost or AED savings
  icon: any;
  enabled: boolean;
}

export const TrajectoryVisualizer: React.FC<TrajectoryVisualizerProps> = ({
  startingNetWorth,
  baseCurrency,
  monthlySalary
}) => {
  // Years horizon tab
  const [yearsHorizon, setYearsHorizon] = useState<5 | 10 | 20>(10);

  // User baseline override states
  const [customNetWorth, setCustomNetWorth] = useState<number | null>(null);
  
  // Default savings contribution: 20% of salary or AED 3,000 if salary is 0
  const defaultSavings = useMemo(() => {
    const calculated = Math.round(monthlySalary * 0.20);
    return calculated > 0 ? calculated : 3000;
  }, [monthlySalary]);

  const fallbackBaselineNetWorth = customNetWorth !== null ? customNetWorth : (startingNetWorth > 0 ? Math.round(startingNetWorth) : 25000);

  // Sliders/Variables
  const [monthlySavings, setMonthlySavings] = useState<number>(defaultSavings);
  const [investmentYield, setInvestmentYield] = useState<number>(7); // Moderate baseline 7%
  const [salaryHike, setSalaryHike] = useState<number>(3); // Moderate baseline 3%
  const [mortgageMilestone, setMortgageMilestone] = useState<number>(0); // Custom extra debt paydown

  // Custom milestones checklist
  const [milestones, setMilestones] = useState<Milestone[]>([
    {
      id: 'villa_downpayment',
      title: 'Family Villa Purchase',
      description: 'One-time down payment and fees in Year 5',
      impactYear: 5,
      type: 'one_time_cost',
      value: 150000,
      icon: Home,
      enabled: false
    },
    {
      id: 'career_promotion',
      title: 'Major Executive Promotion',
      description: 'Boost monthly savings by 25% starting in Year 3',
      impactYear: 3,
      type: 'salary_boost',
      value: 25,
      icon: Briefcase,
      enabled: false
    },
    {
      id: 'clear_car_loan',
      title: 'Clear Active Car Loan',
      description: 'Extra savings of 1,500 AED/month starting in Year 2',
      impactYear: 2,
      type: 'expense_reduction',
      value: 1500,
      icon: Car,
      enabled: false
    }
  ]);

  // Active scenario focus ('all' or specific)
  const [focusedScenario, setFocusedScenario] = useState<'all' | 'conservative' | 'realistic' | 'optimistic'>('all');

  const toggleMilestone = (id: string) => {
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
  };

  // Generate projections for each scenario
  const projectionData = useMemo(() => {
    const dataList = [];
    const months = yearsHorizon * 12;
    
    // Initial balances
    let balRealistic = fallbackBaselineNetWorth;
    let balOptimistic = fallbackBaselineNetWorth;
    let balConservative = fallbackBaselineNetWorth;

    // Monthly values (adjusted each year)
    let currentSavingsRealistic = monthlySavings;
    let currentSavingsOptimistic = monthlySavings;
    let currentSavingsConservative = monthlySavings;

    for (let m = 0; m <= months; m++) {
      const year = Math.floor(m / 12);
      const isStartOfYear = m > 0 && m % 12 === 0;

      // Apply annual salary hikes or changes
      if (isStartOfYear && year > 0) {
        currentSavingsRealistic = currentSavingsRealistic * (1 + salaryHike / 100);
        currentSavingsOptimistic = currentSavingsOptimistic * (1 + (salaryHike + 3) / 100);
        currentSavingsConservative = currentSavingsConservative * (1 + (salaryHike - 1.5) / 100);
      }

      // Check milestones at start of the month
      let milestoneOneTimeImpactRealistic = 0;
      let milestoneOneTimeImpactOptimistic = 0;
      let milestoneOneTimeImpactConservative = 0;

      milestones.forEach((milestone) => {
        if (milestone.enabled && m === (milestone.impactYear * 12)) {
          if (milestone.type === 'one_time_cost') {
            milestoneOneTimeImpactRealistic += milestone.value;
            milestoneOneTimeImpactOptimistic += milestone.value * 0.9; // Optimistic: cost might be slightly less
            milestoneOneTimeImpactConservative += milestone.value * 1.1; // Conservative: cost overrun
          } else if (milestone.type === 'salary_boost') {
            // Permanent boost
            currentSavingsRealistic = currentSavingsRealistic * (1 + milestone.value / 100);
            currentSavingsOptimistic = currentSavingsOptimistic * (1 + (milestone.value + 5) / 100);
            currentSavingsConservative = currentSavingsConservative * (1 + (milestone.value - 5) / 100);
          } else if (milestone.type === 'expense_reduction') {
            // Permanent flat addition
            currentSavingsRealistic += milestone.value;
            currentSavingsOptimistic += milestone.value * 1.2;
            currentSavingsConservative += milestone.value * 0.8;
          }
        }
      });

      // Simple monthly calculations
      if (m > 0) {
        // Appending monthly savings contribution + extra mortgage paydowns
        balRealistic += currentSavingsRealistic + mortgageMilestone;
        balOptimistic += (currentSavingsOptimistic + mortgageMilestone * 1.1);
        balConservative += (currentSavingsConservative + mortgageMilestone * 0.8);

        // Compounding yields
        const yieldRealistic = balRealistic * (investmentYield / 100 / 12);
        const yieldOptimistic = balOptimistic * ((investmentYield + 4) / 100 / 12);
        const yieldConservative = balConservative * ((investmentYield - 3.5) / 100 / 12);

        balRealistic += yieldRealistic;
        balOptimistic += yieldOptimistic;
        balConservative += yieldConservative;

        // Apply any milestone deduction
        balRealistic = Math.max(0, balRealistic - milestoneOneTimeImpactRealistic);
        balOptimistic = Math.max(0, balOptimistic - milestoneOneTimeImpactOptimistic);
        balConservative = Math.max(0, balConservative - milestoneOneTimeImpactConservative);
      }

      // Record key yearly or half-yearly data to keep chart clean and high-fidelity
      if (m % 3 === 0 || m === months) {
        const yearLabel = (m / 12).toFixed(1);
        dataList.push({
          month: m,
          label: `Yr ${yearLabel}`,
          Realistic: Math.round(balRealistic),
          Optimistic: Math.round(balOptimistic),
          Conservative: Math.round(balConservative),
        });
      }
    }
    return dataList;
  }, [yearsHorizon, fallbackBaselineNetWorth, monthlySavings, investmentYield, salaryHike, mortgageMilestone, milestones]);

  // Final values
  const finalRealistic = projectionData[projectionData.length - 1]?.Realistic || 0;
  const finalOptimistic = projectionData[projectionData.length - 1]?.Optimistic || 0;
  const finalConservative = projectionData[projectionData.length - 1]?.Conservative || 0;

  const multipleRealistic = (finalRealistic / fallbackBaselineNetWorth).toFixed(1);
  const multipleOptimistic = (finalOptimistic / fallbackBaselineNetWorth).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 bg-white border border-[#E1E8ED] rounded-2xl shadow-sm flex flex-col gap-6"
    >
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm font-bold text-black flex items-center gap-1.5">
              <TrendingUp size={15} className="text-[#A6DDB1]" /> Multi-Scenario Financial Trajectory Visualizer
            </span>
            <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-[10px] text-[#A6DDB1] px-2 py-0.5 bg-[#A6DDB1]/10 rounded-full font-medium">Premium Projections</span>
          </div>
          <p style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-500 text-xs mt-1">
            Simulate your long-term wealth trajectory with dynamic, multi-variable scenario models.
          </p>
        </div>

        {/* Time Horizon Toggles */}
        <div className="flex items-center bg-neutral-50 p-1 rounded-xl self-start md:self-auto border border-neutral-200/50">
          {([5, 10, 20] as const).map((y) => (
            <button
              key={`yrs-tab-${y}`}
              onClick={() => setYearsHorizon(y)}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                yearsHorizon === y 
                  ? 'bg-[#A6DDB1] text-black shadow-sm' 
                  : 'text-neutral-600 hover:text-black font-normal'
              }`}
            >
              {y} Years
            </button>
          ))}
        </div>
      </div>

      {/* Projections Visual Graphic Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Dynamic Input Panel Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-5 bg-neutral-50/50 p-4 rounded-2xl border border-neutral-100">
          <div className="flex items-center justify-between">
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-xs text-black font-bold flex items-center gap-1.5">
              <Sliders size={13} className="text-neutral-500" /> Adjust Projection Variables
            </span>
            <button 
              onClick={() => {
                setCustomNetWorth(null);
                setMonthlySavings(defaultSavings);
                setInvestmentYield(7);
                setSalaryHike(3);
                setMortgageMilestone(0);
                setMilestones(prev => prev.map(m => ({ ...m, enabled: false })));
              }}
              style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} 
              className="text-[10px] text-[#57606F] hover:text-black hover:underline"
            >
              Reset Variables
            </button>
          </div>

          {/* Starting Net Worth Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-600">Starting Net Worth ({baseCurrency})</span>
              <span className="font-bold font-mono text-black">{fallbackBaselineNetWorth.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={fallbackBaselineNetWorth}
                onChange={(e) => setCustomNetWorth(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }}
                className="w-full text-xs px-3 py-2 bg-white rounded-xl border border-neutral-200 focus:outline-none focus:border-[#A6DDB1]"
                placeholder="Initial capital amount"
              />
            </div>
          </div>

          {/* Variable: Monthly Savings Rate */}
          <div className="flex flex-col gap-1.5 border-t border-neutral-100/80 pt-3">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-600">Monthly Savings Contribution</span>
              <span className="font-bold font-mono text-black">{monthlySavings.toLocaleString()} {baseCurrency}</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(15000, monthlySavings * 3)}
              step="250"
              value={monthlySavings}
              onChange={(e) => setMonthlySavings(parseInt(e.target.value))}
              className="w-full accent-[#A6DDB1] h-1 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0</span>
              <span>{(Math.max(15000, monthlySavings * 3)).toLocaleString()}</span>
            </div>
          </div>

          {/* Variable: Annual Investment Compound Yield */}
          <div className="flex flex-col gap-1.5 border-t border-neutral-100/80 pt-3">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-600">Expected Annual Investment Yield</span>
              <span className="font-bold font-mono text-[#A6DDB1] bg-[#A6DDB1]/10 px-2 py-0.5 rounded-md">{investmentYield}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={investmentYield}
              onChange={(e) => setInvestmentYield(parseFloat(e.target.value))}
              className="w-full accent-[#A6DDB1] h-1 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0% (Cash/Safe)</span>
              <span>20% (Aggressive stocks)</span>
            </div>
          </div>

          {/* Variable: Annual Salary Increases */}
          <div className="flex flex-col gap-1.5 border-t border-neutral-100/80 pt-3">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-600">Expected Annual Salary Growth</span>
              <span className="font-bold font-mono text-black">{salaryHike}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={salaryHike}
              onChange={(e) => setSalaryHike(parseFloat(e.target.value))}
              className="w-full accent-[#A6DDB1] h-1 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0%</span>
              <span>15%</span>
            </div>
          </div>

          {/* Variable: Extra Mortgages/Debt Paydowns */}
          <div className="flex flex-col gap-1.5 border-t border-neutral-100/80 pt-3">
            <div className="flex justify-between items-center text-[11px]">
              <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-neutral-600">Monthly Debt Overpayment / Acceleration</span>
              <span className="font-bold font-mono text-[#ff3f34]">{mortgageMilestone.toLocaleString()} {baseCurrency}</span>
            </div>
            <input
              type="range"
              min="0"
              max="10000"
              step="200"
              value={mortgageMilestone}
              onChange={(e) => setMortgageMilestone(parseInt(e.target.value))}
              className="w-full accent-neutral-800 h-1 bg-neutral-200 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>0</span>
              <span>10,000</span>
            </div>
          </div>
        </div>

        {/* Projections Chart Graphic and Scenario Cards */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          
          {/* Legend and Scenario Toggles */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setFocusedScenario('all')}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                focusedScenario === 'all' 
                  ? 'bg-neutral-900 border-neutral-900 text-white' 
                  : 'bg-white border-neutral-200 text-neutral-600 hover:text-black font-normal'
              }`}
            >
              <span>Show All Scenarios</span>
            </button>
            <button
              onClick={() => setFocusedScenario('realistic')}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                focusedScenario === 'realistic'
                  ? 'bg-[#A6DDB1]/20 border-[#A6DDB1] text-black'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:text-black font-normal'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#A6DDB1]" />
              <span>Realistic Path (Moderate)</span>
            </button>
            <button
              onClick={() => setFocusedScenario('optimistic')}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                focusedScenario === 'optimistic'
                  ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-black font-bold'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:text-black font-normal'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
              <span>Optimistic Path (High Yield)</span>
            </button>
            <button
              onClick={() => setFocusedScenario('conservative')}
              style={{ fontFamily: "'Google Sans', sans-serif" }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                focusedScenario === 'conservative'
                  ? 'bg-neutral-100 border-neutral-300 text-black font-bold'
                  : 'bg-white border-neutral-200 text-neutral-600 hover:text-black font-normal'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
              <span>Conservative Path (Low Yield)</span>
            </button>
          </div>

          {/* Premium Curve Line/Area Chart */}
          <div className="h-[280px] w-full bg-neutral-50/20 rounded-2xl border border-neutral-100 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorRealistic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#A6DDB1" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#A6DDB1" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorOptimistic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="colorConservative" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#747D8C" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#747D8C" stopOpacity={0.01}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#747D8C' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: '#747D8C' }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white border border-[#E1E8ED] p-3 rounded-xl shadow-lg flex flex-col gap-1">
                          <span style={{ fontFamily: "'Google Sans', sans-serif'", fontWeight: 400 }} className="text-[10px] text-neutral-400">{payload[0].payload.label} Projection</span>
                          {payload.map((p: any) => (
                            <div key={`tut-${p.name}`} className="flex items-center justify-between gap-4 text-xs">
                              <span className="flex items-center gap-1.5 text-neutral-600 font-normal">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                                {p.name}
                              </span>
                              <span className="font-bold font-mono text-black">{p.value.toLocaleString()} {baseCurrency}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                
                {/* Active Areas depending on Focused Tab */}
                {(focusedScenario === 'all' || focusedScenario === 'conservative') && (
                  <Area 
                    type="monotone" 
                    dataKey="Conservative" 
                    name="Conservative Scenario"
                    stroke="#747D8C" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorConservative)" 
                  />
                )}
                {(focusedScenario === 'all' || focusedScenario === 'realistic') && (
                  <Area 
                    type="monotone" 
                    dataKey="Realistic" 
                    name="Realistic Scenario"
                    stroke="#A6DDB1" 
                    strokeWidth={focusedScenario.toLowerCase() === 'realistic' ? 3 : 2}
                    fillOpacity={1} 
                    fill="url(#colorRealistic)" 
                  />
                )}
                {(focusedScenario === 'all' || focusedScenario === 'optimistic') && (
                  <Area 
                    type="monotone" 
                    dataKey="Optimistic" 
                    name="Optimistic Scenario"
                    stroke="#D4AF37" 
                    strokeWidth={focusedScenario.toLowerCase() === 'optimistic' ? 3 : 2}
                    fillOpacity={1} 
                    fill="url(#colorOptimistic)" 
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Realistic Projection Box */}
            <div className="p-4 bg-white border border-neutral-100 rounded-2xl flex flex-col justify-between gap-1.5">
              <span className="text-[10px] font-bold text-[#57606F] leading-none">Realistic end sum</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-[#A6DDB1] font-mono">{finalRealistic.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-[#57606F] font-normal font-mono">{baseCurrency}</span>
              </div>
              <p className="text-[10.5px] text-neutral-500 font-normal mt-1">
                Expected multiplier of <strong className="text-black font-bold font-mono">{multipleRealistic}x</strong> over {yearsHorizon} years.
              </p>
            </div>

            {/* Optimistic Projection Box */}
            <div className="p-4 bg-white border border-neutral-100 rounded-2xl flex flex-col justify-between gap-1.5">
              <span className="text-[10px] font-bold text-neutral-500 leading-none">Optimistic end sum</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-[#D4AF37] font-mono">{finalOptimistic.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-[#57606F] font-normal font-mono">{baseCurrency}</span>
              </div>
              <p className="text-[10.5px] text-neutral-500 font-normal mt-1">
                Premium multi-growth of <strong className="text-black font-bold font-mono">{multipleOptimistic}x</strong> initial scale.
              </p>
            </div>

            {/* Conservative Projection Box */}
            <div className="p-4 bg-white border border-neutral-100 rounded-2xl flex flex-col justify-between gap-1.5">
              <span className="text-[10px] font-bold text-neutral-500 leading-none">Conservative secure sum</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-neutral-500 font-mono">{finalConservative.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] text-[#57606F] font-normal font-mono">{baseCurrency}</span>
              </div>
              <p className="text-[10.5px] text-neutral-500 font-normal mt-1">
                Worst-case secure net worth under heavy inflation pressures.
              </p>
            </div>

          </div>

          {/* Interactive Life Milestones Toggle Section */}
          <div className="flex flex-col gap-2.5 pt-3 border-t border-neutral-100">
            <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-xs text-black font-bold flex items-center gap-1.5">
              <Sparkles size={13} className="text-[#A6DDB1]" /> Interactive Life Milestone Injectors
            </span>
            <p className="text-neutral-500 text-[11px] font-normal leading-normal">
              Toggle specific financial life milestones and see how investment rates, down payments, or savings boosts shape your trajectory instantly in real-time.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
              {milestones.map((milestone) => {
                const IconComponent = milestone.icon;
                return (
                  <button
                    key={milestone.id}
                    onClick={() => toggleMilestone(milestone.id)}
                    className={`p-3 text-left rounded-xl border flex flex-col gap-2 cursor-pointer transition-all ${
                      milestone.enabled 
                        ? 'bg-neutral-900 border-neutral-900 text-white shadow-md' 
                        : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`p-1.5 rounded-lg ${milestone.enabled ? 'bg-white/10 text-[#A6DDB1]' : 'bg-neutral-100 text-neutral-500'}`}>
                        <IconComponent size={14} />
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        milestone.enabled 
                          ? 'border-[#A6DDB1] bg-[#A6DDB1] text-black' 
                          : 'border-neutral-300 bg-white'
                      }`}>
                        {milestone.enabled && <Check size={10} className="stroke-[3]" />}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold leading-snug">{milestone.title}</span>
                      <span className={`text-[9px] font-normal leading-normal ${milestone.enabled ? 'text-neutral-300' : 'text-neutral-500'}`}>
                        {milestone.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </motion.div>
  );
};
