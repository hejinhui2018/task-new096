import { describe, expect, it } from 'vitest';
import { rasterizeContour, contourIsClosed, polygonArea } from '../src/domain/geometry';
import { contourToVoxels } from '../src/domain/masks';

describe('轮廓几何', () => {
  it('正方形轮廓光栅化面积为 3×3', () => {
    // 整数像素中心约定：顶点 -0.5/2.5 恰好围入中心为 0,1,2 的 3×3 像素
    const square = [
      { a: -0.5, b: -0.5 },
      { a: 2.5, b: -0.5 },
      { a: 2.5, b: 2.5 },
      { a: -0.5, b: 2.5 },
    ];
    const px = rasterizeContour(square, { width: 8, height: 8 });
    expect(px.length).toBe(9);
    expect(new Set(px).size).toBe(9);
    expect(polygonArea(square)).toBeCloseTo(9);
  });

  it('越界部分被裁剪', () => {
    // 多边形左/下越界，右/上落在 1.5：界内像素中心 0,1
    const square = [
      { a: -3.5, b: -3.5 },
      { a: 1.5, b: -3.5 },
      { a: 1.5, b: 1.5 },
      { a: -3.5, b: 1.5 },
    ];
    const px = rasterizeContour(square, { width: 4, height: 4 });
    expect(px.length).toBe(4); // a=0,1 × b=0,1
    expect(px.sort((u, v) => u - v)).toEqual([0, 1, 4, 5]);
  });

  it('闭合判定需要首尾吸附且至少 3 点', () => {
    expect(contourIsClosed([{ a: 0, b: 0 }, { a: 1, b: 0 }])).toBe(false);
    expect(
      contourIsClosed([
        { a: 0, b: 0 },
        { a: 2, b: 0 },
        { a: 2, b: 2 },
        { a: 0.2, b: 0.2 },
      ]),
    ).toBe(true);
    expect(
      contourIsClosed([
        { a: 0, b: 0 },
        { a: 2, b: 0 },
        { a: 2, b: 2 },
        { a: 1, b: 1 },
      ]),
    ).toBe(false);
  });
});

describe('三视图轮廓映射到同一体素空间', () => {
  const D = { x: 6, y: 7, z: 8 };
  const unit = [
    { a: 0.5, b: 0.5 },
    { a: 2.5, b: 0.5 },
    { a: 2.5, b: 2.5 },
    { a: 0.5, b: 2.5 },
  ];

  it('axial z=3 轮廓落在 z=3 层的 x/y 1..2', () => {
    const vox = contourToVoxels('axial', 3, unit, D);
    expect(vox.length).toBe(4);
    for (const v of vox) {
      const z = Math.floor(v / (D.x * D.y));
      expect(z).toBe(3);
    }
  });

  it('sagittal x=2 轮廓映射到 x=2 层的 y/z 平面', () => {
    const vox = contourToVoxels('sagittal', 2, unit, D);
    expect(vox.length).toBe(4);
    for (const v of vox) {
      const x = v % D.x;
      expect(x).toBe(2);
    }
  });

  it('coronal y=5 轮廓映射到 y=5 层的 x/z 平面', () => {
    const vox = contourToVoxels('coronal', 5, unit, D);
    expect(vox.length).toBe(4);
    for (const v of vox) {
      const x = v % D.x;
      const y = Math.floor(v / D.x) % D.y;
      expect(y).toBe(5);
      expect([1, 2]).toContain(x);
    }
  });
});
