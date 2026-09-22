import { useEffect } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Toolbar } from './components/Toolbar';
import { GateBanner } from './components/GateBanner';
import { SliceCanvas } from './components/SliceCanvas';
import { DefectList } from './components/DefectList';
import { MeasurePanel } from './components/MeasurePanel';
import { VoxelPreview } from './components/VoxelPreview';
import { ImportDialog } from './components/ImportDialog';

function Workstation() {
  const { state, dispatch } = useStore();

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div className="app">
      <header>
        <h1>工业 CT 缺陷复核台 <span className="demo-tag">仅复核演示</span></h1>
        <div className="meta">
          {state.volume && (
            <>
              体数据 {state.volume.meta.dims.join('×')} · 间距 [
              {state.volume.meta.spacing.join(', ')}] mm · 原点 [
              {state.volume.meta.origin.join(', ')}] · 方向 {state.volume.meta.orientation} · 来源{' '}
              {state.volume.sourceId}
            </>
          )}
        </div>
      </header>
      <GateBanner />
      <Toolbar />
      <main>
        <section className="views">
          <SliceCanvas plane="axial" />
          <SliceCanvas plane="coronal" />
          <SliceCanvas plane="sagittal" />
        </section>
        <aside>
          <DefectList />
          <MeasurePanel />
          <VoxelPreview />
        </aside>
      </main>
      <ImportDialog />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Workstation />
    </StoreProvider>
  );
}
