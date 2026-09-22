// 坐标变换：体素下标 ↔ 线性索引 ↔ 物理坐标；三视图平面映射；方向元数据校验
import type {
  Axis,
  DirectionCosines,
  Origin,
  PlanePoint,
  Vec3,
  ViewId,
  VoxelSpacing,
} from './types';

export interface Dims {
  x: number;
  y: number;
  z: number;
}

export const AXES: Axis[] = ['x', 'y', 'z'];

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function norm(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n > 0 ? scale(a, 1 / n) : vec3();
}

// ---------- 线性索引（x 最快，z 最慢） ----------

export function linearIndex(x: number, y: number, z: number, dims: Dims): number {
  return (z * dims.y + y) * dims.x + x;
}

export function fromLinear(index: number, dims: Dims): Vec3 {
  const x = index % dims.x;
  const rest = Math.floor(index / dims.x);
  const y = rest % dims.y;
  const z = Math.floor(rest / dims.y);
  return { x, y, z };
}

export function inBounds(v: Vec3, dims: Dims): boolean {
  return (
    v.x >= 0 && v.x < dims.x &&
    v.y >= 0 && v.y < dims.y &&
    v.z >= 0 && v.z < dims.z
  );
}

// ---------- 物理坐标 ----------
// 物理坐标 = direction * ((voxel + 0.5) * spacing) + origin

const IDENTITY: DirectionCosines = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function effectiveDirection(dir?: DirectionCosines): DirectionCosines {
  return dir && dir.length === 9 ? dir : IDENTITY;
}

/** 应用 3x3 行主序方向矩阵到向量 */
export function applyDirection(d: DirectionCosines, v: Vec3): Vec3 {
  return {
    x: d[0] * v.x + d[1] * v.y + d[2] * v.z,
    y: d[3] * v.x + d[4] * v.y + d[5] * v.z,
    z: d[6] * v.x + d[7] * v.y + d[8] * v.z,
  };
}

export function voxelToPhysical(
  v: Vec3,
  spacing: VoxelSpacing,
  origin: Origin,
  direction?: DirectionCosines,
): Vec3 {
  const scaled: Vec3 = {
    x: (v.x + 0.5) * spacing.x,
    y: (v.y + 0.5) * spacing.y,
    z: (v.z + 0.5) * spacing.z,
  };
  return add(applyDirection(effectiveDirection(direction), scaled), origin);
}

/** 体素中心之间的物理位移向量（带方向） */
export function voxelDeltaPhysical(
  dv: Vec3,
  spacing: VoxelSpacing,
  direction?: DirectionCosines,
): Vec3 {
  return applyDirection(effectiveDirection(direction), {
    x: dv.x * spacing.x,
    y: dv.y * spacing.y,
    z: dv.z * spacing.z,
  });
}

// ---------- 方向元数据校验 ----------

export interface DirectionCheck {
  valid: boolean;
  reason?: string;
}

const EPS = 1e-6;

/**
 * 方向矩阵必须：长度 9、行为单位向量、两两正交、行列式 +1。
 * 镜像（det=-1）或非正交都会与“切片堆叠方向”冲突，判为方向元数据冲突。
 */
export function validateDirection(dir: DirectionCosines | undefined): DirectionCheck {
  if (dir === undefined) return { valid: true };
  if (dir.length !== 9) {
    return { valid: false, reason: '方向矩阵长度必须为 9' };
  }
  const rows: Vec3[] = [
    { x: dir[0], y: dir[1], z: dir[2] },
    { x: dir[3], y: dir[4], z: dir[5] },
    { x: dir[6], y: dir[7], z: dir[8] },
  ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(norm(rows[i]) - 1) > EPS) {
      return { valid: false, reason: `方向矩阵第 ${i + 1} 行不是单位向量` };
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      if (Math.abs(dot(rows[i], rows[j])) > EPS) {
        return { valid: false, reason: '方向矩阵各行非正交' };
      }
    }
  }
  const det = dot(rows[0], cross(rows[1], rows[2]));
  if (Math.abs(det - 1) > EPS) {
    return { valid: false, reason: `方向行列式为 ${det.toFixed(3)}（须为 +1，镜像/翻转与堆叠方向冲突）` };
  }
  return { valid: true };
}

// ---------- 三视图平面映射 ----------
// axial（XY@z）：平面 (a=x, b=y)，深度 = z
// sagittal（YZ@x）：平面 (a=y, b=z)，深度 = x
// coronal（XZ@y）：平面 (a=x, b=z)，深度 = y

export interface PlaneLayout {
  view: ViewId;
  /** 平面第一轴对应体轴 */
  axisA: Axis;
  /** 平面第二轴对应体轴 */
  axisB: Axis;
  /** 深度轴 */
  axisDepth: Axis;
}

export const VIEW_LAYOUTS: Record<ViewId, PlaneLayout> = {
  axial: { view: 'axial', axisA: 'x', axisB: 'y', axisDepth: 'z' },
  sagittal: { view: 'sagittal', axisA: 'y', axisB: 'z', axisDepth: 'x' },
  coronal: { view: 'coronal', axisA: 'x', axisB: 'z', axisDepth: 'y' },
};

/** 平面点 + 深度 → 体素坐标 */
export function planeToVoxel(view: ViewId, p: PlanePoint, depth: number): Vec3 {
  const { axisA, axisB, axisDepth } = VIEW_LAYOUTS[view];
  const v: Vec3 = { x: 0, y: 0, z: 0 };
  v[axisA] = p.a;
  v[axisB] = p.b;
  v[axisDepth] = depth;
  return v;
}

/** 体素坐标 → 平面点与深度 */
export function voxelToPlane(view: ViewId, v: Vec3): { point: PlanePoint; depth: number } {
  const { axisA, axisB, axisDepth } = VIEW_LAYOUTS[view];
  return {
    point: { a: v[axisA], b: v[axisB] },
    depth: v[axisDepth],
  };
}

/** 两平面点是否相同（用于跨视图定位同一交点） */
export function samePoint(p: PlanePoint, q: PlanePoint): boolean {
  return p.a === q.a && p.b === q.b;
}

/** 26 邻域位移（含共享面、边、角） */
export const NEIGHBOR_OFFSETS_26: Vec3[] = (() => {
  const out: Vec3[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push({ x: dx, y: dy, z: dz });
      }
    }
  }
  return out;
})();

/** 6 邻域位移（仅共享面），供部分判断复用 */
export const NEIGHBOR_OFFSETS_6: Vec3[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];
