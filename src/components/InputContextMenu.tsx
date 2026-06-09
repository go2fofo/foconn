import { Scissors, Copy, ClipboardPaste, ScanSearch } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

type EditableTarget = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  target: EditableTarget;
  anchor: { x: number; y: number };
}

const MENU_WIDTH = 220;
const MENU_GAP = 12;

function isEditableTarget(target: EventTarget | null): target is EditableTarget {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function getMenuPosition(anchor: { x: number; y: number }, itemCount: number) {
  const estimatedHeight = 16 + itemCount * 42;
  const placeLeft = anchor.x + MENU_WIDTH + MENU_GAP > window.innerWidth - MENU_GAP;
  const placeAbove = anchor.y + estimatedHeight + MENU_GAP > window.innerHeight - MENU_GAP;

  const left = placeLeft ? anchor.x - MENU_WIDTH - MENU_GAP : anchor.x + MENU_GAP;
  const top = placeAbove ? anchor.y - estimatedHeight - MENU_GAP : anchor.y + MENU_GAP;

  return {
    left: Math.min(Math.max(left, MENU_GAP), window.innerWidth - MENU_WIDTH - MENU_GAP),
    top: Math.min(Math.max(top, MENU_GAP), window.innerHeight - estimatedHeight - MENU_GAP),
  };
}

function dispatchInputEvent(target: EditableTarget) {
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

export function InputContextMenu() {
  const { t } = useTranslation();
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) {
        return;
      }
      if (event.target.disabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.target.focus();
      setMenuState({
        target: event.target,
        anchor: { x: event.clientX, y: event.clientY },
      });
    };

    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuState(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuState(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  const selection = useMemo(() => {
    if (!menuState) {
      return { start: 0, end: 0, text: '', hasSelection: false };
    }

    const start = menuState.target.selectionStart ?? 0;
    const end = menuState.target.selectionEnd ?? 0;
    return {
      start,
      end,
      text: menuState.target.value.slice(start, end),
      hasSelection: end > start,
    };
  }, [menuState]);

  if (!menuState) {
    return null;
  }

  const { target, anchor } = menuState;
  const position = getMenuPosition(anchor, 4);
  const isReadOnly = target.readOnly;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[150] min-w-[220px] overflow-hidden rounded-[18px] border border-[var(--app-border-strong)] bg-[rgba(12,16,32,0.96)] p-1.5 shadow-[var(--app-shadow-elevated)] backdrop-blur-[14px]"
      style={{
        left: position.left,
        top: position.top,
        width: MENU_WIDTH,
      }}
    >
      {[
        {
          id: 'cut',
          label: t('context_menu.cut'),
          icon: Scissors,
          disabled: !selection.hasSelection || isReadOnly,
          action: async () => {
            await navigator.clipboard.writeText(selection.text);
            target.setRangeText('', selection.start, selection.end, 'start');
            dispatchInputEvent(target);
          },
        },
        {
          id: 'copy',
          label: t('context_menu.copy'),
          icon: Copy,
          disabled: !selection.hasSelection,
          action: async () => {
            await navigator.clipboard.writeText(selection.text);
          },
        },
        {
          id: 'paste',
          label: t('context_menu.paste'),
          icon: ClipboardPaste,
          disabled: isReadOnly,
          action: async () => {
            const text = await navigator.clipboard.readText();
            const start = target.selectionStart ?? target.value.length;
            const end = target.selectionEnd ?? start;
            target.setRangeText(text, start, end, 'end');
            dispatchInputEvent(target);
          },
        },
        {
          id: 'select-all',
          label: t('context_menu.select_all'),
          icon: ScanSearch,
          disabled: target.value.length === 0,
          action: () => {
            target.focus();
            target.select();
          },
        },
      ].map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            void item.action();
            setMenuState(null);
          }}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm text-[var(--app-text-base)] transition hover:bg-[var(--app-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,255,255,0.04)] text-[var(--app-text-soft)]">
            <item.icon size={14} />
          </span>
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
