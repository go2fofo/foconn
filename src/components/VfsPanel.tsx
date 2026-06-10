import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SessionConfig,
  TransferProgress,
  VfsNode,
  VfsTransferEntry,
} from "../types";
import { FileSystem } from "./FileSystem";
import {
  DesktopDropState,
  TransferBatchInfo,
  VfsFeedbackLayer,
} from "./VfsFeedbackLayer";
import { TransferQueueBar } from "./TransferQueueBar";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { withGlobalLoading } from "../store/globalLoadingStore";
import { useTransferStore } from "../store/vfsStore";

interface VfsPanelProps {
  session: SessionConfig;
  activeTab: string; // 接收外层当前的 tab 标识以执行后台挂起优化
}

type SortKey = "time" | "size" | "name";
type SortOrder = "asc" | "desc";

interface DeleteDialogState {
  side: "local" | "remote";
  nodes: VfsNode[];
}

interface ConflictDialogState {
  direction: "UPLOAD" | "DOWNLOAD";
  conflicts: VfsTransferEntry[];
  allEntries: VfsTransferEntry[];
}

export function VfsPanel({ session, activeTab }: VfsPanelProps) {
  const { t } = useTranslation();
  const syncTasks = useTransferStore((state) => state.syncTasks);
  const activeTasks = useTransferStore((state) => state.tasks);
  const transferHistory = useTransferStore((state) => state.history);
  const [vfsSessionId, setVfsSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const vfsSnapshots = useTransferStore((state) => state.vfsSnapshots);
  const updateVfsSnapshot = useTransferStore(
    (state) => state.updateVfsSnapshot,
  );

  // 提取当前会话的快照
  const snapshot = vfsSnapshots[session.id];

  // 改为函数式惰性初始化，优先从全局快照读取历史路径与状态
  const [localPath, setLocalPath] = useState(() => snapshot?.localPath ?? "/");
  const [remotePath, setRemotePath] = useState(
    () => snapshot?.remotePath ?? "/",
  );

  const [localNodes, setLocalNodes] = useState<VfsNode[]>([]);
  const [remoteNodes, setRemoteNodes] = useState<VfsNode[]>([]);

  const [isLoadingLocal, setIsLoadingLocal] = useState(false);
  const [isLoadingRemote, setIsLoadingRemote] = useState(false);

  // 纯指针拖拽核心状态
  const [draggingPayload, setDraggingPayload] = useState<{
    count: number;
    sourceSide: "local" | "remote";
    nodes?: VfsNode[];
  } | null>(null);
  const draggingPayloadRef = useRef(draggingPayload);
  useEffect(() => {
    draggingPayloadRef.current = draggingPayload;
  }, [draggingPayload]);

  // 弹窗状态
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(
    null,
  );
  const [conflictDialog, setConflictDialog] =
    useState<ConflictDialogState | null>(null);

  const [desktopDropState, setDesktopDropState] =
    useState<DesktopDropState | null>(null);
  const [transferBatches, setTransferBatches] = useState<TransferBatchInfo[]>(
    [],
  );
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [queueRecentFilter, setQueueRecentFilter] = useState<"all" | "failed">(
    "all",
  );
  const completedTaskIdsRef = useRef<Set<string>>(new Set());

  // 两侧面板物理边界引用
  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const remotePanelRef = useRef<HTMLDivElement | null>(null);

  const favoritesStorageKey = useMemo(
    () =>
      `foconn:vfs:favorites:${session.host ?? "remote"}:${session.port ?? 22}:${session.auth?.username ?? "root"}`,
    [session.auth?.username, session.host, session.port],
  );
  const localFavoritesStorageKey = "foconn:vfs:local-favorites";
  const [localFavorites, setLocalFavorites] = useState<string[]>([]);
  const [remoteFavorites, setRemoteFavorites] = useState<string[]>([]);
  const sessionDisplayName = useMemo(
    () =>
      `${session.auth?.username ?? "root"}@${session.host ?? "localhost"}:${session.port ?? 22}`,
    [session.auth?.username, session.host, session.port],
  );

  const [localSortKey, setLocalSortKey] = useState<SortKey>("time");
  const [localSortOrder, setLocalSortOrder] = useState<SortOrder>("desc");
  const [remoteSortKey, setRemoteSortKey] = useState<SortKey>("time");
  const [remoteSortOrder, setRemoteSortOrder] = useState<SortOrder>("desc");

  const [localSelected, setLocalSelected] = useState<VfsNode[]>([]);
  const [remoteSelected, setRemoteSelected] = useState<VfsNode[]>([]);
  const [lastFocusedSide, setLastFocusedSide] = useState<
    "local" | "remote" | null
  >(() => snapshot?.lastFocusedSide ?? null);

  const getSortedNodes = (nodes: VfsNode[], key: SortKey, order: SortOrder) => {
    if (!nodes || nodes.length === 0) return [];
    const parentNode = nodes.find((n) => n.name === "..");
    const normalNodes = nodes.filter((n) => n.name !== "..");
    const sorted = [...normalNodes].sort((a, b) => {
      if (a.is_dir && !b.is_dir) return -1;
      if (!a.is_dir && b.is_dir) return 1;
      if (key === "time")
        return order === "asc"
          ? (a.mtime || 0) - (b.mtime || 0)
          : (b.mtime || 0) - (a.mtime || 0);
      if (key === "size")
        return order === "asc"
          ? (a.size || 0) - (b.size || 0)
          : (b.size || 0) - (a.size || 0);
      if (key === "name")
        return order === "asc"
          ? a.name.localeCompare(b.name, undefined, { numeric: true })
          : b.name.localeCompare(a.name, undefined, { numeric: true });
      return 0;
    });
    return parentNode ? [parentNode, ...sorted] : sorted;
  };

  const displayLocalNodes = useMemo(
    () => getSortedNodes(localNodes, localSortKey, localSortOrder),
    [localNodes, localSortKey, localSortOrder],
  );
  const displayRemoteNodes = useMemo(
    () => getSortedNodes(remoteNodes, remoteSortKey, remoteSortOrder),
    [remoteNodes, remoteSortKey, remoteSortOrder],
  );

  // -------------------------------------------------------------------
  // 检测重名冲突文件核心逻辑
  // -------------------------------------------------------------------
  const checkAndStartTransfer = async (
    // 改为 async
    direction: "UPLOAD" | "DOWNLOAD",
    entries: VfsTransferEntry[],
  ) => {
    const targetNodeNames = new Set(
      (direction === "UPLOAD" ? remoteNodes : localNodes)
        .filter((n) => n.name !== "..")
        .map((n) => n.name),
    );

    const conflicts = entries.filter((e) => targetNodeNames.has(e.name));

    if (conflicts.length > 0) {
      setConflictDialog({
        direction,
        conflicts,
        allEntries: entries,
      });
    } else {
      try {
        await withGlobalLoading(
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            await startTransfer(direction, entries);
          },
          {
            message:
              direction === "UPLOAD"
                ? t("loading.starting_upload")
                : t("loading.starting_download"),
            detail: direction === "UPLOAD" ? remotePath : localPath,
          },
        );
      } catch (error) {
        setErrorMessage(String(error));
      }
    }
  };

  const handleConflictResolve = async (
    action: "OVERWRITE" | "SKIP" | "CANCEL",
  ) => {
    if (!conflictDialog) return;
    const { direction, conflicts, allEntries } = conflictDialog;
    setConflictDialog(null);

    if (action === "CANCEL") return;

    if (action === "SKIP") {
      const conflictNames = new Set(conflicts.map((c) => c.name));
      const safeEntries = allEntries.filter((e) => !conflictNames.has(e.name));
      if (safeEntries.length > 0) {
        try {
          await withGlobalLoading(() => startTransfer(direction, safeEntries), {
            message:
              direction === "UPLOAD"
                ? t("loading.starting_upload")
                : t("loading.starting_download"),
            detail: direction === "UPLOAD" ? remotePath : localPath,
          });
        } catch (error) {
          setErrorMessage(String(error));
        }
      }
      return;
    }

    if (action === "OVERWRITE") {
      // 🔑 覆盖放行，必须包上 Loading
      try {
        await withGlobalLoading(() => startTransfer(direction, allEntries), {
          message:
            direction === "UPLOAD"
              ? t("loading.starting_upload")
              : t("loading.starting_download"),
          detail: direction === "UPLOAD" ? remotePath : localPath,
        });
      } catch (error) {
        setErrorMessage(String(error));
      }
    }
  };

  // -------------------------------------------------------------------
  // 双向指针收网中心 (修正高亮边框定位 + 双向冲突检查)
  // -------------------------------------------------------------------
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingPayloadRef.current) return;

      const localRect = localPanelRef.current?.getBoundingClientRect();
      const remoteRect = remotePanelRef.current?.getBoundingClientRect();

      const insideLocal = localRect
        ? e.clientX >= localRect.left &&
          e.clientX <= localRect.right &&
          e.clientY >= localRect.top &&
          e.clientY <= localRect.bottom
        : false;

      const insideRemote = remoteRect
        ? e.clientX >= remoteRect.left &&
          e.clientX <= remoteRect.right &&
          e.clientY >= remoteRect.top &&
          e.clientY <= remoteRect.bottom
        : false;

      const sourceSide = draggingPayloadRef.current.sourceSide;

      let showHighlight = false;
      let isTargetInside = false;
      let currentTargetPath = "";

      if (sourceSide === "local") {
        showHighlight = true;
        isTargetInside = insideRemote;
        currentTargetPath = remotePath;
      } else {
        showHighlight = true;
        isTargetInside = insideLocal;
        currentTargetPath = localPath;
      }

      setDesktopDropState({
        active: showHighlight,
        insideTarget: isTargetInside,
        totalCount: draggingPayloadRef.current.count,
        fileCount: draggingPayloadRef.current.count,
        directoryCount: 0,
        targetPath: currentTargetPath,
      });
    };

    const handleGlobalMouseUp = async (e: MouseEvent) => {
      if (!draggingPayloadRef.current) return;

      const payload = draggingPayloadRef.current;
      const localRect = localPanelRef.current?.getBoundingClientRect();
      const remoteRect = remotePanelRef.current?.getBoundingClientRect();

      const insideLocal = localRect
        ? e.clientX >= localRect.left &&
          e.clientX <= localRect.right &&
          e.clientY >= localRect.top &&
          e.clientY <= localRect.bottom
        : false;

      const insideRemote = remoteRect
        ? e.clientX >= remoteRect.left &&
          e.clientX <= remoteRect.right &&
          e.clientY >= remoteRect.top &&
          e.clientY <= remoteRect.bottom
        : false;

      setDraggingPayload(null);
      setDesktopDropState(null);

      if (!payload.nodes || payload.nodes.length === 0) return;
      const validNodes = payload.nodes.filter((entry) => entry.name !== "..");

      try {
        if (payload.sourceSide === "local" && insideRemote) {
          await checkAndStartTransfer("UPLOAD", validNodes);
        } else if (payload.sourceSide === "remote" && insideLocal) {
          await checkAndStartTransfer("DOWNLOAD", validNodes);
        }
      } catch (error) {
        setErrorMessage(String(error));
      }
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [remotePath, localPath, remoteNodes, localNodes]);

  // -------------------------------------------------------------------
  // 外部拖拽处理 (从操作系统 Finder/桌面直接扔进来)
  // -------------------------------------------------------------------
  const isPointInsideRemotePanel = (position: { x: number; y: number }) => {
    const rect = remotePanelRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const scale = window.devicePixelRatio || 1;
    return (
      position.x / scale >= rect.left &&
      position.x / scale <= rect.right &&
      position.y / scale >= rect.top &&
      position.y / scale <= rect.bottom
    );
  };

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | undefined;
    const bindDesktopDrop = async () => {
      unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
        if (isDisposed) return;
        const payload = event.payload;
        if (payload.type === "leave") {
          setDesktopDropState(null);
          return;
        }
        if (payload.type === "enter") {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          if ("paths" in payload && payload.paths && payload.paths.length > 0) {
            setDesktopDropState({
              active: true,
              insideTarget,
              totalCount: payload.paths.length,
              fileCount: payload.paths.length,
              directoryCount: 0,
              targetPath: remotePath,
            });
          }
          return;
        }
        if (payload.type === "over") {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          setDesktopDropState((curr) =>
            curr ? { ...curr, insideTarget, targetPath: remotePath } : curr,
          );
          return;
        }
        if (payload.type === "drop") {
          const insideTarget = isPointInsideRemotePanel(payload.position);
          setDesktopDropState(null);
          if (
            insideTarget &&
            "paths" in payload &&
            payload.paths &&
            payload.paths.length > 0
          ) {
            try {
              setErrorMessage(null);
              await withGlobalLoading(
                async () => {
                  const entries = await invoke<VfsTransferEntry[]>(
                    "vfs_describe_local_entries",
                    { paths: payload.paths },
                  );
                  // 此时 checkAndStartTransfer 已经是 async 函数了，直接 await 顺延状态
                  await checkAndStartTransfer("UPLOAD", entries);
                },
                {
                  message: t(
                    "loading.preparing_files",
                    "正在解析拖入的文件...",
                  ),
                  detail: `${payload.paths.length} 个项目`,
                },
              );
            } catch (error) {
              setErrorMessage(String(error));
            }
          }
        }
      });
    };
    void bindDesktopDrop();
    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [remotePath, remoteNodes]);

  // -------------------------------------------------------------------
  // 键盘原生安全删除拦截
  // -------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.getAttribute("contenteditable") === "true")
        )
          return;

        if (lastFocusedSide === "local" && localSelected.length > 0) {
          setDeleteDialog({
            side: "local",
            nodes: localSelected.filter((n) => n.name !== ".."),
          });
        } else if (lastFocusedSide === "remote" && remoteSelected.length > 0) {
          setDeleteDialog({
            side: "remote",
            nodes: remoteSelected.filter((n) => n.name !== ".."),
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [lastFocusedSide, localSelected, remoteSelected]);

  // -------------------------------------------------------------------
  // SFTP 通用联动 API & 收藏夹
  // -------------------------------------------------------------------
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(localFavoritesStorageKey);
      setLocalFavorites(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(favoritesStorageKey);
      setRemoteFavorites(raw ? JSON.parse(raw) : []);
    } catch {}
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
        const id = await withGlobalLoading(
          () => invoke<string>("vfs_connect", { config: session }),
          { message: t("loading.connecting_sftp"), detail: sessionDisplayName },
        );
        createdSessionId = id;
        if (active) setVfsSessionId(id);
      } catch (err) {
        if (active) setErrorMessage(String(err));
      }
    };
    initVfs();
    return () => {
      active = false;
      setVfsSessionId(null);
      if (createdSessionId) {
        invoke("vfs_disconnect", { vfsSessionId: createdSessionId }).catch(
          console.error,
        );
      }
    };
  }, [session.id, session.host, session.port]);

  const fetchLocalNodes = async () => {
    setIsLoadingLocal(true);
    try {
      await withGlobalLoading(
        async () => {
          const nodes = await invoke<VfsNode[]>("vfs_list_dir", {
            vfsSessionId: "local",
            path: localPath,
          });
          setLocalNodes(nodes);
        },
        {
          message: t("loading.fetching_local", "正在读取本地目录..."),
          detail: localPath,
        },
      );
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsLoadingLocal(false);
    }
  };

  const fetchRemoteNodes = async () => {
    if (!vfsSessionId) return;
    setIsLoadingRemote(true);
    try {
      await withGlobalLoading(
        async () => {
          const nodes = await invoke<VfsNode[]>("vfs_list_dir", {
            vfsSessionId,
            path: remotePath,
          });
          setRemoteNodes(nodes);
        },
        {
          message: t("loading.fetching_remote", "正在读取远程目录..."),
          detail: remotePath,
        },
      );
    } catch {
      setRemoteNodes([]);
    } finally {
      setIsLoadingRemote(false);
    }
  };

  useEffect(() => {
    fetchLocalNodes();
    setLocalSelected([]);
  }, [localPath]);
  useEffect(() => {
    if (vfsSessionId) {
      fetchRemoteNodes();
      setRemoteSelected([]);
    }
  }, [remotePath, vfsSessionId]);

  // 核心轮询逻辑：包含后台阻断判定
  useEffect(() => {
    let active = true;
    const pollTasks = async () => {
      // 优化项：当切换到 ssh 面板时，挂起当前面板后台无用的数据轮询
      if (activeTab !== "sftp") return;

      try {
        const snapshot = await invoke<TransferProgress[]>(
          "vfs_get_transfer_tasks",
        );
        if (!active) return;
        syncTasks(snapshot);
        const hasNewCompleted = snapshot.some((task) => {
          const isDone =
            task.status === "COMPLETED" || task.status === "FAILED";
          if (!isDone || completedTaskIdsRef.current.has(task.task_id))
            return false;
          completedTaskIdsRef.current.add(task.task_id);
          return true;
        });
        if (hasNewCompleted) {
          void fetchLocalNodes();
          if (vfsSessionId) void fetchRemoteNodes();
        }
      } catch {}
    };
    const timer = window.setInterval(() => {
      void pollTasks();
    }, 600);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [syncTasks, vfsSessionId, localPath, remotePath, activeTab]);

  // 路径与历史焦点发生质变时，同步回 Zustand 状态机
  useEffect(() => {
    updateVfsSnapshot(session.id, { localPath, remotePath, lastFocusedSide });
  }, [localPath, remotePath, lastFocusedSide, session.id]);

  // 1. 本地节点重新拉取成功时，自动计算并恢复本地选中状态
  useEffect(() => {
    const savedPaths = vfsSnapshots[session.id]?.localSelectedPaths ?? [];
    const nextSelected = localNodes.filter((n) => savedPaths.includes(n.path));
    setLocalSelected(nextSelected);
  }, [localNodes, session.id]);

  // 2. 远程节点重新拉取成功时，自动计算并恢复远程选中状态
  useEffect(() => {
    const savedPaths = vfsSnapshots[session.id]?.remoteSelectedPaths ?? [];
    const nextSelected = remoteNodes.filter((n) => savedPaths.includes(n.path));
    setRemoteSelected(nextSelected);
  }, [remoteNodes, session.id]);

  const startTransfer = async (
    direction: "UPLOAD" | "DOWNLOAD",
    entries: VfsTransferEntry[],
  ) => {
    if (!vfsSessionId || entries.length === 0) return;

    // 🔑 注意：这里不需要在内部包 withGlobalLoading 了，让它专注于做业务
    const taskIds = await invoke<string[]>("vfs_start_transfer", {
      request: {
        vfs_session_id: vfsSessionId,
        direction,
        local_base_path: localPath,
        remote_base_path: remotePath,
        entries: entries.map((e) => ({
          name: e.name,
          path: e.path,
          is_dir: e.is_dir,
          size: e.size,
        })),
      },
    });

    if (taskIds.length > 0) {
      setTransferBatches((curr) => [
        {
          batchId: `${Date.now()}`,
          taskIds,
          direction,
          itemCount: entries.length,
        },
        ...curr,
      ]);
    }
  };

  const refreshForSide = async (side: "local" | "remote") => {
    if (side === "local") await fetchLocalNodes();
    else await fetchRemoteNodes();
  };
  const handleRenameNode = async (
    side: "local" | "remote",
    node: VfsNode,
    nextName: string,
  ) => {
    // 🔑 把整个业务块（包含改名和重新拉取列表）统统塞进 withGlobalLoading 内部
    try {
      await withGlobalLoading(
        async () => {
          await invoke("vfs_rename_node", {
            request: {
              vfs_session_id: side === "local" ? "local" : vfsSessionId,
              path: node.path,
              next_name: nextName,
            },
          });
          // 🔑 必须在内部 await 刷新，等数据拉回来才算完，这样 Loading 就不会早泄
          await refreshForSide(side);
        },
        { message: t("loading.renaming", "正在重命名..."), detail: nextName },
      );
    } catch (e) {
      setErrorMessage(String(e));
    }
  };

  const executeDeleteNodes = async (
    side: "local" | "remote",
    nodes: VfsNode[],
  ) => {
    if (!nodes.length) return;
    try {
      await withGlobalLoading(
        async () => {
          await invoke("vfs_delete_nodes", {
            request: {
              vfs_session_id: side === "local" ? "local" : vfsSessionId,
              paths: nodes.map((n) => n.path),
            },
          });
          if (side === "local") setLocalSelected([]);
          else setRemoteSelected([]);
          await refreshForSide(side);
        },
        {
          message: t("loading.deleting", "正在删除文件..."),
          detail: nodes.length === 1 ? nodes[0].name : `${nodes.length} 个项目`,
        },
      );
    } catch (e) {
      setErrorMessage(String(e));
    }
  };

  const handleCreateDirectory = async (
    side: "local" | "remote",
    parent: string,
    name: string,
  ) => {
    try {
      // 🔑 同理，将创建和刷新合为一体，整体卡住 Loading 状态
      await withGlobalLoading(
        async () => {
          await invoke("vfs_create_dir", {
            request: {
              vfs_session_id: side === "local" ? "local" : vfsSessionId,
              parent_path: parent,
              name,
            },
          });
          await refreshForSide(side);
        },
        {
          message: t("loading.creating_dir", "正在创建文件夹..."),
          detail: name,
        },
      );
    } catch (e) {
      setErrorMessage(String(e));
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--app-bg-base)]">
      <VfsFeedbackLayer
        panelErrorMessage={errorMessage}
        activeTasks={activeTasks}
        transferHistory={transferHistory}
        transferBatches={transferBatches}
        draggingPayload={draggingPayload}
        desktopDropState={desktopDropState}
        onLocateTask={(taskId) => setFocusTaskId(taskId)}
      />

      <div className="flex overflow-hidden flex-1">
        <FileSystem
          title={t("vfs.local_files")}
          path={localPath}
          nodes={displayLocalNodes}
          onNavigate={setLocalPath}
          onRefresh={() => void fetchLocalNodes()}
          isLoading={isLoadingLocal}
          side="local"
          favorites={localFavorites}
          onFavoriteCurrent={() => {
            if (!localFavorites.includes(localPath))
              updateLocalFavorites([localPath, ...localFavorites]);
          }}
          onOpenFavorite={setLocalPath}
          onRemoveFavorite={(fav) =>
            updateLocalFavorites(localFavorites.filter((i) => i !== fav))
          }
          onPrimaryTransfer={async (entries) =>
            await checkAndStartTransfer("UPLOAD", entries)
          }
          onReceiveTransfer={() => {}}
          onDragStateChange={(payload) => setDraggingPayload(payload)}
          onRenameNode={(node, name) =>
            void handleRenameNode("local", node, name)
          }
          onDeleteNodes={(nodes) => setDeleteDialog({ side: "local", nodes })}
          onCreateDirectory={(name) =>
            void handleCreateDirectory("local", localPath, name)
          }
          panelRef={localPanelRef}
          forcedDropActive={
            desktopDropState?.active && draggingPayload?.sourceSide === "remote"
              ? desktopDropState.insideTarget
              : false
          }
          onSelectionChange={(nodes) => {
            setLocalSelected(nodes);
            setLastFocusedSide("local");
            updateVfsSnapshot(session.id, {
              localSelectedPaths: nodes.map((n) => n.path),
            });
          }}
          sortKey={localSortKey}
          sortOrder={localSortOrder}
          onSortChange={(k, o) => {
            setLocalSortKey(k as SortKey);
            setLocalSortOrder(o as SortOrder);
          }}
          hidePermissions={true}
        />

        <FileSystem
          title={t("vfs.remote_files")}
          path={remotePath}
          nodes={displayRemoteNodes}
          onNavigate={setRemotePath}
          onRefresh={() => void fetchRemoteNodes()}
          isLoading={isLoadingRemote}
          side="remote"
          favorites={remoteFavorites}
          onFavoriteCurrent={() => {
            if (!remoteFavorites.includes(remotePath))
              updateRemoteFavorites([remotePath, ...remoteFavorites]);
          }}
          onOpenFavorite={setRemotePath}
          onRemoveFavorite={(fav) =>
            updateRemoteFavorites(remoteFavorites.filter((i) => i !== fav))
          }
          onPrimaryTransfer={async (entries) =>
            await checkAndStartTransfer("DOWNLOAD", entries)
          }
          onReceiveTransfer={() => {}}
          onDragStateChange={(payload) => setDraggingPayload(payload)}
          onRenameNode={(node, name) =>
            void handleRenameNode("remote", node, name)
          }
          onDeleteNodes={(nodes) => setDeleteDialog({ side: "remote", nodes })}
          onCreateDirectory={(name) =>
            void handleCreateDirectory("remote", remotePath, name)
          }
          panelRef={remotePanelRef}
          forcedDropActive={
            desktopDropState?.active && draggingPayload?.sourceSide === "local"
              ? desktopDropState.insideTarget
              : false
          }
          onSelectionChange={(nodes) => {
            setRemoteSelected(nodes);
            setLastFocusedSide("remote");
            updateVfsSnapshot(session.id, {
              remoteSelectedPaths: nodes.map((n) => n.path),
            });
          }}
          sortKey={remoteSortKey}
          sortOrder={remoteSortOrder}
          onSortChange={(k, o) => {
            setRemoteSortKey(k as SortKey);
            setRemoteSortOrder(o as SortOrder);
          }}
          hidePermissions={true}
        />
      </div>

      {/* <TransferQueueBar
        focusTaskId={focusTaskId}
        recentFilter={queueRecentFilter}
        onRecentFilterChange={setQueueRecentFilter}
      /> */}

      {/* 确认删除弹框 */}
      {deleteDialog && deleteDialog.nodes.length > 0 ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[420px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)]">
            <div className="text-base font-semibold text-white">
              {t("vfs.delete")}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {deleteDialog.nodes.length === 1
                ? t("context_menu.delete_confirm_single", {
                    name: deleteDialog.nodes[0]?.name ?? "",
                  })
                : t("context_menu.delete_confirm_multi", {
                    count: deleteDialog.nodes.length,
                  })}
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                onClick={() => setDeleteDialog(null)}
                className="rounded-[12px] border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeleteDialog(null);

                  await executeDeleteNodes(
                    deleteDialog.side,
                    deleteDialog.nodes,
                  );
                }}
                className="rounded-[12px] border border-[rgba(255,92,92,0.3)] bg-[rgba(255,92,92,0.12)] px-4 py-2 text-sm text-white transition hover:bg-[rgba(255,92,92,0.18)]"
              >
                {t("vfs.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 重复文件冲突解决对话框 */}
      {conflictDialog ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[440px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex gap-2 items-center text-base font-semibold text-white">
              <span className="text-yellow-500">⚠️</span>{" "}
              {t("vfs.file_conflict", "文件冲突")}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)] leading-relaxed">
              {conflictDialog.conflicts.length === 1 ? (
                <div>
                  {t(
                    "vfs.conflict_msg_single",
                    "目标路径已存在同名文件/文件夹:",
                  )}
                  <div className="mt-1.5 rounded-lg bg-[var(--app-bg-hover)] px-3 py-1.5 font-mono text-xs text-white truncate">
                    {conflictDialog.conflicts[0].name}
                  </div>
                </div>
              ) : (
                <div>
                  {t(
                    "vfs.conflict_msg_multi",
                    "检测到有 {{count}} 个文件/文件夹在目标端已存在:",
                    { count: conflictDialog.conflicts.length },
                  )}
                </div>
              )}
              <div className="mt-3 text-xs text-yellow-500/80">
                {t("vfs.conflict_action_tip", "请选择您的处理方式：")}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                onClick={() => handleConflictResolve("CANCEL")}
                className="rounded-[12px] border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("common.cancel")}
              </button>

              <button
                type="button"
                onClick={() => handleConflictResolve("SKIP")}
                className="rounded-[12px] border border-[var(--app-border)] bg-[var(--app-bg-base)] px-3 py-2 text-sm text-white transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("vfs.skip_conflict", "跳过同名")}
              </button>

              <button
                type="button"
                onClick={() => handleConflictResolve("OVERWRITE")}
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
