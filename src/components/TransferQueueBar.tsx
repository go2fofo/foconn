/*
 * @Author: fofo
 * @Date: 2026-06-08 13:51:50
 * @LastEditTime: 2026-06-08 13:51:51
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src/components/TransferQueueBar.tsx
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransferStore } from '../store/vfsStore';
import { X, XCircle, Play, Pause, ChevronUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface TransferQueueBarProps {
  focusTaskId?: string | null;
  recentFilter?: 'all' | 'failed';
  onRecentFilterChange?: (next: 'all' | 'failed') => void;
}

export function TransferQueueBar({ focusTaskId, recentFilter = 'all', onRecentFilterChange }: TransferQueueBarProps) {
  const { t } = useTranslation();
  const tasksMap = useTransferStore((state) => state.tasks);
  const history = useTransferStore((state) => state.history);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);
  const recentHistory = useMemo(
    () => history.filter((task) => !tasksMap[task.task_id]).slice(0, 12),
    [history, tasksMap],
  );
  const prioritizedRecentHistory = useMemo(
    () =>
      [...recentHistory].sort((left, right) => {
        const leftFailed = left.status === 'FAILED' ? 1 : 0;
        const rightFailed = right.status === 'FAILED' ? 1 : 0;
        return rightFailed - leftFailed;
      }),
    [recentHistory],
  );
  const filteredRecentHistory = useMemo(
    () =>
      recentFilter === 'failed'
        ? prioritizedRecentHistory.filter((task) => task.status === 'FAILED')
        : prioritizedRecentHistory,
    [prioritizedRecentHistory, recentFilter],
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleControl = async (taskId: string, action: 'PAUSE' | 'RESUME' | 'CANCEL') => {
    try {
      await invoke('vfs_control_task', { taskId, action });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!focusTaskId) {
      return;
    }
    setIsCollapsed(false);
    const element = scrollContainerRef.current?.querySelector<HTMLElement>(`[data-task-id="${focusTaskId}"]`);
    if (!element) {
      return;
    }
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightedTaskId(focusTaskId);
    const timer = window.setTimeout(() => {
      setHighlightedTaskId((current) => (current === focusTaskId ? null : current));
    }, 2200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [filteredRecentHistory, focusTaskId, tasks]);

  if (tasks.length === 0 && recentHistory.length === 0) return null;

  if (isCollapsed) {
    return (
      <div className="flex h-11 items-center justify-between border-t border-[var(--app-border)] bg-[var(--app-bg-container)] px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--app-text-base)]">{t('vfs.transfers')}</span>
          <span className="text-xs text-[var(--app-text-muted)]">
            {t('vfs.feedback.queue_summary', { active: tasks.length, recent: recentHistory.length })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="rounded p-1 text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-base)]"
          aria-label={t('vfs.feedback.expand_queue')}
          title={t('vfs.feedback.expand_queue')}
        >
          <ChevronUp size={16} />
        </button>
      </div>
    );
  }

  const renderTaskRow = (task: typeof tasks[number], allowControl: boolean) => (
    <div
      key={task.task_id}
      data-task-id={task.task_id}
      className={`mb-2 flex flex-col gap-1 rounded border bg-[var(--app-bg-panel)] p-2 text-sm transition ${
        highlightedTaskId === task.task_id
          ? 'border-[var(--app-primary)] ring-2 ring-[rgba(68,150,255,0.22)]'
          : 'border-[var(--app-border)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium">{task.filename}</span>
        <div className="flex gap-2 text-xs">
          <span className="text-[var(--app-text-muted)]">{t(`vfs.status.${task.status}`)}</span>
          <span className="text-[var(--app-info)]">{formatSize(task.speed_bps)}/s</span>
        </div>
      </div>

      <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--app-bg-elevated)]">
        <div
          className="h-1.5 rounded-full transition-all duration-300"
          style={{
            background: 'var(--app-accent-bg)',
            width: `${Math.max(0, Math.min(100, task.bytes_total > 0 ? (task.bytes_transferred / task.bytes_total) * 100 : 0))}%`,
          }}
        />
      </div>

      <div className="mt-1 flex justify-between gap-3 text-xs text-[var(--app-text-soft)]">
        <span>{formatSize(task.bytes_transferred)} / {formatSize(task.bytes_total)}</span>
        {allowControl ? (
          <div className="flex gap-2">
            {task.status === 'TRANSFERRING' && (
              <button
                onClick={() => handleControl(task.task_id, 'PAUSE')}
                className="text-[var(--app-text-muted)] transition hover:text-[var(--app-warning)]"
              >
                <Pause size={14} />
              </button>
            )}
            {task.status === 'PAUSED' && (
              <button
                onClick={() => handleControl(task.task_id, 'RESUME')}
                className="text-[var(--app-text-muted)] transition hover:text-[var(--app-success)]"
              >
                <Play size={14} />
              </button>
            )}
            <button
              onClick={() => handleControl(task.task_id, 'CANCEL')}
              className="text-[var(--app-text-muted)] transition hover:text-[var(--app-error)]"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <span className="text-[var(--app-text-muted)]">{task.error_message ?? t('vfs.feedback.recent_result')}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-48 flex-col border-t border-[var(--app-border)] bg-[var(--app-bg-container)]">
      <div className="flex justify-between bg-[var(--app-bg-elevated)] px-4 py-2 text-sm font-semibold">
        <div className="flex items-center gap-3">
          <span>{t('vfs.transfers')}</span>
          <span className="text-xs text-[var(--app-text-muted)]">
            {t('vfs.feedback.queue_summary', { active: tasks.length, recent: recentHistory.length })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="rounded p-1 text-[var(--app-text-soft)] transition hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-base)]"
          aria-label={t('vfs.feedback.close_queue')}
          title={t('vfs.feedback.close_queue')}
        >
          <X size={14} />
        </button>
      </div>
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2">
        {tasks.length > 0 ? (
          <>
            <div className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--app-text-soft)]">
              {t('vfs.feedback.active_tasks')}
            </div>
            {tasks.map((task) => renderTaskRow(task, true))}
          </>
        ) : null}
        {recentHistory.length > 0 ? (
          <>
            <div className="mb-2 mt-3 flex items-center justify-between gap-3 px-1">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--app-text-soft)]">
                {t('vfs.feedback.recent_results')}
              </div>
              <div className="flex items-center gap-2">
                {(['all', 'failed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onRecentFilterChange?.(mode)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      recentFilter === mode
                        ? 'bg-[rgba(68,150,255,0.18)] text-white'
                        : 'text-[var(--app-text-soft)] hover:bg-[var(--app-bg-hover)]'
                    }`}
                  >
                    {mode === 'all' ? t('vfs.feedback.filter_all') : t('vfs.feedback.filter_failed')}
                  </button>
                ))}
              </div>
            </div>
            {filteredRecentHistory.length > 0 ? (
              filteredRecentHistory.map((task) => renderTaskRow(task, false))
            ) : (
              <div className="rounded border border-dashed border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-4 text-sm text-[var(--app-text-soft)]">
                {t('vfs.feedback.no_failed_results')}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
