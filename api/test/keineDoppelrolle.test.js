/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EIN MENSCH, EINE WELT — KEIN KUNDENKONTO IN EINER PLATTFORM-FLÄCHE (Punkt 15)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BEFUND: `demo@firma.de` ist ein Kundenkonto (`users.role = 'company'`, eine
 * Org-Mitgliedschaft bei „Demo GmbH") und hielt gleichzeitig einen **aktiven**
 * `external_support_agent`-Zugang beim Dienstleister „India Support BPO".
 *
 * `support_vendors` sind laut Migration 110 „BPO / Callcenter Partner" — fremde
 * Firmen, die Support übernehmen. Ein externer Agent ist ein Mensch **dort**, kein
 * Kunde. Und der Kopf von 110 sagt ausdrücklich, `support_agents` stehe „getrennt
 * von Org-RBAC". Ein Konto in beiden Welten ist damit die Vermischung, die
 * `docs/FLAECHEN.md` und CLAUDE.md verbieten.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM KEIN VORHANDENER WÄCHTER DAS GEFUNDEN HAT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `staffNieAusDerPlattform.test.js` prüft **Links**: keinen Weg von der
 * Kundenplattform in eine interne Fläche. Das ist richtig und reicht nicht — es
 * kann nicht sehen, dass ein **Konto** in beiden Welten sitzt. Der Befund wurde
 * bei Welle Y4 gemeldet und ausdrücklich nicht angefasst, weil er einen
 * Anmeldeweg betrifft; Owner-Freigabe 2026-10-02.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DREI SCHICHTEN, UND JEDE TUT ETWAS ANDERES
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   `support-access-cli.js`   VERHINDERT es (dort ist es entstanden)
 *   Migration 232            RÄUMT DEN ALTBESTAND AUF (einmal, benannt)
 *   diese Datei              HÄLT DIE REGEL (rot, wenn eine Schicht nachgibt)
 *
 * Die Reihenfolge ist der Punkt. **Nichts im Repo erzeugt die Doppelrolle** —
 * kein Seed, keine Migration, und das Beispiel in der Benutzungshilfe der CLI
 * nennt richtig `agent@bpo.example`. Sie entstand am 2026-06-19, weil
 * `agent-add` jede Adresse annahm. Ein Test allein hätte sie erst hinterher
 * gemeldet; eine Migration allein hätte sie weggeräumt und beim nächsten Mal
 * wieder.
 *
 * Run: node --test --test-force-exit test/keineDoppelrolle.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hasDb, createPool } from "./integration/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel(relPfad) {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, relPfad))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel(path.join("sql", "seeds"));
const suite = ROOT ? describe : describe.skip;
const lies = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
/** SQL ohne Kommentare. Ein `grep -c` zählte beim Bauen eine AUSKOMMENTIERTE
 *  `INSERT INTO occ_owner_access`-Zeile in dev-data.sql als Treffer. */
const ohneSqlKommentar = (t) => t.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const ohneJsKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const MIG232 = "sql/migrations/232_kundenkonto_haelt_keinen_support_zugang.sql";
const PLATTFORM_TABELLEN = ["support_agents", "tempconnect_staff", "occ_owner_access"];

