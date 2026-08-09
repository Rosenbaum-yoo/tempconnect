/**
 * Bounty-Service: Gamification, Loyalitaets-Rabatte, Meilensteine.
 *
 * Evaluates bounty conditions against live data, awards/revokes bounties,
 * computes discount totals and provides value-report data.
 */

import { getActiveReferralCount } from "./referralProgramService.js";
import { getUserMaxDiscount, evaluateAndPromoteTier, getUserTier } from "./bountyTierService.js";
import { ladeZuverlaessigkeitsStreak } from "./dealReliabilityService.js";
import { dateOnlyDE, todayDE } from "../utils/dateDE.js";

const FALLBACK_MAX_DISCOUNT_PCT = 25;

/* ── Verfuegbarkeit eines Katalog-Eintrags ─────────────────────
 *
 * Zwei Hebel, bewusst mit unterschiedlicher Wirkung — sonst gibt es nur einen
 * groben Schalter fuer zwei sehr verschiedene Absichten:
 *
 *   is_active = FALSE            Not-Aus. Das Bounty ist weg: keine neue Vergabe,
 *                                kein Rabatt, laufende Vergaben werden entzogen.
 *   available_from/until (Mig 167)  Zeitplan. Bestimmt, WANN man es verdienen kann.
 *                                Wer es innerhalb des Fensters verdient hat, behaelt
 *                                es danach.
 *
 * Warum das Fenster nur das Verdienen begrenzt: einem zahlenden Kunden einen
 * bereits gewaehrten Rabatt still wegzunehmen, weil eine Aktion ausgelaufen ist,
 * ist ein Support-Vorfall. Wer eine Aktion wirklich sofort beenden muss, hat den
 * Not-Aus — und der sagt genau das, was er tut.
 */
export function istVerfuegbar(bounty, heute = todayDE()) {
  if (!bounty) return false;
  const von = dateOnlyDE(bounty.available_from);
  const bis = dateOnlyDE(bounty.available_until);
  if (von && heute < von) return false;
  if (bis && heute > bis) return false;
  return true;
}

/** Klartext, warum ein Eintrag gerade nicht verdienbar ist (oder null). */
export function verfuegbarkeitsHinweis(bounty, heute = todayDE()) {
  const von = dateOnlyDE(bounty?.available_from);
  const bis = dateOnlyDE(bounty?.available_until);
  const tag = (iso) => iso.split("-").reverse().join(".");
  if (von && heute < von) return `Diese Aktion startet am ${tag(von)}.`;
  if (bis && heute > bis) return `Diese Aktion ist am ${tag(bis)} ausgelaufen.`;
  return null;
}

/* ── Bounty Catalog ────────────────────────────────────────── */

export async function getBountyCatalog(pool, opts = {}) {
  // Abgeschaltete Bounties (`is_active = FALSE`, Migration 166) werden weder
  // geprueft noch angezeigt. Ihre Historie in `user_bounties` bleibt erhalten,
  // damit eine spaetere Wiedereinschaltung nichts neu erfinden muss.
  const { rows } = await pool.query(
    opts.includeInactive
      ? `SELECT * FROM bounties ORDER BY sort_order`
      : `SELECT * FROM bounties WHERE is_active ORDER BY sort_order`
  );
  return rows;
}

/* ── Verwaltungssicht (Owner Control Center) ───────────────────
 *
 * Bewusst mit Vergabe-Zahlen: "abschalten" ist ohne die Antwort auf "wie viele
 * Kunden haelt das gerade?" eine Blindentscheidung. Die Zahl steht deshalb neben
 * dem Schalter und nicht in einem Bericht, den niemand vorher oeffnet.
 */
export async function ladeVerwaltungsKatalog(pool) {
  const { rows } = await pool.query(
    `SELECT b.id, b.key, b.name_de, b.description_de, b.category, b.icon,
            b.discount_pct, b.threshold_type, b.threshold_value, b.is_recurring,
            b.is_active, b.inactive_reason, b.available_from, b.available_until,
            b.sort_order, b.updated_at,
            COUNT(ub.id) FILTER (WHERE ub.is_active)::int AS aktive_vergaben,
            COUNT(ub.id)::int                              AS vergaben_gesamt
       FROM bounties b
       LEFT JOIN user_bounties ub ON ub.bounty_id = b.id
      GROUP BY b.id
      ORDER BY b.sort_order`
  );

  const heute = todayDE();
  return rows.map((b) => ({
    key: b.key,
    name_de: b.name_de,
    description_de: b.description_de,
    category: b.category,
    icon: b.icon,
    discount_pct: Number(b.discount_pct),
    threshold_type: b.threshold_type,
    threshold_value: b.threshold_value,
    is_recurring: b.is_recurring,
    is_active: b.is_active,
    inactive_reason: b.inactive_reason || null,
    available_from: dateOnlyDE(b.available_from),
    available_until: dateOnlyDE(b.available_until),
    // Der abgeleitete Zustand gehoert in die Antwort, nicht in die Oberflaeche:
    // sonst rechnet jede Ansicht die Regel neu und die erste weicht ab.
    verdienbar: b.is_active && istVerfuegbar(b, heute),
    hinweis: b.is_active ? verfuegbarkeitsHinweis(b, heute) : (b.inactive_reason || null),
    aktive_vergaben: b.aktive_vergaben,
    vergaben_gesamt: b.vergaben_gesamt,
    updated_at: b.updated_at || null
  }));
}

