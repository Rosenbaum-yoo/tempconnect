import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  KUNDEN_FALLARTEN,
  eroeffneSupportFall,
  holeEigenenFall,
  listeEigeneFaelle,
} from "../services/supportIntakeService.js";
import { createSupportIntakeRouter } from "../routes/supportIntake.js";

/*
 * DER WEG HINEIN — Abschnitt 10, Stufe 3 des Trichters.
 *
 * BEFUND, der das ausgeloest hat: `support_cases` hatte im GESAMTEN Repo kein
 * einziges `INSERT`. Warteschlangen, Fallarten, SLA-Fristen, Eskalationen,
 * Wissensdatenbank, Qualitaetskennzahlen — und kein Weg, einen Fall entstehen zu
 * lassen. Das Support Center war ein Lesesaal ueber einer Tabelle, die niemand
 * fuellen konnte. Der Plan verlangt "dann erst eine Anfrage ins Support Center";
 * ohne Eingang waere diese dritte Stufe ein toter Knopf gewesen.
 */

const NUTZER = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";
const FALL = "33333333-3333-3333-3333-333333333333";

/** Spion-Pool mit Transaktions-Client; zeichnet SQL und Parameter auf. */
function spion(antworten) {
  const calls = [];
  let i = 0;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      const a = antworten[i] ?? { rows: [], rowCount: 0 };
      i += 1;
      return a;
    },
    release: () => {},
  };
  return {
    calls,
    connect: async () => client,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      const a = antworten[i] ?? { rows: [], rowCount: 0 };
      i += 1;
      return a;
    },
  };
}

const QUEUE = (extra = {}) => ({
  rows: [{ id: "queue-1", type: "general", sla_first_response_h: 8, sla_resolution_h: 48, ...extra }],
  rowCount: 1,
});
const ANGELEGT = {
  rows: [{ id: FALL, case_number: "SC-2026-00001", subject: "Test", status: "new", case_type: "general" }],
  rowCount: 1,
};

/** BEGIN, Queue-Suche, INSERT case, INSERT event, COMMIT. */
const glatterLauf = (queue = QUEUE()) => spion([
  { rows: [], rowCount: 0 },
  queue,
  ANGELEGT,
  { rows: [], rowCount: 0 },
  { rows: [], rowCount: 0 },
]);

const argumente = (extra = {}) => ({
  reporterUserId: NUTZER,
  reporterOrgId: ORG,
  subject: "Ich komme nicht in mein Konto",
  description: "Seit heute Morgen werde ich nach der Anmeldung sofort wieder abgemeldet.",
  caseType: "general",
  ...extra,
});

describe("Support-Eingang — ein Fall ohne Warteschlange darf nicht entstehen", () => {
  /*
   * DIE WICHTIGSTE ZUSICHERUNG DIESER DATEI.
   *
   * `api/routes/support.js:164-167` schneidet die Agentensicht mit
   * `queue_id::text = ANY($n::text[])` zu. Ein Fall mit `queue_id = NULL` ist
   * damit fuer JEDEN Agenten mit gesetzten `allowed_queues` unsichtbar.
   *
   * Der bequeme Weg waere gewesen, den Fall trotzdem anzulegen — "Hauptsache
   * die Nachricht geht nicht verloren". Das Gegenteil ist der Fall: der Kunde
   * haelt eine Bestaetigung mit Fallnummer in der Hand und glaubt, er sei
   * gehoert worden, waehrend niemand den Fall je sehen wird. Eine angenommene
   * Nachricht, die niemand liest, ist schlimmer als eine abgelehnte.
   */

  it("ohne aktive Warteschlange wird ABGEWIESEN, nicht verwaist angelegt", async () => {
    const pool = spion([
      { rows: [], rowCount: 0 },   // BEGIN
      { rows: [], rowCount: 0 },   // Queue-Suche: nichts
      { rows: [], rowCount: 0 },   // ROLLBACK
    ]);
    const erg = await eroeffneSupportFall(pool, argumente());

    assert.equal(erg.error, "NO_QUEUE_CONFIGURED");
    const sqls = pool.calls.map((c) => c.sql);
    assert.ok(!sqls.some((q) => /INSERT INTO support_cases/.test(q)),
      "es darf KEIN Fall ohne Warteschlange entstehen — er waere fuer jeden Agenten unsichtbar");
  });

  it("S: die Probe wuerde einen verwaisten Fall bemerken", () => {
    /* Rueckmutation. Ohne sie belegt die Probe oben nur, dass die aktuelle
     * Fassung passt — nicht, dass sie den Rueckfall SIEHT. */
    const verwaist = ["BEGIN", "SELECT id FROM support_queues", "INSERT INTO support_cases (...) VALUES (...)"];
    assert.ok(verwaist.some((q) => /INSERT INTO support_cases/.test(q)),
      "die Probe wuerde einen verwaisten Fall durchgehen lassen");
  });

  it("die Warteschlange wird NUR unter den aktiven gesucht", async () => {
    const pool = glatterLauf();
    await eroeffneSupportFall(pool, argumente());
    const suche = pool.calls.find((c) => /FROM support_queues/.test(c.sql));
    assert.match(suche.sql, /is_active\s*=\s*TRUE/,
      "eine abgeschaltete Warteschlange ist abgeschaltet, weil niemand sie liest");
  });
});

