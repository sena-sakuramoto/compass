// シンプルなトースト通知ユーティリティ
// react-hot-toastを使用したUI

import hotToast from 'react-hot-toast';

export const toast = {
  error: (message: string) => {
    console.error('[Toast Error]', message);
    hotToast.error(message, {
      duration: 5000,
      style: {
        background: '#fef2f2',
        color: '#991b1b',
        border: '1px solid #fecaca',
      },
    });
  },

  success: (message: string) => {
    console.log('[Toast Success]', message);
    hotToast.success(message, {
      duration: 3000,
      style: {
        background: '#ecfdf5',
        color: '#065f46',
        border: '1px solid #a7f3d0',
      },
    });
  },

  info: (message: string) => {
    console.log('[Toast Info]', message);
    hotToast(message, {
      duration: 3000,
      icon: 'ℹ️',
      style: {
        background: '#f8fafc',
        color: '#334155',
        border: '1px solid #e2e8f0',
      },
    });
  },
};
