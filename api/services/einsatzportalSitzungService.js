/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EINSATZPORTAL — WER WAR WANN ANGEMELDET, UND WAS WURDE GETAN (Owner 2026-10-01)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe, woertlich: „unten soll man dann auch nachweisen können im audit
 * log von wann welcher mitarbeiter das einsatzportal nutzt bis wann welche aktion
 * ausgeführt wurde".
 *
 * GEMESSEN VOR DEM BAU (laufendes System, echtes Mitarbeiter-Konto):
 *   Anmeldung und Aktionen standen mit Person und Firma im Protokoll — die
 *   Abmeldung ohne beides (die Sitzung war schon zerstoert, als das Protokoll
 *   schrieb), und ein Ende OHNE Abmeldung gar nicht. Beim Einsatzportal ist das
 *   der Normalfall: geteilter Rechner, kein „angemeldet bleiben", Fenster zu.
 *
 * WAS DIESER DIENST FESTHAELT — je Sitzung einer Einsatzkraft:
 *   begonnen_am       der Anmeldezeitpunkt (`req.session.createdAt`, gesetzt von
 *                     `stampSession` in JEDEM Anmeldeweg — Login, Einladung)
 *   zuletzt_aktiv_am  hoechstens alle 5 Minuten fortgeschrieben, bei jeder Anfrage
 *   beendet_am/ende   bei Abmeldung bzw. „ueberall abmelden"
 * Eine Sitzung ohne Ende, die laenger als die Leerlauf-Frist (8 Stunden) still ist,
 * gilt beim LESEN als abgelaufen — um „zuletzt aktiv". Kein Nachtlauf noetig.
 *
 * WAS ER BEWUSST NICHT FESTHAELT: welche Seiten jemand ansieht. Anwesenheit und
 * Aktionen — mehr verlangt der Nachweis nicht, und mehr waere Ueberwachung.
 *
 * WARUM DER BEGINN AN DER ERSTEN ANFRAGE HAENGT UND NICHT AM LOGIN-WEG
 * Es gibt mindestens zwei Anmeldewege fuer Einsatzkraefte (Login, Einladung
 * annehmen), und jeder kuenftige waere eine Stelle, an der jemand den Eintrag
 * vergisst. Die Aktivitaets-Middleware eroeffnet ihn deshalb bei der ersten
 * Anfrage der Sitzung — mit dem Zeitpunkt, den die Sitzung selbst traegt. Eine
 * Stelle, alle Wege.
 *
 * NIE WERFEN: eine Zeile, die nicht geschrieben werden kann, darf weder eine
 * Anfrage noch eine Abmeldung brechen.
 */

import crypto from "node:crypto";
import { IDLE_TIMEOUT_MS } from "./sessionSecurityService.js";
import { formatFeedItem } from "./activityFeedService.js";
import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("einsatzportalSitzungen");

/** Hoechstens so oft wird „zuletzt aktiv" fortgeschrieben (je Sitzung). */
export const AKTIV_MELDEN_ALLE_MS = 5 * 60 * 1000;
/** Hoechstzahl Sitzungen je Seite der Verwaltung. */
export const SEITE_MAX = 200;
/** Schutz gegen eine ausufernde Aktionsliste je Seite. */
const AKTIONEN_MAX = 5000;

/** SHA-256 ueber die Sitzungskennung — die Kennung selbst wird nie gespeichert. */
export function sitzungHash(sessionId) {
  if (!sessionId) return null;
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex");
}

/** Ist das eine Sitzung im Einsatzportal? Dieselbe Frage wie `requireWorkerRole`. */
export function istPortalSitzung(session) {
  return Boolean(session?.userId) && session.userRole === "worker";
}

