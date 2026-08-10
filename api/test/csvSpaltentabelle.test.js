/**
 * P10 Spur D / Welle D3 — die Spaltentabelle.
 *
 * DER DEFEKT
 * Welche Ueberschrift welches Feld meint, stand ausschliesslich im Browser, als
 * hartkodierte Liste. Drei Folgen: jede neue Schreibweise eines Kunden brauchte
 * einen Deploy, der Server kannte die Zuordnung ueberhaupt nicht, und es gab
 * keinen Ort, an dem ein Kunde SEINE Schreibweisen hinterlegen konnte.
 *
 * Konkret gemeldet hat der Owner "Gebdatum". Der Alias hiess "geb_datum", und
 * die Erkennung entfernte zwar Punkte und Bindestriche, liess aber den
 * Unterstrich stehen — die beiden konnten sich nie treffen.
 *
 * WAS HIER GEPRUEFT WIRD
 * Die Regeln werden wirklich ausgefuehrt, nicht im Quelltext gesucht. Zusaetzlich
 * haelt ein Test fest, dass Feldliste im Code und Feldliste in der Migration
 * deckungsgleich sind — zwei Listen waeren zwei Wahrheiten.
 *
 * Run: node --test --test-force-exit test/csvSpaltentabelle.test.js
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalisiereSchluessel, baueKatalog, ordneSpaltenZu,
  fehlendePflichtfelder, ladeFeldkatalog, merkeAlias,
  resetFieldCatalogCache, KATALOG_TTL_MS
} from "../services/csvFieldCatalogService.js";
import { TEXTFELDER } from "../routes/workers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/*
 * Im Container ist das Arbeitsverzeichnis /app, und sql/migrations liegt dort als
 * Lese-Mount (siehe docker-compose.yml). Lokal laeuft der offizielle Runner mit
 * cwd=api/, dort fuehrt der Weg ueber import.meta.url zum Repo-Wurzelverzeichnis.
 * Beide Wege werden geprueft — sonst uebersprang der Test je nach Startort
 * lautlos, und die gruene Suite pruefte weniger, als sie behauptet.
 *
 * Geprueft wird auf die DATEI, nicht auf ihr Verzeichnis: Docker legt das Ziel
 * eines Bind-Mounts auf dem Host als leeres Verzeichnis an (api/sql/migrations),
 * und das duerfte hier nicht als Treffer durchgehen.
 */
const MIG_REL = "sql/migrations/174_csv_spaltentabelle.sql";
const MIGRATION = [process.cwd(), path.resolve(__dirname, "..", "..")]
  .map((wurzel) => path.join(wurzel, MIG_REL))
  .find((p) => fs.existsSync(p))
  || path.resolve(__dirname, "..", "..", MIG_REL);

/* ── Die Schluesselregel ──────────────────────────────────────────────────── */

describe("P10/D3 · Ein Schluessel fuer alle Schreibweisen", () => {
  it("faltet die vier Schreibweisen des gemeldeten Falls zusammen", () => {
    const erwartet = "gebdatum";
    for (const schreibweise of ["Gebdatum", "Geb.-Datum", "geb_datum", "GEB DATUM", "geb datum"]) {
      assert.equal(normalisiereSchluessel(schreibweise), erwartet,
        `"${schreibweise}" muss denselben Schluessel ergeben — genau hier lag der gemeldete Fehler`);
    }
  });

  it("faltet Umlaute, statt sie stehen zu lassen", () => {
    assert.equal(normalisiereSchluessel("Straße"), "strasse");
    assert.equal(normalisiereSchluessel("Länderkürzel"), "laenderkuerzel");
    assert.equal(normalisiereSchluessel("Wohnort/Straße"), "wohnortstrasse");
  });

  it("entfernt Akzente, die aus Fremdsystemen kommen", () => {
    assert.equal(normalisiereSchluessel("Café"), "cafe");
  });

  it("erfuellt immer die Bedingung, die die Datenbank erzwingt", () => {
    // csv_import_field_aliases.alias_key CHECK (alias_key ~ '^[a-z0-9]+$')
    for (const roh of ["E-Mail", "MA-Nr.", "Geb.-Datum", "Straße", "  Ort  ", "PLZ/Ort"]) {
      const k = normalisiereSchluessel(roh);
      assert.match(k, /^[a-z0-9]+$/,
        `"${roh}" ergibt "${k}" — das liesse sich gar nicht einfuegen und koennte nie treffen`);
    }
  });

  it("kommt mit Unbrauchbarem klar, statt zu werfen", () => {
    assert.equal(normalisiereSchluessel(null), "");
    assert.equal(normalisiereSchluessel(undefined), "");
    assert.equal(normalisiereSchluessel(42), "");
    assert.equal(normalisiereSchluessel("---"), "");
  });
});

