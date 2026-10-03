import { createServiceLogger } from "../utils/logger.js";
/* M4b.1 — das gemeinsame Katalog-Tor. Vorher stand hier nur `is_active`,
   und die Automatik nahm damit unkuratierte Vorschlaege mit in den Markt. */
import { katalogTorSql } from "./skillCatalogService.js";
/* M4c.3b — die EINE Antwort auf "ist dieser Mensch gebunden?". Vorher kannte
   dieser Dienst die Frage gar nicht: er legte auch fuer gebuchte Kraefte an. */
import { gebundenSql } from "./bindungSql.js";
/* M4c.1 — der EINE Titel eines Gesamtangebots, fuer Hand UND Takt. */
import { buendelTitelSql } from "./buendelTitel.js";

const logger = createServiceLogger("marktpraesenz");

/**
 * marktpraesenzService — Verfuegbarkeit IST das Angebot (Welle J2b)
 *
 * DIE OWNER-VISION (Plan J §0/§1, Freigabe 2026-08-26): Unternehmen sehen die
 * freien Kraefte der gesamten Plattform, ohne dass eine Zeitarbeitsfirma dafuer
 * Angebote pflegt. Gemessen am 2026-08-26: 24 von 33 aktiven Kraeften waren
 * frei — im Marktplatz stand EIN aktives Einzelangebot.
 *
 * WAS DIESER DIENST TUT: Er materialisiert fuer jede aktive, markt-praesente
 * Kraft mit Katalog-Skills die fehlenden Einzelskill-Angebote — als ganz
 * normale `capacity_posts` (offer_kind 'single_skill', quelle
 * 'live_belegschaft'). Damit laeuft ALLES Weitere ueber die vorhandenen
 * Schienen: der Feed zeigt sie, `workerOfferReservationService` pausiert sie,
 * solange die Kraft im Einsatz ist, und gibt sie frei, sobald sie es nicht
 * mehr ist, `accept-deal` bucht sie, der Dedup-Index (Mig 145) verhindert
 * Doppel-Angebote. Kein zweiter Marktplatz, kein zweiter Zustand.
 *
 * ARBEITSTEILUNG, bewusst: Dieser Dienst kennt KEINE Einsaetze. Ob eine Kraft
 * gerade gebunden ist, entscheidet ausschliesslich der Reservierungs-Sweep —
 * er laeuft im selben Cron-Takt DIREKT NACH der Materialisierung und pausiert
 * die Angebote gebundener Kraefte, bevor irgendjemand sie sieht. Zwei Dienste,
 * die beide "frei?" beantworten, waeren zwei Wahrheiten.
 *
 * DER AUSSCHALTER (Mig 200, Plan J §3.2): `marktpraesenz_deaktiviert` ist ein
 * Ausschalter, kein Einschalter — Praesenz ist der Grundzustand. Beim
 * Abschalten (oder Deaktivieren des Profils) nimmt der Sweep NUR zurueck, was
 * er selbst erzeugt hat (`quelle = 'live_belegschaft'`); von Hand gepflegte
 * Angebote sind die Entscheidung der Agentur und bleiben stehen. Laufende
 * Geschaefte ('reserved'/'filled') werden nie angefasst — eine Praesenz-
 * Entscheidung storniert keinen Deal.
 *
 * Set-basiert + idempotent wie der Reservierungs-Sweep: mehrfach ausfuehrbar
 * ohne Nebenwirkung, gefahrlos im Cron.
 */

/* Der Ansprechpartner der Agentur fuer das automatische Angebot:
 * `capacity_posts.supplier_company_id` ist NOT NULL und zeigt auf einen
 * Nutzer. Die Automatik nimmt deterministisch das dienstaelteste aktive
 * Mitglied mit Leitungsrolle der Org; gibt es keines, das dienstaelteste
 * aktive Mitglied ueberhaupt. Eine Org ganz ohne aktives Mitglied bekommt
 * keine automatischen Angebote — es gaebe niemanden, der antwortet. */
const AGENTUR_NUTZER_SQL = `
  SELECT om.user_id
    FROM org_memberships om
   WHERE om.org_id = wp.supplier_org_id
     AND om.is_active = TRUE
     AND om.role_key <> 'worker'
   ORDER BY (om.role_key NOT IN ('owner', 'admin')), om.created_at ASC
   LIMIT 1`;

/* Fehlende Einzelskill-Angebote anlegen. Spiegel von
 * buildSingleSkillOfferData (capacityOfferGeneratorService) — mit zwei
 * gewollten Abweichungen: status 'active' statt 'draft' (die Automatik IST
 * die Veroeffentlichung; ein Entwurf, den niemand freischaltet, waere wieder
 * das Pflegeproblem) und quelle 'live_belegschaft' (damit die Ruecknahme
 * weiss, was ihr gehoert). Kraefte ohne Ort werden ausgelassen —
 * location_city ist NOT NULL, und ein erfundener Ort waere eine Luege im
 * Marktplatz. ON CONFLICT gegen den Dedup-Index (Mig 145): ein bereits
 * vorhandenes Angebot (egal welcher quelle) hat Vorrang. */
/*
 * F27 (Owner-Entscheid 2026-09-04) — `last_confirmed_at` gehoert an die Quelle.
 *
 * `findStaleEntries` prueft `last_confirmed_at IS NULL OR ... < NOW() - 7 Tage`.
 * Die erste Haelfte trifft SOFORT: ein Eintrag ohne Bestaetigung ist ueberfaellig,
 * nicht erst nach sieben Tagen. Gemessen am 2026-09-03 waren dadurch zwoelf von
 * dreizehn aktiven Eintraegen dauerhaft ueberfaellig — darunter alle sechs, die
 * diese Automatik erzeugt hat und die NIEMAND bestaetigen kann, weil sie
 * maschinell entstehen. Der taegliche Sweep verschickte je Eintrag eine Meldung
 * an einen echten Menschen (den owner/admin der Agentur), unbefristet.
 *
 * Gewaehlt wurde nicht der Filter auf `quelle`, sondern die Bestaetigung an der
 * Quelle: was die Automatik gerade nachgeprueft hat, IST bestaetigt — und zwar
 * frischer als jede Bestaetigung von Hand. Sie prueft bei jedem Lauf, dass die
 * Kraft aktiv ist, die Faehigkeit noch traegt, nicht abwesend ist und einen Ort
 * hat.
 *
 * DAS ERNEUERN IST DER TEIL, DER DIE BESTANDSZEILEN HEILT. `DO NOTHING` liesse
 * die sechs vorhandenen fuer immer leer; `DO UPDATE` schreibt beim naechsten
 * Lauf die Bestaetigung nach. Die Bedingung `quelle = 'live_belegschaft'` haelt
 * dabei die Zusage der Zeile darueber ein: ein von Hand angelegtes Angebot hat
 * Vorrang und wird von der Maschine NICHT bestaetigt — dort ist die
 * Bestaetigungspflicht gewollt.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE BEDINGUNGEN, UNTER DENEN JEMAND IM MARKT ERSCHEINT (N7.3, 2026-09-05)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sie standen bisher nur in der WHERE-Klausel der Materialisierung. Damit gab
 * es KEINE Moeglichkeit zu sagen, WARUM jemand fehlt — und gemessen fehlten 30
 * von 33 Kraeften. Die Firma sah eine leere Liste und keinen Grund.
 *
 * DER GRUND, WARUM SIE HIER STEHEN UND NICHT IN EINER ZWEITEN ABFRAGE:
 * Eine Diagnose, die ihre Bedingungen selbst formuliert, laeuft von der
 * Materialisierung weg — und dann sagt sie "alles in Ordnung", waehrend der
 * Mensch unsichtbar bleibt. Das waere derselbe Fehler wie die beiden
 * Katalog-Tore aus M4b.1, nur eine Ebene hoeher und schwerer zu bemerken:
 * hier wuerde die Abweichung niemandem auffallen, weil beide Seiten fuer sich
 * plausibel aussehen.
 *
 * Beides — die WHERE-Klausel und die Diagnose — wird deshalb AUS DIESER LISTE
 * gebaut. Ein neuer Eintrag wirkt sofort auf beiden Seiten; einer, der nur auf
 * einer wirkt, ist nicht moeglich.
 *
 * `wer` sagt, WEN es betrifft — das entscheidet, wo der Hinweis erscheint und
 * wer ihn beheben kann (M4.9: was der Mensch selbst ausfuellen kann, wird
 * Pflicht; was ein Zustand ist, wird erklaert).
 */
/* Ohne Rueckstrich-Literal: die Werkzeugkette kollabiert doppelte Rueckstriche. */
const NEUE_ZEILE = String.fromCharCode(10);

