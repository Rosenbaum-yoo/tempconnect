/**
 * Die Ueberlassungshoechstdauer nach § 1 Abs. 1b AUEG — Welle K3.4, E-K3-1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE REGEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Verleiher darf denselben Leiharbeitnehmer nicht laenger als **18
 * aufeinander folgende Monate** demselben Entleiher ueberlassen (Satz 1).
 *
 * Vorherige Ueberlassungen an DENSELBEN ENTLEIHER werden **vollstaendig
 * angerechnet**, wenn dazwischen nicht mehr als **drei Monate** liegen — und
 * zwar auch dann, wenn sie ueber einen ANDEREN Verleiher liefen (Satz 2). Die
 * Rechnung folgt also dem Paar (Kraft, Entleiher), nicht dem Vertrag.
 *
 * Tarifvertraege der Einsatzbranche duerfen abweichen (Saetze 3 ff.). Die
 * Abweichung haengt am ENTLEIHER und steht in `aueg_konfiguration`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DAS SO VORSICHTIG GEBAUT IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die Rechtsfolge einer Ueberschreitung ist erheblich: der Arbeitsvertrag mit
 * dem Verleiher wird unwirksam, es entsteht ein fingiertes Arbeitsverhaeltnis
 * mit dem Entleiher (§ 9 Abs. 1 Nr. 1b, § 10 Abs. 1), dazu ein Bussgeld.
 *
 * Deshalb wurde diese Pruefung in K3.4 zunaechst NICHT gebaut, sondern als
 * offene Owner-Entscheidung gefuehrt — eine geratene gesetzliche Frist waere
 * schlimmer als gar keine. Sie existiert jetzt auf ausdrueckliche Anweisung
 * (E-K3-1, 2026-08-31) und mit drei Vorsichtsmassnahmen:
 *
 *   1. DIE FRIST IST KONFIGURIERBAR. 18 ist die Voreinstellung, nicht das
 *      Gesetz in Stein. Wer abweicht, muss die Grundlage benennen — das
 *      erzwingt die Datenbank.
 *
 *   2. DIE KETTENBILDUNG IST EINE REINE FUNKTION. `ketten()` bekommt Zeitraeume
 *      und gibt Ketten zurueck, ohne Datenbank. Damit ist der rechtliche Kern
 *      einzeln pruefbar — und er IST einzeln geprueft, mit Rueckmutationen.
 *
 *   3. DIE GRENZE DER DATENLAGE STEHT IN JEDER ANTWORT. Wir sehen nur
 *      Ueberlassungen, die auf DIESER Plattform stehen. Lief dieselbe Kraft
 *      zuvor ueber einen Verleiher, der TempConnect nicht benutzt, fehlt die
 *      Zeit — obwohl das Gesetz sie anrechnen wuerde. `nur_plattformdaten`
 *      sagt das, in jeder Antwort, auch wenn nichts gefunden wurde.
 *
 * Eine Frist, die sich sicherer gibt, als sie ist, waere die schlechtere
 * Variante von gar keiner.
 */

import { todayDE } from "../utils/dateDE.js";

/** § 1 Abs. 1b Satz 1 AUEG. Voreinstellung, nicht Konstante — siehe oben. */
export const HOECHSTDAUER_MONATE = 18;

/** § 1 Abs. 1b Satz 2 AUEG: mehr als drei Monate Pause setzen die Anrechnung zurueck. */
export const UNTERBRECHUNG_MONATE = 3;

/** Ab wann die Flaeche warnt, bevor die Frist reisst. */
export const VORWARNUNG_MONATE = 3;

/* ── Datumsrechnung ───────────────────────────────────────────────────── */

/**
 * `monate` Monate nach `datum`, mit Monatsende-Klemme.
 *
 * 31.01. plus einen Monat ist der 28. Februar, nicht der 3. Maerz. Ohne die
 * Klemme rutschte eine Frist, die an einem Monatsletzten beginnt, jedes Mal um
 * ein paar Tage nach hinten — bei einer gesetzlichen Frist ist das keine
 * Kleinigkeit.
 *
 * Bewusst ohne `toISOString().slice(0, 10)` (Waechter `kalendertagDE.test.js`).
 */
