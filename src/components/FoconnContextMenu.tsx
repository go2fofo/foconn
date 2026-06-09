import {
  Clipboard,
  ClipboardPaste,
  Copy,
  Download,
  FileInput,
  FolderPlus,
  RefreshCw,
  ScanSearch,
  Scissors,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cloneElement, isValidElement, type MouseEvent as ReactMouseEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  type?: 'item' | 'separator';
  id?: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  action?: () => void;
}

interface FoconnContextMenuProps {
  items: ContextMenuItem[] | (() => ContextMenuItem[]);
  children: ReactElement<Record<string, unknown>>;
  onBeforeOpen?: (event: ReactMouseEvent) => void;
}

const ICON_MAP: Record<string, LucideIcon> = {
  CopyIcon: Copy,
  ClipboardIcon: Clipboard,
  PasteIcon: ClipboardPaste,
  SelectIcon: ScanSearch,
  TrashIcon: Trash2,
  RefreshCwIcon: RefreshCw,
  UploadIcon: FileInput,
  DownloadIcon: Download,
  FolderPlusIcon: FolderPlus,
  ScissorsIcon: Scissors,
};

export function FoconnContextMenu({
  items,
  children,
  onBeforeOpen,
}: FoconnContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const resolvedItems = useMemo(
    () => (typeof items === 'function' ? items() : items),
    [items],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isValidElement(children)) {
    return null;
  }

  const originalOnContextMenu = children.props.onContextMenu as ((event: ReactMouseEvent) => void) | undefined;

  const wrappedChild = cloneElement(children, {
    onContextMenu: (event: ReactMouseEvent) => {
      originalOnContextMenu?.(event);
      event.preventDefault();
      event.stopPropagation();
      onBeforeOpen?.(event);
      setPosition({ x: event.clientX, y: event.clientY });
      setIsOpen(true);
    },
  });

  return (
    <>
      {wrappedChild}
      {isOpen
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[140] min-w-[220px] overflow-hidden rounded-[18px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-1.5 shadow-[var(--app-shadow-elevated)]"
              style={{
                left: Math.min(position.x, window.innerWidth - 236),
                top: Math.min(position.y, window.innerHeight - 320),
              }}
            >
              {resolvedItems.map((item, index) => {
                if (item.type === 'separator') {
                  return <div key={`separator-${index}`} className="my-1 h-px bg-[var(--app-border)]" />;
                }

                const Icon = item.icon ? ICON_MAP[item.icon] : null;
                return (
                  <button
                    key={item.id ?? `item-${index}`}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      item.action?.();
                      setIsOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left text-sm text-[var(--app-text-base)] transition hover:bg-[var(--app-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex w-4 shrink-0 justify-center text-[var(--app-text-soft)]">
                      {Icon ? <Icon size={14} /> : null}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut ? (
                      <span className="text-[11px] text-[var(--app-text-soft)]">{item.shortcut}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
