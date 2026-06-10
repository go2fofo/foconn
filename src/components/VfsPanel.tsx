import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SessionConfig, TransferProgress, VfsNode, VfsTransferEntry } from '../types';
import { FileSystem } from './FileSystem';
import { DesktopDropState, TransferBatchInfo, VfsFeedbackLayer } from './VfsFeedbackLayer';
import { TransferQueueBar } from './TransferQueueBar';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { withGlobalLoading } from '../store/globalLoadingStore';
import { useTransferStore } from '../store/vfsStore';

interface VfsPanelProps {
  session: SessionConfig;
}

type SortKey = 'time' | 'size' | 'name';
type SortOrder = 'asc' | 'desc';

interface DeleteDialogState {
  side: 'local' | 'remote';
  nodes: VfsNode[];
}

interface ConflictDialogState {
  direction: 'UPLOAD' | 'DOWNLOAD';
  conflicts: VfsNode[]; // 遭遇冲突的重名节点
  allEntries: VfsTransferEntry[]; // 全量待传输节点
}

export function VfsPanel({ session }: VfsPanelProps) {
  const { t } = useTranslation();
  const syncTasks = useTransferStore((state) => state.syncTasks);
  const activeTasks = useTransferStore((state) => state.tasks);
  const transferHistory = useTransferStore((state) => state.history);
  const [vfsSessionId, setVfsSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [localPath, setLocalPath] = useState('/');
  const [remotePath, setRemotePath] = useState('/');
  
  const [localNodes, setLocalNodes] = useState<VfsNode[]>([]);
  const [remoteNodes, setRemoteNodes] = useState<VfsNode[]>([]);
  
  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  
  // 🪐 纯指针拖拽核心状态
  const [draggingPayload, setDraggingPayload] = useState<{ count: number; sourceSide: 'local' | 'remote'; nodes?: VfsNode[] } | null>(null);
  const draggingPayloadRef = useRef(draggingPayload);
  useEffect(() => { draggingPayloadRef.current = draggingPayload; }, [draggingPayload]);

  // 🗑️ 弹窗状态
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null);

  const [desktopDropState, setDesktopDropState] = useState<DesktopDropState | null>(null);
  const [transferBatches, setTransferBatches] = useState<TransferBatchInfo[]>([]);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [queueRecentFilter, setQueueRecentFilter] = useState<'all' | 'failed'>('all');
  const completedTaskIdsRef = useRef<Set<string>>(new Set());
  
  // 📐 两侧面板物理边界引用
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const remotePanelRef = useRef<HTMLDivElement | null>(null);
  
  const favoritesStorageKey = useMemo(
    () => `foconn:vfs:favorites:${session.host ?? 'remote'}:${session.port ?? 22}:${session.auth?.username ?? 'root'}`,
    [session.auth?.username, session.host, session.port],
  );
  const localFavoritesStorageKey = 'foconn:vfs:local-favorites';
  const [localFavorites, setLocalFavorites] = useState<string[]>([]);
  const [remoteFavorites, setRemoteFavorites] = useState<string[]>([]);
  const sessionDisplayName = useMemo(
    () => `${session.auth?.username ?? 'root'}@${session.host ?? 'localhost'}:${session.port ?? 22}`,
    [session.auth?.username, session.host, session.port],
  );

  const [localSortKey, setLocalSortKey] = useState<SortKey>('time');
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>('desc');
  const [remoteSortKey, setRemoteSortKey] = useState<SortKey>('time');
  const [remoteSortOrder, setRemoteSortOrder] = useState<SortOrder>('desc');

  const [localSelected, setLocalSelected] = useState<VfsNode[]>([]);
  const [remoteSelected, setRemoteSelected] = useState<VfsNode[]>([]);
  const [lastFocusedSide, setLastFocusedSide] = useState<'local' | 'remote' | null>(null);

  const getSortedNodes = (nodes: VfsNode[], key: SortKey, order: SortOrder) => {
    if (!nodes || nodes.length === 0) return [];
    const parentNode = nodes.find((n) => n.name === '..');
    const normalNodes = nodes.filter((n) => n.name !== '..');
    const sorted = [...normalNodes].sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      if (key === 'time') return order === 'asc' ? (a.mtime || 0) - (b.mtime || 0) : (b.mtime || 0) - (a.mtime || 0);
      if (key === 'size') return order === 'asc' ? (a.size || 0) - (b.size || 0) : (b.size || 0) - (a.size || 0);
      if (key === 'name') return order === 'asc' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : b.name.localeCompare(a.name, undefined, { numeric: true });
      return 0;
    });
    return parentNode ? [parentNode, ...sorted] : sorted;
  };

  const displayLocalNodes = useMemo(() => getSortedNodes(localNodes, localSortKey, localSortOrder), [localNodes, localSortKey, localSortOrder]);
  const displayRemoteNodes = useMemo(() => getSortedNodes(remoteNodes, remoteSortKey, remoteSortOrder), [remoteNodes, remoteSortKey, remoteSortOrder]);

  // -------------------------------------------------------------------
  // ⚡ 核心逻辑：检测重名冲突文件
  // -------------------------------------------------------------------
  const checkAndStartTransfer = (direction: 'UPLOAD' | 'DOWNLOAD', entries: VfsTransferEntry[]) => {
    // 找出目标侧现有的文件名清单
    const targetNodeNames = new Set(
      (direction === 'UPLOAD' ? remoteNodes : localNodes)
        .filter((n) => n.name !== '..')
        .map((n) => n.name)
    );

    // 筛选出所有名字装车的冲突项
    const conflicts = entries.filter((e) => targetNodeNames.has(e.name));

    if (conflicts.length > 0) {
      // 🚨 触发拦截！弹框让用户抉择
      setConflictDialog({
        direction,
        conflicts,
        allEntries: entries,
      });
    } else {
      // 🟢 一路畅通，直接发射
      void startTransfer(direction, entries);
    }
  };

  const handleConflictResolve = (action: 'OVERWRITE' | 'SKIP' | 'CANCEL') => {
    if (!conflictDialog) return;
    const { direction, conflicts, allEntries } = conflictDialog;
    setConflictDialog(null);

    if (action === 'CANCEL') return;

    if (action === 'SKIP') {
      // 过滤掉重名节点，只留干净的
      const conflictNames = new Set(conflicts.map((c) => c.name));
      const safeEntries = allEntries.filter((e) => !conflictNames.has(e.name));
      if (safeEntries.length > 0) {
        void startTransfer(direction, safeEntries);
      }
      return;
    }

    if (action === 'OVERWRITE') {
      // 全部放行覆盖
      void startTransfer(direction, allEntries);
    }
  };

  // -------------------------------------------------------------------
  // ⚡ 双向指针收网中心 (完美纠正高亮边框定位 + 双向冲突检查)
  // -------------------------------------------------------------------
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingPayloadRef.current) return;

      const localRect = localPanelRef.current?.getBoundingClientRect();
      const remoteRect = remotePanelRef.current?.getBoundingClientRect();

      const insideLocal = localRect 
        ? (e.clientX >= localRect.left && e.clientX <= localRect.right && e.clientY >= localRect.top && e.clientY <= localRect.bottom)
        : false;

      const insideRemote = remoteRect 
        ? (e.clientX >= remoteRect.left && e.clientX <= remoteRect.right && e.clientY >= remoteRect.top && e.clientY <= remoteRect.bottom)
        : false;

      const sourceSide = draggingPayloadRef.current.sourceSide;

      // 🎯 动态计算应该高亮哪一边，以及目标路径
      let showHighlight = false;
      let isTargetInside = false;
      let currentTargetPath = '';

      if (sourceSide === 'local') {
        showHighlight = true;
        isTargetInside = insideRemote; // 本地拖出来，只有进入右侧才叫“瞄准目标”
        currentTargetPath = remotePath;
      } else {
        showHighlight = true;
        isTargetInside = insideLocal; // 远程拖出来，只有进入左侧才叫“瞄准目标”
        currentTargetPath = localPath;
      }

      setDesktopDropState({
        active: showHighlight,
        insideTarget: isTargetInside, // 决定高亮是否点亮
        totalCount: draggingPayloadRef.current.count,
        fileCount: draggingPayloadRef.current.count,
        directoryCount: 0,
        targetPath: currentTargetPath,
      });
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!draggingPayloadRef.current) return;
      
      const payload = draggingPayloadRef.current;
      const localRect = localPanelRef.current?.getBoundingClientRect();
      const remoteRect = remotePanelRef.current?.getBoundingClientRect();

      const insideLocal = localRect 
        ? (e.clientX >= localRect.left && e.clientX <= localRect.right && e.clientY >= localRect.top && e.clientY <= localRect.bottom)
        : false;

      const insideRemote = remoteRect 
        ? (e.clientX >= remoteRect.left && e.clientX <= remoteRect.right && e.clientY >= remoteRect.top && e.clientY <= remoteRect.bottom)
        : false;

      setDraggingPayload(null);
      setDesktopDropState(null);

      if (!payload.nodes || payload.nodes.length === 0) return;
      const validNodes = payload.nodes.filter((entry) => entry.name !== '..');

      if (payload.sourceSide === 'local' && insideRemote) {
        // A流：左边 -> 右边 (上传检查)
        checkAndStartTransfer('UPLOAD', validNodes);
      } else if (payload.sourceSide === 'remote' && insideLocal) {
        // B流：右边 -> 左边 (下载检查)
        checkAndStartTransfer('DOWNLOAD', validNodes);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [remotePath, localPath, remoteNodes, localNodes]);

  // -------------------------------------------------------------------
  // 从操作系统 Finder/桌面直接扔进来的外部拖拽处理 (仅允许上传到远程)
  // -------------------------------------------------------------------
  const isPointInsideRemotePanel = (position: { x: number; y: number }) => {
    const rect = remotePanelRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const scale = window.devicePixelRatio || 1;
    return (position.x / scale) >= rect.left && (position.x / scale) <= rect.right && (position.y / scale) >= rect.top && (position.y / scale) <= rect.bottom;
  };

  useEffect(() => {
    let isDisposed = false; let unlisten: (() => void) | undefined;
    const bindDesktopDrop = async () => {
      unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
        if (isDisposed) return; const payload = event.payload;
        if (payload.type === 'leave') { setDesktopDropState(null); return; }
        if (payload.type === 'enter') {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          if ('paths' in payload && payload.paths && payload.paths.length > 0) {
            setDesktopDropState({ active: true, insideTarget, totalCount: payload.paths.length, fileCount: payload.paths.length, directoryCount: 0, targetPath: remotePath });
          }
          return;
        }
        if (payload.type === 'over') {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          setDesktopDropState((curr) => curr ? { ...curr, insideTarget, targetPath: remotePath } : curr);
          return;
        }
        if (payload.type === 'drop') {
          const insideTarget = isPointInsideRemotePanel(payload.position); setDesktopDropState(null);
          if (insideTarget && 'paths' in payload && payload.paths && payload.paths.length > 0) {
            try {
              setErrorMessage(null);
              const entries = await invoke<VfsTransferEntry[]>('vfs_describe_local_entries', { paths: payload.paths });
              // 外部扔进来的同样走防冲突管道
              checkAndStartTransfer('UPLOAD', entries);
            } catch (error) { setErrorMessage(String(error)); }
          }
        }
      });
    };
    void bindDesktopDrop(); return () => { isDisposed = true; unlisten?.(); };
  }, [remotePath, remoteNodes]);

  // -------------------------------------------------------------------
  // 键盘原生安全删除拦截
  // -------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.getAttribute('contenteditable') === 'true')) return;
        
        if (lastFocusedSide === 'local' && localSelected.length > 0) {
          setDeleteDialog({ side: 'local', nodes: localSelected.filter(n => n.name !== '..') });
        } else if (lastFocusedSide === 'remote' && remoteSelected.length > 0) {
          setDeleteDialog({ side: 'remote', nodes: remoteSelected.filter(n => n.name !== '..') });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [lastFocusedSide, localSelected, remoteSelected]);

  // -------------------------------------------------------------------
  // SFTP 通用联动 API & 轮询
  // -------------------------------------------------------------------
  useEffect(() => {
    try { const raw = window.localStorage.getItem(localFavoritesStorageKey); setLocalFavorites(raw ? JSON.parse(raw) : []); } catch {}
  }, []);
  useEffect(() => {
    try { const raw = window.localStorage.getItem(favoritesStorageKey); setRemoteFavorites(raw ? JSON.parse(raw) : []); } catch {}
  }, [favoritesStorageKey]);

  const updateLocalFavorites = (next: string[]) => { setLocalFavorites(next); window.localStorage.setItem(localFavoritesStorageKey, JSON.stringify(next)); };
  const updateRemoteFavorites = (next: string[]) => { setRemoteFavorites(next); window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next)); };

  useEffect(() => {
    let active = true; let createdSessionId: string | null = null;
    const initVfs = async () => {
      try {
        const id = await withGlobalLoading(() => invoke<string>('vfs_connect', { config: session }), { message: t('loading.connecting_sftp'), detail: sessionDisplayName });
        createdSessionId = id; if (active) setVfsSessionId(id);
      } catch (err) { if (active) setErrorMessage(String(err)); }
    };
    initVfs();
    return () => { active = false; setVfsSessionId(null); if (createdSessionId) { invoke('vfs_disconnect', { vfsSessionId: createdSessionId }).catch(console.error); } };
  }, [session.id, session.host, session.port]);

  const fetchLocalNodes = async () => {
    setIsLoadingLocal(true);
    try { const nodes = await invoke<VfsNode[]>('vfs_list_dir', { vfsSessionId: 'local', path: localPath }); setLocalNodes(nodes); } 
    catch (err) { setErrorMessage(String(err)); } finally { setIsLoadingLocal(false); }
  };

  const fetchRemoteNodes = async () => {
    if (!vfsSessionId) return; setIsLoadingRemote(true);
    try { const nodes = await invoke<VfsNode[]>('vfs_list_dir', { vfsSessionId, path: remotePath }); setRemoteNodes(nodes); } 
    catch { setRemoteNodes([]); } finally { setIsLoadingRemote(false); }
  };

  useEffect(() => { fetchLocalNodes(); setLocalSelected([]); }, [localPath]);
  useEffect(() => { if (vfsSessionId) { fetchRemoteNodes(); setRemoteSelected([]); } }, [remotePath, vfsSessionId]);

  useEffect(() => {
    let active = true;
    const pollTasks = async () => {
      try {
        const snapshot = await invoke<TransferProgress[]>('vfs_get_transfer_tasks'); if (!active) return;
        syncTasks(snapshot);
        const hasNewCompleted = snapshot.some((task) => {
          const isDone = task.status === 'COMPLETED' || task.status === 'FAILED';
          if (!isDone || completedTaskIdsRef.current.has(task.task_id)) return false;
          completedTaskIdsRef.current.add(task.task_id); return true;
        });
        if (hasNewCompleted) { void fetchLocalNodes(); if (vfsSessionId) void fetchRemoteNodes(); }
      } catch {}
    };
    const timer = window.setInterval(() => { void pollTasks(); }, 600);
    return () => { active = false; window.clearInterval(timer); };
  }, [syncTasks, vfsSessionId, localPath, remotePath]);

  const startTransfer = async (direction: 'UPLOAD' | 'DOWNLOAD', entries: VfsTransferEntry[]) => {
    if (!vfsSessionId || entries.length === 0) return;
    try {
      const taskIds = await withGlobalLoading(() => invoke<string[]>('vfs_start_transfer', { request: { vfs_session_id: vfsSessionId, direction, local_base_path: localPath, remote_base_path: remotePath, entries: entries.map((e) => ({ name: e.name, path: e.path, is_dir: e.is_dir, size: e.size })) } }), { message: direction === 'UPLOAD' ? t('loading.starting_upload') : t('loading.starting_download'), detail: direction === 'UPLOAD' ? remotePath : localPath });
      if (taskIds.length > 0) { setTransferBatches((curr) => [{ batchId: `${Date.now()}`, taskIds, direction, itemCount: entries.length }, ...curr]); }
    } catch (error) { setErrorMessage(String(error)); }
  };

  const refreshForSide = async (side: 'local' | 'remote') => { if (side === 'local') await fetchLocalNodes(); else await fetchRemoteNodes(); };
  const handleRenameNode = async (side: 'local' | 'remote', node: VfsNode, nextName: string) => { try { await invoke('vfs_rename_node', { request: { vfs_session_id: side === 'local' ? 'local' : vfsSessionId, path: node.path, next_name: nextName } }); await refreshForSide(side); } catch (e) { setErrorMessage(String(e)); } };
  
  const executeDeleteNodes = async (side: 'local' | 'remote', nodes: VfsNode[]) => {
    if (!nodes.length) return;
    try {
      await invoke('vfs_delete_nodes', { request: { vfs_session_id: side === 'local' ? 'local' : vfsSessionId, paths: nodes.map(n => n.path) } });
      if (side === 'local') setLocalSelected([]); else setRemoteSelected([]);
      await refreshForSide(side);
    } catch (e) { setErrorMessage(String(e)); }
  };

  const handleCreateDirectory = async (side: 'local' | 'remote', parent: string, name: string) => { try { await invoke('vfs_create_dir', { request: { vfs_session_id: side === 'local' ? 'local' : vfsSessionId, parent_path: parent, name } }); await refreshForSide(side); } catch (e) { setErrorMessage(String(e)); } };

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--app-bg-base)]">
      <VfsFeedbackLayer
        panelErrorMessage={errorMessage} activeTasks={activeTasks} transferHistory={transferHistory}
        transferBatches={transferBatches} draggingPayload={draggingPayload} desktopDropState={desktopDropState}
        onLocateTask={(taskId) => setFocusTaskId(taskId)}
      />
      
      <div className="flex overflow-hidden flex-1">
        <FileSystem 
          title={t('vfs.local_files')} path={localPath} nodes={displayLocalNodes} onNavigate={setLocalPath}
          onRefresh={() => void fetchLocalNodes()} isLoading={isLoadingLocal} side="local" favorites={localFavorites}
          onFavoriteCurrent={() => { if (!localFavorites.includes(localPath)) updateLocalFavorites([localPath, ...localFavorites]); }}
          onOpenFavorite={setLocalPath} onRemoveFavorite={(fav) => updateLocalFavorites(localFavorites.filter(i => i !== fav))}
          onPrimaryTransfer={(entries) => checkAndStartTransfer('UPLOAD', entries)}
          onReceiveTransfer={() => {}}
          onDragStateChange={(payload) => setDraggingPayload(payload)}
          onRenameNode={(node, name) => void handleRenameNode('local', node, name)}
          onDeleteNodes={(nodes) => setDeleteDialog({ side: 'local', nodes })}
          onCreateDirectory={(name) => void handleCreateDirectory('local', localPath, name)}
          
          panelRef={localPanelRef}
          forcedDropActive={desktopDropState?.active && draggingPayload?.sourceSide === 'remote' ? desktopDropState.insideTarget : false}
          
          onSelectionChange={(nodes) => { setLocalSelected(nodes); setLastFocusedSide('local'); }}
          sortKey={localSortKey} sortOrder={localSortOrder} onSortChange={(k, o) => { setLocalSortKey(k as SortKey); setLocalSortOrder(o as SortOrder); }}
          hidePermissions={true}
        />
        
        <FileSystem 
          title={t('vfs.remote_files')} path={remotePath} nodes={displayRemoteNodes} onNavigate={setRemotePath}
          onRefresh={() => void fetchRemoteNodes()} isLoading={isLoadingRemote} side="remote" favorites={remoteFavorites}
          onFavoriteCurrent={() => { if (!remoteFavorites.includes(remotePath)) updateRemoteFavorites([remotePath, ...remoteFavorites]); }}
          onOpenFavorite={setRemotePath} onRemoveFavorite={(fav) => updateRemoteFavorites(remoteFavorites.filter(i => i !== fav))}
          onPrimaryTransfer={(entries) => checkAndStartTransfer('DOWNLOAD', entries)}
          onReceiveTransfer={() => {}}
          onDragStateChange={(payload) => setDraggingPayload(payload)}
          onRenameNode={(node, name) => void handleRenameNode('remote', node, name)}
          onDeleteNodes={(nodes) => setDeleteDialog({ side: 'remote', nodes })}
          onCreateDirectory={(name) => void handleCreateDirectory('remote', remotePath, name)}
          
          panelRef={remotePanelRef}
          forcedDropActive={desktopDropState?.active && draggingPayload?.sourceSide === 'local' ? desktopDropState.insideTarget : false}
          
          onSelectionChange={(nodes) => { setRemoteSelected(nodes); setLastFocusedSide('remote'); }}
          sortKey={remoteSortKey} sortOrder={remoteSortOrder} onSortChange={(k, o) => { setRemoteSortKey(k as SortKey); setRemoteSortOrder(o as SortOrder); }}
          hidePermissions={true}
        />
      </div>
      
      <TransferQueueBar focusTaskId={focusTaskId} recentFilter={queueRecentFilter} onRecentFilterChange={setQueueRecentFilter} />

      {/* 🗑️ 确认删除弹框 */}
      {deleteDialog && deleteDialog.nodes.length > 0 ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[420px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)]">
            <div className="text-base font-semibold text-white">{t("vfs.delete")}</div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {deleteDialog.nodes.length === 1
                ? t("context_menu.delete_confirm_single", { name: deleteDialog.nodes[0]?.name ?? "" })
                : t("context_menu.delete_confirm_multi", { count: deleteDialog.nodes.length })}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={() => setDeleteDialog(null)} className="rounded-[12px] border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]">{t("common.cancel")}</button>
              <button type="button" onClick={() => { void executeDeleteNodes(deleteDialog.side, deleteDialog.nodes); setDeleteDialog(null); }} className="rounded-[12px] border border-[rgba(255,92,92,0.3)] bg-[rgba(255,92,92,0.12)] px-4 py-2 text-sm text-white transition hover:bg-[rgba(255,92,92,0.18)]">{t("vfs.delete")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ⚡ 优雅的重复文件冲突解决对话框 */}
      {conflictDialog ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[440px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex gap-2 items-center text-base font-semibold text-white">
              <span className="text-yellow-500">⚠️</span> {t("vfs.file_conflict", "文件冲突")}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)] leading-relaxed">
              {conflictDialog.conflicts.length === 1 ? (
                <div>
                  {t("vfs.conflict_msg_single", "目标路径已存在同名文件/文件夹:")}
                  <div className="mt-1.5 rounded-lg bg-[var(--app-bg-hover)] px-3 py-1.5 font-mono text-xs text-white truncate">
                    {conflictDialog.conflicts[0].name}
                  </div>
                </div>
              ) : (
                <div>
                  {t("vfs.conflict_msg_multi", "检测到有 {{count}} 个文件/文件夹在目标端已存在:", { count: conflictDialog.conflicts.length })}
                </div>
              )}
              <div className="mt-3 text-xs text-yellow-500/80">
                {t("vfs.conflict_action_tip", "请选择您的处理方式：")}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              {/* 取消 */}
              <button
                type="button"
                onClick={() => handleConflictResolve('CANCEL')}
                className="rounded-[12px] border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("common.cancel")}
              </button>
              
              {/* 跳过同名 */}
              <button
                type="button"
                onClick={() => handleConflictResolve('SKIP')}
                className="rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-base)] px-3 py-2 text-sm text-white transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("vfs.skip_conflict", "跳过同名")}
              </button>
              
              {/* 覆盖现有 */}
              <button
                type="button"
                onClick={() => handleConflictResolve('OVERWRITE')}
                className="rounded-[12px] border border-transparent bg-blue-600 px-4 py-2 text-sm text-white font-medium transition hover:bg-blue-500"
              >
                {t("vfs.overwrite", "覆盖现有")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}