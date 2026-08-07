/**
 * Zuverlaessigkeitsquote (P8 Welle B).
 *
 * WAS DIESER SERVICE LOEST
 * `supplier_reputation.deal_success_rate` steuert seit Migration 044 das
 * Feed-Ranking und wird an sechs Oberflaechen angezeigt — geschrieben hat sie
 * nie jemand (die einzige Schreibstelle `reputationService.recomputeReputation`
 * hat keinen produktiven Aufrufer). Ein Storno kostete damit exakt nichts.
 * Hier entsteht der Wert: aus den Rohdaten der Welle A (`offer_cancellations`),
 * gewichtet nach den Owner-Entscheidungen E1/E2/E4.
 *
 * DIE REGELN (Owner-Entscheidungen vom 2026-08-06, siehe
 * docs/features/P8_DEAL_VERBINDLICHKEIT.md Abschnitt 4)
 *   E1 Vorlauf : < 48 h vor Einsatzbeginn -> doppeltes Gewicht
 *                >= 14 Tage               -> zaehlt gar nicht
 *                dazwischen               -> einfach
 *   E2 Grund   : `customer_cancelled` und `worker_sick` zaehlen NICHT gegen die
 *                Agentur. Fuer das Unternehmen zaehlen sie sehr wohl — eine
 *                Entschuldigung gilt nur fuer die Seite, die den Vorgang
 *                nachweislich nicht zu verantworten hat. Sonst waere
 *                "worker_sick" ein Freifahrtschein fuer jede Seite.
 *   E4 Schwelle: unter 5 verbindlichen Deals gibt es KEINE Quote (NULL).
 *                "Keine Daten" ist nicht "schlecht" — wer einen einzigen Deal
 *                hatte und ihn absagen musste, staende sonst bei 0 %.
 *
 * WAS BEWUSST NICHT PASSIERT
 * Es wird kein Gewicht gespeichert, nur das Ergebnis. Die Regeln werden sich
 * einspielen; gespeicherte Gewichte muessten bei jeder Aenderung nachgezogen
 * werden, und wer das vergisst, hat zwei Wahrheiten. Aus `offer_cancellations`
 * laesst sich jederzeit neu rechnen.
 *
 * Reine Logik (DB-frei, vollstaendig testbar):
 *   vorlaufKlasse, istEntschuldigt, istVerbindlicherStorno,
 *   gewichteStorno, berechneQuote
 */

import * as auditLog from "./auditLog.js";

/* ── Regelwerk (die einzige Stelle, an der die Gewichte stehen) ──────────── */

/** Betrachtungsfenster. Rollierend, nicht Kalenderjahr — sonst waere jeder 1. Januar ein Reset. */
export const FENSTER_TAGE = 365;

/** E4: unter dieser Zahl verbindlicher Deals gibt es keine Quote. */
export const MINDEST_DEALS = 5;

/** E1: alles darunter (inklusive negativ = nach Einsatzbeginn) zaehlt doppelt. */
export const KURZFRISTIG_STUNDEN = 48;

/** E1: ab hier ist der Storno rechtzeitig genug, um folgenlos zu bleiben. */
export const UNKRITISCH_STUNDEN = 14 * 24;

/**
 * Gewicht je Vorlauf-Klasse.
 * `unbekannt` (kein Einsatzbeginn hinterlegt) wird einfach gewichtet: weder
 * Freispruch noch Verschaerfung, weil die Datenlage nichts hergibt.
 */
export const KLASSEN_GEWICHT = Object.freeze({
  kurzfristig: 2,
  normal: 1,
  unbekannt: 1,
  unkritisch: 0
});

/**
 * E2: Gruende, die der jeweiligen Seite NICHT angelastet werden.
 * Bewusst je Seite verschieden — siehe Kopfkommentar.
 */
export const ENTSCHULDIGT_JE_SEITE = Object.freeze({
  agency: Object.freeze(["customer_cancelled", "worker_sick"]),
  company: Object.freeze([])
});

/**
 * Vorzustaende, in denen noch keine beidseitige Zusage bestand. Ein Rueckzug
 * hier ist Verhandeln, kein Wortbruch, und darf die Quote nicht beruehren.
 */
