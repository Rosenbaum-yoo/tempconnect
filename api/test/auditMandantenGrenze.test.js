/**
 * Die Mandantengrenze im Audit-Log (8.1.1).
 *
 * DER BEFUND, gemessen am 2026-08-21 gegen die laufende Datenbank:
 *   139 Zeilen trugen eine `org_id`, in der der Handelnde NIE Mitglied war
 *   (103 `notification.mark_read`, 16 `auth.register`, 13 `auth.login`,
 *   4 `demo.login`, 3 `subscription_request.apply_approved_change`).
 *   1796 von 2740 Zeilen trugen gar keine `org_id`.
 *
 * Zwei Defekte in einer Tabelle mit gegenlaeufiger Wirkung: ein Teil lag in der
 * FALSCHEN Organisation (Leck), der groessere Teil in KEINER (Luecke in der
 * Nachvollziehbarkeit). Wer nur den ersten behebt, macht das Audit dichter — und
 * gleichzeitig noch loechriger.
 *
 * URSACHE, an der Quelle behoben: `routes/demo.js` setzte `req.session.userId`
 * ohne `session.regenerate()`, sodass der `_orgCache` des zuvor angemeldeten
 * Kontos die ganze Sitzung ueberlebte; und die Audit-Schreibseite stempelte
 * `req.orgId`, der VOR der Route aufgeloest wird. Bestandsreparatur:
 * `sql/migrations/187_audit_log_mandant_an_der_quelle.sql`.
 *
 * ZWEI SCHICHTEN, wie in diesem Repo ueblich:
 *   1. OHNE Datenbank (laeuft immer): die Schreibseite darf nirgends mehr blind
 *      auf `req.orgId` zurueckfallen. Ein Quelltext-Riegel, der jeden neuen
 *      Rueckfall rot macht — auch in einem Pfad, den es heute noch nicht gibt.
 *   2. MIT Datenbank (laeuft im Container): die Abnahme selbst. Ein Mock kann
 *      kein `WHERE` erzwingen und kennt keine Policies; ob die Grenze haelt,
 *      weiss nur Postgres.
 *
 * Schicht 2 ueberspringt sich ohne `DB_HOST` — aber LAUT (CLAUDE.md §0.9).
 *
 * NICHT hier geprueft, weil es Rollen-Rechte braucht: der Verhaltensnachweis mit
 * einer Nicht-Superuser-Rolle. Er wurde am 2026-08-21 von Hand gefuehrt und ist
 * in `docs/features/I_AUDIT_ZUWEISUNG_SUPPORT.md` protokolliert: ohne Kontext
 * 0 Zeilen, Org A 303 (nur eigene), Org B 140 (nur eigene), Staff 2742, org-lose
 * Zeilen fuer A 0 — und die Rueckmutation auf die alte Policy liess dieselbe
 * Abfrage wieder 495 fremde Zeilen sehen.
 *
 * Run: node --test --test-force-exit test/auditMandantenGrenze.test.js
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = path.resolve(__dirname, "..");

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 1 — die Schreibseite raet nicht mehr (laeuft immer)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Audit-Mandantengrenze — die Schreibseite", () => {
  const auditLogQuelle = fs.readFileSync(path.join(API, "services/auditLog.js"), "utf8");
  const auditWriteQuelle = fs.readFileSync(path.join(API, "middleware/auditWrite.js"), "utf8");

  it("es gibt einen zentralen Aufloeser statt eines Rueckfalls je Schreibstelle", () => {
    assert.match(auditLogQuelle, /export function bestimmeAuditOrg\(/,
      "bestimmeAuditOrg() fehlt — dann steht die Regel wieder verstreut in den Aufrufern");
  });

  it("keine Schreibstelle stempelt `req.orgId` ungeprueft", () => {
    /*
     * Der Riegel. Frueher stand an beiden Schreibstellen woertlich
     *     org_id: req.orgId || null            (middleware/auditWrite.js)
     *     org_id: params.org_id ?? req.orgId   (services/auditLog.js)
     * — und genau das erzeugte die 139 falsch gestempelten Zeilen. `req.orgId`
     * wird aufgeloest, BEVOR die Route laeuft; bei `/auth/login` also, bevor es
     * den angemeldeten Nutzer ueberhaupt gibt.
     *
     * Geprueft wird das Muster, nicht die Zeile: jede kuenftige Schreibstelle,
     * die `org_id` direkt aus `req.orgId` nimmt, faellt hier auf.
     */
    const verdaechtig = /org_id\s*:\s*(?:[^,\n]*\?\?\s*)?req\.orgId/;
    for (const [name, quelle] of [
      ["services/auditLog.js", auditLogQuelle],
      ["middleware/auditWrite.js", auditWriteQuelle],
    ]) {
      const treffer = quelle.split("\n")
        .map((z, i) => ({ z: z.trim(), nr: i + 1 }))
        .filter(({ z }) => verdaechtig.test(z) && !z.startsWith("*") && !z.startsWith("//"));
      assert.deepEqual(treffer.map((t) => `${name}:${t.nr}  ${t.z}`), [],
        `${name} stempelt die Organisation wieder aus dem Anfragekontext. ` +
        "Sie gehoert an die Quelle der Wahrheit — bestimmeAuditOrg() benutzen.");
    }
  });

  it("der Aufloeser bindet den Kontext an den Handelnden", async () => {
    const { bestimmeAuditOrg } = await import("../services/auditLog.js");

    // 1. Ausdruecklich uebergeben gewinnt — der Aufrufer kennt die Ressource.
    assert.equal(bestimmeAuditOrg({ orgId: "kontext" }, "wer", "aus-ressource"), "aus-ressource");

    // 2. Kontext zaehlt nur fuer denselben Handelnden.
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", orgIdGiltFuerNutzer: "nutzer-1" }, "nutzer-1"),
      "org-A", "der eigene Kontext muss gestempelt werden");
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", orgIdGiltFuerNutzer: "nutzer-VORHER" }, "nutzer-NEU"),
      null, "der Kontext des Vorgaengers darf NICHT gestempelt werden — das war der Befund");

    // 3. Ohne Vermerk lieber keine Org als die falsche.
    assert.equal(bestimmeAuditOrg({ orgId: "org-A" }, "wer"), null);

    // 4. Maschinen-Auth: die Org steht IM Schluessel und ist damit belegt.
    assert.equal(
      bestimmeAuditOrg({ orgId: "org-A", isApiKeyAuth: true }, null),
      "org-A", "SCIM/M2M haette sonst seine Organisation verloren");

    // 5. Kein Kontext, keine Org.
    assert.equal(bestimmeAuditOrg({}, "wer"), null);
    assert.equal(bestimmeAuditOrg(null, "wer"), null);
  });

  it("der Demo-Login erzeugt die Sitzung neu — sonst erbt er die fremde Org", () => {
    /*
     * `/auth/login` tut das seit SEC-001 gegen Session-Fixation; in
     * `routes/demo.js` fehlte es. Die Folge war groesser als Fixation: die alte
     * Sitzung behielt ihren `_orgCache`, und `req.orgId` zeigte fuer den
     * Demo-Nutzer auf die Organisation des Vorgaengers — nicht nur im Audit,
     * sondern in der Mandantengrenze von 45 Routen.
     */
    const demo = fs.readFileSync(path.join(API, "routes/demo.js"), "utf8");
    const regenerierung = demo.indexOf("session.regenerate");
    const eintragung = demo.indexOf("req.session.userId   = user.id");
    assert.ok(regenerierung !== -1, "routes/demo.js erzeugt die Sitzung nicht neu");
    assert.ok(eintragung !== -1, "die Stelle, an der der Demo-Nutzer gesetzt wird, hat sich verschoben");
    assert.ok(regenerierung < eintragung,
      "regenerate() muss VOR dem Eintragen des Demo-Nutzers stehen — danach ist es wirkungslos");
  });

  it("der Sitzungs-Zwischenspeicher gilt nur fuer seinen Nutzer", () => {
    const orgContext = fs.readFileSync(path.join(API, "middleware/orgContext.js"), "utf8");
    assert.match(orgContext, /_orgCache\?\.userId/,
      "orgContext prueft nicht mehr, FUER WEN der Zwischenspeicher aufgeloest wurde — " +
      "dann erbt jede uebernommene Sitzung wieder die Org ihres Vorgaengers");
    assert.match(orgContext, /userId: req\.session\.userId/,
      "der Zwischenspeicher wird ohne Nutzer geschrieben und ist damit nicht pruefbar");
  });

  /*
   * DER EINE MOMENT, IN DEM `bestimmeAuditOrg()` NICHTS LIEFERN KANN.
   *
   * Owner-Entscheid 2026-08-24: Login-Zeilen sollen zuordenbar sein. Damit ist
   * der Widerspruch aufgeloest, den Welle 8.1.1 hinterlassen hatte — Migration
   * 187 nannte org-lose Login-Zeilen im Kopf richtig, ihr Schritt 2 zog sie
   * trotzdem nach, und diese Zusicherung erzwang das Nachziehen.
   *
   * Beim Anmelden ist `req.orgId` konstruktionsbedingt unbrauchbar: aufgeloest,
   * bevor die Route lief, und danach vom Riegel `orgIdGiltFuerNutzer !== actorId`
   * verworfen (richtig so — das war der Befund). Die Routen geben die Org
   * deshalb ausdruecklich mit, ueber `orgNachAnmeldung()`.
   */
  it("die Anmeldewege geben die Organisation ausdruecklich mit", () => {
    const faelle = [
      ["routes/demo.js",  /action:\s*"demo\.login"[\s\S]{0,240}?org_id:\s*await orgNachAnmeldung\(/],
      ["routes/auth.js",  /action:\s*"auth\.login"[\s\S]{0,240}?org_id:\s*await orgNachAnmeldung\(/],
      /* Die Registrierung legt die Org eine Zeile vorher selbst an — dort ist
       * `orgId` die direktere und ehrlichere Quelle als ein zweiter Lookup. */
      ["routes/auth.js",  /action:\s*"auth\.register"[\s\S]{0,240}?org_id:\s*orgId/],
    ];
    for (const [datei, muster] of faelle) {
      const quelle = fs.readFileSync(path.join(API, datei), "utf8");
      assert.match(quelle, muster,
        `${datei}: ein Anmelde-/Registrierweg gibt die Organisation nicht mehr mit. ` +
        "Ohne sie ist die Zeile in keinem Org-Audit sichtbar, und die Abnahme " +
        "unten (org-lose Zeilen mit eindeutigem Akteur = 0) faellt beim naechsten " +
        "Login um.");
    }
  });

  it("orgNachAnmeldung nimmt die Mitgliedschaft, nicht users.org_id", async () => {
    const { orgNachAnmeldung } = await import("../services/auditLog.js");

    /* Der Grund, warum hier nicht `getUserAndPlan(...).org_id` steht: die
     * Demo-Konten haben `users.org_id = NULL` bei vorhandener Mitgliedschaft
     * (gemessen 2026-08-24). getPrimaryOrg faellt korrekt zurueck — genau die
     * drei demo.login-Zeilen haetten sonst weiter org-los geschrieben. */
    const poolOhneUsersOrg = {
      query: async (sql) => (/FROM users WHERE id/.test(sql)
        ? { rows: [{ org_id: null }] }                       // users.org_id ist NULL
        : { rows: [{ org_id: "org-aus-mitgliedschaft" }] }), // aber es gibt eine Mitgliedschaft
    };
    assert.equal(await orgNachAnmeldung(poolOhneUsersOrg, "nutzer-1"), "org-aus-mitgliedschaft",
      "faellt nicht auf die Mitgliedschaft zurueck — dann bleiben genau die Demo-Logins org-los");

    // Kein Nutzer, kein Pool: keine Org. Nie raten.
    assert.equal(await orgNachAnmeldung(poolOhneUsersOrg, null), null);
    assert.equal(await orgNachAnmeldung(null, "nutzer-1"), null);

    // Ohne jede Mitgliedschaft bleibt es org-los — und das ist richtig.
    const poolOhneAlles = { query: async () => ({ rows: [] }) };
    assert.equal(await orgNachAnmeldung(poolOhneAlles, "nutzer-1"), null);

    /* Ein Audit-Detail darf NIEMALS eine Anmeldung brechen. */
    const poolKaputt = { query: async () => { throw new Error("DB weg"); } };
    assert.equal(await orgNachAnmeldung(poolKaputt, "nutzer-1"), null,
      "ein Fehler beim Aufloesen der Org darf den Login nicht mitreissen");
  });

  /*
   * DIE ZWEITE HAELFTE DER SCHREIBSEITE — die req-lose Form.
   *
   * `writeAudit(pool, {...})` kennt `req` nicht, fragt damit nie
   * `bestimmeAuditOrg()`, und wo auch kein `org_id` mitgegeben wird, bleibt es
   * NULL. Die Riegel oben halten den FALSCHEN Stempel auf; dieser hier haelt
   * den FEHLENDEN auf. Das ist derselbe Befund von seiner anderen Seite: ein
   * Teil lag in der falschen Organisation, der groessere in keiner.
   *
   * Gemessen am 2026-08-24: 34 req-lose Aufrufe in acht Route-Dateien, 30 davon
   * ohne `org_id`. Sechs Zeilen sind daraus real entstanden
   * (`user.abuse_reported`, `offer.abuse_reported`, `capacity_post.abuse_reported`,
   * 22.-24.08.) — alle aus `profileVisibility.js`, alle mit einem Melder, der
   * genau EINER Organisation angehoert. Diese Datei ist am 2026-08-24 auf
   * `writeAuditEnhanced` umgestellt und steht deshalb NICHT in der Liste unten:
   * ein Rueckfall dort faellt sofort auf.
   *
   * Die uebrigen sieben Dateien sind festgenagelt, nicht freigesprochen. Ob
   * ihre Aufrufe org-los sein DUERFEN, ist eine Owner-Entscheidung je Aufruf —
   * `internal.js` und `occ/decisionsRequests.js` laufen plausibel
   * plattformweit, `requests.js` und `capacities.js` eher nicht. Bis die
   * Entscheidung gefallen ist, haelt diese Liste den Stand fest: die Zahlen
   * duerfen sinken, nicht steigen, und keine NEUE Datei darf dazukommen.
   */
  it("keine neue Schreibstelle verliert die Organisation stillschweigend", () => {
    /*
     * JE AUFRUF ENTSCHIEDEN (Owner-Vorgabe, 2026-08-25).
     *
     * Am 2026-08-24 standen 30 req-lose Aufrufe ohne `org_id` in sieben Dateien.
     * Sie sind einzeln durchgegangen worden, nicht pauschal umgestellt:
     * 15 tragen die Org jetzt, 15 bleiben org-los — begruendet, nicht uebrig.
     *
     * ENTSCHEIDUNGSREGEL, aus `bestimmeAuditOrg` abgeleitet: `org_id` heisst
     * "die Organisation, IN DER der Handelnde gehandelt hat". Daraus folgt
     * beides. Wo ein angemeldeter Nutzer in seiner Org handelt, gehoert sie hin
     * (→ MUSS_NULL_SEIN, umgestellt auf writeAuditEnhanced). Wo es gar keinen
     * Handelnden gibt — Systemlauf, fehlgeschlagene Anmeldung — oder er als
     * Plattform handelt, waere jeder Stempel eine Behauptung (→ ORG_LOS_BEGRUENDET).
     */

    /* Hier handelt ein angemeldeter Nutzer in seiner Organisation.
     * Ein Rueckfall auf die req-lose Form ist ein Fehler, kein Stilfrage. */
    const MUSS_NULL_SEIN = [
      "routes/profileVisibility.js",  // die sechs Meldungs-Zeilen vom 22.-24.08.
      "routes/requests.js",           // Anfrage annehmen/ablehnen/finalisieren
      "routes/capacities.js",         // Kapazitaet anlegen/schalten/reservieren
      "routes/profileBounties.js",    // die Routen verlangen req.orgId ohnehin
    ];

    /*
     * Org-los ist hier die RICHTIGE Antwort. Die Zahl zaehlt ALLE req-losen
     * Aufrufe der Datei, auch die mit `org_id` — so haengt die Probe nicht an
     * einer Fenster-Heuristik, die beim naechsten Umformatieren kippt.
     *
     * internal.js (10): Cron-Summenzeilen ueber ALLE Organisationen (expired,
     *   invoiced, processed). Kein Akteur, keine einzelne Org — ein Stempel
     *   waere schlicht falsch. Die Ausnahme bestaetigt die Regel:
     *   `pilot.auto_expiry_batch` laeuft je Org und traegt org_id.
     *
     * occ/decisionsRequests.js (2): Owner-Flaeche. Der Handelnde entscheidet
     *   als Plattform UEBER einen Kunden, nicht INNERHALB von dessen Org. Ein
     *   Stempel wuerde die interne Begruendung (reason, risk_level,
     *   commercial_context) ueber die Policy `al_same_org` an genau den Kunden
     *   ausliefern, ueber den entschieden wurde. Staff liest sie ueber
     *   `al_staff_bypass` — die Sicht existiert also, nur nicht fuer den Kunden.
     *
     * auth.js (6): vier fehlgeschlagene Anmeldungen (login_failed,
     *   login_blocked_sso). Dort ist `actor_id` null — niemand hat sich
     *   angemeldet. Die Org wurde angegriffen, sie hat nicht gehandelt; org_id
     *   wuerde das Gegenteil behaupten. Die beiden Signup-Aufrufe derselben
     *   Datei tragen org_id (eigene Probe unten).
     *
     * oauth.js (1), payment.js (2): tragen org_id bereits.
     */
    const FESTGENAGELT = {
      "routes/auth.js": 6,
      "routes/internal.js": 10,
      "routes/oauth.js": 1,
      "routes/occ/decisionsRequests.js": 2,
      "routes/payment.js": 2,
    };

    /* Verzeichnis rekursiv einlesen — `routes/occ/` liegt eine Ebene tiefer. */
    const sammle = (verzeichnis) => fs.readdirSync(verzeichnis, { withFileTypes: true })
      .flatMap((e) => {
        const voll = path.join(verzeichnis, e.name);
        if (e.isDirectory()) return sammle(voll);
        return e.name.endsWith(".js") ? [voll] : [];
      });

    const gemessen = {};
    for (const datei of sammle(path.join(API, "routes"))) {
      const treffer = (fs.readFileSync(datei, "utf8").match(/writeAudit\(pool/g) || []).length;
      if (treffer > 0) {
        gemessen[normalisiere(path.relative(API, datei))] = treffer;
      }
    }

    const neue = Object.keys(gemessen).filter((d) => !(d in FESTGENAGELT));
    assert.deepEqual(neue, [],
      `neue Datei(en) mit der req-losen Form:\n  ${neue.join("\n  ")}\n\n` +
      "writeAudit(pool, {...}) kennt `req` nicht und stempelt daher keine " +
      "Organisation. In einer Route ist `req` immer da — writeAuditEnhanced(pool, req, {...}) " +
      "benutzen. Nur wenn die Zeile bewusst plattformweit ist, gehoert sie hier " +
      "hinein, mit einem Satz warum.");

    for (const [datei, erwartet] of Object.entries(FESTGENAGELT)) {
      const ist = gemessen[datei] || 0;
      assert.ok(ist <= erwartet,
        `${datei}: ${ist} req-lose writeAudit-Aufrufe, festgenagelt waren ${erwartet}. ` +
        "Jeder neue verliert die Organisation — writeAuditEnhanced(pool, req, {...}) benutzen.");
    }

    /* Die umgestellten Pfade, ausdruecklich. `undefined` heisst: die Datei kommt
     * in der Messung gar nicht mehr vor, weil sie keinen einzigen req-losen
     * Aufruf mehr hat. */
    for (const datei of MUSS_NULL_SEIN) {
      assert.equal(gemessen[datei], undefined,
        `${datei} benutzt wieder die req-lose Form writeAudit(pool, {...}). ` +
        "Dort handelt ein angemeldeter Nutzer in seiner Organisation — " +
        "writeAuditEnhanced(pool, req, {...}) benutzen. Aus genau diesem Muster " +
        "entstanden die sechs org-losen Meldungs-Zeilen vom 22.-24.08.");
    }
  });

  it("die Registrierung stempelt die gerade angelegte Organisation", () => {
    /* Die beiden auth.js-Aufrufe, die KEINE fehlgeschlagene Anmeldung sind:
     * `createOrgWithMembership` hat die Org eine Zeile vorher fuer genau diesen
     * Nutzer angelegt. `orgId` steht im Scope — ein zweiter Lookup waere hier
     * der Umweg, nicht die Sorgfalt. */
    const quelle = fs.readFileSync(path.join(API, "routes/auth.js"), "utf8");
    for (const aktion of ["pilot.activated_at_signup", "individual.direct_signup"]) {
      const muster = new RegExp(`action: "${aktion.replace(/\./g, "\\.")}"[\\s\\S]{0,400}?org_id: orgId`);
      assert.match(quelle, muster,
        `${aktion} stempelt die Organisation nicht mehr — ohne sie liegt der ` +
        "wichtigste Vorgang der Registrierung (Pilot bzw. Direktvertrag) in " +
        "keinem Org-Audit.");
    }
  });
});

/* Pfadtrenner vereinheitlichen — unter Windows liefert path.relative Backslashes,
 * und die Schluessel oben sind mit Schraegstrich geschrieben. */
function normalisiere(p) { return p.replace(/\\/g, "/"); }

/* ═══════════════════════════════════════════════════════════════════════════
 * Schicht 2 — die Abnahme gegen die echte Datenbank
 * ═══════════════════════════════════════════════════════════════════════════ */

const hatDb = Boolean(process.env.DB_HOST || process.env.DATABASE_URL);

describe("Audit-Mandantengrenze — die Abnahme", { skip: !hatDb }, () => {
  let pool = null;

  before(async () => {
    const { default: pg } = await import("pg");
    pool = new pg.Pool(
      process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : {
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 5432),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
          }
    );
  });

  after(async () => { if (pool) await pool.end(); });

  it("prueft ueberhaupt etwas — sonst ist die Abnahme wertlos", async () => {
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM audit_log");
    assert.ok(rows[0].n > 100, `nur ${rows[0].n} Audit-Zeilen — ist das die richtige Datenbank?`);
  });

  it("ABNAHME: keine Zeile traegt eine Organisation, in der ihr Akteur nie Mitglied war", async () => {
    /* Die Zahl, an der 8.1.1 gemessen wird. Sie stand am 2026-08-21 auf 139. */
    const { rows } = await pool.query(`
      SELECT al.action, count(*)::int AS n
      FROM audit_log al
      WHERE al.org_id IS NOT NULL AND al.actor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM org_memberships m
          WHERE m.user_id = al.actor_id AND m.org_id = al.org_id
        )
      GROUP BY al.action ORDER BY 2 DESC`);
    assert.deepEqual(rows, [],
      "Diese Aktionen stempeln wieder eine fremde Organisation. Die Schreibseite raet " +
      "irgendwo erneut aus dem Anfragekontext — bestimmeAuditOrg() umgangen?");
  });

  it("die Policy laesst org-lose Zeilen nicht mehr an jeden Mandanten durch", async () => {
    /*
     * `al_same_org` lautete `org_id = current_org_id() OR org_id IS NULL` und
     * zeigte damit JEDER Organisation alle org-losen Zeilen, sobald RLS die
     * Grenze ist — waehrend der Anwendungspfad (`al.org_id = $n`) sie korrekt
     * herausfiltert. Datenbank und Anwendung widersprachen sich.
     *
     * Nachgewiesen mit einer Nicht-Superuser-Rolle: mit der alten Policy sah
     * Org A 495 fremde Zeilen, mit der neuen 0.
     */
    const { rows } = await pool.query(`
      SELECT polname, pg_get_expr(polqual, polrelid) AS ausdruck
      FROM pg_policy WHERE polrelid = 'audit_log'::regclass ORDER BY polname`);
    const same = rows.find((r) => r.polname === "al_same_org");
    assert.ok(same, "die Policy al_same_org fehlt — dann gibt es keine Org-Grenze in der Datenbank");
    assert.ok(!/IS NULL/i.test(same.ausdruck),
      `al_same_org enthaelt wieder eine NULL-Ausnahme: ${same.ausdruck}\n` +
      "Damit sieht jede Organisation alle org-losen Zeilen.");
    assert.ok(rows.some((r) => r.polname === "al_staff_bypass"),
      "der Staff-Bypass fehlt — dann sieht das Staff Center die Plattformsicht nicht mehr");
  });

  it("RLS ist auf audit_log ueberhaupt aktiv", async () => {
    const { rows } = await pool.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'audit_log'::regclass");
    assert.equal(rows[0].relrowsecurity, true,
      "ohne aktives RLS ist die Policy oben ein Papiertiger");
  });

  it("jede org-lose Zeile hat einen Grund — keine faellt still hinten runter", async () => {
    /*
     * Die zweite Haelfte des Befunds. Eine Zeile darf org-los sein, wenn sie
     * keinen Akteur hat (Systemlauf) oder der Akteur keiner oder mehreren
     * Organisationen angehoert. Alles andere waere wieder eine Luecke in der
     * Nachvollziehbarkeit — der Admin, der die Zeile braucht, saehe sie nie.
     */
    const { rows } = await pool.query(`
      SELECT count(*)::int AS n FROM audit_log al
      WHERE al.org_id IS NULL
        AND al.actor_id IS NOT NULL
        AND (SELECT count(*) FROM org_memberships m WHERE m.user_id = al.actor_id) = 1`);
    assert.equal(rows[0].n, 0,
      `${rows[0].n} org-lose Zeile(n), deren Akteur genau EINER Organisation angehoert. ` +
      "Sie waeren eindeutig zuordenbar und sind in keinem Org-Audit sichtbar.\n" +
      "Bestand repariert von Migration 187 (Schritt 2) und 198; die Schreibseite " +
      "haelt es seither offen. Faellt das hier wieder auf, laesst eine Schreibstelle " +
      "die Org erneut weg — die haeufigste Ursache ist die req-lose Form " +
      "`writeAudit(pool, {...})`, die `bestimmeAuditOrg()` nie fragt.");
  });
});

if (!hatDb) {
  describe("Audit-Mandantengrenze — Hinweis", () => {
    it("die Abnahme wurde NICHT geprueft (keine Datenbank)", () => {
      console.log(
        "    ℹ Schicht 2 (fremde_org = 0, RLS-Policy, org-lose Zeilen) uebersprungen — " +
        "DB_HOST ist nicht gesetzt. Im Container laeuft sie mit."
      );
      assert.ok(true);
    });
  });
}
