# SCC Staff Access Review

> Monatliche Pflicht-Überprüfung aller Staff-Zugänge.
> SCC WAVE 01 — Phase 3 — 2026-05-27

---

## Zweck

Jeder `tempconnect_staff`-Eintrag wird monatlich auf Aktualität und Notwendigkeit geprüft.
Nicht mehr benötigte Zugänge werden sofort widerrufen.

**Verantwortlich:** Owner / SCC-Admin
**Rhythmus:** Monatlich, spätestens am ersten Werktag des Monats
**Dokumentiert in:** `staff_control_audit_log`, area=`access_review`

---

## Review-Abfrage

```sql
SELECT
  s.user_id,
  s.email,
  s.display_name,
  s.role,
  s.access_reason,
  s.is_active,
  s.requires_step_up,
  s.last_access_at,
  s.last_mfa_at,
  s.last_reviewed_at,
  s.reviewed_by,
  s.expires_at,
  s.created_at,
  s.notes
FROM tempconnect_staff s
ORDER BY s.is_active DESC, s.last_access_at DESC NULLS LAST;
```

---

## Prüfpunkte pro Staff-Mitglied

| Frage | Wenn NEIN → Aktion |
|---|---|
| Person ist noch im Team aktiv? | `is_active = FALSE` setzen, `revoked_at` + `revoked_by` setzen |
| Zugang noch notwendig für aktuelle Aufgabe? | `is_active = FALSE` oder `role` / `scope` einschränken |
| MFA aktiv und vor < 30 Tagen? | Person auffordern, MFA zu erneuern |
| Ablaufdatum korrekt (falls gesetzt)? | `expires_at` anpassen |
| `access_reason` ausgefüllt und aktuell? | Aktualisieren |

---

## Widerruf eines Staff-Zugangs

```sql
UPDATE tempconnect_staff
  SET is_active = FALSE,
      revoked_at = NOW(),
      revoked_by = '<owner-user-id>',
      notes = COALESCE(notes, '') || ' | Widerruf: <Grund> (' || NOW()::date || ')'
  WHERE user_id = '<staff-user-id>';
```

Nach dem UPDATE: Alle aktiven Staff-Sessions für diesen User löschen:

```sql
DELETE FROM staff_session
  WHERE sess::jsonb->>'staffUserId' = '<staff-user-id>';
```

---

## Review-Abschluss-Audit

Nach jedem Review einen Eintrag im Audit-Log erzeugen (über SCC UI oder direkt):

```sql
INSERT INTO staff_control_audit_log
  (actor_id, area, action, status, confirmed, risk_level, details)
VALUES
  ('<reviewer-user-id>', 'access_review', 'staff_control.access_review.completed',
   'ok', TRUE, 'low',
   '{"review_date": "<YYYY-MM-DD>", "reviewed_count": <N>, "revoked_count": <M>}'::jsonb);
```

Alternativ über `POST /staff/api/audit-decisions`:
```json
{
  "confirmed": true,
  "reason": "Monatlicher Access Review <Monat Jahr>",
  "area": "access_review",
  "title": "Staff Access Review <Monat Jahr>",
  "decision": "Alle Zugänge geprüft. <N> aktiv, <M> widerrufen.",
  "reversible": false
}
```

---

## Checkliste pro Review

```
[ ] SQL-Abfrage ausgeführt, alle Mitglieder geprüft
[ ] Zugänge nicht mehr aktiver Personen widerrufen
[ ] MFA-Status für alle aktiven Mitglieder OK
[ ] Ablaufdaten korrekt
[ ] last_reviewed_at + reviewed_by für alle aktiven Mitglieder aktualisiert
[ ] Audit-Eintrag erstellt
[ ] Datum des Reviews dokumentiert: _______________
[ ] Durchgeführt von: _______________
```

---

## Update last_reviewed_at nach Review

```sql
UPDATE tempconnect_staff
  SET last_reviewed_at = NOW(),
      reviewed_by = '<reviewer-user-id>'
  WHERE is_active = TRUE;
```

---

*SCC WAVE 01 — Phase 3 — 2026-05-27*
