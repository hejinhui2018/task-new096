import { describe, expect, it } from 'vitest';
import { jacobiEigen3, measureComponent } from '../src/core/measure';
import type { VolumeMeta } from '../src/core/types';

function meta(spacing: [number, number, number], origin: [number, number, number] = [0, 0, 0]): VolumeMeta {
  return { dims: [64, 64, 64], spacing, origin, orientation: 'RAS' };
}

const idx = (x: number, y: number, z: number) => x + 64 * (y + 64 * z);

function boxVoxels(x0: number, y0: number, z0: number, nx: number, ny: number, nz: number): number[] {
  const out: number[] = [];
  for (let z = z0; z < z0 + nz; z++)
    for (let y = y0; y < y0 + ny; y++)
      for (let x = x0; x < x0 + nx; x++) out.push(idx(x, y, z));
  return out;
}

describe('物理量测量', () => {
  it('单体素：体积=体素体积，质心=体素中心', () => {
    const m = measureComponent([idx(10, 20, 30)], meta([0.5, 0.5, 0.8], [1, 2, 3]));
    expect(m.voxelCount).toBe(1);
    expect(m.volumeMm3).toBeCloseTo(0.5 * 0.5 * 0.8, 10);
    expect(m.centroidPhys[0]).toBeCloseTo(1 + 10.5 * 0.5, 10);
    expect(m.centroidPhys[1]).toBeCloseTo(2 + 20.5 * 0.5, 10);
    expect(m.centroidPhys[2]).toBeCloseTo(3 + 30.5 * 0.8, 10);
    expect(m.bboxVoxel.min).toEqual([10, 20, 30]);
    expect(m.bboxVoxel.max).toEqual([10, 20, 30]);
  });

  it('4×4×4 立方体：体积、质心、各向同性主轴', () => {
    const m = measureComponent(boxVoxels(10, 10, 10, 4, 4, 4), meta([1, 1, 1]));
    expect(m.voxelCount).toBe(64);
    expect(m.volumeMm3).toBeCloseTo(64, 10);
    expect(m.centroidPhys[0]).toBeCloseTo(12, 10);
    // 立方体三个方向方差相等
    expect(m.eigenvalues[0]).toBeCloseTo(m.eigenvalues[2], 5);
    expect(m.elongation).toBeCloseTo(1, 5);
    expect(m.bboxPhys.max[0]).toBeCloseTo(14, 10);
  });

  it('沿 x 的细长杆：主轴 1 指向 x，细长比大', () => {
    const m = measureComponent(boxVoxels(5, 30, 30, 20, 2, 2), meta([1, 1, 1]));
    const a1 = m.principalAxes[0];
    expect(Math.abs(a1[0])).toBeGreaterThan(0.99);
    expect(m.elongation).toBeGreaterThan(3);
  });

  it('各向异性间距：物理最长轴在 z（体素少但间距大）', () => {
    // z 向 6 层 × 2mm = 12mm；x 向 6 体素 × 0.5mm = 3mm
    const voxels = boxVoxels(10, 10, 10, 6, 1, 6).filter((i) => {
      const z = Math.floor(i / (64 * 64));
      const rem = i - z * 64 * 64;
      const y = Math.floor(rem / 64);
      const x = rem - y * 64;
      return x === 10 && y === 10; // 只留 z 向杆
    });
    const m = measureComponent(voxels, meta([0.5, 0.5, 2.0]));
    const a1 = m.principalAxes[0];
    expect(Math.abs(a1[2])).toBeGreaterThan(0.99);
  });

  it('jacobiEigen3：对角矩阵直接返回特征值', () => {
    const { values, vectors } = jacobiEigen3([
      [3, 0, 0],
      [0, 1, 0],
      [0, 0, 2],
    ]);
    expect(values[0]).toBeCloseTo(3, 10);
    expect(values[1]).toBeCloseTo(2, 10);
    expect(values[2]).toBeCloseTo(1, 10);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(1, 10);
  });

  it('jacobiEigen3：旋转对称矩阵恢复特征值', () => {
    // 主方向沿 (1,1,0)/√2 的椭球 covariance
    const c = Math.SQRT1_2;
    const s2 = 9, s1 = 1; // 特征值 9（沿(1,1,0)）、1、1
    const cov = [
      [(s2 + s1) / 2, (s2 - s1) / 2, 0],
      [(s2 - s1) / 2, (s2 + s1) / 2, 0],
      [0, 0, s1],
    ];
    const { values, vectors } = jacobiEigen3(cov);
    expect(values[0]).toBeCloseTo(9, 8);
    expect(Math.abs(vectors[0][0])).toBeCloseTo(c, 6);
    expect(Math.abs(vectors[0][1])).toBeCloseTo(c, 6);
  });
});
