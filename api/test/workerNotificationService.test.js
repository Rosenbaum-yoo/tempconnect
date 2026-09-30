import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as svc from "../services/workerNotificationService.js";

describe("workerNotificationService", () => {
  it("falls back to general when notifications_type_check rejects custom type", async () => {
    const calls = [];
    let first = true;

    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (first) {
          first = false;
          const err = new Error("check violation");
          err.constraint = "notifications_type_check";
          throw err;
        }
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifySubmissionCorrectionRequested(
      pool,
      "worker-1",
      "11111111-1111-1111-1111-111111111111",
      "Bitte nachtragen"
    );

    assert.equal(calls.length, 2, "Expected retry with fallback type");
    assert.equal(calls[0].params[1], "worker_submission_correction_requested");
    assert.equal(calls[1].params[1], "general");
    assert.match(String(calls[1].params[3] || ""), /\[worker_submission_correction_requested\]/);
  });

  it("creates worker document notifications with profile deep links", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyWorkerDocumentVerified(pool, "worker-1", "doc-1", "Staplerschein");
    await svc.notifyWorkerDocumentExpiring(pool, "worker-1", "doc-2", "Aufenthaltstitel", "2026-04-10", 5);
    await svc.notifyWorkerDocumentExpired(pool, "worker-1", "doc-3", "Ausweis", "2026-04-01");

    assert.equal(calls.length, 3);
    assert.equal(calls[0].params[1], "worker_document_verified");
    assert.equal(calls[0].params[7], "/public/einsatzportal-profil.html#documents");
    assert.equal(calls[1].params[1], "worker_document_expiring");
    assert.match(String(calls[1].params[3] || ""), /5 Tagen/);
    assert.equal(calls[2].params[1], "worker_document_expired");
    assert.match(String(calls[2].params[3] || ""), /01\.04\.2026/);
  });

  it("creates staffing request notifications with portal deep links", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyStaffingRequestNew(pool, "worker-2", "invite-1", {
      title: "Lagerhelfer Nachtschicht",
      clientName: "Nordbau GmbH",
      openQuantity: 3
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].params[1], "worker_staffing_request_new");
    assert.match(String(calls[0].params[3] || ""), /Lagerhelfer Nachtschicht/);
    assert.match(String(calls[0].params[3] || ""), /Nordbau GmbH/);
    assert.match(String(calls[0].params[3] || ""), /Noch offen: 3/);
    assert.equal(calls[0].params[4], "assignment_staffing_invite");
    assert.equal(calls[0].params[5], "invite-1");
    assert.equal(calls[0].params[7], "/public/einsatzportal-benachrichtigungen.html");
  });

  it("creates staffing reminder and dispatcher question notifications", async () => {
    const calls = [];
    const pool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
    };

    await svc.notifyStaffingRequestReminder(pool, "worker-3", "invite-2", {
      title: "CNC Nachtschicht",
      deadlineLabel: "02.06.2026, 10:00"
    });
    await svc.notifyStaffingQuestionToDispatcher(pool, "dispatcher-1", "invite-2", "Anna Beispiel", "Gibt es eine Schichtzulage?");

    assert.equal(calls.length, 2);
    assert.equal(calls[0].params[1], "worker_staffing_request_reminder");
    assert.match(String(calls[0].params[3] || ""), /CNC Nachtschicht/);
    assert.match(String(calls[0].params[3] || ""), /02\.06\.2026/);
    assert.equal(calls[0].params[7], "/public/einsatzportal-benachrichtigungen.html");
    assert.equal(calls[1].params[1], "worker_staffing_request_question");
    assert.match(String(calls[1].params[3] || ""), /Anna Beispiel/);
    assert.match(String(calls[1].params[3] || ""), /Schichtzulage/);
    assert.equal(calls[1].params[7], "/public/worker-submissions-review.html");
  });
});


