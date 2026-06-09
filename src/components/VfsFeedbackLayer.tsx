import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, CheckCircle2, FolderTree, MousePointerSquareDashed, X } from 'lucide-react';
import { TransferProgress } from '../types';

interface InternalDragPayload {
  count: number;
  sourceSide: 'local' | 'remote';
}

export interface DesktopDropState {
  active: boolean;
  insideTarget: boolean;
  totalCount: number;
  fileCount: number;
  directoryCount: number;
  targetPath: string;
}

export interface TransferBatchInfo {
  batchId: string;
  taskIds: string[];
  direction: 'UPLOAD' | 'DOWNLOAD';
  itemCount: number;
}

interface ToastItem {
  id: string;
  kind: 'success' | 'error';
  title: string;
  description: string;
  actionLabel?: string;
  targetTaskId?: string;
  clickable?: boolean;
  targetFilter?: 'all' | 'failed';
  failureDetails?: Array<{
    taskId: string;
    filename: string;
    path: string;
    reason: string;
  }>;
}

interface VfsFeedbackLayerProps {
  panelErrorMessage?: string | null;
  activeTasks: Record<string, TransferProgress>;
  transferHistory: TransferProgress[];
  transferBatches: TransferBatchInfo[];
  draggingPayload: InternalDragPayload | null;
  desktopDropState: DesktopDropState | null;
  onLocateTask?: (taskId: string, options?: { recentFilter?: 'all' | 'failed' }) => void;
}

interface FailureDetailItem {
  taskId: string;
  filename: string;
  path: string;
  reason: string;
}

interface FailureSummaryItem {
  reason: string;
  count: number;
}

export function formatVfsErrorMessage(
  t: (key: string, options?: Record<string, unknown>) => string,
  rawMessage?: string | null,
) {
  if (!rawMessage) {
    return null;
  }

  const normalized = rawMessage.toLowerCase();
  if (normalized.includes('permission denied')) {
    return t('vfs.feedback.errors.permission_denied');
  }
  if (normalized.includes('no such file') || normalized.includes('not found')) {
    return t('vfs.feedback.errors.not_found');
  }
  if (normalized.includes('cancelled')) {
    return t('vfs.feedback.errors.cancelled');
  }
  if (normalized.includes('authentication failed')) {
    return t('vfs.feedback.errors.auth_failed');
  }
  if (normalized.includes('reserved names')) {
    return t('vfs.feedback.errors.reserved_name');
  }
  if (normalized.includes('name is required')) {
    return t('vfs.feedback.errors.name_required');
  }
  if (normalized.includes('path separators')) {
    return t('vfs.feedback.errors.invalid_name');
  }
  if (normalized.includes('not a directory')) {
    return t('vfs.feedback.errors.not_directory');
  }
  return rawMessage;
}

