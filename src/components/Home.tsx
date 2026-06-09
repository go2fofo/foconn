import { useTranslation } from "react-i18next";
import type { QuickConnectProtocol, SshSessionConfig } from "../types";
import { useMemo } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { SshConnectionForm } from "./SshConnectionForm";
import { Bug } from "lucide-react";

interface HomeProps {
  onOpenLocal: () => void;
  onOpenProtocolTab: (config: {
    title: string;
    protocol: QuickConnectProtocol;
    host?: string;
    port?: number;
    username?: string;
    authType?: "PASSWORD" | "KEYPAIR";
    secretRef?: string;
    description?: string;
  }) => void;
}

export function Home({ onOpenLocal, onOpenProtocolTab }: HomeProps) {
  const { t } = useTranslation();
  const bookmarkTree = useWorkspaceStore((state) => state.bookmarkTree);
  const history = useWorkspaceStore((state) => state.history);
  const saveBookmark = useWorkspaceStore((state) => state.saveBookmark);

  const bookmarks = useMemo(
    () => bookmarkTree.flatMap((group) => group.items),
    [bookmarkTree],
  );

  const handleConnect = (config: SshSessionConfig) => {
    onOpenProtocolTab({
      title: config.title.trim() || config.host,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      secretRef: config.secretRef,
      description: config.description,
    });
  };

  const handleSave = async (config: SshSessionConfig) => {
    await saveBookmark(config);
  };

  return (
    <div
      className="h-full overflow-auto px-6 py-6 xl:px-10"
      style={{ background: "var(--app-hero-bg)" }}
    >
      <div className="mx-auto flex h-full w-full flex-col gap-6 2xl:max-w-[1680px]">
        {/*  第一核心区：中枢操纵台 (Command & Form Hub) */}
        <section className="shrink-0 grid gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[440px_1fr]">
          {/* 🛰️ 左侧控制舱：多维中枢监视器（纯中文硬核版） */}
          <div className="flex flex-col justify-between rounded-[24px] border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950 p-6 xl:p-8 shadow-[0_25px_50px_-12px_rgba(3,7,18,0.6)] backdrop-blur-xl relative overflow-hidden group">
            {/* 后景全息科技微光 */}
            <div className="absolute -right-16 -top-16 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl group-hover:bg-cyan-500/15 transition-all duration-700" />
            <div className="absolute -left-16 -bottom-16 w-40 h-40 bg-purple-500/5 rounded-full blur-3xl" />

            {/* 顶层标题与描述 */}
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {t("home.dashboard")}
              </span>
              <h1 className="mt-5 text-4xl font-mono font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 animate-pulse drop-shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                &gt; Foconn_
              </h1>
              <p className="mt-3 text-xs leading-relaxed text-slate-400 font-normal">
                {t("home.shortcut_hint")}
              </p>
            </div>

            {/* 🌟 核心填充：硬核工控状态监视板（已全面汉化） */}
            <div className="my-6 relative z-10 rounded-xl border border-slate-900 bg-slate-950/60 p-4 font-mono text-[11px] text-slate-500 space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-900/60 pb-2">
                <span className="text-slate-400 font-sans font-medium">
                  系统核心运行状态
                </span>
                <span className="text-emerald-400 text-[10px] animate-pulse">
                  ● 运行稳定
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>客户端版本</span>
                  <span className="text-slate-300">v0.1.0-测试版</span>
                </div>
                <div className="flex justify-between">
                  <span>当前活跃会话</span>
                  <span className="text-cyan-400 font-sans">
                    {history.length > 0
                      ? `${history.length} 个通道`
                      : "暂无活跃"}
                  </span>
                </div>
                {/* 动态仿真负载条 */}
                <div className="pt-1">
                  <div className="flex justify-between text-[10px] text-slate-600 mb-1">
                    <span>数据通道负载缓冲</span>
                    <span>12%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full w-[12%] bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* 底部动作区域：纯中文非对称双轨布局 */}
            <div className="relative z-10 space-y-3">
              {/* 主操作：开启本地终端 */}
              <button
                type="button"
                onClick={onOpenLocal}
                className="w-full flex items-center justify-between rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-950/30 transition-all duration-300 hover:opacity-95 hover:shadow-cyan-500/20 active:scale-[0.99]"
              >
                <span className="tracking-wide">{t("home.open_local")}</span>
                <span className="text-[10px] font-sans opacity-80 bg-black/10 px-2 py-0.5 rounded-md">
                  启动
                </span>
              </button>

              {/* 辅助快捷操作：唤醒后端控制台的开发者模式指令 */}
              <button
                type="button"
                onClick={async () => {
                  const { invoke } = await import("@tauri-apps/api/core");
                  invoke("toggle_devtools").catch(() => {});
                }}
                className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/20 hover:bg-slate-900/40 px-5 py-3 text-xs text-slate-400 font-medium transition-all duration-200 active:scale-[0.99]"
              >
                <span className="font-sans flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] group-hover:bg-emerald-500/20 group-hover:text-emerald-300 group-hover:border-emerald-500/40 transition-all duration-300">
                    <Bug className="h-3.5 w-3.5 stroke-[2.5] animate-pulse" />
                  </span>
                  调试内核控制台
                </span>
                <span className="font-sans text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                  切换面板
                </span>
              </button>
            </div>
          </div>

          {/* 右侧控制舱：新建会话内联表单 */}
          <div className="rounded-[24px] border border-slate-800/40 bg-slate-900/10 shadow-sm backdrop-blur-sm overflow-hidden">
            <SshConnectionForm
              heading={t("home.new_connection")}
              groups={bookmarkTree}
              onSave={handleSave}
              onConnect={handleConnect}
            />
          </div>
        </section>

        {/* 🎛️ 第二核心区：全宽网格控制台（占满整整一行，纯中文极客版） */}
        <section className="w-full min-h-0 flex-1">
          <div className="flex h-full flex-col rounded-[24px] border border-slate-800/70 bg-gradient-to-b from-slate-950/60 to-slate-950/20 p-6 shadow-2xl backdrop-blur-md">
            {/* 节点区首标题与状态计数 */}
            <div className="mb-5 flex items-center justify-between border-b border-slate-900 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-xs border border-cyan-500/20 font-mono">
                  &gt;_
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 block leading-none">
                    {t("home.bookmarks")}
                  </span>
                  <h2 className="mt-1.5 text-base font-bold text-slate-200 leading-none tracking-wide">
                    已存终端节点
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                <span className="text-[10px] font-sans text-slate-400 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-md">
                  {t("home.cluster_size", { count: bookmarks.length })}
                </span>
              </div>
            </div>

            {/* 🌟 核心改动：完美的 4 列全款矩阵自适应网格 */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {bookmarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/10 px-5 py-16 text-center text-xs text-slate-500">
                  <span className="text-3xl mb-2">📥</span>
                  {t("home.no_bookmarks")}
                  <span className="mt-1 text-[11px] text-slate-600 font-sans">
                    暂无快捷书签，请在上方创建
                  </span>
                </div>
              ) : (
                // 工业级高密度多列布局，完美适配全宽展示
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-2">
                  {bookmarks.map((item) => {
                    const isSftp = item.protocol === "SFTP";
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onOpenProtocolTab({
                            title: item.title || item.host,
                            protocol: item.protocol,
                            host: item.host,
                            port: item.port,
                            username: item.username,
                            authType: item.authType,
                            secretRef: item.secretRef,
                            description: item.description,
                          })
                        }
                        className="group relative flex flex-col justify-between rounded-xl border border-slate-900/80 bg-slate-900/15 p-4.5 text-left transition-all duration-300 hover:border-cyan-500/40 hover:bg-gradient-to-b hover:from-slate-900/40 hover:to-slate-950/60 shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)] hover:-translate-y-[2px]"
                      >
                        {/* 悬停时的高亮左侧指示条 */}
                        <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-cyan-500 rounded-r opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        <div className="pl-1">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors truncate flex-1">
                              {item.title || item.host}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-sans font-medium uppercase tracking-wider shrink-0 border ${
                                isSftp
                                  ? "bg-purple-500/5 text-purple-400 border-purple-500/20"
                                  : "bg-cyan-500/5 text-cyan-400 border-cyan-500/20"
                              }`}
                            >
                              {t(`protocols.${item.protocol}`)}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-1 text-xs text-slate-400 font-mono truncate">
                            <span className="text-slate-600">
                              {item.username || "root"}
                            </span>
                            <span className="text-slate-500">@</span>
                            <span className="text-slate-300 truncate">
                              {item.host}
                            </span>
                            {item.port !== 22 && (
                              <span className="text-amber-500/80 shrink-0 bg-amber-500/5 border border-amber-500/10 px-1 rounded text-[10px]">
                                :{item.port}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 底部描述区域：统一中文化，保障对齐质感 */}
                        <div className="mt-4 pt-3 border-t border-slate-900/80 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 font-sans truncate pr-4 flex-1">
                            {item.description || (
                              <span className="font-sans text-slate-700">
                                暂无节点备注描述
                              </span>
                            )}
                          </span>
                          <span className="text-cyan-400 font-sans text-[10px] tracking-wide opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            一键连接 ↗
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
