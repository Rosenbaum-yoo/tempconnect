/**
 * Freischaltungen — die Hebel aus `config/freischaltHebel.js` lesen, zeigen und
 * umlegen (W-E10, Staff Control Center, 2026-10-01).
 *
 * Gespeichert wird in `feature_overrides` ueber `featureOverrideService` — es gibt
 * keine zweite Tabelle und keinen zweiten Leser. Dieser Dienst legt nur fest, WAS
 * dort hinein darf und wie es fuer einen Menschen aussieht:
 *
 *   - nur Hebel, die ein Verbraucher im Code wirklich liest (sonst HEBEL_UNBEKANNT)
 *   - eine Ausnahme fuer EINEN Kunden nur auf der Seite, auf der der Hebel wirkt
 *     (sonst FALSCHE_SEITE) und immer mit Ende, hoechstens ein Jahr
 *   - VOR jeder Aenderung die Wirkung: was gilt heute fuer diesen Kunden, und
 *     woher (Standard, plattformweiter Schalter, eigene Ausnahme)
 *   - Eintraege, die nichts bewirken (unbekannter Schluessel, abgelaufen, falsche
 *     Seite), werden als solche gezeigt statt als Freischaltung
 */
import { FREISCHALT_HEBEL, MAX_TAGE_JE_AUSNAHME, hebel as hebelVon } from "../config/freischaltHebel.js";
import { upsertOverride, deleteOverride } from "./featureOverrideService.js";
import { todayDE, dateOnlyDE } from "../utils/dateDE.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

const SEITEN_NAME = { agency: "Zeitarbeitsfirma", company: "Unternehmen" };

export const FEHLER = Object.freeze({
  HEBEL_UNBEKANNT: { status: 400, message: "Diesen Schalter gibt es nicht — angeboten wird nur, was im Code wirklich gelesen wird." },
  ORG_UNGUELTIG: { status: 400, message: "Die Firmenkennung ist ungültig." },
  ORG_NICHT_GEFUNDEN: { status: 404, message: "Diese Firma gibt es nicht." },
  FALSCHE_SEITE: { status: 400, message: "Dieser Schalter wirkt auf der anderen Seite." },
  ZUSTAND_FEHLT: { status: 400, message: "An oder aus? Bitte ausdrücklich wählen." },
  ABLAUF_PFLICHT: { status: 400, message: `Eine Ausnahme für eine Firma braucht ein Ende (höchstens ${MAX_TAGE_JE_AUSNAHME} Tage).` },
  ABLAUF_UNGUELTIG: { status: 400, message: "Das Ende ist kein gültiges Datum." },
  ABLAUF_VERGANGEN: { status: 400, message: "Das Ende liegt in der Vergangenheit." },
  ABLAUF_ZU_WEIT: { status: 400, message: `Das Ende liegt mehr als ${MAX_TAGE_JE_AUSNAHME} Tage in der Zukunft.` }
});

function fehler(code, message) {
  return { ok: false, code, status: FEHLER[code].status, message: message || FEHLER[code].message };
}

/** Tage zwischen zwei Kalenderdaten (YYYY-MM-DD), ohne Zeitzonen-Spiel. */
export function tageZwischen(von, bis) {
  const [a, b] = [von, bis].map((d) => {
    const [j, m, t] = d.split("-").map(Number);
    return Date.UTC(j, m - 1, t);
  });
  return Math.round((b - a) / 86400000);
}

/**
 * Das Ende eines Kalendertags in Europe/Berlin, als Zeitstempel-Text, den
 * Postgres versteht. Die Ausnahme gilt damit den GANZEN genannten Tag — auch
 * an den Tagen der Zeitumstellung, weil Postgres die Zone selbst aufloest statt
 * dass hier ein fester Versatz geraten wird.
 */
export function ablaufAus(giltBis) {
  return giltBis ? `${giltBis} 23:59:59.999 Europe/Berlin` : null;
}

/**
 * Prueft einen Aenderungswunsch, ohne die Datenbank zu fragen. `heute` ist
 * einstellbar, damit die Grenzen ohne Uhr getestet werden koennen.
 */
