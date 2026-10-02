# Migration Numbering Reference

> 2026-10-02 — **228** Index `wal_org_worker_start_idx` auf
> `worker_assignment_links (org_id, worker_user_id, start_date)`: die AUEG-Frist
> schlug im vollen Durchlauf nach (M11.7, Lastprobe 300 Kunden: 503 Buffer ohne,
> 20 mit). **229** `required_total_count` ohne Vorgabe und nullbar: `DEFAULT 1`
> hat die Rueckfallkette `COALESCE(required_total_count, headcount, 1)` seit ihrer
> Einfuehrung ausgehebelt, ein Bedarf ueber drei Plaetze galt als einer
> (Owner-Punkt 14). **230** `occ_owner_access.expires_at` (nullbar, kein Ablauf
> auf Bestandszeilen): die privilegierteste Flaeche war die einzige, deren
> Zugaenge nicht von selbst enden konnten — `tempconnect_staff` kennt `expires_at`
> seit 2026-08-22. **231** der CHECK auf `owner_control_access_audit.action`
> kennt `extend`: ohne den Wert warf das Einfuegen, und `writeAudit` verschluckte
> es in einem leeren `catch` — der Befehl meldete Erfolg, die Spur fehlte
> (Owner-Punkt 17). **232** ein Kundenkonto haelt keinen Support-Zugang:
> `demo@firma.de` war Kunde (Org-Mitgliedschaft bei „Demo GmbH") UND aktiver
> `external_support_agent` beim Dienstleister „India Support BPO" — die
> Vermischung, die `docs/FLAECHEN.md` verbietet. Widerruf per `is_active = FALSE`,
> kein DELETE (sechs Tabellen zeigen mit `ON DELETE SET NULL` darauf), und
> Owner-Konten bleiben unberuehrt (Owner-Punkt 15).

> Last updated: 2026-08-13 — 166–169 Bounty-Zeitraum und -Entzug, 170 Bounty-Rabatt
> auf der Rechnung, 171 Anstupser, 172 Merken ist ein Zustand, 173 ein aktives Abo
> je Nutzer, 174 CSV-Spaltentabelle (P10/D3), 175 Mitarbeiter ohne Konto, 176 Einladung kennt das Profil (P10/D5),
> 177 Abwesenheit gehoert zum Menschen (P10/E2, erste Nutzung von btree_gist + EXCLUDE),
> 178 Montage gehoert zum Einsatzort (P10/E3),
> 179 Zustandsprotokoll an der Quelle (P10/E5, erste Trigger auf worker_*),
> 180 Notdienst-Antwortpfad (Nachtrag P9/A3, Befund P1-15),
> 181 Abwesenheit-Selbsterfassung (G1), 182 Verspaetungsmeldung (G3),
> 183 Meldung erreicht das Buero (G4, zwei Typen im CHECK von `notifications.type`),
> 184 der Kunde erfaehrt dass nicht warum (G4b, Kunden-Meldung ohne die Art)
> 185 severity zurueck auf die vier (Befund M0-B9: die laufende Datenbank
> erlaubte ein fuenftes `urgent`, das keine Migration je gewaehrt hat),
> 186 Guthaben nur gegen Zahlung (Befund P1-22, Owner-Entscheidung Stripe:
> eindeutiger Index auf der Kauf-Referenz gegen doppelte Webhook-Zustellung),
> 187 die Rechnung braucht eine Anschrift (E-Rechnungspflicht EN 16931: Rechnungs-
> stammdaten auf `organizations`, ohne die keine XRechnung/ZUGFeRD erzeugbar ist),
> 200 Marktpraesenz-Automatik (Welle J2b: Ausschalter je Kraft auf
> worker_profiles + Herkunftsspalte `quelle` auf capacity_posts — Vorstufe
> "Verfuegbarkeit ist das Angebot", Plan J §0/§3.2),
> 201 Markt-Profil der Kraft (Welle J9: Merkmal-Katalog als CHECK, Horizont
> einsetzbar_bis, interne dispo_notiz),
> 202 Audit-Log traegt den Mandanten an der Quelle (beim Zusammenfuehren von 187
> auf 202 gerueckt: die Release-Linie hatte 187 fuer die Rechnungs-Anschrift
> vergeben, und ab 158 ist keine Nummer mehr doppelt zulaessig),
> 203 Rechnungsnummer je Firma (Welle J7: eigener lueckenloser Kreis je
> Zeitarbeitsfirma und Jahr, Vergabe erst beim Stellen, eingefrorener
> Abrechnungssatz an der Rechnung),
> 217 ein Angebot traegt hoechstens eine Zuweisung (Welle N2.9: eindeutiger
> Teilindex auf `assignments(offer_id)`, Ausfaelle ueber die Warteliste im Einsatz),
> 218 ein Bedarf kennt seine Firma (Welle N2.11: `demand_requests.requester_org_id`
> als Traeger der Kundensperre, Altbestand ueber die einzige Unternehmens-Mitgliedschaft)

This document records known legacy numbering anomalies and establishes the rule
for all future migrations.

> **Diese Zeile wird geprüft, nicht gepflegt.** Sie ist zwischen 2026-07-26 und
> 2026-08-10 sechzehn Migrationen lang falsch gewesen („Next: 158", real 173) —
> eine handgeschriebene Zahl über einem wachsenden Verzeichnis veraltet
> zwangsläufig. `api/test/migrationsNummern.test.js` liest das Verzeichnis und
> lässt die Angabe unten rot werden, sobald sie nicht mehr stimmt.

---

## Rule: Next migration number

**Next migration MUST start at: 233**

Format: `<NNN>_<short_description>.sql` (three-digit zero-padded)

---

## Known Legacy Anomalies (DO NOT rename or re-number)

The migration runner (`sql/migrate.sh`) tracks applied migrations by **filename**.
Renaming any already-applied file would cause it to be re-applied on the next
`docker compose run --rm migrate` — which may break the schema irreversibly.
All files below are applied and **must stay as-is**.

### 1. Duplicate numbers (both files applied, both must stay)

> **Nachgetragen am 2026-08-14.** Diese Liste nannte fuenf Duplikate; es sind
> sieben (plus die beiden `b`-Varianten unten). `130` und `140` fehlten seit ihrer
> Entstehung. Aufgefallen ist es beim Durchleuchten der Plattform — nicht durch
> einen Test, denn `migrationsNummern.test.js` prueft nur die naechste freie
> Nummer. Seit W2 erzwingt `api/test/dokuWaechter.test.js`, dass **jede** doppelt
> belegte Nummer hier steht.

| Number | File A | File B |
|--------|--------|--------|
| 064 | `064_capacity_interactions_demand.sql` | `064_strategic_collaboration_requests.sql` |
| 070 | `070_emergency_partial_commitments.sql` | `070_org_pilot_policy_hardening.sql` |
| 074 | `074_tariff_contract_model.sql` | `074_worker_profile_hub.sql` |
| 075 | `075_dealflow_interaction_types.sql` | `075_worker_profile_documents.sql` |
| 086 | `086_customer_stage_contract_requested_fix.sql` | `086_operational_invoice_truth_hardening.sql` |
| 130 | `130_org_integrations.sql` | `130_payment_session_request_link.sql` |
| 140 | `140_notification_types_worker_portal.sql` | `140_support_vendor_verification.sql` |

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

1. Use the next sequential number (currently **233**)
2. File name: `233_<short_snake_case>.sql`
3. Wrap DDL in a transaction if the DB supports transactional DDL
4. Include a `-- Migration NNN:` comment header with a brief description
5. Use `SET client_min_messages TO WARNING;` to suppress noise
6. Test on a fresh schema before committing (see `sql/test-fresh-install.sh`)

## Die Luecken 111 und 117 — gemessen, nicht vermutet (2026-09-27)

`sql/migrations/` hat 110 und 112, aber keine 111; ebenso fehlt 117. Seit der
Finalisierungsphase stand dazu die Owner-Frage **OE-05: „Bewusst uebersprungen
oder Fehler?"** offen (`docs/releases/FINALIZATION_SCOPE.md`,
`docs/releases/OPEN_BLOCKERS.md` P2-04). Sie ist jetzt beantwortet, und zwar
durch Messung:

| Frage | Messung am 2026-09-27 | Folge |
|---|---|---|
| Wurde je etwas unter 111 angewandt? | Die Buchhaltung `_migrations` fuehrt **keinen** Eintrag `111…` | Nichts ist verloren. Es gab nie eine Datei, die gelaufen ist. |
| Ist das ein Einzelfall? | **Sieben** Nummern sind **doppelt** belegt: 064, 070, 074, 075, 086, 130, 140 | Nummernkollisionen waren Alltag. Eine uebersprungene Nummer ist dasselbe Phaenomen mit umgekehrtem Vorzeichen. |
| Und 117? | Steht in `docs/enterprise-readiness/TENANT_ISOLATION_EVIDENCE.md` und `docs/security/SECURITY_OVERVIEW.md` ausdruecklich als **Roadmap** („RLS auf ~60 weitere Tabellen, Owner-Entscheidung ausstehend") | Kein Fehler, sondern ein Vorausverweis auf eine Entscheidung. |

**Damit ist 111 eine Luecke ohne Inhalt.** Sie braucht keine Nachtrags-Migration:
eine Nummer ist ein Ordnungsmerkmal, kein Inventar. Was sie braucht, ist genau
diese Zeile — damit der naechste Leser nicht wieder sucht.

Erzwungen wird das ab jetzt von `api/test/dokuMigrationen.test.js`: eine in
einem Dokument genannte Migrationsnummer muss als Datei existieren oder dort im
Register `GEPLANT` mit Grund stehen. Beide Nummern stehen darin — mit genau
dieser Messung als Grund, und der Waechter wird rot, sobald eine von ihnen
angelegt wird und der Eintrag bleibt.

> Anmerkung zur Buchhaltung: `_migrations` fuehrt 239 Buchungen, das Verzeichnis
> 224 Dateien. Die Differenz ist ein eigener Gegenstand (Buchungen aus aelteren
> Namensschemata, z. B. `sql_005_reviews_pgcrypto.sql`) und wird getrennt
> geprueft — sie beruehrt die Antwort auf OE-05 nicht.
