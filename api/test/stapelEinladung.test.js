/**
 * Die Sammel-Einladung bleibt beim Stapel (M3.2, 2026-09-04).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS HIER BEWACHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nach einem CSV-Import bietet die Oberflaeche an, die frisch importierten
 * Kraefte einzuladen. Der Dialog nennt eine ZAHL: "die 3 gerade importierten
 * einladen?".
 *
 * Gerufen wurde dafuer `POST /worker-invites/bulk` mit LEEREM Rumpf — und der
 * Weg laedt jede noch nicht bestaetigte Kraft der ganzen Organisation ein. Bei
 * einer Belegschaft von 200 unbestaetigten gingen 200 Mails hinaus, obwohl der
 * Dialog von 3 sprach. An der Antwort war es nicht zu erkennen; sie nennt nur
 * `invited_count`, und den liest niemand gegen die Zahl im Dialog.
 *
 * Der Kommentar an der Aufrufstelle begruendete es sogar: "der Server kennt die
 * frischen Kandidaten und dedupliziert ohnehin serverseitig". Beides stimmte —
 * und beantwortete die falsche Frage. Der Server kannte ALLE Kandidaten, nicht
 * die des Stapels.
 *
 * Abnahme aus dem Plan (M3.2): **10 importiert → hoechstens 10 eingeladen.**
 *
 * Run: node --test --test-force-exit test/stapelEinladung.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listInvitableWorkers } from "../services/workerService.js";

/* Pfade IMMER relativ zur Testdatei — sonst haengt das Ergebnis am
   Startverzeichnis und der Test ueberspringt sich je nach cwd lautlos. */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(HIER, "..");

