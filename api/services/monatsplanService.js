/**
 * Der Monat als Fenster — Welle K3.3 und K3.4.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS LEITBILD, UND WARUM ES SO IST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER MONAT IST DIE ANSICHT, DER EINSATZ IST DIE SACHE.
 *
 * Gemessen am 2026-08-31 gegen die laufende Datenbank: von 45 Einsaetzen mit
 * Enddatum ueberschreiten **41 eine Monatsgrenze** — 91 %. 34 spannen drei
 * Monate, nur fuenf bleiben in einem einzigen. Ein Raster, das den Monat als
 * abgeschlossene Einheit behandelt, waere damit fuer neun von zehn Zeilen
 * falsch: es muesste Einsaetze entweder weglassen oder so darstellen, als
 * begaennen sie am Ersten. Beides ist eine Unwahrheit ueber einen laufenden
 * Einsatz.
 *
 * Deshalb traegt JEDER Eintrag hier zwei Kennzeichen: `beginnt_vorher` und
 * `endet_spaeter`. Die Flaeche schneidet damit am Rand an, statt zu kuerzen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWEI SPUREN, KEIN PINGPONG (Owner-Entscheid 2026-08-27, Plan-Abschnitt 3b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   seite = 'kunde'    das Einsatzunternehmen: sieht eigene Einsaetze + Bedarfe
 *   seite = 'agentur'  die Zeitarbeitsfirma:   sieht den ganzen eigenen Bestand
 *
 * Keine Seite braucht die Zustimmung der anderen, und keine sieht die Spur der
 * anderen als bearbeitbar. Dieser Dienst liest nur — das Schreiben ist K3.5 und
 * wartet auf die Owner-Entscheidung E-K3-2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE MANDANTENGRENZE — UND EINE FEINHEIT, DIE SIE FAST VERLETZT HAETTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der harte Konflikt "eine Person, zwei Orte" ist naturgemaess
 * ORGANISATIONSUEBERGREIFEND: die Gegenzuordnung liegt bei einer ANDEREN Firma.
 *
 * Der Plan formuliert ihn als *"Meier ist am 12.-14. schon bei Nordbau."* — das
 * ist die Sicht der ZEITARBEITSFIRMA, der beide Einsaetze gehoeren. Sie darf den
 * Namen sehen; es ist ihr eigener Bestand.
 *
 * Dem EINSATZUNTERNEHMEN darf derselbe Konflikt NICHT mit dem Namen der anderen
 * Firma gezeigt werden — das waere der Kundenname eines Wettbewerbers, geliefert
 * von uns. Es erfaehrt DASS die Kraft im Zeitraum anderweitig gebunden ist, nicht
 * WO. Dieselbe Trennung wie in Welle H1: die Kundenansicht zeigt den Ausfall,
 * nie die Art.
 *
 * `konfliktFuerSeite()` setzt das um, und `api/test/monatsplan.test.js` haelt es
 * mit einer Ruecktmutation fest.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE AUEG-HOECHSTDAUER — seit E-K3-1 geprueft
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis zum 31.08.2026 stand hier, dass die Ueberlassungshoechstdauer NICHT
 * geprueft wird: sie hatte kein Feld im Schema, und eine geratene gesetzliche
 * Frist waere schlimmer als gar keine. Der Owner hat entschieden (E-K3-1), sie
 * zu pruefen und darzustellen.
 *
 * Gerechnet wird sie in `auegService.js` — nach § 1 Abs. 1b AUEG, je Paar
 * (Kraft, Entleiher), mit tariflich abweichbarer Frist aus
 * `aueg_konfiguration`. Was der Dienst NICHT wissen kann, sagt er selbst:
 * Ueberlassungen ueber Verleiher ausserhalb dieser Plattform fehlen in der
 * Rechnung, obwohl das Gesetz sie anrechnen wuerde. `nur_plattformdaten` steht
 * deshalb in jeder Antwort.
 *
 * `nicht_geprueft` bleibt als Feld bestehen, auch wenn es heute leer ist: ein
 * Konflikt, der stillschweigend fehlt, waere genau die Fehlerklasse dieser
 * Spur — und die naechste Konfliktart, die man nicht rechnen kann, soll dort
 * landen statt zu verschwinden.
 */

import { todayDE } from "../utils/dateDE.js";
// E-K3-1 (Owner 2026-08-31): die Ueberlassungshoechstdauer wird geprueft und
// dargestellt. Der rechtliche Kern liegt bewusst in einem eigenen Dienst —
// eine reine Funktion, einzeln pruefbar, mit Rueckmutationen.
import {
  auegBefunde, ueberlassungen, konfigurationen, ketten, bewerteKette,
  tag as auegTag, tageZwischen
} from "./auegService.js";

/** Die beiden Spuren aus Plan-Abschnitt 3b. */
export const SEITEN = Object.freeze(["kunde", "agentur"]);

/**
 * E-K3-3 (Owner 2026-08-31): "immer bis monatsrand und mit vermerk laeuft noch".
 *
 * Ein Einsatz ohne Enddatum wird also NICHT am Monatsrand abgeschnitten, als
 * ende er dort — er laeuft bis zum Rand und traegt einen Vermerk. Der Vermerk
 * kommt aus dem Dienst und nicht aus der Oberflaeche: sonst erfaende ihn jede
 * Flaeche neu, und die dritte hiesse dann "unbefristet".
 */
export const RANDVERMERK = Object.freeze({
  laeuft_noch: "laeuft_noch",   // kein Enddatum bekannt
  endet_spaeter: "endet_spaeter" // Enddatum bekannt, liegt hinter dem Fenster
});

/**
 * Welche Spur einer Organisation gehoert — abgeleitet, nicht erfragt.
 *
 * `organizations.type` ist `company` oder `agency`. Die Seite ist damit KEINE
 * Wahl des Aufrufers, sondern das, was die Organisation IST. Käme sie als
 * Parameter aus dem Browser, koennte ein Einsatzunternehmen die Agentur-Sicht
 * anfordern — und die zeigt den Bestand anders zugeschnitten.
 *
 * Im Zweifel gilt die Kundenspur: sie ist die engere von beiden.
 */
export async function seiteFuerOrg(pool, orgId) {
  try {
    const { rows } = await pool.query(
      `SELECT type FROM organizations WHERE id = $1`, [orgId]
    );
    return String(rows[0]?.type || "").toLowerCase() === "agency" ? "agentur" : "kunde";
  } catch {
    // Ohne Auskunft die engere Sicht — nie die weitere.
    return "kunde";
  }
}

/** Welcher Vermerk am rechten Rand einer Zeile steht — oder keiner. */
export function randvermerk(zeile) {
  if (zeile?.offen) return RANDVERMERK.laeuft_noch;
  if (zeile?.endet_spaeter) return RANDVERMERK.endet_spaeter;
  return null;
}