export const UNVERBINDLICHE_VORZUSTAENDE = Object.freeze([
  "none", "agreement_created", "pending_confirmation"
]);

/** Harte Obergrenze fuer einen Cron-Lauf (Schutz vor Lastspitzen via Parameter). */
export const MAX_BATCH_SIZE = 1000;
const DEFAULT_BATCH_SIZE = 500;

/* ── Reine Logik ─────────────────────────────────────────────────────────── */

/**
 * Vorlauf in Stunden -> Klasse. Negative Werte bedeuten "nach Einsatzbeginn
 * storniert" und fallen bewusst in `kurzfristig`: das ist der teuerste Fall.
 *
 * @param {number|null|undefined} leadTimeHours
 * @returns {'kurzfristig'|'normal'|'unkritisch'|'unbekannt'}
 */
export function vorlaufKlasse(leadTimeHours) {
  if (leadTimeHours == null) return "unbekannt";
  const h = Number(leadTimeHours);
  if (!Number.isFinite(h)) return "unbekannt";
  if (h < KURZFRISTIG_STUNDEN) return "kurzfristig";
  if (h >= UNKRITISCH_STUNDEN) return "unkritisch";
  return "normal";
}

/**
 * E2: Zaehlt dieser Grund fuer diese Seite als unverschuldet?
 *
 * @param {string} reasonCode
 * @param {'company'|'agency'} side
 */
export function istEntschuldigt(reasonCode, side) {
  const liste = ENTSCHULDIGT_JE_SEITE[side];
  if (!liste) return false;
  return liste.includes(String(reasonCode));
}

/**
 * Bestand zum Storno-Zeitpunkt eine beidseitige Zusage?
 *
 * `null` bedeutet Altbestand aus der Zeit vor Migration 164. Es zaehlt als
 * verbindlich, weil die Auswertung ohnehin nur Angebote betrachtet, die
 * `confirmed_at` gesetzt haben (siehe SQL) — die Population entscheidet, nicht
 * das fehlende Feld.
 *
 * @param {string|null|undefined} fromStatus
 */
export function istVerbindlicherStorno(fromStatus) {
  if (fromStatus == null) return true;
  return !UNVERBINDLICHE_VORZUSTAENDE.includes(String(fromStatus));
}

/**
 * Gewicht eines einzelnen Stornos: 0, 1 oder 2.
 *
 * @param {{reason_code:string, cancelled_by_side:'company'|'agency',
 *          lead_time_hours?:number|null, vorlauf_klasse?:string,
 *          from_status?:string|null}} storno
 * @returns {number}
 */
export function gewichteStorno(storno = {}) {
  if (!istVerbindlicherStorno(storno.from_status)) return 0;
  if (istEntschuldigt(storno.reason_code, storno.cancelled_by_side)) return 0;
  const klasse = storno.vorlauf_klasse || vorlaufKlasse(storno.lead_time_hours);
  return KLASSEN_GEWICHT[klasse] ?? 1;
}

/**
 * Quote in Prozent, oder `null` wenn die Datenlage keine Aussage traegt (E4).
 *
 * Geklemmt auf 0..100: durch das doppelte Gewicht kurzfristiger Stornos kann
 * die gewichtete Summe den Nenner uebersteigen. Negative Prozente waeren
 * mathematisch konsequent und fuer den Nutzer unverstaendlich.
 *
 * @param {{bindingDeals:number, weightedCancellations:number}} werte
 * @returns {number|null} 0..100 auf zwei Nachkommastellen
 */
export function berechneQuote({ bindingDeals, weightedCancellations } = {}) {
  const nenner = Number(bindingDeals) || 0;
  if (nenner < MINDEST_DEALS) return null;
  const gewichtet = Number(weightedCancellations) || 0;
  const roh = ((nenner - gewichtet) / nenner) * 100;
  const geklemmt = Math.min(100, Math.max(0, roh));
  return Math.round(geklemmt * 100) / 100;
}

/* ── Datenzugriff ────────────────────────────────────────────────────────── */

function clampFenster(tage) {
  const n = Number(tage);
  if (!Number.isFinite(n) || n <= 0) return FENSTER_TAGE;
  return Math.min(3650, Math.round(n));
}

function normalisiereIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return null;
  return [...new Set(userIds.filter(Boolean).map(String))];
}

/**
 * Nenner: Angebote, die im Fenster verbindlich geworden sind (`confirmed_at`).
 * EINE Abfrage fuer alle Parteien beider Seiten — kein N+1.
 *
 * Die Agentur haengt direkt am Angebot (`offers.supplier_company_id`), das
 * Unternehmen ueber die Nachfrage (`demand_requests.requester_company_id`);
 * `offers.demand_request_id` ist NOT NULL, jedes Angebot hat also beide Seiten.
 */
async function ladeNenner(pool, { windowDays, userIds }) {
  const { rows } = await pool.query(
    `SELECT o.supplier_company_id AS party_user_id,
            'agency'::text        AS party_side,
            COUNT(*)::int         AS binding_deals
       FROM offers o
      WHERE o.confirmed_at IS NOT NULL
        AND o.confirmed_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND o.supplier_company_id IS NOT NULL
        AND ($2::uuid[] IS NULL OR o.supplier_company_id = ANY($2::uuid[]))
      GROUP BY o.supplier_company_id
      UNION ALL
     SELECT d.requester_company_id, 'company'::text, COUNT(*)::int
       FROM offers o
       JOIN demand_requests d ON d.id = o.demand_request_id
      WHERE o.confirmed_at IS NOT NULL
        AND o.confirmed_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND d.requester_company_id IS NOT NULL
        AND ($2::uuid[] IS NULL OR d.requester_company_id = ANY($2::uuid[]))
      GROUP BY d.requester_company_id`,
    [windowDays, userIds]
  );
  return rows;
}

/**
 * Zaehler: Stornos derselben Population, gruppiert zu Klassen.
 *
 * Die Schwellen kommen als PARAMETER in die Abfrage, nicht als Literale — die
 * Gewichtsregeln bleiben damit vollstaendig in JavaScript und es gibt keine
 * zweite Wahrheit im SQL. Gruppiert, damit die Ergebnismenge klein bleibt
 * (Partei x 6 Gruende x 5 Vorzustaende x 4 Klassen), statt jede Stornozeile zu
 * laden.
 *
 * Gefiltert wird ueber `offers.confirmed_at` und nicht ueber das Stornodatum:
 * so ist die Storno-Menge garantiert eine Teilmenge des Nenners. Andernfalls
 * koennte ein Storno an einem alten Deal eine Quote druecken, deren Nenner ihn
 * gar nicht enthaelt.
 */
async function ladeStornoKlassen(pool, { windowDays, userIds }) {
  const { rows } = await pool.query(
    `SELECT CASE WHEN c.cancelled_by_side = 'agency'
                 THEN o.supplier_company_id
                 ELSE d.requester_company_id END AS party_user_id,
            c.cancelled_by_side                  AS party_side,
            c.reason_code,
            c.from_status,
            CASE
              WHEN c.lead_time_hours IS NULL      THEN 'unbekannt'
              WHEN c.lead_time_hours <  $2::int   THEN 'kurzfristig'
              WHEN c.lead_time_hours >= $3::int   THEN 'unkritisch'
              ELSE 'normal'
            END                                  AS vorlauf_klasse,
            COUNT(*)::int                        AS anzahl
       FROM offer_cancellations c
       JOIN offers o           ON o.id = c.offer_id
       JOIN demand_requests d  ON d.id = o.demand_request_id
      WHERE o.confirmed_at IS NOT NULL
        AND o.confirmed_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND ($4::uuid[] IS NULL OR (CASE WHEN c.cancelled_by_side = 'agency'
                                         THEN o.supplier_company_id
                                         ELSE d.requester_company_id END) = ANY($4::uuid[]))
      GROUP BY 1, 2, 3, 4, 5`,
    [windowDays, KURZFRISTIG_STUNDEN, UNKRITISCH_STUNDEN, userIds]
  );
  return rows;
}

/**
 * Fuehrt Nenner und Zaehler zu Kennzahlen je (Partei, Seite) zusammen.
 * Reine Logik ueber DB-Zeilen — deshalb getrennt und einzeln testbar.
 *
 * @param {object[]} nennerZeilen
 * @param {object[]} stornoZeilen
 * @param {number} windowDays
 */
