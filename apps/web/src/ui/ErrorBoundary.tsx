import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

function Fallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useI18n();
  // a lazily-loaded page chunk can disappear after a new deployment → a full reload fixes it
  const chunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
  return (
    <div className="container page">
      <div className="alert alert-danger" role="alert">
        <span aria-hidden style={{ fontSize: 22 }}>⚠</span>
        <div className="spacer">
          <strong>{t('صار خطأ غير متوقع في هذه الصفحة.', 'Something went wrong on this page.')}</strong>
          <div className="small">
            {chunk
              ? t('تم تحديث التطبيق. أعد تحميل الصفحة للمتابعة.', 'The app was updated. Reload the page to continue.')
              : t('حجوزاتك ومدفوعاتك محفوظة في الخادم ولم تتأثر.', 'Your bookings and payments are stored on the server and are not affected.')}
          </div>
        </div>
        {chunk ? (
          <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>{t('إعادة التحميل', 'Reload')}</button>
        ) : (
          <button className="btn btn-sm" onClick={onRetry}>{t('إعادة المحاولة', 'Try again')}</button>
        )}
      </div>
    </div>
  );
}

class Boundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error', error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    return this.state.error ? <Fallback error={this.state.error} onRetry={() => this.setState({ error: null })} /> : this.props.children;
  }
}

/** Contains a crash to the current page; navigating elsewhere resets it. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <Boundary resetKey={loc.pathname}>{children}</Boundary>;
}