/*
 * DER WEG AUS DER MELDUNG HERAUS.
 *
 * BEFUND 2026-08-26: Vier Meldungen an den Arbeiter — neue Zuweisung,
 * Erinnerung, Verfall, Rueckzug — trugen `link_path` auf
 * `einsatzportal-benachrichtigungen.html`. Also auf die Liste, aus der der
 * Mensch gerade gekommen war. Er las "Ihre Antwort steht noch aus, die Anfrage
 * verfaellt am …" und musste den Einsatz danach selbst suchen, waehrend seine
 * Frist lief.
 *
 * Die Hausregel dazu steht in der CLAUDE.md: Meldungen fuehren zum konkreten
 * Ziel, nicht auf eine Uebersicht. Zwei Funktionen weiter oben in derselben
 * Datei macht der Stundenzettel es laengst richtig (`?id=<submission>`) — das
 * Muster war da, die Zuweisungen hatten es nur nie bekommen.
 *
 * Geprueft wird der WERT, der in die Datenbank geht (`params[7]` des INSERT),
 * nicht der Quelltext: `if (false && ...)` enthaelt die gesuchte Zeichenkette
 * weiterhin.
 */
describe("Arbeiter-Meldungen fuehren zum Einsatz, nicht auf eine Liste", () => {
  const NUTZER = "u-1";
  const LINK   = "wal-42";

  function mitschreibenderPool() {
    const calls = [];
    return {
      calls,
      /* rows: [] — dann faellt der Live-Strom-Zweig weg und die Probe bleibt
       * frei von Nebenwirkungen. */
      query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1, rows: [] }; }
    };
  }

  const faelle = [
    ["notifyAssignmentPendingConfirmation", (p) => svc.notifyAssignmentPendingConfirmation(p, NUTZER, LINK, "Nordbau", "26.08.2026 18:00")],
    ["notifyAssignmentReminder",            (p) => svc.notifyAssignmentReminder(p, NUTZER, LINK, "26.08.2026 18:00")],
    ["notifyAssignmentExpired",             (p) => svc.notifyAssignmentExpired(p, NUTZER, LINK, "Nordbau")],
    ["notifyAssignmentWithdrawn",           (p) => svc.notifyAssignmentWithdrawn(p, NUTZER, LINK, "Nordbau")],
  ];

  for (const [name, aufruf] of faelle) {
    it(`${name}: der Link fuehrt zum Einsatz selbst`, async () => {
      const pool = mitschreibenderPool();
      await aufruf(pool);

      const insert = pool.calls.find((c) => /INSERT INTO notifications/i.test(c.sql));
      assert.ok(insert, "kein INSERT beobachtet — greift das Muster noch?");

      const weg = insert.params[7];
      assert.ok(typeof weg === "string" && weg.length > 0,
        "ohne link_path ist die Meldung eine Sackgasse");
      assert.ok(!/einsatzportal-benachrichtigungen/.test(weg),
        "Der Link zeigt auf die Benachrichtigungsliste — also dorthin, wo der " +
        "Mensch gerade herkommt. Genau der Zustand, den dieser Abschnitt behebt.");
      assert.match(weg, new RegExp(`\\?einsatz=${LINK}$`),
        "der Link muss die Kennung DIESER Anfrage tragen, sonst oeffnet das " +
        "Portal einen fremden oder gar keinen Einsatz");
    });
  }

  it("S: die Probe wuerde einen fehlenden Parameter bemerken", async () => {
    /* Rueckmutation in Testform: ein Link ohne Kennung erfuellt die
     * Zusicherung oben nicht — sonst waere sie mit jedem beliebigen Pfad
     * zufrieden, der nur nicht die Liste ist. */
    const weg = "/public/einsatzportal-einsaetze.html";
    assert.ok(!new RegExp(`\\?einsatz=${LINK}$`).test(weg));
  });
});

/*
 * STUFE 1 AUS I3 — DIE MELDUNG VERLAESST DAS PORTAL.
 *
 * Der Arbeiter-Meldeweg hatte bis zum 26.08. genau EINEN Kanal: die Zeile im
 * Portal. Am Bestand gemessen blieben 12 von 19 Zuweisungsanfragen ohne jede
 * Antwort, und abgelehnt hat nie jemand — es wird nicht Nein gesagt, es wird
 * nicht gesehen. Die Antwortzeiten sind zweigipflig: fuenf unter einer Minute,
 * eine nach 6 Tagen, eine nach 11.
 *
 * Geprueft wird `mailAuftragFuerMeldung` — die Entscheidung, WEM WAS und OB
 * ueberhaupt. Sie ist bewusst vom Versand getrennt, damit sie ohne
 * Modul-Attrappe pruefbar ist: Pool hinein, Auftrag oder null heraus.
 */
