/**
 * 派生数据：由 (volume, contours, autoSurface) 计算掩膜、连通分量、测量、门禁。
 * 全部为纯函数，组件中用 useMemo 调用。
 */
import type { Contour, Plane, Volume } from '../core/types';
import { rasterizeContours } from '../core/raster';
import { componentVoxels, labelComponents } from '../core/connectivity';
import {
  measureComponent,
  minDistanceToSurface,
  surfaceDistanceField,
  type ComponentMeasurements,
} from '../core/measure';
import { evaluateGates, type GateResult } from '../core/gates';
import { suggestSurfaceMask, countMask } from '../core/surface';

export interface DefectInfo {
  id: number;
  voxels: number[];
  measurements: ComponentMeasurements;
  /** 参与切片：各平面下出现该缺陷的层索引（升序） */
  slicesByPlane: Record<Plane, number[]>;
  /** 到外表面最短物理距离 mm；门禁或缺表面时为 null */
  minSurfaceDistance: number | null;
}

export interface Derived {
  defectMask: Uint8Array;
  surfaceMask: Uint8Array;
  surfaceVoxelCount: number;
  defects: DefectInfo[];
  gates: GateResult;
}

export function computeDerived(
  volume: Volume | null,
  contours: Contour[],
  autoSurface: boolean,
): Derived {
  const empty: Derived = {
    defectMask: new Uint8Array(0),
    surfaceMask: new Uint8Array(0),
    surfaceVoxelCount: 0,
    defects: [],
    gates: evaluateGates(null, contours, 0),
  };
  if (!volume) return empty;
  const { dims } = volume.meta;
  const n = dims[0] * dims[1] * dims[2];

  const defectMask = new Uint8Array(n);
  rasterizeContours(contours, dims, defectMask, 'defect');

  let surfaceMask: Uint8Array = new Uint8Array(n);
  if (autoSurface) surfaceMask = suggestSurfaceMask(volume, 500);
  rasterizeContours(contours, dims, surfaceMask, 'surface'); // 用户勾画的表面轮廓叠加
  const surfaceVoxelCount = countMask(surfaceMask);

  const gates = evaluateGates(volume, contours, surfaceVoxelCount);

  const { labels, count } = labelComponents(defectMask, dims);
  const distField =
    gates.distanceAllowed && surfaceVoxelCount > 0
      ? surfaceDistanceField(surfaceMask, dims, volume.meta.spacing)
      : null;

  const defects: DefectInfo[] = [];
  for (let id = 1; id <= count; id++) {
    const voxels = componentVoxels(labels, id);
    const measurements = measureComponent(voxels, volume.meta);
    const axial = new Set<number>();
    const coronal = new Set<number>();
    const sagittal = new Set<number>();
    const [nx, ny] = dims;
    for (const i of voxels) {
      const z = Math.floor(i / (nx * ny));
      const rem = i - z * nx * ny;
      const y = Math.floor(rem / nx);
      const x = rem - y * nx;
      axial.add(z);
      coronal.add(y);
      sagittal.add(x);
    }
    defects.push({
      id,
      voxels,
      measurements,
      slicesByPlane: {
        axial: [...axial].sort((a, b) => a - b),
        coronal: [...coronal].sort((a, b) => a - b),
        sagittal: [...sagittal].sort((a, b) => a - b),
      },
      minSurfaceDistance: minDistanceToSurface(voxels, distField),
    });
  }
  defects.sort((a, b) => b.voxels.length - a.voxels.length);

  return { defectMask, surfaceMask, surfaceVoxelCount, defects, gates };
}
