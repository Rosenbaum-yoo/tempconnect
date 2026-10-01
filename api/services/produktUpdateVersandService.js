/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRODUKT-MITTEILUNGEN PER E-MAIL — VERSAND IN PAKETEN (Owner-Entscheid 2026-10-01)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner-Vorgabe, woertlich: „ok mach weiter mit dem Versand in Paketen".
 *
 * WAS VORHER WAR (gemessen am Code, `dispatchReleaseEmails`, bis 2026-10-01):
 *   - der ganze Versand in EINER Anfrage, Mail fuer Mail, waehrend der Browser
 *     wartet — hoechstens 400 Mails; wer danach kam, bekam nie eine, und das
 *     stand nirgends
 *   - `email_sent_at` erst NACH der Schleife: ein Absturz mittendrin liess die
 *     Mitteilung „ungemailt" — der naechste Klick schrieb allen erneut
 *   - zwei gleichzeitige Klicks lasen beide „noch nicht gemailt" und sandten beide
 *   - die Zielgruppe kostete etwa sieben Abfragen je Nutzer (bis 5000 Nutzer)
 *
 * WIE ES JETZT GEHT:
 *
 *   Start      Die Empfaengerliste wird EINMAL eingefroren (Tabelle
 *              `product_release_mail_empfaenger`, Migration 227). Das Einfrieren
 *              ist ein bedingtes UPDATE (`email_sent_at IS NULL`) — von zwei
 *              gleichzeitigen Klicks gewinnt genau einer.
 *   Pakete     Jede Minute ein Paket zu 20 Mails (Betriebstakt
 *              `produkt-update-pakete`). 20 je Minute ist dieselbe Drosselung, die
 *              der Mail-Arbeiter fuer alle Warteschlangen-Mails setzt
 *              (`workers/emailWorker.js`). Das erste Paket geht gleich beim Start
 *              raus — bei der heutigen Kundenzahl ist der Versand damit fertig,
 *              bevor der Dialog sich schliesst.
 *   Handkurbel Ohne Redis laeuft kein Takt. Dann zeigt das Staff Control Center
 *              „stockt" und bietet „Naechstes Paket senden" — derselbe Ablauf,
 *              anderer Ausloeser.
 *   Anhalten   Wer nach dem dritten Paket einen Fehler im Text bemerkt, haelt den
 *              Rest an. Das ist die eigentliche Sicherung in einem Team aus einer
 *              Person: nicht ein zweites Augenpaar, sondern Zeit zum Bemerken plus
 *              ein Knopf, der sie nutzbar macht.
 *
 * DIE ZUSAGEN, UND WORAUF SIE STEHEN:
 *   - kein Doppelversand: Primaerschluessel (release_id, user_id), und ein
 *     Empfaenger wird nur aus `offen` heraus beansprucht (bedingtes UPDATE)
 *   - hoechstens einmal: wer `in_arbeit` haengen bleibt (Absturz WAEHREND der
 *     Zustellung), wird nicht erneut beschickt — er zaehlt als „unklar"
 *   - der Widerspruch gilt sofort: abgemeldet wird beim Versand geprueft, nicht
 *     nur beim Einfrieren (§ 7 Abs. 3 UWG)
 *   - ohne Abmelde-Schluessel geht keine Mail raus
 *
 * Wer bekommt die Mail, bestimmt `productReleaseService.ermittleEmpfaenger` —
 * dieselbe Ermittlung fuer die Zahl vor dem Klick und fuer das Einfrieren.
 */

import * as produktUpdates from "./productReleaseService.js";

/** Mails je Paket — ein Paket je Minute. Gleich der Drosselung in `workers/emailWorker.js`. */
export const PAKET_GROESSE = 20;
/** Versuche je Empfaenger, bevor er endgueltig als fehlgeschlagen gilt. */
export const MAX_VERSUCHE = 3;
/** Ab wann ein beanspruchter Empfaenger als „unklar" zaehlt (Absturz waehrend der Zustellung). */
export const UNKLAR_NACH_MIN = 15;
/** Ab wann ein laufender Versand als „stockt" gilt: Takt jede Minute, drei verpasste Laeufe plus Puffer. */
export const STOCKT_NACH_MIN = 5;
/** Zweck im Versandprotokoll (`mail_versand`). */
export const ZWECK = "produkt-update";

function escHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[z]));
}

