/**
 * openapi.spec.test.js — DRIFT-GUARD für die generierte OpenAPI-Spezifikation (A.2).
 *
 * Kern-Assertion: die committete openapi/spec.json MUSS exakt dem entsprechen, was
 * der Generator aus den aktuellen Zod-Schemas erzeugt. Ändert jemand ein Zod-Schema
 * ohne `npm run openapi:generate`, schlägt dieser Test fehl → Doku-Drift wird unmöglich.
 *
 * Hinweis: registry.js ruft extendZodWithOpenApi() (additiv, ändert keine Validierung) —
 * build-time-isoliert, von der laufenden App nie importiert.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../openapi/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, "..", "openapi", "spec.json");

test("openapi: spec.json ist aktuell (kein Drift gegenüber Zod-Schemas)", () => {
  const committed = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
  const generated = buildOpenApiDocument();
  assert.deepEqual(
    generated,
    committed,
    "openapi/spec.json ist veraltet — bitte `npm run openapi:generate` ausführen und committen."
  );
});

test("openapi: Grundstruktur (3.0.3, Pfade, Components, Security)", () => {
  const doc = buildOpenApiDocument();
  assert.equal(doc.openapi, "3.0.3");
  assert.equal(doc.info.title, "TempConnect API");
  assert.ok(Object.keys(doc.paths).length >= 20, "mindestens 20 dokumentierte Pfade (inkl. Integrations-Vertrag)");
  assert.ok(Object.keys(doc.components.schemas).length >= 13, "alle zentralen Zod-Schemas als Components");
  assert.ok(doc.components.securitySchemes.sessionCookie, "sessionCookie-Security definiert");
  assert.ok(doc.components.securitySchemes.csrfToken, "csrfToken-Security definiert");
  assert.ok(doc.components.securitySchemes.apiKey, "apiKey-Security definiert");
});

test("openapi: Request-Bodies sind an echte Zod-Schemas gebunden (Beispiel auth/register)", () => {
  const doc = buildOpenApiDocument();
  const reg = doc.paths["/auth/register"]?.post;
  assert.ok(reg, "POST /auth/register dokumentiert");
  const schema = reg.requestBody?.content?.["application/json"]?.schema;
  assert.ok(schema, "register hat einen Request-Body");
  // $ref auf die registrierte Component ODER inline-Objekt — beides ist an Zod gebunden.
  assert.ok(schema.$ref || schema.type === "object", "Body referenziert ein echtes Schema");
});

test("openapi: Integrations-Vertrag — Daten-Endpunkte tragen API-Key-Security + Scope-Hinweis", () => {
  const doc = buildOpenApiDocument();
  // Externe SAP/HR-Systeme docken hier an: read-Endpunkte fuer workers/timesheets/invoices/assignments.
  const dataReads = [
    ["/workers", "read:workers"],
    ["/timesheets", "read:timesheets"],
    ["/assignments", "read:assignments"],
    ["/invoices", "read:invoices"]
  ];
  for (const [p, scope] of dataReads) {
    const op = doc.paths[p]?.get;
    assert.ok(op, `GET ${p} dokumentiert`);
    // Akzeptiert API-Key (Bearer) zusaetzlich zur Session.
    const hasApiKey = Array.isArray(op.security) && op.security.some((s) => "apiKey" in s);
    assert.ok(hasApiKey, `GET ${p} akzeptiert API-Key-Auth`);
    assert.ok(op.summary.includes(scope), `GET ${p} nennt den noetigen Scope ${scope}`);
  }
  // CSV-Exporte (Fibu/Lohn-Vorstufe) sind dokumentiert.
  assert.ok(doc.paths["/invoices/export"]?.get, "GET /invoices/export (CSV) dokumentiert");
  assert.ok(doc.paths["/timesheets/export/csv"]?.get, "GET /timesheets/export/csv dokumentiert");
});

test("openapi: mutierende Pfade verlangen Auth + liefern Standard-Fehler", () => {
  const doc = buildOpenApiDocument();
  const post = doc.paths["/requisitions"]?.post;
  assert.ok(post, "POST /requisitions dokumentiert");
  assert.ok(Array.isArray(post.security) && post.security.length > 0, "mutierender Pfad ist security-pflichtig");
  for (const code of ["400", "401", "403", "429"]) {
    assert.ok(post.responses[code], `Standard-Fehler ${code} dokumentiert`);
  }
});
