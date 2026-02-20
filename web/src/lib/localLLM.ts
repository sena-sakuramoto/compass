import type { ParsedItem } from './types';

export type LocalModelSize = 'small' | 'medium' | 'large';

export interface LocalModelConfig {
  id: string;
  label: string;
  sizeLabel: string;
  description: string;
}

export const MODEL_CONFIGS: Record<LocalModelSize, LocalModelConfig> = {
  small: {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: '軽量',
    sizeLabel: '~400MB',
    description: '低スペックPCでも動作',
  },
  medium: {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: '標準',
    sizeLabel: '~1GB',
    description: 'バランス型',
  },
  large: {
    id: 'onnx-community/Qwen2.5-3B-Instruct',
    label: '高精度',
    sizeLabel: '~2GB',
    description: 'GPU 4GB+推奨',
  },
};

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

const SYSTEM_PROMPT = `あなたは建築プロジェクトの工程表を解析するアシスタントです。
入力テキストから工程（Stage）、タスク、打合せ、マイルストーンを抽出してください。

分類ルール:
- stage: 大きなフェーズ（基本設計、実施設計、施工 等）
- task: 具体的な作業（図面作成、申請書作成 等）
- meeting: 打合せ、会議、確認会 等
- milestone: 着工、竣工、引渡し、検査 等の1日イベント

階層ルール:
- 工程(stage)の下にタスクや打合せがぶら下がる
- インデント、番号体系、文脈から親子関係を推定

出力はJSON形式のみ:
{"items":[{"tempId":"tmp_1","name":"名前","type":"stage","parentTempId":null,"assignee":null,"startDate":null,"endDate":null,"confidence":0.8}],"warnings":[]}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPipeline: any = null;
let cachedModelId: string | null = null;

export async function parseWithLocalLLM(
  text: string,
  modelSize: LocalModelSize,
  onProgress?: (info: { status: string; progress?: number }) => void,
): Promise<{ items: ParsedItem[]; warnings: string[] }> {
  const config = MODEL_CONFIGS[modelSize];

  // Dynamic import to avoid loading Transformers.js until needed
  const { pipeline } = await import('@huggingface/transformers');

  // Reuse pipeline if same model
  if (!cachedPipeline || cachedModelId !== config.id) {
    onProgress?.({ status: 'モデルを読み込み中...', progress: 0 });

    cachedPipeline = await pipeline('text-generation', config.id, {
      device: 'webgpu',
      dtype: 'q4f16',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (data: any) => {
        if (data.progress !== undefined) {
          onProgress?.({ status: 'モデルをダウンロード中...', progress: Math.round(data.progress) });
        }
      },
    });
    cachedModelId = config.id;
    onProgress?.({ status: 'モデル準備完了', progress: 100 });
  }

  onProgress?.({ status: '解析中...' });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text },
  ];

  const output = await cachedPipeline(messages, {
    max_new_tokens: 2048,
    temperature: 0.1,
    do_sample: true,
    return_full_text: false,
  });

  // Extract generated text
  let generatedText = '';
  if (Array.isArray(output) && output.length > 0) {
    const item = output[0];
    if (item.generated_text) {
      // If it's a chat format, get the last assistant message
      if (Array.isArray(item.generated_text)) {
        const lastMsg = item.generated_text[item.generated_text.length - 1];
        generatedText = typeof lastMsg === 'string' ? lastMsg : lastMsg?.content || '';
      } else {
        generatedText = item.generated_text;
      }
    }
  }

  // Extract JSON from the response (may contain extra text)
  const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      items: [],
      warnings: ['ローカルAIがJSON形式で応答できませんでした。クラウドAIをお試しください。'],
    };
  }

  try {
    const data = JSON.parse(jsonMatch[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: ParsedItem[] = (data.items || []).map((item: any, idx: number) => ({
      tempId: item.tempId || `tmp_local_${idx}`,
      name: item.name || '',
      type: item.type || 'task',
      parentTempId: item.parentTempId || null,
      assignee: item.assignee || null,
      startDate: item.startDate || null,
      endDate: item.endDate || null,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
    }));

    return {
      items,
      warnings: [
        ...(data.warnings || []),
        'ローカルAI（ベータ）で解析しました。精度が低い場合はクラウドAIをお試しください。',
      ],
    };
  } catch {
    return {
      items: [],
      warnings: ['ローカルAIの応答を解析できませんでした。クラウドAIをお試しください。'],
    };
  }
}
