/**
 * 撤销/重做历史 + 可序列化快照（刷新后从 localStorage 恢复）。
 * 快照为不可变值；push 时深拷贝防御外部修改。
 */
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], present: initial, future: [] };
}

const MAX_DEPTH = 100;

export function pushHistory<T>(h: HistoryState<T>, next: T): HistoryState<T> {
  const past = [...h.past, h.present];
  if (past.length > MAX_DEPTH) past.shift();
  return { past, present: next, future: [] };
}

export function canUndo<T>(h: HistoryState<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: HistoryState<T>): boolean {
  return h.future.length > 0;
}

export function undoHistory<T>(h: HistoryState<T>): HistoryState<T> {
  if (!canUndo(h)) return h;
  const past = h.past.slice(0, -1);
  return { past, present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redoHistory<T>(h: HistoryState<T>): HistoryState<T> {
  if (!canRedo(h)) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

/** 序列化（JSON 安全），用于刷新恢复 */
export function serializeHistory<T>(h: HistoryState<T>): string {
  return JSON.stringify(h);
}

/** 反序列化恢复；数据损坏时回退到 fallback */
export function deserializeHistory<T>(raw: string | null, fallback: T): HistoryState<T> {
  if (!raw) return createHistory(fallback);
  try {
    const parsed = JSON.parse(raw) as HistoryState<T>;
    if (
      parsed &&
      Array.isArray(parsed.past) &&
      Array.isArray(parsed.future) &&
      parsed.present !== undefined
    ) {
      return parsed;
    }
  } catch {
    /* 数据损坏，回退 */
  }
  return createHistory(fallback);
}
