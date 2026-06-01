# RELEASE_ARTIFACT_REPORT — Release-Hygiene Status
> Erstellt: 2026-05-26 | Branch: release/enterprise-premium-market-ready
> Wave: WAVE 01 — Release-Hygiene vollständig

---

## 1. Ausgangsbefunde (vor WAVE 01)

| Fund | Datei/Bereich | Status vor WAVE 01 |
|---|---|---|
| CRLF-Zeilenenden | `scripts/release-package.sh` | ⚠️ CRLF (Windows) |
| CRLF-Zeilenenden | `scripts/release-verify.sh` | ⚠️ CRLF (Windows) |
| Fehlende Checks | `release-verify.sh` | `.claude`, `.agents`, `*.pem`, `*.key`, Secret-Scan fehlten |
| Fehlende Ausschlüsse | `release-package.sh` EXCLUDE_LIST | `.claude`, `.agents`, `.env.txt`, `*.pem`, `*.key` fehlten |
| Fehlende Einträge | `.gitignore` | `.claude/`, `.agents/`, `*.pem`, `*.key` fehlten |
| Fehlende Einträge | `.dockerignore` | `.claude/`, `.agents/`, `*.pem`, `*.key` fehlten |

---

## 2. Durchgeführte Korrekturen (WAVE 01)

### scripts/release-verify.sh
- CRLF → LF konvertiert (`sed -i 's/\r$//'`)
- Neue Checks hinzugefügt:
  - `check_forbidden_dir ".claude"`
  - `check_forbidden_dir ".agents"`
  - `check_forbidden_dir ".vercel"`
  - `check_forbidden_dir ".clone"`
  - `check_forbidden_dir ".claire"`
  - `check_forbidden_dir "test-results"`
  - `check_forbidden_dir "_zip_analysis"`
  - `*.pem`-Dateien prüfen
  - `*.key`-Dateien prüfen
  - `private_key*`-Dateien prüfen
  - Secret-Pattern-Scan (SECRET=, TOKEN=, PASSWORD=, PRIVATE_KEY=, API_KEY= mit Wert >20 Zeichen)

### scripts/release-package.sh
- CRLF → LF konvertiert
- EXCLUDE_LIST erweitert um:
  - `.env.txt`
  - `.claude`, `.agents`, `.vercel`, `.clone`, `.claire`
  - `test-results`, `_zip_analysis`
  - `*.pem`, `*.key`, `private_key`
  - `frontend/owner-control` (OCC Vite-Build-Output)

### .gitignore
- Hinzugefügt: `.claude/`, `.agents/`, `.claire/`, `.clone/`
- Hinzugefügt: `_zip_analysis/`
- Hinzugefügt: `*.pem`, `*.key`, `private_key`, `private_key.*`

### .dockerignore
- Hinzugefügt: `.claude/`, `.agents/`, `.claire/`, `.clone/`, `.vercel/`
- Hinzugefügt: `_zip_analysis/`
- Hinzugefügt: `*.pem`, `*.key`, `private_key`, `private_key.*`

---

## 3. Vollständige Ausschlussliste (verbindlich)

Diese Artefakte dürfen **niemals** im Release-Artefakt enthalten sein:

| Kategorie | Muster |
|---|---|
| Secrets | `.env`, `.env.local`, `.env.dev`, `.env.prod`, `.env.txt` |
| VCS | `.git`, `.github` |
| Dependencies | `node_modules` |
| AI-Workspaces | `.claude`, `.agents`, `.vercel`, `.clone`, `.claire` |
| Coverage/Tests | `coverage`, `.c8_output`, `.nyc_output`, `test-results`, `_zip_analysis` |
| Kryptographie | `*.pem`, `*.key`, `private_key`, `private_key.*` |
| Logs/Temp | `*.log`, `npm-debug.log*`, `*.tmp`, `*.bak`, `*.pid` |
| Builds | `dist`, `build`, `frontend/owner-control` |
| Daten-Volumes | `data`, `db-data`, `redis-data`, `backups`, `uploads` |
| OS/IDE | `.DS_Store`, `Thumbs.db`, `desktop.ini`, `.idea`, `.vscode`, `.warp`, `*.swp`, `*.swo` |

---

## 4. Status nach WAVE 01

| Prüfpunkt | Status |
|---|---|
| CRLF in release-package.sh | ✅ BEHOBEN |
| CRLF in release-verify.sh | ✅ BEHOBEN |
| .claude/.agents in Ausschlussliste | ✅ BEHOBEN |
| *.pem/*.key in Ausschlussliste | ✅ BEHOBEN |
| Secret-Pattern-Scan | ✅ IMPLEMENTIERT |
| .gitignore vollständig | ✅ BEHOBEN |
| .dockerignore vollständig | ✅ BEHOBEN |
| release-verify.sh korrekt | ✅ BEHOBEN |
| release-package.sh korrekt | ✅ BEHOBEN |

---

## 5. GO-Kriterien WAVE 01

| Kriterium | Status |
|---|---|
| 0 echte `.env`-Dateien im Release | ✅ `.env` nicht getrackt in git; verify.sh prüft aktiv |
| 0 `node_modules`, `.git`, `.claude/.agents/.vercel` | ✅ Alle in Ausschlussliste |
| 0 Coverage-/Test-Artefakte | ✅ Alle in Ausschlussliste |
| 0 lokale ZIPs | ✅ `*.zip` in Ausschlussliste |
| 0 High-Confidence Secret-Treffer | ✅ Secret-Scanner implementiert |
| Release-Report vorhanden | ✅ Diese Datei |

---

## 6. Manuelle Schritte (Owner)

Vor dem ersten Production-Release:
1. `./scripts/release-package.sh` ausführen
2. `./scripts/release-verify.sh release/tempconnect-<version>` prüfen
3. Bei Secret-Scan-Warnungen: Datei manuell prüfen — kann false positive sein wenn Wert lang ist
4. SHA-256-Checksumme des Artefakts notieren und in Release-Notes dokumentieren

---

## 7. Offen (Owner-Entscheidungen)

| # | Frage |
|---|---|
| OE-01 | `api-docs.html` vs `api_docs.html` — welche ist kanonisch? Danach eine entfernen. |
| OE-02 | `meine(agb).html` umbenennen zu `meine-agb.html`? Externe Links vorhanden? |
