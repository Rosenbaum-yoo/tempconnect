# Release-Prozess (SemVer + Changelog)

> F1.3 (Finalisierungsplan): leichter, verbindlicher Prozess — kein Tooling-Zwang.

## Versionierung (SemVer)
- **MAJOR** (3.0.0): Breaking Changes an API-Verträgen, Datenmodell-Brüche, Planmodell-Änderungen.
- **MINOR** (2.1.0): neue Features, neue Migrationen (add-only), neue Endpunkte.
- **PATCH** (2.0.1): Bugfixes, Doku, Test-/CI-Härtung ohne Verhaltensänderung.

## Ablauf pro Release
1. `CHANGELOG.md`: `[Unreleased]` sichten, kürzen, unter neuer Version `[X.Y.Z] — JJJJ-MM-TT` einfrieren.
2. Version in `api/package.json` + `frontend/package.json` setzen (gleicher Wert).
3. Voll-Verifikation: `npm run qa --prefix api` + `npm run build:all --prefix frontend` + volle Unit-Suite im Container.
4. Commit `release: vX.Y.Z` → Tag: `git tag -a vX.Y.Z -m "TempConnect X.Y.Z"` → `git push --follow-tags`.
5. CI-`release-artifact`-Job liefert das verifizierte Artefakt (Checksums/Hygiene-Checks).
6. Prod-Deploy nach `docs/DEPLOYMENT_HETZNER.md`; Migrationslauf via `sql/migrate.sh` (idempotent).

## Regeln
- Kein Release ohne Changelog-Eintrag; keine Preiszahlen/Secrets im Changelog.
- Hotfix = PATCH vom Tag aus, danach forward-merge.
- Release erklärt der Owner (Gate Teil 4) — CI grün ist notwendige, nicht hinreichende Bedingung.