export function fasseKennzahlenZusammen(nennerZeilen, stornoZeilen, windowDays) {
  const map = new Map();
  const key = (id, side) => `${id}::${side}`;

  const hole = (id, side) => {
    const k = key(id, side);
    if (!map.has(k)) {
      map.set(k, {
        party_user_id: id,
        party_side: side,
        window_days: windowDays,
        binding_deals: 0,
        cancellations_total: 0,
        cancellations_excused: 0,
        weighted_cancellations: 0,
        reliability_rate: null
      });
    }
    return map.get(k);
  };

  for (const r of nennerZeilen || []) {
    if (!r?.party_user_id) continue;
    hole(r.party_user_id, r.party_side).binding_deals += Number(r.binding_deals) || 0;
  }

  for (const r of stornoZeilen || []) {
    if (!r?.party_user_id) continue;
    const eintrag = hole(r.party_user_id, r.party_side);
    const anzahl = Number(r.anzahl) || 0;
    eintrag.cancellations_total += anzahl;
    if (istEntschuldigt(r.reason_code, r.party_side)) {
      eintrag.cancellations_excused += anzahl;
    }
    eintrag.weighted_cancellations += anzahl * gewichteStorno({
      reason_code: r.reason_code,
      cancelled_by_side: r.party_side,
      vorlauf_klasse: r.vorlauf_klasse,
      from_status: r.from_status
    });
  }

  for (const eintrag of map.values()) {
    eintrag.weighted_cancellations = Math.round(eintrag.weighted_cancellations * 100) / 100;
    eintrag.reliability_rate = berechneQuote({
      bindingDeals: eintrag.binding_deals,
      weightedCancellations: eintrag.weighted_cancellations
    });
  }

  return [...map.values()];
}

/** Schreibt die Kennzahlen als EIN Bulk-Upsert (kein Write-Loop). */
async function schreibeKennzahlen(pool, eintraege) {
  if (!eintraege.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO deal_reliability
       (party_user_id, party_side, window_days, binding_deals,
        cancellations_total, cancellations_excused, weighted_cancellations,
        reliability_rate, computed_at)
     SELECT t.party_user_id, t.party_side, t.window_days, t.binding_deals,
            t.cancellations_total, t.cancellations_excused, t.weighted_cancellations,
            t.reliability_rate, NOW()
       FROM UNNEST($1::uuid[], $2::text[], $3::int[], $4::int[],
                   $5::int[], $6::int[], $7::numeric[], $8::numeric[])
         AS t(party_user_id, party_side, window_days, binding_deals,
              cancellations_total, cancellations_excused, weighted_cancellations,
              reliability_rate)
     ON CONFLICT (party_user_id, party_side) DO UPDATE SET
       window_days            = EXCLUDED.window_days,
       binding_deals          = EXCLUDED.binding_deals,
       cancellations_total    = EXCLUDED.cancellations_total,
       cancellations_excused  = EXCLUDED.cancellations_excused,
       weighted_cancellations = EXCLUDED.weighted_cancellations,
       reliability_rate       = EXCLUDED.reliability_rate,
       computed_at            = NOW()`,
    [
      eintraege.map((e) => e.party_user_id),
      eintraege.map((e) => e.party_side),
      eintraege.map((e) => e.window_days),
      eintraege.map((e) => e.binding_deals),
      eintraege.map((e) => e.cancellations_total),
      eintraege.map((e) => e.cancellations_excused),
      eintraege.map((e) => e.weighted_cancellations),
      eintraege.map((e) => e.reliability_rate)
    ]
  );
  return rowCount || 0;
}

/**
 * Spiegelt die Agentur-Quote nach `supplier_reputation.deal_success_rate`.
 *
 * Das ist bewusst eine Denormalisierung — dasselbe Muster wie
 * `worker_profiles.skill_tags[]` gegenueber `worker_profile_skills`: eine
 * Quelle der Wahrheit (`deal_reliability`), ein Spiegel fuer den heissen
 * Lesepfad. Der Feed liest die Spalte bereits in einer Batch-Abfrage; ueber den
 * Spiegel wirkt die Quote sofort im Ranking und in allen bestehenden Anzeigen,
 * ohne dass eine davon angefasst werden muss.
 *
 * Nur die Agentur-Seite wird gespiegelt: `supplier_reputation` ist per Name und
 * Semantik anbieterseitig. Die Unternehmensquote lebt ausschliesslich in
 * `deal_reliability`.
 */
async function spiegleNachReputation(pool, eintraege) {
  const agentur = eintraege.filter((e) => e.party_side === "agency");
  if (!agentur.length) return 0;
  const { rowCount } = await pool.query(
    `INSERT INTO supplier_reputation (supplier_id, deal_success_rate, updated_at)
     SELECT t.supplier_id, t.rate, NOW()
       FROM UNNEST($1::uuid[], $2::numeric[]) AS t(supplier_id, rate)
     ON CONFLICT (supplier_id) DO UPDATE SET
       deal_success_rate = EXCLUDED.deal_success_rate,
       updated_at        = NOW()`,
    [agentur.map((e) => e.party_user_id), agentur.map((e) => e.reliability_rate)]
  );
  return rowCount || 0;
}

/**
 * Wann wurde welche Partei zuletzt gerechnet? Steuert nur die Reihenfolge.
 *
 * Ohne diese Information sortiert ein Lauf am Batch-Limit immer nach derselben
 * Kennzahl und rechnet damit in jedem Lauf dieselbe Spitzengruppe — der Rest
 * friert dauerhaft ein. Nach Frische zu sortieren laesst die Menge rotieren:
 * jede Partei kommt garantiert dran, nur eben nicht jeden Tag.
 */
async function ladeFrische(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT party_user_id, party_side, computed_at FROM deal_reliability`
    );
    const map = new Map();
    for (const r of rows) {
      map.set(`${r.party_user_id}::${r.party_side}`, new Date(r.computed_at).getTime() || 0);
    }
    return map;
  } catch {
    // Tabelle fehlt (Migration nicht eingespielt) — dann ist alles gleich frisch.
    return new Map();
  }
}

