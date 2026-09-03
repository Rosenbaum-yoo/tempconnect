/**
 * Der Betriebstakt — ein Herzschlag je Aufgabe.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM ES DIESEN DIENST GIBT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Leitentscheidung M-L9: **Kein Automatismus gilt als geliefert, solange nicht
 * messbar ist, wann er zuletzt lief.**
 *
 * Der Anlass ist gemessen (M0, 2026-09-01): `sweepMarktpraesenz` hat genau
 * einen Aufrufer, der ist ein HTTP-Endpunkt, und im ganzen Stack ruft den
 * niemand. Die Marktplatz-Automatik war vollstaendig gebaut und lief nie — ein
 * Jahr lang, ohne dass es irgendwo aufgefallen waere. Es gab keinen Ort, an dem
 * ihr SCHWEIGEN sichtbar wurde.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE REGISTRATUR IST DAS SOLL — UND SIE LIEGT IM CODE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `TAKTE` sagt, welche Aufgabe wie oft laufen SOLL. Sie steht bewusst hier und
 * nicht in der Datenbank:
 *
 *   * Sie steht neben dem Takt, den sie beschreibt — wer einen Takt aendert,
 *     sieht sein Soll in derselben Datei.
 *   * Ein Waechter, der sein Soll aus derselben Tabelle liest, die er bewacht,
 *     bewacht nichts. Wer den Takt abschaltet, koennte sonst einfach das Soll
 *     mit abschalten.
 *
 * Eine Aufgabe OHNE Eintrag ist kein Fehler — sie wird protokolliert, aber
 * nicht ueberwacht. Das ist Absicht: die 28 internen Endpunkte sind zum
 * groessten Teil Werkzeuge fuer den Betrieb, keine Automatismen mit Erwartung.
 * Ueberwacht wird nur, was laufen MUSS.
 */

import { logger } from "../config/index.js";

/**
 * Was laufen MUSS, und wie oft.
 *
 * `intervall_min` ist das erwartete Intervall in Minuten. Der Waechter schlaegt
 * an, wenn eine Aufgabe laenger schweigt als **das Dreifache** davon — ein
 * einzelner verpasster Lauf (Neustart, Redis kurz weg) ist kein Alarm, drei
 * hintereinander sind einer.
 *
 * `ohne_einplanung` (M0-Abgleich 2026-09-03): diese Aufgabe hat KEINEN
 * `upsertJobScheduler`-Aufruf in api/workers/index.js. Sie steht hier als Soll,
 * aber nichts loest sie aus — der Zustand ist dauerhaft `still`, bis jemand sie
 * einplant oder von Hand anstoesst.
 *
 * Gemessen: von zehn erwarteten Takten sind FUENF eingeplant. Die anderen fuenf
 * sind Geld und Lebenszyklus. Das ist kein Versehen im Code, sondern eine offene
 * BETRIEBSENTSCHEIDUNG (F5/F29 im M0-Bericht): `recurring-billing` wuerde
 * anfangen, Rechnungen zu erzeugen, und `dunning-sweep`, Mahnungen zu
 * verschicken. Beides schaltet man nicht nebenbei ein.
 *
 * Das Feld ist deshalb keine Entschuldigung, sondern eine Zusicherung:
 * `takteEingeplant.test.js` verlangt, dass jede Aufgabe entweder eingeplant ist
 * ODER hier einen Grund traegt — und faerbt rot, wenn ein Grund stehen bleibt,
 * nachdem die Aufgabe eingeplant wurde. Eine Luecke, die man beschreibt, kann
 * nicht mehr unbemerkt bleiben; eine, die man nur kennt, schon.
 */
