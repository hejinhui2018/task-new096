// 领域类型定义：体数据、元数据、掩膜、缺陷与测量结果

/** 三轴标识。约定切片沿 Z 轴堆叠：第 k 张切片对应 z=k 体素层。 */
export type Axis = 'x' | 'y' | 'z';

/** 体素物理间距（mm/体素），允许各向异性。 */
export interface VoxelSpacing {
  x: number;
  y: number;
  z: number;
}

/** 体数据原点在物理坐标系（mm）中的位置：物理坐标 = (体素下标 + 0.5) * spacing + origin。 */
export interface Origin {
  x: number;
  y: number;
  z: number;
}

/**
 * 方向元数据。3x3 方向余弦矩阵（行主序，9 个数），
 * 描述体数据 i/j/k 轴相对物理 X/Y/Z 轴的方向。
 * 合法方向必须是行列式为 +1 的正交矩阵（纯旋转，非镜像）。
 */
export type DirectionCosines = number[]; // 长度 9

/** 灰度切片清单元数据 */
export interface VolumeMeta {
  /** 体数据维度（体素数） */
  dims: { x: number; y: number; z: number };
  spacing: VoxelSpacing;
  origin: Origin;
  /** 方向余弦；缺省视为单位阵 */
  direction?: DirectionCosines;
  /** 灰度理论范围，用于默认窗宽窗位 */
  intensityRange: { min: number; max: number };
}

/** 一张切片的灰度数据，长度 = dims.x * dims.y，行优先（y 行 x 列）。 */
export interface SliceImage {
  /** 该切片对应的 z 层下标；允许缺失层（清单中跳号） */
  z: number;
  /** 可选文件名，仅用于展示与导入核对 */
  name?: string;
  data: Uint16Array | Uint8Array | Float32Array;
}

/** 完整体数据（导入解析后） */
export interface Volume {
  meta: VolumeMeta;
  slices: SliceImage[];
}

/** 掩膜层：在一张正交截面上的二维像素标记（x/y 或重组平面）。 */
export type MaskLayerKind = 'defect' | 'surface';

/** 三视图平面上的二维坐标（像素下标，允许半整数用于十字线） */
export interface PlanePoint {
  a: number;
  b: number;
}

/** 闭合多边形（候选轮廓）。closed=true 表示首尾点已显式闭合。 */
export interface Contour {
  id: string;
  /** 多边形顶点（截面上的像素坐标） */
  points: PlanePoint[];
  /** 是否已闭合；未闭合轮廓参与定量时触发门禁 */
  closed: boolean;
}

/** 单个缺陷掩膜：一组体素的线性索引（按 x 最快、y、z 最慢展平）。 */
export interface DefectMask {
  id: string;
  label: string;
  /** 体素线性索引 */
  voxels: number[];
  /** 该缺陷轮廓参与了哪些 z 层（证据切片） */
  slices: number[];
  /** 轮廓闭合性逐片记录（用于门禁证据） */
  closedSlices: number[];
}

/** 表面掩膜：被标记为零件外表面的体素线性索引集合。 */
export interface SurfaceMask {
  voxels: number[];
}

/** 连通分量重建结果 */
export interface ConnectedComponent {
  id: string;
  voxels: number[];
}

/** 三维轴对齐包围盒（体素下标） */
export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** 主成分分析得到的主轴（单位方向，物理空间） */
export interface PrincipalAxis {
  /** 主轴方向单位向量（物理坐标） */
  direction: Vec3;
  /** 该轴方向上的 RMS 扩展（mm） */
  extent: number;
}

/** 单项定量测量结果 */
export interface DefectMeasurement {
  defectId: string;
  /** 体素数 */
  voxelCount: number;
  /** 物理体积 mm^3 */
  volumeMm3: number;
  bbox: {
    min: Vec3;
    max: Vec3;
    /** 物理尺寸 mm */
    size: Vec3;
  };
  /** 质心（体素下标） */
  centroidVoxel: Vec3;
  /** 质心物理坐标 mm */
  centroidPhysical: Vec3;
  principalAxes: [PrincipalAxis, PrincipalAxis, PrincipalAxis];
  /** 到最近外表面体素的距离 mm；无表面标记时为 null */
  surfaceDistanceMm: number | null;
  /** 实现该最短距离的缺陷体素与表面体素（证据） */
  surfacePair: { defect: Vec3; surface: Vec3 } | null;
}

/** 门禁（定量结论前置条件）违规项 */
export type GateCode =
  | 'MISSING_SLICES'
  | 'DIRECTION_CONFLICT'
  | 'OPEN_CONTOUR'
  | 'NO_SURFACE_MASK'
  | 'EMPTY_DEFECT';

export interface GateViolation {
  code: GateCode;
  message: string;
  /** 关联的缺陷 id（若适用） */
  defectId?: string;
  /** 关联层号（若适用） */
  z?: number;
}

/** 测量面板对单个缺陷的结论 */
export interface DefectVerdict {
  defectId: string;
  /** 门禁是否全部通过：false 时禁止给出定量结论 */
  accepted: boolean;
  violations: GateViolation[];
  measurement: DefectMeasurement | null;
}

/** 窗宽窗位（灰度显示映射） */
export interface WindowLevel {
  /** 窗位（中心灰度） */
  center: number;
  /** 窗宽 */
  width: number;
}

/** 三视图标识 */
export type ViewId = 'axial' | 'sagittal' | 'coronal';
// axial: XY @z；sagittal: YZ @x；coronal: XZ @y
