/**
 * Der Rabattfall eines Kunden — Welle K1.2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEANTWORTET WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Welchen Rabatt bekommt Kunde X naechsten Monat, warum, und wie greife ich
 * ein?" — auf diese Frage hatte das Staff Control Center bisher keine Antwort.
 * Es verwaltet den KATALOG (`GET/POST /bounty-catalog`), also die Regel. Den
 * EINZELFALL sah niemand: nicht welche Bounties ein Kunde haelt, nicht welcher
 * Deckel gilt, nicht ob die Ermittlung fuer ihn schon einmal ausgefallen ist.
 *
 * Diese Datei fuegt die Antwort aus den Quellen zusammen, die es laengst gibt:
 *
 *   Bounties      `getUserBounties`      was er haelt (auch beendete, gekennzeichnet)
 *   Satz + Deckel `getUserDiscountDetail` was daraus wird — DIESELBE Abfrage,
 *                                        die auch die Rechnung benutzt, samt
 *                                        Rohsumme, Obergrenze und Stufen-Befund
 *   Abrechnung    `naechsteAbrechnung`   Nettobetrag der naechsten Rechnung
 *   Rechnungen    `invoices`             was tatsaechlich berechnet wurde
 *   Ausfaelle     K1.1                   wo die Ermittlung still versagt hat
 *   Eingriffe     K1.4                   was ein Mensch daran geaendert hat
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM KEINE ZWEITE RECHENREGEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Versuchung waere, den Satz hier "aus den Bounties zu berechnen" — das
 * waere schneller und ergaebe fast immer dieselbe Zahl. FAST. Eine Flaeche, die
 * anders rechnet als die Rechnung, ist schlimmer als gar keine Flaeche: sie
 * behauptet eine Wahrheit, die auf keinem Beleg steht. Genau das ist beim Bauen
 * dieser Welle einmal passiert und vom Test „benutzt DIESELBE Funktion wie die
 * Rechnung" gefangen worden: die Rohsumme aus der Bounty-Liste addiert eine
 * andere Menge als die Rechnung, weil die Liste bewusst auch beendete Vergaben
 * enthaelt. Deshalb wird hier `getUserDiscountDetail` aufgerufen und sonst nichts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCHICHTUNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diese Datei darf `recurringBillingService` importieren; der Abrechnungslauf
 * importiert SIE nicht. Nur diese Richtung — sonst entstuende ein Modul-Kreis.
 */

import { getUserBounties, getUserDiscountDetail } from "./bountyService.js";
import { naechsteAbrechnung } from "./recurringBillingService.js";
import { berechneRabatt } from "./invoiceService.js";
import { ausfaelleFuerNutzer } from "./rabattAusfallService.js";
import { eingriffeFuerNutzer, offenenEingriffLesen, eingriffVorschau } from "./rabattEingriffService.js";
// Welle K2: die Werbepraemie gehoert in den Einzelfall — sonst sieht das Team
// einen Rabatt, dessen Quelle es nicht erklaeren kann.
import { praemienFuerNutzer, werbepraemieFuerLauf } from "./werbepraemieService.js";

/**
 * Die Kundenliste der Flaeche: wer haelt einen Rabatt, wo hakt es.
 *
 * Der Satz wird hier NICHT je Kunde ueber `getUserDiscount` bestimmt — das waeren
 * bei 300 Kunden 600 Abfragen (N+1). Stattdessen rechnet EINE mengenbasierte
 * Abfrage dieselbe Regel: Summe der aktiven Bounties, gedeckelt von der Stufe,
 * Voreinstellung 8 ohne Stufe. Die Einzelfall-Ansicht ruft danach die echte
 * Funktion auf — dort ist es eine Abfrage, und dort zaehlt die Genauigkeit.
 *
 * Damit die beiden nicht auseinanderlaufen koennen, haelt
 * `api/test/rabattWirdSichtbar.test.js` die Listenregel gegen `getUserDiscount`.
 */