/** Erlaubte Felder am Katalog-Eintrag. Alles andere braucht Code, nicht Konfiguration. */
export const SCHALTBARE_FELDER = Object.freeze([
  "is_active", "inactive_reason", "available_from", "available_until", "discount_pct"
]);

/** Rabattgrenze aus Migration 053 (CHECK discount_pct BETWEEN 0 AND 20). */
export const MAX_DISCOUNT_PCT_JE_BOUNTY = 20;

const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ein Datum muss nicht nur die richtige FORM haben, sondern im Kalender existieren.
 *
 * Die Form allein reicht nicht: "2026-13-01" besteht das Muster, wird beim
 * Schreiben aber zu Invalid Date und landete dadurch als NULL in der Spalte —
 * und NULL heisst laut Migration 167 "laeuft unbefristet". Aus einem Tippfehler
 * wurde so still eine Kampagne ohne Ende, mit Antwort 200.
 */
function istEchtesDatum(iso) {
  if (typeof iso !== "string" || !DATUM_MUSTER.test(iso)) return false;
  const [jahr, monat, tag] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  return d.getUTCFullYear() === jahr && d.getUTCMonth() === monat - 1 && d.getUTCDate() === tag;
}

/**
 * Prueft die Felder einer Katalog-Aenderung.
 *
 * Bestaetigung und Begruendung pruefen im Staff Control Center die vorgelagerten
 * Wachen (`requireConfirmAndReason`); hier geht es nur um die Fachwerte. Die
 * Pruefung liegt bewusst im Dienst und nicht in der Route: so ist sie ohne
 * HTTP-Attrappe testbar, und ein zweiter Bedienweg muesste sie nicht nachbauen.
 *
 * Gibt ein Ergebnisobjekt zurueck statt zu werfen — Hausmuster der SCC-Routen.
 */
export function pruefeKatalogAenderung(body = {}, bestand = null) {
  const key = String(body.bounty_key || "").trim();
  if (!key) {
    return { ok: false, code: "BOUNTY_KEY_REQUIRED", message: "bounty_key ist erforderlich." };
  }

  const aenderungen = {};

  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    if (typeof body.is_active !== "boolean") {
      return { ok: false, code: "IS_ACTIVE_INVALID", message: "is_active muss true oder false sein." };
    }
    aenderungen.is_active = body.is_active;
  }
  if (Object.prototype.hasOwnProperty.call(body, "inactive_reason")) {
    aenderungen.inactive_reason = String(body.inactive_reason || "").trim();
  }

  for (const feld of ["available_from", "available_until"]) {
    if (!Object.prototype.hasOwnProperty.call(body, feld)) continue;
    const wert = body[feld];
    if (wert === null || wert === "") { aenderungen[feld] = null; continue; }
    if (!istEchtesDatum(wert)) {
      return {
        ok: false, code: "DATE_INVALID",
        message: `${feld} muss ein gueltiges Datum in der Form JJJJ-MM-TT sein oder leer.`
      };
    }
    aenderungen[feld] = wert;
  }

  // Die Grenzen muessen gegen den ENDSTAND geprueft werden, nicht nur gegen das,
  // was im Request steht. Wer nur den Beginn verschiebt, waehrend in der Datenbank
  // schon ein frueheres Ende steht, wuerde sonst an der Pruefung vorbeilaufen und
  // erst am CHECK der Datenbank scheitern — als 500 statt als verstaendlicher Hinweis.
  const von = Object.prototype.hasOwnProperty.call(aenderungen, "available_from")
    ? aenderungen.available_from : (bestand?.available_from ?? null);
  const bis = Object.prototype.hasOwnProperty.call(aenderungen, "available_until")
    ? aenderungen.available_until : (bestand?.available_until ?? null);
  if (von && bis && bis < von) {
    return {
      ok: false, code: "DATE_RANGE_INVALID",
      message: `Das Ende (${bis}) liegt vor dem Beginn (${von}).`
    };
  }

  if (Object.prototype.hasOwnProperty.call(body, "discount_pct")) {
    const roh = body.discount_pct;
    // Bewusst mit Typpruefung: `Number(null)` ist 0, `Number(true)` ist 1 und
    // `Number([])` ist 0. Da null bei den Datumsfeldern ausdruecklich "Feld leeren"
    // bedeutet, haette dieselbe Schreibweise hier den Rabatt still auf 0 gesetzt.
    const istZahl = typeof roh === "number"
      || (typeof roh === "string" && roh.trim() !== "" && /^-?\d+(\.\d+)?$/.test(roh.trim()));
    const pct = istZahl ? Number(roh) : NaN;
    if (!istZahl || !Number.isFinite(pct) || pct < 0 || pct > MAX_DISCOUNT_PCT_JE_BOUNTY) {
      return {
        ok: false, code: "DISCOUNT_OUT_OF_RANGE",
        message: `discount_pct muss zwischen 0 und ${MAX_DISCOUNT_PCT_JE_BOUNTY} liegen.`
      };
    }
    aenderungen.discount_pct = pct;
  }

  if (!Object.keys(aenderungen).length) {
    return { ok: false, code: "NO_CHANGES", message: "Es wurde kein aenderbares Feld uebergeben." };
  }
  return { ok: true, key, aenderungen };
}

