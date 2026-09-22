/**
 * 质量门禁：任一阻断项存在时，定量结论（体积/主轴/表面距离）必须被阻止展示。
 * - 缺层：z 层不连续，三维重建不可信
 * - 元数据冲突：导入切片的方向/间距/原点互相矛盾
 * - 未闭合轮廓：轮廓不构成封闭区域，掩膜语义不成立
 * - 无外表面：仅阻断"到表面距离"这一项
 */
import type { Contour, Volume } from './types';
import { isClosedContour } from './raster';

export type GateCode =
  | 'MISSING_SLICES'
  | 'METADATA_CONFLICT'
  | 'UNCLOSED_CONTOUR'
  | 'NO_SURFACE';

export interface GateIssue {
  code: GateCode;
  message: string;
  /** 仅阻断表面距离，不阻断其它定量结论 */
  distanceOnly?: boolean;
}

export interface GateResult {
  issues: GateIssue[];
  /** 是否允许给出体积/包围盒/主轴等定量结论 */
  quantitativeAllowed: boolean;
  /** 是否允许给出到外表面距离 */
  distanceAllowed: boolean;
  missingSlices: number[];
}

export function evaluateGates(
  volume: Volume | null,
  contours: Contour[],
  surfaceVoxelCount: number,
): GateResult {
  const issues: GateIssue[] = [];
  const missingSlices: number[] = [];

  if (volume) {
    for (let z = 0; z < volume.presentSlices.length; z++) {
      if (!volume.presentSlices[z]) missingSlices.push(z);
    }
    if (missingSlices.length > 0) {
      issues.push({
        code: 'MISSING_SLICES',
        message: `缺失 ${missingSlices.length} 层切片（z = ${missingSlices.join(', ')}），三维连通与定量结论不可靠`,
      });
    }
    if (volume.conflicts.length > 0) {
      issues.push({
        code: 'METADATA_CONFLICT',
        message: `方向/间距/原点元数据冲突：${volume.conflicts.join('；')}`,
      });
    }
  }

  const unclosed = contours.filter((c) => !isClosedContour(c.points, c.closed));
  if (unclosed.length > 0) {
    issues.push({
      code: 'UNCLOSED_CONTOUR',
      message: `存在 ${unclosed.length} 条未闭合轮廓（${unclosed.map((c) => c.id).join(', ')}），掩膜不完整`,
    });
  }

  if (surfaceVoxelCount === 0) {
    issues.push({
      code: 'NO_SURFACE',
      message: '尚未标记零件外表面，无法计算到表面的最短距离',
      distanceOnly: true,
    });
  }

  const blocking = issues.filter((i) => !i.distanceOnly);
  return {
    issues,
    quantitativeAllowed: blocking.length === 0,
    distanceAllowed: blocking.length === 0 && surfaceVoxelCount > 0,
    missingSlices,
  };
}
