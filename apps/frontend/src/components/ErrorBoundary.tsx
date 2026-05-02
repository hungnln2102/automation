import { Component, ErrorInfo, ReactNode } from 'react';
import { apiFetch } from '@/lib/api';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Report to backend for Telegram notification
    try {
      apiFetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: error?.stack,
          url: window.location.href,
          extra: errorInfo?.componentStack?.slice(0, 200),
        }),
      }).catch(() => {});
    } catch {
      // Never let error reporting break the app
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isDevelopment = import.meta.env?.DEV ?? false;

      return (
        <div className="error-boundary min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 p-4">
          <div className="error-boundary__container max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
            <div className="error-boundary__icon-wrap flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full mb-4">
              <svg
                className="error-boundary__icon w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="error-boundary__title text-2xl font-bold text-gray-900 text-center mb-2">
              Đã xảy ra lỗi
            </h1>
            <p className="error-boundary__message text-gray-600 text-center mb-6">
              Ứng dụng gặp sự cố không mong muốn. Vui lòng thử tải lại trang.
            </p>

            {isDevelopment && this.state.error && (
              <div className="error-boundary__details mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h2 className="text-sm font-semibold text-red-800 mb-2">
                  Chi tiết lỗi (Development Mode):
                </h2>
                <pre className="text-xs text-red-700 overflow-auto max-h-40 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <div className="error-boundary__actions flex gap-4 justify-center">
              <button
                onClick={this.handleReload}
                className="error-boundary__btn error-boundary__btn--reload px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Tải lại trang
              </button>
              <button
                onClick={() => window.history.back()}
                className="error-boundary__btn error-boundary__btn--back px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Quay lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