describe("Support-Eingang — die Dringlichkeit gehoert nicht dem Kunden", () => {
  /*
   * Duerfte der Kunde die Stufe setzen, waere binnen weniger Wochen jeder Fall
   * "critical" — ein Feld, das jeder selbst setzt, misst nur noch, wer es
   * gelesen hat. Die Einstufung gehoert dem Support, der alle Faelle
   * nebeneinander sieht.
   */

  it("der Fall entsteht immer mit 'normal'", async () => {
    const pool = glatterLauf();
    await eroeffneSupportFall(pool, argumente());
    const insert = pool.calls.find((c) => /INSERT INTO support_cases/.test(c.sql));
    assert.match(insert.sql, /'new',\s*'normal'/,
      "Status und Dringlichkeit stehen als Literal im SQL, nicht als Parameter");
  });

  it("eine mitgeschickte Dringlichkeit landet NICHT in den Parametern", async () => {
    const pool = glatterLauf();
    await eroeffneSupportFall(pool, { ...argumente(), priority: "critical" });
    const insert = pool.calls.find((c) => /INSERT INTO support_cases/.test(c.sql));
    assert.ok(!insert.params.includes("critical"),
      "ein Feld, das der Dienst nicht kennt, darf auch ueber einen Umweg nicht durchschlagen");
  });
});

describe("Support-Eingang — die Frist kommt aus der Warteschlange, nicht aus der Luft", () => {
  it("beide SLA-Fristen werden aus den Stunden der Warteschlange gerechnet", async () => {
    const pool = glatterLauf(QUEUE({ sla_first_response_h: 4, sla_resolution_h: 24 }));
    await eroeffneSupportFall(pool, argumente());
    const insert = pool.calls.find((c) => /INSERT INTO support_cases/.test(c.sql));
    assert.match(insert.sql, /NOW\(\) \+ \(\$\d+ \|\| ' hours'\)::interval/,
      "die Frist wird in der Datenbank gerechnet — eine in JS gerechnete Frist traegt die Zeitzone des Servers");
    assert.ok(insert.params.includes("4") && insert.params.includes("24"),
      "die Stunden der Warteschlange muessen als Parameter ankommen");
  });

  it("eine Warteschlange ohne Stunden faellt auf 24/72 zurueck statt auf NULL", async () => {
    const pool = glatterLauf(QUEUE({ sla_first_response_h: null, sla_resolution_h: null }));
    await eroeffneSupportFall(pool, argumente());
    const insert = pool.calls.find((c) => /INSERT INTO support_cases/.test(c.sql));
    assert.ok(insert.params.includes("24") && insert.params.includes("72"),
      "eine NULL-Frist waere in support.js:361 'sla_state = ok' — ein Fall ohne Frist sieht ewig gesund aus");
  });
});