export function monateSpaeter(datum, monate) {
  const iso = String(datum).slice(0, 10);
  const jahr = Number(iso.slice(0, 4));
  const monat = Number(iso.slice(5, 7));
  const tag = Number(iso.slice(8, 10));

  const zielMonatIndex = monat - 1 + Number(monate);
  // Der Nullte des Folgemonats ist dessen Vorgaenger-Letzter.
  const letzterImZiel = new Date(Date.UTC(jahr, zielMonatIndex + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(jahr, zielMonatIndex, Math.min(tag, letzterImZiel)));

  const zwei = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}

/** Tage zwischen zwei Kalendertagen, ohne Zeitzone. */
export function tageZwischen(von, bis) {
  const t = (d) => Date.UTC(
    Number(String(d).slice(0, 4)), Number(String(d).slice(5, 7)) - 1, Number(String(d).slice(8, 10))
  );
  return Math.round((t(bis) - t(von)) / 86400000);
}

/** Kalendertag aus einem beliebigen Datumswert — ohne Zeitzonen-Rutsch. */
export function tag(wert) {
  if (!wert) return null;
  if (typeof wert === "string") return wert.slice(0, 10);
  const zwei = (n) => String(n).padStart(2, "0");
  return `${wert.getUTCFullYear()}-${zwei(wert.getUTCMonth() + 1)}-${zwei(wert.getUTCDate())}`;
}

/* ── Der rechtliche Kern ──────────────────────────────────────────────── */

/**
 * Bildet aus einzelnen Ueberlassungen die ANRECHNUNGSKETTEN.
 *
 * REINE FUNKTION, ohne Datenbank — damit der rechtliche Kern einzeln pruefbar
 * ist. Genau das ist der Grund, warum sie nicht in der SQL-Abfrage steckt.
 *
 * Die Regel (§ 1 Abs. 1b Satz 2): eine neue Ueberlassung setzt die bisherige
 * Kette FORT, wenn die Pause seit deren Ende **nicht mehr als** die zulaessige
 * Unterbrechung betraegt. Erst eine laengere Pause beginnt eine neue Kette.
 *
 * Ueberlappende Zeitraeume gelten selbstverstaendlich als fortlaufend — sie sind
 * derselbe Zeitraum, nur zweimal erfasst.
 *
 * @param {Array<{von: string, bis: string|null, quelle?: any}>} zeitraeume
 * @param {{unterbrechungMonate?: number}} [opts]
 * @returns {Array<{von: string, bis: string|null, offen: boolean, teile: Array}>}
 */
export function ketten(zeitraeume, opts = {}) {
  const pause = Number.isFinite(Number(opts.unterbrechungMonate))
    ? Number(opts.unterbrechungMonate)
    : UNTERBRECHUNG_MONATE;

  const sortiert = (zeitraeume || [])
    .filter((z) => z && z.von)
    .map((z) => ({ von: tag(z.von), bis: z.bis ? tag(z.bis) : null, quelle: z.quelle ?? null }))
    .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));

  const ergebnis = [];
  for (const z of sortiert) {
    const letzte = ergebnis[ergebnis.length - 1];

    if (!letzte) {
      ergebnis.push({ von: z.von, bis: z.bis, offen: z.bis === null, teile: [z] });
      continue;
    }

    /* Eine offene Kette laeuft weiter — sie kann nie unterbrochen sein, weil sie
     * kein Ende hat. Alles, was danach beginnt, gehoert dazu. */
    if (letzte.offen) {
      /* Ob die neue Ueberlassung selbst ein Ende hat, aendert hier NICHTS: die
       * Kette bleibt offen, solange die offene nicht beendet wurde.
       *
       * Hier stand bis zur Mutationsprobe (K3.6) ein `if (z.bis === null)
       * continue;` davor — mit demselben `continue` dahinter. Beide Zweige
       * taten dasselbe, die Bedingung war wirkungslos. Aufgefallen ist sie
       * nicht beim Lesen, sondern daran, dass drei Mutanten an dieser Zeile
       * ueberlebten, ohne dass eine Probe sie haette toeten koennen. */
      letzte.teile.push(z);
      continue;
    }

    // Die zulaessige Pause laeuft ab dem TAG NACH dem Ende der bisherigen Kette.
    const spaetesterAnschluss = monateSpaeter(letzte.bis, pause);

    if (z.von <= spaetesterAnschluss) {
      // Fortsetzung: die Kette waechst, ihr BEGINN bleibt stehen — daran haengt
      // die Frist.
      letzte.teile.push(z);
      letzte.offen = z.bis === null;
      if (z.bis === null) letzte.bis = null;
      else if (z.bis > letzte.bis) letzte.bis = z.bis;
    } else {
      ergebnis.push({ von: z.von, bis: z.bis, offen: z.bis === null, teile: [z] });
    }
  }
  return ergebnis;
}

