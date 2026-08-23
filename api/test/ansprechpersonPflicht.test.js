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

describe("Ansprechperson — die Pflicht trifft den, der handeln kann", () => {
  /*
   * Fuenf Wege legen ein Angebot an. Bei DREIEN handelt der Anbieter selbst
   * (`supplier_company_id = req.session.userId`) — dort gilt die Pflicht. Bei
   * ZWEIEN handelt der Kaeufer und der Anbieter ist die Gegenseite
   * (`supplier_company_id = cap.supplier_company_id`) — dort wird nur aus dem
   * Profil gefuellt.
   */

  const anbieterHandelt = [
    "/marketplace/demand-requests/:id/offers",
    "/marketplace/demand-requests/:id/accept-deal",
    "/marketplace/demand-requests/:id/negotiate-deal",
  ];
  const kaeuferHandelt = [
    "/marketplace/capacity-posts/:id/accept-deal",
    "/marketplace/capacity-posts/:id/negotiate-deal",
  ];

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