describe("Support-Eingang — der Fall traegt seine Herkunft", () => {
  it("ein Ereignis haelt fest, dass ein KUNDE eroeffnet hat", async () => {
    const pool = glatterLauf();
    await eroeffneSupportFall(pool, argumente());
    const ereignis = pool.calls.find((c) => /INSERT INTO support_case_events/.test(c.sql));
    assert.ok(ereignis, "ohne Ereignis stuende im Verlauf nur 'Fall existiert'");
    assert.match(ereignis.sql, /'case_opened_by_customer'/);
    assert.match(ereignis.sql, /actor_agent_id.*\n?.*NULL|NULL,\s*'case_opened_by_customer'/,
      "es war kein Agent — `actor_agent_id` muss NULL bleiben");
  });

  it("Melder und Organisation stehen im Fall, nicht nur im Ereignis", async () => {
    const pool = glatterLauf();
    await eroeffneSupportFall(pool, argumente());
    const insert = pool.calls.find((c) => /INSERT INTO support_cases/.test(c.sql));
    assert.ok(insert.params.includes(NUTZER), "reporter_user_id fehlt");
    assert.ok(insert.params.includes(ORG), "reporter_org_id fehlt");
  });

  it("eine unbekannte Fallart wird abgewiesen, bevor irgendetwas geschrieben wird", async () => {
    const pool = glatterLauf();
    const erg = await eroeffneSupportFall(pool, argumente({ caseType: "erfunden" }));
    assert.equal(erg.error, "UNKNOWN_CASE_TYPE");
    assert.equal(pool.calls.length, 0, "es darf nicht einmal eine Transaktion begonnen werden");
  });

  it("jede Kunden-Fallart ist auch im CHECK der Migration 110 erlaubt", () => {
    /* Sonst scheitert der INSERT erst in der Datenbank — mit einem 500 statt
     * einer verstaendlichen Antwort, und der Kunde erfaehrt nie, warum. */
    const migration = fs.readFileSync(
      new URL("../../sql/migrations/110_soc_phase3_support.sql", import.meta.url), "utf8");
    const block = migration.match(/case_type\s+VARCHAR\(50\)[\s\S]*?\)\s*\)/);
    assert.ok(block, "der CHECK auf case_type wurde nicht gefunden — greift das Muster noch?");
    for (const art of KUNDEN_FALLARTEN) {
      assert.ok(block[0].includes(`'${art}'`),
        `'${art}' steht in KUNDEN_FALLARTEN, aber nicht im CHECK der Migration 110`);
    }
  });
});

describe("Support-Eingang — die Sicht des Kunden ist schmal, und die Grenze steht im SQL", () => {
  it("ein Fall wird NUR ueber Kennung UND Melder geladen", async () => {
    const pool = spion([{ rows: [{ id: FALL }], rowCount: 1 }, { rows: [], rowCount: 0 }]);
    await holeEigenenFall(pool, NUTZER, FALL);
    const laden = pool.calls[0];
    assert.match(laden.sql, /sc\.id = \$1 AND sc\.reporter_user_id = \$2/,
      "beide Bedingungen muessen in DERSELBEN Anweisung stehen — eine Pruefung in JS danach ist keine Grenze");
    assert.deepEqual(laden.params, [FALL, NUTZER]);
  });

  it("nur EXTERNE Notizen gehen an den Kunden", async () => {
    const pool = spion([{ rows: [{ id: FALL }], rowCount: 1 }, { rows: [], rowCount: 0 }]);
    await holeEigenenFall(pool, NUTZER, FALL);
    const notizen = pool.calls.find((c) => /support_case_notes/.test(c.sql));
    assert.match(notizen.sql, /note_type = 'external'/,
      "interne Notizen sind das Arbeitsmaterial der Agenten — die Grenze gehoert ins SQL, nicht in die Anzeige");
  });

  it("ein fremder Fall liefert null — kein Teiltreffer, keine Metadaten", async () => {
    const pool = spion([{ rows: [], rowCount: 0 }]);
    const fall = await holeEigenenFall(pool, NUTZER, FALL);
    assert.equal(fall, null);
    assert.equal(pool.calls.length, 1,
      "wenn der Fall nicht gehoert, darf nicht einmal nach den Notizen gefragt werden");
  });

  it("die Liste zeigt nur eigene Faelle und deckelt die Menge", async () => {
    const pool = spion([{ rows: [], rowCount: 0 }]);
    await listeEigeneFaelle(pool, NUTZER, { limit: 9999 });
    const q = pool.calls[0];
    assert.match(q.sql, /WHERE sc\.reporter_user_id = \$1/);
    assert.equal(q.params[1], 100, "eine Obergrenze, die der Aufrufer sprengen kann, ist keine");
  });

  it("die Kundensicht nennt weder Agenten noch Warteschlange noch Eskalationsziel", async () => {
    const pool = spion([{ rows: [], rowCount: 0 }]);
    await listeEigeneFaelle(pool, NUTZER);
    const sql = pool.calls[0].sql;
    for (const verboten of ["assigned_to_agent_id", "queue_id", "escalation_target", "is_escalated"]) {
      assert.ok(!sql.includes(verboten),
        `${verboten} gehoert nicht in die Kundensicht — was nicht abgefragt wird, kann nicht durchrutschen`);
    }
  });
});

