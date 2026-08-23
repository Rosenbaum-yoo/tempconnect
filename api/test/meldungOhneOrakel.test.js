import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/*
 * `POST /reports` IST ENTFERNT — und diese Datei sorgt dafuer, dass sie nicht
 * unbemerkt zurueckkehrt.
 *
 * WAS SIE WAR: eine Missbrauchsmeldung gegen einen einzelnen Nutzer (Spam,
 * Betrug, Belaestigung). Am 2026-08-22 erhoben, am 2026-08-23 nach
 * Owner-Entscheid entfernt.
 *
 * WARUM SIE GING, nicht nur repariert wurde:
 *   * NULL Aufrufer im gesamten Repo. Drei unabhaengige Suchmerkmale — Pfad
 *     `/reports`, Nutzlast `reported_user_id`, Vokabular `betrug|belaestigung`
 *     — je 0 Treffer unter `frontend/`. Es gab nie einen Knopf dafuer.
 *   * NULL Zeilen in der Datenbank. Niemand hat je gemeldet.
 *   * Sie in `profile_abuse_reports` zu ueberfuehren haette zuerst zwei nicht
 *     technisch loesbare Fragen gekostet: 144 von 395 Nutzern sind keiner
 *     Organisation zuzuordnen (die Zielspalte ist NOT NULL, der Posteingang
 *     verbindet per INNER JOIN), und die Grund-Vokabulare ueberschneiden sich
 *     nur bei `spam`.
 *
 * WAS AN IHRE STELLE TRITT: der Support-Trichter mit der Fallart `complaint`
 * (`api/services/supportIntakeService.js`, seit 2026-08-22). Der landet bei
 * einem echten Menschen, hat eine Warteschlange, eine Frist und eine Fallnummer
 * — alles, was diese Route nie hatte.
 *
 * WAS SIE HINTERLAESST — die Lektion, die diese Datei traegt:
 * Der Schaden war nicht die Luecke, sondern dass das REGISTER sie als geprueft
 * ausgab. `wachen.json` fuehrte die Route als `eigene-daten` mit der Begruendung
 * "Ein Bericht wird fuer die eigene Organisation erzeugt" — waehrend
 * `eigene-daten` im Vokabular derselben Datei "kein fremdes Ziel erreichbar"
 * heisst und die Route ausdruecklich ein FREMDES Ziel meldete. Ein Reviewer, der
 * dem Register glaubte, sah eine gepruefte Route.
 */

const API = new URL("../", import.meta.url);

