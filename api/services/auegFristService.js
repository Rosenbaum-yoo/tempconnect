/**
 * auegFristService — die Hoechstueberlassungsdauer, beidseitig planbar (Welle J8)
 *
 * OWNER-ENTSCHEID (2026-08-26/27): "die AUEG-Fristen beachten und warnen, wenn
 * mehr oder 18 Monate knapp sind" — und zwar so, dass BEIDE Seiten damit
 * planen koennen: die Zeitarbeitsfirma ihre Monatsplanung, das Unternehmen
 * seine Einsatzplanung.
 *
 * DIE REGEL (§ 1 Abs. 1b AUEG): Derselbe Leiharbeitnehmer darf demselben
 * Entleiher nicht laenger als 18 Monate ueberlassen werden. Zwei Dinge daran
 * werden regelmaessig falsch gebaut:
 *
 *   1. Die Frist gilt je KRAFT je ENTLEIHER — nicht je Einsatz. Mehrere
 *      Einsaetze beim selben Kunden addieren sich.
 *   2. Vorherige Ueberlassungen zaehlen mit, wenn zwischen ihnen WENIGER ALS
 *      DREI MONATE liegen. Erst eine Unterbrechung von mehr als drei Monaten
 *      setzt die Uhr zurueck.
 *
 * WARNEN, NICHT BLOCKIEREN: TempConnect ist Vermittlungsinfrastruktur, nicht
 * der Verleiher (docs/MARKTSTART_PLAN.md) — die Pflicht traegt die
 * Zeitarbeitsfirma. Die Plattform rechnet mit und sagt Bescheid; sie verbietet
 * nichts. Deshalb gibt dieser Dienst STUFEN aus, keine Verbote.
 *
 * TARIFLICHE ABWEICHUNGEN sind moeglich (§ 1 Abs. 1b S. 3 ff. erlaubt laengere
 * Dauern per Tarifvertrag). Die 18 Monate sind deshalb der gesetzliche
 * Grundfall und als Konstante gefuehrt — eine spaetere Tarif-Ausnahme haengt
 * genau hier, nicht verstreut in Abfragen.
 *
 * REIN FUNKTIONAL: keine Datenbank, keine Uhr — `heute` kommt vom Aufrufer
 * (todayDE, Europe/Berlin). Jede Regel ist mit einem Funktionsaufruf pruefbar.
 */

/** Gesetzlicher Grundfall in Monaten (§ 1 Abs. 1b AUEG). */
export const HOECHSTUEBERLASSUNG_MONATE = 18;

/** Unterbrechung, ab der die Uhr neu beginnt (mehr als drei Monate). */
export const UNTERBRECHUNG_MONATE = 3;

/** Ab wann gewarnt wird — Stufen in verbrauchten Monaten. */
export const STUFEN = Object.freeze({
  hinweis: 15,
  warnung: 17,
  alarm: HOECHSTUEBERLASSUNG_MONATE
});

/* ── Datums-Handwerk ─────────────────────────────────────────────────────
 * Alles rechnet auf ISO-Tagesketten ('YYYY-MM-DD'). Kein Date-Objekt in der
 * Rechnung: pg liefert DATE als Zeichenkette (db/pool.js), und ein
 * Zeitzonen-Ausrutscher waere hier ein Rechtsfehler, kein Anzeigefehler.
 * Dieselbe Lektion wie F1 (UTC-Slice = ganztaegig der Vortag). */

export function alsIsoDatum(wert) {
  if (wert == null || wert === "") return null;
  if (wert instanceof Date && !Number.isNaN(wert.getTime())) {
    const j = wert.getFullYear();
    const m = String(wert.getMonth() + 1).padStart(2, "0");
    const t = String(wert.getDate()).padStart(2, "0");
    return `${j}-${m}-${t}`;
  }
  const s = String(wert).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function zuTagen(iso) {
  const [j, m, t] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(j, m - 1, t) / 86400000);
}

function vonTagen(tage) {
  const d = new Date(tage * 86400000);
  const j = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const t = String(d.getUTCDate()).padStart(2, "0");
  return `${j}-${m}-${t}`;
}

/** Monate auf ein ISO-Datum addieren (Monatsende-sicher: 31.01. + 1 Monat = 28./29.02.). */
export function plusMonate(iso, monate) {
  const [j, m, t] = iso.split("-").map(Number);
  const zielMonat = m - 1 + monate;
  const zielJahr = j + Math.floor(zielMonat / 12);
  const mm = ((zielMonat % 12) + 12) % 12;
  const letzterTag = new Date(Date.UTC(zielJahr, mm + 1, 0)).getUTCDate();
  const tt = Math.min(t, letzterTag);
  return `${zielJahr}-${String(mm + 1).padStart(2, "0")}-${String(tt).padStart(2, "0")}`;
}

/** Tage zwischen zwei ISO-Daten, beide Enden eingeschlossen. */
export function tageInklusive(von, bis) {
  return Math.max(0, zuTagen(bis) - zuTagen(von) + 1);
}

