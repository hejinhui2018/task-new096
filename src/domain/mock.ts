// 内置模拟数据：一个含“相邻气孔 + 近表面裂纹”的椭球铸件；另有缺层变体。
// 灰度为确定性合成值（LCG 噪声），无需外部文件即可演示全流程。
import type { SliceImage, Volume, VolumeMeta } from './types';

export interface MockGroundTruth {
  /** 两个相邻但不接触的气孔体素（线性索引） */
  poreA: number[];
  poreB: number[];
  crack: number[];
  /** 零件外表面体素 */
  surface: number[];
  /** 零件实体体素（不含气孔/裂纹） */
  part: number[];
}

export interface MockDataset {
  id: string;
  name: string;
  description: string;
  volume: Volume;
  truth: MockGroundTruth;
}

export const MOCK_SPACING = { x: 0.5, y: 0.5, z: 0.8 };
export const MOCK_DIMS = { x: 48, y: 48, z: 40 };
export const MOCK_ORIGIN = { x: -12, y: -12, z: 0 };

const idx = (x: number, y: number, z: number) => (z * MOCK_DIMS.y + y) * MOCK_DIMS.x + x;

/** 可复现的伪随机数 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ellipsoidPart(dims: { x: number; y: number; z: number }) {
  const cx = dims.x / 2;
  const cy = dims.y / 2;
  const cz = dims.z / 2;
  const rx = dims.x / 2 - 4;
  const ry = dims.y / 2 - 4;
  const rz = dims.z / 2 - 4;
  const part = new Set<number>();
  for (let z = 0; z < dims.z; z++) {
    for (let y = 0; y < dims.y; y++) {
      for (let x = 0; x < dims.x; x++) {
        const q =
          ((x - cx) ** 2) / (rx * rx) +
          ((y - cy) ** 2) / (ry * ry) +
          ((z - cz) ** 2) / (rz * rz);
        if (q <= 1) part.add(idx(x, y, z));
      }
    }
  }
  return part;
}

function blob(cx: number, cy: number, cz: number, r: number): number[] {
  const out: number[] = [];
  for (let z = cz - r; z <= cz + r; z++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy, z - cz);
        if (d <= r - 0.2) out.push(idx(x, y, z));
      }
    }
  }
  return out;
}

function buildGroundTruth(): { part: Set<number>; truth: MockGroundTruth } {
  const part = ellipsoidPart(MOCK_DIMS);
  // 两个相邻气孔：中心相距 8 体素，半径 3，边缘间隔 2 体素 → 26 邻域下仍为两个分量
  const poreA = new Set(blob(18, 24, 14, 3));
  const poreB = new Set(blob(26, 24, 14, 3));
  // 近表面裂纹：沿 z 的细线，距 +x 外壳 1 体素（最短物理距离 0.5 mm）。
  // z 取 18..22，此区间内 y=24 处外壳固定在 x=43，裂纹 x=42 保证间隙恒定。
  const crack = new Set<number>();
  for (let z = 18; z <= 22; z++) {
    crack.add(idx(42, 24, z));
    if (z % 3 !== 0) crack.add(idx(41, 24, z)); // 轻微弯折的细线
  }

  // 外表面必须在挖除缺陷“之前”提取：否则气孔内壁会被误当成零件外表面，
  // 导致深埋气孔的表面距离被错算为 0。
  const surface: number[] = [];
  for (const v of part) {
    const x = v % MOCK_DIMS.x;
    const y = Math.floor(v / MOCK_DIMS.x) % MOCK_DIMS.y;
    const z = Math.floor(v / (MOCK_DIMS.x * MOCK_DIMS.y));
    let exposed = false;
    for (const [dx, dy, dz] of [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1],
    ]) {
      if (!part.has(idx(x + dx, y + dy, z + dz))) {
        exposed = true;
        break;
      }
    }
    if (exposed) surface.push(v);
  }

  for (const v of [...poreA, ...poreB, ...crack]) part.delete(v);
  return {
    part,
    truth: {
      poreA: [...poreA].sort((a, b) => a - b),
      poreB: [...poreB].sort((a, b) => a - b),
      crack: [...crack].sort((a, b) => a - b),
      surface: surface.sort((a, b) => a - b),
      part: [...part].sort((a, b) => a - b),
    },
  };
}

function renderSlices(part: Set<number>, defects: Set<number>, omitZ?: Set<number>): SliceImage[] {
  const rand = lcg(20260922);
  const slices: SliceImage[] = [];
  const { x: W, y: H, z: D } = MOCK_DIMS;
  for (let z = 0; z < D; z++) {
    if (omitZ?.has(z)) continue; // 缺层：清单中直接缺号
    const data = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const li = idx(x, y, z);
        if (defects.has(li)) data[y * W + x] = 250 + Math.floor(rand() * 120);
        else if (part.has(li)) data[y * W + x] = 1700 + Math.floor(rand() * 260) + (y - x) * 2;
        else data[y * W + x] = 0; // 空气
      }
    }
    slices.push({ z, name: `slice_${String(z).padStart(3, '0')}.raw`, data });
  }
  return slices;
}

function meta(): VolumeMeta {
  return {
    dims: { ...MOCK_DIMS },
    spacing: { ...MOCK_SPACING },
    origin: { ...MOCK_ORIGIN },
    intensityRange: { min: 0, max: 2200 },
  };
}

let cached: { part: Set<number>; truth: MockGroundTruth } | null = null;

function getTruth() {
  if (!cached) cached = buildGroundTruth();
  return cached;
}

export function buildFullMock(): MockDataset {
  const { part, truth } = getTruth();
  const defects = new Set<number>([...truth.poreA, ...truth.poreB, ...truth.crack]);
  return {
    id: 'mock-full',
    name: '完整模拟件（相邻气孔 + 近表面裂纹）',
    description: '48×48×40 椭球铸件，含两个相邻气孔与一条近表面裂纹，切片完整。',
    volume: { meta: meta(), slices: renderSlices(part, defects) },
    truth,
  };
}

export function buildMissingSliceMock(): MockDataset {
  const { part, truth } = getTruth();
  const defects = new Set<number>([...truth.poreA, ...truth.poreB, ...truth.crack]);
  const omit = new Set<number>([17]);
  const base = meta();
  return {
    id: 'mock-missing-z17',
    name: '缺层模拟件（z=17 缺失）',
    description: '与完整件相同，但清单中缺失 z=17 切片：定量结论必须被门禁阻止。',
    volume: { meta: base, slices: renderSlices(part, defects, omit) },
    truth,
  };
}

export const MOCK_DATASETS: MockDataset[] = [buildFullMock(), buildMissingSliceMock()];