/**
 * Setzt Parteien zurueck, die aus dem Fenster gelaufen sind.
 *
 * WARUM DAS NOETIG IST
 * Beide Ladeabfragen liefern nur Parteien MIT Deals im Fenster. Wer seit
 * 366 Tagen keinen bestaetigten Deal mehr hat, taucht in keiner Gruppe auf —
 * und behielte damit seine alte Quote und den gespiegelten Ranking-Vorteil
 * fuer immer. Eine Kennzahl, die nur nach oben korrigiert werden kann, ist
 * keine Kennzahl, sondern ein Besitzstand.
 *
 * Zurueckgesetzt wird auf `NULL` (keine Aussage), NICHT auf 0 — dieselbe
 * Regel wie fuer Neulinge: keine Daten ist nicht schlecht.
 *
 * Laeuft ausschliesslich beim vollen, ungekuerzten Lauf. Bei einem
 * eingegrenzten (`userIds`) oder am Batch-Limit abgeschnittenen Lauf wuerde
 * dieselbe Logik alle NICHT gerechneten Parteien faelschlich leeren.
 */
async function setzeAusgefalleneZurueck(pool, eintraege, windowDays) {
  const ids = eintraege.map((e) => e.party_user_id);
  const seiten = eintraege.map((e) => e.party_side);

  const { rowCount: zurueckgesetzt } = await pool.query(
    `UPDATE deal_reliability d
        SET binding_deals = 0, cancellations_total = 0, cancellations_excused = 0,
            weighted_cancellations = 0, reliability_rate = NULL,
            window_days = $3, computed_at = NOW()
      WHERE NOT EXISTS (
              SELECT 1 FROM UNNEST($1::uuid[], $2::text[]) AS t(id, seite)
               WHERE t.id = d.party_user_id AND t.seite = d.party_side)
        AND (d.reliability_rate IS NOT NULL OR d.binding_deals <> 0)`,
    [ids, seiten, windowDays]
  );

  // Der Spiegel muss mitziehen, sonst bleibt der Ranking-Vorteil im Feed stehen,
  // obwohl die Quelle der Wahrheit ihn laengst zurueckgenommen hat.
  const agenturIds = eintraege.filter((e) => e.party_side === "agency").map((e) => e.party_user_id);
  const { rowCount: entspiegelt } = await pool.query(
    `UPDATE supplier_reputation sr
        SET deal_success_rate = NULL, updated_at = NOW()
      WHERE sr.deal_success_rate IS NOT NULL
        AND NOT EXISTS (
              SELECT 1 FROM UNNEST($1::uuid[]) AS t(id) WHERE t.id = sr.supplier_id)`,
    [agenturIds]
  );

  return { zurueckgesetzt: zurueckgesetzt || 0, entspiegelt: entspiegelt || 0 };
}

