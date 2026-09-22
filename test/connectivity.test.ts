import { describe, expect, it } from 'vitest';
import { areNeighbors26, connectedComponents26 } from '../src/domain/connectivity';
import { linearIndex } from '../src/domain/coordinates';

const D = { x: 10, y: 10, z: 10 };
const i = (x: number, y: number, z: number) => linearIndex(x, y, z, D);

describe('26 邻域连通重建', () => {
  it('两个不接触体素为两个分量', () => {
    const cc = connectedComponents26([i(1, 1, 1), i(5, 5, 5)], D);
    expect(cc.length).toBe(2);
  });

  it('共享面/边/角均连通：对角体素属同一分量', () => {
    const cc = connectedComponents26([i(1, 1, 1), i(2, 2, 2)], D);
    expect(cc.length).toBe(1);
    expect(cc[0].voxels.length).toBe(2);
  });

  it('间隔一体素（坐标差 2）在 26 邻域下断开', () => {
    // 这正是“相邻气孔不能误并”的核心：半径边缘相距 2 体素 → 两分量
    const cc = connectedComponents26([i(1, 1, 1), i(3, 1, 1)], D);
    expect(cc.length).toBe(2);
    expect(areNeighbors26(i(1, 1, 1), i(2, 2, 2), D)).toBe(true);
    expect(areNeighbors26(i(1, 1, 1), i(3, 1, 1), D)).toBe(false);
  });

  it('链式桥接的体素全部归为一个分量', () => {
    const chain = [i(0, 0, 0), i(1, 1, 0), i(2, 0, 1), i(3, 1, 2)];
    const cc = connectedComponents26(chain, D);
    expect(cc.length).toBe(1);
    expect(cc[0].voxels.length).toBe(4);
  });

  it('分量体素排序且不重复', () => {
    const cc = connectedComponents26([i(3, 3, 3), i(2, 2, 2), i(4, 4, 4)], D);
    expect(cc.length).toBe(1);
    const v = cc[0].voxels;
    expect(v[0]).toBeLessThan(v[1]);
    expect(new Set(v).size).toBe(v.length);
  });
});
