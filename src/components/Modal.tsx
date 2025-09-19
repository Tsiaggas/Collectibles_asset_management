import React, { useEffect } from 'react';

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export const Modal: React.FC<ModalProps> = ({ open, title, onClose, children }) => {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
};


