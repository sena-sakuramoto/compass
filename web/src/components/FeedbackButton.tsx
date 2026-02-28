import { useState } from 'react';
import { submitFeedback } from '../lib/api';

type FeedbackType = 'bug' | 'feature' | 'other';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<FeedbackType>('bug');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);

    try {
      await submitFeedback({
        type,
        message,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });

      setSent(true);
      setMessage('');
      window.setTimeout(() => {
        setIsOpen(false);
        setSent(false);
      }, 2000);
    } catch (error) {
      console.error('Feedback send failed:', error);
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white rounded-full px-4 py-2 text-sm shadow-lg hover:bg-slate-800 transition-colors"
        aria-label="フィードバックを送る"
      >
        ご意見・不具合報告
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 w-80 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold text-slate-900">フィードバック</h3>
        <button
          onClick={() => {
            setIsOpen(false);
            setSent(false);
          }}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>

      {sent ? (
        <p className="text-sm text-green-600 py-4 text-center">送信しました。ありがとうございます！</p>
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            {([
              { value: 'bug', label: '不具合' },
              { value: 'feature', label: '要望' },
              { value: 'other', label: 'その他' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                  type === option.value
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              type === 'bug'
                ? 'どんな操作をしたとき、何が起きましたか？'
                : type === 'feature'
                  ? 'どんな機能があると嬉しいですか？'
                  : '自由にお書きください'
            }
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          <button
            onClick={handleSubmit}
            disabled={!message.trim() || sending}
            className="mt-2 w-full bg-slate-900 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? '送信中...' : '送信'}
          </button>
        </>
      )}
    </div>
  );
}