/* ── Die Zuordnung ────────────────────────────────────────────────────────── */

/** Ein kleiner Katalog, der die interessanten Faelle abdeckt. */
function katalog() {
  return baueKatalog(
    [
      { field_key: "email",         label_key: "e", is_required: true,  sort_order: 10, value_pattern: "@" },
      { field_key: "first_name",    label_key: "v", is_required: true,  sort_order: 20, value_pattern: null },
      { field_key: "last_name",     label_key: "n", is_required: true,  sort_order: 30, value_pattern: null },
      { field_key: "city",          label_key: "o", is_required: false, sort_order: 40, value_pattern: null },
      { field_key: "date_of_birth", label_key: "g", is_required: false, sort_order: 50, value_pattern: null }
    ],
    [
      { field_key: "email",         alias_key: "email",        alias_label: "E-Mail",       priority: 120, ist_eigen: false },
      { field_key: "email",         alias_key: "kontakt",      alias_label: "Kontakt",      priority: 40,  ist_eigen: false },
      { field_key: "first_name",    alias_key: "vorname",      alias_label: "Vorname",      priority: 120, ist_eigen: false },
      { field_key: "last_name",     alias_key: "nachname",     alias_label: "Nachname",     priority: 120, ist_eigen: false },
      { field_key: "last_name",     alias_key: "name",         alias_label: "Name",         priority: 40,  ist_eigen: false },
      { field_key: "city",          alias_key: "wohnort",      alias_label: "Wohnort",      priority: 120, ist_eigen: false },
      { field_key: "date_of_birth", alias_key: "gebdatum",     alias_label: "Gebdatum",     priority: 120, ist_eigen: false }
    ]
  );
}

const sp = (header, proben = []) => ({ header, proben });

