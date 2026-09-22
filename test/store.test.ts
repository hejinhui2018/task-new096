import { describe, expect, it, beforeEach } from 'vitest';
import { AppStore } from '../src/state/store';

describe('应用 store 集成', () => {
  let store: AppStore;
  beforeEach(() => {
    store = new AppStore();
    store.clearAllEdits();
  });

  it('播种模拟标记后得到 3 个可定量缺陷，含体积与表面距离', () => {
    store.seedDemoMarks();
    const r = store.reconstruction;
    expect(r.globalViolations).toEqual([]);
    expect(r.defects.length).toBe(3);
    for (const d of r.defects) {
      expect(d.accepted).toBe(true);
      expect(d.measurement).not.toBeNull();
      expect(d.measurement!.volumeMm3).toBeGreaterThan(0);
    }
    const crack = r.defects.find((d) => d.labelIds.includes('seed-crack'))!;
    expect(crack.measurement!.surfaceDistanceMm).toBeCloseTo(0.5, 6);
  });

  it('撤销播种后无缺陷，重做恢复', () => {
    store.seedDemoMarks();
    expect(store.reconstruction.defects.length).toBe(3);
    store.undo();
    expect(store.reconstruction.defects.length).toBe(0);
    store.redo();
    expect(store.reconstruction.defects.length).toBe(3);
  });

  it('切换到缺层数据集后门禁阻止全部定量', () => {
    store.seedDemoMarks();
    store.loadDataset('mock-missing-z17');
    const r = store.reconstruction;
    expect(r.globalViolations.map((v) => v.code)).toContain('MISSING_SLICES');
    for (const d of r.defects) expect(d.accepted).toBe(false);
  });

  it('闭合候选轮廓采纳后形成可测量缺陷；未闭合候选阻止定量', () => {
    const label = store.addLabel('手绘气孔');
    expect(label).toBeTruthy();
    // 在轴位 z=20 画一个 3×3 闭合方块
    store.updateCandidate({
      view: 'axial',
      depth: 20,
      closed: true,
      points: [
        { a: 10.5, b: 10.5 },
        { a: 13.5, b: 10.5 },
        { a: 13.5, b: 13.5 },
        { a: 10.5, b: 13.5 },
      ],
    });
    store.adoptCandidate();
    expect(store.ui.candidate).toBeNull();
    expect(store.reconstruction.defects.length).toBe(1);
    const d = store.reconstruction.defects[0];
    expect(d.voxels.length).toBe(9);
    // 表面距离为 null（未标表面），但体积仍可接受
    expect(d.accepted).toBe(true);
    expect(d.measurement!.volumeMm3).toBeCloseTo(9 * 0.5 * 0.5 * 0.8);

    // 第二条：未闭合
    const label2 = store.addLabel('开口轮廓');
    store.setActiveLabel(label2);
    store.updateCandidate({
      view: 'axial',
      depth: 22,
      closed: false,
      points: [
        { a: 30.5, b: 30.5 },
        { a: 33.5, b: 30.5 },
        { a: 33.5, b: 33.5 },
      ],
    });
    store.adoptCandidate();
    const bad = store.reconstruction.defects.find((x) => x.labelIds.includes(label2))!;
    expect(bad.accepted).toBe(false);
    expect(bad.violations.map((v) => v.code)).toContain('OPEN_CONTOUR');
    expect(bad.measurement).toBeNull();
  });

  it('表面笔刷提交后表面距离可得，且笔刷记录可撤销', () => {
    const label = store.addLabel('小孔');
    store.setActiveLabel(label);
    store.commitStroke('defect-add', 'axial', 20, [
      // 单个缺陷体素 (5,5,20)
      20 * 48 * 48 + 5 * 48 + 5,
    ]);
    // 在其 +x 方向 2 体素处放一个表面体素 (7,5,20)
    store.commitStroke('surface-add', 'axial', 20, [
      20 * 48 * 48 + 5 * 48 + 7,
    ]);
    const d = store.reconstruction.defects[0];
    expect(d.accepted).toBe(true);
    expect(d.measurement!.surfaceDistanceMm).toBeCloseTo(1.0, 6); // 2 × 0.5

    store.undo(); // 撤掉表面
    expect(store.reconstruction.surfaceVoxels.length).toBe(0);
    expect(store.reconstruction.defects[0].measurement!.surfaceDistanceMm).toBeNull();
  });

  it('十字光标被钳制在体数据范围内', () => {
    store.setCursor({ x: -99, y: 9999, z: 20 });
    const dims = store.dataset.volume.meta.dims;
    expect(store.ui.cursor.x).toBe(0);
    expect(store.ui.cursor.y).toBe(dims.y - 1);
    expect(store.ui.cursor.z).toBe(20);
    expect(store.ui.depths).toEqual({ axial: 20, sagittal: 0, coronal: dims.y - 1 });
  });
});
