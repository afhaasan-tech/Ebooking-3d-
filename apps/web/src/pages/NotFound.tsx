import { Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="container page" style={{ textAlign: 'center' }}>
      <h1>404</h1>
      <p className="muted">{t('الصفحة غير موجودة.', 'Page not found.')}</p>
      <Link className="btn btn-primary" to="/">{t('الرئيسية', 'Home')}</Link>
    </div>
  );
}
