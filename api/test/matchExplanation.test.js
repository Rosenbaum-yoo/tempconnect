/**
 * Match-Erklaerung (P4.2) — Verhaltens-Spezifikation.
 *
 * Die Erklaerung ist die Baseline, gegen die Welle 4.3 (KI-Ranking) antreten muss.
 * Deshalb wird hier vor allem eines geprueft: sie ist **deterministisch** und sie
 * beschreibt, was tatsaechlich im Score steckt — nicht mehr und nicht weniger.
 *
 * Run: node --test --test-force-exit test/matchExplanation.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_AXES,
  QUALITY_LABELS,
  classifyQuality,
  phraseForReason,
  toAxis,
  explainMatch,
  summarizeMatch,
  attachExplanations
} from "../services/matchExplanationService.js";
import { scoreMatch } from "../services/matchingEngine.js";

const reason = (factor, points, max, meta, detail) => ({ factor, points, max, meta, detail: detail || `${factor}` });

// ═══════════════════════════════════════════════════════════════
// Qualitaets-Einstufung
// ═══════════════════════════════════════════════════════════════

describe("classifyQuality — dieselben Schwellen wie die Engine", () => {
  it("stuft an den Grenzen korrekt ein", () => {
    assert.equal(classifyQuality(80), "excellent");
    assert.equal(classifyQuality(79), "good");
    assert.equal(classifyQuality(60), "good");
    assert.equal(classifyQuality(59), "fair");
    assert.equal(classifyQuality(40), "fair");
    assert.equal(classifyQuality(39), "weak");
    assert.equal(classifyQuality(0), "weak");
  });

  it("behandelt fehlende Werte als schwach statt zu werfen", () => {
    assert.equal(classifyQuality(null), "weak");
    assert.equal(classifyQuality(undefined), "weak");
    assert.equal(classifyQuality("keine Zahl"), "weak");
  });

  it("hat fuer jede Stufe eine Beschriftung", () => {
    for (const q of ["excellent", "good", "fair", "weak"]) {
      assert.ok(QUALITY_LABELS[q] && QUALITY_LABELS[q].length > 3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Formulierung je Achse
// ═══════════════════════════════════════════════════════════════

describe("phraseForReason — Klartext statt Rechenweg", () => {
  it("nennt bei Skills die echten Zahlen", () => {
    assert.equal(phraseForReason(reason("skills", 19, 25, { overlap: 3, required: 4 })), "3 von 4 geforderten Skills");
  });

  it("sagt bei voller Deckung 'alle N'", () => {
    assert.equal(phraseForReason(reason("skills", 25, 25, { overlap: 4, required: 4 })), "alle 4 geforderten Skills");
  });

  it("formuliert den Einzel-Skill grammatikalisch korrekt (kein 'alle 1')", () => {
    assert.equal(phraseForReason(reason("skills", 25, 25, { overlap: 1, required: 1 })), "geforderter Skill vorhanden");
    assert.equal(phraseForReason(reason("skills", 0, 25, { overlap: 0, required: 1 })), "geforderter Skill fehlt");
  });

  it("benennt fehlende Skill-Deckung als Luecke", () => {
    assert.equal(phraseForReason(reason("skills", 0, 25, { overlap: 0, required: 3 })), "keiner von 3 geforderten Skills");
  });

  it("nennt bei Standort die Entfernung", () => {
    assert.equal(phraseForReason(reason("location", 18, 25, { km: 18, maxKm: 25, withinRadius: true })), "18 km entfernt");
  });

  it("macht das Ueberschreiten des Radius explizit", () => {
    assert.equal(
      phraseForReason(reason("location", 0, 25, { km: 90, maxKm: 25, withinRadius: false })),
      "90 km entfernt — außerhalb des Radius (25 km)"
    );
  });

  it("faellt ohne Koordinaten auf den Ort zurueck", () => {
    assert.equal(phraseForReason(reason("location", 15, 25, { city: "Kiel" })), "am selben Ort (Kiel)");
  });

  it("unterscheidet passenden und nicht passenden Zeitraum", () => {
    assert.equal(phraseForReason(reason("availability", 10, 10, { fits: true })), "im gewünschten Zeitraum verfügbar");
    assert.equal(phraseForReason(reason("availability", 0, 10, { fits: false })), "Zeitraum passt nicht");
  });

  it("formuliert Rolle, Preisrahmen und Personalstaerke verstaendlich", () => {
    assert.equal(phraseForReason(reason("role", 30, 30, { mode: "exact", role: "pflegekraft" })), 'Rolle „pflegekraft" passt genau');
    assert.equal(phraseForReason(reason("role", 15, 30, { mode: "partial" })), "Rolle passt teilweise");
    assert.equal(phraseForReason(reason("rate", 0, 5, { compatible: false })), "Stundensatz über Budget");
    assert.equal(phraseForReason(reason("workerCount", 3, 3, { sufficient: true })), "Personalstärke reicht aus");
  });

  it("kommt mit Altdaten ohne meta zurecht (persistierte reasons)", () => {
    assert.equal(phraseForReason({ factor: "skills", points: 10, max: 25 }), "Skills passen");
    assert.equal(phraseForReason({ factor: "availability", points: 10, max: 10 }), "im gewünschten Zeitraum verfügbar");
  });

  it("nutzt fuer unbekannte Faktoren den technischen Text statt zu verschweigen", () => {
    assert.equal(phraseForReason({ factor: "zukunft", points: 1, max: 2, detail: "Etwas Neues" }), "Etwas Neues");
  });

  it("gibt fuer Unsinn null statt zu werfen", () => {
    assert.equal(phraseForReason(null), null);
    assert.equal(phraseForReason({}), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// Achsen
// ═══════════════════════════════════════════════════════════════

describe("toAxis — jede Achse einzeln sichtbar", () => {
  it("rechnet Prozent und Status aus Punkten", () => {
    const a = toAxis(reason("skills", 19, 25, { overlap: 3, required: 4 }));
    assert.equal(a.label, "Skills");
    assert.equal(a.pct, 76);
    assert.equal(a.status, "partial");
  });

  it("markiert volle und fehlende Achsen", () => {
    assert.equal(toAxis(reason("role", 30, 30, { mode: "exact" })).status, "full");
    assert.equal(toAxis(reason("availability", 0, 10, { fits: false })).status, "missing");
  });

  it("hat fuer jeden Engine-Faktor eine Beschriftung — sonst zeigt die UI Rohnamen", () => {
    // Faktoren, die scoreMatch tatsaechlich erzeugen kann
    const engineFactors = [
      "role", "skills", "location", "availability", "verified", "vendorPool",
      "compliance", "rate", "urgency", "workerCount", "reputation", "preferredFirst", "smartRank"
    ];
    const known = new Set(MATCH_AXES.map((a) => a.key));
    for (const f of engineFactors) {
      assert.ok(known.has(f), `Achse ohne Beschriftung: ${f}`);
    }
  });

  it("teilt nicht durch null, wenn max fehlt", () => {
    const a = toAxis({ factor: "role", points: 5 });
    assert.equal(a.pct, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Gesamt-Erklaerung
// ═══════════════════════════════════════════════════════════════

describe("explainMatch — die Begruendung", () => {
  const reasons = [
    reason("location", 18, 25, { km: 18, maxKm: 25, withinRadius: true }),
    reason("role", 30, 30, { mode: "exact", role: "pflegekraft" }),
    reason("skills", 19, 25, { overlap: 3, required: 4 }),
    reason("availability", 0, 10, { fits: false })
  ];

  it("liest sich wie eine Bewertung: Rolle, Skills, Entfernung", () => {
    const out = explainMatch(72, reasons);
    assert.equal(out.summary, 'Rolle „pflegekraft" passt genau, 3 von 4 geforderten Skills, 18 km entfernt');
  });

  it("nennt Einschraenkungen getrennt von Staerken", () => {
    const out = explainMatch(72, reasons);
    assert.deepEqual(out.gaps, ["Zeitraum passt nicht"]);
    assert.ok(!out.summary.includes("Zeitraum passt nicht"));
  });

  it("liefert Kopfzeile mit Stufe und Prozent", () => {
    assert.equal(explainMatch(72, reasons).headline, "Gute Übereinstimmung (72%)");
  });

  it("ist deterministisch — zweimal derselbe Text", () => {
    assert.deepEqual(explainMatch(72, reasons), explainMatch(72, reasons));
  });

  it("sortiert Achsen nach Nutzer-Relevanz, nicht nach Punkten", () => {
    const keys = explainMatch(72, reasons).axes.map((a) => a.key);
    assert.deepEqual(keys, ["role", "skills", "location", "availability"]);
  });

  it("klemmt den Score auf 0–100", () => {
    assert.equal(explainMatch(140, reasons).score, 100);
    assert.equal(explainMatch(-5, reasons).score, 0);
  });

  it("sagt ehrlich, wenn es nichts zu erklaeren gibt", () => {
    const out = explainMatch(0, []);
    assert.equal(out.summary, "Keine Bewertungsgrundlage vorhanden");
    assert.deepEqual(out.axes, []);
  });

  it("beschreibt einen Treffer ohne Staerken ueber seine Luecken", () => {
    const out = explainMatch(0, [reason("availability", 0, 10, { fits: false })]);
    assert.match(out.summary, /^Keine Übereinstimmung: Zeitraum passt nicht$/);
  });

  it("begrenzt die Zusammenfassung auf die wichtigsten Punkte", () => {
    const out = explainMatch(90, reasons, { maxSummaryParts: 2 });
    assert.equal(out.summary.split(", ").length, 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Zusammenspiel mit der echten Engine
// ═══════════════════════════════════════════════════════════════

describe("explainMatch + scoreMatch — echte Score-Beitraege", () => {
  it("erklaert einen echten Engine-Treffer in Klartext", () => {
    const demand = {
      role: "Pflegekraft", skill_tags: ["nachtschicht", "intensiv"],
      location_city: "Kiel", start_date: "2026-08-05", end_date: "2026-08-20"
    };
    const cap = {
      role: "Pflegekraft", skill_tags: ["nachtschicht"],
      location_city: "Kiel", availability_from: "2026-08-01", availability_to: "2026-09-30"
    };
    const { score, reasons } = scoreMatch(demand, cap, {});
    const out = explainMatch(score, reasons);

    // Original-Schreibweise, nicht die interne Kleinschreibung des Vergleichs
    assert.match(out.summary, /Rolle „Pflegekraft" passt genau/);
    assert.match(out.summary, /1 von 2 geforderten Skills/);
    assert.ok(out.axes.length >= 4, "alle Achsen der Engine sind sichtbar");
    assert.ok(out.axes.every((a) => a.label !== a.key || a.key === undefined),
      "keine Achse zeigt ihren technischen Schluessel als Beschriftung");
  });

  it("summarizeMatch liefert denselben Satz wie explainMatch", () => {
    const { score, reasons } = scoreMatch(
      { role: "Koch", skill_tags: ["a"] }, { role: "Koch", skill_tags: ["a"] }, {}
    );
    assert.equal(summarizeMatch(score, reasons), explainMatch(score, reasons).summary);
  });
});

// ═══════════════════════════════════════════════════════════════
// Anhaengen an Trefferlisten
// ═══════════════════════════════════════════════════════════════

describe("attachExplanations — beide Trefferformen im Repo", () => {
  it("erkennt frisch berechnete Treffer (score/reasons)", () => {
    const out = attachExplanations([{ score: 85, reasons: [reason("role", 30, 30, { mode: "exact", role: "koch" })] }]);
    assert.equal(out[0].explanation.quality, "excellent");
    assert.match(out[0].explanation.summary, /Rolle/);
  });

  it("erkennt persistierte Treffer (match_score/reasons aus der Tabelle)", () => {
    const out = attachExplanations([{ match_score: 45, reasons: [reason("skills", 12, 25, { overlap: 1, required: 2 })] }]);
    assert.equal(out[0].explanation.score, 45);
    assert.equal(out[0].explanation.quality, "fair");
  });

  it("vertraegt reasons als JSON-String (JSONB-Spalte ohne Parsing)", () => {
    const out = attachExplanations([{ match_score: 60, reasons: JSON.stringify([reason("availability", 10, 10, { fits: true })]) }]);
    assert.equal(out[0].explanation.axes.length, 1);
  });

  it("vertraegt kaputtes JSON, ohne die Liste zu verlieren", () => {
    const out = attachExplanations([{ match_score: 60, reasons: "{kein json" }]);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].explanation.axes, []);
  });

  it("laesst die urspruenglichen Felder unangetastet", () => {
    const out = attachExplanations([{ score: 50, reasons: [], capacity_post: { id: "CP1" } }]);
    assert.equal(out[0].capacity_post.id, "CP1");
    assert.equal(out[0].score, 50);
  });

  it("gibt Nicht-Listen unveraendert zurueck", () => {
    assert.equal(attachExplanations(undefined), undefined);
    assert.equal(attachExplanations(null), null);
  });
});
