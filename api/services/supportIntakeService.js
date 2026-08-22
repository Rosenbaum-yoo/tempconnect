import { withTransaction } from "../utils/transaction.js";

/*
 * DER WEG HINEIN — die Kundenseite des Support Centers.
 *
 * BEFUND, der diese Datei ausgeloest hat (gemessen am 2026-08-22):
 * `support_cases` hat im GESAMTEN Repo kein einziges `INSERT`. Es gibt
 * Warteschlangen, Fallarten, SLA-Fristen, Eskalationen, Wissensdatenbank,
 * Qualitaetskennzahlen — und keinen Weg, einen Fall entstehen zu lassen. Das
 * Support Center war ein Lesesaal ueber einer Tabelle, die niemand fuellen
 * konnte. Faelle konnten nur von Hand in der Datenbank entstehen.
 *
 * WARUM DER EINGANG NICHT UNTER `/support` LIEGT
 *   `api/routes/support.js:664` setzt das Tor am PRAEFIX:
 *   `router.use("/support", supportRateLimit, requireAuth, supportAuth)`.
 *   Das ist die strengere Bauart — auf einer neuen Route nicht vergessbar — und
 *   die Owner-Vorgabe zu Abschnitt 10 ist hart: "Nur Staff oder von Staff
 *   eingetragene Nutzer. Kein Zugang fuer Unternehmen, kein Zugang fuer
 *   Personaldienstleister."
 *
 *   Eine Kundenroute UNTER dieses Praefix zu haengen hiesse, ein Loch in das Tor
 *   zu schneiden — und jedes Loch in einem Praefix-Tor gilt ab da fuer ALLE
 *   Routen darunter, auch fuer die, die erst spaeter dazukommen. Der Eingang
 *   liegt deshalb daneben: `/support-requests`, mit `requireAuth` und
 *   ausschliesslich der eigenen Sicht. Das Tor bleibt unangetastet.
 */

/** Fallarten, die ein Kunde selbst waehlen darf (Teilmenge des CHECK in Migration 110). */
export const KUNDEN_FALLARTEN = Object.freeze([
  "general",
  "login_access",
  "billing",
  "verification",
  "invite",
  "onboarding",
  "feature_question",
  "bug_report",
  "complaint",
  "other",
]);

/*
 * Welche Warteschlange zu welcher Fallart. `support_queues` wird von Migration
 * 110 mit drei Zeilen gesaet (general / verification / billing); alles andere
 * faellt auf `general`. Die Zuordnung steht hier und nicht in der Datenbank,
 * weil sie eine PRODUKT-Entscheidung ist ("wer beantwortet was") und nicht ein
 * Datenbestand — und weil eine fehlende Zeile sonst still zu `general` wuerde.
 */
const QUEUE_JE_FALLART = Object.freeze({
  verification: "verification",
  billing: "billing",
});

/**
 * Die Warteschlange ist PFLICHT, nicht Kuer.
 *
 * `api/routes/support.js:164-167` schneidet die Agentensicht mit
 * `queue_id::text = ANY($n::text[])` zu. Ein Fall mit `queue_id = NULL` ist
 * damit fuer JEDEN Agenten mit gesetzten `allowed_queues` UNSICHTBAR. Ein
 * verwaister Fall ist schlimmer als eine abgelehnte Anfrage: der Kunde hat eine
 * Bestaetigung mit Fallnummer in der Hand und glaubt, er sei gehoert worden —
 * und niemand wird den Fall je sehen. Deshalb: lieber laut scheitern.
 */
async function findeWarteschlange(client, caseType) {
  const gewuenscht = QUEUE_JE_FALLART[caseType] || "general";
  const { rows } = await client.query(
    `SELECT id, type, sla_first_response_h, sla_resolution_h
       FROM support_queues
      WHERE is_active = TRUE
        AND type IN ($1, 'general')
      ORDER BY (type = $1) DESC, name ASC
      LIMIT 1`,
    [gewuenscht]
  );
  return rows[0] || null;
}

/**
 * Eroeffnet einen Support-Fall im Namen eines Kunden.
 *
 * Die Dringlichkeit setzt der Kunde ABSICHTLICH NICHT. Duerfte er es, waere
 * binnen weniger Wochen jeder Fall "critical" und die Stufe damit wertlos —
 * ein Feld, das jeder selbst setzt, misst nur noch, wer es gelesen hat. Die
 * Einstufung gehoert dem Support; er sieht alle Faelle nebeneinander und kann
 * vergleichen.
 */