describe("Fristgebundene Meldungen gehen zusaetzlich per E-Mail", () => {
  const NUTZER = "u-7";

  /** Pool, der seine Abfragen mitschreibt und eine feste Antwort liefert. */
  function pool(antwort) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => { calls.push({ sql, params }); return { rows: antwort ? [antwort] : [], rowCount: antwort ? 1 : 0 }; }
    };
  }

  const meldung = (over = {}) => ({
    type: "worker_assignment_reminder",
    title: "Erinnerung: Einsatz-Anfrage wartet",
    message: "Ihre Antwort steht noch aus. Die Anfrage verfaellt am 26.08.2026 18:00.",
    link_path: "/public/einsatzportal-einsaetze.html?einsatz=wal-42",
    ...over
  });

  it("eine Erinnerung erzeugt einen Mailauftrag mit Ziel und Betreff", async () => {
    const p = pool({ email: "arbeiter@example.org", erlaubt: null });
    const auftrag = await svc.mailAuftragFuerMeldung(p, NUTZER, meldung());

    assert.ok(auftrag, "ohne Auftrag bleibt die Frist eine Falle fuer den, der nicht hinsieht");
    assert.equal(auftrag.to, "arbeiter@example.org");
    assert.match(auftrag.subject, /Erinnerung/);
    assert.match(auftrag.html, /einsatz=wal-42/,
      "die Mail muss zum EINSATZ fuehren, nicht auf eine Uebersicht");
    assert.match(auftrag.text, /verfaellt am 26\.08\.2026 18:00/,
      "die Frist gehoert in die Mail — eine Frist, die man verschweigt, ist eine Falle");
  });

  it("ohne Einstellungszeile wird zugestellt — sonst erreicht Stufe 1 niemanden", async () => {
    /* Keiner der 33 Arbeiter hat je eine Benachrichtigungs-Einstellung gesetzt.
     * Waere "keine Zeile" ein Nein, waere dieser ganze Kanal wirkungslos. */
    const p = pool({ email: "arbeiter@example.org", erlaubt: null });
    assert.ok(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung()));
  });

  it("ein ausdrueckliches Nein sperrt", async () => {
    const p = pool({ email: "arbeiter@example.org", erlaubt: false });
    assert.equal(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung()), null,
      "wer widersprochen hat, bekommt keine Mail");
  });

  it("ein ausdrueckliches Ja ebenfalls zugestellt", async () => {
    const p = pool({ email: "arbeiter@example.org", erlaubt: true });
    assert.ok(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung()));
  });

  it("ohne Mailadresse passiert nichts — und es kracht nicht", async () => {
    const p = pool({ email: null, erlaubt: null });
    assert.equal(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung()), null);
  });

  it("nicht fristgebundene Typen loesen NICHT EINMAL eine Abfrage aus", async () => {
    /* Jede Arbeiter-Meldung zu mailen waere der sichere Weg, dass keine mehr
     * gelesen wird. Der Rueckzug einer Anfrage kostet den Menschen nichts,
     * wenn er ihn erst spaeter sieht. */
    for (const typ of ["worker_assignment_withdrawn", "worker_document_expiring", "worker_submission_accepted"]) {
      const p = pool({ email: "arbeiter@example.org", erlaubt: null });
      assert.equal(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung({ type: typ })), null, typ);
      assert.equal(p.calls.length, 0,
        `${typ}: es darf nicht einmal nachgesehen werden, wer der Empfaenger waere`);
    }
  });

  it("die Auswahl umfasst genau die drei Typen, bei denen eine Frist laeuft", async () => {
    const fristgebunden = [
      "worker_assignment_pending_confirmation",
      "worker_assignment_reminder",
      "worker_assignment_expired"
    ];
    for (const typ of fristgebunden) {
      const p = pool({ email: "arbeiter@example.org", erlaubt: null });
      assert.ok(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung({ type: typ })),
        `${typ} traegt eine Frist und muss zugestellt werden`);
    }
  });

  it("fremder Text landet nicht roh im HTML", async () => {
    /* `clientName` kommt aus Kundendaten und wandert in den Meldungstext. */
    const p = pool({ email: "arbeiter@example.org", erlaubt: null });
    const auftrag = await svc.mailAuftragFuerMeldung(
      p, NUTZER, meldung({ message: 'Einsatz bei <script>alert("x")</script> GmbH' }));
    assert.ok(!/<script>/.test(auftrag.html), "XSS im Postfach ist auch XSS");
    assert.match(auftrag.html, /&lt;script&gt;/);
  });

  it("ohne Ziel-Link faellt die Mail auf die Startadresse zurueck, nicht auf 'undefined'", async () => {
    const p = pool({ email: "arbeiter@example.org", erlaubt: null });
    const auftrag = await svc.mailAuftragFuerMeldung(p, NUTZER, meldung({ link_path: null }));
    assert.ok(!/undefined|null/.test(auftrag.text), auftrag.text);
  });

  it("S: die Proben wuerden einen Stummel bemerken", async () => {
    /* Gaebe `mailAuftragFuerMeldung` immer einen Auftrag zurueck, blieben die
     * verneinenden Proben oben gruen — diese hier nicht. */
    const p = pool(null);   // kein Nutzer gefunden
    assert.equal(await svc.mailAuftragFuerMeldung(p, NUTZER, meldung()), null);
  });
});