describe("P10/D3 · Ueberschriften finden ihr Feld", () => {
  it("erkennt den gemeldeten Fall Gebdatum", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Gebdatum")]);
    assert.equal(r.zuordnung["Gebdatum"], "date_of_birth");
  });

  it("erkennt dieselbe Spalte in jeder Schreibweise", () => {
    for (const s of ["Geb.-Datum", "GEB DATUM", "geb_datum"]) {
      const r = ordneSpaltenZu(katalog(), [sp(s)]);
      assert.equal(r.zuordnung[s], "date_of_birth", `"${s}" wurde nicht erkannt`);
    }
  });

  it("laesst die eindeutige Spalte gegen die mehrdeutige gewinnen", () => {
    // "Name" und "Nachname" in einer Datei: der Nachname ist gemeint.
    const r = ordneSpaltenZu(katalog(), [sp("Name"), sp("Nachname")]);
    assert.equal(r.zuordnung["Nachname"], "last_name");
    assert.equal(r.zuordnung["Name"], undefined, "eine Spalte darf nicht zweimal dasselbe Feld belegen");
  });

  it("ist unabhaengig von der Reihenfolge in der Datei", () => {
    // Der alte Weg ("erster Treffer gewinnt") haette hier je nach Spaltenfolge
    // ein anderes Ergebnis geliefert. Das ist keine Zuordnung, das ist Zufall.
    const a = ordneSpaltenZu(katalog(), [sp("Name"), sp("Nachname")]);
    const b = ordneSpaltenZu(katalog(), [sp("Nachname"), sp("Name")]);
    assert.equal(a.zuordnung["Nachname"], "last_name");
    assert.equal(b.zuordnung["Nachname"], "last_name");
  });

  it("benennt die verdraengte Spalte, statt sie zu verschweigen", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Name"), sp("Nachname")]);
    assert.equal(r.mehrdeutig.length, 1);
    assert.equal(r.mehrdeutig[0].header, "Name");
    assert.equal(r.mehrdeutig[0].field_key, "last_name",
      "ohne Begruendung wirkt die leere Spalte wie ein Fehler");
  });

  it("nimmt \"Name\" allein sehr wohl als Nachnamen", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Name")]);
    assert.equal(r.zuordnung["Name"], "last_name",
      "der Owner will den Fall ausdruecklich erkannt haben — nur eben schwaecher");
  });

  it("erkennt die E-Mail am Inhalt, wenn die Ueberschrift schweigt", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Spalte7", ["a@b.de", "c@d.de", "e@f.de"])]);
    assert.equal(r.zuordnung["Spalte7"], "email");
    assert.equal(r.treffer[0].via, "inhalt");
    assert.equal(r.treffer[0].anteil, 100);
  });

  it("laesst die Ueberschrift vor dem Inhalt gewinnen", () => {
    const r = ordneSpaltenZu(katalog(), [
      sp("Notizen", ["a@b.de", "c@d.de"]),
      sp("E-Mail",  ["a@b.de", "c@d.de"])
    ]);
    assert.equal(r.zuordnung["E-Mail"], "email",
      "eine benannte Spalte schlaegt eine erratene");
  });

  it("raet nicht bei zu wenigen passenden Proben", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Spalte7", ["a@b.de", "Beck", "Mueller", "Yilmaz", "Klein"])]);
    assert.equal(r.zuordnung["Spalte7"], undefined,
      "eine von fuenf ist kein Muster, sondern ein Zufall");
  });

  it("meldet, was uebrig bleibt", () => {
    const r = ordneSpaltenZu(katalog(), [sp("Kostenstelle"), sp("Vorname")]);
    assert.deepEqual(r.offen, ["Kostenstelle"]);
  });

  it("nennt die fehlenden Pflichtfelder", () => {
    const k = katalog();
    const r = ordneSpaltenZu(k, [sp("Vorname")]);
    assert.deepEqual(fehlendePflichtfelder(k, r.zuordnung).sort(), ["email", "last_name"]);
  });

  it("kommt mit einer leeren Datei klar", () => {
    const r = ordneSpaltenZu(katalog(), []);
    assert.deepEqual(r.zuordnung, {});
    assert.deepEqual(r.offen, []);
  });

  it("stolpert nicht ueber einen kaputten Katalog", () => {
    const r = ordneSpaltenZu(null, [sp("Vorname")]);
    assert.deepEqual(r.zuordnung, {});
  });
});

describe("P10/D3 · Kundeneigene Schreibweisen stechen die allgemeinen", () => {
  it("bevorzugt den Eintrag dieser Organisation", () => {
    // Ein Kunde nennt seine Notizspalte "Kontakt". Fuer ihn gilt das, fuer
    // alle anderen bleibt "Kontakt" eine schwache E-Mail-Spalte.
    const k = baueKatalog(
      [
        { field_key: "email", label_key: "e", is_required: true, sort_order: 10, value_pattern: null },
        { field_key: "notes", label_key: "n", is_required: false, sort_order: 20, value_pattern: null }
      ],
      [
        { field_key: "email", alias_key: "kontakt", alias_label: "Kontakt", priority: 120, ist_eigen: false },
        { field_key: "notes", alias_key: "kontakt", alias_label: "Kontakt", priority: 100, ist_eigen: true }
      ]
    );
    const r = ordneSpaltenZu(k, [sp("Kontakt")]);
    assert.equal(r.zuordnung["Kontakt"], "notes",
      "die Schreibweise des Kunden beschreibt seinen Export besser als unsere allgemeine Annahme");
    assert.equal(r.treffer[0].via, "alias_eigen");
  });
});

/* ── Das Laden ────────────────────────────────────────────────────────────── */

function mockPool(antworten) {
  const abfragen = [];
  return {
    abfragen,
    query: async (text, params) => {
      abfragen.push({ text, params });
      const naechste = antworten.shift();
      if (naechste instanceof Error) throw naechste;
      return naechste || { rows: [] };
    }
  };
}

const FELD_ROWS = [{ field_key: "email", label_key: "e", is_required: true, sort_order: 10, value_pattern: "@" }];
const ALIAS_ROWS = [{ field_key: "email", alias_key: "email", alias_label: "E-Mail", language: "de", priority: 120, ist_eigen: false }];

