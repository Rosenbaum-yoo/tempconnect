import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { csrfProtect } from "../middleware/auth.js";
import { createInternalRouter } from "../routes/internal.js";

/*
 * DER GETAKTETE WEG WAR DREI MONATE LANG ZU — und niemand hat es gemerkt.
 *
 * BEFUND (2026-08-23 am laufenden Container gemessen): `POST /api/internal/*`
 * mit `X-Internal-Secret` antwortete **403 CSRF_INVALID**. `csrfProtect` haengt
 * unter `app.use("/api/", …)` und laeuft VOR dem internen Router; die
 * Ausnahmeliste kannte `/internal/` nicht. Jede Frist, die an diesem Weg hing —
 * staffing-maintenance, recompute-deal-reliability, seit Migration 193 auch die
 * Ersatz-Frist — lief nie. Kein Crontab im Repo, kein Scheduler-Container,
 * 0 Aufrufe in 72 h Log: der Ausfall war vollstaendig und lautlos.
 *
 * WARUM DIE AUSNAHME SICHER IST: CSRF schuetzt AMBIENT-Cookie-Anmeldungen. Ein
 * eigener Kopf loest einen CORS-Preflight aus, den diese API nicht beantwortet
 * — ein fremder Tab kann `X-Internal-Secret` also nicht setzen. Dieselbe
 * Begruendung wie bei der `X-API-Key`-Ausnahme daneben.
 *
 * DIESE DATEI HAELT DIE ZWEI ENGFUEHRUNGEN FEST, ohne die die Ausnahme eine
 * Luecke waere:
 *   1. NUR MIT KOPF — sonst stuende in Umgebungen ohne Secret gar nichts mehr
 *      vor 28 Endpunkten.
 *   2. NUR `/internal/`, NIE `/internal-control/` — die zweite Flaeche ist
 *      session-basiert (requireAuth) und braucht CSRF unveraendert.
 */

const GEHEIM = "cron-geheimnis-fuer-die-probe";

/** Baut die echte Kette: csrfProtect unter /api/, danach die Router. */
function bauApp({ secret = GEHEIM } = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/", csrfProtect);
  const v1 = express.Router();
  v1.use(createInternalRouter({
    pool: { query: async () => ({ rows: [], rowCount: 0 }) },
    config: { INTERNAL_CRON_ALLOWED_IPS: [], INTERNAL_CRON_SECRET: secret },
    cronRateLimit: (_q, _s, n) => n(),
    logger: { warn() {}, error() {}, info() {} },
    sendMail: async () => true,
  }));
  /* Eine Attrappe der SESSION-basierten Nachbarflaeche. Sie muss CSRF behalten:
   * `/internal-control/*` haengt an `requireAuth`, also an einem Cookie. */
  v1.post("/internal-control/probe", (_req, res) => res.json({ ok: true }));
  app.use("/api", v1);
  return app;
}

