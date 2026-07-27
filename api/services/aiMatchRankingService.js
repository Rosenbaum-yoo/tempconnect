/**
 * KI-Ranking (P4.3) — die KI rankt, sie entscheidet nicht.
 *
 * Owner-Vorgabe 2026-07-25: „Die KI soll so fortschrittlich sein wie es nur geht — dabei
 * aber effizient im Sinne von wirtschaftlich optimal." Das ist kein Widerspruch, sondern
 * eine Frage der Architektur. Hier ist sie in fuenf Punkten aufgeloest:
 *
 *  1) **Deterministischer Vorfilter, KI nur zur Feinsortierung.** Der Engine reduziert
 *     Tausende auf die Top-N (Default 10). Nur diese sehen das Modell. Die Kosten skalieren
 *     damit mit der Zahl der TREFFER, nicht mit der Groesse der Datenbank — der Unterschied
 *     zwischen tragfaehig und ruinoes bei 300 Kunden.
 *  2) **Die Engine bleibt die Wahrheit und der Fallback.** Faellt das Modell aus, ist es zu
 *     langsam, antwortet es unbrauchbar oder verliert es einen Kandidaten — dann gilt die
 *     deterministische Reihenfolge aus 4.2. Kein Treffer verschwindet je durch die KI.
 *  3) **Cache als Kostenhebel.** Dieselbe Paarung mit unveraendertem Inhalt fragt das
 *     Modell genau einmal (`ai_match_rankings`, Mig 153).
 *  4) **Prompt Caching** fuer den stabilen Teil (Bewertungsregeln) — der wiederholt sich
 *     bei jedem Aufruf und muss nicht jedes Mal neu bezahlt werden.
 *  5) **Messbar.** Tokens, Kosten und Latenz je Lauf werden protokolliert. Ohne diese Zahl
 *     ist „wirtschaftlich optimal" eine Meinung; mit ihr eine Entscheidung.
 *
 * Config-Taxonomie (3-Tier, Owner-approved):
 *  - Tier-2 Env-Kill-Switch: `AI_MATCH_RANKING_ENABLED` (Default AUS — ohne Freigabe passiert nichts)
 *  - Tier-2 Modellwahl:      `AI_MATCH_RANKING_MODEL` (Default `claude-opus-5`)
 *  - Tier-3 Entitlement:     `AI_MATCH_RANKING_MIN_PLAN` (Default `PRO`)
 *
 * Der Mindesttarif ist bewusst eine Ein-Zeilen-Konfiguration: die Frage „alle Plaene oder
 * hoehere Tarife?" ist eine Preis-, keine Technikentscheidung und bleibt beim Owner.
 */

import crypto from "node:crypto";
import { createServiceLogger } from "../utils/logger.js";
import { PLAN_CATALOG, normalizePlanKey } from "../config/planCatalog.js";

const logger = createServiceLogger("aiMatchRanking");

/* ── Konfiguration ──────────────────────────────────────────────────────── */

/** Default-Modell. Ueber `AI_MATCH_RANKING_MODEL` austauschbar, ohne Deploy. */
export const DEFAULT_MODEL = "claude-opus-5";
/** Nur die besten N der deterministischen Vorauswahl gehen ans Modell. */
export const DEFAULT_TOP_N = 10;
/** Latenzbudget. Wird es ueberschritten, gilt das deterministische Ergebnis. */
export const DEFAULT_TIMEOUT_MS = 2500;
/** Mindesttarif (Tier-3). Preisentscheidung des Owners, hier nur der Default. */
export const DEFAULT_MIN_PLAN = "PRO";

/**
 * Preise in US-Dollar je 1 Mio Tokens (Stand 2026-07-26, `claude-api`-Referenz).
 * Cache-Reads kosten rund ein Zehntel des Eingabepreises — deshalb lohnt sich der
 * stabile Prompt-Teil. Unbekanntes Modell => Kosten 0, damit eine Preisluecke die
 * Auswertung nicht verfaelscht statt sie stillschweigend zu erfinden.
 */
export const MODEL_PRICING_USD_PER_MTOK = Object.freeze({
  "claude-opus-5":   { input: 5.0,  output: 25.0 },
  "claude-opus-4-8": { input: 5.0,  output: 25.0 },
  "claude-sonnet-5": { input: 3.0,  output: 15.0 },
  "claude-haiku-4-5":{ input: 1.0,  output: 5.0  }
});

