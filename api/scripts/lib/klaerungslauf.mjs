/**
 * Der Klaerungslauf — was ein nativer Abbruch WIRKLICH bedeutet.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DAS GIBT (gemessen am 2026-08-29)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `nativerAbbruch.mjs` erkennt, DASS ein Testkindprozess beim Aufraeumen starb.
 * Was es nicht sagen kann: ob die Datei in Ordnung ist. Sein Rat lautete
 * deshalb "Lauf wiederholen" — und die Wiederholung fuhr die volle Suite
 * erneut: drei Minuten fuer eine Ja/Nein-Frage.
 *
 * Am 2026-08-29 half das zweimal hintereinander nicht: `me.route.coverage.test.js`
 * brach in JEDEM Lauf ab. Nach der bisherigen Lesart ("zweimal ist kein Zufall
 * mehr") galt sie damit als Datei mit offenen Handles. Die Messung sagte etwas
 * anderes:
 *
 *   node --test --test-force-exit test/me.route.coverage.test.js
 *     -> Abbruch, Exit 3221226505 (0xC0000409)
 *   node --test              test/me.route.coverage.test.js
 *     -> 68/68 gruen, Exit 0, 1,1 Sekunden, beendet sich VON SELBST
 *
 * `process.getActiveResourcesInfo()` im Testlaeufer-Kontext: nur die beiden
 * PipeWraps der eigenen Ausgabe. Kein Timer, kein Socket, kein Worker-Thread.
 *
 * Die Datei hat also gar kein offenes Handle. Der Abbruch entsteht DURCH das
 * Flag: `--test-force-exit` ruft `process.exit()`, waehrend der Prozess ohnehin
 * schon regulaer aussteigt und dabei seine Handles schliesst. Libuv schliesst
 * dasselbe Handle ein zweites Mal — was der Assert woertlich sagt:
 *
 *     !(handle->flags & UV_HANDLE_CLOSING)
 *
 * Eine Datei ist umso anfaelliger, je SCHNELLER und SAUBERER sie endet: dann
 * fallen ihr regulaeres Ende und der erzwungene Ausstieg zusammen. Das ist die
 * Umkehrung der bisherigen Vermutung — nicht die haengende Datei trifft es,
 * sondern die vorbildliche.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS DER KLAERUNGSLAUF TUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Genau die betroffene(n) Datei(en) noch einmal — OHNE `--test-force-exit`,
 * mit Zeitlimit. Damit ist der Verdaechtige aus dem Versuch entfernt, und die
 * moeglichen Wahrheiten trennen sich sauber:
 *
 *   sauber   Datei laeuft gruen durch und beendet sich selbst
 *            -> der Abbruch war der Wettlauf mit dem Flag. Die Datei ist gut.
 *   haengt   Zeitlimit erreicht, Prozess lebte noch
 *            -> ECHTE offene Handles. Das ist der Befund, den es zu beheben gilt.
 *   rot      Datei endet mit Fehlern
 *            -> ein echter Testfehler, der im abgebrochenen Lauf unterging.
 *   abbruch  bricht auch OHNE das Flag nativ ab
 *            -> das Flag ist entlastet, die Ursache liegt in der Datei.
 *
 * Warum das automatisch laufen darf, waehrend die Voll-Wiederholung einen
 * Schalter braucht: die Wiederholung kann ein neues Handle-Leck ZUDECKEN, weil
 * der zweite Lauf den Wettlauf oft gewinnt. Der Klaerungslauf kann das nicht —
 * er nimmt das Flag WEG und macht ein Leck damit sichtbar statt unsichtbar.
 * Er schwaecht keine Zusicherung ab und ueberspringt nichts: die Datei laeuft
 * vollstaendig und real, nur ohne den erzwungenen Ausstieg.
 *
 * Kein Ersatz fuer den Volllauf: er klaert ausschliesslich die abgestuerzte
 * Datei. Alle anderen Dateien behalten das Ergebnis des Hauptlaufs.
 */

import { spawn as echterSpawn } from "node:child_process";
import { neuerScanner } from "./nativerAbbruch.mjs";

/** Voreinstellung: grosszuegig genug fuer die langsamste Einzeldatei der Suite. */
export const ZEITLIMIT_MS = 180_000;