describe("P10/D3 · Der Katalog wird geladen wie andere Referenzdaten auch", () => {
  beforeEach(() => resetFieldCatalogCache());

  it("holt plattformweite und org-eigene Aliase in EINER Abfrage", async () => {
    const pool = mockPool([{ rows: FELD_ROWS }, { rows: ALIAS_ROWS }]);
    await ladeFeldkatalog(pool, { orgId: "org-1" });

    assert.equal(pool.abfragen.length, 2, "Felder und Aliase — mehr Abfragen waeren N+1");
    const alias = pool.abfragen[1];
    assert.match(alias.text, /org_id IS NULL OR org_id = \$1/,
      "ohne den NULL-Zweig saehe ein Kunde die plattformweiten Schreibweisen nicht");
    assert.deepEqual(alias.params, ["org-1"]);
  });

  it("fragt beim zweiten Mal nicht erneut", async () => {
    const pool = mockPool([{ rows: FELD_ROWS }, { rows: ALIAS_ROWS }]);
    await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 });
    await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 + KATALOG_TTL_MS - 1 });
    assert.equal(pool.abfragen.length, 2, "Referenzdaten bei jedem Import neu zu laden waere Verschwendung");
  });

  it("laedt nach Ablauf der Frist neu", async () => {
    const pool = mockPool([
      { rows: FELD_ROWS }, { rows: ALIAS_ROWS },
      { rows: FELD_ROWS }, { rows: ALIAS_ROWS }
    ]);
    await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 });
    await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 + KATALOG_TTL_MS + 1 });
    assert.equal(pool.abfragen.length, 4, "sonst wirkt ein neuer Alias erst nach einem Neustart");
  });

  it("haelt Organisationen auseinander", async () => {
    const pool = mockPool([
      { rows: FELD_ROWS }, { rows: ALIAS_ROWS },
      { rows: FELD_ROWS }, { rows: ALIAS_ROWS }
    ]);
    await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 });
    await ladeFeldkatalog(pool, { orgId: "org-2", jetzt: 1000 });
    assert.equal(pool.abfragen.length, 4,
      "ein gemeinsamer Cache wuerde die Schreibweisen eines Kunden an den naechsten ausliefern");
    assert.deepEqual(pool.abfragen[3].params, ["org-2"]);
  });

  it("faellt bei einem DB-Fehler auf den letzten Stand zurueck", async () => {
    const pool = mockPool([
      { rows: FELD_ROWS }, { rows: ALIAS_ROWS },
      new Error("DB weg")
    ]);
    const erst = await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 });
    const dann = await ladeFeldkatalog(pool, { orgId: "org-1", jetzt: 1000 + KATALOG_TTL_MS + 1 });
    assert.equal(dann.felder.length, erst.felder.length,
      "eine kurze Stoerung darf den Import nicht lahmlegen");
  });

  it("verschweigt einen Fehler NICHT, wenn es nichts zurueckzufallen gibt", async () => {
    const pool = mockPool([new Error("DB weg")]);
    await assert.rejects(() => ladeFeldkatalog(pool, { orgId: "org-1" }),
      "ein leerer Katalog saehe aus wie 'keine Spalte erkannt' — der Nutzer wuerde den Fehler bei sich suchen");
  });
});

describe("P10/D3 · Eine Schreibweise merken", () => {
  beforeEach(() => resetFieldCatalogCache());

  it("speichert den normalisierten Schluessel, nicht die Rohform", async () => {
    const pool = mockPool([
      { rows: [{ x: 1 }] },
      { rows: [{ id: "a1", alias_key: "gebdatum", alias_label: "Geb.-Datum" }] }
    ]);
    const r = await merkeAlias(pool, { orgId: "org-1", fieldKey: "date_of_birth", header: "Geb.-Datum" });
    assert.equal(r.gespeichert, true);
    assert.equal(pool.abfragen[1].params[1], "gebdatum",
      "ein nicht normalisierter Schluessel koennte nie treffen — die CHECK-Bedingung wiese ihn ohnehin ab");
    assert.equal(pool.abfragen[1].params[2], "Geb.-Datum", "die menschliche Form bleibt fuer die Anzeige erhalten");
  });

  it("bindet den Eintrag an die Organisation", async () => {
    const pool = mockPool([
      { rows: [{ x: 1 }] },
      { rows: [{ id: "a1", alias_key: "manr", alias_label: "MA-Nr." }] }
    ]);
    await merkeAlias(pool, { orgId: "org-7", fieldKey: "personnel_number", header: "MA-Nr." });
    assert.ok(pool.abfragen[1].params.includes("org-7"),
      "ohne Org-Bindung wuerde die Schreibweise eines Kunden die Zuordnung aller anderen veraendern");
  });

  it("lehnt ein Feld ab, das es nicht gibt", async () => {
    const pool = mockPool([{ rows: [] }]);
    const r = await merkeAlias(pool, { orgId: "org-1", fieldKey: "erfunden", header: "Irgendwas" });
    assert.equal(r.gespeichert, false);
    assert.equal(r.grund, "UNBEKANNTES_FELD");
    assert.equal(pool.abfragen.length, 1, "es darf gar nicht erst geschrieben werden");
  });

  it("lehnt eine Ueberschrift ab, aus der kein Schluessel wird", async () => {
    const pool = mockPool([]);
    const r = await merkeAlias(pool, { orgId: "org-1", fieldKey: "city", header: "---" });
    assert.equal(r.gespeichert, false);
    assert.equal(r.grund, "LEERER_SCHLUESSEL");
  });

  it("besteht auf einer Organisation", async () => {
    await assert.rejects(() => merkeAlias(mockPool([]), { orgId: null, fieldKey: "city", header: "Ort" }));
  });
});

