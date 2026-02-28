import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Project, ParsedItem, Stage } from '../lib/types';
import { bulkImportParse, bulkImportParseFile, createProject, generateStages, listProjectMembers, listStages, listUsers } from '../lib/api';
import { BulkImportReviewTable } from './BulkImportReviewTable';
import { isWebGPUSupported, parseWithLocalLLM, MODEL_CONFIGS, type LocalModelSize } from '../lib/localLLM';

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
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [existingStages, setExistingStages] = useState<Stage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [localModelSize, setLocalModelSize] = useState<LocalModelSize>('medium');
  const [localProgress, setLocalProgress] = useState<{ status: string; progress?: number } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [monthlyUsed, setMonthlyUsed] = useState<number | null>(null);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);

  // Sync defaultProjectId when it changes
  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  // Sync localProjects with props
  useEffect(() => {
    setLocalProjects(projects);
  }, [projects]);

  const handleProjectCreated = useCallback((newProject: Project) => {
    setLocalProjects((prev) => [...prev, newProject]);
    setProjectId(newProject.id);
  }, []);

  // Fetch project members and existing stages when projectId changes
  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      setExistingStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [memberList, stagesResult] = await Promise.all([
          listProjectMembers(projectId, { status: 'active' }),
          listStages(projectId).catch(() => ({ stages: [] as Stage[] })),
        ]);
        if (!cancelled) {
          let names: string[];
          if (memberList.length > 0) {
            names = memberList
              .map((m) => m.displayName || m.email)
              .filter(Boolean) as string[];
          } else {
            // フォールバック: プロジェクトメンバー未追加時は組織メンバーを取得
            try {
              const orgUsers = await listUsers({ isActive: true });
              names = orgUsers
                .map((u: any) => u.displayName || u.email)
                .filter(Boolean) as string[];
            } catch {
              names = [];
            }
          }
          setMembers([...new Set(names)]);
          setExistingStages(stagesResult.stages || []);
        }
      } catch {
        if (!cancelled) {
          setMembers([]);
          setExistingStages([]);
        }
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
    setGenerating(false);
    setError('');
    setParsedItems([]);
    setWarnings([]);
    setMembers([]);
    setExistingStages([]);
    setFile(null);
    setPdfFile(null);
    setLocalProgress(null);
    setRemaining(null);
    setMonthlyUsed(null);
    setMonthlyLimit(null);
    setLocalProjects(projects);
  }, [defaultProjectId, projects]);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const handleParse = async () => {
    setError('');
    setParsing(true);
    try {
      // If PDF/image tab, use file upload endpoint
      if (tab === 'pdf' && pdfFile) {
        const result = await bulkImportParseFile(
          pdfFile,
          projectId,
          model === 'local' ? 'flash' : model as 'flash' | 'sonnet',
        );
        setParsedItems(result.items);
        setWarnings(result.warnings);
        if (result.remaining !== undefined) setRemaining(result.remaining);
        if (result.monthlyUsed !== undefined) setMonthlyUsed(result.monthlyUsed);
        if (result.monthlyLimit !== undefined) setMonthlyLimit(result.monthlyLimit);
        setStep('review');
        setParsing(false);
        return;
      }

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

      // If local model, parse entirely in browser
      if (model === 'local') {
        const result = await parseWithLocalLLM(parseText, localModelSize, setLocalProgress);
        setParsedItems(result.items);
        setWarnings(result.warnings);
        setStep('review');
        setLocalProgress(null);
        setParsing(false);
        return;
      }

      const result = await bulkImportParse({
        text: parseText,
        model,
        projectId,
        inputType,
      });
      setParsedItems(result.items);
      setWarnings(result.warnings);
      if (result.remaining !== undefined) setRemaining(result.remaining);
      if (result.monthlyUsed !== undefined) setMonthlyUsed(result.monthlyUsed);
      if (result.monthlyLimit !== undefined) setMonthlyLimit(result.monthlyLimit);
      setStep('review');
    } catch (err: any) {
      if (err?.status === 429 && typeof err?.data?.monthlyLimit === 'number') {
        if (typeof err?.data?.monthlyUsed === 'number') setMonthlyUsed(err.data.monthlyUsed);
        setMonthlyLimit(err.data.monthlyLimit);
        setError(`今月のAI利用上限（${err.data.monthlyLimit}回）に達しました。`);
      } else {
        setError(err.message || '解析に失敗しました。入力内容を確認してください。');
      }
    } finally {
      setParsing(false);
    }
  };

  const handleBackToInput = useCallback(() => {
    setStep('input');
  }, []);

  const handleGenerateStages = async () => {
    if (!projectId || generating) return;
    setError('');
    setGenerating(true);
    try {
      const result = await generateStages(projectId);
      setParsedItems(result.items);
      setWarnings(result.warnings);
      if (result.remaining !== undefined) setRemaining(result.remaining);
      if (result.monthlyUsed !== undefined) setMonthlyUsed(result.monthlyUsed);
      if (result.monthlyLimit !== undefined) setMonthlyLimit(result.monthlyLimit);
      setStep('review');
    } catch (err: any) {
      if (err?.status === 429 && typeof err?.data?.monthlyLimit === 'number') {
        if (typeof err?.data?.monthlyUsed === 'number') setMonthlyUsed(err.data.monthlyUsed);
        setMonthlyLimit(err.data.monthlyLimit);
        setError(`今月のAI利用上限（${err.data.monthlyLimit}回）に達しました。`);
      } else {
        setError(err.message || 'AI生成に失敗しました。');
      }
    } finally {
      setGenerating(false);
    }
  };

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

  const canParse = !!projectId && !parsing && !generating && (
    tab === 'text' ? !!text.trim() :
    tab === 'excel' ? !!file :
    tab === 'pdf' ? !!pdfFile :
    false
  );

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
              pdfFile={pdfFile}
              onPdfFileChange={setPdfFile}
              parsing={parsing}
              generating={generating}
              error={error}
              canParse={canParse}
              onParse={handleParse}
              onGenerateStages={handleGenerateStages}
              projects={localProjects}
              onProjectCreated={handleProjectCreated}
              localModelSize={localModelSize}
              onLocalModelSizeChange={setLocalModelSize}
              localProgress={localProgress}
              remaining={remaining}
              monthlyUsed={monthlyUsed}
              monthlyLimit={monthlyLimit}
            />
          ) : (
            <BulkImportReviewTable
              items={parsedItems}
              warnings={warnings}
              projectId={projectId}
              members={members}
              existingStages={existingStages}
              onSaved={handleSaved}
              onBack={handleBackToInput}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Project Combobox ─────────────────────────────────────

function ProjectCombobox({
  projects,
  value,
  onChange,
  onProjectCreated,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  onProjectCreated?: (project: Project) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => projects.find((p) => p.id === value),
    [projects, value]
  );

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        (p.物件名 || '').toLowerCase().includes(q) ||
        (p.クライアント || '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCreateForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const result = await createProject({
        物件名: name,
        ステータス: '計画中',
        優先度: '中',
      } as any);
      const newProject: Project = {
        id: result.id,
        物件名: name,
        ステータス: '計画中',
        優先度: '中',
      } as Project;
      onProjectCreated?.(newProject);
      setShowCreateForm(false);
      setNewProjectName('');
      setSearch('');
      setOpen(false);
    } catch (err: any) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        対象プロジェクト
      </label>
      <div
        className="flex items-center gap-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 cursor-text"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        <svg className="h-4 w-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={open ? search : (selected?.物件名 ?? '')}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setSearch('');
          }}
          placeholder="プロジェクトを検索..."
          className="w-full bg-transparent outline-none text-sm placeholder:text-slate-400"
        />
        {value && !open && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setSearch('');
              setOpen(true);
              inputRef.current?.focus();
            }}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 && !showCreateForm && (
            <div className="px-3 py-2 text-sm text-slate-500">
              該当なし
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setSearch('');
                setOpen(false);
                setShowCreateForm(false);
              }}
              className={[
                'w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors',
                p.id === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700',
              ].join(' ')}
            >
              <div className="font-medium">{p.物件名}</div>
              {p.クライアント && (
                <div className="text-[11px] text-slate-400">{p.クライアント}</div>
              )}
            </button>
          ))}
          {/* 区切り線 + 新規作成 */}
          <div className="border-t border-slate-200">
            {!showCreateForm ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCreateForm(true);
                  setNewProjectName(search);
                  setTimeout(() => newNameRef.current?.focus(), 50);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                新規プロジェクト作成
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <label className="block text-xs font-medium text-slate-600">物件名</label>
                <input
                  ref={newNameRef}
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    }
                    if (e.key === 'Escape') {
                      setShowCreateForm(false);
                    }
                  }}
                  placeholder="物件名を入力..."
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="rounded px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 transition"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim() || creating}
                    className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {creating ? '作成中...' : '作成'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
  pdfFile: File | null;
  onPdfFileChange: (file: File | null) => void;
  parsing: boolean;
  generating: boolean;
  error: string;
  canParse: boolean;
  onParse: () => void;
  onGenerateStages: () => void;
  projects: Project[];
  onProjectCreated?: (project: Project) => void;
  localModelSize: LocalModelSize;
  onLocalModelSizeChange: (size: LocalModelSize) => void;
  localProgress: { status: string; progress?: number } | null;
  remaining: number | null;
  monthlyUsed: number | null;
  monthlyLimit: number | null;
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
  pdfFile,
  onPdfFileChange,
  parsing,
  generating,
  error,
  canParse,
  onParse,
  onGenerateStages,
  projects,
  onProjectCreated,
  localModelSize,
  onLocalModelSizeChange,
  localProgress,
  remaining,
  monthlyUsed,
  monthlyLimit,
}: InputStepProps) {
  const tabs: { key: Tab; label: string; disabled: boolean }[] = [
    { key: 'text', label: 'テキスト', disabled: false },
    { key: 'excel', label: 'Excel/CSV', disabled: false },
    { key: 'pdf', label: 'PDF/画像', disabled: false },
  ];

  const flashDesc = remaining !== null ? `高速・残り${remaining}回/日` : '高速・1日10回';
  const models: { key: Model; label: string; disabled: boolean; description?: string }[] = [
    { key: 'flash', label: 'Gemini Flash', disabled: false, description: flashDesc },
    { key: 'sonnet', label: 'Claude Sonnet', disabled: true, description: '高精度 - 準備中' },
    { key: 'local', label: 'ローカルAI', disabled: !isWebGPUSupported(), description: isWebGPUSupported() ? '無料・回数無制限' : 'WebGPU非対応' },
  ];

  return (
    <div className="space-y-5">
      {/* Project selector (searchable) */}
      <ProjectCombobox
        projects={projects}
        value={projectId}
        onChange={onProjectIdChange}
        onProjectCreated={onProjectCreated}
      />

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

      {/* PDF/Image file upload */}
      {tab === 'pdf' && (
        <div>
          <div
            className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 transition cursor-pointer"
            onClick={() => document.getElementById('bulk-import-pdf')?.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f) onPdfFileChange(f);
            }}
          >
            {pdfFile ? (
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">{pdfFile.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(pdfFile.size / 1024).toFixed(1)} KB</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onPdfFileChange(null); }}
                  className="mt-2 text-xs text-red-500 hover:text-red-700"
                >
                  ファイルを変更
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-slate-500">ファイルをドラッグ＆ドロップ</p>
                <p className="text-xs text-slate-400 mt-1">または クリックして選択</p>
                <p className="text-xs text-slate-400 mt-1">.pdf .jpg .png 対応</p>
              </div>
            )}
          </div>
          <input
            id="bulk-import-pdf"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPdfFileChange(f);
            }}
          />
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

        {/* Local model size selection */}
        {model === 'local' && isWebGPUSupported() && (
          <div className="ml-8 mt-2 space-y-1.5">
            <p className="text-xs text-slate-500">モデルサイズ:</p>
            <div className="flex gap-2">
              {(Object.entries(MODEL_CONFIGS) as [LocalModelSize, typeof MODEL_CONFIGS['small']][]).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onLocalModelSizeChange(key)}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-xs transition',
                    localModelSize === key
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="font-medium">{config.label}</span>
                  <span className="ml-1 text-slate-400">({config.sizeLabel})</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              ※ 初回はモデルのダウンロードが必要です
            </p>
          </div>
        )}

        {monthlyUsed !== null && monthlyLimit !== null && (
          <p className="mt-2 text-xs text-slate-500">
            AI利用: {monthlyUsed}/{monthlyLimit}回（今月）
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Local progress */}
      {localProgress && (
        <div className="rounded-lg bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-700">{localProgress.status}</p>
          {localProgress.progress !== undefined && localProgress.progress < 100 && (
            <div className="mt-2 h-2 rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${localProgress.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onGenerateStages}
          disabled={!projectId || parsing || generating}
          className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              AI生成中...
            </span>
          ) : (
            'AIで工程を自動生成'
          )}
        </button>

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