export const TAKTE = Object.freeze({
  /* Die Marktplatz-Automatik. Der Grund fuer diese ganze Phase: Skills werden
   * zu Angeboten, abgelaufene werden zurueckgenommen. Ohne sie bleibt der
   * Marktplatz leer, egal wie viele Menschen Faehigkeiten eintragen. */
  "staffing-maintenance": { intervall_min: 15, zweck: "Marktbefuellung, Nachruecken, Verfall von Einladungen" },

  /* Faelligkeit der Rechnungen. Haengt an derselben nie eingerichteten Zeile —
   * `overdue` ist ein gueltiger Zustand, den heute nichts je setzt. */
  "invoice-overdue-scan": { intervall_min: 1440, zweck: "Rechnungen auf faellig setzen" ,
    ohne_einplanung: "Nicht eingeplant. Setzt Rechnungen auf 'overdue' — der Zustand ist gueltig und wird heute von nichts gesetzt. Haengt an derselben Betriebsentscheidung wie die Mahnstrecke: sobald er laeuft, fuellt sich die Arbeitsliste des Operators, und solange loadAttention keinen Typfilter traegt, mit Rueckstaenden, die Kunden EINANDER schulden (offene Frage F30)." },

  /* Mahnstrecke und wiederkehrende Abrechnung. */
  "dunning-sweep": { intervall_min: 1440, zweck: "Mahnstufen und Hard-Lock bei Zahlungsausfall" ,
    ohne_einplanung: "Nicht eingeplant. Verschickt Mahnungen und setzt den Hard-Lock bei Zahlungsausfall — die folgenreichste der fuenf. Einschalten heisst: ab dem ersten Lauf gehen Zahlungserinnerungen an echte Kunden. Owner-Entscheidung." },
  "recurring-billing": { intervall_min: 1440, zweck: "Wiederkehrende Abo-Rechnungen erzeugen" ,
    ohne_einplanung: "Nicht eingeplant. Erzeugt die wiederkehrenden Abo-Rechnungen. Ohne Takt entsteht keine Folgerechnung — die Einnahmenseite laeuft heute nur, soweit jemand von Hand ausloest. Owner-Entscheidung, weil der erste Lauf einen Nachlauf fuer alle faelligen Zeitraeume erzeugt." },

  /* Abo-Wirksamkeit zum Stichtag. Ohne Takt wird ein Abo mit zukuenftigem
   * Beginn nie von selbst wirksam. */
  "subscription-lifecycle-tick": { intervall_min: 60, zweck: "Abo-Aktivierung zum Stichtag" ,
    ohne_einplanung: "Nicht eingeplant. Ohne ihn wird ein Abo mit zukuenftigem Beginn nie von selbst wirksam; der Kunde hat gekauft und wartet. Fachlich die harmloseste der fuenf und der naheliegendste erste Schritt." },

  /* Reservierungen und Fristen. */
  "expire-reservations": { intervall_min: 60, zweck: "Abgelaufene Reservierungen freigeben" ,
    ohne_einplanung: "Nicht eingeplant. Gibt abgelaufene Reservierungen frei. Ohne Takt bleibt Kapazitaet gebunden, die niemand mehr braucht — kein Schaden nach aussen, aber der Marktplatz wirkt voller als er ist." },

  /* Die vier BullMQ-Takte, die es bereits gibt (api/workers/index.js:24-47).
   * Sie laufen — aber niemand konnte es bisher nachweisen. */
  "capacity:capacity-expiry": { intervall_min: 1440, zweck: "Abgelaufene Angebote schliessen" },
  "capacity:capacity-stale-check": { intervall_min: 1440, zweck: "Ueberfaellige Eintraege melden" },
  "capacity:worker-status-events-retention": { intervall_min: 1440, zweck: "Zustandsprotokoll aufraeumen" },
  "capacity:ersatz-frist": { intervall_min: 10, zweck: "Ersatzstellung: 4-h-Verfall, 2-h-Erinnerung" }
});

/** Die Faktor, um den eine Aufgabe schweigen darf, bevor der Waechter anschlaegt. */
export const TOLERANZ = 3;

/**
 * Einen Lauf festhalten. WIRFT NIE.
 *
 * Ein Herzschlag, der den Lauf zum Scheitern bringen kann, den er beobachtet,
 * waere schlimmer als keiner: der Takt fiele aus, WEIL er ueberwacht wird. Ein
 * Fehlschlag hier wird protokolliert und sonst geschluckt.
 *
 * @param {import('pg').Pool} pool
 * @param {{aufgabe: string, dauerMs?: number, ergebnis?: 'ok'|'fehler',
 *          fehler?: string|null, quelle?: 'intern'|'takt'}} lauf
 * @returns {Promise<boolean>} true, wenn geschrieben wurde
 */
