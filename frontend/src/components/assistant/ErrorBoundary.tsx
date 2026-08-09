import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the default card; receives the error so callers can render inline. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  label: string;
}

interface ErrorBoundaryState {
  error?: Error;
}

/**
 * Without this, a render error anywhere in the conversation unmounts the whole React tree and
 * the tool window goes blank with no way back. Failing loudly but locally keeps the rest of the
 * assistant usable and, more importantly, shows what actually broke.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[capybara] ${this.props.label} 渲染失败`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: undefined });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="m-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
        <div className="flex items-start gap-2 text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{this.props.label}渲染失败</p>
            <p className="mt-1 break-words font-mono text-[10px] opacity-80">{error.message}</p>
          </div>
        </div>
        <Button className="mt-2" onClick={this.reset} size="sm" type="button" variant="outline">
          <RotateCcw className="size-3.5" />
          重试渲染
        </Button>
      </div>
    );
  }
}
