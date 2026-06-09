import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { Bolt, ClipboardCheck, Play, TerminalSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SessionConfig } from '../types';
import { useWorkspaceStore } from '../store/workspaceStore';
import { FoconnContextMenu, type ContextMenuItem } from './FoconnContextMenu';
import '@xterm/xterm/css/xterm.css';

interface RuntimeSessionCacheEntry {
  promise: Promise<string>;
  runtimeSessionId: string | null;
  refCount: number;
  disposeTimer: ReturnType<typeof window.setTimeout> | null;
}

const runtimeSessionCache = new Map<string, RuntimeSessionCacheEntry>();

interface TerminalProps {
  session: SessionConfig;
  isActive: boolean;
}

export function Terminal({ session, isActive }: TerminalProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const hasReportedStdoutRef = useRef(false);
  const runtimeSessionIdRef = useRef<string | null>(null);
  const [isQuickPanelOpen, setIsQuickPanelOpen] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const quickCommands = useWorkspaceStore((state) => state.quickCommands);

  const commandScope = session.protocol === 'TERMINAL' ? 'LOCAL' : 'REMOTE';
  const visibleCommands = useMemo(
    () => quickCommands.filter((item) => item.scope === commandScope),
    [commandScope, quickCommands],
  );

  const executeCommand = async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed || !runtimeSessionIdRef.current) {
      return;
    }
    await invoke('write_term_stream', {
      runtimeSessionId: runtimeSessionIdRef.current,
      payload: Array.from(new TextEncoder().encode(`${trimmed}\n`)),
    });
    xtermRef.current?.focus();
  };

  const terminalContextItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: 'copy',
        label: t('context_menu.copy'),
        icon: 'CopyIcon',
        shortcut: 'Shift+Cmd+C',
        disabled: !xtermRef.current?.hasSelection(),
        action: async () => {
          const selection = xtermRef.current?.getSelection();
          if (selection) {
            await navigator.clipboard.writeText(selection);
          }
        },
      },
      {
        id: 'paste',
        label: t('context_menu.paste'),
        icon: 'ClipboardIcon',
        shortcut: 'Shift+Cmd+V',
        action: async () => {
          const text = await navigator.clipboard.readText();
          await executeCommand(text);
        },
      },
      { type: 'separator' },
      {
        id: 'select_all',
        label: t('context_menu.select_all'),
        icon: 'SelectIcon',
        action: () => {
          xtermRef.current?.selectAll();
        },
      },
      {
        id: 'clear',
        label: t('context_menu.clear'),
        icon: 'TrashIcon',
        shortcut: 'Cmd+K',
        action: () => {
          xtermRef.current?.clear();
        },
      },
    ],
    [t],
  );

  useEffect(() => {
    if (!terminalRef.current) return;
    setRuntimeReady(false);

    const rootStyle = getComputedStyle(document.documentElement);
    const getThemeValue = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: getThemeValue('--app-bg-base', 'rgb(5, 5, 5)'),
        foreground: getThemeValue('--app-text-base', 'rgba(255, 255, 255, 0.88)'),
        cursor: getThemeValue('--app-primary', 'rgb(85, 199, 194)'),
        selectionBackground: getThemeValue('--app-selection-bg', 'rgba(90, 140, 255, 0.22)'),
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    term.focus();
    
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    let currentRuntimeId: string | null = null;
    let isMounted = true;
    let releaseRuntimeSession: (() => void) | null = null;
    let backlogPollTimer: ReturnType<typeof window.setInterval> | null = null;
    let backlogReadInFlight = false;
    hasReportedStdoutRef.current = false;

    const initSession = async () => {
      if (!isMounted || !fitAddonRef.current || !xtermRef.current) return;
      
      try {
        fitAddonRef.current.fit();
      } catch (e) {
        console.warn('Fit error:', e);
      }
      const cols = Math.max(xtermRef.current.cols || 80, 20);
      const rows = Math.max(xtermRef.current.rows || 24, 10);

      try {
        let cached = runtimeSessionCache.get(session.id);
        if (!cached) {
          cached = {
            runtimeSessionId: null,
            refCount: 0,
            disposeTimer: null,
            promise: invoke<string>('create_term_stream', {
              config: session,
              cols: cols,
              rows: rows,
            }).then((id) => {
              const current = runtimeSessionCache.get(session.id);
              if (current) {
                current.runtimeSessionId = id;
              }
              return id;
            }),
          };
          runtimeSessionCache.set(session.id, cached);
        } else if (cached.disposeTimer) {
          window.clearTimeout(cached.disposeTimer);
          cached.disposeTimer = null;
        }
        cached.refCount += 1;
        releaseRuntimeSession = () => {
          const entry = runtimeSessionCache.get(session.id);
          if (!entry) return;
          entry.refCount = Math.max(0, entry.refCount - 1);
          if (entry.refCount === 0) {
            entry.disposeTimer = window.setTimeout(() => {
              const latest = runtimeSessionCache.get(session.id);
              if (!latest || latest.refCount > 0) {
                return;
              }
              if (latest.runtimeSessionId) {
                invoke('close_term_stream', { runtimeSessionId: latest.runtimeSessionId }).catch(console.error);
              }
              runtimeSessionCache.delete(session.id);
            }, 350);
          }
        };
        const id = await cached.promise;
        
        if (!isMounted) {
          releaseRuntimeSession?.();
          releaseRuntimeSession = null;
          return;
        }
        
        currentRuntimeId = id;
        runtimeSessionIdRef.current = id;
        setRuntimeReady(true);
        const pumpBacklog = async () => {
          if (!isMounted || !currentRuntimeId || backlogReadInFlight) {
            return;
          }
          backlogReadInFlight = true;
          try {
            const backlog = await invoke<number[]>('read_term_backlog', {
              runtimeSessionId: currentRuntimeId,
            });
            if (Array.isArray(backlog) && backlog.length > 0) {
              if (!hasReportedStdoutRef.current) {
                hasReportedStdoutRef.current = true;
              }
              term.write(new Uint8Array(backlog));
            }
          } catch (error) {
            console.warn('Backlog read failed:', error);
          } finally {
            backlogReadInFlight = false;
          }
        };

        await pumpBacklog();
        backlogPollTimer = window.setInterval(() => {
          void pumpBacklog();
        }, 120);

        term.onData(async (data) => {
          if (currentRuntimeId) {
            await invoke('write_term_stream', {
              runtimeSessionId: currentRuntimeId,
              payload: Array.from(new TextEncoder().encode(data)),
            });
          }
        });

        term.onResize(async (size) => {
          if (currentRuntimeId) {
            await invoke('resize_term_stream', {
              runtimeSessionId: currentRuntimeId,
              cols: size.cols,
              rows: size.rows,
            });
          }
        });

      } catch (err) {
        term.writeln(`\x1b[31mFailed to start session: ${err}\x1b[0m`);
      }
    };

    initSession();

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      runtimeSessionIdRef.current = null;
      window.removeEventListener('resize', handleResize);
      if (backlogPollTimer) {
        window.clearInterval(backlogPollTimer);
      }
      releaseRuntimeSession?.();
      releaseRuntimeSession = null;
      term.dispose();
    };
  }, [session.id]); // only re-init if session id changes

  // Trigger refit when tab becomes active
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        xtermRef.current?.focus();
      }, 50);
    }
  }, [isActive]);

  return (
    <div className="relative h-full w-full bg-[var(--app-bg-base)]" style={{ minHeight: '300px' }}>
      <FoconnContextMenu items={terminalContextItems}>
        <div className="h-full w-full px-2 pb-[62px] pt-2" ref={terminalRef} />
      </FoconnContextMenu>

      {isQuickPanelOpen ? (
        <div className="absolute inset-x-4 bottom-[64px] z-20 rounded-[20px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-4 shadow-[var(--app-shadow-elevated)]">
          <div className="flex justify-between items-center mb-3">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-info)]">
              {t('terminal_quick_bar.quick_commands')}
            </div>
            <div className="text-xs text-[var(--app-text-soft)]">
              {visibleCommands.length} {t('terminal_quick_bar.commands_available')}
            </div>
          </div>
          <div className="grid max-h-[220px] grid-cols-1 gap-3 overflow-y-auto pr-1 xl:grid-cols-3">
            {visibleCommands.map((command) => (
              <button
                key={command.id}
                type="button"
                onClick={() => {
                  void executeCommand(command.command);
                  setIsQuickPanelOpen(false);
                }}
                className="rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-4 py-3 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
              >
                <div className="flex gap-3 justify-between items-start">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{command.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-[var(--app-text-soft)]">
                      {command.description || command.command}
                    </div>
                  </div>
                  <Play size={14} className="mt-0.5 shrink-0 text-[var(--app-primary)]" />
                </div>
              </button>
            ))}
            {visibleCommands.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-8 text-center text-sm text-[var(--app-text-soft)] xl:col-span-3">
                {t('terminal_quick_bar.no_commands')}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--app-border)] bg-[rgba(8,12,20,0.96)] px-4 py-3">
        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={() => setIsQuickPanelOpen((current) => !current)}
            className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-2 text-sm text-white transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-bg-hover)]"
          >
            <Bolt size={15} className="text-[var(--app-primary)]" />
            {t('terminal_quick_bar.quick_commands')}
          </button>

          <div className="hidden rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-2 text-xs text-[var(--app-text-soft)] md:flex md:items-center md:gap-2">
            <ClipboardCheck size={14} className="text-[var(--app-success)]" />
            {t('terminal_quick_bar.runtime_status')}: {runtimeReady ? t('terminal_quick_bar.runtime_ready') : t('terminal_quick_bar.runtime_pending')}
          </div>

          <form
            className="flex flex-1 gap-2 items-center min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              void executeCommand(quickInput);
              setQuickInput('');
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-2">
              <TerminalSquare size={14} className="shrink-0 text-[var(--app-text-soft)]" />
              <input
                value={quickInput}
                onChange={(event) => setQuickInput(event.target.value)}
                placeholder={t('terminal_quick_bar.quick_input_placeholder')}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[var(--app-text-soft)]"
              />
            </div>
            <button
              type="submit"
              disabled={!quickInput.trim() || !runtimeReady}
              className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--app-border-strong)] bg-[var(--app-accent-bg)] px-3 py-2 text-sm text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play size={14} />
              {t('terminal_quick_bar.execute_now')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
