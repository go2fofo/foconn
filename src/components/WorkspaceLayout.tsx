import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, LayoutGrid, TerminalSquare, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Home } from "./Home";
import { Terminal } from "./Terminal";
import { ServerView } from "./ServerView";
import { CrashBoundary } from "./CrashBoundary";
import { FoconnPopover } from "./FoconnPopover";
import { OmniboxContent } from "./OmniboxContent";
import { QuickToolMenu, type QuickToolMenuItem } from "./QuickToolMenu";
import { TabPlusDropdown } from "./TabPlusDropdown";
import { BookmarkSidebar } from "./BookmarkSidebar";
import { FoconnFloatingBall } from "./FoconnFloatingBall";
import { useWorkspaceStore } from "../store/workspaceStore";

const FLOATING_BALL_HIDDEN_KEY = "foconn:floating-ball-hidden";
type QuickMenuSource = "floating-ball" | "dashboard";
type QuickMenuContext = "SSH" | "SFTP" | "DASHBOARD";

export function WorkspaceLayout() {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOmniboxOpen, setIsOmniboxOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isBookmarkSidebarOpen, setIsBookmarkSidebarOpen] = useState(false);
  const [isFloatingBallHidden, setIsFloatingBallHidden] = useState(() => {
    try {
      return window.localStorage.getItem(FLOATING_BALL_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [quickToolMenuAnchor, setQuickToolMenuAnchor] = useState<{
    x: number;
    y: number;
    source: QuickMenuSource;
    context: QuickMenuContext;
  } | null>(null);
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    loadBookmarkTree,
    loadQuickCommands,
    openLocalTerminalTab,
    openProtocolTab,
    updateServerTabActiveView,
    openDevTools,
  } = useWorkspaceStore();

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs],
  );

  useEffect(() => {
    void loadBookmarkTree();
    void loadQuickCommands();
  }, [loadBookmarkTree, loadQuickCommands]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOmniboxOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOmniboxOpen) {
      setQuickToolMenuAnchor(null);
    }
  }, [isOmniboxOpen]);

  const updateFloatingBallHidden = (hidden: boolean) => {
    setIsFloatingBallHidden(hidden);
    window.localStorage.setItem(FLOATING_BALL_HIDDEN_KEY, hidden ? "1" : "0");
  };

  const quickToolMenuItems = useMemo<QuickToolMenuItem[]>(() => {
    console.log(`🔍 [WorkspaceLayout:85] %c 112111: `,'font-size:14px; background:#26A08F; color:#fff;font-weight: bold;', );
    if (!quickToolMenuAnchor) {
      return [];
    }

    const baseItems: QuickToolMenuItem[] = [
           
    ];

    if (quickToolMenuAnchor.context === "DASHBOARD") {
      baseItems.push(
        {
          id: "open-terminal",
          label: t("floating_ball.open_terminal"),
          icon: "terminal",
          action: openLocalTerminalTab,
        },
        {
          id: "open-bookmarks",
          label: t("floating_ball.open_bookmarks"),
          icon: "bookmark",
          action: () => setIsBookmarkSidebarOpen(true),
        },
      );
      if (isFloatingBallHidden) {
        baseItems.push({
          id: "show-floating-ball",
          label: t("floating_ball.show_ball"),
          icon: "eye",
          action: () => updateFloatingBallHidden(false),
        });
      }

      // return baseItems;
    }
    baseItems.push(
      {
        id: "open-omnibox",
        label: t("floating_ball.open_omnibox"),
        icon: "search",
        action: () => setIsOmniboxOpen(true),
      },

      {
        id: "reset-position",
        label: t("floating_ball.reset_position"),
        icon: "reset",
        action: () => {
          window.localStorage.removeItem("foconn:floating-ball-position");
          window.dispatchEvent(
            new CustomEvent("foconn:reset-floating-ball-position"),
          );
        },
      },
      {
        id: "open-dev-tools",
        label: t("floating_ball.open_dev_tools"),
        icon: "tools",
        action: () => {
          void openDevTools();
        },
      },
    );

    if (quickToolMenuAnchor.context === "SFTP") {
      baseItems.splice(1, 0, {
        id: "open-bookmarks",
        label: t("floating_ball.open_bookmarks"),
        icon: "bookmark",
        action: () => setIsBookmarkSidebarOpen(true),
      });
    }

    if (quickToolMenuAnchor.source === "floating-ball") {
      baseItems.push({
        id: "hide-floating-ball",
        label: t("floating_ball.hide_ball"),
        icon: "eye_off",
        action: () => updateFloatingBallHidden(true),
      });
    }

    return baseItems;
  }, [
    isFloatingBallHidden,
    openLocalTerminalTab,
    quickToolMenuAnchor,
    setActiveTab,
    t,
  ]);

  const openQuickToolMenu = (
    anchor: { x: number; y: number },
    source: QuickMenuSource,
    context: QuickMenuContext,
  ) => {
    setQuickToolMenuAnchor({ ...anchor, source, context });
  };

  const shouldIgnoreDashboardContextMenu = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(
      target.closest('button, a, [data-native-contextmenu="true"]'),
    );
  };

  const shouldShowFloatingBall =
    Boolean(activeTab.connection) &&
    (activeTab.protocol === "SSH" || activeTab.protocol === "SFTP") &&
    !isFloatingBallHidden &&
    !isOmniboxOpen;

  return (
    <div className="flex h-full flex-col bg-[var(--app-bg-base)]">
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--app-border)] bg-[var(--app-bg-container)] px-2">
        <div className="flex overflow-x-auto flex-1 items-center min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const Icon =
              tab.protocol === "DASHBOARD"
                ? LayoutGrid
                : tab.protocol === "TERMINAL"
                  ? TerminalSquare
                  : Server;
            const displayTitle =
              tab.protocol === "DASHBOARD"
                ? t("tabs.dashboard")
                : tab.protocol === "TERMINAL" && tab.title === "Local Terminal"
                  ? t("protocols.TERMINAL")
                  : tab.title;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group mr-1 flex h-8 min-w-[150px] max-w-[240px] items-center gap-2 rounded-t-xl border px-3 text-sm transition ${
                  isActive
                    ? "border-[var(--app-border-strong)] bg-[var(--app-bg-elevated)] text-[var(--app-text-base)]"
                    : "border-transparent bg-[rgba(255,255,255,0.04)] text-[var(--app-text-muted)] hover:bg-[var(--app-bg-hover)]"
                }`}
              >
                <Icon
                  size={14}
                  className={
                    tab.connection
                      ? "text-[var(--app-primary)]"
                      : "text-[var(--app-text-muted)]"
                  }
                />
                <span className="truncate">{displayTitle}</span>
                {tab.closable ? (
                  <span
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="ml-auto rounded p-0.5 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--app-bg-hover)]"
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>
            );
          })}
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setIsPlusMenuOpen(true)}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-[var(--app-text-muted)] transition hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-base)]"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-hidden relative flex-1">
        {activeTab.protocol === "DASHBOARD" ? (
          <div
            className="h-full"
            onContextMenu={(event) => {
              if (shouldIgnoreDashboardContextMenu(event.target)) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              openQuickToolMenu(
                { x: event.clientX, y: event.clientY },
                "dashboard",
                "DASHBOARD",
              );
            }}
          >
            <Home
              onOpenLocal={openLocalTerminalTab}
              onOpenProtocolTab={openProtocolTab}
            />
          </div>
        ) : null}

        {activeTab.protocol === "TERMINAL" && activeTab.session ? (
          <div className="h-full">
            <Terminal session={activeTab.session} isActive />
          </div>
        ) : null}

        {activeTab.connection ? (
          <div className="h-full">
            <CrashBoundary
              area="Remote Workspace"
              resetKey={`${activeTab.id}:${activeTab.protocol}:${activeTab.connection.activeTab}`}
            >
              <ServerView
                connection={activeTab.connection}
                onTabChange={(tab) =>
                  updateServerTabActiveView(activeTab.id, tab)
                }
              />
            </CrashBoundary>
          </div>
        ) : null}

        {!activeTab.connection &&
        activeTab.protocol !== "DASHBOARD" &&
        activeTab.protocol !== "TERMINAL" ? (
          <div className="flex h-full items-center justify-center bg-[var(--app-bg-base)]">
            <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-8 py-10 text-center shadow-[var(--app-shadow)]">
              <div className="text-lg font-semibold text-[var(--app-text-base)]">
                {t("omnibox.pending_title")}
              </div>
              <div className="mt-2 text-sm text-[var(--app-text-muted)]">
                {t(`protocols.${activeTab.protocol}`)} ·{" "}
                {t("omnibox.pending_desc")}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <FoconnPopover
        isOpen={isPlusMenuOpen}
        onClose={() => setIsPlusMenuOpen(false)}
        triggerRef={triggerRef}
        placement="bottom-end"
        className="w-[280px] max-w-[calc(100vw-24px)]"
        blurOverlay={false}
      >
        <TabPlusDropdown
          onOpenLocalTerminal={openLocalTerminalTab}
          onOpenBookmarks={() => setIsBookmarkSidebarOpen(true)}
          closePopover={() => setIsPlusMenuOpen(false)}
        />
      </FoconnPopover>

      <FoconnPopover
        isOpen={isOmniboxOpen}
        onClose={() => setIsOmniboxOpen(false)}
        placement="center"
      >
        <OmniboxContent
          onOpenProtocolTab={openProtocolTab}
          onOpenLocalTerminal={openLocalTerminalTab}
          closePopover={() => setIsOmniboxOpen(false)}
          openContext={
            activeTab.protocol === "DASHBOARD" ? "dashboard" : "workspace"
          }
        />
      </FoconnPopover>

      {isBookmarkSidebarOpen ? (
        <button
          type="button"
          onClick={() => setIsBookmarkSidebarOpen(false)}
          className="fixed inset-0 z-[110] bg-black/20 backdrop-blur-[1px]"
          aria-label="Close bookmark sidebar"
        />
      ) : null}
      <BookmarkSidebar
        isOpen={isBookmarkSidebarOpen}
        onClose={() => setIsBookmarkSidebarOpen(false)}
      />
      {shouldShowFloatingBall ? (
        <FoconnFloatingBall
          onClick={() => setIsOmniboxOpen(true)}
          onOpenContextMenu={(anchor) =>
            openQuickToolMenu(
              anchor,
              "floating-ball",
              activeTab.protocol === "SFTP" ? "SFTP" : "SSH",
            )
          }
        />
      ) : null}
      <QuickToolMenu
        isOpen={quickToolMenuAnchor !== null}
        anchor={
          quickToolMenuAnchor
            ? { x: quickToolMenuAnchor.x, y: quickToolMenuAnchor.y }
            : null
        }
        items={quickToolMenuItems}
        onClose={() => setQuickToolMenuAnchor(null)}
      />
    </div>
  );
}