export function VfsFeedbackLayer({
  panelErrorMessage,
  activeTasks,
  transferHistory,
  transferBatches,
  draggingPayload,
  desktopDropState,
  onLocateTask,
}: VfsFeedbackLayerProps) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [failurePanel, setFailurePanel] = useState<{
    title: string;
    items: FailureDetailItem[];
  } | null>(null);
  const [failureReasonFilter, setFailureReasonFilter] = useState<string | null>(null);
  const [copiedHint, setCopiedHint] = useState<string | null>(null);
  const seenHistoryRef = useRef<Set<string> | null>(null);
  const summarizedBatchIdsRef = useRef<Set<string>>(new Set());
  const historyMap = useMemo(
    () => new Map(transferHistory.map((task) => [task.task_id, task])),
    [transferHistory],
  );
  const batchByTaskId = useMemo(() => {
    const map = new Map<string, TransferBatchInfo>();
    transferBatches.forEach((batch) => {
      batch.taskIds.forEach((taskId) => {
        map.set(taskId, batch);
      });
    });
    return map;
  }, [transferBatches]);
  const failureSummary = useMemo<FailureSummaryItem[]>(() => {
    if (!failurePanel?.items.length) {
      return [];
    }

    const grouped = new Map<string, number>();
    failurePanel.items.forEach((item) => {
      grouped.set(item.reason, (grouped.get(item.reason) ?? 0) + 1);
    });

    return Array.from(grouped.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count);
  }, [failurePanel]);
  const filteredFailureItems = useMemo(() => {
    if (!failurePanel?.items.length) {
      return [];
    }
    if (!failureReasonFilter) {
      return failurePanel.items;
    }
    return failurePanel.items.filter((item) => item.reason === failureReasonFilter);
  }, [failurePanel, failureReasonFilter]);

  useEffect(() => {
    if (!copiedHint) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCopiedHint(null);
    }, 1800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedHint]);

  useEffect(() => {
    if (seenHistoryRef.current === null) {
      seenHistoryRef.current = new Set(transferHistory.map((task) => task.task_id));
      return;
    }

    const nextToasts = transferHistory
      .filter((task) => !seenHistoryRef.current?.has(task.task_id))
      .slice(0, 4)
      .flatMap<ToastItem>((task) => {
        seenHistoryRef.current?.add(task.task_id);
        const batch = batchByTaskId.get(task.task_id);
        if (batch && batch.taskIds.length > 1) {
          return [];
        }
        const isSuccess = task.status === 'COMPLETED';
        const title = isSuccess
          ? task.direction === 'UPLOAD'
            ? t('vfs.feedback.toast_upload_completed')
            : t('vfs.feedback.toast_download_completed')
          : t('vfs.feedback.toast_transfer_failed');
        const description = isSuccess
          ? t('vfs.feedback.toast_completed_description', { filename: task.filename })
          : t('vfs.feedback.toast_failed_description', {
              filename: task.filename,
              reason: formatVfsErrorMessage(t, task.error_message) ?? t('vfs.feedback.errors.generic_failed'),
            });
        const failureReason = formatVfsErrorMessage(t, task.error_message) ?? t('vfs.feedback.errors.generic_failed');

        return [
          {
            id: task.task_id,
            kind: isSuccess ? 'success' : 'error',
            title,
            description,
            actionLabel: isSuccess ? t('vfs.feedback.click_view_queue') : t('vfs.feedback.click_view_failed'),
            targetTaskId: task.task_id,
            clickable: true,
            targetFilter: isSuccess ? 'all' : 'failed',
            failureDetails: isSuccess
              ? undefined
              : [
                  {
                    taskId: task.task_id,
                    filename: task.filename,
                    path: task.path,
                    reason: failureReason,
                  },
                ],
          },
        ];
      });

    if (nextToasts.length === 0) {
      return;
    }

    setToasts((current) => [...nextToasts, ...current].slice(0, 4));
    const timers = nextToasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 4200),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [batchByTaskId, t, transferHistory]);

  useEffect(() => {
    const nextSummaryToasts = transferBatches.flatMap<ToastItem>((batch) => {
      if (batch.taskIds.length <= 1 || summarizedBatchIdsRef.current.has(batch.batchId)) {
        return [];
      }

      const resolvedTasks = batch.taskIds
        .map((taskId) => historyMap.get(taskId))
        .filter((task): task is TransferProgress => Boolean(task));

      const hasPendingTasks = batch.taskIds.some((taskId) => Boolean(activeTasks[taskId]) || !historyMap.has(taskId));
      if (hasPendingTasks || resolvedTasks.length !== batch.taskIds.length) {
        return [];
      }

      summarizedBatchIdsRef.current.add(batch.batchId);
      const failedTasks = resolvedTasks.filter((task) => task.status === 'FAILED');
      const successCount = resolvedTasks.length - failedTasks.length;
      const targetTaskId = failedTasks[0]?.task_id ?? resolvedTasks[0]?.task_id;
      const targetFilter = failedTasks.length > 0 ? 'failed' : 'all';
      const failureDetails = failedTasks.map((task) => ({
        taskId: task.task_id,
        filename: task.filename,
        path: task.path,
        reason: formatVfsErrorMessage(t, task.error_message) ?? t('vfs.feedback.errors.generic_failed'),
      }));

      return [
        {
          id: `batch:${batch.batchId}`,
          kind: failedTasks.length > 0 ? 'error' : 'success',
          title: t('vfs.feedback.batch_summary_title'),
          description:
            failedTasks.length > 0
              ? t('vfs.feedback.batch_summary_mixed_description', {
                  total: batch.itemCount,
                  success: successCount,
                  failed: failedTasks.length,
                })
              : t('vfs.feedback.batch_summary_success_description', {
                  total: batch.itemCount,
                }),
          actionLabel: failedTasks.length > 0 ? t('vfs.feedback.click_view_failed') : t('vfs.feedback.click_view_queue'),
          targetTaskId,
          clickable: Boolean(targetTaskId),
          targetFilter,
          failureDetails: failureDetails.length > 0 ? failureDetails : undefined,
        },
      ];
    });

    if (nextSummaryToasts.length === 0) {
      return;
    }

    setToasts((current) => [...nextSummaryToasts, ...current].slice(0, 6));
    const timers = nextSummaryToasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 5200),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeTasks, historyMap, t, transferBatches]);

  const desktopSummary = useMemo(() => {
    if (!desktopDropState?.active) {
      return null;
    }
    return t('vfs.feedback.drop_items_summary', {
      count: desktopDropState.totalCount,
      dirs: desktopDropState.directoryCount,
      files: desktopDropState.fileCount,
    });
  }, [desktopDropState, t]);

  return (
    <>
      {panelErrorMessage ? (
        <div className="border-b border-[var(--app-border-danger)] bg-[var(--app-bg-danger-soft)] px-4 py-3 text-sm text-[var(--app-error)]">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">{t('vfs.feedback.panel_error_title')}</div>
              <div className="mt-1 break-words text-[var(--app-text-base)]/90">
                {formatVfsErrorMessage(t, panelErrorMessage)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end p-4">
        <div className="flex w-full max-w-[420px] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() => {
                if (toast.failureDetails?.length) {
                  setFailurePanel({
                    title: t('vfs.feedback.failure_panel_title', { count: toast.failureDetails.length }),
                    items: toast.failureDetails,
                  });
                  setFailureReasonFilter(null);
                } else {
                  setFailurePanel(null);
                  setFailureReasonFilter(null);
                }
                if (toast.clickable && toast.targetTaskId) {
                  onLocateTask?.(toast.targetTaskId, { recentFilter: toast.targetFilter ?? 'all' });
                }
              }}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && toast.clickable && toast.targetTaskId) {
                  event.preventDefault();
                  if (toast.failureDetails?.length) {
                    setFailurePanel({
                      title: t('vfs.feedback.failure_panel_title', { count: toast.failureDetails.length }),
                      items: toast.failureDetails,
                    });
                    setFailureReasonFilter(null);
                  } else {
                    setFailurePanel(null);
                    setFailureReasonFilter(null);
                  }
                  onLocateTask?.(toast.targetTaskId, { recentFilter: toast.targetFilter ?? 'all' });
                }
              }}
              role={toast.clickable ? 'button' : undefined}
              tabIndex={toast.clickable ? 0 : -1}
              className={`pointer-events-auto rounded-[18px] border px-4 py-3 shadow-[var(--app-shadow-elevated)] backdrop-blur-sm ${
                toast.kind === 'success'
                  ? 'border-[rgba(76,175,80,0.32)] bg-[rgba(11,24,18,0.92)]'
                  : 'border-[rgba(255,92,92,0.32)] bg-[rgba(28,12,14,0.94)]'
              } ${toast.clickable ? 'cursor-pointer text-left transition hover:scale-[1.01] hover:border-[var(--app-border-strong)]' : 'text-left'}`}
            >
              <div className="flex items-start gap-3">
                {toast.kind === 'success' ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--app-success)]" />
                ) : (
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--app-error)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">{toast.title}</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{toast.description}</div>
                  {toast.clickable && toast.actionLabel ? (
                    <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/90">
                      <span>{toast.actionLabel}</span>
                      <ArrowRight size={12} />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setToasts((current) => current.filter((item) => item.id !== toast.id));
                  }}
                  className="rounded p-1 text-[var(--app-text-soft)] transition hover:bg-white/10 hover:text-white"
                  aria-label={t('vfs.feedback.dismiss')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
          {failurePanel ? (
            <div className="pointer-events-auto rounded-[20px] border border-[rgba(255,92,92,0.24)] bg-[rgba(22,10,12,0.96)] p-4 shadow-[var(--app-shadow-elevated)] backdrop-blur-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{failurePanel.title}</div>
                  <div className="mt-1 text-xs text-[var(--app-text-muted)]">
                    {t('vfs.feedback.failure_panel_subtitle')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFailurePanel(null);
                    setFailureReasonFilter(null);
                  }}
                  className="rounded p-1 text-[var(--app-text-soft)] transition hover:bg-white/10 hover:text-white"
                  aria-label={t('vfs.feedback.dismiss')}
                >
                  <X size={14} />
                </button>
              </div>
              {copiedHint ? (
                <div className="mt-2 rounded-full border border-[rgba(68,150,255,0.18)] bg-[rgba(68,150,255,0.08)] px-2.5 py-1 text-[11px] text-[var(--app-text-base)]">
                  {copiedHint}
                </div>
              ) : null}
              {failureSummary.length > 0 ? (
                <div className="mt-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-soft)]">
                    {t('vfs.feedback.failure_reason_groups')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFailureReasonFilter(null)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        failureReasonFilter === null
                          ? 'border-[rgba(68,150,255,0.28)] bg-[rgba(68,150,255,0.14)] text-white'
                          : 'border-[rgba(255,255,255,0.08)] bg-white/5 text-[var(--app-text-base)] hover:border-[rgba(68,150,255,0.18)]'
                      }`}
                    >
                      {t('vfs.feedback.failure_reason_all')}
                    </button>
                    {failureSummary.map((item) => (
                      <button
                        key={`${item.reason}-${item.count}`}
                        type="button"
                        onClick={() =>
                          setFailureReasonFilter((current) => (current === item.reason ? null : item.reason))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          failureReasonFilter === item.reason
                            ? 'border-[rgba(68,150,255,0.28)] bg-[rgba(68,150,255,0.14)] text-white'
                            : 'border-[rgba(255,255,255,0.08)] bg-white/5 text-[var(--app-text-base)] hover:border-[rgba(68,150,255,0.18)]'
                        }`}
                      >
                        {t('vfs.feedback.failure_reason_group_item', {
                          reason: item.reason,
                          count: item.count,
                        })}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 max-h-[220px] overflow-auto">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--app-text-soft)]">
                  {t('vfs.feedback.failure_detail_list')}
                </div>
                <div className="flex flex-col gap-2">
                  {filteredFailureItems.length > 0 ? (
                    filteredFailureItems.map((item) => (
                    <div
                      key={item.taskId}
                      className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-white/5 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onLocateTask?.(item.taskId, { recentFilter: 'failed' });
                        }}
                        className="w-full text-left transition hover:text-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white">{item.filename}</div>
                            <div className="mt-1 break-all text-[11px] leading-5 text-[var(--app-text-soft)]">
                              {t('vfs.feedback.failure_path_label', { path: item.path })}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{item.reason}</div>
                          </div>
                          <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/85">
                            {t('vfs.feedback.click_view_failed')}
                          </div>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(item.reason);
                              setCopiedHint(t('vfs.feedback.copied_error_reason'));
                            } catch (error) {
                              console.warn('Failed to copy error reason', error);
                            }
                          }}
                          className="rounded-full border border-[rgba(255,255,255,0.08)] bg-white/5 px-2.5 py-1 text-[11px] text-[var(--app-text-base)] transition hover:border-[rgba(68,150,255,0.18)]"
                        >
                          {t('vfs.feedback.copy_error_reason')}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(item.path);
                              setCopiedHint(t('vfs.feedback.copied_failure_path'));
                            } catch (error) {
                              console.warn('Failed to copy failure path', error);
                            }
                          }}
                          className="rounded-full border border-[rgba(255,255,255,0.08)] bg-white/5 px-2.5 py-1 text-[11px] text-[var(--app-text-base)] transition hover:border-[rgba(68,150,255,0.18)]"
                        >
                          {t('vfs.feedback.copy_failure_path')}
                        </button>
                      </div>
                    </div>
                    ))
                  ) : (
                    <div className="rounded border border-dashed border-[var(--app-border)] bg-[var(--app-bg-panel)] px-3 py-4 text-sm text-[var(--app-text-soft)]">
                      {t('vfs.feedback.no_failure_items_for_reason')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {desktopDropState?.active ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-8">
          <div
            className={`w-full max-w-[420px] rounded-[24px] border px-5 py-4 text-center shadow-[var(--app-shadow-elevated)] backdrop-blur-md ${
              desktopDropState.insideTarget
                ? 'border-[rgba(68,150,255,0.45)] bg-[rgba(8,18,34,0.86)]'
                : 'border-[var(--app-border-strong)] bg-[rgba(8,12,20,0.82)]'
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-white">
              {desktopDropState.insideTarget ? (
                <FolderTree size={18} className="text-[var(--app-primary)]" />
              ) : (
                <MousePointerSquareDashed size={18} className="text-[var(--app-text-soft)]" />
              )}
              <span>
                {desktopDropState.insideTarget
                  ? t('vfs.feedback.drop_title_ready')
                  : t('vfs.feedback.drop_title_idle')}
              </span>
            </div>
            <div className="mt-2 text-xs text-[var(--app-text-muted)]">{desktopSummary}</div>
            <div
              className={`mt-3 rounded-[16px] border px-3 py-2 text-xs ${
                desktopDropState.insideTarget
                  ? 'border-[rgba(68,150,255,0.3)] bg-[rgba(68,150,255,0.08)] text-[var(--app-text-base)]'
                  : 'border-[var(--app-border)] bg-[var(--app-bg-panel)] text-[var(--app-text-soft)]'
              }`}
            >
              {desktopDropState.insideTarget
                ? t('vfs.feedback.drop_target_ready', { path: desktopDropState.targetPath })
                : t('vfs.feedback.drop_target_idle')}
            </div>
          </div>
        </div>
      ) : draggingPayload ? (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--app-border-strong)] bg-[rgba(8,12,20,0.94)] px-4 py-2 text-sm text-white shadow-[var(--app-shadow-elevated)]">
          {t('vfs.dragging_badge', { count: draggingPayload.count })}
        </div>
      ) : null}
    </>
  );
}