export async function eroeffneSupportFall(pool, {
  reporterUserId,
  reporterOrgId = null,
  subject,
  description = null,
  caseType = "general",
  kontext = null,
}) {
  if (!reporterUserId) return { error: "NO_REPORTER" };
  if (!KUNDEN_FALLARTEN.includes(caseType)) return { error: "UNKNOWN_CASE_TYPE" };

  return withTransaction(pool, async (client) => {
    const queue = await findeWarteschlange(client, caseType);
    if (!queue) {
      /* Kein stiller Notnagel. Siehe `findeWarteschlange`: ein Fall ohne
       * Warteschlange verschwindet aus der Agentensicht. Der Aufrufer meldet
       * dem Kunden einen Fehler — dann versucht er es erneut oder greift zum
       * Telefon, statt auf eine Antwort zu warten, die nie kommt. */
      return { error: "NO_QUEUE_CONFIGURED" };
    }

    const { rows } = await client.query(
      `INSERT INTO support_cases
         (subject, description, status, priority, case_type, queue_id,
          reporter_user_id, reporter_org_id,
          sla_first_response_deadline, sla_resolution_deadline)
       VALUES ($1, $2, 'new', 'normal', $3, $4, $5, $6,
               NOW() + ($7 || ' hours')::interval,
               NOW() + ($8 || ' hours')::interval)
       RETURNING id, case_number, subject, status, priority, case_type,
                 sla_first_response_deadline, sla_resolution_deadline, created_at`,
      [
        subject,
        description,
        caseType,
        queue.id,
        reporterUserId,
        reporterOrgId,
        String(queue.sla_first_response_h ?? 24),
        String(queue.sla_resolution_h ?? 72),
      ]
    );
    const fall = rows[0];

    /* Der Fall traegt seine Herkunft von Anfang an. Ohne diese Zeile stuende im
     * Verlauf nur "Fall existiert" — ein Agent koennte nicht unterscheiden, ob
     * ihn ein Kunde eroeffnet hat oder ein Kollege von Hand. `actor_agent_id`
     * bleibt NULL: es war kein Agent. */
    await client.query(
      `INSERT INTO support_case_events (case_id, actor_agent_id, event, detail)
       VALUES ($1, NULL, 'case_opened_by_customer', $2::jsonb)`,
      [fall.id, JSON.stringify({
        reporter_user_id: reporterUserId,
        reporter_org_id: reporterOrgId,
        queue_type: queue.type,
        ...(kontext ? { kontext } : {}),
      })]
    );

    return { fall };
  });
}

/*
 * SICHT DES KUNDEN — bewusst schmal.
 *
 * Zurueck geht NUR, was der Kunde selbst beigetragen hat, plus Status und
 * Fristen. Nicht: interne Notizen, Agenten-Namen, Warteschlangen-Interna,
 * Eskalationsziele. `support_case_notes.note_type` kennt `internal`, `external`
 * und `system` — nur `external` ist fuer den Kunden bestimmt, und diese Grenze
 * steht hier im SQL, nicht in der Anzeige. Eine Grenze, die erst im Frontend
 * gezogen wird, ist keine.
 *
 * REICHWEITE: `reporter_user_id = $1`, nicht `reporter_org_id`. Ein Support-Fall
 * kann persoenlich sein (Zugangsprobleme, Beschwerde ueber einen Kollegen). Ihn
 * allen Mitgliedern derselben Organisation zu zeigen waere eine Entscheidung,
 * die niemand getroffen hat. Wer die Fallakte org-weit sichtbar machen will,
 * trifft diese Entscheidung ausdruecklich — hier nicht nebenbei.
 */
const EIGENE_FALL_SPALTEN = `
  sc.id, sc.case_number, sc.subject, sc.description, sc.status, sc.case_type,
  sc.sla_first_response_deadline, sc.sla_resolution_deadline,
  sc.sla_first_responded_at, sc.created_at, sc.updated_at, sc.closed_at`;

export async function listeEigeneFaelle(pool, reporterUserId, { limit = 25, offset = 0 } = {}) {
  if (!reporterUserId) return { faelle: [], gesamt: 0 };
  const grenze = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const versatz = Math.max(Number(offset) || 0, 0);

  const { rows } = await pool.query(
    `SELECT ${EIGENE_FALL_SPALTEN}, COUNT(*) OVER ()::int AS gesamt
       FROM support_cases sc
      WHERE sc.reporter_user_id = $1
      ORDER BY sc.created_at DESC
      LIMIT $2 OFFSET $3`,
    [reporterUserId, grenze, versatz]
  );

  return {
    faelle: rows.map(({ gesamt, ...rest }) => rest),
    gesamt: rows.length ? rows[0].gesamt : 0,
  };
}

export async function holeEigenenFall(pool, reporterUserId, fallId) {
  if (!reporterUserId || !fallId) return null;
  const { rows } = await pool.query(
    `SELECT ${EIGENE_FALL_SPALTEN}
       FROM support_cases sc
      WHERE sc.id = $1 AND sc.reporter_user_id = $2`,
    [fallId, reporterUserId]
  );
  if (!rows.length) return null;

  const { rows: notizen } = await pool.query(
    `SELECT n.id, n.body, n.created_at
       FROM support_case_notes n
      WHERE n.case_id = $1
        AND n.note_type = 'external'
      ORDER BY n.created_at ASC`,
    [fallId]
  );

  return { ...rows[0], antworten: notizen };
}