/**
 * Reine Auswertung — ohne Prozess, damit sie pruefbar ist.
 *
 * @param {object} l
 * @param {number|null} l.status            Exitcode des Klaerungslaufs
 * @param {string|null} l.signal            Signal, falls per Signal gestorben
 * @param {boolean}     l.zeitlimitErreicht Wir haben ihn abgeschossen
 * @param {object}      l.befund            Ergebnis von scanner.beurteilen()
 * @returns {{ergebnis:"sauber"|"haengt"|"rot"|"abbruch"|"unklar", begruendung:string}}
 */
export function beurteileKlaerung({ status, signal, zeitlimitErreicht, befund }) {
  if (zeitlimitErreicht) {
    return {
      ergebnis: "haengt",
      begruendung:
        "Die Datei beendet sich ohne --test-force-exit NICHT von selbst. Sie haelt " +
        "wirklich Handles offen — das ist der eigentliche Befund.",
    };
  }
  /* Zuerst der Abbruch: bricht die Datei sogar OHNE das Flag nativ ab, liegt es
     nicht am Flag, und keine der anderen Aussagen waere ehrlich. */
  if (befund && befund.abbruch) {
    return {
      ergebnis: "abbruch",
      begruendung:
        "Die Datei bricht auch OHNE --test-force-exit nativ ab. Damit ist das Flag " +
        "entlastet und die Ursache liegt in der Datei selbst.",
    };
  }
  if (signal) {
    return {
      ergebnis: "unklar",
      begruendung: `Der Klaerungslauf starb per Signal ${signal} — das laesst keine Aussage zu.`,
    };
  }
  if (status === 0) {
    return {
      ergebnis: "sauber",
      begruendung:
        "Die Datei laeuft ohne --test-force-exit gruen durch UND beendet sich von " +
        "selbst. Der Abbruch im Hauptlauf war der Wettlauf mit dem erzwungenen " +
        "Ausstieg, kein Fehler dieser Datei.",
    };
  }
  if (typeof status === "number") {
    return {
      ergebnis: "rot",
      begruendung:
        `Die Datei endet auch ohne --test-force-exit rot (Exit ${status}). Das ist ein ` +
        "echter Testfehler, der im abgebrochenen Lauf unterging.",
    };
  }
  return { ergebnis: "unklar", begruendung: "Der Klaerungslauf lieferte keinen Status." };
}

/**
 * Faehrt die betroffenen Dateien ohne `--test-force-exit`.
 *
 * Die Ausgabe wird NICHT durchgereicht: der Hauptlauf hat seine Zeilen schon
 * gezeigt, ein zweiter voller Bericht derselben Datei wuerde den Befund nur
 * zudecken. Gescannt wird sie trotzdem — sonst bliebe ein Abbruch ohne Flag
 * unbemerkt, und genau der waere die wichtigste Nachricht.
 */
export function klaerungslauf({
  dateien,
  projektVerzeichnis,
  umgebung = process.env,
  zeitlimitMs = ZEITLIMIT_MS,
  spawnFn = echterSpawn,
  ausfuehrbar = process.execPath,
}) {
  return new Promise((fertig) => {
    const scanner = neuerScanner();
    let erledigt = false;
    let zeitlimitErreicht = false;

    const kind = spawnFn(
      ausfuehrbar,
      ["--test", "--test-reporter=tap", ...dateien],
      { cwd: projektVerzeichnis, env: umgebung, stdio: ["ignore", "pipe", "pipe"] },
    );

    /* `unref` waere falsch: der Klaerungslauf IST das Ergebnis, auf das wir
       warten. Stattdessen ein hartes Limit — und SIGKILL, weil eine Datei mit
       offenen Handles auf ein freundliches SIGTERM nicht reagieren muss. Genau
       dieser Fall ist ja der Verdacht. */
    const uhr = setTimeout(() => {
      zeitlimitErreicht = true;
      try { kind.kill("SIGKILL"); } catch { /* schon tot: dann kommt gleich close */ }
    }, zeitlimitMs);

    const beenden = (status, signal, fehler) => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(uhr);
      scanner.abschliessen();
      const befund = scanner.beurteilen();
      const urteil = fehler
        ? {
            ergebnis: "unklar",
            begruendung: `Der Klaerungslauf liess sich nicht starten: ${fehler.message}`,
          }
        : beurteileKlaerung({ status, signal, zeitlimitErreicht, befund });
      fertig({ ...urteil, status, signal, zeitlimitErreicht, befund });
    };

    kind.on("error", (e) => beenden(null, null, e));
    for (const [strom, kanal] of [[kind.stdout, "stdout"], [kind.stderr, "stderr"]]) {
      if (!strom) continue;
      strom.on("data", (chunk) => scanner.aufnehmen(chunk, kanal));
      strom.on("error", () => { /* ein toter Strom ist kein eigener Befund */ });
    }
    kind.on("close", (status, signal) => beenden(status, signal, null));
  });
}