/**
 * Aendert einen Katalog-Eintrag. Gibt den neuen Stand zurueck oder null, wenn es
 * den Schluessel nicht gibt.
 *
 * Der Entzug laufender Vergaben beim Abschalten passiert NICHT hier, sondern im
 * Trigger aus Migration 168 — damit er auch dann greift, wenn jemand den Schalter
 * per Hand-SQL umlegt. Zwei Orte fuer dieselbe Folge waeren zwei Wahrheiten.
 */
export async function aendereKatalogEintrag(pool, key, aenderungen = {}) {
  const setzen = [];
  const werte = [];
  const nimm = (spalte, wert) => {
    werte.push(wert);
    setzen.push(`${spalte} = $${werte.length}`);
  };

  if (Object.prototype.hasOwnProperty.call(aenderungen, "is_active")) {
    nimm("is_active", Boolean(aenderungen.is_active));
  }
  if (Object.prototype.hasOwnProperty.call(aenderungen, "inactive_reason")) {
    const t = String(aenderungen.inactive_reason || "").trim();
    nimm("inactive_reason", t || null);
  }
  for (const feld of ["available_from", "available_until"]) {
    if (Object.prototype.hasOwnProperty.call(aenderungen, feld)) {
      nimm(feld, dateOnlyDE(aenderungen[feld]) || null);
    }
  }
  if (Object.prototype.hasOwnProperty.call(aenderungen, "discount_pct")) {
    nimm("discount_pct", Number(aenderungen.discount_pct));
  }

  if (!setzen.length) return null;
  setzen.push("updated_at = NOW()");

  werte.push(key);
  const { rows } = await pool.query(
    `UPDATE bounties SET ${setzen.join(", ")} WHERE key = $${werte.length} RETURNING *`,
    werte
  );
  return rows[0] || null;
}

/* ── User Bounties ─────────────────────────────────────────── */

export async function getUserBounties(pool, userId) {
  const { rows } = await pool.query(
    // Bewusst OHNE Filter auf b.is_active: was ein Nutzer verdient hat, bleibt in
    // seiner Historie sichtbar, auch wenn die Aktion inzwischen beendet ist. Ein
    // Abzeichen, das kommentarlos verschwindet, liest sich wie ein Fehler oder wie
    // Wortbruch. Die Oberflaeche kennzeichnet es stattdessen als beendet — dafuer
    // reicht `bounty_is_active` mit. (Der Rabatt endet trotzdem sofort, das
    // entscheidet getUserDiscount, nicht diese Liste.)
    `SELECT ub.*, b.key, b.name_de, b.description_de, b.category, b.icon,
            b.discount_pct, b.threshold_type, b.threshold_value, b.is_recurring,
            b.is_active AS bounty_is_active, b.inactive_reason,
            b.available_from, b.available_until
     FROM user_bounties ub
     JOIN bounties b ON b.id = ub.bounty_id
     WHERE ub.user_id = $1
     ORDER BY b.sort_order`,
    [userId]
  );
  return rows;
}

/* ── Discount Calculation ──────────────────────────────────── */

