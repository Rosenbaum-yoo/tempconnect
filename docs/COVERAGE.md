# Coverage-Reporting

## Überblick

TempConnect nutzt [`c8`](https://github.com/bcoe/c8) als verbindliche Coverage-Quelle.
Maßgeblich sind die reale Konfiguration in `api/.c8rc.json` und die reale Pipeline in `.github/workflows/ci.yml`.

Wesentliche Eigenschaften:

- `all: true` — auch ungeladene Quelldateien erscheinen im Report
- `check-coverage: true` — Coverage ist ein Hard-Gate
- dieselben Schwellen gelten lokal und in CI
- Coverage ist ein Release-Gate, kein bloßer Info-Report

---

## Quick Reference

```bash
cd api && npm run test:coverage
cd api && npm run test:coverage:full
cd api && npm run test:coverage:check
cd api && npm run test:coverage:report
cd api && npm run qa:full
```

Die ausgeführten Testdateien werden über `api/scripts/run-tests.js` automatisch aus dem Repository erkannt.
Neue Tests unter `api/test/` und `api/test/integration/` müssen daher nicht mehr in mehreren npm-Skripten nachgetragen werden.

---

## Aktuell erzwungene Schwellenwerte

Quelle der Wahrheit: `api/.c8rc.json`

| Metrik | Schwelle |
|---|---|
| Lines | 35 % |
| Branches | 75 % |
| Functions | 55 % |
| Statements | 35 % |

Diese Werte werden über `c8 check-coverage` direkt aus der zentralen Konfiguration gezogen.
`api/package.json` dupliziert die Schwellen bewusst nicht noch einmal per CLI-Flags.

---

## Scope

### Eingeschlossen

- `config/**`
- `db/**`
- `middleware/**`
- `routes/**`
- `services/**`
- `utils/**`
- `queue/**`
- `workers/**`
- `app.js`

### Ausgeschlossen

- `node_modules/**`
- `test/**`
- `scripts/**`
- `eslint.config.js`
- `server.js`
- `coverage/**`

---

## Reports

Standard-Reporter laut `api/.c8rc.json`:

- `text`
- `text-summary`
- `json-summary`
- `lcov`

Ablageorte:

- `api/coverage`
- `api/.c8_output`

Optional lokal:

```bash
cd api
npx c8 report --reporter=html
```

---

## CI-Integration

### `unit-tests`

```bash
cd api && npm run test:coverage
cd api && npm run test:coverage:check
```

### `integration-tests`

```bash
cd api && npm run test:coverage:full
cd api && npm run test:coverage:check
```

Beide Jobs laden `api/coverage/lcov.info` als Artefakt hoch.
Coverage ist damit ein echter Build-Blocker und nicht nur ein Reporting-Nebenprodukt.

---

## Governance-Regeln

1. Schwellenwerte werden ausschließlich in `api/.c8rc.json` geändert.
2. Änderungen an Coverage-Gates ziehen `docs/COVERAGE.md` und `api/docs/COVERAGE_STRATEGY.md` im selben Change nach.
3. Neue kritische Tests müssen in die richtige Suite-Struktur (`api/test/` vs. `api/test/integration/`) gelegt werden, damit lokale QA und CI sie automatisch erfassen.
4. Coverage ist ein Regressionsschutz für kritische Pfade, keine kosmetische Prozentzahl.

---

## Interpretation

Coverage beantwortet zuverlässig:

- wird neuer Code ohne Tests in den Hauptpfad geschoben?
- gibt es komplette Bereiche ohne jede Abdeckung?

Coverage beantwortet nicht automatisch:

- ob Tests fachlich gut sind
- ob Fehlerpfade und Nebenwirkungen robust genug geprüft wurden

Darum bleibt Coverage nur ein Teil der QA-Härtung und wird immer zusammen mit Flow-, Sicherheits- und Release-Checks betrachtet.
