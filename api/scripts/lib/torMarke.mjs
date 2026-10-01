/**
 * Die Tor-Marke — solange ein Testlauf ueber den Baum geht, fuehrt niemand
 * automatisch zusammen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eiserne Regel in docs/UEBERGABE.md: „Ein volles Tor ueber einen Baum, an dem
 * zwei schreiben, beweist nichts." Seit 2026-10-01 gibt es einen weiteren
 * Schreiber: `scripts/dev/cloud-stand-holen.sh` holt den Stand der
 * Cloud-Sitzung automatisch in den Ordner des Owners (Owner, woertlich: „und
 * auch mergen in gewissen Abständen immer wenn etwas neues im frontend zu sehen
 * wäre automatisch, damit ich lokal auch gucken kann"). Ein Zusammenfuehren
 * mitten in einem Lauf liesse die eine Haelfte der Dateien den alten und die
 * andere den neuen Stand pruefen — rot oder gruen waere dann Zufall.
 *
 * Deshalb legt jeder Lauf von `scripts/run-tests.js` fuer seine Dauer eine
 * Marke ab, und das Skript wartet, solange eine liegt. Eine Notiz „bitte nicht
 * waehrend der Tests" haette niemand gelesen; die Marke setzt sich selbst.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WO SIE LIEGT, UND WARUM DORT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Im Git-Verzeichnis (`git rev-parse --git-path tor-laeuft-<pid>`), nicht im
 * Baum: sie wird nie eingecheckt, taucht in keinem `git status` auf und gilt je
 * Arbeitsbaum (ein Worktree hat sein eigenes Git-Verzeichnis). Je Prozess eine
 * eigene Datei — laufen zwei Suiten nebeneinander, raeumt die erste beim Ende
 * nicht die Marke der zweiten weg.
 *
 * Bleibt eine liegen (Absturz, abgeschossenes Fenster), gilt sie im Skript nach
 * zwei Stunden als verwaist. Laenger dauert kein Lauf dieses Projekts.
 *
 * Alles hier ist fail-soft: ohne Git — im Container-Abbild, Pflichtschritt
 * P1-C — gibt es keine Marke, und dort liest auch niemand den Baum des Owners.
 * Ein Fehler beim Setzen oder Loeschen darf den Testlauf nie beeinflussen.
 *
 * Wer den Namen aendert, muss ihn im Skript mitaendern. Die Kopplung prueft
 * api/test/torMarke.test.js — sonst wartete das Skript auf eine Marke, die
 * niemand mehr legt, und fuehrte wieder mitten in den Lauf hinein zusammen.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export const TOR_MARKE_PRAEFIX = "tor-laeuft-";

/** Pfad der Marke fuer diesen Prozess, oder null, wenn hier kein Git ist. */
export function torMarkePfad({ cwd = process.cwd(), pid = process.pid, ausfuehren = execFileSync } = {}) {
  try {
    const roh = ausfuehren("git", ["rev-parse", "--git-path", `${TOR_MARKE_PRAEFIX}${pid}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pfad = String(roh ?? "").trim();
    // Git antwortet relativ zum Aufrufverzeichnis (aus api/: ../.git/…).
    return pfad ? resolve(cwd, pfad) : null;
  } catch {
    return null;
  }
}

/** Legt die Marke ab. Liefert den Pfad, wenn sie liegt, sonst null. */
export function setzeTorMarke(pfad, { suite = null, pid = process.pid, jetzt = new Date(), schreiben = writeFileSync } = {}) {
  if (!pfad) return null;
  try {
    schreiben(pfad, `${JSON.stringify({ suite, pid, seit: jetzt.toISOString() })}\n`);
    return pfad;
  } catch {
    return null;
  }
}

/** Raeumt die Marke weg. Fehlt sie schon, ist das kein Fehler. */
export function loescheTorMarke(pfad, { loeschen = rmSync } = {}) {
  if (!pfad) return;
  try {
    loeschen(pfad, { force: true });
  } catch {
    /* fail-soft: eine liegengebliebene Marke verfaellt im Skript nach zwei Stunden */
  }
}
