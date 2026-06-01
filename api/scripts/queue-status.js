/**
 * TempConnect — Queue Status Inspector
 * Zeigt den aktuellen Status aller BullMQ-Queues an.
 *
 * Nutzung (im API-Container):
 *   node scripts/queue-status.js              # Alle Queues
 *   node scripts/queue-status.js --watch      # Alle 5s aktualisieren
 *   node scripts/queue-status.js --json       # JSON-Output fuer Scripting
 *   node scripts/queue-status.js --drain=email # Alle Jobs einer Queue loeschen
 */

import { Queue } from "bullmq";
import { getConnectionOpts, isQueueAvailable } from "../queue/connection.js";

const QUEUE_NAMES = ["email", "match", "capacity"];

// ── Argument-Parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isJson = args.includes("--json");
const drainArg = args.find((a) => a.startsWith("--drain="));
const drainQueue = drainArg ? drainArg.split("=")[1] : null;

// ── Verbindungs-Check ───────────────────────────────────────────────────────
if (!isQueueAvailable()) {
  console.error("REDIS_URL nicht konfiguriert — Queues nicht verfuegbar.");
  console.error("Setze REDIS_URL in .env (z.B. redis://redis:6379)");
  process.exit(1);
}

const connOpts = getConnectionOpts();

// ── Queue-Status abfragen ───────────────────────────────────────────────────
async function getQueueStatus(name) {
  const q = new Queue(name, { connection: connOpts });
  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
      q.getDelayedCount(),
      q.getPausedCount()
    ]);

    // Letzte fehlgeschlagene Jobs (max 3) fuer Debugging
    const failedJobs = await q.getFailed(0, 2);
    const recentFailures = failedJobs.map((j) => ({
      id: j.id,
      name: j.name,
      failedReason: (j.failedReason || "").slice(0, 120),
      timestamp: j.timestamp ? new Date(j.timestamp).toISOString() : null
    }));

    return { name, waiting, active, completed, failed, delayed, paused, recentFailures };
  } finally {
    await q.close();
  }
}

function getAllStatuses() {
  return Promise.all(QUEUE_NAMES.map(getQueueStatus));
}

// ── Drain-Modus ─────────────────────────────────────────────────────────────
async function drainQueueByName(name) {
  if (!QUEUE_NAMES.includes(name)) {
    console.error(`Unbekannte Queue: ${name}. Verfuegbar: ${QUEUE_NAMES.join(", ")}`);
    process.exit(1);
  }
  const q = new Queue(name, { connection: connOpts });
  try {
    await q.drain();
    console.log(`Queue '${name}' geleert (alle wartenden Jobs entfernt).`);
  } finally {
    await q.close();
  }
}

// ── Ausgabe ─────────────────────────────────────────────────────────────────
function printTable(statuses) {
  console.clear();
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║  TempConnect — Queue Status                                      ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");
  console.log("║  Queue        Waiting  Active  Completed  Failed  Delayed Paused ║");
  console.log("╠═══════════════════════════════════════════════════════════════════╣");

  for (const s of statuses) {
    const line = [
      s.name.padEnd(13),
      String(s.waiting).padStart(7),
      String(s.active).padStart(7),
      String(s.completed).padStart(10),
      String(s.failed).padStart(7),
      String(s.delayed).padStart(8),
      String(s.paused).padStart(6)
    ].join(" ");
    console.log(`║  ${line} ║`);
  }

  console.log("╚═══════════════════════════════════════════════════════════════════╝");

  // Letzte Fehler anzeigen
  const allFailures = statuses.flatMap((s) =>
    s.recentFailures.map((f) => ({ queue: s.name, ...f }))
  );
  if (allFailures.length > 0) {
    console.log("\nLetzte fehlgeschlagene Jobs:");
    for (const f of allFailures) {
      console.log(`  [${f.queue}] ${f.name} (${f.id}): ${f.failedReason}`);
    }
  }

  if (isWatch) {
    console.log(`\nAktualisierung alle 5s... (Ctrl+C zum Beenden)`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (drainQueue) {
    await drainQueueByName(drainQueue);
    process.exit(0);
  }

  if (isJson) {
    const statuses = await getAllStatuses();
    console.log(JSON.stringify(statuses, null, 2));
    process.exit(0);
  }

  if (isWatch) {
    // Watch-Modus: alle 5s aktualisieren
    const tick = async () => {
      try {
        const statuses = await getAllStatuses();
        printTable(statuses);
      } catch (err) {
        console.error("Fehler beim Abfragen:", err.message);
      }
    };
    await tick();
    setInterval(tick, 5000);
  } else {
    const statuses = await getAllStatuses();
    printTable(statuses);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Queue-Status Fehler:", err.message);
  process.exit(1);
});