describe("POST /reports — entfernt und bleibt entfernt", () => {
  it("die Route-Datei gibt es nicht mehr", () => {
    assert.ok(!fs.existsSync(new URL("routes/reports.js", API).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      "api/routes/reports.js ist zurueck. Wenn Personen-Meldungen wieder ins Produkt sollen, " +
      "gehoert das entschieden — und dann mit den beiden Fragen im Gepaeck, die die Entfernung " +
      "erspart hat (org-lose Nutzer, gemeinsames Grund-Vokabular).");
  });

  it("der Dienst dazu ebenfalls nicht", () => {
    assert.ok(!fs.existsSync(new URL("services/reportService.js", API).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      "api/services/reportService.js ist zurueck");
  });

  it("nichts montiert sie mehr", () => {
    const app = fs.readFileSync(new URL("app.js", API), "utf8");
    assert.ok(!/createReportsRouter/.test(app),
      "app.js montiert wieder einen Reports-Router — eine Route, die niemand aufruft, " +
      "ist eine Angriffsflaeche ohne Gegenwert");
  });

  it("das Register fuehrt sie nicht mehr als bewachten Weg", () => {
    const wachen = JSON.parse(fs.readFileSync(new URL("test/fixtures/wachen.json", API), "utf8"));
    const eintrag = wachen.wege.find((w) => w.datei === "reports.js");
    assert.equal(eintrag, undefined,
      "Ein Registereintrag fuer eine Route, die es nicht gibt, ist genau die Sorte Zusage, " +
      "die diesen Befund ueberhaupt erst hat entstehen lassen.");
  });

  it("die Sperrklinke haelt fest, WARUM sie gesunken ist", () => {
    /* Die Grundlinie darf laut eigener Regel wachsen, nicht fallen. Sie ist hier
     * bewusst gefallen — und der Hinweis ist die einzige Stelle, an der steht,
     * warum. Ohne ihn ist die Sperrklinke eine nackte Zahl, die beim naechsten
     * Mal jemand stillschweigend weiter senkt. */
    const wachen = JSON.parse(fs.readFileSync(new URL("test/fixtures/wachen.json", API), "utf8"));
    assert.match(wachen.grundlinie.hinweis, /2026-08-23[\s\S]*GESENKT[\s\S]*ENTFERNT/,
      "Der Hinweis muss die Senkung begruenden");
    assert.equal(wachen.grundlinie.wege, wachen.wege.length,
      "die Zahl und der Bestand muessen uebereinstimmen");
  });

  it("die Migration, die die Tabelle entfernt, traegt einen Riegel gegen Datenverlust", () => {
    /*
     * `DROP TABLE` ist nicht rueckholbar, und dass die Tabelle in DIESER
     * Datenbank leer war, sagt nichts ueber Staging oder Produktion. Die
     * Migration zaehlt deshalb selbst nach und bricht ab, wenn eine Zeile
     * darin steht. Bewiesen: mit einer eingefuegten Zeile (in einer
     * zurueckgerollten Transaktion) meldet sie
     * "191 ABGEBROCHEN: reports enthaelt 1 Zeile(n)."
     */
    const m = fs.readFileSync(
      new URL("../sql/migrations/191_ein_meldeweg_weniger.sql", API), "utf8");
    /* NUR der ausfuehrbare Block. Die erste Fassung dieser Probe las die ganze
     * Datei — und der Rollback-Hinweis im Kopf nennt `DROP TABLE`, also stand
     * es dort scheinbar vor dem Riegel. Eine Probe, die Kommentare fuer Code
     * haelt, prueft das Falsche. */
    const block = m.match(/DO \$meldeweg\$[\s\S]*?\$meldeweg\$;/);
    assert.ok(block, "der ausfuehrbare Block wurde nicht gefunden — greift das Muster noch?");
    assert.match(block[0], /IF anzahl > 0 THEN\s*\n?\s*RAISE EXCEPTION/,
      "Ohne diesen Riegel wuerde die Migration in einer Umgebung, in der doch jemand " +
      "gemeldet hat, echte Missbrauchsmeldungen verwerfen — der teuerste denkbare Fehler " +
      "dieser Welle.");
    assert.ok(block[0].indexOf("RAISE EXCEPTION") < block[0].indexOf("DROP TABLE"),
      "der Riegel muss VOR dem DROP stehen");
  });
});

describe("Der Ersatz ist da, bevor der alte Weg geht", () => {
  /*
   * Eine Funktion ersatzlos zu streichen ist nur dann richtig, wenn das
   * Anliegen anderswo ankommt. Hier: die Fallart `complaint` im
   * Support-Eingang. Waere sie weg, waere das Entfernen eine Luecke statt
   * einer Aufraeumung — deshalb steht das hier und nicht nur im Commit.
   */
  it("der Support-Eingang kennt die Fallart 'Beschwerde'", async () => {
    const { KUNDEN_FALLARTEN } = await import("../services/supportIntakeService.js");
    assert.ok(KUNDEN_FALLARTEN.includes("complaint"),
      "Ohne diese Fallart haette das Entfernen von POST /reports Beschwerden ueber " +
      "Personen ersatzlos gestrichen. Sie ist die Begruendung dafuer, dass es eine " +
      "Aufraeumung war und keine Luecke.");
  });
});