/** Die Sitzung eroeffnen (idempotent ueber den Hash). Wirft nie. */
export async function beginnen(pool, { sessionId, userId, orgId = null, begonnenAm = null }) {
  const hash = sitzungHash(sessionId);
  if (!hash || !userId) return false;
  const beginn = Number(begonnenAm);
  try {
    await pool.query(
      `INSERT INTO einsatzportal_sitzungen (sitzung_hash, user_id, org_id, begonnen_am, zuletzt_aktiv_am)
       VALUES ($1, $2, $3,
               COALESCE(to_timestamp($4::double precision / 1000), NOW()),
               NOW())
       ON CONFLICT (sitzung_hash) DO NOTHING`,
      [hash, userId, orgId, Number.isFinite(beginn) && beginn > 0 ? beginn : null]
    );
    return true;
  } catch (err) {
    logger.warn({ err: err?.message }, "Einsatzportal-Sitzung konnte nicht eroeffnet werden");
    return false;
  }
}

/** „Zuletzt aktiv" fortschreiben — nur fuer eine noch offene Sitzung. Wirft nie. */
export async function aktivMelden(pool, sessionId) {
  const hash = sitzungHash(sessionId);
  if (!hash) return false;
  try {
    await pool.query(
      `UPDATE einsatzportal_sitzungen SET zuletzt_aktiv_am = NOW()
        WHERE sitzung_hash = $1 AND beendet_am IS NULL`,
      [hash]
    );
    return true;
  } catch (err) {
    logger.warn({ err: err?.message }, "Einsatzportal-Aktivitaet konnte nicht vermerkt werden");
    return false;
  }
}

/** Die Sitzung beenden (Abmeldung). Wirft nie. */
export async function beenden(pool, sessionId) {
  const hash = sitzungHash(sessionId);
  if (!hash) return false;
  try {
    await pool.query(
      `UPDATE einsatzportal_sitzungen
          SET beendet_am = NOW(), zuletzt_aktiv_am = NOW(), ende = 'abgemeldet'
        WHERE sitzung_hash = $1 AND beendet_am IS NULL`,
      [hash]
    );
    return true;
  } catch (err) {
    logger.warn({ err: err?.message }, "Einsatzportal-Sitzung konnte nicht beendet werden");
    return false;
  }
}

/**
 * „Ueberall abmelden": alle offenen Sitzungen des Menschen beenden — auf Wunsch
 * ausser der eigenen (`ausserSessionId`). Wirft nie.
 */
export async function alleBeenden(pool, userId, { ausserSessionId = null } = {}) {
  if (!userId) return 0;
  try {
    const { rowCount } = await pool.query(
      `UPDATE einsatzportal_sitzungen
          SET beendet_am = NOW(), ende = 'alle_abgemeldet'
        WHERE user_id = $1 AND beendet_am IS NULL
          AND ($2::text IS NULL OR sitzung_hash <> $2::text)`,
      [userId, sitzungHash(ausserSessionId)]
    );
    return rowCount;
  } catch (err) {
    logger.warn({ err: err?.message }, "Einsatzportal-Sitzungen konnten nicht beendet werden");
    return 0;
  }
}

/**
 * Wie eine Sitzung heute dasteht. REINE FUNKTION.
 *   abgemeldet       — selbst abgemeldet, `bis` ist der Zeitpunkt
 *   alle_abgemeldet  — ueber „ueberall abmelden" beendet
 *   abgelaufen       — ohne Abmeldung, laenger als die Leerlauf-Frist still;
 *                      `bis` ist „zuletzt aktiv" (auf 5 Minuten genau)
 *   offen            — ohne Abmeldung, noch innerhalb der Leerlauf-Frist; ob das
 *                      Fenster noch offen ist, weiss der Server nicht — deshalb
 *                      heisst es „offen" und nicht „angemeldet"
 */
export function bewerteSitzung(z, jetzt = Date.now()) {
  if (z.beendet_am) {
    return { status: z.ende === "alle_abgemeldet" ? "alle_abgemeldet" : "abgemeldet", bis: z.beendet_am };
  }
  const still = jetzt - new Date(z.zuletzt_aktiv_am).getTime();
  if (Number.isFinite(still) && still > IDLE_TIMEOUT_MS) {
    return { status: "abgelaufen", bis: z.zuletzt_aktiv_am };
  }
  return { status: "offen", bis: null };
}

