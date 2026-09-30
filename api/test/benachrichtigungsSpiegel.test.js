/**
 * Waechter gegen Drift zwischen Server und Oberflaeche bei Benachrichtigungen.
 *
 * WARUM ES DIESEN TEST GIBT
 * Ein Benachrichtigungstyp muss an DREI Orten stimmen, sonst wirkt er nur halb:
 *   1. `notifications.type` CHECK in der Datenbank — fehlt er, scheitert der
 *      INSERT STILL (genau die Drift, die Migration 139 schliessen musste).
 *   2. `notificationSurfaceMap` auf dem Server — fehlt er, bleibt die Meldung in
 *      der Glocke und erreicht die Hub-Karte nie.
 *   3. `hubCardBadges.js` in der Oberflaeche — dort steht eine HANDGEPFLEGTE
 *      Kopie der Zuordnung, mit dem Kommentar "bei Aenderung dort synchron
 *      halten". Eine Bitte ist keine Zusicherung; dieser Test macht eine daraus.
 *
 * Run: node --test --test-force-exit test/benachrichtigungsSpiegel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { surfaceForType, SURFACE_KEYS } from "../services/notificationSurfaceMap.js";
import { getMatrix } from "../services/notificationMatrix.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SPIEGEL = path.join(REPO_ROOT, "frontend/public/js/hubCardBadges.js");
const hasDb = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.POSTGRES_PASSWORD));

/*
 * Im API-Container ist nur `api/` gemountet — `frontend/` gibt es dort nicht.
 * Ohne diese Weiche wuerde der Test beim Laden mit ENOENT abstuerzen statt sauber
 * zu ueberspringen, und die Suite meldete einen Fehler, den niemand zuordnen kann.
 * (Dieselbe Falle ist im Projekt schon einmal zugeschnappt.)
 */
const spiegelVorhanden = fs.existsSync(SPIEGEL);

/** Liest die handgepflegte Kopie aus der Oberflaeche. */
function spiegelZuordnung() {
  const quelle = fs.readFileSync(SPIEGEL, "utf8");
  const start = quelle.indexOf("var TYPES_BY_SURFACE = {");
  assert.ok(start >= 0, "TYPES_BY_SURFACE nicht gefunden — wurde die Kopie umbenannt?");
  const block = quelle.slice(start, quelle.indexOf("};", start));

  const map = {};
  const re = /(\w+):\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) {
    map[m[1]] = m[2].split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return map;
}

describe("Benachrichtigungen · Server und Oberflaeche sagen dasselbe",
  { skip: !spiegelVorhanden && "frontend/ nicht verfuegbar (API-Container)" }, () => {
  const spiegel = spiegelVorhanden ? spiegelZuordnung() : {};

  it("jeder Typ der Oberflaechen-Kopie liegt serverseitig auf derselben Flaeche", () => {
    const abweichungen = [];
    for (const [flaeche, typen] of Object.entries(spiegel)) {
      for (const typ of typen) {
        const serverFlaeche = surfaceForType(typ);
        if (serverFlaeche !== flaeche) {
          abweichungen.push(`${typ}: Oberflaeche sagt "${flaeche}", Server sagt "${serverFlaeche}"`);
        }
      }
    }
    assert.deepEqual(abweichungen, [], "\n" + abweichungen.join("\n"));
  });

  it("kein serverseitig zugeordneter Typ fehlt in der Oberflaechen-Kopie", () => {
    // Sonst zaehlt die Hub-Karte die Meldung nicht mit: sie erscheint in der
    // Glocke, aber das Abzeichen auf der Karte bleibt aus — der Nutzer sieht
    // nicht, wo er hinschauen soll.
    const bekannt = new Set(Object.values(spiegel).flat());
    const fehlend = [];
    for (const typ of Object.keys(getTypenMitFlaeche())) {
      if (!bekannt.has(typ)) fehlend.push(`${typ} (Flaeche ${surfaceForType(typ)})`);
    }
    assert.deepEqual(fehlend, [],
      "In frontend/public/js/hubCardBadges.js nachtragen:\n" + fehlend.join("\n"));
  });

  it("jedes Matrix-Ereignis nennt einen Typ, den die Surface-Map kennt oder bewusst nicht kennt", () => {
    // "Bewusst nicht" ist erlaubt (general/system, Worker-Typen) — unbekannt in
    // BEIDEN Richtungen waere dagegen ein Tippfehler.
    const matrix = getMatrix();
    for (const [ereignis, cfg] of Object.entries(matrix)) {
      assert.ok(typeof cfg.type === "string" && cfg.type.length > 0,
        `Ereignis ${ereignis} hat keinen Typ`);
    }
  });

  it("die drei Bounty-Anstupser sind vollstaendig verdrahtet", () => {
    for (const typ of ["bounty_near", "bounty_earned", "bounty_lost"]) {
      assert.equal(surfaceForType(typ), "bounties", `${typ} fehlt in der Surface-Map`);
      assert.ok(Object.values(spiegel).flat().includes(typ), `${typ} fehlt in der Oberflaechen-Kopie`);
    }
    const matrix = getMatrix();
    for (const ereignis of ["bounty.near", "bounty.earned", "bounty.lost"]) {
      assert.ok(matrix[ereignis], `Matrix-Eintrag ${ereignis} fehlt — dispatch() wuerde still verwerfen`);
      assert.equal(matrix[ereignis].linkPath, "/public/bounties.html");
    }
  });

  it("SURFACE_KEYS enthaelt die Bounty-Flaeche", () => {
    assert.ok(SURFACE_KEYS.includes("bounties"));
  });
});

