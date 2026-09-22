// 物理量测量：体积、轴对齐包围盒、质心、惯性主轴（物理空间 PCA）
import {
  type Dims,
  fromLinear,
  voxelToPhysical,
} from './coordinates';
import type {
  DefectMeasurement,
  DirectionCosines,
  Origin,
  Vec3,
  VoxelSpacing,
} from './types';

export function voxelVolumeMm3(spacing: VoxelSpacing): number {
  return spacing.x * spacing.y * spacing.z;
}

export function boundingBoxVoxel(voxels: number[], dims: Dims) {
  let min = { x: Infinity, y: Infinity, z: Infinity };
  let max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of voxels) {
    const p = fromLinear(v, dims);
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  return { min, max };
}

// ---------- 3x3 对称矩阵 Jacobi 特征分解 ----------

type Mat3 = number[]; // 行主序长度 9

function jacobiEigen3(a: Mat3): { values: [number, number, number]; vectors: [Vec3, Vec3, Vec3] } {
  const m = a.slice();
  const v: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rot = (p: number, q: number) => {
    const app = m[p * 3 + p];
    const aqq = m[q * 3 + q];
    const apq = m[p * 3 + q];
    if (Math.abs(apq) < 1e-14) return;
    const tau = (aqq - app) / (2 * apq);
    let t: number;
    if (tau >= 0) t = 1 / (tau + Math.sqrt(1 + tau * tau));
    else t = -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    m[p * 3 + p] = app - t * apq;
    m[q * 3 + q] = aqq + t * apq;
    m[p * 3 + q] = 0;
    m[q * 3 + p] = 0;
    for (let k = 0; k < 3; k++) {
      if (k === p || k === q) continue;
      const akp = m[k * 3 + p];
      const akq = m[k * 3 + q];
      m[k * 3 + p] = c * akp - s * akq;
      m[p * 3 + k] = m[k * 3 + p];
      m[k * 3 + q] = s * akp + c * akq;
      m[q * 3 + k] = m[k * 3 + q];
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k * 3 + p];
      const vkq = v[k * 3 + q];
      v[k * 3 + p] = c * vkp - s * vkq;
      v[k * 3 + q] = s * vkp + c * vkq;
    }
  };
  for (let iter = 0; iter < 50; iter++) {
    const off =
      Math.abs(m[1]) + Math.abs(m[2]) + Math.abs(m[5]);
    if (off < 1e-12) break;
    rot(0, 1);
    rot(0, 2);
    rot(1, 2);
  }
  const values: [number, number, number] = [m[0], m[4], m[8]];
  let vectors: [Vec3, Vec3, Vec3] = [
    { x: v[0], y: v[3], z: v[6] },
    { x: v[1], y: v[4], z: v[7] },
    { x: v[2], y: v[5], z: v[8] },
  ];
  // 按特征值降序排列（主惯性扩展从大到小）
  const idx = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  const sv: [number, number, number] = [values[idx[0]], values[idx[1]], values[idx[2]]];
  vectors = [vectors[idx[0]], vectors[idx[1]], vectors[idx[2]]];
  return { values: sv, vectors };
}

/**
 * 计算单缺陷全部物理量。
 * 主轴在物理坐标空间做 PCA：先把体素中心变换到物理坐标（含 spacing 与方向余弦），
 * 再求协方差矩阵，特征值平方根即各主轴方向 RMS 扩展（mm）。
 * surfaceDistance 由调用方注入（距离计算成本高，便于缓存与测试替身）。
 */
export function measureDefect(
  defectId: string,
  voxels: number[],
  dims: Dims,
  spacing: VoxelSpacing,
  origin: Origin,
  direction: DirectionCosines | undefined,
  surfaceDistance?: { distanceMm: number | null; pair: { defect: Vec3; surface: Vec3 } | null },
): DefectMeasurement {
  const n = voxels.length;
  const vv = voxelVolumeMm3(spacing);
  const box = boundingBoxVoxel(voxels, dims);

  // 质心
  let sx = 0;
  let sy = 0;
  let sz = 0;
  const physical: Vec3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = fromLinear(voxels[i], dims);
    sx += v.x;
    sy += v.y;
    sz += v.z;
    physical[i] = voxelToPhysical(v, spacing, origin, direction);
  }
  const centroidVoxel = n > 0 ? { x: sx / n, y: sy / n, z: sz / n } : { x: 0, y: 0, z: 0 };
  let cp = { x: 0, y: 0, z: 0 };
  for (const p of physical) cp = { x: cp.x + p.x, y: cp.y + p.y, z: cp.z + p.z };
  cp = n > 0 ? { x: cp.x / n, y: cp.y / n, z: cp.z / n } : cp;

  // 协方差（物理空间）
  const cov: Mat3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of physical) {
    const d = [p.x - cp.x, p.y - cp.y, p.z - cp.z];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        cov[r * 3 + c] += d[r] * d[c];
      }
    }
  }
  if (n > 0) for (let i = 0; i < 9; i++) cov[i] /= n;
  const eigen = jacobiEigen3(cov);
  // 数值误差可能给出极小负特征值，夹为 0
  const principalAxes = eigen.values.map((lam, i) => ({
    direction: eigen.vectors[i],
    extent: Math.sqrt(Math.max(0, lam)),
  })) as DefectMeasurement['principalAxes'];

  // 包围盒物理尺寸：角点到角点（(max-min+1) 个体素跨度）
  const size: Vec3 = {
    x: (box.max.x - box.min.x + 1) * spacing.x,
    y: (box.max.y - box.min.y + 1) * spacing.y,
    z: (box.max.z - box.min.z + 1) * spacing.z,
  };

  return {
    defectId,
    voxelCount: n,
    volumeMm3: n * vv,
    bbox: { min: box.min, max: box.max, size },
    centroidVoxel,
    centroidPhysical: cp,
    principalAxes,
    surfaceDistanceMm: surfaceDistance?.distanceMm ?? null,
    surfacePair: surfaceDistance?.pair ?? null,
  };
}