/**
 * Rechnet die Zuverlaessigkeitsquote neu und schreibt sie.
 *
 * Idempotent: derselbe Lauf auf unveraenderten Daten erzeugt identische Werte
 * (der Upsert ueberschreibt, er addiert nicht). Es gibt bewusst keinen Lock —
 * die Kennzahl ist eine reine Ableitung, ein doppelter Lauf schadet nicht.
 *
 * @param {import('pg').Pool} pool
 * @param {{windowDays?:number, userIds?:string[], limit?:number}} [opts]
 * @returns {Promise<{updated:number, mirrored:number, parties:number,
 *                    truncated:boolean, window_days:number}>}
 */
export async function recomputeReliability(pool, opts = {}) {
  const windowDays = clampFenster(opts.windowDays);
  const userIds = normalisiereIds(opts.userIds);
  const limit = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number(opts.limit) || DEFAULT_BATCH_SIZE)
  );

  const [nennerZeilen, stornoZeilen, frische] = await Promise.all([
    ladeNenner(pool, { windowDays, userIds }),
    ladeStornoKlassen(pool, { windowDays, userIds }),
    ladeFrische(pool)
  ]);

  const alle = fasseKennzahlenZusammen(nennerZeilen, stornoZeilen, windowDays);
  // Wer am laengsten nicht gerechnet wurde, kommt zuerst; noch nie gerechnete
  // Parteien ganz nach vorn. Bei gleicher Frische entscheidet die Groesse.
  //
  // Nach `binding_deals DESC` zu sortieren waere der naheliegende Griff und
  // genau der Fehler: ein Lauf am Batch-Limit erwischte dann in JEDEM Lauf
  // dieselbe Spitzengruppe, und der Rest bekaeme nie eine Quote. Frische
  // rotiert die Menge, also kommt garantiert jeder dran.
  alle.sort((a, b) => {
    const fa = frische.get(`${a.party_user_id}::${a.party_side}`) ?? 0;
    const fb = frische.get(`${b.party_user_id}::${b.party_side}`) ?? 0;
    if (fa !== fb) return fa - fb;
    return b.binding_deals - a.binding_deals;
  });
  const eintraege = alle.slice(0, limit);
  const truncated = alle.length > eintraege.length;

  const updated = await schreibeKennzahlen(pool, eintraege);
  const mirrored = await spiegleNachReputation(pool, eintraege);

  // Nur der volle, ungekuerzte Lauf darf aufraeumen — sonst leert ein
  // eingegrenzter oder abgeschnittener Lauf fremde Zeilen.
  let aufgeraeumt = { zurueckgesetzt: 0, entspiegelt: 0 };
  if (!userIds && !truncated) {
    aufgeraeumt = await setzeAusgefalleneZurueck(pool, eintraege, windowDays);
  }

  return {
    updated,
    mirrored,
    parties: eintraege.length,
    truncated,
    window_days: windowDays,
    reset: aufgeraeumt.zurueckgesetzt,
    unmirrored: aufgeraeumt.entspiegelt
  };
}

/**
 * Ereignisgetriebener Nachlauf: rechnet genau die betroffene Partei neu.
 *
 * Wird nach einem Storno gerufen, damit die Folge sofort spuerbar ist und nicht
 * erst nach dem naechsten Cron-Lauf. Wirft nie — eine fehlgeschlagene Kennzahl
 * darf einen erfolgreichen Storno nicht rueckgaengig machen.
 *
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{logger?:object}} [deps]
 */
export async function refreshReliabilityForUser(pool, userId, deps = {}) {
  if (!userId) return null;
  try {
    return await recomputeReliability(pool, { userIds: [userId], limit: 2 });
  } catch (err) {
    deps.logger?.warn?.({ err, userId }, "Zuverlaessigkeitsquote konnte nicht nachgerechnet werden");
    return null;
  }
}

