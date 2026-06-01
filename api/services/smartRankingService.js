/**
 * Smart Ranking Service — kontrollierte AI-Matching-Erweiterung.
 *
 * Berechnet einen Smart-Rank-Score (0-100) aus 6 verhaltensbasierten Signalen,
 * die NICHT mit den bestehenden Matching-Faktoren ueberlappen:
 *
 *   1. Fill Rate        (25%) – Wie zuverlaessig nimmt der Supplier Anfragen an?
 *   2. SLA Compliance   (20%) – SLA-Treue (inverse Breach Rate)
 *   3. Role Expertise   (20%) – Hat der Supplier diese Rolle schon erfolgreich besetzt?
 *   4. Timesheet Quality (15%) – Dokumentationszuverlaessigkeit
 *   5. Recency          (10%) – Wie frisch ist das Capacity-Angebot?
 *   6. Platform Activity (10%) – Engagement-Level auf der Plattform
 *
 * Designprinzip: Jedes Signal ist nachvollziehbar, gewichtet und erklaert.
 * Keine Blackbox — alle Berechnungen sind deterministisch und testbar.
 *
 * Alle Funktionen sind pure (kein DB-Zugriff), voll unit-testbar.
 */

/* ── Signal-Gewichtung (anpassbar) ────────────────────── */

export const SMART_RANK_WEIGHTS = {
  fill_rate:         0.25,
  sla_compliance:    0.20,
  role_expertise:    0.20,
  timesheet_quality: 0.15,
  recency:           0.10,
  platform_activity: 0.10
};

/* ── Signal-Berechnungen (0-100 je Signal) ────────────── */

/**
 * Fill Rate Signal: accepted / received.
 * Mindestens 3 Requests noetig, sonst neutral (50).
 * @param {number} accepted - Anzahl akzeptierter Requests
 * @param {number} received - Anzahl erhaltener Requests
 * @returns {number} 0-100
 */
export function computeFillRateSignal(accepted, received) {
  const a = Number(accepted) || 0;
  const r = Number(received) || 0;
  if (r < 3) return 50; // neutral bei zu wenig Daten
  return Math.min(100, Math.round((a / r) * 100));
}

/**
 * SLA Compliance Signal: 1 - (breaches / received).
 * Mindestens 3 Requests noetig, sonst neutral (50).
 * @param {number} breaches - Anzahl SLA-Verletungen
 * @param {number} received - Anzahl erhaltener Requests
 * @returns {number} 0-100
 */
export function computeSlaComplianceSignal(breaches, received) {
  const b = Number(breaches) || 0;
  const r = Number(received) || 0;
  if (r < 3) return 50;
  return Math.min(100, Math.max(0, Math.round((1 - b / r) * 100)));
}

/**
 * Role Expertise Signal: completed deals for this role / total deals.
 * Mindestens 2 Deals noetig, sonst neutral (30).
 * @param {number} roleDeals - Abgeschlossene Deals fuer die gesuchte Rolle
 * @param {number} totalDeals - Gesamt abgeschlossene Deals
 * @returns {number} 0-100
 */
export function computeRoleExpertiseSignal(roleDeals, totalDeals) {
  const rd = Number(roleDeals) || 0;
  const td = Number(totalDeals) || 0;
  if (td < 2) return 30; // neutral bei wenig Track-Record
  // Spezialisierung: 50% Basis fuer vorhandene Deals + 50% rollenspezifisch
  const ratio = Math.min(1, rd / td);
  const volumeBonus = Math.min(50, td * 5); // max 50 pts fuer Volumen (10+ Deals)
  return Math.min(100, Math.round(ratio * 50 + volumeBonus));
}

/**
 * Recency Signal: wie frisch ist das Capacity Post?
 * <1 Tag → 100, <3 Tage → 90, <7 → 80, <14 → 60, <30 → 40, >30 → 20.
 * @param {number} daysSinceUpdate - Tage seit letzter Aktualisierung
 * @returns {number} 0-100
 */
export function computeRecencySignal(daysSinceUpdate) {
  const d = Number(daysSinceUpdate) || 0;
  if (d < 1) return 100;
  if (d < 3) return 90;
  if (d < 7) return 80;
  if (d < 14) return 60;
  if (d < 30) return 40;
  return 20;
}

/* ── Composite Smart Rank Score ───────────────────────── */

