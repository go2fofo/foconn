import React from 'react';

interface CrashBoundaryProps {
  area: string;
  resetKey?: string;
  children: React.ReactNode;
}

interface CrashBoundaryState {
  error: Error | null;
}

export class CrashBoundary extends React.Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): CrashBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[CrashBoundary:${this.props.area}]`, error, info);
  }

  componentDidUpdate(prevProps: CrashBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-[var(--app-bg-base)] p-6">
          <div className="w-full max-w-3xl rounded-[24px] border border-[var(--app-border-danger)] bg-[var(--app-bg-panel)] p-5 text-left shadow-[var(--app-shadow)]">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--app-error)]">
              Render Error
            </div>
            <div className="mt-3 text-lg font-semibold text-white">
              {this.props.area} render failed
            </div>
            <div className="mt-2 text-sm text-[var(--app-text-muted)]">
              {this.state.error.message || 'Unknown render error'}
            </div>
            <pre className="mt-4 overflow-auto rounded-[18px] border border-[var(--app-border)] bg-[var(--app-bg-input)] p-4 text-xs leading-5 text-[var(--app-text-base)]">
              {this.state.error.stack || this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
