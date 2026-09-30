/**
 * Diagnose-Sonde für unbehandelte Promise-Rejections (Audit-Backlog B-2).
 *
 * Der Flake in `me.route.coverage.test.js` zeigt sich NUR im vollen Suite-Lauf und nie in
 * Teilmengen. Diese Sonde hängt sich an jeden Testprozess und schreibt Quelle und
 * Stack einer unbehandelten Rejection nach stderr — mit Dateinamen, damit man sieht,
 * welcher Testprozess sie erzeugt hat.
 *
 * Nutzung (aus `api/`, Pfad als file:-URL, damit Node ihn unter Windows auflöst):
 *   NODE_OPTIONS="--import file:///C:/…/api/scripts/unhandled-rejection-probe.mjs" \
 *     node scripts/run-tests.js
 *
 * Bewusst KEIN Testfile (kein `*.test.js`) — die Sonde läuft nie automatisch mit.
 */

const label = (process.argv[1] || "unbekannt").split(/[\\/]/).pop();

process.on("unhandledRejection", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : "";
  process.stderr.write(
    [
      "",
      "╔══ UNBEHANDELTE REJECTION ══════════════════════════════",
      `║ Prozess : ${label}`,
      `║ Meldung : ${msg}`,
      ...String(stack || "")
        .split("\n")
        .slice(1, 12)
        .map((l) => `║ ${l.trim()}`),
      "╚════════════════════════════════════════════════════════",
      ""
    ].join("\n")
  );
});

process.on("uncaughtException", (err) => {
  process.stderr.write(`\n╔══ UNCAUGHT EXCEPTION in ${label}: ${err?.message}\n${err?.stack}\n`);
  /*
   * DAS HIER IST NICHT KOSMETIK (ergaenzt 2026-08-26).
   *
   * Einen `uncaughtException`-Handler zu registrieren ERSETZT Nodes
   * Standardverhalten: drucken UND mit 1 beenden. Diese Sonde druckte nur und
   * kehrte zurueck — der Prozess lief weiter und endete mit 0.
   *
   * Da `run-tests.js` die Sonde STANDARDMAESSIG anhaengt, konnte das Gate seit
   * dem 26.07. an keiner Ladefehler-Ausnahme mehr scheitern. Belegt am
   * 2026-08-26: eine Testdatei mit einem Import auf eine geloeschte Datei
   * erzeugte den lauten UNCAUGHT-EXCEPTION-Kasten — und der Lauf endete mit
   *   9828 Tests, 0 Fehlschlaege, Rueckgabewert 0.
   * Ohne Sonde endet derselbe Fall mit 1. Die Diagnose hatte die Diagnose
   * abgeschaltet.
   *
   * Eine Datei, die sich nicht laden laesst, zaehlt sonst als NULL Tests und
   * NULL Fehlschlaege: die Suite schrumpft still, und niemand sieht es an einer
   * Zahl, die ohnehin niemand auswendig kennt.
   */
  process.exitCode = 1;
});

/**
 * Exit-Code-Melder (ergänzt 2026-07-26).
 *
 * Zwei volle Läufe mit angehängter Sonde haben den Flake in
 * `me.route.coverage.test.js` erneut ausgelöst — und dabei **weder** eine unbehandelte
 * Rejection **noch** eine uncaught exception gemeldet. Die Zahlen sagen zugleich: alle 65
 * Untertests bestehen (`pass` ist im roten wie im grünen Lauf identisch, nur die Gesamtzahl
 * steigt um den synthetischen Datei-Eintrag). Wenn jeder Test besteht und trotzdem die Datei
 * als Ganzes fällt, bleibt als Mechanismus der **Prozess selbst**: ein Exit-Code ungleich 0.
 *
 * Genau den hält dieser Handler fest — samt noch offener Handles, denn ein Prozess, den
 * `--test-force-exit` abräumen muss, ist der wahrscheinlichste Kandidat dafür.
 */
process.on("exit", (code) => {
  if (code === 0 && !process.exitCode) return;
  /*
   * HIER STAND EINE HANDLE-AUFLISTUNG — UND SIE HAT DEN PROZESS ZUM ABSTURZ
   * GEBRACHT (entfernt 2026-08-27).
   *
   * Der Aufruf war `process._getActiveHandles()`: eine undokumentierte
   * Node-Interna, aufgerufen WAEHREND des Abraeumens. Unter Windows greift sie
   * dabei auf Handles zu, die bereits schliessen, und libuv bricht mit einer
   * nativen Zusicherung ab:
   *
   *   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:76
   *
   * GEMESSEN am 2026-08-27, voller Lauf, jeweils 10.000+ Tests:
   *   mit Sonde   → 2 Fehlschlaege, darunter der Absturz in me.route.coverage
   *   ohne Sonde  → 1 Fehlschlag, KEIN Absturz
   *
   * Das `try/catch` darum half nicht und konnte nicht helfen: ein libuv-Abbruch
   * ist keine JavaScript-Ausnahme, er beendet den Prozess sofort. Eine Diagnose,
   * die den Prozess umbringt, den sie beobachten soll, ist keine Diagnose.
   *
   * Aufgefallen ist es erst, als der Handler oefter lief — seit die
   * uncaughtException-Behandlung `process.exitCode = 1` setzt, greift die frueh
   * Rueckkehr eine Zeile darueber seltener. Der Fehler lag also schon vorher
   * hier, nur schlief er.
   *
   * Der Exit-Code allein beantwortet die Frage, fuer die dieser Handler gebaut
   * wurde ("faellt die Datei, obwohl alle Untertests bestehen?"). Die
   * Handle-Liste war Zusatzinformation fuer eine Untersuchung, die abgeschlossen
   * ist.
   */
  process.stderr.write(
    [
      "",
      "╔══ PROZESS ENDET MIT FEHLER-CODE ═══════════════════════",
      `║ Prozess    : ${label}`,
      `║ Exit-Code  : ${code} (process.exitCode = ${process.exitCode ?? "nicht gesetzt"})`,
      "╚════════════════════════════════════════════════════════",
      ""
    ].join("\n")
  );
});
