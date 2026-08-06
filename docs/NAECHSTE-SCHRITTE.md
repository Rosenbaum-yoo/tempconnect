# Nächste Schritte — Übergabe für einen neuen Chat

> **Stand:** 2026-08-06 · Branch `release/enterprise-premium-market-ready` · Commit `cfe9ff3`
> **Zweck:** Einstiegspunkt. Diese Datei sagt, wo etwas steht und wo es weitergeht —
> sie wiederholt die Detailpläne **nicht**, sondern verweist auf sie.

---

## 1. Zuerst lesen (in dieser Reihenfolge)

| Datei | Wofür |
|---|---|
| `AGENTS.md`, `.agents/skills/tempconnect-project/SKILL.md`, `CLAUDE.md` | Pflicht vor dem ersten Edit |
| [features/P8_DEAL_VERBINDLICHKEIT.md](features/P8_DEAL_VERBINDLICHKEIT.md) | **Aktuelle Arbeit.** Wellen A–E, Leitentscheidungen, Owner-Entscheidungen |
| [features/URSPRUNGSPROMPT_AUDIT.md](features/URSPRUNGSPROMPT_AUDIT.md) | Punkt-für-Punkt-Stand des großen Ursprungsprompts |
| [features/P6_I18N_UEBERGABE.md](features/P6_I18N_UEBERGABE.md) | Zweisprachigkeit: Regeln für jede neue sichtbare Zeichenkette |
| [TWILIO-EINRICHTEN.md](TWILIO-EINRICHTEN.md) | SMS-Kanal: was der Owner tut, was im Code fehlt (~20 Zeilen) |

---

## 2. Arbeitsumgebung

- **Arbeitskopie:** `C:\Users\DennisStegemann\Desktop\12_tempconnect_docker(D)` — die
  OneDrive-Kopie ist nur Backup, dort niemals arbeiten.
- **Frontend sichtbar machen:** `docker restart tempconnect_frontend`
- **API neu laden:** `docker restart tempconnect_api` — braucht danach mehrere Minuten
  (kalter Windows-Bind-Mount). Mit `curl http://localhost:8080/api/health` prüfen.
- **Datenbank:** `docker exec -i tempconnect_db psql -U tempconnect -d tempconnect`
- **Migration einspielen:** `... psql ... -v ON_ERROR_STOP=1 -f - < sql/migrations/<datei>.sql`
- **E2E:** `npx playwright test --config e2e/playwright.config.js <spec>` (installiert)
- **Commit/Push:** nur nach ausdrücklicher Owner-Freigabe. Immer gezielt `git add <dateien>`,
  **nie** `git add -A` — im Baum liegen unversionierte Geschäftsdokumente
  (`docs/launch/`, UG-PDF, `docs/aktuellesitzung/`).

---

## 3. Die fünf Regeln, die in dieser Sitzung Geld gespart hätten

1. **Vollsuite vor jedem Commit:** `cd api && node scripts/run-tests.js` — **ohne Pipe**,
   sonst verschluckt die Shell den Exit-Code. Die i18n-Gates decken ~2 % ab; drei Wellen
   wurden gegen sie freigegeben und hinterließen 7 rote Tests.
2. **Zeitzonen nie über die Maschinenzeit herleiten.**
   `new Date(d.toLocaleString("en-US", {timeZone}))` misst die Zeitzone des *Rechners* —
   auf einem deutschen Gerät konstant 0, auf dem Server falsch. `Intl.formatToParts` nutzen.
3. **Neuer Cron-Endpunkt → `docs/SCHEDULER.md`**, sonst wird
   `api/test/schedulerConsistency.test.js` rot. 16 Endpunkte liefen nie, weil sie dort fehlten.
4. **Neue Doku → aus `docs/README.md` verlinken**, sonst wird `docsConsistency.test.js` rot.
5. **Seiten-JS, das in einer vm-Sandbox läuft, braucht die lokale i18n-Brücke**
   (Vorbild `js/pages/marketplaceFeed.js`) und einen Guard um `document.addEventListener`.

> **Bekannter Flake:** Erscheint im Volllauf
> `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … src\win\async.c:76`, ist der
> Lauf zu **wiederholen** — das ist ein libuv-Abbruch beim Prozessende unter Windows,
> kein fehlgeschlagener Test. Ein Lauf, der **ohne** diese Zeile rot ist, ist echt.

---

## 4. Wo es weitergeht

### Sofort: P8 Welle B

`deal_success_rate` beleben. Die Spalte steuert das Feed-Ranking
(`capacityExchangeService.js:843`), wurde aber **nie geschrieben** — ein Storno kostet
deshalb bis heute nichts. Rohdaten liegen seit Welle A in `offer_cancellations`.

Gewichtung (Owner entschieden): **< 48 h vor Beginn doppelt · ≥ 14 Tage gar nicht ·
`customer_cancelled` und `worker_sick` zählen nicht gegen die Agentur · Quote erst ab
5 Deals sichtbar.** Details und Gates in P8, Abschnitt 5.

Danach: **C** (Zuverlässigkeits-Bounty 3 %) → **D** (3-Schritte-Bestätigung) → **E**
(Besetzbarkeits-Vorschau, unabhängig und jederzeit vorziehbar).

### Wartet auf den Owner

| | |
|---|---|
| **Twilio** | Owner richtet den Account ein; danach ~20 Codezeilen an der markierten Stelle in `api/services/smsService.js` |
| **Landing-Bilder** | Owner liefert kurz vor Live; Prompts in `docs/mockups/LANDING_KI_BILD_PROMPTS.md` |
| **Bugfix-Liste** | Owner hat eine angekündigt — noch nicht übergeben |

### Bekannte offene Punkte

- `docs/releases/OPEN_BLOCKERS.md` ist **veraltet** (führt Erledigtes als offen). Vor
  Nutzung gegen die Realität prüfen.
- **13 Tests laufen im Normallauf nicht** (`skipped`) — die DB-gebundenen, darunter
  Org-Boundary und Cross-Tenant-Isolation. Sie brauchen `DATABASE_URL`.
  „Übersprungen" ist nicht „grün".

---

## 5. Was in dieser Sitzung entstand (Commits auf `release/enterprise-premium-market-ready`)

| Commit | Inhalt |
|---|---|
| `f6a9dd8` | P6 Welle D: letzte 10 Seiten zweisprachig · eigene Fähigkeiten (Mig 160) · 5 echte Defekte (u. a. leerer CSRF-Token) |
| `6fd8eaa` | Verbindliche Aufnahme (nur ohne bisherigen Einsatz) · SMS-Provider-Entscheidungsschicht |
| `cf4ad10` | **16 interne Endpunkte ohne Cron-Plan** + Phantom-Endpunkt `run-search-jobs` |
| `dd30325` | „Angemeldet bleiben" · vier Audit-Punkte gemessen |
| `d19673d` | Zweiter Einladungsweg verdrahtet (Mig 161) |
| `3d0e195` | Vermittlungsrelevante Angaben (Mig 162) |
| `e44d893` | Twilio-Anleitung |
| `69f9a96` | E2E: Aufnahme-Riegel + Stundenzettel-Klickpfad |
| `ff88098` | P8-Wellenplan |
| `cfe9ff3` | **P8 Welle A**: Storno-Erfassung (Mig 163) |

Vollsuite zuletzt: **7879 Tests, 0 Fehler, 13 übersprungen.**
