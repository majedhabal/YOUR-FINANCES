import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Printer, Mail, ShieldCheck } from 'lucide-react';

interface TermsViewProps {
  onBack: () => void;
  onAgree?: () => void;
  hasAlreadyAccepted?: boolean;
}

export const TermsView: React.FC<TermsViewProps> = ({ onBack, onAgree, hasAlreadyAccepted = false }) => {
  const handlePrint = () => {
    window.print();
  };

  const handleContactSupport = () => {
    window.location.href = `mailto:support@mevantage.ae?subject=Terms%20of%20Engagement%20Inquiry&body=Hello%20ME%20Vantage%2520Analytics%2520Team%2C%0A%0AI%20have%20a%20question%20regarding%20the%20Vantage%20AI%20Wallet%20Terms%20of%20Engagement.`;
  };

  const termsSections = [
    {
      id: 'term-1',
      title: '1. Acceptance of Terms',
      desc: 'By accessing Vantage AI Wallet (the "App"), operated by ME Vantage Analytics and Strategy, you agree to be bound by these Terms of Engagement. If you are using the App on behalf of a business entity (e.g., an Odoo consultancy), you represent that you have the authority to bind that entity to these terms.'
    },
    {
      id: 'term-2',
      title: '2. Premium Services & Subscriptions',
      bullets: [
        {
          head: 'Tiered Access',
          txt: 'Premium features, including Gemini AI Insights, Google Calendar Sync, and Google Tasks Integration, are reserved for paid subscribers.'
        },
        {
          head: 'Billing',
          txt: 'Subscriptions are managed via the Google Play Store/Apple App Store. Under UAE Consumer Protection Law, all fees are transparent and published before purchase.'
        },
        {
          head: 'Cancellation',
          txt: 'You may cancel at any time; however, access to Premium "Nodes" will terminate at the end of the current billing cycle.'
        }
      ]
    },
    {
      id: 'term-3',
      title: '3. AI-Augmented Financial Advice (Disclaimer)',
      bullets: [
        {
          head: 'Informational Purpose',
          txt: 'The Gemini AI integrations provide automated financial analysis and "Insights." This content is for informational purposes only and does not constitute professional financial, legal, or investment advice.'
        },
        {
          head: 'User Responsibility',
          txt: 'You are solely responsible for verifying the accuracy of any AI-generated suggestions before taking financial action. ME Vantage is not liable for financial losses resulting from AI-generated content or "Hallucinations".'
        }
      ]
    },
    {
      id: 'term-4',
      title: '4. Third-Party Integrations',
      bullets: [
        {
          head: 'Google Ecosystem',
          txt: 'The App utilizes Google APIs for authentication, calendar events, and task management. Your use is subject to Google’s Terms of Service in addition to these terms.'
        },
        {
          head: 'Currency Exchange',
          txt: 'Rates provided via ExchangeRate-API are mid-market rates and may differ from the "Buy/Sell" rates offered by your local UAE or Philippine banks.'
        }
      ]
    },
    {
      id: 'term-5',
      title: '5. Intellectual Property',
      bullets: [
        {
          head: 'The "Vantage" Brand',
          txt: 'All code, custom UI (including the Slim Obsidian and Emerald Green brand elements), and documentation are the exclusive property of ME Vantage Analytics and Strategy.'
        },
        {
          head: 'Usage Limits',
          txt: 'You may not reverse-engineer, scrape, or attempt to replicate the core logic of the Vantage ledger for commercial resale.'
        }
      ]
    },
    {
      id: 'term-6',
      title: '6. Limitation of Liability',
      desc: 'To the maximum extent permitted by UAE Law, ME Vantage shall not be liable for any indirect, incidental, or consequential damages, including loss of data or financial loss, arising from your use of the App or any service interruptions in the Firebase Blaze infrastructure.'
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#FFFFFF] text-[#000000] flex flex-col pt-6 pb-24 print:p-0 print:bg-white print:text-black font-sans selection:bg-neutral-100"
    >
      {/* Top Controls Header matching PrivacyView */}
      <div className="w-full max-w-4xl mx-auto px-6 mb-8 flex items-center justify-between print:hidden">
        <button 
          id="terms-back-btn"
          onClick={onBack}
          className="p-4 bg-neutral-950 text-white rounded-2xl border border-neutral-900 hover:bg-neutral-900 transition-all group active:scale-95 shadow-md flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft size={24} className="group-hover:translate-x-[-2px] transition-transform text-white" />
        </button>

        <div className="text-right">
          <span className="text-[10px] uppercase tracking-[0.3em] font-black text-neutral-500">Terms of Engagement</span>
          <p className="text-[11px] uppercase tracking-wider font-extrabold text-neutral-800 font-mono mt-1">EFFECTIVE: 2026.05.23</p>
        </div>
      </div>

      {/* Scrollable Reading Container with maximum width of 800px for desktop */}
      <main className="flex-1 w-full max-w-[800px] mx-auto px-6 sm:px-8 py-4 flex flex-col gap-8 print:p-0">
        
        {/* Title Block with high-density clamp typography */}
        <div className="border-b-2 border-black pb-6">
          <h1 
            style={{ fontSize: 'clamp(22px, 4.5vw, 36px)' }}
            className="font-black uppercase tracking-tight leading-none text-black mb-3"
            id="terms-protocol-title"
          >
            Terms of Engagement
          </h1>
          <p 
            style={{ fontSize: 'clamp(11px, 3.2vw, 15px)' }}
            className="text-neutral-500 font-bold uppercase tracking-widest leading-relaxed"
          >
            ME Vantage Analytics &amp; Strategy
          </p>
        </div>

        {/* Lead paragraph */}
        <p 
          style={{ fontSize: 'clamp(12px, 3.2vw, 16px)' }}
          className="font-medium text-neutral-800 leading-relaxed max-w-prose"
        >
          Please review the terms governing our financial ledger operations, generative intelligence advice nodes, and Google Cloud database systems carefully.
        </p>

        {/* Sections */}
        <div className="space-y-8 mt-4">
          {termsSections.map((section) => (
            <article key={section.id} id={section.id} className="border-l-4 border-black pl-5 py-1">
              <h2 
                style={{ fontSize: 'clamp(14px, 4.5vw, 20px)' }}
                className="font-black uppercase tracking-tight text-black mb-3"
              >
                {section.title}
              </h2>
              {section.desc && (
                <p 
                  style={{ fontSize: 'clamp(11px, 3.2vw, 14px)' }}
                  className="text-neutral-700 font-medium leading-relaxed font-sans"
                >
                  {section.desc}
                </p>
              )}
              {section.bullets && (
                <ul className="space-y-4 list-none pl-0 mt-3">
                  {section.bullets.map((b, bIdx) => (
                    <li key={bIdx} className="text-neutral-700">
                      <strong className="text-black uppercase text-xs font-black tracking-wide block mb-1">
                        &bull; {b.head}
                      </strong>
                      <p 
                        style={{ fontSize: 'clamp(11px, 3.2vw, 13.5px)' }}
                        className="font-medium leading-relaxed"
                      >
                        {b.txt}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        {/* Optional Action Agreement Checkbox within Terms view if not pre-accepted */}
        {onAgree && !hasAlreadyAccepted && (
          <div className="my-6 p-6 bg-neutral-50 border border-neutral-200 rounded-2xl flex flex-col gap-4 print:hidden">
            <h4 className="text-xs font-black uppercase tracking-widest text-neutral-800">Affidavit Acceptance</h4>
            <p className="text-[11px] text-neutral-500 font-bold leading-relaxed">
              Acceptance of these terms registers a cryptographic signature matching your sandboxed identity inside our secure databases.
            </p>
            <button
              onClick={onAgree}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.2em] rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <ShieldCheck size={16} />
              <span>Agree and Sign Terms</span>
            </button>
          </div>
        )}

        {/* Protocol Metadata (High density / tactical layout) */}
        <div className="my-4 p-6 bg-neutral-150 hover:bg-neutral-100 border border-neutral-200 rounded-2xl select-none transition-colors">
          <div className="flex flex-col gap-1.5 break-words">
            <span className="text-[9px] text-neutral-400 uppercase font-mono tracking-widest">Client Jurisdiction Profile</span>
            <span className="text-[10px] text-neutral-550 border-b border-neutral-200 pb-2 mb-2 uppercase font-black tracking-wider text-neutral-700">Audit Reference</span>
            
            <div className="grid grid-cols-2 gap-4 text-[9px] font-mono text-neutral-500 uppercase">
              <div>
                <p className="font-bold text-neutral-400">Governance</p>
                <p className="text-neutral-800 mt-0.5">UAE Consumer Protection</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Infrastructure Base</p>
                <p className="text-neutral-800 mt-0.5">Firebase Blaze Nodes</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Consultancy Sync</p>
                <p className="text-neutral-800 mt-0.5">Odoo Compliant Port</p>
              </div>
              <div>
                <p className="font-bold text-neutral-400">Acceptance Status</p>
                <p className={hasAlreadyAccepted ? "text-[#065F46] mt-0.5 font-bold" : "text-amber-600 mt-0.5 font-bold"}>
                  {hasAlreadyAccepted ? "Electronically Signed" : "Pending Agreement"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Footer & Action Buttons list */}
        <div className="border-t border-neutral-200 pt-8 mt-6 flex flex-col sm:flex-row items-center justify-between gap-6 print:hidden">
          <div className="text-center sm:text-left">
            <p className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest">End of Engagement Protocol</p>
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mt-0.5">ME Vantage Analytics and Strategy</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              id="contact-support-btn"
              onClick={handleContactSupport}
              className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-extrabold uppercase tracking-widest rounded-2xl border border-neutral-200 transition-all active:scale-95 flex items-center gap-2 cursor-pointer text-xs"
            >
              <Mail size={16} />
              <span>Contact Support</span>
            </button>

            <button
              id="print-terms-btn"
              onClick={handlePrint}
              className="px-5 py-4 bg-neutral-904 text-white hover:bg-neutral-850 font-black uppercase tracking-widest rounded-2xl border border-neutral-900 transition-all active:scale-95 flex items-center gap-2 cursor-pointer text-xs shadow-sm"
            >
              <Printer size={16} />
              <span>Print Terms</span>
            </button>
          </div>
        </div>
      </main>
    </motion.div>
  );
};
