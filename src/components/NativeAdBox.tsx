import React, { useEffect, useRef } from 'react';

interface NativeAdBoxProps {
  adSlot: string;
  className?: string;
  profile?: any;
}

export const NativeAdBox: React.FC<NativeAdBoxProps> = ({ adSlot, className = '', profile }) => {
  const adPushedRef = useRef(false);

  const subTier = profile?.subscriptionTier;
  const isPremium = subTier && ['tier 1', 'tier 2', 'tier 3', 'premium'].includes(subTier.toString().toLowerCase());

  useEffect(() => {
    // Prevent double-pushing ads on re-renders / strict mode mounts
    if (adPushedRef.current || isPremium) return;

    try {
      if (typeof window !== 'undefined') {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
        adPushedRef.current = true;
      }
    } catch (err) {
      console.error("Ad slot initialization error:", err);
    }
  }, [isPremium]);

  if (isPremium) return null;

  return (
    <div className={`my-4 p-3 bg-white rounded-2xl border border-neutral-200 shadow-sm flex flex-col items-center justify-center overflow-hidden ${className}`}>
      <span className="text-[10px] text-neutral-400 mb-1 font-sans">Sponsored Content</span>
      
      {/* Responsive Ad Unit Container with explicit min-height to avoid layout shifts */}
      <ins className="adsbygoogle"
           style={{ display: 'block', width: '100%', minHeight: '90px' }}
           data-ad-client="ca-pub-4603800802281005"
           data-ad-slot={adSlot}
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  );
};
