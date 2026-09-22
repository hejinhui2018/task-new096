// localStorage 持久化：文档历史快照 + UI 状态；刷新后恢复（含撤销栈）
import { History } from '../domain/history';
import type { DocState, UIState } from './types';

const DOC_KEY = 'ct-review.doc.v1';
const UI_KEY = 'ct-review.ui.v1';

const hasStorage = (): boolean =>
  typeof globalThis !== 'undefined' && typeof (globalThis as { localStorage?: Storage }).localStorage !== 'undefined';

export function saveDoc(history: History<DocState>): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(DOC_KEY, JSON.stringify(history.snapshot()));
  } catch (e) {
    // 配额超限时给出可见告警但不崩溃
    console.warn('文档保存失败（可能超出本地存储配额）：', e);
  }
}

export function loadDoc(): History<DocState> | null {
  if (!hasStorage()) return null;
  const raw = localStorage.getItem(DOC_KEY);
  if (!raw) return null;
  try {
    return History.restore<DocState>(JSON.parse(raw));
  } catch (e) {
    console.warn('文档恢复失败：', e);
    return null;
  }
}

export function clearDoc(): void {
  if (!hasStorage()) return;
  localStorage.removeItem(DOC_KEY);
}

export function saveUI(ui: UIState): void {
  if (!hasStorage()) return;
  try {
    // 候选轮廓属于临时编辑态，不恢复
    const { candidate: _candidate, ...persist } = ui;
    void _candidate;
    localStorage.setItem(UI_KEY, JSON.stringify(persist));
  } catch (e) {
    console.warn('界面状态保存失败：', e);
  }
}

export function loadUI(): Partial<UIState> | null {
  if (!hasStorage()) return null;
  const raw = localStorage.getItem(UI_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<UIState>;
  } catch {
    return null;
  }
}
