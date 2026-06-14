/**
 * generate-openapi.js — schreibt openapi/spec.json aus den echten Zod-Schemas.
 * Lauf: `npm run openapi:generate` (cwd=api). Build-time-only (siehe registry.js).
 * Der Drift-Test (openapi.spec.test.js) prüft, dass die committete spec.json aktuell ist.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildOpenApiDocument } from "../openapi/registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "openapi", "spec.json");

const doc = buildOpenApiDocument();
const json = JSON.stringify(doc, null, 2) + "\n";
writeFileSync(OUT, json);

const pathCount = Object.keys(doc.paths || {}).length;
const compCount = Object.keys(doc.components?.schemas || {}).length;
console.log(`openapi: spec.json geschrieben — ${pathCount} Pfade, ${compCount} Schemas, OpenAPI ${doc.openapi}`);