export function pruefeSetzen(body, { heute = todayDE() } = {}) {
  const key = typeof body?.hebel === "string" ? body.hebel.trim() : "";
  if (!hebelVon(key)) return fehler("HEBEL_UNBEKANNT");

  const orgRoh = body?.org_id;
  const orgId = orgRoh == null || orgRoh === "" ? null : String(orgRoh);
  if (orgId && !UUID_RE.test(orgId)) return fehler("ORG_UNGUELTIG");

  if (typeof body?.enabled !== "boolean") return fehler("ZUSTAND_FEHLT");

  const bisRoh = body?.gilt_bis;
  const giltBis = bisRoh == null || bisRoh === "" ? null : String(bisRoh);
  if (orgId && !giltBis) return fehler("ABLAUF_PFLICHT");
  if (giltBis) {
    if (!DATUM_RE.test(giltBis) || Number.isNaN(Date.parse(giltBis))) return fehler("ABLAUF_UNGUELTIG");
    const tage = tageZwischen(heute, giltBis);
    if (tage < 0) return fehler("ABLAUF_VERGANGEN");
    if (tage > MAX_TAGE_JE_AUSNAHME) return fehler("ABLAUF_ZU_WEIT");
  }

  return { ok: true, werte: { key, orgId, enabled: body.enabled, giltBis } };
}

function hebelAnsicht(key) {
  const h = FREISCHALT_HEBEL[key];
  return { key, name: h.name, wirkung: h.wirkung, aus_bedeutet: h.aus_bedeutet, standard: h.standard, seite: h.seite };
}

/**
 * Was gilt HEUTE — fuer eine Firma oder plattformweit (orgId = null).
 * Dieselbe Rangfolge wie `checkOverride`: die eigene Ausnahme vor dem
 * plattformweiten Schalter, abgelaufene Eintraege zaehlen nicht.
 */
async function standHeute(pool, key, orgId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, enabled, expires_at
       FROM feature_overrides
      WHERE feature_key = $1
        AND (org_id = $2 OR org_id IS NULL)
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY org_id IS NULL ASC
      LIMIT 1`,
    [key, orgId]
  );
  const r = rows[0];
  if (!r) return { enabled: FREISCHALT_HEBEL[key].standard, quelle: "standard", gilt_bis: null, eintrag_id: null };
  return {
    enabled: r.enabled === true,
    quelle: r.org_id ? "firma" : "plattform",
    gilt_bis: r.expires_at ? dateOnlyDE(r.expires_at) : null,
    eintrag_id: r.id
  };
}

/**
 * Die Wirkungsvorschau: wen betrifft es, was gilt heute, und — beim
 * plattformweiten Schalter — wie viele Firmen eine eigene Ausnahme haben, die
 * davon unberuehrt bleibt.
 */
export async function wirkung(pool, { key, orgId = null }) {
  if (!hebelVon(key)) return fehler("HEBEL_UNBEKANNT");
  if (orgId && !UUID_RE.test(String(orgId))) return fehler("ORG_UNGUELTIG");
  const h = FREISCHALT_HEBEL[key];

  let org = null;
  if (orgId) {
    const { rows } = await pool.query("SELECT id, name, type FROM organizations WHERE id = $1", [orgId]);
    if (!rows[0]) return fehler("ORG_NICHT_GEFUNDEN");
    org = { id: rows[0].id, name: rows[0].name, type: rows[0].type };
    if (h.seite && org.type !== h.seite) {
      return fehler("FALSCHE_SEITE",
        `${h.name} wirkt nur bei einer ${SEITEN_NAME[h.seite] || h.seite}. ` +
        `${org.name} ist ${org.type === "company" ? "ein Unternehmen" : "eine " + (SEITEN_NAME[org.type] || org.type)} — die Ausnahme würde nichts bewirken.`);
    }
  }

  const heute = await standHeute(pool, key, orgId);
  let eigeneAusnahmen = null;
  if (!orgId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM feature_overrides
        WHERE feature_key = $1 AND org_id IS NOT NULL
          AND (expires_at IS NULL OR expires_at > NOW())`,
      [key]
    );
    eigeneAusnahmen = rows[0]?.n ?? 0;
  }

  return { ok: true, hebel: hebelAnsicht(key), org, heute, eigene_ausnahmen: eigeneAusnahmen };
}

function eintragAnsicht(r, jetzt) {
  const h = hebelVon(r.feature_key);
  const abgelaufen = !!(r.expires_at && new Date(r.expires_at).getTime() <= jetzt);
  const falscheSeite = !!(h && r.org_id && h.seite && r.org_type && r.org_type !== h.seite);
  let warum = null;
  if (!h) warum = "Kein Code liest diesen Schlüssel — der Eintrag bewirkt nichts.";
  else if (abgelaufen) warum = "Abgelaufen.";
  else if (falscheSeite) warum = `Wirkt nur bei einer ${SEITEN_NAME[h.seite] || h.seite}.`;
  return {
    id: r.id,
    hebel: r.feature_key,
    hebel_name: h ? h.name : null,
    org_id: r.org_id,
    org_name: r.org_name || null,
    org_type: r.org_type || null,
    enabled: r.enabled === true,
    grund: r.reason || null,
    gilt_bis: r.expires_at ? dateOnlyDE(r.expires_at) : null,
    gesetzt_am: r.created_at,
    gesetzt_von: r.created_by_email || null,
    wirkt: !warum,
    warum_nicht: warum
  };
}

