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
  /* LEER seit dem 2026-09-28 (Welle Z18) - alle dreizehn Funde sind behoben, am
   * selben Tag, an dem dieser Waechter sie zum ersten Mal sichtbar gemacht hat.
   *
   * Was sie gekostet haben, jeder Fall an der laufenden Datenbank geprueft:
   *
   *   org_memberships.role (3x, sie heisst role_key)
   *       das OEFFENTLICHE Firmenprofil hat nie geladen; die
   *       Abo-Benachrichtigung erreichte den Eigentuemer nie, sobald keine
   *       contact_email hinterlegt war; die ab PRO verkaufte Rangliste warf.
   *   capacity_posts.workers_count (sie heisst headcount)
   *       GET /preferred-vendors/capacity antwortete IMMER mit 500.
   *   users.first_name / users.last_name (4x in staffControlCenter, 1x in
   *   staffControlService; users kennt den Menschen als contact_person)
   *       die Fall-Listen des Staff Control Center blieben leer - darunter die
   *       Liste der DSGVO-ANFRAGEN, sortiert nach Frist. Sie war dauerhaft leer,
   *       waehrend die gesetzlichen Fristen liefen, und der Aufrufer faengt: es
   *       sah aus, als gaebe es nichts zu tun.
   *   users.plan (2x; der Tarif haengt seit der Org-Umstellung an organizations)
   *   assignments.title (das Hausmuster ist worker_description)
   *       die Bestaetigungsliste des Arbeiters blieb leer.
   *   assignment_staffing_invites.created_at (richtig: sent_at)
   *       ein Arbeiter hat seine Einsatz-Einladungen GAR NICHT gesehen.
   *   requests.location_city (dort heisst es location_text)
   *   organizations.email (richtig: billing_email)
   *       die Detailansicht des Staff-Posteingangs fiel aus: die Liste lud, das
   *       Oeffnen eines Vorgangs nicht.
   *
   * EINE STELLE WURDE ABSICHTLICH NICHT ANGEFASST, und sie ist die Lehre: in
   * `assignmentStaffingService` steht `r.location_city` fuenfmal. Viermal ist
   * `r` = `requisitions`, und DIE hat die Spalte - nur an der fuenften ist
   * `r` = `requests`. Dieser Waechter hat genau die fuenfte gemeldet und die
   * vier anderen nicht. Wer nach Spaltennamen sucht statt nach aufgeloesten
   * Aliassen, haette hier vier richtige Abfragen gebrochen.
   */
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
    /*
     * Z19 (2026-09-28): KEIN Filter auf JOIN mehr.
     *
     * Bis hierher stand: "nur mehrrelationale SELECTs, einrelationale deckt der
     * Schema-Waechter ab". Der zweite Halbsatz stimmt, der Filter war trotzdem zu
     * eng — eine Abfrage kann OHNE Join mehrrelational sein, naemlich durch eine
     * Unterabfrage. Genau dort standen noch zwei echte Fehler, die BEIDE Wachen
     * durchgelassen haben:
     *
     *   routes/companyTimesheets.js   u.first_name / u.last_name
     *       Die Abfrage steht in einem Promise.all. Sie warf, also warf das
     *       Promise.all: die Benachrichtigung an die Zeitarbeitsfirma ueber einen
     *       gesperrten Stundenzettel ging NIE raus.
     *   routes/vendorPool.js          o.org_type  (die Spalte heisst `type`)
     *       Die Lieferantensuche lieferte nichts — man konnte keinen
     *       Vorzugslieferanten hinzufuegen, weil man keinen finden konnte.
     *
     * Beide entgingen dem Schema-Waechter, weil eine Unterabfrage sie
     * mehrrelational macht, und dieser Datei, weil kein JOIN darin steht. Eine
     * Luecke ZWISCHEN zwei Wachen ist teurer als eine offene, weil beide gruen
     * melden und das Fehlen deshalb wie Abdeckung aussieht.
     *
     * Doppelmeldungen mit dem Schema-Waechter sind ausdruecklich in Kauf
     * genommen: zwei Wachen, die dasselbe melden, kosten eine Zeile Lesezeit —
     * eine Luecke zwischen ihnen kostet einen Kundenausfall.
     */
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;
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

describe("Spalten im Verbund — Spaltennamen gegen den aufgeloesten Alias", () => {
  it("die Momentaufnahme traegt Tabellen und Sichten", () => {
    /* Notbremse: ohne Momentaufnahme prueft diese Datei nichts und meldet
       trotzdem gruen. */
    assert.ok(schemaVorhanden, `Momentaufnahme fehlt: ${SCHEMA_DATEI}`);
    assert.ok(Object.keys(TABELLEN).length >= 150,
      `nur ${Object.keys(TABELLEN).length} Relationen — npm run schema:snapshot laufen lassen`);
  });

  it("der Korpus wird wirklich gelesen", () => {
    assert.ok(zaehler.dateien >= 100, `nur ${zaehler.dateien} Quelldateien`);
    assert.ok(zaehler.literale >= 900, `nur ${zaehler.literale} SQL-Literale`);
    assert.ok(zaehler.geprueft >= 6000, `nur ${zaehler.geprueft} Spaltenpruefungen`);
  });

  it("kein NEUER Spaltenfehler in einer Abfrage mit aufloesbarem Alias", () => {
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

    /*
     * Z19: die SCHREIBENDEN Formen, und sie brauchen diese Probe dringender als
     * die lesenden.
     *
     * `aliasKarte` loest seit Z19 auch `UPDATE x y`, `DELETE ... USING x y` und
     * `INSERT INTO x y` auf. Gemessen stehen in den 138 schreibenden Abfragen des
     * Bestands KEINE Fehler — die Erweiterung wird also von keinem echten Fund
     * gedeckt, und eine Rueckmutation, die sie zuruecknimmt, blieb gruen. Eine
     * Erweiterung, deren Wirkung nichts belegt, ist eine Behauptung: sie kann
     * jederzeit still zurueckgenommen werden, und niemand merkt es.
     *
     * Deshalb wird sie hier an einer Nachbildung belegt. Dass der Bestand heute
     * sauber ist, ist der Grund FUER diese Probe, nicht dagegen.
     */
    const schreibend = [
      ["UPDATE", "UPDATE users u SET u.gibtsnicht = 1 WHERE u.id = $1"],
      ["DELETE USING", "DELETE FROM assignments a USING users u WHERE u.gibtsnicht = a.id"],
      ["INSERT INTO", "INSERT INTO organizations o (o.gibtsnicht) SELECT 1"]
    ];
    for (const [form, sql] of schreibend) {
      const z = { dateien: 0, literale: 0, geprueft: 0 };
      const b = pruefeQuelle("nachbildung.js", "const q = `" + sql + "`;", z);
      assert.ok(b.some((x) => x.spalte === "gibtsnicht"),
        `${form} wird nicht aufgeloest — aliasKarte deckt die Form nicht mehr`);
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
