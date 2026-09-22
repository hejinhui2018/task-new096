import { describe, expect, it } from 'vitest';
import { reconstruct, type Adoption } from '../src/domain/reconstruction';
import { buildFullMock, buildMissingSliceMock } from '../src/domain/mock';
import { linearIndex } from '../src/domain/coordinates';

function brushAdoption(id: string, label: string, voxels: number[]): Adoption {
  return { id, op: 'defect-add', defectLabelId: label, view: 'axial', depth: 0, points: [], closed: true, explicitVoxels: voxels };
}

describe('端到端重建：内置模拟件', () => {
  const ds = buildFullMock();
  const zs = Array.from({ length: ds.volume.meta.dims.z }, (_, z) => z);

  const adoptions: Adoption[] = [
    brushAdoption('a-poreA', 'pore-A', ds.truth.poreA),
    brushAdoption('a-poreB', 'pore-B', ds.truth.poreB),
    brushAdoption('a-crack', 'crack', ds.truth.crack),
  ];

  const result = reconstruct({
    meta: ds.volume.meta,
    presentZs: zs,
    adoptions,
    surfaceVoxels: ds.truth.surface,
  });

  it('两个相邻气孔与裂纹重建为三个独立缺陷（不错拆、不误并）', () => {
    expect(result.globalViolations).toEqual([]);
    expect(result.defects.length).toBe(3);
    const byLabel = new Map<string, (typeof result.defects)[number]>();
    for (const d of result.defects) for (const l of d.labelIds) byLabel.set(l, d);
    expect(byLabel.get('pore-A')!.voxels.length).toBe(ds.truth.poreA.length);
    expect(byLabel.get('pore-B')!.voxels.length).toBe(ds.truth.poreB.length);
    expect(byLabel.get('pore-A')!.id).not.toBe(byLabel.get('pore-B')!.id);
    expect(byLabel.get('crack')!.voxels.length).toBe(ds.truth.crack.length);
  });

  it('所有缺陷门禁通过并给出物理量', () => {
    for (const d of result.defects) {
      expect(d.accepted).toBe(true);
      expect(d.measurement).not.toBeNull();
      expect(d.measurement!.volumeMm3).toBeCloseTo(
        d.measurement!.voxelCount * 0.5 * 0.5 * 0.8,
        8,
      );
    }
  });

  it('参与切片为 z=18..22，第一主轴沿 z', () => {
    const crack = result.defects.find((d) => d.labelIds.includes('crack'))!;
    expect(crack.slices).toEqual([18, 19, 20, 21, 22]);
    const axis = crack.measurement!.principalAxes[0];
    expect(Math.abs(axis.direction.z)).toBeGreaterThan(0.9);
  });

  it('表面最短距离：裂纹约 0.5 mm（1 个 x 间距），气孔明显更深', () => {
    const crack = result.defects.find((d) => d.labelIds.includes('crack'))!;
    const poreA = result.defects.find((d) => d.labelIds.includes('pore-A'))!;
    expect(crack.measurement!.surfaceDistanceMm).toBeCloseTo(0.5, 6);
    expect(crack.measurement!.surfacePair).not.toBeNull();
    // 气孔埋在实体内部，距表面 > 3 mm
    expect(poreA.measurement!.surfaceDistanceMm!).toBeGreaterThan(3);
  });
});

describe('端到端重建：缺层模拟件', () => {
  it('z=17 缺失时全局门禁阻止一切定量结论', () => {
    const ds = buildMissingSliceMock();
    const zs = Array.from({ length: ds.volume.meta.dims.z }, (_, z) => z).filter((z) => z !== 17);
    const result = reconstruct({
      meta: ds.volume.meta,
      presentZs: zs,
      adoptions: [
        brushAdoption('a-poreA', 'pore-A', ds.truth.poreA),
        brushAdoption('a-crack', 'crack', ds.truth.crack),
      ],
      surfaceVoxels: ds.truth.surface,
    });
    expect(result.globalViolations.map((v) => v.code)).toContain('MISSING_SLICES');
    expect(result.defects.length).toBeGreaterThan(0);
    for (const d of result.defects) {
      expect(d.accepted).toBe(false);
      expect(d.measurement).toBeNull();
    }
  });
});

describe('端到端重建：未闭合轮廓与标签合并', () => {
  const ds = buildFullMock();
  const zs = Array.from({ length: ds.volume.meta.dims.z }, (_, z) => z);
  const D = ds.volume.meta.dims;

  it('未闭合轮廓所属缺陷被阻止，且不给测量值', () => {
    const open: Adoption = {
      id: 'open-1',
      op: 'defect-add',
      defectLabelId: 'pore-open',
      view: 'axial',
      depth: 14,
      closed: false,
      points: [
        { a: 5.5, b: 5.5 },
        { a: 8.5, b: 5.5 },
        { a: 8.5, b: 8.5 },
        { a: 6.5, b: 7.5 },
      ],
    };
    const result = reconstruct({
      meta: ds.volume.meta,
      presentZs: zs,
      adoptions: [open, brushAdoption('a-poreA', 'pore-A', ds.truth.poreA)],
      surfaceVoxels: ds.truth.surface,
    });
    const bad = result.defects.find((d) => d.labelIds.includes('pore-open'))!;
    const good = result.defects.find((d) => d.labelIds.includes('pore-A'))!;
    expect(bad.accepted).toBe(false);
    expect(bad.violations.map((v) => v.code)).toContain('OPEN_CONTOUR');
    expect(bad.measurement).toBeNull();
    expect(good.accepted).toBe(true);
  });

  it('两个标签的体素 26 邻域角接时合并为一个缺陷并带两个标签', () => {
    const i = (x: number, y: number, z: number) => linearIndex(x, y, z, D);
    const result = reconstruct({
      meta: ds.volume.meta,
      presentZs: zs,
      adoptions: [
        brushAdoption('l1', 'L1', [i(2, 2, 2)]),
        brushAdoption('l2', 'L2', [i(3, 3, 3)]),
      ],
      surfaceVoxels: ds.truth.surface,
    });
    expect(result.defects.length).toBe(1);
    expect(result.defects[0].labelIds.sort()).toEqual(['L1', 'L2']);
    expect(result.defects[0].voxels.length).toBe(2);
  });
});