/** Abo-/Einsatzzustaende, die im Plan ueberhaupt auftauchen. */
const SICHTBARE_ZUSTAENDE = ["planned", "active", "completed"];

/**
 * DIE WIRKSAME ZEITSPANNE EINER ZUORDNUNG.
 *
 * Ein `worker_assignment_links`-Eintrag traegt eigene Daten, aber er bindet
 * hoechstens so lange wie der Einsatz, an dem er haengt. Beides auseinander
 * zu halten ist kein Feinschliff, sondern noetig:
 *
 * GEMESSEN 2026-08-31: **drei Zuordnungen im Bestand haben `end_date IS NULL`,
 * obwohl ihr Einsatz laengst beendet ist** — Links werden beim Abschluss eines
 * Einsatzes nicht geschlossen. Die erste Fassung dieser Datei las nur den Link
 * und meldete daraufhin eine Doppelbelegung fuer eine Kraft, deren einer Einsatz
 * am 31.03.2025 abgeschlossen wurde. Ein Konflikt, der IMMER da ist, wird
 * weggeklickt — und danach uebersieht man den echten.
 *
 * Deshalb: das wirksame Ende ist das FRUEHESTE aus Link-Ende, tatsaechlichem
 * und geplantem Einsatzende. Ohne alle drei bleibt es offen.
 */
const WIRKSAMES_ENDE = `LEAST(
  COALESCE(%L%.end_date,          DATE '9999-12-31'),
  COALESCE(%A%.actual_end_date,   DATE '9999-12-31'),
  COALESCE(%A%.planned_end_date,  DATE '9999-12-31')
)`;

/** Setzt die Alias-Platzhalter in `WIRKSAMES_ENDE`. */
function wirksamesEnde(linkAlias, einsatzAlias) {
  return WIRKSAMES_ENDE.split("%L%").join(linkAlias).split("%A%").join(einsatzAlias);
}

/** Der wirksame Beginn: spaeter von Link und Einsatz. */
function wirksamerBeginn(linkAlias, einsatzAlias) {
  return `GREATEST(${linkAlias}.start_date, ${einsatzAlias}.start_date)`;
}


/**
 * EINE ZUORDNUNG BINDET NUR, SOLANGE SIE GILT.
 *
 * GEMESSEN 2026-08-31: 9 von 24 Zuordnungen stehen auf `is_active = FALSE`,
 * eine auf `worker_unavailable`. Ohne diesen Filter meldet der Plan eine
 * Doppelbelegung fuer eine Absage und fuehrt Abgesagte als besetzt. Ein
 * Konflikt, der keiner ist, wird weggeklickt — und beim naechsten Mal der
 * echte gleich mit.
 *
 * Wirkung im heutigen Bestand: **null** — es gibt derzeit gar keine
 * Doppelbelegung. Der Defekt ist LATENT, und mit K3.5 wird er scharf: dann ist
 * der Plan die Flaeche, aus der heraus jemand schreibt.
 *
 * Dieselbe Bedingung benutzt die Domaene in `getWorkerSchedulingConflicts`.
 * NICHT uebernommen wird deren Lebenszyklus-Praedikat
 * (`buildAssignmentActivePredicateSql`): das misst gegen HEUTE und beantwortet
 * "wer ist gerade im Einsatz". Der Plan fragt "wer ist in DIESEM Fenster
 * gebunden" — fuer einen Monat in der Zukunft waere die Heute-Frage falsch.
 */
const ZUORDNUNG_GILT = (alias) =>
  `${alias}.is_active = TRUE
        AND ${alias}.worker_confirmation_status NOT IN ('worker_declined','worker_unavailable')`;

/**
 * Konfliktarten. `nicht_geprueft` ist Teil der Antwort, nicht ihr Fehlen —
 * eine Flaeche muss sagen koennen, was sie NICHT weiss.
 */
export const KONFLIKTARTEN = Object.freeze({
  doppelbelegung: { grad: "hart", geprueft: true },
  abwesenheit:    { grad: "hart", geprueft: true },
  /* Der Grad haengt hier am Befund, nicht an der Art: eine erreichte Frist ist
   * hart, eine in den naechsten drei Monaten drohende ist weich. */
  aueg_frist:     { grad: "hart", geprueft: true },
  bedarf_offen:   { grad: "weich", geprueft: true },
  nachweis_laeuft_ab: { grad: "weich", geprueft: true }
});

/**
 * Das Fenster eines Monats — erster und letzter Tag, in Europe/Berlin gedacht.
 *
 * BEWUSST OHNE `toISOString().slice(0, 10)`: der Waechter `kalendertagDE.test.js`
 * zaehlt dieses Muster, und er hat recht damit. Die Bestandteile einzeln
 * zusammenzusetzen kostet drei Zeilen und braucht keine Ausnahme.
 *
 * @param {string} [monat] "YYYY-MM"; ohne Angabe der laufende Monat
 */
export function monatsfenster(monat) {
  const roh = /^\d{4}-\d{2}$/.test(String(monat || "")) ? String(monat) : todayDE().slice(0, 7);
  const jahr = Number(roh.slice(0, 4));
  const nr = Number(roh.slice(5, 7));

  const zwei = (n) => String(n).padStart(2, "0");
  const von = `${roh}-01`;

  // Der letzte Tag: der Nullte des Folgemonats. Postgres und JS sind sich hier
  // einig, und Schaltjahre erledigen sich von selbst.
  const naechster = new Date(Date.UTC(jahr, nr, 0));
  const bis = `${naechster.getUTCFullYear()}-${zwei(naechster.getUTCMonth() + 1)}-${zwei(naechster.getUTCDate())}`;

  return { monat: roh, von, bis, tage: naechster.getUTCDate() };
}

/** Der Vor- und der Folgemonat — fuer das Blaettern ohne zweite Rechenregel. */
export function nachbarmonate(monat) {
  const f = monatsfenster(monat);
  const jahr = Number(f.monat.slice(0, 4));
  const nr = Number(f.monat.slice(5, 7));
  const zwei = (n) => String(n).padStart(2, "0");
  const vor = new Date(Date.UTC(jahr, nr - 2, 1));
  const nach = new Date(Date.UTC(jahr, nr, 1));
  return {
    vorheriger: `${vor.getUTCFullYear()}-${zwei(vor.getUTCMonth() + 1)}`,
    naechster: `${nach.getUTCFullYear()}-${zwei(nach.getUTCMonth() + 1)}`
  };
}

/**
 * Nimmt einem Konflikt weg, was die jeweilige Seite nicht sehen darf.
 *
 * Siehe den Kopf dieser Datei: die Zeitarbeitsfirma darf die Gegenseite ihrer
 * eigenen Kraft benennen, das Einsatzunternehmen nicht — sonst lieferten wir ihm
 * den Kundennamen eines Wettbewerbers.
 */