export const PRAESENZ_BEDINGUNGEN = Object.freeze([
  {
    schluessel: "profil_inaktiv",
    sql: "wp.is_active = TRUE",
    wer: "firma",
    grund: "Das Profil ist nicht aktiv.",
    hinweis: "Ein bewusst gesetzter Zustand — kein Versehen, solange es so gewollt ist."
  },
  {
    schluessel: "marktpraesenz_aus",
    sql: "wp.marktpraesenz_deaktiviert = FALSE",
    wer: "firma",
    grund: "Die Marktpraesenz ist abgeschaltet.",
    hinweis: "Ein Klick auf \u201eIm Marktplatz zeigen\u201c schaltet sie wieder ein."
  },
  {
    schluessel: "kein_wohnort",
    sql: "wp.city IS NOT NULL AND wp.city <> ''",
    wer: "mensch",
    grund: "Es ist kein Wohnort hinterlegt.",
    hinweis: "Ohne Ort gibt es nichts zu rechnen — die haeufigste stille Ursache."
  },
  {
    schluessel: "heute_abwesend",
    sql: `NOT ${abwesendHeuteSql("wp.id")}`,
    wer: "zeitlich",
    grund: "Heute abwesend.",
    hinweis: "Gewollt: wer krank ist, soll nicht angeboten werden. Loest sich von selbst."
  },
  {
    schluessel: "kein_agentur_nutzer",
    sql: `(${AGENTUR_NUTZER_SQL}) IS NOT NULL`,
    wer: "organisation",
    grund: "Die Organisation hat kein nicht-arbeitendes Mitglied.",
    hinweis: "Ein Datenproblem der Firma, nicht der Person: dem Angebot fehlt der Absender."
  },
  {
    schluessel: "keine_freigegebene_faehigkeit",
    sql: `EXISTS (
       SELECT 1 FROM worker_profile_skills wps2
        JOIN platform_skills ps2 ON ps2.id = wps2.skill_id AND ${katalogTorSql("ps2")}
       WHERE wps2.worker_profile_id = wp.id
     )`,
    wer: "mensch",
    grund: "Keine freigegebene Katalog-Faehigkeit.",
    hinweis: "Ein Vorschlag zaehlt nicht — er wartet auf Kuratierung (M4b.3)."
  },
  {
    /*
     * ═══════════════════════════════════════════════════════════════════════
     * DIE SIEBTE BEDINGUNG: DER ENTWURFS-RIEGEL (M4c.8/M4c.9, 2026-09-26)
     * ═══════════════════════════════════════════════════════════════════════
     *
     * Gefunden bei der Messung zu M4c.0 und von der planenden Sitzung
     * nachgemessen. `MATERIALISIEREN_SQL` schliesst ueber sein `NOT EXISTS` auch
     * ENTWUERFE aus — richtig, damit nichts doppelt entsteht. Die Wirkung ist
     * trotzdem ein Loch:
     *
     *   Ein Entwurf ist im Markt UNSICHTBAR, besetzt aber den Platz, den die
     *   Automatik fuellen wuerde. Der Mensch ist damit WEDER im Markt NOCH
     *   materialisierbar — unbegrenzt, und kein Ereignis loest das auf.
     *
     * Betroffen waren 2 von 2 markt-faehigen Menschen: der Normalfall dieser
     * Datenbank, keine Randlage. Owner-Entscheid: der Riegel BLEIBT
     * (Doppelangebote waeren schlimmer als Unsichtbarkeit), aber er wird sichtbar.
     *
     * UND `offeneGruende()` BEHAUPTETE DAS GEGENTEIL. Es ueberspringt jeden, der
     * keine Gruende hat, mit dem Kommentar "steht im Markt — keine Zeile
     * noetig". Keine der sechs Bedingungen kannte den Riegel, also stand da:
     * alles in Ordnung. Eine Aufsicht, die Unsichtbares als sichtbar meldet, ist
     * schlimmer als gar keine.
     *
     * NUR 'draft', NICHT 'paused'. Ein pausiertes Angebot ist die Arbeit des
     * Reservierungs-Sweeps: die Kraft ist gebunden, und es kommt von selbst
     * zurueck. Ein Entwurf ist unfertige Arbeit eines Menschen und loest sich
     * nie auf. Wer 'paused' mitzaehlte, meldete jede gebuchte Kraft als Problem.
     */
    schluessel: "entwurf_blockiert",
    nurDiagnose: true,
    sql: `NOT EXISTS (
       SELECT 1 FROM capacity_posts cpe
        WHERE cpe.worker_profile_id = wp.id
          AND cpe.status = 'draft'
          AND cpe.offer_kind IN ('single_skill', 'bundle')
     )`,
    zahlSql: `(SELECT COUNT(*) FROM capacity_posts cpz
                WHERE cpz.worker_profile_id = wp.id
                  AND cpz.status = 'draft'
                  AND cpz.offer_kind IN ('single_skill', 'bundle'))`,
    wer: "firma",
    grund: "Entwuerfe blockieren die automatische Veroeffentlichung.",
    /* Die Mehrzahl von "Entwurf" ist "Entwuerfe" — ein angehaengtes "e" ergaebe
       "Entwurfe". Der Satz stand bis 2026-10-03 in der Zusammenbau-Schleife und
       galt dort fuer JEDE Bedingung mit Zahl; jetzt gehoert er dieser hier. */
    grundMitZahl: (n) => (n === 1
      ? "1 Entwurf blockiert 1 Angebot."
      : `${n} Entwuerfe blockieren ${n} Angebote.`),
    hinweis: "Ein Entwurf ist im Marktplatz unsichtbar, haelt aber den Platz besetzt — "
      + "die Automatik legt daneben nichts an. Veroeffentlichen oder verwerfen loest es."
  },
  {
    /*
     * ═══════════════════════════════════════════════════════════════════════
     * M4b.3 — "WIRD GEPRUEFT" IST ETWAS ANDERES ALS "NICHTS DA"
     * ═══════════════════════════════════════════════════════════════════════
     *
     * `keine_freigegebene_faehigkeit` oben trifft ZWEI voellig verschiedene
     * Menschen mit demselben Satz: den, der gar keine Faehigkeit eingetragen
     * hat, und den, der eine eingetragen hat, die noch auf Kuratierung wartet.
     * Der erste muss etwas TUN. Der zweite hat alles getan, was er tun kann,
     * und wartet auf uns. Beide lesen heute "Keine freigegebene
     * Katalog-Faehigkeit" — und der zweite zu Recht als Vorwurf.
     *
     * Genau das verbietet M4b.3: "Der Mensch sieht den Unterschied in WORTEN,
     * nicht als stille Abwesenheit."
     *
     * nurDiagnose, und das ist wichtig: diese Bedingung ist KEINE zusaetzliche
     * Huerde. Wer nur einen Vorschlag hat, scheitert bereits an
     * `keine_freigegebene_faehigkeit` — stuende diese hier in der
     * WHERE-Klausel, waere derselbe Mensch zweimal ausgeschlossen und die
     * Materialisierung muesste zwei Bedingungen erfuellen, wo eine gilt. Sie
     * VERFEINERT die Erklaerung, sie verschaerft die Regel nicht.
     *
     * Gemessen am 2026-10-03: 0 von 45 Profilen sind in diesem Zustand. Die
     * Vorkehrung ist also vorsorglich, nicht nachtraeglich — und sie muss
     * tragen, BEVOR der erste Mensch darin landet, nicht danach.
     */
    schluessel: "nur_vorschlag",
    nurDiagnose: true,
    /* Erfuellt (also KEIN Grund), solange der Mensch nicht im Zustand
       "hat Faehigkeiten, aber keine freigegebene" ist. Das Tor kommt aus
       `katalogTorSql` (M4b.1) — eine eigene Abschrift waere die naechste
       Definition von "freigegeben". */
    sql: `NOT (
       EXISTS (
         SELECT 1 FROM worker_profile_skills wpv
          WHERE wpv.worker_profile_id = wp.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM worker_profile_skills wpv2
           JOIN platform_skills psv ON psv.id = wpv2.skill_id AND ${katalogTorSql("psv")}
          WHERE wpv2.worker_profile_id = wp.id
       )
     )`,
    zahlSql: `(SELECT COUNT(*) FROM worker_profile_skills wpz
                 JOIN platform_skills psz ON psz.id = wpz.skill_id
                WHERE wpz.worker_profile_id = wp.id
                  AND NOT (${katalogTorSql("psz")}))`,
    wer: "mensch",
    grund: "Die eingetragene Faehigkeit wartet auf Freigabe.",
    grundMitZahl: (n) => (n === 1
      ? "1 Faehigkeit wartet auf Freigabe."
      : `${n} Faehigkeiten warten auf Freigabe.`),
    hinweis: "Nichts weiter zu tun — wir pruefen sie. Danach erscheinst du im Markt."
  }
]);

/**
 * Die WHERE-Klausel der Materialisierung, aus derselben Liste — aber OHNE die
 * Eintraege, die `nurDiagnose` tragen.
 *
 * DAS IST EINE AUSDRUECKLICHE AUSNAHME ZUM PRINZIP DIESER DATEI, und sie braucht
 * ihre Begruendung, weil das Prinzip gut ist: eine Diagnose, die ihre
 * Bedingungen selbst formuliert, laeuft von der Materialisierung weg.
 *
 * Der Entwurfs-Riegel ist keine Bedingung dafuer, dass jemand im Markt ERSCHEINEN
 * darf — er ist die Erklaerung dafuer, dass die Automatik einen bestimmten PLATZ
 * nicht fuellt. Stuende er in der WHERE-Klausel, haette ein einziger
 * Einzelskill-Entwurf den Menschen komplett von der Materialisierung
 * ausgeschlossen: auch von seinen UEBRIGEN Faehigkeiten und von seinem
 * Gesamtangebot. Ein Entwurf fuer "MS Office" haette die Pflegekraft ganz aus dem
 * Markt genommen. Das `NOT EXISTS` der Materialisierung arbeitet dagegen je
 * (Mensch, Faehigkeit) — dort gehoert die Genauigkeit hin.
 *
 * Damit die Ausnahme nicht zur Hintertuer wird, prueft
 * `api/test/entwurfsRiegel.test.js`, dass die Materialisierung GENAU die
 * Bedingungen ohne `nurDiagnose` traegt.
 */