/**
 * Wie lange ist eine Partei schon storno-frei? Grundlage des
 * Zuverlaessigkeits-Bounty (P8 Welle C).
 *
 * Bewusst hier und nicht im Bounty-Service: „ein Storno zaehlt" ist EINE Regel
 * (E1/E2 + Verbindlichkeit), und sie steht in `gewichteStorno`. Ein Bounty, das
 * sie nachbaut, driftet beim ersten Regelwechsel von der Quote weg — dann
 * behauptet die Oberflaeche zwei verschiedene Wahrheiten ueber denselben
 * Vorgang.
 *
 * ZWEI GETRENNTE ZEITRAEUME, UND DAS IST ABSICHT
 * `windowDays` ist der Streak (wie lange sauber?), `dealWindowDays` der
 * Nachweis, dass ueberhaupt Geschaeft stattfand. Beide zu koppeln war der
 * erste Entwurf und ein Fehler: eine Stufe „90 Tage sauber bei 3 Abschluessen
 * IN DIESEN 90 TAGEN" ist fuer einen verlaesslichen Partner mit ruhigem
 * Geschaeft unerreichbar — er haelt dann die 365-Tage-Stufe, waehrend die
 * leichtere 90-Tage-Stufe gesperrt bleibt. Das liest sich als Defekt und
 * bestraft genau die geringe Frequenz, die E4 ausdruecklich schonen wollte.
 * Mit festem Nachweisfenster ist die Leiter monoton: wer die lange Stufe hat,
 * hat die kurze zwangslaeufig auch.
 *
 * Zurueckgegeben wird je (Partei, Seite):
 *   binding_deals              — verbindliche Deals im NACHWEIS-Fenster
 *   last_counted_cancellation  — juengster Storno MIT Gewicht > 0, oder null
 *   days_clean                 — Tage seit diesem Storno; ohne Storno die volle
 *                                Streak-Fensterlaenge
 *
 * @param {import('pg').Pool} pool
 * @param {string[]} userIds
 * @param {{windowDays?:number, dealWindowDays?:number}} [opts]
 * @returns {Promise<Map<string, object>>} Schluessel `${userId}::${side}`
 */
export async function ladeZuverlaessigkeitsStreak(pool, userIds, opts = {}) {
  const ids = normalisiereIds(userIds);
  const windowDays = clampFenster(opts.windowDays ?? 90);
  const dealWindowDays = clampFenster(opts.dealWindowDays ?? FENSTER_TAGE);
  const ergebnis = new Map();
  if (!ids) return ergebnis;

  const schluessel = (id, seite) => `${id}::${seite}`;
  const hole = (id, seite) => {
    const k = schluessel(id, seite);
    if (!ergebnis.has(k)) {
      ergebnis.set(k, {
        party_user_id: id, party_side: seite,
        window_days: windowDays, deal_window_days: dealWindowDays,
        binding_deals: 0, last_counted_cancellation: null, days_clean: windowDays
      });
    }
    return ergebnis.get(k);
  };

  try {
    const nenner = await ladeNenner(pool, { windowDays: dealWindowDays, userIds: ids });
    for (const r of nenner) {
      if (!r?.party_user_id) continue;
      hole(r.party_user_id, r.party_side).binding_deals += Number(r.binding_deals) || 0;
    }

    // Einzelzeilen statt Gruppierung: fuer den Streak zaehlt der ZEITPUNKT des
    // juengsten zaehlenden Stornos, den eine Gruppierung wegwerfen wuerde. Die
    // Menge ist durch das kurze Fenster und die Parteiliste eng begrenzt.
    const { rows } = await pool.query(
      `SELECT CASE WHEN c.cancelled_by_side = 'agency'
                   THEN o.supplier_company_id
                   ELSE d.requester_company_id END AS party_user_id,
              c.cancelled_by_side AS party_side,
              c.reason_code, c.from_status, c.lead_time_hours, c.created_at
         FROM offer_cancellations c
         JOIN offers o          ON o.id = c.offer_id
         JOIN demand_requests d ON d.id = o.demand_request_id
        WHERE c.created_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND (CASE WHEN c.cancelled_by_side = 'agency'
                    THEN o.supplier_company_id
                    ELSE d.requester_company_id END) = ANY($2::uuid[])
        ORDER BY c.created_at DESC`,
      [windowDays, ids]
    );

    const jetzt = Date.now();
    for (const r of rows) {
      if (!r?.party_user_id) continue;
      // DIESELBE Regel wie die Quote — nicht nachgebaut, aufgerufen.
      if (gewichteStorno({
        reason_code: r.reason_code,
        cancelled_by_side: r.party_side,
        lead_time_hours: r.lead_time_hours,
        from_status: r.from_status
      }) <= 0) continue;

      const eintrag = hole(r.party_user_id, r.party_side);
      // ORDER BY created_at DESC: der erste zaehlende Treffer ist der juengste.
      if (eintrag.last_counted_cancellation) continue;
      eintrag.last_counted_cancellation = r.created_at;
      const tage = (jetzt - new Date(r.created_at).getTime()) / 86400000;
      eintrag.days_clean = Math.max(0, Math.floor(tage));
    }
  } catch {
    // Tabellen fehlen (Migration nicht eingespielt) — dann gibt es keinen
    // Streak-Nachweis. Ein Bounty ohne Nachweis wird nicht vergeben.
    return new Map();
  }

  return ergebnis;
}

