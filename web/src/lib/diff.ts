/**
 * オブジェクトの差分計算ユーティリティ
 * 変更されたフィールドのみを抽出し、APIに送信するペイロードを最小化する
 */

/**
 * 2つの値が等しいかどうかを深く比較する
 * - null/undefined は空文字列と等価として扱う（フォーム入力の特性を考慮）
 * - 数値と文字列の比較では、数値に変換して比較
 */
function isEqual(a: unknown, b: unknown): boolean {
  // null/undefined/空文字列の正規化
  const normalizeEmpty = (v: unknown): unknown => {
    if (v === null || v === undefined || v === '') return null;
    return v;
  };

  const normalizedA = normalizeEmpty(a);
  const normalizedB = normalizeEmpty(b);

  // 両方がnull（空値）の場合は等しい
  if (normalizedA === null && normalizedB === null) return true;

  // 片方だけがnullの場合は異なる
  if (normalizedA === null || normalizedB === null) return false;

  // 配列の比較
  if (Array.isArray(normalizedA) && Array.isArray(normalizedB)) {
    if (normalizedA.length !== normalizedB.length) return false;
    return normalizedA.every((item, index) => isEqual(item, normalizedB[index]));
  }

  // オブジェクトの比較（配列ではない）
  if (
    typeof normalizedA === 'object' &&
    typeof normalizedB === 'object' &&
    normalizedA !== null &&
    normalizedB !== null &&
    !Array.isArray(normalizedA) &&
    !Array.isArray(normalizedB)
  ) {
    const keysA = Object.keys(normalizedA as object);
    const keysB = Object.keys(normalizedB as object);
    const allKeys = new Set([...keysA, ...keysB]);
    return Array.from(allKeys).every((key) =>
      isEqual((normalizedA as Record<string, unknown>)[key], (normalizedB as Record<string, unknown>)[key])
    );
  }

  // 数値の比較（文字列と数値の混在を考慮）
  if (typeof normalizedA === 'number' || typeof normalizedB === 'number') {
    const numA = Number(normalizedA);
    const numB = Number(normalizedB);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA === numB;
    }
  }

  // プリミティブ値の比較
  return normalizedA === normalizedB;
}

/**
 * 元のオブジェクトと新しいオブジェクトを比較し、変更されたフィールドのみを含むオブジェクトを返す
 *
 * @param original 元のオブジェクト（編集前の状態）
 * @param updated 新しいオブジェクト（編集後の状態）
 * @param options オプション
 * @returns 変更されたフィールドのみを含むオブジェクト
 *
 * 注意:
 * - 意図的にnull/undefinedに設定した場合（クリア操作）も検出される
 * - ネストしたオブジェクトは再帰的に比較せず、オブジェクト全体を差分として返す
 */
export function computeDiff<T extends Record<string, unknown>>(
  original: T | null | undefined,
  updated: Partial<T>,
  options?: {
    /** 差分計算から除外するフィールド */
    excludeFields?: string[];
    /** 常に含めるフィールド */
    alwaysIncludeFields?: string[];
  }
): Partial<T> {
  const diff: Partial<T> = {};
  const excludeSet = new Set(options?.excludeFields ?? []);
  const alwaysIncludeSet = new Set(options?.alwaysIncludeFields ?? []);

  // originalがnullの場合は、updatedの全フィールドが差分
  if (!original) {
    for (const key of Object.keys(updated)) {
      if (!excludeSet.has(key)) {
        (diff as Record<string, unknown>)[key] = updated[key as keyof T];
      }
    }
    return diff;
  }

  // updatedに含まれるフィールドのみを比較
  for (const key of Object.keys(updated)) {
    if (excludeSet.has(key)) continue;

    const originalValue = original[key as keyof T];
    const updatedValue = updated[key as keyof T];

    // 常に含めるフィールドは無条件で追加
    if (alwaysIncludeSet.has(key)) {
      (diff as Record<string, unknown>)[key] = updatedValue;
      continue;
    }

    // 値が異なる場合のみ差分に追加
    if (!isEqual(originalValue, updatedValue)) {
      (diff as Record<string, unknown>)[key] = updatedValue;
    }
  }

  return diff;
}

/**
 * 差分が空かどうかをチェック
 */
export function isDiffEmpty(diff: Record<string, unknown>): boolean {
  return Object.keys(diff).length === 0;
}

/**
 * デバッグ用: 差分の詳細をログ出力
 */
export function logDiff<T extends Record<string, unknown>>(
  label: string,
  original: T | null | undefined,
  updated: Partial<T>,
  diff: Partial<T>
): void {
  if (import.meta.env.MODE === 'development') {
    console.group(`[diff] ${label}`);
    console.log('Original:', original);
    console.log('Updated:', updated);
    console.log('Diff:', diff);
    console.log('Changed fields:', Object.keys(diff));
    console.groupEnd();
  }
}
