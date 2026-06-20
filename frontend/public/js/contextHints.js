/**
 * contextHints.js — Kontextuelles Guidance-System für TempConnect Demo-Modus
 *
 * Zeigt pro Seite einen dezenten, einklappbaren Hinweis-Banner mit
 * seitenspezifischen Informationen. Nur im Demo-Modus sichtbar.
 *
 * Features:
 * - Pathname-basierte Hint-Map (12 Plattformseiten + Vermittlung)
 * - Collapsible Banner (minimiert → Icon; expandiert → Text)
 * - localStorage-Dismiss pro Seite ("contextHint:<path>")
 * - Nur aktiv wenn body[data-demo="true"] oder window.__IS_DEMO
 */
;(function contextHints() {
  'use strict';

  /* ── Warte auf DOM ─────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    /* ── Sichtbarkeits-Gate ───────────────────────────────────
     * Demo: Guidance sofort. Sonst (zahlende Kunden): Guidance solange das
     * Onboarding nicht abgeschlossen ist (progress_pct < 100, nicht dismissed)
     * — Premium-Orientierung fuer Erstkunden, danach automatisch unsichtbar. */
    const isDemo =
      document.body.dataset.demo === 'true' ||
      window.__IS_DEMO === true ||
      document.querySelector('.demo-banner') !== null;
    if (isDemo) { run(); return; }
    fetch('/api/onboarding/status', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.success && d.data && !d.data.dismissed && d.data.progress_pct < 100) run();
      })
      .catch(function () { /* Guidance ist optional — still ignorieren */ });

    function run() {
    /* ── Pathname normalisieren ───────────────────────────── */
    const path = location.pathname
      .replace(/^\/public\//, '/')
      .replace(/\.html$/, '')
      .replace(/\/+$/, '') || '/';

    /* ── Hint-Map (Seite → { title, text, tip }) ─────────── */
    const HINTS = {
      '/enterprise': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Operations-Hub',
        text: 'Hier beginnt der Pilotkern von Angebot ueber Vermittlung und Deal bis Einsatz und Stundenzettel. Die Startseite priorisiert bewusst operative Module vor Ausbau- und Steuerungsbereichen.',
        tip: 'Tipp: Steigen Sie fuer Pilotkunden immer ueber Vermittlung, Arbeitsplatzangebote, Deals oder Einsaetze & Zeiten ein.'
      },
      '/capacity_exchange_feed': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Vermittlung',
        text: 'Hier wird verfügbares Personal, Angebote und Match-Chancen im offenen Feed gesteuert. Dieser Einstieg muss fuer die ersten Pilotkunden schnell, klar und reaktionsstark funktionieren.',
        tip: 'Tipp: Nutzen Sie Suche und Filter, um Arbeitsplatzangebote und verfügbares Personal direkt in belastbare Reaktionen zu ueberfuehren.'
      },
      '/capacity_exchange': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Vermittlung',
        text: 'Hier bieten Agenturen verfuegbare Fachkraefte an. Personal und Arbeitsplatzangebote treffen hier zusammen.',
        tip: 'Tipp: Nutzen Sie Skill-Tags und Radius-Filter, um gezielt passendes Personal zu finden.'
      },
      '/company_requests': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Arbeitsplatzangebote',
        text: 'Erstellen und verwalten Sie Personalanfragen fuer konkrete Arbeitsplatzangebote.',
        tip: 'Tipp: Notdienst- und dringende Anfragen lassen sich priorisiert in die Lieferantenansprache geben.'
      },
      '/requisitions': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Arbeitsplatzangebote',
        text: 'Strukturieren Sie Arbeitsplatzangebote mit Headcount, Starttermin, Dringlichkeit und Budget. Fuer Pilotkunden ist diese Seite einer der zentralen Mindestflows.',
        tip: 'Tipp: Verzahnen Sie Arbeitsplatzangebote mit Vermittlung, Lieferantensteuerung und Preisrahmen, um schneller zu belastbaren Angeboten zu kommen.'
      },
      '/deal_management': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Deals',
        text: 'Hier steuern Sie Angebote, Einsatzvereinbarungen und die naechsten operativen Schritte bis zur Aktivierung. Dealklarheit ist vor Pilotkunden nicht optional.',
        tip: 'Tipp: Nutzen Sie den Bereich als Bruecke vom Angebot zum laufenden Einsatz und halten Sie "wer ist dran" glasklar.'
      },
      '/worker-submissions-review': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Einsaetze & Zeiten',
        text: 'Dieser Bereich buendelt Einsatzkraefte, laufende Einsaetze, Freigaben und kundenseitige Stundenzettel-Prozesse. Genau hier muss operative Reife fuer Pilotkunden sichtbar werden.',
        tip: 'Tipp: Arbeiten Sie zuerst offene Einreichungen und Kundenfreigaben ab, danach erst Begleit- und Dokumententhemen.'
      },
      '/timesheets': {
        badge: 'Pilot-Standard',
        badgeTone: 'pilot',
        title: 'Timesheets',
        text: 'Digitale Stundenzettel schliessen den operativen Flow nach dem Dealabschluss ab und machen Freigaben sowie Abrechnungsvorbereitung nachvollziehbar.',
        tip: 'Tipp: Der Status-Filter hilft Ihnen, offene Genehmigungen, Korrekturen und Freigabestaus schnell zu finden.'
      },
      '/vendor_pool': {
        badge: 'Pilot-Stabilisierung',
        badgeTone: 'support',
        title: 'Lieferantensteuerung',
        text: 'Verwalten Sie bevorzugte Personaldienstleister, Coverage und operative Erfuellungspartner fuer Ihre Arbeitsplatzangebote. Die Seite staerkt den Pilotkern, ersetzt ihn aber nicht.',
        tip: 'Tipp: Priorisieren Sie Lieferanten dort, wo sie den Vermittlungs-, Angebots- und Deal-Erfolg direkt verbessern.'
      },
      '/rate-cards': {
        badge: 'Steuerungsschicht',
        badgeTone: 'support',
        title: 'Preisrahmen',
        text: 'Preisrahmen gehoeren zur buyer-seitigen Konditions- und Governance-Steuerung und erscheinen nur dort, wo Organisation, Tarif und Rolle dafuer freigeschaltet sind.',
        tip: 'Tipp: Berechtigte Procurement-Rollen arbeiten hier mit Min/Target/Max; andere Rollen werden bewusst nicht in aktive Pflegepfade gefuehrt.'
      },
      '/spend-analytics': {
        badge: 'Steuerungsschicht',
        badgeTone: 'support',
        title: 'Spend & Kostensteuerung',
        text: 'Analysieren Sie Ihre Ausgaben fuer Zeitarbeit nach Lieferant, Rolle und Zeitraum.',
        tip: 'Tipp: Filtern Sie nach Lieferant, um Kosten pro Erfuellungspartner zu vergleichen.'
      },
      '/executive_dashboard': {
        badge: 'Steuerungsschicht',
        badgeTone: 'support',
        title: 'Steuerung & Analytik',
        text: 'Hier sehen Sie Besetzungsdruck, Lieferantenleistung, Spend und Plattformzustand in einer Managementsicht. Diese Sicht ist nachgelagert und nicht der Einstieg in jeden Tagesprozess.',
        tip: 'Tipp: Nutzen Sie diese Seite als Managementschicht ueber dem operativen Kern, nicht als Ersatz fuer Deal- oder Einsatzarbeit.'
      },
      '/compliance_overview': {
        title: 'Compliance',
        text: 'Ueberwachen Sie AUEG-Erlaubnisse, Versicherungen und Zertifikate. Demo-Daten zeigen Dokumente mit verschiedenen Status.',
        tip: 'Tipp: Dokumente mit Status "warning" laufen bald ab und erfordern Massnahmen.'
      },
      '/notifications': {
        title: 'Benachrichtigungen',
        text: 'Ihr Posteingang fuer plattformweite Ereignisse. Demo enthaelt Angebote, Compliance-Warnungen und SLA-Hinweise.',
        tip: 'Tipp: Ungelesene Meldungen sind farblich hervorgehoben.'
      },
      '/organization': {
        title: 'Organisation',
        text: 'Verwalten Sie Ihr Unternehmensprofil, Mitglieder und Einstellungen.',
        tip: 'Tipp: Als Admin koennen Sie hier Rollen und Berechtigungen fuer Teammitglieder konfigurieren.'
      },
      '/matching_results': {
        title: 'Matching',
        text: 'Sehen Sie passende Personalangebote zu Ihren Arbeitsplatzangeboten. Das System matcht automatisch nach Skills und Region.',
        tip: 'Tipp: Der Match-Score zeigt die Übereinstimmung zwischen Arbeitsplatzangebot und Personalangebot.'
      },
      '/': {
        title: 'Vermittlung',
        text: 'Der zentrale Vermittlungsbereich zeigt Angebote und Gesuche. Demo-Daten enthalten Listings und Anfragen.',
        tip: 'Tipp: Klicken Sie auf ein Listing, um Details zu sehen und in den Staffing-Flow einzusteigen.'
      }
    };

    const hint = HINTS[path];
    if (!hint) return;

    /* ── Dismiss-Check ────────────────────────────────────── */
    const storageKey = 'contextHint:' + path;
    if (localStorage.getItem(storageKey) === 'dismissed') return;

    /* ── Banner rendern ───────────────────────────────────── */
    const badgeText = hint.badge || 'Demo-Hinweis';
    const badgeClass = hint.badgeTone ? ' tc-ch-badge--' + hint.badgeTone : '';
    const banner = document.createElement('div');
    banner.className = 'tc-context-hint';
    banner.innerHTML = `
      <div class="tc-ch-header">
        <span class="tc-ch-icon">💡</span>
        <span class="tc-ch-title">${hint.title}</span>
        <span class="tc-ch-badge${badgeClass}">${badgeText}</span>
        <span class="tc-ch-spacer"></span>
        <button class="tc-ch-toggle" title="Einklappen">−</button>
        <button class="tc-ch-dismiss" title="Nicht mehr anzeigen">✕</button>
      </div>
      <div class="tc-ch-body">
        <p class="tc-ch-text">${hint.text}</p>
        <p class="tc-ch-tip">${hint.tip}</p>
      </div>
    `;

    /* ── Styles (scoped via .tc-context-hint) ─────────────── */
    if (!document.getElementById('tc-context-hint-styles')) {
      const style = document.createElement('style');
      style.id = 'tc-context-hint-styles';
      style.textContent = `
        .tc-context-hint {
          position: fixed; bottom: 20px; right: 20px; z-index: 9000;
          width: 380px; max-width: calc(100vw - 40px);
          border: 1px solid rgba(74,163,255,.3);
          border-radius: 16px;
          background: rgba(10, 15, 30, .95);
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px rgba(0,0,0,.4);
          font-family: inherit; font-size: 13px;
          color: var(--ds-text, #e0e6f0);
          transition: all .3s ease;
          animation: tcChSlideIn .4s ease;
        }
        @keyframes tcChSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tc-context-hint.collapsed {
          width: auto; border-radius: 99px; cursor: pointer;
        }
        .tc-context-hint.collapsed .tc-ch-body,
        .tc-context-hint.collapsed .tc-ch-badge,
        .tc-context-hint.collapsed .tc-ch-dismiss { display: none; }
        .tc-context-hint.collapsed .tc-ch-toggle::after { content: '+'; }
        .tc-context-hint.collapsed .tc-ch-toggle { font-size: 18px; }

        .tc-ch-header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .tc-context-hint.collapsed .tc-ch-header { border-bottom: none; padding: 10px 14px; }

        .tc-ch-icon { font-size: 16px; flex-shrink: 0; }
        .tc-ch-title { font-weight: 800; font-size: 14px; white-space: nowrap; }
        .tc-ch-badge {
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          border-radius: 99px; background: rgba(74,163,255,.15);
          color: rgba(74,163,255,.9); white-space: nowrap;
        }
        .tc-ch-badge--pilot {
          background: rgba(57,217,138,.14);
          color: rgba(57,217,138,.95);
        }
        .tc-ch-badge--support {
          background: rgba(124,92,255,.14);
          color: rgba(193,178,255,.95);
        }
        .tc-ch-spacer { flex: 1; }
        .tc-ch-toggle, .tc-ch-dismiss {
          background: none; border: none; color: var(--ds-text-secondary, #8892a8);
          cursor: pointer; font-size: 16px; padding: 2px 4px; line-height: 1;
          transition: color .2s;
        }
        .tc-ch-toggle:hover, .tc-ch-dismiss:hover { color: var(--ds-text, #e0e6f0); }

        .tc-ch-body { padding: 12px 14px 14px; }
        .tc-ch-text { margin: 0 0 8px; line-height: 1.6; color: var(--ds-text-secondary, #8892a8); }
        .tc-ch-tip {
          margin: 0; padding: 8px 10px; border-radius: 8px;
          background: rgba(57,217,138,.08); border: 1px solid rgba(57,217,138,.15);
          color: rgba(57,217,138,.9); font-size: 12px; line-height: 1.5;
        }

        @media (max-width: 480px) {
          .tc-context-hint { width: calc(100vw - 24px); right: 12px; bottom: 12px; }
        }
      `;
      document.head.appendChild(style);
    }

    /* ── Event-Handler ────────────────────────────────────── */
    const toggleBtn = banner.querySelector('.tc-ch-toggle');
    const dismissBtn = banner.querySelector('.tc-ch-dismiss');

    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      banner.classList.toggle('collapsed');
    });

    banner.addEventListener('click', function () {
      if (banner.classList.contains('collapsed')) {
        banner.classList.remove('collapsed');
      }
    });

    dismissBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      localStorage.setItem(storageKey, 'dismissed');
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(20px)';
      setTimeout(function () { banner.remove(); }, 300);
    });

    /* ── Einfügen ─────────────────────────────────────────── */
    document.body.appendChild(banner);
    }
  }
})();
