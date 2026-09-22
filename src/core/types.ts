/**
 * 核心类型：体数据、轮廓、视图平面。
 * 所有坐标约定：体素坐标 (x, y, z) 为整数索引，x∈[0,nx) y∈[0,ny) z∈[0,nz)。
 * 物理坐标 (mm) = origin + (voxel + 0.5) * spacing（体素中心约定）。
 */

export type Plane = 'axial' | 'coronal' | 'sagittal';

export type Vec3 = [number, number, number];

export interface VolumeMeta {
  /** 体素维度 [nx, ny, nz] */
  dims: [number, number, number];
  /** 体素间距 mm [sx, sy, sz] */
  spacing: Vec3;
  /** 物理原点 mm（体素 (0,0,0) 的角点） */
  origin: Vec3;
  /** 方向标签，例如 'RAS' / 'LPS'，用于元数据一致性校验 */
  orientation: string;
}

export interface Volume {
  meta: VolumeMeta;
  /** 长度 nx*ny*nz，索引 = x + nx*(y + ny*z) */
  data: Uint16Array;
  /** 每个 z 层是否存在（缺层门禁依据） */
  presentSlices: boolean[];
  /** 导入时发现的元数据冲突描述（方向/间距/原点不一致） */
  conflicts: string[];
  /** 数据来源标识（模拟数据 id 或 'import'） */
  sourceId: string;
}

export type ContourKind = 'defect' | 'surface';

export interface Contour {
  id: string;
  kind: ContourKind;
  plane: Plane;
  /** 该轮廓所在的层索引（沿平面法向轴） */
  sliceIndex: number;
  /** 视图逻辑坐标 (u, v)，单位：体素 */
  points: Array<[number, number]>;
  /** 是否闭合（未闭合的候选轮廓不得进入定量分析） */
  closed: boolean;
}

export interface CandidateContour {
  plane: Plane;
  sliceIndex: number;
  kind: ContourKind;
  points: Array<[number, number]>;
}

export function voxelIndex(dims: [number, number, number], x: number, y: number, z: number): number {
  return x + dims[0] * (y + dims[1] * z);
}

export function inBounds(dims: [number, number, number], x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < dims[0] && y < dims[1] && z < dims[2];
}

/** 体素中心物理坐标 */
export function voxelToPhysical(meta: VolumeMeta, x: number, y: number, z: number): Vec3 {
  return [
    meta.origin[0] + (x + 0.5) * meta.spacing[0],
    meta.origin[1] + (y + 0.5) * meta.spacing[1],
    meta.origin[2] + (z + 0.5) * meta.spacing[2],
  ];
}
