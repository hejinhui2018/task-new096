/**
 * 三正交视图与体素坐标之间的双向映射。
 *
 * 视图逻辑坐标 (u, v)：
 *  - axial   （横断，法向 z）：u = x, v = y
 *  - coronal （冠状， 法向 y）：u = x, v = z
 *  - sagittal（矢状， 法向 x）：u = y, v = z
 * 渲染层可自行决定是否翻转 v 轴显示；这里的映射与显示翻转无关，保证三视图指向同一体素。
 */
import type { Plane } from './types';

export type Axis = 'x' | 'y' | 'z';

export interface PlaneAxes {
  u: Axis;
  v: Axis;
  normal: Axis;
}

export function planeAxes(plane: Plane): PlaneAxes {
  switch (plane) {
    case 'axial':
      return { u: 'x', v: 'y', normal: 'z' };
    case 'coronal':
      return { u: 'x', v: 'z', normal: 'y' };
    case 'sagittal':
      return { u: 'y', v: 'z', normal: 'x' };
  }
}

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** 视图逻辑坐标 + 层索引 → 体素坐标 [x, y, z] */
export function viewToVoxel(
  plane: Plane,
  sliceIndex: number,
  u: number,
  v: number,
): [number, number, number] {
  const axes = planeAxes(plane);
  const out: [number, number, number] = [0, 0, 0];
  out[AXIS_INDEX[axes.u]] = u;
  out[AXIS_INDEX[axes.v]] = v;
  out[AXIS_INDEX[axes.normal]] = sliceIndex;
  return out;
}

/** 体素坐标 → 某视图下的 { sliceIndex, u, v } */
export function voxelToView(
  plane: Plane,
  voxel: [number, number, number],
): { sliceIndex: number; u: number; v: number } {
  const axes = planeAxes(plane);
  return {
    sliceIndex: voxel[AXIS_INDEX[axes.normal]],
    u: voxel[AXIS_INDEX[axes.u]],
    v: voxel[AXIS_INDEX[axes.v]],
  };
}

/** 某视图的图像尺寸 [nu, nv] 与层数 */
export function planeDims(
  dims: [number, number, number],
  plane: Plane,
): { nu: number; nv: number; slices: number } {
  const axes = planeAxes(plane);
  return {
    nu: dims[AXIS_INDEX[axes.u]],
    nv: dims[AXIS_INDEX[axes.v]],
    slices: dims[AXIS_INDEX[axes.normal]],
  };
}

/** 该平面内一层体素的线性索引列表（用于把轮廓栅格化到体掩膜） */
export function planeSliceIndices(
  dims: [number, number, number],
  plane: Plane,
  sliceIndex: number,
): { nu: number; nv: number; indexOf: (u: number, v: number) => number } {
  const { nu, nv } = planeDims(dims, plane);
  return {
    nu,
    nv,
    indexOf: (u, v) => {
      const [x, y, z] = viewToVoxel(plane, sliceIndex, u, v);
      return x + dims[0] * (y + dims[1] * z);
    },
  };
}
