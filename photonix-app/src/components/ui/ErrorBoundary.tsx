import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="text-sm font-medium text-red-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-xs text-neutral-400 mb-4">
              {this.state.error?.message ?? "An unexpected error occurred"}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded bg-neutral-700 px-4 py-1.5 text-xs text-neutral-200 hover:bg-neutral-600"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