export function konfliktFuerSeite(konflikt, seite) {
  if (seite === "agentur") return konflikt;
  if (konflikt.art !== "doppelbelegung") return konflikt;

  const { gegenseite_org_name, gegenseite_org_id, gegenseite_assignment_id, ...rest } = konflikt;
  return {
    ...rest,
    // Die Aussage bleibt vollstaendig — nur der fremde Name faellt weg.
    hinweis: "Diese Einsatzkraft ist im Zeitraum anderweitig gebunden."
  };
}

/**
 * Die Eintraege des Monats: Einsaetze der eigenen Seite, am Fensterrand
 * angeschnitten statt gekuerzt.
 *
 * EINE Abfrage, kein N+1 — die Kraefte kommen ueber ein LEFT JOIN mit
 * Aggregation mit, nicht ueber eine Schleife. Bei 300 Kunden waere das sonst der
 * Unterschied zwischen einer und dreihundert Abfragen.
 */
export async function eintraege(pool, { orgId, seite, fenster }) {
  const spalte = seite === "agentur" ? "a.supplier_org_id" : "a.org_id";
  const { rows } = await pool.query(
    `SELECT a.id, a.org_id, a.supplier_org_id, a.start_date, a.planned_end_date,
            a.actual_end_date, a.status,
            o.name  AS kunde_name,
            s.name  AS lieferant_name,
            COALESCE(k.kraefte, '[]'::json) AS kraefte,
            (a.start_date < $2::date)                                   AS beginnt_vorher,
            (COALESCE(a.actual_end_date, a.planned_end_date) IS NULL)   AS offen,
            COALESCE(COALESCE(a.actual_end_date, a.planned_end_date) > $3::date, FALSE) AS endet_spaeter
       FROM assignments a
       LEFT JOIN organizations o ON o.id = a.org_id
       LEFT JOIN organizations s ON s.id = a.supplier_org_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'worker_user_id', l.worker_user_id,
                  'name', TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')),
                  'rolle', l.role,
                  'von', l.start_date,
                  'bis', l.end_date
                ) ORDER BY l.start_date) AS kraefte
           FROM worker_assignment_links l
           LEFT JOIN worker_profiles wp ON wp.user_id = l.worker_user_id
          WHERE l.assignment_id = a.id
            AND ${ZUORDNUNG_GILT("l")}
       ) k ON TRUE
      WHERE ${spalte} = $1
        AND a.status = ANY($4::text[])
        AND a.start_date <= $3::date
        AND COALESCE(a.actual_end_date, a.planned_end_date, DATE '9999-12-31') >= $2::date
      ORDER BY a.start_date ASC, a.id ASC`,
    [orgId, fenster.von, fenster.bis, SICHTBARE_ZUSTAENDE]
  );
  return rows;
}

/**
 * Die Bedarfe des Einsatzunternehmens im Fenster.
 *
 * Nur die Kundenspur hat Bedarfe — die Zeitarbeitsfirma legt Besetzungen an.
 * Für die Agentur bleibt die Liste leer, und das ist kein Fehlen, sondern die
 * Bauart aus Abschnitt 3b.
 */
export async function bedarfe(pool, { orgId, seite, fenster }) {
  if (seite !== "kunde") return [];
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.role, d.headcount, d.status,
            d.start_date, d.end_date,
            (d.start_date < $2::date) AS beginnt_vorher,
            (d.end_date IS NULL OR d.end_date > $3::date) AS endet_spaeter,
            EXISTS (
              SELECT 1 FROM offers of
               WHERE of.demand_request_id = d.id AND of.confirmed_at IS NOT NULL
            ) AS besetzt
       FROM demand_requests d
      WHERE d.requester_company_id IN (SELECT u.id FROM users u WHERE u.org_id = $1)
        AND d.start_date <= $3::date
        AND COALESCE(d.end_date, DATE '9999-12-31') >= $2::date
      ORDER BY d.start_date ASC, d.id ASC`,
    [orgId, fenster.von, fenster.bis]
  );
  return rows;
}

/**
 * H1 — eine Person, zwei Orte gleichzeitig.
 *
 * DER EINZIGE KONFLIKT, DER DIE MANDANTENGRENZE ABSICHTLICH UEBERSCHREITET:
 * die Gegenzuordnung liegt per Definition woanders. Gefiltert wird trotzdem
 * streng auf die eigene Seite — `a` gehoert immer der abfragenden Organisation,
 * `b` ist der Fund. Was davon die jeweilige Seite sehen darf, entscheidet
 * `konfliktFuerSeite`.
 *
 * `DATE '9999-12-31'` statt `'infinity'`: die Spalten sind `date`, und ein
 * offener Einsatz ist der Normalfall, nicht die Ausnahme — 91 % der Daten
 * verlangen, dass er hier mitzaehlt.
 */
export async function doppelbelegungen(pool, { orgId, seite, fenster }) {
  const spalte = seite === "agentur" ? "a.supplier_org_id" : "a.org_id";
  const endeA = wirksamesEnde("a", "ea");
  const endeB = wirksamesEnde("b", "eb");
  const beginnA = wirksamerBeginn("a", "ea");
  const beginnB = wirksamerBeginn("b", "eb");

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.worker_user_id, b.assignment_id)
            a.worker_user_id,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS kraft_name,
            a.assignment_id AS eigener_einsatz,
            ${beginnA} AS eigener_von,
            ${endeA}   AS eigener_bis,
            b.assignment_id AS gegenseite_assignment_id,
            b.org_id        AS gegenseite_org_id,
            og.name         AS gegenseite_org_name,
            ${beginnB} AS gegen_von,
            ${endeB}   AS gegen_bis,
            GREATEST(${beginnA}, ${beginnB}, $2::date) AS ueberschneidung_von,
            LEAST(${endeA}, ${endeB}, $3::date)        AS ueberschneidung_bis
       FROM worker_assignment_links a
       JOIN assignments ea ON ea.id = a.assignment_id
       JOIN worker_assignment_links b
         ON b.worker_user_id = a.worker_user_id
        AND b.id <> a.id
        AND b.assignment_id <> a.assignment_id
       JOIN assignments eb ON eb.id = b.assignment_id
       LEFT JOIN worker_profiles wp ON wp.user_id = a.worker_user_id
       LEFT JOIN organizations og ON og.id = b.org_id
      WHERE ${spalte} = $1
        AND ${ZUORDNUNG_GILT("a")}
        AND ${ZUORDNUNG_GILT("b")}
        AND ${beginnA} <= ${endeB}
        AND ${beginnB} <= ${endeA}
        AND ${beginnA} <= $3::date AND ${endeA} >= $2::date
        AND ${beginnB} <= $3::date AND ${endeB} >= $2::date
      ORDER BY a.worker_user_id, b.assignment_id, ${beginnA}`,
    [orgId, fenster.von, fenster.bis]
  );

  return rows.map((r) => ({
    art: "doppelbelegung",
    grad: "hart",
    worker_user_id: r.worker_user_id,
    kraft_name: r.kraft_name || null,
    einsatz_id: r.eigener_einsatz,
    von: r.ueberschneidung_von,
    bis: r.ueberschneidung_bis,
    gegenseite_assignment_id: r.gegenseite_assignment_id,
    gegenseite_org_id: r.gegenseite_org_id,
    gegenseite_org_name: r.gegenseite_org_name || null
  }));
}

