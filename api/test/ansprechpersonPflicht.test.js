import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/*
 * DIE ANSPRECHPERSON AM ANGEBOT (Plan I, 10b).
 *
 * Owner-Entscheid 2026-08-23: Pflichtfeld mit Rueckfall auf das Profil.
 *
 * Der Grund steht im Plan und ist kein technischer: "Wer morgens um sechs vor
 * einer leeren Schicht steht, schreibt keine Nachricht." Statt einen
 * Nachrichtenkanal zu bauen, der Erwartungen an TempConnect erzeugt
 * (Zustellung, Aufbewahrung, Moderation, DSGVO-Auskunft ueber fremde
 * Gespraeche), tragen beide Seiten eine erreichbare Person.
 *
 * BESTAND, GEMESSEN am 2026-08-22:
 *   * `contact_name`/`contact_phone` stehen seit Migration 014 auf `offers` —
 *     und sind bei 0 von 38 Angeboten gefuellt.
 *   * Nur 7 von 361 Konten haben ueberhaupt Name UND Nummer im Profil.
 *   * Von 21 Anbietern mit Angeboten hat genau EINER beides.
 *
 * Eine harte Pflicht ab sofort haette 20 von 21 Anbietern am Abschluss
 * gehindert. Deshalb der Rueckfall — und deshalb trifft die Pflicht nur den,
 * der auch handeln kann.
 */

const quelle = fs.readFileSync(new URL("../routes/marketplace.js", import.meta.url), "utf8");

/** Schneidet den Rumpf einer Route heraus, damit Zusicherungen nicht an der falschen haengen. */
function route(pfad) {
  const i = quelle.indexOf(`router.post("${pfad}"`);
  assert.ok(i >= 0, `Route ${pfad} nicht gefunden — greift das Muster noch?`);
  const naechste = quelle.indexOf('router.post("', i + 10);
  return quelle.slice(i, naechste > 0 ? naechste : quelle.length);
}

/* Die Einteilung der Wege — auf Modulebene, damit auch die Vollzaehligkeits-
 * probe weiter unten sie sieht. Wer hier etwas ergaenzt, trifft eine
 * Entscheidung: sperren oder nur fuellen. */
const anbieterHandelt = [
  "/marketplace/demand-requests/:id/offers",
  "/marketplace/demand-requests/:id/accept-deal",
  "/marketplace/demand-requests/:id/negotiate-deal",
];
const kaeuferHandelt = [
  "/marketplace/capacity-posts/:id/accept-deal",
  "/marketplace/capacity-posts/:id/negotiate-deal",
];

