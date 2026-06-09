import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useGlobalLoadingStore } from '../store/globalLoadingStore';

export function GlobalLoadingOverlay() {
  const { t } = useTranslation();
  const requests = useGlobalLoadingStore((state) => state.requests);

  const activeRequest = useMemo(
    () => (requests.length > 0 ? requests[requests.length - 1] : null),
    [requests],
  );
  const pendingCount = Math.max(0, requests.length - 1);

  if (!activeRequest) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(3,6,16,0.62)] backdrop-blur-[4px]" />
      <div className="relative mx-4 flex w-full max-w-[340px] flex-col items-center rounded-[26px] border border-[rgba(85,199,194,0.16)] bg-[linear-gradient(180deg,rgba(12,16,32,0.96),rgba(15,23,42,0.98))] px-8 py-8 text-center shadow-[0_24px_80px_rgba(3,6,16,0.48)]">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-[rgba(85,199,194,0.18)] bg-[radial-gradient(circle,rgba(85,199,194,0.14),transparent_68%)]" />
          <span className="absolute inset-[8px] animate-pulse rounded-full border border-[rgba(90,140,255,0.2)]" />
          <span className="absolute inset-[16px] rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] shadow-[0_10px_24px_rgba(85,199,194,0.16)]">
            <img
              src="/foconn-logo.png"
              alt="Foconn logo"
              className="h-11 w-11 animate-[spin_3.2s_linear_infinite] rounded-full object-cover"
            />
          </span>
        </div>
        <div className="mt-5 text-lg font-semibold text-white">
          {activeRequest.message ?? t('loading.default_title')}
        </div>
        <div className="mt-2 text-sm text-[var(--app-text-muted)]">
          {activeRequest.detail ?? t('loading.default_detail')}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--app-text-soft)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--app-primary)]" />
          <span>{t('loading.brand_caption')}</span>
        </div>
        {pendingCount > 0 ? (
          <div className="mt-4 rounded-full border border-[rgba(90,140,255,0.14)] bg-[rgba(90,140,255,0.06)] px-3 py-1 text-xs text-[var(--app-text-muted)]">
            {t('loading.parallel_tasks', { count: pendingCount })}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
