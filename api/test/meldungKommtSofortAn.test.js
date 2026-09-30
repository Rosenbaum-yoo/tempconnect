import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/*
 * DIE ARBEITER-MELDUNG WARTETE DARAUF, DASS JEMAND NEU LAEDT.
 *
 * BEFUND (2026-08-24): Der SSE-Strom `GET /api/notifications/stream` existiert
 * und ist in app.js montiert. Welle G4 hat ihm einen Aufrufer gegeben —
 * `dispatch()` in notificationMatrix.js. `notifyWorker` schreibt aber DIREKT in
 * `notifications` und geht an `dispatch` vorbei: JEDE Arbeiter-Meldung (neue
 * Zuweisung, Erinnerung, Verfall) landete in der Tabelle und blieb dort liegen.
 *
 * Und die zweite Haelfte: das Einsatzportal hat den Strom nie abonniert und
 * auch nicht gepollt. `loadUnreadCount()` lief genau einmal beim Laden der
 * Seite, danach nur nach einer Nutzeraktion.
 *
 * ZUSAMMEN war das bei der 4-Stunden-Frist (Migration 193) der Unterschied
 * zwischen einer Frist und einer Falle: die Erinnerung nach zwei Stunden
 * erreichte einen Arbeiter faktisch erst, wenn er ohnehin hineinsah — die Uhr
 * lief trotzdem.
 *
 * Es ist dieselbe Luecke wie in G4, eine Ebene weiter: ein Zustellweg, der
 * gebaut ist, montiert ist und den niemand benutzt.
 */

const dienst = fs.readFileSync(
  new URL("../services/workerNotificationService.js", import.meta.url), "utf8");
const schale = fs.readFileSync(
  new URL("../../frontend/public/js/workerPortal/portalShell.js", import.meta.url), "utf8");

/* Im API-Container ist `frontend/` nicht gemountet — dieselbe Weiche wie in
 * benachrichtigungsSpiegel, sonst stuerzt die Datei beim Laden mit ENOENT ab
 * statt sauber zu ueberspringen. */
const schaleDa = fs.existsSync(
  new URL("../../frontend/public/js/workerPortal/portalShell.js", import.meta.url));

/*
 * Eine Verbindung oeffnen UND schliessen koennen.
 *
 * Der Strom haengt an jede Verbindung einen 30-Sekunden-Heartbeat
 * (`setInterval`, notificationStream.js:40) und raeumt ihn erst in
 * `req.on("close")` weg. Ein Test, der nur oeffnet, haelt damit den
 * Node-Prozess offen — beim ersten Anlauf lief er in den Timeout statt
 * durchzufallen. Der falsche Schluss waere gewesen, den Test mit
 * `--test-force-exit` zu erschlagen; richtig ist, sich wie ein Browser zu
 * verhalten und die Verbindung zu beenden.
 */
function verbindung(userId) {
  const geschrieben = [];
  let schliessen = () => {};
  const res = { setHeader() {}, flushHeaders() {}, write(d) { geschrieben.push(String(d)); }, end() {} };
  const req = { session: { userId }, on(ereignis, fn) { if (ereignis === "close") schliessen = fn; } };
  return { geschrieben, res, req, schliesse: () => schliessen() };
}

