import { describe, expect, it } from 'vitest';
import { distanceFieldFromSurface, minDistanceToSurface } from '../src/domain/distance';
import { linearIndex } from '../src/domain/coordinates';

const D = { x: 20, y: 20, z: 20 };
const I = (x: number, y: number, z: number) => linearIndex(x, y, z, D);

describe('到外表面最短物理距离', () => {
  it('单位间距：缺陷到表面墙 3 体素 → 距离 3 mm', () => {
    const surface: number[] = [];
    for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++) surface.push(I(0, y, z));
    const r = minDistanceToSurface([I(3, 10, 10)], surface, D, { x: 1, y: 1, z: 1 });
    expect(r.distanceMm).toBeCloseTo(3);
    expect(r.pair?.defect).toEqual({ x: 3, y: 10, z: 10 });
    expect(r.pair?.surface.x).toBe(0); // 回溯落在表面墙上
  });

  it('各向异性间距：x 间距 0.5 时 2 体素 → 1.0 mm（而非 2）', () => {
    const surface: number[] = [];
    for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++) surface.push(I(10, y, z));
    const r = minDistanceToSurface([I(8, 5, 5)], surface, D, { x: 0.5, y: 0.5, z: 0.8 });
    expect(r.distanceMm).toBeCloseTo(1.0);
  });

  it('对角近路：单源 (3,3,0)，两步对角 2√2 小于四步轴向 4', () => {
    const r = minDistanceToSurface([I(5, 5, 0)], [I(3, 3, 0)], D, { x: 1, y: 1, z: 1 });
    expect(r.distanceMm).toBeCloseTo(2 * Math.SQRT2, 6);
    expect(r.pair?.surface).toEqual({ x: 3, y: 3, z: 0 });
  });

  it('缺陷贴表面 → 距离 0（表面开口/贯穿）', () => {
    const surface = [I(4, 4, 4)];
    const r = minDistanceToSurface([I(4, 4, 4)], surface, D, { x: 1, y: 1, z: 1 });
    expect(r.distanceMm).toBe(0);
  });

  it('无表面标记或空缺陷 → null', () => {
    expect(minDistanceToSurface([I(1, 1, 1)], [], D, { x: 1, y: 1, z: 1 }).distanceMm).toBeNull();
    expect(minDistanceToSurface([], [I(0, 0, 0)], D, { x: 1, y: 1, z: 1 }).distanceMm).toBeNull();
  });

  it('多缺陷体素取整体最小值', () => {
    const surface = [I(0, 10, 10)];
    const r = minDistanceToSurface(
      [I(9, 10, 10), I(4, 10, 10), I(7, 10, 10)],
      surface,
      D,
      { x: 1, y: 1, z: 1 },
    );
    expect(r.distanceMm).toBeCloseTo(4);
    expect(r.pair?.defect.x).toBe(4);
  });

  it('距离场对表面体素为 0，其余按物理权重传播', () => {
    const field = distanceFieldFromSurface([I(5, 5, 5)], D, { x: 2, y: 2, z: 2 });
    expect(field[I(5, 5, 5)]).toBe(0);
    expect(field[I(6, 5, 5)]).toBeCloseTo(2);
    expect(field[I(6, 6, 6)]).toBeCloseTo(2 * Math.sqrt(3), 5);
  });
});
