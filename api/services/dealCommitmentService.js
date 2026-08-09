/**
 * Verbindlichkeits-Vorschau (P8 Welle D).
 *
 * WOZU
 * Welle D macht den Moment des Abschlusses und den des Stornos spuerbar. Der
 * Hebel ist nicht die Zahl der Klicks — drei Bestaetigungsschritte ohne
 * benannte Folge sind Buerokratie und erzeugen Klick-Blindheit. Der Hebel ist,
 * dass der letzte Schritt sagt, WAS ES KOSTET (Leitentscheidung 3.4).
 *
 * DESHALB RECHNET DIESER SERVICE UND ERFINDET NICHTS
 * Gate D verlangt ausdruecklich: die Folge stammt aus den echten Werten der
 * Welle B, nicht aus festem Text. Ein Modal, das eine Konsequenz androht, die
 * es nicht gibt, ist schlimmer als keins — beim ersten folgenlosen Storno lernt
 * der Nutzer, dass die Warnung gelogen war. Alles hier kommt aus
 * `deal_reliability`, `offer_cancellations` und dem Bounty-Katalog.
 *
 * LESEND, NICHT HANDELND
 * Beide Funktionen sind reine Vorschauen: kein Audit, keine Mutation. Dasselbe
 * Muster wie `capacityOfferMatchService.checkOfferCoverage` — eine Vorschau ist
 * keine Handlung.
 */

import * as dealAgreementService from "./dealAgreementService.js";
import * as reliability from "./dealReliabilityService.js";
import { dateOnlyDE } from "../utils/dateDE.js";

/** Die Gruende, die der Storno-Dialog zur Auswahl stellt (Quelle: Welle A). */
export const STORNO_GRUENDE = dealAgreementService.CANCELLATION_REASONS;

/** Menschenlesbare Beschriftung je Grund. Bewusst hier und nicht im Frontend:
 *  Grund-Liste und Beschriftung duerfen nicht auseinanderlaufen. */
export const GRUND_LABELS = Object.freeze({
  customer_cancelled: "Unser Kunde hat abgesagt",
  worker_sick:        "Die Kraft ist erkrankt",
  worker_quit:        "Die Kraft ist abgesprungen",
  date_moved:         "Der Termin wurde verschoben",
  mistake:            "Fehleingabe",
  other:              "Anderer Grund"
});

/**
 * Welche Seite ist der Nutzer in diesem Deal? `null` heisst: unbeteiligt.
 * Die Seite kommt NIE aus dem Request-Rumpf — sonst koennte sich der
 * Stornierende als die andere Partei ausgeben (dieselbe Regel wie in Welle A).
 */
export function seiteVon(full, userId) {
  if (!full || !userId) return null;
  if (full.supplier_company_id === userId) return "agency";
  if (full.requester_company_id === userId) return "company";
  return null;
}

/* ── Die Folgen: der eigentliche Inhalt von Schritt 3 ───────────────────── */

/**
 * Was ein Storno diese Partei kosten wuerde — gerechnet, nicht behauptet.
 *
 * Liefert je moeglichem Grund das Gewicht und die Quote DANACH. Der Nutzer
 * sieht damit schwarz auf weiss, dass "Kunde hat abgesagt" ihn nichts kostet
 * und "Kraft abgesprungen, 12 Stunden vorher" doppelt zaehlt. Genau diese
 * Spreizung ist der erzieherische Teil.
 *
 * @param {import('pg').Pool} pool
 * @param {{partyUserId:string, side:'company'|'agency', startDatum:string|null,
 *          jetzt?:Date}} args
 */
