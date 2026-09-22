import { useState } from 'react';
import { voxelToPhysical } from './domain/coordinates';
import { GateBanner } from './components/GateBanner';
import { ImportDialog } from './components/ImportDialog';
import { DefectList, EvidencePanel } from './components/Panels';
import { CandidateBar, LabelBar, Toolbar } from './components/Toolbar';
import { ViewPanel } from './components/ViewPanel';
import { VoxelPreview } from './components/VoxelPreview';
import { useStore, useStoreVersion } from './state/context';

function Header() {
  const store = useStore();
  useStoreVersion();
  return (
    <header className="app-header">
      <div className="title-block">
        <h1>航空铸件工业 CT 缺陷复核台</h1>
        <span className="demo-tag">仅用于复核演示 · 不构成检测结论</span>
      </div>
      <div className="header-controls">
        <select value={store.datasetId} onChange={(e) => store.loadDataset(e.target.value)}>
          {store.listDatasets().map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {store.dataset.builtin && (
          <button className="primary" onClick={() => store.seedDemoMarks()}>
            载入模拟标记（表面+气孔+裂纹）
          </button>
        )}
      </div>
    </header>
  );
}

function CoordinateReadout() {
  const store = useStore();
  useStoreVersion();
  const c = store.ui.cursor;
  const m = store.dataset.volume.meta;
  const p = voxelToPhysical(c, m.spacing, m.origin, m.direction);
  const sliceHere = store.dataset.volume.slices.find((s) => s.z === c.z);
  return (
    <div className="readout">
      十字光标体素 ({c.x}, {c.y}, {c.z})　·　物理 (
      {p.x.toFixed(2)}, {p.y.toFixed(2)}, {p.z.toFixed(2)}) mm
      <span className={sliceHere ? 'ok-text' : 'warn-text'}>
        {sliceHere ? `当前层切片：${sliceHere.name ?? `z=${c.z}`}` : `⚠ 当前 z=${c.z} 切片缺失`}
      </span>
    </div>
  );
}

export default function App() {
  const [importOpen, setImportOpen] = useState(false);
  const store = useStore();
  useStoreVersion();

  return (
    <div className="app">
      <Header />
      <GateBanner />
      <Toolbar onOpenImport={() => setImportOpen(true)} />
      <LabelBar />
      <CoordinateReadout />
      <main className="main-grid">
        <section className="views-area">
          <div className="view-cell axial-cell">
            <ViewPanel view="axial" />
          </div>
          <div className="view-cell">
            <ViewPanel view="sagittal" />
          </div>
          <div className="view-cell">
            <ViewPanel view="coronal" />
          </div>
        </section>
        <aside className="sidebar">
          <div className="panel preview-panel">
            <h3 className="panel-title">
              体素预览
              <label className="rotate-toggle">
                <input
                  type="checkbox"
                  checked={store.ui.autoRotate}
                  onChange={(e) => store.setAutoRotate(e.target.checked)}
                />
                自转
              </label>
            </h3>
            <VoxelPreview />
            <p className="muted small">青：外表面标记；彩色：缺陷；黄：选中缺陷；虚线：最短表面距离。拖动可旋转。</p>
          </div>
          <DefectList />
          <EvidencePanel />
        </aside>
      </main>
      <CandidateBar />
      <footer className="app-footer">
        本工具为复核流程演示：坐标映射、26 邻域连通、物理量与门禁均为教学级实现，不得用于真实产品放行。
      </footer>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}
