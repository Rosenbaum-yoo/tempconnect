/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DER SUCHINDEX KENNT DIE GRENZE — eine Kopplung, keine Notiz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WARUM ES DIESEN WAECHTER GIBT (P1-15, gemessen am 2026-09-28)
 *
 * `searchService` fuehrt fuer jede Suchdomaene ZWEI Wege: den Meilisearch-Index
 * (`INDEX_CONFIG[...].reindexQuery`) und den Datenbank-Rueckfall (`domains`).
 * Der Rueckfall hielt die Sichtbarkeitsregeln, die der Dienst selbst aufschreibt.
 * Die Reindex-Abfragen hielten KEINE EINZIGE:
 *
 *   companies / suppliers  ohne Opt-in-Pruefung (profile_visibility_settings)
 *   capacity_posts         ohne aktiv / nicht-privat / nicht-abgelaufen
 *   requisitions           voellig ohne WHERE — die Anforderungen ALLER
 *                          Mandanten in EINEM gemeinsamen Index
 *
 * Nichts davon ist ausgelaufen, und zwar aus zwei Gruenden, die beide keine
 * Absicherung sind: die Abfragen nannten fuenf Spalten, die es nicht gibt (also
 * warfen sie), und Meilisearch ist nirgends angebunden (`MEILISEARCH_URL` ist in
 * beiden Beispiel-Umgebungen auskommentiert, im compose-Verbund gibt es keinen
 * Dienst). EIN FEHLER WAR DER EINZIGE SCHUTZ.
 *
 * Damit lag die Gefahr nicht im Code, sondern in der AKTIVIERUNG — und die sieht
 * wie Konfiguration aus: zwei Zeilen entkommentieren, einen Dienst ergaenzen.
 * Wer danach die Spalten "nur mal schnell" richtigstellt, schaltet die
 * Veroeffentlichung scharf.
 *
 * WARUM EIN WAECHTER UND NICHT EIN KOMMENTAR: in `searchService` stand seit
 * Langem "Vor Aktivierung von Meilisearch: pro-Index-Filter ergaenzen
 * (requisitions org_id, …)". Das Wissen war da und hat nichts verhindert. Es war
 * an einem Tag der dritte Fall, in dem Dokumentation stand, wo Erzwingung
 * hingehoert.
 *
 * WAS DIESER WAECHTER FESTNAGELT
 *
 *   1. Jede `reindexQuery`, die es GIBT, traegt die Bestandteile des Filters
 *      ihres Datenbank-Gegenstuecks.
 *   2. `requisitions` hat GAR KEINE `reindexQuery` — org-private Daten gehoeren
 *      nicht in einen gemeinsamen Index. Wer sie wieder befuellen will, braucht
 *      eine Org-Bindung IM Dokument, nicht bloss ein filterbares Attribut.
 *   3. Keine Reindex-Abfrage nennt eine der fuenf Spalten, die es nicht gibt —
 *      sonst kehrt der stumme Wurf zurueck, und mit ihm der Scheinschutz.
 *   4. Der Waechter prueft zuerst seinen eigenen Gegenstand: findet er die
 *      Abfragen nicht, ist er blind und nicht gruen.
 *
 * DB-FREI: gemessen wird am Quelltext. Der gefaehrliche Zustand ist ein
 * Quelltext-Zustand, und eine Zusicherung, die nur mit Datenbank laeuft, ist im
 * Tor keine.
 *
 * UEBERTRAGBAR: in jedem Projekt mit einem Suchindex daneben. Der Index traegt
 * Oeffentliches, die Datenbank traegt Mandantengetrenntes — und `org_id` als
 * filterbares Attribut ist keine Mandantengrenze, sondern eine Bitte an die
 * Abfrage.
 *
 * Run: node --test --test-force-exit test/suchindexKenntDieGrenze.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* Posten 5: damit die Alternative "angebotAktivSql(" in PFLICHT keine
   Abschwaechung ist, wird HIER belegt, dass das Modul die Bedingung wirklich
   erzeugt — nicht in einer anderen Datei, auf die man sich verlassen muesste. */
import { angebotAktivSql } from "../services/angebotAktivSql.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const DIENST = path.join(HIER, "..", "services", "searchService.js");
const quelle = fs.readFileSync(DIENST, "utf8");

/* ── Die Reindex-Abfrage je Index aus dem Quelltext holen ─────────────────── */

/**
 * Liefert je Indexnamen den Text der `reindexQuery` — oder null, wenn dort
 * ausdruecklich `null` steht.
 */