export async function berechneStornoFolgen(pool, args) {
  const { partyUserId, side, startDatum } = args;
  const jetzt = args.jetzt instanceof Date ? args.jetzt : new Date();

  const vorlaufStunden = dealAgreementService.berechneVorlaufStunden(startDatum, jetzt);
  const klasse = reliability.vorlaufKlasse(vorlaufStunden);

  const zeile = await reliability.getReliability(pool, partyUserId, side);
  const verbindlicheDeals = Number(zeile?.binding_deals) || 0;
  const bisher = Number(zeile?.weighted_cancellations) || 0;
  const quoteAktuell = zeile?.reliability_rate != null ? Number(zeile.reliability_rate) : null;

  // Nach dem Storno waechst der Nenner um diesen Deal mit — er ist verbindlich
  // geworden, sonst gaebe es hier nichts zu stornieren.
  const nennerDanach = Math.max(1, verbindlicheDeals);

  const proGrund = STORNO_GRUENDE.map((reason_code) => {
    const gewicht = reliability.gewichteStorno({
      reason_code,
      cancelled_by_side: side,
      vorlauf_klasse: klasse,
      from_status: "confirmed"
    });
    return {
      reason_code,
      label: GRUND_LABELS[reason_code] || reason_code,
      gewicht,
      zaehlt: gewicht > 0,
      quote_danach: reliability.berechneQuote({
        bindingDeals: nennerDanach,
        weightedCancellations: bisher + gewicht
      })
    };
  });

  const bounties = await bountiesInGefahr(pool, partyUserId, jetzt);

  return {
    vorlauf_stunden: vorlaufStunden,
    vorlauf_klasse: klasse,
    einsatz_beginn: dateOnlyDE(startDatum),
    quote_aktuell: quoteAktuell,
    verbindliche_deals: verbindlicheDeals,
    quote_sichtbar_ab: reliability.MINDEST_DEALS,
    // Ehrlich benennen, wenn es (noch) keine Aussage gibt: unter der Schwelle
    // aendert ein Storno die ANZEIGE nicht — er zaehlt aber trotzdem mit und
    // wirkt, sobald die Schwelle erreicht ist.
    quote_hat_aussage: quoteAktuell != null,
    gruende: proGrund,
    bounties_in_gefahr: bounties,
    rabatt_in_gefahr_pct: bounties.reduce((s, b) => s + b.discount_pct, 0)
  };
}

/**
 * Welche aktiven Bounties haengen an einem sauberen Streak — und ab wann waeren
 * sie nach einem Storno wieder da?
 *
 * Bewusst nur `reliability_streak`: andere Bounties (Treue, Community) beruehrt
 * ein Storno nicht, und sie hier mitzuzaehlen waere eine uebertriebene Drohung.
 */
async function bountiesInGefahr(pool, userId, jetzt) {
  try {
    const { rows } = await pool.query(
      `SELECT b.key, b.name_de, b.discount_pct, b.threshold_value
         FROM user_bounties ub
         JOIN bounties b ON b.id = ub.bounty_id
        WHERE ub.user_id = $1
          AND ub.is_active = TRUE
          -- Ohne diesen Filter droht der Storno-Dialog mit einem Rabatt, den es
          -- seit dem Abschalten des Bounties (Mig 166) gar nicht mehr gibt.
          -- Eine Warnung, die uebertreibt, verliert beim zweiten Mal ihre Wirkung.
          AND b.is_active
          -- Dasselbe gilt fuer den Kampagnenzeitraum (Mig 167): ausserhalb des
          -- Fensters ueberspringt evaluateBounties den Eintrag und kann die
          -- Vergabe gar nicht mehr entziehen — es steht also nichts auf dem Spiel.
          AND (b.available_from  IS NULL OR b.available_from  <= $2::date)
          AND (b.available_until IS NULL OR b.available_until >= $2::date)
          AND b.threshold_type = 'reliability_streak'
        ORDER BY b.sort_order`,
      [userId, dateOnlyDE(jetzt) || dateOnlyDE(new Date())]
    );
    return rows.map((r) => {
      const tage = Number(r.threshold_value?.days) || 90;
      return {
        key: r.key,
        name: r.name_de,
        discount_pct: Number(r.discount_pct) || 0,
        tage,
        wieder_ab: dateOnlyDE(new Date(jetzt.getTime() + tage * 86400000))
      };
    });
  } catch {
    // Bounty-Tabellen fehlen (Testumgebung) — dann wird nichts gedroht.
    return [];
  }
}

/* ── Operative Auswirkung eines Stornos ─────────────────────────────────── */

/**
 * Wen und was trifft der Storno konkret? Schritt 2 des Storno-Dialogs.
 * Schema-tolerant: fehlende Staffing-Tabellen duerfen die Vorschau nicht
 * killen, sie zeigen dann eben null.
 */