const CACHE_READ_FACTOR = 0.1;

const envFlag = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
};

const envInt = (name, fallback) => {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Tier-2-Kill-Switch. Default AUS: ohne Owner-Freigabe entstehen keine API-Kosten. */
export function isAiRankingEnabled() {
  return envFlag("AI_MATCH_RANKING_ENABLED", false);
}

export function resolveModel() {
  const raw = String(process.env.AI_MATCH_RANKING_MODEL || "").trim();
  return raw || DEFAULT_MODEL;
}

/** Rangfolge der Tarife aus dem Katalog — keine zweite Tarif-Wahrheit im Code. */
function planRank(planKey) {
  const key = normalizePlanKey(planKey);
  const entry = PLAN_CATALOG.find((p) => p.key === key);
  return entry ? entry.sort_order : -1;
}

/**
 * Tier-3-Entitlement. `AI_MATCH_RANKING_MIN_PLAN=DEMO` oeffnet es fuer alle Plaene.
 */
export function planAllowsAiRanking(planKey) {
  const min = String(process.env.AI_MATCH_RANKING_MIN_PLAN || DEFAULT_MIN_PLAN).trim();
  const minRank = planRank(min);
  if (minRank < 0) return false;
  return planRank(planKey) >= minRank;
}

/* ── Prompt ─────────────────────────────────────────────────────────────── */

/**
 * Stabiler Teil des Prompts — identisch bei jedem Aufruf und deshalb der Teil, den
 * Prompt Caching bezahlt macht. Aendert sich hier ein Byte, ist der Cache kalt: dieser
 * Text darf keine Zeitstempel, IDs oder kundenspezifischen Angaben enthalten.
 */
export const RANKING_SYSTEM_PROMPT = `Du bist der Feinsortierer einer Personalvermittlungs-Plattform für Zeitarbeit in Deutschland.

Du bekommst einen offenen Auftrag (Bedarf eines Einsatzunternehmens) und eine bereits
vorgefilterte Liste passender Personalangebote von Zeitarbeitsfirmen. Die Vorauswahl und
die Punktzahlen stammen aus einem deterministischen Scoring über feste Achsen: Rolle,
Skills, Standort, Verfügbarkeit, Preisrahmen, Personalstärke, Compliance, Verifizierung,
Historie und Lieferantenpool.

Deine Aufgabe ist ausschließlich die Reihenfolge und eine kurze Begründung. Du entscheidest
nicht, wer den Auftrag bekommt, du entfernst keinen Kandidaten und du erfindest keine Fakten.

Bewertungsmaßstab, in dieser Rangfolge:
1. Fachliche Passung: Erfüllt die angebotene Rolle wirklich, was der Auftrag verlangt?
   Eine benachbarte Qualifikation kann besser passen als eine wörtlich gleiche Rollen-
   bezeichnung mit unpassenden Skills — aber nur, wenn die Skills das belegen.
2. Einsatzfähigkeit: Verfügbarkeit im geforderten Zeitraum und erreichbare Entfernung
   schlagen Zusatzpunkte aus weichen Achsen. Ein Angebot, das zeitlich nicht kann,
   gehört nach unten, egal wie gut der Rest aussieht.
3. Belastbarkeit der Zusammenarbeit: Compliance, Verifizierung, Historie und Lieferanten-
   pool unterscheiden gleichwertige Kandidaten — sie ersetzen keine fachliche Passung.
4. Wirtschaftlichkeit: Ein Angebot innerhalb des Budgetrahmens ist einem darüber
   vorzuziehen, wenn die fachliche Passung vergleichbar ist.

Regeln für die Ausgabe:
- Gib GENAU die Kandidaten zurück, die du bekommen hast — jede ID genau einmal, keine
  zusätzliche, keine fehlende.
- "rank" ist die neue Position, beginnend bei 1, jede Position genau einmal vergeben.
- "score" ist deine Einschätzung von 0 bis 100. Sie darf von der deterministischen
  Punktzahl abweichen, muss dann aber durch die Begründung gedeckt sein.
- "reason" ist EIN deutscher Satz, höchstens 160 Zeichen, konkret und überprüfbar.
  Nenne den ausschlaggebenden Grund, nicht eine Zusammenfassung aller Achsen.
  Gut: "Alle vier geforderten Skills und ab sofort verfügbar, nur 8 km entfernt."
  Schlecht: "Guter Match mit hoher Punktzahl."
- Keine Superlative, keine Werbesprache, keine Emojis, keine Annahmen über Personen.
- Wenn die Datenlage für einen Kandidaten dünn ist, sage das im Satz statt zu raten.`;

/** Struktur der Antwort. `strict`-artige Absicherung: nichts anderes ist erlaubt. */
export const RANKING_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    ranking: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          rank: { type: "integer" },
          score: { type: "integer" },
          reason: { type: "string" }
        },
        required: ["id", "rank", "score", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["ranking"],
  additionalProperties: false
});