/** Wie viele Pakete — und wie viele Minuten, da das erste sofort geht. */
export function pakete(anzahl) {
  const n = Math.max(0, Number(anzahl) || 0);
  const zahl = Math.ceil(n / PAKET_GROESSE);
  return { pakete: zahl, dauer_minuten: Math.max(0, zahl - 1) };
}

/**
 * Die Zahl vor dem Klick (Owner-Entscheid 2026-10-01): wie viele Menschen, wie
 * viele abgemeldet, wie viele Mails, wie lange.
 */
export async function empfaengerVorschau(pool, releaseId) {
  const entry = await produktUpdates.getById(pool, releaseId);
  if (!entry) return null;
  const r = await produktUpdates.ermittleEmpfaenger(pool, entry);
  return {
    zielgruppe: r.empfaenger.length + r.abgemeldet,
    abgemeldet: r.abgemeldet,
    wuerden_gesendet: r.empfaenger.length,
    paket_groesse: PAKET_GROESSE,
    ...pakete(r.empfaenger.length),
    schon_gestartet: Boolean(entry.email_sent_at)
  };
}

/**
 * Den Versand starten: die Empfaenger EINMAL einfrieren. Laeuft im `client` des
 * Aufrufers — die Staff-Route schreibt ihr Protokoll in derselben Transaktion.
 *
 * Eine leere Zielgruppe friert NICHTS ein und setzt `email_sent_at` nicht: es ist
 * nichts versandt worden, und der Knopf bleibt fuer spaeter (die Zielgruppe kann
 * wachsen).
 *
 * @param {import('pg').PoolClient} client
 * @param {string} releaseId
 * @param {string[]} empfaengerIds
 * @returns {Promise<{gestartet: true, eingereiht: number} | {gestartet: false, grund: "LEERE_ZIELGRUPPE"|"SCHON_GESTARTET"}>}
 */
export async function versandEinfrieren(client, releaseId, empfaengerIds) {
  if (!Array.isArray(empfaengerIds) || empfaengerIds.length === 0) {
    return { gestartet: false, grund: "LEERE_ZIELGRUPPE" };
  }
  /* DER RIEGEL GEGEN DEN ZWEITEN KLICK. Vorher stand die Pruefung in der Route
   * (`if (eintrag.email_sent_at) 409`) und der Stempel erst am Ende — zwei Klicks
   * lasen dazwischen beide NULL. Jetzt ist der Stempel die Pruefung: nur EIN
   * UPDATE findet die Zeile noch mit NULL. */
  const { rowCount } = await client.query(
    `UPDATE product_release_entries
        SET email_sent_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'published' AND email_sent_at IS NULL`,
    [releaseId]
  );
  if (!rowCount) return { gestartet: false, grund: "SCHON_GESTARTET" };
  const { rowCount: eingereiht } = await client.query(
    `INSERT INTO product_release_mail_empfaenger (release_id, user_id)
     SELECT $1::uuid, empfaenger FROM unnest($2::uuid[]) AS empfaenger
     ON CONFLICT (release_id, user_id) DO NOTHING`,
    [releaseId, empfaengerIds]
  );
  return { gestartet: true, eingereiht };
}