/* Umrechnung Tage → Monate. Die Frist ist in Monaten formuliert, die Daten
 * liegen in Tagen vor. 30,4375 = 365,25/12 — der Mittelwert ueber den
 * Schaltjahreszyklus; bei 18 Monaten weicht das um wenige Tage von einer
 * kalendergenauen Rechnung ab. Genau deshalb ist die ALARM-Schwelle nicht
 * die einzige Auskunft: `frist_ende` unten wird KALENDERGENAU aus dem
 * Beginn der laufenden Kette gerechnet (plusMonate), nicht aus dieser Zahl. */
const TAGE_JE_MONAT = 30.4375;

export function tageAlsMonate(tage) {
  return Math.round((tage / TAGE_JE_MONAT) * 100) / 100;
}

/**
 * Die Ueberlassungs-Ketten einer Kraft bei EINEM Entleiher bilden.
 *
 * Eingabe: Zeitraeume `{von, bis}` (bis = null → laeuft weiter, gerechnet bis
 * `heute`). Ueberlappungen werden verschmolzen — zwei parallele Einsaetze
 * beim selben Kunden sind EINE Ueberlassung, keine doppelte Zeit.
 * Getrennte Ketten entstehen erst bei einer Unterbrechung von MEHR als drei
 * Monaten.
 *
 * @returns {{von: string, bis: string, tage: number}[]} chronologisch
 */
export function baueKetten(zeitraeume, heute) {
  const norm = (zeitraeume || [])
    .map((z) => ({ von: alsIsoDatum(z.von), bis: alsIsoDatum(z.bis) || heute }))
    .filter((z) => z.von && z.bis && z.bis >= z.von)
    .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));

  const ketten = [];
  for (const z of norm) {
    const letzte = ketten[ketten.length - 1];
    if (!letzte) { ketten.push({ von: z.von, bis: z.bis }); continue; }
    /* Die Uhr laeuft weiter, solange die Luecke NICHT mehr als drei Monate
     * betraegt. Genau drei Monate sind noch keine Unterbrechung im Sinne des
     * Gesetzes ("mehr als drei Monate"). */
    const wiederAufnahmeSpaetestens = plusMonate(letzte.bis, UNTERBRECHUNG_MONATE);
    if (z.von <= wiederAufnahmeSpaetestens) {
      if (z.bis > letzte.bis) letzte.bis = z.bis;
    } else {
      ketten.push({ von: z.von, bis: z.bis });
    }
  }
  return ketten.map((k) => ({ ...k, tage: tageInklusive(k.von, k.bis) }));
}

/**
 * Das AUEG-Konto einer Kraft bei EINEM Entleiher.
 *
 * @param {{von: string|Date, bis: string|Date|null}[]} zeitraeume
 * @param {string} heute 'YYYY-MM-DD' (Europe/Berlin)
 * @returns {{
 *   verbrauchte_tage: number, verbrauchte_monate: number,
 *   verbleibende_tage: number, stufe: 'ok'|'hinweis'|'warnung'|'alarm',
 *   frist_ende: string|null, laufende_kette_ab: string|null,
 *   spaetestes_fristgerechtes_ende: string|null, ketten: object[]
 * }}
 */
export function berechneAuegKonto(zeitraeume, heute) {
  const ketten = baueKetten(zeitraeume, heute);
  if (!ketten.length) {
    return {
      verbrauchte_tage: 0, verbrauchte_monate: 0,
      verbleibende_tage: Math.round(HOECHSTUEBERLASSUNG_MONATE * TAGE_JE_MONAT),
      stufe: "ok", frist_ende: null, laufende_kette_ab: null,
      spaetestes_fristgerechtes_ende: null, ketten: []
    };
  }

  /* Massgeblich ist die AKTUELLE Kette: aeltere, durch eine Unterbrechung von
   * mehr als drei Monaten getrennte Ueberlassungen zaehlen nicht mehr mit.
   * Sie bleiben in `ketten` sichtbar — wer das Konto erklaeren muss, sieht
   * die Historie. */
  const aktuelle = ketten[ketten.length - 1];
  const verbrauchteTage = aktuelle.tage;

  /* Das Fristende ist KALENDERGENAU: 18 Monate ab Beginn der laufenden Kette,
   * minus einen Tag (der Beginntag zaehlt mit). Diese Zahl ist die, mit der
   * beide Seiten planen. */
  const fristEnde = vonTagen(zuTagen(plusMonate(aktuelle.von, HOECHSTUEBERLASSUNG_MONATE)) - 1);
  /* Verbleibend: volle Tage von heute bis zum Fristende. Ist die Frist
   * bereits ueberschritten, bleibt nichts — negative Zahlen waeren hier
   * keine Auskunft, sondern eine Zumutung fuer den Leser. */
  const verbleibendeTage = Math.max(0, zuTagen(fristEnde) - zuTagen(heute));

  const monate = tageAlsMonate(verbrauchteTage);
  const stufe = heute > fristEnde || monate >= STUFEN.alarm ? "alarm"
    : monate >= STUFEN.warnung ? "warnung"
      : monate >= STUFEN.hinweis ? "hinweis"
        : "ok";

  return {
    verbrauchte_tage: verbrauchteTage,
    verbrauchte_monate: monate,
    verbleibende_tage: verbleibendeTage,
    stufe,
    frist_ende: fristEnde,
    laufende_kette_ab: aktuelle.von,
    /* Fuer die Buchung (J2c-Modal): bis zu diesem Tag darf ein neuer Einsatz
     * bei diesem Entleiher fristgerecht laufen. Liegt er in der
     * Vergangenheit, ist die Frist bereits ausgeschoepft. */
    spaetestes_fristgerechtes_ende: fristEnde,
    ketten
  };
}

