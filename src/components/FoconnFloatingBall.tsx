import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface FoconnFloatingBallProps {
  onClick: () => void;
  onOpenContextMenu: (anchor: { x: number; y: number }) => void;
}

const FLOATING_BALL_STORAGE_KEY = 'foconn:floating-ball-position';
const BALL_SIZE = 46;
const EDGE_GAP = 10;
const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 1000;
const EDGE_GUIDE_THRESHOLD = 18;

function clampPosition(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, EDGE_GAP), window.innerWidth - BALL_SIZE - EDGE_GAP),
    y: Math.min(Math.max(y, EDGE_GAP), window.innerHeight - BALL_SIZE - EDGE_GAP),
  };
}

function getDefaultPosition() {
  return clampPosition(
    window.innerWidth - BALL_SIZE - EDGE_GAP,
    Math.max(window.innerHeight * 0.28, EDGE_GAP),
  );
}

function readStoredPosition() {
  try {
    const raw = window.localStorage.getItem(FLOATING_BALL_STORAGE_KEY);
    if (!raw) {
      return getDefaultPosition();
    }
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return getDefaultPosition();
    }
    return clampPosition(parsed.x, parsed.y);
  } catch {
    return getDefaultPosition();
  }
}

function persistPosition(position: { x: number; y: number }) {
  window.localStorage.setItem(FLOATING_BALL_STORAGE_KEY, JSON.stringify(position));
}

