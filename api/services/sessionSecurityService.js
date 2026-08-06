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
