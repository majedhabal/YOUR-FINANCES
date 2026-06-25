import React from 'react';
import { Calendar } from 'lucide-react';

interface EssentialsHeaderProps {
  title: string;
  uiOverrides?: {
    container?: string;
    title?: string;
  };
}

export const EssentialsHeader: React.FC<EssentialsHeaderProps> = ({
  title,
  uiOverrides,
}) => {
  return (
    <div className={uiOverrides?.container || "sticky top-0 z-40 bg-[#F8FAFC] flex justify-between items-center p-[5px]"}>
      <h2 className={uiOverrides?.title || "font-bold tracking-tighter text-black"}>
        <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '26px' }}>{title}</span>
      </h2>
    </div>
  );
};