export async function rabattFaelle(pool, opts = {}) {
  const grenze = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const versatz = Math.max(0, Number(opts.offset) || 0);
  const suche = String(opts.suche || "").trim();
  const nurAuffaellige = opts.nurAuffaellige === true;

  const werte = [grenze, versatz];
  let sucheKlausel = "";
  if (suche) {
    werte.push(`%${suche}%`);
    sucheKlausel = ` AND (u.email ILIKE $${werte.length} OR o.name ILIKE $${werte.length})`;
  }

  const { rows } = await pool.query(
    `WITH summe AS (
       SELECT ub.user_id, COALESCE(SUM(b.discount_pct), 0) AS roh, COUNT(*) AS bounties
         FROM user_bounties ub
         JOIN bounties b ON b.id = ub.bounty_id
        WHERE ub.is_active = TRUE AND b.is_active
        GROUP BY ub.user_id
     ),
     offen AS (
       SELECT user_id, COUNT(*) AS ausfaelle_offen, MAX(zuletzt_am) AS letzter_ausfall
         FROM rabatt_ausfaelle
        GROUP BY user_id
     ),
     eingriff AS (
       SELECT user_id, COUNT(*) FILTER (WHERE verbraucht_am IS NULL) AS eingriffe_offen
         FROM rabatt_eingriffe
        GROUP BY user_id
     )
     SELECT u.id AS user_id, u.email, o.id AS org_id, o.name AS org_name,
            s.plan, s.status AS abo_status, s.current_period_end,
            COALESCE(summe.roh, 0) AS roh_pct,
            COALESCE(summe.bounties, 0) AS bounties,
            COALESCE(bt.max_discount_pct, 8) AS deckel_pct,
            LEAST(COALESCE(bt.max_discount_pct, 8), COALESCE(summe.roh, 0)) AS satz_pct,
            ubt.tier_key, bt.name_de AS stufe_name,
            COALESCE(offen.ausfaelle_offen, 0) AS ausfaelle,
            offen.letzter_ausfall,
            COALESCE(eingriff.eingriffe_offen, 0) AS eingriffe_offen
       FROM users u
       JOIN subscriptions s ON s.user_id = u.id AND s.status IN ('active','past_due') AND s.plan <> 'DEMO'
       LEFT JOIN summe    ON summe.user_id = u.id
       LEFT JOIN offen    ON offen.user_id = u.id
       LEFT JOIN eingriff ON eingriff.user_id = u.id
       LEFT JOIN user_bounty_tiers ubt ON ubt.user_id = u.id
       LEFT JOIN bounty_tiers bt ON bt.key = ubt.tier_key
       LEFT JOIN org_memberships om ON om.user_id = u.id AND om.role_key = 'owner' AND om.is_active = TRUE
       LEFT JOIN organizations o ON o.id = om.org_id
      WHERE (COALESCE(summe.bounties, 0) > 0
             OR COALESCE(offen.ausfaelle_offen, 0) > 0
             OR COALESCE(eingriff.eingriffe_offen, 0) > 0)
        ${nurAuffaellige ? "AND (COALESCE(offen.ausfaelle_offen,0) > 0 OR COALESCE(eingriff.eingriffe_offen,0) > 0)" : ""}
        ${sucheKlausel}
      ORDER BY COALESCE(offen.ausfaelle_offen, 0) DESC,
               COALESCE(eingriff.eingriffe_offen, 0) DESC,
               satz_pct DESC, u.email ASC
      LIMIT $1 OFFSET $2`,
    werte
  );

  return {
    items: rows.map((r) => ({
      user_id: r.user_id,
      email: r.email,
      org_id: r.org_id,
      org_name: r.org_name,
      plan: r.plan,
      abo_status: r.abo_status,
      periode_endet: r.current_period_end,
      bounties: Number(r.bounties),
      roh_pct: Number(r.roh_pct),
      deckel_pct: Number(r.deckel_pct),
      satz_pct: Number(r.satz_pct),
      gedeckelt: Number(r.roh_pct) > Number(r.deckel_pct),
      stufe: r.tier_key ? { key: r.tier_key, name: r.stufe_name } : null,
      ausfaelle: Number(r.ausfaelle),
      letzter_ausfall: r.letzter_ausfall,
      eingriffe_offen: Number(r.eingriffe_offen)
    })),
    limit: grenze,
    offset: versatz,
    /* Die Grenze wird genannt statt verschwiegen — eine abgeschnittene Liste
     * liest sich sonst wie "das sind alle". */
    weitere: rows.length >= grenze
  };
}

/**
 * Der vollstaendige Einzelfall.
 *
 * @returns {Promise<object|null>} `null`, wenn es den Nutzer nicht gibt.
 */
