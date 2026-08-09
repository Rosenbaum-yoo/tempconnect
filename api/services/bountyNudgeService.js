/**
 * bountyNudgeService.js — selbstlaufende Anstupser zum Bounty-Status (P9 Welle A5)
 *
 * WARUM DIESER DIENST EIGENSTAENDIG LAEUFT
 * "Verdient" und "Entfallen" entstehen in `evaluateBounties` — und das lief bisher
 * ausschliesslich, wenn ein Nutzer selbst seine Bounty-Seite oeffnet. Ein
 * Anstupser, der voraussetzt, dass man ohnehin hinsieht, ist keiner. Deshalb ein
 * eigener Lauf (Cron `POST /api/internal/bounty-nudges`), der auswertet UND
 * benachrichtigt.
 *
 * DREI ANLAESSE, MEHR NICHT
 *   near    Fortschritt >= NAH_AB_PROZENT, noch nicht verdient. Nur In-App.
 *   earned  war nicht aktiv, ist jetzt aktiv.
 *   lost    war aktiv, ist es nicht mehr.
 *
 * WARUM "near" NUR IN-APP
 * Eine E-Mail fuer "noch zwei Abschluesse" ist genau der Anlass, mit dem man sich
 * Abmeldungen einhandelt. Der Hinweis ist nuetzlich, wenn man ohnehin auf der
 * Plattform ist — er rechtfertigt keine Unterbrechung im Postfach.
 *
 * ZUSTELLUNG UEBER DEN BESTEHENDEN PFAD
 * `notificationMatrix.dispatch` — kein neuer Kanal. Damit gelten automatisch die
 * Benachrichtigungs-Einstellungen des Nutzers; der Mailkanal wird zusaetzlich auf
 * hoechstens MAX_MAILS_JE_WOCHE pro Nutzer und Woche begrenzt.
 *
 * IDEMPOTENZ
 * `bounty_nudges` (Migration 171) mit UNIQUE (Nutzer, Bounty, Anlass, Woche, Kanal).
 * Der Eintrag wird VOR dem Versand gesetzt: lieber ein Anstupser zu wenig als
 * einer zu viel, wenn der Lauf mittendrin abbricht.
 */

import { getUserBounties, evaluateBounties, getBountyCatalog } from "./bountyService.js";
import { dispatch } from "./notificationMatrix.js";
import { dateOnlyDE } from "../utils/dateDE.js";

/** Ab diesem Fortschritt gilt ein Bounty als "kurz davor". */
export const NAH_AB_PROZENT = 70;

/** Hoechstens so viele Anstupser-Mails je Nutzer und Woche (A-E2). */
export const MAX_MAILS_JE_WOCHE = 1;

/** Anlaesse, die ueberhaupt per Mail gehen duerfen. */
export const MAIL_ANLAESSE = Object.freeze(["earned", "lost"]);

const EVENT_JE_ANLASS = Object.freeze({
  near: "bounty.near",
  earned: "bounty.earned",
  lost: "bounty.lost"
});

/**
 * ISO-Woche in der Form JJJJ-Wnn, gebildet ueber das deutsche Datum.
 *
 * Nicht ueber rohes UTC: ein Anstupser am Sonntagabend wuerde sonst je nach
 * Zeitzone in der Folgewoche landen und die Wochensperre aushebeln.
 */