/** Ein Zugang, der jede Abfrage mitschreibt und eine feste Menge liefert. */
function musterPool(zeilen = []) {
  const abfragen = [];
  return {
    abfragen,
    query: async (sql, params) => {
      abfragen.push({ sql: String(sql), params: params || [] });
      return { rows: zeilen, rowCount: zeilen.length };
    }
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";

describe("M3.2 · die Begrenzung auf den Stapel", () => {
  it("ohne Kennungen bleibt es org-weit — der Knopf 'alle einladen' braucht das", async () => {
    const pool = musterPool([]);
    await listInvitableWorkers(pool, ORG);

    assert.equal(pool.abfragen.length, 1);
    const { sql, params } = pool.abfragen[0];
    assert.ok(!/ANY\(\$2/.test(sql),
      "ohne Kennungen darf keine Begrenzung in der Abfrage stehen — sonst faellt der "
      + "Knopf 'alle noch nicht Registrierten einladen' aus");
    assert.deepEqual(params, [ORG]);
  });

  it("mit Kennungen wird begrenzt — und die Bindung geht wirklich mit", async () => {
    const pool = musterPool([]);
    await listInvitableWorkers(pool, ORG, { profileIds: [P1, P2] });

    const { sql, params } = pool.abfragen[0];
    /* Form-Probe: die Begrenzung steht in der Abfrage ... */
    assert.match(sql, /wp\.id = ANY\(\$2::uuid\[\]\)/,
      "die Begrenzung fehlt in der Abfrage");
    /* ... und Bindungs-Probe: sie ist auch belegt. Eine Abfrage mit der
       richtigen Form und ohne Werte filtert nichts. */
    assert.deepEqual(params, [ORG, [P1, P2]]);
  });

  it("die Organisation bleibt die aeussere Bedingung — Kennungen werden nicht geglaubt", async () => {
    /*
     * Die wichtigste Zusicherung dieser Datei. Die Kennungen kommen aus dem
     * Browser. Waeren sie die EINZIGE Bedingung, koennte jemand fremde
     * Profil-Kennungen schicken und Menschen einer anderen Organisation
     * einladen. Sie sind deshalb eine ZUSAETZLICHE Einschraenkung, nie ein
     * Ersatz fuer `supplier_org_id`.
     */
    const pool = musterPool([]);
    await listInvitableWorkers(pool, ORG, { profileIds: [P1] });
    const { sql, params } = pool.abfragen[0];

    assert.match(sql, /wp\.supplier_org_id = \$1/,
      "die Org-Bedingung ist verschwunden — fremde Kennungen wuerden wirken");
    assert.equal(params[0], ORG, "gefiltert wird gegen eine andere Org als die der Anfrage");
    /* Die Reihenfolge im Text ist gleichgueltig; dass BEIDE dastehen, nicht. */
    assert.ok(/AND\s+wp\.id = ANY/.test(sql),
      "die Begrenzung haengt nicht als UND an der Org-Bedingung");
  });

  it("eine LEERE Liste heisst 'keine', nicht 'alle'", async () => {
    /*
     * Der Fall, in dem ein Versehen am teuersten waere: ein Import, aus dem
     * nichts Einladbares hervorging (alle Zeilen ohne E-Mail, alle schon
     * bestaetigt). Wuerde `[]` wie "kein Filter" behandelt, ginge genau dann
     * eine Sammel-Mail an die ganze Belegschaft — ausgeloest von einem Klick,
     * der nichts einladen sollte.
     */
    const pool = musterPool([{ email: "a@b.de" }]);
    const ergebnis = await listInvitableWorkers(pool, ORG, { profileIds: [] });

    assert.deepEqual(ergebnis, [], "eine leere Liste hat Kandidaten geliefert");
    assert.equal(pool.abfragen.length, 0,
      "es wurde ueberhaupt abgefragt — bei 'keine' ist die guenstigste und "
      + "sicherste Antwort, gar nicht erst zu fragen");
  });

  it("10 importiert → hoechstens 10 gefragt (die Abnahme aus dem Plan)", async () => {
    const zehn = Array.from({ length: 10 }, (_, i) =>
      `4${i}444444-4444-4444-8444-444444444444`);
    const pool = musterPool([]);
    await listInvitableWorkers(pool, ORG, { profileIds: zehn });

    assert.equal(pool.abfragen[0].params[1].length, 10,
      "es wurden mehr oder weniger Kennungen gebunden als uebergeben");
    assert.deepEqual(pool.abfragen[0].params[1], zehn);
  });
});

describe("M3.2 · die Route reicht den Stapel durch", () => {
  const ROUTE = fs.readFileSync(path.join(API, "routes", "workers.js"), "utf8");

  it("der Rumpf wird geprueft, nicht geglaubt", () => {
    assert.match(ROUTE, /const bulkInviteSchema = z\.object\(/,
      "es gibt kein Schema fuer den Rumpf der Sammel-Einladung");
    assert.match(ROUTE, /profile_ids: z\.array\(z\.string\(\)\.uuid\(\)\)/,
      "die Kennungen werden nicht als UUID geprueft — dann landet beliebiger Text "
      + "in der Abfrage");
    assert.match(ROUTE, /\.max\(1000\)/, "es fehlt eine Obergrenze");
  });

  it("die geprueften Kennungen erreichen den Dienst", () => {
    assert.match(ROUTE, /bulkInviteSchema\.safeParse\(req\.body/,
      "der Rumpf wird nicht geparst");
    assert.match(ROUTE, /listInvitableWorkers\(pool, req\.orgId,\s*\n?\s*profileIds \? \{ profileIds \} : \{\}\)/,
      "die Kennungen werden geparst und dann nicht weitergereicht — genau die "
      + "Sorte halber Verdrahtung, gegen die diese Welle gebaut ist");
  });

  it("ohne Kennungen bleibt das bisherige Verhalten", () => {
    /* `?? null` und nicht `|| []`: ein fehlendes Feld muss org-weit bedeuten,
       eine leere Liste aber "keine". Ein `||` wuerde beides gleich behandeln. */
    assert.match(ROUTE, /profile_ids \?\? null/,
      "fehlendes Feld und leere Liste werden nicht mehr unterschieden");
  });
});

describe("M3.2 · die Oberflaeche schickt, was sie verspricht", () => {
  const SEITE = fs.readFileSync(
    path.join(API, "..", "frontend", "public", "js", "pages", "mitarbeiter.js"), "utf8");

  it("der Import-Bericht wird nach seinen Kennungen ausgelesen", () => {
    assert.match(SEITE, /_csvImportierteProfilIds = \(res\.created \|\| \[\]\)/,
      "die Kennungen des Stapels werden nicht mehr festgehalten");
    assert.match(SEITE, /\.map\(function\(e\) \{ return e && e\.profile_id; \}\)/,
      "es wird ein anderes Feld gelesen als `profile_id`");
  });

  it("der Einladen-Knopf schickt sie mit", () => {
    assert.match(SEITE, /profile_ids: _csvImportierteProfilIds/,
      "der Knopf nach dem Import schickt die Kennungen nicht mit — dann laedt er "
      + "wieder die ganze Belegschaft ein, waehrend der Dialog eine Zahl nennt");
  });

  it("der Knopf 'alle noch nicht Registrierten' bleibt org-weit", () => {
    /* Die Gegenrichtung. Er SOLL die ganze Organisation treffen, und sein
       Bestaetigungsdialog sagt das auch. Wer hier versehentlich begrenzt,
       nimmt eine gewollte Funktion weg. */
    const block = /function inviteAllUnregistered\(\)[\s\S]*?\n\}/.exec(SEITE);
    assert.ok(block, "inviteAllUnregistered nicht gefunden — liest diese Probe ins Leere?");
    assert.ok(!/profile_ids/.test(block[0]),
      "der org-weite Knopf begrenzt jetzt auch — dann fehlt die Moeglichkeit, "
      + "die gesamte Belegschaft einzuladen");
    assert.match(block[0], /body: \{\}/,
      "der org-weite Knopf schickt keinen leeren Rumpf mehr");
  });
});