/** Die Felder, die das Modell sieht — und damit genau das, was den Cache-Schluessel bildet. */
export function buildCandidatePayload(match) {
  const cap = match.capacity_post || match.entity || {};
  const expl = match.explanation || {};
  return {
    id: String(cap.id || match.id || ""),
    titel: cap.title || "",
    rolle: cap.role || "",
    ort: cap.location_city || "",
    verfuegbar_ab: cap.availability_from || null,
    verfuegbar_bis: cap.availability_to || null,
    personen: cap.headcount ?? null,
    basis_score: Math.round(match.score ?? match.match_score ?? 0),
    achsen: (expl.axes || []).map((a) => `${a.label}: ${a.points}/${a.max}${a.phrase ? ` (${a.phrase})` : ""}`),
    luecken: expl.gaps || []
  };
}

export function buildDemandPayload(demand) {
  return {
    titel: demand?.title || "",
    rolle: demand?.role || "",
    skills: demand?.skill_tags || [],
    ort: demand?.location_city || "",
    umkreis_km: demand?.radius_km ?? null,
    von: demand?.start_date || null,
    bis: demand?.end_date || null,
    personen: demand?.headcount ?? null,
    dringlichkeit: demand?.urgency || "normal"
  };
}

/** Fingerabdruck des Modell-Inputs: aendert sich eine Seite, verfaellt der Cache-Eintrag. */
export function fingerprintInput(demandPayload, candidatePayload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ d: demandPayload, c: candidatePayload }))
    .digest("hex");
}

/* ── Kosten ─────────────────────────────────────────────────────────────── */

