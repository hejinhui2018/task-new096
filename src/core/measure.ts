/**
 * 定量测量：体积、包围盒、质心、主轴（协方差特征分解）、到外表面最短物理距离。
 * 全部为纯函数，输入体素索引列表 + 体素间距。
 */
import type { Vec3, VolumeMeta } from './types';
import { NEIGHBORS_26 } from './connectivity';

export interface ComponentMeasurements {
  voxelCount: number;
  volumeMm3: number;
  bboxVoxel: { min: Vec3; max: Vec3 };
  bboxPhys: { min: Vec3; max: Vec3 };
  centroidPhys: Vec3;
  /** 三个单位特征向量（按特征值降序），物理坐标系下 */
  principalAxes: [Vec3, Vec3, Vec3];
  /** 对应特征值（mm²，惯性矩意义下的方差） */
  eigenvalues: Vec3;
  /** 长/短轴比（最大特征值 / 最小特征值 的平方根），裂纹越细长越大 */
  elongation: number;
}

function idxToXYZ(dims: [number, number, number], i: number): Vec3 {
  const [nx, ny] = dims;
  const z = Math.floor(i / (nx * ny));
  const rem = i - z * nx * ny;
  const y = Math.floor(rem / nx);
  return [rem - y * nx, y, z];
}

/** 对称 3x3 矩阵 Jacobi 特征分解，返回 [特征值降序, 对应特征向量列] */
export function jacobiEigen3(m: number[][]): { values: Vec3; vectors: [Vec3, Vec3, Vec3] } {
  const a = [m[0].slice(), m[1].slice(), m[2].slice()];
  let v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 64; sweep++) {
    // 找最大非对角元
    let p = 0, q = 1, max = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > max) { p = 0; q = 2; max = Math.abs(a[0][2]); }
    if (Math.abs(a[1][2]) > max) { p = 1; q = 2; max = Math.abs(a[1][2]); }
    if (max < 1e-12) break;
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(theta), s = Math.sin(theta);
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p], akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k], aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p], vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  const values: Vec3 = [a[order[0]][order[0]], a[order[1]][order[1]], a[order[2]][order[2]]];
  const vectors: [Vec3, Vec3, Vec3] = [
    [v[0][order[0]], v[1][order[0]], v[2][order[0]]],
    [v[0][order[1]], v[1][order[1]], v[2][order[1]]],
    [v[0][order[2]], v[1][order[2]], v[2][order[2]]],
  ];
  return { values, vectors };
}

export function measureComponent(
  voxels: number[],
  meta: VolumeMeta,
): ComponentMeasurements {
  const { dims, spacing, origin } = meta;
  const n = voxels.length;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const sum: Vec3 = [0, 0, 0];
  const phys: Vec3[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const [x, y, z] = idxToXYZ(dims, voxels[k]);
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    const p: Vec3 = [
      origin[0] + (x + 0.5) * spacing[0],
      origin[1] + (y + 0.5) * spacing[1],
      origin[2] + (z + 0.5) * spacing[2],
    ];
    phys[k] = p;
    sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2];
  }
  const centroid: Vec3 = [sum[0] / n, sum[1] / n, sum[2] / n];
  // 协方差（物理坐标）
  let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
  for (const p of phys) {
    const dx = p[0] - centroid[0], dy = p[1] - centroid[1], dz = p[2] - centroid[2];
    c00 += dx * dx; c01 += dx * dy; c02 += dx * dz;
    c11 += dy * dy; c12 += dy * dz; c22 += dz * dz;
  }
  const cov = [
    [c00 / n, c01 / n, c02 / n],
    [c01 / n, c11 / n, c12 / n],
    [c02 / n, c12 / n, c22 / n],
  ];
  const { values, vectors } = jacobiEigen3(cov);
  const bboxPhys = {
    min: [
      origin[0] + min[0] * spacing[0],
      origin[1] + min[1] * spacing[1],
      origin[2] + min[2] * spacing[2],
    ] as Vec3,
    max: [
      origin[0] + (max[0] + 1) * spacing[0],
      origin[1] + (max[1] + 1) * spacing[1],
      origin[2] + (max[2] + 1) * spacing[2],
    ] as Vec3,
  };
  const evMin = Math.max(values[2], 1e-12);
  return {
    voxelCount: n,
    volumeMm3: n * spacing[0] * spacing[1] * spacing[2],
    bboxVoxel: { min, max },
    bboxPhys,
    centroidPhys: centroid,
    principalAxes: vectors,
    eigenvalues: values,
    elongation: Math.sqrt(Math.max(values[0], 0) / evMin),
  };
}

/**
 * 多源 Dijkstra 计算全场到外表面掩膜的最短物理距离（mm）。
 * 26 邻域，边长 = 各向异性间距下的真实欧氏长度。
 */
export function surfaceDistanceField(
  surfaceMask: Uint8Array,
  dims: [number, number, number],
  spacing: Vec3,
): Float32Array {
  const [nx, ny, nz] = dims;
  const dist = new Float32Array(nx * ny * nz).fill(Infinity);
  // 简单二叉堆
  const heapIdx: number[] = [];
  const heapKey: number[] = [];
  const push = (i: number, d: number) => {
    heapIdx.push(i); heapKey.push(d);
    let c = heapIdx.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heapKey[p] <= heapKey[c]) break;
      [heapKey[p], heapKey[c]] = [heapKey[c], heapKey[p]];
      [heapIdx[p], heapIdx[c]] = [heapIdx[c], heapIdx[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heapIdx[0];
    const li = heapIdx.pop()!, lk = heapKey.pop()!;
    if (heapIdx.length > 0) {
      heapIdx[0] = li; heapKey[0] = lk;
      let c = 0;
      for (;;) {
        let s = c;
        const l = 2 * c + 1, r = l + 1;
        if (l < heapKey.length && heapKey[l] < heapKey[s]) s = l;
        if (r < heapKey.length && heapKey[r] < heapKey[s]) s = r;
        if (s === c) break;
        [heapKey[s], heapKey[c]] = [heapKey[c], heapKey[s]];
        [heapIdx[s], heapIdx[c]] = [heapIdx[c], heapIdx[s]];
        c = s;
      }
    }
    return top;
  };

  for (let i = 0; i < surfaceMask.length; i++) {
    if (surfaceMask[i] !== 0) { dist[i] = 0; push(i, 0); }
  }
  const edgeLen = NEIGHBORS_26.map(([dx, dy, dz]) =>
    Math.hypot(dx * spacing[0], dy * spacing[1], dz * spacing[2]),
  );
  while (heapIdx.length > 0) {
    const cur = pop();
    const d = dist[cur];
    const cz = Math.floor(cur / (nx * ny));
    const rem = cur - cz * nx * ny;
    const cy = Math.floor(rem / nx);
    const cx = rem - cy * nx;
    for (let k = 0; k < NEIGHBORS_26.length; k++) {
      const [dx, dy, dz] = NEIGHBORS_26[k];
      const x = cx + dx, y = cy + dy, z = cz + dz;
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const j = x + nx * (y + ny * z);
      const nd = d + edgeLen[k];
      if (nd < dist[j] - 1e-9) {
        dist[j] = nd;
        push(j, nd);
      }
    }
  }
  return dist;
}

/** 分量到外表面掩膜的最短物理距离（mm）；无表面掩膜时返回 null */
export function minDistanceToSurface(
  voxels: number[],
  distField: Float32Array | null,
): number | null {
  if (!distField) return null;
  let m = Infinity;
  for (const i of voxels) if (distField[i] < m) m = distField[i];
  return m;
}