/** Spion-Pool, der die INSERT-Antwort steuert. */
function spion(zeile) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params: params || [] });
      if (/INSERT INTO notifications/.test(String(sql))) {
        return { rows: zeile ? [zeile] : [], rowCount: zeile ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const ARBEITER = "1a02742a-0000-0000-0000-000000000001";
const ZEILE = { id: "n-1", user_id: ARBEITER, type: "worker_assignment_reminder", title: "x" };

describe("Arbeiter-Meldung — sie geht sofort raus, nicht erst beim Neuladen", () => {
  it("notifyWorker schickt die erzeugte Zeile in den Strom", async () => {
    const { notifyWorker } = await import("../services/workerNotificationService.js");
    const strom = await import("../routes/notificationStream.js");

    /* Eine echte Verbindung registrieren, wie der Browser sie haette — dann
     * misst die Probe die Zustellung und nicht einen Mock. */
    const v = verbindung(ARBEITER);
    const router = strom.createNotificationStreamRouter({
      pool: spion(null), requireAuth: (_q, _s, n) => n(), logger: { info() {}, warn() {} },
    });
    const schicht = router.stack.find((x) => x.route?.path === "/notifications/stream");
    schicht.route.stack[schicht.route.stack.length - 1].handle(v.req, v.res);
    v.geschrieben.length = 0;   // die Begruessung interessiert hier nicht

    await notifyWorker(spion(ZEILE), {
      workerUserId: ARBEITER, type: "worker_assignment_reminder",
      title: "Erinnerung", message: "Ihre Antwort steht aus",
      entityType: "worker_assignment_link", entityId: "l-1",
    });
    const geschrieben = v.geschrieben;
    v.schliesse();

    assert.equal(geschrieben.length, 1,
      "Die Meldung muss sofort ueber den Strom gehen. Ohne sie wartet sie darauf, " +
      "dass jemand das Portal neu laedt — bei einer 4-Stunden-Frist ist das " +
      "dasselbe wie keine Erinnerung.");
    assert.match(geschrieben[0], /^event: notification/);
  });

  it("greift die Entdopplung, wird NICHTS geschickt", async () => {
    /* Der INSERT hat `WHERE NOT EXISTS (... binnen einer Stunde)`. Trifft er
     * nichts, gibt es auch nichts zu melden — sonst zaehlt das Portal eine
     * Meldung hoch, die es gar nicht gibt. */
    const { notifyWorker } = await import("../services/workerNotificationService.js");
    const strom = await import("../routes/notificationStream.js");
    const v = verbindung(ARBEITER);
    const router = strom.createNotificationStreamRouter({
      pool: spion(null), requireAuth: (_q, _s, n) => n(), logger: { info() {}, warn() {} },
    });
    const schicht = router.stack.find((x) => x.route?.path === "/notifications/stream");
    schicht.route.stack[schicht.route.stack.length - 1].handle(v.req, v.res);
    v.geschrieben.length = 0;

    await notifyWorker(spion(null), {          // INSERT trifft nichts
      workerUserId: ARBEITER, type: "worker_assignment_reminder",
      title: "Erinnerung", entityType: "worker_assignment_link", entityId: "l-1",
    });
    const anzahl = v.geschrieben.length;
    v.schliesse();

    assert.equal(anzahl, 0, "ohne neue Zeile darf nichts rausgehen");
  });

  it("der Push liegt in notifyWorker, nicht in den zwoelf Faktories", () => {
    /* An der Faktory waere er eine Sorgfalt, die man vergessen kann — und dann
     * waere wieder nur die eine Meldung live, an die jemand gedacht hat. */
    const stelle = dienst.indexOf("const insertWithType");
    const ende = dienst.indexOf("export async function", stelle);
    const block = dienst.slice(stelle, ende > 0 ? ende : stelle + 4000);
    assert.match(block, /pushToUser\(workerUserId, rows\[0\]\)/,
      "der Push gehoert in die eine Stelle, durch die jede Faktory geht");
  });

  it("ein Fehler beim Push gefaehrdet die Meldung NICHT", () => {
    /* Die Zeile in der Datenbank ist die Wahrheit, der Push nur die Abkuerzung.
     * Ein Zustellweg darf das Schreiben nie zurueckrollen — auch nicht bei
     * `throwOnError`, denn der Aufrufer will die geschriebene Zeile absichern. */
    const stelle = dienst.indexOf("pushToUser(workerUserId, rows[0])");
    const umfeld = dienst.slice(stelle - 300, stelle + 300);
    assert.match(umfeld, /catch \(e\) \{[\s\S]*logger\.warn/,
      "der Push muss in einem eigenen catch liegen");
    assert.ok(!/throw/.test(umfeld.slice(umfeld.indexOf("catch"))),
      "und darf nicht weiterwerfen");
  });

  it("S: die Probe wuerde die alte, stumme Fassung bemerken", () => {
    const alt = "await pool.query(`INSERT INTO notifications ...`, [...]);";
    assert.ok(!/pushToUser/.test(alt),
      "die alte Fassung schrieb nur — genau das prueft die erste Probe");
  });
});

describe("Einsatzportal — es sieht von selbst nach",
  { skip: !schaleDa && "frontend/ nicht verfuegbar (API-Container)" }, () => {
  it("die Schale abonniert den vorhandenen Strom", () => {
    /* NICHT neu gebaut: `GET /api/notifications/stream` gibt es seit G4, die
     * Hauptplattform benutzt ihn in pageShell.js. Hier wird er angeschlossen. */
    assert.match(schale, /new EventSource\('\/api\/notifications\/stream'/,
      "das Portal muss denselben Strom benutzen, nicht einen zweiten Weg");
    assert.match(schale, /starteLiveStrom\(\);/);
  });

  it("es faellt auf Polling zurueck, wenn der Strom nicht traegt", () => {
    /* Ohne Rueckfall staende ein Browser oder Proxy ohne SSE schlechter da als
     * vorher — vorher gab es wenigstens den Ladevorgang. */
    assert.match(schale, /typeof EventSource === 'undefined'/, "kein SSE => Polling");
    assert.match(schale, /_sseFehler >= 3.*startePolling\(\)|if \(_sseFehler >= 3\) \{ es\.close\(\); startePolling\(\); \}/s,
      "nach drei Fehlern aufgeben und pollen — sonst versucht der Browser es endlos");
  });

  it("bei einer Meldung wird der Zaehler NEU GELADEN, nicht hochgezaehlt", () => {
    /* Die Entdopplung in notifyWorker kann eine Meldung verwerfen, und zwei
     * offene Reiter wuerden auseinanderlaufen. Eine Abfrage ist billiger als
     * eine falsche Zahl. */
    const zuhoerer = schale.slice(schale.indexOf("es.addEventListener('notification'"));
    assert.match(zuhoerer.slice(0, 400), /loadUnreadCount\(\);/);
    assert.ok(!/badge.*\+\s*1|current \+ 1/.test(zuhoerer.slice(0, 400)),
      "nicht hochzaehlen — neu laden");
  });

  it("der Start steht im Shell-Init, nicht im Zuhoerer selbst", () => {
    /* Beim ersten Anlauf falsch platziert: der Aufruf landete IM
     * SSE-Zuhoerer — jede eingehende Meldung haette eine weitere Verbindung
     * geoeffnet. Der Syntax-Check haette das nie bemerkt. */
    const fn = schale.slice(schale.indexOf("function starteLiveStrom"),
                            schale.indexOf("function starteLiveStrom") + 1200);
    assert.ok(!/starteLiveStrom\(\);/.test(fn),
      "starteLiveStrom darf sich nicht selbst aufrufen — das oeffnet je Meldung " +
      "eine neue Verbindung");
  });
});