/** Kosten eines Aufrufs in Mikro-Cent (1 Cent = 1000 Mikro-Cent), ganzzahlig. */
export function estimateCostMicroCents(model, usage = {}) {
  const price = MODEL_PRICING_USD_PER_MTOK[model];
  if (!price) return 0;
  const input = Number(usage.input_tokens) || 0;
  const cached = Number(usage.cache_read_input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  const usd =
    (input / 1e6) * price.input +
    (cached / 1e6) * price.input * CACHE_READ_FACTOR +
    (output / 1e6) * price.output;
  return Math.round(usd * 100 * 1000); // USD -> Cent -> Mikro-Cent
}

/* ── Cache ──────────────────────────────────────────────────────────────── */

/**
 * Cache-Treffer in EINER Abfrage (kein N+1). Der Fingerabdruck deckt Auftrag und
 * Kandidat vollstaendig ab — er allein identifiziert den Eintrag, der Paar-Schluessel
 * dient der Auswertung.
 */
async function loadCached(pool, model, keys) {
  if (!keys.length) return new Map();
  const { rows } = await pool.query(
    `SELECT input_fingerprint, rank_position, rank_score, reason
       FROM ai_match_rankings
      WHERE model = $1 AND input_fingerprint = ANY($2::text[])`,
    [model, keys.map((k) => k.fingerprint)]
  );
  const map = new Map();
  for (const r of rows) map.set(r.input_fingerprint, r);
  return map;
}

async function persistRanking(pool, rows) {
  if (!rows.length) return;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const o = i * 11;
    values.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10},$${o + 11})`);
    params.push(
      r.pairKey, r.fingerprint, r.model, r.rank, r.score, r.reason,
      r.baselineScore, r.inputTokens, r.cacheReadTokens, r.outputTokens, r.costMicroCents
    );
  });
  await pool.query(
    `INSERT INTO ai_match_rankings
       (pair_key, input_fingerprint, model, rank_position, rank_score, reason,
        baseline_score, input_tokens, cache_read_tokens, output_tokens, cost_micro_cents)
     VALUES ${values.join(",")}
     ON CONFLICT (pair_key, input_fingerprint, model) DO NOTHING`,
    params
  );
}

/* ── Modellaufruf ───────────────────────────────────────────────────────── */

/**
 * Ruft das Modell auf. Getrennt gehalten, damit der Rest des Services ohne Netz und
 * ohne SDK testbar bleibt — und damit ein fehlendes SDK kein Server-Start-Problem ist.
 */
export async function callRankingModel({ model, demandPayload, candidates, timeoutMs }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();

  const response = await client.messages.create(
    {
      model,
      max_tokens: 2048,
      // Niedriger Aufwand: Rangfolge plus ein Satz ist keine Aufgabe fuer tiefes
      // Nachdenken. Spart Tokens und Latenz, ohne Thinking ganz abzuschalten.
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RANKING_SCHEMA }
      },
      system: [
        { type: "text", text: RANKING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }
      ],
      messages: [
        {
          role: "user",
          content: JSON.stringify({ auftrag: demandPayload, kandidaten: candidates })
        }
      ]
    },
    { timeout: timeoutMs }
  );

  return response;
}

function parseRanking(response) {
  if (!response || response.stop_reason === "refusal") return null;
  const block = (response.content || []).find((b) => b.type === "text");
  if (!block?.text) return null;
  try {
    const parsed = JSON.parse(block.text);
    return Array.isArray(parsed?.ranking) ? parsed.ranking : null;
  } catch {
    return null;
  }
}

/**
 * Auftrag selbst laden, wenn der Aufrufer nur Typ und ID kennt — dasselbe Prinzip wie
 * beim Instant-Matching-Chokepoint (P4.1): eine Wahrheit, kein zweiter Datensatz, der
 * beim naechsten Refactoring wegdriftet.
 */
async function loadDemandForRanking(pool, type, id) {
  if (!type || !id) return null;
  try {
    if (type === "requisition") {
      const { rows } = await pool.query(
        `SELECT title, role, skill_tags, location_city, radius_km, start_date, end_date, headcount, urgency
           FROM requisitions WHERE id = $1`,
        [id]
      );
      return rows[0] || null;
    }
    const { rows } = await pool.query(
      `SELECT title, role, skill_tags, location_city, radius_km, start_date, end_date, headcount, urgency
         FROM demand_requests WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    logger.warn({ err: err?.message, type, id }, "KI-Ranking: Auftrag nicht ladbar");
    return null;
  }
}

/* ── Hauptpfad ──────────────────────────────────────────────────────────── */

/**
 * Sortiert die Top-N einer Trefferliste per Modell um und ergaenzt je Treffer eine
 * Begruendung. Gibt IMMER eine vollstaendige Liste zurueck — bei jedem Problem die
 * unveraenderte deterministische Reihenfolge.
 *
 * @returns {Promise<{ matches: Array, applied: boolean, reason: string, cost_micro_cents?: number }>}
 */
