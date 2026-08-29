/**
 * Waechter ueber die Binaerdateien, ohne die kein Beleg entsteht.
 *
 * Drei Dateien unter api/assets/pdfa entscheiden ueber jede erzeugte Rechnung:
 * zwei Schriften und ein Farbprofil. Fehlt eine, wirft der Renderer schon beim
 * Modulladen. Wird eine still ausgetauscht, aendert sich entweder das Aussehen
 * jeder Rechnung oder die PDF/A-Konformitaet bricht — beides ohne dass jemand
 * es merkt.
 *
 * Deshalb sind die Pruefsummen hier festgenagelt. Ein Austausch laesst diesen
 * Test rot werden. Das ist Absicht: er soll bewusst geschehen, nicht
 * versehentlich.
 *
 * Der zweite Zweck: die Dateien muessen im AUSGELIEFERTEN ABBILD ankommen.
 * api/.dockerignore schliesst test/, scripts/ und *.md aus — dort abgelegt
 * kaemen sie nie in Produktion, und weil der api-Dienst keinen Bind-Mount hat,
 * faellt das erst im Betrieb auf. Der Test prueft die .dockerignore mit.
 *
 * Run: node --test --test-force-exit test/pdfaAssets.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pruefeIccProfil } from "../services/pdfa/index.js";

/* Relativ zur TESTDATEI, nicht zu process.cwd(): sonst haengt es vom
   Startverzeichnis ab, ob dieser Test etwas prueft oder still durchlaeuft
   (CLAUDE.md §0.9). */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.join(HIER, "..");
const ASSETS = path.join(API, "assets", "pdfa");

/* Die Werte stammen aus dem Download vom 2026-08-29 und stehen zusaetzlich in
   assets/pdfa/HERKUNFT.txt. Zwei Orte, damit ein Austausch an beiden
   vorbeimuesste. */
const DATEIEN = [
  {
    name: "LiberationSans-Regular.ttf",
    sha256: "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8",
    mindestens: 300000,
  },
  {
    name: "LiberationSans-Bold.ttf",
    sha256: "788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173",
    mindestens: 300000,
  },
  {
    name: "sRGB-v2-micro.icc",
    sha256: "0a8a33aea66a6f154a5642ebe168ef287e73265d9f7b51c42a45e6eedbacda7a",
    mindestens: 400,
  },
];

const LIZENZEN = ["LIBERATION-LICENSE.txt", "ICC-LICENSE-CC0.txt", "HERKUNFT.txt"];

describe("Die PDF/A-Bausteine liegen da, wo sie hingehoeren", () => {
  it("alle drei Binaerdateien existieren", () => {
    for (const d of DATEIEN) {
      const p = path.join(ASSETS, d.name);
      assert.ok(fs.existsSync(p), `${d.name} fehlt — ohne sie entsteht keine Rechnung`);
      assert.ok(fs.statSync(p).size >= d.mindestens,
        `${d.name} ist verdaechtig klein (${fs.statSync(p).size} Byte) — vermutlich eine Fehlerseite statt der Datei`);
    }
  });

  it("die Pruefsummen stimmen", () => {
    /* Faengt den stillen Austausch. Eine andere Schrift aendert das Aussehen
       jeder Rechnung; ein anderes Farbprofil kann die Konformitaet brechen. */
    for (const d of DATEIEN) {
      const ist = crypto.createHash("sha256").update(fs.readFileSync(path.join(ASSETS, d.name))).digest("hex");
      assert.equal(ist, d.sha256,
        `${d.name} ist nicht mehr die Datei von 2026-08-29. Wenn das Absicht war: ` +
        `Pruefsumme hier UND in assets/pdfa/HERKUNFT.txt anpassen und "npm run test:pdfa" laufen lassen.`);
    }
  });

  it("die Lizenzen liegen bei", () => {
    /* Die SIL OFL verlangt, dass die Lizenz mitgeliefert wird. Das Repo ist
       oeffentlich — das ist keine Formalie, sondern die Bedingung, unter der
       die Schrift ueberhaupt weitergegeben werden darf. */
    for (const l of LIZENZEN) {
      const p = path.join(ASSETS, l);
      assert.ok(fs.existsSync(p), `${l} fehlt`);
      assert.ok(fs.statSync(p).size > 100, `${l} ist zu kurz, um eine echte Lizenz zu sein`);
    }
    const ofl = fs.readFileSync(path.join(ASSETS, "LIBERATION-LICENSE.txt"), "utf8");
    assert.match(ofl, /SIL Open Font License/i, "das ist nicht die OFL");
    const cc0 = fs.readFileSync(path.join(ASSETS, "ICC-LICENSE-CC0.txt"), "utf8");
    assert.match(cc0, /CC0 1\.0/i, "das ist nicht die CC0-Lizenz");
  });

  it("die Herkunft ist dokumentiert, mit Pruefsummen", () => {
    const h = fs.readFileSync(path.join(ASSETS, "HERKUNFT.txt"), "utf8");
    for (const d of DATEIEN) {
      assert.ok(h.includes(d.sha256),
        `die Pruefsumme von ${d.name} fehlt in HERKUNFT.txt — dann steht sie nur an einer Stelle`);
    }
    assert.match(h, /liberationfonts/, "die Herkunfts-URL der Schriften fehlt");
    assert.match(h, /Compact-ICC-Profiles/, "die Herkunfts-URL des Farbprofils fehlt");
  });
});