export function isoWocheDE(wert = new Date()) {
  const iso = dateOnlyDE(wert);
  if (!iso) return "unbekannt";
  const [jahr, monat, tag] = iso.split("-").map(Number);
  // Donnerstag derselben Woche bestimmt das ISO-Jahr.
  const d = new Date(Date.UTC(jahr, monat - 1, tag));
  const wochentag = d.getUTCDay() || 7;          // Montag = 1 … Sonntag = 7
  d.setUTCDate(d.getUTCDate() + 4 - wochentag);
  const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const woche = Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(woche).padStart(2, "0")}`;
}

/**
 * Vergleicht den Stand VOR der Auswertung mit dem Ergebnis danach.
 *
 * Bewusst als reine Funktion: die Regel, wann jemand angestupst wird, soll ohne
 * Datenbank pruefbar sein.
 *
 * @param {Array<{key:string,is_active:boolean}>} vorher
 * @param {Array<{key:string,earned:boolean,progress:number,note:string|null}>} nachher
 * @returns {Array<{key:string,anlass:string,progress:number,note:string|null}>}
 */
export function bestimmeAnstupser(vorher = [], nachher = []) {
  const warAktiv = new Map((vorher || []).map((b) => [b.key, Boolean(b.is_active)]));
  const anstupser = [];

  for (const e of nachher || []) {
    const vorherAktiv = warAktiv.get(e.key) === true;
    const progress = Number(e.progress) || 0;

    if (e.earned && !vorherAktiv) {
      anstupser.push({ key: e.key, anlass: "earned", progress, note: e.note || null });
    } else if (!e.earned && vorherAktiv) {
      anstupser.push({ key: e.key, anlass: "lost", progress, note: e.note || null });
    } else if (!e.earned && !vorherAktiv && progress >= NAH_AB_PROZENT) {
      anstupser.push({ key: e.key, anlass: "near", progress, note: e.note || null });
    }
  }
  return anstupser;
}

/**
 * Baut den Klartext. Der Rabattsatz gehoert hinein — er ist der Grund, warum
 * die Nachricht ueberhaupt interessiert.
 */
export function formuliere(anlass, bounty, note) {
  const name = bounty?.name_de || bounty?.key || "Bounty";
  const pct = Number(bounty?.discount_pct) || 0;
  const rabatt = pct > 0 ? `${String(pct).replace(".", ",")} %` : null;

  if (anlass === "earned") {
    return rabatt
      ? `„${name}" freigeschaltet. Ab der naechsten Rechnung ${rabatt} Rabatt.`
      : `„${name}" freigeschaltet.`;
  }
  if (anlass === "lost") {
    // Die Begruendung kommt aus der Bedingung selbst (P8 Welle C) — sie nennt
    // Datum und Wiederverfuegbarkeit und ist praeziser als alles, was hier
    // formuliert werden koennte.
    return note
      ? `„${name}" entfallen. ${note}`
      : `„${name}" ist entfallen.`;
  }
  return note
    ? `Fast geschafft bei „${name}"${rabatt ? ` (${rabatt} Rabatt)` : ""}: ${note}`
    : `Fast geschafft bei „${name}"${rabatt ? ` — ${rabatt} Rabatt` : ""}.`;
}

