import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, UploadCloud, Check, Loader2, Sparkles, AlertTriangle, ShieldCheck, CreditCard } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment, onSnapshot, query } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { PremiumModal } from './PremiumModal';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  profile: any;
  accounts: any[];
  onSuccess?: () => void;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  uid,
  profile,
  accounts = [],
  onSuccess
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Upgrade Modal triggers
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  // Parsed Results
  const [parsedData, setParsedData] = useState<{
    amount: number;
    merchant: string;
    date: string;
    category: string;
    subcategory: string;
    notes: string;
  } | null>(null);

  // Check user tier
  const tierClean = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const isPremium = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium';
  const hasAccess = isPremium || (profile?.receiptScans || 0) > 0;
  const showRestriction = !isPremium && (profile?.receiptScans || 0) === 0;

  // Reactively sync custom categories
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, `users/${uid}/custom_categories`));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCategories(list);
    });
    return () => unsubscribe();
  }, [uid]);

  // Handle active account list
  const activeAccounts = accounts.filter((acc: any) => !acc.isArchived);

  // Set default selected account on load
  useEffect(() => {
    if (activeAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(activeAccounts[0].id);
    }
  }, [activeAccounts, selectedAccount]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('receipt_scanner.image_only_error', 'Please upload an image file (PNG, JPG, or JPEG) only.'));
      return;
    }
    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setParsedData(null);
    setError(null);
    setSuccess(false);
  };

  // Convert image preview to base64 payload without data-uri prefix for API compatibility
  const getBase64DataAndType = () => {
    if (!imagePreview) return null;
    const parts = imagePreview.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const data = parts[1];
    return { data, mimeType: mime };
  };

  const handleAnalyze = async () => {
    if (!imagePreview) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      const currentTokens = typeof profile?.vantageAiTokens === 'number' ? profile.vantageAiTokens : 0;
      console.log('DEBUG [Scanner]:', { hasAccess, currentTokens });
      if (!hasAccess && currentTokens < 100) {
        throw new Error(t('receipt_scanner.insufficient_tokens', 'Insufficient Vantage AI tokens remaining. Receipt scanning requires 100 tokens. Please claim sandbox tokens or upgrade your subscription.'));
      }

      const payload = getBase64DataAndType();
      if (!payload) throw new Error(t('receipt_scanner.invalid_image_data', 'Invalid image file data.'));

      const user = auth.currentUser;
      if (!user) throw new Error(t('receipt_scanner.auth_required', 'Identity verification expired. Please re-login.'));

      const idToken = await user.getIdToken();

      const response = await fetch('/api/ai/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          image: {
            data: payload.data,
            mimeType: payload.mimeType
          }
        })
      });

      const text = await response.text();
      let resJson;
      try {
        resJson = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON. Response was:", text);
        throw new Error("Server returned invalid response (possibly HTML).");
      }

      if (!response.ok) {
        throw new Error(resJson.message || resJson.error || t('receipt_scanner.parse_error', 'Could not analyze receipt.'));
      }

      if (resJson.success && resJson.data) {
        const extracted = resJson.data;
        // Validate category / subcategory falls back safely
        let matchedCategory = extracted.category || 'Others';
        let matchedSubcategory = extracted.subcategory || 'General';

        // Check if extracted category exists in user categories list
        const catNames = categories.map(c => c.name.toLowerCase());
        const masterNames = MASTER_CATEGORIES.map(c => c.name.toLowerCase());

        if (catNames.includes(matchedCategory.toLowerCase())) {
          // Keep it
          const realCat = categories.find(c => c.name.toLowerCase() === matchedCategory.toLowerCase());
          matchedCategory = realCat.name;
        } else if (masterNames.includes(matchedCategory.toLowerCase())) {
          const realCat = MASTER_CATEGORIES.find(c => c.name.toLowerCase() === matchedCategory.toLowerCase());
          matchedCategory = realCat.name;
        } else {
          matchedCategory = 'Others';
          matchedSubcategory = 'Others';
        }

        setParsedData({
          amount: typeof extracted.amount === 'number' ? extracted.amount : parseFloat(extracted.amount) || 0,
          merchant: extracted.merchant || extracted.description || t('receipt_scanner.unknown_merchant', 'Unknown Merchant'),
          date: extracted.date || new Date().toISOString().split('T')[0],
          category: matchedCategory,
          subcategory: matchedSubcategory,
          notes: extracted.notes || extracted.summary || ''
        });

        // Decrement 100 tokens dynamically on successful scan
        if (profile?.uid) {
          const userRef = doc(db, 'users', profile.uid);
          const nextTokens = Math.max(0, currentTokens - 100);
          await updateDoc(userRef, { vantageAiTokens: nextTokens });
        }
      } else {
        throw new Error(t('receipt_scanner.parsing_failed', 'Gemini AI was unable to parse this receipt format.'));
      }
    } catch (err: any) {
      console.error('Scan Error:', err);
      setError(err.message || t('receipt_scanner.general_analysis_error', 'Vantage connection failed.'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!parsedData || !selectedAccount) return;
    setIsSaving(true);
    setError(null);

    try {
      const selectedAccObj = accounts.find(a => a.id === selectedAccount);
      const categoryEntry = categories.find(c => c.name === parsedData.category) || MASTER_CATEGORIES.find(c => c.name === parsedData.category);

      const transactionData = {
        amount: Number(parsedData.amount),
        notes: parsedData.notes.trim() || `Receipt: ${parsedData.merchant}`,
        category: parsedData.category,
        subcategory: parsedData.subcategory,
        emoji: categoryEntry?.emoji || '🛍️',
        accountId: selectedAccount,
        type: 'Outflow', // Expense receipts are standard outflow
        date: parsedData.date,
        createdAt: serverTimestamp(),
        status: 'confirmed',
        isRecurring: false,
        merchantName: parsedData.merchant,
        isOcrScanned: true
      };

      // Atomic Balance dual-write update
      await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);

      const accountRef = doc(db, 'users', uid, 'accounts', selectedAccount);
      await updateDoc(accountRef, {
        currentBalance: increment(-Number(parsedData.amount)),
        updatedAt: serverTimestamp()
      });

      // Decrement receipt scans if not premium
      if (!isPremium) {
        const userRef = doc(db, 'users', uid);
        await updateDoc(userRef, { receiptScans: increment(-1) });
      }

      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      }

      // Close modal gracefully after 1.5 seconds
      setTimeout(() => {
        handleReset();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || t('receipt_scanner.save_failed_error', 'Failed to record scanned ledger transaction.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="w-full max-w-lg bg-[#F8FAFC] rounded-3xl overflow-hidden shadow-2xl flex flex-col relative border border-neutral-100"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-neutral-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="text-[#1E3A20] w-5 h-5 animate-pulse" />
                <h3 className="text-lg font-bold text-[#111c2d]">{t('receipt_scanner.title', 'Vantage Receipt Scanner')}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 flex-1 overflow-y-auto max-h-[80vh]">
              {showRestriction ? (
                /* Tier Restricted Experience */
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
                    <ShieldCheck className="w-8 h-8 text-amber-600" />
                  </div>
                  <h4 className="text-lg font-bold text-neutral-800 mb-2">{t('receipt_scanner.locked_title', 'Strategic Intelligence Feature')}</h4>
                  <p className="text-sm font-normal text-neutral-500 mb-6 max-w-sm">
                    {t('receipt_scanner.locked_desc', 'Vantage receipt scanning and real-time ledger extraction is an exclusive capability reserved for Tier 2 (Elite AI Advisor) and Tier 3 (Vantage Command) command profiles.')}
                  </p>
                  
                  <div className="w-full bg-white rounded-2xl border border-neutral-100 p-4 mb-6 text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-4 h-4 text-[#1E3A20]" />
                      <span className="text-xs font-bold text-neutral-400 tracking-wide uppercase">{t('receipt_scanner.tier_pricing', 'UAE Standard Tariff')}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-neutral-50">
                      <span className="text-sm font-normal text-neutral-600">Tier 2: Elite AI Advisor</span>
                      <span className="text-sm font-bold text-neutral-800">24.99 AED / mo</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm font-normal text-neutral-600">Tier 3: Vantage Command</span>
                      <span className="text-sm font-bold text-neutral-800">49.99 AED / mo</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsPremiumModalOpen(true)}
                    className="w-full py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all shadow-md active:scale-98"
                  >
                    {t('receipt_scanner.upgrade_now', 'Upgrade vantage tier')}
                  </button>
                </div>
              ) : success ? (
                /* Success Feedback */
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
                    <Check size={32} strokeWidth={3} />
                  </div>
                  <h4 className="text-lg font-bold text-neutral-800 mb-2">{t('receipt_scanner.success_title', 'Ledger Synchronized')}</h4>
                  <p className="text-sm font-normal text-neutral-500">
                    {t('receipt_scanner.success_desc', 'Transaction committed and account balances recalculated successfully.')}
                  </p>
                </div>
              ) : parsedData ? (
                /* Verification Form for Parsed Results */
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 p-3 rounded-2xl text-xs flex items-center gap-2 mb-2">
                    <Sparkles size={16} className="text-emerald-600 shrink-0" />
                    <span>{t('receipt_scanner.ai_scanned', 'Receipt parsed using Vantage Core AI model. Please verify before committing.')}</span>
                  </div>

                  {/* Merchant Name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.merchant_label', 'Store / Merchant')}</label>
                    <input
                      type="text"
                      value={parsedData.merchant}
                      onChange={(e) => setParsedData({ ...parsedData, merchant: e.target.value })}
                      className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal"
                    />
                  </div>

                  {/* Amount */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.amount_label', 'Total Amount (AED)')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={parsedData.amount}
                      onChange={(e) => setParsedData({ ...parsedData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Date */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.date_label', 'Purchase Date')}</label>
                      <input
                        type="date"
                        value={parsedData.date}
                        onChange={(e) => setParsedData({ ...parsedData, date: e.target.value })}
                        className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal"
                      />
                    </div>

                    {/* Target Account selector */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.account_label', 'Charge Account')}</label>
                      <select
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                        className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal"
                      >
                        {activeAccounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({Number(acc.currentBalance).toFixed(2)} {acc.currency || 'AED'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Category Selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.category_label', 'Category')}</label>
                      <select
                        value={parsedData.category}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          const catObj = categories.find(c => c.name === newCat) || MASTER_CATEGORIES.find(c => c.name === newCat);
                          const defaultSub = catObj?.subcategories?.[0] || 'General';
                          setParsedData({ ...parsedData, category: newCat, subcategory: defaultSub });
                        }}
                        className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal"
                      >
                        {categories.map((c: any) => (
                          <option key={c.id || c.name} value={c.name}>{c.name}</option>
                        ))}
                        {categories.length === 0 && MASTER_CATEGORIES.map((c: any) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Subcategory selection */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.subcategory_label', 'Subcategory')}</label>
                      <select
                        value={parsedData.subcategory}
                        onChange={(e) => setParsedData({ ...parsedData, subcategory: e.target.value })}
                        className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal"
                      >
                        {(() => {
                          const catObj = categories.find(c => c.name === parsedData.category) || MASTER_CATEGORIES.find(c => c.name === parsedData.category);
                          const subs = catObj?.subcategories || ['General'];
                          return subs.map((sub: string) => (
                            <option key={sub} value={sub}>{sub}</option>
                          ));
                        })()}
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{t('receipt_scanner.notes_label', 'Extracted Notes')}</label>
                    <textarea
                      value={parsedData.notes}
                      onChange={(e) => setParsedData({ ...parsedData, notes: e.target.value })}
                      className="w-full p-3.5 bg-white border border-neutral-200 rounded-2xl text-neutral-800 text-sm focus:outline-none focus:border-neutral-400 font-normal resize-none h-20"
                      placeholder={t('receipt_scanner.notes_placeholder', 'Summary description of items bought')}
                    />
                  </div>

                  {error && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Bottom Action bars */}
                  <div className="flex gap-2.5 pt-4">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex-1 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-all"
                    >
                      {t('receipt_scanner.reset_button', 'Scan another')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTransaction}
                      disabled={isSaving}
                      className="flex-1 py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          <span>{t('receipt_scanner.saving', 'Recording ledger...')}</span>
                        </>
                      ) : (
                        <>
                          <Check size={18} />
                          <span>{t('receipt_scanner.save_button', 'Confirm & Sync')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* File Selection / Image Upload stage */
                <div className="space-y-4">
                  {/* File Upload drag area */}
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                      dragActive ? 'border-[#A6DDB1] bg-[#A6DDB1]/10' : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    {imagePreview ? (
                      <div className="w-full flex flex-col items-center">
                        <img
                          src={imagePreview}
                          alt="Receipt Preview"
                          className="max-h-48 object-contain rounded-2xl mb-4 border border-neutral-100"
                        />
                        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wide mb-1">
                          {selectedFile?.name || t('receipt_scanner.selected_file', 'Receipt Selected')}
                        </span>
                        <span className="text-xs text-neutral-500 font-normal">
                          {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center text-neutral-400 mb-3 border border-neutral-100">
                          <UploadCloud size={24} />
                        </div>
                        <h4 className="text-sm font-bold text-neutral-700 mb-1">{t('receipt_scanner.upload_title', 'Upload receipt image')}</h4>
                        <p className="text-xs text-neutral-400 max-w-xs leading-relaxed font-normal">
                          {t('receipt_scanner.upload_desc', 'Drag and drop your receipt image here, or tap to choose from your documents gallery.')}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Direct Camera triggers */}
                  {!imagePreview && (
                    <div className="flex flex-col gap-2">
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full py-3.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-800 font-bold rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-sm active:scale-98"
                      >
                        <Camera size={18} className="text-neutral-500" />
                        <span>{t('receipt_scanner.open_camera_btn', 'Take receipt photo')}</span>
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Analysis triggers */}
                  {imagePreview && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="flex-1 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-all"
                      >
                        {t('receipt_scanner.clear_btn', 'Clear')}
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="flex-1 py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>{t('receipt_scanner.analyzing', 'Extracting ledger...')}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={18} />
                            <span>{t('receipt_scanner.analyze_btn', 'Extract transaction')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Upgrade Premium Modal */}
      {isPremiumModalOpen && (
        <PremiumModal
          isOpen={isPremiumModalOpen}
          onClose={() => setIsPremiumModalOpen(false)}
          uid={uid}
          profile={profile}
          onSuccess={(updatedProfile) => {
            setIsPremiumModalOpen(false);
            if (profile && onSuccess) {
              // Trigger parent refresh
              onSuccess();
            }
          }}
        />
      )}
    </>
  );
};
