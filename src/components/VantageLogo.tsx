import React from 'react';

interface VantageLogoProps {
  className?: string;
  size?: number | string;
}

export const VantageLogo: React.FC<VantageLogoProps> = ({ className = '', size = '100%' }) => {
  return (
    <svg 
      viewBox="0 0 100 100" 
      width={size} 
      height={size} 
      className={`${className} select-none`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Neon Glow Filter */}
        <filter id="neon-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur1" />
          <feGaussianBlur stdDeviation="2" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        
        {/* Subtle Gradient for the background squircle */}
        <linearGradient id="squircle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B231D" />
          <stop offset="50%" stopColor="#071915" />
          <stop offset="100%" stopColor="#030C0A" />
        </linearGradient>

        <linearGradient id="neon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FF88" />
          <stop offset="100%" stopColor="#00FFBC" />
        </linearGradient>
      </defs>

      {/* Modern Squircle Background */}
      <rect 
        x="3" 
        y="3" 
        width="94" 
        height="94" 
        rx="26" 
        fill="url(#squircle-grad)" 
        stroke="#00FF88" 
        strokeWidth="1.5" 
        strokeOpacity="0.25"
      />

      {/* Decorative Inner Radial Shadow Accent */}
      <circle cx="50" cy="50" r="42" fill="none" stroke="#00FF88" strokeWidth="0.5" strokeOpacity="0.1" />

      {/* Glowing geometric "VA" ribbon/path matching the exact shape */}
      {/* It forms a sleek 'V' and 'A' with sharp cyber aesthetics */}
      <path 
        d="M 20,38 
           L 36,73 
           L 47,40 
           L 57,59 
           L 62,25 
           L 80,68" 
        fill="none" 
        stroke="url(#neon-grad)" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter="url(#neon-glow)"
      />
      
      {/* Adding a sleek parallel line accent for that extra premium vector detail */}
      <path 
        d="M 28,34 L 18,34 L 18,38 L 22,38" 
        fill="none" 
        stroke="#00FF88" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />
      <path 
        d="M 72,68 L 82,68 L 82,64 L 78,64" 
        fill="none" 
        stroke="#00FF88" 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />
    </svg>
  );
};
