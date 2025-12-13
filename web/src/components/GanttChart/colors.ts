// ========================================
// 工程ガントチャート用の統一された色パレット
//
// ポリシー：
// - 色相は増やさない（ブルー系 + ニュートラル系のみ）
// - 状態の違いは「チャージ量（width）+ 小さなマーカー（✓ / !）+ 濃淡」で表現
// - 色のバリエーションは最小限に抑える
// ========================================

export const GANTT_COLORS = {
  // OuterBar（トラック）- 工程の予定期間を示す
  track: {
    bg: 'bg-slate-100',           // 背景色（ニュートラル）
    border: 'border-slate-200',   // ボーダー色
    hover: 'hover:bg-slate-150',  // ホバー時
  },

  // InnerBar（チャージ部分）- 工程の進捗率を示す
  // アクセントカラー1色のみを使用
  charge: {
    bg: 'bg-blue-500',            // 基本色（進行中）
    bgDone: 'bg-blue-600',        // 完了時は濃くする
    bgHover: 'hover:bg-blue-600', // ホバー時
  },

  // 状態マーカー - 控えめに表示
  markers: {
    delayed: {
      bg: 'bg-red-500',           // 遅延マーカー（細いライン or 小さいアイコン）
      text: 'text-red-500',
      border: 'border-red-500',
    },
    done: {
      text: 'text-slate-500',     // 完了チェックアイコン
      bg: 'bg-slate-100',
    },
  },

  // 今日のインジケーター
  today: {
    line: 'border-blue-500',      // 縦線（2-3px）
    bg: 'bg-blue-100/40',         // 背景帯（薄い）
    label: {
      bg: 'bg-blue-500',          // ラベル背景
      text: 'text-white',         // ラベルテキスト
    },
  },

  // 工程カード（左カラム）
  stageCard: {
    bg: 'bg-white',
    bgHover: 'hover:bg-slate-50',
    border: 'border-slate-200',

    // 今日を含む工程の左端アクセントライン
    accentLine: 'border-l-4 border-l-blue-500',

    // 状態チップ
    statusChip: {
      not_started: {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
      },
      in_progress: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
      },
      done: {
        bg: 'bg-slate-200',
        text: 'text-slate-700',
      },
      delayed: {
        bg: 'bg-red-100',
        text: 'text-red-700',
      },
    },

    // 進捗バー（左カラム内）
    progressBar: {
      bg: 'bg-slate-100',         // バー背景
      fill: 'bg-blue-500',        // バー塗りつぶし
      text: 'text-slate-600',     // パーセント表示
    },
  },

  // タスク行（展開時）
  taskRow: {
    bg: 'bg-white',
    bgHover: 'hover:bg-slate-50',
    border: 'border-slate-100',
    indent: 'pl-8',               // インデント幅

    // チェックボックス
    checkbox: {
      border: 'border-slate-300',
      checked: 'text-blue-600',
      focus: 'focus:ring-blue-500',
    },
  },

  // プロジェクトヘッダー（既存）
  projectHeader: {
    bg: 'bg-slate-100/50',
    border: 'border-slate-200',
    text: 'text-slate-700',
  },
} as const;

// ステータスに応じた状態チップのスタイルを取得
export function getStatusChipClasses(status: 'not_started' | 'in_progress' | 'done' | 'delayed'): string {
  const chip = GANTT_COLORS.stageCard.statusChip[status];
  return `${chip.bg} ${chip.text} px-2 py-0.5 rounded text-xs font-medium`;
}

// ステータスに応じたラベルを取得
export function getStatusLabel(status: 'not_started' | 'in_progress' | 'done' | 'delayed'): string {
  const labels = {
    not_started: '未開始',
    in_progress: '進行中',
    done: '完了',
    delayed: '遅延',
  };
  return labels[status];
}
