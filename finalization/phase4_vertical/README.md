# Phase 4 — Vertikale Strecken

> **Zweck:** Drei thematisch eigenständige Feature-/Finalisierungs-Strecken, die parallel zu Phase 1-3 laufen. Jede Strecke ist eigenständig, hat eigene Wellen, eigenes Gate, eigenen Masterprompt.

---

## 1. Was Phase 4 ist

Im Gegensatz zu Phase 1-3 (querschnittlich: Architektur, Release, SCC) ist Phase 4 **vertikal**: jede Strecke betrifft einen abgegrenzten Produkt-/UX-Bereich.

| Strecke | Track-Datei | Charakter | Anzahl Wellen |
|---|---|---|---:|
| **A — Marketplace Visibility Center** | `TRACK_A_MARKETPLACE.md` | Neues Feature (voll-stack) | 13 Wellen |
| **B — Einsatzportal Enterprise-Reife** | `TRACK_B_EINSATZPORTAL.md` | Finalisierung Bestand auf 90% | 11 Wellen (EP-00 bis EP-10) |
| **C — Terminologie-Umbenennung** | `TRACK_C_TERMINOLOGY.md` | Cross-cutting UI-Sprache | 13 Phasen (0-12) |
| **D — Notification Experience** | `TRACK_D_NOTIFICATIONS.md` | UX-Feature (Glocke + Card-Badges) | 11 Wellen (N-00 bis N-10) |
| **E — Database / Migration / Hetzner** | `TRACK_E_DATABASE.md` | Infra-Strecke (kundenstufige Gates) | 13 Phasen (DB-A bis DB-M) |

---

## 2. Verhältnis zu Phase 1-3

```
Phase 1 (fachlich-architektonisch) ──┐
Phase 2 (release-operativ) ─────────┼─→ Voraussetzung für jede Phase-4-Strecke
Phase 3 (SCC) ───────────────────────┘

Phase 4 Track A (Marketplace) ─────────→ knüpft an Phase 3 SCC + Phase 1 WAVE_02 (Commercial)
Phase 4 Track B (Einsatzportal) ───────→ konkretisiert Phase 1 WAVE_04E (Timesheets/Spend)
Phase 4 Track C (Terminologie) ────────→ betrifft UI aller Phasen
```

**Wichtig:** Phase-4-Strecken sind **nicht** Voraussetzung für Marktstart. Sie sind Erweiterungen/Reifungen. Marktstart erfordert Phase 1 + 2 + 3 Gates. Phase 4 hebt das Produkt zusätzlich.

---

## 3. Inhalt dieser Schicht

| Datei | Zweck |
|---|---|
| `README.md` | Diese Übersicht |
| `TRACK_A_MARKETPLACE.md` | Marketplace Visibility Center (13 Wellen) |
| `TRACK_B_EINSATZPORTAL.md` | Einsatzportal Enterprise-Reife (11 Wellen) |
| `TRACK_C_TERMINOLOGY.md` | Terminologie-Umbenennung (12 Phasen) |
| `TRACK_D_NOTIFICATIONS.md` | Notification Experience: Glocke + Card-Badges (11 Wellen) |
| `TRACK_E_DATABASE.md` | Database / Migration / Hetzner Readiness (13 Phasen) |
| `GATES.md` | Track-spezifische Gates A, B, C |
| `MANUAL_TASKS.md` | Was du selbst entscheiden musst (Pricing, Begriffsentscheidungen, Vertragstexte) |
| `MASTERPROMPTS.md` | Drei Start-Prompts (einer pro Track) |
| `CROSS_CUTTING.md` | Wo Tracks sich überschneiden (Race Conditions vermeiden) |

---

## 4. Reihenfolge / Parallelität

**Empfehlung:**

1. **Track C zuerst** — Terminologie ist Voraussetzung damit Track A nicht mit alten Begriffen baut
2. **Track B parallel** — Einsatzportal-Finalisierung ist unabhängig von Marketplace
3. **Track A zuletzt** — neues Feature, profitiert von gehärteter Basis + neuer Sprache

