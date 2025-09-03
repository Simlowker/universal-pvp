'use client';

import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-950 text-white flex items-center justify-center p-8">
          <div className="max-w-2xl mx-auto text-center">
            <h1 className="text-3xl font-bold text-red-400 mb-4">Application Error</h1>
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold mb-2">Error Details:</h2>
              <p className="text-red-300 font-mono text-sm break-all mb-4">
                {this.state.error?.message}
              </p>
              <details className="text-left">
                <summary className="cursor-pointer text-red-400 hover:text-red-300">
                  Stack Trace
                </summary>
                <pre className="mt-2 text-xs text-red-200 overflow-auto">
                  {this.state.error?.stack}
                </pre>
              </details>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}