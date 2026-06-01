# TempConnect — API Versioning

> WAVE 10 — Phase 2 — 2026-05-26

---

## Aktuelle Version

**Version:** `v1` (implizit — kein `/v1/` Präfix in URLs)

Alle Endpunkte unter `/api/*` sind aktuell Version 1. Kein explizites Versioning in der URL.

---

## Strategie

### Phase 1 (aktuell): Implizites v1

- Keine Versionsnummer in URL
- Breaking Changes werden über interne Deprecation-Prozesse kommuniziert
- Rückwärtskompatibilität wird angestrebt

### Phase 2 (ab erstem Partner-API-Key): URL-Versioning

Wenn externe Partner API-Keys erhalten, wird URL-Versioning eingeführt:

```
/api/v1/requisitions   ← Version 1 (stabilisiert)
/api/v2/requisitions   ← Version 2 (bei Breaking Changes)
```

**Parallelbetrieb:** Beide Versionen für mindestens 6 Monate.

### Breaking vs. Non-Breaking Changes

| Änderung | Typ |
|---|---|
| Neues optionales Feld hinzufügen | Non-Breaking |
| Neuer optionaler Query-Parameter | Non-Breaking |
| Neuer Endpunkt | Non-Breaking |
| Pflichtfeld neu (POST/PUT Body) | Breaking |
| Feld umbenennen oder entfernen | Breaking |
| Response-Shape ändern | Breaking |
| Auth-Schema ändern | Breaking |
| Error-Codes ändern | Breaking |

---

## Deprecation-Prozess

1. Endpoint wird als `deprecated: true` in Response-Header markiert: `Deprecation: true`
2. `Sunset`-Header gibt Abschaltdatum an: `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`
3. Changelog-Eintrag in `docs/api/CHANGELOG.md`
4. Partner werden direkt informiert (wenn API-Key vorhanden)

---

## Deprecated Endpunkte

| Endpunkt | Grund | Ablösung | Sunset |
|---|---|---|---|
| (aktuell keine) | — | — | — |

---

## API-Stabilitäts-Garantien nach Kategorie

| Kategorie | Stabilitäts-Level | SLA |
|---|---|---|
| **Public** (Health, Plans) | Stabil | 99.9% |
| **Frontend Internal** | Stabil | 99.5% |
| **Partner** | Stabil nach v1-Lock | 99.9% |
| **Admin / Staff / OCC** | Intern, kein SLA | Kein SLA |
| **Experimental** | Unstabil — kann sich jederzeit ändern | Kein SLA |

---

## Versionierungs-Header (geplant für Partner-API)

```http
GET /api/v1/requisitions
Authorization: Bearer tc_live_xxx
X-API-Version: 2026-05
```

Response:
```http
HTTP/1.1 200 OK
X-API-Version: 2026-05
X-Deprecated: false
```

---

*Letzte Aktualisierung: WAVE 10 — Phase 2 — 2026-05-26*
