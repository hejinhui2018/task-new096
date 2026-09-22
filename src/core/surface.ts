/**
 * 外表面建议：按阈值分割零件，取零件体素中与"外部背景"相邻的体素。
 * 外部背景 = 从体数据边界 6 邻域泛洪可达的背景；零件内部孔洞（气孔/裂纹腔）
 * 不属于外部背景，其内壁不计入外表面 —— 否则缺陷到"表面"的距离会被低估。
 */
import type { Volume } from './types';

const DIRS: Array<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function suggestSurfaceMask(volume: Volume, threshold: number): Uint8Array {
  const { dims } = volume.meta;
  const { data } = volume;
  const [nx, ny, nz] = dims;
  const n = nx * ny * nz;
  const part = new Uint8Array(n);
  for (let i = 0; i < n; i++) part[i] = data[i] >= threshold ? 1 : 0;

  // 从边界泛洪标记外部背景
  const exterior = new Uint8Array(n);
  const stack: number[] = [];
  const tryPush = (x: number, y: number, z: number) => {
    const i = x + nx * (y + ny * z);
    if (!part[i] && !exterior[i]) {
      exterior[i] = 1;
      stack.push(i);
    }
  };
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1)
          tryPush(x, y, z);
      }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const cz = Math.floor(cur / (nx * ny));
    const rem = cur - cz * nx * ny;
    const cy = Math.floor(rem / nx);
    const cx = rem - cy * nx;
    for (const [dx, dy, dz] of DIRS) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      tryPush(x, y, z);
    }
  }

  // 外表面 = 与外部背景相邻的零件体素
  const surface = new Uint8Array(n);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = x + nx * (y + ny * z);
        if (!part[i]) continue;
        for (const [dx, dy, dz] of DIRS) {
          const xx = x + dx, yy = y + dy, zz = z + dz;
          if (
            xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz ||
            exterior[xx + nx * (yy + ny * zz)]
          ) {
            surface[i] = 1;
            break;
          }
        }
      }
    }
  }
  return surface;
}

export function countMask(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) c++;
  return c;
}
