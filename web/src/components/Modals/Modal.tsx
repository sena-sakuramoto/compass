import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

interface ModalComponentProps extends ModalProps {
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onOpenChange, children, title }: ModalComponentProps) {
  // ESCキーでモーダルを閉じる（イベント伝播を止めて親ダイアログに影響させない）
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/30"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl my-8 flex flex-col max-h-[calc(100vh-4rem)] relative"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 30
            }}
          >
            <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-slate-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
              <button type="button" onClick={() => onOpenChange(false)} className="text-slate-500 hover:text-slate-700">
                ×
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
