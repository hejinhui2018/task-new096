import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  deserializeHistory,
  pushHistory,
  redoHistory,
  serializeHistory,
  undoHistory,
} from '../src/core/history';

interface Doc {
  contours: string[];
}

const empty: Doc = { contours: [] };

describe('撤销/重做与历史恢复', () => {
  it('push/undo/redo 基本序列', () => {
    let h = createHistory<Doc>(empty);
    h = pushHistory(h, { contours: ['a'] });
    h = pushHistory(h, { contours: ['a', 'b'] });
    expect(h.present.contours).toEqual(['a', 'b']);
    expect(canUndo(h)).toBe(true);

    h = undoHistory(h);
    expect(h.present.contours).toEqual(['a']);
    h = undoHistory(h);
    expect(h.present.contours).toEqual([]);
    expect(canUndo(h)).toBe(false);

    h = redoHistory(h);
    expect(h.present.contours).toEqual(['a']);
    h = redoHistory(h);
    expect(h.present.contours).toEqual(['a', 'b']);
    expect(canRedo(h)).toBe(false);
  });

  it('新操作清空 redo 分支', () => {
    let h = createHistory<Doc>(empty);
    h = pushHistory(h, { contours: ['a'] });
    h = undoHistory(h);
    h = pushHistory(h, { contours: ['x'] });
    expect(canRedo(h)).toBe(false);
    expect(h.present.contours).toEqual(['x']);
  });

  it('序列化→反序列化后完整恢复（含撤销栈）', () => {
    let h = createHistory<Doc>(empty);
    h = pushHistory(h, { contours: ['a'] });
    h = pushHistory(h, { contours: ['a', 'b'] });
    h = undoHistory(h);

    const restored = deserializeHistory<Doc>(serializeHistory(h), empty);
    expect(restored.present).toEqual(h.present);
    expect(restored.past).toEqual(h.past);
    expect(restored.future).toEqual(h.future);
    // 恢复后仍可 undo/redo
    expect(canUndo(restored)).toBe(true);
    expect(canRedo(restored)).toBe(true);
    expect(redoHistory(restored).present.contours).toEqual(['a', 'b']);
    expect(undoHistory(restored).present.contours).toEqual([]);
  });

  it('损坏数据回退到初始状态', () => {
    const h = deserializeHistory<Doc>('{{{broken', empty);
    expect(h.present).toEqual(empty);
    expect(deserializeHistory<Doc>(null, empty).present).toEqual(empty);
    expect(deserializeHistory<Doc>('{"foo":1}', empty).present).toEqual(empty);
  });

  it('undo 到空栈时状态不变', () => {
    const h = createHistory<Doc>(empty);
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });
});