/**
 * Bewertet eine Kette gegen die Hoechstdauer.
 *
 * Der Ueberschreitungstag ist `Kettenbeginn + Hoechstdauer`. Er ist der ERSTE
 * Tag, an dem die Ueberlassung zu lang waere — deshalb wird die Kette
 * beanstandet, sobald sie IHN ERREICHT, nicht erst danach.
 */
export function bewerteKette(kette, opts = {}) {
  const hoechstdauer = Number.isFinite(Number(opts.hoechstdauerMonate))
    ? Number(opts.hoechstdauerMonate)
    : HOECHSTDAUER_MONATE;
  const heute = opts.heute || todayDE();

  /* DER STICHTAG IST NICHT IMMER HEUTE.
   *
   * Wer den September 2027 aufschlaegt, will wissen, ob die Frist DANN gerissen
   * ist — nicht, ob sie es heute schon ist. Die erste Fassung rechnete beides
   * gegeneinander: der Konflikt war "hart", weil die Frist im Fenster liegt,
   * und `ueberschritten` war gleichzeitig `false`, weil sie heute noch nicht
   * erreicht ist. Zwei Felder derselben Zeile widersprachen sich.
   *
   * `tage_bis_ueberschreitung` bleibt bewusst auf HEUTE bezogen: "noch 375 Tage"
   * ist eine Aussage ueber die Gegenwart, nicht ueber den betrachteten Monat. */
  const stichtag = opts.stichtag || heute;

  const ueberschreitungAm = monateSpaeter(kette.von, hoechstdauer);

  /* "Am Stichtag erreicht?" heisst: bis DAHIN, nicht darueber hinaus. Eine Kette,
   * die bis zum 11.09. geplant ist, hat die Frist am 30.06. noch NICHT erreicht —
   * dass sie es tun wird, ist die Vorwarnung, nicht der Befund. Ohne diese
   * Klemme meldete der Juni ein `ueberschritten: true` neben einem weichen
   * Grad, und zwei Felder derselben Zeile widersprachen sich wieder. */
  const endeRoh = kette.offen ? stichtag : kette.bis;
  const wirksamesEnde = endeRoh == null ? null : (endeRoh > stichtag ? stichtag : endeRoh);

  return {
    von: kette.von,
    bis: kette.bis,
    offen: kette.offen,
    teile: kette.teile.length,
    hoechstdauer_monate: hoechstdauer,
    ueberschreitung_am: ueberschreitungAm,
    stichtag,
    // Ist die Frist AM STICHTAG erreicht?
    ueberschritten: wirksamesEnde != null && wirksamesEnde >= ueberschreitungAm,
    // Ist sie HEUTE schon erreicht? Der Unterschied zaehlt: das eine ist eine
    // Vorhersage, das andere ein Zustand.
    bereits_ueberschritten: heute >= ueberschreitungAm,
    // Wie viele Tage bleiben von heute aus. Negativ heisst: laengst darueber.
    tage_bis_ueberschreitung: tageZwischen(heute, ueberschreitungAm)
  };
}

/* ── Datenzugriff ─────────────────────────────────────────────────────── */

