/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZWÖLF LEGALE ZUSTÄNDE HATTEN KEIN BEISPIEL (Y1.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Plan verlangt vier Sonderzustände. Gemessen am 2026-10-01 waren es
 * ZWÖLF: so viele legale Zustände hatten in **2940 Organisationen und 344
 * Abonnements** kein einziges Beispiel.
 *
 *   organizations.pilot_status          ended · converted · blocked · exception
 *   organizations.access_suspended_kind non_payment · manual · security
 *   subscriptions.status                past_due · canceling
 *   organizations.individual_tier_auto  individuell_s · individuell_l
 *   organizations.customer_stage        demo · live
 *
 * Dazu: **null** Abonnements liefen in den nächsten sieben Tagen ab.
 *
 * `customer_stage = 'live'` ist der auffälligste Eintrag: **keine einzige
 * Organisation stand im Zustand „live"** — der Zustand, in dem ein zahlender
 * Kunde die meiste Zeit verbringt, hatte kein Beispiel.
 *
 * Jeder unbesetzte Zustand ist eine Oberfläche, die niemand je gesehen hat, und
 * ein Codepfad, den kein Mensch je ausgelöst hat. `sql/seeds/y1-3-sonderzustaende.sql`
 * besetzt alle zwölf. Gemessen nach dem Laden: jeder Zustand ≥ 1, und 18 von 18
 * Bühnen-Konten (Y1.2 + Y1.3 + Y1.4) sind anmeldbar.
 *
 * WAS Y1.1 ANGEHT: dessen wörtliche Forderung war durch die Masse schon
 * erfüllt — alle zehn Kombinationen aus Plan und Art existierten bereits. Was
 * fehlte, waren die INDIVIDUELL-Größenstufen; `individuell_s` und
 * `individuell_l` stehen deshalb in dieser Saat mit drin.
 *
 * GEPRÜFT WIRD DIE FORM DER SAAT, nicht die Datenbank: das Tor lädt keine Saat.
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
      const saat = path.join(dir, "sql", "seeds", "y1-3-sonderzustaende.sql");
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
const SAAT = ROOT ? fs.readFileSync(path.join(ROOT, "sql", "seeds", "y1-3-sonderzustaende.sql"), "utf8") : "";
const OHNE_KOMMENTAR = SAAT.replace(/--[^\n]*/g, " ");

/**
 * Nur die Anweisungen, die ZEILEN ANLEGEN — ohne die Vollständigkeits-Notbremse
 * am Dateiende.
 *
 * Die Notbremse fragt jeden der zwölf Zustände einzeln ab und NENNT ihn dabei.
 * Eine Prüfung über die ganze Datei fand deshalb jeden Wert, auch wenn er aus
 * den VALUES verschwunden war: zwei Rückmutationen blieben so grün
 * (`pilot_status='exception'` entfernt, `customer_stage='live'` entfernt). Die
 * Zusicherung hätte dann die Notbremse geprüft statt die Saat — dieselbe Klasse,
 * die in dieser Sitzung über ein Dutzend Mal zugeschlagen hat.
 */
const DATENTEIL = (() => {
  const i = OHNE_KOMMENTAR.indexOf("DO $vollstaendig$");
  return i > 0 ? OHNE_KOMMENTAR.slice(0, i) : OHNE_KOMMENTAR;
})();

/** Die zwölf Zustände, die kein Beispiel hatten — als Prüfliste. */
const ZUSTAENDE = [
  ["pilot_status", "ended"], ["pilot_status", "converted"],
  ["pilot_status", "blocked"], ["pilot_status", "exception"],
  ["access_suspended_kind", "non_payment"], ["access_suspended_kind", "manual"],
  ["access_suspended_kind", "security"],
  ["subscriptions.status", "past_due"], ["subscriptions.status", "canceling"],
  ["individual_tier_auto", "individuell_s"], ["individual_tier_auto", "individuell_l"],
  ["customer_stage", "demo"], ["customer_stage", "live"],
];

suite("Y1.3 — jeder legale Zustand bekommt ein Beispiel", () => {

  it("alle zwölf unbesetzten Zustände kommen in einer ANWEISUNG vor", () => {
    /* Im Kommentar genannt zu werden genügt nicht — der Kopf dieser Saat listet
       sie alle auf, und eine Prüfung über den ganzen Text wäre damit leer grün
       (dieselbe Klasse, die in dieser Sitzung elfmal zugeschlagen hat). */
    const fehlt = ZUSTAENDE
      .filter(([, wert]) => !new RegExp("'" + wert + "'").test(DATENTEIL))
      .map(([feld, wert]) => feld + "=" + wert);
    assert.deepEqual(fehlt, [],
      "Diese Zustände stehen in keiner ZEILENANLEGENDEN Anweisung der Saat — sie bleiben also "
      + "unbesetzt, obwohl der Kopf und die Notbremse sie nennen. Gemessen hatten sie in "
      + "2940 Organisationen kein Beispiel.");
  });

  it("zwölf Organisationen, und der ZWECK steht im Namen", () => {
    const block = (OHNE_KOMMENTAR.match(/INSERT\s+INTO\s+organizations\b[\s\S]*?;/i) || [""])[0];
    const ids = block.match(/'b3000000-0000-4000-8000-0000000000[0-9a-f]{2}'/g) || [];
    const eindeutig = new Set(ids);
    assert.ok(eindeutig.size >= 12,
      `Erwartet zwölf Organisationen, gefunden ${eindeutig.size}. Jede trägt genau einen `
      + "Zustand; weniger heißt, dass ein Zustand kein eigenes Beispiel hat.");
    /* Der Name muss den Zweck nennen. „Firma 7" wäre in einer Verwaltungsliste
       wertlos — wer die Bühne vorführt, muss ohne Nachschlagen wissen, was er
       anklickt. */
    for (const stueck of ["Pilot beendet", "Pilot uebernommen", "Pilot gesperrt", "Pilot Ausnahme",
      "Zahlungsausfall", "Manuell gesperrt", "Sicherheitssperre", "Kuendigung laeuft",
      "Individuell S", "Individuell L", "Demo-Phase", "Ablauf in drei Tagen"]) {
      assert.ok(block.includes(stueck),
        `Keine Organisation heißt nach ihrem Zweck „${stueck}". Ein Name ohne Zweck macht die `
        + "Bühne unbenutzbar: in der Liste steht dann zwölfmal dasselbe.");
    }
  });

  it("die Vollständigkeits-Notbremse prüft die ZUSTÄNDE, nicht ihren Text", () => {
    /* Die Lehre aus Y1.4: eine Zusicherung auf den Meldungstext überlebt
       `IF false`. Geprüft wird deshalb die Bedingung — und zwar, dass sie jeden
       der zwölf Zustände einzeln abfragt. */
    assert.match(SAAT, /array_length\(fehlt, 1\) > 0/,
      "Die Notbremse wertet ihre Sammelliste nicht aus");
    const pruefungen = (SAAT.match(/IF NOT EXISTS \(SELECT 1 FROM (organizations|subscriptions)/g) || []).length;
    assert.ok(pruefungen >= 13,
      `Nur ${pruefungen} Einzelprüfungen in der Notbremse, erwartet mindestens 13 `
      + "(zwölf Zustände plus die Ablauffrist). Eine Notbremse, die nur einen Teil prüft, "
      + "lässt die Saat erfolgreich durchlaufen und einen Zustand unbesetzt.");
    assert.match(SAAT, /weiter unbesetzt/,
      "Die Notbremse nennt den Grund nicht — dann bricht sie ab, ohne zu sagen, was fehlt");
  });

  it("das ablaufende Abo rechnet RELATIV, nicht mit einem festen Datum", () => {
    /* Ein fest eingetragenes Datum ist in drei Wochen „vor zwei Jahren" und die
       Mahnstrecke zeigt wieder nichts. Y2.3 verlangt dasselbe ausdrücklich. */
    assert.match(OHNE_KOMMENTAR, /CURRENT_DATE \+ 3\)::timestamptz/,
      "Das ablaufende Abonnement nutzt kein relatives Datum. Mit einem festen Wert wäre der "
      + "Zustand „läuft in drei Tagen ab\" schon morgen falsch und übermorgen wertlos.");
    const feste = OHNE_KOMMENTAR.match(/'20\d\d-\d\d-\d\d'/g) || [];
    assert.deepEqual(feste, [],
      `Die Saat trägt feste Datumswerte (${feste.join(", ")}). Jeder davon veraltet; `
      + "relative Ausdrücke (CURRENT_DATE ± n, now() - interval) veralten nie.");
  });

  it("past_due geht mit der Zahlungsausfall-Sperre einher, canceling läuft noch", () => {
    /* Die Kombination ist der Punkt: ein Abo in past_due OHNE Sperre und eine
       Sperre OHNE offenes Abo wären beide unrealistisch, und die Oberfläche
       zeigte einen Zustand, den es so nie gibt. */
    const subs = (OHNE_KOMMENTAR.match(/INSERT\s+INTO\s+subscriptions\b[\s\S]*?;/i) || [""])[0];
    assert.match(subs, /\('05', 'PLUS', 'past_due'/,
      "past_due hängt nicht am Konto der Zahlungsausfall-Sperre (05). Eine Sperre ohne "
      + "offenes Abo und ein offenes Abo ohne Sperre sind beide unrealistisch.");
    /* Die Zeile mit 'canceling' herausschneiden und IHRE Datumswerte prüfen.
       Ein Fenster von 200 Zeichen traf das `current_period_end` der Zeile und
       blieb grün, als `cancel_at` in die VERGANGENHEIT rutschte. */
    const zeile = (subs.match(/\('08'[\s\S]*?\)(?=,\s*\n|\s*\n\) AS s)/) || [""])[0];
    assert.ok(zeile.includes("'canceling'"),
      "Die Zeile des Kündigungs-Kontos (08) trägt nicht den Zustand 'canceling'");
    const vergangen = zeile.match(/CURRENT_DATE - \d+\)::timestamptz/g) || [];
    assert.equal(vergangen.length, 2,
      `In der canceling-Zeile stehen ${vergangen.length} Datumswerte in der Vergangenheit, `
      + "erwartet genau zwei (Periodenbeginn und Kündigungszeitpunkt). Ist ein DRITTER dabei, "
      + "liegt `cancel_at` in der Vergangenheit — dann ist das Abo einfach „canceled\", der "
      + "Zustand „gekündigt, läuft aber noch\" fehlt wieder, und die Oberfläche zeigt ihn nicht.");
    /* Periodenende UND cancel_at liegen auf demselben künftigen Tag — zweimal
       derselbe Ausdruck, aber nicht nebeneinander (zwischen ihnen steht der
       Kündigungszeitpunkt). Eine Prüfung auf Nachbarschaft war deshalb gegen die
       echte Datei falsch. */
    const zukunft = zeile.match(/\(CURRENT_DATE \+ 20\)::timestamptz/g) || [];
    assert.equal(zukunft.length, 2,
      `Erwartet zweimal (CURRENT_DATE + 20) in der canceling-Zeile — Periodenende und `
      + `cancel_at —, gefunden ${zukunft.length}. „canceling\" heißt: gekündigt zum `
      + "Periodenende, Zugang läuft noch. Fällt eines der beiden weg, ist der Zustand "
      + "entweder „canceled\" oder gar nicht erkennbar.");
  });

  it("jede Organisation hat ein anmeldbares Konto", () => {
    const nutzer = (OHNE_KOMMENTAR.match(/INSERT\s+INTO\s+users\b[\s\S]*?;/i) || [""])[0];
    /* VERSCHIEDENE Adressen zählen. Eine Rückmutation ersetzte eine Zeile durch
       eine Kopie einer anderen — die Zahl blieb bei zwölf, ein Zustand hatte
       aber kein Konto mehr. Zählen ist kein Nachweis, solange man Dubletten
       mitzählt. */
    const mails = new Set(nutzer.match(/'[a-z0-9.-]+@probebuehne\.tempconnect\.de'/g) || []);
    assert.equal(mails.size, 12,
      `Erwartet zwölf VERSCHIEDENE Konten, gefunden ${mails.size}. „Jeder Zustand ist `
      + "anmeldbar\" ist die Abnahmebedingung des Plans — ein Zustand, in den man sich nicht "
      + "einloggen kann, zeigt seine Oberfläche nicht.");
    const nummern = new Set(nutzer.match(/\('0[0-9a-c]',/g) || []);
    assert.equal(nummern.size, 12,
      `Erwartet zwölf verschiedene Kontonummern, gefunden ${nummern.size} — eine Dublette `
      + "lässt eine Organisation ohne Konto zurück.");
    assert.match(OHNE_KOMMENTAR, /INSERT INTO org_memberships[\s\S]{0,400}'owner'/,
      "Die Konten haben keine Mitgliedschaft. Ohne sie löst `getPrimaryOrg` keine "
      + "Organisation auf, und das Konto sieht nach der Anmeldung nichts.");
  });

  it("KEIN Passwort und KEIN Hash in der Datei", () => {
    const hashes = SAAT.match(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{10,}/g) || [];
    assert.deepEqual(hashes, [], "Die Saat trägt einen bcrypt-Hash");
    for (const wort of ["DemoPass2026!", "Demo2026!", "password123"]) {
      assert.ok(!OHNE_KOMMENTAR.includes(wort), `'${wort}' steht in einer ANWEISUNG`);
    }
    assert.match(SAAT, /crypt\(current_setting\('app\.seed_passwort'\), gen_salt\('bf', 10\)\)/,
      "Der Hash entsteht nicht aus dem Schalter");
    assert.match(SAAT, /app\.seed_demo_world[\s\S]{0,300}RAISE EXCEPTION/,
      "Die Sperre fehlt oder wirft nicht");
  });

  it("ein zweiter Lauf verdoppelt nichts", () => {
    /* Über den KOMMENTARFREIEN Text zählen. Eine Rückmutation kommentierte alle
       Klauseln aus (`-- ON CONFLICT`) — über den Rohtext gezählt blieb die Zahl
       gleich und die Zusicherung grün, während der zweite Lauf gebrochen wäre. */
    const konflikte = (OHNE_KOMMENTAR.match(/ON CONFLICT/g) || []).length;
    const wenn = (OHNE_KOMMENTAR.match(/WHERE NOT EXISTS/g) || []).length;
    assert.ok(konflikte + wenn >= 4,
      `Nur ${konflikte} ON-CONFLICT- und ${wenn} NOT-EXISTS-Klauseln. Jede Einfügung braucht `
      + "eine, sonst bricht der zweite Lauf oder verdoppelt.");
    assert.ok(!/uuid_generate_v4\(\)/.test(OHNE_KOMMENTAR),
      "Die Saat erzeugt UUIDs zur Laufzeit — dann ist sie nicht wiederholbar");
  });
});
