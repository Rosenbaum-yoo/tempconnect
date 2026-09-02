/**
 * Die Paywall kann ueberhaupt erscheinen — und sagt das Richtige (M1.5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DER BEFUND, GEMESSEN AM 2026-09-02
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 20 von 23 bewachten Seiten trugen `data-sla-guard="sla_access"`. Dieser
 * Schluessel ist fuer JEDEN Plan wahr. `slaGuard.js` fragt
 * `PlanFeatures.hasFeature(plan, feature)` — die Antwort war also immer ja,
 * und der fertige Paywall-Block konnte nie wegen des Plans erscheinen. Er
 * erschien ausschliesslich im Stoerfall, im `.catch`-Zweig.
 *
 * Darunter die beiden Seiten, auf denen etwas ENTSTEHT. Ein DEMO-Konto
 * fuellte das ganze Formular aus und bekam beim Absenden:
 *
 *     Kapazitaetsboerse   429 PLAN_LIMIT_REACHED    (listings-Limit ist 0)
 *     Marktplatz-Bedarf   403 WORKER_LIMIT_EXCEEDED (max_workers ist 0)
 *
 * Wichtig fuer die Einordnung: **kein Sicherheitsloch.** Beide Wege halten,
 * DEMO kann nichts erzeugen. Falsch war der ZEITPUNKT (nach der Arbeit statt
 * davor) und die BOTSCHAFT (eine Quoten- bzw. Kopfzahl-Meldung, wo eine
 * Planaussage gehoert).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE PLANLISTEN ABGELEITET SIND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Die neuen Schluessel enthalten genau die Plaene, deren zugehoeriges Limit
 * nicht null ist — also die, die es ohnehin schon duerfen. Damit trifft M1.5
 * KEINE neue Preisentscheidung: der Schluessel sagt nur vorher, was das
 * Backend hinterher ohnehin entscheidet.
 *
 * Diese Datei rechnet die Ableitung nach. Aendert jemand ein Limit und nicht
 * die Liste (oder umgekehrt), wird sie rot. Zwei Wahrheiten ueber dieselbe
 * Frage sind genau der Zustand, den diese Welle abschafft.
 *
 * Run: node --test --test-force-exit test/paywallSchluessel.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planFeatures, hasFeature } from "../config/planFeatures.js";
import { PLAN_LIMITS } from "../services/userService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");
const quelle = (rel) => fs.readFileSync(path.join(API, rel), "utf8");

/** Die oeffentlichen Plaene, in der Reihenfolge des Katalogs. */
const PLAENE = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];

/** Plaene, deren Limit fuer `metrik` nicht null ist — sie duerfen es schon. */
function plaeneMitLimit(metrik) {
  return PLAENE.filter((p) => Number(PLAN_LIMITS[p]?.[metrik]) !== 0);
}

/* ── Die Ableitung ────────────────────────────────────────────────────── */

describe("M1.5 · die Erstellen-Schluessel sind ABGELEITET, nicht erfunden", () => {
  const paare = [
    ["capacity_exchange_create", "listings"],
    ["marketplace_demand_create", "max_workers_per_request"]
  ];

  for (const [key, metrik] of paare) {
    it(`${key} deckt sich mit dem Limit "${metrik}"`, () => {
      const soll = plaeneMitLimit(metrik).sort();
      const ist = [...(planFeatures[key] || [])].sort();
      assert.deepEqual(ist, soll,
        `Schluessel und Limit sind auseinandergelaufen. Entweder das Limit in `
        + `PLAN_LIMITS oder die Liste in planFeatures.js ist falsch — zwei `
        + `Wahrheiten ueber dieselbe Frage gibt es nicht.`);
    });
  }

  it("DEMO darf browsen, aber nicht erstellen — der ganze Anlass", () => {
    assert.equal(hasFeature("DEMO", "sla_access"), true, "Browsen bleibt frei ab Konto");
    assert.equal(hasFeature("DEMO", "capacity_exchange_basic"), true, "Feed bleibt sichtbar");
    assert.equal(hasFeature("DEMO", "capacity_exchange_create"), false);
    assert.equal(hasFeature("DEMO", "marketplace_demand_create"), false);
  });

  it("BASIS darf erstellen — sein Limit sagt das seit jeher", () => {
    /* Ohne diese Probe waere die naheliegende Abkuerzung "nur PLUS und
     * aufwaerts duerfen erstellen" — und die haette einen zahlenden
     * BASIS-Kunden ausgesperrt, dem PLAN_LIMITS fuenf Anzeigen zusagt. */
    assert.equal(Number(PLAN_LIMITS.BASIS.listings), 5);
    assert.equal(hasFeature("BASIS", "capacity_exchange_create"), true);
    assert.equal(hasFeature("BASIS", "marketplace_demand_create"), true);
  });

  it("die Selbstprobe: die Ableitung ist nicht trivial wahr", () => {
    /* Waere `plaeneMitLimit` kaputt und lieferte alle Plaene, waeren die
     * Proben oben gruen und wertlos. */
    const p = plaeneMitLimit("listings");
    assert.ok(!p.includes("DEMO"), "DEMO hat listings=0 und darf nicht dabei sein");
    assert.ok(p.includes("PRO"), "PRO hat listings=-1 (unbegrenzt) und muss dabei sein");
    assert.equal(p.length, PLAENE.length - 1);
  });
});

