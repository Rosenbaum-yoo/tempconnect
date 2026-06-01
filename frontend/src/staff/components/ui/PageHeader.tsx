/**
 * PageHeader — SCC WAVE 04
 * Einheitlicher Modul-Header fuer alle SCC-Bereiche.
 * Ersetzt inline scc-section__header + scc-section__title Markup.
 *
 * Usage:
 *   <PageHeader
 *     title="Commercial Inbox"
 *     subtitle="Vereinte Sicht: Public Enterprise Requests + Subscription-Anfragen"
 *     actions={<button ...>Neu laden</button>}
 *   />
 */

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optionale Aktions-Buttons rechts neben dem Titel */
  actions?: ReactNode;
  /** HTML id fuer aria-labelledby in umgebenden Sections */
  id?: string;
}

export function PageHeader({ title, subtitle, actions, id }: PageHeaderProps) {
  return (
    <div className="scc-section__header">
      <div>
        <h1 className="scc-section__title" id={id}>{title}</h1>
        {subtitle && <div className="scc-section__sub">{subtitle}</div>}
      </div>
      {actions && <div className="scc-page-header__actions">{actions}</div>}
    </div>
  );
}
