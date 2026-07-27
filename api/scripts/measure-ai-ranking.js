#!/usr/bin/env node
/**
 * Messung: lohnt sich das KI-Ranking (P4.3) gegenüber der Baseline aus P4.2?
 *
 * Der Plan verlangt diese Zahl ausdrücklich: „Kosten pro Match und Trefferqualität gegen
 * die 4.2-Baseline protokollieren. Ohne diese Zahl ist 'wirtschaftlich optimal' eine
 * Meinung. Mit ihr eine Entscheidung." Dieses Skript ist diese Zahl.
 *
 * Was es tut: nimmt echte offene Aufträge, rechnet für jeden die deterministische
 * Reihenfolge (Baseline) UND die KI-Reihenfolge, und vergleicht beide — wie stark
 * ordnet die KI um, wie oft ändert sich Platz 1, was kostet ein Lauf, wie lange dauert er,
 * wie oft greift der Cache.
 *
 * Es schreibt nichts an fachlichen Daten. Der einzige Seiteneffekt ist der Ranking-Cache
 * (`ai_match_rankings`) — genau der, der Wiederholungen billig macht.
 *
 * Aufruf (im laufenden API-Container):
 *   node scripts/measure-ai-ranking.js --limit=20
 *   node scripts/measure-ai-ranking.js --limit=20 --model=claude-haiku-4-5
 *   node scripts/measure-ai-ranking.js --dry            # ohne Modell, prüft nur die Mechanik
 *
 * Voraussetzung für den echten Lauf: `ANTHROPIC_API_KEY` gesetzt und `@anthropic-ai/sdk`
 * installiert. Das Skript setzt das Flag für seinen eigenen Prozess selbst — es ändert
 * nichts an der Konfiguration der laufenden Anwendung.
 */

import pg from "pg";
import { pathToFileURL } from "node:url";
import { matchRequisition } from "../services/matchingEngine.js";
import { attachExplanations } from "../services/matchExplanationService.js";
import { rankMatches, resolveModel, DEFAULT_TOP_N } from "../services/aiMatchRankingService.js";

const arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const LIMIT = Math.max(1, Number.parseInt(arg("limit", "10"), 10) || 10);
const DRY = has("dry");

