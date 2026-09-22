import { describe, expect, it } from 'vitest';
import { labelComponents } from '../src/core/connectivity';

const DIMS: [number, number, number] = [8, 8, 8];
const idx = (x: number, y: number, z: number) => x + 8 * (y + 8 * z);

function maskOf(points: Array<[number, number, number]>): Uint8Array {
  const m = new Uint8Array(8 * 8 * 8);
  for (const [x, y, z] of points) m[idx(x, y, z)] = 1;
  return m;
}

describe('26 邻域连通分量', () => {
  it('面相邻连通', () => {
    const r = labelComponents(maskOf([[1, 1, 1], [2, 1, 1]]), DIMS);
    expect(r.count).toBe(1);
    expect(r.sizes[1]).toBe(2);
  });

  it('面内对角 (1,1,0) 连通（26 邻域含棱）', () => {
    const r = labelComponents(maskOf([[0, 0, 0], [1, 1, 0]]), DIMS);
    expect(r.count).toBe(1);
  });

  it('体对角 (1,1,1) 连通（26 邻域含角）', () => {
    const r = labelComponents(maskOf([[0, 0, 0], [1, 1, 1]]), DIMS);
    expect(r.count).toBe(1);
  });

  it('间隔 1 个体素则不连通', () => {
    const r = labelComponents(maskOf([[0, 0, 0], [2, 0, 0]]), DIMS);
    expect(r.count).toBe(2);
  });

  it('两个相邻气孔（间隙 2 体素）应判为两个缺陷', () => {
    // 模拟数据中的 poreA/poreB：球心距 7，半径各 2.5，表面间隙 2
    const pts: Array<[number, number, number]> = [];
    for (let z = 0; z < 8; z++)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          if (Math.hypot(x - 1, y - 4, z - 4) <= 1.5) pts.push([x, y, z]);
          if (Math.hypot(x - 5, y - 4, z - 4) <= 1.5) pts.push([x, y, z]);
        }
    const r = labelComponents(maskOf(pts), DIMS);
    expect(r.count).toBe(2);
  });

  it('桥接体素使两团合并为一个分量', () => {
    const r = labelComponents(maskOf([[0, 0, 0], [2, 0, 0], [1, 0, 0]]), DIMS);
    expect(r.count).toBe(1);
    expect(r.sizes[1]).toBe(3);
  });

  it('空掩膜无分量', () => {
    const r = labelComponents(new Uint8Array(512), DIMS);
    expect(r.count).toBe(0);
  });
});
