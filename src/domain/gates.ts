// 定量结论门禁：切片缺失 / 方向元数据冲突 / 轮廓不闭合 / 空缺陷 / 未标记表面
import { type Dims, validateDirection } from './coordinates';
import type {
  DefectVerdict,
  GateViolation,
  ViewId,
} from './types';

export interface DefectGateInput {
  defectId: string;
  voxels: number[];
  /** 该缺陷采纳过的轮廓记录中未闭合者 */
  openContours: { view: ViewId; depth: number; z: number }[];
}

export interface GateInput {
  dims: Dims;
  /** 清单中实际存在的 z 层（缺层 = 区间内缺位） */
  presentZs: number[];
  /** 声明过的 z 层（允许越界/重复，由解析器提前报错；这里只看缺层） */
  direction?: number[];
  defects: DefectGateInput[];
  surfaceVoxelCount: number;
}

export interface GateReport {
  /** 硬性全局违规：存在时禁止任何定量结论 */
  globalViolations: GateViolation[];
  verdicts: DefectVerdict[];
}

/** 检查 z 层缺失（必须连续覆盖 0..dims.z-1），返回缺失层号 */
export function findMissingLayers(presentZs: Iterable<number>, dims: Dims): number[] {
  const have = new Set(presentZs);
  const missing: number[] = [];
  for (let z = 0; z < dims.z; z++) if (!have.has(z)) missing.push(z);
  return missing;
}

export function evaluateGates(input: GateInput): GateReport {
  const globalViolations: GateViolation[] = [];

  // 1) 缺层
  const missing = findMissingLayers(input.presentZs, input.dims);
  if (missing.length > 0) {
    globalViolations.push({
      code: 'MISSING_SLICES',
      message: `切片缺失：z=${missing.join(', ')}（共 ${missing.length} 层），连通性与体积不可信`,
    });
  }

  // 2) 方向元数据冲突
  const dir = validateDirection(input.direction);
  if (!dir.valid) {
    globalViolations.push({
      code: 'DIRECTION_CONFLICT',
      message: `方向元数据冲突：${dir.reason ?? '方向矩阵非法'}`,
    });
  }

  const hardBlock = globalViolations.length > 0;

  // 3) 逐缺陷：空缺陷 / 轮廓未闭合
  const verdicts: DefectVerdict[] = input.defects.map((d) => {
    const violations: GateViolation[] = [];
    if (d.voxels.length === 0) {
      violations.push({
        code: 'EMPTY_DEFECT',
        defectId: d.defectId,
        message: '缺陷体素为空，无法测量',
      });
    }
    for (const oc of d.openContours) {
      violations.push({
        code: 'OPEN_CONTOUR',
        defectId: d.defectId,
        z: oc.z,
        message: `存在未闭合轮廓（${oc.view} 视图，深度层 ${oc.depth}），禁止纳入定量`,
      });
    }
    if (input.surfaceVoxelCount === 0) {
      violations.push({
        code: 'NO_SURFACE_MASK',
        defectId: d.defectId,
        message: '尚未标记零件外表面，表面距离不可得（不阻止体积类结论）',
      });
    }
    // 全局硬性门禁触发时，所有缺陷一律不接受定量
    const accepted = !hardBlock && !violations.some(
      (v) => v.code === 'EMPTY_DEFECT' || v.code === 'OPEN_CONTOUR',
    );
    return { defectId: d.defectId, accepted, violations, measurement: null };
  });

  return { globalViolations, verdicts };
}

/** 报告中是否存在任何阻止定量的硬性违规 */
export function anyHardBlock(report: GateReport): boolean {
  return report.globalViolations.length > 0;
}
