import React, { useState } from 'react';
import { ConfirmationModal } from './ConfirmationModal';

interface SetReminderTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, hour: number) => void;
  initialEnabled: boolean;
  initialHour: number;
}

export const SetReminderTimeModal: React.FC<SetReminderTimeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialEnabled,
  initialHour,
}) => {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour);

  // Use a custom message component
  const messageContent = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="text-sm">Enable Reminder</label>
        <input 
          type="checkbox" 
          checked={enabled} 
          onChange={(e) => setEnabled(e.target.checked)} 
          className="toggle"
        />
      </div>
      {enabled && (
        <div className="flex items-center justify-between">
          <label className="text-sm">Select Time</label>
          <select 
            value={hour} 
            onChange={(e) => setHour(parseInt(e.target.value))}
            className="bg-white border rounded p-1"
          >
            {[...Array(24).keys()].map(h => <option key={h} value={h}>{h}:00</option>)}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={() => {
        onSave(enabled, hour);
        onClose();
      }}
      title="Daily Login Reminder"
      message={messageContent as any} // Cast as any because ConfirmationModal only expects string
      type="mint"
    />
  );
};