function praesenzWhereSql() {
  return PRAESENZ_BEDINGUNGEN
    .filter((b) => !b.nurDiagnose)
    .map((b) => "(" + b.sql + ")")
    .join(NEUE_ZEILE + "     AND ");
}

/**
 * "Deine Kraefte, die niemand findet" (N7.3).
 *
 * Je Mensch der Organisation: welche der sechs Bedingungen ist NICHT erfuellt.
 * Gemessen am 2026-08-26 waren 30 von 33 Kraeften unsichtbar — die Firma sah
 * eine leere Liste und keinen Grund.
 *
 * DIE ABFRAGE WIRD AUS `PRAESENZ_BEDINGUNGEN` GEBAUT, Bedingung fuer Bedingung.
 * Sie kann deshalb nicht von der Materialisierung abweichen: beide lesen
 * dieselbe Liste. Eine handgeschriebene zweite Fassung waere hier besonders
 * gefaehrlich, weil eine Abweichung niemandem auffiele — die Diagnose saehe
 * plausibel aus und waere falsch.
 *
 * GEZEIGT WIRD, WER FEHLT — nicht, wer da ist. Wer alle sechs erfuellt, steht
 * im Markt und braucht keine Zeile. Die Liste ist damit von selbst kurz und
 * wird auch bei 300 Kraeften gelesen.
 *
 * @param {import('pg').Pool} pool
 * @param {string} supplierOrgId
 * @param {{limit?: number}} [opts]
 * @returns {Promise<Array<{worker_profile_id, name, gruende: Array<{schluessel, grund, hinweis, wer}>}>>}
 */
