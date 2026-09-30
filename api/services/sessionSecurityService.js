/**
 * Sitzungs-Haertung (P5.1) — Leerlauf-Frist, absolute Lebensdauer, Fernabmeldung.
 *
 * WAS VORHER SCHON GUT WAR (bewusst nicht angefasst)
 * Session-Rotation bei jedem Login (`req.session.regenerate` in auth.js und sso.js —
 * verhindert Session-Fixation), Cookie-Flags (httpOnly, sameSite, secure, getrennte
 * Pfade fuer Plattform und Staff), Re-Authentifizierung mit Risikostufen
 * (`requireMfa`, `staffControlAccess`) und die 4-Stunden-Frist der Staff-Sitzung.
 *
 * DIE LUECKE
 * Die Plattform-Sitzung lief 14 Tage "rollend" und hatte **keine absolute Obergrenze**:
 * wer alle 13 Tage einmal klickte, blieb unbegrenzt angemeldet. Eine einmal entwendete
 * Sitzung wurde damit nie von allein ungueltig. `express-session` kann das nicht: `maxAge`
 * + `rolling` ergibt nur eine Leerlauf-Frist, kein Hoechstalter.
 *
 * DIE ENTSCHEIDUNG (Owner, 2026-08-01)
 * Leerlauf 8 Stunden, absolut 7 Tage. Ein Arbeitstag am Stueck ist damit gedeckt — der
 * Disponent wird nicht mitten in der Disposition abgemeldet —, aber eine gestohlene
 * Sitzung ist spaetestens nach einer Woche wertlos.
 *
 * WARUM BESTANDS-SITZUNGEN NICHT SOFORT FLIEGEN
 * Sitzungen von vor dieser Aenderung haben kein `createdAt`. Sie werden beim ersten
 * Zugriff gestempelt, statt sofort verworfen: ein Deploy, der alle Angemeldeten
 * hinauswirft, ist ein Ausfall, kein Sicherheitsgewinn. Die absolute Frist laeuft fuer
 * sie ab dem ersten Zugriff nach dem Deploy — einmalig und bewusst.
 */
import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger("sessionSecurity");

/** Leerlauf-Frist: so lange darf eine Sitzung unbenutzt bleiben. */
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

/** Hoechstalter einer Sitzung, unabhaengig von Aktivitaet. */
export const ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stempelt eine frisch angemeldete Sitzung. MUSS nach `regenerate()` aufgerufen werden —
 * davor wuerde der Stempel mit der alten Sitzung verworfen.
 */
export function stampSession(session) {
  if (!session) return;
  session.createdAt = Date.now();
}

/**
 * Bindung an das Browserfenster (Owner-Frage 2026-08-06: "soll man beim Schliessen
 * des Fensters ausgeloggt werden?").
 *
 * ANTWORT IN ZWEI TEILEN
 * Mehrere Tabs funktionieren immer — die Sitzung haengt am Cookie, nicht am Tab.
 * Das Schliessen des Fensters meldet dagegen standardmaessig NICHT ab, und das ist
 * fuer eine Disposition richtig so: ein versehentlich geschlossener Tab darf einen
 * Disponenten nicht mitten in der Arbeit hinauswerfen.
 *
 * FALSCH IST ES NUR AN EINEM ORT: am geteilten Rechner. Genau dort arbeiten
 * gewerbliche Einsatzkraefte — Lagerbuero, Pfoertnerloge, Werkstatt-PC. Bleibt dort
 * eine Sitzung acht Stunden offen, sieht der Naechste fremde Stundenzettel.
 *
 * Deshalb entscheidet der Anmeldende: ohne "angemeldet bleiben" bekommt der Cookie
 * KEINE Ablaufzeit und ist damit ein reines Browser-Sitzungs-Cookie — es stirbt mit
 * dem Fenster. Die serverseitigen Fristen (Leerlauf, Hoechstalter) gelten unveraendert
 * weiter; diese Wahl kann sie nur verkuerzen, nie verlaengern.
 *
 * @param {object} session   req.session (NACH regenerate)
 * @param {boolean} remember true = Geraet merken (Standard-Frist), false = bis Fenster zu
 */
export function bindSessionToDevice(session, remember) {
  if (!session?.cookie) return;
  if (remember) {
    session.cookie.maxAge = IDLE_TIMEOUT_MS;
    session.persistent = true;
  } else {
    // null (nicht 0/undefined): express-session laesst `expires` dann weg — der
    // Browser verwirft das Cookie beim Schliessen.
    session.cookie.expires = null;
    session.cookie.maxAge = null;
    session.persistent = false;
  }
}