/*
 * ...UND JEMAND RUFT SIE AUCH AUF.
 *
 * Die Proben darueber pruefen die Entscheidung fuer sich. Das genuegt nicht:
 * die Fehlerklasse dieser Welle heisst "gebaut, montiert — und niemand
 * benutzt es". Ein Kanal, den `notifyWorker` nie anfasst, waere gruen
 * getestet und trotzdem stumm.
 */
describe("Der Mailweg haengt wirklich am Schreibvorgang", () => {
  function poolMitZeile(zeile, empfaenger) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (/INSERT INTO notifications/i.test(sql)) return { rows: [zeile], rowCount: 1 };
        if (/FROM users u/i.test(sql)) return { rows: empfaenger ? [empfaenger] : [], rowCount: empfaenger ? 1 : 0 };
        return { rows: [], rowCount: 0 };
      }
    };
  }

  it("eine geschriebene Erinnerung schlaegt den Empfaenger nach", async () => {
    const zeile = {
      type: "worker_assignment_reminder", title: "Erinnerung", message: "Antwort steht aus",
      link_path: "/public/einsatzportal-einsaetze.html?einsatz=wal-1"
    };
    const p = poolMitZeile(zeile, { email: "a@example.org", erlaubt: null });
    await svc.notifyAssignmentReminder(p, "u-1", "wal-1", "26.08.2026 18:00");

    const nachschlag = p.calls.find((c) => /FROM users u/i.test(c.sql));
    assert.ok(nachschlag,
      "notifyWorker hat den Mailweg nicht angefasst — der Kanal waere stumm, " +
      "und die Proben darueber wuerden es nicht merken");
    assert.deepEqual(nachschlag.params, ["u-1", "einsatz"]);
  });

  it("eine NICHT fristgebundene Meldung schlaegt niemanden nach", async () => {
    const zeile = { type: "worker_assignment_withdrawn", title: "Zurueckgezogen", message: "x", link_path: null };
    const p = poolMitZeile(zeile, { email: "a@example.org", erlaubt: null });
    await svc.notifyAssignmentWithdrawn(p, "u-1", "wal-1", "Nordbau");
    assert.ok(!p.calls.some((c) => /FROM users u/i.test(c.sql)));
  });

  it("die Entdopplung greift: keine Zeile, keine Mail", async () => {
    /* `insertWithType` liefert bei einer Doppelmeldung binnen einer Stunde
     * rows: [] zurueck. Dann gibt es nichts zu schicken. */
    const p = { calls: [], query: async (sql, params) => { p.calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
    await svc.notifyAssignmentReminder(p, "u-1", "wal-1", "26.08.2026 18:00");
    assert.ok(!p.calls.some((c) => /FROM users u/i.test(c.sql)));
  });

  it("ein Fehler im Mailweg kippt den Schreibvorgang nicht", async () => {
    /* Ein Zustellweg darf das Schreiben nie gefaehrden — dieselbe Regel wie
     * beim Live-Strom. Der Aufrufer mit throwOnError sichert die geSCHRIEBENE
     * Zeile ab, nicht die Abkuerzung. */
    const p = {
      query: async (sql) => {
        if (/INSERT INTO notifications/i.test(sql)) {
          return { rows: [{ type: "worker_assignment_reminder", title: "t", message: "m", link_path: null }], rowCount: 1 };
        }
        throw new Error("Nutzer-Nachschlag kaputt");
      }
    };
    await assert.doesNotReject(
      () => svc.notifyAssignmentReminder(p, "u-1", "wal-1", "18:00", { throwOnError: true }));
  });
});
