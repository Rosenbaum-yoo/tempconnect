/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAS REGIEBUCH ZEIGT AUF ETWAS, DAS ES GIBT (Y5.1 · Y5.2 · Y5.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `docs/features/Y_REGIEBUCH.md` sagt einem Menschen ohne Vorwissen: *„melde
 * dich an als … → klicke … → du musst sehen …"*. Drei Dinge können daran
 * stillschweigend verrotten, und jedes macht das Regiebuch schlimmer als keines:
 *
 *   1. **Eine Seite, die es nicht gibt.** Wer dem Weg folgt, bekommt 404 und
 *      glaubt, er habe sich vertippt. Dieselbe Klasse wie `sql/seed.sh` in
 *      `docs/pilot/PILOT_CORE_FLOW.md` — siehe
 *      `api/test/saatSperreHaelt.test.js` D2.
 *   2. **Ein Konto, das keine Saat anlegt.** Die Anmeldung scheitert, und niemand
 *      weiß, ob das Konto fehlt oder das Passwort.
 *   3. **Ein Kreislauf ohne Weg.** Y5.2 verlangt, dass **jeder** der sieben
 *      Kreisläufe aus `docs/features/V_SCHNITTSTELLEN.md` (Abschnitt 3b)
 *      mindestens einen Weg hat. Fehlt einer, prüft niemand ihn — und das fällt
 *      erst auf, wenn ein Kunde darüber stolpert.
 *
 * DAZU DIE SCHÄRFSTE FORDERUNG, Y5.3: **das erwartete Ergebnis steht dabei.**
 * Ein Klickpfad ohne „du musst sehen" ist eine Wegbeschreibung ohne Ziel — wer
 * ihn abläuft, kann nicht sagen, ob die Plattform richtig geantwortet hat. Diese
 * Probe verlangt deshalb für jeden Weg zusätzlich einen Absatz **„Woran du einen
 * Fehler erkennst"**: er nennt die Verwechslung, die der Weg aufdecken soll.
 *
 * GEMESSEN beim Schreiben (2026-10-02): 18 genannte Seiten, alle vorhanden.
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
      const buch = path.join(dir, "docs", "features", "Y_REGIEBUCH.md");
      const seiten = path.join(dir, "frontend", "public", "hilfe.html");
      if (fs.existsSync(buch) && fs.statSync(buch).size > 3000 && fs.existsSync(seiten)) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;
const BUCH = ROOT ? fs.readFileSync(path.join(ROOT, "docs", "features", "Y_REGIEBUCH.md"), "utf8") : "";
const QUELLE = ROOT ? fs.readFileSync(path.join(ROOT, "docs", "features", "V_SCHNITTSTELLEN.md"), "utf8") : "";

/**
 * Die Kreisläufe, wie sie in V_SCHNITTSTELLEN.md Abschnitt 3b stehen.
 *
 * `matchAll`, NICHT `match(/…/g)`: mit dem globalen Schalter verwirft `match`
 * die Fanggruppen und liefert die ganzen Treffer. `m[1]` ist dann das zweite
 * ZEICHEN des Treffers — beim ersten Entwurf dieser Datei kam so `'#'` heraus,
 * und eine zweite Stelle funktionierte nur ZUFÄLLIG, weil `m[4]` gerade auf die
 * Ziffer fiel. Ein Zufall, der bei der nächsten Umformulierung bricht.
 */
function kreislaeufeAusQuelle() {
  return [...new Set([...QUELLE.matchAll(/\*\*K-([1-7]) [A-ZÄÖÜ]/g)].map((m) => "K-" + m[1]))].sort();
}

suite("Y5 — das Regiebuch zeigt auf etwas, das es gibt", () => {

  it("Y5.2: jeder Kreislauf aus V_SCHNITTSTELLEN.md hat einen Weg", () => {
    const quelle = kreislaeufeAusQuelle();
    /* Notbremse: ohne erkannte Kreisläufe wäre „alle abgedeckt" leer grün. */
    assert.equal(quelle.length, 7,
      `In V_SCHNITTSTELLEN.md wurden ${quelle.length} Kreisläufe erkannt, erwartet sieben `
      + `(${quelle.join(", ")}). Hat sich dort die Schreibweise geändert, prüft diese `
      + "Zusicherung nichts mehr.");
    const fehlt = quelle.filter((k) => !new RegExp("### " + k + " ").test(BUCH));
    assert.deepEqual(fehlt, [],
      `Diese Kreisläufe haben keinen Weg im Regiebuch: ${fehlt.join(", ")}. Y5.2 verlangt `
      + "für JEDEN mindestens einen — ohne Weg prüft ihn niemand.");
  });

  it("Y5.2: das Regiebuch erfindet keinen Kreislauf", () => {
    /* Die andere Richtung. Ein Weg für „K-8" würde eine Zusage beschreiben, die
       die Schnittstellen-Doku nicht kennt — und niemand könnte sagen, welche
       von beiden stimmt. */
    const imBuch = [...new Set([...BUCH.matchAll(/### (K-\d+) /g)].map((m) => m[1]))].sort();
    assert.deepEqual(imBuch, kreislaeufeAusQuelle(),
      `Das Regiebuch nennt ${imBuch.join(", ")}, die Quelle ${kreislaeufeAusQuelle().join(", ")}. `
      + "Ein erfundener Kreislauf beschreibt eine Zusage, die es nicht gibt.");
  });

  it("Y5.3: jeder Weg sagt, WAS man sehen muss", () => {
    /* Ein Klickpfad ohne Ziel ist eine Wegbeschreibung ohne Ankunft. */
    const abschnitte = BUCH.split(/\n### /).slice(1);
    assert.ok(abschnitte.length >= 7, `Nur ${abschnitte.length} Wege-Abschnitte gefunden`);
    const ohneZiel = abschnitte
      .filter((a) => /^K-\d/.test(a))
      .filter((a) => !/Du musst sehen/.test(a))
      .map((a) => a.slice(0, 20));
    assert.deepEqual(ohneZiel, [],
      `Diese Wege nennen kein erwartetes Ergebnis: ${ohneZiel.join(", ")}. Y5.3 verlangt es `
      + "ausdrücklich — ohne Ziel kann niemand sagen, ob die Plattform richtig geantwortet hat.");
  });

  it("Y5.3: jeder Weg nennt die Verwechslung, die er aufdeckt", () => {
    /* Die schärfere Hälfte von Y5.3. „Du musst sehen" sagt, was richtig ist;
       „Woran du einen Fehler erkennst" sagt, WELCHE Verwechslung der Weg prüft.
       Ohne das zweite ist ein Weg ein Spaziergang. */
    const abschnitte = BUCH.split(/\n### /).slice(1).filter((a) => /^K-\d/.test(a));
    const ohneFehlerbild = abschnitte
      .filter((a) => !/Woran du einen Fehler erkennst/.test(a))
      .map((a) => a.slice(0, 20));
    assert.deepEqual(ohneFehlerbild, [],
      `Diese Wege nennen nicht, woran man einen Fehler erkennt: ${ohneFehlerbild.join(", ")}. `
      + "Ein Weg ohne Fehlerbild prüft nichts — er bestätigt nur, dass eine Seite lädt.");
  });

  it("jede genannte Seite existiert", () => {
    const seiten = [...new Set((BUCH.match(/\/[a-z0-9_-]+\.html/g) || []))];
    assert.ok(seiten.length >= 15,
      `Nur ${seiten.length} Seiten im Regiebuch genannt, erwartet mindestens 15 — gemessen beim `
      + "Schreiben: 18. Werden es weniger, deckt das Buch weniger Fläche ab.");
    const fehlend = seiten.filter((s) => !fs.existsSync(path.join(ROOT, "frontend", "public", s)));
    assert.deepEqual(fehlend, [],
      `Diese Seiten gibt es nicht: ${fehlend.join(", ")}. Wer dem Weg folgt, bekommt 404 und `
      + "glaubt, er habe sich vertippt — dieselbe Klasse wie ein dokumentierter Befehl, der "
      + "nicht läuft.");
  });

  it("jedes genannte Konto wird von einer Saat angelegt", () => {
    const konten = [...new Set((BUCH.match(/[a-z0-9.-]+@(?:hanse\.)?probebuehne\.tempconnect\.de/g) || []))];
    assert.ok(konten.length >= 15,
      `Nur ${konten.length} Konten im Regiebuch genannt, erwartet mindestens 15 — die Besetzung `
      + "hat 18.");
    const saatText = fs.readdirSync(path.join(ROOT, "sql", "seeds"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(ROOT, "sql", "seeds", f), "utf8"))
      .join("\n");
    const fehlend = konten.filter((k) => !saatText.includes(k));
    assert.deepEqual(fehlend, [],
      `Diese Konten legt keine Saat an: ${fehlend.join(", ")}. Die Anmeldung scheitert dann, und `
      + "niemand weiß, ob das Konto fehlt oder das Passwort.");
  });

  it("der Weg für die Standortgrenze steht da — er war vor Y1.2 nicht herstellbar", () => {
    /* Der Grund, warum Welle U überhaupt vorführbar ist. Gemessen vor Y1.2: KEINE
       Organisation mit mehr als einem Standort UND mehr als einem Mitglied. */
    assert.match(BUCH, /## 3\. Die Standortgrenze/,
      "Der Weg für die Standortgrenze fehlt. Er ist der einzige, der vor Y1.2 nicht einmal "
      + "herstellbar war — ohne ihn bleibt Welle U unbelegt.");
    assert.match(BUCH, /standort\.hamburg@probebuehne\.tempconnect\.de/,
      "Der Weg nennt das standortgebundene Konto nicht");
    assert.match(BUCH, /Berlin und M(ü|ue)nchen d(ü|ue)rfen nicht erscheinen/,
      "Der Weg sagt nicht, was NICHT erscheinen darf. Genau das ist die Grenze: eine "
      + "Standortleitung Hamburg sieht Berlin nicht.");
  });

  it("KEIN Passwort im Regiebuch", () => {
    /* Ein Regiebuch, das Anmeldungen beschreibt, ist der naheliegendste Ort für
       ein Passwort — und wäre damit die Umgehung von Y6.3. */
    for (const wort of ["DemoPass2026!", "Demo2026!", "password123"]) {
      assert.ok(!BUCH.includes(wort),
        `Das Regiebuch nennt das Passwort '${wort}'. Es beschreibt Anmeldungen und ist damit der `
        + "naheliegendste Ort für ein Passwort im Repo — genau das verhindert Y6.3.");
    }
    const hashes = BUCH.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes, [], "Das Regiebuch trägt einen bcrypt-Hash");
    assert.match(BUCH, /steht \*\*nicht\*\* im Repo/,
      "Das Regiebuch sagt nicht, dass das Passwort nicht im Repo steht — dann sucht der Leser "
      + "danach, statt neu zu laden.");
  });

  it("jede genannte FLÄCHE wird wirklich ausgeliefert", () => {
    /* BEFUND 2026-10-02: Die Seitenprüfung oben greift nur Pfade mit `.html`.
     * Abschnitt 5 nennt aber drei VERZEICHNIS-Flächen — `/staff/`,
     * `/owner-control/`, `/support-ops/` — und die waren für diesen Wächter
     * unsichtbar. Er war grün, weil er nicht hinsah.
     *
     * Und ein Dateitest hätte hier NICHT geholfen: nur `/staff/` liegt als
     * Ordner in `frontend/public/`. `/owner-control/` und `/support-ops/` sind
     * Bau-Ergebnisse (gitignored) und existieren im Checkout gar nicht. Die
     * WAHRHEIT darüber, was unter einem Pfad ausgeliefert wird, steht in der
     * nginx-Konfiguration — also wird dort geprüft. Ein Regiebuch, das zu einer
     * Fläche schickt, die der Server nicht kennt, ist ein toter Weg, und tote
     * Wege sind der einzige Grund, warum Durchspiel-Anleitungen abgeschafft
     * werden. */
    /* Der Dateiname wird NICHT geraten. Erster Entwurf las
     * `nginx/default.conf` — die Datei heisst `nginx/nginx.conf`, der
     * readFileSync warf, und die Probe fiel OHNE lesbare Begruendung um. Eine
     * Probe, die an ihrem eigenen Pfad scheitert, sieht aus wie ein Befund und
     * ist keiner. */
    const konf = path.join(ROOT, "nginx", "nginx.conf");
    assert.ok(fs.existsSync(konf), `nginx-Konfiguration nicht gefunden: ${konf}`);
    const nginx = fs.readFileSync(konf, "utf8");
    const flaechen = [...new Set((BUCH.match(/`\/([a-z][a-z0-9-]+)\/`/g) || []))]
      .map((s) => s.replace(/[`/]/g, ""));
    assert.ok(flaechen.length >= 3,
      `Nur ${flaechen.length} Verzeichnis-Flächen im Regiebuch genannt, erwartet mindestens 3 `
      + "(Staff Control Center, Owner Control Center, Support Center)");
    /* `location /support-ops/\s*{` und nicht bloss `location /support-ops/`:
     * die Konfiguration hat fuer jede Flaeche AUCH einen Block fuer die
     * gehashten Buendel (`location /support-ops/assets/`). Der lose Ausdruck
     * nahm den als Beweis — eine Rueckmutation, die den Block der FLAECHE
     * umbenannte, blieb gruen, weil der Assets-Block noch passte. Dann waeren
     * die Buendel erreichbar und die Flaeche selbst nicht. */
    const fehlend = flaechen.filter((f) => !new RegExp("location\\s+/" + f + "/\\s*\\{").test(nginx));
    assert.deepEqual(fehlend, [],
      `Für diese Flächen gibt es keinen nginx-location-Block: ${fehlend.join(", ")}. `
      + "Das Regiebuch schickt einen Menschen auf einen Pfad, den der Server nicht kennt.");
  });

  it("der genannte Staff-Cookie-Name und die Fehlercodes sind echt", () => {
    /* Abschnitt 5 verspricht KONKRETES: ein eigenes Cookie `tc.staff.sid` und
     * drei Fehlercodes, an denen man einen Fehler erkennt. Ein Versprechen
     * dieser Art ist genau so lange wertvoll, wie es stimmt — wird ein Code
     * umbenannt, schickt das Regiebuch einen Menschen auf die Suche nach einer
     * Meldung, die es nicht mehr gibt, und er schließt daraus auf einen Fehler,
     * wo keiner ist. Also wird JEDER genannte Code im Quelltext nachgewiesen. */
    const app = fs.readFileSync(path.join(ROOT, "api", "app.js"), "utf8");
    const kekse = [...new Set((BUCH.match(/`tc\.[a-z.]+sid`/g) || []))].map((s) => s.replace(/`/g, ""));
    assert.ok(kekse.length >= 1, "das Regiebuch nennt keinen Cookie-Namen");
    const falsch = kekse.filter((k) => !app.includes(k));
    assert.deepEqual(falsch, [],
      `Diese Cookie-Namen stehen nicht in api/app.js: ${falsch.join(", ")}.`);

    /* `scripts/dev/seed-data.sh` gehoert in diese Liste, und zwar nicht als
     * Notnagel: das Regiebuch nennt `SEED_PASSWORT`, und das ist kein
     * Fehlercode, sondern eine Umgebungsvariable. Beides verdient dieselbe
     * Pruefung — eine umbenannte Variable schickt einen Leser genauso ins
     * Leere wie ein umbenannter Code. Der erste Entwurf klagte sie an, weil er
     * nur in den fuenf Code-Dateien suchte; die Antwort darauf ist die
     * richtige QUELLE, nicht eine Ausnahmeliste. */
    const quellen = ["api/middleware/staffControlAccess.js", "api/middleware/requireOwnerControlAccess.js",
      "api/config/staffRollen.js", "api/routes/staffControlCenter.js", "api/middleware/supportAccess.js",
      "api/services/rbacService.js", "scripts/dev/seed-data.sh"]
      .map((p) => fs.readFileSync(path.join(ROOT, p), "utf8"))
      /* Und die Saaten. Das Regiebuch nennt inzwischen auch, worauf eine
       * NOTBREMSE vergleicht (`CURRENT_DATE`) — das ist SQL und steht in keiner
       * .js-Datei. Die Antwort darauf ist die richtige QUELLE, nicht eine
       * Ausnahmeliste: eine Ausnahmeliste waechst, eine Quelle nicht. Dieselbe
       * Lehre wie bei `SEED_PASSWORT` eine Zeile weiter oben. */
      .concat(fs.readdirSync(path.join(ROOT, "sql", "seeds"))
        .filter((f) => f.endsWith(".sql"))
        .map((f) => fs.readFileSync(path.join(ROOT, "sql", "seeds", f), "utf8")))
      .join("\n");
    /* ZWEI PRAEZISIONEN, und beide kommen aus Rueckmutationen, die gruen blieben.
     *
     * 1. GESUCHT WIRD IN DER BACKTICK-SPANNE, NICHT ALS GANZE SPANNE. Der erste
     *    Ausdruck war /`([A-Z][A-Z_]{5,})`/ und verlangte damit, dass der Code
     *    die Spanne FUELLT. Das Regiebuch schreibt aber `428 SCC_STEP_UP_REQUIRED`
     *    — mit der Zahl davor in derselben Spanne. Der wichtigste Code im
     *    ganzen Abschnitt wurde deshalb GAR NICHT geprueft.
     *
     * 2. WORTGRENZEN. Ohne sie bestand `NUR_LESEN` die Pruefung, weil
     *    `NUR_LESEND` im Quelltext steht und die Teilzeichenkette enthaelt. Wer
     *    einen Namen irgendwo im Text sucht, kann einen gekuerzten Namen nie als
     *    falsch melden. */
    /* DATEINAMEN SIND KEINE CODES, und das war die Gegenprobe zur Erweiterung
     * oben: sobald in der ganzen Spanne gesucht wurde, klagte die Probe
     * `V_SCHNITTSTELLEN` und `UEBERGABE` an — beides Teile von
     * `docs/features/V_SCHNITTSTELLEN.md` und `docs/UEBERGABE.md`. Die werden
     * von der Verweis-Pruefung unten geprueft, und zwar als PFAD, was strenger
     * ist. Eine Spanne, die einen Pfad oder eine Datei nennt, gehoert also
     * dorthin und nicht hierher. */
    const spannen = (BUCH.match(/`[^`\n]+`/g) || [])
      .filter((s) => !/\/|\.(md|js|sql|sh|html|conf)\b/.test(s));
    const codes = [...new Set(spannen.flatMap((s) => s.match(/\b[A-Z][A-Z_]{5,}\b/g) || []))];
    assert.ok(codes.length >= 4,
      `Nur ${codes.length} Fehlercodes im Regiebuch genannt — ein Weg ohne nachprüfbares `
      + "Fehlerbild bestätigt nur, dass eine Seite lädt");
    const erfunden = codes.filter((c) => !new RegExp("\\b" + c + "\\b").test(quellen));
    assert.deepEqual(erfunden, [],
      `Diese Codes nennt das Regiebuch, der Quelltext kennt sie nicht: ${erfunden.join(", ")}.`);
  });

  it("der Verweis auf die Kreislauf-Quelle ist auflösbar", () => {
    /* Y5.2 im Plan nennt `V_SCHNITTSTELLEN.md` ohne Verzeichnis. Die Datei liegt
       unter `docs/features/`. Ein Verweis, der ein Verzeichnis zu kurz ist, kostet
       dieselbe Suchzeit wie ein ganz falscher. */
    const verweise = [...new Set((BUCH.match(/docs\/[\w./-]+\.md/g) || []))];
    assert.ok(verweise.length >= 2, `Nur ${verweise.length} Dokument-Verweise im Regiebuch`);
    const fehlend = verweise.filter((v) => !fs.existsSync(path.join(ROOT, v)));
    assert.deepEqual(fehlend, [],
      `Diese Dokumente gibt es nicht: ${fehlend.join(", ")}.`);
  });
});