describe("Support-Eingang — das Staff-Tor bleibt unangetastet", () => {
  /*
   * DER STRUKTURELLE RIEGEL. `support.js:664` setzt das Tor am PRAEFIX:
   * `router.use("/support", supportRateLimit, requireAuth, supportAuth)`. Das ist
   * die strengere Bauart — auf einer neuen Route nicht vergessbar.
   *
   * Der Eingang liegt daneben, unter `/support-requests`. Wer hier spaeter eine
   * Route unter `/support/...` anlegt, haengt sie entweder hinter das Staff-Tor
   * (dann ist sie fuer Kunden tot) oder — wenn jemand die Montage-Reihenfolge in
   * `app.js` dreht — DAVOR (dann ist das Tor durchloechert). Beides ist ein
   * Fehler, und beide sieht diese Zusicherung.
   */
  const quelle = fs.readFileSync(new URL("../routes/supportIntake.js", import.meta.url), "utf8");
  const pfade = [...quelle.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)].map((m) => m[2]);

  it("erkennt ueberhaupt Routen — sonst prueft der Riegel nichts", () => {
    assert.ok(pfade.length >= 3, `nur ${pfade.length} Routen erkannt — greift das Muster noch?`);
  });

  it("keine Route dieser Datei liegt unter dem Praefix /support/", () => {
    const drunter = pfade.filter((p) => p === "/support" || p.startsWith("/support/"));
    assert.deepEqual(drunter, [],
      "Diese Pfade lägen unter dem Staff-Tor `supportAuth` aus support.js:664. " +
      "Die Owner-Vorgabe zu Abschnitt 10 ist hart: kein Zugang fuer Unternehmen, " +
      "kein Zugang fuer Personaldienstleister. Der Kundeneingang heisst /support-requests.");
  });

  it("S: der Riegel wuerde einen Pfad unter /support/ bemerken", () => {
    const erfunden = ["/support-requests", "/support/cases"];
    assert.ok(erfunden.some((p) => p.startsWith("/support/")),
      "der Riegel wuerde einen Pfad unter dem Staff-Tor durchlassen");
    assert.ok(!"/support-requests".startsWith("/support/"),
      "der Riegel wuerde den richtigen Pfad faelschlich beanstanden");
  });

  it("das Praefix-Tor in support.js steht noch — der Riegel haengt daran", () => {
    const support = fs.readFileSync(new URL("../routes/support.js", import.meta.url), "utf8");
    assert.match(support, /router\.use\("\/support",[^)]*supportAuth\)/,
      "Wenn das Praefix-Tor faellt, ist die Begruendung dieser ganzen Datei hinfaellig — " +
      "dann gehoert der Eingang neu entschieden, nicht stillschweigend weitergefuehrt.");
  });
});