async function ruf(app, pfad, kopf) {
  const srv = app.listen(0);
  try {
    const port = srv.address().port;
    const r = await fetch(`http://127.0.0.1:${port}${pfad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(kopf || {}) },
      body: "{}",
    });
    let koerper = {};
    try { koerper = await r.json(); } catch { /* leer */ }
    return { status: r.status, koerper };
  } finally {
    srv.close();
  }
}

describe("Cron ohne CSRF — der Kopf ist der Beweis, nicht der Pfad", () => {
  it("MIT gueltigem Secret-Kopf kommt der Cron durch", async () => {
    const r = await ruf(bauApp(), "/api/internal/expire-reservations", { "X-Internal-Secret": GEHEIM });
    assert.notEqual(r.koerper?.error, "CSRF_INVALID",
      "Genau das war der Befund: der dokumentierte Cron-Aufruf scheiterte an CSRF, " +
      "bevor er den Cron-Waechter ueberhaupt erreichte.");
    assert.notEqual(r.status, 403);
  });

  it("OHNE Kopf bleibt CSRF in Kraft", async () => {
    const r = await ruf(bauApp(), "/api/internal/expire-reservations", null);
    assert.equal(r.status, 403);
    assert.equal(r.koerper?.error, "CSRF_INVALID",
      "Ohne diese Engfuehrung stuende in Umgebungen ohne INTERNAL_CRON_SECRET " +
      "gar nichts mehr vor 28 Endpunkten — `checkCronAuth` schaltete sich dort " +
      "frueher selbst ab, und CSRF war die einzige verbliebene Sperre.");
  });

  it("der Kopf allein oeffnet nichts — das falsche Secret faellt am Cron-Waechter", async () => {
    const r = await ruf(bauApp(), "/api/internal/expire-reservations", { "X-Internal-Secret": "falsch" });
    assert.equal(r.status, 403);
    assert.equal(r.koerper?.error, "FORBIDDEN",
      "die CSRF-Ausnahme darf die Cron-Pruefung nicht ersetzen, nur davorlassen");
  });
});

describe("Cron ohne CSRF — die Nachbarflaeche bleibt geschuetzt", () => {
  it("/internal-control/ behaelt CSRF, auch MIT Secret-Kopf", async () => {
    /* Die Wortgrenze im Muster ist der ganze Unterschied: `/internal-control/`
     * ist "internal-" plus Rest, nicht "internal/". Ein schlampigeres Muster
     * (etwa /internal/.test(path)) haette einer session-basierten
     * Staff-Flaeche den CSRF-Schutz genommen. */
    const r = await ruf(bauApp(), "/api/internal-control/probe", { "X-Internal-Secret": GEHEIM });
    assert.equal(r.status, 403);
    assert.equal(r.koerper?.error, "CSRF_INVALID");
  });

  it("S: das Muster trennt beide Flaechen — auch mit Versionspraefix", () => {
    /* Rueckmutation gegen das schlampige Muster: ohne diese Probe faellt der
     * Unterschied erst auf, wenn jemand die Staff-Flaeche angreift. */
    const eng = /^(\/v\d+)?\/internal\//;
    const schlampig = /internal/;
    for (const pfad of ["/internal-control/x", "/v1/internal-control/x"]) {
      assert.ok(!eng.test(pfad), `${pfad} darf NICHT befreit werden`);
      assert.ok(schlampig.test(pfad),
        "das schlampige Muster wuerde die session-basierte Flaeche mit befreien — " +
        "genau davor schuetzt die Wortgrenze");
    }
    for (const pfad of ["/internal/x", "/v1/internal/x"]) {
      assert.ok(eng.test(pfad), `${pfad} muss befreit werden`);
    }
    /* csrfProtect haengt unter app.use("/api/", …) — req.path ist dort bereits
     * um /api gekuerzt. Ein Muster, das /api mitliest, greift nie. */
    assert.ok(!eng.test("/api/internal/x"),
      "der Pfad kommt ohne /api an; wer es mitschreibt, baut eine Ausnahme, die nie feuert");
  });
});

describe("Cron-Waechter — ohne Secret bleibt zu, statt sich abzuschalten", () => {
  /*
   * Vorher: `if (cronSecret && …)`. Ohne Geheimnis uebersprang die Wache sich
   * selbst. Das fiel nicht auf, weil csrfProtect diese Endpunkte ohnehin
   * pauschal abwies — CSRF war die eigentliche, UNBEABSICHTIGTE Sperre. Mit der
   * Ausnahme oben faellt dieser Zufall weg; die Wache muss die Last jetzt
   * allein tragen.
   */
  it("ohne konfiguriertes Secret: 503, nicht offen", async () => {
    const r = await ruf(bauApp({ secret: "" }), "/api/internal/expire-reservations",
      { "X-Internal-Secret": "irgendwas" });
    assert.equal(r.status, 503);
    assert.equal(r.koerper?.error, "CRON_NOT_CONFIGURED",
      "Eine Umgebung ohne INTERNAL_CRON_SECRET haette sonst 28 ungeschuetzte " +
      "Endpunkte: Stapel-Verfall, Loeschlaeufe, Abrechnung.");
  });

  it("auch ohne Kopf bleibt es 503 — nicht 200", async () => {
    const r = await ruf(bauApp({ secret: "" }), "/api/internal/expire-reservations",
      { "X-Internal-Secret": "" });
    assert.notEqual(r.status, 200);
  });
});