async function operativeAuswirkung(pool, full) {
  const ergebnis = {
    assignment_id: full.assignment_id || null,
    einsatz_beginn: dateOnlyDE(full.assignment_start || full.start_confirmed || full.demand_start),
    zugewiesene_kraefte: 0,
    reservierungen: 0,
    einladungen: 0,
    messbar: false
  };
  if (!full.assignment_id) return ergebnis;

  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM worker_assignment_links
           WHERE assignment_id = $1 AND is_active = TRUE)                       AS kraefte,
         (SELECT COUNT(*)::int FROM assignment_staffing_reservations
           WHERE assignment_id = $1 AND status IN ('reserved','pending'))        AS reservierungen,
         (SELECT COUNT(*)::int FROM assignment_staffing_invites
           WHERE assignment_id = $1
             AND status IN ('sent','viewed','interested','accepted'))            AS einladungen`,
      [full.assignment_id]
    );
    ergebnis.zugewiesene_kraefte = rows[0]?.kraefte || 0;
    ergebnis.reservierungen = rows[0]?.reservierungen || 0;
    ergebnis.einladungen = rows[0]?.einladungen || 0;
    ergebnis.messbar = true;
  } catch { /* Staffing-Tabellen fehlen — Vorschau bleibt ohne Zahlen */ }

  return ergebnis;
}

/* ── Die beiden Vorschauen ──────────────────────────────────────────────── */

function preisBlock(full) {
  const wert = full.offered_hourly_rate ?? full.price_value ?? null;
  return {
    typ: full.price_type || (full.offered_hourly_rate != null ? "hourly" : null),
    wert: wert != null ? Number(wert) : null,
    min: full.price_min != null ? Number(full.price_min) : null,
    max: full.price_max != null ? Number(full.price_max) : null,
    abrechnungseinheit: full.billing_unit || null
  };
}

/**
 * Drei Schritte fuer den Abschluss.
 *
 * Schritt 1 (Was) beantwortet den haeufigsten Streit — "das habe ich anders
 * verstanden". Schritt 2 (Wer & Wie) laesst auffallen, wenn nicht besetzt
 * werden kann, und zwar VOR der Zusage. Schritt 3 nennt die Folge.
 *
 * @returns {Promise<object|{error:string}>}
 */
export async function buildCommitmentPreview(pool, offerId, userId, opts = {}) {
  const full = await dealAgreementService.getAgreementDetails(pool, offerId);
  if (!full) return { error: "NOT_FOUND" };
  const side = seiteVon(full, userId);
  if (!side) return { error: "FORBIDDEN" };

  const startDatum = full.start_confirmed || full.demand_start || null;
  const [folgen, operativ] = await Promise.all([
    berechneStornoFolgen(pool, {
      partyUserId: userId, side, startDatum, jetzt: opts.jetzt
    }),
    operativeAuswirkung(pool, full)
  ]);

  return {
    offer_id: offerId,
    side,
    agreement_ref: full.agreement_ref || null,
    agreement_status: full.agreement_status || "none",
    schritt1_was: {
      leistung: full.demand_title || full.capacity_title || full.demand_role || null,
      rolle: full.demand_role || full.capacity_role || null,
      zeitraum: {
        von: dateOnlyDE(startDatum),
        bis: dateOnlyDE(full.end_date || full.demand_end)
      },
      menge: full.offered_quantity ?? full.demand_headcount ?? null,
      ort: full.demand_location || full.capacity_location || null,
      preis: preisBlock(full),
      schichtmodell: full.shift_model || null
    },
    schritt2_wer_wie: {
      benoetigt: full.demand_headcount ?? full.offered_quantity ?? null,
      bereits_zugewiesen: operativ.zugewiesene_kraefte,
      reserviert: operativ.reservierungen,
      offene_einladungen: operativ.einladungen,
      besetzung_messbar: operativ.messbar,
      ansprechpartner: {
        unternehmen: full.requester_company_name || null,
        agentur: full.supplier_company_name || null,
        kontakt_name: full.contact_name || null,
        kontakt_telefon: full.contact_phone || null
      },
      ersatz_sla_minuten: full.replacement_sla_minutes ?? null
    },
    schritt3_verbindlichkeit: folgen
  };
}

/**
 * Zwei Schritte fuer den Storno: Grund waehlen, Auswirkung sehen, bestaetigen.
 *
 * @returns {Promise<object|{error:string}>}
 */
export async function buildCancellationImpact(pool, offerId, userId, opts = {}) {
  const full = await dealAgreementService.getAgreementDetails(pool, offerId);
  if (!full) return { error: "NOT_FOUND" };
  const side = seiteVon(full, userId);
  if (!side) return { error: "FORBIDDEN" };

  const startDatum = full.start_confirmed || full.demand_start || null;
  const [folgen, operativ] = await Promise.all([
    berechneStornoFolgen(pool, {
      partyUserId: userId, side, startDatum, jetzt: opts.jetzt
    }),
    operativeAuswirkung(pool, full)
  ]);

  return {
    offer_id: offerId,
    side,
    agreement_ref: full.agreement_ref || null,
    agreement_status: full.agreement_status || "none",
    gegenseite: side === "agency"
      ? (full.requester_company_name || null)
      : (full.supplier_company_name || null),
    operativ,
    folgen
  };
}