/**
 * Wie `refreshReliabilityForUser`, ermittelt die Partei aber selbst aus dem
 * Angebot. Der Aufrufer (Storno-Pfad) kennt nur Angebot und Seite; die Zuordnung
 * Seite -> Konto gehoert in diesen Service, damit sie nicht an drei Stellen
 * abweichend nachgebaut wird.
 *
 * @param {import('pg').Pool} pool
 * @param {string} offerId
 * @param {'company'|'agency'} side
 * @param {{logger?:object}} [deps]
 */
export async function refreshReliabilityForOfferParty(pool, offerId, side, deps = {}) {
  if (!offerId || !side) return null;
  try {
    const { rows } = await pool.query(
      `SELECT CASE WHEN $2::text = 'agency'
                   THEN o.supplier_company_id
                   ELSE d.requester_company_id END AS party_user_id
         FROM offers o
         JOIN demand_requests d ON d.id = o.demand_request_id
        WHERE o.id = $1`,
      [offerId, side]
    );
    const partyUserId = rows?.[0]?.party_user_id;
    if (!partyUserId) return null;
    return await recomputeReliability(pool, { userIds: [partyUserId], limit: 2 });
  } catch (err) {
    deps.logger?.warn?.({ err, offerId, side }, "Zuverlaessigkeitsquote nach Storno nicht nachgerechnet");
    return null;
  }
}

/**
 * Liest die Quote einer Partei. Liefert `null`, wenn nie gerechnet wurde —
 * die Oberflaeche muss "noch keine Daten" von "schlechte Quote" unterscheiden
 * koennen.
 *
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {'company'|'agency'} side
 */
export async function getReliability(pool, userId, side) {
  if (!userId || !side) return null;
  try {
    const { rows } = await pool.query(
      `SELECT party_user_id, party_side, window_days, binding_deals,
              cancellations_total, cancellations_excused, weighted_cancellations,
              reliability_rate, computed_at
         FROM deal_reliability
        WHERE party_user_id = $1 AND party_side = $2`,
      [userId, side]
    );
    return rows[0] || null;
  } catch {
    // Tabelle fehlt (Migration noch nicht eingespielt) — kein Grund, einen
    // Lesepfad zu killen.
    return null;
  }
}

/**
 * Aggregat-Audit fuer den Cron-Lauf. Getrennt vom Rechnen, damit der Service
 * ohne Audit-Kontext testbar bleibt.
 */
export async function auditRecompute(pool, ergebnis) {
  if (!ergebnis || ergebnis.parties <= 0) return;
  await auditLog.writeAudit(pool, {
    action: "deal.reliability_recomputed",
    entity_type: "deal_reliability",
    details: {
      parties: ergebnis.parties,
      updated: ergebnis.updated,
      mirrored: ergebnis.mirrored,
      truncated: ergebnis.truncated,
      window_days: ergebnis.window_days
    }
  });
}
