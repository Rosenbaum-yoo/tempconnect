/**
 * ═══════════════════════════════════════════════════════════════════════════
 * reputationSql — die EINE Antwort auf "Organisation → Reputation"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Das Modul ist entstanden, weil NEUN Abfragen in `vendorPoolService.js`
 * `supplier_reputation.supplier_id` (ein NUTZER, per Fremdschluessel) gegen
 * `vendor_pool.supplier_org_id` (eine ORGANISATION, per Fremdschluessel)
 * verbunden haben. Ein LEFT JOIN, der nie trifft: kein Fehler, nur lauter NULL.
 * Die ganze Lieferantenverwaltung zeigte keine Reputation.
 *
 * Diese Datei prueft den Baustein selbst — DB-frei, also ueberall gruen oder rot.
 * Dass er an echten Daten TRIFFT (und die alte Form nicht), steht in
 * test/integration/lieferantAkteUndVerlauf.flow.test.js.
 *
 * Run: node --test --test-force-exit test/reputationSql.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsLiterale } from "./lib/sqlScanner.mjs";
import { reputationJoinSql, anbieterOrganisationSql, EIGENTUEMER_ROLLE }
  from "../services/reputationSql.js";

describe("reputationSql — der Weg von der Organisation zur Reputation", () => {
  it("verbindet ueber den Eigentuemer, nicht direkt", () => {
    const sql = reputationJoinSql("vp.supplier_org_id");
    /* Die drei Bestandteile sind der ganze Inhalt: Bruecke, Rolle, Bindung. */
    assert.match(sql, /LEFT JOIN LATERAL/);
    assert.match(sql, /FROM org_memberships srom_m/);
    assert.match(sql, /srom_m\.org_id = vp\.supplier_org_id/);
    assert.match(sql, /srom_m\.role_key = 'owner'/);
    assert.match(sql, /\) srom ON TRUE/);
    assert.match(sql, /LEFT JOIN supplier_reputation sr/);
    assert.match(sql, /sr\.supplier_id = srom\.user_id/);
  });

  it("liefert HOECHSTENS EINE Zeile je Organisation — sonst vervielfacht sie", () => {
    /*
     * Z17 (2026-09-28): der wichtigste Satz dieser Datei, und er fehlte.
     *
     * `org_memberships` kann mehrere Eigentuemer je Organisation fuehren
     * (gemessen: 200 Organisationen mit Eigentuemer, eine davon mit zwei). Ein
     * gewoehnlicher LEFT JOIN vervielfacht dann JEDE Zeile der umgebenden
     * Abfrage. Gegenprobe an der laufenden Datenbank: die alte Form gab fuer
     * diese eine Organisation 2 Zeilen und ueber alle Organisationen 2859 statt
     * 2858, die neue Form genau 2858. In `getVendorPool` verdeckte ein
     * `DISTINCT ON` den Fehler; an drei anderen Stellen in `vendorPoolService`
     * gibt es keins — dort waere ein Lieferant doppelt in der Liste erschienen.
     *
     * Beides ist Pflicht und keines genuegt allein: LIMIT 1 macht die Zeile
     * EINDEUTIG, ORDER BY macht sie DIESELBE. Ohne Ordnung waehlt die Datenbank
     * frei, und dieselbe Abfrage koennte morgen eine andere Reputation zeigen —
     * ein Fehler, der sich nicht nachstellen laesst.
     */
    const sql = reputationJoinSql("vp.supplier_org_id");
    assert.match(sql, /LIMIT 1/, "ohne LIMIT 1 vervielfacht die Bruecke bei mehreren Eigentuemern");
    assert.match(sql, /ORDER BY srom_m\.created_at ASC, srom_m\.user_id ASC/,
      "ohne feste Ordnung ist die gewaehlte Zeile zufaellig");
    /* Und die alte, vervielfachende Form darf nicht zurueckkehren. Die Probe
       davor belegt, dass der Gegenstand ueberhaupt da ist — sonst waere dieses
       `false` leer gruen. */
    assert.equal(/LEFT JOIN org_memberships srom\s+ON/.test(sql), false,
      "der unbegrenzte Join ist zurueck");
  });

  it("fragt is_active — ein Ausgeschiedener traegt die Firma nicht mehr", () => {
    /* Die Spalte ist NOT NULL und wurde nicht gefragt. Heute aendert das kein
       Ergebnis (gemessen: alle 201 Eigentuemer-Mitgliedschaften sind aktiv) —
       genau deshalb war jetzt der richtige Zeitpunkt dafuer. */
    assert.match(reputationJoinSql("vp.supplier_org_id"), /srom_m\.is_active = TRUE/);
  });

  it("verbindet NICHT die Org-Kennung mit supplier_id — das war der Fehler", () => {
    const sql = reputationJoinSql("vp.supplier_org_id");
    assert.equal(/sr\.supplier_id = vp\.supplier_org_id/.test(sql), false,
      "der Baustein erzeugt genau die Verbindung, die er ersetzen soll");
  });

  it("die Rolle steht an EINER Stelle", () => {
    /* Wird im Rechtemodell die Rolle umbenannt, faellt es hier auf und nicht in
       neun Abfragen. */
    assert.equal(EIGENTUEMER_ROLLE, "owner");
    assert.ok(reputationJoinSql("x.org_id").includes("'" + EIGENTUEMER_ROLLE + "'"));
  });

  it("nimmt einen einfachen Spaltennamen ohne Alias", () => {
    /* Z17: der innere Alias heisst `srom_m` (die Unterabfrage), der aeussere
       `srom` (ihr Ergebnis). Die Spalte wird INNEN verglichen. */
    assert.match(reputationJoinSql("org_id"), /srom_m\.org_id = org_id/);
  });

  it("die Aliasse sind waehlbar, damit eine Abfrage sie nicht doppelt belegt", () => {
    const sql = reputationJoinSql("vp.supplier_org_id", { alias: "rep", brueckenAlias: "mit" });
    assert.match(sql, /FROM org_memberships mit_m/);
    assert.match(sql, /\) mit ON TRUE/);
    assert.match(sql, /LEFT JOIN supplier_reputation rep/);
    assert.match(sql, /rep\.supplier_id = mit\.user_id/);
    /* Der innere Alias haengt am aeusseren: waeren beide gleich, verdeckte der
       Unterabfrage-Name den aeusseren und `rep.supplier_id = mit.user_id`
       griffe auf die falsche Ebene. */
    assert.equal(sql.includes(" mit_m ON TRUE"), false);
  });

  it("weist zurueck, was in SQL nichts zu suchen hat", () => {
    /* Der Rueckgabewert geht UNVERAENDERT in eine Abfrage. Ohne diese Schranke
       waere der Baustein ein Einfallstor — dieselbe Vorsicht wie in
       `bindungSql` und `koepfeFormel`. */
    for (const boese of ["vp.org_id; DROP TABLE users", "vp.org_id --", "(SELECT 1)",
                          "vp.org_id OR 1=1", "a.b.c", "", " "]) {
      assert.throws(() => reputationJoinSql(boese), /REPUTATION_SPALTE_UNGUELTIG/,
        "durchgelassen: " + JSON.stringify(boese));
    }
    for (const boeseAlias of ["sr; DROP", "sr-1", "", "sr.x"]) {
      assert.throws(() => reputationJoinSql("vp.org_id", { alias: boeseAlias }),
        /REPUTATION_ALIAS_UNGUELTIG/, "Alias durchgelassen: " + JSON.stringify(boeseAlias));
    }
  });

  it("weist eine Alias-Kollision zurueck — sonst waere die Abfrage unlesbar kaputt", () => {
    assert.throws(() => reputationJoinSql("vp.org_id", { alias: "x", brueckenAlias: "x" }),
      /REPUTATION_ALIAS_KOLLISION/);
  });

  it("traegt die Kennzahlen auf Verlangen MIT — an derselben Bruecke", () => {
    /*
     * HIER STAND DAS GEGENTEIL, UND ES WAR FALSCH (Paragraph 0.9, dokumentierter
     * Ausnahmefall: die Probe kodierte einen Bug als Soll).
     *
     * Der Test hiess "der Baustein nennt supplier_metrics NICHT" und begruendete
     * das mit: "`supplier_metrics.agency_id` zeigt selbst auf `organizations` ...
     * wer diese Joins mitkorrigiert, bricht sie." Gemessen am 2026-09-28 gegen
     * die laufende Datenbank:
     *
     *     supplier_metrics | FOREIGN KEY (agency_id) REFERENCES users(id)
     *
     * und der Schreiber bestaetigt es: `recomputeForWindow` holt seine Schluessel
     * aus `SELECT DISTINCT receiver_id FROM requests`, und `requests.receiver_id`
     * zeigt ebenfalls auf `users(id)`. Die Behauptung war nie gemessen, und sie
     * hat SECHS falsche Leser geschuetzt — vier in `vendorPoolService` (die Zeile
     * direkt unter dieser Bruecke), einen in `routes/matching.js`, und einen im
     * Z5-Fix von `instantMatchService` selbst, der auf dieses Wort hin geschrieben
     * wurde.
     *
     * Gestrichen wird die Aussage, nicht die Pruefung: der Baustein muss die
     * Kennzahlen jetzt TRAGEN, und zwar an demselben Brueckenknoten. Ein zweiter
     * `org_memberships`-Join fuer dieselbe Organisation waere derselbe Umweg noch
     * einmal — und wuerde wieder vervielfachen.
     */
    const ohne = reputationJoinSql("vp.supplier_org_id");
    assert.equal(ohne.includes("supplier_metrics"), false,
      "ohne Verlangen bleibt der Baustein, was er war (rueckwaerts-vertraeglich)");

    const mit = reputationJoinSql("vp.supplier_org_id", { kennzahlen: { alias: "sm", fensterTage: 30 } });
    assert.match(mit, /LEFT JOIN supplier_metrics sm/);
    /* Die Bindung ist der ganze Befund: an den NUTZER, nicht an die Organisation. */
    assert.match(mit, /sm\.agency_id = srom\.user_id/);
    assert.match(mit, /sm\.window_days = 30/);
    /* Und genau die falsche Bindung darf nicht wiederkehren. Der Gegenstand ist
       durch die Zusicherung darueber belegt — sonst waere dies leer gruen. */
    assert.ok(mit.includes("sm.agency_id"), "Gegenstand fehlt, die Probe waere leer gruen");
    assert.equal(/sm\.agency_id = (vp\.supplier_org_id|srom_m?\.org_id|o\.id)/.test(mit), false,
      "die Kennzahlen haengen wieder an einer Org-Kennung");
    /* EIN Brueckenknoten, nicht zwei. */
    assert.equal((mit.match(/LEFT JOIN LATERAL/g) || []).length, 1);
  });

  it("das Fenster geht nur als Zahl in den Text", () => {
    /* Auch dieser Wert wird unveraendert zu SQL. `fensterTage` kam bisher aus dem
       Code, aber ein Baustein, der sich auf den Aufrufer verlaesst, ist genau die
       Stelle, an der spaeter ein Anfrageparameter landet. */
    for (const boese of ["30 OR 1=1", "30; DROP TABLE users", "", 0, -1, 1.5, NaN, true, [], {}]) {
      assert.throws(() => reputationJoinSql("vp.org_id", { kennzahlen: { fensterTage: boese } }),
        /REPUTATION_FENSTER_UNGUELTIG/, "durchgelassen: " + JSON.stringify(boese));
    }
    assert.match(reputationJoinSql("vp.org_id", { kennzahlen: { fensterTage: 90 } }),
      /window_days = 90/);
    /*
     * `null` und `undefined` sind ABSICHTLICH kein Fehler, sondern "nicht
     * angegeben" — `?? 30` faengt beide. Eine erste Fassung dieser Probe
     * verlangte auch dafuer einen Wurf und war damit selbst falsch; sie ist
     * nicht entschaerft, sondern richtiggestellt worden. Der Unterschied ist
     * wesentlich: die Vorgabe ist eine Zusage, und eine Zusage gehoert geprueft,
     * nicht bloss ausgelassen.
     */
    for (const fehlt of [null, undefined]) {
      assert.match(reputationJoinSql("vp.org_id", { kennzahlen: { fensterTage: fehlt } }),
        /window_days = 30/, "Vorgabe greift nicht bei " + JSON.stringify(fehlt));
    }
    assert.match(reputationJoinSql("vp.org_id", { kennzahlen: {} }), /window_days = 30/);
  });

  it("weist eine Kollision des Kennzahlen-Alias zurueck", () => {
    for (const boese of ["sr", "srom"]) {
      assert.throws(() => reputationJoinSql("vp.org_id", { kennzahlen: { alias: boese } }),
        /REPUTATION_ALIAS_KOLLISION/, "Kollision durchgelassen: " + boese);
    }
    assert.throws(() => reputationJoinSql("vp.org_id", { kennzahlen: { alias: "sm; DROP" } }),
      /REPUTATION_ALIAS_UNGUELTIG/);
  });

  it("die Rolle im Text kommt aus der Konstante, nicht aus einem zweiten Literal", () => {
    /*
     * DIESE PROBE SIEHT IN DEN QUELLTEXT, UND SIE MUSS ES.
     *
     * Der erzeugte Text sagt es nicht: solange EIGENTUEMER_ROLLE den Wert
     * "owner" hat, ergibt `role_key = '${EIGENTUEMER_ROLLE}'` und ein fest
     * eingetragenes `role_key = 'owner'` BUCHSTABLICH dasselbe SQL. Eine
     * Zusicherung ueber das Ergebnis ist hier tautologisch — sie kann die
     * Rueckmutation nicht fangen, und genau das hat der Rueckmutationslauf am
     * 2026-09-28 gezeigt (der einzige Ueberlebende von 22).
     *
     * Der Gegenstand ist also der Quelltext, nicht die Ausgabe, und die Probe
     * gehoert dorthin, wo ihr Gegenstand liegt. Sie ist damit bruechig gegenueber
     * einem Umzug der Datei — deshalb faellt sie mit einer klaren Ansage aus,
     * statt still gruen zu werden, wenn sie die Datei nicht findet.
     *
     * Was auf dem Spiel steht: ein Umbenennen der Eigentuemer-Rolle im
     * Rechtemodell wuerde die Konstante aendern und vier Abfragen auf dem alten
     * Wert stehen lassen — lautlos, weil ein LEFT JOIN mit falscher Rolle nicht
     * wirft, sondern NULL liefert. Das ist dieselbe Klasse Fehler, die diese
     * ganze Welle ausgemacht hat.
     */
    const quelle = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "services", "reputationSql.js"),
      "utf8"
    );
    assert.ok(quelle.length > 500, "reputationSql.js nicht gefunden — die Probe prueft nichts");
    assert.match(quelle, /role_key = '\$\{EIGENTUEMER_ROLLE\}'/,
      "die Vorlage setzt die Konstante nicht ein");

    /*
     * NUR DIE VORLAGEN, NICHT DIE KOMMENTARE.
     *
     * Eine erste Fassung durchsuchte den rohen Quelltext — und wurde prompt rot
     * wegen ZWEI Stellen, die beide in Kommentaren stehen und dort genau diesen
     * Fehler BESCHREIBEN. Dieselbe Falle ist in dieser Welle schon zweimal
     * zugeschnappt (`migrationenGegenBestand`, `sqlSchemaWaechter`): eine Probe,
     * die Dokumentation fuer Code haelt, macht gruendliche Kommentare zur
     * Belastung. `jsLiterale()` ueberspringt Kommentare — dafuer ist es da.
     */
    const literale = jsLiterale(quelle).map((l) => l.text).join("\n");
    assert.ok(literale.includes("role_key ="), "keine Vorlage gefunden — die Probe prueft nichts");
    assert.equal(/role_key = 'owner'/.test(literale), false,
      "'owner' steht wieder als Literal in einer Vorlage — ein Umbenennen wuerde sie uebergehen");

    /* Und die Wirkung daneben: in BEIDEN Richtungen kommt die Rolle an. */
    assert.ok(reputationJoinSql("x.org_id").includes("role_key = '" + EIGENTUEMER_ROLLE + "'"));
    assert.ok(anbieterOrganisationSql("x.user_id").includes("role_key = '" + EIGENTUEMER_ROLLE + "'"));
  });
});
