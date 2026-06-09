import { Bookmark, Eye, EyeOff, Home, RotateCcw, Search, TerminalSquare, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export type QuickToolMenuIcon = 'search' | 'terminal' | 'bookmark' | 'home' | 'reset' | 'eye' | 'eye_off' | 'tools' | 'hide';

export interface QuickToolMenuItem {
  id: string;
  label: string;
  icon: QuickToolMenuIcon;
  action: () => void;
}

interface QuickToolMenuProps {
  isOpen: boolean;
  anchor: { x: number; y: number } | null;
  items: QuickToolMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 220;
const MENU_GAP = 12;
const MENU_ICON_MAP: Record<QuickToolMenuIcon, LucideIcon> = {
  search: Search,
  terminal: TerminalSquare,
  bookmark: Bookmark,
  home: Home,
  reset: RotateCcw,
  eye: Eye,
  eye_off: EyeOff,
  tools: Wrench,
  hide: EyeOff,
};

function getMenuPosition(anchor: { x: number; y: number }, itemCount: number) {
  const estimatedHeight = 62 + itemCount * 44;
  const placeLeft = anchor.x + MENU_WIDTH + MENU_GAP > window.innerWidth - MENU_GAP;
  const placeAbove = anchor.y + estimatedHeight + MENU_GAP > window.innerHeight - MENU_GAP;

  const left = placeLeft ? anchor.x - MENU_WIDTH - MENU_GAP : anchor.x + MENU_GAP;
  const top = placeAbove ? anchor.y - estimatedHeight - MENU_GAP : anchor.y + MENU_GAP;

  return {
    left: Math.min(Math.max(left, MENU_GAP), window.innerWidth - MENU_WIDTH - MENU_GAP),
    top: Math.min(Math.max(top, MENU_GAP), window.innerHeight - estimatedHeight - MENU_GAP),
  };
}

export function QuickToolMenu({ isOpen, anchor, items, onClose }: QuickToolMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const position = useMemo(() => {
    if (!anchor) {
      return null;
    }
    return getMenuPosition(anchor, items.length);
  }, [anchor, items.length]);

  if (!isOpen || !anchor || !position) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[145] min-w-[220px] overflow-hidden rounded-[18px] border border-[var(--app-border-strong)] bg-[rgba(12,16,32,0.96)] p-1.5 shadow-[var(--app-shadow-elevated)] backdrop-blur-[14px]"
      style={{
        left: position.left,
        top: position.top,
        width: MENU_WIDTH,
      }}
    >
      <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--app-text-soft)]">
        {t('floating_ball.quick_actions')}
      </div>
      {items.map((item) => {
        const Icon = MENU_ICON_MAP[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              item.action();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm text-[var(--app-text-base)] transition hover:bg-[var(--app-bg-hover)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.04)] text-[var(--app-text-soft)]">
              <Icon size={14} />
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
        );
      })}
      <div className="px-3 pb-2 pt-1 text-[11px] text-[var(--app-text-soft)]">
        {t('floating_ball.menu_hint')}
      </div>
    </div>,
    document.body,
  );
}
