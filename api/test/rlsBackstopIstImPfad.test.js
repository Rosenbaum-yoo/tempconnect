/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIEGT DER RLS-BACKSTOP IM WEG DER ANWENDUNG? (gemessen, nicht geglaubt)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DER BEFUND (2026-10-02): die Anwendung verbindet sich als Rolle `tempconnect`,
 * und die trägt `rolsuper = true` **und** `rolbypassrls = true`. Damit ist **jede**
 * Policy aus `docs/security/TENANT_ISOLATION_MODEL.md` für die Anwendung
 * wirkungslos — 26 Tabellen mit `rowsecurity`, 21 mit `FORCE`, alle korrekt
 * eingerichtet und alle nicht im Weg der Verbindung, die sie schützen sollen.
 *
 * Das ist kein Loch im Mandantenschutz: die Isolation wirkt über den
 * Anwendungscode (`withOrgContext`, die `org_id`-Bedingungen, die Guards). RLS war
 * als ZWEITE Schicht gedacht, die greift, wenn in der ersten jemand eine Bedingung
 * vergisst. Diese zweite Schicht ist derzeit nicht eingeschaltet.
 *
 * UND DER GRUND, WARUM ES NICHT AUFFIEL, gehört zum Befund: der Nachweis, dass
 * die Policies funktionieren, wurde als `rls_app` geführt — mit genau der Rolle,
 * die die Anwendung NICHT benutzt. Der Nachweis war richtig, seine Übertragung auf
 * den Betrieb nicht. Ein Beleg gilt für die Rolle, mit der er erbracht wurde.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM DIESE DATEI HEUTE NICHT ROT IST — UND TROTZDEM EINE SPERRE
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Owner-Entscheidung 2026-10-02: **„Umstellung vorbereiten, nicht schalten."** Ein
 * roter Test würde das Tor auf einem Zustand blockieren, den der Owner bewusst
 * gewählt hat. Ein stilles Grün wäre aber genau die Lage, die den Befund ein
 * halbes Jahr unsichtbar gehalten hat.
 *
 * Deshalb eine ZWEI-WEGE-SPERRE: geprüft wird nicht der Zustand, sondern ob
 * Zustand und DOKUMENTATION übereinstimmen.
 *
 *   Rolle umgeht RLS  +  Doku sagt „nicht im Pfad"   -> grün (heutige Lage)
 *   Rolle umgeht NICHT +  Doku sagt „nicht im Pfad"   -> ROT  (Doku nachziehen)
 *   Rolle umgeht RLS  +  Doku sagt „umgestellt"       -> ROT  (Rückschritt)
 *   Rolle umgeht NICHT +  Doku sagt „umgestellt"      -> grün (Zielzustand)
 *
 * So blockiert nichts die Entscheidung des Owners, und keine der beiden
 * Richtungen kann still passieren. Nach der Umstellung wird die Zusicherung
 * automatisch scharf — niemand muss daran denken.
 *
 * Run: node --test --test-force-exit test/rlsBackstopIstImPfad.test.js
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

const ROOT = findeWurzel(path.join("docs", "security"));
const suite = ROOT ? describe : describe.skip;
const DOKU_REL = "docs/security/TENANT_ISOLATION_MODEL.md";
const DOKU = ROOT ? fs.readFileSync(path.join(ROOT, DOKU_REL), "utf8") : "";

/** Die Behauptung der Dokumentation, als eine Zeile. */
const MARKE_NICHT_IM_PFAD = "DER BACKSTOP IST HEUTE NICHT IM PFAD";
const dokuSagtNichtImPfad = DOKU.includes(MARKE_NICHT_IM_PFAD);

