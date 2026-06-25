import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PrivacyViewProps {
  onBack: () => void;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const handlePrint = () => {
    window.print();
  };

  const protocols = [
    {
      id: 'sec-1',
      title: t('privacy_view.protocols.sec_1.title'),
      desc: t('privacy_view.protocols.sec_1.desc')
    },
    {
      id: 'sec-2',
      title: t('privacy_view.protocols.sec_2.title'),
      desc: t('privacy_view.protocols.sec_2.desc')
    },
    {
      id: 'sec-3',
      title: t('privacy_view.protocols.sec_3.title'),
      desc: t('privacy_view.protocols.sec_3.desc')
    },
    {
      id: 'sec-4',
      title: t('privacy_view.protocols.sec_4.title'),
      desc: t('privacy_view.protocols.sec_4.desc')
    },
    {
      id: 'sec-5',
      title: t('privacy_view.protocols.sec_5.title'),
      desc: t('privacy_view.protocols.sec_5.desc')
    },
    {
      id: 'sec-6',
      title: t('privacy_view.protocols.sec_6.title'),
      desc: t('privacy_view.protocols.sec_6.desc')
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
          <span className="text-[10px] tracking-[0.3em] font-normal text-neutral-500">{t('privacy_view.legal_agreement')}</span>
          <p className="text-[11px] tracking-wider font-extrabold text-neutral-800 font-mono mt-1">{t('privacy_view.rev_date')}</p>
        </div>
      </div>

      {/* Centered Reading Pane for Desktop / Table layouts */}
      <main className="flex-1 w-full max-w-[800px] mx-auto px-6 sm:px-8 py-4 flex flex-col gap-8 print:p-0">
        
        {/* Title Block with high-density clamp typography */}
        <div className="border-b-2 border-black pb-6">
          <h1 
            style={{ fontSize: 'clamp(22px, 4.5vw, 36px)' }}
            className="font-black tracking-tight leading-none text-black mb-3"
            id="privacy-protocol-title"
          >
            {t('privacy_view.title')}
          </h1>
          <p 
            style={{ fontSize: 'clamp(11px, 3.2vw, 15px)' }}
            className="text-neutral-500 font-bold tracking-widest leading-relaxed"
          >
            {t('privacy_view.subtitle')}
          </p>
        </div>

        {/* Lead paragraph */}
        <p 
          style={{ fontSize: 'clamp(12px, 3.2vw, 16px)' }}
          className="font-medium text-neutral-800 leading-relaxed max-w-prose"
        >
          {t('privacy_view.lead_paragraph')}
        </p>

        {/* Dynamic protocol items with high density clamp system */}
        <div className="space-y-8 mt-4">
          {protocols.map((section) => (
            <article key={section.id} id={section.id} className="border-l-4 border-black pl-5 py-1">
              <h2 
                style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
                className="font-black tracking-tight text-black mb-3"
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
            <span className="text-[9px] text-neutral-400 font-mono tracking-widest">{t('privacy_view.metadata.active_session')}</span>
            <span className="text-[10px] text-neutral-550 border-b border-neutral-200 pb-2 mb-2 font-black tracking-wider text-neutral-700">{t('privacy_view.metadata.audit_reference')}</span>
            
            <div className="grid grid-cols-2 gap-4 text-[9px] font-mono text-neutral-500">
              <div>
                <p className="font-bold text-neutral-400">{t('privacy_view.metadata.host_env')}</p>
                <p className="text-neutral-800 mt-0.5">{t('privacy_view.metadata.vantage_vaults')}</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">{t('privacy_view.metadata.port_auth')}</p>
                <p className="text-neutral-800 mt-0.5">{t('privacy_view.metadata.ssl_standard')}</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">{t('privacy_view.metadata.ledger_compliance')}</p>
                <p className="text-[#065F46] mt-0.5 font-bold">{t('privacy_view.metadata.verified')}</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">{t('privacy_view.metadata.audit_status')}</p>
                <p className="text-black mt-0.5">{t('privacy_view.metadata.operational')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Footer & print buttons */}
        <div className="border-t border-neutral-200 pt-8 mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 print:hidden">
          <div className="text-center sm:text-left">
            <p className="text-[9px] font-mono text-neutral-400 tracking-widest">{t('privacy_view.footer.end_suite')}</p>
            <p className="text-[10px] font-bold text-neutral-500 tracking-wider mt-0.5">{t('privacy_view.footer.vantage_ai')}</p>
          </div>

          <button
            id="print-privacy-btn"
            onClick={handlePrint}
            className="px-6 py-4 bg-neutral-950 text-white font-black tracking-widest rounded-2xl border border-neutral-900 hover:bg-neutral-900 transition-all active:scale-95 flex items-center gap-3 shadow-md cursor-pointer text-xs"
          >
            <Printer size={16} />
            <span>{t('privacy_view.footer.print_record')}</span>
          </button>
        </div>
      </main>
    </motion.div>
  );
};
