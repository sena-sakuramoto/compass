// シンプルなトースト通知ユーティリティ

export const toast = {
  error: (message: string) => {
    console.error('[Toast Error]', message);
    // TODO: より洗練されたトースト UI を実装する場合はここを拡張
    alert(message);
  },

  success: (message: string) => {
    console.log('[Toast Success]', message);
    // TODO: より洗練されたトースト UI を実装する場合はここを拡張
  },

  info: (message: string) => {
    console.log('[Toast Info]', message);
    // TODO: より洗練されたトースト UI を実装する場合はここを拡張
  },
};