const EINTRAEGE_SQL = `
  SELECT fo.id, fo.org_id, fo.feature_key, fo.enabled, fo.reason, fo.expires_at, fo.created_at,
         o.name AS org_name, o.type AS org_type, u.email AS created_by_email
    FROM feature_overrides fo
    LEFT JOIN organizations o ON o.id = fo.org_id
    LEFT JOIN users u ON u.id = fo.created_by`;

/**
 * Die ganze Seite in einer Antwort: die Hebel mit ihrem heutigen Stand und alle
 * Eintraege, je mit "wirkt" oder "warum nicht". Begrenzt auf 500 Eintraege —
 * die Tabelle waechst mit Ausnahmen je Kunde und Hebel, nicht mit Vorgaengen.
 */
export async function uebersicht(pool, { jetzt = Date.now() } = {}) {
  const { rows } = await pool.query(
    `${EINTRAEGE_SQL}
      ORDER BY fo.feature_key, fo.org_id NULLS FIRST, fo.created_at DESC
      LIMIT 500`
  );
  const eintraege = rows.map((r) => eintragAnsicht(r, jetzt));

  const hebel = Object.keys(FREISCHALT_HEBEL).map((key) => {
    const eigene = eintraege.filter((e) => e.hebel === key);
    const plattform = eigene.find((e) => !e.org_id && e.wirkt) || null;
    const ausnahmen = eigene.filter((e) => e.org_id && e.wirkt);
    return {
      ...hebelAnsicht(key),
      plattform: plattform ? { id: plattform.id, enabled: plattform.enabled, gilt_bis: plattform.gilt_bis } : null,
      gilt_plattformweit: plattform ? plattform.enabled : FREISCHALT_HEBEL[key].standard,
      ausnahmen_an: ausnahmen.filter((e) => e.enabled).length,
      ausnahmen_aus: ausnahmen.filter((e) => !e.enabled).length
    };
  });

  return {
    hebel,
    eintraege,
    wirkungslos: eintraege.filter((e) => !e.wirkt).length,
    max_tage_je_ausnahme: MAX_TAGE_JE_AUSNAHME,
    heute: todayDE()
  };
}

/** Firmen fuer die Auswahl — nur die Seite, auf der der Hebel wirkt. */
export async function firmenSuche(pool, { key, suche }) {
  if (!hebelVon(key)) return fehler("HEBEL_UNBEKANNT");
  const text = String(suche || "").trim().slice(0, 80);
  if (text.length < 2) return { ok: true, firmen: [] };
  // % und _ sind in ILIKE Platzhalter — als Suchtext gemeint, also maskieren.
  const muster = `%${text.replace(/[\\%_]/g, (z) => "\\" + z)}%`;
  const { rows } = await pool.query(
    `SELECT id, name, type FROM organizations
      WHERE ($1::text IS NULL OR type = $1)
        AND (name ILIKE $2 OR legal_name ILIKE $2)
      ORDER BY name
      LIMIT 20`,
    [FREISCHALT_HEBEL[key].seite || null, muster]
  );
  return { ok: true, firmen: rows.map((r) => ({ id: r.id, name: r.name, type: r.type })) };
}

/**
 * Setzt einen Hebel — fuer eine Firma oder plattformweit — und liefert den
 * Stand davor und danach, damit Antwort und Protokoll dieselbe Wirkung nennen.
 */
export async function setzen(pool, { key, orgId, enabled, giltBis, grund, actorId }) {
  const vorher = await wirkung(pool, { key, orgId });
  if (!vorher.ok) return vorher;

  const eintrag = await upsertOverride(pool, {
    featureKey: key,
    orgId: orgId || null,
    enabled,
    reason: grund,
    createdBy: actorId,
    expiresAt: ablaufAus(giltBis)
  });

  const nachher = await standHeute(pool, key, orgId || null);
  return { ok: true, eintrag, org: vorher.org, vorher: vorher.heute, nachher, eigene_ausnahmen: vorher.eigene_ausnahmen };
}

/** Entfernt einen Eintrag. Danach gilt wieder, was darunter liegt. */
export async function entfernen(pool, id, { jetzt = Date.now() } = {}) {
  const { rows } = await pool.query(`${EINTRAEGE_SQL} WHERE fo.id = $1`, [id]);
  if (!rows[0]) return null;
  const eintrag = eintragAnsicht(rows[0], jetzt);
  await deleteOverride(pool, id);
  const nachher = hebelVon(eintrag.hebel) ? await standHeute(pool, eintrag.hebel, eintrag.org_id) : null;
  return { eintrag, nachher };
}