export async function getUserDiscount(pool, userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(b.discount_pct), 0) AS total
     FROM user_bounties ub
     JOIN bounties b ON b.id = ub.bounty_id
     WHERE ub.user_id = $1 AND ub.is_active = TRUE AND b.is_active`,
    [userId]
  );
  const raw = Number(rows[0]?.total || 0);
  // Discount-Cap kommt vom aktuellen Tier (Bronze=8%, ..., Diamant=25%)
  let maxPct;
  try { maxPct = await getUserMaxDiscount(pool, userId); } catch { maxPct = FALLBACK_MAX_DISCOUNT_PCT; }
  return Math.min(maxPct, raw);
}

/* ── Evaluate All Bounties for a User ──────────────────────── */

export async function evaluateBounties(pool, userId) {
  const catalog = await getBountyCatalog(pool);
  // Nur die Fenster laden, die der Katalog wirklich braucht — sonst rechnet
  // jeder Aufruf Zeitraeume, die kein Bounty abfragt.
  const streakWindows = [...new Set(
    catalog
      .filter((b) => b.threshold_type === "reliability_streak")
      .map((b) => Number(b.threshold_value?.days) || 90)
  )];
  const data = await gatherUserData(pool, userId, { streakWindows });
  const results = [];
  const heute = todayDE();

  for (const bounty of catalog) {
    // Ausserhalb des Kampagnenfensters (Mig 167) wird nichts geschrieben: keine
    // neue Vergabe — aber auch kein Entzug. Ein Fenster steuert, WANN man etwas
    // verdienen kann, nicht wie lange man es behaelt. Wer sofort stoppen will,
    // nimmt den Not-Aus (is_active = FALSE), der laufende Vergaben mitnimmt.
    if (!istVerfuegbar(bounty, heute)) {
      results.push({
        key: bounty.key, earned: false, progress: 0,
        note: verfuegbarkeitsHinweis(bounty, heute)
      });
      continue;
    }

    const { earned, progress, note } = checkBountyCondition(bounty, data);

    // Upsert user_bounties
    if (earned) {
      await pool.query(
        `INSERT INTO user_bounties (user_id, bounty_id, is_active, progress, earned_at)
         VALUES ($1, $2, TRUE, $3, NOW())
         ON CONFLICT (user_id, bounty_id) DO UPDATE SET
           is_active = TRUE,
           progress = $3,
           updated_at = NOW()`,
        [userId, bounty.id, progress]
      );
    } else if (bounty.is_recurring) {
      // Wiederkehrendes Bounty nicht (mehr) erfuellt.
      //
      // Hier stand ein reines UPDATE. Das trifft nichts, solange es noch keine
      // Zeile gibt — und eine Zeile entsteht nur beim ersten Verdienen. Wer ein
      // wiederkehrendes Bounty noch nie erreicht hatte, bekam also nie einen
      // Fortschritt gespeichert: `getBountyStatus` fand keine Zeile und zeigte
      // dauerhaft "locked, 0 %", auch bei 85 % Fortschritt. Nachmessbar war das
      // daran, dass genau die fuenf nie verdienten wiederkehrenden Bounties als
      // einzige ueberhaupt keine `user_bounties`-Zeile hatten.
      //
      // GREATEST waere hier falsch: ein Streak kann legitim zurueckfallen, und
      // ein eingefrorener Hoechststand wuerde Fortschritt behaupten, den es
      // nicht mehr gibt.
      await pool.query(
        `INSERT INTO user_bounties (user_id, bounty_id, is_active, progress)
         VALUES ($1, $2, FALSE, $3)
         ON CONFLICT (user_id, bounty_id) DO UPDATE SET
           is_active = FALSE,
           progress = $3,
           updated_at = NOW()`,
        [userId, bounty.id, progress]
      );
    } else {
      // Non-recurring: just track progress
      await pool.query(
        `INSERT INTO user_bounties (user_id, bounty_id, is_active, progress)
         VALUES ($1, $2, FALSE, $3)
         ON CONFLICT (user_id, bounty_id) DO UPDATE SET
           progress = GREATEST(user_bounties.progress, $3),
           updated_at = NOW()
         WHERE user_bounties.is_active = FALSE`,
        [userId, bounty.id, progress]
      );
    }

    results.push({ key: bounty.key, earned, progress, note: note || null });
  }

  // Abloesungen (z. B. loyalty_2y schlaegt loyalty_1y, 365-Tage-Streak schlaegt 90-Tage)
  await handleReplacements(pool, userId, catalog);

  return results;
}

/* ── Gather all user data needed for evaluation ────────────── */

async function gatherUserData(pool, userId, opts = {}) {
  const data = {};

  // Basic user info
  try {
    const { rows } = await pool.query(
      `SELECT created_at, is_verified FROM users WHERE id = $1`, [userId]
    );
    data.userCreatedAt = rows[0]?.created_at || null;
  } catch { data.userCreatedAt = null; }

  // Subscription age (first active subscription)
  try {
    const { rows } = await pool.query(
      `SELECT MIN(created_at) AS first_sub FROM subscriptions
       WHERE user_id = $1 AND plan != 'DEMO'`, [userId]
    );
    data.firstSubDate = rows[0]?.first_sub || null;
  } catch { data.firstSubDate = null; }

  // Reputation data
  try {
    const { rows } = await pool.query(
      `SELECT * FROM supplier_reputation WHERE supplier_id = $1`, [userId]
    );
    data.reputation = rows[0] || null;
  } catch { data.reputation = null; }

  // Rating stats
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_ratings,
              ROUND(AVG(reliability)::numeric, 2) AS avg_reliability,
              ROUND(AVG(communication)::numeric, 2) AS avg_communication
       FROM ratings WHERE rated_id = $1`, [userId]
    );
    data.ratingStats = rows[0] || {};
  } catch { data.ratingStats = {}; }

  // Deal counts
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS completed,
         COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS canceled,
         COUNT(*) FILTER (WHERE priority = 'NOTDIENST' AND status IN ('FINALIZED','COMPLETED'))::int AS emergency_completed
       FROM requests WHERE receiver_id = $1`, [userId]
    );
    data.deals = rows[0] || {};
  } catch { data.deals = {}; }

  // Response time (90 days)
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_received,
         COUNT(*) FILTER (WHERE status NOT IN ('SENT','CREATED'))::int AS responded,
         ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)::numeric, 1) AS avg_response_minutes
       FROM requests
       WHERE receiver_id = $1 AND created_at >= NOW() - INTERVAL '90 days'`, [userId]
    );
    data.responseStats = rows[0] || {};
  } catch { data.responseStats = {}; }

  // Active listings (capacity_posts)
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS active FROM capacity_posts
       WHERE supplier_company_id = $1 AND status = 'active'`, [userId]
    );
    data.activeListings = rows[0]?.active || 0;
  } catch { data.activeListings = 0; }

  // Ratings given
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS given FROM ratings WHERE rater_id = $1`, [userId]
    );
    data.ratingsGiven = rows[0]?.given || 0;
  } catch { data.ratingsGiven = 0; }

  // Leaderboard percentile
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM supplier_reputation WHERE grade != 'UNRATED'`
    );
    const total = rows[0]?.total || 0;
    if (total > 0 && data.reputation) {
      const { rows: rankRows } = await pool.query(
        `SELECT COUNT(*)::int AS rank FROM supplier_reputation
         WHERE reputation_score >= $1 AND grade != 'UNRATED'`,
        [data.reputation.reputation_score || 0]
      );
      data.percentileRank = Math.round(((rankRows[0]?.rank || total) / total) * 100);
    } else {
      data.percentileRank = 100;
    }
  } catch { data.percentileRank = 100; }

  // Referral count (fuer Community-Bounty)
  try {
    data.referralCount = await getActiveReferralCount(pool, userId);
  } catch { data.referralCount = 0; }

  // Zuverlaessigkeits-Streak je Fenster (P8 Welle C).
  //
  // Die Quelle ist `dealReliabilityService` — dieselbe, aus der die
  // Zuverlaessigkeitsquote entsteht. Ein Bounty, das "ohne Storno" selbst
  // definiert, driftet beim ersten Regelwechsel von der angezeigten Quote weg;
  // dann behauptet dieselbe Oberflaeche zwei Wahrheiten ueber denselben Vorgang.
  data.reliabilityStreaks = new Map();
  for (const days of opts.streakWindows || []) {
    try {
      // Der Nachweis "es gab ueberhaupt Geschaeft" laeuft bewusst ueber ein
      // festes Jahr, nicht ueber die Streak-Laenge — sonst waere die kurze
      // Stufe fuer ruhige Partner unerreichbar, waehrend sie die lange halten.
      data.reliabilityStreaks.set(days, await ladeZuverlaessigkeitsStreak(
        pool, [userId], { windowDays: days, dealWindowDays: 365 }
      ));
    } catch { data.reliabilityStreaks.set(days, new Map()); }
  }

  // Mentoring sessions completed (as mentor)
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM mentoring_sessions WHERE mentor_id = $1 AND status = 'completed'`,
      [userId]
    );
    data.mentoringCount = rows[0]?.count || 0;
  } catch { data.mentoringCount = 0; }

  return data;
}