export async function taktNotieren(pool, lauf = {}) {
  const aufgabe = String(lauf.aufgabe || "").trim();
  if (!aufgabe) return false;

  const ergebnis = lauf.ergebnis === "fehler" ? "fehler" : "ok";
  const quelle = lauf.quelle === "takt" ? "takt" : "intern";
  const dauer = Number.isFinite(Number(lauf.dauerMs)) ? Math.round(Number(lauf.dauerMs)) : null;
  /* Die Fehlermeldung wird gekuerzt, nicht verworfen: eine Zeile, die wegen
   * eines langen Stapelverlaufs nicht geschrieben wird, ist der schlechteste
   * aller Zustaende. */
  const fehler = ergebnis === "fehler" && lauf.fehler ? String(lauf.fehler).slice(0, 500) : null;

  try {
    await pool.query(
      `INSERT INTO betriebs_takt
         (aufgabe, zuletzt_um, dauer_ms, ergebnis, fehler, laeufe, fehler_in_folge, quelle)
       VALUES ($1, NOW(), $2, $3, $4, 1, CASE WHEN $3 = 'fehler' THEN 1 ELSE 0 END, $5)
       ON CONFLICT (aufgabe) DO UPDATE
         SET zuletzt_um      = NOW(),
             dauer_ms        = EXCLUDED.dauer_ms,
             ergebnis        = EXCLUDED.ergebnis,
             /* Der Grund des letzten Fehlschlags bleibt stehen, bis ein Lauf
              * gelingt — sonst waere er genau dann weg, wenn jemand nachsieht. */
             fehler          = CASE WHEN EXCLUDED.ergebnis = 'fehler'
                                    THEN EXCLUDED.fehler ELSE NULL END,
             laeufe          = betriebs_takt.laeufe + 1,
             fehler_in_folge = CASE WHEN EXCLUDED.ergebnis = 'fehler'
                                    THEN betriebs_takt.fehler_in_folge + 1 ELSE 0 END,
             quelle          = EXCLUDED.quelle,
             aktualisiert_am = NOW()`,
      [aufgabe, dauer, ergebnis, fehler, quelle]
    );
    return true;
  } catch (e) {
    logger.warn({ err: e?.message, aufgabe }, "Betriebstakt konnte nicht festgehalten werden");
    return false;
  }
}

/** Minuten zwischen einem Zeitpunkt und jetzt. */
function minutenHer(zeitpunkt, jetzt) {
  if (!zeitpunkt) return null;
  const t = zeitpunkt instanceof Date ? zeitpunkt.getTime() : new Date(zeitpunkt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((jetzt - t) / 60000));
}

/**
 * Der Zustand einer einzelnen Aufgabe — REINE FUNKTION.
 *
 * Absichtlich ohne Datenbank: die Frage "schweigt diese Aufgabe zu lange?" ist
 * der Kern der Ueberwachung und muss einzeln pruefbar sein.
 *
 * Drei Zustaende, und der dritte ist der wichtigste:
 *   still  — hat NIE gelaufen. Genau der Fall der Marktplatz-Automatik, und
 *            der einzige, den ein "wann zuletzt?"-Blick uebersieht, weil es
 *            gar keine Zeile gibt.
 *   spaet  — laenger still als Intervall × TOLERANZ
 *   fehler — der letzte Lauf ist gescheitert
 *   ok     — laeuft
 */
