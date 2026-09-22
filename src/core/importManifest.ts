/**
 * 切片清单（manifest）导入与校验。
 * 清单为 JSON：全局 spacing/origin/orientation + 每片灰度数据（base64，8 或 16 bit）。
 * 校验产出：缺层列表（presentSlices）与元数据冲突列表（conflicts）——两者都进入门禁。
 */
import type { Volume, VolumeMeta } from './types';

export interface SliceEntry {
  index: number;
  bits?: 8 | 16;
  data: string; // base64
  spacing?: [number, number, number];
  origin?: [number, number, number];
  orientation?: string;
}

export interface SliceManifest {
  kind: 'ct-slice-manifest';
  version: 1;
  width: number;
  height: number;
  spacing: [number, number, number];
  origin: [number, number, number];
  orientation: string;
  slices: SliceEntry[];
}

export interface ImportResult {
  volume: Volume | null;
  errors: string[];
}

const EPS = 1e-6;

function decodeBase64(b64: string): Uint8Array {
  // 浏览器与 Node ≥16 均有全局 atob
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function parseManifest(json: string): { manifest: SliceManifest | null; error: string | null } {
  let m: unknown;
  try {
    m = JSON.parse(json);
  } catch (e) {
    return { manifest: null, error: `JSON 解析失败：${(e as Error).message}` };
  }
  const o = m as Partial<SliceManifest>;
  if (o?.kind !== 'ct-slice-manifest') return { manifest: null, error: 'kind 必须为 "ct-slice-manifest"' };
  if (!Number.isInteger(o.width) || !Number.isInteger(o.height) || o.width! <= 0 || o.height! <= 0)
    return { manifest: null, error: 'width/height 必须为正整数' };
  if (!Array.isArray(o.spacing) || o.spacing.length !== 3 || o.spacing.some((s) => !(s > 0)))
    return { manifest: null, error: 'spacing 必须为 3 个正数（mm）' };
  if (!Array.isArray(o.origin) || o.origin.length !== 3)
    return { manifest: null, error: 'origin 必须为 3 个数（mm）' };
  if (typeof o.orientation !== 'string' || o.orientation.length === 0)
    return { manifest: null, error: 'orientation 必须为非空字符串（如 "RAS"）' };
  if (!Array.isArray(o.slices) || o.slices.length === 0)
    return { manifest: null, error: 'slices 不能为空' };
  return { manifest: o as SliceManifest, error: null };
}

export function buildVolumeFromManifest(m: SliceManifest): ImportResult {
  const errors: string[] = [];
  const conflicts: string[] = [];
  const nx = m.width;
  const ny = m.height;

  // 层索引必须落在 [0, nz) —— nz 由最大 index + 1 推断；重复 index 视为冲突
  const seen = new Set<number>();
  let maxIndex = -1;
  for (const s of m.slices) {
    if (!Number.isInteger(s.index) || s.index < 0) {
      errors.push(`切片 index 非法：${String(s.index)}`);
      continue;
    }
    if (seen.has(s.index)) conflicts.push(`切片 index ${s.index} 重复出现`);
    seen.add(s.index);
    maxIndex = Math.max(maxIndex, s.index);
  }
  if (errors.length > 0) return { volume: null, errors };
  const nz = maxIndex + 1;

  // 元数据一致性：逐片的 spacing/origin/orientation 若与全局不一致 → 冲突（门禁阻断）
  for (const s of m.slices) {
    if (s.spacing && s.spacing.some((v, k) => Math.abs(v - m.spacing[k]) > EPS))
      conflicts.push(`切片 ${s.index} 的间距 [${s.spacing.join(',')}] 与全局 [${m.spacing.join(',')}] 不一致`);
    if (s.origin && s.origin.some((v, k) => Math.abs(v - m.origin[k]) > EPS))
      conflicts.push(`切片 ${s.index} 的原点与全局不一致`);
    if (s.orientation && s.orientation !== m.orientation)
      conflicts.push(`切片 ${s.index} 的方向 "${s.orientation}" 与全局 "${m.orientation}" 冲突`);
  }

  const meta: VolumeMeta = {
    dims: [nx, ny, nz],
    spacing: [...m.spacing],
    origin: [...m.origin],
    orientation: m.orientation,
  };
  const data = new Uint16Array(nx * ny * nz);
  const presentSlices = new Array(nz).fill(false);

  for (const s of m.slices) {
    const raw = decodeBase64(s.data);
    const bits = s.bits ?? 16;
    const need = bits === 16 ? nx * ny * 2 : nx * ny;
    if (raw.length !== need) {
      errors.push(`切片 ${s.index} 数据长度 ${raw.length} 与 ${nx}×${ny}×${bits}bit 期望 ${need} 不符`);
      continue;
    }
    const base = nx * ny * s.index;
    if (bits === 16) {
      const view = new Uint16Array(raw.buffer, raw.byteOffset, nx * ny);
      data.set(view, base);
    } else {
      for (let i = 0; i < nx * ny; i++) data[base + i] = raw[i];
    }
    presentSlices[s.index] = true;
  }
  if (errors.length > 0) return { volume: null, errors };

  return {
    volume: {
      meta,
      data,
      presentSlices,
      conflicts,
      sourceId: 'import',
    },
    errors: [],
  };
}
