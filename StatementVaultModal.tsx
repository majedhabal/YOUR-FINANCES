import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Lock, 
  Unlock, 
  FileText, 
  Calendar, 
  Eye, 
  EyeOff, 
  Download, 
  Sparkles, 
  Mail, 
  Loader2, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Info
} from 'lucide-react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import CryptoJS from 'crypto-js';
import { jsPDF } from 'jspdf';

interface StatementVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  profile: any;
}

export const StatementVaultModal: React.FC<StatementVaultModalProps> = ({
  isOpen,
  onClose,
  uid,
  profile
}) => {
  const [statements, setStatements] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatement, setSelectedStatement] = useState<any | null>(null);
  
  // Decryption States
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedData, setDecryptedData] = useState<any | null>(null);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  // Manual statement trigger
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !uid) return;
    fetchStatements();
  }, [isOpen, uid]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('statement-vault-toggled', { detail: { isOpen } }));
    return () => {
      window.dispatchEvent(new CustomEvent('statement-vault-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const fetchStatements = async () => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, 'users', uid, 'sentStatements'),
        orderBy('sentAt', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStatements(list);
    } catch (err) {
      console.error("Failed to fetch statements:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStatement = (stmt: any) => {
    setSelectedStatement(stmt);
    setPasswordInput('');
    setDecryptedData(null);
    setDecryptionError(null);
  };

  const handleDecrypt = () => {
    if (!passwordInput.trim() || !selectedStatement) return;
    setIsDecrypting(true);
    setDecryptionError(null);

    setTimeout(() => {
      try {
        const bytes = CryptoJS.AES.decrypt(selectedStatement.encryptedData, passwordInput.trim());
        const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedText) {
          throw new Error("Incorrect password");
        }
        
        const parsed = JSON.parse(decryptedText);
        setDecryptedData(parsed);
      } catch (err) {
        console.error("Decryption error:", err);
        setDecryptionError("Access Denied. Incorrect decryption key. Verify your first 3 letters of name and birth year.");
      } finally {
        setIsDecrypting(false);
      }
    }, 800);
  };

  const handleTriggerManualStatement = async () => {
    setIsGenerating(true);
    setGenerationSuccess(null);
    setGenerationError(null);
    try {
      const user = auth.currentUser;
      const idToken = await user?.getIdToken() || '';
      const response = await fetch('/api/reports/monthly-statement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'x-vantage-authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          month: new Date().toISOString().slice(0, 7), // current month
          forceSend: true
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to compile statement");
      }

      setGenerationSuccess("Statement generated, cryptographically locked, and saved to your Vault successfully!");
      fetchStatements();
    } catch (err: any) {
      setGenerationError(err.message || "An unexpected error occurred during statement compilation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadAsPdf = () => {
    if (!decryptedData) return;

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const leftMargin = 15;
      const pageWidth = 210;
      const rightMargin = pageWidth - leftMargin;
      let y = 20;

      // Header Banner
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text("YOUR FINANCES", leftMargin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(74, 85, 104);
      doc.text("Your Future Financial Freedom starts with YOUR FINANCES", leftMargin, y);
      y += 12;

      // Divider line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, y, rightMargin, y);
      y += 10;

      // Statement Metadata
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`Monthly Account Statement — ${decryptedData.month}`, leftMargin, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Recipient: ${decryptedData.fullName || profile?.fullName} (${decryptedData.email || profile?.email})`, leftMargin, y);
      y += 6;
      doc.text(`Generated At: ${new Date(decryptedData.generatedAt).toLocaleString()}`, leftMargin, y);
      y += 12;

      // Financial Summary
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Financial Ledger Summary", leftMargin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Total Monthly Inflow:  ${decryptedData.summary?.totalInflow?.toFixed(2)} AED`, leftMargin + 5, y);
      y += 5;
      doc.text(`Total Monthly Outflow: ${decryptedData.summary?.totalOutflow?.toFixed(2)} AED`, leftMargin + 5, y);
      y += 5;
      doc.text(`Net Monthly Cashflow:  ${decryptedData.summary?.netFlow?.toFixed(2)} AED`, leftMargin + 5, y);
      y += 12;

      // Accounts breakdown
      if (decryptedData.accounts && decryptedData.accounts.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Active Account Balances", leftMargin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        decryptedData.accounts.forEach((acc: any) => {
          if (y > 270) { doc.addPage(); y = 20; }
          doc.text(`• ${acc.name} (${acc.type}): ${acc.currentBalance?.toFixed(2)} ${acc.currency}`, leftMargin + 5, y);
          y += 5;
        });
        y += 8;
      }

      // Vantage AI Analysis
      if (decryptedData.aiAnalysis) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Vantage AI Strategic Advisory", leftMargin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const splitText = doc.splitTextToSize(decryptedData.aiAnalysis, printableWidth(leftMargin, rightMargin));
        splitText.forEach((line: string) => {
          if (y > 275) { doc.addPage(); y = 20; }
          doc.text(line, leftMargin + 5, y);
          y += 5.5;
        });
        y += 10;
      }

      // Transaction Ledger table
      if (decryptedData.transactions && decryptedData.transactions.length > 0) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text("Monthly Transaction Ledger", leftMargin, y);
        y += 8;

        // Table header
        doc.setFontSize(9);
        doc.text("Date", leftMargin + 5, y);
        doc.text("Description", leftMargin + 30, y);
        doc.text("Category", leftMargin + 110, y);
        doc.text("Amount (AED)", rightMargin - 5, y, { align: 'right' });
        y += 3;
        doc.line(leftMargin + 5, y, rightMargin, y);
        y += 6;

        doc.setFont("helvetica", "normal");
        decryptedData.transactions.forEach((t: any) => {
          if (y > 275) {
            doc.addPage();
            y = 20;
            doc.setFont("helvetica", "bold");
            doc.text("Monthly Transaction Ledger (Continued)", leftMargin, y);
            y += 8;
          }
          const isInflow = t.type === 'inflow' || t.type === 'income';
          doc.text(t.date || '', leftMargin + 5, y);
          
          // Truncate desc if long
          let desc = t.description || '';
          if (desc.length > 30) desc = desc.slice(0, 27) + '...';
          doc.text(desc, leftMargin + 30, y);
          
          doc.text(t.category || '', leftMargin + 110, y);
          doc.text(`${isInflow ? '+' : '-'}${Math.abs(t.amount).toFixed(2)}`, rightMargin - 5, y, { align: 'right' });
          y += 6;
        });
      }

      // Save PDF
      doc.save(`Vantage_Statement_${decryptedData.month}.pdf`);
    } catch (err) {
      console.error("PDF Export failed:", err);
      alert("PDF generation failed.");
    }
  };

  const printableWidth = (l: number, r: number) => r - l - 10;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          style={{ fontFamily: "'Google Sans', sans-serif" }}
          className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-neutral-100 bg-neutral-50/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#1E3A20]/10 flex items-center justify-center text-[#1E3A20]">
                <Lock size={18} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#1E293B] leading-none font-bold">Secure Statement Vault</h2>
                <p className="text-xs text-neutral-500 mt-1 font-normal">Encrypted monthly statements portfolio</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-neutral-150 text-neutral-400 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {selectedStatement ? (
              // Selected Statement - View or Decrypt state
              <div className="space-y-4">
                <button 
                  onClick={() => setSelectedStatement(null)}
                  className="text-xs font-bold text-[#1E3A20] hover:underline flex items-center gap-1 cursor-pointer font-bold"
                >
                  ← Back to statements list
                </button>

                {!decryptedData ? (
                  // Decryption Form
                  <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4 max-w-md mx-auto">
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600 border border-amber-100">
                        <Lock size={22} />
                      </div>
                      <h3 className="font-bold text-[#1E293B] font-bold">Document Encrypted</h3>
                      <p className="text-xs text-neutral-500 max-w-xs mx-auto font-normal">
                        This statement is protected with end-to-end AES-256 cryptographic locking.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-[#1E293B] font-bold">Enter Statement Password</label>
                      <div className="relative flex items-center">
                        <input 
                          type={showPassword ? "text" : "password"}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="e.g. majd1995"
                          className="w-full pl-3 pr-10 py-2 border border-neutral-200 rounded-xl text-sm bg-white font-normal"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 text-neutral-400 hover:text-neutral-600"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="flex items-start gap-1.5 p-2 bg-amber-50/50 rounded-lg border border-amber-100 mt-2">
                        <Info size={12} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-neutral-500 leading-normal font-normal">
                          Hint: First 3 letters of your name (lowercase) + birth year (e.g. if your name is Majd and birth year is 1995, key is <strong>majd1995</strong>).
                        </p>
                      </div>
                    </div>

                    {decryptionError && (
                      <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-700 rounded-xl border border-red-100 text-xs font-normal">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{decryptionError}</span>
                      </div>
                    )}

                    <button 
                      onClick={handleDecrypt}
                      disabled={isDecrypting || !passwordInput.trim()}
                      style={{ fontWeight: 700 }}
                      className="w-full py-2.5 bg-[#1E3A20] text-white rounded-xl text-sm font-bold hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {isDecrypting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Decrypting Vault...</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={16} />
                          <span>Unlock Statement</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  // Gorgeous Decrypted Statement Display
                  <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-6 select-text">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-[#1E3A20] bg-[#1E3A20]/10 px-2 py-0.5 rounded-full font-bold">
                          Decrypted Successfully
                        </span>
                        <h3 className="text-xl font-bold text-[#1E293B] font-bold">
                          Monthly Statement — {decryptedData.month}
                        </h3>
                        <p className="text-xs text-neutral-500 font-normal">
                          Compiled on {new Date(decryptedData.generatedAt).toLocaleString()}
                        </p>
                      </div>
                      
                      <button 
                        onClick={downloadAsPdf}
                        style={{ fontWeight: 700 }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#1E3A20] text-white rounded-xl text-xs font-bold hover:brightness-95 active:scale-95 transition-all cursor-pointer shadow-sm"
                      >
                        <Download size={14} />
                        <span>Download Statement PDF</span>
                      </button>
                    </div>

                    {/* Financial Summary Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                        <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
                          <TrendingUp size={14} className="text-emerald-500" />
                          <span className="text-[11px] font-normal">Total Inflow</span>
                        </div>
                        <span className="text-base font-bold text-slate-800 font-bold">
                          {decryptedData.summary?.totalInflow?.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                        </span>
                      </div>
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                        <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
                          <TrendingDown size={14} className="text-rose-500" />
                          <span className="text-[11px] font-normal">Total Outflow</span>
                        </div>
                        <span className="text-base font-bold text-slate-800 font-bold">
                          {decryptedData.summary?.totalOutflow?.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                        </span>
                      </div>
                      <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                        <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
                          <Sparkles size={14} className="text-[#1E3A20]" />
                          <span className="text-[11px] font-normal">Net Cashflow</span>
                        </div>
                        <span className={`text-base font-bold font-bold ${decryptedData.summary?.netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {decryptedData.summary?.netFlow?.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                        </span>
                      </div>
                    </div>

                    {/* Vantage AI Strategic Advisory */}
                    {decryptedData.aiAnalysis && (
                      <div className="p-4 bg-[#1E3A20]/5 rounded-xl border border-[#1E3A20]/15 space-y-2">
                        <div className="flex items-center gap-1.5 text-[#1E3A20]">
                          <Sparkles size={16} />
                          <span className="text-xs font-bold font-bold">Vantage AI Strategic Advisory</span>
                        </div>
                        <p className="text-xs text-neutral-700 leading-relaxed font-normal">
                          {decryptedData.aiAnalysis}
                        </p>
                      </div>
                    )}

                    {/* Accounts breakdown */}
                    {decryptedData.accounts && decryptedData.accounts.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-neutral-500">Ending Liquidity Status</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {decryptedData.accounts.map((acc: any, i: number) => (
                            <div key={i} className="flex justify-between items-center p-2.5 bg-white border border-neutral-200 rounded-xl text-xs">
                              <div className="min-w-0">
                                <p className="font-bold text-[#1E293B] truncate font-bold">{acc.name}</p>
                                <p className="text-[10px] text-neutral-400 capitalize font-normal">{acc.type}</p>
                              </div>
                              <span className="font-bold text-[#1E293B] font-bold ml-2">
                                {acc.currentBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 })} {acc.currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transaction Ledger Table */}
                    {decryptedData.transactions && decryptedData.transactions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-neutral-500">Transaction Ledger</h4>
                        <div className="border border-neutral-100 rounded-xl overflow-hidden divide-y divide-neutral-100 max-h-[250px] overflow-y-auto">
                          {decryptedData.transactions.map((t: any, i: number) => {
                            const isInflow = t.type === 'inflow' || t.type === 'income';
                            return (
                              <div key={i} className="flex justify-between items-center p-3 hover:bg-neutral-50/50 text-xs">
                                <div className="space-y-0.5 min-w-0">
                                  <p className="font-bold text-neutral-700 truncate font-bold">{t.description}</p>
                                  <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                                    <span className="font-normal">{t.date}</span>
                                    <span>•</span>
                                    <span className="font-normal">{t.category}</span>
                                  </div>
                                </div>
                                <span className={`font-bold font-bold ml-2 ${isInflow ? 'text-emerald-600' : 'text-slate-700'}`}>
                                  {isInflow ? '+' : '-'}{Math.abs(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // Statements List State
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                  <div className="space-y-1 text-center sm:text-left">
                    <h3 className="text-sm font-bold text-neutral-800 font-bold">Manual Statement Trigger</h3>
                    <p className="text-xs text-neutral-500 max-w-sm font-normal">
                      Instantly compile, cryptographically encrypt, and save your statement for the current month.
                    </p>
                  </div>
                  <button 
                    onClick={handleTriggerManualStatement}
                    disabled={isGenerating}
                    style={{ fontWeight: 700 }}
                    className="px-4 py-2 bg-[#1E3A20] text-white rounded-xl text-xs font-bold hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Compiling...</span>
                      </>
                    ) : (
                      <>
                        <FileText size={14} />
                        <span>Compile Statement Now</span>
                      </>
                    )}
                  </button>
                </div>

                {generationSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-850 rounded-xl border border-emerald-100 text-xs font-normal">
                    <AlertCircle size={14} className="text-emerald-600 shrink-0" />
                    <span>{generationSuccess}</span>
                  </div>
                )}

                {generationError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-800 rounded-xl border border-red-150 text-xs font-normal">
                    <AlertCircle size={14} className="text-red-600 shrink-0" />
                    <span>{generationError}</span>
                  </div>
                )}

                {isLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2">
                    <Loader2 size={24} className="text-[#1E3A20] animate-spin" />
                    <span className="text-xs text-neutral-400 font-normal">Querying database ledger...</span>
                  </div>
                ) : statements.length === 0 ? (
                  <div className="py-12 text-center max-w-sm mx-auto space-y-3">
                    <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto text-neutral-400 border border-neutral-200">
                      <FileText size={20} />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-neutral-800 font-bold">No Statements Compiled</h3>
                      <p className="text-xs text-neutral-500 font-normal">
                        Your Vault is empty. Turn on the automatic scheduler toggle in Settings or click compile above to generate a statement.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-neutral-400">Statement Archive</h4>
                    <div className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm divide-y divide-neutral-150">
                      {statements.map((stmt) => (
                        <div 
                          key={stmt.id}
                          onClick={() => handleSelectStatement(stmt)}
                          className="flex items-center justify-between p-4 hover:bg-neutral-50 active:bg-neutral-100 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-[#1E3A20]/5 rounded-xl flex items-center justify-center text-[#1E3A20] border border-neutral-150">
                              <FileText size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-neutral-800 group-hover:text-[#1E3A20] transition-colors font-bold">
                                Monthly Statement — {stmt.month}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                                <Calendar size={10} />
                                <span className="font-normal">Sent {stmt.sentAt ? new Date(stmt.sentAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                                {stmt.isTest && (
                                  <>
                                    <span>•</span>
                                    <span className="text-amber-600 bg-amber-50 px-1 rounded font-normal">Manual compile</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-bold text-neutral-400 group-hover:text-[#1E3A20] transition-colors font-bold">
                            <span>Lock secure</span>
                            <Lock size={12} className="text-neutral-400 group-hover:text-[#1E3A20] transition-colors" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