/**
 * H2 — Abwesenheit im Zeitraum.
 *
 * Nur die Zeitarbeitsfirma fuehrt Abwesenheiten (`worker_absences.supplier_org_id`).
 * Fuer die Kundenspur wird die Abwesenheit ueber die Zuordnung gefunden, aber
 * OHNE die Art: dass jemand fehlt, geht den Kunden an; WARUM er fehlt, nicht.
 * Dieselbe Trennung wie in Welle H1.
 *
 * Aufgehobene und nicht wirksame Meldungen zaehlen nicht — sonst waere eine
 * zurueckgenommene Krankmeldung ein dauerhafter Konflikt.
 */
export async function abwesenheiten(pool, { orgId, seite, fenster }) {
  const spalte = seite === "agentur" ? "l.supplier_org_id" : "l.org_id";
  const ende = wirksamesEnde("l", "e");
  const beginn = wirksamerBeginn("l", "e");
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (ab.id, l.assignment_id)
            ab.id, ab.art, ab.von, ab.bis,
            l.worker_user_id, l.assignment_id,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS kraft_name
       FROM worker_absences ab
       JOIN worker_profiles wp ON wp.id = ab.worker_profile_id
       JOIN worker_assignment_links l ON l.worker_user_id = wp.user_id
       JOIN assignments e ON e.id = l.assignment_id
      WHERE ${spalte} = $1
        AND ${ZUORDNUNG_GILT("l")}
        AND ab.aufgehoben_am IS NULL
        AND ab.zustand = 'wirksam'
        AND ab.von <= $3::date
        AND COALESCE(ab.bis, DATE '9999-12-31') >= $2::date
        AND ${beginn} <= $3::date AND ${ende} >= $2::date
        AND ab.von <= ${ende}
        AND COALESCE(ab.bis, DATE '9999-12-31') >= ${beginn}
      ORDER BY ab.id, l.assignment_id, ab.von`,
    [orgId, fenster.von, fenster.bis]
  );

  return rows.map((r) => ({
    art: "abwesenheit",
    grad: "hart",
    worker_user_id: r.worker_user_id,
    kraft_name: r.kraft_name || null,
    einsatz_id: r.assignment_id,
    von: r.von,
    bis: r.bis,
    // Die ART der Abwesenheit ist Sache der Zeitarbeitsfirma. Der Kunde erfaehrt,
    // dass jemand fehlt — nicht warum.
    abwesenheitsart: seite === "agentur" ? r.art : null
  }));
}

/**
 * W1 — Bedarf unbesetzt. Weich: ein offener Punkt, keine Warnung.
 *
 * Nur die Kundenspur hat Bedarfe (siehe `bedarfe`).
 */
export function offeneBedarfe(bedarfsZeilen) {
  return bedarfsZeilen
    .filter((b) => b.besetzt === false && b.status !== "cancelled" && b.status !== "closed")
    .map((b) => ({
      art: "bedarf_offen",
      grad: "weich",
      bedarf_id: b.id,
      titel: b.title || b.role || null,
      koepfe: Number(b.headcount) || null,
      von: b.start_date,
      bis: b.end_date
    }));
}

/**
 * W2 — ein Nachweis laeuft im Zeitraum ab.
 *
 * `worker_profile_documents.valid_until` je Kraft und Zeitarbeitsfirma. Auch
 * hier: der Kunde erfaehrt, DASS ein Nachweis ablaeuft, nicht welcher — der Titel
 * eines Zeugnisses ist Personalsache.
 */
export async function ablaufendeNachweise(pool, { orgId, seite, fenster }) {
  const spalte = seite === "agentur" ? "l.supplier_org_id" : "l.org_id";
  const ende = wirksamesEnde("l", "e");
  const beginn = wirksamerBeginn("l", "e");
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (d.id, l.assignment_id)
            d.id, d.title, d.category, d.valid_until,
            l.worker_user_id, l.assignment_id,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS kraft_name
       FROM worker_profile_documents d
       JOIN worker_assignment_links l ON l.worker_user_id = d.worker_user_id
       JOIN assignments e ON e.id = l.assignment_id
       LEFT JOIN worker_profiles wp ON wp.user_id = d.worker_user_id
      WHERE ${spalte} = $1
        AND ${ZUORDNUNG_GILT("l")}
        AND d.valid_until IS NOT NULL
        AND d.valid_until BETWEEN $2::date AND $3::date
        AND ${beginn} <= $3::date AND ${ende} >= $2::date
      ORDER BY d.id, l.assignment_id, d.valid_until`,
    [orgId, fenster.von, fenster.bis]
  );

  return rows.map((r) => ({
    art: "nachweis_laeuft_ab",
    grad: "weich",
    worker_user_id: r.worker_user_id,
    kraft_name: r.kraft_name || null,
    einsatz_id: r.assignment_id,
    von: r.valid_until,
    bis: r.valid_until,
    nachweis: seite === "agentur" ? (r.title || r.category) : null
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
   K3.5 — DIE KONFLIKTVORSCHAU VOR DEM SCHREIBEN

   Der Kern von Abschnitt 3b: *„die Doppelbelegung fällt BEIM PLANEN auf, nicht
   am Einsatztag."* Beide Schreibwege gibt es längst
   (`POST /marketplace/demand-requests` für den Bedarf,
   `POST /workers/staffing-assignments/:id/quick-assign` für die Besetzung) —
   und beide sagen erst NACH dem Schreiben, ob etwas kollidiert. Genau das
   fehlte: die Antwort VORHER.

   NUR DIE AGENTURSPUR. Ein Bedarf ist eine Absicht des Kunden — er kollidiert
   mit niemandem, weil er niemanden bindet. Eine Besetzung ist eine Zusage über
   einen Menschen, und Menschen können nicht an zwei Orten sein. Eine Vorschau
   für die Kundenspur wäre eine Antwort auf eine Frage, die sich dort nicht
   stellt.

   ZWEI RIEGEL, BEIDE NÖTIG:
     * der Einsatz muss der abfragenden Zeitarbeitsfirma gehören
       (`assignments.supplier_org_id`)
     * die Kraft muss ihr gehören (`worker_profiles.supplier_org_id`)
   Ohne den zweiten wäre die Vorschau ein Auskunftsdienst über fremde
   Einsatzpläne: „nenne mir eine beliebige Personenkennung, ich sage dir, wann
   sie gebucht ist."

   SIE SCHREIBT NICHTS. Sie liest und rechnet — auch die AÜG-Prüfung, die den
   geplanten Zeitraum nur GEDANKLICH an die Geschichte hängt und neu bewertet.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Der Zusammenhang: Einsatz, Kraft, Zeitspanne — und ob beides der Firma gehört. */
async function vorschauKontext(pool, { orgId, workerUserId, assignmentId }) {
  const { rows } = await pool.query(
    `SELECT a.id, a.org_id, a.supplier_org_id, a.status,
            a.start_date AS von,
            NULLIF(LEAST(COALESCE(a.actual_end_date,  DATE '9999-12-31'),
                         COALESCE(a.planned_end_date, DATE '9999-12-31')),
                   DATE '9999-12-31') AS bis,
            o.name AS kunde_name,
            wp.supplier_org_id AS kraft_org,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS kraft_name
       FROM assignments a
       LEFT JOIN organizations o ON o.id = a.org_id
       LEFT JOIN worker_profiles wp ON wp.user_id = $2
      WHERE a.id = $1`,
    [assignmentId, workerUserId]
  );
  return rows[0] || null;
}

/**
 * Wo wäre diese Kraft in diesem Zeitraum schon gebunden?
 *
 * Dieselbe Zustandsregel wie im Monatsplan (`ZUORDNUNG_GILT`) — eine archivierte
 * oder abgesagte Zuordnung bindet niemanden, und ein Fehlalarm hier wöge doppelt:
 * er hielte jemanden davon ab, eine Besetzung vorzunehmen, die zulässig ist.
 */
async function vorschauDoppelbelegung(pool, { workerUserId, assignmentId, von, bis }) {
  const ende = wirksamesEnde("l", "e");
  const beginn = wirksamerBeginn("l", "e");
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (l.assignment_id)
            l.assignment_id, l.org_id,
            og.name AS gegenseite_org_name,
            ${beginn} AS gegen_von,
            ${ende}   AS gegen_bis,
            GREATEST(${beginn}, $3::date) AS ueberschneidung_von,
            LEAST(${ende}, COALESCE($4::date, DATE '9999-12-31')) AS ueberschneidung_bis
       FROM worker_assignment_links l
       JOIN assignments e ON e.id = l.assignment_id
       LEFT JOIN organizations og ON og.id = l.org_id
      WHERE l.worker_user_id = $1
        AND l.assignment_id <> $2
        AND ${ZUORDNUNG_GILT("l")}
        AND ${beginn} <= COALESCE($4::date, DATE '9999-12-31')
        AND ${ende}   >= $3::date
      ORDER BY l.assignment_id, ${beginn}`,
    [workerUserId, assignmentId, von, bis]
  );
  return rows.map((r) => ({
    art: "doppelbelegung",
    grad: "hart",
    worker_user_id: workerUserId,
    einsatz_id: assignmentId,
    von: r.ueberschneidung_von,
    bis: r.ueberschneidung_bis === "9999-12-31" ? null : r.ueberschneidung_bis,
    gegenseite_assignment_id: r.assignment_id,
    gegenseite_org_id: r.org_id,
    gegenseite_org_name: r.gegenseite_org_name || null
  }));
}

/** Gemeldete, nicht aufgehobene Abwesenheiten im geplanten Zeitraum. */
async function vorschauAbwesenheit(pool, { orgId, workerUserId, von, bis }) {
  const { rows } = await pool.query(
    `SELECT ab.id, ab.art, ab.von, ab.bis
       FROM worker_absences ab
       JOIN worker_profiles wp ON wp.id = ab.worker_profile_id
      WHERE wp.user_id = $1
        AND ab.supplier_org_id = $2
        AND ab.aufgehoben_am IS NULL
        AND ab.zustand = 'wirksam'
        AND ab.von <= COALESCE($4::date, DATE '9999-12-31')
        AND COALESCE(ab.bis, DATE '9999-12-31') >= $3::date
      ORDER BY ab.von`,
    [workerUserId, orgId, von, bis]
  );
  return rows.map((r) => ({
    art: "abwesenheit", grad: "hart",
    worker_user_id: workerUserId,
    von: r.von, bis: r.bis,
    abwesenheitsart: r.art
  }));
}

/** Nachweise, die WÄHREND des geplanten Zeitraums ablaufen. */
async function vorschauNachweise(pool, { orgId, workerUserId, von, bis }) {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.category, d.valid_until
       FROM worker_profile_documents d
      WHERE d.worker_user_id = $1
        AND d.supplier_org_id = $2
        AND d.valid_until IS NOT NULL
        AND d.valid_until >= $3::date
        AND d.valid_until <= COALESCE($4::date, DATE '9999-12-31')
      ORDER BY d.valid_until`,
    [workerUserId, orgId, von, bis]
  );
  return rows.map((r) => ({
    art: "nachweis_laeuft_ab", grad: "weich",
    worker_user_id: workerUserId,
    von: r.valid_until, bis: r.valid_until,
    nachweis: r.title || r.category
  }));
}

/**
 * Die AÜG-Frist, GEDANKLICH um den geplanten Zeitraum erweitert.
 *
 * Der geplante Zeitraum wird an die echte Geschichte gehängt und die Kette neu
 * gebildet — genau das ist die gesetzliche Frage: rechnet § 1 Abs. 1b AÜG die
 * frühere Überlassung an denselben Entleiher an? Es wird nichts geschrieben.
 *
 * Gemeldet wird nur, was DIESE Besetzung verursacht: war die Frist schon vorher
 * gerissen, ist das kein Befund über die geplante Handlung, sondern über den
 * Bestand — und der steht im Monatsplan.
 */
function vorschauAueg({ zeitraeume, regel, von, bis, heute }) {
  const mitGeplant = [...zeitraeume, { von, bis: bis || null }];

  const kettenMit  = ketten(mitGeplant, regel);
  const kettenOhne = ketten(zeitraeume, regel);

  const betroffen = kettenMit.find((k) => k.von <= von && (k.bis == null || k.bis >= von));
  if (!betroffen) return [];

  /* Ein offener Einsatz hat kein Ende, an dem man messen könnte. Gemessen wird
   * dann am Tag der Überschreitung selbst: die Frage lautet nicht „ist sie am
   * Stichtag gerissen", sondern „wird sie während dieser Besetzung reissen". */
  const roh = bewerteKette(betroffen, { ...regel, heute });
  const stichtag = bis || roh.ueberschreitung_am;
  const mit = bewerteKette(betroffen, { ...regel, heute, stichtag });
  if (!mit.ueberschritten) return [];

  const vorher = kettenOhne.find((k) => k.von <= von && (k.bis == null || k.bis >= von));
  const schonVorher = vorher
    ? bewerteKette(vorher, { ...regel, heute, stichtag }).ueberschritten
    : false;

  return [{
    art: "aueg_hoechstdauer",
    grad: "hart",
    von: mit.ueberschreitung_am,
    bis: mit.ueberschreitung_am,
    hoechstdauer_monate: mit.hoechstdauer_monate,
    ueberschreitung_am: mit.ueberschreitung_am,
    kette_von: mit.von,
    kette_offen: mit.offen,
    // Verursacht DIESE Besetzung die Überschreitung — oder lag sie schon vor?
    durch_diese_besetzung: !schonVorher
  }];
}

/**
 * Was bricht, wenn diese Kraft auf diesen Einsatz gesetzt wird?
 *
 * @returns {Promise<{fehler?: string} | {konflikte: Array, zusammenfassung: object,
 *   kraft_name: string|null, von: string, bis: string|null, nur_plattformdaten: true}>}
 */
export async function planungsVorschau(pool, {
  orgId, seite = "agentur", workerUserId, assignmentId, heute = null
} = {}) {
  if (!orgId) throw new Error("MONATSPLAN_ORG_ERFORDERLICH");
  if (!workerUserId || !assignmentId) return { fehler: "UNVOLLSTAENDIG" };

  /* Die Kundenspur setzt niemanden ein — für sie gibt es hier nichts zu
   * beantworten. Kein stilles leeres Ergebnis: das wäre von „keine Konflikte"
   * nicht zu unterscheiden. */
  if (seite !== "agentur") return { fehler: "NUR_AGENTURSPUR" };

  const k = await vorschauKontext(pool, { orgId, workerUserId, assignmentId });
  if (!k) return { fehler: "EINSATZ_NICHT_GEFUNDEN" };
  if (String(k.supplier_org_id || "") !== String(orgId)) return { fehler: "FREMDER_EINSATZ" };
  if (String(k.kraft_org || "") !== String(orgId)) return { fehler: "FREMDE_KRAFT" };

  const von = auegTag(k.von);
  const bis = k.bis ? auegTag(k.bis) : null;
  const stichHeute = heute || todayDE();

  const [doppel, abwesend, nachweise, geschichte, konfig] = await Promise.all([
    vorschauDoppelbelegung(pool, { workerUserId, assignmentId, von, bis }),
    vorschauAbwesenheit(pool, { orgId, workerUserId, von, bis }),
    vorschauNachweise(pool, { orgId, workerUserId, von, bis }),
    ueberlassungen(pool, [{ worker_user_id: workerUserId, org_id: k.org_id }]),
    konfigurationen(pool, [k.org_id])
  ]);

  const aueg = vorschauAueg({
    zeitraeume: geschichte.get(`${workerUserId}|${k.org_id}`) || [],
    regel: konfig.get(String(k.org_id)) || {},
    von, bis, heute: stichHeute
  });

  const konflikte = [...doppel, ...abwesend, ...aueg, ...nachweise]
    .map((x) => konfliktFuerSeite({ ...x, kraft_name: k.kraft_name || null }, "agentur"));

  return {
    einsatz_id: assignmentId,
    worker_user_id: workerUserId,
    kraft_name: k.kraft_name || null,
    von, bis,
    konflikte,
    zusammenfassung: {
      hart:  konflikte.filter((x) => x.grad === "hart").length,
      weich: konflikte.filter((x) => x.grad === "weich").length
    },
    /* Dieselbe Grenze wie im Monatsplan: was über einen Verleiher lief, der
     * TempConnect nicht benutzt, steht hier nicht — obwohl das Gesetz es
     * anrechnen würde. */
    nur_plattformdaten: true
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   K3.7 — DER MONAT JE MITARBEITER

   DER BEFUND, DER DIESE ANSICHT NOETIG MACHT (gemessen 2026-08-31):
   das Raster hat EINSAETZE als Zeilen. Wer in diesem Monat keinen Einsatz hat,
   kommt darin ueberhaupt nicht vor.

     Demo Zeitarbeit GmbH …  12 Mitarbeiter, im April-Raster sichtbar:  4
     E2E Zeitarbeit GmbH  …   7 Mitarbeiter, sichtbar:                  0
     ElektroStaff GmbH    …   3 Mitarbeiter, sichtbar:                  0
     ─────────────────────────────────────────────────────────────────────
     ueber alle Agenturen …  31 Mitarbeiter, sichtbar:                  4

   87 % fehlen — und zwar GENAU DIE, die man verplanen will. Ein Planungsraster,
   das die freien Leute nicht zeigt, beantwortet die Frage nicht, wegen der man
   es aufschlaegt.

   DIE FREIE SPANNE IST DER EIGENTLICHE INHALT, nicht die Luecke zwischen zwei
   Balken. Deshalb wird sie ausgerechnet und benannt, statt sie dem Auge zu
   ueberlassen.

   VIER ABFRAGEN FUER BELIEBIG VIELE MITARBEITER, nicht vier je Mitarbeiter.
   `workerAvailabilityService.resolveAvailability()` beantwortet EINE Kraft und
   ist punktbezogen („ab wann frei"); darueber zu schleifen waere der
   Skalierungsdefekt „laeuft bei 10, bricht bei 300" in Reinform — bei 300
   Mitarbeitern 300 Abfragen je Seitenaufruf.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Die freien Spannen im Fenster — was von einem Monat uebrig bleibt.
 *
 * REINE FUNKTION, absichtlich ohne Datenbank: die Rechnung „was ist frei" ist
 * der Kern dieser Ansicht und muss einzeln pruefbar sein. Ueberlappende und
 * offene Spannen werden zusammengelegt, bevor invertiert wird — sonst entstehen
 * aus zwei ueberlappenden Einsaetzen Phantom-Luecken.
 *
 * @param {Array<{von: string, bis: string|null}>} belegt
 * @param {{von: string, bis: string}} fenster
 * @returns {Array<{von: string, bis: string, tage: number}>}
 */
export function freieSpannen(belegt, fenster) {
  const grenzeVon = fenster.von;
  const grenzeBis = fenster.bis;

  const spannen = (belegt || [])
    .map((b) => ({
      von: b.von && b.von > grenzeVon ? b.von : grenzeVon,
      // Ohne Ende bindet die Spanne bis zum Monatsrand (E-K3-3).
      bis: b.bis == null || b.bis > grenzeBis ? grenzeBis : b.bis
    }))
    .filter((b) => b.von <= b.bis)
    .sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));

  const zusammengelegt = [];
  for (const sp of spannen) {
    const letzte = zusammengelegt[zusammengelegt.length - 1];
    if (letzte && sp.von <= tagNach(letzte.bis)) {
      if (sp.bis > letzte.bis) letzte.bis = sp.bis;
    } else {
      zusammengelegt.push({ ...sp });
    }
  }

  const frei = [];
  let zeiger = grenzeVon;
  for (const sp of zusammengelegt) {
    if (sp.von > zeiger) frei.push({ von: zeiger, bis: tagVor(sp.von) });
    if (tagNach(sp.bis) > zeiger) zeiger = tagNach(sp.bis);
  }
  if (zeiger <= grenzeBis) frei.push({ von: zeiger, bis: grenzeBis });

  return frei.map((f) => ({ ...f, tage: tageZwischen(f.von, f.bis) + 1 }));
}

/**
 * Kalendertag-Arithmetik — BEWUSST OHNE `toISOString().slice(0, 10)`.
 *
 * Der Schnitt waere hier sogar richtig (alles ist UTC-verankert), aber der
 * Waechter `kalendertagDE.test.js` zaehlt das Muster, und er hat recht damit:
 * er kann nicht wissen, ob der Wert UTC-verankert ist. Genau diese
 * Unterscheidung faellt beim naechsten Umbau als Erste weg. `monatsfenster`
 * weiter oben macht es aus demselben Grund schon so; die Bestandteile einzeln
 * zusammenzusetzen kostet zwei Zeilen und braucht keine Ausnahme.
 */
function tagVerschoben(datum, um) {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + um);
  const zwei = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}
function tagNach(datum) { return tagVerschoben(datum, 1); }
function tagVor(datum) { return tagVerschoben(datum, -1); }

/**
 * Alle Mitarbeiter der Firma — auch die ohne Konto.
 *
 * `worker_profiles.user_id` ist seit Migration 175 nullbar: ein Mitarbeiter
 * existiert, bevor er sich anmeldet. Ein Verbund ueber `users` wuerde genau die
 * verschlucken, die noch keinen Zugang haben — und das waeren in einer frisch
 * importierten Belegschaft alle.
 */
async function mitarbeiterDerFirma(pool, orgId) {
  const { rows } = await pool.query(
    `SELECT wp.id AS profil_id, wp.user_id,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS name,
            wp.personnel_number, wp.is_active
       FROM worker_profiles wp
      WHERE wp.supplier_org_id = $1
        AND wp.is_active = TRUE
      ORDER BY wp.last_name ASC NULLS LAST, wp.first_name ASC NULLS LAST, wp.id ASC`,
    [orgId]
  );
  return rows;
}

/** Die Bindungen aller genannten Kraefte im Fenster — EINE Abfrage. */
async function belegungenImFenster(pool, { userIds, fenster }) {
  if (!userIds.length) return [];
  const ende = wirksamesEnde("l", "e");
  const beginn = wirksamerBeginn("l", "e");
  const { rows } = await pool.query(
    `SELECT l.worker_user_id, l.assignment_id, l.org_id,
            og.name AS entleiher_name,
            e.status,
            ${beginn} AS von,
            NULLIF(${ende}, DATE '9999-12-31') AS bis,
            (${beginn} < $2::date) AS beginnt_vorher,
            (${ende} > $3::date)   AS endet_spaeter
       FROM worker_assignment_links l
       JOIN assignments e ON e.id = l.assignment_id
       LEFT JOIN organizations og ON og.id = l.org_id
      WHERE l.worker_user_id = ANY($1::uuid[])
        AND ${ZUORDNUNG_GILT("l")}
        AND ${beginn} <= $3::date
        AND ${ende}   >= $2::date
      ORDER BY l.worker_user_id, ${beginn}`,
    [userIds, fenster.von, fenster.bis]
  );
  return rows;
}

/** Abwesenheiten aller genannten Kraefte — ueber das PROFIL, nicht das Konto. */
async function abwesenheitenImFenster(pool, { profilIds, orgId, fenster }) {
  if (!profilIds.length) return [];
  const { rows } = await pool.query(
    `SELECT ab.worker_profile_id, ab.id, ab.art, ab.von,
            COALESCE(ab.bis, $4::date) AS bis, (ab.bis IS NULL) AS offen
       FROM worker_absences ab
      WHERE ab.worker_profile_id = ANY($1::uuid[])
        AND ab.supplier_org_id = $2
        AND ab.aufgehoben_am IS NULL
        AND ab.zustand = 'wirksam'
        AND ab.von <= $4::date
        AND COALESCE(ab.bis, DATE '9999-12-31') >= $3::date
      ORDER BY ab.worker_profile_id, ab.von`,
    [profilIds, orgId, fenster.von, fenster.bis]
  );
  return rows;
}

/** Nachweise, die im Fenster ablaufen — EINE Abfrage fuer alle Kraefte. */
async function nachweiseImFenster(pool, { userIds, orgId, fenster }) {
  if (!userIds.length) return [];
  const { rows } = await pool.query(
    `SELECT d.worker_user_id, d.id, d.title, d.category, d.valid_until
       FROM worker_profile_documents d
      WHERE d.worker_user_id = ANY($1::uuid[])
        AND d.supplier_org_id = $2
        AND d.valid_until IS NOT NULL
        AND d.valid_until BETWEEN $3::date AND $4::date
      ORDER BY d.worker_user_id, d.valid_until`,
    [userIds, orgId, fenster.von, fenster.bis]
  );
  return rows;
}

/**
 * Der Monat je Mitarbeiter.
 *
 * @returns {Promise<{fenster, vorheriger, naechster, org_id, seite,
 *   mitarbeiter: Array, zusammenfassung: object}>}
 */
export async function mitarbeiterMonat(pool, { orgId, seite = "agentur", monat } = {}) {
  if (!orgId) throw new Error("MONATSPLAN_ORG_ERFORDERLICH");
  const gewaehlteSeite = SEITEN.includes(seite) ? seite : "kunde";
  const fenster = monatsfenster(monat);

  const leute = await mitarbeiterDerFirma(pool, orgId);
  const userIds = leute.map((m) => m.user_id).filter(Boolean);
  const profilIds = leute.map((m) => m.profil_id).filter(Boolean);

  const [belegungen, abwesend, nachweise] = await Promise.all([
    belegungenImFenster(pool, { userIds, fenster }),
    abwesenheitenImFenster(pool, { profilIds, orgId, fenster }),
    nachweiseImFenster(pool, { userIds, orgId, fenster })
  ]);

  const jeKraft = new Map();
  for (const m of leute) {
    jeKraft.set(m.profil_id, { belegungen: [], abwesenheiten: [], nachweise: [] });
  }
  const profilVonUser = new Map(leute.filter((m) => m.user_id).map((m) => [m.user_id, m.profil_id]));

  for (const b of belegungen) {
    const eintrag = jeKraft.get(profilVonUser.get(b.worker_user_id));
    if (eintrag) eintrag.belegungen.push(b);
  }
  for (const a of abwesend) {
    const eintrag = jeKraft.get(a.worker_profile_id);
    if (eintrag) eintrag.abwesenheiten.push(a);
  }
  for (const n of nachweise) {
    const eintrag = jeKraft.get(profilVonUser.get(n.worker_user_id));
    if (eintrag) eintrag.nachweise.push(n);
  }

  const mitarbeiter = leute.map((m) => {
    const e = jeKraft.get(m.profil_id);
    /* Belegt ist, wer im Einsatz ODER abwesend ist: fuer die Planung ist beides
     * dasselbe — die Person steht an diesem Tag nicht zur Verfuegung. Die
     * Unterscheidung bleibt in den Listen erhalten, nur die freie Spanne fasst
     * sie zusammen. */
    const belegt = [
      ...e.belegungen.map((b) => ({ von: b.von, bis: b.bis })),
      ...e.abwesenheiten.map((a) => ({ von: a.von, bis: a.offen ? null : a.bis }))
    ];
    const frei = freieSpannen(belegt, fenster);
    const tageImMonat = fenster.tage;
    const freieTage = frei.reduce((summe, f) => summe + f.tage, 0);

    return {
      profil_id: m.profil_id,
      worker_user_id: m.user_id || null,
      name: m.name || null,
      personalnummer: m.personnel_number || null,
      // Ein Mitarbeiter ohne Konto ist trotzdem ein Mitarbeiter (Migration 175).
      ohne_konto: !m.user_id,
      belegungen: e.belegungen.map((b) => ({
        assignment_id: b.assignment_id,
        entleiher_org_id: gewaehlteSeite === "agentur" ? b.org_id : null,
        entleiher_name: gewaehlteSeite === "agentur" ? (b.entleiher_name || null) : null,
        status: b.status,
        von: b.von, bis: b.bis,
        beginnt_vorher: b.beginnt_vorher,
        randvermerk: b.bis == null ? RANDVERMERK.laeuft_noch
          : (b.endet_spaeter ? RANDVERMERK.endet_spaeter : null)
      })),
      abwesenheiten: e.abwesenheiten.map((a) => ({
        von: a.von, bis: a.bis, offen: a.offen,
        // Die ART der Abwesenheit ist Sache der Zeitarbeitsfirma — dieselbe
        // Trennung wie im Einsatzraster.
        art: gewaehlteSeite === "agentur" ? a.art : null
      })),
      nachweise: e.nachweise.map((n) => ({
        laeuft_ab_am: n.valid_until,
        nachweis: gewaehlteSeite === "agentur" ? (n.title || n.category) : null
      })),
      frei,
      freie_tage: freieTage,
      tage_im_monat: tageImMonat,
      // Der eine Wert, nach dem eine Disposition sortiert.
      auslastung_prozent: tageImMonat > 0
        ? Math.round(((tageImMonat - freieTage) / tageImMonat) * 100) : 0
    };
  });

  return {
    fenster,
    ...nachbarmonate(fenster.monat),
    org_id: orgId,
    seite: gewaehlteSeite,
    mitarbeiter,
    zusammenfassung: {
      mitarbeiter: mitarbeiter.length,
      // Die drei Zahlen, die eine Disposition wirklich braucht.
      ganz_frei: mitarbeiter.filter((m) => m.freie_tage === m.tage_im_monat).length,
      teilweise_frei: mitarbeiter.filter(
        (m) => m.freie_tage > 0 && m.freie_tage < m.tage_im_monat).length,
      ganz_belegt: mitarbeiter.filter((m) => m.freie_tage === 0).length,
      ohne_konto: mitarbeiter.filter((m) => m.ohne_konto).length
    }
  };
}

/**
 * Der ganze Monat — der eine Einstiegspunkt der Flaeche.
 *
 * Fuenf Abfragen fuer beliebig viele Eintraege, nicht fuenf JE Eintrag. Die
 * Skalierungsregel des Projekts ("laeuft bei 10, bricht bei 300") ist hier
 * einschlaegig: die Menge waechst mit den Einsaetzen des Kunden.
 */
export async function monatsplan(pool, { orgId, seite = "kunde", monat } = {}) {
  if (!orgId) throw new Error("MONATSPLAN_ORG_ERFORDERLICH");
  const gewaehlteSeite = SEITEN.includes(seite) ? seite : "kunde";
  const fenster = monatsfenster(monat);

  const [zeilen, bedarfsZeilen, doppel, abwesend, nachweise] = await Promise.all([
    eintraege(pool, { orgId, seite: gewaehlteSeite, fenster }),
    bedarfe(pool, { orgId, seite: gewaehlteSeite, fenster }),
    doppelbelegungen(pool, { orgId, seite: gewaehlteSeite, fenster }),
    abwesenheiten(pool, { orgId, seite: gewaehlteSeite, fenster }),
    ablaufendeNachweise(pool, { orgId, seite: gewaehlteSeite, fenster })
  ]);

  /* E-K3-1: die AUEG-Frist. Die Paare (Kraft, Entleiher) kommen aus den
   * Eintraegen, die ohnehin sichtbar sind — es gelangt also nichts in die
   * Antwort, das der Abfragende nicht ohnehin sehen darf. */
  const paare = [];
  for (const z of zeilen) {
    for (const k of z.kraefte || []) {
      if (!k?.worker_user_id || !z.org_id) continue;
      paare.push({
        worker_user_id: k.worker_user_id,
        org_id: z.org_id,
        kraft_name: k.name || null,
        assignment_id: z.id
      });
    }
  }
  const aueg = await auegBefunde(pool, paare, {
    fensterVon: fenster.von, fensterBis: fenster.bis
  });

  const konflikte = [
    ...doppel,
    ...abwesend,
    ...aueg.befunde,
    ...offeneBedarfe(bedarfsZeilen),
    ...nachweise
  ].map((k) => konfliktFuerSeite(k, gewaehlteSeite));

  return {
    fenster,
    ...nachbarmonate(fenster.monat),
    seite: gewaehlteSeite,
    org_id: orgId,
    // E-K3-3: der Vermerk am rechten Rand kommt aus dem Dienst, nicht aus der
    // Oberflaeche — sonst erfindet ihn jede Flaeche neu.
    eintraege: zeilen.map((z) => ({ ...z, randvermerk: randvermerk(z) })),
    bedarfe: bedarfsZeilen,
    konflikte,
    zusammenfassung: {
      eintraege: zeilen.length,
      // Die Zahl, die das Leitbild traegt: wie viele Zeilen ueber den Rand laufen.
      beginnt_vorher: zeilen.filter((z) => z.beginnt_vorher).length,
      endet_spaeter: zeilen.filter((z) => z.endet_spaeter || z.offen).length,
      bedarfe: bedarfsZeilen.length,
      konflikte_hart: konflikte.filter((k) => k.grad === "hart").length,
      konflikte_weich: konflikte.filter((k) => k.grad === "weich").length
    },
    /* WAS DIESER MONAT NICHT WEISS. Ein Konflikt, der stillschweigend fehlt,
     * waere genau die Fehlerklasse dieser Spur — deshalb steht er in der
     * Antwort, nicht in ihrem Fehlen. */
    nicht_geprueft: Object.entries(KONFLIKTARTEN)
      .filter(([, v]) => !v.geprueft)
      .map(([art, v]) => ({ art, grad: v.grad, grund: v.grund })),
    /* WAS DIE AUEG-PRUEFUNG NICHT SEHEN KANN. Steht auch dann in der Antwort,
     * wenn nichts gefunden wurde — eine Frist, die sich sicherer gibt, als sie
     * ist, waere die schlechtere Variante von gar keiner. */
    aueg_nur_plattformdaten: aueg.nur_plattformdaten
  };
}
