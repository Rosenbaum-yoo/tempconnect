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

import { listInvitableWorkers, BULK_INVITE_MAX } from "../services/workerService.js";

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
    /*
     * ANGEPASST 2026-09-04 (M3.1) — dieselbe Zusicherung, anderer Ausdruck.
     *
     * Vorher stand hier der WOERTLICHE Ausdruck `(res.created || []).map(...)`.
     * Das nagelte die Schreibweise fest, nicht die Aussage: dass die Kennungen
     * des Stapels aus dem Import-Bericht kommen und `profile_id` heissen. M3.1
     * hat den Ausdruck umgebaut (es werden nur noch die EINLADBAREN gesammelt),
     * und die alte Fassung waere rot geworden, ohne dass etwas kaputt ist.
     *
     * Geprueft wird jetzt die Aussage — und zwar strenger als vorher, weil auch
     * die Auswahl dazugehoert.
     */
    const block = /var einladbar = [\s\S]*?_csvImportierteProfilIds = [^;]+;/.exec(SEITE);
    assert.ok(block, "die Sammlung der Stapel-Kennungen wurde nicht gefunden");
    assert.ok(block[0].includes("res.created"),
      "die Kennungen kommen nicht mehr aus dem Import-Bericht");
    assert.ok(block[0].includes("e.profile_id"),
      "es wird ein anderes Feld gelesen als `profile_id`");
  });

  it("gesammelt werden NUR die einladbaren — und die Luecke steht daneben", () => {
    /*
     * M3.1, und es ist dieselbe Klasse wie M3.2 eine Ebene hoeher.
     *
     * Ein ohne E-Mail importierter Mensch bekommt KEIN Nutzerkonto
     * (`created[].user_id: null`, workerService.js Zeile ~3456), und
     * `listInvitableWorkers` verbindet ueber `JOIN users u ON u.id = wp.user_id`
     * — er faellt also zwangslaeufig heraus. Der Knopf zaehlte ihn trotzdem mit:
     * er versprach "alle 10 einladen" und lud sieben ein.
     *
     * Die Zahl steht jetzt auf dem, was wirklich geht. Und die Luecke wird
     * BENANNT — sonst fragt sich der Disponent, wo die anderen drei geblieben
     * sind, und findet es nirgends.
     */
    assert.match(SEITE, /var einladbar = \(res\.created \|\| \[\]\)\.filter\(/,
      "es wird nicht mehr nach einladbaren gefiltert");
    assert.match(SEITE, /e\.profile_id && e\.email/,
      "die E-Mail ist keine Bedingung mehr — dann zaehlt der Knopf wieder Menschen "
      + "mit, die gar kein Konto haben");
    assert.match(SEITE, /var ohneMail = created - einladbar\.length;/,
      "die Luecke wird nicht mehr berechnet");
    assert.match(SEITE, /mit\.csv\.inviteImportedCta", \{ count: einladbar\.length \}/,
      "der Knopf nennt wieder die Zahl der ANGELEGTEN statt der einladbaren");

    /*
     * DIE ZUSICHERUNG, DIE EINE RUECKMUTATION UEBERLEBT HAT (2026-09-04).
     *
     * Die Proben oben halten fest, dass `einladbar` GEBILDET wird und dass der
     * Knopf SEINE Zahl nennt. Beides blieb wahr, als ich versuchsweise wieder
     * die volle Liste verschickte — die genannte Zahl und die gesendeten
     * Kennungen waeren dann erneut zwei verschiedene Mengen gewesen, also genau
     * der Fehler aus M3.2 in klein.
     *
     * Der Kern von M3.1 ist die GLEICHHEIT der beiden: was der Knopf nennt,
     * muss er auch schicken. Also wird sie geprueft, nicht ihre Bestandteile.
     */
    assert.match(SEITE, /_csvImportierteProfilIds = einladbar\.map\(/,
      "die gesendeten Kennungen kommen nicht aus derselben Menge wie die genannte "
      + "Zahl — der Knopf verspricht dann wieder etwas anderes, als er tut");
    assert.match(SEITE, /ohneMail > 0/,
      "die Luecke wird nicht angezeigt — sie waere wieder unerklaerlich");

    /* Und in beiden Sprachen erklaert. */
    const de = /TCi18n\.register\('de',([\s\S]*?)\n\}\);/.exec(SEITE);
    const en = /TCi18n\.register\('en',([\s\S]*?)\n\}\);/.exec(SEITE);
    assert.ok(de[1].includes("mit.csv.inviteOhneMail"), "die Erklaerung fehlt auf Deutsch");
    assert.ok(en[1].includes("mit.csv.inviteOhneMail"), "die Erklaerung fehlt auf Englisch");
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

describe("M3.3 · was der Lauf NICHT getan hat, muss dastehen", () => {
  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * DREI FELDER STANDEN SEIT JEHER IN DER ANTWORT UND WURDEN NIE ANGEZEIGT
   * ═══════════════════════════════════════════════════════════════════════════
   *
   *   truncated         wie viele der Lauf gar nicht angefasst hat, weil die
   *                     Obergrenze erreicht war
   *   skipped_pending   wie viele schon eine offene Einladung hatten
   *   skipped_accepted  wie viele sich schon registriert haben
   *
   * Die Meldung nannte nur `invited_count` — und die Zahl stimmte sogar. Sie
   * sagte nur nicht, dass bei 500 Kandidaten 300 Menschen uebrig blieben. Ein
   * Deckel, den niemand sieht, sieht aus wie Vollstaendigkeit: der Disponent
   * klickt einmal, liest "200 eingeladen" und haelt die Liste fuer abgearbeitet.
   *
   * Abnahme aus dem Plan (M3.3): **500 importiert → die Oberflaeche nennt die
   * 300, die nicht gingen.**
   */

  const SEITE = fs.readFileSync(
    path.join(API, "..", "frontend", "public", "js", "pages", "mitarbeiter.js"), "utf8");

  it("die ANTWORT traegt die drei Felder — nicht bloss der Audit-Eintrag", () => {
    /*
     * GESCHAERFT NACH EINER UEBERLEBENDEN RUECKMUTATION (2026-09-04).
     *
     * Hier stand `route.includes("truncated: bulk.truncated")`. Das Feld wird in
     * DIESER Route zweimal geschrieben: einmal in den Audit-Eintrag, einmal in
     * die Antwort an den Browser. Nahm man es aus der ANTWORT heraus, blieb die
     * Probe gruen — sie fand es noch im Audit-Eintrag.
     *
     * Ein Audit-Eintrag hilft der Oberflaeche nicht: er liegt in der Datenbank.
     * Geprueft wird deshalb der `res.json`-Block selbst.
     *
     * Dieselbe Falle wie beim Vorlagen-Waechter heute frueh
     * ("DATABASE_URL".includes("BASE_URL")): eine Zeichenkette IRGENDWO im Text
     * ist kein Beleg dafuer, dass sie an der richtigen Stelle steht.
     */
    const route = fs.readFileSync(path.join(API, "routes", "workers.js"), "utf8");
    const bulk = route.indexOf('router.post("/worker-invites/bulk"');
    assert.notEqual(bulk, -1, "die Sammel-Route wurde nicht gefunden");
    const ende = route.indexOf('router.post("/worker-invites/:id/resend"', bulk);
    assert.notEqual(ende, -1, "das Ende der Sammel-Route wurde nicht gefunden");

    const rumpf = route.slice(bulk, ende);
    /*
     * Den Erfolgs-Antwortblock ueber seinen ANFANG suchen, nicht ueber ein
     * Muster: die Route enthaelt mehrere `res.status(...).json(...)` — 400 fuer
     * den ungueltigen Rumpf, 402 fuer das Planlimit. Ein nicht-gieriges Muster
     * greift den erstbesten und liest damit den falschen Block; genau das ist
     * beim Schaerfen dieser Probe passiert.
     */
    const start = rumpf.indexOf("res.status(201).json({");
    assert.notEqual(start, -1, "der Erfolgs-Antwortblock (201) wurde nicht gefunden");
    const schluss = rumpf.indexOf("\n      });", start);
    assert.notEqual(schluss, -1, "das Ende des Antwort-Blocks wurde nicht gefunden");
    const antwort = rumpf.slice(start, schluss);

    for (const feld of ["skipped_pending", "skipped_accepted", "truncated"]) {
      assert.ok(antwort.includes(`${feld}: bulk.${feld}`),
        `die ANTWORT traegt ${feld} nicht mehr — die Oberflaeche kann es dann nicht `
        + "zeigen, auch wenn es weiterhin im Audit-Eintrag steht");
    }
  });

  it("die Meldung nennt jedes der drei Felder", () => {
    const block = /function bulkMeldung\(r\)\s*\{[\s\S]*?\n\}/.exec(SEITE);
    assert.ok(block, "bulkMeldung nicht gefunden — liest diese Probe ins Leere?");
    for (const feld of ["skipped_pending", "skipped_accepted", "truncated"]) {
      assert.ok(block[0].includes(`r.${feld}`),
        `die Meldung verschweigt ${feld} — genau der stille Deckel, den M3.3 abschafft`);
    }
    assert.ok(block[0].includes("r.invited_count"), "die eingeladenen fehlen");
    assert.ok(block[0].includes("r.failed_count"), "die Fehlschlaege fehlen");
  });

  it("BEIDE Knoepfe benutzen dieselbe Meldung", () => {
    /* Vorher stand die Zusammensetzung zweimal da — und die beiden Fassungen
       waren schon auseinander: die eine nannte `failed_count` "Mail-Fehler", die
       andere "uebersprungen". Dieselbe Zahl, zwei Bedeutungen. */
    const treffer = SEITE.match(/toast\(bulkMeldung\(r\)\)/g) || [];
    assert.equal(treffer.length, 2,
      `${treffer.length} Aufrufstellen benutzen die gemeinsame Meldung, erwartet 2 — `
      + "eine eigene Zusammensetzung driftet von der anderen weg");
  });

  it("der Deckel im Browser stimmt mit dem des Servers ueberein", () => {
    /*
     * ZWEITE WAHRHEIT, und heute schon zweimal abgedriftet (die
     * Onboarding-Rueckfallebene, die Frontend-Linkkarte). Die Meldung nennt die
     * Obergrenze im Klartext ("Obergrenze 200 je Lauf"); steht dort eine andere
     * Zahl als im Dienst, belehrt die Oberflaeche den Menschen falsch — und
     * zwar genau in dem Moment, in dem er wissen muss, wie oft er noch klicken
     * soll.
     */
    const m = /var BULK_INVITE_MAX = (\d+);/.exec(SEITE);
    assert.ok(m, "der gespiegelte Deckel steht nicht mehr in der Seite");
    assert.equal(Number(m[1]), BULK_INVITE_MAX,
      `Browser sagt ${m[1]}, der Dienst sagt ${BULK_INVITE_MAX}`);
  });

  it("die Wortmarken existieren in BEIDEN Sprachen", () => {
    /* Eine Meldung, deren Wortmarke fehlt, zeigt dem Menschen den Schluessel
       statt des Satzes — und der i18n-Waechter faengt nur unbekannte, nicht
       einseitig gepflegte. */
    const de = /TCi18n\.register\('de',([\s\S]*?)\n\}\);/.exec(SEITE);
    const en = /TCi18n\.register\('en',([\s\S]*?)\n\}\);/.exec(SEITE);
    assert.ok(de && en, "die Woerterbuecher wurden nicht gefunden");
    for (const key of ["mit.ok.bulkTruncated", "mit.ok.bulkPending", "mit.ok.bulkAccepted"]) {
      assert.ok(de[1].includes(key), `${key} fehlt im deutschen Woerterbuch`);
      assert.ok(en[1].includes(key), `${key} fehlt im englischen Woerterbuch`);
    }
    /* Und der Deckel muss in der Meldung auch WIRKLICH vorkommen — sonst steht
       die Zahl im Aufruf und nicht im Satz. */
    assert.match(de[1], /bulkTruncated.*\{max\}/,
      "die deutsche Meldung nennt die Obergrenze nicht");
    assert.match(en[1], /bulkTruncated.*\{max\}/,
      "die englische Meldung nennt die Obergrenze nicht");
  });
});
