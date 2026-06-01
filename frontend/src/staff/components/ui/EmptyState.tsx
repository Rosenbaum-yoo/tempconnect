/**
 * EmptyState — SCC WAVE 04
 * Einheitlicher Empty-State fuer alle SCC-Module.
 * Verhindert leere Seiten ohne Kontext.
 *
 * Usage:
 *   <EmptyState message="Keine offenen Anfragen." />
 *   <EmptyState message="Keine Daten." hint="Filter zuruecksetzen oder spaeter erneut pruefen." />
 */

interface EmptyStateProps {
  message?: string;
  hint?: string;
}

export function EmptyState({
  message = "Keine Einträge vorhanden.",
  hint,
}: EmptyStateProps) {
  return (
    <div className="scc-empty-state" role="status" aria-label={message}>
      <div className="scc-empty-state__msg">{message}</div>
      {hint && <div className="scc-empty-state__hint">{hint}</div>}
    </div>
  );
}