export function bewerteAufgabe(aufgabe, zeile, jetzt = Date.now()) {
  const soll = TAKTE[aufgabe];
  const her = minutenHer(zeile?.zuletzt_um, jetzt);

  if (!zeile || her == null) {
    return {
      aufgabe, zustand: "still", minuten_her: null,
      soll_min: soll?.intervall_min ?? null,
      zweck: soll?.zweck ?? null,
      /* Ein Automatismus, der noch NIE lief, ist der schwerste Fall — und der
       * unauffaelligste, weil nichts da ist, das alt aussehen koennte. */
      grund: "Diese Aufgabe ist noch nie gelaufen."
    };
  }

  const grenze = soll ? soll.intervall_min * TOLERANZ : null;
  const zuSpaet = grenze != null && her > grenze;

  return {
    aufgabe,
    zustand: zuSpaet ? "spaet" : (zeile.ergebnis === "fehler" ? "fehler" : "ok"),
    minuten_her: her,
    soll_min: soll?.intervall_min ?? null,
    zweck: soll?.zweck ?? null,
    dauer_ms: zeile.dauer_ms ?? null,
    laeufe: Number(zeile.laeufe) || 0,
    fehler_in_folge: Number(zeile.fehler_in_folge) || 0,
    letzter_fehler: zeile.fehler || null,
    quelle: zeile.quelle || null,
    grund: zuSpaet
      ? `Seit ${her} Minuten still, erwartet werden hoechstens ${grenze}.`
      : (zeile.ergebnis === "fehler" ? "Der letzte Lauf ist gescheitert." : null)
  };
}

/**
 * Der Stand aller ueberwachten Aufgaben — die Grundlage der Kachel im Staff CC.
 *
 * EINE Abfrage, nicht eine je Aufgabe. Und sie geht von der REGISTRATUR aus,
 * nicht von der Tabelle: eine Aufgabe, die nie lief, hat keine Zeile — und
 * genau die ist der Befund, den diese Phase sichtbar machen soll. Wer von der
 * Tabelle ausgeht, sieht sie nie.
 */
export async function taktStand(pool, { jetzt = Date.now() } = {}) {
  let zeilen = [];
  try {
    const { rows } = await pool.query(
      `SELECT aufgabe, zuletzt_um, dauer_ms, ergebnis, fehler, laeufe,
              fehler_in_folge, quelle
         FROM betriebs_takt`
    );
    zeilen = rows;
  } catch (e) {
    logger.warn({ err: e?.message }, "Betriebstakt konnte nicht gelesen werden");
    /* Ohne Tabelle ist der ehrliche Befund "alles still", nicht "alles gut". */
  }

  const nachName = new Map(zeilen.map((z) => [z.aufgabe, z]));
  const ueberwacht = Object.keys(TAKTE)
    .map((a) => bewerteAufgabe(a, nachName.get(a), jetzt))
    .sort((a, b) => {
      /* Am dringendsten zuerst: nie gelaufen, dann zu spaet, dann Fehler. */
      const rang = { still: 0, spaet: 1, fehler: 2, ok: 3 };
      if (rang[a.zustand] !== rang[b.zustand]) return rang[a.zustand] - rang[b.zustand];
      return (b.minuten_her ?? Infinity) - (a.minuten_her ?? Infinity);
    });

  /* Was laeuft, ohne ueberwacht zu sein. Kein Alarm — aber es gehoert in die
   * Kachel, sonst sieht ein Mensch nur die halbe Wirklichkeit. */
  const beobachtet = zeilen
    .filter((z) => !TAKTE[z.aufgabe])
    .map((z) => ({
      aufgabe: z.aufgabe,
      minuten_her: minutenHer(z.zuletzt_um, jetzt),
      ergebnis: z.ergebnis,
      laeufe: Number(z.laeufe) || 0,
      quelle: z.quelle || null
    }))
    .sort((a, b) => (a.minuten_her ?? 0) - (b.minuten_her ?? 0));

  return {
    ueberwacht,
    beobachtet,
    zusammenfassung: {
      ueberwacht: ueberwacht.length,
      still: ueberwacht.filter((a) => a.zustand === "still").length,
      spaet: ueberwacht.filter((a) => a.zustand === "spaet").length,
      fehler: ueberwacht.filter((a) => a.zustand === "fehler").length,
      ok: ueberwacht.filter((a) => a.zustand === "ok").length,
      beobachtet: beobachtet.length
    },
    toleranz: TOLERANZ
  };
}
