# Migration Numbering Reference

> Last updated: 2026-08-13 — 166–169 Bounty-Zeitraum und -Entzug, 170 Bounty-Rabatt
> auf der Rechnung, 171 Anstupser, 172 Merken ist ein Zustand, 173 ein aktives Abo
> je Nutzer, 174 CSV-Spaltentabelle (P10/D3), 175 Mitarbeiter ohne Konto, 176 Einladung kennt das Profil (P10/D5),
> 177 Abwesenheit gehoert zum Menschen (P10/E2, erste Nutzung von btree_gist + EXCLUDE),
> 178 Montage gehoert zum Einsatzort (P10/E3),
> 179 Zustandsprotokoll an der Quelle (P10/E5, erste Trigger auf worker_*),
> 180 Notdienst-Antwortpfad (Nachtrag P9/A3, Befund P1-15)

This document records known legacy numbering anomalies and establishes the rule
for all future migrations.

> **Diese Zeile wird geprüft, nicht gepflegt.** Sie ist zwischen 2026-07-26 und
> 2026-08-10 sechzehn Migrationen lang falsch gewesen („Next: 158", real 173) —
> eine handgeschriebene Zahl über einem wachsenden Verzeichnis veraltet
> zwangsläufig. `api/test/migrationsNummern.test.js` liest das Verzeichnis und
> lässt die Angabe unten rot werden, sobald sie nicht mehr stimmt.

---

## Rule: Next migration number

**Next migration MUST start at: 181**

Format: `<NNN>_<short_description>.sql` (three-digit zero-padded)

---

## Known Legacy Anomalies (DO NOT rename or re-number)

The migration runner (`sql/migrate.sh`) tracks applied migrations by **filename**.
Renaming any already-applied file would cause it to be re-applied on the next
`docker compose run --rm migrate` — which may break the schema irreversibly.
All files below are applied and **must stay as-is**.

### 1. Duplicate numbers (both files applied, both must stay)

| Number | File A | File B |
|--------|--------|--------|
| 064 | `064_capacity_interactions_demand.sql` | `064_strategic_collaboration_requests.sql` |
| 070 | `070_emergency_partial_commitments.sql` | `070_org_pilot_policy_hardening.sql` |
| 074 | `074_tariff_contract_model.sql` | `074_worker_profile_hub.sql` |
| 075 | `075_dealflow_interaction_types.sql` | `075_worker_profile_documents.sql` |
| 086 | `086_customer_stage_contract_requested_fix.sql` | `086_operational_invoice_truth_hardening.sql` |

Both files in each pair are sorted alphabetically and applied in that order
by the runner. The schema state is correct. No action required.

### 2. "b" suffix files (legacy parallel tracks, applied)

| File | Notes |
|------|-------|
| `027b_timesheets.sql` | Applied after `027_match_alerts_extension.sql` |
| `045b_reputation_visibility.sql` | Applied after `045_premium_inserat.sql` |

### 3. Gaps in sequence (numbers intentionally unused or never created)

| Missing | Reason |
|---------|--------|
| 077, 078, 079 | Never created — reserved range, skipped during development |
| 111 | Never created — skipped; `110_soc_phase3_support.sql` followed by `112_multi_location_columns.sql` |

---

## Migration Runner Behaviour

```sh
# sql/migrate.sh — simplified
for migration in $(ls /migrations/*.sql | sort); do
  filename=$(basename "$migration")
  applied=$(SELECT COUNT(*) FROM _migrations WHERE name='$filename')
  if [ "$applied" = "0" ]; then
    psql -f "$migration"
    INSERT INTO _migrations (name) VALUES ('$filename')
  fi
done
```

**Idempotency**: Each migration is applied exactly once, tracked by filename in
the `_migrations` table. Running the migrate service multiple times is safe.

**Alphabetical sort**: Files are applied in `ls | sort` order, which is
lexicographic (0-9 before a-z). Duplicate-numbered files are applied in
alphabetical order within the number (e.g. `064_capacity_…` before `064_strategic_…`).

---

## Checklist for new migrations

1. Use the next sequential number (currently **181**)
2. File name: `181_<short_snake_case>.sql`
3. Wrap DDL in a transaction if the DB supports transactional DDL
4. Include a `-- Migration NNN:` comment header with a brief description
5. Use `SET client_min_messages TO WARNING;` to suppress noise
6. Test on a fresh schema before committing (see `sql/test-fresh-install.sh`)
