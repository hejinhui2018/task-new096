import { describe, expect, it } from 'vitest';
import { evaluateGates } from '../src/core/gates';
import { generateSimVolume, SIM_SOURCE_COMPLETE, SIM_SOURCE_MISSING, SIM_TRUTH } from '../src/core/simdata';
import { buildVolumeFromManifest, parseManifest, type SliceManifest } from '../src/core/importManifest';
import type { Contour } from '../src/core/types';

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function tinyManifest(overrides: Partial<SliceManifest> = {}, slices?: SliceManifest['slices']): SliceManifest {
  const data = new Uint16Array(4 * 4).fill(100);
  const raw = new Uint8Array(data.buffer);
  return {
    kind: 'ct-slice-manifest',
    version: 1,
    width: 4,
    height: 4,
    spacing: [0.5, 0.5, 1],
    origin: [0, 0, 0],
    orientation: 'RAS',
    slices: slices ?? [
      { index: 0, bits: 16, data: b64(raw) },
      { index: 1, bits: 16, data: b64(raw) },
    ],
    ...overrides,
  };
}

const closedContour: Contour = {
  id: 'c1',
  kind: 'defect',
  plane: 'axial',
  sliceIndex: 2,
  points: [[1, 1], [4, 1], [4, 4], [1, 4]],
  closed: true,
};

describe('缺层与元数据门禁', () => {
  it('完整模拟数据：无阻断，定量结论允许', () => {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    const g = evaluateGates(v, [closedContour], 100);
    expect(g.quantitativeAllowed).toBe(true);
    expect(g.distanceAllowed).toBe(true);
    expect(g.missingSlices).toEqual([]);
  });

  it('缺层模拟数据：阻断定量结论并列出缺失层', () => {
    const v = generateSimVolume(SIM_SOURCE_MISSING);
    const g = evaluateGates(v, [closedContour], 100);
    expect(g.quantitativeAllowed).toBe(false);
    expect(g.distanceAllowed).toBe(false);
    expect(g.missingSlices).toEqual([SIM_TRUTH.missingSliceZ]);
    expect(g.issues.some((i) => i.code === 'MISSING_SLICES')).toBe(true);
  });

  it('导入清单缺层：presentSlices 与门禁一致', () => {
    const data = new Uint16Array(16).fill(7);
    const raw = new Uint8Array(data.buffer);
    const m = tinyManifest({}, [
      { index: 0, bits: 16, data: b64(raw) },
      { index: 2, bits: 16, data: b64(raw) }, // 缺第 1 层
    ]);
    const { volume, errors } = buildVolumeFromManifest(m);
    expect(errors).toEqual([]);
    expect(volume!.presentSlices).toEqual([true, false, true]);
    const g = evaluateGates(volume, [closedContour], 10);
    expect(g.quantitativeAllowed).toBe(false);
    expect(g.missingSlices).toEqual([1]);
  });

  it('方向元数据冲突：阻断定量结论', () => {
    const data = new Uint16Array(16);
    const raw = new Uint8Array(data.buffer);
    const m = tinyManifest({}, [
      { index: 0, bits: 16, data: b64(raw) },
      { index: 1, bits: 16, data: b64(raw), orientation: 'LPS' }, // 与全局 RAS 冲突
    ]);
    const { volume } = buildVolumeFromManifest(m);
    expect(volume!.conflicts.length).toBeGreaterThan(0);
    const g = evaluateGates(volume, [closedContour], 10);
    expect(g.quantitativeAllowed).toBe(false);
    expect(g.issues.some((i) => i.code === 'METADATA_CONFLICT')).toBe(true);
  });

  it('逐片间距与全局不一致：元数据冲突', () => {
    const data = new Uint16Array(16);
    const raw = new Uint8Array(data.buffer);
    const m = tinyManifest({}, [
      { index: 0, bits: 16, data: b64(raw), spacing: [0.5, 0.5, 2] },
      { index: 1, bits: 16, data: b64(raw) },
    ]);
    const { volume } = buildVolumeFromManifest(m);
    expect(volume!.conflicts.some((c) => c.includes('间距'))).toBe(true);
  });

  it('未闭合轮廓：阻断定量结论', () => {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    const unclosed: Contour = { ...closedContour, id: 'c2', closed: false };
    const g = evaluateGates(v, [closedContour, unclosed], 100);
    expect(g.quantitativeAllowed).toBe(false);
    expect(g.issues.some((i) => i.code === 'UNCLOSED_CONTOUR')).toBe(true);
  });

  it('无外表面：仅阻断表面距离，不阻断其它定量结论', () => {
    const v = generateSimVolume(SIM_SOURCE_COMPLETE);
    const g = evaluateGates(v, [closedContour], 0);
    expect(g.quantitativeAllowed).toBe(true);
    expect(g.distanceAllowed).toBe(false);
    expect(g.issues.some((i) => i.code === 'NO_SURFACE' && i.distanceOnly)).toBe(true);
  });

  it('导入数据正确解码 16bit 灰度', () => {
    const data = new Uint16Array(16);
    data[5] = 1234;
    const raw = new Uint8Array(data.buffer.slice(0));
    const m = tinyManifest({}, [{ index: 0, bits: 16, data: b64(raw) }]);
    const { volume } = buildVolumeFromManifest(m);
    expect(volume!.meta.dims).toEqual([4, 4, 1]);
    expect(volume!.data[5]).toBe(1234);
  });

  it('非法清单被拒绝并给出原因', () => {
    expect(parseManifest('{"kind":"other"}').error).toBeTruthy();
    expect(parseManifest('not json').error).toBeTruthy();
    const bad = tinyManifest({ spacing: [0, 0.5, 1] });
    expect(parseManifest(JSON.stringify(bad)).error).toBeTruthy();
  });
});