/* ── Check individual bounty condition ─────────────────────── */

/** Tagesdatum in deutscher Schreibweise, Zeitzone Europe/Berlin. */
function tagDE(wert) {
  const iso = dateOnlyDE(wert);
  return iso ? iso.split("-").reverse().join(".") : "unbekannt";
}

function checkBountyCondition(bounty, data) {
  const tv = bounty.threshold_value || {};

  switch (bounty.threshold_type) {
    case 'avg_reliability_6m': {
      const avg = Number(data.ratingStats?.avg_reliability || 0);
      const total = Number(data.ratingStats?.total_ratings || 0);
      const needed = tv.min_stars || 4.5;
      return { earned: avg >= needed && total >= 5, progress: Math.min(100, (avg / needed) * 100) };
    }
    case 'top_percentile_12m': {
      const pct = data.percentileRank || 100;
      const needed = tv.percentile || 10;
      return { earned: pct <= needed, progress: Math.min(100, ((100 - pct) / (100 - needed)) * 100) };
    }
    // P8 Welle C. Loest `zero_complaints_12m` ab, das `requests.status='CANCELED'`
    // zaehlte — den FALSCHEN Storno-Kanal. `requests` ist der Alt-Pfad; dort
    // wird 'CANCELED' zwar geschrieben (PATCH /api/requests/:id ->
    // releaseReservationAndSetStatus), aber der Agreement-Storno
    // (dealAgreementService.cancelAgreement) fasst die Tabelle nie an. Wer eine
    // Einsatzvereinbarung kurz vor Beginn platzen liess, behielt deshalb 3 %
    // Rabatt fuer "null Stornos". Der alte Fall ist bewusst ERSATZLOS entfernt:
    // laeuft eine Datenbank ohne Migration 165, faellt das Bounty weg statt
    // weiter am falschen Kanal gemessen zu werden.
    case 'reliability_streak': {
      const days = Number(tv.days) || 90;
      const minDeals = Number(tv.min_binding_deals) || 3;
      const proFenster = data.reliabilityStreaks?.get(days);
      if (!proFenster) return { earned: false, progress: 0 };

      // Nur Marktseiten, auf denen die Partei ueberhaupt Geschaeft gemacht hat.
      const relevant = [...proFenster.values()].filter((e) => e.binding_deals > 0);
      if (!relevant.length) {
        return {
          earned: false, progress: 0,
          note: `Noch keine verbindlichen Abschluesse in den letzten ${days} Tagen.`
        };
      }

      const maxDeals = Math.max(...relevant.map((e) => e.binding_deals));
      const minSauber = Math.min(...relevant.map((e) => e.days_clean));
      const dealAnteil = Math.min(50, (maxDeals / minDeals) * 50);
      const sauberAnteil = Math.min(50, (minSauber / days) * 50);
      const progress = Math.round(dealAnteil + sauberAnteil);

      if (maxDeals < minDeals) {
        return {
          earned: false, progress,
          note: `Noch ${minDeals - maxDeals} verbindliche Abschluesse bis zur Freischaltung.`
        };
      }

      // Wer auf EINER Seite unzuverlaessig ist, ist kein zuverlaessiger Partner —
      // auch wenn die andere Seite sauber ist.
      const mitStorno = relevant
        .filter((e) => e.days_clean < days && e.last_counted_cancellation)
        .sort((a, b) => new Date(b.last_counted_cancellation) - new Date(a.last_counted_cancellation));

      if (mitStorno.length) {
        const juengster = mitStorno[0];
        const wiederAb = new Date(new Date(juengster.last_counted_cancellation).getTime() + days * 86400000);
        return {
          earned: false, progress,
          note: `Entfallen durch Storno am ${tagDE(juengster.last_counted_cancellation)}. `
              + `Baut sich neu auf und ist ab ${tagDE(wiederAb)} wieder verfuegbar.`
        };
      }

      return {
        earned: true, progress: 100,
        note: `${days} Tage ohne gewichteten Storno bei ${maxDeals} verbindlichen Abschluessen.`
      };
    }
    case 'avg_communication': {
      const avg = Number(data.ratingStats?.avg_communication || 0);
      const total = Number(data.ratingStats?.total_ratings || 0);
      const needed = tv.min_stars || 4.8;
      const minRatings = tv.min_ratings || 20;
      const starProg = Math.min(50, (avg / needed) * 50);
      const ratingProg = Math.min(50, (total / minRatings) * 50);
      return { earned: avg >= needed && total >= minRatings, progress: starProg + ratingProg };
    }
    case 'completed_deals': {
      const completed = Number(data.deals?.completed || 0);
      const needed = tv.min_deals || 50;
      return { earned: completed >= needed, progress: Math.min(100, (completed / needed) * 100) };
    }
    case 'response_time_3m': {
      const avgMin = Number(data.responseStats?.avg_response_minutes || 999);
      const total = Number(data.responseStats?.total_received || 0);
      const responded = Number(data.responseStats?.responded || 0);
      const rate = total > 0 ? (responded / total) * 100 : 0;
      const maxMin = tv.max_minutes || 30;
      const minRate = tv.min_rate || 90;
      return { earned: avgMin <= maxMin && rate >= minRate && total >= 5, progress: Math.min(100, ((maxMin / Math.max(1, avgMin)) * 50) + ((rate / minRate) * 50)) };
    }
    case 'emergency_deals': {
      const completed = Number(data.deals?.emergency_completed || 0);
      const needed = tv.min_deals || 10;
      return { earned: completed >= needed, progress: Math.min(100, (completed / needed) * 100) };
    }
    case 'active_listings_6m': {
      const active = data.activeListings || 0;
      const needed = tv.min_listings || 5;
      return { earned: active >= needed, progress: Math.min(100, (active / needed) * 100) };
    }
    case 'subscription_age': {
      const firstSub = data.firstSubDate ? new Date(data.firstSubDate) : null;
      if (!firstSub) return { earned: false, progress: 0 };
      const monthsActive = (Date.now() - firstSub.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      const needed = tv.months || 12;
      return { earned: monthsActive >= needed, progress: Math.min(100, (monthsActive / needed) * 100) };
    }
    case 'registration_before': {
      const created = data.userCreatedAt ? new Date(data.userCreatedAt) : null;
      const deadline = new Date(tv.before || '2027-01-01');
      return { earned: created && created < deadline, progress: created && created < deadline ? 100 : 0 };
    }
    case 'referrals': {
      const refCount = data.referralCount || 0;
      const needed = tv.min_referrals || 5;
      return { earned: refCount >= needed, progress: Math.min(100, (refCount / needed) * 100) };
    }
    case 'ratings_given': {
      const given = data.ratingsGiven || 0;
      const needed = tv.min_ratings || 50;
      return { earned: given >= needed, progress: Math.min(100, (given / needed) * 100) };
    }
    case 'mentoring': {
      const mentoringCount = data.mentoringCount || 0;
      // Der Katalog konfiguriert `min_mentored` (3), gelesen wurde `min_sessions`.
      // Den Schluessel gibt es dort nicht, also griff still der Default 5:
      // beworben waren 3 Mentorings, verlangt wurden 5. Beide Schreibweisen
      // werden jetzt akzeptiert, der Katalogwert gewinnt.
      const needed = Number(tv.min_mentored ?? tv.min_sessions) || 3;
      return { earned: mentoringCount >= needed, progress: Math.min(100, (mentoringCount / needed) * 100) };
    }
    default:
      return { earned: false, progress: 0 };
  }
}

/* ── Handle bounty replacements (e.g. 2y replaces 1y) ──────── */

async function handleReplacements(pool, userId, catalog) {
  // Die Abloesung steht als `replaces` im Katalog (Migration 053 fuer
  // loyalty_2y -> loyalty_1y, Migration 165 fuer zero_complaint ->
  // zuverlaessiger_partner). Frueher stand das Paar hier fest verdrahtet —
  // ein zweites Paar haette den Rabatt still verdoppelt, weil niemand die
  // Funktion angefasst haette.
  try {
    const eintraege = catalog?.length ? catalog : await getBountyCatalog(pool);
    const paare = eintraege
      .map((b) => ({ sieger: b.key, verlierer: b.threshold_value?.replaces }))
      .filter((p) => p.verlierer);
    if (!paare.length) return;

    const { rows } = await pool.query(
      `SELECT b.key FROM user_bounties ub
       JOIN bounties b ON b.id = ub.bounty_id
       WHERE ub.user_id = $1 AND ub.is_active = TRUE AND b.is_active`,
      [userId]
    );
    const aktiv = new Set(rows.map((r) => r.key));
    const abzuloesen = [...new Set(
      paare.filter((p) => aktiv.has(p.sieger) && aktiv.has(p.verlierer)).map((p) => p.verlierer)
    )];
    if (!abzuloesen.length) return;

    await pool.query(
      `UPDATE user_bounties SET is_active = FALSE, updated_at = NOW()
       WHERE user_id = $1
         AND bounty_id IN (SELECT id FROM bounties WHERE key = ANY($2::text[]))`,
      [userId, abzuloesen]
    );
  } catch { /* non-critical */ }
}

/* ── Milestones ────────────────────────────────────────────── */

const MILESTONES = [
  { key: 'first_match',      label: 'Erster erfolgreicher Match',       icon: '🎯', check: d => (d.deals?.completed || 0) >= 1 },
  { key: 'matches_10',       label: '10 erfolgreiche Matches',          icon: '🔟', check: d => (d.deals?.completed || 0) >= 10 },
  { key: 'matches_50',       label: '50 erfolgreiche Matches',          icon: '🏆', check: d => (d.deals?.completed || 0) >= 50 },
  { key: 'matches_100',      label: '100 erfolgreiche Matches',         icon: '💎', check: d => (d.deals?.completed || 0) >= 100 },
  { key: 'first_rating',     label: 'Erste Bewertung erhalten',         icon: '⭐', check: d => (d.ratingStats?.total_ratings || 0) >= 1 },
  { key: 'ratings_given_50', label: '50 Bewertungen abgegeben',         icon: '📝', check: d => (d.ratingsGiven || 0) >= 50 },
  { key: 'member_1y',        label: '1 Jahr auf TempConnect',           icon: '🎂', check: d => { if (!d.userCreatedAt) return false; return (Date.now() - new Date(d.userCreatedAt).getTime()) > 365.25*24*60*60*1000; } },
  { key: 'member_2y',        label: '2 Jahre auf TempConnect',          icon: '🏅', check: d => { if (!d.userCreatedAt) return false; return (Date.now() - new Date(d.userCreatedAt).getTime()) > 2*365.25*24*60*60*1000; } },
  { key: 'top_10_pct',       label: 'Top 10% der Plattform',            icon: '👑', check: d => (d.percentileRank || 100) <= 10 },
  { key: 'blitz_response',   label: 'Blitz-Responder (Ø < 30 Min)',     icon: '🚀', check: d => (d.responseStats?.avg_response_minutes || 999) <= 30 && (d.responseStats?.total_received || 0) >= 5 },
];

export async function checkAndAwardMilestones(pool, userId) {
  const data = await gatherUserData(pool, userId);
  const awarded = [];

  for (const m of MILESTONES) {
    if (!m.check(data)) continue;
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO user_milestones (user_id, milestone_key, milestone_label, icon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, milestone_key) DO NOTHING`,
        [userId, m.key, m.label, m.icon]
      );
      if (rowCount > 0) {
        awarded.push(m);
        // Insert notification
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, link_path, created_at)
             VALUES ($1, 'milestone', $2, $3, '/public/bounties.html', NOW())`,
            [userId, "Meilenstein erreicht", m.label]
          );
        } catch { /* notifications table may not exist */ }
      }
    } catch { /* milestone already exists */ }
  }

  return awarded;
}

