import React, { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Project, ParsedItem } from '../lib/types';
import { bulkImportParse, listProjectMembers } from '../lib/api';
import { BulkImportReviewTable } from './BulkImportReviewTable';

type Step = 'input' | 'review';
type Tab = 'text' | 'excel' | 'pdf';
type Model = 'flash' | 'sonnet' | 'local';

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  defaultProjectId?: string;
  onImported?: () => void;
}

export function BulkImportModal({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onImported,
}: BulkImportModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [tab, setTab] = useState<Tab>('text');
  const [model, setModel] = useState<Model>('flash');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // Sync defaultProjectId when it changes
  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  // Fetch project members when projectId changes
  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const memberList = await listProjectMembers(projectId, { status: 'active' });
        if (!cancelled) {
          const names = memberList
            .map((m) => m.displayName || m.email)
            .filter(Boolean) as string[];
          // Deduplicate
          setMembers([...new Set(names)]);
        }
      } catch {
        // If members can't be loaded, just keep empty
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const resetState = useCallback(() => {
    setStep('input');
    setTab('text');
    setModel('flash');
    setProjectId(defaultProjectId ?? '');
    setText('');
    setParsing(false);
    setError('');
    setParsedItems([]);
    setWarnings([]);
    setMembers([]);
    setFile(null);
  }, [defaultProjectId]);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const handleParse = async () => {
    setError('');
    setParsing(true);
    try {
      let parseText = text.trim();
      let inputType: 'text' | 'excel' = 'text';

      // If Excel tab, read the file and convert to text
      if (tab === 'excel' && file) {
        inputType = 'excel';
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        // Convert all sheets to text
        const lines: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          lines.push(`--- ${sheetName} ---`);
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          lines.push(csv);
        }
        parseText = lines.join('\n');
      }

      if (!parseText) {
        setError('解析するデータがありません');
        setParsing(false);
        return;
      }

      const result = await bulkImportParse({
        text: parseText,
        model: model === 'local' ? 'flash' : model as 'flash' | 'sonnet',
        projectId,
        inputType,
      });
      setParsedItems(result.items);
      setWarnings(result.warnings);
      setStep('review');
    } catch (err: any) {
      setError(err.message || '解析に失敗しました。入力内容を確認してください。');
    } finally {
      setParsing(false);
    }
  };

  const handleBackToInput = useCallback(() => {
    setStep('input');
  }, []);

  const handleSaved = useCallback(() => {
    handleClose();
    onImported?.();
  }, [handleClose, onImported]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, handleClose]);

  if (!open) return null;

  const canParse = !!projectId && !parsing && (tab === 'text' ? !!text.trim() : tab === 'excel' ? !!file : false);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal panel */}
      <div
        className="relative z-10 bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-xl">
          <h2 className="text-lg font-semibold text-slate-900">一括インポート</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === 'input' ? (
            <InputStep
              tab={tab}
              onTabChange={setTab}
              model={model}
              onModelChange={setModel}
              projectId={projectId}
              onProjectIdChange={setProjectId}
              text={text}
              onTextChange={setText}
              file={file}
              onFileChange={setFile}
              parsing={parsing}
              error={error}
              canParse={canParse}
              onParse={handleParse}
              projects={projects}
            />
          ) : (
            <BulkImportReviewTable
              items={parsedItems}
              warnings={warnings}
              projectId={projectId}
              members={members}
              onSaved={handleSaved}
              onBack={handleBackToInput}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Input Step ───────────────────────────────────────────

interface InputStepProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  model: Model;
  onModelChange: (model: Model) => void;
  projectId: string;
  onProjectIdChange: (id: string) => void;
  text: string;
  onTextChange: (text: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  parsing: boolean;
  error: string;
  canParse: boolean;
  onParse: () => void;
  projects: Project[];
}

function InputStep({
  tab,
  onTabChange,
  model,
  onModelChange,
  projectId,
  onProjectIdChange,
  text,
  onTextChange,
  file,
  onFileChange,
  parsing,
  error,
  canParse,
  onParse,
  projects,
}: InputStepProps) {
  const tabs: { key: Tab; label: string; disabled: boolean }[] = [
    { key: 'text', label: 'テキスト', disabled: false },
    { key: 'excel', label: 'Excel/CSV', disabled: false },
    { key: 'pdf', label: 'PDF/画像', disabled: true },
  ];

  const models: { key: Model; label: string; disabled: boolean; description?: string }[] = [
    { key: 'flash', label: 'Gemini Flash', disabled: false, description: '高速' },
    { key: 'sonnet', label: 'Claude Sonnet', disabled: false, description: '高精度' },
    { key: 'local', label: 'ローカルAI', disabled: true, description: '無料 - 近日公開' },
  ];

  return (
    <div className="space-y-5">
      {/* Project selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          対象プロジェクト
        </label>
        <select
          value={projectId}
          onChange={(e) => onProjectIdChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">プロジェクトを選択してください</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.物件名}
            </option>
          ))}
        </select>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => !t.disabled && onTabChange(t.key)}
            disabled={t.disabled}
            className={[
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              tab === t.key
                ? 'bg-slate-900 text-white'
                : t.disabled
                  ? 'border border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {t.label}
            {t.disabled && (
              <span className="ml-1 text-[10px] opacity-60">近日公開</span>
            )}
          </button>
        ))}
      </div>

      {/* Text input area */}
      {tab === 'text' && (
        <div>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="打合せメモ、工程表、議事録などを貼り付けてください..."
            rows={10}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
          />
        </div>
      )}

      {/* Excel/CSV file upload */}
      {tab === 'excel' && (
        <div>
          <div
            className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
            onClick={() => document.getElementById('bulk-import-file')?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f) onFileChange(f);
            }}
          >
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
                  className="mt-2 text-xs text-red-500 hover:text-red-700"
                >
                  ファイルを変更
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-slate-500">ファイルをドラッグ＆ドロップ</p>
                <p className="text-xs text-slate-400 mt-1">または クリックして選択</p>
                <p className="text-xs text-slate-400 mt-1">.xlsx .xls .csv 対応</p>
              </div>
            )}
          </div>
          <input
            id="bulk-import-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFileChange(f);
            }}
          />
        </div>
      )}

      {/* Coming soon placeholder for PDF tab */}
      {tab === 'pdf' && (
        <div className="flex h-48 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400">
          近日公開
        </div>
      )}

      {/* AI model selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">AIモデル</label>
        <div className="space-y-2">
          {models.map((m) => (
            <label
              key={m.key}
              className={[
                'flex items-center gap-3 rounded-lg border px-4 py-2.5 cursor-pointer transition',
                model === m.key
                  ? 'border-blue-500 bg-blue-50'
                  : m.disabled
                    ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                    : 'border-slate-200 hover:bg-slate-50',
              ].join(' ')}
            >
              <input
                type="radio"
                name="ai-model"
                value={m.key}
                checked={model === m.key}
                onChange={() => !m.disabled && onModelChange(m.key)}
                disabled={m.disabled}
                className="text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-slate-900">{m.label}</span>
                {m.description && (
                  <span className="ml-2 text-xs text-slate-500">({m.description})</span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Parse button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onParse}
          disabled={!canParse}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {parsing ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              解析中...
            </span>
          ) : (
            '解析する →'
          )}
        </button>
      </div>
    </div>
  );
}