ABER: Track C ist umfangreich. Bei Kapazitätsdruck:
- **Track B + C alternieren** in eigenen Sessions
- **Track A erst nach Marktstart** als post-launch Premium-Feature

**Niemals parallel in derselben Session:** Track A und Track C — sie würden sich auf denselben UI-Stellen ins Gehege kommen.

---

## 5. Zielwerte je Strecke

### Track A — Marketplace
- Reife: 9,0+/10 für Marktstart-fähiges Premium-Feature
- Aktiv nutzbar für Individuell-/PRO-/Enterprise-Kunden
- SCC vollständig integriert
- Datenschutz-konform (DSGVO)

### Track B — Einsatzportal
- Reife: 90% (von aktuell 68-72%)
- Backend-Tests grün, neue E2E-Tests
- Cross-Org-Härtung
- Native Stundenzettel-Erfassung

### Track C — Terminologie
- Alle kundennahen Hauptbegriffe rollenadäquat
- Keine technischen Breaking Changes
- TERMINOLOGY_GUIDE.md als Source of Truth

---

## 6. Wie Claude Code mit Phase 4 arbeitet

**Pro Session:**
1. `CLAUDE.md` (Phase 1)
2. `finalization/00_RULES.md` (Phase 1)
3. `finalization/phase4_vertical/README.md` (diese Datei)
4. **Genau eine** Track-Datei (A, B oder C)
5. Bei Cross-Cutting-Themen: `CROSS_CUTTING.md`

**Niemals zwei Tracks gleichzeitig** in derselben Session — Token-Effizienz und Fokus.

---

## 7. Was Claude Code mitnehmen muss

**Marketplace (Track A):**
- Inkrementell, nicht Big-Bang
- Public Visibility ist OPT-IN, default OFF
- Bewertungen nur nach FINALIZED Deal
- Bountys NIE automatisch aktiv
- Rankings nicht nur auf Likes basieren
- Datenschutz: keine personenbezogenen Trackingdaten öffentlich

**Einsatzportal (Track B):**
- Worker liefert KEINE Organisationen als Wahrheit
- Backend leitet org_id/supplier_org_id aus Session + Assignment-Link ab
- `worker-timesheet.html` ist Legacy, alle neuen Links zur einsatzportal-stundenzettel.html
- Frontend ist UX, Backend ist Sicherheit
- Keine großen Refactors ohne Tests

**Terminologie (Track C):**
- KEINE DB-Renames, KEINE API-Breaking-Changes
- Nur sichtbare UI-Texte ändern
- Rollenabhängig: "Personal finden" (Company) vs. "Arbeitsplatz finden" (Agency)
- Technische Begriffe (Requisition, marketplace.html) bleiben intern
- Audit-Datei vor Änderungen: `docs/product/TERMINOLOGY_RENAME_AUDIT.md`

---

## 8. Verbindlicher Branch

Track A + B: `release/enterprise-premium-market-ready` (oder eigene Feature-Branches die später mergen)

Track C: eigener Branch `feature/terminology-rename` empfohlen, weil Cross-Cutting und groß. Mergt in den Release-Branch.

---

## 9. Was war fast vergessen

Beim Review der drei Quelldokumente fielen Lücken auf, die ich in `CROSS_CUTTING.md` adressiere:

1. **Marketplace und Terminologie kollidieren** — wenn Track A neue Strings baut, müssen sie schon Track-C-konform sein
2. **Einsatzportal "worker-timesheet.html" Legacy** — sollte in Phase-2 Release-Verifier dokumentiert werden
3. **Track C verändert SCC-Texte** — Track A wartet auf Track-C-Sprache für SCC-Marketplace-Modul
4. **Demo-Daten (Phase 1 WAVE 15)** brauchen neue Marketplace-Profile, neue Terminologie-Strings, neue Worker-Submissions — Re-Seed nötig

Alles dokumentiert.
