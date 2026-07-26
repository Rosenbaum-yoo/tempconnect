/**
 * Match-Erklaerung (P4.2) — aus einer Zahl wird eine nachvollziehbare Begruendung.
 *
 * Warum das VOR der KI kommt (Welle 4.3): ein Ranking ohne erklaerbare Grundlage ist eine
 * Blackbox, der niemand vertraut — und ohne deterministische Basis laesst sich spaeter nicht
 * messen, ob ein KI-Ranking ueberhaupt besser ist. Diese Schicht ist die **Baseline**:
 * vollstaendig deterministisch, ohne Modellaufruf, jederzeit reproduzierbar.
 *
 * Der Server besitzt die Wahrheit ueber Achsen-Beschriftung und Formulierung. Vorher hat jede
 * Oberflaeche ihre eigene `FACTOR_LABELS`-Tabelle gepflegt — kommt ein Faktor in der Engine
 * dazu (compliance, rate, smartRank …), zeigte die UI stumm den technischen Schluesselnamen.
 *
 * Grundlage sind die `reasons` aus `matchingEngine.scoreMatch`: jeder Beitrag bringt
 * `{ factor, points, max, detail, meta }` mit. `meta` traegt die strukturierten Fakten
 * (3 von 4 Skills, 18 km, Zeitraum passt) — daraus wird die Klartext-Formulierung gebaut,
 * nicht aus dem technischen `detail`-String.
 */

/* ── Achsen-Metadaten: eine Wahrheit fuer alle Oberflaechen ─────────────── */

/**
 * Reihenfolge = Gewicht der Achse fuer den Nutzer, nicht Punkte-Maximum.
 * Was einen Treffer ausmacht (Rolle, Skills, Ort, Zeit) steht oben.
 */
export const MATCH_AXES = [
  { key: 'role',          label: 'Rolle',            order: 1 },
  { key: 'skills',        label: 'Skills',           order: 2 },
  { key: 'location',      label: 'Standort',         order: 3 },
  { key: 'availability',  label: 'Verfügbarkeit',    order: 4 },
  { key: 'rate',          label: 'Preisrahmen',      order: 5 },
  { key: 'workerCount',   label: 'Personalstärke',   order: 6 },
  { key: 'compliance',    label: 'Compliance',       order: 7 },
  { key: 'verified',      label: 'Verifizierung',    order: 8 },
  { key: 'reputation',    label: 'Historie',         order: 9 },
  { key: 'vendorPool',    label: 'Lieferantenpool',  order: 10 },
  { key: 'preferredFirst',label: 'Bevorzugt',        order: 11 },
  { key: 'smartRank',     label: 'Smart Rank',       order: 12 },
  { key: 'urgency',       label: 'Dringlichkeit',    order: 13 }
];

const AXIS_BY_KEY = new Map(MATCH_AXES.map((a) => [a.key, a]));

export const QUALITY_LABELS = {
  excellent: 'Sehr gute Übereinstimmung',
  good:      'Gute Übereinstimmung',
  fair:      'Teilweise Übereinstimmung',
  weak:      'Schwache Übereinstimmung'
};

/** Gleiche Schwellen wie `matchingEngine.classifyMatch` — bewusst gespiegelt, nicht neu erfunden. */
export function classifyQuality(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 'excellent';
  if (s >= 60) return 'good';
  if (s >= 40) return 'fair';
  return 'weak';
}

/* ── Formulierung je Achse ──────────────────────────────────────────────── */

/**
 * Klartext-Formulierung fuer einen einzelnen Score-Beitrag.
 * Faellt auf den technischen `detail`-String zurueck, wenn keine strukturierten
 * Fakten vorliegen (Altdaten aus `matches.reasons`/`match_alerts.match_reasons`).
 */
