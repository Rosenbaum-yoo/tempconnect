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
});
