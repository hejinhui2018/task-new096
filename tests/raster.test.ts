import { describe, expect, it } from 'vitest';
import { isClosedContour, pointInPolygon, rasterizeContours } from '../src/core/raster';
import { computeDerived } from '../src/state/derived';
import { generateSimVolume, SIM_SOURCE_COMPLETE, SIM_TRUTH } from '../src/core/simdata';
import type { Contour } from '../src/core/types';

const DIMS: [number, number, number] = [16, 16, 16];

describe('轮廓栅格化', () => {
  it('闭合性判定：≥3 点且显式闭合', () => {
    expect(isClosedContour([[0, 0], [4, 0], [4, 4]], true)).toBe(true);
    expect(isClosedContour([[0, 0], [4, 0]], true)).toBe(false);
    expect(isClosedContour([[0, 0], [4, 0], [4, 4]], false)).toBe(false);
  });

  it('点-in-多边形', () => {
    const sq: Array<[number, number]> = [[2, 2], [6, 2], [6, 6], [2, 6]];
    expect(pointInPolygon(4, 4, sq)).toBe(true);
    expect(pointInPolygon(8, 4, sq)).toBe(false);
    expect(pointInPolygon(2.2, 4, sq)).toBe(true); // 边界容差
  });

  it('方形轮廓栅格化到正确切片', () => {
    const c: Contour = {
      id: 'c1', kind: 'defect', plane: 'axial', sliceIndex: 3,
      points: [[2, 2], [6, 2], [6, 6], [2, 6]], closed: true,
    };
    const mask = new Uint8Array(16 * 16 * 16);
    rasterizeContours([c], DIMS, mask, 'defect');
    let count = 0;
    for (let z = 0; z < 16; z++)
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const v = mask[x + 16 * (y + 16 * z)];
          if (v) {
            count++;
            expect(z).toBe(3);
            expect(x).toBeGreaterThanOrEqual(2);
            expect(x).toBeLessThanOrEqual(5);
            expect(y).toBeGreaterThanOrEqual(2);
            expect(y).toBeLessThanOrEqual(5);
          }
        }
    expect(count).toBe(16); // 中心落在 [2.5,5.5]² 的 4×4
  });

  it('未闭合轮廓不被栅格化', () => {
    const c: Contour = {
      id: 'c2', kind: 'defect', plane: 'axial', sliceIndex: 3,
      points: [[2, 2], [6, 2], [6, 6]], closed: false,
    };
    const mask = new Uint8Array(16 * 16 * 16);
    rasterizeContours([c], DIMS, mask, 'defect');
    expect(mask.every((v) => v === 0)).toBe(true);
  });

  it('冠状面轮廓写入正确的 y 层', () => {
    const c: Contour = {
      id: 'c3', kind: 'surface', plane: 'coronal', sliceIndex: 7,
      points: [[4, 4], [8, 4], [8, 8], [4, 8]], closed: true,
    };
    const mask = new Uint8Array(16 * 16 * 16);
    rasterizeContours([c], DIMS, mask, 'surface');
    expect(mask[5 + 16 * (7 + 16 * 5)]).toBe(1); // (x=5, y=7, z=5)：冠状面 sliceIndex 是 y
    expect(mask[5 + 16 * (8 + 16 * 5)]).toBe(0);
  });
});

describe('派生管线（模拟数据集成）', () => {
  it('勾画相邻气孔 → 两个独立缺陷，定量与表面距离可用', () => {
    const volume = generateSimVolume(SIM_SOURCE_COMPLETE);
    const contours: Contour[] = [];
    const mk = (cx: number, cy: number, z: number, r: number, id: string): Contour => ({
      id, kind: 'defect', plane: 'axial', sliceIndex: z,
      points: [
        [cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r],
      ],
      closed: true,
    });
    // 在两个气孔各自的核心层勾画
    let n = 0;
    for (const z of [19, 20, 21]) {
      contours.push(mk(SIM_TRUTH.poreA.center[0], SIM_TRUTH.poreA.center[1], z, 2.6, `a${n++}`));
      contours.push(mk(SIM_TRUTH.poreB.center[0], SIM_TRUTH.poreB.center[1], z, 2.6, `b${n++}`));
    }
    const d = computeDerived(volume, contours, true);
    expect(d.gates.quantitativeAllowed).toBe(true);
    expect(d.defects.length).toBe(2); // 相邻但不连通
    for (const def of d.defects) {
      expect(def.measurements.volumeMm3).toBeGreaterThan(0);
      expect(def.minSurfaceDistance).not.toBeNull();
      // 气孔距圆柱表面约 (20 - 7.3) * 0.5 ≈ 6.4mm，允许容差
      expect(def.minSurfaceDistance!).toBeGreaterThan(3);
      expect(def.minSurfaceDistance!).toBeLessThan(10);
      expect(def.slicesByPlane.axial).toEqual([19, 20, 21]);
    }
  });

  it('缺层变体阻断派生定量结论', () => {
    const volume = generateSimVolume('sim-missing-slice');
    const c: Contour = {
      id: 'x', kind: 'defect', plane: 'axial', sliceIndex: 10,
      points: [[10, 10], [14, 10], [14, 14], [10, 14]], closed: true,
    };
    const d = computeDerived(volume, [c], true);
    expect(d.gates.quantitativeAllowed).toBe(false);
    expect(d.defects[0].minSurfaceDistance).toBeNull();
  });
});