export function phraseForReason(reason) {
  if (!reason || !reason.factor) return null;
  const m = reason.meta || {};
  const hit = Number(reason.points) > 0;

  switch (reason.factor) {
    case 'role':
      if (m.mode === 'exact' || (!m.mode && hit)) return m.role ? `Rolle „${m.role}" passt genau` : 'Rolle passt genau';
      if (m.mode === 'partial') return 'Rolle passt teilweise';
      if (m.mode === 'none') return 'andere Rolle';
      return null;

    case 'skills': {
      if (m.required == null || m.overlap == null) return hit ? 'Skills passen' : 'Skills passen nicht';
      if (m.required === 1) return m.overlap >= 1 ? 'geforderter Skill vorhanden' : 'geforderter Skill fehlt';
      if (m.overlap === 0) return `keiner von ${m.required} geforderten Skills`;
      if (m.overlap >= m.required) return `alle ${m.required} geforderten Skills`;
      return `${m.overlap} von ${m.required} geforderten Skills`;
    }

    case 'location':
      if (m.km != null) {
        return m.withinRadius === false
          ? `${m.km} km entfernt — außerhalb des Radius (${m.maxKm} km)`
          : `${m.km} km entfernt`;
      }
      if (m.city) return `am selben Ort (${m.city})`;
      return hit ? 'Standort passt' : null;

    case 'availability':
      if (m.fits === false) return 'Zeitraum passt nicht';
      return 'im gewünschten Zeitraum verfügbar';

    case 'rate':
      return m.compatible === false ? 'Stundensatz über Budget' : 'Stundensatz im Budget';

    case 'workerCount':
      return m.sufficient === false ? 'Personalstärke reicht nicht' : 'Personalstärke reicht aus';

    case 'compliance':
      return m.pct != null ? `Compliance zu ${m.pct} % erfüllt` : 'Compliance geprüft';

    case 'verified':
      return 'verifizierter Anbieter';

    case 'reputation':
      return m.score != null ? `Historie ${m.score}/100` : 'positive Historie';

    case 'vendorPool':
      return m.tier === 'PREFERRED' ? 'bevorzugter Dienstleister' : 'im Lieferantenpool';

    case 'preferredFirst':
      return 'bevorzugt gelistet';

    case 'smartRank':
      return m.label ? `Smart Rank ${m.label.toLowerCase()}` : 'Smart Rank berücksichtigt';

    case 'urgency':
      return 'dringend — priorisiert';

    default:
      return reason.detail || null;
  }
}

/** Eine Achse mit Beschriftung, Prozentwert und Status — direkt renderbar. */
export function toAxis(reason) {
  const key = reason?.factor;
  const meta = AXIS_BY_KEY.get(key);
  const points = Number(reason?.points) || 0;
  const max = Number(reason?.max) || 0;
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  const status = points <= 0 ? 'missing' : pct >= 100 ? 'full' : 'partial';

  return {
    key,
    label: meta?.label || key,
    order: meta?.order ?? 99,
    points,
    max,
    pct,
    status,
    phrase: phraseForReason(reason),
    detail: reason?.detail || null
  };
}

/* ── Gesamt-Erklaerung ──────────────────────────────────────────────────── */

/**
 * Vollstaendige, deterministische Erklaerung eines Treffers.
 *
 * @param {number} score 0–100
 * @param {Array} reasons Score-Beitraege aus `scoreMatch`
 * @param {Object} [opts] { maxSummaryParts = 3 }
 * @returns {{score:number, quality:string, quality_label:string, headline:string,
 *            summary:string, axes:Array, strengths:string[], gaps:string[]}}
 */
export function explainMatch(score, reasons, opts = {}) {
  const maxParts = opts.maxSummaryParts ?? 3;
  const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const quality = classifyQuality(value);

  const list = Array.isArray(reasons) ? reasons : [];
  const axes = list
    .filter((r) => r && r.factor)
    .map(toAxis)
    .sort((a, b) => a.order - b.order);

  // Staerken nach Nutzer-Relevanz (Achsen-Reihenfolge), nicht nach Punktzahl:
  // "Rolle passt genau, alle 3 Skills, 18 km entfernt" liest sich wie eine Bewertung,
  // eine nach Punkten sortierte Liste wie ein Rechenweg.
  const strengths = axes.filter((a) => a.points > 0 && a.phrase).map((a) => a.phrase);
  const gaps = axes.filter((a) => a.points <= 0 && a.phrase).map((a) => a.phrase);

  const summary = strengths.length
    ? strengths.slice(0, maxParts).join(', ')
    : (gaps.length ? `Keine Übereinstimmung: ${gaps.slice(0, maxParts).join(', ')}` : 'Keine Bewertungsgrundlage vorhanden');

  return {
    score: value,
    quality,
    quality_label: QUALITY_LABELS[quality],
    headline: `${QUALITY_LABELS[quality]} (${value}%)`,
    summary,
    axes,
    strengths,
    gaps
  };
}

/** Ein Satz fuer Benachrichtigungen/E-Mails — ohne Achsenliste. */
export function summarizeMatch(score, reasons, opts = {}) {
  return explainMatch(score, reasons, opts).summary;
}

/**
 * Haengt `explanation` an eine Trefferliste. Vertraegt beide Formen, die im Repo
 * vorkommen: frisch berechnet (`score`/`reasons`) und persistiert
 * (`match_score`/`reasons` aus der Tabelle `matches`).
 */
export function attachExplanations(matches, opts = {}) {
  if (!Array.isArray(matches)) return matches;
  return matches.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const score = m.score ?? m.match_score ?? 0;
    let reasons = m.reasons ?? m.match_reasons ?? [];
    if (typeof reasons === 'string') {
      try { reasons = JSON.parse(reasons); } catch { reasons = []; }
    }
    return { ...m, explanation: explainMatch(score, reasons, opts) };
  });
}

export default { MATCH_AXES, QUALITY_LABELS, classifyQuality, phraseForReason, toAxis, explainMatch, summarizeMatch, attachExplanations };
