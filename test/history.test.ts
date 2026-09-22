import { describe, expect, it } from 'vitest';
import { History } from '../src/domain/history';

interface Doc {
  n: number;
  list: number[];
}

describe('快照历史：撤销/重做/恢复', () => {
  it('提交后可撤销、重做', () => {
    const h = new History<Doc>({ n: 0, list: [] });
    h.commit({ n: 1, list: [1] });
    h.commit({ n: 2, list: [1, 2] });
    expect(h.current.n).toBe(2);
    expect(h.canUndo).toBe(true);
    expect(h.undo().n).toBe(1);
    expect(h.undo().n).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.redo().n).toBe(1);
    expect(h.redo().n).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it('撤销后新提交会清空 redo 分支', () => {
    const h = new History<Doc>({ n: 0, list: [] });
    h.commit({ n: 1, list: [] });
    h.commit({ n: 2, list: [] });
    h.undo();
    h.commit({ n: 9, list: [9] });
    expect(h.canRedo).toBe(false);
    expect(h.current.n).toBe(9);
  });

  it('快照为深拷贝，外部改动不污染历史；可序列化恢复', () => {
    const h = new History<Doc>({ n: 0, list: [] });
    const doc: Doc = { n: 1, list: [42] };
    h.commit(doc);
    doc.list.push(99); // 篡改已提交对象
    expect(h.current.list).toEqual([42]);

    h.commit({ n: 2, list: [1, 2] });
    h.undo();
    const snap = h.snapshot();
    const json = JSON.stringify(snap); // 模拟 localStorage 持久化
    const restored = History.restore(JSON.parse(json));
    expect(restored.current).toEqual({ n: 1, list: [42] });
    expect(restored.canRedo).toBe(true);
    expect(restored.redo()).toEqual({ n: 2, list: [1, 2] });
    expect(restored.canUndo).toBe(true);
  });

  it('超出容量时丢弃最早记录', () => {
    const h = new History<number>(0, 3);
    for (let n = 1; n <= 6; n++) h.commit(n);
    expect(h.undo()).toBe(5);
    expect(h.undo()).toBe(4);
    expect(h.undo()).toBe(3);
    expect(h.canUndo).toBe(false); // 0..2 已被丢弃
  });
});
