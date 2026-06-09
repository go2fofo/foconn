import { KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface AppSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface AppSelectProps {
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AppSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className = '',
}: AppSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen((current) => !current);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleButtonKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] px-4 py-3 text-sm text-white outline-none transition hover:border-[var(--app-border-strong)] focus:border-[var(--app-primary)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedOption ? 'truncate text-left text-white' : 'truncate text-left text-[var(--app-text-soft)]'}>
          {selectedOption?.label ?? placeholder ?? ''}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--app-text-soft)] transition ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-64 overflow-y-auto rounded-[20px] border border-[var(--app-border-strong)] bg-[var(--app-bg-container)] p-2 shadow-[var(--app-shadow)]"
        >
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-[14px] px-3 py-3 text-left transition ${
                    isSelected
                      ? 'bg-[var(--app-bg-hover)] text-white'
                      : 'text-[var(--app-text-base)] hover:bg-[var(--app-bg-hover)]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{option.label}</span>
                    {option.description ? (
                      <span className="mt-1 block truncate text-xs text-[var(--app-text-soft)]">{option.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check size={16} className="mt-0.5 shrink-0 text-[var(--app-primary)]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