/** Wie viele Anstupser-Mails dieser Nutzer in dieser Woche schon bekommen hat. */
async function mailsDieseWoche(pool, userId, woche) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM bounty_nudges
      WHERE user_id = $1 AND kanal = 'email' AND woche = $2`,
    [userId, woche]
  );
  return rows[0]?.n || 0;
}

/**
 * Merkt einen Anstupser vor. Gibt false zurueck, wenn es ihn diese Woche schon
 * gab — dann wird nicht versendet.
 */
async function merkeVor(pool, userId, key, anlass, woche, kanal) {
  const { rowCount } = await pool.query(
    `INSERT INTO bounty_nudges (user_id, bounty_key, anlass, woche, kanal)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, bounty_key, anlass, woche, kanal) DO NOTHING`,
    [userId, key, anlass, woche, kanal]
  );
  return rowCount > 0;
}

/**
 * Nimmt den Vermerk zurueck, wenn der Versand scheiterte.
 *
 * Ohne das waere ein einzelner Fehler teuer: der Vermerk steht, der Anstupser
 * ging nie raus, und die Wochensperre verhindert jeden weiteren Versuch bis
 * Montag. So bleibt es bei "hoechstens einmal" — mit Wiederholung beim naechsten
 * Lauf, statt einer stillen Aussetzung fuer sieben Tage.
 */
async function nimmVermerkZurueck(pool, userId, key, anlass, woche, kanaele) {
  try {
    await pool.query(
      `DELETE FROM bounty_nudges
        WHERE user_id = $1 AND bounty_key = $2 AND anlass = $3 AND woche = $4
          AND kanal = ANY($5::text[])`,
      [userId, key, anlass, woche, kanaele]
    );
  } catch { /* best-effort — schlimmstenfalls faellt dieser Anstupser diese Woche aus */ }
}

/**
 * Stupst einen einzelnen Nutzer an.
 * @returns {Promise<{geprueft:number, inApp:number, mail:number}>}
 */
export async function stupseNutzerAn(pool, userId, opts = {}) {
  const woche = opts.woche || isoWocheDE(opts.now);
  const ergebnis = { geprueft: 0, inApp: 0, mail: 0 };

  const vorher = await getUserBounties(pool, userId);
  const nachher = await evaluateBounties(pool, userId);
  const anstupser = bestimmeAnstupser(vorher, nachher);
  ergebnis.geprueft = anstupser.length;
  if (!anstupser.length) return ergebnis;

  const katalog = await getBountyCatalog(pool, { includeInactive: true });
  const jeKey = new Map(katalog.map((b) => [b.key, b]));

  let mailsUebrig = Math.max(0, MAX_MAILS_JE_WOCHE - await mailsDieseWoche(pool, userId, woche));

  for (const a of anstupser) {
    const bounty = jeKey.get(a.key);
    // Ein abgeschaltetes Bounty stupst nicht an — sonst bewirbt die Plattform
    // etwas, das es nicht mehr gibt.
    if (!bounty || bounty.is_active === false) continue;

    const text = formuliere(a.anlass, bounty, a.note);
    const darfMailen = MAIL_ANLAESSE.includes(a.anlass) && mailsUebrig > 0;

    if (!await merkeVor(pool, userId, a.key, a.anlass, woche, "in_app")) continue;

    let mailGemerkt = false;
    if (darfMailen) {
      mailGemerkt = await merkeVor(pool, userId, a.key, a.anlass, woche, "email");
      if (mailGemerkt) mailsUebrig -= 1;
    }

    try {
      await dispatch(pool, EVENT_JE_ANLASS[a.anlass], {
        recipientUserIds: [userId],
        entityType: "bounty",
        // Die UUID des Katalogeintrags, NICHT der Schluessel: `entity_id` ist eine
        // UUID-Spalte. Mit dem Schluessel scheitert der INSERT — und zwar erst an
        // der echten Datenbank, nicht in einer Attrappe.
        entityId: bounty.id,
        message: text,
        emailQueue: mailGemerkt,
        emailText: mailGemerkt
          ? `${text}\n\nDiese Nachricht kommt von TempConnect. Du kannst solche Hinweise `
            + `jederzeit unter „Einstellungen → Benachrichtigungen" abschalten.`
          : undefined
      });
    } catch (err) {
      const kanaele = mailGemerkt ? ["in_app", "email"] : ["in_app"];
      await nimmVermerkZurueck(pool, userId, a.key, a.anlass, woche, kanaele);
      if (mailGemerkt) mailsUebrig += 1;
      throw err;
    }

    ergebnis.inApp += 1;
    if (mailGemerkt) ergebnis.mail += 1;
  }

  return ergebnis;
}

/**
 * Der Lauf ueber alle Nutzer, fuer die ein Rabatt ueberhaupt Bedeutung hat:
 * aktive, zahlende Abos. Wer kein Abo hat, bekommt keine Rechnung — ihn an einen
 * Rabatt zu erinnern waere Werbung ohne Anlass.
 */
export async function laufeAnstupserDurch(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 2000);
  const logger = opts.logger || null;
  const woche = opts.woche || isoWocheDE(opts.now);

  const { rows } = await pool.query(
    `SELECT DISTINCT s.user_id
       FROM subscriptions s
      WHERE s.status IN ('active','past_due')
        AND s.plan <> 'DEMO'
      ORDER BY s.user_id
      LIMIT $1`,
    [limit]
  );

  const bilanz = { nutzer: 0, inApp: 0, mail: 0, fehler: 0 };
  for (const r of rows) {
    bilanz.nutzer += 1;
    try {
      const e = await stupseNutzerAn(pool, r.user_id, { woche });
      bilanz.inApp += e.inApp;
      bilanz.mail += e.mail;
    } catch (err) {
      // Ein Nutzer darf den Lauf nicht stoppen — aber der Fehler bleibt sichtbar.
      bilanz.fehler += 1;
      logger?.warn?.({ err: err?.message, userId: r.user_id }, "Bounty-Anstupser fehlgeschlagen");
    }
  }
  return bilanz;
}
