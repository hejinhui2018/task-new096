import { useStore } from '../state/store';
import type { Plane } from '../core/types';

const PLANE_LABEL: Record<Plane, string> = { axial: '横断 z', coronal: '冠状 y', sagittal: '矢状 x' };

/** 测量证据：选中缺陷的定量结果；门禁阻断时只显示原因，不显示数值 */
export function MeasurePanel() {
  const { state, dispatch, derived } = useStore();
  const { gates, defects } = derived;
  const d = defects.find((x) => x.id === state.selectedDefect) ?? null;

  return (
    <div className="panel measure-panel">
      <h3>测量证据</h3>
      {!d && <div className="muted">在缺陷列表或体素预览中选择一个缺陷。</div>}
      {d && !gates.quantitativeAllowed && (
        <div className="gate-block">
          <strong>定量结论已阻止</strong>
          <ul>
            {gates.issues.filter((i) => !i.distanceOnly).map((i) => (
              <li key={i.code}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}
      {d && gates.quantitativeAllowed && (
        <div className="measure-grid">
          <div><span>体素数</span><b>{d.measurements.voxelCount}</b></div>
          <div><span>体积</span><b>{d.measurements.volumeMm3.toFixed(3)} mm³</b></div>
          <div>
            <span>包围盒(体素)</span>
            <b>
              [{d.measurements.bboxVoxel.min.join(', ')}] → [{d.measurements.bboxVoxel.max.join(', ')}]
            </b>
          </div>
          <div>
            <span>包围盒(物理 mm)</span>
            <b>
              [{d.measurements.bboxPhys.min.map((v) => v.toFixed(2)).join(', ')}] → [
              {d.measurements.bboxPhys.max.map((v) => v.toFixed(2)).join(', ')}]
            </b>
          </div>
          <div>
            <span>质心(物理 mm)</span>
            <b>[{d.measurements.centroidPhys.map((v) => v.toFixed(2)).join(', ')}]</b>
          </div>
          <div>
            <span>主轴(特征值 mm²)</span>
            <b>[{d.measurements.eigenvalues.map((v) => v.toFixed(3)).join(', ')}]</b>
          </div>
          {d.measurements.principalAxes.map((ax, i) => (
            <div key={i}>
              <span>主轴 {i + 1} 方向</span>
              <b>[{ax.map((v) => v.toFixed(3)).join(', ')}]</b>
            </div>
          ))}
          <div><span>细长比</span><b>{d.measurements.elongation.toFixed(2)}</b></div>
          <div>
            <span>距外表面</span>
            <b>
              {gates.distanceAllowed && d.minSurfaceDistance !== null
                ? `${d.minSurfaceDistance.toFixed(3)} mm`
                : '不可用（未标记外表面）'}
            </b>
          </div>
        </div>
      )}
      {d && (
        <div className="slice-chips">
          <span>参与切片：</span>
          {(Object.keys(PLANE_LABEL) as Plane[]).map((p) => (
            <span key={p} className="chip-group">
              {PLANE_LABEL[p]}:
              {d.slicesByPlane[p].map((idx) => (
                <button
                  key={idx}
                  className="chip"
                  onClick={() => dispatch({ type: 'SET_SLICE', plane: p, index: idx })}
                >
                  {idx}
                </button>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
