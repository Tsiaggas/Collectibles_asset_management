import React, { useEffect, useState } from 'react';

export const Toast: React.FC<{ message: string; onDone?: () => void }> = ({ message, onDone }) => {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      setShow(false);
      onDone?.();
    }, 2500);
    return () => clearTimeout(id);
  }, [onDone]);
  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-gray-900 text-white px-4 py-2 shadow-lg">
      {message}
    </div>
  );
};


