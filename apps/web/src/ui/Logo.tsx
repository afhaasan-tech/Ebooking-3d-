/** Original Ebooking Ticket mark: a ticket outline with a stage arch and a spotlight dot. */
export function LogoMark({ size = 32, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={`logo-mark ${animated ? 'logo-anim' : ''}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path className="ticket" d="M14 18h36a4 4 0 0 1 4 4v6a4 4 0 0 0 0 8v6a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-6a4 4 0 0 0 0-8v-6a4 4 0 0 1 4-4z" fill="none" stroke="var(--gold)" strokeWidth="3" />
      <path d="M24 40V28a8 8 0 0 1 16 0v12" fill="none" stroke="var(--ivory)" strokeWidth="3" strokeLinecap="round" />
      <circle className="spot" cx="32" cy="34" r="2.6" fill="var(--gold-2)" />
    </svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
      <LogoMark size={size} />
      <span className="wordmark-text" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: size * 0.62, color: 'var(--ivory)', letterSpacing: 0.3, direction: 'ltr', whiteSpace: 'nowrap' }}>
        Ebooking<span style={{ color: 'var(--gold)' }}> Ticket</span>
      </span>
    </span>
  );
}

export function LoadingLogo({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', gap: 12, padding: 48 }}>
      <LogoMark size={56} animated />
      <span className="muted small">{label}</span>
    </div>
  );
}
