// 重建流水线：合并三视图采纳记录 → 26 邻域连通分量 → 门禁 → 物理量测量
import { connectedComponents26, VoxelSet } from './connectivity';
import { type Dims, fromLinear } from './coordinates';
import { distanceFieldFromSurface, minDistanceFromField } from './distance';
import { evaluateGates } from './gates';
import { contourToVoxels } from './masks';
import { measureDefect } from './measurements';
import type {
  DefectMeasurement,
  GateViolation,
  PlanePoint,
  ViewId,
  VolumeMeta,
} from './types';

/** 编辑操作类型：缺陷/表面的添加与擦除（擦除同样进撤销栈） */
export type AdoptionOp = 'defect-add' | 'defect-erase' | 'surface-add' | 'surface-erase';

/** 一次“采纳”的轮廓/笔刷记录（可撤销的最小编辑单元，可来自任意正交视图） */
export interface Adoption {
  id: string;
  op: AdoptionOp;
  /** 归属的缺陷标签 id（表面记录可省略） */
  defectLabelId?: string;
  view: ViewId;
  depth: number;
  /** 多边形顶点；笔刷记录为空 */
  points: PlanePoint[];
  /** 是否闭合轮廓（笔刷视为 true） */
  closed: boolean;
  /** 笔刷直接给出的体素（points 为空时使用） */
  explicitVoxels?: number[];
}

export interface ReconstructedDefect {
  id: string;
  /** 贡献过该分量的用户标签（两个标签被 26 邻域接通时会合并显示） */
  labelIds: string[];
  voxels: number[];
  /** 参与切片（出现体素的 z 层） */
  slices: number[];
  /** 参与记录中闭合轮廓覆盖的 z 层 */
  closedSlices: number[];
  /** 相交的未闭合采纳记录（门禁证据） */
  openContours: { view: ViewId; depth: number; z: number; adoptionId: string }[];
  accepted: boolean;
  violations: GateViolation[];
  measurement: DefectMeasurement | null;
}

export interface ReconstructionResult {
  globalViolations: GateViolation[];
  defects: ReconstructedDefect[];
  /** 实际进入重建的缺陷体素总数 */
  defectVoxelCount: number;
  /** 应用表面添加/擦除记录后最终生效的表面体素 */
  surfaceVoxels: number[];
}

export interface ReconstructionInput {
  meta: VolumeMeta;
  /** 清单中存在的 z 层（缺层检测用） */
  presentZs: number[];
  adoptions: Adoption[];
  surfaceVoxels: number[];
}

function adoptionVoxels(a: Adoption, dims: Dims): number[] {
  if (a.points.length >= 3) {
    return contourToVoxels(a.view, a.depth, a.points, dims);
  }
  return a.explicitVoxels ?? [];
}

/** 完整重建。纯函数，供 UI 与测试共同使用。 */
export function reconstruct(input: ReconstructionInput): ReconstructionResult {
  const { meta } = input;
  const dims = meta.dims;

  // 1) 按时间顺序应用每条编辑记录（添加/擦除），得到最终生效的缺陷与表面集合
  const perAdoption = new Map<string, { voxels: number[]; label?: string }>();
  const union = new VoxelSet();
  const surfaceSet = new VoxelSet(input.surfaceVoxels);
  const ownerOfVoxel = new Map<number, string>(); // voxel -> adoptionId（最近一次添加）
  for (const a of input.adoptions) {
    const voxels = adoptionVoxels(a, dims);
    perAdoption.set(a.id, { voxels, label: a.defectLabelId });
    switch (a.op) {
      case 'defect-add':
        for (const v of voxels) {
          union.add(v);
          ownerOfVoxel.set(v, a.id);
        }
        break;
      case 'defect-erase':
        for (const v of voxels) {
          union.delete(v);
          ownerOfVoxel.delete(v);
        }
        break;
      case 'surface-add':
        for (const v of voxels) surfaceSet.add(v);
        break;
      case 'surface-erase':
        for (const v of voxels) surfaceSet.delete(v);
        break;
    }
  }

  // 2) 26 邻域连通分量
  const components = connectedComponents26(union.values(), dims);

  // 3) 归并标签 / 证据切片 / 未闭合轮廓
  const defects: ReconstructedDefect[] = components.map((cc, i) => {
    const labelSet = new Set<string>();
    const zSet = new Set<number>();
    const closedZSet = new Set<number>();
    const openRefs: ReconstructedDefect['openContours'] = [];
    const openSeen = new Set<string>();
    const voxelSet = new Set(cc.voxels);

    for (const v of cc.voxels) {
      zSet.add(fromLinear(v, dims).z);
      const aid = ownerOfVoxel.get(v);
      if (aid) {
        const rec = perAdoption.get(aid)!;
        if (rec.label) labelSet.add(rec.label);
        const adoption = input.adoptions.find((x) => x.id === aid)!;
        if (adoption.closed) closedZSet.add(fromLinear(v, dims).z);
      }
    }
    for (const a of input.adoptions) {
      if (a.closed || a.op !== 'defect-add') continue;
      const rec = perAdoption.get(a.id);
      if (!rec) continue;
      if (rec.voxels.some((v) => voxelSet.has(v)) && !openSeen.has(a.id)) {
        openSeen.add(a.id);
        // 该记录所在截面映射回的代表 z
        const repZ = rec.voxels.length ? fromLinear(rec.voxels[0], dims).z : a.depth;
        openRefs.push({ view: a.view, depth: a.depth, z: repZ, adoptionId: a.id });
      }
    }

    return {
      id: `defect-${i + 1}`,
      labelIds: [...labelSet],
      voxels: cc.voxels,
      slices: [...zSet].sort((a, b) => a - b),
      closedSlices: [...closedZSet].sort((a, b) => a - b),
      openContours: openRefs,
      accepted: false,
      violations: [],
      measurement: null,
    };
  });

  // 4) 门禁
  const gate = evaluateGates({
    dims,
    presentZs: input.presentZs,
    direction: meta.direction,
    surfaceVoxelCount: surfaceSet.size,
    defects: defects.map((d) => ({
      defectId: d.id,
      voxels: d.voxels,
      openContours: d.openContours.map((o) => ({ view: o.view, depth: o.depth, z: o.z })),
    })),
  });
  const verdictById = new Map(gate.verdicts.map((v) => [v.defectId, v]));
  const hardBlock = gate.globalViolations.length > 0;

  // 5) 距离场只算一次
  let field: Float64Array | null = null;
  if (!hardBlock && surfaceSet.size > 0) {
    field = distanceFieldFromSurface(surfaceSet.values(), dims, meta.spacing, meta.direction);
  }

  for (const d of defects) {
    const verdict = verdictById.get(d.id)!;
    d.violations = verdict.violations;
    d.accepted = verdict.accepted;
    if (verdict.accepted) {
      const sd = field ? minDistanceFromField(field, d.voxels, dims) : { distanceMm: null, pair: null };
      d.measurement = measureDefect(
        d.id,
        d.voxels,
        dims,
        meta.spacing,
        meta.origin,
        meta.direction,
        sd,
      );
    }
  }

  return {
    globalViolations: gate.globalViolations,
    defects,
    defectVoxelCount: union.size,
    surfaceVoxels: surfaceSet.toArray(),
  };
}
