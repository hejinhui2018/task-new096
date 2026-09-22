/**
 * 26 邻域连通分量标记（三维，面/棱/角相邻均算连通）。
 */
export interface LabelResult {
  /** 与掩膜等长，0 = 背景，1..count = 分量编号 */
  labels: Int32Array;
  count: number;
  /** 每个分量的体素数（下标从 1 开始有效） */
  sizes: number[];
}

/** 26 邻域偏移（含自身除外的全部 3^3-1 个邻居） */
export const NEIGHBORS_26: ReadonlyArray<readonly [number, number, number]> = (() => {
  const out: Array<[number, number, number]> = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push([dx, dy, dz]);
      }
  return out;
})();

export function labelComponents(
  mask: Uint8Array,
  dims: [number, number, number],
): LabelResult {
  const [nx, ny, nz] = dims;
  const labels = new Int32Array(mask.length);
  const sizes: number[] = [0];
  let count = 0;
  const stack = new Int32Array(mask.length);

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || labels[i] !== 0) continue;
    count++;
    let size = 0;
    let sp = 0;
    stack[sp++] = i;
    labels[i] = count;
    while (sp > 0) {
      const cur = stack[--sp];
      size++;
      const cz = Math.floor(cur / (nx * ny));
      const rem = cur - cz * nx * ny;
      const cy = Math.floor(rem / nx);
      const cx = rem - cy * nx;
      for (const [dx, dy, dz] of NEIGHBORS_26) {
        const x = cx + dx, y = cy + dy, z = cz + dz;
        if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
        const j = x + nx * (y + ny * z);
        if (mask[j] !== 0 && labels[j] === 0) {
          labels[j] = count;
          stack[sp++] = j;
        }
      }
    }
    sizes.push(size);
  }
  return { labels, count, sizes };
}

/** 收集某分量的全部体素索引 */
export function componentVoxels(labels: Int32Array, id: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < labels.length; i++) if (labels[i] === id) out.push(i);
  return out;
}
