// 体素掩膜集合与 26 邻域连通分量重建
import {
  type Dims,
  fromLinear,
  inBounds,
  linearIndex,
  NEIGHBOR_OFFSETS_26,
} from './coordinates';
import type { ConnectedComponent } from './types';

/** 体素线性索引集合（Uint32 范围内由调用方保证） */
export class VoxelSet {
  private readonly set: Set<number>;

  constructor(voxels?: Iterable<number>) {
    this.set = new Set(voxels);
  }

  has(i: number): boolean {
    return this.set.has(i);
  }
  add(i: number): void {
    this.set.add(i);
  }
  delete(i: number): void {
    this.set.delete(i);
  }
  get size(): number {
    return this.set.size;
  }
  toArray(): number[] {
    return [...this.set];
  }
  values(): IterableIterator<number> {
    return this.set.values();
  }
  union(other: VoxelSet): VoxelSet {
    const out = new VoxelSet(this.set);
    for (const v of other.values()) out.add(v);
    return out;
  }
}

/**
 * 按 26 邻域（共享面/边/角）求连通分量。
 * 输入：被标记为缺陷的体素线性索引；输出各分量的体素列表（按发现顺序排序）。
 */
export function connectedComponents26(
  voxels: Iterable<number>,
  dims: Dims,
): ConnectedComponent[] {
  const membership = new Set<number>(voxels);
  const total = dims.x * dims.y * dims.z;
  const visited = new Uint8Array(total);
  const components: ConnectedComponent[] = [];
  let compSeq = 0;

  for (const seed of membership) {
    if (visited[seed]) continue;
    compSeq += 1;
    const queue: number[] = [seed];
    visited[seed] = 1;
    const group: number[] = [];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      group.push(cur);
      const c = fromLinear(cur, dims);
      for (const o of NEIGHBOR_OFFSETS_26) {
        const n = { x: c.x + o.x, y: c.y + o.y, z: c.z + o.z };
        if (!inBounds(n, dims)) continue;
        const ni = linearIndex(n.x, n.y, n.z, dims);
        if (!visited[ni] && membership.has(ni)) {
          visited[ni] = 1;
          queue.push(ni);
        }
      }
    }
    group.sort((a, b) => a - b);
    components.push({ id: `cc-${compSeq}`, voxels: group });
  }
  return components;
}

/** 两个体素是否 26 邻接（仅看坐标差） */
export function areNeighbors26(a: number, b: number, dims: Dims): boolean {
  const va = fromLinear(a, dims);
  const vb = fromLinear(b, dims);
  return (
    Math.abs(va.x - vb.x) <= 1 &&
    Math.abs(va.y - vb.y) <= 1 &&
    Math.abs(va.z - vb.z) <= 1 &&
    a !== b
  );
}
