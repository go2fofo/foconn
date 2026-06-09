/*
 * @Author: fofo
 * @Date: 2026-06-08 13:33:05
 * @LastEditTime: 2026-06-08 14:23:34
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/App.tsx
 */
import { GlobalLoadingOverlay } from './components/GlobalLoadingOverlay';
import { InputContextMenu } from './components/InputContextMenu';
import { StatusBar } from './components/StatusBar';
import { WorkspaceLayout } from './components/WorkspaceLayout';

function App() {
  return (
    <div className="flex h-screen min-h-screen w-full flex-col overflow-hidden bg-[var(--app-bg-base)] text-[var(--app-text-base)]">
      <div className="relative min-h-0 flex-1">
        <WorkspaceLayout />
      </div>
      <StatusBar />
      <InputContextMenu />
      <GlobalLoadingOverlay />
    </div>
  );
}

export default App;