describe("Support-Trichter — die Reihenfolge ist die Entscheidung", () => {
  /*
   * Owner-Vorgabe (Plan I, Abschnitt 10): "Zuerst auf die Hilfeseite verweisen —
   * damit nicht jede Kleinigkeit im Support Center landet. Dann Telefon. Dann
   * erst eine Anfrage ins Support Center." Und woertlich: "Wer die Reihenfolge
   * umdreht, baut sich die Last selbst. Der teuerste Kanal steht zuletzt."
   *
   * Das ist keine Gestaltungsfrage, sondern eine Kostenentscheidung — und
   * deshalb wird sie hier festgehalten. Wer die Reihenfolge dreht, dreht sie
   * gegen eine Zusicherung, nicht gegen einen Geschmack.
   */
  function trichter(config = {}) {
    const router = createSupportIntakeRouter({
      pool: null, requireAuth: (_q, _s, n) => n(), logger: console, config,
    });
    const schicht = router.stack.find((s) => s.route?.path === "/support-channels");
    assert.ok(schicht, "die Route /support-channels fehlt");
    let koerper = null;
    schicht.route.stack[0].handle({}, { json: (j) => { koerper = j; } });
    return koerper.trichter;
  }

  it("Hilfe zuerst, Telefon danach, Support Center zuletzt", () => {
    const t = trichter({ SUPPORT_PHONE: "+49 30 1" });
    assert.deepEqual(t.map((s) => s.kanal), ["hilfe", "telefon", "support_center"],
      "der teuerste Kanal steht zuletzt — wer das dreht, baut sich die Last selbst");
    assert.deepEqual(t.map((s) => s.stufe), [1, 2, 3]);
  });

  it("ohne hinterlegte Nummer wird die Telefon-Stufe NICHT angeboten", () => {
    const t = trichter({});
    const telefon = t.find((s) => s.kanal === "telefon");
    assert.equal(telefon.verfuegbar, false);
    assert.equal(telefon.nummer, null,
      "eine Nummer, die niemand abnimmt, kostet den Kunden einen Anruf, bevor er zu Stufe 3 findet");
    assert.equal(telefon.zeiten, null, "Sprechzeiten ohne Nummer sind eine Zusage ohne Deckung");
  });

  it("mit hinterlegter Nummer erscheint die Stufe samt Zeiten", () => {
    const t = trichter({ SUPPORT_PHONE: " +49 30 12345678 ", SUPPORT_PHONE_HOURS: "Mo–Fr 09:00–18:00 Uhr" });
    const telefon = t.find((s) => s.kanal === "telefon");
    assert.equal(telefon.verfuegbar, true);
    assert.equal(telefon.nummer, "+49 30 12345678", "Leerzeichen am Rand duerfen nicht in ein tel:-Ziel geraten");
    assert.equal(telefon.zeiten, "Mo–Fr 09:00–18:00 Uhr");
  });

  it("Stufe 3 sagt, dass sie eine Anmeldung braucht, und nennt die Fallarten", () => {
    const t = trichter({});
    const center = t.find((s) => s.kanal === "support_center");
    assert.equal(center.benoetigtAnmeldung, true);
    assert.deepEqual(center.fallarten, KUNDEN_FALLARTEN,
      "die Auswahl im Formular kommt vom Server — sonst bietet das Frontend eine Art an, die der CHECK ablehnt");
  });

  it("der Trichter ist OHNE Anmeldung lesbar", () => {
    const router = createSupportIntakeRouter({
      pool: null, requireAuth: () => assert.fail("requireAuth darf hier nicht in der Kette stehen"),
      logger: console, config: {},
    });
    const schicht = router.stack.find((s) => s.route?.path === "/support-channels");
    assert.equal(schicht.route.stack.length, 1,
      "Wer sich gerade NICHT anmelden kann, braucht Hilfeseite und Telefonnummer am dringendsten. " +
      "Beides steht ohnehin im Impressum.");
  });
});
