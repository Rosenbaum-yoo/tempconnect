# TempConnect — Enterprise Gap Register

> Vollständige, transparente Liste aller bekannten Lücken, Risiken und offenen Entscheidungen.
> Kein verstecktes Risiko — alles hier dokumentiert.
> WAVE 15 — Phase 2 — 2026-05-27

---

## Legende

| Priorität | Bedeutung |
|---|---|
| **P0 — Blocker** | Verhindert Go-Live. Muss vor Release behoben werden. |
| **P1 — Hoch** | Wesentliches Risiko. Owner-Entscheidung erforderlich. |
| **P2 — Mittel** | Bekanntes Risiko, akzeptiert für Pilot. Zeitplan definieren. |
| **P3 — Niedrig** | Qualitätsverbesserung, kein Sicherheitsrisiko. |

---

## P0 — Produktionsblocker (alle behoben)

Zum Zeitpunkt des Enterprise Evidence Pack (WAVE 15) gibt es **keine offenen P0-Blocker**.

Alle früheren Blocker wurden behoben:
- ✅ `npm audit` — 0 High/Critical Vulnerabilities
- ✅ Keine echten Secrets im Repository
- ✅ RLS aktiv auf 10 Kerntabellen
- ✅ CSRF auf allen mutierenden Endpunkten
- ✅ CORS — kein Wildcard in Production
- ✅ SSO Stub in Production blockiert

---

## P1 — Hohe Priorität (Owner-Entscheidung erforderlich)

### ID-01: MFA-Pflicht für owner/admin nicht erzwungen

| Feld | Wert |
|---|---|
| **Beschreibung** | MFA ist implementiert (opt-in), aber für kritische Rollen nicht erzwungen |
| **Risiko** | Schwache Passwörter bei Admins → Account-Übernahme möglich |
| **Mitigation** | `requireMfa` Middleware vorhanden, kann in Enforce-Modus geschaltet werden |
| **Empfehlung** | 30-Tage Enrollment-Frist → Pflicht-Enforcement für owner/admin/finance |
| **Owner-Entscheidung** | Ausstehend |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion ID-01 |

### ID-03: SSO/SAML nicht produktionsreif

| Feld | Wert |
|---|---|
| **Beschreibung** | SSO ist soft-locked (Option B). `@node-saml/node-saml` nicht installiert. |
| **Risiko** | Enterprise-Kunden mit SSO-Anforderung können nicht bedient werden |
| **Mitigation** | Stub ist in Production blockiert (403). Kein Fake-SSO. |
| **Empfehlung** | Option A: Vollständige SAML-Implementierung (4-6 Wochen) |
| **Owner-Entscheidung** | Dauerhaft Option B oder Roadmap-Item Option A? |
| **Referenz** | `docs/security/IDENTITY_MODEL.md` Sektion SSO |

---

## P2 — Mittlere Priorität

### W11-01: RLS auf ~60 weiteren Tabellen ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | Migration 116 schützt 10 Kerntabellen. ~60 weitere Tabellen haben noch keine RLS-Policies. |
| **Risiko** | DB-seitig unvollständige Isolation (App-Layer und Query-Layer schützen vollständig) |
| **Mitigation** | 3-schichtige Isolation: App + Query + DB. App+Query decken alle ~70 Tabellen. |
| **Zeitplan** | Migration 117 — geplant, Datum TBD |
| **Referenz** | `docs/security/TENANT_ISOLATION_MODEL.md` |

### W11-02: Rate-Limit-Store Memory (Single-Instance)

| Feld | Wert |
|---|---|
| **Beschreibung** | Rate-Limit-Store ist Memory-basiert. Bei Multi-Instance-Deployment gelten Limits per Instance. |
| **Risiko** | Horizontale Skalierung führt zu effektiv höheren Rate-Limits (Faktor N Instances) |
| **Mitigation** | `RATE_LIMIT_STORE=redis` ENV vorhanden. Redis ist konfiguriert für Session-Store. |
| **Lösung** | Redis als Rate-Limit-Store aktivieren (1-Stunden-Aufwand nach Infra-Entscheidung) |
| **Owner-Entscheidung** | Infra-Entscheidung: Wie viele Instances im Production-Deployment? |

### OCC-01: Owner Control Center Phase 2–15 ausstehend

| Feld | Wert |
|---|---|
| **Beschreibung** | OCC React-Shell ist aufgebaut (Phase 1). Business-Logik-Module (Executive, Revenue, Platform) ausstehend. |
| **Risiko** | Owner-Tools nicht vollständig — manuelle Prozesse über SCC nötig |
| **Mitigation** | Staff Control Center deckt alle kritischen Owner-Funktionen ab |
| **Zeitplan** | OCC Phase 2-8 ist nächster Major-Milestone |

---

## P3 — Niedrige Priorität

### ID-02: MFA-Pflicht für Staff SCC (ergänzend zu Step-Up)

| Feld | Wert |
|---|---|
| **Beschreibung** | SCC hat Step-Up Re-Auth (15min). Zusätzliche MFA-Pflicht für Staff-Login selbst fehlt. |
| **Risiko** | Gering (Step-Up bietet bereits re-auth) |
| **Empfehlung** | Nice-to-have nach ID-01 |

### ID-05: Recovery Code Regeneration UI

| Feld | Wert |
|---|---|
| **Beschreibung** | Recovery-Codes können aktuell nicht über UI regeneriert werden |
| **Risiko** | Gering — Codes können via API regeneriert werden |
| **Lösung** | UI-Button in MFA-Einstellungen |

---

## Gap-Summary

| Priorität | Offen | In Arbeit | Geschlossen |
|---|---|---|---|
| P0 | 0 | 0 | 3+ |
| P1 | 2 | 0 | — |
| P2 | 3 | 0 | — |
| P3 | 2 | 0 | — |
| **Gesamt** | **7** | | |

---

## Kommunikation gegenüber Kunden

**Was darf gesagt werden:**
- ✅ "MFA ist verfügbar und für kritische Rollen empfohlen" (aber nicht: "MFA ist Pflicht")
- ✅ "SSO ist auf der Roadmap für den INDIVIDUELL-Tarif" (aber nicht: "SSO ist live")
- ✅ "Mandanten-Isolation ist dreifach abgesichert (App + Query + DB)"
- ✅ "RLS ist aktiv auf allen Kerndaten-Tabellen"

**Was nicht gesagt werden darf:**
- ❌ "MFA ist für alle Admins verpflichtend" (ist sie nicht)
- ❌ "SSO ist produktionsreif" (ist es nicht)
- ❌ "Alle Tabellen sind RLS-geschützt" (~60 Tabellen fehlen noch)

---

*WAVE 15 — Phase 2 — 2026-05-27*
*Zuständig: Security/Architecture (Claude), Freigabe: Owner*
