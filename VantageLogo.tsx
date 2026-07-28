import React from 'react';

interface VantageLogoProps {
  className?: string;
  size?: number | string;
}

export const VantageLogo: React.FC<VantageLogoProps> = ({ className = '', size = '100%' }) => {
  return (
    <img 
      src="/icons/YOURFINANCES-Logo-APP.png" 
      alt="YOUR FINANCES Logo" 
      width={size} 
      height={size} 
      className={className} 
    />
  );
};