export async function rabattFall(pool, userId) {
  const { rows: nutzer } = await pool.query(
    `SELECT u.id, u.email, u.created_at,
            o.id AS org_id, o.name AS org_name
       FROM users u
       LEFT JOIN org_memberships om ON om.user_id = u.id AND om.role_key = 'owner' AND om.is_active = TRUE
       LEFT JOIN organizations o ON o.id = om.org_id
      WHERE u.id = $1`,
    [userId]
  );
  const u = nutzer[0];
  if (!u) return null;

  /* EINE Abfrage, zwei Sichten: `satz` ist genau die Zahl, die auf der Rechnung
   * landet, `roh`/`deckel` erklaeren sie. Die Rohsumme aus der Bounty-Liste zu
   * addieren waere eine zweite Rechenregel — und genau die ist beim Bauen
   * dieser Welle einmal danebengegangen: die Liste enthaelt bewusst auch
   * beendete Vergaben, also kam eine andere Summe heraus als die Rechnung
   * benutzt. Der Test „benutzt DIESELBE Funktion wie die Rechnung" haelt das
   * fest. */
  const detail = await getUserDiscountDetail(pool, userId);
  const satz = detail.satz;
  const deckel = detail.deckel;
  const tier = detail.stufe;
  const stufenFehler = detail.stufenFehler;

  const bounties = await getUserBounties(pool, userId);

  const abrechnung = await naechsteAbrechnung(pool, userId);
  const netto = abrechnung?.netto_cents ?? null;

  const { rows: rechnungen } = await pool.query(
    `SELECT id, invoice_number, status, issued_at, due_at,
            billing_period_start, billing_period_end,
            gross_amount_cents, amount_cents, total_cents,
            discount_pct, discount_amount_cents, discount_source
       FROM invoices
      WHERE user_id = $1
      ORDER BY issued_at DESC NULLS LAST
      LIMIT 6`,
    [userId]
  );

  const ausfaelle = await ausfaelleFuerNutzer(pool, userId);
  const eingriffe = await eingriffeFuerNutzer(pool, userId);
  const offenerEingriff = await offenenEingriffLesen(pool, userId);
  const praemien = await praemienFuerNutzer(pool, userId);
  // `werbepraemieFuerLauf` wirft nie und nennt im `grund`, warum nichts faellig
  // ist — genau die Auskunft, die eine Flaeche braucht, um "geprueft, nichts da"
  // von "nicht geprueft" zu unterscheiden.
  const werbung = await werbepraemieFuerLauf(pool, userId);

  /* Was beim naechsten Lauf tatsaechlich angesetzt wuerde — inklusive eines
   * offenen Eingriffs. Genau die Zahl, die `abrechnungsEntscheidung` bilden
   * wird; hier nur zusammengesetzt, nicht neu erfunden. */
  const satzNaechsterLauf = Math.min(
    100,
    satz
      + (offenerEingriff ? (Number(offenerEingriff.zusatz_pct) || 0) : 0)
      + (werbung.praemie ? (Number(werbung.satz) || 0) : 0)
  );

  return {
    kunde: {
      user_id: u.id, email: u.email, seit: u.created_at,
      org_id: u.org_id, org_name: u.org_name
    },
    satz: {
      // `satz_pct` ist die Wahrheit der Rechnung: Summe, gedeckelt.
      satz_pct: satz,
      roh_pct: detail.roh,
      deckel_pct: deckel,
      gedeckelt: detail.gedeckelt,
      // Der Unterschied zwischen "hat keine Stufe" und "die Stufen-Abfrage kam
      // nicht durch" — bis Welle K1.1 war er nicht sichtbar (siehe K1.1).
      stufe: tier ? { key: tier.tier_key, name: tier.name_de, max_discount_pct: deckel } : null,
      stufe_ausgefallen: stufenFehler || null,
      satz_naechster_lauf_pct: satzNaechsterLauf
    },
    bounties: bounties.map((b) => ({
      key: b.key, name: b.name_de, kategorie: b.category,
      discount_pct: Number(b.discount_pct) || 0,
      zaehlt: Boolean(b.is_active && b.bounty_is_active),
      vergabe_aktiv: Boolean(b.is_active),
      katalog_aktiv: Boolean(b.bounty_is_active),
      inactive_reason: b.inactive_reason || null,
      progress: Number(b.progress) || 0,
      earned_at: b.earned_at || null
    })),
    abrechnung: abrechnung
      ? {
          ...abrechnung,
          rabatt_cents: netto === null ? null : berechneRabatt(netto, satzNaechsterLauf).betragCents,
          zahlbetrag_netto_cents: netto === null
            ? null
            : netto - berechneRabatt(netto, satzNaechsterLauf).betragCents
        }
      : null,
    rechnungen,
    ausfaelle,
    eingriffe,
    offener_eingriff: offenerEingriff,
    praemien,
    werbepraemie: werbung.praemie
      ? { ...werbung.praemie, satz_pct: Number(werbung.satz) }
      : null,
    werbepraemie_grund: werbung.grund || null
  };
}

/**
 * Die Wirkungsvorschau eines Eingriffs fuer diesen Kunden — mit dem Nettobetrag
 * seiner naechsten Rechnung.
 *
 * Der Nettobetrag wird HIER aufgeloest und nicht von der Oberflaeche mitgeschickt.
 * Ein Betrag, der aus dem Browser kaeme, waere genau das freie Feld, das
 * Abschnitt 3a ausschliesst.
 */
export async function eingriffVorschauFuerNutzer(pool, userId, bountyKey) {
  const abrechnung = await naechsteAbrechnung(pool, userId);
  if (!abrechnung || abrechnung.netto_cents === null) {
    return {
      ok: false, code: "KEINE_ABRECHNUNG",
      grund: "Fuer diesen Kunden ist kein abrechenbares Abo mit aufloesbarem Preis hinterlegt — "
           + "ein Rabatt haette nichts, worauf er wirken koennte."
    };
  }
  const vorschau = await eingriffVorschau(pool, {
    userId, bountyKey, nettoCents: abrechnung.netto_cents
  });
  return { ...vorschau, abrechnung };
}
