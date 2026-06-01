# Coverage – TempConnect API

## Übersicht

TempConnect nutzt [c8](https://github.com/bcoe/c8) für Code-Coverage basierend auf V8's eingebautem Coverage-Profiler.
Die Konfiguration liegt in `.c8rc.json`.

**Gemessener Scope:** Alle Produktionsdateien (`all: true`) – config, db, middleware, routes, services, utils, queue, workers, app.js.
Test-, Script- und Config-Dateien sind ausgeschlossen.

## Lokale Nutzung

```bash
# Unit-Tests mit Coverage-Report
npm run test:coverage

# Alle Tests inkl. Integration (braucht laufende DB)
npm run test:coverage:full

# Nur Threshold-Check gegen letzte Coverage-Daten
npm run test:coverage:check

# Report erneut generieren (ohne Tests)
npm run test:coverage:report

# Vollständiger QA-Lauf mit Coverage
npm run qa:full
```

### Generierte Reports

Nach `test:coverage` liegen im `coverage/`-Verzeichnis:

| Datei | Zweck |
|---|---|
| `coverage-summary.json` | Maschinenlesbar (CI-Tools, Badges, Dashboards) |
| `lcov.info` | Standard-Format für IDE-Plugins und Codecov/Coveralls |
| `index.html` (im `lcov-report/`) | Browser-Report mit Zeilen-Highlighting |

## CI-Auswertung

Die CI-Pipeline (`.github/workflows/ci.yml`) prüft Coverage in zwei Jobs:

1. **Job 3 – Unit & Service Tests:** Führt `test:coverage` + `test:coverage:check` aus. Artifact: `coverage-unit`.
2. **Job 4 – Integration Tests:** Führt `test:coverage:full` + `test:coverage:check` aus. Artifact: `coverage-full`.

Wenn ein Threshold unterschritten wird, schlägt der Job fehl und blockiert den Merge.

## Aktuelle Thresholds

Definiert in `.c8rc.json`:

```json
{
  "lines": 10,
  "branches": 60,
  "functions": 25,
  "statements": 10
}
```

**Warum diese Werte?**

- `all: true` misst *alle* Produktionsdateien, inkl. Route-Handler und DB-Layer die nur mit Integration-Tests (DB erforderlich) abdeckbar sind.
- Die Unit-Tests decken primär Business-Logic (State Machines, Matching, RBAC, Compliance, Validation) ab.
- Die Thresholds sind als **Regressionsschutz** gesetzt: knapp unter den aktuellen Ist-Werten, damit kein Code-Merge die Coverage verschlechtert.

## Thresholds erhöhen

### Wann erhöhen?

- Nach Ergänzung neuer Testsuites (z.B. weitere Integration-Tests, Route-Handler-Tests)
- Wenn die aktuelle Coverage die Thresholds deutlich übersteigt (>5% Puffer)

### Wie erhöhen?

1. Coverage messen: `npm run test:coverage`
2. Ist-Werte in der Textausgabe ablesen
3. Neue Thresholds in `.c8rc.json` setzen (2-5% unter Ist-Wert als Buffer)
4. Verifizieren: `npm run test:coverage:check`

### Empfohlene Zielwerte (mittelfristig)

Wenn Integration-Tests in CI mit DB laufen:

- Lines: 30–40%
- Branches: 70–75%
- Functions: 40–50%
- Statements: 30–40%

Langfristig (mit Route-Handler-Tests):

- Lines: 60–70%
- Branches: 75–80%
- Functions: 60–70%
- Statements: 60–70%

## Architektur-Hinweise

- **`all: true`** ist bewusst gewählt, damit ungetesteter Code sichtbar bleibt (statt ihn auszublenden).
- **Kein per-file-Threshold** – das Team soll Coverage-Lücken erkennen und gezielt schließen, nicht pro Datei hinterherjagen.
- **`json-summary` Reporter** liefert `coverage/coverage-summary.json` für automatisierte Dashboards oder Badge-Generierung.
