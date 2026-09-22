// 二维轮廓几何：闭合判定、多边形扫描线填充、面积
import type { PlanePoint } from './types';

/** 首尾点重合容差（像素） */
export const CLOSE_EPS = 0.75;

export function contourIsClosed(points: PlanePoint[], eps = CLOSE_EPS): boolean {
  if (points.length < 3) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a.a - b.a, a.b - b.b) <= eps;
}

/** 射线法判断点是否在多边形内（边界计入） */
export function pointInPolygon(p: PlanePoint, poly: PlanePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].a;
    const yi = poly[i].b;
    const xj = poly[j].a;
    const yj = poly[j].b;
    const intersect =
      yi > p.b !== yj > p.b &&
      p.a < ((xj - xi) * (p.b - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface RasterizeOptions {
  width: number;
  height: number;
}

/**
 * 扫描线多边形填充，返回被覆盖像素的二维线性索引（a + b*width）。
 * 采用整数像素角点约定：像素 k 覆盖 [k-0.5, k+0.5]，
 * 顶点位于像素角点（如 0.5/2.5）时填充结果可精确预测。越界像素裁剪。
 */
export function rasterizeContour(
  points: PlanePoint[],
  { width, height }: RasterizeOptions,
): number[] {
  if (points.length < 3) return [];
  const poly = points;
  let minB = Math.ceil(Math.min(...poly.map((p) => p.b)) - 1e-9);
  let maxB = Math.floor(Math.max(...poly.map((p) => p.b)) + 1e-9);
  let minA = Math.ceil(Math.min(...poly.map((p) => p.a)) - 1e-9);
  let maxA = Math.floor(Math.max(...poly.map((p) => p.a)) + 1e-9);
  minB = Math.max(0, minB);
  maxB = Math.min(height - 1, maxB);
  minA = Math.max(0, minA);
  maxA = Math.min(width - 1, maxA);

  const out: number[] = [];
  for (let b = minB; b <= maxB; b++) {
    // 扫描线沿像素行中线 y = b（整数像素中心约定）
    const y = b;
    const xs: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j];
      const q = poly[i];
      if ((p.b > y) !== (q.b > y)) {
        const t = (y - p.b) / (q.b - p.b);
        xs.push(p.a + t * (q.a - p.a));
      }
    }
    xs.sort((u, v) => u - v);
    const EPSX = 1e-9;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // 像素中心 a 落在闭区间 [xs[k], xs[k+1]] 内即填充（边界计入）
      const from = Math.max(minA, Math.ceil(xs[k] - EPSX));
      const to = Math.min(maxA, Math.floor(xs[k + 1] + EPSX));
      for (let a = from; a <= to; a++) out.push(a + b * width);
    }
  }
  return out;
}

/** 鞋带公式有向面积（像素²），取绝对值；未闭合按自动闭合计算。 */
export function polygonArea(points: PlanePoint[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twice += points[j].a * points[i].b - points[i].a * points[j].b;
  }
  return Math.abs(twice) / 2;
}

/** 两点距离是否落在首点吸附范围内（用于候选轮廓闭合交互） */
export function nearFirstPoint(points: PlanePoint[], p: PlanePoint, eps = CLOSE_EPS): boolean {
  if (points.length < 3) return false;
  return Math.hypot(points[0].a - p.a, points[0].b - p.b) <= eps;
}