/**
 * Welche Dateien geklaert werden muessen.
 *
 * Beide Listen des Detektors, nicht nur die eindeutige. Bei mehreren
 * Totalausfaellen kann er aus der Ausgabe nicht sagen, WELCHER davon der
 * Abbruch war — er fuehrt sie dann als `verdaechtigeDateien` und haelt sich
 * bewusst zurueck, weil Raten dort das Gefaehrlichste waere.
 *
 * Der Klaerungslauf muss sich nicht zurueckhalten: er faehrt jede Datei
 * einzeln, und einzeln ist jedes Ergebnis eindeutig. Er loest damit genau die
 * Mehrdeutigkeit auf, an der die Ausgabe scheitert.
 *
 * Gemessen am 2026-08-29: ein Lauf hatte zwei Totalausfaelle. Beide waren
 * einzeln gruen (68/68 und 7/7) und beendeten sich selbst — zwei Wettlaeufe,
 * kein einziger Fehler. Ohne diese Zeile waere ueberhaupt nichts geklaert
 * worden, ausgerechnet im Fall mit dem groessten Klaerungsbedarf.
 */
export function waehleZuKlaerende(befund) {
  if (!befund || !befund.abbruch) return [];
  return [...new Set([
    ...(befund.abgestuerzteDateien || []),
    ...(befund.verdaechtigeDateien || []),
  ])];
}

/**
 * Das Gesamturteil ueber mehrere einzeln gepruefte Dateien.
 *
 * Entlastet ist der Lauf nur, wenn JEDE Datei entlastet ist: ein "sauber"
 * neben einem "haengt" ist kein halber Freispruch. Und eine leere Liste
 * entlastet gar nichts — sonst wuerde "nichts geprueft" wie "alles in Ordnung"
 * aussehen, was der teuerste Fehler dieser ganzen Mechanik waere.
 */
export function fasseUrteileZusammen(urteile) {
  if (!Array.isArray(urteile) || !urteile.length) return { ergebnis: "unklar", urteile: [] };
  return urteile.every((u) => u && u.ergebnis === "sauber")
    ? { ergebnis: "sauber", urteile }
    : { ergebnis: "gemischt", urteile };
}

/** Der Text, den der Runner ausgibt. Getrennt, damit er pruefbar ist. */
export function formuliereKlaerung(urteil, dateien) {
  const strich = "─".repeat(78);
  const z = ["", strich, "[run-tests] KLAERUNGSLAUF (ohne --test-force-exit)", strich];
  z.push(`  Geprueft: ${dateien.join(", ")}`);
  z.push("");
  const kopf = {
    sauber: "  ERGEBNIS: die Datei ist in Ordnung.",
    haengt: "  ERGEBNIS: die Datei haelt Handles offen — echter Befund.",
    rot: "  ERGEBNIS: echter Testfehler.",
    abbruch: "  ERGEBNIS: nativer Abbruch auch ohne das Flag.",
    unklar: "  ERGEBNIS: unklar.",
  }[urteil.ergebnis] || "  ERGEBNIS: unklar.";
  z.push(kopf);
  z.push(`  ${urteil.begruendung}`);
  z.push("");
  if (urteil.ergebnis === "sauber") {
    z.push("  Der Hauptlauf zaehlt damit als aussagekraeftig: die abgebrochene Datei ist");
    z.push("  vollstaendig und gruen gelaufen, nur eben ohne den erzwungenen Ausstieg.");
  } else {
    z.push("  Der Lauf bleibt rot. Diese Datei gehoert untersucht, bevor etwas anderes");
    z.push("  beurteilt wird.");
  }
  z.push(strich, "");
  return z.join("\n");
}
