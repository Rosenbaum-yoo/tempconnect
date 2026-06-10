import { test } from "node:test";
import assert from "node:assert/strict";
import { moderateComment, _internals } from "../services/contentModerationService.js";

test("clean comments are not flagged (no false positives)", async () => {
  const clean = [
    "Sehr professionell und zuverlaessig, gerne wieder!",
    "Die Schifffahrt war puenktlich und das Team kompetent.",
    "Alles bestens, faire Konditionen und schnelle Abwicklung.",
    "Top Spezialisten, sehr empfehlenswert und freundlich.",
    "",
    null,
    undefined,
  ];
  for (const txt of clean) {
    const r = await moderateComment(txt);
    assert.equal(r.flagged, false, `should NOT flag: ${JSON.stringify(txt)} -> ${r.matches.map((m) => m.word).join(",")}`);
    assert.equal(r.severity, "none");
    assert.deepEqual(r.matches, []);
  }
});

test("clear profanity is flagged with the matched word", async () => {
  const r = await moderateComment("Du Arschloch, totaler Betrug");
  assert.equal(r.flagged, true);
  assert.equal(r.severity, "high");
  assert.ok(r.matches.some((m) => m.word === "arschloch"), "expected arschloch match");
});

test("leetspeak is normalized and caught (sch31sse, f0tze)", async () => {
  const r = await moderateComment("sch31sse Service, echt eine f0tze");
  assert.equal(r.flagged, true);
  assert.ok(r.matches.some((m) => m.word === "scheisse"), "leetspeak scheisse");
  assert.ok(r.matches.some((m) => m.word === "fotze"), "leetspeak fotze");
});

test("repeated characters are collapsed (Scheisssssse)", async () => {
  const r = await moderateComment("Scheisssssse, nie wieder");
  assert.equal(r.flagged, true);
  assert.ok(r.matches.some((m) => m.word === "scheisse" || m.word === "scheiss"));
});

test("umlauts normalize so compounds match (Arschloecher via ö)", async () => {
  const r = await moderateComment("Diese Arschlöcher haben uns betrogen");
  assert.equal(r.flagged, true, "ö should normalize to o and match arschloch");
});

test("severity is the maximum across matches", async () => {
  const r = await moderateComment("so ein vollpfosten und arschloch");
  assert.equal(r.severity, "high"); // arschloch(high) > vollpfosten(medium)
});

test("word-anchor avoids mid-word false positives", async () => {
  // 'arsch' darf nicht mitten in einem harmlosen Wort triggern.
  const r = await moderateComment("Die Geschaeftsanalyse war sehr gruendlich.");
  assert.equal(r.flagged, false);
});

test("normalize(): leetspeak + ß + repeats", () => {
  assert.equal(_internals.normalize("Sch31SSE"), "scheisse");
  assert.equal(_internals.normalize("Straße"), "strasse");
  assert.equal(_internals.normalize("Hallooooo"), "halloo");
  assert.equal(_internals.normalize("a@b5c"), "aabsc");
});

test("BADWORDS list is well-formed (word + valid severity)", () => {
  const valid = new Set(["low", "medium", "high", "critical"]);
  for (const bw of _internals.BADWORDS) {
    assert.equal(typeof bw.w, "string");
    assert.ok(bw.w.length > 0);
    assert.ok(valid.has(bw.s), `invalid severity for ${bw.w}: ${bw.s}`);
  }
});
