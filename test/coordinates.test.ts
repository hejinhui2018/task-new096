import { describe, expect, it } from 'vitest';
import {
  applyDirection,
  fromLinear,
  linearIndex,
  planeToVoxel,
  validateDirection,
  voxelDeltaPhysical,
  voxelToPhysical,
  voxelToPlane,
} from '../src/domain/coordinates';

const D = { x: 10, y: 8, z: 6 };

describe('线性索引', () => {
  it('与体素坐标双向一致', () => {
    const samples = [
      { x: 0, y: 0, z: 0 },
      { x: 9, y: 7, z: 5 },
      { x: 3, y: 2, z: 4 },
    ];
    for (const v of samples) {
      const i = linearIndex(v.x, v.y, v.z, D);
      expect(fromLinear(i, D)).toEqual(v);
    }
    expect(linearIndex(0, 0, 0, D)).toBe(0);
    expect(linearIndex(9, 7, 5, D)).toBe(10 * 8 * 6 - 1);
  });
});

describe('体素→物理坐标', () => {
  it('单位间距、零原点时取体素中心', () => {
    const p = voxelToPhysical({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 });
    expect(p).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it('应用各向异性间距与原点平移', () => {
    const p = voxelToPhysical(
      { x: 2, y: 4, z: 1 },
      { x: 0.5, y: 0.5, z: 0.8 },
      { x: -12, y: -12, z: 0 },
    );
    expect(p.x).toBeCloseTo(-10.75);
    expect(p.y).toBeCloseTo(-9.75);
    expect(p.z).toBeCloseTo(1.2);
  });

  it('方向矩阵旋转 90°：x 轴体素位移落到物理 y 轴', () => {
    // 绕 z 旋转 +90°：i->+Y, j->-X。列向量：第1列=(0,1,0)，第2列=(-1,0,0)
    const rot = [0, -1, 0, 1, 0, 0, 0, 0, 1];
    expect(validateDirection(rot).valid).toBe(true);
    const d = voxelDeltaPhysical({ x: 1, y: 0, z: 0 }, { x: 2, y: 3, z: 4 }, rot);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(2);
    const d2 = voxelDeltaPhysical({ x: 0, y: 1, z: 0 }, { x: 2, y: 3, z: 4 }, rot);
    expect(d2.x).toBeCloseTo(-3);
    expect(d2.y).toBeCloseTo(0);
    const applied = applyDirection(rot, { x: 1, y: 2, z: 3 });
    expect(applied).toEqual({ x: -2, y: 1, z: 3 });
  });
});

describe('方向元数据校验', () => {
  it('接受单位阵与合法旋转', () => {
    expect(validateDirection(undefined).valid).toBe(true);
    expect(validateDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]).valid).toBe(true);
  });

  it('拒绝镜像（det=-1）', () => {
    const mirror = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
    const r = validateDirection(mirror);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('行列式');
  });

  it('拒绝非正交矩阵', () => {
    const skew = [1, 1, 0, 0, 1, 0, 0, 0, 1];
    expect(validateDirection(skew).valid).toBe(false);
  });

  it('拒绝错误长度', () => {
    expect(validateDirection([1, 0, 0, 1]).valid).toBe(false);
  });
});

describe('三视图平面映射', () => {
  it('三个视图与体素坐标互逆', () => {
    const v = { x: 3, y: 5, z: 2 };
    for (const view of ['axial', 'sagittal', 'coronal'] as const) {
      const { point, depth } = voxelToPlane(view, v);
      const back = planeToVoxel(view, point, depth);
      expect(back).toEqual(v);
    }
  });

  it('axial 平面 (a,b)=x,y 且深度为 z', () => {
    expect(planeToVoxel('axial', { a: 7, b: 4 }, 9)).toEqual({ x: 7, y: 4, z: 9 });
    expect(voxelToPlane('sagittal', { x: 1, y: 2, z: 3 })).toEqual({
      point: { a: 2, b: 3 },
      depth: 1,
    });
    expect(voxelToPlane('coronal', { x: 1, y: 2, z: 3 })).toEqual({
      point: { a: 1, b: 3 },
      depth: 2,
    });
  });
});
