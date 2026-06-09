import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface FoconnPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  placement?: 'bottom-start' | 'bottom-end' | 'center';
  className?: string;
  blurOverlay?: boolean;
  children: ReactNode;
}

export function FoconnPopover({
  isOpen,
  onClose,
  triggerRef,
  placement = 'center',
  className = '',
  blurOverlay = true,
  children,
}: FoconnPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, onClose]);

  const panelStyle = useMemo(() => {
    if (!triggerRef?.current || placement === 'center') {
      return undefined;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 8,
      left: placement === 'bottom-end' ? Math.max(rect.right - 1120, 16) : Math.max(rect.left - 320, 16),
    };
  }, [placement, triggerRef, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className={`absolute inset-0 ${
          placement === 'center' ? 'bg-black/40' : blurOverlay ? 'bg-black/10' : 'bg-transparent'
        } ${blurOverlay ? 'backdrop-blur-sm' : ''}`}
      />
      <div
        ref={panelRef}
        style={panelStyle}
        className={[
          'absolute overflow-hidden rounded-[24px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] shadow-[var(--app-shadow-elevated)]',
          'transition-all duration-150 ease-out animate-in fade-in zoom-in-95',
          placement === 'center'
            ? 'left-1/2 top-1/2 h-[80vh] w-[80vw] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2'
            : 'w-[1120px] max-w-[calc(100vw-32px)]',
          className,
        ].join(' ')}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
