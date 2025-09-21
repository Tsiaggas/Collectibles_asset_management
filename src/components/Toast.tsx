import React, { useEffect, useState } from 'react';

export interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const Toast: React.FC<{ toast: ToastData | null; setToast: (toast: ToastData | null) => void }> = ({ toast, setToast }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (toast) {
      setShow(true);
      const id = setTimeout(() => {
        setShow(false);
        setToast(null);
      }, 3000);
      return () => clearTimeout(id);
    }
  }, [toast, setToast]);

  if (!toast || !show) return null;

  const bgColor = toast.type === 'error' ? 'bg-red-600' :
                  toast.type === 'success' ? 'bg-green-600' : 'bg-blue-600';

  return (
    <div className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md text-white px-4 py-2 shadow-lg ${bgColor}`}>
      {toast.message}
    </div>
  );
};


