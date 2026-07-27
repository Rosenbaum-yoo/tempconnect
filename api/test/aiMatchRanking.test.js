/**
 * KI-Ranking (P4.3) — Verhaltens-Spezifikation.
 *
 * Der Kern dieser Suite ist nicht „rankt die KI gut?" (das misst man gegen die Baseline,
 * nicht im Unit-Test), sondern: **kann die KI etwas kaputt machen?** Antwort muss in
 * jedem Fall nein sein — Flag aus, Tarif ohne Anspruch, Modell tot, Antwort unlesbar,
 * Kandidat verschwunden: immer die deterministische Reihenfolge aus P4.2, vollstaendig.
 *
 * Run: node --test --test-force-exit test/aiMatchRanking.test.js
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MODEL,
  DEFAULT_MIN_PLAN,
  MODEL_PRICING_USD_PER_MTOK,
  RANKING_SCHEMA,
  RANKING_SYSTEM_PROMPT,
  isAiRankingEnabled,
  resolveModel,
  planAllowsAiRanking,
  estimateCostMicroCents,
  fingerprintInput,
  buildCandidatePayload,
  buildDemandPayload,
  rankMatches
} from "../services/aiMatchRankingService.js";

/* ── Umgebung sauber halten ─────────────────────────────────────────────── */

const ENV_KEYS = [
  "AI_MATCH_RANKING_ENABLED", "AI_MATCH_RANKING_MODEL", "AI_MATCH_RANKING_MIN_PLAN",
  "AI_MATCH_RANKING_TOP_N", "AI_MATCH_RANKING_TIMEOUT_MS"
];
let savedEnv = {};
beforeEach(() => { savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])); });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/* ── Hilfen ─────────────────────────────────────────────────────────────── */

const demandRow = () => ({
  title: "Pflegekraft Nachtdienst", role: "Pflegekraft", skill_tags: ["nachtschicht"],
  location_city: "Kiel", radius_km: 25, start_date: "2026-08-05", end_date: "2026-08-20",
  headcount: 2, urgency: "normal"
});

const match = (id, score) => ({
  score,
  capacity_post: { id, title: `Angebot ${id}`, role: "Pflegekraft", location_city: "Kiel", headcount: 3 },
  explanation: { axes: [{ label: "Rolle", points: 30, max: 30, phrase: "Rolle passt genau" }], gaps: [] }
});

/** Pool, der Cache-Treffer und Schreibvorgaenge mitzaehlt. */
function poolStub({ cacheRows = [], demand = demandRow() } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params = []) => {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (s.includes("FROM demand_requests") || s.includes("FROM requisitions")) {
        return { rows: demand ? [demand] : [], rowCount: demand ? 1 : 0 };
      }
      if (s.includes("FROM ai_match_rankings")) return { rows: cacheRows, rowCount: cacheRows.length };
      return { rows: [], rowCount: 0 };
    }
  };
}

/** Ein Aufruf mit kontrollierter Modell-Antwort (kein Netz, kein SDK). */
function withModel(responder) {
  return { callRankingModel: responder };
}

const baseOpts = (extra = {}) => ({
  matches: [match("A", 90), match("B", 80), match("C", 70)],
  demandType: "demand_request",
  demandId: "00000000-0000-4000-8000-00000000d001",
  plan: "PRO",
  ...extra
});

const enable = () => { process.env.AI_MATCH_RANKING_ENABLED = "true"; };

// ═══════════════════════════════════════════════════════════════
// Konfiguration
// ═══════════════════════════════════════════════════════════════

describe("Konfiguration — nichts passiert ohne Freigabe", () => {
  it("ist standardmaessig AUS", () => {
    delete process.env.AI_MATCH_RANKING_ENABLED;
    assert.equal(isAiRankingEnabled(), false);
  });

  it("versteht die ueblichen Schreibweisen fuer AN", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on"]) {
      process.env.AI_MATCH_RANKING_ENABLED = v;
      assert.equal(isAiRankingEnabled(), true, `nicht erkannt: ${v}`);
    }
    for (const v of ["0", "false", "nein", ""]) {
      process.env.AI_MATCH_RANKING_ENABLED = v;
      assert.equal(isAiRankingEnabled(), false, `faelschlich AN: ${v}`);
    }
  });

  it("nutzt das aktuelle Standardmodell, ueberschreibbar ohne Deploy", () => {
    delete process.env.AI_MATCH_RANKING_MODEL;
    assert.equal(resolveModel(), DEFAULT_MODEL);
    assert.equal(DEFAULT_MODEL, "claude-opus-5");
    process.env.AI_MATCH_RANKING_MODEL = "claude-haiku-4-5";
    assert.equal(resolveModel(), "claude-haiku-4-5");
  });

  it("kennt fuer jedes waehlbare Modell einen Preis", () => {
    for (const model of Object.keys(MODEL_PRICING_USD_PER_MTOK)) {
      const p = MODEL_PRICING_USD_PER_MTOK[model];
      assert.ok(p.input > 0 && p.output > 0, `Preis unvollstaendig: ${model}`);
    }
    assert.ok(MODEL_PRICING_USD_PER_MTOK[DEFAULT_MODEL], "das Standardmodell braucht einen Preis");
  });
});

