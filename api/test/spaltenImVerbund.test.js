/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SPALTEN IM VERBUND — die Luecke, die der Schema-Waechter offen laesst
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `sqlSchemaWaechter.test.js` prueft Spaltennamen nur in EINRELATIONALEN
 * Abfragen. Steht ein JOIN in der Abfrage, weiss er nicht mehr, zu welcher
 * Tabelle `u.plan` gehoert — und prueft lieber gar nicht, als zu raten. Das ist
 * eine bewusste, dokumentierte Entscheidung und sie war richtig: raten waere
 * schlimmer.
 *
 * WAS SIE GEKOSTET HAT, gemessen am 2026-09-28 mit den Rueckmutationen zu Welle
 * Z: von achtzehn zurueckgedrehten Fehlern blieben genau ZWEI ungefangen, und
 * beide lagen in dieser Luecke. Ein Nachlauf ueber den ganzen Bestand fand
 * DREIZEHN echte Fehler, die niemand sah — jeder einzelne gegen die laufende
 * Datenbank bestaetigt:
 *
 *     org_memberships.role         an DREI Stellen (die Spalte heisst role_key)
 *         -> das oeffentliche Firmenprofil hat NIE geladen (500)
 *         -> die Abo-Benachrichtigung erreichte den Eigentuemer nie
 *     capacity_posts.workers_count (sie heisst headcount)
 *         -> GET /preferred-vendors/capacity antwortete immer mit 500
 *     users.plan, users.first_name, users.last_name, assignments.title,
 *     organizations.email, requests.location_city,
 *     assignment_staffing_invites.created_at
 *
 * WARUM ES JETZT GEHT: seit Z17 loest `aliasKarte()` den Alias ueber FROM/JOIN
 * auf. Damit ist bekannt, welche Tabelle hinter `u.` steht, und die Spalte laesst
 * sich gegen die Momentaufnahme halten — ohne zu raten, weil ein unbekannter
 * Alias (Unterabfrage, CTE, Sicht) uebersprungen statt vermutet wird.
 *
 * Gemessen: 5726 Spaltenpruefungen, 13 Befunde. Keiner davon ein Fehlalarm.
 *
 * WARUM DER WAECHTER TROTZ OFFENER BEFUNDE JETZT KOMMT: die zehn verbleibenden
 * stehen unten in BESTAND, mit Grund. Das ist dasselbe Muster wie beim
 * Schema-Waechter und es ist der Punkt: ab sofort kann kein ELFTER dazukommen,
 * und jeder abgearbeitete Eintrag wird hier rot, bis ihn jemand streicht.
 *
 * Run: node --test --test-force-exit test/spaltenImVerbund.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  jsLiterale, normalisiere, quellDateien, SCHEMA_DATEI, API_DIR, aliasKarte
} from "./lib/sqlScanner.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
 * BESTAND — gemessen am 2026-09-28, noch nicht behoben
 *
 * Jeder Eintrag ist ein echter Fehler, kein Fehlalarm: alle gegen die laufende
 * Datenbank geprueft. Sie stehen hier und nicht in einem Ticket, weil ein
 * Ticket nicht rot wird, wenn jemand einen weiteren dazulegt.
 * ═══════════════════════════════════════════════════════════════════════════ */
const BESTAND = new Set([
  /* users hat weder `plan` noch `first_name`/`last_name` — Altbestand aus der
     Zeit vor der Org-Umstellung. Der Plan liegt an der Organisation, der Name
     an `company_name` bzw. `contact_person`. Diese vier Stellen gehoeren
     zusammen umgestellt, nicht einzeln: wer nur `plan` korrigiert, muss wissen,
     WELCHE Organisation gemeint ist, und das ist an jeder der Stellen eine
     eigene Frage. */
  "routes/analytics.js::users.plan",
  "services/productAnalyticsService.js::users.plan",
  "routes/staffControlCenter.js::users.first_name",
  "routes/staffControlCenter.js::users.last_name",
  "services/staffControlService.js::users.first_name",
  "services/staffControlService.js::users.last_name",

  /* Einzelbefunde, jeder mit eigener Vorgeschichte — nicht sammelbehebbar. */
  "routes/approvals.js::assignments.title",
  "services/assignmentStaffingService.js::assignment_staffing_invites.created_at",
  "services/assignmentStaffingService.js::requests.location_city",
  "services/staffCombinedInboxService.js::organizations.email"
]);

