/**
 * ownerCheck.js — Darf dieser Angemeldete fuer den Eigentuemer handeln?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BEFUND E-11 (geschlossen 2026-08-20): diese Pruefung war seit jeher wirkungslos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die alte Fassung hatte ZWEI voneinander unabhaengige Fehler, von denen jeder
 * einzelne schon genuegt haette, den Organisations-Zweig nie greifen zu lassen:
 *
 *   1. Sie fragte `WHERE ... AND status = 'active'`. Die Spalte heisst
 *      `is_active` und ist ein Wahrheitswert — `status` gibt es in
 *      `org_memberships` nicht. Postgres antwortete mit 42703, die Abfrage warf,
 *      und der `catch` machte daraus ein stilles `false`.
 *   2. Sie verglich `WHERE org_id = $1` mit dem uebergebenen Eigentuemer. Alle
 *      zehn Aufrufstellen uebergeben aber eine NUTZER-Kennung
 *      (`requester_company_id`, `owner_company_id`, `supplier_company_id` —
 *      allesamt Fremdschluessel auf `users`, gegen das laufende Schema geprueft).
 *      Eine Nutzer-Kennung steht nie in `org_memberships.org_id`.
 *
 * Wirksam war also ausschliesslich der direkte Vergleich. Genau ein Mensch —
 * der, der die Zeile angelegt hat — konnte je auf sie zugreifen. Bei Urlaub,
 * Krankheit oder Personalwechsel war die Bedarfsmeldung, der Suchauftrag oder
 * die Dealakte des Unternehmens fuer das Unternehmen verloren.
 *
 * Dass es anders GEMEINT war, steht im Quelltext: `offerAssets.js:127` erklaert
 * ausdruecklich, `canAccessAsOwner` beruecksichtige „auch Organisations-Member
 * und nicht nur den direkten Owner". Der Kommentar beschreibt seit Jahren eine
 * Faehigkeit, die es nie gab.
 *
 * ── Warum der `catch` der eigentliche Fehler war ──────────────────────────
 *
 * Ein `catch { return false }` um eine Sicherheitsabfrage sieht vorsichtig aus
 * und ist es auch — es schliesst zu. Genau deshalb hat niemand etwas gemerkt:
 * eine kaputte Abfrage ist von einer verweigerten Berechtigung nicht zu
 * unterscheiden, wenn beide dasselbe antworten. Fail-closed bleibt richtig,
 * aber nicht STILL: der Fehler wird jetzt protokolliert.
 *
 * ── Die Grenze der Reparatur ──────────────────────────────────────────────
 *
 * Diese Reparatur WEITET den Zugriff — vom einen Menschen auf seine Kolleginnen
 * und Kollegen. Sie darf ihn deshalb nicht weiter oeffnen als gemeint:
 *
 *   `org_memberships` enthaelt nicht nur die Belegschaft einer Organisation,
 *   sondern auch ihre ARBEITER (`role_key = 'worker'`, gegen den Bestand
 *   gemessen: 33 Zeilen). Eine Regel „gleiche Organisation genuegt" haette
 *   einem Zeitarbeiter die Suchauftraege, Angebote und Dealakten seiner Agentur
 *   geoeffnet — aus einer wirkungslosen Pruefung waere ein echtes Leck geworden.
 *
 * Der Ausschluss ist keine neue Erfindung: die Plattform trennt die
 * Arbeiterwelt ohnehin durchgehend (`hidden_worker` auf allen Flaechen,
 * `requireCompanyOrg` sperrt `org_type = 'worker'`, `workerService.js:441`
 * benutzt `role_key = 'worker'` als genau dieses Kennzeichen).
 */

import { createServiceLogger } from "./logger.js";

const log = createServiceLogger("ownerCheck");

/** Mitgliedschaften, die NICHT fuer die Organisation handeln. */
const NICHT_HANDLUNGSFAEHIG = new Set(["worker"]);

/**
 * @param {import('pg').Pool} pool
 * @param {string|null|undefined} entityOwnerId — NUTZER-Kennung des Eigentuemers
 * @param {string|null|undefined} sessionUserId — Kennung des Angemeldeten
 * @returns {Promise<boolean>}
 */
export async function canAccessAsOwner(pool, entityOwnerId, sessionUserId) {
  if (!entityOwnerId || !sessionUserId) return false;

  // Der Eigentuemer selbst — ohne Umweg ueber die Datenbank.
  if (String(entityOwnerId) === String(sessionUserId)) return true;

  try {
    const { rows } = await pool.query(
      `SELECT 1
         FROM org_memberships meine
         JOIN org_memberships seine ON seine.org_id = meine.org_id
         JOIN users ich ON ich.id = meine.user_id
        WHERE meine.user_id = $2
          AND seine.user_id = $1
          AND meine.is_active = TRUE
          AND seine.is_active = TRUE
          AND meine.role_key <> ALL($3::text[])
          AND seine.role_key <> ALL($3::text[])
          AND COALESCE(ich.role, '') <> 'worker'
        LIMIT 1`,
      [entityOwnerId, sessionUserId, [...NICHT_HANDLUNGSFAEHIG]]
    );
    return rows.length > 0;
  } catch (err) {
    /* Fail-closed, aber NICHT still. Der Vorgaenger hat hier sechs Jahre lang
       einen Spaltenfehler verschluckt — eine kaputte Abfrage sah aus wie eine
       verweigerte Berechtigung. */
    log.error(
      { err: err.message, code: err.code },
      "canAccessAsOwner: Mitgliedschaftsabfrage fehlgeschlagen — Zugriff verweigert"
    );
    return false;
  }
}
