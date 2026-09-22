import { useStore, useStoreVersion } from '../state/context';

/** 全局门禁横幅：缺层 / 方向冲突时红色置顶，声明禁止一切定量结论 */
export function GateBanner() {
  const store = useStore();
  useStoreVersion();
  const v = store.reconstruction.globalViolations;
  const present = new Set(store.dataset.presentZs);
  const dims = store.dataset.volume.meta.dims;
  const missing: number[] = [];
  for (let z = 0; z < dims.z; z++) if (!present.has(z)) missing.push(z);

  if (v.length === 0 && missing.length === 0) {
    return (
      <div className="gate-banner ok">
        全局门禁通过：切片齐全、方向元数据一致。体积/主轴/表面距离等定量结论可用。
      </div>
    );
  }
  return (
    <div className="gate-banner blocked">
      <strong>⛔ 定量结论已被阻止</strong>
      <ul>
        {v.map((g, i) => (
          <li key={i}>{g.message}</li>
        ))}
      </ul>
      <span className="note">三视图编辑仍可进行，但所有缺陷的物理量、主轴与表面距离一律不输出。</span>
    </div>
  );
}