describe("Ansprechperson — die Pflicht trifft den, der handeln kann", () => {
  /*
   * Fuenf Wege legen ein Angebot an. Bei DREIEN handelt der Anbieter selbst
   * (`supplier_company_id = req.session.userId`) — dort gilt die Pflicht. Bei
   * ZWEIEN handelt der Kaeufer und der Anbieter ist die Gegenseite
   * (`supplier_company_id = cap.supplier_company_id`) — dort wird nur aus dem
   * Profil gefuellt.
   */


  it("wo der ANBIETER handelt, wird ohne Ansprechperson abgewiesen", () => {
    for (const pfad of anbieterHandelt) {
      const rumpf = route(pfad);
      assert.match(rumpf, /kontakt\.fehlt/,
        `${pfad}: hier handelt der Anbieter, also muss die Pflicht greifen`);
      assert.match(rumpf, /ansprechpersonFehltAntwort\(res, kontakt\)/,
        `${pfad}: die Aufforderung zum Nachtragen fehlt`);
    }
  });

  it("wo der KAEUFER handelt, wird NICHT blockiert", () => {
    for (const pfad of kaeuferHandelt) {
      const rumpf = route(pfad);
      assert.match(rumpf, /ansprechperson\(client, cap\.supplier_company_id\)/,
        `${pfad}: die Ansprechperson muss aus dem Profil des ANBIETERS kommen`);
      assert.ok(!/kontakt\.fehlt/.test(rumpf),
        `${pfad}: Den Kaeufer abzuweisen, weil ein ANDERER sein Profil nicht gepflegt hat, ` +
        "waere die falsche Adresse. Der Anbieter wird gefragt, sobald er selbst handelt.");
    }
  });

  it("jeder der fuenf Wege schreibt die Spalten ueberhaupt", () => {
    /* Sonst bleibt das Feld leer, egal wie oft man es verlangt — genau der
     * Zustand von vorher: die Spalten gab es seit Migration 014, gefuellt
     * waren sie bei 0 von 38 Angeboten. */
    const ohne = [];
    for (const pfad of [ ...anbieterHandelt, ...kaeuferHandelt ]) {
      const rumpf = route(pfad);
      const schreibtDirekt = /contact_name, contact_phone/.test(rumpf);
      const ueberDenDienst = /createOffer\(pool[\s\S]{0,200}?contact_name:/.test(rumpf);
      if (!schreibtDirekt && !ueberDenDienst) ohne.push(pfad);
    }
    assert.deepEqual(ohne, []);
  });
});

describe("Ansprechperson — kein Weg darf sich an der Einteilung vorbeischleichen", () => {
  /*
   * DER WURZELFIX ZUM BEFUND VOM 26.08.
   *
   * Die Proben oben ZAEHLEN Wege aus zwei festen Listen. Das genuegt genau so
   * lange, wie niemand einen neuen Weg baut. Am 23.08. kam mit der
   * Richtungskorrektur die Bedarfs-Anlage als SECHSTER Weg dazu — sie trat
   * keiner Liste bei, also prüfte sie niemand, und drei Tage lang wies sie
   * 18 von 19 aktiven Firmen ab, waehrend das Gate gruen blieb.
   *
   * Eine Aufzaehlung kann das nie fangen: sie weiss nur von dem, was jemand
   * hineingeschrieben hat. Deshalb dreht diese Probe die Richtung um — sie
   * ENTDECKT alle Aufrufstellen im Quelltext und verlangt, dass jede in genau
   * einer Schublade liegt. Ein siebter Weg macht sie rot, bis jemand
   * entscheidet: sperrt er, oder fuellt er nur?
   *
   * Dasselbe Muster wie die Ratschen-Register des Projekts (`wachen.json`,
   * `orgGrenzen.json`): nicht "ist die Liste abgearbeitet", sondern "kennt die
   * Liste alles, was es gibt".
   */
  it("jede Aufrufstelle von ansprechperson() ist eingeteilt", () => {
    const bekannt = new Set([ ...anbieterHandelt, ...kaeuferHandelt, "/marketplace/demand-requests" ]);

    /* Alle POST-Routen samt Rumpf einsammeln — dieselbe Zerlegung wie route(),
     * nur ueber die ganze Datei statt fuer einen bekannten Pfad. */
    const gefunden = [];
    const muster = /router\.post\("([^"]+)"/g;
    const treffer = [ ...quelle.matchAll(muster) ];
    assert.ok(treffer.length > 5,
      "keine POST-Routen gefunden — greift das Muster noch? Ohne Treffer prueft " +
      "diese Probe nichts und waere trotzdem gruen.");

    for (let i = 0; i < treffer.length; i++) {
      const start = treffer[i].index;
      const ende = i + 1 < treffer.length ? treffer[i + 1].index : quelle.length;
      const rumpf = quelle.slice(start, ende);
      if (/\bansprechperson\(/.test(rumpf)) gefunden.push(treffer[i][1]);
    }

    assert.ok(gefunden.length > 0, "kein einziger Aufruf gefunden — wurde der Helfer umbenannt?");

    const unbekannt = gefunden.filter((pfad) => !bekannt.has(pfad));
    assert.deepEqual(unbekannt, [],
      "Ein neuer Weg fragt nach der Ansprechperson, ohne in einer der Listen zu stehen. " +
      "Er muss eingeteilt werden: SPERRT er (der Anbieter handelt selbst und kann die " +
      "Angabe nachtragen) oder FUELLT er nur (ein anderer handelt — ihn abzuweisen " +
      "waere die falsche Adresse)? Genau diese Entscheidung wurde am 23.08. nicht " +
      "getroffen, und die Bedarfs-Anlage sperrte drei Tage lang 18 von 19 aktiven Firmen.");
  });

  it("die Einteilung selbst ist ueberschneidungsfrei", () => {
    /* Ein Pfad in beiden Listen wuerde beide Proben oben gleichzeitig erfuellen
     * muessen — sperren UND nicht sperren. Das faellt sonst erst auf, wenn eine
     * der beiden aus einem ganz anderen Grund rot wird. */
    const doppelt = anbieterHandelt.filter((pfad) => kaeuferHandelt.includes(pfad));
    assert.deepEqual(doppelt, []);
  });
});

describe("Ansprechperson — die Bedarfsseite fuellt, sie sperrt nicht", () => {
  /*
   * DER SECHSTE WEG, den die Liste oben nicht kannte.
   *
   * Die Richtungskorrektur vom 23.08. (`3ccf075`) stellte fest, dass
   * `offers.contact_name` dem ANBIETER gehoert, die Live-Belegschaft aber die
   * Flaeche des Anbieters ist — die Agentur sah ihre eigene Nummer. Migration
   * 192 legte darum `contact_name`/`contact_phone` auf `demand_requests`, und
   * die Bedarfs-Anlage bekam denselben Riegel wie ein Angebot.
   *
   * Das war falsch, und drei Tage lang sah es niemand: Die Liste oben zaehlt
   * FUENF Angebots-Wege, dieser sechste stand in keiner. Das Gate blieb gruen.
   *
   * AM ECHTEN BESTAND GEMESSEN (2026-08-26, laufende Datenbank):
   *   * 22 Firmen haben je einen Bedarf angelegt — 18 davon ohne Telefon.
   *   * Von den 19 in 90 Tagen aktiven Firmen waren 18 gesperrt.
   *   * 38 der 39 vorhandenen Bedarfe tragen ohnehin keine Ansprechperson.
   *   * Das Formular bot bis zum 26.08. gar kein Feld dafuer an — der Riegel
   *     war fuer den Kunden UNAUFLOESBAR.
   *
   * Gefunden hat es der Integrationslauf gegen die echte Datenbank
   * (`offer.counterpartyFirst.flow.test.js`), nicht die Mock-Suite: ein Mock
   * kennt keine 22 Firmen ohne Telefonnummer.
   *
   * Die Regel dahinter steht schon im Plan und gilt hier genauso: die Pflicht
   * trifft nur den, der handeln kann. Beim Bedarf handelt der KAEUFER; sperrt
   * man ihn, sperrt man die Kernhandlung der Plattform an ihrer breitesten
   * Stelle. Die Pflicht bleibt beim ANBIETER (die drei Wege oben) — bevor
   * jemand tatsaechlich vor Ort steht, ist eine Nummer hinterlegt.
   */
  const BEDARF = "/marketplace/demand-requests";

  it("der Bedarf wird NICHT wegen fehlender Ansprechperson abgewiesen", () => {
    const rumpf = route(BEDARF);
    /* Laengenpruefung VOR der verneinenden Zusicherung: auf einem leeren String
     * besteht jedes `!test()` — und dann prueft dieser Test nichts. */
    assert.ok(rumpf.length > 500,
      "der Routenrumpf wurde nicht gefunden; ohne ihn ist die Zusicherung darunter wertlos");
    assert.ok(!/ansprechpersonFehltAntwort/.test(rumpf),
      "Die Bedarfs-Anlage darf nicht am fehlenden Telefon scheitern: gemessen waeren " +
      "18 von 19 aktiven Firmen gesperrt, und das Formular bot lange kein Feld zum " +
      "Nachtragen. Sperren erzeugt die Nummer nicht — es haelt nur die Arbeit an.");
  });

  it("die Ansprechperson wird trotzdem uebernommen, wenn es sie gibt", () => {
    /* Sonst waere die Korrektur ein Rueckschritt: Migration 192 haette Spalten
     * angelegt, die nie etwas sehen — genau der Zustand, den 10b beheben sollte. */
    const rumpf = route(BEDARF);
    assert.match(rumpf, /const kontakt = await ansprechperson\(pool, req\.session\.userId, parsed\.data\)/,
      "der Helfer muss weiter laufen, sonst bleibt die Spalte leer");
    assert.match(rumpf, /contact_name: kontakt\.name/);
    assert.match(rumpf, /contact_phone: kontakt\.telefon/);
  });

  it("das Formular bietet die Felder ueberhaupt an", () => {
    /* Der eigentliche Defekt war nicht der Riegel allein, sondern der Riegel
     * OHNE Feld. Eine Pflicht, die der Betroffene nicht erfuellen kann, ist
     * eine Sackgasse — dieselbe Klasse wie ein toter Knopf. */
    const formular = fs.readFileSync(
      new URL("../../frontend/public/marketplace_demand_create.html", import.meta.url), "utf8");
    assert.match(formular, /id="contact_name"/,
      "ohne Eingabefeld kann die Kundenseite die Nummer nie liefern");
    assert.match(formular, /id="contact_phone"/);
    assert.match(formular, /contact_name: document\.getElementById\("contact_name"\)\.value\.trim\(\) \|\| null/,
      "ein leerer String statt null wuerde den Rueckfall aufs Profil ueberschreiben");
  });
});

describe("Ansprechperson — der Rueckfall aufs Profil", () => {
  it("ausdrueckliche Angabe geht vor dem Profil", () => {
    const helfer = quelle.match(/async function ansprechperson[\s\S]*?\n\}/);
    assert.ok(helfer, "der Helfer wurde nicht gefunden");
    assert.ok(helfer[0].indexOf("body?.contact_name") < helfer[0].indexOf("FROM users"),
      "wer die Angabe am Angebot macht, soll nicht vom Profil ueberschrieben werden");
  });

  it("das Profil liefert beide Felder einzeln — nicht alles oder nichts", () => {
    const helfer = quelle.match(/async function ansprechperson[\s\S]*?\n\}/)[0];
    assert.match(helfer, /ausBody\.name \|\| ausProfil\.name/,
      "Name aus dem Angebot, Nummer aus dem Profil muss eine gueltige Mischung sein");
    assert.match(helfer, /ausBody\.telefon \|\| ausProfil\.telefon/);
  });

  it("Leerzeichen zaehlen nicht als Angabe", () => {
    const helfer = quelle.match(/async function ansprechperson[\s\S]*?\n\}/)[0];
    assert.match(helfer, /NULLIF\(TRIM\(COALESCE\(contact_person, ''\)\), ''\)/,
      "ein Profilfeld mit einem Leerzeichen ist keine Ansprechperson");
    assert.match(helfer, /String\(body\?\.contact_name \|\| ""\)\.trim\(\)/);
  });

  it("eine kaputte Profilabfrage gilt als FEHLEND, nicht als vorhanden", () => {
    const helfer = quelle.match(/async function ansprechperson[\s\S]*?\n\}/)[0];
    assert.match(helfer, /catch \{[\s\S]{0,200}?ausProfil = \{\};/,
      "Fail-closed im Ergebnis: ein Datenbankfehler darf nicht dazu fuehren, dass ein " +
      "Angebot ohne Ansprechperson durchgeht.");
  });

  it("die Aufforderung sagt, WAS fehlt und WO man es hinterlegt", () => {
    const antwort = quelle.match(/function ansprechpersonFehltAntwort[\s\S]*?\n\}/)[0];
    assert.match(antwort, /CONTACT_REQUIRED/);
    assert.match(antwort, /contact_name: kontakt\.fehltName === true/,
      "der Anbieter muss sehen, ob Name oder Nummer fehlt — sonst raet er");
    assert.match(antwort, /contact_phone: kontakt\.fehltTelefon === true/);
    assert.match(antwort, /Profil hinterlegen oder direkt am Angebot angeben/,
      "eine Fehlermeldung ohne den Weg heraus ist eine Sackgasse");
  });

  it("es gibt genau EINE Aufforderung, nicht fuenf", () => {
    /* Fuenf Wege, fuenf Texte waeren fuenf Formulierungen, die auseinanderlaufen
     * — dieselbe Falle wie bei der Einladungsmail und dem Grund-Vokabular. */
    const stellen = [ ...quelle.matchAll(/CONTACT_REQUIRED/g) ];
    assert.equal(stellen.length, 1);
  });
});

describe("Ansprechperson — das Schema bleibt bewusst weich", () => {
  it("`contact_name` ist im Zod-Schema weiterhin optional", () => {
    assert.match(quelle, /contact_name: z\.string\(\)\.max\(200\)\.optional\(\)\.nullable\(\)/,
      "Sie hier zur Pflicht zu machen wuerde den Rueckfall unmoeglich machen: wer sie im " +
      "Profil gepflegt hat, muesste sie bei JEDEM Angebot erneut tippen. Die Pflicht setzt " +
      "die Route durch, nicht das Schema.");
  });

  it("und der Grund steht daneben", () => {
    assert.match(quelle, /Bleiben optional — die Pflicht setzt die ROUTE durch/,
      "sonst 'repariert' der naechste Leser das vermeintlich vergessene .min(1)");
  });
});