/**
 * Middleware: verwirft Sitzungen, die ihr Hoechstalter ueberschritten haben.
 *
 * Die Leerlauf-Frist erledigt `express-session` selbst (`maxAge` + `rolling`); hier geht
 * es nur um das absolute Alter, das der Sitzungs-Baustein nicht kennt.
 */
export function enforceAbsoluteLifetime({ lifetimeMs = ABSOLUTE_LIFETIME_MS, now = () => Date.now() } = {}) {
  return function absoluteLifetimeGuard(req, res, next) {
    const session = req.session;
    if (!session || !session.userId) return next();

    // Bestandssitzung ohne Stempel: nachtraeglich stempeln statt hinauswerfen (s. Kopf).
    if (!session.createdAt) {
      session.createdAt = now();
      return next();
    }

    const alter = now() - Number(session.createdAt);
    if (alter <= lifetimeMs) return next();

    const userId = session.userId;
    session.destroy((err) => {
      if (err) logger.warn({ err, userId }, "Sitzung konnte nach Ablauf nicht verworfen werden");
      res.clearCookie("tc.sid", { path: "/", httpOnly: true, sameSite: "lax" });
      // 401 statt Weiterleitung: die Aufrufer sind API-Clients, die einen Status
      // auswerten. Der Grund wird mitgegeben, damit die Oberflaeche "Sitzung
      // abgelaufen, bitte neu anmelden" sagen kann statt "Zugriff verweigert".
      res.status(401).json({ error: "SESSION_EXPIRED", reason: "absolute_lifetime" });
    });
  };
}

/**
 * Beendet ALLE Sitzungen eines Nutzers (Fernabmeldung nach Geraeteverlust).
 *
 * Gefiltert wird ueber `sess->>'userId'` — ein gezielter Feldvergleich. Der naheliegende
 * Weg `sess::text LIKE '%<id>%'` trifft auch Sitzungen, in denen die Kennung nur
 * *erwaehnt* wird (etwa waehrend einer Staff-Stellvertretung) und meldet damit
 * Unbeteiligte ab.
 *
 * @returns {Promise<{ beendet: number }>}
 */
export async function destroyAllUserSessions(pool, userId, { exceptSid = null } = {}) {
  if (!userId) return { beendet: 0 };
  const params = [String(userId)];
  let sql = `DELETE FROM session WHERE sess->>'userId' = $1`;
  if (exceptSid) {
    params.push(String(exceptSid));
    sql += ` AND sid <> $2`;
  }
  const { rowCount } = await pool.query(sql, params);
  return { beendet: rowCount || 0 };
}

/**
 * Grober Geraetetyp aus dem User-Agent (8.1.2, Owner-Entscheidung 2026-08-21:
 * "Zeitpunkt + grober Geraetetyp", KEINE IP, KEIN Standort, KEINE Geraetekennung).
 *
 * WARUM UEBERHAUPT: Das Einsatzportal zeigt "2 aktive Sitzungen — davon 1 auf
 * anderen Geraeten". Die zweite Zahl war schlicht `offen - 1`: die Anwendung
 * kannte gar keine Geraete. Der Text versprach eine Unterscheidung, die die
 * Daten nicht hatten — und genau darauf soll jemand entscheiden, ob er sein
 * Konto fernabmeldet.
 *
 * WAS BEWUSST NICHT GESPEICHERT WIRD: der rohe User-Agent. Er ist ein
 * Wiedererkennungsmerkmal (Browser-Fingerabdruck); fuer die Frage "ist das
 * meins?" genuegt "Handy, Chrome". Gespeichert wird also nur das Ergebnis
 * dieser Einordnung, nicht ihre Grundlage.
 *
 * Die Einordnung ist absichtlich grob und ohne Fremdbibliothek: sie muss
 * "Handy oder Rechner" beantworten, nicht Modellnummern.
 *
 * @param {string} [userAgent]
 * @returns {{ art: "handy"|"tablet"|"rechner"|"unbekannt", browser: string }}
 */