/** Wie weit ist die KI-Reihenfolge von der Baseline entfernt? 0 = identisch, 1 = maximal. */
export function rankDistance(baselineIds, rankedIds) {
  if (!baselineIds.length) return 0;
  const pos = new Map(rankedIds.map((id, i) => [id, i]));
  let moved = 0;
  baselineIds.forEach((id, i) => {
    const to = pos.has(id) ? pos.get(id) : i;
    moved += Math.abs(to - i);
  });
  const worst = Math.floor((baselineIds.length * baselineIds.length) / 2) || 1;
  return Math.min(1, moved / worst);
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Das Flag gilt nur fuer diesen Prozess — die laufende Anwendung bleibt unberuehrt.
  if (!DRY) {
    process.env.AI_MATCH_RANKING_ENABLED = "true";
    process.env.AI_MATCH_RANKING_MIN_PLAN = "DEMO"; // Messung ist tarifunabhaengig
    const model = arg("model");
    if (model) process.env.AI_MATCH_RANKING_MODEL = model;
  }

  const { rows: demands } = await pool.query(
    `SELECT id, title, role, skill_tags, location_city, radius_km, start_date, end_date, headcount, urgency
       FROM demand_requests
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT $1`,
    [LIMIT]
  );

  if (!demands.length) {
    console.log("Keine offenen Aufträge gefunden — nichts zu messen.");
    await pool.end();
    return;
  }

  const results = [];
  for (const d of demands) {
    const raw = await matchRequisition(
      pool,
      {
        role: d.role, skill_tags: d.skill_tags || [], location_city: d.location_city,
        radius_km: d.radius_km, start_date: d.start_date, end_date: d.end_date
      },
      { topN: DEFAULT_TOP_N, minScore: 10 }
    );
    if (raw.length < 2) continue; // unter zwei Kandidaten gibt es nichts zu sortieren

    const baseline = attachExplanations(raw);
    const baselineIds = baseline.map((m) => m.capacity_post?.id);

    const started = Date.now();
    const out = await rankMatches(pool, {
      matches: baseline, demandType: "demand_request", demandId: d.id, demand: d, plan: "PRO"
    });
    const wall = Date.now() - started;

    const rankedIds = out.matches.map((m) => m.capacity_post?.id);
    const cacheHits = out.matches.filter((m) => m.ai_ranking?.from_cache).length;

    results.push({
      demand: d.title || d.id,
      kandidaten: baseline.length,
      angewandt: out.applied,
      grund: out.reason,
      umsortierung: rankDistance(baselineIds, rankedIds),
      platz1_neu: baselineIds[0] !== rankedIds[0],
      kosten_cent: (out.cost_micro_cents || 0) / 1000,
      cache: cacheHits,
      ms: wall
    });
  }

  if (!results.length) {
    console.log("Keine Aufträge mit mindestens zwei Kandidaten — nichts zu vergleichen.");
    await pool.end();
    return;
  }

  const applied = results.filter((r) => r.angewandt);
  const sum = (f) => results.reduce((a, r) => a + f(r), 0);
  const avg = (f, list = results) => (list.length ? list.reduce((a, r) => a + f(r), 0) / list.length : 0);

  console.log(`\nModell: ${DRY ? "(dry — kein Modellaufruf)" : resolveModel()}   Aufträge: ${results.length}\n`);
  console.table(
    results.map((r) => ({
      Auftrag: String(r.demand).slice(0, 34),
      Kandidaten: r.kandidaten,
      Angewandt: r.angewandt ? "ja" : `nein (${r.grund})`,
      Umsortierung: r.umsortierung.toFixed(2),
      "Platz 1 neu": r.platz1_neu ? "ja" : "—",
      "Cent/Lauf": r.kosten_cent.toFixed(3),
      "aus Cache": r.cache,
      ms: r.ms
    }))
  );

  const gesamtCent = sum((r) => r.kosten_cent);
  console.log(
    [
      "",
      `Angewandt:            ${applied.length}/${results.length}`,
      `Ø Umsortierung:       ${avg((r) => r.umsortierung, applied).toFixed(3)}  (0 = KI ändert nichts, 1 = dreht alles um)`,
      `Platz 1 geändert:     ${applied.filter((r) => r.platz1_neu).length}/${applied.length || 0}`,
      `Kosten gesamt:        ${gesamtCent.toFixed(3)} Cent  (Ø ${(gesamtCent / (results.length || 1)).toFixed(3)} Cent/Auftrag)`,
      `Ø Laufzeit:           ${Math.round(avg((r) => r.ms))} ms`,
      "",
      "Lesehilfe: eine Ø-Umsortierung nahe 0 heißt, die KI bestätigt die Baseline — dann",
      "zahlt man für Bestätigung. Deutliche Umsortierung ist erst dann ein Gewinn, wenn die",
      "neue Reihenfolge auch zu mehr angenommenen Angeboten führt: dafür `match_logs`",
      "(outcome) über einige Wochen gegen diese Läufe halten.",
      ""
    ].join("\n")
  );

  await pool.end();
}

/**
 * Nur beim direkten Aufruf loslaufen. Ohne diese Schranke startet die Messung schon beim
 * blossen Import — inklusive DB-Verbindung und gesetzter Umgebungsvariablen. Genau das
 * hat der Test zu `rankDistance` aufgedeckt: er importierte die Datei und bekam eine
 * veraenderte Konfiguration untergeschoben.
 */
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Messung fehlgeschlagen:", err?.message || err);
    process.exit(1);
  });
}