export const SITZUNGEN_SQL = `
  SELECT s.id, s.user_id, s.begonnen_am, s.zuletzt_aktiv_am, s.beendet_am, s.ende,
         u.email,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', wp.first_name, wp.last_name)), ''),
                  NULLIF(TRIM(u.contact_person), ''), u.email) AS name
    FROM einsatzportal_sitzungen s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT w.first_name, w.last_name
        FROM worker_profiles w
       WHERE w.user_id = s.user_id
       ORDER BY w.created_at ASC
       LIMIT 1
    ) wp ON TRUE
   WHERE s.org_id = $1
     AND ($2::timestamptz IS NULL OR s.begonnen_am >= $2::timestamptz)
     AND ($3::timestamptz IS NULL OR s.begonnen_am <  $3::timestamptz)
     AND ($4::uuid IS NULL OR s.user_id = $4::uuid)
   ORDER BY s.begonnen_am DESC
   LIMIT $5 OFFSET $6`;

export const SITZUNGEN_ZAHL_SQL = `
  SELECT COUNT(*)::int AS total
    FROM einsatzportal_sitzungen s
   WHERE s.org_id = $1
     AND ($2::timestamptz IS NULL OR s.begonnen_am >= $2::timestamptz)
     AND ($3::timestamptz IS NULL OR s.begonnen_am <  $3::timestamptz)
     AND ($4::uuid IS NULL OR s.user_id = $4::uuid)`;

/*
 * Die Aktionen aller Sitzungen einer Seite in EINER Abfrage — aus demselben
 * Protokoll, das die Verwaltung ohnehin zeigt (`audit_log`), gebunden an dieselbe
 * Firma. An- und Abmeldung stehen schon als Zeitraum der Sitzung da.
 */
export const AKTIONEN_SQL = `
  SELECT a.actor_id, a.action, a.status, a.created_at
    FROM audit_log a
   WHERE a.org_id = $1
     AND a.actor_id = ANY($2::uuid[])
     AND a.created_at >= $3::timestamptz
     AND a.created_at <= $4::timestamptz
     AND a.action NOT IN ('auth.login', 'auth.logout', 'auth.logout_all')
   ORDER BY a.created_at ASC
   LIMIT ${AKTIONEN_MAX}`;

/**
 * Die Sitzungen einer Firma, neueste zuerst, je Sitzung ihre Aktionen.
 * Org-gebunden: nur Sitzungen mit `org_id = orgId`, nur Aktionen dieser Firma.
 *
 * @param {{von?: string|null, bis?: string|null, userId?: string|null, limit?: number, offset?: number, jetzt?: number}} filter
 *   `von`/`bis` als Zeitpunkte (ISO); `bis` ist ausschliesslich.
 */
export async function liste(pool, orgId, { von = null, bis = null, userId = null, limit = 50, offset = 0, jetzt = Date.now() } = {}) {
  if (!orgId) return { items: [], total: 0 };
  const grenze = Math.min(SEITE_MAX, Math.max(1, Number(limit) || 50));
  const ab = Math.max(0, Number(offset) || 0);
  const filter = [orgId, von, bis, userId];
  const [{ rows }, { rows: zahl }] = await Promise.all([
    pool.query(SITZUNGEN_SQL, [...filter, grenze, ab]),
    pool.query(SITZUNGEN_ZAHL_SQL, filter)
  ]);
  const total = zahl[0]?.total ?? 0;
  if (!rows.length) return { items: [], total };

  const fenster = rows.map((z) => {
    const b = bewerteSitzung(z, jetzt);
    const ende = b.bis ? new Date(b.bis).getTime() : jetzt;
    return { z, b, start: new Date(z.begonnen_am).getTime(), ende };
  });
  const personen = [...new Set(rows.map((z) => String(z.user_id)))];
  const von0 = new Date(Math.min(...fenster.map((f) => f.start))).toISOString();
  const bis0 = new Date(Math.max(...fenster.map((f) => f.ende))).toISOString();
  const { rows: aktionen } = await pool.query(AKTIONEN_SQL, [orgId, personen, von0, bis0]);

  const items = fenster.map(({ z, b, start, ende }) => {
    const eigene = aktionen.filter((a) => {
      if (String(a.actor_id) !== String(z.user_id)) return false;
      const t = new Date(a.created_at).getTime();
      return t >= start && t <= ende;
    });
    return {
      id: z.id,
      user_id: z.user_id,
      name: z.name,
      email: z.email,
      begonnen_am: z.begonnen_am,
      zuletzt_aktiv_am: z.zuletzt_aktiv_am,
      bis: b.bis,
      status: b.status,
      aktionen: eigene.map((a) => ({
        zeitpunkt: a.created_at,
        action: a.action,
        label: formatFeedItem({ action: a.action }).action_label,
        status: a.status
      }))
    };
  });
  return { items, total };
}