/* ── Datenanbindung ──────────────────────────────────────────────────────
 * Die Zeitraeume stehen auf `worker_assignment_links`: `org_id` ist der
 * ENTLEIHER, `worker_user_id` die Kraft, `start_date`/`end_date` die
 * Ueberlassung. Beides liegt auf derselben Zeile — kein Join noetig.
 *
 * Welche Verknuepfungen zaehlen: alle, die tatsaechlich zu einer
 * Ueberlassung gefuehrt haben oder noch fuehren. Abgelehnte, verfallene und
 * zurueckgezogene Anfragen (Wellen I2/193/195/199) zaehlen NICHT — dort hat
 * nie jemand gearbeitet, und eine Frist, die auf nicht erfolgte Einsaetze
 * anspringt, waere schlicht falsch.
 */
const NICHT_ANGETRETEN = ["worker_declined", "worker_unavailable", "expired", "withdrawn"];

/**
 * Alle Ueberlassungs-Zeitraeume EINER Kraft bei EINEM Entleiher.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
export async function ladeZeitraeume(db, companyOrgId, workerUserId) {
  if (!companyOrgId || !workerUserId) return [];
  const { rows } = await db.query(
    `SELECT wal.start_date AS von, wal.end_date AS bis
       FROM worker_assignment_links wal
      WHERE wal.org_id = $1
        AND wal.worker_user_id = $2
        AND wal.start_date IS NOT NULL
        AND COALESCE(wal.worker_confirmation_status, '') <> ALL($3::text[])
      ORDER BY wal.start_date ASC`,
    [companyOrgId, workerUserId, NICHT_ANGETRETEN]
  );
  return rows;
}

/** Das Konto einer Kraft bei einem Entleiher, direkt aus den Einsaetzen. */
export async function ladeAuegKonto(db, companyOrgId, workerUserId, heute) {
  return berechneAuegKonto(await ladeZeitraeume(db, companyOrgId, workerUserId), heute);
}

/**
 * Konten fuer VIELE Kraefte eines Entleihers auf einmal — die Tafel-Sicht.
 * Bewusst EINE Abfrage fuer alle (kein Rundlauf je Zeile): dieselbe Regel wie
 * beim N+1-Sweep aus der Erkenntnis vom 2026-06-03.
 * @returns {Map<string, object>} worker_user_id → Konto
 */
export async function ladeAuegKontenFuerOrg(db, companyOrgId, workerUserIds, heute) {
  const ids = [...new Set((workerUserIds || []).filter(Boolean))];
  if (!companyOrgId || !ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT wal.worker_user_id, wal.start_date AS von, wal.end_date AS bis
       FROM worker_assignment_links wal
      WHERE wal.org_id = $1
        AND wal.worker_user_id = ANY($2::uuid[])
        AND wal.start_date IS NOT NULL
        AND COALESCE(wal.worker_confirmation_status, '') <> ALL($3::text[])
      ORDER BY wal.start_date ASC`,
    [companyOrgId, ids, NICHT_ANGETRETEN]
  );
  const jeKraft = new Map();
  for (const r of rows) {
    if (!jeKraft.has(r.worker_user_id)) jeKraft.set(r.worker_user_id, []);
    jeKraft.get(r.worker_user_id).push({ von: r.von, bis: r.bis });
  }
  const konten = new Map();
  for (const id of ids) konten.set(id, berechneAuegKonto(jeKraft.get(id) || [], heute));
  return konten;
}

/**
 * Prueft einen GEPLANTEN Zeitraum gegen das Konto — die Auskunft, die das
 * Buchungsmodal braucht. Warnt, verbietet nicht (Owner-Entscheid): das
 * Ergebnis traegt `fristgerecht` und im Fall der Ueberschreitung das
 * spaeteste zulaessige Ende als Vorschlag.
 */
export function pruefePlanung(zeitraeume, geplant, heute) {
  const von = alsIsoDatum(geplant?.von);
  const bis = alsIsoDatum(geplant?.bis);
  const konto = berechneAuegKonto([...(zeitraeume || []), ...(von ? [{ von, bis: bis || null }] : [])], heute);
  if (!von) return { ...konto, fristgerecht: true };
  /* Ohne Enddatum ist die Buchung offen — dann ist die Frist nicht heute
   * gerissen, aber der Zeitpunkt steht fest und wird genannt. */
  const fristgerecht = !bis || bis <= konto.frist_ende;
  return { ...konto, fristgerecht, geplant_von: von, geplant_bis: bis || null };
}
