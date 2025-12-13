/**
 * デバウンス処理のユーティリティ
 *
 * 短時間に連続した呼び出しを束ねて、最後の呼び出しのみを実行する
 */

type DebouncedFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
};

/**
 * 関数をデバウンスする
 *
 * @param fn - デバウンスする関数
 * @param delay - 遅延時間（ミリ秒）
 * @returns デバウンスされた関数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debouncedFn = (...args: Parameters<T>) => {
    lastArgs = args;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (lastArgs !== null) {
        fn(...lastArgs);
        lastArgs = null;
      }
      timeoutId = null;
    }, delay);
  };

  debouncedFn.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debouncedFn.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs !== null) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return debouncedFn as DebouncedFunction<T>;
}

/**
 * コアレス処理のユーティリティ
 *
 * 短時間に到着した複数のアイテムを束ねて、一括処理する
 */
export function createCoalescer<T>(
  onBatch: (items: T[]) => void,
  delay: number = 500
): (item: T) => void {
  const queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (item: T) => {
    queue.push(item);

    if (timer) return;

    timer = setTimeout(() => {
      const batch = [...queue];
      queue.length = 0;
      timer = null;
      onBatch(batch);
    }, delay);
  };
}