/** Wer ueberhaupt Sitzungen hat — fuer die Auswahl „Mitarbeiter" im Filter. */
export const PERSONEN_SQL = `
  SELECT p.user_id, p.name FROM (
    SELECT DISTINCT ON (s.user_id) s.user_id,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', wp.first_name, wp.last_name)), ''),
                    NULLIF(TRIM(u.contact_person), ''), u.email) AS name
      FROM einsatzportal_sitzungen s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN LATERAL (
        SELECT w.first_name, w.last_name FROM worker_profiles w
         WHERE w.user_id = s.user_id ORDER BY w.created_at ASC LIMIT 1
      ) wp ON TRUE
     WHERE s.org_id = $1
     ORDER BY s.user_id
  ) p
  ORDER BY p.name
  LIMIT 1000`;

export async function personen(pool, orgId) {
  if (!orgId) return [];
  const { rows } = await pool.query(PERSONEN_SQL, [orgId]);
  return rows.map((z) => ({ user_id: z.user_id, name: z.name }));
}

/** Ein Kalendertag (JJJJ-MM-TT) plus n Tage — ohne Uhrzeit, ohne Zeitzone. */
export function tagPlus(tag, n) {
  const [j, m, t] = String(tag).split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Aufbewahrung durchsetzen: 12 Monate ab Beginn. Die Frist steht in der
 * Datenbank (`einsatzportal_sitzungen_aufraeumen`, Migration 229), nicht hier.
 * @returns {Promise<{geloescht: number}>}
 */
export async function aufbewahrungDurchsetzen(pool) {
  const { rows } = await pool.query(`SELECT einsatzportal_sitzungen_aufraeumen() AS geloescht`);
  return { geloescht: Number(rows[0]?.geloescht) || 0 };
}

/**
 * Die Middleware: eroeffnet die Sitzung bei ihrer ersten Anfrage und schreibt
 * „zuletzt aktiv" hoechstens alle 5 Minuten fort. Nur Einsatzportal-Sitzungen;
 * fuer alle anderen kostet sie einen Vergleich.
 *
 * Muss NACH `orgContextMiddleware` haengen: die Firma kommt aus derselben Quelle
 * wie beim Protokoll (`bestimmeAuditOrg`), nicht aus der Anfrage.
 *
 * @param {{pool: import('pg').Pool, bestimmeOrg: (req: any, userId: string) => string|null, jetzt?: () => number}} deps
 */
export function aktivitaetMiddleware({ pool, bestimmeOrg, jetzt = () => Date.now() }) {
  return function einsatzportalAktivitaet(req, _res, next) {
    const s = req.session;
    if (!istPortalSitzung(s)) return next();
    const t = jetzt();
    if (!s.portalSitzungOffen) {
      s.portalSitzungOffen = true;
      s.portalAktivAm = t;
      void beginnen(pool, {
        sessionId: req.sessionID, userId: s.userId,
        orgId: bestimmeOrg(req, s.userId), begonnenAm: s.createdAt
      });
    } else if (!s.portalAktivAm || t - Number(s.portalAktivAm) >= AKTIV_MELDEN_ALLE_MS) {
      s.portalAktivAm = t;
      void aktivMelden(pool, req.sessionID);
    }
    next();
  };
}
