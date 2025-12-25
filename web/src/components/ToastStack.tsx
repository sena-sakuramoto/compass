import React from 'react';
import { createPortal } from 'react-dom';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss(id: string): void;
}

function toneClasses(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return {
        container: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        badge: 'bg-emerald-500',
        button: 'text-emerald-700 hover:text-emerald-900',
      };
    case 'error':
      return {
        container: 'border-rose-200 bg-rose-50 text-rose-900',
        badge: 'bg-rose-500',
        button: 'text-rose-700 hover:text-rose-900',
      };
    default:
      return {
        container: 'border-slate-200 bg-white text-slate-900 shadow-sm',
        badge: 'bg-slate-400',
        button: 'text-slate-500 hover:text-slate-700',
      };
  }
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (!toasts.length) return null;

  const toastContainer = (
    <div className="no-print toast-stack pointer-events-none fixed top-4 right-4 z-[9999] flex max-w-xs flex-col gap-3 sm:max-w-sm" style={{ position: 'fixed' }}>
      {toasts.map((toast) => {
        const tone = toneClasses(toast.tone);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-lg transition-all duration-300 ease-in-out animate-in slide-in-from-right-5 fade-in ${tone.container}`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${tone.badge}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold leading-snug">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-current/80">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className={`ml-2 text-xs font-semibold ${tone.button}`}
              >
                閉じる
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return createPortal(toastContainer, document.body);
}