/**
 * Die abweichenden Hoechstdauern der genannten Entleiher.
 *
 * EINE Abfrage fuer alle, nicht eine je Organisation. Ohne Eintrag gilt die
 * gesetzliche Voreinstellung.
 *
 * WIRFT NIE: fehlt die Tabelle oder haengt die Abfrage, gilt ueberall 18/3 —
 * also die STRENGERE Annahme. Ein Ausfall darf hier nicht dazu fuehren, dass
 * eine Ueberschreitung unbemerkt bleibt.
 */
export async function konfigurationen(pool, orgIds) {
  const map = new Map();
  const ids = [...new Set((orgIds || []).filter(Boolean))];
  if (!ids.length) return map;
  try {
    const { rows } = await pool.query(
      `SELECT org_id, hoechstdauer_monate, unterbrechung_monate, grundlage
         FROM aueg_konfiguration WHERE org_id = ANY($1::uuid[])`,
      [ids]
    );
    for (const r of rows) {
      map.set(String(r.org_id), {
        hoechstdauerMonate: Number(r.hoechstdauer_monate),
        unterbrechungMonate: Number(r.unterbrechung_monate),
        grundlage: r.grundlage || null
      });
    }
  } catch {
    /* Ohne Konfiguration gilt ueberall die gesetzliche Voreinstellung — die
     * strengere Annahme. */
  }
  return map;
}

/**
 * Alle Ueberlassungen der Paare (Kraft, Entleiher), die im Fenster vorkommen.
 *
 * ZWEI SCHRITTE, NICHT N+1: erst die Paare aus dem Fenster, dann in EINER
 * zweiten Abfrage deren VOLLSTAENDIGE Geschichte. Die Geschichte muss
 * vollstaendig sein, weil die Frist am Kettenbeginn haengt — ein Ausschnitt
 * ergaebe eine zu kurze Kette und damit eine uebersehene Ueberschreitung.
 *
 * Die Abfrage ist bewusst NICHT auf die eigene Organisation begrenzt: § 1
 * Abs. 1b Satz 2 rechnet Ueberlassungen ANDERER Verleiher an denselben
 * Entleiher an. Gefiltert wird ueber die Paare, die im Fenster ohnehin sichtbar
 * sind — es gelangt also nichts in die Antwort, das der Abfragende nicht
 * ohnehin sehen darf.
 */
export async function ueberlassungen(pool, paare) {
  if (!paare?.length) return new Map();

  const kraefte = [...new Set(paare.map((p) => p.worker_user_id))];
  const entleiher = [...new Set(paare.map((p) => p.org_id))];

  const { rows } = await pool.query(
    `SELECT l.worker_user_id, l.org_id,
            GREATEST(l.start_date, a.start_date) AS von,
            LEAST(
              COALESCE(l.end_date,          DATE '9999-12-31'),
              COALESCE(a.actual_end_date,   DATE '9999-12-31'),
              COALESCE(a.planned_end_date,  DATE '9999-12-31')
            ) AS bis,
            l.assignment_id, l.supplier_org_id
       FROM worker_assignment_links l
       JOIN assignments a ON a.id = l.assignment_id
      WHERE l.worker_user_id = ANY($1::uuid[])
        AND l.org_id = ANY($2::uuid[])
        AND a.status <> 'cancelled'
      ORDER BY l.worker_user_id, l.org_id, von`,
    [kraefte, entleiher]
  );

  const map = new Map();
  for (const r of rows) {
    const schluessel = `${r.worker_user_id}|${r.org_id}`;
    if (!map.has(schluessel)) map.set(schluessel, []);
    map.get(schluessel).push({
      von: tag(r.von),
      // `9999-12-31` ist die Platzhalter-Unendlichkeit der Abfrage, kein Datum.
      bis: tag(r.bis) === "9999-12-31" ? null : tag(r.bis),
      quelle: { assignment_id: r.assignment_id, supplier_org_id: r.supplier_org_id }
    });
  }
  return map;
}

/**
 * Die AUEG-Befunde zu den Paaren, die im Monatsfenster vorkommen.
 *
 * @param {Array<{worker_user_id, org_id, kraft_name?, assignment_id?}>} paare
 * @returns {Promise<{befunde: Array, nur_plattformdaten: true}>}
 */