/* ── Eine Liste, kein Paar ────────────────────────────────────────────────── */

describe("P10/D3 · Code und Migration nennen dieselben Felder", () => {
  const migration = fs.existsSync(MIGRATION) ? fs.readFileSync(MIGRATION, "utf8") : "";
  const vorhanden = migration.length > 0;

  it("die Migration ist da, wo sie hingehoert", () => {
    assert.ok(vorhanden, `${MIG_REL} nicht gefunden`);
  });

  it("beide Listen sind deckungsgleich", { skip: !vorhanden }, () => {
    /*
     * Die Feldliste steht zwangslaeufig zweimal: als Zod-Schema im Code (dort
     * gehoeren Laengen- und Formatgrenzen hin) und als Zeilen in der Tabelle
     * (dort holt der Wizard sie). Genau das ist die Konstellation, aus der in
     * dieser Spur schon dreimal ein Defekt entstanden ist. Hier wird sie
     * festgenagelt.
     */
    const block = /INSERT INTO csv_import_fields[\s\S]*?ON CONFLICT/.exec(migration);
    assert.ok(block, "der Bestand der Zielfelder fehlt in der Migration");
    const ausMigration = [...block[0].matchAll(/\(\s*'([a-z_]+)'\s*,/g)].map((m) => m[1]);

    assert.deepEqual(
      [...ausMigration].sort(), [...TEXTFELDER].sort(),
      "Code und Datenbank kennen verschiedene Felder — der Wizard boete etwas an, " +
      "das der Import nicht annimmt (oder umgekehrt)"
    );
  });

  it("die Migration nennt ihren Rueckweg", { skip: !vorhanden }, () => {
    assert.match(migration, /ROLLBACK/i);
    assert.match(migration, /DROP TABLE IF EXISTS csv_import_field_aliases/);
    assert.match(migration, /DROP TABLE IF EXISTS csv_import_fields/);
  });

  it("die Datenbank erzwingt die Schluesselregel selbst", { skip: !vorhanden }, () => {
    assert.match(migration, /CHECK \(alias_key ~ '\^\[a-z0-9\]\+\$'\)/,
      "ohne diese Bedingung landen Aliase in der Tabelle, die nie treffen koennen");
  });

  it("plattformweite Doppeleintraege sind ausgeschlossen", { skip: !vorhanden }, () => {
    assert.match(migration, /NULLS NOT DISTINCT/,
      "ohne NULLS NOT DISTINCT waeren beliebig viele gleiche plattformweite Aliase moeglich");
  });

  it("das Geburtsdatum hat bewusst KEIN Inhaltsmuster", { skip: !vorhanden }, () => {
    // Ein Datum ist nicht unterscheidbar: "Eintrittsdatum" saehe genauso aus.
    const zeile = /\('date_of_birth',[^)]*\)/.exec(migration);
    assert.ok(zeile, "das Geburtsdatum fehlt im Bestand");
    assert.match(zeile[0], /NULL\s*\)$/,
      "mit einem Datumsmuster wuerde eine Eintrittsdatum-Spalte als Geburtsdatum eingelesen");
  });
});
