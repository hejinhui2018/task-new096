import { useStore, useStoreVersion } from '../state/context';

function fmt(n: number | null | undefined, digits = 3): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

export function DefectList() {
  const store = useStore();
  useStoreVersion();
  const { defects } = store.reconstruction;
  const colorById = new Map(store.doc.labels.map((l) => [l.id, l.color]));

  return (
    <div className="panel">
      <h3 className="panel-title">缺陷列表（26 邻域重建）</h3>
      {defects.length === 0 && <p className="muted">尚无缺陷体素。在视图中勾画闭合轮廓或用笔刷标记后采纳。</p>}
      <ul className="defect-list">
        {defects.map((d) => {
          const color = d.labelIds.map((id) => colorById.get(id)).find(Boolean) ?? '#ff5d5d';
          const selected = d.id === store.ui.selectedDefectId;
          return (
            <li
              key={d.id}
              className={`defect-item ${selected ? 'selected' : ''}`}
              onClick={() => store.focusDefect(d.id)}
            >
              <div className="defect-row">
                <span className="dot" style={{ background: color }} />
                <span className="defect-name">
                  {d.labelIds
                    .map((id) => store.doc.labels.find((l) => l.id === id)?.name ?? id)
                    .join(' + ') || d.id}
                </span>
                <span className={`badge ${d.accepted ? 'badge-ok' : 'badge-warn'}`}>
                  {d.accepted ? '可定量' : '阻止'}
                </span>
              </div>
              <div className="defect-meta">
                {d.voxels.length} 体素 · z={d.slices[0]}..{d.slices[d.slices.length - 1]}（{d.slices.length} 层）
                {d.measurement && <> · {fmt(d.measurement.volumeMm3)} mm³</>}
                {d.measurement?.surfaceDistanceMm !== null && d.measurement?.surfaceDistanceMm !== undefined && (
                  <> · 距表面 {fmt(d.measurement.surfaceDistanceMm, 2)} mm</>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EvidencePanel() {
  const store = useStore();
  useStoreVersion();
  const d = store.reconstruction.defects.find((x) => x.id === store.ui.selectedDefectId) ?? null;

  return (
    <div className="panel">
      <h3 className="panel-title">测量证据{d ? `：${d.id}` : ''}</h3>
      {!d && <p className="muted">点击缺陷查看参与切片、物理量与门禁状态。</p>}
      {d && (
        <div className="evidence">
          <div className={`verdict ${d.accepted ? 'ok' : 'blocked'}`}>
            {d.accepted ? '✔ 门禁通过，定量结论有效（仅复核演示）' : '⛔ 门禁未通过，禁止定量结论'}
          </div>

          {d.violations.length > 0 && (
            <ul className="violations">
              {d.violations.map((v, i) => (
                <li key={i} className="violation">
                  <code>{v.code}</code> {v.message}
                </li>
              ))}
            </ul>
          )}

          <h4>参与切片</h4>
          <div className="slice-chips">
            {d.slices.map((z) => (
              <button
                key={z}
                className={`chip ${store.ui.depths.axial === z ? 'active' : ''}`}
                onClick={() => store.setDepth('axial', z)}
                title={`跳到轴位 z=${z}`}
              >
                z{z}
              </button>
            ))}
          </div>

          {d.measurement ? (
            <table className="measure-table">
              <tbody>
                <tr><th>体素数</th><td>{d.measurement.voxelCount}</td></tr>
                <tr><th>体积</th><td>{fmt(d.measurement.volumeMm3)} mm³</td></tr>
                <tr>
                  <th>包围盒 (体素)</th>
                  <td>
                    ({d.measurement.bbox.min.x},{d.measurement.bbox.min.y},{d.measurement.bbox.min.z}) –
                    ({d.measurement.bbox.max.x},{d.measurement.bbox.max.y},{d.measurement.bbox.max.z})
                  </td>
                </tr>
                <tr>
                  <th>包围盒尺寸</th>
                  <td>
                    {fmt(d.measurement.bbox.size.x)} × {fmt(d.measurement.bbox.size.y)} × {fmt(d.measurement.bbox.size.z)} mm
                  </td>
                </tr>
                <tr>
                  <th>质心 (物理 mm)</th>
                  <td>
                    ({fmt(d.measurement.centroidPhysical.x, 2)}, {fmt(d.measurement.centroidPhysical.y, 2)}, {fmt(d.measurement.centroidPhysical.z, 2)})
                  </td>
                </tr>
                {d.measurement.principalAxes.map((ax, i) => (
                  <tr key={i}>
                    <th>主轴 {i + 1}（扩展 {fmt(ax.extent)} mm）</th>
                    <td>
                      ({fmt(ax.direction.x, 2)}, {fmt(ax.direction.y, 2)}, {fmt(ax.direction.z, 2)})
                    </td>
                  </tr>
                ))}
                <tr>
                  <th>到外表面最短距离</th>
                  <td>
                    {d.measurement.surfaceDistanceMm === null
                      ? '未标记表面'
                      : `${fmt(d.measurement.surfaceDistanceMm, 3)} mm`}
                  </td>
                </tr>
                {d.measurement.surfacePair && (
                  <tr>
                    <th>最近体素对</th>
                    <td>
                      缺陷({d.measurement.surfacePair.defect.x},{d.measurement.surfacePair.defect.y},{d.measurement.surfacePair.defect.z})
                      → 表面({d.measurement.surfacePair.surface.x},{d.measurement.surfacePair.surface.y},{d.measurement.surfacePair.surface.z})
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <p className="muted">未给出测量值（门禁阻止）。</p>
          )}
        </div>
      )}
    </div>
  );
}
