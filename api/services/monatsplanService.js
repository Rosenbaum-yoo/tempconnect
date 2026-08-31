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
 * WAS HIER (NOCH) NICHT GEPRUEFT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die AUEG-Ueberlassungshoechstdauer. Der Plan nennt sie als fuenften Konflikt,
 * aber sie hat KEIN FELD IM SCHEMA: prueffaehig waere sie nur mit einem neuen
 * Datum (Ueberlassungsbeginn je Kraft und Kunde) und einer Regel (18 Monate,
 * mit tariflichen Abweichungen). Eine geratene gesetzliche Frist waere schlimmer
 * als gar keine — deshalb wird sie NICHT gerechnet und im Ergebnis ausdruecklich
 * als `nicht_geprueft` ausgewiesen. Owner-Entscheidung E-K3-1.
 *
 * Ein Konflikt, der stillschweigend fehlt, waere genau die Fehlerklasse dieser
 * Spur: gebaut, montiert, und niemand merkt, dass er nie feuert.
 */

import { todayDE } from "../utils/dateDE.js";

/** Die beiden Spuren aus Plan-Abschnitt 3b. */
export const SEITEN = Object.freeze(["kunde", "agentur"]);

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
 * Konfliktarten. `nicht_geprueft` ist Teil der Antwort, nicht ihr Fehlen —
 * eine Flaeche muss sagen koennen, was sie NICHT weiss.
 */
export const KONFLIKTARTEN = Object.freeze({
  doppelbelegung: { grad: "hart", geprueft: true },
  abwesenheit:    { grad: "hart", geprueft: true },
  aueg_frist:     { grad: "hart", geprueft: false, grund: "E-K3-1: kein Feld im Schema" },
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
      WHERE d.requester_company_id = $1
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

  const konflikte = [
    ...doppel,
    ...abwesend,
    ...offeneBedarfe(bedarfsZeilen),
    ...nachweise
  ].map((k) => konfliktFuerSeite(k, gewaehlteSeite));

  return {
    fenster,
    ...nachbarmonate(fenster.monat),
    seite: gewaehlteSeite,
    org_id: orgId,
    eintraege: zeilen,
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
      .map(([art, v]) => ({ art, grad: v.grad, grund: v.grund }))
  };
}