describe("Entitlement — Tarif-Gate (Tier-3)", () => {
  it("sperrt unterhalb des Mindesttarifs und oeffnet ab ihm", () => {
    delete process.env.AI_MATCH_RANKING_MIN_PLAN;
    assert.equal(DEFAULT_MIN_PLAN, "PRO");
    assert.equal(planAllowsAiRanking("DEMO"), false);
    assert.equal(planAllowsAiRanking("BASIS"), false);
    assert.equal(planAllowsAiRanking("PLUS"), false);
    assert.equal(planAllowsAiRanking("PRO"), true);
    assert.equal(planAllowsAiRanking("INDIVIDUELL"), true);
  });

  it("laesst sich per Konfiguration fuer alle Plaene oeffnen — eine Zeile, kein Code", () => {
    process.env.AI_MATCH_RANKING_MIN_PLAN = "DEMO";
    assert.equal(planAllowsAiRanking("DEMO"), true);
    assert.equal(planAllowsAiRanking("BASIS"), true);
  });

  it("sperrt bei unbekanntem oder fehlendem Tarif", () => {
    delete process.env.AI_MATCH_RANKING_MIN_PLAN;
    assert.equal(planAllowsAiRanking(null), false);
    assert.equal(planAllowsAiRanking("GIBTSNICHT"), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Sicherheitsnetz: die KI darf nichts kaputt machen
// ═══════════════════════════════════════════════════════════════

describe("rankMatches — Fallback ist immer die deterministische Reihenfolge", () => {
  const ids = (r) => r.matches.map((m) => m.capacity_post.id);

  it("Flag AUS: exakt dasselbe Ergebnis wie ohne KI", async () => {
    delete process.env.AI_MATCH_RANKING_ENABLED;
    const input = baseOpts();
    const out = await rankMatches(poolStub(), input);
    assert.equal(out.applied, false);
    assert.equal(out.reason, "disabled");
    assert.deepEqual(out.matches, input.matches, "die Liste wird nicht einmal angefasst");
  });

  it("Tarif ohne Anspruch: unveraendert", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({ plan: "BASIS" }));
    assert.equal(out.applied, false);
    assert.equal(out.reason, "plan_locked");
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("Modell nicht erreichbar: unveraendert statt Fehler", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => { throw new Error("connection refused"); })
    }));
    assert.equal(out.applied, false);
    assert.equal(out.reason, "model_unavailable");
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("unlesbare Antwort: unveraendert", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => ({ content: [{ type: "text", text: "kein json" }], usage: {} }))
    }));
    assert.equal(out.reason, "unparsable_response");
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("Ablehnung durch die Sicherheitspruefung: unveraendert", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => ({ stop_reason: "refusal", content: [], usage: {} }))
    }));
    assert.equal(out.applied, false);
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("Kandidat fehlt in der Antwort: komplette Antwort wird verworfen", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => ({
        content: [{ type: "text", text: JSON.stringify({ ranking: [
          { id: "A", rank: 1, score: 90, reason: "x" },
          { id: "B", rank: 2, score: 80, reason: "y" }
        ] }) }],
        usage: {}
      }))
    }));
    assert.equal(out.reason, "incomplete_ranking");
    assert.deepEqual(ids(out), ["A", "B", "C"], "kein Treffer darf durch die KI verschwinden");
  });

  it("erfundener Kandidat in der Antwort: verworfen", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => ({
        content: [{ type: "text", text: JSON.stringify({ ranking: [
          { id: "A", rank: 1, score: 90, reason: "x" },
          { id: "B", rank: 2, score: 80, reason: "y" },
          { id: "ERFUNDEN", rank: 3, score: 70, reason: "z" }
        ] }) }],
        usage: {}
      }))
    }));
    assert.equal(out.reason, "incomplete_ranking");
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("Auftrag nicht ladbar: unveraendert", async () => {
    enable();
    const out = await rankMatches(poolStub({ demand: null }), baseOpts());
    assert.equal(out.reason, "demand_unavailable");
    assert.deepEqual(ids(out), ["A", "B", "C"]);
  });

  it("leere Trefferliste: kein Modellaufruf", async () => {
    enable();
    let called = false;
    const out = await rankMatches(poolStub(), baseOpts({
      matches: [], ...withModel(async () => { called = true; return {}; })
    }));
    assert.equal(out.reason, "no_matches");
    assert.equal(called, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Der gute Fall
// ═══════════════════════════════════════════════════════════════

describe("rankMatches — angewandt", () => {
  const ids = (r) => r.matches.map((m) => m.capacity_post.id);

  const goodResponse = async () => ({
    content: [{ type: "text", text: JSON.stringify({ ranking: [
      { id: "C", rank: 1, score: 95, reason: "Alle Skills, sofort verfuegbar, 4 km entfernt." },
      { id: "A", rank: 2, score: 88, reason: "Rolle passt, aber erst ab September verfuegbar." },
      { id: "B", rank: 3, score: 60, reason: "Nur zwei von vier Skills belegt." }
    ] }) }],
    usage: { input_tokens: 1200, cache_read_input_tokens: 800, output_tokens: 180 }
  });

  it("sortiert um und haengt die Begruendung an jeden Treffer", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({ ...withModel(goodResponse) }));
    assert.equal(out.applied, true);
    assert.deepEqual(ids(out), ["C", "A", "B"]);
    assert.match(out.matches[0].ai_ranking.reason, /Alle Skills/);
    assert.equal(out.matches[0].ai_ranking.rank, 1);
    assert.equal(out.matches[0].ai_ranking.model, DEFAULT_MODEL);
  });

  it("verliert keinen Treffer und erfindet keinen", async () => {
    enable();
    const input = baseOpts({ ...withModel(goodResponse) });
    const out = await rankMatches(poolStub(), input);
    assert.equal(out.matches.length, input.matches.length);
    assert.deepEqual(ids(out).slice().sort(), ["A", "B", "C"]);
  });

  it("laesst die deterministische Erklaerung aus 4.2 unangetastet", async () => {
    enable();
    const out = await rankMatches(poolStub(), baseOpts({ ...withModel(goodResponse) }));
    for (const m of out.matches) {
      assert.ok(m.explanation, "die Baseline-Erklaerung bleibt erhalten");
      assert.ok(m.score != null, "der deterministische Score bleibt erhalten");
    }
  });

  it("beruehrt nur die Top-N, der Rest der Liste bleibt in Reihenfolge", async () => {
    enable();
    process.env.AI_MATCH_RANKING_TOP_N = "2";
    const out = await rankMatches(poolStub(), baseOpts({
      ...withModel(async () => ({
        content: [{ type: "text", text: JSON.stringify({ ranking: [
          { id: "B", rank: 1, score: 91, reason: "b" },
          { id: "A", rank: 2, score: 70, reason: "a" }
        ] }) }],
        usage: {}
      }))
    }));
    assert.deepEqual(ids(out), ["B", "A", "C"], "C war ausserhalb der Top-2 und bleibt hinten");
    assert.equal(out.matches[2].ai_ranking, undefined, "unbewertete Treffer bekommen keine Pseudo-Bewertung");
  });

  it("schreibt das Ergebnis in den Cache", async () => {
    enable();
    const pool = poolStub();
    await rankMatches(pool, baseOpts({ ...withModel(goodResponse) }));
    const insert = pool.calls.find((c) => c.sql.includes("INSERT INTO ai_match_rankings"));
    assert.ok(insert, "Ergebnis wird gespeichert");
    assert.match(insert.sql, /ON CONFLICT \(pair_key, input_fingerprint, model\) DO NOTHING/);
  });
});

// ═══════════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════════

describe("Cache — dieselbe Paarung kostet genau einmal", () => {
  it("fragt das Modell nicht, wenn alle Paare im Cache liegen", async () => {
    enable();
    const demand = demandRow();
    const opts = baseOpts();
    const cacheRows = opts.matches.map((m, i) => ({
      input_fingerprint: fingerprintInput(buildDemandPayload(demand), buildCandidatePayload(m)),
      rank_position: opts.matches.length - i, // umgekehrte Reihenfolge aus dem Cache
      rank_score: 50 + i,
      reason: `aus dem Cache ${i}`
    }));

    let called = false;
    const out = await rankMatches(poolStub({ cacheRows, demand }), {
      ...opts,
      ...withModel(async () => { called = true; return {}; })
    });

    assert.equal(called, false, "kein Modellaufruf bei vollstaendigem Cache-Treffer");
    assert.equal(out.applied, true);
    assert.deepEqual(out.matches.map((m) => m.capacity_post.id), ["C", "B", "A"]);
    assert.equal(out.matches[0].ai_ranking.from_cache, true);
    assert.equal(out.cost_micro_cents, 0, "ein Cache-Treffer kostet nichts");
  });

  it("der Fingerabdruck aendert sich, sobald sich eine Seite aendert", () => {
    const d = buildDemandPayload(demandRow());
    const c = buildCandidatePayload(match("A", 90));
    const same = fingerprintInput(d, c);
    assert.equal(fingerprintInput(d, c), same, "gleicher Inhalt, gleicher Abdruck");

    const otherDemand = buildDemandPayload({ ...demandRow(), location_city: "Hamburg" });
    assert.notEqual(fingerprintInput(otherDemand, c), same);

    const otherCandidate = buildCandidatePayload(match("A", 40));
    assert.notEqual(fingerprintInput(d, otherCandidate), same);
  });
});

// ═══════════════════════════════════════════════════════════════
// Kosten
// ═══════════════════════════════════════════════════════════════

describe("Kosten — messbar statt geschaetzt", () => {
  it("rechnet Eingabe, Ausgabe und Cache-Reads getrennt ab", () => {
    // 1M Eingabe-Tokens auf claude-opus-5 = 5 USD = 500 Cent = 500_000 Mikro-Cent
    assert.equal(estimateCostMicroCents("claude-opus-5", { input_tokens: 1e6 }), 500000);
    assert.equal(estimateCostMicroCents("claude-opus-5", { output_tokens: 1e6 }), 2500000);
  });

  it("bewertet Cache-Reads mit einem Zehntel des Eingabepreises", () => {
    const full = estimateCostMicroCents("claude-opus-5", { input_tokens: 1e6 });
    const cachedOnly = estimateCostMicroCents("claude-opus-5", { cache_read_input_tokens: 1e6 });
    assert.equal(cachedOnly, Math.round(full * 0.1));
  });

  it("erfindet keinen Preis fuer ein unbekanntes Modell", () => {
    assert.equal(estimateCostMicroCents("modell-gibts-nicht", { input_tokens: 1e6 }), 0);
  });

  it("ein realistischer Lauf bleibt im Zehntel-Cent-Bereich", () => {
    // 10 Kandidaten: ~1.5k Eingabe (davon 1k gecacht) + ~250 Ausgabe
    const cost = estimateCostMicroCents(DEFAULT_MODEL, {
      input_tokens: 500, cache_read_input_tokens: 1000, output_tokens: 250
    });
    assert.ok(cost > 0, "der Lauf kostet etwas");
    assert.ok(cost < 2000, `unerwartet teuer: ${cost} Mikro-Cent (= ${cost / 1000} Cent)`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Prompt-Aufbau
// ═══════════════════════════════════════════════════════════════

describe("Prompt — cachefaehig und eng gefuehrt", () => {
  it("der stabile Teil enthaelt nichts Veraenderliches", () => {
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(RANKING_SYSTEM_PROMPT), "kein Datum im gecachten Teil");
    assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(RANKING_SYSTEM_PROMPT), "keine ID im gecachten Teil");
    assert.equal(RANKING_SYSTEM_PROMPT, RANKING_SYSTEM_PROMPT.trim(), "keine wandernden Leerzeichen");
  });

  it("der stabile Teil ist lang genug, damit Caching ueberhaupt greift", () => {
    // Prompt Caching braucht auf claude-opus-5 mindestens 512 Tokens; unterhalb davon
    // passiert es still nicht. Grobe Naeherung: ~3 Zeichen je Token im Deutschen.
    assert.ok(RANKING_SYSTEM_PROMPT.length > 512 * 3,
      `zu kurz zum Cachen: ${RANKING_SYSTEM_PROMPT.length} Zeichen`);
  });

  it("verbietet dem Modell ausdruecklich, Kandidaten zu entfernen", () => {
    assert.match(RANKING_SYSTEM_PROMPT, /keine\s+zusätzliche, keine fehlende/);
    assert.match(RANKING_SYSTEM_PROMPT, /entfernst keinen Kandidaten/);
  });

  it("das Antwortschema laesst nichts anderes zu", () => {
    assert.equal(RANKING_SCHEMA.additionalProperties, false);
    const item = RANKING_SCHEMA.properties.ranking.items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, ["id", "rank", "score", "reason"]);
  });

  it("schickt nur die Felder ans Modell, die es fuer die Sortierung braucht", () => {
    const payload = buildCandidatePayload(match("A", 90));
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["achsen", "basis_score", "id", "luecken", "ort", "personen", "rolle", "titel", "verfuegbar_ab", "verfuegbar_bis"]
    );
  });
});
