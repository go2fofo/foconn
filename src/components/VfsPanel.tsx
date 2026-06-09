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

interface FetchNodesOptions {
  withGlobalLoading?: boolean;
  loadingMessage?: string;
  loadingDetail?: string;
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
  const [draggingPayload, setDraggingPayload] = useState<{ count: number; sourceSide: 'local' | 'remote' } | null>(null);
  const [desktopDropState, setDesktopDropState] = useState<DesktopDropState | null>(null);
  const [transferBatches, setTransferBatches] = useState<TransferBatchInfo[]>([]);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [queueRecentFilter, setQueueRecentFilter] = useState<'all' | 'failed'>('all');
  const completedTaskIdsRef = useRef<Set<string>>(new Set());
  const desktopPreviewRequestIdRef = useRef(0);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(localFavoritesStorageKey);
      const next = raw ? (JSON.parse(raw) as string[]) : [];
      setLocalFavorites(Array.isArray(next) ? next : []);
    } catch (error) {
      console.warn('Failed to restore local favorites', error);
      setLocalFavorites([]);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(favoritesStorageKey);
      const next = raw ? (JSON.parse(raw) as string[]) : [];
      setRemoteFavorites(Array.isArray(next) ? next : []);
    } catch (error) {
      console.warn('Failed to restore remote favorites', error);
      setRemoteFavorites([]);
    }
  }, [favoritesStorageKey]);

  const updateLocalFavorites = (next: string[]) => {
    setLocalFavorites(next);
    window.localStorage.setItem(localFavoritesStorageKey, JSON.stringify(next));
  };

  const updateRemoteFavorites = (next: string[]) => {
    setRemoteFavorites(next);
    window.localStorage.setItem(favoritesStorageKey, JSON.stringify(next));
  };

  useEffect(() => {
    let active = true;
    let createdSessionId: string | null = null;

    const initVfs = async () => {
      try {
        setErrorMessage(null);
        const id = await withGlobalLoading(
          () => invoke<string>('vfs_connect', { config: session }),
          {
            message: t('loading.connecting_sftp'),
            detail: sessionDisplayName,
          },
        );
        createdSessionId = id;
        if (active) {
          setVfsSessionId(id);
        }
      } catch (err) {
        console.error('Failed to connect VFS:', err);
        if (active) {
          setErrorMessage(String(err));
        }
      }
    };

    initVfs();

    return () => {
      active = false;
      setVfsSessionId(null);
      if (createdSessionId) {
        invoke('vfs_disconnect', { vfsSessionId: createdSessionId }).catch(console.error);
      }
    };
  }, [session.id, session.host, session.port]);

  const fetchLocalNodes = async (options: FetchNodesOptions = {}) => {
    const run = async () => {
      setIsLoadingLocal(true);
      try {
        // In a real app, this would use a separate local fs command
        const nodes = await invoke<VfsNode[]>('vfs_list_dir', { vfsSessionId: 'local', path: localPath });
        setLocalNodes(nodes);
      } catch (err) {
        console.error(err);
        setErrorMessage(String(err));
      } finally {
        setIsLoadingLocal(false);
      }
    };

    if (options.withGlobalLoading) {
      await withGlobalLoading(run, {
        message: options.loadingMessage ?? t('loading.refreshing_directory'),
        detail: options.loadingDetail ?? localPath,
      });
      return;
    }

    await run();
  };

  const fetchRemoteNodes = async (options: FetchNodesOptions = {}) => {
    if (!vfsSessionId) return;

    const run = async () => {
      setIsLoadingRemote(true);
      try {
        setErrorMessage(null);
        const nodes = await invoke<VfsNode[]>('vfs_list_dir', { vfsSessionId, path: remotePath });
        setRemoteNodes(nodes);
      } catch (err) {
        console.error(err);
        setErrorMessage(String(err));
        setRemoteNodes([]);
      } finally {
        setIsLoadingRemote(false);
      }
    };

    if (options.withGlobalLoading) {
      await withGlobalLoading(run, {
        message: options.loadingMessage ?? t('loading.refreshing_directory'),
        detail: options.loadingDetail ?? remotePath,
      });
      return;
    }

    await run();
  };

  useEffect(() => {
    fetchLocalNodes();
  }, [localPath]);

  useEffect(() => {
    if (vfsSessionId) {
      fetchRemoteNodes();
    }
  }, [remotePath, vfsSessionId]);

  useEffect(() => {
    let active = true;

    const pollTasks = async () => {
      try {
        const snapshot = await invoke<TransferProgress[]>('vfs_get_transfer_tasks');
        if (!active) return;
        syncTasks(snapshot);
        const hasNewCompleted = snapshot.some((task) => {
          const isDone = task.status === 'COMPLETED' || task.status === 'FAILED';
          if (!isDone || completedTaskIdsRef.current.has(task.task_id)) {
            return false;
          }
          completedTaskIdsRef.current.add(task.task_id);
          return true;
        });
        if (hasNewCompleted) {
          void fetchLocalNodes();
          if (vfsSessionId) {
            void fetchRemoteNodes();
          }
        }
      } catch (error) {
        console.warn('Failed to poll transfer tasks', error);
      }
    };

    void pollTasks();
    const timer = window.setInterval(() => {
      void pollTasks();
    }, 600);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [syncTasks, vfsSessionId, localPath, remotePath]);

  useEffect(() => {
    if (!focusTaskId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFocusTaskId((current) => (current === focusTaskId ? null : current));
    }, 2400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [focusTaskId]);

  useEffect(() => {
    const historyIds = new Set(transferHistory.map((task) => task.task_id));
    setTransferBatches((current) =>
      current
        .filter((batch) => batch.taskIds.some((taskId) => activeTasks[taskId] || historyIds.has(taskId)))
        .slice(0, 40),
    );
  }, [activeTasks, transferHistory]);

  const startTransfer = async (direction: 'UPLOAD' | 'DOWNLOAD', entries: VfsTransferEntry[]) => {
    if (!vfsSessionId || entries.length === 0) {
      return;
    }
    try {
      setErrorMessage(null);
      const taskIds = await withGlobalLoading(
        () =>
          invoke<string[]>('vfs_start_transfer', {
            request: {
              vfs_session_id: vfsSessionId,
              direction,
              local_base_path: localPath,
              remote_base_path: remotePath,
              entries: entries.map((entry) => ({
                name: entry.name,
                path: entry.path,
                is_dir: entry.is_dir,
                size: entry.size,
              })),
            },
          }),
        {
          message: direction === 'UPLOAD' ? t('loading.starting_upload') : t('loading.starting_download'),
          detail: direction === 'UPLOAD' ? remotePath : localPath,
        },
      );
      if (taskIds.length > 0) {
        setTransferBatches((current) => [
          {
            batchId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            taskIds,
            direction,
            itemCount: entries.length,
          },
          ...current,
        ].slice(0, 40));
      }
    } catch (error) {
      setErrorMessage(String(error));
    }
  };

  const refreshForSide = async (side: 'local' | 'remote', withGlobalLoadingOverlay = false) => {
    if (side === 'local') {
      await fetchLocalNodes({
        withGlobalLoading: withGlobalLoadingOverlay,
      });
      return;
    }
    await fetchRemoteNodes({
      withGlobalLoading: withGlobalLoadingOverlay,
    });
  };

  const handleRenameNode = async (side: 'local' | 'remote', node: VfsNode, nextName: string) => {
    try {
      setErrorMessage(null);
      await withGlobalLoading(
        async () => {
          await invoke<string>('vfs_rename_node', {
            request: {
              vfs_session_id: side === 'local' ? 'local' : vfsSessionId,
              path: node.path,
              next_name: nextName,
            },
          });
          await refreshForSide(side);
        },
        {
          message: t('loading.renaming'),
          detail: node.path,
        },
      );
    } catch (error) {
      setErrorMessage(String(error));
    }
  };

  const handleDeleteNodes = async (side: 'local' | 'remote', nodes: VfsNode[]) => {
    const validNodes = nodes.filter((node) => node.name !== '..');
    if (validNodes.length === 0) {
      return;
    }
    try {
      setErrorMessage(null);
      await withGlobalLoading(
        async () => {
          await invoke('vfs_delete_nodes', {
            request: {
              vfs_session_id: side === 'local' ? 'local' : vfsSessionId,
              paths: validNodes.map((node) => node.path),
            },
          });
          await refreshForSide(side);
        },
        {
          message: t('loading.deleting'),
          detail: side === 'local' ? localPath : remotePath,
        },
      );
    } catch (error) {
      setErrorMessage(String(error));
    }
  };

  const handleCreateDirectory = async (side: 'local' | 'remote', parentPath: string, name: string) => {
    try {
      setErrorMessage(null);
      await withGlobalLoading(
        async () => {
          await invoke<string>('vfs_create_dir', {
            request: {
              vfs_session_id: side === 'local' ? 'local' : vfsSessionId,
              parent_path: parentPath,
              name,
            },
          });
          await refreshForSide(side);
        },
        {
          message: t('loading.creating_directory'),
          detail: `${parentPath}/${name}`.replace('//', '/'),
        },
      );
    } catch (error) {
      setErrorMessage(String(error));
    }
  };

  const isPointInsideRemotePanel = (position: { x: number; y: number }) => {
    const rect = remotePanelRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }
    const scale = window.devicePixelRatio || 1;
    const x = position.x / scale;
    const y = position.y / scale;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  };

  const handleDesktopDrop = async (paths: string[]) => {
    if (!paths.length) {
      return;
    }
    try {
      setErrorMessage(null);
      const entries = await invoke<VfsTransferEntry[]>('vfs_describe_local_entries', { paths });
      await startTransfer('UPLOAD', entries);
    } catch (error) {
      setErrorMessage(String(error));
    }
  };

  const buildDesktopDropState = (entries: VfsTransferEntry[], insideTarget: boolean): DesktopDropState => {
    const directoryCount = entries.filter((entry) => entry.is_dir).length;
    return {
      active: true,
      insideTarget,
      totalCount: entries.length,
      directoryCount,
      fileCount: Math.max(0, entries.length - directoryCount),
      targetPath: remotePath,
    };
  };

  const updateDesktopDropPreview = async (paths: string[], insideTarget: boolean) => {
    const requestId = ++desktopPreviewRequestIdRef.current;
    if (!paths.length) {
      setDesktopDropState(null);
      return;
    }

    try {
      const entries = await invoke<VfsTransferEntry[]>('vfs_describe_local_entries', { paths });
      if (desktopPreviewRequestIdRef.current !== requestId) {
        return;
      }
      setDesktopDropState(buildDesktopDropState(entries, insideTarget));
    } catch (error) {
      if (desktopPreviewRequestIdRef.current !== requestId) {
        return;
      }
      console.warn('Failed to preview desktop drag entries', error);
      setDesktopDropState({
        active: true,
        insideTarget,
        totalCount: paths.length,
        fileCount: paths.length,
        directoryCount: 0,
        targetPath: remotePath,
      });
    }
  };

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;

    const bindDesktopDrop = async () => {
      unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        if (isDisposed) {
          return;
        }
        const payload = event.payload;
        if (payload.type === 'leave') {
          desktopPreviewRequestIdRef.current += 1;
          setDesktopDropState(null);
          return;
        }
        if (payload.type === 'enter') {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          void updateDesktopDropPreview(payload.paths, insideTarget);
          return;
        }
        if (payload.type === 'over') {
          setDesktopDropState((current) =>
            current
              ? {
                  ...current,
                  insideTarget: isPointInsideRemotePanel(payload.position),
                  targetPath: remotePath,
                }
              : current,
          );
          return;
        }
        if (payload.type === 'drop') {
          const shouldUpload = isPointInsideRemotePanel(payload.position);
          desktopPreviewRequestIdRef.current += 1;
          setDesktopDropState(null);
          if (!shouldUpload) {
            return;
          }
          void handleDesktopDrop(payload.paths);
        }
      });
    };

    void bindDesktopDrop();

    return () => {
      isDisposed = true;
      desktopPreviewRequestIdRef.current += 1;
      setDesktopDropState(null);
      unlisten?.();
    };
  }, [remotePath, vfsSessionId]);

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--app-bg-base)]">
      <VfsFeedbackLayer
        panelErrorMessage={errorMessage}
        activeTasks={activeTasks}
        transferHistory={transferHistory}
        transferBatches={transferBatches}
        draggingPayload={draggingPayload}
        desktopDropState={desktopDropState}
        onLocateTask={(taskId, options) => {
          setQueueRecentFilter(options?.recentFilter ?? 'all');
          setFocusTaskId(taskId);
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <FileSystem 
          title={t('vfs.local_files')}
          path={localPath}
          nodes={localNodes}
          onNavigate={setLocalPath}
          onRefresh={() => {
            void fetchLocalNodes({ withGlobalLoading: true });
          }}
          isLoading={isLoadingLocal}
          side="local"
          favorites={localFavorites}
          onFavoriteCurrent={() => {
            if (!localFavorites.includes(localPath)) {
              updateLocalFavorites([localPath, ...localFavorites].slice(0, 20));
            }
          }}
          onOpenFavorite={setLocalPath}
          onRemoveFavorite={(favorite) => {
            updateLocalFavorites(localFavorites.filter((item) => item !== favorite));
          }}
          onPrimaryTransfer={(entries) => {
            void startTransfer('UPLOAD', entries.filter((entry) => entry.name !== '..'));
          }}
          onReceiveTransfer={({ sourceSide, nodes }) => {
            if (sourceSide === 'remote') {
              void startTransfer('DOWNLOAD', nodes.filter((entry) => entry.name !== '..'));
            }
          }}
          onDragStateChange={setDraggingPayload}
          onRenameNode={(node, nextName) => {
            void handleRenameNode('local', node, nextName);
          }}
          onDeleteNodes={(nodes) => {
            void handleDeleteNodes('local', nodes);
          }}
          onCreateDirectory={(name) => {
            void handleCreateDirectory('local', localPath, name);
          }}
        />
        <FileSystem 
          title={t('vfs.remote_files')}
          path={remotePath}
          nodes={remoteNodes}
          onNavigate={setRemotePath}
          onRefresh={() => {
            void fetchRemoteNodes({ withGlobalLoading: true });
          }}
          isLoading={isLoadingRemote}
          side="remote"
          favorites={remoteFavorites}
          onFavoriteCurrent={() => {
            if (!remoteFavorites.includes(remotePath)) {
              updateRemoteFavorites([remotePath, ...remoteFavorites].slice(0, 20));
            }
          }}
          onOpenFavorite={setRemotePath}
          onRemoveFavorite={(favorite) => {
            updateRemoteFavorites(remoteFavorites.filter((item) => item !== favorite));
          }}
          onPrimaryTransfer={(entries) => {
            void startTransfer('DOWNLOAD', entries.filter((entry) => entry.name !== '..'));
          }}
          onReceiveTransfer={({ sourceSide, nodes }) => {
            if (sourceSide === 'local') {
              void startTransfer('UPLOAD', nodes.filter((entry) => entry.name !== '..'));
            }
          }}
          onDragStateChange={setDraggingPayload}
          onRenameNode={(node, nextName) => {
            void handleRenameNode('remote', node, nextName);
          }}
          onDeleteNodes={(nodes) => {
            void handleDeleteNodes('remote', nodes);
          }}
          onCreateDirectory={(name) => {
            void handleCreateDirectory('remote', remotePath, name);
          }}
          panelRef={remotePanelRef}
          forcedDropActive={desktopDropState?.insideTarget ?? false}
        />
      </div>
      <TransferQueueBar
        focusTaskId={focusTaskId}
        recentFilter={queueRecentFilter}
        onRecentFilterChange={setQueueRecentFilter}
      />
    </div>
  );
}
