import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Gift, Copy, Check, Sparkles, UserPlus, AlertCircle, Share2 } from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useTranslation } from 'react-i18next';

interface ReferralProgramViewProps {
  profile: any;
  onBack: () => void;
  onUpdateProfile: (updatedProfile: any) => void;
}

export const ReferralProgramView: React.FC<ReferralProgramViewProps> = ({
  profile,
  onBack,
  onUpdateProfile,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  // Generate a referral code if the user doesn't have one yet
  useEffect(() => {
    const ensureReferralCode = async () => {
      if (profile?.uid && !profile?.referralCode) {
        // Generate a 6-character random uppercase alphanumeric code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing characters like I, O, 1, 0
        let newCode = 'VNTG-';
        for (let i = 0; i < 4; i++) {
          newCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        try {
          const userRef = doc(db, 'users', profile.uid);
          await updateDoc(userRef, { referralCode: newCode });
          onUpdateProfile({ ...profile, referralCode: newCode });
        } catch (err) {
          console.error("Failed to auto-generate referral code:", err);
        }
      }
    };
    
    ensureReferralCode();
  }, [profile, onUpdateProfile]);

  // Calculate days remaining of unlocked Vantage AI
  useEffect(() => {
    if (profile?.vantageAiUnlockedUntil) {
      const expiry = new Date(profile.vantageAiUnlockedUntil).getTime();
      const diff = expiry - Date.now();
      if (diff > 0) {
        setDaysRemaining(Math.ceil(diff / (1000 * 60 * 60 * 24)));
      } else {
        setDaysRemaining(null);
      }
    } else {
      setDaysRemaining(null);
    }
  }, [profile?.vantageAiUnlockedUntil]);

  const handleCopyCode = () => {
    if (!profile?.referralCode) return;
    navigator.clipboard.writeText(profile.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareCode = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join YOUR FINANCES',
          text: `Join me on YOUR FINANCES! It's a great app for tracking your finances and achieving financial freedom. Use my referral code: ${profile?.referralCode}`,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing code:', err);
      }
    } else {
      handleCopyCode();
    }
  };

  const handleRedeemCode = async () => {
    const entered = referralInput.trim().toUpperCase();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!entered) {
      setErrorMsg(t('referral_program.enter_code_error'));
      return;
    }

    if (profile?.referralCode && profile.referralCode.toUpperCase() === entered) {
      setErrorMsg(t('referral_program.own_code_error'));
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Query Firestore for the referrer with this code
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('referralCode', '==', entered));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setErrorMsg(t('referral_program.invalid_code_error'));
        setIsSubmitting(false);
        return;
      }

      const referrerDoc = querySnapshot.docs[0];
      const referrerId = referrerDoc.id;
      const referrerData = referrerDoc.data();

      // 2. Update Referrer Profile: Extend Vantage AI unlock for 7 days + add 1000 tokens
      const referrerRef = doc(db, 'users', referrerId);
      const currentUnlocked = referrerData.vantageAiUnlockedUntil 
        ? new Date(referrerData.vantageAiUnlockedUntil).getTime() 
        : Date.now();
      
      const newUnlocked = Math.max(currentUnlocked, Date.now()) + (7 * 24 * 60 * 60 * 1000);
      const currentTokens = typeof referrerData.vantageAiTokens === 'number' ? referrerData.vantageAiTokens : 0;
      
      const isPaid = referrerData.subscriptionTier && referrerData.subscriptionTier.toLowerCase() !== 'free';
      const tokenReward = isPaid ? 1000 : 500;
      const nextTokens = currentTokens + tokenReward;

      await updateDoc(referrerRef, {
        vantageAiUnlockedUntil: new Date(newUnlocked).toISOString(),
        vantageAiTokens: nextTokens
      });

      // 3. Update Current User: Save referredBy code
      const currentUserRef = doc(db, 'users', profile.uid);
      await updateDoc(currentUserRef, {
        referredBy: entered
      });

      // Update local profile state
      onUpdateProfile({
        ...profile,
        referredBy: entered
      });

      setSuccessMsg(t('referral_program.redeem_success', { name: referrerData.displayName || referrerData.fullName || 'your friend' }));
      setReferralInput('');
    } catch (err: any) {
      console.error("Referral redemption error:", err);
      setErrorMsg(t('referral_program.process_error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-6 flex-1 flex flex-col gap-6 text-neutral-800" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Navigation Header */}
      <div className="flex items-center justify-between select-none pt-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={onBack}
            className="p-1.5 border border-[#E1E8ED] bg-[#F8F9FA] hover:bg-neutral-100 text-neutral-600 rounded-xl cursor-pointer transition-colors active:scale-95 flex items-center justify-center"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-[10px] sm:text-xs font-normal text-vantage-muted">{t('settings.referrals_rewards')}</span>
        </div>
      </div>

      {/* Hero Header Area */}
      <div className="flex flex-col gap-1.5 border-b border-neutral-100 pb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">{t('referral_program.title')}</h1>
        <p className="text-xs text-vantage-muted font-normal leading-relaxed">
          {t('referral_program.description')}
        </p>
      </div>

      {/* Promo Active Banner */}
      {daysRemaining !== null && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
          <Sparkles className="text-emerald-600 shrink-0 mt-0.5" size={18} />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-emerald-800">Referral Promotion Active</span>
            <span className="text-[11px] text-emerald-700 font-normal leading-relaxed">
              Vantage AI is premium-unlocked for you. You have {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining of complimentary intelligence logs!
            </span>
          </div>
        </div>
      )}

      {/* Main Referral Program Interface Card */}
      <div className="bg-white border border-neutral-100 rounded-3xl p-6 flex flex-col gap-6 shadow-sm">
        {/* Step 1: Your Code */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E9F5ED] text-[#366945] flex items-center justify-center">
              <Gift size={16} />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">{t('referral_program.your_unique_code')}</h3>
          </div>
          
          <p className="text-xs text-vantage-muted font-normal leading-relaxed">
            {t('referral_program.your_code_description')}
          </p>
          <p className="text-[10px] italic text-vantage-muted font-normal mt-1">
            {t('referral_program.paid_user_hint')}
          </p>

          <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-2xl p-3 mt-1.5">
            <span className="text-base font-bold text-neutral-800 font-mono flex-1 select-all pl-2">
              {profile?.referralCode || 'Generating code...'}
            </span>
            <button
              onClick={handleCopyCode}
              disabled={!profile?.referralCode}
              className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-800 rounded-xl text-xs font-bold text-neutral-700 hover:text-neutral-900 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-[#366945]" />
                  <span>{t('referral_program.copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>{t('referral_program.copy')}</span>
                </>
              )}
            </button>
            <button
              onClick={handleShareCode}
              disabled={!profile?.referralCode}
              className="px-4 py-2 bg-white border border-neutral-200 hover:border-neutral-800 rounded-xl text-xs font-bold text-neutral-700 hover:text-neutral-900 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Share2 size={14} />
              Share
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-neutral-100" />

        {/* Step 2: Redeem a Code */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#E9F5ED] text-[#366945] flex items-center justify-center">
              <UserPlus size={16} />
            </div>
            <h3 className="text-sm font-bold text-neutral-900">{t('referral_program.redeem_friend_code')}</h3>
          </div>

          <p className="text-xs text-vantage-muted font-normal leading-relaxed">
            {t('referral_program.redeem_description')}
          </p>

          {profile?.referredBy ? (
            <div className="p-3.5 bg-neutral-50 border border-neutral-100 rounded-2xl text-xs text-neutral-600 font-normal flex items-center gap-2">
              <Check size={14} className="text-[#366945] stroke-[3]" />
              <span>You have already been referred by code: </span>
              <strong className="font-bold text-neutral-800 font-mono bg-white px-2 py-0.5 border border-neutral-200 rounded-md">{profile.referredBy}</strong>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. VNTG-H3X8"
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-sm text-neutral-800 outline-none focus:bg-white focus:border-[#366945] placeholder:text-neutral-400 font-mono tracking-wider font-bold"
                />
                <button
                  onClick={handleRedeemCode}
                  disabled={isSubmitting || !referralInput.trim()}
                  className="px-5 py-2.5 bg-black hover:bg-neutral-900 text-[#00FF88] rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-30"
                >
                  {isSubmitting ? t('referral_program.redeeming') : t('referral_program.redeem_code')}
                </button>
              </div>

              {errorMsg && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 mt-1 pl-1">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex items-start gap-1.5 text-xs text-[#366945] mt-1 pl-1 leading-relaxed">
                  <Check size={14} className="shrink-0 mt-0.5 stroke-[3]" />
                  <span>{successMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
