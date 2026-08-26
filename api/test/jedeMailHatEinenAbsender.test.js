import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mitRahmen, passwordResetEmail } from "../services/emailHtmlTemplates.js";
import { COMPANY } from "../config/company.js";

/*
 * 24 VON 40 E-MAILS GINGEN OHNE ABSENDER RAUS.
 *
 * BEFUND (2026-08-24, gezaehlt): 40 Stellen rufen `sendMail`; nur 16 gehen
 * durch eine Vorlage aus `emailHtmlTemplates.js`. Die uebrigen 24 bauen ihr
 * HTML am Aufrufort zusammen — und tragen damit keine Firmierung, keinen
 * Kontakt, gar nichts. Fuer Geschaeftsbriefe sind das Pflichtangaben, und
 * E-Mail zaehlt dazu (§ 37a HGB; fuer die geplante UG § 35a GmbHG).
 *
 * Die zweite Folge waere erst bei der Gruendung sichtbar geworden:
 * `COMPANY.name` ist ausdruecklich ein PLATZHALTER bis zur UG-Gruendung
 * (config/company.js). Wer durch den Rahmen geht, bekommt die neue Firmierung
 * automatisch; die 24 anderen haetten sie nie bekommen — und es waere niemandem
 * aufgefallen, weil eine Mail ohne Absender nicht falsch aussieht, sondern nur
 * unfertig.
 *
 * DIE LOESUNG SITZT AN DER EINEN STELLE, durch die jede Mail geht — nicht an
 * den 24 Aufrufern. Eine Aenderung an 24 Stellen schuetzt nicht vor der 25.
 * Dasselbe Prinzip wie beim Live-Push in `notifyWorker`.
 */

describe("Jede Mail traegt einen Absender", () => {
  it("eine handgebaute Mail bekommt Firmierung und Kontakt", () => {
    const roh = "<h2>Passwort zuruecksetzen</h2><p>Klicke hier.</p>";
    assert.ok(!roh.includes(COMPANY.name), "die Ausgangslage: kein Absender");

    const fertig = mitRahmen(roh, "Passwort zuruecksetzen");
    assert.ok(fertig.includes(COMPANY.name),
      "ohne Firmierung ist es kein Geschaeftsbrief, sondern eine anonyme Nachricht");
    assert.ok(fertig.includes(COMPANY.supportEmail),
      "und ohne Kontakt weiss der Empfaenger nicht, an wen er sich wendet");
    assert.match(fertig, /^<!DOCTYPE/i);
  });

  it("die Firmierung kommt aus der Config, nicht aus dem Text", () => {
    /* Der Punkt der ganzen Uebung: `COMPANY.name` wird bei der UG-Gruendung
     * EINMAL geaendert. Wer den Namen im Text stehen hat, aendert ihn nie. */
    const fertig = mitRahmen("<p>x</p>", "x");
    assert.ok(fertig.includes(COMPANY.name));
    assert.equal(COMPANY.isPlaceholder, true,
      "Solange das true ist, ist der Name noch nicht final — genau deshalb darf " +
      "ihn niemand abschreiben. Wird es false, gehoert diese Zusicherung angepasst, " +
      "nicht geloescht.");
  });

  it("eine Vorlage wird NICHT ein zweites Mal eingepackt", () => {
    /* Sonst haette die Mail zwei Fuesse und zwei DOCTYPEs — und in manchen
     * Mail-Programmen gar keinen Inhalt mehr. */
    const vorlage = passwordResetEmail({ resetUrl: "https://x/y", userName: "Ada", expiresInMinutes: 60 });
    assert.equal(mitRahmen(vorlage, "x"), vorlage, "unveraendert durchreichen");
    assert.equal((mitRahmen(vorlage, "x").match(/<!DOCTYPE/gi) || []).length, 1);
  });

  it("auch ein blosses <html> ohne DOCTYPE gilt als fertig", () => {
    const fremd = "<html><body><p>von woanders</p></body></html>";
    assert.equal(mitRahmen(fremd, "x"), fremd);
  });

  it("leeres oder fehlendes HTML bringt den Versand nicht um", () => {
    for (const eingabe of [undefined, null, ""]) {
      const r = mitRahmen(eingabe, "x");
      assert.equal(typeof r, "string");
      assert.ok(r.includes(COMPANY.name), "auch eine leere Mail traegt den Absender");
    }
  });
});

describe("Der Engpass — sie geht durch EINE Stelle, nicht durch 24", () => {
  const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

  it("der sendMail-Adapter rahmt ein", () => {
    assert.match(app, /html: mitRahmen\(html, subject\)/,
      "Der Rahmen gehoert in den Adapter. An den 24 Aufrufern waere er eine " +
      "Sorgfalt, die man vergessen kann — und die 25. Mail haette wieder keinen " +
      "Absender.");
  });

  it("S: die Probe wuerde die alte, ungerahmte Fassung bemerken", () => {
    const alt = "await mailTransport.sendMail({ from: SMTP_FROM, to, subject, html });";
    assert.ok(!/mitRahmen/.test(alt),
      "die alte Fassung reichte das HTML unveraendert durch — genau das prueft die Probe darueber");
  });
});

