-- =============================================================================
-- 125_remediate_demo_seed_backdoor.sql — Bestands-DB-Remediation (Go-Live)
-- =============================================================================
-- KONTEXT (Sicherheit, zahlende Kunden):
--   Eine FRUEHERE, UNGEGATETE Version von 052_demo_seed_world.sql lief in der
--   Standard-Migrationskette und legte auf JEDER Installation — auch Produktion —
--   sechs Demo-Accounts mit einem OEFFENTLICH dokumentierten Passwort an
--   (DemoPass2026!, siehe Kopf von 052). Drei davon auf ENTERPRISE-Funktionsniveau.
--   Das war de facto eine Login-Backdoor auf Produktion.
--
--   052 ist ab sofort hinter SEED_DEMO_WORLD / app.seed_demo_world gegatet
--   (No-Op auf Prod). Diese Migration raeumt den ALTBESTAND auf bereits
--   laufenden Datenbanken auf.
--
-- WIRKUNG:
--   Setzt password_hash der betroffenen Demo-Accounts auf einen gueltig
--   FORMATIERTEN, aber UNKNACKBAREN bcrypt-Hash (bcryptjs.compare liefert immer
--   false -> Passwort-Login unmoeglich, ohne 500er-Risiko bei Fehlformat).
--   Daten/Orgs/Subscriptions der Demo-Welt bleiben unangetastet — nur der
--   Passwort-Login wird neutralisiert.
--
-- GATING:
--   Laeuft NUR wenn app.seed_demo_world <> 'true'. In dev/sales
--   (SEED_DEMO_WORLD=true) bleiben die Demo-Logins absichtlich funktionsfaehig —
--   dort ist 052 gewuenscht und 125 ein No-Op.
--
-- PRAEZISION / IDEMPOTENZ:
--   Es werden ausschliesslich die sechs bekannten Demo-Accounts angefasst, und
--   auch nur solange sie NOCH den oeffentlich bekannten Demo-Hash tragen. Bereits
--   gesperrte oder manuell geaenderte Passwoerter bleiben unberuehrt.
--   Mehrfachausfuehrung ist folgenlos.
--
-- ROLLBACK:
--   Demo-Welt jederzeit reproduzierbar via SEED_DEMO_WORLD=true + Re-Seed (052).
--   Kein dedizierter Down-Pfad noetig (nur nicht-kundische Demo-Accounts betroffen).
-- =============================================================================

DO $remediate_demo_seed$
BEGIN
  IF current_setting('app.seed_demo_world', true) IS DISTINCT FROM 'true' THEN
    UPDATE users
       SET password_hash = '$2a$12$jmlXNsoZ82399yG3fMXumuHhBBLNejNba055E0s0cvXdnti73pYwq',
           updated_at = NOW()
     WHERE email IN (
             'demo-buyer@tempconnect.de',
             'demo-agency@tempconnect.de',
             'demo-admin@tempconnect.de',
             'demo-buyer2@tempconnect.de',
             'demo-agency2@tempconnect.de',
             'demo-agency3@tempconnect.de'
           )
       -- Nur den oeffentlich bekannten Demo-Hash umschreiben (Praezision + Idempotenz):
       AND password_hash = '$2a$12$mA5dLvWmN5sd27Mr6c0yROV6GI1NnrPfJgSIWHpHCQCW1bEQGkOVO';

    IF FOUND THEN
      RAISE NOTICE '125: Demo-Seed-Backdoor neutralisiert — betroffene Demo-Accounts koennen sich nicht mehr per Passwort anmelden.';
    ELSE
      RAISE NOTICE '125: keine vulnerablen Demo-Accounts mit oeffentlichem Passwort gefunden — nichts zu tun (No-Op).';
    END IF;
  ELSE
    RAISE NOTICE '125: SEED_DEMO_WORLD=true (dev/sales) — Demo-Logins bleiben absichtlich aktiv (uebersprungen).';
  END IF;
END $remediate_demo_seed$;