export async function auegBefunde(pool, paare, opts = {}) {
  const heute = opts.heute || todayDE();
  const fensterBis = opts.fensterBis || heute;

  const [geschichte, konfig] = await Promise.all([
    ueberlassungen(pool, paare),
    konfigurationen(pool, (paare || []).map((p) => p.org_id))
  ]);

  const befunde = [];
  const gesehen = new Set();

  for (const paar of paare || []) {
    const schluessel = `${paar.worker_user_id}|${paar.org_id}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);

    const zeitraeume = geschichte.get(schluessel) || [];
    if (!zeitraeume.length) continue;

    const regel = konfig.get(String(paar.org_id)) || {};
    /* Der Stichtag ist das FENSTERENDE: der Monat, den jemand aufgeschlagen hat,
     * ist die Frage — nicht der heutige Tag. */
    const bewertet = ketten(zeitraeume, regel)
      .map((k) => bewerteKette(k, { ...regel, heute, stichtag: fensterBis }));

    /* Die Kette, die im Fenster zaehlt: eine, die BIS IN DAS FENSTER reicht.
     *
     * KEIN RUECKFALL AUF DIE LETZTE KETTE. Die erste Fassung hatte hier ein
     * `|| bewertet[bewertet.length - 1]`, und genau das erzeugte einen falschen
     * Befund: eine Kette vom 12.03.2026 bis 12.04.2026 hat ihren rechnerischen
     * 18-Monats-Punkt am 12.09.2027 — wer den September 2027 aufschlug, bekam
     * eine AUEG-Ueberschreitung gemeldet fuer eine Ueberlassung, die anderthalb
     * Jahre vorher geendet hatte. Eine Kette, die das Fenster nicht erreicht,
     * ist fuer dieses Fenster kein Befund. */
    const laufend = bewertet
      .filter((k) => k.offen || (k.bis && k.bis >= opts.fensterVon))
      .pop();
    if (!laufend) continue;

    /* UND die Frist muss WIRKLICH erreicht sein. Dass ihr Datum im Fenster
     * liegt, genuegt nicht — eine Kette kann enden, bevor sie ihre eigene Frist
     * erreicht. `ueberschritten` rechnet gegen das Fensterende und beantwortet
     * genau diese Frage. */
    const trifftFenster = laufend.ueberschritten && laufend.ueberschreitung_am <= fensterBis;

    /* Die Vorwarnung gilt nur einer Ueberlassung, die noch laeuft: bei einer
     * beendeten gibt es nichts mehr zu verhindern. */
    const laeuftWeiter = laufend.offen || (laufend.bis && laufend.bis >= fensterBis);
    const vorwarnung = !trifftFenster && laeuftWeiter
      && laufend.ueberschreitung_am <= monateSpaeter(fensterBis, VORWARNUNG_MONATE);

    if (!trifftFenster && !vorwarnung) continue;

    befunde.push({
      art: "aueg_frist",
      grad: trifftFenster ? "hart" : "weich",
      worker_user_id: paar.worker_user_id,
      kraft_name: paar.kraft_name || null,
      einsatz_id: paar.assignment_id || null,
      org_id: paar.org_id,
      von: laufend.von,
      bis: laufend.ueberschreitung_am,
      ueberschreitung_am: laufend.ueberschreitung_am,
      ueberschritten: laufend.ueberschritten,
      bereits_ueberschritten: laufend.bereits_ueberschritten,
      tage_bis_ueberschreitung: laufend.tage_bis_ueberschreitung,
      hoechstdauer_monate: laufend.hoechstdauer_monate,
      // Woher die abweichende Frist kommt — ohne Grundlage waere sie eine Behauptung.
      grundlage: regel.grundlage || null,
      ueberlassungen: laufend.teile,
      kette_offen: laufend.offen
    });
  }

  return {
    befunde,
    /* DIE GRENZE DIESER PRUEFUNG, in jeder Antwort — auch wenn nichts gefunden
     * wurde. Ueberlassungen ueber Verleiher ausserhalb dieser Plattform fehlen
     * in der Rechnung, obwohl § 1 Abs. 1b Satz 2 sie anrechnen wuerde. */
    nur_plattformdaten: true
  };
}
