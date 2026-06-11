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
      className="overflow-auto px-6 py-6 h-full xl:px-10"
      style={{ background: "var(--app-hero-bg)" }}
    >
      <div className="mx-auto flex h-full w-full flex-col gap-6 2xl:max-w-[1680px]">
        {/*  中枢操纵台 (Command & Form Hub) */}
        <section className="shrink-0 grid gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[440px_1fr]">
          {/* 左侧控制舱：多维中枢监视器（纯中文硬核版） */}
          <div className="flex flex-col justify-between rounded-[24px] border border-slate-800/80 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950 p-6 xl:p-8 shadow-[0_25px_50px_-12px_rgba(3,7,18,0.6)] backdrop-blur-xl relative overflow-hidden group">
            {/* 后景全息科技微光 */}
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl transition-all duration-700 bg-cyan-500/10 group-hover:bg-cyan-500/15" />
            <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full blur-3xl bg-purple-500/5" />

            {/* 顶层标题与描述 */}
            <div className="relative z-10">
      
              {/* Foconn 专属全息极简极客徽标 */}
              <div className="relative mt-5 h-8 w-full max-w-[240px] select-none">
                <svg
                  viewBox="0 0 240 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="overflow-visible w-full h-full"
                >
                  <defs>
                    {/* 核心科技冷光发光滤镜 */}
                    <filter
                      id="advanced-glow"
                      x="-30%"
                      y="-30%"
                      width="160%"
                      height="160%"
                    >
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* 1. 隐藏的背景未来感雷达网格线（极细隐约线条） */}
                  <g stroke="#1e293b" strokeWidth="0.5" opacity="0.6">
                    <line x1="0" y1="4" x2="210" y2="4" />
                    <line x1="0" y1="28" x2="210" y2="28" />
                  </g>

                  {/* 2. 前置主体：科技流动线框字形层 */}
                  <g
                    stroke="url(#foconn-gradient)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="miter"
                    filter="url(#advanced-glow)"
                  >
                    {/* F：上方破型悬空，横线缩进 */}
                    <path d="M24 6H10V28M10 16H20" />

                    {/* O：利落的切角胶囊圆矩，带 1px 呼吸缺口 */}
                    <path d="M36 6H48C51 6 53 8 53 11V23C53 26 51 28 48 28H36C33 28 31 26 31 23V11C31 8 33 6 36 6Z" />

                    {/* C：现代主义隐藏折线，右侧开放式开口 */}
                    <path d="M78 10C76 7 73 6 69 6H64C61 6 59 8 59 11V23C59 26 61 28 64 28H69C73 28 76 27 78 23" />

                    {/* O：第二矩阵对称舱门 */}
                    <path d="M92 6H104C107 6 109 8 109 11V23C109 26 107 28 104 28H92C89 28 87 26 87 23V11C87 8 89 6 92 6Z" />

                    {/* N：打破常规的单斜跨越线（无左侧垂直立柱，极简风） */}
                    <path d="M116 28V6L133 28V6" />

                    {/* N：双子呼应立柱 */}
                    <path d="M141 28V6L158 28V6" />
                  </g>

                  {/* 3. 科技装饰元素：终端输入下划线光标与定位十字 */}
                  <g filter="url(#advanced-glow)">
                    {/* 精准定位小十字 */}
                    <path
                      d="M3 16H7M5 14V18"
                      stroke="#22d3ee"
                      strokeWidth="1"
                      opacity="0.4"
                    />

                    {/* 赛博动态跳动光标 [_] */}
                    <line
                      x1="168"
                      y1="28"
                      x2="180"
                      y2="28"
                      stroke="#22d3ee"
                      strokeWidth="3"
                      className="animate-pulse"
                    />
                  </g>

                  {/* 渐变定义 */}
                  <defs>
                    <linearGradient
                      id="foconn-gradient"
                      x1="0"
                      y1="0"
                      x2="180"
                      y2="0"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="40%" stopColor="#e2e8f0" />
                      <stop offset="85%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <p className="mt-3 text-xs font-normal leading-relaxed text-slate-400">
                {t("home.shortcut_hint")}
              </p>
            </div>

            <div className="my-6 relative z-10 rounded-xl border border-slate-900 bg-slate-950/60 p-4 font-mono text-[11px] text-slate-500 space-y-3 shadow-inner">
              <div className="flex justify-between items-center pb-2 border-b border-slate-900/60">
                <span className="font-sans font-medium text-slate-400">
                  系统核心运行状态
                </span>
                <span className="text-emerald-400 text-[10px] animate-pulse">
                  运行稳定
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>客户端版本</span>
                  <span className="text-slate-300">v0.1.0-测试版</span>
                </div>
                <div className="flex justify-between">
                  <span>当前活跃会话</span>
                  <span className="font-sans text-cyan-400">
                    {history.length > 0
                      ? `${history.length} 个通道`
                      : "暂无活跃"}
                  </span>
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

        {/* 全宽网格控制台（占满整整一行，纯中文极客版） */}
        <section className="flex-1 w-full min-h-0">
          <div className="flex h-full flex-col rounded-[24px] border border-slate-800/70 bg-gradient-to-b from-slate-950/60 to-slate-950/20 p-6 shadow-2xl backdrop-blur-md">
            {/* 节点区首标题与状态计数 */}
            <div className="flex justify-between items-center pb-4 mb-5 border-b border-slate-900">
              <div className="flex gap-3 items-center">
                <div className="flex justify-center items-center w-7 h-7 font-mono text-xs text-cyan-400 rounded-lg border bg-cyan-500/10 border-cyan-500/20">
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

              <div className="flex gap-2 items-center">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />
                <span className="text-[10px] font-sans text-slate-400 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-md">
                  {t("home.cluster_size", { count: bookmarks.length })}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 min-h-0 custom-scrollbar">
              {bookmarks.length === 0 ? (
                <div className="flex flex-col justify-center items-center px-5 py-16 text-xs text-center rounded-xl border border-dashed border-slate-800/60 bg-slate-900/10 text-slate-500">
                  {t("home.no_bookmarks")}
                </div>
              ) : (
                // 工业级高密度多列布局，完美适配全宽展示
                <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                          <div className="flex gap-3 justify-between items-start">
                            <span className="flex-1 text-sm font-semibold truncate transition-colors text-slate-200 group-hover:text-cyan-400">
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

                          <div className="flex gap-1 items-center mt-2 font-mono text-xs truncate text-slate-400">
                            <span className="text-slate-600">
                              {item.username || "root"}
                            </span>
                            <span className="text-slate-500">@</span>
                            <span className="truncate text-slate-300">
                              {item.host}
                            </span>
                            {item.port !== 22 && (
                              <span className="text-amber-500/80 shrink-0 bg-amber-500/5 border border-amber-500/10 px-1 rounded text-[10px]">
                                :{item.port}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-900/80 flex items-center justify-between text-[11px]">
                          <span className="flex-1 pr-4 font-sans truncate text-slate-500">
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
