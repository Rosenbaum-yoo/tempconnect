/**
 * ErrorBanner — SCC WAVE 04
 * Einheitliche Error-Anzeige in Modulen mit optionalem Retry-Button.
 * Ersetzt ad-hoc scc-error-inline Verwendungen bei API-Fehlern.
 *
 * Usage:
 *   <ErrorBanner message={err} onRetry={load} />
 *   <ErrorBanner message="Anfrage fehlgeschlagen." />
 */

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = "Erneut versuchen",
}: ErrorBannerProps) {
  return (
    <div className="scc-error-banner" role="alert">
      <span className="scc-error-banner__msg">{message}</span>
      {onRetry && (
        <button className="scc-btn scc-error-banner__retry" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
