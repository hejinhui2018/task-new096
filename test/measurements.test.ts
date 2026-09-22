import { describe, expect, it } from 'vitest';
import { linearIndex } from '../src/domain/coordinates';
import { measureDefect, voxelVolumeMm3 } from '../src/domain/measurements';
import type { DefectMeasurement } from '../src/domain/types';

const D = { x: 20, y: 20, z: 20 };
const SP = { x: 0.5, y: 0.5, z: 0.8 };
const OG = { x: 0, y: 0, z: 0 };
const i = (x: number, y: number, z: number) => linearIndex(x, y, z, D);

describe('物理量测量', () => {
  it('体积 = 体素数 × 各向异性体素体积', () => {
    expect(voxelVolumeMm3(SP)).toBeCloseTo(0.2);
    const voxels = [i(1, 1, 1), i(2, 1, 1), i(3, 1, 1), i(1, 2, 1)];
    const m = measureDefect('d', voxels, D, SP, OG, undefined);
    expect(m.voxelCount).toBe(4);
    expect(m.volumeMm3).toBeCloseTo(0.8); // 4 × 0.5 × 0.5 × 0.8
  });

  it('包围盒物理尺寸按跨度×间距', () => {
    const voxels = [i(2, 3, 4), i(6, 7, 4)];
    const m = measureDefect('d', voxels, D, SP, OG, undefined);
    expect(m.bbox.size.x).toBeCloseTo(5 * 0.5);
    expect(m.bbox.size.y).toBeCloseTo(5 * 0.5);
    expect(m.bbox.size.z).toBeCloseTo(1 * 0.8);
    expect(m.bbox.min).toEqual({ x: 2, y: 3, z: 4 });
    expect(m.bbox.max).toEqual({ x: 6, y: 7, z: 4 });
  });

  it('质心物理坐标含半体素中心与原点', () => {
    const voxels = [i(0, 0, 0), i(2, 0, 0)];
    const m = measureDefect('d', voxels, D, SP, { x: 10, y: 20, z: 30 }, undefined);
    // x 中心 = (0.25 + 1.25) / 2 = 0.75，+origin
    expect(m.centroidPhysical.x).toBeCloseTo(10.75);
    expect(m.centroidPhysical.y).toBeCloseTo(20.25);
    expect(m.centroidPhysical.z).toBeCloseTo(30.4);
  });

  it('沿 x 拉长的缺陷：第一主轴指向 x 且扩展最大', () => {
    const voxels: number[] = [];
    for (let x = 0; x < 10; x++) voxels.push(i(x, 5, 5));
    const m = measureDefect('d', voxels, D, SP, OG, undefined);
    const axes = m.principalAxes;
    const a0 = axes[0];
    expect(Math.abs(a0.direction.x)).toBeCloseTo(1);
    expect(a0.extent).toBeGreaterThan(axes[1].extent);
    expect(axes[1].extent).toBeCloseTo(0, 6);
    expect(axes[2].extent).toBeCloseTo(0, 6);
    // x 方向 RMS 扩展：物理中心 0.25,0.75,...,4.75，均值 2.5
    const devs = Array.from({ length: 10 }, (_, k) => (k + 0.5) * 0.5 - 2.5);
    const expectedRms = Math.sqrt(devs.reduce((s, d) => s + d * d, 0) / 10);
    expect(a0.extent).toBeCloseTo(expectedRms, 5);
  });

  it('注入表面距离结果被透传', () => {
    const m: DefectMeasurement = measureDefect('d', [i(0, 0, 0)], D, SP, OG, undefined, {
      distanceMm: 1.25,
      pair: { defect: { x: 0, y: 0, z: 0 }, surface: { x: 2, y: 0, z: 0 } },
    });
    expect(m.surfaceDistanceMm).toBe(1.25);
    expect(m.surfacePair?.surface).toEqual({ x: 2, y: 0, z: 0 });
  });
});