export async function getUserMilestones(pool, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM user_milestones WHERE user_id = $1 ORDER BY reached_at`, [userId]
  );
  return rows;
}

/* ── Value Report (ROI Dashboard) ──────────────────────────── */

export async function getValueReport(pool, userId) {
  const report = {};

  // Successful matches
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total_matches
       FROM requests WHERE (requester_id = $1 OR receiver_id = $1)
         AND status IN ('FINALIZED','COMPLETED')`, [userId]
    );
    report.total_matches = rows[0]?.total_matches || 0;
  } catch { report.total_matches = 0; }

  // Average fill time (hours from created to finalized)
  try {
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600)::numeric, 1) AS avg_hours
       FROM requests WHERE (requester_id = $1 OR receiver_id = $1)
         AND status IN ('FINALIZED','COMPLETED')`, [userId]
    );
    report.avg_fill_hours = rows[0]?.avg_hours ? Number(rows[0].avg_hours) : null;
  } catch { report.avg_fill_hours = null; }

  // Estimated time saved (assuming manual process = 8h per match)
  const MANUAL_HOURS_PER_MATCH = 8;
  const platformHours = report.avg_fill_hours || 4;
  report.estimated_hours_saved = Math.max(0, Math.round(report.total_matches * (MANUAL_HOURS_PER_MATCH - platformHours)));

  // Member since
  try {
    const { rows } = await pool.query(
      `SELECT created_at FROM users WHERE id = $1`, [userId]
    );
    report.member_since = rows[0]?.created_at || null;
  } catch { report.member_since = null; }

  // This month stats
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE requester_id = $1)::int AS sent_this_month,
         COUNT(*) FILTER (WHERE receiver_id = $1)::int AS received_this_month,
         COUNT(*) FILTER (WHERE status IN ('FINALIZED','COMPLETED'))::int AS matched_this_month
       FROM requests
       WHERE (requester_id = $1 OR receiver_id = $1)
         AND created_at >= date_trunc('month', NOW())`, [userId]
    );
    report.this_month = rows[0] || {};
  } catch { report.this_month = {}; }

  // Bounty discount
  report.bounty_discount_pct = await getUserDiscount(pool, userId);

  return report;
}