suite("Punkt 15 — ein Kundenkonto hält keinen Plattform-Zugang", () => {

  it("die CLI verhindert es, und zwar VOR dem Schreiben", () => {
    /* Hier ist die Doppelrolle entstanden: `agent-add` nahm jede Adresse an.
     * Dass die Prüfung VOR dem Schreiben steht, ist nicht Stil — darunter liegt
     * ein UPDATE-Zweig, der einen bestehenden Zugang reaktiviert. Eine Prüfung
     * danach hätte genau den Fall durchgelassen, den es aufzuräumen gab. */
    const cli = ohneJsKommentar(lies("api/scripts/support-access-cli.js"));
    assert.match(cli, /async function assertKeinKundenkonto/,
      "die Stop-Regel ist nicht als benannte Funktion da");
    assert.match(cli, /FROM org_memberships m/,
      "die Stop-Regel fragt nicht nach Org-Mitgliedschaften — dann prüft sie etwas anderes");

    const ab = cli.indexOf("async function cmdAgentAdd");
    assert.ok(ab > 0, "cmdAgentAdd gibt es nicht");
    const ende = cli.indexOf("async function cmdAgentSuspend", ab);
    const rumpf = ende > 0 ? cli.slice(ab, ende) : cli.slice(ab);
    assert.match(rumpf, /assertKeinKundenkonto/,
      "cmdAgentAdd ruft die Stop-Regel nicht — dann kann jede Adresse Support-Agent werden, "
      + "auch die eines Kunden. Genau so entstand der Befund am 2026-06-19.");

    const iRegel = rumpf.indexOf("assertKeinKundenkonto");
    const iUpdate = rumpf.indexOf("UPDATE support_agents");
    const iInsert = rumpf.indexOf("INSERT INTO support_agents");
    assert.ok(iUpdate > 0 && iInsert > 0, "cmdAgentAdd schreibt nicht mehr in support_agents");
    assert.ok(iRegel < iUpdate && iRegel < iInsert,
      "die Stop-Regel steht NACH einem Schreibzugriff. Der UPDATE-Zweig reaktiviert einen "
      + "bestehenden Zugang — eine Prüfung danach kommt zu spät.");

    /* Und kein Umweg-Schalter. Wer beides will, nimmt zwei Konten. */
    assert.ok(!/--trotzdem|--force|--erlaube-kunde/.test(rumpf),
      "cmdAgentAdd hat einen Umweg-Schalter. Dann ist die Stop-Regel eine Empfehlung, und "
      + "der nächste Mensch setzt ihn, weil es schneller geht.");
  });

  it("Migration 232 widerruft, sie löscht nicht", () => {
    /* SECHS Tabellen zeigen auf `support_agents.id`, alle mit `ON DELETE SET
     * NULL`: support_cases, support_case_notes, support_case_events, beide
     * Spalten von support_escalations, support_audit_log. Ein DELETE würde still
     * den AKTEUR EINES AUDIT-EINTRAGS auf NULL setzen. */
    const code = ohneSqlKommentar(lies(MIG232));
    assert.ok(!/DELETE\s+FROM\s+support_agents/i.test(code),
      "Migration 232 LÖSCHT eine Support-Zeile. Sechs Tabellen zeigen mit ON DELETE SET NULL "
      + "darauf — ein Aufräumen, das den Akteur eines Audit-Eintrags auf NULL setzt, ist "
      + "schlimmer als die Zeile, die es aufräumt.");
    assert.match(code, /SET is_active = FALSE/,
      "Migration 232 widerruft nicht mehr über is_active — und `supportAccess.js` prüft "
      + "genau diese Spalte (`AND sa.is_active = TRUE`)");
  });

  it("Migration 232 fasst Owner-Konten nicht an", () => {
    /* „Das Team ist eine Person" (CLAUDE.md): der Eigentümer trägt Staff, Support
     * und Owner gleichzeitig. Und ein Eingriff in den eigenen Anmeldeweg ist eine
     * Owner-Entscheidung, keine Migration. Ohne diese Ausnahme wäre das derselbe
     * Fehler wie in Migration 230 vor ihrer Korrektur: eine Bedingung, die den
     * Fall „der Betroffene ist der Eigentümer" nicht mitdenkt. */
    const code = ohneSqlKommentar(lies(MIG232));
    const treffer = code.match(/NOT EXISTS \(SELECT 1 FROM occ_owner_access o\s+WHERE o\.user_id = a\.user_id AND o\.revoked_at IS NULL\)/g) || [];
    assert.ok(treffer.length >= 3,
      `die Owner-Ausnahme steht ${treffer.length}-mal, erwartet mindestens 3 (Zählung, UPDATE, `
      + "Notbremse). Fehlt sie an EINER Stelle, meldet die Notbremse eine Lage, die das UPDATE "
      + "nicht hergestellt hat — oder das UPDATE nimmt dem Eigentümer seinen Zugang.");
    /* ─────────────────────────────────────────────────────────────────────────
     * UND SIE PRÜFT DIE VERÄNDERUNG, NICHT DIE EXISTENZ (Korrektur 2026-10-02)
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Hier stand eine Zusicherung auf `SELECT count(*) … WHERE revoked_at IS NULL`
     * allein — und die Migration prüfte danach `IF rest < 1 THEN RAISE EXCEPTION`.
     * Auf einem FRISCHINSTALL ist `occ_owner_access` leer, also `rest = 0`, also
     * feuerte die Bremse: **die Migrationskette brach bei 232 ab.**
     *
     * Das war eine WIEDERHOLUNG. Migration 230 hatte denselben Denkfehler am
     * gleichen Tag, dort war er schon behoben, und ich habe ihn wenige Stunden
     * später identisch gebaut. Gefunden hat ihn `sql/test-fresh-install.sh`, nicht
     * die Suite — 232 war nur noch nie darüber gelaufen.
     *
     * Die richtige Frage ist nicht „gibt es einen Owner-Zugang?", sondern „hat
     * DIESER LAUF einen genommen?". Diese Probe hält beides fest: den Vergleich,
     * und das Verbot der alten Form.
     * ───────────────────────────────────────────────────────────────────────── */
    assert.match(code, /SELECT count\(\*\) INTO owner_vorher FROM occ_owner_access WHERE revoked_at IS NULL/,
      "Migration 232 merkt sich die Zahl der Owner-Zugänge nicht VOR dem Lauf. Ohne den "
      + "Vorher-Wert kann sie nur die Existenz prüfen — und das bricht auf einem Frischinstall.");
    assert.match(code, /IF rest <> owner_vorher THEN/,
      "Migration 232 vergleicht die Zahl der Owner-Zugänge nicht mit dem Vorher-Wert. Sie "
      + "schreibt gar nicht in occ_owner_access; die Zahl muss unverändert sein, auch wenn "
      + "sie 0 ist.");
    assert.ok(!/rest\s*<\s*1/.test(code),
      "Migration 232 prüft wieder `rest < 1` auf occ_owner_access. Auf einem FRISCHINSTALL ist "
      + "die Tabelle leer, die Bremse feuert, und die Migrationskette bricht ab — genau der "
      + "Fehler, den Migration 230 am 2026-10-02 schon hatte. Aus einer Fläche, zu der niemand "
      + "Zugang hat, kann niemand ausgesperrt werden.");
  });

  it("Migration 232 sagt es, wenn sie nichts nachgewiesen hat", () => {
    /* Die Lehre aus Migration 230: auf einem Frischinstall ist `org_memberships`
     * leer, und die Notbremse ist dann LEER erfüllt. Ein leeres Grün, das sich
     * als Nachweis ausgibt, ist der schlimmere Fehler. */
    const mig = lies(MIG232);
    assert.match(mig, /SELECT count\(\*\) INTO rest FROM org_memberships/,
      "Migration 232 prüft nicht, ob es überhaupt Org-Mitgliedschaften gibt — dann ist ihre "
      + "Notbremse auf einem Frischinstall leer erfüllt und behauptet trotzdem einen Nachweis");
    assert.match(mig, /Frischinstall[\s\S]{0,200}NICHTS nachgewiesen/,
      "Migration 232 sagt im Leerfall nicht, dass sie nichts nachgewiesen hat");
    assert.match(mig, /string_agg\(a\.id::text/,
      "Migration 232 nennt die betroffenen Kennungen nicht. Diese Meldung ist laut ihrer eigenen "
      + "Rollback-Strategie der einzige Weg zurück — ohne die Kennungen gibt es keinen.");

    /* ─────────────────────────────────────────────────────────────────────────
     * UND SIE MUSS ÜBER DIE SCHWELLE. Gemessen beim ersten Lauf am 2026-10-02:
     * die Migration räumte eine Zeile auf und gab NICHTS aus. Oben steht
     * `SET client_min_messages TO WARNING` (Hausstil), und das unterdrückt jedes
     * `NOTICE` — auch das eine, das die Kennungen für den Rückweg trägt. Ein
     * Rückweg, der im Rauschfilter verschwindet, ist keiner. Dasselbe gilt für
     * die Meldung „diese Prüfung hat nichts nachgewiesen": eine unterdrückte
     * Warnung über einen fehlenden Nachweis ist genau die Falle, die sie
     * benennen soll.
     * ───────────────────────────────────────────────────────────────────────── */
    const code = ohneSqlKommentar(mig);
    if (/SET client_min_messages TO WARNING/.test(code)) {
      assert.match(code, /RAISE WARNING[^;]*string_agg|RAISE WARNING '232: % Support-Zugang/,
        "die Kennungen für den Rückweg werden als NOTICE ausgegeben, aber "
        + "`client_min_messages` steht auf WARNING — sie erscheinen nie. Gemessen am "
        + "2026-10-02: der erste Lauf räumte eine Zeile auf und gab NICHTS aus.");
      assert.match(code, /RAISE WARNING '232: keine Org-Mitgliedschaften vorhanden/,
        "die Meldung „diese Prüfung hat nichts nachgewiesen\" ist ein NOTICE und wird von "
        + "`client_min_messages = WARNING` unterdrückt. Eine verschluckte Warnung über einen "
        + "fehlenden Nachweis ist schlimmer als keine.");
    }
  });

  it("die Bühne bringt einen EXTERNEN Halter mit — sonst ist es eine Entfernung", () => {
    /* Gemessen am 2026-10-02: nach der Bereinigung blieben NULL aktive externe
     * Agenten. Ohne eigenen Halter wäre Punkt 15 keine Trennung, sondern das
     * Abschalten einer ganzen Fläche — und Y6.1 („die Besetzung ist vollständig")
     * hätte eine Lücke. */
    const saat = lies("sql/seeds/y4-flaechen.sql");
    assert.match(saat, /support\.extern@probebuehne\.tempconnect\.de/,
      "y4 legt kein externes Support-Konto an. Nach Migration 232 hat der externe Weg dann "
      + "NULL Halter, und die Trennung ist eine Entfernung.");
    assert.match(saat, /'external_support_agent'/,
      "y4 vergibt die Rolle external_support_agent nicht");
    /* Mit `\s*\(` und nicht nur dem Namen: eine Rückmutation, die
     * `support_vendors` zu `support_vendors_weg` umbenannte, blieb GRÜN — der
     * kürzere Name ist eine Teilzeichenkette des längeren. Wer einen Namen
     * irgendwo im Text sucht, kann ihn nie als fehlend melden. */
    assert.match(saat, /INSERT INTO support_vendors\s*\(/,
      "y4 legt keinen eigenen Dienstleister an. Dann hängt die Bühne an „India Support BPO“ — "
      + "einer Zeile, die NUR in der Entwicklungsdatenbank existiert und in keiner Saat und "
      + "keiner Migration steht. Auf einem Frischinstall wäre die Saat rot ohne eigenen Fehler.");
    assert.ok(!/India Support BPO/.test(ohneSqlKommentar(saat)),
      "y4 benutzt „India Support BPO“ in einer ANWEISUNG — eine Abhängigkeit auf Daten, die "
      + "die Saat nicht anlegt");

    /* UND: der externe Agent muss IN der `gewollt`-CTE stehen. Der maßgebliche
     * Widerruf darunter schaltet alles mit dem Bühnen-Präfix ab, was nicht darin
     * steht. Beim Bauen war genau das zuerst falsch. */
    assert.match(saat, /\), gewollt_extern AS \(/,
      "der externe Agent steht nicht als zweiter CTE-Zweig. Der maßgebliche Widerruf schaltet "
      + "ihn dann bei jedem Lauf erst ab und danach wieder an — die Zusage „maßgeblich\" würde "
      + "nicht mehr beschreiben, was passiert.");
    assert.match(saat, /SELECT id FROM gewollt\s*\n\s*UNION ALL\s*\n\s*SELECT id FROM gewollt_extern/,
      "der Widerruf kennt den externen Zweig nicht — er würde den externen Agenten widerrufen");
  });

  it("KEINE Saat legt Kundenwelt und Plattform-Fläche im selben Konto an", () => {
    /* Die Korpus-Seite. Beim Bauen zählte ein `grep -c` eine AUSKOMMENTIERTE
     * `INSERT INTO occ_owner_access`-Zeile in dev-data.sql als Treffer — deshalb
     * wird hier kommentarfrei gelesen. */
    const verzeichnis = path.join(ROOT, "sql", "seeds");
    const dateien = fs.readdirSync(verzeichnis).filter((d) => d.endsWith(".sql"));
    assert.ok(dateien.length >= 8, `nur ${dateien.length} Saat-Dateien gefunden — liest die Probe das richtige Verzeichnis?`);

    const verdacht = [];
    for (const d of dateien) {
      const rein = ohneSqlKommentar(fs.readFileSync(path.join(verzeichnis, d), "utf8"));
      const kunde = /INSERT\s+INTO\s+org_memberships/i.test(rein);
      const flaechen = PLATTFORM_TABELLEN.filter((t) => new RegExp("INSERT\\s+INTO\\s+" + t, "i").test(rein));
      if (kunde && flaechen.length) verdacht.push(`${d} (org_memberships + ${flaechen.join("/")})`);
    }
    assert.deepEqual(verdacht, [],
      "Diese Saat(en) legen im selben Lauf eine Org-Mitgliedschaft UND einen Plattform-Zugang "
      + "an:\n  " + verdacht.join("\n  ")
      + "\nDas ist nicht zwingend dasselbe KONTO — aber es ist der Weg, auf dem eine "
      + "Doppelrolle entsteht, und eine Saat darf ihn nicht gehen. Prüfe die Konten und "
      + "trenne sie (Vorbild: y4-flaechen.sql, Konto Nr. 10).");
  });
});

/**
 * Die Regel am BESTAND. Eine Textprobe sieht nicht, wer heute in beiden Welten
 * sitzt — und genau darauf kommt es an.
 */
describe("Punkt 15 am Bestand — niemand sitzt in beiden Welten",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  /** Dieselbe Bedingung für alle drei Flächen: Kunde + Plattform-Zugang. */
  const ABFRAGE = (tabelle, aktiv) => `
    SELECT u.email, count(m.org_id)::int AS orgs
      FROM ${tabelle} x
      JOIN users u ON u.id = x.user_id
      JOIN org_memberships m ON m.user_id = x.user_id
     WHERE ${aktiv}
       AND NOT EXISTS (SELECT 1 FROM occ_owner_access o
                        WHERE o.user_id = x.user_id AND o.revoked_at IS NULL)
     GROUP BY u.email
     ORDER BY u.email`;

  it("kein aktiver Support-Agent ist Kunde", async () => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(ABFRAGE("support_agents", "x.is_active = TRUE"));
      assert.deepEqual(rows.map((r) => `${r.email} (${r.orgs} Org)`), [],
        "Diese Konten sind Kunde UND aktiver Support-Agent. `support_agents` steht laut "
        + "Migration 110 getrennt von Org-RBAC; ein externer Agent ist ein Mensch beim "
        + "Dienstleister, kein Kunde. Entstehen kann das über `support-access-cli.js "
        + "agent-add` — dort steht seit Punkt 15 eine Stop-Regel, also wurde hier entweder "
        + "von Hand geschrieben oder die Regel ist weg.");
    } finally { await pool.end(); }
  });

  it("kein aktiver Staff ist Kunde", async () => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(ABFRAGE("tempconnect_staff", "x.is_active = TRUE AND x.revoked_at IS NULL"));
      assert.deepEqual(rows.map((r) => `${r.email} (${r.orgs} Org)`), [],
        "Diese Konten sind Kunde UND aktiver Staff. Das Staff Control Center verwaltet die "
        + "Plattform; ein Kundenkonto darf dort nicht sitzen (docs/FLAECHEN.md).");
    } finally { await pool.end(); }
  });

  it("die Abfrage prüft überhaupt etwas", async (t) => {
    /* Ohne diese Gegenprobe wären die beiden Zusicherungen oben auch auf einer
     * Datenbank grün, die keine Mitgliedschaften und keine Agenten kennt — ein
     * Frischinstall. Dann hätten sie NICHTS nachgewiesen, und das muss sichtbar
     * sein, nicht still grün (die Lehre aus Migration 230). */
    const pool = createPool();
    try {
      const { rows } = await pool.query(`
        SELECT (SELECT count(*)::int FROM org_memberships) AS mitgliedschaften,
               (SELECT count(*)::int FROM support_agents WHERE is_active) AS agenten,
               (SELECT count(*)::int FROM tempconnect_staff WHERE is_active AND revoked_at IS NULL) AS staff`);
      const { mitgliedschaften, agenten, staff } = rows[0];
      if (mitgliedschaften === 0 || (agenten === 0 && staff === 0)) {
        t.diagnostic(`Frischinstall-Lage: ${mitgliedschaften} Mitgliedschaften, ${agenten} Agenten, `
          + `${staff} Staff — die beiden Zusicherungen darüber sind LEER erfüllt und haben `
          + "nichts nachgewiesen.");
        return;
      }
      assert.ok(mitgliedschaften > 0 && (agenten > 0 || staff > 0),
        "unerreichbar — nur zur Form");
    } finally { await pool.end(); }
  });

  it("der externe Support-Weg hat einen Halter, und der ist kein Kunde", async (t) => {
    /* Die andere Hälfte von Punkt 15: die Trennung darf die Fläche nicht leeren.
     * Der Halter kommt aus y4-flaechen.sql; ist die Saat nicht geladen, sagt die
     * Probe das, statt eine Besetzung zu behaupten oder rot zu werden. */
    const pool = createPool();
    try {
      const { rows } = await pool.query(`
        SELECT count(*)::int AS halter
          FROM support_agents a
         WHERE a.is_active = TRUE AND a.scope = 'external'
           AND NOT EXISTS (SELECT 1 FROM org_memberships m WHERE m.user_id = a.user_id)`);
      const { rows: saat } = await pool.query(
        "SELECT count(*)::int AS n FROM users WHERE email = 'support.extern@probebuehne.tempconnect.de'");
      if (saat[0].n === 0) {
        t.diagnostic("y4-flaechen.sql ist in dieser Datenbank nicht geladen (Konto Nr. 10 fehlt) — "
          + "diese Probe hat NICHTS nachgewiesen. Laden: SEED_DEMO_WORLD=true "
          + "SEED_PASSWORT=<geheim> ./scripts/dev/seed-data.sh --file=y4-flaechen.sql");
        return;
      }
      assert.ok(rows[0].halter >= 1,
        "der externe Support-Weg hat keinen Halter mehr, der kein Kunde ist. Dann war Punkt 15 "
        + "keine Trennung, sondern das Abschalten einer Fläche — y4-flaechen.sql bringt Konto "
        + "Nr. 10 dafür mit.");
    } finally { await pool.end(); }
  });
});