export async function rankMatches(pool, opts = {}) {
  const matches = Array.isArray(opts.matches) ? opts.matches : [];
  const unchanged = (reason) => ({ matches, applied: false, reason });

  if (!matches.length) return unchanged("no_matches");
  if (!isAiRankingEnabled()) return unchanged("disabled");
  if (!planAllowsAiRanking(opts.plan)) return unchanged("plan_locked");

  const model = resolveModel();
  const topN = envInt("AI_MATCH_RANKING_TOP_N", DEFAULT_TOP_N);
  const timeoutMs = envInt("AI_MATCH_RANKING_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

  const head = matches.slice(0, topN);
  const tail = matches.slice(topN);

  const demandRow = opts.demand || await loadDemandForRanking(pool, opts.demandType, opts.demandId);
  if (!demandRow) return unchanged("demand_unavailable");
  const demandPayload = buildDemandPayload(demandRow);
  const candidates = head.map(buildCandidatePayload);
  if (candidates.some((c) => !c.id)) return unchanged("candidate_without_id");

  const pairKeyFor = (c) => `${opts.demandType || "demand"}:${opts.demandId || ""}|capacity_post:${c.id}`;
  const keys = candidates.map((c) => ({
    pairKey: pairKeyFor(c),
    fingerprint: fingerprintInput(demandPayload, c)
  }));

  // 1) Cache — dieselbe Paarung mit unveraendertem Inhalt kostet nichts.
  let cached = new Map();
  try {
    cached = await loadCached(pool, model, keys);
  } catch (err) {
    logger.warn({ err: err?.message }, "KI-Ranking: Cache-Abfrage fehlgeschlagen, weiter ohne Cache");
  }

  const missing = candidates.filter((_, i) => !cached.has(keys[i].fingerprint));
  let usage = null;
  let latencyMs = null;
  let fresh = new Map();

  if (missing.length) {
    const started = Date.now();
    // Naht fuer Tests: ohne Injektion der echte Modellaufruf. So ist der gesamte
    // Sicherheitsnetz-Pfad (Ausfall, unlesbare Antwort, fehlender Kandidat) ohne Netz,
    // ohne SDK und ohne API-Schluessel pruefbar.
    const call = typeof opts.callRankingModel === "function" ? opts.callRankingModel : callRankingModel;
    let response;
    try {
      response = await call({ model, demandPayload, candidates, timeoutMs });
    } catch (err) {
      logger.warn({ err: err?.message, model }, "KI-Ranking nicht verfuegbar — deterministische Reihenfolge bleibt");
      return unchanged("model_unavailable");
    }
    latencyMs = Date.now() - started;
    usage = response?.usage || null;

    const ranking = parseRanking(response);
    if (!ranking) return unchanged("unparsable_response");

    // Vollstaendigkeit: kein Kandidat darf verschwinden oder dazukommen.
    const given = new Set(candidates.map((c) => c.id));
    const returned = new Set(ranking.map((r) => String(r.id)));
    if (returned.size !== given.size || [...given].some((id) => !returned.has(id))) {
      logger.warn({ given: given.size, returned: returned.size }, "KI-Ranking unvollstaendig — verworfen");
      return unchanged("incomplete_ranking");
    }
    for (const r of ranking) fresh.set(String(r.id), r);
  }

  // 2) Ergebnis je Kandidat zusammenfuehren (Cache + frische Antwort).
  const decided = candidates.map((c, i) => {
    const hit = cached.get(keys[i].fingerprint);
    const live = fresh.get(c.id);
    return {
      id: c.id,
      rank: Number(live?.rank ?? hit?.rank_position ?? i + 1),
      score: Number(live?.score ?? hit?.rank_score ?? c.basis_score),
      reason: String(live?.reason ?? hit?.reason ?? ""),
      baselineScore: c.basis_score,
      fromCache: !live
    };
  });

  // 3) Persistieren (nur die frisch berechneten) inklusive Kostenanteil.
  const costTotal = estimateCostMicroCents(model, usage || {});
  const freshRows = decided.filter((d) => !d.fromCache);
  if (freshRows.length) {
    const perRow = Math.round(costTotal / freshRows.length);
    try {
      await persistRanking(
        pool,
        freshRows.map((d) => {
          const idx = candidates.findIndex((c) => c.id === d.id);
          return {
            pairKey: keys[idx].pairKey,
            fingerprint: keys[idx].fingerprint,
            model,
            rank: d.rank,
            score: d.score,
            reason: d.reason,
            baselineScore: d.baselineScore,
            inputTokens: Number(usage?.input_tokens) || 0,
            cacheReadTokens: Number(usage?.cache_read_input_tokens) || 0,
            outputTokens: Number(usage?.output_tokens) || 0,
            costMicroCents: perRow
          };
        })
      );
    } catch (err) {
      logger.warn({ err: err?.message }, "KI-Ranking: Cache-Schreiben fehlgeschlagen (nicht blockierend)");
    }
  }

  // 4) Umsortieren — nur innerhalb der Top-N, der Rest bleibt unberuehrt.
  const byId = new Map(decided.map((d) => [d.id, d]));
  const reordered = [...head]
    .map((m, i) => ({ m, d: byId.get(candidates[i].id) }))
    .sort((a, b) => (a.d?.rank ?? 0) - (b.d?.rank ?? 0))
    .map(({ m, d }) => ({
      ...m,
      ai_ranking: {
        rank: d?.rank ?? null,
        score: d?.score ?? null,
        reason: d?.reason || null,
        model,
        from_cache: !!d?.fromCache
      }
    }));

  logger.info(
    { model, pairs: candidates.length, fresh: freshRows.length, cost_micro_cents: costTotal, latency_ms: latencyMs },
    "KI-Ranking angewandt"
  );

  return {
    matches: [...reordered, ...tail],
    applied: true,
    reason: "ok",
    cost_micro_cents: costTotal,
    latency_ms: latencyMs
  };
}

export default { rankMatches, isAiRankingEnabled, planAllowsAiRanking, resolveModel };