export function FoconnFloatingBall({ onClick, onOpenContextMenu }: FoconnFloatingBallProps) {
  const { t } = useTranslation();
  const [position, setPosition] = useState(readStoredPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [edgeGuides, setEdgeGuides] = useState({
    left: false,
    right: false,
    top: false,
    bottom: false,
  });
  const positionRef = useRef(position);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const isPressingRef = useRef(false);
  const isDragActivatedRef = useRef(false);
  const pressStartedAtRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const hasPointerMovedRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearCountdownTimer = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        const next = clampPosition(current.x, current.y);
        persistPosition(next);
        return next;
      });
    };
    const handleResetPosition = () => {
      const next = getDefaultPosition();
      setPosition(next);
      persistPosition(next);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('foconn:reset-floating-ball-position', handleResetPosition as EventListener);
    return () => {
      clearLongPressTimer();
      clearCountdownTimer();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('foconn:reset-floating-ball-position', handleResetPosition as EventListener);
    };
  }, []);

  const floatingStyle = useMemo(() => {
    return {
      left: position.x,
      top: position.y,
      opacity: isHovering || isDragging ? 0.96 : 0.72,
      transition: isDragging ? 'none' : 'opacity 0.18s ease-out, box-shadow 0.18s ease-out',
    };
  }, [isDragging, isHovering, position.x, position.y]);

  const tooltipVisible = (isHovering || countdownMs !== null) && !isDragging;
  const tooltipLabel =
    countdownMs !== null
      ? t('floating_ball.drag_countdown', { seconds: Math.max(0, countdownMs / 1000).toFixed(1) })
      : t('floating_ball.drag_hint', { count: 1 });

  const startDrag = (clientX: number, clientY: number) => {
    clearLongPressTimer();
    clearCountdownTimer();
    setCountdownMs(null);
    isDragActivatedRef.current = true;
    setIsDragging(true);
    dragOffsetRef.current = {
      x: clientX - positionRef.current.x,
      y: clientY - positionRef.current.y,
    };
  };

  const finishInteraction = (pointerId?: number) => {
    clearLongPressTimer();
    clearCountdownTimer();
    setCountdownMs(null);
    if (pointerId !== undefined && activePointerIdRef.current === pointerId) {
      activePointerIdRef.current = null;
    }
    pressStartedAtRef.current = null;
    isPressingRef.current = false;
    if (isDragActivatedRef.current) {
      isDragActivatedRef.current = false;
      setIsDragging(false);
      setEdgeGuides({ left: false, right: false, top: false, bottom: false });
      persistPosition(positionRef.current);
      return;
    }
    hasPointerMovedRef.current = false;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    isPressingRef.current = true;
    suppressClickRef.current = false;
    isDragActivatedRef.current = false;
    hasPointerMovedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    pressStartedAtRef.current = window.performance.now();
    setCountdownMs(LONG_PRESS_MS);
    clearLongPressTimer();
    clearCountdownTimer();
    countdownTimerRef.current = window.setInterval(() => {
      if (!isPressingRef.current || isDragActivatedRef.current || pressStartedAtRef.current === null) {
        clearCountdownTimer();
        return;
      }

      const elapsed = window.performance.now() - pressStartedAtRef.current;
      const remaining = Math.max(0, LONG_PRESS_MS - elapsed);
      setCountdownMs(remaining);
    }, 100);
    longPressTimerRef.current = window.setTimeout(() => {
      if (!isPressingRef.current || activePointerIdRef.current !== event.pointerId || isDragActivatedRef.current) {
        return;
      }
      suppressClickRef.current = true;
      setIsHovering(true);
      startDrag(lastPointerRef.current.x, lastPointerRef.current.y);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    const deltaX = event.clientX - pointerStartRef.current.x;
    const deltaY = event.clientY - pointerStartRef.current.y;

    if (!isDragActivatedRef.current) {
      if (Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) {
        hasPointerMovedRef.current = true;
      }
      return;
    }

    const next = clampPosition(
      event.clientX - dragOffsetRef.current.x,
      event.clientY - dragOffsetRef.current.y,
    );
    setPosition(next);
    setEdgeGuides({
      left: next.x <= EDGE_GAP + EDGE_GUIDE_THRESHOLD,
      right: next.x >= window.innerWidth - BALL_SIZE - EDGE_GAP - EDGE_GUIDE_THRESHOLD,
      top: next.y <= EDGE_GAP + EDGE_GUIDE_THRESHOLD,
      bottom: next.y >= window.innerHeight - BALL_SIZE - EDGE_GAP - EDGE_GUIDE_THRESHOLD,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishInteraction(event.pointerId);
  };

  return createPortal(
    <>
      {isDragging ? (
        <>
          {edgeGuides.left ? (
            <span className="pointer-events-none fixed bottom-6 left-3 top-6 z-[128] w-px bg-[linear-gradient(180deg,transparent,rgba(85,199,194,0.45),transparent)]" />
          ) : null}
          {edgeGuides.right ? (
            <span className="pointer-events-none fixed bottom-6 right-3 top-6 z-[128] w-px bg-[linear-gradient(180deg,transparent,rgba(85,199,194,0.45),transparent)]" />
          ) : null}
          {edgeGuides.top ? (
            <span className="pointer-events-none fixed left-6 right-6 top-3 z-[128] h-px bg-[linear-gradient(90deg,transparent,rgba(85,199,194,0.45),transparent)]" />
          ) : null}
          {edgeGuides.bottom ? (
            <span className="pointer-events-none fixed bottom-3 left-6 right-6 z-[128] h-px bg-[linear-gradient(90deg,transparent,rgba(85,199,194,0.45),transparent)]" />
          ) : null}
        </>
      ) : null}
      {tooltipVisible ? (
        <span
          className="pointer-events-none fixed z-[131] rounded-full border border-[rgba(85,199,194,0.16)] bg-[rgba(8,12,22,0.92)] px-3 py-1.5 text-[11px] text-[var(--app-text-base)] shadow-[0_10px_28px_rgba(3,6,16,0.32)]"
          style={{
            left: position.x + BALL_SIZE / 2,
            top: Math.max(position.y - 40, EDGE_GAP),
            transform: 'translateX(-50%)',
          }}
        >
          {tooltipLabel}
        </span>
      ) : null}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = true;
          onOpenContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onMouseEnter={() => {
          setIsHovering(true);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
        }}
        onClick={() => {
          if (!isDragging && !suppressClickRef.current && !hasPointerMovedRef.current) {
            onClick();
          }
          suppressClickRef.current = false;
          hasPointerMovedRef.current = false;
        }}
        className="fixed z-[130] flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-full border border-[rgba(85,199,194,0.12)] text-white backdrop-blur-[10px]"
        style={{
          ...floatingStyle,
          background: 'linear-gradient(135deg, rgba(9, 20, 38, 0.62), rgba(15, 23, 42, 0.76))',
          boxShadow: isHovering || isDragging
            ? '0 0 0 5px rgba(85, 199, 194, 0.08), 0 0 18px rgba(85, 199, 194, 0.16), 0 14px 32px rgba(3, 6, 16, 0.34)'
            : '0 10px 24px rgba(3, 6, 16, 0.28)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          touchAction: 'none',
        }}
        aria-label={t('floating_ball.aria_label')}
      >
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(85,199,194,0.1),transparent_60%)]" />
        <span className="absolute -inset-[4px] rounded-full border border-[rgba(85,199,194,0.12)]" />
        <span className="absolute inset-[4px] rounded-full border border-[rgba(90,140,255,0.1)]" />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))]">
          <img src="/foconn-logo.png" alt="Foconn logo" className="h-6 w-6 rounded-full object-cover" />
        </span>
      </button>
    </>,
    document.body,
  );
}
