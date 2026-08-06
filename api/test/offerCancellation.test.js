/**
 * Storno-Erfassung (P8 Welle A, Mig 163).
 *
 * Der Storno-Ablauf war schon vorher vollstaendig — inklusive Rollback der
 * operativen Nebenwirkungen. Wirkungslos war er, weil niemand messen konnte, WER
 * aus WELCHEM Grund und mit WELCHEM Vorlauf storniert. Diese Suite sichert die
 * drei Rohdaten, aus denen Welle B die Zuverlaessigkeitsquote rechnet.
 *
 * Der wichtigste Test ist die Zeitzone. Bei einer 48-Stunden-Schwelle
 * (Owner-Entscheidung) entscheidet ein Zwei-Stunden-Fehler darueber, ob ein
 * Storno doppelt zaehlt oder einfach — das ist Geld.
 *
 * Run: node --test --test-force-exit test/offerCancellation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { berechneVorlaufStunden, CANCELLATION_REASONS } from "../services/dealAgreementService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");

describe("Vorlaufberechnung — Europe/Berlin, nicht UTC", () => {
  it("Sommerzeit: Einsatzbeginn ist 00:00 Berlin (= 22:00 UTC am Vortag)", () => {
    // 2026-07-15 00:00 Berlin = 2026-07-14 22:00 UTC (MESZ, UTC+2).
    // Storniert wird exakt dort -> Vorlauf 0.
    const h = berechneVorlaufStunden("2026-07-15", new Date("2026-07-14T22:00:00Z"));
    assert.equal(h, 0, "wer UTC-Mitternacht nimmt, liegt hier um zwei Stunden daneben");
  });

  it("Winterzeit: derselbe Fall mit einer Stunde Versatz (MEZ, UTC+1)", () => {
    const h = berechneVorlaufStunden("2026-01-15", new Date("2026-01-14T23:00:00Z"));
    assert.equal(h, 0);
  });

  it("48-Stunden-Schwelle wird exakt getroffen", () => {
    // 48 h vor 2026-07-15 00:00 Berlin = 2026-07-12 22:00 UTC
    assert.equal(berechneVorlaufStunden("2026-07-15", new Date("2026-07-12T22:00:00Z")), 48);
    // eine Stunde spaeter -> 47, faellt also unter die Schwelle
    assert.equal(berechneVorlaufStunden("2026-07-15", new Date("2026-07-12T23:00:00Z")), 47);
  });

  it("nach Einsatzbeginn storniert ergibt einen NEGATIVEN Vorlauf", () => {
    // Beginn = 2026-07-15 00:00 Berlin = 2026-07-14 22:00 UTC.
    // Einen Tag danach ist also 2026-07-15 22:00 UTC, nicht 2026-07-16.
    const h = berechneVorlaufStunden("2026-07-15", new Date("2026-07-15T22:00:00Z"));
    assert.equal(h, -24,
      "der teuerste Fall ueberhaupt — er darf nicht auf 0 geklemmt werden");
    // Zwei Tage danach, zur Kontrolle der Skala:
    assert.equal(berechneVorlaufStunden("2026-07-15", new Date("2026-07-16T22:00:00Z")), -48);
  });

  it("ohne bekannten Beginn: null, nicht 0", () => {
    assert.equal(berechneVorlaufStunden(null), null);
    assert.equal(berechneVorlaufStunden(""), null);
    assert.equal(berechneVorlaufStunden("kein Datum"), null);
    // 0 hiesse "storniert genau zum Beginn" — eine ganz andere Aussage.
  });

  it("nimmt auch einen Zeitstempel entgegen und liest nur den Tag", () => {
    assert.equal(
      berechneVorlaufStunden("2026-07-15T09:30:00.000Z", new Date("2026-07-14T22:00:00Z")),
      0, "der Beginn ist ein Tag, keine Uhrzeit"
    );
  });
});

describe("Stornogruende — geschlossene Liste", () => {
  it("enthaelt genau die sechs vereinbarten Gruende", () => {
    assert.deepEqual([...CANCELLATION_REASONS].sort(), [
      "customer_cancelled", "date_moved", "mistake", "other", "worker_quit", "worker_sick"
    ]);
  });

  it("'other' ist bewusst dabei", () => {
    // Ohne Sammelposten waehlen Nutzer irgendetwas Falsches — und dann luegen
    // ALLE Kategorien, nicht nur die fehlende.
    assert.ok(CANCELLATION_REASONS.includes("other"));
  });
});

describe("Service — der Grund ist Pflicht", () => {
  const nieAufgerufen = { query: async () => { throw new Error("Datenbank darf gar nicht erst gefragt werden"); } };

  it("ohne Grund: REASON_REQUIRED, ohne Datenbankzugriff", async () => {
    const { cancelAgreement } = await import("../services/dealAgreementService.js");
    const out = await cancelAgreement(nieAufgerufen, "offer-1", "user-1", {});
    assert.equal(out.error, "REASON_REQUIRED");
    assert.deepEqual(out.allowed, CANCELLATION_REASONS);
  });

  it("erfundener Grund wird abgelehnt", async () => {
    const { cancelAgreement } = await import("../services/dealAgreementService.js");
    const out = await cancelAgreement(nieAufgerufen, "offer-1", "user-1", { reason_code: "keine_lust" });
    assert.equal(out.error, "REASON_REQUIRED");
  });
});

describe("Route — die Seite kommt aus der Sitzung", () => {
  const route = fs.readFileSync(path.join(API_ROOT, "routes/marketplace.js"), "utf8");

  it("validiert gegen ein Enum, nicht gegen Freitext", () => {
    assert.match(route, /const cancelAgreementSchema = z\.object\(\{[\s\S]*?reason_code: z\.enum\(/);
  });

  it("die stornierende Seite wird NICHT aus dem Rumpf uebernommen", () => {
    const block = route.match(/cancel-agreement[\s\S]*?res\.locals\.audit/);
    assert.ok(block, "Storno-Route nicht gefunden");
    assert.match(block[0], /const side = full\.supplier_company_id === req\.session\.userId/,
      "sonst koennte sich der Stornierende als die andere Partei ausgeben");
    assert.doesNotMatch(block[0], /side: req\.body/);
  });

  it("fehlender Grund ergibt 400, nicht 409", () => {
    const block = route.match(/cancel-agreement[\s\S]*?res\.locals\.audit/);
    assert.match(block[0], /result\.error === "REASON_REQUIRED" \? 400/);
  });

  it("die Nachricht nennt die erlaubten Gruende — sonst raet der Aufrufer", () => {
    const block = route.match(/cancel-agreement[\s\S]*?res\.locals\.audit/);
    assert.match(block[0], /allowed_reasons: dealAgreementService\.CANCELLATION_REASONS/);
  });
});

describe("Migration 163", () => {
  const sql = fs.readFileSync(
    path.join(REPO_ROOT, "sql/migrations/163_offer_cancellations.sql"), "utf8"
  );

  it("ein Storno je Angebot — 'cancelled' ist Endzustand", () => {
    assert.match(sql, /offer_id\s+UUID NOT NULL UNIQUE REFERENCES offers\(id\)/);
  });

  it("Grund und Seite sind geschlossene Mengen", () => {
    assert.match(sql, /reason_code\s+TEXT NOT NULL CHECK \(reason_code IN \(/);
    assert.match(sql, /cancelled_by_side\s+TEXT NOT NULL CHECK \(cancelled_by_side IN \('company', 'agency'\)\)/);
  });

  it("speichert Rohdaten, KEIN fertiges Gewicht", () => {
    // Gespeicherte Gewichte muessten bei jeder Regelaenderung nachgezogen werden —
    // wer das vergisst, hat zwei Wahrheiten. Rohdaten sind zeitlos wahr.
    assert.match(sql, /lead_time_hours\s+INTEGER/);
    assert.doesNotMatch(sql, /ADD COLUMN[\s\S]*weight|weight\s+NUMERIC/);
  });

  it("nennt einen Rollback-Weg", () => {
    assert.match(sql, /Rollback:/);
    assert.match(sql, /DROP TABLE IF EXISTS offer_cancellations/);
  });
});