function reindexAbfragen() {
  const raus = {};
  const block = quelle.slice(quelle.indexOf("const INDEX_CONFIG"), quelle.indexOf("Meilisearch Client"));
  const BT = String.fromCharCode(96);
  for (const m of block.matchAll(/^  ([a-z_]+):\s*\{/gm)) {
    const name = m[1];
    const ab = block.indexOf(m[0]);
    const naechster = block.slice(ab + m[0].length).search(/^  [a-z_]+:\s*\{/m);
    const teil = naechster === -1 ? block.slice(ab) : block.slice(ab, ab + m[0].length + naechster);
    const mitNull = /reindexQuery:\s*null/.test(teil);
    if (mitNull) { raus[name] = null; continue; }
    const i = teil.indexOf("reindexQuery:");
    if (i === -1) continue;
    const start = teil.indexOf(BT, i);
    const ende = teil.indexOf(BT, start + 1);
    raus[name] = start === -1 || ende === -1 ? undefined : teil.slice(start + 1, ende);
  }
  return raus;
}

/* Was jede Abfrage tragen MUSS — abgeleitet aus dem Datenbank-Rueckfall
   derselben Domaene, nicht erfunden. */
const PFLICHT = {
  companies: [
    ["profile_visibility_settings", "die Opt-in-Tabelle des Verzeichnisses"],
    ["is_public = TRUE", "das Opt-in selbst"],
    ["'approved'", "die Freigabe des Opt-in"]
  ],
  suppliers: [
    ["profile_visibility_settings", "die Opt-in-Tabelle des Verzeichnisses"],
    ["is_public = TRUE", "das Opt-in selbst"],
    ["'approved'", "die Freigabe des Opt-in"]
  ],
  capacity_posts: [
    /* Posten 5 (2026-10-03): die Bedingung steht nicht mehr woertlich im
       Quelltext, sie kommt aus `angebotAktivSql`. Beide Schreibweisen gelten —
       UND die Probe (1a) weiter unten belegt in DIESER Datei, dass das Modul
       wirklich `status = 'active'` erzeugt. Ohne diesen Beleg waere die
       Alternative eine Abschwaechung: man wuerde die Anwesenheit eines
       Funktionsnamens fuer die Anwesenheit eines Filters nehmen. */
    [["status = 'active'", "angebotAktivSql("], "nur aktive Anzeigen"],
    ["visibility_status", "private Anzeigen ausschliessen"],
    ["availability_to", "abgelaufene Anzeigen ausschliessen"]
  ]
};

/* Spalten, die es nicht gibt (gemessen 2026-09-28). Kehrt eine zurueck, wirft die
   Abfrage wieder — und der stumme Wurf hat schon einmal einen fehlenden Filter
   verdeckt. */
const GIBT_ES_NICHT = [
  "u.type", "u.legal_name", "u.plan_id",
  "cp.description", "cp.hourly_rate"
];

describe("Waechter: der Suchindex kennt die Grenze", () => {
  it("(0) der Waechter findet die Abfragen — sonst ist er blind, nicht gruen", () => {
    const ab = reindexAbfragen();
    const namen = Object.keys(ab);
    assert.ok(namen.length >= 5,
      "nur " + namen.length + " Indizes erkannt (" + namen.join(", ") + ") — die Erkennung "
      + "der INDEX_CONFIG ist kaputt, und dann sagen alle Zusicherungen darunter nichts");
    for (const n of ["companies", "suppliers", "capacity_posts", "requisitions", "skills"]) {
      assert.ok(n in ab, "der Index " + n + " wird nicht erkannt");
    }
    /* Und mindestens eine Abfrage muss wirklich Text haben, sonst passt die
       Erkennung auf alles. */
    assert.ok(typeof ab.companies === "string" && ab.companies.includes("SELECT"),
      "die Abfrage von companies wird nicht als Text erkannt");
  });

  it("(1) jede vorhandene Reindex-Abfrage traegt den Filter ihres Datenbank-Gegenstuecks", () => {
    const ab = reindexAbfragen();
    const fehlt = [];
    for (const [index, pflichten] of Object.entries(PFLICHT)) {
      const sql = ab[index];
      if (sql === null) continue;   // nicht indiziert: dann gibt es nichts zu filtern
      assert.ok(typeof sql === "string", "die Abfrage von " + index + " ist nicht lesbar");
      for (const [teil, zweck] of pflichten) {
        /* `teil` darf eine Liste gleichwertiger Schreibweisen sein — EINE davon
           genuegt. Gebraucht, seit eine Bedingung aus einem gemeinsamen Modul
           kommt statt woertlich im SQL zu stehen. */
        const varianten = Array.isArray(teil) ? teil : [teil];
        if (!varianten.some((v) => sql.includes(v))) {
          fehlt.push(index + ": " + varianten.join(" ODER ") + "  (" + zweck + ")");
        }
      }
    }
    assert.deepEqual(fehlt, [],
      "Eine Reindex-Abfrage veroeffentlicht mehr als ihr Datenbank-Gegenstueck. Genau so sah "
      + "P1-15 aus: der Rueckfall filterte korrekt, der Index nahm alles. Was im Index liegt, "
      + "liefert jede Abfrage, die den Filter vergisst.\n  " + fehlt.join("\n  "));
  });

  it("(1a) die zugelassene Modul-Schreibweise ERZEUGT den Filter wirklich", () => {
    /*
     * OHNE DIESE PROBE WAERE (1) SCHWAECHER GEWORDEN. Seit die Aktiv-Bedingung
     * aus `angebotAktivSql` kommt, laesst (1) fuer capacity_posts auch den
     * Aufruf als Beleg gelten. Der Name einer Funktion ist aber kein Filter —
     * also wird hier nachgerechnet, was sie liefert. Faellt das Modul auf das
     * alte, abweichende `is_active` zurueck, wird diese Zeile rot und nicht
     * erst der Index.
     */
    const bedingung = angebotAktivSql("cp");
    assert.match(bedingung, /status = 'active'/,
      "die zugelassene Schreibweise erzeugt keine Aktiv-Bedingung mehr — dann belegt "
      + "der Aufruf in (1) nichts, und der Index darf mehr veroeffentlichen als die "
      + "Datenbank");
    assert.ok(!/is_active/.test(bedingung),
      "das Modul liest wieder das abgeleitete Flag — es wich auf zwei Zeilen von "
      + "status ab, und der Index wuerde diese Abweichung veroeffentlichen");
  });

  it("(2) org-private Anforderungen werden NICHT indiziert", () => {
    const ab = reindexAbfragen();
    if (ab.requisitions === null) return;   // der gewollte Zustand
    const sql = String(ab.requisitions || "");
    assert.ok(/org_id\s*=\s*\$\d/.test(sql),
      "`requisitions` wird wieder indiziert, ohne dass die Abfrage an eine Organisation "
      + "gebunden ist. Der Datenbankweg filtert `WHERE org_id = $5` und ist ohne Org-Kontext "
      + "gar nicht vorhanden. Ein filterbares Attribut `org_id` ist KEINE Mandantengrenze: "
      + "liegen die Daten im Index, liefert sie jede Abfrage, die den Filter vergisst. Wenn "
      + "der Owner den Index will, dann je Organisation einen.");
  });

  it("(3) keine Reindex-Abfrage nennt eine Spalte, die es nicht gibt", () => {
    const ab = reindexAbfragen();
    const treffer = [];
    for (const [index, sql] of Object.entries(ab)) {
      if (typeof sql !== "string") continue;
      for (const spalte of GIBT_ES_NICHT) {
        if (sql.includes(spalte)) treffer.push(index + ": " + spalte);
      }
    }
    assert.deepEqual(treffer, [],
      "Eine Reindex-Abfrage nennt wieder eine Spalte, die es nicht gibt. Dann wirft sie, der "
      + "Index bleibt leer — und genau dieser stumme Wurf hat verdeckt, dass die Filter "
      + "fehlten. Ein Fehler ist kein Schutz.\n  " + treffer.join("\n  "));
  });

  it("(4) die Erkennung greift wirklich — Gegenprobe an erfundenem Text", () => {
    /* Klasse "die Probe prueft zuerst ihren Gegenstand". Ohne diese Zeilen waere
       alles darueber auch dann gruen, wenn die Ausdruecke nichts mehr treffen. */
    const sql = "SELECT o.id FROM organizations o WHERE o.name != ''";
    for (const [teil] of PFLICHT.companies) {
      assert.equal(sql.includes(teil), false,
        "die Pflichtbestandteile treffen auf eine Abfrage OHNE Filter zu — dann kann (1) nichts finden");
    }
    assert.ok(GIBT_ES_NICHT.every((s) => s.includes(".")),
      "die Liste der fehlenden Spalten ist nicht qualifiziert — unqualifizierte Namen wuerden "
      + "auf fremde Tabellen zutreffen");
  });
});
