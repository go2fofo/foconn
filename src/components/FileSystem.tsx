import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushSync } from "react-dom";
import { VfsNode } from "../types";
import {
  Folder,
  File,
  ArrowUp,
  Home,
  RefreshCw,
  Star,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { FoconnContextMenu, type ContextMenuItem } from "./FoconnContextMenu";

interface FileSystemProps {
  title: string;
  path: string;
  nodes: VfsNode[];
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  side: "local" | "remote";
  favorites?: string[];
  onFavoriteCurrent?: () => void;
  onOpenFavorite?: (path: string) => void;
  onRemoveFavorite?: (path: string) => void;
  onPrimaryTransfer?: (nodes: VfsNode[]) => void;
  onReceiveTransfer?: (payload: {
    sourceSide: "local" | "remote";
    nodes: VfsNode[];
  }) => void;
  onDragStateChange?: (
    payload: {
      count: number;
      sourceSide: "local" | "remote";
      nodes?: VfsNode[];
    } | null,
  ) => void;
  onRenameNode?: (node: VfsNode, nextName: string) => void;
  onDeleteNodes?: (nodes: VfsNode[]) => void;
  onCreateDirectory?: (name: string) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  forcedDropActive?: boolean;

  onSelectionChange?: (nodes: VfsNode[]) => void;
  sortKey?: "time" | "size" | "name";
  sortOrder?: "asc" | "desc";
  onSortChange?: (key: "time" | "size" | "name", order: "asc" | "desc") => void;
  hidePermissions?: boolean;
}

interface RenameDialogState {
  node: VfsNode;
  value: string;
}

interface DeleteDialogState {
  nodes: VfsNode[];
}

export function FileSystem({
  title,
  path,
  nodes,
  onNavigate,
  onRefresh,
  isLoading,
  side,
  favorites = [],
  onFavoriteCurrent,
  onOpenFavorite,
  onRemoveFavorite,
  onPrimaryTransfer,
  onReceiveTransfer,
  onDragStateChange,
  onRenameNode,
  onDeleteNodes,
  onCreateDirectory,
  panelRef,
  forcedDropActive = false,

  onSelectionChange,
  sortKey = "time",
  sortOrder = "desc",
  onSortChange,
  hidePermissions = true,
}: FileSystemProps) {
  const { t } = useTranslation();
  const [inputPath, setInputPath] = useState(path);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);

  // ⚡ 这里的状态会随着外层 key 的改变由 React 自动完成天然重置，不需要任何副作用代码
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(
    null,
  );
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(
    null,
  );
  const [mkdirName, setMkdirName] = useState("");
  const [isMkdirDialogOpen, setIsMkdirDialogOpen] = useState(false);

  useEffect(() => {
    setInputPath(path);
  }, [path]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDoubleClick = (node: VfsNode) => {
    if (node.is_dir) {
      onNavigate(node.path);
    }
  };

  const handleGoUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    onNavigate("/" + parts.join("/"));
  };

  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedPaths.includes(node.path)),
    [nodes, selectedPaths],
  );

  const actionableSelectedNodes = useMemo(
    () => selectedNodes.filter((node) => node.name !== ".."),
    [selectedNodes],
  );

  const notifySelectionChange = (nextPaths: string[]) => {
    const nextActionable = nodes.filter(
      (node) => nextPaths.includes(node.path) && node.name !== "..",
    );
    onSelectionChange?.(nextActionable);
  };

  const applyRowSelection = (
    node: VfsNode,
    index: number,
    event: React.MouseEvent,
  ) => {
    let nextPaths: string[] = [];

    if (event.shiftKey && anchorIndex !== null) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      nextPaths = nodes.slice(start, end + 1).map((item) => item.path);
      setSelectedPaths(nextPaths);
      notifySelectionChange(nextPaths);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      nextPaths = selectedPaths.includes(node.path)
        ? selectedPaths.filter((item) => item !== node.path)
        : [...selectedPaths, node.path];
      setSelectedPaths(nextPaths);
      setAnchorIndex(index);
      notifySelectionChange(nextPaths);
      return;
    }

    nextPaths = [node.path];
    setSelectedPaths(nextPaths);
    setAnchorIndex(index);
    notifySelectionChange(nextPaths);
  };

  const handleHeaderClick = (key: "time" | "size" | "name") => {
    if (!onSortChange) return;
    if (sortKey === key) {
      onSortChange(key, sortOrder === "desc" ? "asc" : "desc");
    } else {
      onSortChange(key, "desc");
    }
  };

  const renderSortIndicator = (key: "time" | "size" | "name") => {
    if (sortKey !== key) return null;
    return sortOrder === "asc" ? (
      <ChevronUp size={14} className="inline ml-1 text-[var(--app-primary)]" />
    ) : (
      <ChevronDown
        size={14}
        className="inline ml-1 text-[var(--app-primary)]"
      />
    );
  };

  const createNodeMenuItems = (): ContextMenuItem[] => {
    const count = actionableSelectedNodes.length;
    const primaryLabel =
      side === "local"
        ? count > 1
          ? t("context_menu.bulk_upload", { count })
          : t("vfs.upload")
        : count > 1
          ? t("context_menu.bulk_download", { count })
          : t("vfs.download");

    return [
      {
        id: "primary-transfer",
        label: primaryLabel,
        icon: side === "local" ? "UploadIcon" : "DownloadIcon",
        action: () => onPrimaryTransfer?.(actionableSelectedNodes),
      },
      {
        id: "copy-path",
        label: t("context_menu.copy_file_path"),
        icon: "CopyIcon",
        action: async () => {
          await navigator.clipboard.writeText(
            selectedNodes.map((item) => item.path).join("\n"),
          );
        },
      },
      { type: "separator" },
      {
        id: "refresh",
        label: t("vfs.refresh"),
        icon: "RefreshCwIcon",
        action: onRefresh,
      },
      {
        id: "rename",
        label: t("vfs.rename"),
        disabled: count !== 1,
        action: () => {
          const target = actionableSelectedNodes[0];
          if (!target) return;
          setRenameDialog({
            node: target,
            value: target.name,
          });
        },
      },
      {
        id: "delete",
        label: t("vfs.delete"),
        icon: "TrashIcon",
        disabled: count === 0,
        action: () => {
          if (!count) return;
          setDeleteDialog({
            nodes: actionableSelectedNodes,
          });
        },
      },
    ];
  };

  const createBlankMenuItems = (): ContextMenuItem[] => [
    {
      id: "select-all",
      label: t("context_menu.select_all"),
      icon: "SelectIcon",
      action: () => {
        const allPaths = nodes.map((item) => item.path);
        setSelectedPaths(allPaths);
        notifySelectionChange(allPaths);
      },
    },
    {
      id: "refresh",
      label: t("vfs.refresh"),
      icon: "RefreshCwIcon",
      action: onRefresh,
    },
    {
      id: "mkdir",
      label: t("vfs.mkdir"),
      icon: "FolderPlusIcon",
      action: () => {
        setMkdirName("");
        setIsMkdirDialogOpen(true);
      },
    },
  ];

  return (
    <div
      ref={panelRef}
      className="flex h-full w-1/2 flex-col border-r border-[var(--app-border)] bg-[var(--app-bg-container)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-bg-elevated)] p-2">
        <span className="text-sm font-semibold">{title}</span>
        <div className="text-xs text-[var(--app-text-soft)]">
          {selectedPaths.length > 0
            ? t("context_menu.selected_count", { count: selectedPaths.length })
            : path}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg-base)] p-2 text-sm">
        <button
          onClick={handleGoUp}
          disabled={path === "/"}
          className="mr-2 rounded p-1 transition hover:bg-[var(--app-bg-hover)] disabled:opacity-50"
          title={t("vfs.go_up")}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="rounded p-1 transition hover:bg-[var(--app-bg-hover)]"
          title={t("vfs.root")}
        >
          <Home size={16} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsFavoritesOpen((current) => !current)}
            className={`rounded p-1 transition hover:bg-[var(--app-bg-hover)] ${
              favorites.includes(path) ? "text-[#f5c451]" : ""
            }`}
            title={t("vfs.favorite_paths")}
          >
            <Star
              size={16}
              fill={favorites.includes(path) ? "currentColor" : "none"}
            />
          </button>
          {isFavoritesOpen ? (
            <div className="absolute left-0 top-10 z-20 w-[260px] rounded-[18px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-3 shadow-[var(--app-shadow-elevated)]">
              <button
                type="button"
                onClick={() => {
                  onFavoriteCurrent?.();
                  setIsFavoritesOpen(false);
                }}
                className="mb-3 w-full rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-2 text-sm text-white transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
              >
                {t("vfs.favorite_current")}
              </button>
              <div className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                {favorites.length === 0 ? (
                  <div className="rounded-[14px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-3 py-5 text-center text-xs text-[var(--app-text-soft)]">
                    {t("vfs.no_favorites")}
                  </div>
                ) : (
                  favorites.map((favorite) => (
                    <div
                      key={favorite}
                      className="flex items-center gap-2 rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onOpenFavorite?.(favorite);
                          setIsFavoritesOpen(false);
                        }}
                        className="flex-1 min-w-0 text-sm text-left text-white truncate"
                      >
                        {favorite}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFavorite?.(favorite)}
                        className="text-xs text-[var(--app-text-soft)] transition hover:text-[var(--app-error)]"
                      >
                        {t("context_menu.delete")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
        <form
          className="flex flex-1 min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate(inputPath.trim() || "/");
          }}
        >
          <input
            type="text"
            value={inputPath}
            onChange={(event) => setInputPath(event.target.value)}
            className="w-full rounded bg-[var(--app-bg-elevated)] px-2 py-1 text-[var(--app-text-base)] outline-none"
          />
        </form>
        <button
          onClick={onRefresh}
          className="rounded p-1 transition hover:bg-[var(--app-bg-hover)]"
          title={t("vfs.refresh")}
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <FoconnContextMenu
        items={createBlankMenuItems}
        onBeforeOpen={() => {
          flushSync(() => {
            setSelectedPaths([]);
            onSelectionChange?.([]);
          });
        }}
      >
        <div
          className={`flex-1 overflow-auto transition ${
            isDropActive || forcedDropActive
              ? "ring-2 ring-[var(--app-primary)] ring-inset"
              : ""
          }`}
          onDragOver={(event) => {
            // if (!onReceiveTransfer) return;
            console.log("✈️ [2. 飞临对侧领空] 正在悬停在:", side, "面板上方");
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";

            // setIsDropActive(true);
          }}
          onDragLeave={() => setIsDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();

            // 通道 A：从 event 里面拿数据
            const payload = event.dataTransfer.getData(
              "application/x-foconn-vfs-selection",
            );

            if (payload) {
              try {
                const parsed = JSON.parse(payload);
                if (parsed.side !== side) {
                  // 跨侧了
                  console.log(
                    "🏁 [通道A 触发成功] 拿到解密数据:",
                    parsed.nodes,
                  );
                  onReceiveTransfer?.({
                    sourceSide: parsed.side,
                    nodes: parsed.nodes,
                  });
                  return;
                }
              } catch (e) {}
            }

            // 通道 B：如果 event 被 Tauri 污染导致 getData 为空，直接去外部父组件传进来的状态里拦截！
            // 假设你通过 Props 把父组件的 draggingPayload 传进来了，或者直接调用回调
            // 这里为了最快见效，如果是从 local 拖过来的，直接触发
            if (side === "remote") {
              console.log("🏁 [通道B 触发成功] Web原生松手直接截获拖拽流");
              // 触发你在第一步里刚刚加在远程面板身上的 onReceiveTransfer
              onReceiveTransfer?.({
                sourceSide: "local",
                nodes: [] /* 父组件里有引用，这里传空也会在父组件被兜底 */,
              });
            }
          }}
        >
          {nodes.length === 0 && !isLoading ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--app-text-soft)]">
              {title} currently has no visible items.
            </div>
          ) : (
            <table className="w-full text-left text-sm text-[var(--app-text-muted)]">
              <thead className="sticky top-0 bg-[var(--app-bg-elevated)] text-xs text-[var(--app-text-soft)]">
                <tr>
                  <th
                    onClick={() => handleHeaderClick("name")}
                    className="px-4 py-2 font-medium transition cursor-pointer select-none hover:text-white"
                  >
                    {t("vfs.name")} {renderSortIndicator("name")}
                  </th>
                  <th
                    onClick={() => handleHeaderClick("size")}
                    className="px-4 py-2 font-medium transition cursor-pointer select-none hover:text-white"
                  >
                    {t("vfs.size")} {renderSortIndicator("size")}
                  </th>
                  <th
                    onClick={() => handleHeaderClick("time")}
                    className="px-4 py-2 font-medium transition cursor-pointer select-none hover:text-white"
                  >
                    {t("vfs.modified")} {renderSortIndicator("time")}
                  </th>
                  {!hidePermissions && (
                    <th className="px-4 py-2 font-medium">
                      {t("vfs.permissions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {nodes.map((node, i) => (
                  <FoconnContextMenu
                    key={node.path}
                    items={createNodeMenuItems}
                    onBeforeOpen={(event) => {
                      flushSync(() => {
                        if (!selectedPaths.includes(node.path)) {
                          applyRowSelection(node, i, event);
                        }
                      });
                    }}
                  >
                    <tr
                      onClick={(event) => applyRowSelection(node, i, event)}
                      onDoubleClick={() => handleDoubleClick(node)}
                      onMouseDown={(event) => {
                        // 只响应鼠标左键按下，并且排除点在返回上级 ".." 节点上
                        if (event.button !== 0 || node.name === "..") return;

                        // 动态提取当前捕获的完整节点
                        const currentPayloadNodes = selectedPaths.includes(
                          node.path,
                        )
                          ? nodes.filter((n) => selectedPaths.includes(n.path))
                          : [node];

                        console.log(
                          `🚀 [指针流 起飞成功] 侧向: ${side}, 节点数:`,
                          currentPayloadNodes.length,
                        );

                        // 喂给父组件的指针状态机
                        onDragStateChange?.({
                          count: currentPayloadNodes.length,
                          sourceSide: side, // 这样如果是右边起飞，这里就是 'remote'
                          nodes: currentPayloadNodes,
                        });
                      }}
                      className={`cursor-pointer select-none border-b border-[var(--app-border)] transition hover:bg-[var(--app-bg-hover)] ${
                        selectedPaths.includes(node.path)
                          ? "bg-[rgba(90,140,255,0.16)] text-white"
                          : ""
                      }`}
                    >
                      <td
                        className={`px-4 py-2 ${selectedPaths.includes(node.path) ? "border-l-2 border-[#39a7ff]" : ""}`}
                      >
                        <div className="flex gap-2 items-center">
                          {node.is_dir ? (
                            <Folder
                              size={16}
                              className="text-[var(--app-info)]"
                            />
                          ) : (
                            <File
                              size={16}
                              className="text-[var(--app-text-soft)]"
                            />
                          )}
                          <span className="truncate">{node.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {node.is_dir ? "-" : formatSize(node.size)}
                      </td>
                      <td className="px-4 py-2">
                        {format(
                          new Date(node.mtime * 1000),
                          "yyyy-MM-dd HH:mm",
                        )}
                      </td>
                      {!hidePermissions && (
                        <td className="px-4 py-2">
                          {node.permissions?.mode
                            ?.toString(8)
                            .padStart(4, "0") || "-"}
                        </td>
                      )}
                    </tr>
                  </FoconnContextMenu>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FoconnContextMenu>

      {/* 弹窗等常规布局 */}
      {renameDialog ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[420px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)]">
            <div className="text-base font-semibold text-white">
              {t("vfs.rename")}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t("context_menu.rename_prompt")}
            </div>
            <input
              autoFocus
              type="text"
              value={renameDialog.value}
              onChange={(event) =>
                setRenameDialog((current) =>
                  current ? { ...current, value: event.target.value } : current,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const nextName = renameDialog.value.trim();
                  if (nextName && nextName !== renameDialog.node.name) {
                    onRenameNode?.(renameDialog.node, nextName);
                    setRenameDialog(null);
                  }
                }
                if (event.key === "Escape") {
                  setRenameDialog(null);
                }
              }}
              className="mt-4 w-full rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)]"
            />
            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                onClick={() => setRenameDialog(null)}
                className="rounded-[12px] border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextName = renameDialog.value.trim();
                  if (!nextName || nextName === renameDialog.node.name) {
                    return;
                  }
                  onRenameNode?.(renameDialog.node, nextName);
                  setRenameDialog(null);
                }}
                className="rounded-[12px] border border-[rgba(68,150,255,0.3)] bg-[rgba(68,150,255,0.14)] px-4 py-2 text-sm text-white transition hover:bg-[rgba(68,150,255,0.2)]"
              >
                {t("vfs.rename")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteDialog ? (
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
                onClick={() => {
                  onDeleteNodes?.(deleteDialog.nodes);
                  setDeleteDialog(null);
                }}
                className="rounded-[12px] border border-[rgba(255,92,92,0.3)] bg-[rgba(255,92,92,0.12)] px-4 py-2 text-sm text-white transition hover:bg-[rgba(255,92,92,0.18)]"
              >
                {t("vfs.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isMkdirDialogOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[1px]">
          <div className="w-full max-w-[420px] rounded-[22px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-5 shadow-[var(--app-shadow-elevated)]">
            <div className="text-base font-semibold text-white">
              {t("vfs.mkdir")}
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {t("context_menu.mkdir_prompt")}
            </div>
            <input
              autoFocus
              type="text"
              value={mkdirName}
              onChange={(event) => setMkdirName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const nextName = mkdirName.trim();
                  if (nextName) {
                    onCreateDirectory?.(nextName);
                    setIsMkdirDialogOpen(false);
                    setMkdirName("");
                  }
                }
                if (event.key === "Escape") {
                  setIsMkdirDialogOpen(false);
                  setMkdirName("");
                }
              }}
              className="mt-4 w-full rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--app-border-strong)]"
            />
            <div className="flex gap-2 justify-end mt-5">
              <button
                type="button"
                onClick={() => {
                  setIsMkdirDialogOpen(false);
                  setMkdirName("");
                }}
                className="rounded-[12px] border border-[var(--app-border)] px-4 py-2 text-sm text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextName = mkdirName.trim();
                  if (!nextName) {
                    return;
                  }
                  onCreateDirectory?.(nextName);
                  setIsMkdirDialogOpen(false);
                  setMkdirName("");
                }}
                className="rounded-[12px] border border-[rgba(68,150,255,0.3)] bg-[rgba(68,150,255,0.14)] px-4 py-2 text-sm text-white transition hover:bg-[rgba(68,150,255,0.2)]"
              >
                {t("vfs.mkdir")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