/* Aliasse, deren Tabelle der Aufloeser zwar findet, die aber etwas anderes
   meinen (z. B. ein CTE, das zufaellig wie eine Tabelle heisst). Zurzeit keine;
   der Eintrag bliebe hier mit Begruendung stehen. */
const ALIAS_LUEGT = new Set([]);

/* ═══════════════════════════════════════════════════════════════════════════
 * LAUF
 * ═══════════════════════════════════════════════════════════════════════════ */

const schemaVorhanden = fs.existsSync(SCHEMA_DATEI);
const schema = schemaVorhanden ? JSON.parse(fs.readFileSync(SCHEMA_DATEI, "utf8")) : null;
const TABELLEN = (schema && schema.tabellen) || {};
const SICHTEN = new Set((schema && schema.sichten) || []);

const SPALTENBEZUG = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;

export function pruefeQuelle(rel, src, zaehler) {
  const befunde = [];
  const gesehen = new Set();
  for (const lit of jsLiterale(src)) {
    const sql = normalisiere(lit.text);
    /* NUR die Luecke: mehrrelationale SELECTs. Einrelationale deckt der
       Schema-Waechter ab, und zwar gruendlicher (er kennt auch INSERT/UPDATE). */
    if (!/\bJOIN\b/i.test(sql) || !/\bSELECT\b/i.test(sql)) continue;
    zaehler.literale++;
    const karte = aliasKarte(sql);
    SPALTENBEZUG.lastIndex = 0;
    let m;
    while ((m = SPALTENBEZUG.exec(sql))) {
      const alias = m[1].toLowerCase();
      const spalte = m[2].toLowerCase();
      if (ALIAS_LUEGT.has(alias)) continue;
      const tab = karte.get(alias);
      /* Unbekannter Alias, Sicht oder unbekannte Relation: NICHT raten. Genau
         diese Zurueckhaltung ist der Grund, warum es keine Fehlalarme gibt. */
      if (!tab || SICHTEN.has(tab) || !TABELLEN[tab]) continue;
      zaehler.geprueft++;
      if (TABELLEN[tab].spalten.includes(spalte)) continue;
      const schluessel = `${rel}::${tab}.${spalte}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      befunde.push({ rel, zeile: lit.zeile, alias, tab, spalte, schluessel });
    }
  }
  return befunde;
}

const zaehler = { dateien: 0, literale: 0, geprueft: 0 };
const alleBefunde = [];
if (schemaVorhanden) {
  for (const datei of quellDateien()) {
    zaehler.dateien++;
    const rel = path.relative(API_DIR, datei).replace(/\\/g, "/");
    alleBefunde.push(...pruefeQuelle(rel, fs.readFileSync(datei, "utf8"), zaehler));
  }
}
const neu = alleBefunde.filter((b) => !BESTAND.has(b.schluessel));

function zeige(b) {
  const da = TABELLEN[b.tab] ? TABELLEN[b.tab].spalten : [];
  const nah = da.filter((s) => s.includes(b.spalte.split("_")[0]) || b.spalte.includes(s.split("_")[0])).slice(0, 5);
  return `  ${b.rel}:${b.zeile}\n      ${b.alias}.${b.spalte}  —  ${b.tab} hat diese Spalte nicht` +
         (nah.length ? `\n      es gibt dort: ${nah.join(", ")}` : "");
}

describe("Spalten im Verbund — Spaltennamen in Abfragen MIT Join", () => {
  it("die Momentaufnahme traegt Tabellen und Sichten", () => {
    /* Notbremse: ohne Momentaufnahme prueft diese Datei nichts und meldet
       trotzdem gruen. */
    assert.ok(schemaVorhanden, `Momentaufnahme fehlt: ${SCHEMA_DATEI}`);
    assert.ok(Object.keys(TABELLEN).length >= 150,
      `nur ${Object.keys(TABELLEN).length} Relationen — npm run schema:snapshot laufen lassen`);
  });

  it("der Korpus wird wirklich gelesen", () => {
    assert.ok(zaehler.dateien >= 100, `nur ${zaehler.dateien} Quelldateien`);
    assert.ok(zaehler.literale >= 200, `nur ${zaehler.literale} SQL-Literale mit Join`);
    assert.ok(zaehler.geprueft >= 3000, `nur ${zaehler.geprueft} Spaltenpruefungen`);
  });

  it("kein NEUER Spaltenfehler in einer Abfrage mit Join", () => {
    assert.deepEqual(
      neu.map((b) => b.schluessel),
      [],
      `\n\n${neu.length} neue(r) Spaltenfehler:\n\n${neu.map(zeige).join("\n\n")}\n\n` +
      `Eine Abfrage mit einem Join verschluckt so etwas nicht — sie WIRFT. Je nach\n` +
      `Aufrufer wird daraus eine 500 oder ein leises catch, und beides sieht fuer\n` +
      `den Nutzer aus wie "es gibt hier nichts".\n`
    );
  });

  it("die Bestandsliste enthaelt nichts Behobenes mehr", () => {
    const gesehen = new Set(alleBefunde.map((b) => b.schluessel));
    const behoben = [...BESTAND].filter((k) => !gesehen.has(k));
    assert.deepEqual(behoben, [],
      `\nbehoben, aber noch in BESTAND — Eintrag streichen und begruenden:\n  ${behoben.join("\n  ")}\n`);
  });

  it("erkennt die gemessenen Fehler in einer Nachbildung wieder", () => {
    /*
     * Die Selbstprobe. Jeder Fall unten stand am 2026-09-28 so im Bestand; die
     * ersten beiden sind inzwischen behoben, die anderen stehen in BESTAND.
     */
    const faelle = [
      ["org_memberships.role",
       "SELECT 1 FROM company_profiles cp JOIN org_memberships om ON om.user_id = cp.user_id AND om.role = 'owner'"],
      ["capacity_posts.workers_count",
       "SELECT SUM(cp.workers_count) FROM vendor_pool vp LEFT JOIN capacity_posts cp ON cp.id = vp.id"],
      ["users.plan",
       "SELECT u.plan FROM users u JOIN organizations o ON o.id = u.id"]
    ];
    for (const [name, sql] of faelle) {
      const z = { dateien: 0, literale: 0, geprueft: 0 };
      const b = pruefeQuelle("nachbildung.js", "const q = `" + sql + "`;", z);
      assert.ok(b.some((x) => `${x.tab}.${x.spalte}` === name), `nicht erkannt: ${name}`);
    }

    /* Gegenprobe: richtige Abfragen duerfen nicht melden — und vor allem darf
       ein UNBEKANNTER Alias nichts ausloesen, sonst ertrinkt der Waechter in
       Fehlalarmen aus Unterabfragen und CTEs. */
    const richtig = [
      "SELECT u.email FROM users u JOIN org_memberships om ON om.user_id = u.id",
      "SELECT cp.headcount FROM capacity_posts cp JOIN users u ON u.id = cp.supplier_company_id",
      "SELECT x.irgendwas FROM (SELECT 1 AS irgendwas) x JOIN users u ON TRUE",
      "SELECT t.frei FROM users u JOIN LATERAL (SELECT 1 AS frei) t ON TRUE"
    ];
    for (const sql of richtig) {
      const z = { dateien: 0, literale: 0, geprueft: 0 };
      const b = pruefeQuelle("nachbildung.js", "const q = `" + sql + "`;", z);
      assert.deepEqual(b.map((x) => x.schluessel), [], `Fehlalarm bei: ${sql}`);
    }
  });
});
