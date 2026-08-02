/**
 * auditCoverageCheck.test.js — der Audit-Coverage-Gate-Scanner selbst.
 *
 * Das Gate ist eine Sicherheitszusage ("jede Mutation ist auditiert"). Ein Scanner-Fehler
 * ist damit selbst ein Sicherheitsproblem — und zwar in BEIDE Richtungen:
 *   - false positive  → gruener Code wird rot gemeldet, das Gate verliert Glaubwuerdigkeit
 *   - false negative  → eine echte Audit-Luecke wird still durchgewinkt (gefaehrlicher)
 * Beide Richtungen werden hier festgenagelt.
 *
 * Pfadaufloesung bewusst ueber import.meta.url (nicht process.cwd()), damit die Tests
 * unabhaengig vom Startverzeichnis real laufen statt lautlos zu skippen.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractCallArguments, resolveFunctionBody, hasAuditViaLocalWrapper, checkFile
} from "../scripts/audit-coverage-check.js";

describe("audit-coverage-check — extractCallArguments (Handler-Grenze)", () => {
  it("schneidet exakt die Argumentliste, nicht den Rest der Datei", () => {
    const src = `router.post("/a", (req, res) => { res.json({ ok: 1 }); });\nconst danach = writeAudit(pool, {});`;
    const block = extractCallArguments(src, 0);
    assert.ok(block.endsWith(")"), "Block endet an der schliessenden Klammer");
    assert.ok(!block.includes("danach"), "Code nach der Registrierung gehoert nicht zum Handler");
  });

  it("zaehlt Klammern in Kommentaren NICHT mit (`// 1)` beendet den Handler nicht)", () => {
    // Regressionsfall: nummerierte Schritt-Kommentare sind im Repo verbreitet und haben
    // den Handler frueher mittendrin abgeschnitten — der Audit-Aufruf dahinter ging verloren.
    const src = [
      'router.post("/a", async (req, res) => {',
      "  // 1) Vorbereitung",
      "  const x = 1;",
      "  /* 2) Block-Kommentar mit ) */",
      "  res.locals.audit = { action: 'a.b' };",
      "});"
    ].join("\n");
    const block = extractCallArguments(src, 0);
    assert.ok(block.includes("res.locals.audit"), "Audit-Marker muss im Block liegen");
  });

  it("zaehlt Klammern in String-Literalen NICHT mit", () => {
    const src = `router.post("/a(b)c", async (req, res) => { const s = ")))"; res.locals.audit = {}; });`;
    const block = extractCallArguments(src, 0);
    assert.ok(block.includes("res.locals.audit"));
  });

  it("erkennt Regex-Literale — `/^\\//` ist kein Zeilenkommentar", () => {
    // Regressionsfall aus documentCenter.js: das schliessende `//` der Regex wurde als
    // Kommentarbeginn gelesen, die Klammerbilanz kippte und der Scanner fiel auf die
    // permissive Ersatzgrenze zurueck.
    const src = [
      'router.delete("/a", async (req, res) => {',
      '  const fp = path.join(process.cwd(), ref.replace(/^\\//, ""));',
      "  res.locals.audit = { action: 'a.del' };",
      "});"
    ].join("\n");
    const block = extractCallArguments(src, 0);
    assert.ok(block !== null, "Klammerbilanz muss aufgehen");
    assert.ok(block.includes("res.locals.audit"));
  });

  it("Regex mit Zeichenklasse [/] beendet die Regex nicht vorzeitig", () => {
    const src = [
      'router.post("/a", async (req, res) => {',
      '  const parts = s.split(/[/,]/);',
      "  res.locals.audit = { action: 'a.b' };",
      "});"
    ].join("\n");
    const block = extractCallArguments(src, 0);
    assert.ok(block !== null && block.includes("res.locals.audit"));
  });

  it("gibt null zurueck, wenn die Klammerung nicht aufgeht", () => {
    assert.equal(extractCallArguments('router.post("/a", (req, res) => {', 0), null);
  });
});

describe("audit-coverage-check — resolveFunctionBody", () => {
  it("findet `async function f()` und liefert den brace-gematchten Rumpf", () => {
    const src = "async function applyUpdate(req, res) { const a = { x: 1 }; return a; }\nfunction other() { writeAudit(); }";
    const body = resolveFunctionBody(src, "applyUpdate");
    assert.ok(body.startsWith("{") && body.endsWith("}"));
    assert.ok(!body.includes("writeAudit"), "Rumpf der NAECHSTEN Funktion darf nicht hineinlecken");
  });

  it("findet const-Arrow-Definitionen", () => {
    const src = "const handle = async (req, res) => { writeAudit(pool, {}); };";
    assert.ok(resolveFunctionBody(src, "handle").includes("writeAudit"));
  });

  it("ueberspringt destrukturierte Parameter statt sie als Rumpf zu lesen", () => {
    const src = "function f({ a, b }) { writeAudit(pool, {}); }";
    const body = resolveFunctionBody(src, "f");
    assert.ok(body.includes("writeAudit"), "Parameter-Objekt darf nicht als Rumpf gelten");
  });

  it("null bei unbekanntem Namen", () => {
    assert.equal(resolveFunctionBody("const a = 1;", "nixda"), null);
  });
});