/** Alle serverseitig einer Flaeche zugeordneten Typen (ueber die Matrix erschlossen). */
function getTypenMitFlaeche() {
  const treffer = {};
  for (const cfg of Object.values(getMatrix())) {
    const flaeche = surfaceForType(cfg.type);
    if (flaeche) treffer[cfg.type] = flaeche;
  }
  return treffer;
}

/* ── An der Datenbank: der CHECK muss die Typen kennen ─────────────────── */

describe("Benachrichtigungen · Die Datenbank kennt jeden Typ der Matrix",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("kein Matrix-Typ fehlt im CHECK von notifications.type", async () => {
    // Fehlt einer, scheitert der INSERT still — die Meldung kommt nie an, und
    // niemand merkt es, weil dispatch() den Fehler nicht wirft.
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        || `postgres://${process.env.DB_USER || "tempconnect"}:${process.env.POSTGRES_PASSWORD}`
           + `@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || "tempconnect"}`
    });
    try {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'notifications'::regclass AND conname = 'notifications_type_check'`
      );
      assert.ok(rows[0], "notifications_type_check existiert nicht");
      const def = rows[0].def;

      const fehlend = [...new Set(Object.values(getMatrix()).map((c) => c.type))]
        .filter((typ) => !def.includes(`'${typ}'`) && !def.includes(`"${typ}"`) && !def.includes(typ));
      assert.deepEqual(fehlend, [],
        "Diese Typen werden dispatched, stehen aber nicht im CHECK — die INSERTs "
        + "scheitern still:\n" + fehlend.join("\n"));

      /*
       * ZWEITE QUELLE, GLEICHE PFLICHT (Nachtrag 2026-08-24): Dieser Waechter
       * pruefte bislang nur die Matrix; die Typen aus workerNotificationService
       * (SEVERITY_MAP) fielen durchs Netz. Dort ist der Fehlermodus noch
       * heimtueckischer: notifyWorker degradiert einen unbekannten Typ STILL zu
       * 'general' und die Meldung verliert im Portal ihre Zusage-/Absage-
       * Knoepfe (isPending prueft den exakten Typ). Genau diese Luecke haette
       * die Ersatz-Frist (Migration 193) unbemerkt entwertet, wenn Migration
       * und Code getrennt ausgeliefert wuerden.
       */
      const quelle = fs.readFileSync(
        new URL("../services/workerNotificationService.js", import.meta.url), "utf8");
      const mapStart = quelle.indexOf("const SEVERITY_MAP = {");
      const mapBlock = quelle.slice(mapStart, quelle.indexOf("};", mapStart));
      const mapTypen = [...mapBlock.matchAll(/^\s*([a-z_]+):\s*"/gm)].map((m) => m[1]);
      assert.ok(mapTypen.length >= 20,
        "nur " + mapTypen.length + " Typen aus SEVERITY_MAP gelesen, greift das Muster noch?");
      /* Der CHECK hat ZWEI Darstellungen (Lehre aus Migration 171/184): die
       * ARRAY['a'::text,...]-Form zitiert jeden Wert, die '{a,b,c}'::text[]-
       * Literal-Form (nach einem format(%L)) laesst die Anfuehrungszeichen weg.
       * Wer nur die zitierte Form prueft, meldet nach dem ersten CHECK-Tausch
       * ALLE Typen als fehlend — exakt so beim ersten Lauf dieser Erweiterung. */
      const literal = def.match(/'(\{[^}]*\})'::text\[\]/);
      const bekannt = literal
        ? new Set(literal[1].slice(1, -1).split(",").map((w) => w.replace(/^"|"$/g, "").trim()))
        : new Set([...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
      const mapFehlt = mapTypen.filter((typ) => !bekannt.has(typ));
      assert.deepEqual(mapFehlt, [],
        "Diese Typen stehen in SEVERITY_MAP, aber nicht im CHECK. notifyWorker "
        + "degradiert sie STILL zu 'general' und die Meldung verliert ihre Knoepfe:\n"
        + mapFehlt.join("\n"));
    } finally {
      await pool.end();
    }
  });
});
