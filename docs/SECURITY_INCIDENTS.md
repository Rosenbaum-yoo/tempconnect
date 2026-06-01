# Security Incidents & Secret-Rotation-Log

> Dieses Dokument erfasst sicherheitsrelevante Vorfälle und den Status notwendiger Secret-Rotationen.
> Werte werden **niemals** in dieser Datei gespeichert — nur Kategorien und Status.
> Erstellt: 2026-05-27 (WAVE_01 Release Hygiene)

---

## Incident-Register

### SEC-2026-001 — Lokale `.env`-Dateien in ZIP-Artefakt

**Datum entdeckt:** 2026-05-23 (ZIP-Scan)
**Schwere:** Mittel (lokale Entwicklungsdateien; kein bestätigter externer Zugriff)
**Status:** Dokumentiert ⏳ | Rotation ausstehend (P0.4)

**Befund:**
Im Rahmen eines manuellen ZIP-Scans des Projektverzeichnisses wurden folgende Dateien im Archiv vorgefunden,
die hätten ausgeschlossen werden müssen:

| Datei | Enthaltene Secret-Kategorien | In Git-History? |
|---|---|---|
| `.env` | DB_PASSWORD, SESSION_SECRET, JWT_SECRET, STRIPE_SECRET_KEY, INTERNAL_CRON_SECRET | **Nein** ✅ |
| `.env.local` | (überschreibende lokale Werte — Kategorien wie oben) | **Nein** ✅ |
| `.env.txt` | (Export-Kopie — Kategorien wie oben) | **Nein** ✅ |
| `deploy/.env` | (Deploy-Konfiguration — Kategorien wie oben) | **Nein** ✅ |

**Verifikation Git-History (2026-05-27):**
```
git log --all --full-history --format="%h" -- ".env" ".env.local" ".env.txt" "deploy/.env"
→ (leere Ausgabe) — keine der Dateien wurde je committed
```

**Ursache:** Manuelles ZIP des gesamten Arbeitsverzeichnisses ohne Filterung.
Das CI-System verwendet `git archive` — gitignored files werden niemals eingeschlossen.
Die `.gitignore` deckt alle betroffenen Pfade korrekt ab.

**Maßnahmen (bereits erledigt):**
- [x] `.gitignore` enthält alle betroffenen Pfade ✅ (war bereits korrekt)
- [x] CI `verify_release_dir` um fehlende Blocker erweitert (WAVE_01) ✅
- [x] `.env.example` `JWT_SECRET`-Platzhalter gehärtet (WAVE_01) ✅

**Ausstehende Maßnahmen:**
- [ ] **P0.4 — Secret-Rotation:** Alle Produktions-Secrets als potentiell kompromittiert behandeln.
  Rotation vor Go-Live erforderlich. Betroffen:
  - `DB_PASSWORD` / `POSTGRES_PASSWORD` (Produktionsdatenbank)
  - `SESSION_SECRET`
  - `JWT_SECRET`
  - `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
  - `INTERNAL_CRON_SECRET`
  - `ADMIN_SECRET`
  - Alle weiteren in `.env`, `.env.local`, `deploy/.env` enthaltenen Werte

**Risikobewertung:**
Da die Dateien nie in Git lagen und das ZIP nur im internen Entwicklungskontext existierte,
ist das Risiko einer tatsächlichen Kompromittierung gering. Rotation bleibt dennoch
**Pflicht vor Produktionsstart** (Defense-in-Depth-Prinzip).

---

## Offene Rotation-Checkliste (Stand: 2026-05-27)

| Secret-Kategorie | Priorität | Status |
|---|---|---|
| DB_PASSWORD (Produktion) | P0 | ⏳ ausstehend |
| SESSION_SECRET (Produktion) | P0 | ⏳ ausstehend |
| JWT_SECRET (Produktion) | P0 | ⏳ ausstehend |
| STRIPE_SECRET_KEY | P0 | ⏳ ausstehend |
| STRIPE_WEBHOOK_SECRET | P0 | ⏳ ausstehend |
| INTERNAL_CRON_SECRET | P1 | ⏳ ausstehend |
| ADMIN_SECRET | P1 | ⏳ ausstehend |
| SMTP_PASS (falls gesetzt) | P1 | ⏳ ausstehend |

> Rotation-Protokoll: Neuen Wert generieren (`openssl rand -hex 32`), in Produktion setzen,
> alten Wert widerrufen. Status hier auf ✅ setzen sobald abgeschlossen.

---

## Präventivmaßnahmen (nach WAVE_01 aktiv)

| Maßnahme | Datei | Status |
|---|---|---|
| `.gitignore` deckt `.env*`, `.claude/`, `_zip_analysis/` ab | `.gitignore` | ✅ aktiv |
| CI `verify_release_dir` blockt alle kritischen Pfade | `.github/workflows/ci.yml` | ✅ nach WAVE_01 |
| `FEATURE_GATE_BYPASS=false` in `.env.example` | `.env.example` | ✅ aktiv |
| CI verwendet `git archive` (kein Worktree-Leak) | `.github/workflows/ci.yml` | ✅ aktiv |
| SHA-256-Manifest pro Release | `.github/workflows/ci.yml` | ✅ aktiv |
| Größen-Limit (100 MB) auf Release-Artefakt | `.github/workflows/ci.yml` | ✅ nach WAVE_01 |
