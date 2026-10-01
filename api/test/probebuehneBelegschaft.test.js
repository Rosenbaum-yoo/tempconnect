/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE BELEGSCHAFT ERFÜLLT DIE SECHS BEDINGUNGEN — UND VERFEHLT SIE GEZIELT (Y1.4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WAS Y1.4 LÖST, gemessen am 2026-10-01 vor dem Bau: 33 Arbeiterprofile,
 * **3 mit Fähigkeiten**. Der Marktplatz konnte nicht wirken — und das ist keine
 * Geschmacksfrage: `sweepMarktpraesenz()` legt ein automatisches Angebot nur an,
 * wenn eine Kraft SECHS Bedingungen erfüllt, und die sechste ist eine
 * freigegebene Katalog-Fähigkeit.
 *
 * NACH DEM LADEN von `sql/seeds/y1-4-belegschaft.sql`, gemessen:
 *
 *     Kräfte                                 12
 *     davon mit Katalog-Fähigkeit             8
 *     heute abwesend                          1
 *     heute verspätet                         1
 *     im Einsatz                              2   (bei Nordlicht, Hamburg Hafen)
 *     automatische Angebote                   5   (aktiv)
 *
 * Die 5 sind genau die vorhergesagten: W01–W04 vollständig, W05 verspätet
 * (Verspätung verdeckt nicht). Nicht im Markt: die Kranke (Bedingung 4), die
 * zwei Gebundenen, die vier ohne Fähigkeit (Bedingung 6). Jede Abwesenheit hat
 * einen NAMEN — das ist der Gegenstand, den „Deine Kräfte, die niemand findet"
 * (N7.3) braucht.
 *
 * **Und damit ist die absichtlich rote Zusicherung in
 * `api/test/marktpraesenz.service.test.js` grün geworden** — der Schalter-Zyklus
 * dort lief zum ersten Mal wirklich (10/10 statt 9/10).
 *
 * BEDINGUNG 5 IST DIE, DIE MAN NICHT ERRÄT: die Organisation braucht ein aktives
 * Mitglied mit `role_key <> 'worker'`. Eine Agentur ohne Disponenten erzeugt
 * KEIN einziges Angebot, auch wenn jede Kraft vollständig ist — es gäbe
 * niemanden, der antwortet. Eine Zusicherung unten hält das fest.
 *
 * WARUM DIE DATEI GEPRÜFT WIRD UND NICHT DIE DATENBANK: das Tor lädt keine Saat.
 * Eine DB-gebundene Zusicherung wäre auf jedem Rechner rot, auf dem die Bühne
 * nicht geladen ist — eine Rotfärbung ohne Befund. Geprüft wird die FORM.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const saat = path.join(dir, "sql", "seeds", "y1-4-belegschaft.sql");
      if (fs.existsSync(saat) && fs.statSync(saat).size > 3000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y1-4-belegschaft.sql"), "utf8") : "";
const DIENST = ROOT ? fs.readFileSync(path.join(ROOT, "api", "services", "marktpraesenzService.js"), "utf8") : "";

function einfuegung(tabelle) {
  const ohne = SAAT.replace(/--[^\n]*/g, " ");
  const m = ohne.match(new RegExp("INSERT\\s+INTO\\s+" + tabelle + "\\b[\\s\\S]*?;", "i"));
  return m ? m[0] : "";
}

suite("Y1.4 — die Belegschaft macht den Marktplatz wirksam", () => {

  it("zwölf Kräfte, und jede erfüllt die ersten drei Bedingungen", () => {
    const block = einfuegung("worker_profiles");
    assert.ok(block, "keine Kräfte — dann bleibt der Markt leer");
    const zeilen = (block.match(/'b1000000-0000-4000-8000-00000000d\d{3}'/g) || []);
    assert.equal(zeilen.length, 12,
      `Erwartet zwölf Kräfte, gefunden ${zeilen.length}. Weniger macht die Bühne dünn, `
      + "mehr verschiebt die Zahlen, auf die sich die Doku beruft.");
    /* Bedingung 1 bis 3: aktiv, Marktpräsenz an, Wohnort gesetzt. Fehlt einer,
       ist die Kraft unsichtbar — und zwar ALLE, nicht nur die vier gewollten. */
    assert.equal((block.match(/TRUE, FALSE,/g) || []).length, 12,
      "Nicht jede Kraft trägt is_active=TRUE und marktpraesenz_deaktiviert=FALSE. "
      + "Dann sind mehr unsichtbar als die vier, die es sein sollen — und die Bühne "
      + "zeigt einen Grund, den sie nicht zeigen wollte.");
    const ohneOrt = zeilen.length - (block.match(/'(Hamburg|Luebeck|Norderstedt)',\s*'\d{5}'/g) || []).length;
    assert.equal(ohneOrt, 0,
      `${ohneOrt} Kräfte ohne Wohnort. Bedingung 3 fällt damit, und der Sweep lässt sie aus.`);
  });

  it("GENAU ACHT tragen eine Katalog-Fähigkeit — vier bleiben absichtlich ohne", () => {
    const block = einfuegung("worker_profile_skills");
    assert.ok(block, "keine Fähigkeiten — Bedingung 6 fällt für alle, der Markt bleibt leer");
    const paare = (block.match(/'b1000000-0000-4000-8000-00000000d\d{3}',\s*'[^']+',/g) || []);
    assert.equal(paare.length, 8,
      `Erwartet acht Kräfte mit Fähigkeit, gefunden ${paare.length}. Gemessen war der Bestand `
      + "bei 3 von 33 — acht ist die Zahl, auf die sich der Plan und die Doku berufen. "
      + "Ohne die vier OHNE Fähigkeit fehlt der Gegenstand für „Deine Kräfte, die niemand findet\".");
  });

  it("die Fähigkeiten werden über den NAMEN gesucht, nicht über eine feste Kennung", () => {
    /* Katalog-UUIDs unterscheiden sich je Installation. Eine Saat mit fester
       Kennung findet auf einer frischen Datenbank NICHTS — die INSERT..SELECT
       legt keine Zeile an und scheitert dabei nicht. Lautlos wirkungslos. */
    assert.match(SAAT, /JOIN platform_skills ps\s*\n?\s*ON ps\.name = z\.fertigkeit/,
      "Die Fähigkeiten werden nicht über platform_skills.name verbunden. Mit hartkodierten "
      + "Katalog-Kennungen wäre die Saat auf einer anderen Datenbank still wirkungslos.");
    assert.match(SAAT, /ps\.is_active = TRUE AND ps\.status = 'approved'/,
      "Das Katalog-Tor fehlt. Eine nicht freigegebene Fähigkeit erfüllt Bedingung 6 NICHT — "
      + "der Sweep prüft `is_active AND status='approved'` (katalogTorSql).");
    /* Die BEDINGUNG, nicht ihre Meldung. Eine Rückmutation setzte `IF n <> 8`
       auf `IF false` und ließ den Meldungstext stehen — die Zusicherung blieb
       grün, obwohl die Notbremse abgeklemmt war. Elfter Fall der Klasse „die
       Zusicherung traf die falsche Stelle" an einem Tag. */
    assert.match(SAAT, /IF n <> 8 THEN/,
      "Die Notbremse prüft nicht mehr `n <> 8`. Ein falsch geschriebener Katalogname würde "
      + "die Saat erfolgreich durchlaufen lassen und die Bühne leer hinterlassen — der "
      + "schlimmste Fall: sieht erledigt aus, ist es nicht.");
    assert.match(SAAT, /% von 8 Kraeften haben eine Katalog-Faehigkeit/,
      "Die Notbremse hat ihre Meldung verloren — dann bricht sie ab, ohne den Grund zu nennen");
  });

  it("die Organisation hat einen Disponenten — Bedingung 5, die man nicht errät", () => {
    const block = einfuegung("org_memberships");
    assert.ok(block, "keine Mitgliedschaften");
    /* `sweepMarktpraesenz` nimmt als Ansprechpartner das dienstälteste aktive
       Mitglied mit role_key <> 'worker'. Gibt es keines, entsteht KEIN Angebot —
       egal wie vollständig die Kräfte sind. */
    assert.match(DIENST, /om\.role_key <> 'worker'/,
      "Der Dienst prüft die Rolle nicht mehr so — diese Zusicherung beruft sich darauf "
      + "und müsste neu gelesen werden");
    assert.match(block, /'dispatcher'/,
      "Kein Disponent in der Agentur. Dann ist `AGENTUR_NUTZER_SQL` NULL, Bedingung 5 fällt, "
      + "und der Sweep legt für KEINE der zwölf Kräfte ein Angebot an — die Bühne wäre "
      + "vollständig besetzt und vollständig unsichtbar.");
    assert.ok(!/'dispatcher',\s*'b1000000-0000-4000-8000-00000000a/.test(block),
      "Der Disponent ist an einen Standort gebunden. Die Agentur hat keine Standorte in "
      + "dieser Saat; eine Bindung würde ins Leere zeigen.");
  });

  it("jede Kraft erfüllt die Identitätsbedingung — Konto ODER Personalnummer", () => {
    /* worker_profiles_identitaet_chk: user_id IS NOT NULL OR personnel_number
       nicht leer. Gemessen beim ersten Ladeversuch: der erste Entwurf scheiterte
       genau hier. Zehn der zwölf haben kein Konto — der häufigere echte Fall. */
    const block = einfuegung("worker_profiles");
    const nummern = (block.match(/'HPS-\d{3}'/g) || []).length;
    assert.equal(nummern, 12,
      `Nur ${nummern} von zwölf Kräften tragen eine Personalnummer. `
      + "worker_profiles_identitaet_chk verlangt user_id ODER personnel_number — ohne beides "
      + "bricht das Laden ab (gemessen 2026-10-01).");
    assert.match(block, /personnel_number/,
      "Die Spalte personnel_number steht nicht in der Spaltenliste");
  });

  it("ein Kranker heute, ein Verspäteter heute — und die Unterscheidung stimmt", () => {
    const abw = einfuegung("worker_absences");
    assert.ok(abw, "keine Abwesenheit — dann fehlt der Gegenstand für Bedingung 4");
    /* `CURRENT_DATE` ohne nachfolgendes `+`. Das alte Muster war ein PRÄFIX und
       passte auch auf `CURRENT_DATE + 1` — eine Abwesenheit, die erst morgen
       beginnt, ließ die Zusicherung grün und die Kraft im Markt. */
    assert.match(abw, /'krank', CURRENT_DATE(?!\s*\+)/,
      "Die Abwesenheit beginnt nicht HEUTE. Nur eine heute wirksame Abwesenheit nimmt die "
      + "Kraft aus dem Markt (abwesendHeuteSql) — eine für morgen zeigt gar nichts.");
    assert.match(abw, /'wirksam'/,
      "Die Abwesenheit steht nicht auf 'wirksam'. 'beantragt' wirkt nicht — die Kraft bliebe "
      + "sichtbar und die Bühne zeigte das Gegenteil.");
    const ver = einfuegung("worker_delays");
    assert.ok(ver, "keine Verspätung — dann fehlt der Fall, der NICHT verdeckt");
    assert.match(ver, /CURRENT_DATE, \d+,/,
      "Die Verspätung gilt nicht für heute");
    /* Die Unterscheidung ist der Punkt: krank verdeckt, verspätet nicht. Zwei
       verschiedene Kräfte, sonst lässt sich das nicht zeigen. */
    const krankeKraft = (abw.match(/'b1000000-0000-4000-8000-00000000d(\d{3})'/) || [])[1];
    const spaeteKraft = (ver.match(/'b1000000-0000-4000-8000-00000000d(\d{3})'/) || [])[1];
    assert.ok(krankeKraft && spaeteKraft && krankeKraft !== spaeteKraft,
      `Krank und verspätet treffen dieselbe Kraft (d${krankeKraft}). Dann lässt sich nicht `
      + "zeigen, dass das eine verdeckt und das andere nicht.");
  });

  it("der Einsatz hängt am Standort aus Y1.2 — die Bühne steht nicht nebeneinander", () => {
    const ein = einfuegung("assignments");
    assert.ok(ein, "kein Einsatz — dann hat der Grund „gebunden\" kein Beispiel");
    assert.match(ein, /'b0000000-0000-4000-8000-000000000001'/,
      "Der Einsatz läuft nicht bei Nordlicht Logistik (Y1.2). Eine eigene Kundenorganisation "
      + "wäre einfacher und würde die Standortgrenze nicht belasten — der Sinn ist gerade, "
      + "dass ein echter Vorgang an einem Standort hängt.");
    assert.match(ein, /'b0000000-0000-4000-8000-00000000a001'/,
      "Der Einsatz hängt an keinem Standort. Dann sieht die Standortleitung Hamburg ihn nicht, "
      + "und die Grenze aus Welle U trägt weiter keinen Geschäftsvorgang.");
    /* Und die Abhängigkeit muss ERZWUNGEN sein: die Saat sortiert nach
       y1-2-standorte.sql, aber ein --file-Aufruf kann sie einzeln laden. */
    /* Wieder die BEDINGUNG statt der Meldung: `IF false` ließ den Text stehen
       und die Zusicherung grün. */
    assert.match(SAAT, /IF NOT EXISTS \(SELECT 1 FROM organizations WHERE id = 'b0000000-0000-4000-8000-000000000001'\) THEN/,
      "Die Saat prüft nicht, ob y1-2-standorte.sql geladen ist. Ohne diese Prüfung bricht sie "
      + "mit einem Fremdschlüsselfehler ab, und niemand weiß, dass nur die Reihenfolge fehlte.");
    assert.match(SAAT, /Nordlicht Logistik GmbH fehlt/,
      "Die Reihenfolge-Prüfung hat ihre Meldung verloren — dann steht der Grund nicht dabei");
    const links = einfuegung("worker_assignment_links");
    const anzahl = (links.match(/'primary'/g) || []).length;
    assert.equal(anzahl, 2,
      `Erwartet zwei gebundene Kräfte, gefunden ${anzahl}. Die zwei sind der Gegenstand für `
      + "den Grund „gebunden\" (gebundenSql prüft worker_assignment_links über worker_user_id — "
      + "deshalb brauchen genau diese zwei ein Konto).");
  });

  it("KEIN Passwort und KEIN Hash in der Datei", () => {
    const hashes = SAAT.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes, [], "Die Saat trägt einen bcrypt-Hash");
    const ohneKommentar = SAAT.replace(/--[^\n]*/g, " ");
    for (const wort of ["DemoPass2026!", "Demo2026!", "password123"]) {
      assert.ok(!ohneKommentar.includes(wort), `'${wort}' steht in einer ANWEISUNG`);
    }
    assert.match(SAAT, /crypt\(\s*current_setting\('app\.seed_passwort'\)/,
      "Der Hash entsteht nicht aus dem Schalter");
    assert.match(SAAT, /app\.seed_demo_world[\s\S]{0,300}RAISE EXCEPTION/,
      "Die Sperre fehlt oder wirft nicht");
  });

  it("der Katalog muss besetzt sein — sonst ist die Saat wirkungslos und sieht erfolgreich aus", () => {
    assert.match(SAAT, /platform_skills WHERE is_active AND status = 'approved'\) < 20/,
      "Die Saat prüft den Katalog nicht. Auf einer Datenbank ohne Fähigkeitskatalog würde sie "
      + "zwölf Kräfte ohne Fähigkeiten anlegen: der Markt bliebe leer, der Lauf wäre grün, und "
      + "der Befund „3 von 33\" hätte sich nur auf „3 von 45\" verschoben.");
  });
});
