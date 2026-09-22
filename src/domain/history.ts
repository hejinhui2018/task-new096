// 通用快照式撤销/重做历史。采用后推入历史，撤销/重做在快照间切换。
export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const DEFAULT_CAP = 100;

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private present: T;
  private readonly cap: number;

  constructor(initial: T, cap = DEFAULT_CAP) {
    this.present = clone(initial);
    this.cap = cap;
  }

  get current(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** 提交一个新状态：当前状态入 past，future 清空。 */
  commit(next: T): void {
    this.past.push(this.present);
    if (this.past.length > this.cap) this.past.shift();
    this.present = clone(next);
    this.future = [];
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev === undefined) return this.present;
    this.future.unshift(this.present);
    this.present = prev;
    return this.present;
  }

  redo(): T {
    const next = this.future.shift();
    if (next === undefined) return this.present;
    this.past.push(this.present);
    this.present = next;
    return this.present;
  }

  snapshot(): HistoryState<T> {
    return {
      past: this.past.map(clone),
      present: clone(this.present),
      future: this.future.map(clone),
    };
  }

  static restore<T>(snapshot: HistoryState<T>): History<T> {
    const h = new History<T>(snapshot.present);
    h.past = snapshot.past.map(clone);
    h.future = snapshot.future.map(clone);
    return h;
  }
}
