#!/usr/bin/env node
/**
 * Rendert den Zustandsteil von `docs/security/TENANT_ISOLATION_MODEL.md` aus
 * `api/test/fixtures/mandantenTabellen.json`.
 *
 *   node scripts/render-mandanten-modell.js          # nur anzeigen
 *   node scripts/render-mandanten-modell.js --write  # ins Dokument schreiben
 *
 * Warum generiert statt gepflegt: siehe api/test/helpers/mandantenModell.js.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rendereModell, MARKER_START, MARKER_ENDE } from "../api/test/helpers/mandantenModell.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(HIER, "..");
const REGISTRY = path.join(WURZEL, "api/test/fixtures/mandantenTabellen.json");
const DOKUMENT = path.join(WURZEL, "docs/security/TENANT_ISOLATION_MODEL.md");

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
const block = rendereModell(registry);

if (!process.argv.includes("--write")) {
  process.stdout.write(block + "\n");
  process.exit(0);
}

const text = fs.readFileSync(DOKUMENT, "utf8");
const von = text.indexOf(MARKER_START);
const bis = text.indexOf(MARKER_ENDE);
if (von === -1 || bis === -1 || bis < von) {
  console.error(
    `Marker nicht gefunden in ${DOKUMENT}.\nErwartet:\n  ${MARKER_START}\n  ${MARKER_ENDE}`
  );
  process.exit(1);
}
const neu = text.slice(0, von) + MARKER_START + "\n" + block + "\n" + text.slice(bis);
fs.writeFileSync(DOKUMENT, neu);
console.log(`${path.relative(WURZEL, DOKUMENT)} neu gerendert (${registry.tabellen.length} Tabellen).`);
