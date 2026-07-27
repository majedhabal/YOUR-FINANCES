import React from 'react';

interface NumberPadProps {
  onNumberPress: (num: string) => void;
  onDelete: () => void;
}

export const NumberPad = ({ onNumberPress, onDelete }: NumberPadProps) => {
  return (
    <div className="grid grid-cols-3 gap-2 p-2 bg-white font-['Google_Sans']">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
        <button
          key={num}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onNumberPress(num);
          }}
          className="p-4 text-xl font-bold text-center bg-white rounded hover:bg-gray-50 focus:outline-none shadow-sm border border-gray-100 touch-manipulation"
        >
          {num}
        </button>
      ))}
      <div />
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onNumberPress('0');
        }}
        className="p-4 text-xl font-bold text-center bg-white rounded hover:bg-gray-50 focus:outline-none shadow-sm border border-gray-100 touch-manipulation"
      >
        0
      </button>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onDelete();
        }}
        className="p-4 text-base font-normal text-center bg-white rounded hover:bg-gray-50 focus:outline-none shadow-sm border border-gray-100 touch-manipulation"
      >
        Del
      </button>
    </div>
  );
};