describe("Das Farbprofil taugt fuer einen OutputIntent", () => {
  it("erfuellt die veraPDF-Anforderung 6.2.3-1", () => {
    /* Der Punkt, den der Bauplan als unbestaetigt markiert hatte: ob ein
       456-Byte-Kompaktprofil die verlangte Device Class traegt. Hier wird es
       gegen die echte Datei geprueft, nicht gegen eine Beschreibung. */
    const b = fs.readFileSync(path.join(ASSETS, "sRGB-v2-micro.icc"));
    const r = pruefeIccProfil(b);
    assert.equal(r.ok, true, `Profil untauglich: ${r.fehler}`);
    assert.ok(["mntr", "prtr"].includes(r.deviceClass), `Device Class ${r.deviceClass} ist nicht zulaessig`);
    assert.ok(["RGB ", "CMYK", "GRAY"].includes(r.colorSpace), `Farbraum ${r.colorSpace} ist nicht zulaessig`);
    assert.ok(Number(r.version) < 5, `ICC-Fassung ${r.version} ist zu neu`);
  });

  it("die Groesse im Kopf stimmt mit der Datei ueberein", () => {
    /* Ein abgeschnittener Download hat einen gueltigen Kopf und einen falschen
       Rest — die Signatur allein faengt das nicht. */
    const b = fs.readFileSync(path.join(ASSETS, "sRGB-v2-micro.icc"));
    assert.equal(b.readUInt32BE(0), b.length,
      "die im ICC-Kopf angegebene Groesse passt nicht zur Datei");
  });
});

describe("Die Dateien kommen im ausgelieferten Abbild an", () => {
  it("keine Regel in .dockerignore schliesst assets/ aus", () => {
    /* Der teuerste denkbare Fehler dieser Welle: alles gruen, und in
       Produktion wirft der Dienst beim ersten Rechnungsdruck, weil die Schrift
       nie ins Abbild kam. Der api-Dienst hat in docker-compose.prod.yml keinen
       Bind-Mount — es faellt erst im Betrieb auf. */
    const p = path.join(API, ".dockerignore");
    if (!fs.existsSync(p)) return;   // keine Datei, kein Ausschluss
    const zeilen = fs.readFileSync(p, "utf8")
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter((z) => z && !z.startsWith("#"));
    const gefaehrlich = zeilen.filter((z) => {
      const ohneNegation = z.replace(/^!/, "");
      if (z.startsWith("!")) return false;   // Ausnahmen schliessen nichts aus
      return /^assets\b/.test(ohneNegation) ||
        ohneNegation === "*" ||
        /\.ttf$/.test(ohneNegation) ||
        /\.icc$/.test(ohneNegation) ||
        /\.txt$/.test(ohneNegation);
    });
    assert.deepEqual(gefaehrlich, [],
      `diese Zeilen in api/.dockerignore wuerden die PDF/A-Bausteine aus dem Abbild halten: ${gefaehrlich.join(", ")}`);
  });

  it("das Dockerfile kopiert das Verzeichnis mit", () => {
    const d = fs.readFileSync(path.join(API, "Dockerfile"), "utf8");
    /* "COPY . ." nimmt assets/ mit. Wuerde jemand auf selektive COPY-Zeilen
       umstellen, muesste assets/ ausdruecklich dabei sein. */
    const kopiertAlles = /^\s*COPY\s+\.\s+\.\s*$/m.test(d);
    const kopiertAssets = /^\s*COPY\s+.*assets/m.test(d);
    assert.ok(kopiertAlles || kopiertAssets,
      "das Dockerfile kopiert weder alles noch assets/ ausdruecklich — die Schriften fehlten im Abbild");
  });

  it("der Renderer loest den Pfad ueber import.meta.url auf", () => {
    /* Ueber process.cwd() aufgeloest haengt es vom Startverzeichnis ab, ob
       eine Rechnung entsteht. Im Container startet der Dienst woanders als im
       Testlauf. */
    const q = fs.readFileSync(path.join(API, "services", "operationalInvoicePdfService.js"), "utf8");
    assert.match(q, /import\.meta\.url/, "der Assets-Pfad haengt am Startverzeichnis");
    /* Kommentarzeilen ausnehmen: die Datei ERKLAERT, warum sie process.cwd()
       nicht benutzt — eine Suche im rohen Text traefe genau diese Erklaerung
       und meldete den Fehler, den der Kommentar verhindert. Genau so ist
       dieser Test beim ersten Lauf rot geworden. */
    const codeZeilen = q
      .split(/\r?\n/)
      .filter((z) => {
        const t = z.trim();
        return t && !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
      })
      .join("\n");
    assert.ok(!/process\.cwd\(\)/.test(codeZeilen),
      "process.cwd() im Renderer-Code — das bricht je nach Startverzeichnis");
  });
});
