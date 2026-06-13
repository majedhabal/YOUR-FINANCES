import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Printer } from 'lucide-react';

interface PrivacyViewProps {
  onBack: () => void;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => {
  const handlePrint = () => {
    window.print();
  };

  const protocols = [
    {
      id: 'sec-1',
      title: '1. Ledger Sovereignty & Vault Storage',
      desc: 'All ledger indices, personal financial records, and manual account balances are persisted inside a secure, sandboxed Google Firebase Firestore cloud vault database. Access controls are regulated by strict user-level authorization rules. No third parties have access to your raw numeric balance profiles.'
    },
    {
      id: 'sec-2',
      title: '2. Cryptographic Telemetry Isolation',
      desc: 'Vantage AI operates under strict telemetry-free principles. We do not implement diagnostic trackers, tracking pixels, or user behavior analytics tools. Alert thresholds exists purely within your sandboxed profile. No background telemetry is shared with external advertising servers.'
    },
    {
      id: 'sec-3',
      title: '3. Self-Destruct Command & Data Purging',
      desc: 'In accordance with zero-knowledge data ownership standards, you may invoke the permanent "Self-Destruct Matrix" at any time from your settings menu. Activating this command dispatches bulk delete requests to wipe your cloud Firestore paths, immediately invalidates your authenticated active tokens, and purges all cookies, indexes, and cache from your browser.'
    },
    {
      id: 'sec-4',
      title: '4. Portability & Compliance Retention',
      desc: 'Compliance requires active ownership. You can request a complete structured JSON copy of your personal transactional ledger list, or print/export these privacy standards at any time for your offline compliance registers. We fully support standard offline storage policies and GDPR portability regulations.'
    },
    {
      id: 'sec-5',
      title: '5. AI & Generative Intelligence',
      desc: 'All generative intelligence, financial projections, conversational assistant transactions, and smart categorization are securely processed via proxy. Data is dispatched via server-side APIs to Google Gemini. Zero identifiers or user profiles are sent in plain requests, and we enforce a zero-cache policy on transient session logs.'
    },
    {
      id: 'sec-6',
      title: '6. Enhanced Integrations',
      desc: 'Sync tools for Google Calendar and Google Tasks operate under strict user-directed consent scopes. OAuth transport credentials and synchronized task attributes reside safely within secure client caches or sandboxed database variables. No secondary synchronization data is shared, sold, or distributed.'
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#FFFFFF] text-[#000000] flex flex-col pt-6 pb-24 print:p-0 print:bg-white print:text-black font-sans selection:bg-neutral-200"
    >
      {/* Top Controls Header */}
      <div className="w-full max-w-4xl mx-auto px-6 mb-8 flex items-center justify-between print:hidden">
        {/* Soft Obsidian back button style */}
        <button 
          id="privacy-back-btn"
          onClick={onBack}
          className="p-4 bg-neutral-950 text-white rounded-2xl border border-neutral-900 hover:bg-neutral-900 transition-all group active:scale-95 shadow-md flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft size={24} className="group-hover:translate-x-[-2px] transition-transform text-white" />
        </button>

        <div className="text-right">
          <span className="text-[10px] uppercase tracking-[0.3em] font-black text-neutral-500">Legal Agreement</span>
          <p className="text-[11px] uppercase tracking-wider font-extrabold text-neutral-800 font-mono mt-1">REV. 2026.05.22</p>
        </div>
      </div>

      {/* Centered Reading Pane for Desktop / Table layouts */}
      <main className="flex-1 w-full max-w-[800px] mx-auto px-6 sm:px-8 py-4 flex flex-col gap-8 print:p-0">
        
        {/* Title Block with high-density clamp typography */}
        <div className="border-b-2 border-black pb-6">
          <h1 
            style={{ fontSize: 'clamp(22px, 4.5vw, 36px)' }}
            className="font-black uppercase tracking-tight leading-none text-black mb-3"
            id="privacy-protocol-title"
          >
            Privacy Protocol
          </h1>
          <p 
            style={{ fontSize: 'clamp(11px, 3.2vw, 15px)' }}
            className="text-neutral-500 font-bold uppercase tracking-widest leading-relaxed"
          >
            System Security &amp; Data Minimization Standards
          </p>
        </div>

        {/* Lead paragraph */}
        <p 
          style={{ fontSize: 'clamp(12px, 3.2vw, 16px)' }}
          className="font-medium text-neutral-800 leading-relaxed max-w-prose"
        >
          Vantage AI is committed to an architectural paradigm prioritizing absolute user sovereignty, zero trackers, and cryptographic isolation. This document outlines our structural protocols regarding storage, intelligence resolution, and automatic API sync scopes.
        </p>

        {/* Dynamic protocol items with high density clamp system */}
        <div className="space-y-8 mt-4">
          {protocols.map((section) => (
            <article key={section.id} id={section.id} className="border-l-4 border-black pl-5 py-1">
              <h2 
                style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
                className="font-black uppercase tracking-tight text-black mb-3"
              >
                {section.title}
              </h2>
              <p 
                style={{ fontSize: 'clamp(11px, 3.2vw, 14px)' }}
                className="text-neutral-700 font-medium leading-relaxed font-sans"
              >
                {section.desc}
              </p>
            </article>
          ))}
        </div>

        {/* Protocol Metadata Information (High density / tactical layout) */}
        <div className="my-8 p-6 bg-neutral-100 hover:bg-neutral-50 border border-neutral-200 rounded-2xl select-none transition-colors">
          <div className="flex flex-col gap-1.5 break-words">
            <span className="text-[9px] text-neutral-400 uppercase font-mono tracking-widest">Active Client Session</span>
            <span className="text-[10px] text-neutral-550 border-b border-neutral-200 pb-2 mb-2 uppercase font-black tracking-wider text-neutral-700">Audit Reference</span>
            
            <div className="grid grid-cols-2 gap-4 text-[9px] font-mono text-neutral-500 uppercase">
              <div>
                <p className="font-bold text-neutral-400">Host Environment</p>
                <p className="text-neutral-800 mt-0.5">Vantage AI Vaults</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Port Authorization</p>
                <p className="text-neutral-800 mt-0.5">SSL Client Standard</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Ledger Compliance</p>
                <p className="text-[#065F46] mt-0.5 font-bold">Verified Compliant</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Audit Protocol Status</p>
                <p className="text-black mt-0.5">Operational</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Footer & print buttons */}
        <div className="border-t border-neutral-200 pt-8 mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 print:hidden">
          <div className="text-center sm:text-left">
            <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">End of Protocol Suite</p>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mt-0.5">Vantage AI Financial Engineering</p>
          </div>

          <button
            id="print-privacy-btn"
            onClick={handlePrint}
            className="px-6 py-4 bg-neutral-950 text-white font-black uppercase tracking-widest rounded-2xl border border-neutral-900 hover:bg-neutral-900 transition-all active:scale-95 flex items-center gap-3 shadow-md cursor-pointer text-xs"
          >
            <Printer size={16} />
            <span>Print Compliance Record</span>
          </button>
        </div>
      </main>
    </motion.div>
  );
};