/* ── Full Bounty Status (catalog + user progress) ──────────── */

export async function getBountyStatus(pool, userId, opts = {}) {
  // `notes` kommt aus `evaluateBounties` und traegt den Klartext, WARUM ein
  // Bounty gerade nicht gilt ("Entfallen durch Storno am 12.08., wieder ab
  // 10.11."). Ohne diesen Satz sieht der Nutzer nur eine graue Kachel und
  // lernt nichts — dann wirkt der Anreiz nicht, weil die Folge unsichtbar ist
  // (P8 Leitentscheidung 3.4).
  const notes = opts.notes instanceof Map
    ? opts.notes
    : new Map(Object.entries(opts.notes || {}));
  // Bewusst inklusive abgeschalteter Eintraege: ein Bounty, das ein Nutzer
  // verdient hat, muss sichtbar bleiben und sich erklaeren, statt kommentarlos
  // zu fehlen. Nie verdiente abgeschaltete Eintraege werden unten aussortiert —
  // die waren nie ein Angebot an diesen Nutzer.
  const catalog = await getBountyCatalog(pool, { includeInactive: true });
  const userBounties = await getUserBounties(pool, userId);

  // Reihenfolge ist hier die Aussage: erst die Stufe neu bestimmen, DANN den
  // Rabatt. Umgekehrt wurde die Summe noch mit der alten Obergrenze gedeckelt,
  // waehrend die Antwort daneben schon die neue nannte — die Oberflaeche zeigte
  // dann "19 %" direkt neben "max. 15 %" und einen Fortschrittsbalken mit 126 %
  // Breite. Beim naechsten Laden stand ploetzlich eine andere Zahl.
  let tier = null;
  try {
    await evaluateAndPromoteTier(pool, userId);
    tier = await getUserTier(pool, userId);
  } catch { /* tier tables may not exist */ }

  const discount = await getUserDiscount(pool, userId);
  const maxPct = tier ? Number(tier.max_discount_pct) : FALLBACK_MAX_DISCOUNT_PCT;

  const userMap = new Map();
  for (const ub of userBounties) {
    userMap.set(ub.key, ub);
  }

  // Abgeloeste Stufen kenntlich machen. Ohne das erscheint die untere Stufe
  // einer Leiter als "In Arbeit, 100 %" MIT Erfolgstext, gibt aber 0 % Rabatt —
  // das liest sich wie einbehaltenes Geld. Vorher betraf das nur die seltene
  // loyalty-Leiter; mit der Zuverlaessigkeits-Leiter sieht es kuenftig jeder
  // saubere Partner.
  const abgeloestDurch = new Map();
  for (const b of catalog) {
    const verlierer = b.threshold_value?.replaces;
    if (verlierer && userMap.get(b.key)?.is_active) abgeloestDurch.set(verlierer, b);
  }

  const heute = todayDE();

  const items = catalog
    // Abgeschaltet und nie verdient = war fuer diesen Nutzer nie ein Angebot.
    .filter((b) => b.is_active || userMap.has(b.key))
    .map(b => {
      const ub = userMap.get(b.key);
      const sieger = abgeloestDurch.get(b.key);
      const verfuegbar = istVerfuegbar(b, heute);

      // Reihenfolge ist die Aussage:
      // 'retired' zuerst — ein beendetes Bounty bleibt beendet, egal was sonst gilt.
      // 'earned' vor 'unavailable' — wer es im Fenster verdient hat, behaelt es
      // auch nach Ablauf der Aktion.
      let status = 'locked';
      if (!b.is_active) status = 'retired';
      else if (ub?.is_active) status = 'earned';
      else if (sieger) status = 'superseded';
      else if (!verfuegbar) status = 'unavailable';
      else if (ub && Number(ub.progress) > 0) status = 'in_progress';

      let note = notes.get(b.key) || null;
      if (status === 'retired') {
        note = ub?.is_active || Number(ub?.progress) > 0
          ? 'Diese Aktion wurde beendet. Das Abzeichen bleibt in deiner Historie, '
            + 'gewaehrt aber keinen Rabatt mehr.'
          : 'Diese Aktion wurde beendet.';
      } else if (status === 'superseded') {
        note = `Abgeloest durch "${sieger.name_de}" — der Rabatt steckt dort.`;
      } else if (status === 'unavailable') {
        note = verfuegbarkeitsHinweis(b, heute) || note;
      }

      return {
        key: b.key,
        name_de: b.name_de,
        description_de: b.description_de,
        category: b.category,
        icon: b.icon,
        discount_pct: Number(b.discount_pct),
        is_recurring: b.is_recurring,
        status,
        progress: ub ? Number(ub.progress) : 0,
        earned_at: ub?.earned_at || null,
        superseded_by: sieger ? sieger.key : null,
        available_from: dateOnlyDE(b.available_from),
        available_until: dateOnlyDE(b.available_until),
        note
      };
    });

  return {
    items,
    total_discount_pct: discount,
    max_discount_pct: maxPct,
    tier: tier ? {
      key: tier.tier_key,
      name_de: tier.name_de,
      icon: tier.icon,
      color: tier.color,
      bg_color: tier.bg_color,
      max_discount_pct: Number(tier.max_discount_pct)
    } : null
  };
}
