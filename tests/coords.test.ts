import { describe, expect, it } from 'vitest';
import { planeAxes, planeDims, viewToVoxel, voxelToView } from '../src/core/coords';
import type { Plane } from '../src/core/types';

const PLANES: Plane[] = ['axial', 'coronal', 'sagittal'];

describe('坐标变换：三视图 ↔ 体素', () => {
  it('特定体素在三视图中的投影一致', () => {
    const v: [number, number, number] = [10, 20, 30];
    expect(voxelToView('axial', v)).toEqual({ sliceIndex: 30, u: 10, v: 20 });
    expect(voxelToView('coronal', v)).toEqual({ sliceIndex: 20, u: 10, v: 30 });
    expect(voxelToView('sagittal', v)).toEqual({ sliceIndex: 10, u: 20, v: 30 });
  });

  it('viewToVoxel 与 voxelToView 互为逆映射（遍历抽样）', () => {
    for (const plane of PLANES) {
      for (const [x, y, z] of [[0, 0, 0], [5, 3, 9], [63, 47, 31], [12, 34, 1]] as const) {
        const p = voxelToView(plane, [x, y, z]);
        expect(viewToVoxel(plane, p.sliceIndex, p.u, p.v)).toEqual([x, y, z]);
      }
    }
  });

  it('同一视图内 (u,v,slice) 往返一致', () => {
    for (const plane of PLANES) {
      const back = voxelToView(plane, viewToVoxel(plane, 7, 11, 13));
      expect(back).toEqual({ sliceIndex: 7, u: 11, v: 13 });
    }
  });

  it('planeDims 给出正确的视图尺寸与层数', () => {
    const dims: [number, number, number] = [64, 48, 32];
    expect(planeDims(dims, 'axial')).toEqual({ nu: 64, nv: 48, slices: 32 });
    expect(planeDims(dims, 'coronal')).toEqual({ nu: 64, nv: 32, slices: 48 });
    expect(planeDims(dims, 'sagittal')).toEqual({ nu: 48, nv: 32, slices: 64 });
  });

  it('planeAxes 法向轴正确', () => {
    expect(planeAxes('axial').normal).toBe('z');
    expect(planeAxes('coronal').normal).toBe('y');
    expect(planeAxes('sagittal').normal).toBe('x');
  });
});
