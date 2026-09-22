import { describe, expect, it } from 'vitest';
import { minDistanceToSurface, surfaceDistanceField } from '../src/core/measure';
import { suggestSurfaceMask } from '../src/core/surface';
import { generateSimVolume, SIM_SOURCE_COMPLETE } from '../src/core/simdata';

const DIMS: [number, number, number] = [16, 16, 16];
const idx = (x: number, y: number, z: number) => x + 16 * (y + 16 * z);

function surfacePlane(zPlane: number): Uint8Array {
  const m = new Uint8Array(16 * 16 * 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) m[idx(x, y, zPlane)] = 1;
  return m;
}

describe('表面最短物理距离', () => {
  it('平面表面：垂直距离（各向同性）', () => {
    const f = surfaceDistanceField(surfacePlane(0), DIMS, [1, 1, 1]);
    expect(f[idx(8, 8, 5)]).toBeCloseTo(5, 6);
    expect(f[idx(8, 8, 0)]).toBe(0);
  });

  it('各向异性间距：z 向距离按物理长度计', () => {
    const f = surfaceDistanceField(surfacePlane(0), DIMS, [0.5, 0.5, 2.0]);
    expect(f[idx(8, 8, 3)]).toBeCloseTo(6, 6); // 3 层 × 2mm
    // 面内距离：单点表面
    const pt = new Uint8Array(16 * 16 * 16);
    pt[idx(8, 8, 0)] = 1;
    const g = surfaceDistanceField(pt, DIMS, [0.5, 0.5, 2.0]);
    expect(g[idx(10, 8, 0)]).toBeCloseTo(1, 6); // 面内 2 体素 × 0.5mm
  });

  it('对角距离：单点表面到 (1,1,1) 为 √3', () => {
    const m = new Uint8Array(16 * 16 * 16);
    m[idx(0, 0, 0)] = 1;
    const f = surfaceDistanceField(m, DIMS, [1, 1, 1]);
    expect(f[idx(1, 1, 1)]).toBeCloseTo(Math.sqrt(3), 6);
    // 26 邻域网格路径：(0,0,0)→面对角→棱，chamfer 近似 1+√2（非精确欧氏 √5）
    expect(f[idx(2, 1, 0)]).toBeCloseTo(1 + Math.SQRT2, 6);
  });

  it('分量最小距离取全体素最小值', () => {
    const f = surfaceDistanceField(surfacePlane(0), DIMS, [1, 1, 1]);
    const comp = [idx(8, 8, 5), idx(8, 8, 2), idx(8, 8, 9)];
    expect(minDistanceToSurface(comp, f)).toBeCloseTo(2, 6);
  });

  it('无距离场时返回 null', () => {
    expect(minDistanceToSurface([idx(1, 1, 1)], null)).toBeNull();
  });

  it('自动外表面：零件外轮廓计入，气孔内壁不计入', () => {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    const s = suggestSurfaceMask(v, 500);
    const [nx, ny] = v.meta.dims;
    const at = (x: number, y: number, z: number) => s[x + nx * (y + ny * z)];
    // 圆柱外轮廓 (32,12,20)：半径 20，贴外部背景 → 外表面
    expect(at(32, 12, 20)).toBe(1);
    // 气孔 A 内壁 (28,30,20)：贴内部孔洞而非外部背景 → 不是外表面
    expect(at(28, 30, 20)).toBe(0);
    // 零件内部实心处不是表面
    expect(at(32, 32, 20)).toBe(0);
  });
});
