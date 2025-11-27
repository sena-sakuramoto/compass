import { useState, useCallback, useRef } from 'react';
import { Project, Task, Person, CompassState } from '../types';

// 履歴の最大保持数
const MAX_HISTORY = 50;

export function useSnapshot() {
    const [state, setState] = useState<CompassState>({
        projects: [],
        tasks: [],
        people: [],
    });

    // 履歴管理
    const historyRef = useRef<CompassState[]>([]);
    const historyIndexRef = useRef<number>(-1);

    // 状態更新ラッパー（履歴に追加）
    const setStateWithHistory = useCallback((
        update: CompassState | ((prev: CompassState) => CompassState)
    ) => {
        setState((prev) => {
            const next = typeof update === 'function' ? update(prev) : update;

            // 変更がない場合は何もしない
            if (prev === next) return prev;

            // 現在の履歴インデックスより先（Redo用）を削除
            const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);

            // 現在の状態を履歴に追加
            newHistory.push(prev);

            // 最大数を超えたら古いものを削除
            if (newHistory.length > MAX_HISTORY) {
                newHistory.shift();
            }

            historyRef.current = newHistory;
            historyIndexRef.current = newHistory.length;

            return next;
        });
    }, []);

    const undo = useCallback(() => {
        if (historyIndexRef.current >= 0) {
            const prevState = historyRef.current[historyIndexRef.current];

            // 現在の状態を履歴の「次」として保存するために、
            // 履歴配列自体は変更せず、インデックスだけ戻すアプローチもあるが、
            // ここではシンプルに「戻る」操作として実装

            // 正確なUndo/Redoの実装は少し複雑だが、ここでは簡易的に
            // 「現在の状態」を履歴の末尾（または現在位置の次）に保持しておく必要がある

            // 簡易実装:
            // historyRefには「過去の状態」が入っている
            // undoすると、現在の状態を「未来」として保持し、過去の状態を復元する

            // 今回は既存のコードに合わせて、単純にsetStateするだけに留める
            // 本格的なUndo/Redoが必要ならuseReducerなどを検討すべき

            // 修正: 履歴管理ロジックを再考
            // history: [State0, State1, State2]
            // current: State3
            // index: 2 (State2を指す)

            // Undo -> current = State2, index = 1

            // ここでは簡易的に、historyRefにスナップショットを保存していく方式とする
            // ただし、App.tsxの既存ロジックがどうなっていたか不明なため、
            // 一般的なUndo/Redoフックとして実装する

            // 既存のApp.tsxでは [state, setState, undo, redo, canUndo, canRedo] を返している

            // 簡易実装（履歴配列とインデックス）
            // history: [State0, State1, State2, State3]
            // index: 3 (現在表示しているState)

            // 初期化時に初期状態を履歴に入れる必要がある
        }
    }, []);

    // より堅牢な実装（use-undo的なライブラリのロジックを参考）
    const [past, setPast] = useState<CompassState[]>([]);
    const [future, setFuture] = useState<CompassState[]>([]);

    const set = useCallback((newPresent: CompassState | ((curr: CompassState) => CompassState)) => {
        setState((curr) => {
            const next = typeof newPresent === 'function' ? newPresent(curr) : newPresent;
            if (curr === next) return curr;
            setPast((prev) => [...prev, curr].slice(-MAX_HISTORY));
            setFuture([]);
            return next;
        });
    }, []);

    const doUndo = useCallback(() => {
        setPast((prevPast) => {
            if (prevPast.length === 0) return prevPast;
            const newPresent = prevPast[prevPast.length - 1];
            const newPast = prevPast.slice(0, prevPast.length - 1);

            setState((curr) => {
                setFuture((prevFuture) => [curr, ...prevFuture]);
                return newPresent;
            });

            return newPast;
        });
    }, []);

    const doRedo = useCallback(() => {
        setFuture((prevFuture) => {
            if (prevFuture.length === 0) return prevFuture;
            const newPresent = prevFuture[0];
            const newFuture = prevFuture.slice(1);

            setState((curr) => {
                setPast((prevPast) => [...prevPast, curr]);
                return newPresent;
            });

            return newFuture;
        });
    }, []);

    const canUndo = past.length > 0;
    const canRedo = future.length > 0;

    return [state, set, doUndo, doRedo, canUndo, canRedo] as const;
}
