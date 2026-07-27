import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PermissionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionRequestModal: React.FC<PermissionRequestModalProps> = ({ isOpen, onClose }) => {
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const requestCameraPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('Camera permission granted');
    } catch (err) {
      console.error('Camera permission denied', err);
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
    } catch (err) {
      console.error('Notification permission error', err);
    }
  };

  const requestStoragePermission = async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log('Persistent storage granted:', isPersisted);
      }
    } catch (err) {
      console.error('Storage permission error', err);
    }
  };

  const handleGrantPermissions = async () => {
    await requestCameraPermission();
    await requestNotificationPermission();
    await requestStoragePermission();
    setPermissionsGranted(true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 p-6"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-neutral-100 max-w-sm w-full font-['Google_Sans']">
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Enable Features</h2>
          <p className="text-neutral-600 mb-6 font-normal">To provide you with the best experience, please enable permissions for Camera (for scanning) and Notifications (for reminders).</p>
          
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-neutral-600 font-normal hover:bg-neutral-50 rounded-full"
            >
              Skip
            </button>
            <button
              onClick={handleGrantPermissions}
              className="flex-1 py-3 bg-neutral-900 text-white font-bold rounded-full hover:bg-neutral-800"
            >
              Enable
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