/*
 * ES WAREN ZWEI ENGPAESSE, NICHT EINER (gefunden 2026-08-26).
 *
 * Der Abschnitt darueber prueft `app.js`. Genau daneben liegt der zweite
 * Versandweg: `services/emailService.js`, benutzt vom BullMQ-Email-Worker,
 * von `orgControlCenter.js` und von `workerSubmissionService.js`. Er reichte
 * das HTML unveraendert durch — "jede Mail traegt einen Absender" galt also
 * fuer die Mails aus dem einen Engpass, nicht fuer alle.
 *
 * Aufgefallen ist es beim Anschluss des Arbeiter-Meldewegs (I3, Stufe 1), der
 * ueber die Warteschlange geht und damit durch den zweiten Weg.
 *
 * DESHALB ZAEHLT DIESE PROBE NICHT AUF, SONDERN SUCHT: sie findet jeden echten
 * Versandaufruf im Quelltext und verlangt, dass er rahmt. Ein dritter Weg macht
 * sie rot, statt still danebenzustehen — dieselbe Umkehr wie bei der
 * Ansprechperson.
 */
describe("Jeder Versandweg rahmt — auch ein spaeter dazugekommener", () => {
  const WURZEL = new URL("../", import.meta.url);

  /** Alle .js unter api/, ohne Tests und Fremdcode. */
  function quelldateien(verzeichnis) {
    const gefunden = [];
    for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
      const name = eintrag.name;
      if (name === "node_modules" || name === "test" || name === ".git") continue;
      const pfad = new URL(name + (eintrag.isDirectory() ? "/" : ""), verzeichnis);
      if (eintrag.isDirectory()) gefunden.push(...quelldateien(pfad));
      else if (name.endsWith(".js")) gefunden.push(pfad);
    }
    return gefunden;
  }

  it("jeder Aufruf von <transport>.sendMail reicht das HTML durch mitRahmen", () => {
    const dateien = quelldateien(WURZEL);
    assert.ok(dateien.length > 50,
      `nur ${dateien.length} Quelldateien gefunden — greift die Suche noch? ` +
      "Ohne Treffer prueft diese Probe nichts und waere trotzdem gruen.");

    const muster = /(?:transporter|mailTransport|transport)\.sendMail\(/g;
    const ungerahmt = [];
    let versandstellen = 0;

    for (const datei of dateien) {
      const quelle = fs.readFileSync(datei, "utf8");
      for (const treffer of quelle.matchAll(muster)) {
        versandstellen += 1;
        /* Der Aufruf selbst plus sein Argument-Objekt — grosszuegig gefasst,
         * damit ein mehrzeiliges Objekt vollstaendig darin liegt. */
        const abschnitt = quelle.slice(treffer.index, treffer.index + 400);
        if (!/mitRahmen\(/.test(abschnitt)) {
          ungarbeit(ungerahmt, datei, quelle, treffer.index);
        }
      }
    }

    assert.ok(versandstellen >= 2,
      `nur ${versandstellen} Versandstelle(n) gefunden — wurde umbenannt? ` +
      "Am 2026-08-26 waren es zwei: app.js und services/emailService.js.");
    assert.deepEqual(ungerahmt, [],
      "Ein Versandweg reicht das HTML ungerahmt durch. Fuer Geschaeftsbriefe " +
      "sind Firmierung und Kontakt Pflichtangaben (§ 37a HGB) — und der Weg, " +
      "den man vergisst, ist immer der, den ein neuer Aufrufer nimmt.");
  });

  /** Dateiname:Zeile fuer die Fehlermeldung — ohne Escape-Sequenzen, die auf
   *  dem Weg hierher schon einmal zu echten Umbruechen geworden sind. */
  /* Dateiname:Zeile fuer die Fehlermeldung. BEWUSST OHNE BACKSLASH: der
   * Ersatz-Text musste zweimal durch Werkzeuge, und beide Male wurde aus
   * einem maskierten Zeilenumbruch ein echter. String.fromCharCode(10) geht
   * durch jede Kette unbeschadet. */
  function ungarbeit(sammler, datei, quelle, index) {
    const umbruch = String.fromCharCode(10);
    const zeile = quelle.slice(0, index).split(umbruch).length;
    sammler.push(String(datei).split("/api/").pop() + ":" + zeile);
  }
});

describe("Der Fussbereich liest die Config, statt sie abzuschreiben", () => {
  const vorlagen = fs.readFileSync(
    new URL("../services/emailHtmlTemplates.js", import.meta.url), "utf8");

  it("die Support-Adresse steht nicht mehr woertlich im Fuss", () => {
    /* Sie stand fest verdrahtet direkt neben `COMPANY.supportEmail` — dieselbe
     * Angabe an zwei Stellen, von denen nur eine gepflegt wird. */
    const fussStart = vorlagen.indexOf("<!-- Footer -->");
    const fuss = vorlagen.slice(fussStart, fussStart + 700);
    assert.ok(!/mailto:support@tempconnect\.de/.test(fuss),
      "die Adresse gehoert aus der Config, nicht in den Text");
    assert.match(fuss, /COMPANY\.supportEmail/);
  });
});
