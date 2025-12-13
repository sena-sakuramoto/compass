// Excel入出力UI

import React, { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ExcelImportExportProps {
  onImport: (file: File) => Promise<void>;
  onExport: () => Promise<void>;
}

export function ExcelImportExport({ onImport, onExport }: ExcelImportExportProps) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMessage(null);

    try {
      await onImport(file);
      setMessage({ type: 'success', text: 'インポートが完了しました' });
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: 'インポートに失敗しました' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);

    try {
      await onExport();
      setMessage({ type: 'success', text: 'エクスポートが完了しました' });
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'エクスポートに失敗しました' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <FileSpreadsheet className="h-6 w-6 text-slate-700" />
        <h3 className="text-lg font-semibold text-slate-900">Excel入出力</h3>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        プロジェクト、タスク、担当者のデータをExcelファイルでインポート・エクスポートできます。
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={handleImportClick}
          disabled={importing}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {importing ? 'インポート中...' : 'Excelをインポート'}
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'エクスポート中...' : 'Excelをエクスポート'}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      {message && (
        <div
          className={`mt-4 flex items-start gap-3 rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      <div className="mt-6 rounded-lg bg-slate-50 p-4">
        <h4 className="mb-2 text-sm font-medium text-slate-900">Excelファイルの形式</h4>
        <ul className="space-y-1 text-xs text-slate-600">
          <li>• <strong>Projects</strong>シート: プロジェクト情報</li>
          <li>• <strong>Tasks</strong>シート: タスク情報</li>
          <li>• <strong>People</strong>シート: 担当者情報</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          ※ 各シートには対応するヘッダー行が必要です
        </p>
      </div>
    </div>
  );
}