/**
 * Berechnet den Smart Rank Score aus allen Signalen.
 * Jedes Signal wird auf 0-100 normalisiert und gewichtet.
 * Gibt Score + vollstaendige Breakdown zurueck (Erklaerbarkeit).
 *
 * @param {Object} signals
 * @param {number} signals.fill_rate - 0-100
 * @param {number} signals.sla_compliance - 0-100
 * @param {number} signals.role_expertise - 0-100
 * @param {number} signals.timesheet_quality - 0-100 (or null → 50)
 * @param {number} signals.recency - 0-100
 * @param {number} signals.platform_activity - 0-100 (or null → 30)
 * @returns {{ score: number, breakdown: Array }}
 */
export function computeSmartRankScore(signals = {}) {
  const norm = {
    fill_rate:         Math.min(100, Math.max(0, Number(signals.fill_rate) || 50)),
    sla_compliance:    Math.min(100, Math.max(0, Number(signals.sla_compliance) || 50)),
    role_expertise:    Math.min(100, Math.max(0, Number(signals.role_expertise) || 30)),
    timesheet_quality: signals.timesheet_quality != null
                         ? Math.min(100, Math.max(0, Number(signals.timesheet_quality)))
                         : 50,
    recency:           Math.min(100, Math.max(0, Number(signals.recency) || 50)),
    platform_activity: signals.platform_activity != null
                         ? Math.min(100, Math.max(0, Number(signals.platform_activity)))
                         : 30
  };

  const breakdown = [];
  let score = 0;

  for (const [signal, weight] of Object.entries(SMART_RANK_WEIGHTS)) {
    const value = norm[signal];
    const weighted = Math.round(value * weight * 100) / 100;
    score += weighted;
    breakdown.push({
      signal,
      weight: Math.round(weight * 100),
      value,
      weighted: Math.round(weighted * 100) / 100,
      detail: signalDetail(signal, value)
    });
  }

  return {
    score: Math.min(100, Math.round(score * 100) / 100),
    breakdown
  };
}

/**
 * Human-readable Erklaerung fuer ein Signal.
 */
function signalDetail(signal, value) {
  const labels = {
    fill_rate:         value >= 80 ? 'Sehr hohe Annahmequote'
                     : value >= 60 ? 'Gute Annahmequote'
                     : value >= 40 ? 'Durchschnittliche Annahmequote'
                     : 'Niedrige Annahmequote',
    sla_compliance:    value >= 90 ? 'Hervorragende SLA-Treue'
                     : value >= 70 ? 'Gute SLA-Treue'
                     : value >= 50 ? 'Akzeptable SLA-Treue'
                     : 'SLA-Verbesserung noetig',
    role_expertise:    value >= 80 ? 'Hohe Spezialisierung fuer diese Rolle'
                     : value >= 50 ? 'Erfahrung mit dieser Rolle vorhanden'
                     : value >= 30 ? 'Wenig Erfahrung mit dieser Rolle'
                     : 'Keine Erfahrung mit dieser Rolle',
    timesheet_quality: value >= 90 ? 'Exzellente Dokumentationsqualitaet'
                     : value >= 70 ? 'Gute Dokumentationsqualitaet'
                     : value >= 50 ? 'Durchschnittliche Dokumentation'
                     : 'Dokumentation verbesserungswuerdig',
    recency:           value >= 80 ? 'Sehr aktuelles Angebot'
                     : value >= 60 ? 'Aktuelles Angebot'
                     : value >= 40 ? 'Aelteres Angebot'
                     : 'Veraltetes Angebot',
    platform_activity: value >= 70 ? 'Sehr aktiv auf der Plattform'
                     : value >= 40 ? 'Aktiv auf der Plattform'
                     : value >= 10 ? 'Gelegentlich aktiv'
                     : 'Wenig aktiv'
  };
  return labels[signal] || `${signal}: ${value}`;
}

/* ── Classification ───────────────────────────────────── */

/**
 * Klassifiziert den Smart Rank Score in ein lesbares Label.
 * @param {number} score 0-100
 * @returns {'excellent'|'strong'|'solid'|'developing'|'insufficient'}
 */
export function classifySmartRank(score) {
  const s = Number(score) || 0;
  if (s >= 85) return 'excellent';
  if (s >= 70) return 'strong';
  if (s >= 50) return 'solid';
  if (s >= 30) return 'developing';
  return 'insufficient';
}

/**
 * Deutsche Labels fuer die Smart-Rank-Klassen.
 */
export const SMART_RANK_LABELS = {
  excellent:    'Exzellent',
  strong:       'Stark',
  solid:        'Solide',
  developing:   'Aufbauend',
  insufficient: 'Unzureichend'
};