export async function unsichtbareKraefte(pool, supplierOrgId, opts = {}) {
  if (!supplierOrgId) return [];
  const limit = Math.min(500, Math.max(1, Number(opts.limit) || 200));

  /* Je Bedingung eine Spalte: TRUE heisst erfuellt. Die Auswertung erfolgt
     danach in JavaScript — so steht die Bedeutung an EINER Stelle (der Liste)
     und nicht verteilt ueber SQL-Ausdruecke und Anzeigetexte. */
  const spalten = PRAESENZ_BEDINGUNGEN
    .map((b, i) => {
      /* Traegt eine Bedingung eine ZAHL, reist sie mit: "6 Entwuerfe blockieren
         6 Angebote" sagt der Firma, wie gross die Aufgabe ist. Ein Grund ohne
         Groesse ist eine Ahnung, kein Arbeitsauftrag (M4c.9). */
      const wert = "(" + b.sql + ") AS b" + i;
      return b.zahlSql ? wert + ", (" + b.zahlSql + ")::int AS z" + i : wert;
    })
    .join("," + NEUE_ZEILE + "           ");

  const { rows } = await pool.query(
    `SELECT wp.id AS worker_profile_id,
            wp.user_id,
            TRIM(COALESCE(wp.first_name, '') || ' ' || COALESCE(wp.last_name, '')) AS name,
            /*
             * M4b.4 — EIN GRUND, DER NICHT SAGT WORUM ES GEHT, IST KEIN
             * ARBEITSAUFTRAG. "1 Faehigkeit wartet auf Freigabe" laesst die Firma
             * raten, WELCHE. Sie kennt das Gewerk und kann es sofort aufloesen —
             * aber nur, wenn der Bericht den Namen mitbringt. Dieselbe
             * Begruendung wie bei den katalogfremden Rollen in M4b.2: die
             * Bezeichnungen im Wortlaut, nicht als Zahl.
             *
             * OHNE BACKTICKS: dieser Kommentar steht INNERHALB eines
             * Template-Literals — ein Backtick fuer einen Code-Verweis beendet
             * hier die Zeichenkette, und der Fehler erscheint woanders. Genau
             * das ist beim Schreiben dieser Zeilen passiert.
             *
             * Die Spalte user_id reist mit, weil der Schreibweg der Agentur an
             * der Nutzerkennung haengt (PUT /workers/:userId/skills). Ohne sie
             * waere die Zeile eine Sackgasse: Grund lesbar, Handlung unmoeglich.
             * Sie kann NULL sein — 9 von 45 Profilen haben kein eigenes Konto;
             * die Flaeche muss diesen Fall tragen.
             */
            COALESCE((
              SELECT json_agg(json_build_object('skill_id', pw.id, 'name', pw.name)
                              ORDER BY pw.name)
                FROM worker_profile_skills ww
                JOIN platform_skills pw ON pw.id = ww.skill_id
               WHERE ww.worker_profile_id = wp.id
                 AND NOT (${katalogTorSql("pw")})
            ), '[]'::json) AS wartende_faehigkeiten,
            ${spalten}
       FROM worker_profiles wp
      WHERE wp.supplier_org_id = $1
      ORDER BY wp.last_name NULLS LAST, wp.first_name NULLS LAST
      LIMIT $2`,
    [supplierOrgId, limit]
  );

  const offen = [];
  for (const zeile of rows) {
    const gruende = PRAESENZ_BEDINGUNGEN
      .map((b, i) => {
        if (zeile[`b${i}`] === true) return null;
        const eintrag = {
          schluessel: b.schluessel, grund: b.grund, hinweis: b.hinweis, wer: b.wer
        };
        /* Die Zahl steht IM Grund, nicht nur daneben: die Oberflaeche zeigt den
           Grund, und wer sie nur in ein Zusatzfeld legt, verliert sie dort. */
        const zahl = b.zahlSql ? Number(zeile[`z${i}`]) : null;
        if (Number.isFinite(zahl) && zahl > 0) {
          eintrag.anzahl = zahl;
          /*
           * DER WORTLAUT GEHOERT DER BEDINGUNG, NICHT DIESER STELLE.
           *
           * Hier stand der Satz "N Entwuerfe blockieren N Angebote" fest
           * verdrahtet — fuer JEDE Bedingung, die eine Zahl mitbringt. Solange
           * es nur eine solche gab (der Entwurfs-Riegel), fiel das nicht auf.
           * Die zweite haette "3 Entwuerfe blockieren 3 Angebote" ueber
           * Faehigkeits-VORSCHLAEGE geschrieben: eine Zahl mit dem falschen
           * Wort, und genau diese Zeile soll ein Mensch verstehen.
           *
           * Jede Bedingung mit `zahlSql` traegt deshalb ihr eigenes
           * `grundMitZahl(n)`. Fehlt es, bleibt der Grund ohne Zahl stehen —
           * lieber ein richtiger Satz ohne Groesse als ein falscher mit.
           */
          if (typeof b.grundMitZahl === "function") eintrag.grund = b.grundMitZahl(zahl);
        }
        return eintrag;
      })
      .filter(Boolean);
    if (!gruende.length) continue;      // steht im Markt — keine Zeile noetig
    offen.push({
      worker_profile_id: zeile.worker_profile_id,
      /* M4b.4: beides nur hier, nicht im Grund — ein Grund ist Text fuer
         Menschen, eine Kennung ist Material fuer die Flaeche. */
      user_id: zeile.user_id || null,
      name: zeile.name || null,
      wartende_faehigkeiten: Array.isArray(zeile.wartende_faehigkeiten)
        ? zeile.wartende_faehigkeiten
        : [],
      gruende
    });
  }

  /*
   * Was der Mensch oder die Firma BEHEBEN kann, steht oben — vor dem, was sich
   * von selbst loest (Abwesenheit) oder bewusst so gesetzt ist. Sonst liest die
   * Firma zuerst drei Krankmeldungen und hoert auf zu scrollen, bevor sie den
   * fehlenden Wohnort sieht.
   */
  const RANG = { mensch: 0, organisation: 1, firma: 2, zeitlich: 3 };
  const gewicht = (e) => Math.min(...e.gruende.map((g) => RANG[g.wer] ?? 9));
  return offen.sort((a, b) => gewicht(a) - gewicht(b) || b.gruende.length - a.gruende.length);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * WELCHE ZUSTAENDE EINEN PLATZ BELEGEN (M4c.3b, 2026-09-25)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hier stand die Liste ('draft', 'active', 'paused') dreimal als eigene
 * Abschrift: im NOT EXISTS der Materialisierung, im ON CONFLICT und im
 * Eindeutigkeits-Index (Mig 145). Der Audit vom 2026-09-24 hat gezeigt, was die
 * Auslassung kostet:
 *
 *   Ein gebuchtes Angebot steht auf 'reserved'. Das war fuer das NOT EXISTS
 *   KEIN belegter Platz — der Takt legte fuer dieselbe Kraft und dieselbe
 *   Faehigkeit einen ZWILLING an. Derselbe Mensch stand damit zweimal im Markt:
 *   einmal reserviert fuer den Kaeufer, einmal aktiv fuer alle anderen. Und
 *   wurde die Buchung spaeter storniert, kollidierte die Rueckkehr des
 *   Originals auf 'active' mit dem Zwilling — 23505 mitten in der
 *   Storno-Transaktion, die damit vollstaendig zurueckrollte.
 *
 * OFFENE_ZUSTAENDE ist der Satz des Index: nur diese Zeilen koennen kollidieren.
 * BELEGENDE_ZUSTAENDE ist ECHT GROESSER — 'reserved' und 'filled' tragen ein
 * laufendes Geschaeft. Der Takt darf dort nichts anlegen, aber der Index
 * verbietet es nicht. Die Trennung ist Absicht und keine Redundanz: ein
 * belegter Platz ist nicht dasselbe wie ein kollidierender.
 */
export const OFFENE_ZUSTAENDE = Object.freeze(["draft", "active", "paused"]);
export const BELEGENDE_ZUSTAENDE = Object.freeze([...OFFENE_ZUSTAENDE, "reserved", "filled"]);

const alsListe = (zustaende) => zustaende.map((z) => `'${z}'`).join(", ");

/* ═══════════════════════════════════════════════════════════════════════════
 * EINE ANWEISUNG, ZWEI REICHWEITEN (M4c.3b, 2026-09-25)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die vier Anweisungen des Sweeps existierten ZWEIMAL: einmal plattformweit
 * (der Cron) und einmal von Hand abgeschrieben fuer eine einzelne Kraft (der
 * Praesenz-Schalter der Agenturtafel, `setzeMarktpraesenz`). Die Abschrift war
 * schon auseinandergelaufen: sie schrieb die fuenf Praesenz-Bedingungen selbst
 * hin, statt sie aus `PRAESENZ_BEDINGUNGEN` zu bauen — genau die Doppelung,
 * gegen die der Kopf dieser Datei argumentiert ("Eine Diagnose, die ihre
 * Bedingungen selbst formuliert, laeuft von der Materialisierung weg").
 *
 * Die Folge war nicht theoretisch: jeder Riegel, den der Audit im Cron gefunden
 * hat, fehlte in der Abschrift ebenfalls — und dort trifft der Fehler einen
 * Menschen sofort, mitten in einem Klick auf der Agenturtafel, mit einer 500
 * und ohne Audit-Zeile, nachdem der Schalter schon umgelegt war.
 *
 * Jetzt baut EIN Bauplan beide Reichweiten. Der Unterschied ist ein
 * Zusatz-Ausdruck, nichts weiter. Ein neuer Riegel wirkt sofort auf beiden
 * Seiten; einer, der nur auf einer wirkt, ist nicht mehr moeglich.
 *
 * DIE MANDANTENGRENZE STEHT IN JEDER ANWEISUNG, nicht im Vertrauen auf die
 * Pruefung davor. In der ersten Fassung hing der Ruecknahme-Zweig fuer eine
 * ABWESENDE Kraft nur an `worker_profile_id` — die Org kam ausschliesslich im
 * anderen Zweig des ODER vor. Im Ergebnis richtig (der Aufrufer hatte die Kraft
 * vorher org-gebunden geprueft), als Grenze aber nicht an der Anweisung
 * ablesbar. Der Spion-Pool-Waechter hat genau diese Bauart schon einmal zu
 * Recht abgewiesen.
 */
const NUR_DIESE_KRAFT_AN_CP = `
     AND cp.worker_profile_id = $1
     AND EXISTS (SELECT 1 FROM worker_profiles owp
                  WHERE owp.id = $1 AND owp.supplier_org_id = $2)`;
const NUR_DIESE_KRAFT_AN_WP = `
     AND wp.id = $1 AND wp.supplier_org_id = $2`;

const materialisierenSql = (zusatz = "") => `
  INSERT INTO capacity_posts (
    supplier_company_id, title, role, skill_tags, headcount,
    availability_from, availability_to, location_city, location_postal, worker_category,
    status, is_active, org_id, worker_profile_id, primary_skill_id,
    offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
    last_confirmed_at
  )
  SELECT
    (${AGENTUR_NUTZER_SQL}),
    ps.name, ps.name, ARRAY[ps.name], 1,
    CURRENT_DATE, wp.einsetzbar_bis, wp.city, wp.postal_code, ps.category,
    'active', TRUE, wp.supplier_org_id, wp.id, ps.id,
    'single_skill', 'normal', 0, TRUE, 'live_belegschaft',
    NOW()
    FROM worker_profiles wp
    JOIN worker_profile_skills wps ON wps.worker_profile_id = wp.id
    JOIN platform_skills ps ON ps.id = wps.skill_id AND ${katalogTorSql('ps')}
   WHERE ${praesenzWhereSql()}${zusatz}
     AND NOT ${gebundenSql("wp.id")}
     AND NOT EXISTS (
       SELECT 1 FROM capacity_posts cp
        WHERE cp.worker_profile_id = wp.id
          AND cp.primary_skill_id = ps.id
          AND cp.offer_kind = 'single_skill'
          AND cp.status IN (${alsListe(BELEGENDE_ZUSTAENDE)})
     )
  ON CONFLICT (worker_profile_id, primary_skill_id)
    WHERE offer_kind = 'single_skill'
      AND worker_profile_id IS NOT NULL
      AND primary_skill_id IS NOT NULL
      AND status IN (${alsListe(OFFENE_ZUSTAENDE)})
  DO UPDATE SET last_confirmed_at = NOW()
    WHERE capacity_posts.quelle = 'live_belegschaft'`;

const MATERIALISIEREN_SQL = materialisierenSql();

/* ═══════════════════════════════════════════════════════════════════════════
 * DAS GESAMTANGEBOT ENTSTEHT MIT (M4c.1, Owner: "bei 10 Skills 10 Angebote
 * plus eines fuer alle Skills")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bis hierher erzeugte der Takt nur Einzelangebote. Buendel gab es, wenn ein
 * Mensch sie von Hand anlegte — gemessen am 2026-09-24: zwei auf der ganzen
 * Plattform, beide Entwuerfe, also im Markt unsichtbar.
 *
 * WARUM DREI ANWEISUNGEN UND NICHT EINE. Ein Buendel traegt eine MOMENTAUFNAHME:
 * die Zahl im Titel, die Liste der Faehigkeiten, die Leitfaehigkeit. Ein
 * Einzelangebot traegt genau eine Faehigkeit und veraltet nur, wenn die Kraft sie
 * verliert — dann greift die Ruecknahme. Ein Buendel veraltet bei JEDER
 * Aenderung:
 *
 *   anlegen      wo noch keines offen ist
 *   nachfuehren  wenn die Faehigkeiten sich geaendert haben
 *   zuruecknehmen wenn weniger als zwei uebrig sind — ein "Allround-Kraft mit
 *                1 Faehigkeit" ist kein Buendel, sondern eine Luege
 *
 * Ohne das Nachfuehren wirbt der Markt mit "4 Faehigkeiten", waehrend zwei davon
 * laengst weg sind.
 *
 * DAS NACHFUEHREN IST BEWUSST EINE EIGENE ANWEISUNG UND KEIN `ON CONFLICT DO
 * UPDATE`. Der Audit vom 2026-09-24 hat gezeigt, warum: bei den Einzelangeboten
 * steht ein `DO UPDATE`, das NIE feuert — das `NOT EXISTS` davor filtert genau
 * die Schluessel heraus, auf die der Index anspringen wuerde. Der Zweig ist
 * toter Code, und die Bestaetigung, die er schreiben sollte, bleibt aus (Befund
 * F7). Derselbe Bau haette hier dasselbe Ergebnis gehabt: ein Buendel, dessen
 * Titel bei der Anlage einfriert. Deshalb `DO NOTHING` beim Anlegen und ein
 * ausdrueckliches UPDATE fuer den Inhalt.
 *
 * `IS DISTINCT FROM` haelt das Nachfuehren leerlauf-frei: ohne echte Abweichung
 * schreibt es nichts. Sonst berührte es alle vierundzwanzigmal am Tag jede Zeile
 * und liesse `updated_at` — die Sortierung des Feeds — dauernd springen.
 */
const BUENDEL_SKILLS_SQL = `
  SELECT COUNT(*)::int AS anzahl,
         ARRAY_AGG(s.name ORDER BY s.is_primary DESC, s.name) AS namen,
         (ARRAY_AGG(s.name     ORDER BY s.is_primary DESC, s.name))[1] AS leit_name,
         (ARRAY_AGG(s.id       ORDER BY s.is_primary DESC, s.name))[1] AS leit_skill_id,
         (ARRAY_AGG(s.category ORDER BY s.is_primary DESC, s.name))[1] AS leit_kategorie
    FROM (
      /* Der Cast auf text ist Pflicht, nicht Kosmetik: platform_skills.name ist
         varchar, capacity_posts.skill_tags ist text[]. Ohne ihn scheitert schon
         der Vergleich IS DISTINCT FROM in Postgres mit
         "operator does not exist: text[] = character varying[]" — und zwar zur
         LAUFZEIT, nicht beim Lesen des Codes. Und Backticks haben in einem
         SQL-Kommentar innerhalb eines Template-Literals nichts verloren: sie
         beenden es. Dritter Fall derselben Falle in dieser Datei. */
      SELECT ps.id, ps.name::text AS name, ps.category::text AS category, wps.is_primary
        FROM worker_profile_skills wps
        JOIN platform_skills ps ON ps.id = wps.skill_id AND ${katalogTorSql("ps")}
       WHERE wps.worker_profile_id = wp.id
    ) s`;

/* Die Leitfaehigkeit wird GENAUSO gewaehlt wie auf dem Weg von Hand
   (`loadWorkerSkills`: ORDER BY is_primary DESC, name). Eine andere Wahl hiesse:
   dasselbe Buendel traegt je nach Entstehungsweg eine andere Rolle. */
const BUENDEL_MINDESTZAHL = 2;

const buendelMaterialisierenSql = (zusatz = "") => `
  INSERT INTO capacity_posts (
    supplier_company_id, title, role, skill_tags, headcount,
    availability_from, availability_to, location_city, location_postal, worker_category,
    status, is_active, org_id, worker_profile_id, primary_skill_id,
    offer_kind, priority_level, placement_boost_level, is_anonymous, quelle,
    last_confirmed_at
  )
  SELECT
    (${AGENTUR_NUTZER_SQL}),
    ${buendelTitelSql("b.anzahl")}, b.leit_name, b.namen, 1,
    CURRENT_DATE, wp.einsetzbar_bis, wp.city, wp.postal_code, b.leit_kategorie,
    'active', TRUE, wp.supplier_org_id, wp.id, b.leit_skill_id,
    'bundle', 'normal', 0, TRUE, 'live_belegschaft',
    NOW()
    FROM worker_profiles wp
    JOIN LATERAL (${BUENDEL_SKILLS_SQL}) b ON TRUE
   WHERE ${praesenzWhereSql()}${zusatz}
     AND NOT ${gebundenSql("wp.id")}
     AND b.anzahl >= ${BUENDEL_MINDESTZAHL}
     AND NOT EXISTS (
       SELECT 1 FROM capacity_posts cp
        WHERE cp.worker_profile_id = wp.id
          AND cp.offer_kind = 'bundle'
          AND cp.status IN (${alsListe(BELEGENDE_ZUSTAENDE)})
     )
  ON CONFLICT DO NOTHING`;

const buendelAktualisierenSql = (zusatz = "") => `
  UPDATE capacity_posts cp
     SET title = ${buendelTitelSql("b.anzahl")},
         role = b.leit_name,
         skill_tags = b.namen,
         worker_category = b.leit_kategorie,
         primary_skill_id = b.leit_skill_id,
         last_confirmed_at = NOW(),
         updated_at = NOW()
    FROM worker_profiles wp
    JOIN LATERAL (${BUENDEL_SKILLS_SQL}) b ON TRUE
   WHERE wp.id = cp.worker_profile_id
     AND cp.quelle = 'live_belegschaft'
     AND cp.offer_kind = 'bundle'
     AND cp.status IN (${alsListe(OFFENE_ZUSTAENDE)})${zusatz}
     AND b.anzahl >= ${BUENDEL_MINDESTZAHL}
     AND (
       cp.skill_tags IS DISTINCT FROM b.namen
       OR cp.primary_skill_id IS DISTINCT FROM b.leit_skill_id
       OR cp.role IS DISTINCT FROM b.leit_name
       OR cp.title IS DISTINCT FROM ${buendelTitelSql("b.anzahl")}
     )`;

/* Unter zwei Faehigkeiten ist ein Gesamtangebot keines mehr. Nur EIGENE Zeilen:
   ein von Hand angelegtes Buendel ist die Entscheidung der Agentur. */
const buendelZuruecknehmenSql = (zusatz = "") => `
  UPDATE capacity_posts cp
     SET status = 'archived', is_active = FALSE, updated_at = NOW()
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.offer_kind = 'bundle'
     AND cp.status IN (${alsListe(OFFENE_ZUSTAENDE)})${zusatz}
     AND (
       SELECT COUNT(*) FROM worker_profile_skills wps
         JOIN platform_skills ps ON ps.id = wps.skill_id AND ${katalogTorSql("ps")}
        WHERE wps.worker_profile_id = cp.worker_profile_id
     ) < ${BUENDEL_MINDESTZAHL}`;


const BUENDEL_MATERIALISIEREN_SQL = buendelMaterialisierenSql();
const BUENDEL_AKTUALISIEREN_SQL = buendelAktualisierenSql();
const BUENDEL_ZURUECKNEHMEN_SQL = buendelZuruecknehmenSql();

/* Eine WIRKSAME Abwesenheit, die HEUTE gilt (Owner 2026-08-26: das Unternehmen
 * muss erkennen, "ob er wirklich verfuegbar ist"). Dieselben Bedingungen wie
 * die Kundentafel (H1): nur 'wirksam' — eine erst BEANTRAGTE Selbstmeldung ist
 * eine Entscheidung, die beim Arbeitgeber noch aussteht, und nimmt niemanden
 * vom Markt. Und es gilt DASS-nicht-WARUM: die Art der Abwesenheit erreicht
 * den Markt nie — die Kraft verschwindet einfach bis zur Rueckkehr und kommt
 * mit dem naechsten Takt von selbst wieder. */
function abwesendHeuteSql(profilSpalte) {
  return `EXISTS (
       SELECT 1 FROM worker_absences ab
        WHERE ab.worker_profile_id = ${profilSpalte}
          AND ab.zustand = 'wirksam'
          AND ab.aufgehoben_am IS NULL
          AND ab.von <= CURRENT_DATE
          AND (ab.bis IS NULL OR ab.bis >= CURRENT_DATE)
     )`;
}

/* Ruecknahme: der Ausschalter greift, das Profil ist deaktiviert, ODER die
 * Kraft ist heute wirksam abwesend. NUR eigene Zeilen (quelle), NUR offene
 * Zustaende — 'reserved' und 'filled' tragen laufende Geschaefte und bleiben
 * unberuehrt. */
const zuruecknehmenSql = (zusatz = "") => `
  UPDATE capacity_posts cp
     SET status = 'archived', is_active = FALSE, updated_at = NOW()
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.status IN (${alsListe(OFFENE_ZUSTAENDE)})${zusatz}
     AND (
       EXISTS (
         SELECT 1 FROM worker_profiles wp
          WHERE wp.id = cp.worker_profile_id
            AND (wp.marktpraesenz_deaktiviert = TRUE OR wp.is_active = FALSE)
       )
       OR ${abwesendHeuteSql("cp.worker_profile_id")}
     )`;

const ZURUECKNEHMEN_SQL = zuruecknehmenSql();

/* Wiederkehr: der Ausschalter wurde zurueckgenommen. Nur eigene, von der
 * Ruecknahme archivierte Zeilen kommen zurueck — und zwar auf 'active'; ob
 * die Kraft gerade gebunden ist, entscheidet unmittelbar danach der
 * Reservierungs-Sweep. worker_reserved-Zeilen gehoeren dem Sweep und werden
 * hier nicht angefasst. */
/* ═══════════════════════════════════════════════════════════════════════════
 * DER ZWILLINGS-RIEGEL (M4c.3b, Audit-Befund F1, 2026-09-24)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hier fehlte die Bedingung, die verhindert, dass eine zurueckkehrende Zeile in
 * einen besetzten Platz laeuft. Der Ablauf war gewoehnlich, nicht exotisch:
 *
 *   Die Kraft wird abwesend, die Ruecknahme archiviert ihr Auto-Angebot. Die
 *   Agentur legt waehrend der Abwesenheit von Hand einen Entwurf fuer dieselbe
 *   Faehigkeit an — der Angebots-Erzeuger zeigt sie als frei, denn er sieht nur
 *   offene Zeilen, und der Eindeutigkeits-Index erlaubt den Entwurf, weil das
 *   Original archiviert ist. Die Abwesenheit endet. Diese Anweisung setzt das
 *   Original auf 'active' und trifft den Entwurf: 23505.
 *
 * UND DANN IST ES KEIN EINZELFALL MEHR. Die Anweisung ist mengenbasiert: EINE
 * kollidierende Zeile laesst das GANZE UPDATE zurueckrollen — fuer jede Kraft
 * jeder Organisation. Der Sweep laeuft ohne Transaktion, also ist die Ruecknahme
 * davor schon festgeschrieben, waehrend Horizont und Materialisierung danach
 * nie laufen. Der Markt leert sich in eine Richtung, alle 15 Minuten neu, bis
 * jemand die Zeile von Hand aufloest. Kein Fehler, den ein Kunde sieht — nur
 * Wirkung weg.
 *
 * ZWEI RIEGEL, nicht einer:
 *
 *   (1) Kein besetzter Platz: eine offene Zeile fuer dieselbe Kraft und
 *       dieselbe Faehigkeit haelt die Rueckkehr auf. Von Hand hat Vorrang —
 *       dieselbe Zusage, die das ON CONFLICT der Materialisierung schon gibt.
 *   (2) Nicht zwei auf einmal: im Bestand liegen PAARE archivierter Auto-Zeilen
 *       (gemessen am 2026-09-24: fuer jede der sechs Faehigkeiten einer Kraft
 *       genau zwei, eine mit worker_reserved, eine ohne). Ohne (2) setzte EINE
 *       Anweisung beide auf 'active' und scheiterte an sich selbst. Der
 *       juengste Stand gewinnt.
 *
 * Was hier NICHT stillschweigend geschieht: die aufgehaltene Zeile wird
 * GEZAEHLT (`wiederherstellung_aufgehalten`). Eine Kraft, deren Rueckkehr
 * dauerhaft an einem Zwilling haengt, waere sonst genau der Fall aus M4c.8 —
 * nicht im Markt, kein Fehler, niemand sieht es.
 */
const ZWILLING_OFFEN_SQL = `
  EXISTS (
    SELECT 1 FROM capacity_posts zw
     WHERE zw.worker_profile_id = cp.worker_profile_id
       AND zw.offer_kind = cp.offer_kind
       AND zw.primary_skill_id IS NOT DISTINCT FROM cp.primary_skill_id
       AND zw.id <> cp.id
       AND zw.status IN (${alsListe(BELEGENDE_ZUSTAENDE)})
  )`;

/* Von mehreren archivierten Zeilen desselben Platzes kehrt nur die juengste
   zurueck. `id` als letztes Merkmal, damit die Wahl auch bei gleicher Zeit
   eindeutig ist — sonst haengt das Ergebnis an der Lesereihenfolge. */
const JUENGSTE_JE_PLATZ_SQL = `
  cp.id = (
    SELECT j.id FROM capacity_posts j
     WHERE j.quelle = 'live_belegschaft'
       AND j.status = 'archived'
       AND j.worker_reserved = FALSE
       AND j.worker_profile_id = cp.worker_profile_id
       AND j.offer_kind = cp.offer_kind
       AND j.primary_skill_id IS NOT DISTINCT FROM cp.primary_skill_id
     ORDER BY j.updated_at DESC NULLS LAST, j.created_at DESC NULLS LAST, j.id DESC
     LIMIT 1
  )`;

const wiederherstellenBasisSql = (zusatz = "") => `
   WHERE cp.quelle = 'live_belegschaft'
     AND cp.status = 'archived'
     AND cp.worker_reserved = FALSE${zusatz}
     AND EXISTS (
       SELECT 1 FROM worker_profiles wp
        WHERE wp.id = cp.worker_profile_id
          AND wp.marktpraesenz_deaktiviert = FALSE
          AND wp.is_active = TRUE
     )
     AND NOT ${abwesendHeuteSql("cp.worker_profile_id")}
     AND NOT ${gebundenSql("cp.worker_profile_id")}`;

const wiederherstellenSql = (zusatz = "") => `
  UPDATE capacity_posts cp
     SET status = 'active', is_active = TRUE, updated_at = NOW()
  ${wiederherstellenBasisSql(zusatz)}
     AND NOT ${ZWILLING_OFFEN_SQL}
     AND ${JUENGSTE_JE_PLATZ_SQL}`;

/* Was die beiden Riegel aufgehalten haben — nicht verschluckt, gezaehlt. */
const aufgehaltenSql = (zusatz = "") => `
  SELECT COUNT(*)::int AS aufgehalten
    FROM capacity_posts cp
  ${wiederherstellenBasisSql(zusatz)}
     AND (${ZWILLING_OFFEN_SQL} OR NOT ${JUENGSTE_JE_PLATZ_SQL})`;

const WIEDERHERSTELLEN_SQL = wiederherstellenSql();
const WIEDERHERSTELLUNG_AUFGEHALTEN_SQL = aufgehaltenSql();

/* Horizont-Spiegel (Welle J9): `einsetzbar_bis` des Profils ist die Wahrheit,
 * `availability_to` der eigenen Auto-Angebote ihr Spiegel. So rechnet ALLES
 * Vorhandene einfach mit — der Feed blendet abgelaufene Angebote aus, die
 * Buchungspruefung (pruefeBuchungsWuensche) haelt den Zeitraum im Fenster,
 * die Anzeige zeigt "verfuegbar bis". Nur eigene Zeilen, nur offene
 * Zustaende, nur bei echter Abweichung (IS DISTINCT FROM haelt den Sweep
 * leerlauf-frei). */
const HORIZONT_SQL = `
  UPDATE capacity_posts cp
     SET availability_to = wp.einsetzbar_bis, updated_at = NOW()
    FROM worker_profiles wp
   WHERE wp.id = cp.worker_profile_id
     AND cp.quelle = 'live_belegschaft'
     AND cp.status IN (${alsListe(OFFENE_ZUSTAENDE)})
     AND cp.availability_to IS DISTINCT FROM wp.einsetzbar_bis`;

/* ═══════════════════════════════════════════════════════════════════════════
 * WER IST AM MARKT UNSICHTBAR — UND WARUM (eine Wahrheit, zwei Verbraucher)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Sweep misst seine eigene Luecke seit jeher mit. Gemessen am 2026-09-02:
 * 33 aktive Kraefte, 30 davon OHNE Katalog-Faehigkeit — sie koennen gar nicht
 * materialisiert werden und sind am Markt unauffindbar.
 *
 * Diese Zahl ging bisher an ihren Aufrufer, landete im Antwortkoerper von
 * `POST /internal/staffing-maintenance` und in einer Log-Zeile — und war mit
 * der naechsten Log-Rotation weg (M0-Bericht, Punkt 29). Ein Befund, den
 * niemand sieht, ist derselbe stille Ausfall wie ein Automatismus, der nie
 * laeuft.
 *
 * `marktSichtbarkeit()` am Ende dieser Datei liest denselben Bestand fuer die
 * Anzeige. Damit gaebe es zwei Stellen, die "unsichtbar" definieren — genau
 * die Doppelung, die M1.7 an anderer Stelle geloescht hat. Deshalb stehen die
 * Bedingungen HIER, einmal, und beide Abfragen setzen sie ein.
 * `api/test/marktSichtbarkeit.test.js` prueft nach, dass keine der beiden
 * ihre eigene Fassung mitbringt.
 */

/** Wer ueberhaupt am Markt erscheinen SOLL: aktiv und nicht abgeschaltet. */
export const PRAESENT_SQL = "wp.is_active = TRUE AND wp.marktpraesenz_deaktiviert = FALSE";

/** Grund 1: keine Katalog-Faehigkeit — dann gibt es nichts zu materialisieren. */
export const OHNE_SKILL_SQL =
  "NOT EXISTS (SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id)";

/**
 * Grund 2: Faehigkeit ja, Ort nein. Bewusst MIT der Faehigkeits-Bedingung,
 * damit die beiden Gruende einander ausschliessen und ihre Summe die Zahl der
 * unsichtbaren Kraefte ist — nicht mehr.
 */
export const OHNE_ORT_SQL =
  "(wp.city IS NULL OR wp.city = '') AND EXISTS "
  + "(SELECT 1 FROM worker_profile_skills s WHERE s.worker_profile_id = wp.id)";

/**
 * Der Vorbehalt reist MIT der Zahl, nicht in der Oberflaeche.
 *
 * Gezaehlt werden ZWEI Gruende, und beide sind Pflegezustaende, die die
 * Kundin selbst beheben kann. Ob der Rest tatsaechlich am Markt erscheint,
 * sagt diese Zahl NICHT — die Materialisierung schliesst zusaetzlich
 * Abwesende aus und verlangt einen Agentur-Nutzer.
 */
export const SICHTBARKEIT_HINWEIS =
  "Gezaehlt sind zwei behebbare Gruende: keine Katalog-Faehigkeit und kein "
  + "gepflegter Ort. Der Rest ist damit noch nicht zwingend am Markt sichtbar — "
  + "Abwesenheit und ein fehlender Agentur-Nutzer schliessen zusaetzlich aus.";

/**
 * DIE FRIST DES ENTWURFS-RIEGELS (M4c.8).
 *
 * Owner-Entscheid: der Riegel bleibt — Doppelangebote waeren schlimmer als
 * Unsichtbarkeit. Aber er darf nicht ausgesessen werden. Ein Entwurf ist die
 * unfertige Arbeit eines Menschen; nach einer Woche ist er keine Arbeit mehr,
 * sondern ein Zustand, und der Platz, den er besetzt, bleibt leer.
 *
 * SIEBEN TAGE, nicht drei und nicht dreissig: kurz genug, dass der Platz nicht
 * einen Monat brachliegt, lang genug, dass eine Agentur ueber ein Wochenende und
 * einen Urlaubstag hinweg an ihrem Entwurf arbeiten kann, ohne gemahnt zu werden.
 * Dieselbe Groessenordnung wie die Bestaetigungsfrist der Angebote (F27).
 *
 * Die Zahl geht in die Antwort des Sweeps — dorthin, wo schon
 * `unsichtbar_ohne_skill` und `unsichtbar_ohne_ort` stehen. Sie speist damit
 * dieselbe Aufsicht (Welle J6) und denselben Hinweis auf der Agenturtafel.
 */
export const ENTWURFS_FRIST_TAGE = 7;

const ENTWUERFE_UEBERFAELLIG_SQL = `
  SELECT COUNT(*)::int AS ueberfaellig,
         COUNT(DISTINCT cp.worker_profile_id)::int AS betroffene_menschen
    FROM capacity_posts cp
   WHERE cp.status = 'draft'
     AND cp.offer_kind IN ('single_skill', 'bundle')
     AND cp.worker_profile_id IS NOT NULL
     AND COALESCE(cp.updated_at, cp.created_at) < NOW() - INTERVAL '${ENTWURFS_FRIST_TAGE} days'`;

/**
 * Vollstaendiger Sweep: (1) Ruecknahme abgeschalteter Kraefte,
 * (2) Wiederkehr wieder eingeschalteter, (3) Horizont spiegeln,
 * (4) fehlende Angebote anlegen.
 * Reihenfolge ist Absicht: erst aufraeumen, dann anlegen — sonst legt (4)
 * an, was (1) im selben Lauf wieder wegnimmt.
 *
 * Der Aufrufer (Cron staffing-maintenance) laesst DANACH
 * `workerOfferReservationService.sweepReservations` laufen, damit Angebote
 * gebundener Kraefte pausiert sind, bevor irgendjemand den Feed liest.
 */
export async function sweepMarktpraesenz(pool) {
  const zurueck = await pool.query(`${ZURUECKNEHMEN_SQL} RETURNING cp.id`);
  const wieder = await pool.query(`${WIEDERHERSTELLEN_SQL} RETURNING cp.id`);
  /* NACH der Wiederherstellung gezaehlt: was jetzt noch aufgehalten ist, ist
     wirklich aufgehalten — vorher waere die Zahl um die gerade Zurueckgekehrten
     zu hoch. */
  const aufgehalten = await pool.query(WIEDERHERSTELLUNG_AUFGEHALTEN_SQL);
  const horizont = await pool.query(`${HORIZONT_SQL} RETURNING cp.id`);
  const neu = await pool.query(`${MATERIALISIEREN_SQL} RETURNING id`);
  /* M4c.1 — das Gesamtangebot, in dieser Reihenfolge:
   *
   *   zuruecknehmen  ZUERST: wer unter zwei Faehigkeiten gefallen ist, gibt den
   *                  Platz frei — sonst haelt sein veraltetes Buendel den Riegel
   *                  der Anlage besetzt und nichts Neues entsteht.
   *   anlegen        dann, wo keines offen ist.
   *   nachfuehren    zuletzt: das gerade Angelegte traegt seinen Inhalt schon,
   *                  also findet das Nachfuehren dort nichts zu tun. Umgekehrt
   *                  liefe es ins Leere. */
  const buendelZurueck = await pool.query(`${BUENDEL_ZURUECKNEHMEN_SQL} RETURNING cp.id`);
  const buendelNeu = await pool.query(`${BUENDEL_MATERIALISIEREN_SQL} RETURNING id`);
  const buendelAktuell = await pool.query(`${BUENDEL_AKTUALISIEREN_SQL} RETURNING cp.id`);
  /* Die Luecke wird MITGEMESSEN, nicht verschluckt (Plan J §0.12, "No silent
   * caps"): eine aktive, praesente Kraft ohne Katalog-Skill oder ohne Ort
   * kann nicht materialisiert werden — sie ist am Markt unsichtbar, und
   * niemand wuerde es merken. Gemessen am 2026-08-26 traf das 30 von 33
   * Kraeften (3 mit Katalog-Skill). Diese Zahlen speisen die Aufsicht
   * (Welle J6) und den Hinweis auf der Agenturtafel (Welle J2c). */
  const luecke = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE ${OHNE_SKILL_SQL})::int AS ohne_skill,
      COUNT(*) FILTER (WHERE ${OHNE_ORT_SQL})::int AS ohne_ort
      FROM worker_profiles wp
     WHERE ${PRAESENT_SQL}`);
  /* M4c.8: derselbe Gedanke wie bei den zwei Luecken darueber — der Riegel wird
     MITGEMESSEN. Ein Platz, der seit einer Woche von einem Entwurf besetzt ist,
     ist kein Wartezustand mehr, sondern ein Befund. */
  const entwuerfe = await pool.query(ENTWUERFE_UEBERFAELLIG_SQL);
  return {
    zurueckgenommen: zurueck.rowCount || 0,
    wiederhergestellt: wieder.rowCount || 0,
    wiederherstellung_aufgehalten: aufgehalten.rows[0]?.aufgehalten || 0,
    horizont_gespiegelt: horizont.rowCount || 0,
    materialisiert: neu.rowCount || 0,
    buendel_zurueckgenommen: buendelZurueck.rowCount || 0,
    buendel_materialisiert: buendelNeu.rowCount || 0,
    buendel_nachgefuehrt: buendelAktuell.rowCount || 0,
    unsichtbar_ohne_skill: luecke.rows[0]?.ohne_skill || 0,
    unsichtbar_ohne_ort: luecke.rows[0]?.ohne_ort || 0,
    entwuerfe_ueberfaellig: entwuerfe.rows[0]?.ueberfaellig || 0,
    entwuerfe_betroffene_menschen: entwuerfe.rows[0]?.betroffene_menschen || 0,
    entwurfs_frist_tage: ENTWURFS_FRIST_TAGE
  };
}

/**
 * Das Markt-Profil einer Kraft setzen (Welle J9): Merkmale aus dem festen
 * Katalog, Planungshorizont, interne Dispo-Notiz. Org-gebunden im
 * Schreibvorgang selbst (dieselbe Grenze wie der Praesenz-Schalter); der
 * Horizont wird SOFORT in die eigenen Auto-Angebote gespiegelt — kraft- und
 * org-gebunden, damit die Route beweisbar in ihrer Mandantengrenze bleibt.
 *
 * Die MERKMALE brauchen keinen Spiegel: der Feed liest sie zur Lesezeit vom
 * Profil (eine Wahrheit — eine Aenderung wirkt sofort in allen Angeboten).
 * Die DISPO_NOTIZ verlaesst diesen Dienst nie Richtung Markt.
 *
 * @returns {null} wenn die Kraft nicht zu dieser Org gehoert.
 */
export async function setzeMarktProfil(pool, supplierOrgId, workerProfileId, { merkmale, einsetzbarBis, dispoNotiz }) {
  const { rows } = await pool.query(
    `UPDATE worker_profiles
        SET markt_merkmale = $3,
            einsetzbar_bis = $4,
            dispo_notiz = $5,
            updated_at = NOW()
      WHERE id = $1 AND supplier_org_id = $2
      RETURNING id, markt_merkmale, einsetzbar_bis, dispo_notiz`,
    [workerProfileId, supplierOrgId, merkmale, einsetzbarBis, dispoNotiz]
  );
  if (!rows[0]) return null;
  const horizont = await pool.query(
    `UPDATE capacity_posts cp
        SET availability_to = $3, updated_at = NOW()
      WHERE cp.worker_profile_id = $1
        AND cp.quelle = 'live_belegschaft'
        AND cp.status IN (${alsListe(OFFENE_ZUSTAENDE)})
        AND cp.availability_to IS DISTINCT FROM $3
        AND EXISTS (
          SELECT 1 FROM worker_profiles wp
           WHERE wp.id = $1 AND wp.supplier_org_id = $2
        )
      RETURNING cp.id`,
    [workerProfileId, supplierOrgId, einsetzbarBis]
  );
  return {
    worker_profile_id: rows[0].id,
    markt_merkmale: rows[0].markt_merkmale,
    einsetzbar_bis: rows[0].einsetzbar_bis,
    dispo_notiz: rows[0].dispo_notiz,
    horizont_gespiegelt: horizont.rowCount || 0
  };
}

/**
 * Der Praesenz-Schalter fuer EINE Kraft — der Weg, den die Agenturtafel
 * (Welle J2c) aufruft. Setzt den Ausschalter und zieht die Folgen sofort
 * nach, statt auf den naechsten Cron-Takt zu warten: wer abschaltet, will
 * die Kraft JETZT nicht mehr im Marktplatz sehen.
 *
 * JEDE Anweisung hier ist kraft- UND org-gebunden ($1 = Profil, $2 = Org).
 * Der Org-Grenzen-Waechter (Spion-Pool) hat die erste Fassung zu Recht
 * abgewiesen: sie liess nach dem org-gebundenen UPDATE den GLOBALEN Sweep
 * laufen — im Ergebnis richtig (idempotent), als Mandantengrenze aber
 * unbeweisbar. Eine Route, die fuer Org A handelt, schreibt hier nichts,
 * was nicht nachweislich an Org A haengt; den Rest erledigt der Cron.
 *
 * @returns {null} wenn die Kraft nicht zu dieser Org gehoert.
 */
export async function setzeMarktpraesenz(pool, supplierOrgId, workerProfileId, deaktiviert) {
  const { rows } = await pool.query(
    `UPDATE worker_profiles
        SET marktpraesenz_deaktiviert = $3, updated_at = NOW()
      WHERE id = $1 AND supplier_org_id = $2
      RETURNING id, marktpraesenz_deaktiviert`,
    [workerProfileId, supplierOrgId, deaktiviert === true]
  );
  if (!rows[0]) return null;

  /* DIESELBEN Anweisungen wie der Cron, nur auf eine Kraft eingegrenzt. Vorher
     standen sie hier als Abschrift — mit selbst hingeschriebenen
     Praesenz-Bedingungen und ohne jeden Riegel, den der Cron inzwischen hat. */
  const kennung = [workerProfileId, supplierOrgId];
  const zurueck = await pool.query(
    `${zuruecknehmenSql(NUR_DIESE_KRAFT_AN_CP)} RETURNING cp.id`, kennung);
  const wieder = await pool.query(
    `${wiederherstellenSql(NUR_DIESE_KRAFT_AN_CP)} RETURNING cp.id`, kennung);
  const aufgehalten = await pool.query(aufgehaltenSql(NUR_DIESE_KRAFT_AN_CP), kennung);
  const neu = await pool.query(
    `${materialisierenSql(NUR_DIESE_KRAFT_AN_WP)} RETURNING id`, kennung);
  /* M4c.1 — DAS GESAMTANGEBOT GEHOERT HIERHER EBENFALLS.
   *
   * Der Schalter gibt das Versprechen "wer abschaltet, wartet nicht auf den
   * Cron". Liesse er die Buendel aus, hielte das Versprechen nur zur Haelfte:
   * beim Einschalten entstuenden die Einzelangebote sofort und das
   * Gesamtangebot erst in bis zu 15 Minuten. Genau so entsteht die Doppelung,
   * die diese Datei gerade losgeworden ist — nur in der anderen Richtung. */
  const buendelZurueck = await pool.query(
    `${buendelZuruecknehmenSql(NUR_DIESE_KRAFT_AN_CP)} RETURNING cp.id`, kennung);
  const buendelNeu = await pool.query(
    `${buendelMaterialisierenSql(NUR_DIESE_KRAFT_AN_WP)} RETURNING id`, kennung);
  const buendelAktuell = await pool.query(
    `${buendelAktualisierenSql(NUR_DIESE_KRAFT_AN_CP)} RETURNING cp.id`, kennung);
  return {
    worker_profile_id: rows[0].id,
    marktpraesenz_deaktiviert: rows[0].marktpraesenz_deaktiviert,
    zurueckgenommen: zurueck.rowCount || 0,
    wiederhergestellt: wieder.rowCount || 0,
    wiederherstellung_aufgehalten: aufgehalten.rows[0]?.aufgehalten || 0,
    materialisiert: neu.rowCount || 0,
    buendel_zurueckgenommen: buendelZurueck.rowCount || 0,
    buendel_materialisiert: buendelNeu.rowCount || 0,
    buendel_nachgefuehrt: buendelAktuell.rowCount || 0
  };
}

/**
 * Wer ist am Markt unsichtbar — und bei WEM (2026-09-02).
 *
 * Der Sweep zaehlt die Unsichtbaren plattformweit. Fuer eine Handlung genuegt
 * das nicht: "30 von 33" sagt, DASS es ein Problem gibt, nicht WEN man anruft.
 * Diese Funktion liefert dieselbe Zahl je Agentur, absteigend nach
 * Betroffenen — das ist die Anrufliste.
 *
 * REIN LESEND. Sie schreibt nichts und laeuft deshalb auch dann, wenn der
 * Sweep gerade nicht laeuft.
 *
 * WAS SIE BEWUSST NICHT BEHAUPTET: dass der Rest sichtbar IST. Die
 * Materialisierung schliesst zusaetzlich Abwesende aus und verlangt einen
 * Agentur-Nutzer (siehe MATERIALISIEREN_SQL). Gezaehlt werden die zwei
 * Gruende, die ein PFLEGEZUSTAND sind und die die Kundin selbst beheben kann.
 * Der Unterschied steht im Feld `hinweis` und wird mitgezeigt.
 *
 * Wirft nie: eine Aufsichtszahl darf die Seite nicht mitreissen.
 */
export async function marktSichtbarkeit(pool) {
  const leer = {
    verfuegbar: false,
    gesamt: { aktive: 0, ohne_skill: 0, ohne_ort: 0, unsichtbar: 0 },
    je_agentur: [],
    hinweis: SICHTBARKEIT_HINWEIS
  };
  if (!pool || typeof pool.query !== "function") return leer;

  let zeilen = [];
  try {
    const { rows } = await pool.query(`
      SELECT wp.supplier_org_id                             AS org_id,
             COALESCE(o.name, 'ohne Organisation')          AS name,
             COUNT(*)::int                                  AS aktive,
             COUNT(*) FILTER (WHERE ${OHNE_SKILL_SQL})::int AS ohne_skill,
             COUNT(*) FILTER (WHERE ${OHNE_ORT_SQL})::int   AS ohne_ort
        FROM worker_profiles wp
        LEFT JOIN organizations o ON o.id = wp.supplier_org_id
       WHERE ${PRAESENT_SQL}
       GROUP BY wp.supplier_org_id, o.name`);
    zeilen = rows || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "Markt-Sichtbarkeit konnte nicht gelesen werden");
    return leer;
  }

  const jeAgentur = zeilen.map((r) => {
    const aktive = Number(r.aktive) || 0;
    const ohneSkill = Number(r.ohne_skill) || 0;
    const ohneOrt = Number(r.ohne_ort) || 0;
    return {
      org_id: r.org_id || null,
      name: String(r.name || "ohne Organisation"),
      aktive,
      ohne_skill: ohneSkill,
      ohne_ort: ohneOrt,
      unsichtbar: ohneSkill + ohneOrt
    };
  }).sort((a, b) => b.unsichtbar - a.unsichtbar
    || b.aktive - a.aktive
    || a.name.localeCompare(b.name, "de"));

  /* Die Kopfzahl wird aus den ZEILEN summiert, nicht getrennt abgefragt.
   * Sonst koennten Kopf und Liste auseinanderlaufen — und eine Kennzahl, die
   * ihrer eigenen Aufschluesselung widerspricht, ist keine. */
  const summe = (feld) => jeAgentur.reduce((n, a) => n + a[feld], 0);

  return {
    verfuegbar: true,
    gesamt: {
      aktive: summe("aktive"),
      ohne_skill: summe("ohne_skill"),
      ohne_ort: summe("ohne_ort"),
      unsichtbar: summe("unsichtbar")
    },
    je_agentur: jeAgentur,
    hinweis: SICHTBARKEIT_HINWEIS
  };
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * N8.1b-6 — DIE ALTBEZEICHNUNGEN: KENNZEICHNEN, NICHT LOESCHEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Seit N8.1 kommt kein Freitext mehr in ein Rollenfeld. Was VORHER hineinkam,
 * steht weiterhin da — gemessen am 2026-09-21: von 44 verschiedenen Rollen im
 * Markt treffen 19 den Katalog nie. Darunter Schreibvarianten, die sich
 * auflösen lassen ("Bauhelfer" gegen "Bauhelfer:in", "Lagerhelfer",
 * "CNC-Bediener"), und Unbrauchbares ("lager", "helfer", "ljoj", "IJF)IE").
 *
 * GELOESCHT WIRD NICHTS. An diesen Rollen haengen Angebote und Bedarfe; ein
 * UPDATE waere ein Eingriff in fremde Ausschreibungen, und das ist eine
 * Owner-Entscheidung, keine Nebenwirkung eines Waechters.
 *
 * Diese Funktion LISTET sie stattdessen — mit der Zahl der Eintraege, die
 * daran haengen, damit die Reihenfolge der Aufraeumarbeit aus den Daten kommt
 * und nicht aus dem Gefuehl. Wer "Bauhelfer" sieht, traegt es als Alias bei
 * "Bauhelfer:in" nach; wer "ljoj" sieht, weiss, dass dort nichts zu retten ist.
 *
 * WARUM PLATTFORMWEIT UND IM STAFF CC: der Katalog betrifft die Plattform als
 * Ganzes (docs/FLAECHEN.md, Antwort 3) — nicht einen Kunden.
 *
 * Wirft nie: eine Aufsichtszahl darf die Seite nicht mitreissen.
 */
export async function katalogfremdeRollen(pool) {
  const leer = { verfuegbar: false, anzahl: 0, eintraege: 0, rollen: [] };
  if (!pool || typeof pool.query !== "function") return leer;

  let zeilen = [];
  try {
    const { rows } = await pool.query(`
      WITH rollen AS (
        SELECT role, 'angebot'::text AS seite, COUNT(*)::int AS anzahl
          FROM capacity_posts
         WHERE role IS NOT NULL AND btrim(role) <> ''
         GROUP BY role
        UNION ALL
        SELECT role, 'bedarf'::text, COUNT(*)::int
          FROM demand_requests
         WHERE role IS NOT NULL AND btrim(role) <> ''
         GROUP BY role
      )
      SELECT r.role                              AS rolle,
             SUM(r.anzahl)::int                  AS eintraege,
             array_agg(DISTINCT r.seite)         AS seiten
        FROM rollen r
       WHERE NOT EXISTS (
               SELECT 1
                 FROM platform_skills s
                WHERE s.is_active
                  AND (lower(s.name) = lower(btrim(r.role))
                       OR EXISTS (SELECT 1 FROM unnest(s.aliases) a
                                   WHERE lower(a) = lower(btrim(r.role))))
             )
       GROUP BY r.role
       ORDER BY 2 DESC, 1 ASC`);
    zeilen = rows || [];
  } catch (e) {
    logger.warn({ err: e?.message }, "Katalogfremde Rollen konnten nicht gelesen werden");
    return leer;
  }

  const rollen = zeilen.map((r) => ({
    rolle: String(r.rolle || ""),
    eintraege: Number(r.eintraege) || 0,
    seiten: Array.isArray(r.seiten) ? r.seiten : []
  }));

  return {
    verfuegbar: true,
    anzahl: rollen.length,
    /* Die Summe aus den ZEILEN, nicht getrennt abgefragt — sonst koennen Kopf
       und Liste auseinanderlaufen. */
    eintraege: rollen.reduce((n, r) => n + r.eintraege, 0),
    rollen,
    hinweis: "Diese Bezeichnungen stammen aus der Zeit vor dem Katalogzwang (N8.1). "
      + "Sie werden NICHT geloescht — an ihnen haengen Angebote und Bedarfe. Wer eine "
      + "Schreibvariante erkennt, traegt sie als Alias am passenden Katalogeintrag nach; "
      + "danach verschwindet sie von selbst aus dieser Liste."
  };
}

/*
 * FUER DIE PROBEN, und das ist kein Zugestaendnis, sondern eine Notwendigkeit:
 * die Ablauf-Nachweise dieser Datei brauchen eine Datenbank und laufen deshalb
 * im Tor NICHT — sie melden dort `tests 0`, nicht einmal einen Uebersprung. Eine
 * Zusicherung, die nur mit Container rot werden kann, ist im Tor keine.
 * Gegengeprueft am 2026-09-26: zwei Rueckmutationen (Mindestzahl 2 -> 1, die
 * Ruecknahme stillgelegt) blieben ohne Datenbank gruen. Die Form der Anweisungen
 * ist deshalb von aussen lesbar.
 */
export const _FUER_PROBEN = Object.freeze({
  BUENDEL_MINDESTZAHL,
  buendelMaterialisierenSql,
  buendelAktualisierenSql,
  buendelZuruecknehmenSql,
  materialisierenSql,
  zuruecknehmenSql,
  wiederherstellenSql,
  NUR_DIESE_KRAFT_AN_CP,
  NUR_DIESE_KRAFT_AN_WP
});