/* ── Die Verdrahtung ──────────────────────────────────────────────────── */

describe("M1.5 · der Schluessel haengt an Seite UND Route", () => {
  const paare = [
    { key: "capacity_exchange_create", seite: "capacity_exchange_form.html", route: "routes/capacityExchange.js" },
    { key: "marketplace_demand_create", seite: "marketplace_demand_create.html", route: "routes/marketplace.js" }
  ];

  const PUB = path.resolve(API, "..", "frontend", "public");
  const vorhanden = fs.existsSync(path.join(PUB, "capacity_exchange_form.html"));
  const wenn = vorhanden ? it : it.skip;

  for (const { key, seite, route } of paare) {
    wenn(`${seite} traegt ${key}`, () => {
      const html = fs.readFileSync(path.join(PUB, seite), "utf8");
      assert.ok(html.includes(`data-sla-guard="${key}"`),
        `die Seite traegt den Schluessel nicht — die Paywall erscheint dort nie wegen des Plans`);
      assert.ok(!html.includes('data-sla-guard="sla_access"'),
        "der plan-blinde Schluessel steht noch daneben");
    });

    it(`die Route in ${route} verlangt ${key}`, () => {
      const s = quelle(route).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert.ok(s.includes(`requireFeature("${key}")`),
        "das Backend entscheidet, die Seite zeigt nur an — sonst ist die Paywall Zierde");
    });
  }

  wenn("die Paywall zeigt einen Namen, keinen technischen Schluessel", () => {
    const g = fs.readFileSync(path.join(PUB, "js", "slaGuard.js"), "utf8");
    for (const { key } of paare) {
      assert.ok(new RegExp(`${key}:\\s*"`).test(g),
        `${key} fehlt im Woerterbuch — die Paywall zeigt sonst den rohen Schluessel`);
    }
  });

  it("beide Schluessel stehen im Plan-Katalog", () => {
    /* Ohne Katalog-Eintrag taucht die Faehigkeit in der Abo-Uebersicht nicht
     * auf: der Kunde saehe eine Paywall fuer etwas, das die Plan-Tabelle gar
     * nicht nennt — und haette keinen Weg, sie zu lesen. */
    const k = quelle("config/planCatalog.js");
    for (const { key } of paare) {
      assert.ok(k.includes(`feature_key: "${key}"`),
        `${key} fehlt im Plan-Katalog — die Paywall verwiese ins Leere`);
    }
  });

  it("der Erstellen-Schluessel steht VOR dem Mengen-Limit", () => {
    /*
     * Reihenfolge ist hier Inhalt: stuende `listingsLimitGate` zuerst, bekaeme
     * ein DEMO-Konto weiterhin 429 PLAN_LIMIT_REACHED statt der Planaussage —
     * genau die Meldung, wegen der diese Welle existiert.
     */
    const s = quelle("routes/capacityExchange.js");
    const zeile = s.split("\n").find((z) => z.includes('router.post("/capacity-exchange/entries"'));
    assert.ok(zeile, "die Erstellen-Route wurde nicht gefunden");
    assert.ok(zeile.indexOf("ceCreate") < zeile.indexOf("listingsLimitGate"),
      `Reihenfolge falsch: ${zeile.trim().slice(0, 120)}`);
  });
});