describe("audit-coverage-check — lokale Audit-Wrapper", () => {
  it("akzeptiert einen Wrapper, der nachweislich writeAudit aufruft", () => {
    const src = "async function writeScimAudit(req, p) { await auditLog.writeAudit(pool, p); }";
    assert.equal(hasAuditViaLocalWrapper(src, "await writeScimAudit(req, { action: 'x' });"), true);
  });

  it("lehnt einen Wrapper OHNE echten Audit-Aufruf ab (kein Blindvertrauen auf Namen)", () => {
    const src = "function fakeAudit() { return true; }";
    assert.equal(hasAuditViaLocalWrapper(src, "fakeAudit();"), false);
  });
});

describe("audit-coverage-check — checkFile (End-to-End)", () => {
  let dir;
  const write = (name, src) => { const p = join(dir, name); writeFileSync(p, src, "utf-8"); return p; };

  before(() => { dir = mkdtempSync(join(tmpdir(), "auditgate-")); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  it("meldet einen Mutations-Handler ohne jeden Audit-Marker", () => {
    const p = write("plain.js", 'router.post("/x/plain", async (req, res) => { res.json({}); });');
    const v = checkFile(p);
    assert.equal(v.length, 1);
    assert.equal(v[0].method, "POST");
    assert.equal(v[0].route, "/x/plain");
  });

  it("akzeptiert einen als Referenz registrierten Handler MIT Audit (SCIM-Muster)", () => {
    // Genau der Fall, den das Gate frueher falsch als Verstoss meldete:
    // PUT und PATCH teilen sich eine benannte Handler-Funktion.
    const p = write("ref-audit.js", [
      "async function applyUpdate(req, res) {",
      "  await auditLog.writeAudit(pool, { action: 'scim.user_activated', entity_type: 'user', entity_id: req.params.id });",
      "  res.json({});",
      "}",
      'router.patch("/scim/v2/Users/:id", gate, scope, json, applyUpdate);',
      'router.put("/scim/v2/Users/:id", gate, scope, json, applyUpdate);'
    ].join("\n"));
    assert.deepEqual(checkFile(p), [], "referenzierter Handler mit Audit ist abgedeckt");
  });

  it("meldet einen als Referenz registrierten Handler OHNE Audit", () => {
    const p = write("ref-noaudit.js", [
      "async function noAudit(req, res) { res.json({}); }",
      'router.put("/x/ref", gate, noAudit);'
    ].join("\n"));
    assert.equal(checkFile(p).length, 1);
  });

  it("akzeptiert den Weg Handler → lokaler Wrapper → writeAudit", () => {
    const p = write("wrapper.js", [
      "async function writeScimAudit(req, p) { await auditLog.writeAudit(pool, p); }",
      'router.post("/x/w", async (req, res) => { await writeScimAudit(req, { action: "a" }); res.json({}); });'
    ].join("\n"));
    assert.deepEqual(checkFile(p), []);
  });

  it("laesst sich NICHT von einer audit-haltigen Nachbarfunktion taeuschen", () => {
    // Frueher wurde alles bis zur naechsten Registrierung als Handler-Block gelesen —
    // ein writeAudit in einer DAZWISCHEN stehenden Funktion deckte den Handler faelschlich ab.
    const p = write("bleed.js", [
      'router.patch("/x/luecke", async (req, res) => { res.json({}); });',
      "async function nachbar(req, res) {",
      "  await auditLog.writeAudit(pool, { action: 'anderes.ding' });",
      "}",
      'router.delete("/x/ok", nachbar);'
    ].join("\n"));
    const v = checkFile(p);
    assert.equal(v.length, 1, "die echte Luecke muss gemeldet werden");
    assert.equal(v[0].route, "/x/luecke");
  });

  it("501-Stubs brauchen keinen Audit", () => {
    const p = write("stub.js", 'router.post("/x/stub", (req, res) => res.status(501).json({ error: "NOT_IMPLEMENTED" }));');
    assert.deepEqual(checkFile(p), []);
  });
});
