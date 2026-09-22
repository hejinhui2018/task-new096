// 掩膜操作：三视图轮廓 → 体素层；表面/缺陷掩膜合并与擦除
import { type Dims, linearIndex, planeToVoxel, VIEW_LAYOUTS } from './coordinates';
import { rasterizeContour } from './geometry';
import type { ViewId } from './types';

/** 视图平面的像素网格尺寸（a 方向像素数 × b 方向像素数） */
export function planeSize(view: ViewId, dims: Dims): { width: number; height: number } {
  const { axisA, axisB } = VIEW_LAYOUTS[view];
  return { width: dims[axisA], height: dims[axisB] };
}

/**
 * 将某视图某一深度层上的闭合多边形光栅化，并映射为体素线性索引。
 * 这是“三视图编辑映射到同一体素坐标”的关键入口：
 * axial 深度=z、sagittal 深度=x、coronal 深度=y，最终都写入统一的 x/y/z 体素空间。
 */
export function contourToVoxels(
  view: ViewId,
  depth: number,
  points: { a: number; b: number }[],
  dims: Dims,
): number[] {
  const { width, height } = planeSize(view, dims);
  const pixels = rasterizeContour(points, { width, height });
  const out: number[] = [];
  for (const px of pixels) {
    const a = px % width;
    const b = Math.floor(px / width);
    const v = planeToVoxel(view, { a, b }, depth);
    if (
      v.x < 0 || v.x >= dims.x ||
      v.y < 0 || v.y >= dims.y ||
      v.z < 0 || v.z >= dims.z
    ) {
      continue;
    }
    out.push(linearIndex(v.x, v.y, v.z, dims));
  }
  return out;
}

/** 笔刷涂抹：平面单点（可带半径）→ 体素索引 */
export function brushToVoxels(
  view: ViewId,
  depth: number,
  a: number,
  b: number,
  radius: number,
  dims: Dims,
): number[] {
  const out: number[] = [];
  const r = Math.max(0, Math.round(radius));
  for (let db = -r; db <= r; db++) {
    for (let da = -r; da <= r; da++) {
      if (da * da + db * db > r * r + r) continue;
      const v = planeToVoxel(view, { a: a + da, b: b + db }, depth);
      if (
        v.x < 0 || v.x >= dims.x ||
        v.y < 0 || v.y >= dims.y ||
        v.z < 0 || v.z >= dims.z
      ) {
        continue;
      }
      out.push(linearIndex(v.x, v.y, v.z, dims));
    }
  }
  return out;
}

/** 合并多个体素列表并去重排序 */
export function mergeVoxels(lists: Iterable<number>[]): number[] {
  const set = new Set<number>();
  for (const list of lists) for (const v of list) set.add(v);
  return [...set].sort((a, b) => a - b);
}

/** 从基础集合中移除若干体素 */
export function subtractVoxels(base: Iterable<number>, remove: Iterable<number>): number[] {
  const rm = new Set(remove);
  const out: number[] = [];
  for (const v of base) if (!rm.has(v)) out.push(v);
  return out.sort((a, b) => a - b);
}