function mailHtml(entry, basis, link) {
  const titel = escHtml(entry.title);
  const kurz = escHtml(entry.summary).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 12px">${titel}</h2>
      <p style="margin:0 0 16px;color:#444">${kurz}</p>
      <p style="margin:0 0 24px"><a href="${basis}/public/whats-new.html" style="color:#2563eb">Im Produkt ansehen</a></p>
      <p style="margin:0;font-size:12px;color:#666">Sie erhalten diese Nachricht als Nutzer von TempConnect.
      Keine Produktneuheiten mehr per E-Mail? <a href="${escHtml(link)}" style="color:#666">Hier abbestellen</a> —
      in der App sehen Sie sie weiterhin.</p>
      </body></html>`;
}

/**
 * Einen beanspruchten Empfaenger abschliessen — nur aus `in_arbeit` heraus.
 *
 * Die Typen stehen AUSDRUECKLICH da: `$3` kommt einmal als Spaltenwert und einmal
 * im Vergleich vor, und PostgreSQL leitet dafuer zwei verschiedene Typen ab
 * (`inconsistent types deduced for parameter $3`, gemessen am 2026-10-01 am
 * laufenden System — der Muster-Pool hatte die Abfrage klaglos angenommen).
 */
async function abschliessen(pool, releaseId, userId, status, fehler) {
  await pool.query(
    `UPDATE product_release_mail_empfaenger
        SET status = $3::text, fehler = $4::text,
            gesendet_am = CASE WHEN $3::text = 'gesendet' THEN NOW() ELSE gesendet_am END
      WHERE release_id = $1 AND user_id = $2 AND status = 'in_arbeit'`,
    [releaseId, userId, status, fehler]
  );
}

/**
 * EIN Paket fuer EINE Mitteilung.
 *
 * @param {import('pg').Pool} pool
 * @param {string} releaseId
 * @param {{sendMail: Function, baseUrl?: string, schluessel?: string|null, logger?: any, groesse?: number}} deps
 * @returns {Promise<{gesendet: number, erneut: number, fehlgeschlagen: number, entfallen: number,
 *                    kein_versandweg: boolean, angehalten: string|null}>}
 */
export async function paketSenden(pool, releaseId, { sendMail, baseUrl = "", schluessel = null, logger = null, groesse = PAKET_GROESSE } = {}) {
  if (typeof sendMail !== "function") {
    throw new Error("paketSenden: ohne Versandweg wird nichts gesendet");
  }
  if (!schluessel) {
    // Keine Werbemail ohne funktionierenden Widerspruch (§ 7 Abs. 3 UWG).
    throw new Error("paketSenden: ohne Abmelde-Schluessel wird nicht gemailt");
  }
  const ergebnis = { gesendet: 0, erneut: 0, fehlgeschlagen: 0, entfallen: 0, kein_versandweg: false, angehalten: null };

  const { rows: er } = await pool.query(
    `SELECT id, title, summary, status FROM product_release_entries WHERE id = $1`,
    [releaseId]
  );
  const entry = er[0];
  if (!entry) { ergebnis.angehalten = "NICHT_GEFUNDEN"; return ergebnis; }
  /* Eine zurueckgezogene Mitteilung (wieder Entwurf) verschickt nichts mehr. Die
   * offenen Empfaenger bleiben stehen; wird sie erneut veroeffentlicht, geht es
   * mit dem dann gueltigen Text weiter. */
  if (entry.status !== "published") { ergebnis.angehalten = "NICHT_VEROEFFENTLICHT"; return ergebnis; }

  const { rows: kandidaten } = await pool.query(
    `SELECT user_id FROM product_release_mail_empfaenger
      WHERE release_id = $1 AND status = 'offen'
      ORDER BY angelegt_am, user_id
      LIMIT $2`,
    [releaseId, groesse]
  );

  const basis = String(baseUrl || "").replace(/\/$/, "");
  const betreff = `TempConnect: ${entry.title}`;

  for (const { user_id: userId } of kandidaten) {
    /* BEANSPRUCHEN — nur aus `offen` heraus. Laufen Takt und Handkurbel
     * gleichzeitig, waehlen beide vielleicht dieselben Kandidaten; dieses UPDATE
     * findet die Zeile aber nur EINMAL noch offen. Wer leer ausgeht, ueberspringt. */
    const { rows: b } = await pool.query(
      `UPDATE product_release_mail_empfaenger e
          SET status = 'in_arbeit', beansprucht_am = NOW(), versuche = e.versuche + 1
         FROM users u
        WHERE e.release_id = $1 AND e.user_id = $2 AND e.status = 'offen'
          AND u.id = e.user_id
       RETURNING u.email, u.role, e.versuche,
                 EXISTS (SELECT 1 FROM notification_preferences np
                          WHERE np.user_id = u.id AND np.event_category = $3
                            AND np.channel_email = FALSE) AS abgemeldet`,
      [releaseId, userId, produktUpdates.ABMELDE_KATEGORIE]
    );
    if (!b[0]) continue;
    const { email, role, versuche, abgemeldet } = b[0];

    /* DER WIDERSPRUCH GILT SOFORT — auch fuer eine Liste, die vor ihm eingefroren
     * wurde. Wer zwischen Start und seinem Paket abbestellt, bekommt nichts. */
    const entfaellt = abgemeldet ? "abgemeldet"
      : (!email || !String(email).trim() || role === "inactive") ? "ohne_adresse"
        : null;
    if (entfaellt) {
      await abschliessen(pool, releaseId, userId, "entfallen", entfaellt);
      ergebnis.entfallen++;
      continue;
    }

    const link = produktUpdates.abmeldeLink(basis, userId, schluessel);
    let ok = false;
    try {
      ok = await sendMail(email, betreff, mailHtml(entry, basis, link), {
        zweck: ZWECK,
        // Der „Abbestellen"-Knopf des Mailprogramms (RFC 2369) — fuehrt auf dieselbe Seite.
        headers: { "List-Unsubscribe": `<${link}>` }
      });
    } catch (err) {
      if (err?.code === "MAIL_NO_TRANSPORT") {
        /* Kein Versandweg (Produktion lehnt hart ab): das ist nicht dem Empfaenger
         * anzulasten. Zurueck auf `offen`, den Versuch nicht zaehlen, Paket beenden —
         * jede weitere Mail scheiterte genauso. */
        await pool.query(
          `UPDATE product_release_mail_empfaenger
              SET status = 'offen', beansprucht_am = NULL, versuche = GREATEST(versuche - 1, 0)
            WHERE release_id = $1 AND user_id = $2 AND status = 'in_arbeit'`,
          [releaseId, userId]
        );
        ergebnis.kein_versandweg = true;
        break;
      }
      ok = false;
    }

    if (ok) {
      await abschliessen(pool, releaseId, userId, "gesendet", null);
      ergebnis.gesendet++;
    } else if (Number(versuche) >= MAX_VERSUCHE) {
      await abschliessen(pool, releaseId, userId, "fehlgeschlagen", "zustellung");
      ergebnis.fehlgeschlagen++;
    } else {
      /* Der Mailserver hat abgelehnt — die Mail ist sicher NICHT raus. Also darf
       * sie erneut versucht werden, im naechsten Paket. */
      await pool.query(
        `UPDATE product_release_mail_empfaenger
            SET status = 'offen', fehler = 'zustellung'
          WHERE release_id = $1 AND user_id = $2 AND status = 'in_arbeit'`,
        [releaseId, userId]
      );
      ergebnis.erneut++;
    }
  }

  logger?.info?.({ releaseId, ...ergebnis }, "produkt_update_paket");
  return ergebnis;
}

/**
 * Der Takt: das naechste Paket der aeltesten Mitteilung, die noch Offene hat.
 * Nichts zu tun ist kein Fehler — `{ leer: true }`.
 */
export async function naechstesPaket(pool, deps = {}) {
  const { rows } = await pool.query(
    `SELECT e.release_id
       FROM product_release_mail_empfaenger e
       JOIN product_release_entries r ON r.id = e.release_id AND r.status = 'published'
      WHERE e.status = 'offen'
      ORDER BY e.angelegt_am
      LIMIT 1`
  );
  if (!rows[0]) return { leer: true };
  const ergebnis = await paketSenden(pool, rows[0].release_id, deps);
  return { release_id: rows[0].release_id, ...ergebnis };
}

/**
 * Aufbewahrung durchsetzen: Empfaengerlisten 12 Monate nach dem Einfrieren loeschen
 * (Owner-Entscheid 2026-10-01).
 *
 * Die Frist selbst steht in der Datenbank (`produkt_update_empfaenger_aufraeumen`,
 * Migration 228), nicht hier — sonst gaebe es zwei Zahlen, und die zweite waere
 * irgendwann die falsche. Dieser Aufruf ist nur der Ausloeser aus dem Takt; dieselbe
 * Bauart wie `workerStatusEventService.aufbewahrungDurchsetzen`.
 *
 * @returns {Promise<{geloescht: number}>}
 */
export async function aufbewahrungDurchsetzen(pool) {
  const { rows } = await pool.query(`SELECT produkt_update_empfaenger_aufraeumen() AS geloescht`);
  return { geloescht: Number(rows[0]?.geloescht) || 0 };
}

/** Den Rest anhalten: alle noch offenen Empfaenger entfallen. Im `client` des Aufrufers. */
export async function versandAnhalten(client, releaseId) {
  const { rowCount } = await client.query(
    `UPDATE product_release_mail_empfaenger
        SET status = 'entfallen', fehler = 'angehalten'
      WHERE release_id = $1 AND status = 'offen'`,
    [releaseId]
  );
  return rowCount;
}

export const STAND_SQL = `
  SELECT release_id,
         COUNT(*)::int AS gesamt,
         COUNT(*) FILTER (WHERE status = 'offen')::int AS offen,
         COUNT(*) FILTER (WHERE status = 'in_arbeit'
                            AND beansprucht_am >= NOW() - make_interval(mins => $2))::int AS in_arbeit,
         COUNT(*) FILTER (WHERE status = 'in_arbeit'
                            AND (beansprucht_am IS NULL
                                 OR beansprucht_am < NOW() - make_interval(mins => $2)))::int AS unklar,
         COUNT(*) FILTER (WHERE status = 'gesendet')::int AS gesendet,
         COUNT(*) FILTER (WHERE status = 'fehlgeschlagen')::int AS fehlgeschlagen,
         COUNT(*) FILTER (WHERE status = 'entfallen')::int AS entfallen,
         MAX(GREATEST(gesendet_am, beansprucht_am)) AS zuletzt_bewegt_am
    FROM product_release_mail_empfaenger
   WHERE release_id = ANY($1::uuid[])
   GROUP BY release_id`;

function minutenHer(zeitpunkt, jetzt) {
  if (!zeitpunkt) return null;
  const t = new Date(zeitpunkt).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((jetzt - t) / 60000)) : null;
}

/**
 * Der Stand eines Versands, wie das Staff Control Center ihn zeigt. REINE FUNKTION.
 *
 * `null`, wenn nie gestartet. `alter_versand`, wenn der Stempel steht, aber keine
 * Liste (mehr) da ist: vor dem Paketversand gemailt, oder die Liste ist nach 12
 * Monaten geloescht (Migration 228). Wer damals was bekam, weiss dann niemand mehr,
 * und das wird auch nicht behauptet. Welcher der beiden Faelle vorliegt, rechnet
 * diese Stelle bewusst NICHT nach — sie muesste dazu die Frist kennen, und die
 * steht nur in der Datenbank.
 */
export function bewerteStand(zeile, { gestartetAm = null, veroeffentlicht = true, jetzt = Date.now() } = {}) {
  if (!gestartetAm) return null;
  if (!zeile || !zeile.gesamt) return { alter_versand: true, gestartet_am: gestartetAm };
  const offen = zeile.offen || 0;
  const inArbeit = zeile.in_arbeit || 0;
  const fertig = offen === 0 && inArbeit === 0;
  const still = minutenHer(zeile.zuletzt_bewegt_am || gestartetAm, jetzt);
  return {
    gesamt: zeile.gesamt,
    gesendet: zeile.gesendet || 0,
    offen,
    in_arbeit: inArbeit,
    unklar: zeile.unklar || 0,
    fehlgeschlagen: zeile.fehlgeschlagen || 0,
    entfallen: zeile.entfallen || 0,
    fertig,
    pausiert: !fertig && !veroeffentlicht,
    stockt: !fertig && veroeffentlicht && still !== null && still >= STOCKT_NACH_MIN,
    rest_minuten: fertig ? 0 : Math.ceil(offen / PAKET_GROESSE),
    gestartet_am: gestartetAm,
    zuletzt_bewegt_am: zeile.zuletzt_bewegt_am || null
  };
}

/**
 * Der Stand fuer mehrere Mitteilungen in EINER Abfrage (die Liste im Staff CC).
 * @param {Array<{id: string, email_sent_at: string|null, status: string}>} eintraege
 * @returns {Promise<Map<string, object|null>>}
 */
export async function versandStaende(pool, eintraege, { jetzt = Date.now() } = {}) {
  const gestartet = eintraege.filter((e) => e.email_sent_at);
  const staende = new Map();
  if (gestartet.length) {
    const { rows } = await pool.query(STAND_SQL, [gestartet.map((e) => e.id), UNKLAR_NACH_MIN]);
    for (const z of rows) staende.set(String(z.release_id), z);
  }
  const aus = new Map();
  for (const e of eintraege) {
    aus.set(String(e.id), bewerteStand(staende.get(String(e.id)), {
      gestartetAm: e.email_sent_at, veroeffentlicht: e.status === "published", jetzt
    }));
  }
  return aus;
}

/** Der Stand einer Mitteilung. `undefined`, wenn es sie nicht gibt. */
export async function versandStand(pool, releaseId, { jetzt = Date.now() } = {}) {
  const entry = await produktUpdates.getById(pool, releaseId);
  if (!entry) return undefined;
  return (await versandStaende(pool, [entry], { jetzt })).get(String(entry.id)) ?? null;
}
