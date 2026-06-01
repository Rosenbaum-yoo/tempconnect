# Testing & QA — Engineering Reference

> Kanonisches Dokument: [`docs/TESTING.md`](../TESTING.md)
>
> Diese Datei dient als Einstiegspunkt für `docs/engineering/` — die vollständige
> Testdokumentation befindet sich unter `docs/TESTING.md`.

## Kurzreferenz (Stand: WAVE 04, 2026-05-26)

```
Test-Suite-Übersicht:
  test:unit      3912 Tests, 0 Failures  (non-integration, no DB)
  test:ci        = test:unit  (CI-Kurzform)
  test:security   626 Tests, 0 Failures  (RBAC, auth, hardening)
  test:tenant      66 Tests, 0 Failures  (Org-Isolation)
  test:pilot       49 Tests, 0 Failures  (Pilot-Modell)
  test:integration  Benötigt DB (HTTP-Flows via supertest)
```

## Produktions-Audit

```
npm audit --omit=dev  →  0 Vulnerabilities (Stand: WAVE 04)
```

Alle Commands werden aus dem Projekt-Root ausgeführt.
Siehe [docs/TESTING.md](../TESTING.md) für vollständige Dokumentation.