export function ordneGeraetEin(userAgent) {
  const ua = String(userAgent || "");
  if (!ua.trim()) return { art: "unbekannt", browser: "unbekannt" };

  /* Reihenfolge zaehlt: ein Android-TABLET nennt sich "Android" OHNE "Mobile",
   * ein Android-Handy mit. Deshalb zuerst die eindeutigen Tablet-Merkmale.
   *
   * ACHTUNG, hier ist es beim Bauen einmal schiefgegangen: `\b` ist in einem
   * Template-Literal (und in vielen Werkzeugen, die den Code erzeugen) das
   * BACKSPACE-Zeichen, keine Wortgrenze. Die erste Fassung dieser Muster trug
   * 0x08 statt `\b` und traf deshalb fast nichts — iPhone wurde "rechner",
   * jeder Browser "unbekannt". Dieselbe Falle wie beim Org-Grenzen-Waechter am
   * 2026-08-19 (docs/UEBERGABE.md). Diese Muster stehen bewusst als
   * Literale im Quelltext, nicht zusammengesetzt. */
  let art = "rechner";
  if (/\biPad\b|\bTablet\b|Android(?!.*\bMobile\b)/i.test(ua)) art = "tablet";
  else if (/\bMobi|\biPhone\b|\bAndroid\b|\bIEMobile\b/i.test(ua)) art = "handy";

  /* Auch hier zaehlt die Reihenfolge: Edge und Opera nennen sich beide
   * zusaetzlich "Chrome", Chrome nennt sich zusaetzlich "Safari". Wer in der
   * falschen Reihenfolge prueft, meldet jeden Edge als Chrome. */
  let browser = "unbekannt";
  if (/\bEdgA?\//i.test(ua)) browser = "Edge";
  else if (/\bOPR\/|\bOpera\b/i.test(ua)) browser = "Opera";
  else if (/\bFirefox\/|\bFxiOS\//i.test(ua)) browser = "Firefox";
  else if (/\bChrome\/|\bCriOS\//i.test(ua)) browser = "Chrome";
  else if (/\bSafari\//i.test(ua)) browser = "Safari";

  return { art, browser };
}

/**
 * Vermerkt Zeitpunkt und groben Geraetetyp auf der Sitzung.
 *
 * `stampSession` setzte bisher nur `createdAt` — der Zeitpunkt war also schon
 * da, wurde aber nirgends ausgeliefert. Hier kommt die Einordnung dazu.
 */
export function vermerkeGeraet(session, userAgent) {
  if (!session) return;
  session.geraet = ordneGeraetEin(userAgent);
}

/**
 * Die offenen Sitzungen eines Nutzers — mit Zeitpunkt und grobem Geraetetyp.
 *
 * AUSSCHLIESSLICH das eigene Konto: der Aufrufer uebergibt `req.session.userId`,
 * es gibt keinen Parameter fuer eine fremde Kennung. Wer die Sitzungen anderer
 * sehen darf, ist eine Flaechen-Frage und war am 2026-08-21 nicht entschieden —
 * bis dahin gibt es die Fremdsicht nicht, statt sie vorsorglich zu bauen.
 *
 * `aktuell` markiert die Sitzung des Aufrufers, damit die Oberflaeche "dieses
 * Geraet" sagen kann, ohne die Sitzungskennung auszuliefern (sie ist das
 * Anmeldegeheimnis).
 *
 * @returns {Promise<Array<{ aktuell: boolean, seit: string|null, geraet: object }>>}
 */
export async function listUserSessions(pool, userId, aktuelleSid = null) {
  if (!userId) return [];
  const { rows } = await pool.query(
    `SELECT sid, sess, expire FROM session
      WHERE sess->>'userId' = $1 AND expire > NOW()
      ORDER BY (sess->>'createdAt') DESC NULLS LAST`,
    [String(userId)]
  );
  return rows.map((r) => {
    const sess = typeof r.sess === "string" ? JSON.parse(r.sess) : (r.sess || {});
    const erstellt = Number(sess.createdAt);
    return {
      aktuell: aktuelleSid ? r.sid === aktuelleSid : false,
      seit: Number.isFinite(erstellt) ? new Date(erstellt).toISOString() : null,
      laeuft_ab: r.expire ? new Date(r.expire).toISOString() : null,
      geraet: sess.geraet || { art: "unbekannt", browser: "unbekannt" },
    };
  });
}

/**
 * Zaehlt die offenen Sitzungen eines Nutzers. Ohne diese Zahl ist "Alle Geraete abmelden"
 * ein Knopf ins Leere — der Nutzer soll sehen, dass es etwas zu beenden gibt.
 */
export async function countUserSessions(pool, userId) {
  if (!userId) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS anzahl FROM session WHERE sess->>'userId' = $1 AND expire > NOW()`,
    [String(userId)]
  );
  return rows[0]?.anzahl || 0;
}
