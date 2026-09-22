// 缺陷到零件外表面的最短物理距离（各向异性 + 方向余弦，26 向步进精确欧氏距离）
import {
  type Dims,
  fromLinear,
  voxelDeltaPhysical,
} from './coordinates';
import type { DirectionCosines, Vec3, VoxelSpacing } from './types';

export interface SurfaceDistanceResult {
  /** 最短物理距离 mm；缺陷或表面为空时为 null */
  distanceMm: number | null;
  /** 实现最短距离的体素对（证据） */
  pair: { defect: Vec3; surface: Vec3 } | null;
}

/**
 * 以全部表面体素为多源 Dijkstra，在 26 邻域图上按“体素中心间物理位移长度”加权。
 * 对各向异性间距与旋转方向均成立（边权 = ||direction * (dv .* spacing)||）。
 * 返回每个被访问体素到最近表面体素的物理距离。
 */
export function distanceFieldFromSurface(
  surface: Iterable<number>,
  dims: Dims,
  spacing: VoxelSpacing,
  direction?: DirectionCosines,
): Float64Array {
  const total = dims.x * dims.y * dims.z;
  const dist = new Float64Array(total).fill(Infinity);
  const surfaceArr = [...surface];
  if (surfaceArr.length === 0) return dist;

  // 预算 26 条边的物理长度
  const edgeLen = new Float64Array(26);
  const offs: Vec3[] = [];
  let k = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const dv = { x: dx, y: dy, z: dz };
        offs.push(dv);
        const phys = voxelDeltaPhysical(dv, spacing, direction);
        edgeLen[k] = Math.hypot(phys.x, phys.y, phys.z);
        k++;
      }
    }
  }

  // 简易二叉堆
  const heap: number[] = []; // 存储线性索引，dist 作为键
  const swap = (i: number, j: number) => {
    const t = heap[i];
    heap[i] = heap[j];
    heap[j] = t;
  };
  const push = (idx: number) => {
    heap.push(idx);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (dist[heap[p]] <= dist[heap[i]]) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < heap.length && dist[heap[l]] < dist[heap[best]]) best = l;
        if (r < heap.length && dist[heap[r]] < dist[heap[best]]) best = r;
        if (best === i) break;
        swap(i, best);
        i = best;
      }
    }
    return top;
  };

  for (const s of surfaceArr) {
    dist[s] = 0;
    push(s);
  }

  while (heap.length > 0) {
    const cur = pop();
    const c = fromLinear(cur, dims);
    for (let e = 0; e < offs.length; e++) {
      const o = offs[e];
      const nx = c.x + o.x;
      const ny = c.y + o.y;
      const nz = c.z + o.z;
      if (nx < 0 || nx >= dims.x || ny < 0 || ny >= dims.y || nz < 0 || nz >= dims.z) continue;
      const ni = (nz * dims.y + ny) * dims.x + nx;
      const nd = dist[cur] + edgeLen[e];
      if (nd < dist[ni]) {
        dist[ni] = nd;
        push(ni);
      }
    }
  }
  return dist;
}

/** 从已计算好的距离场中取缺陷体素的最小值并回溯最近表面体素 */
export function minDistanceFromField(
  field: Float64Array,
  defectArr: number[],
  dims: Dims,
): SurfaceDistanceResult {
  let best = Infinity;
  let bestIdx = -1;
  for (const v of defectArr) {
    if (field[v] < best) {
      best = field[v];
      bestIdx = v;
    }
  }
  if (bestIdx < 0 || !Number.isFinite(best)) {
    return { distanceMm: null, pair: null };
  }
  // 回溯最近表面体素（沿最短路径梯度下降）
  let cur = bestIdx;
  let guard = 0;
  const maxSteps = dims.x + dims.y + dims.z + 4;
  while (field[cur] > 0 && guard++ < maxSteps * 3) {
    const c = fromLinear(cur, dims);
    let next = cur;
    let bestD = field[cur];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const nx = c.x + dx;
          const ny = c.y + dy;
          const nz = c.z + dz;
          if (nx < 0 || nx >= dims.x || ny < 0 || ny >= dims.y || nz < 0 || nz >= dims.z) continue;
          const ni = (nz * dims.y + ny) * dims.x + nx;
          if (field[ni] < bestD) {
            bestD = field[ni];
            next = ni;
          }
        }
      }
    }
    if (next === cur) break;
    cur = next;
  }
  return {
    distanceMm: best,
    pair: { defect: fromLinear(bestIdx, dims), surface: fromLinear(cur, dims) },
  };
}

/**
 * 求一组缺陷体素到表面的最短物理距离。
 * 约定：表面体素本身代表“零件表面”，缺陷体素与表面重合时距离为 0（即表面开口/贯穿表面）。
 */
export function minDistanceToSurface(
  defect: Iterable<number>,
  surface: Iterable<number>,
  dims: Dims,
  spacing: VoxelSpacing,
  direction?: DirectionCosines,
): SurfaceDistanceResult {
  const defectArr = [...defect];
  const surfaceSet = new Set(surface);
  if (defectArr.length === 0 || surfaceSet.size === 0) {
    return { distanceMm: null, pair: null };
  }
  const field = distanceFieldFromSurface(surfaceSet, dims, spacing, direction);
  return minDistanceFromField(field, defectArr, dims);
}