suite("RLS-Backstop — Zustand und Dokumentation müssen übereinstimmen", () => {

  it("die Dokumentation trifft überhaupt eine Aussage", () => {
    /* Ohne diese Probe wäre die Zwei-Wege-Sperre darunter stumm: fehlt die Marke,
     * gilt „Doku sagt umgestellt", und ein Rückschritt würde rot — aber eben auch,
     * wenn jemand den Abschnitt nur gelöscht hat. Eine Sperre, deren Zustand von
     * der Abwesenheit eines Textes abhängt, muss diese Abwesenheit benennen. */
    assert.ok(DOKU.length > 1000, `${DOKU_REL} ist leer oder nicht gefunden`);
    const sagtUmgestellt = /BACKSTOP IST IM PFAD|Umstellung (ist )?vollzogen/i.test(DOKU);
    assert.ok(dokuSagtNichtImPfad || sagtUmgestellt,
      `${DOKU_REL} sagt weder "${MARKE_NICHT_IM_PFAD}" noch, dass die Umstellung vollzogen ist. `
      + "Dann weiß niemand, welcher Zustand gewollt ist, und diese Datei kann keinen "
      + "Rückschritt von einer Entscheidung unterscheiden.");
    assert.ok(!(dokuSagtNichtImPfad && sagtUmgestellt),
      `${DOKU_REL} behauptet BEIDES. Eine der beiden Stellen ist von einer Änderung `
      + "übrig geblieben.");
  });

  it("die nötigen Rechte für rls_app sind dokumentiert, nicht geschätzt", () => {
    /* Gemessen am 2026-10-02: `rls_app` hat USAGE auf `public` und SONST NICHTS —
     * keine Tabellen-, keine Sequenzrechte. Eine Umstellung ohne die Rechte macht
     * die Anwendung funktionslos, nicht sicherer. Wer das vor sich hat, soll die
     * Liste finden und nicht herleiten müssen. */
    if (!dokuSagtNichtImPfad) return;
    for (const [muster, was] of [
      [/GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES\s+IN SCHEMA public TO rls_app/, "die Tabellenrechte"],
      [/GRANT USAGE, SELECT\s+ON ALL SEQUENCES\s+IN SCHEMA public TO rls_app/, "die Sequenzrechte"],
      [/ALTER DEFAULT PRIVILEGES IN SCHEMA public/, "die Vorgaberechte für künftige Tabellen"],
    ]) {
      assert.match(DOKU, muster,
        `${DOKU_REL} nennt ${was} nicht. Ohne die Vorgaberechte ist die erste neue Tabelle `
        + "nach der Umstellung für die Anwendung unsichtbar, und zwar still.");
    }
    /* RÜCKMUTATION 2026-10-02: hier stand `/171 von 197|kein RLS/` — und die zweite
     * Alternative ist eine gängige Wendung, die anderswo im Dokument steht
     * („Kein Mandantenträger", „kein RLS-Modell"). Die Zusicherung war damit ein
     * Stellvertreter: nahm man die Zahl heraus, blieb sie grün. Geprüft wird jetzt
     * die AUSSAGE mit beiden Zahlen, und die Zahlen werden gegen den gemessenen
     * Bestand gehalten (die Probe am Bestand unten nennt sie). */
    const mZahlen = DOKU.match(/\*\*(\d+) von (\d+) Tabellen haben überhaupt kein RLS\*\*/);
    assert.ok(mZahlen,
      `${DOKU_REL} sagt nicht in Zahlen, wie viele Tabellen GAR KEIN RLS haben (erwartete Form: `
      + "**N von M Tabellen haben überhaupt kein RLS**). Wer die Umstellung für "
      + "„Mandantenschutz erledigt\" nimmt, irrt um den Faktor sieben.");
    const [, ohneRls, alle] = mZahlen.map(Number);
    assert.ok(ohneRls > 0 && alle > ohneRls,
      `die Zahlen in ${DOKU_REL} sind unplausibel: ${ohneRls} von ${alle}`);
    assert.ok(ohneRls / alle > 0.5,
      `${DOKU_REL} sagt, ${ohneRls} von ${alle} Tabellen hätten kein RLS — das wäre weniger als `
      + "die Hälfte und widerspricht dem Befund. Entweder ist die Zahl veraltet oder der "
      + "Backstop ist weiter als dokumentiert.");
    assert.match(DOKU, /Migrationskette bleibt auf einer privilegierten Rolle/,
      `${DOKU_REL} sagt nicht, dass die Migrationen NICHT umgestellt werden. Sie machen DDL und `
      + "legen im dev-Pfad pgcrypto an — mit rls_app bricht die Kette.");

    /* ─────────────────────────────────────────────────────────────────────────
     * SCHRITT 0 MUSS DRINSTEHEN (Korrektur 2026-10-02)
     * ─────────────────────────────────────────────────────────────────────────
     *
     * Die erste Fassung dieses Dokuments las sich so, als wäre die Umstellung eine
     * Rechte- und Konfigurationsfrage: GRANTs vergeben, `DATABASE_URL` umstellen,
     * Flächen durchgehen. Gemessen ist sie das nicht. `withOrgContext()`,
     * `req.setOrgContext` und `req.withStaffContext` sind definiert und getestet —
     * und haben NULL Produktions-Aufrufer. Die Anwendung setzt
     * `app.current_org_id` nirgends.
     *
     * Ohne gesetzte GUC wird die wirksame INSERT-Bedingung der ALL-Policies
     * (`USING` gilt dort auch als `WITH CHECK`, weil `polwithcheck IS NULL`) zu
     * `NULL OR NULL` — und damit abgelehnt. Eine Umstellung würde also nicht die
     * Isolation einschalten, sondern jeden mandantengebundenen Lesevorgang auf 0
     * Zeilen und jedes Audit-Schreiben auf einen Fehler setzen.
     *
     * Diese Zusicherung hält den Satz fest. Ohne ihn liest die nächste Sitzung die
     * Liste, hält sie für vollständig, und schaltet.
     * ───────────────────────────────────────────────────────────────────────── */
    assert.match(DOKU, /Schritt 0/,
      `${DOKU_REL} nennt keinen "Schritt 0". Die Liste der fehlenden Schritte liest sich dann `
      + "wie eine Konfigurationsaufgabe — und der grösste Teil fehlt: die Anwendung setzt den "
      + "Kontext nirgends.");
    assert.match(DOKU, /withOrgContext/,
      `${DOKU_REL} nennt withOrgContext nicht. Das ist der Mechanismus, der existiert, getestet `
      + "ist und NICHT benutzt wird — ohne seinen Namen findet niemand die Lücke.");
    /* OHNE AUFFANG-ALTERNATIVE. Beide Zusicherungen hier standen zuerst als
     * Alternation mit drei Zweigen — und blieben in der Rückmutation GRÜN, weil
     * jeweils ein schwacher Zweig weiter passte: `0** (nur` steht in der Tabelle,
     * `SET LOCAL app.current_org_id` im Codeblock darüber. Eine Zusicherung mit
     * Auffang-Alternative prüft den schwächsten ihrer Zweige, nicht die Aussage. */
    /* ZWEI Zusicherungen, nicht eine kombinierte: `**0**` und das Wort stehen in
     * VERSCHIEDENEN Tabellenzeilen (Kopf und Daten). Eine Bedingung, die beides in
     * einer Zeile verlangt, ist auf dem unmutierten Dokument rot — passiert und
     * gemessen. */
    assert.match(DOKU, /\|\s*Produktions-Aufrufer\s*\|/,
      `${DOKU_REL} hat keine Spalte „Produktions-Aufrufer". Genau diese Zahl ist der Befund — `
      + "alles andere ist seit Monaten richtig dokumentiert.");
    assert.match(DOKU, /\|\s*\*\*0\*\*\s*\(nur/,
      `${DOKU_REL} nennt die NULL nicht. Ohne sie liest sich der Abschnitt wie eine Beschreibung `
      + "des Mechanismus statt wie der Nachweis, dass ihn niemand benutzt.");
    assert.match(DOKU, /von Hand gesetzt habe/,
      `${DOKU_REL} sagt nicht, dass der Nachweis mit einem HÄNDISCH gesetzten Kontext geführt `
      + "wurde. Ein Beleg ohne seine Bedingungen wird beim nächsten Lesen zur Freigabe — genau "
      + "so ist dieser Befund vier Monate lang übersehen worden.");
  });
});

describe("RLS-Backstop am Bestand — die Rolle, mit der die Anwendung wirklich verbindet",
  { skip: !hasDb && "Keine Datenbank konfiguriert" }, () => {

  it("Zustand und Dokumentation stimmen überein", async (t) => {
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        `SELECT current_user AS rolle, r.rolsuper, r.rolbypassrls
           FROM pg_roles r WHERE r.rolname = current_user`);
      assert.equal(rows.length, 1, "current_user steht nicht in pg_roles — unmöglich");
      const { rolle, rolsuper, rolbypassrls } = rows[0];

      /* BEIDE Eigenschaften umgehen RLS, und zwar unabhängig voneinander. Nur
       * `rolbypassrls` zu prüfen wäre der häufigere Fehler: ein Superuser umgeht
       * RLS auch mit `rolbypassrls = false`. */
      const umgehtRls = rolsuper === true || rolbypassrls === true;
      const lage = `${rolle}: rolsuper=${rolsuper} rolbypassrls=${rolbypassrls}`;

      const { rows: rls } = await pool.query(
        `SELECT count(*) FILTER (WHERE relrowsecurity)::int AS mit_rls,
                count(*) FILTER (WHERE relforcerowsecurity)::int AS mit_force,
                count(*)::int AS tabellen
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'`);
      const { mit_rls, mit_force, tabellen } = rls[0];

      if (dokuSagtNichtImPfad) {
        t.diagnostic(`BEFUND, wie dokumentiert: ${lage} — der Backstop ist NICHT im Pfad. `
          + `${mit_rls} von ${tabellen} Tabellen haben RLS (${mit_force} mit FORCE), und alle `
          + "sind für diese Verbindung wirkungslos. Owner-Entscheidung 2026-10-02: vorbereiten, "
          + "nicht schalten.");
        assert.ok(umgehtRls,
          `${lage} — die Anwendungsrolle umgeht RLS NICHT MEHR, aber ${DOKU_REL} sagt weiter `
          + `"${MARKE_NICHT_IM_PFAD}". Entweder wurde umgestellt, dann zieht die Dokumentation `
          + "nach (und diese Zusicherung wird dadurch automatisch scharf), oder die Rolle hat "
          + "sich unbeabsichtigt geändert. Beides gehört angesehen, nicht übergangen.");
      } else {
        assert.ok(!umgehtRls,
          `${lage} — die Anwendungsrolle umgeht RLS, aber ${DOKU_REL} sagt, die Umstellung sei `
          + `vollzogen. Das ist ein RÜCKSCHRITT: die ${mit_rls} Policies sind damit wieder `
          + "wirkungslos, und zwar ohne dass irgendwo etwas anderes auffällt.");
        t.diagnostic(`${lage} — der Backstop liegt im Pfad. ${mit_rls} von ${tabellen} Tabellen `
          + `haben RLS (${mit_force} mit FORCE); für die übrigen ${tabellen - mit_rls} bleibt der `
          + "Anwendungscode die einzige Schicht.");
      }
    } finally { await pool.end(); }
  });

  it("rls_app ist da, kann sich anmelden und umgeht RLS nicht", async (t) => {
    /* Die Zielrolle muss existieren, BEVOR jemand umstellt — und sie darf nicht
     * selbst eine Umgehung tragen, sonst wäre die Umstellung wirkungslos. */
    const pool = createPool();
    try {
      const { rows } = await pool.query(
        "SELECT rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'rls_app'");
      if (!rows.length) {
        assert.ok(!dokuSagtNichtImPfad === false,
          "die Rolle rls_app gibt es nicht, aber die Dokumentation beschreibt die Umstellung "
          + "auf sie. Entweder die Rolle anlegen oder die Dokumentation richtigstellen.");
        t.diagnostic("rls_app gibt es in dieser Datenbank nicht — die Umstellung wäre heute "
          + "nicht möglich.");
        return;
      }
      const r = rows[0];
      assert.equal(r.rolcanlogin, true,
        "rls_app kann sich nicht anmelden — die Umstellung wäre damit unmöglich");
      assert.equal(r.rolsuper, false,
        "rls_app ist Superuser. Dann umgeht sie RLS genauso wie die heutige Rolle, und die "
        + "Umstellung wäre eine Umbenennung ohne Wirkung.");
      assert.equal(r.rolbypassrls, false,
        "rls_app trägt rolbypassrls — dann umgeht sie RLS, und die Umstellung wäre wirkungslos");
    } finally { await pool.end(); }
  });

  it("keine Tabelle mit RLS steht ohne Policy da", async () => {
    /* Die Falle in der anderen Richtung: eine Tabelle mit `rowsecurity` und OHNE
     * Policy liefert nach der Umstellung NULL Zeilen — für jeden, immer. Heute
     * fällt das nicht auf, weil die Rolle alles umgeht. Gemessen am 2026-10-02: 0
     * solche Tabellen. Diese Probe hält das, damit die Umstellung nicht an einer
     * Fläche scheitert, die vorher stumm war. */
    const pool = createPool();
    try {
      const { rows } = await pool.query(`
        SELECT c.relname
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
           AND NOT EXISTS (SELECT 1 FROM pg_policies p
                            WHERE p.schemaname = 'public' AND p.tablename = c.relname)
         ORDER BY c.relname`);
      assert.deepEqual(rows.map((r) => r.relname), [],
        "Diese Tabellen haben RLS aktiv, aber KEINE Policy. Heute fällt das nicht auf, weil die "
        + "Anwendungsrolle RLS umgeht — nach der Umstellung liefern sie NULL Zeilen, für jeden, "
        + "immer. Das ist der Weg, auf dem eine Härtung eine Fläche abschaltet.");
    } finally { await pool.end(); }
  });
});
