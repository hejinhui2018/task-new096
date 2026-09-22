import { useStore } from '../state/store';

/** 缺陷列表：点击行选中并把十字光标跳到缺陷质心 */
export function DefectList() {
  const { state, dispatch, derived } = useStore();
  const { gates, defects } = derived;

  return (
    <div className="panel defect-list">
      <h3>缺陷列表（26 邻域连通分量）</h3>
      {defects.length === 0 && <div className="muted">尚无缺陷掩膜 —— 用"勾画缺陷"逐层勾画并采用。</div>}
      {defects.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>体素数</th>
              <th>体积 mm³</th>
              <th>距表面 mm</th>
              <th>参与层(z)</th>
            </tr>
          </thead>
          <tbody>
            {defects.map((d) => (
              <tr
                key={d.id}
                className={state.selectedDefect === d.id ? 'selected' : ''}
                onClick={() => {
                  dispatch({ type: 'SELECT_DEFECT', id: d.id });
                  const c = d.measurements.centroidPhys;
                  const sp = state.volume!.meta.spacing;
                  const o = state.volume!.meta.origin;
                  dispatch({
                    type: 'SET_CURSOR',
                    voxel: [
                      Math.round((c[0] - o[0]) / sp[0] - 0.5),
                      Math.round((c[1] - o[1]) / sp[1] - 0.5),
                      Math.round((c[2] - o[2]) / sp[2] - 0.5),
                    ],
                  });
                }}
              >
                <td>D{d.id}</td>
                <td>{d.voxels.length}</td>
                <td>{gates.quantitativeAllowed ? d.measurements.volumeMm3.toFixed(2) : '—'}</td>
                <td>{gates.distanceAllowed && d.minSurfaceDistance !== null ? d.minSurfaceDistance.toFixed(2) : '—'}</td>
                <td>{d.slicesByPlane.axial.join(',')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
