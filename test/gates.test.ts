import { describe, expect, it } from 'vitest';
import { evaluateGates, findMissingLayers } from '../src/domain/gates';

const D = { x: 8, y: 8, z: 10 };

function fullZs() {
  return Array.from({ length: 10 }, (_, z) => z);
}

describe('缺层检测', () => {
  it('齐全时无缺失', () => {
    expect(findMissingLayers(fullZs(), D)).toEqual([]);
  });
  it('找出所有缺失层', () => {
    const zs = fullZs().filter((z) => z !== 3 && z !== 7);
    expect(findMissingLayers(zs, D)).toEqual([3, 7]);
  });
});

describe('定量门禁', () => {
  it('完整数据 + 闭合轮廓 + 表面标记 → 接受定量', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs(),
      defects: [{ defectId: 'd1', voxels: [1, 2, 3], openContours: [] }],
      surfaceVoxelCount: 50,
    });
    expect(report.globalViolations).toEqual([]);
    expect(report.verdicts[0].accepted).toBe(true);
  });

  it('缺层 → 全局阻止，任何缺陷不得出定量结论', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs().filter((z) => z !== 4),
      defects: [{ defectId: 'd1', voxels: [1, 2, 3], openContours: [] }],
      surfaceVoxelCount: 50,
    });
    const codes = report.globalViolations.map((v) => v.code);
    expect(codes).toContain('MISSING_SLICES');
    expect(report.verdicts[0].accepted).toBe(false);
  });

  it('方向元数据冲突（镜像）→ 全局阻止', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs(),
      direction: [-1, 0, 0, 0, 1, 0, 0, 0, 1],
      defects: [{ defectId: 'd1', voxels: [1, 2], openContours: [] }],
      surfaceVoxelCount: 10,
    });
    expect(report.globalViolations.map((v) => v.code)).toContain('DIRECTION_CONFLICT');
    expect(report.verdicts[0].accepted).toBe(false);
  });

  it('轮廓未闭合 → 该缺陷被阻止', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs(),
      defects: [
        {
          defectId: 'd1',
          voxels: [1, 2],
          openContours: [{ view: 'axial', depth: 3, z: 3 }],
        },
        { defectId: 'd2', voxels: [9, 10], openContours: [] },
      ],
      surfaceVoxelCount: 10,
    });
    expect(report.globalViolations).toEqual([]);
    const d1 = report.verdicts.find((v) => v.defectId === 'd1')!;
    const d2 = report.verdicts.find((v) => v.defectId === 'd2')!;
    expect(d1.accepted).toBe(false);
    expect(d1.violations.map((v) => v.code)).toContain('OPEN_CONTOUR');
    expect(d2.accepted).toBe(true);
  });

  it('空缺陷被阻止', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs(),
      defects: [{ defectId: 'd1', voxels: [], openContours: [] }],
      surfaceVoxelCount: 10,
    });
    expect(report.verdicts[0].accepted).toBe(false);
    expect(report.verdicts[0].violations.map((v) => v.code)).toContain('EMPTY_DEFECT');
  });

  it('未标记表面不阻止体积结论，仅提示距离不可得', () => {
    const report = evaluateGates({
      dims: D,
      presentZs: fullZs(),
      defects: [{ defectId: 'd1', voxels: [1, 2], openContours: [] }],
      surfaceVoxelCount: 0,
    });
    expect(report.verdicts[0].accepted).toBe(true);
    expect(report.verdicts[0].violations.map((v) => v.code)).toContain('NO_SURFACE_MASK');
  });
});
