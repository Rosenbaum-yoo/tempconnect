/**
 * Erkennt in der Ausgabe eines Testlaufs den nativen Abbruch eines
 * Testkindprozesses — und sagt, was das fuer die GUELTIGKEIT des Laufs bedeutet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WORUM ES GEHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Unter Windows stirbt sporadisch ein Testkindprozess NACH dem letzten gruenen
 * Untertest an einer nativen libuv-Zusicherung:
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file …, line 76
 *
 * Ein Handle wird waehrend des Schliessens erneut geschlossen. Ausloeser ist das
 * Zusammenspiel von `--test-force-exit` mit noch offenen Handles der Testdatei.
 * Der node:test-Bericht meldet die Datei danach als Ganzes rot ("test failed"),
 * ohne einen einzigen roten Untertest — der Prozess ist beim Aufraeumen
 * gestorben, nicht an einer Zusicherung im Test.
 *
 * Seit 2026-08-06 stand die Regel dafuer als Kommentar in `run-tests.js`:
 * taucht genau diese Zeile auf, ist der Lauf zu wiederholen und NICHT als roter
 * Test zu werten. Eine Regel im Kommentar setzt allerdings voraus, dass jemand
 * 15000 Zeilen Ausgabe nach einer Zeile durchsucht, von der er nichts weiss.
 * Genau das ist am 2026-08-22 zweimal passiert: der Lauf galt als rot, bis
 * jemand die Zeile fand. Dieses Modul ist die Regel als Code.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WARUM DIE ZUORDNUNG UEBER DEN ABSCHLUSSBLOCK LAEUFT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der erste Entwurf hat sich die abgestuerzte Datei aus der REIHENFOLGE geholt:
 * "die naechste rote Zeile nach der Signatur". Drei Messungen an Node 24.11
 * haben das erledigt:
 *
 *   1. Der spec-Reporter meldet JEDEN Fehlschlag zweimal — einmal im laufenden
 *      Strom und einmal im Block `✖ failing tests:`. Die Reihenfolge-Zuordnung
 *      zaehlte das zweite Vorkommen als eigenen, "echten" Fehler: dieselbe Datei
 *      stand danach in beiden Listen, und der Befund widersprach sich selbst.
 *   2. Rote Untertests der obersten Ebene stehen ebenfalls ohne Einrueckung
 *      (`✖ oberste Ebene faellt (1.8ms)`). Ein Muster auf "uneingerueckt" haelt
 *      also Testnamen fuer Dateinamen.
 *   3. Bei ~360 Dateien laufen die Kindprozesse nebenlaeufig. Zwischen der
 *      Abbruchzeile und der roten Zeile ihrer Datei kann die Ausgabe einer
 *      ganz anderen Datei liegen — dann waere ein echt roter Test als
 *      "ohne Befund, einfach wiederholen" weissgewaschen worden.
 *
 * Der Abschlussblock ist dagegen strukturiert und reihenfolgeunabhaengig:
 *
 *     ✖ failing tests:
 *     test at test\me.route.coverage.test.js:1:1
 *     ✖ test\me.route.coverage.test.js (6682.1556ms)
 *       'test failed'
 *
 * Die `test at`-Zeile nennt zu JEDEM Fehler seine Datei. Ein Ausfall der ganzen
 * Datei ist daran erkennbar, dass der Titel der Zeile darunter der Dateipfad
 * selbst ist und der Koerper nur `'test failed'` sagt — kein Untertest, keine
 * Zusicherung, kein Grund.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WAS ES AUSDRUECKLICH NICHT TUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es erklaert keinen Lauf fuer gruen. Ein nativer Abbruch macht das Ergebnis der
 * betroffenen Datei UNBEKANNT, nicht gut: der Prozess kann auch mitten in der
 * Datei gestorben sein, dann fehlen Untertests, die echt rot gewesen waeren.
 *
 * Und es raet nicht. Ein Totalausfall sieht gemessen EXAKT gleich aus, egal ob
 * ihn ein nativer Abbruch oder ein Wurf beim Import verursacht hat — beide
 * liefern `'test failed'`. Die Signatur ist der einzige Unterschied. Gibt es
 * MEHRERE Totalausfaelle und nur eine Signatur, sagt der Befund ausdruecklich,
 * dass die Zuordnung nicht entscheidbar ist, statt sich eine auszusuchen.
 */

import { StringDecoder } from "node:string_decoder";

/**
 * Bekannte native Abbruch-Signaturen.
 *
 * Bewusst eine kurze, ausdrueckliche Liste statt eines breiten Musters wie
 * /^Assertion failed:/. Breiter zu erkennen hiesse, kuenftig auch echte
 * Abstuerze mit unbekannter Ursache als "einfach wiederholen" abzustempeln —
 * und das ist die eine Richtung, in die dieser Detektor nicht irren darf.
 * Ein Eintrag kommt nur dazu, wenn ein gemessener Lauf ihn belegt.
 */
export const SIGNATUREN = [
  {
    id: "uv-handle-closing",
    /*
     * Anker `^` ist Absicht: die native Zusicherung schreibt ab Spalte 0.
     * Der Schwanz `, file …, line N` ist optional — die zweite Aufzeichnung im
     * Repo (docs/features/P9_…md) notiert die Zeile ohne ihn, und der Kern
     * allein ist bereits eindeutig.
     */
    muster: /^Assertion failed: !\(handle->flags & UV_HANDLE_CLOSING\)/,
    beschreibung: "libuv: Handle wird waehrend des Schliessens erneut geschlossen (Windows, Prozessende)",
  },
];

/**
 * Verdachtsmuster — nativ gestorben, aber NICHT der bekannte Wettlauf.
 *
 * Die Liste oben ist bewusst eng, damit "einfach wiederholen" nur dort steht,
 * wo es belegt ist. Die Kehrseite waere, dass jeder andere native Absturz
 * wortlos als gewoehnlicher roter Lauf durchgeht — und der naechste Mensch
 * wieder 15000 Zeilen durchsucht, diesmal nach etwas, das noch niemand benannt
 * hat. Genau der Zustand, der diese Arbeit ausgeloest hat.
 *
 * Deshalb eine zweite, breite Stufe mit einer ANDEREN Empfehlung: sie sagt
 * "hier ist ein Prozess nativ gestorben, sieh hin", nie "wiederhole einfach".
 * Sie loest auch keine Wiederholung aus. Damit kann sie nicht in die eine
 * Richtung irren, in die dieser Detektor nicht irren darf.
 */
export const VERDACHT = [
  { muster: /^Assertion failed: /, beschreibung: "native Zusicherung (unbekannt — nicht der belegte Wettlauf)" },
  { muster: /^# Fatal error in /, beschreibung: "V8: Fatal error" },
  { muster: /^FATAL ERROR: /, beschreibung: "V8: FATAL ERROR (haeufig Speicher)" },
  { muster: /^Segmentation fault/, beschreibung: "Segmentierungsfehler" },
];

/*
 * ANSI-Sequenzen entfernen, bevor irgendein Muster greift.
 *
 * `run-tests.js` setzt FORCE_COLOR=1, sobald seine eigene Ausgabe ein Terminal
 * ist — also genau in der Lage, in der dieser Detektor gebraucht wird. Der
 * spec-Reporter schreibt dann `\x1b[31m✖ datei \x1b[90m(2209ms)\x1b[39m`,
 * und jedes auf `^✖` verankerte Muster geht ins Leere. Diese eine Zeile ist der
 * Unterschied zwischen "funktioniert im Testfall" und "funktioniert im Terminal".
 */
/* Das Steuerzeichen steht als Escape-Form im Muster und nicht als rohes Byte:
 * ein unsichtbares Steuerzeichen im Quelltext ueberlebt weder Kopieren noch
 * jeden Editor, und faellt es weg, traefe die Regel [31m als gewoehnlichen
 * Text — sie schnitte dann aus Testnamen Zeichen heraus, die niemand vermisst,
 * bis ein Vergleich unerklaerlich scheitert. */
const ANSI = /\u001b\[[0-9;]*m/g;
const entfaerben = (zeile) => zeile.replace(ANSI, "");

const ABSCHLUSS_BEGINN = /^✖ failing tests:\s*$/;
const HERKUNFT = /^test at (.+?):\d+:\d+\s*$/;
const EINTRAG_TITEL = /^✖ (.+?) \(\d[\d.]*ms\)\s*$/;
const KOERPER = /^\s{2,}(\S.*)$/;
/* Ein Ausfall der GANZEN Datei: node:test nennt keinen Grund. Gemessen an
 * Node 24.11 identisch fuer nativen Abbruch und Wurf beim Import. */
const OHNE_GRUND = /^'test failed'$/;

/* Obergrenzen: ein Detektor darf bei 15000 Zeilen Ausgabe nicht unbegrenzt
 * Speicher aufbauen. Wer mehr als 500 rote Dateien hat, braucht keine Liste
 * mehr, sondern einen Kaffee. */
const MAX_TREFFER = 100;
const MAX_EINTRAEGE = 500;

/**
 * Ein zustandsbehafteter Scanner fuer den laufenden Strom.
 *
 * Chunk-Grenzen zerschneiden Zeilen — deshalb wird ein Rest zwischengehalten.
 * Und zwar JE KANAL: stdout und stderr sind zwei getrennte Pipes, ihre Chunks
 * treffen verschraenkt ein. Mit einem gemeinsamen Puffer wuerde ein
 * stderr-Schnipsel eine halbe stdout-Zeile zerreissen und beide unlesbar machen.
 */
export function neuerScanner() {
  const treffer = [];
  const verdacht = [];
  const eintraege = [];
  const reste = { stdout: "", stderr: "" };
  /*
   * Ein Dekoder je Kanal — und zwar zusaetzlich zum Zeilenrest, nicht statt
   * seiner. Der Zeilenrest faengt zerschnittene ZEILEN ab, der Dekoder
   * zerschnittene ZEICHEN. Das ist nicht dieselbe Haelfte des Problems:
   *
   *   `✖` ist drei Bytes. Faellt eine Chunk-Grenze mitten hinein, macht
   *   `chunk.toString("utf8")` aus jeder Haelfte ein Ersatzzeichen — die Zeile
   *   beginnt danach mit `���` statt mit `✖`, und `EINTRAG_TITEL` trifft nicht
   *   mehr. Gemessen am 2026-08-23 gegen dieses Modul: die abgestuerzte Datei
   *   wurde dadurch als "unabhaengig vom Abbruch rot" ausgewiesen — also genau
   *   die Aussage, die dieses Modul nie machen darf. Bei rund 2500 Chunks im
   *   Volllauf ist das kein Randfall, sondern eine Frage der Zeit.
   */
  const dekoder = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  let imAbschluss = false;
  let offen = null;

  const eintragSchliessen = () => {
    if (offen && eintraege.length < MAX_EINTRAEGE) eintraege.push(offen);
    offen = null;
  };

  const zeileLesen = (roh) => {
    const zeile = entfaerben(roh);

    for (const sig of SIGNATUREN) {
      if (sig.muster.test(zeile)) {
        if (treffer.length < MAX_TREFFER) {
          treffer.push({ id: sig.id, zeile: zeile.trimEnd(), beschreibung: sig.beschreibung });
        }
        return;
      }
    }
    for (const v of VERDACHT) {
      if (v.muster.test(zeile)) {
        if (verdacht.length < MAX_TREFFER) {
          verdacht.push({ zeile: zeile.trimEnd(), beschreibung: v.beschreibung });
        }
        return;
      }
    }

    if (!imAbschluss) {
      if (ABSCHLUSS_BEGINN.test(zeile)) imAbschluss = true;
      return;
    }

    const herkunft = HERKUNFT.exec(zeile);
    if (herkunft) {
      eintragSchliessen();
      offen = { datei: herkunft[1].trim(), titel: null, koerper: null };
      return;
    }
    if (!offen) return;

    if (offen.titel === null) {
      const titel = EINTRAG_TITEL.exec(zeile);
      if (titel) offen.titel = titel[1].trim();
      return;
    }
    if (offen.koerper === null) {
      const koerper = KOERPER.exec(zeile);
      if (koerper) offen.koerper = koerper[1].trim();
    }
  };

  return {
    /** Nimmt einen Chunk entgegen. `kanal` trennt die Zeilenpuffer. */
    aufnehmen(chunk, kanal = "stdout") {
      const schluessel = kanal === "stderr" ? "stderr" : "stdout";
      const text = reste[schluessel] +
        (typeof chunk === "string" ? chunk : dekoder[schluessel].write(chunk));
      const zeilen = text.split(/\r?\n/);
      reste[schluessel] = zeilen.pop() ?? "";
      for (const z of zeilen) zeileLesen(z);
      /* Ausgabe ganz ohne Zeilenumbruch darf den Puffer nicht treiben. Laenger
         als die laengste Signatur muss er nie sein. */
      if (reste[schluessel].length > 4096) reste[schluessel] = reste[schluessel].slice(-1024);
    },

    /** Schliesst die Stroeme ab — die letzte Zeile hat oft keinen Umbruch mehr. */
    abschliessen() {
      for (const schluessel of ["stdout", "stderr"]) {
        /* Erst den Dekoder leeren: ein halbes Zeichen am Ende gehoert noch dazu. */
        reste[schluessel] += dekoder[schluessel].end();
        if (reste[schluessel]) {
          zeileLesen(reste[schluessel]);
          reste[schluessel] = "";
        }
      }
      eintragSchliessen();
    },

    /**
     * Der Befund. `abgestuerzteDateien` heisst: dieser Lauf hat fuer sie KEINEN
     * Befund erbracht — nicht, dass sie in Ordnung sind.
     */
    beurteilen() {
      /*
       * "Titel ist der Dateipfad selbst" — aber die beiden Zeilen schreiben ihn
       * nicht zwingend gleich. Gemessen am 2026-08-23 im Container:
       *
       *   Node 20.20   test at test/attrappe.test.js:1:1
       *                ✖ /tmp/sk/api/test/attrappe.test.js (170.9ms)   ← absolut
       *   Node 24.11   test at test\x.test.js:1:1
       *                ✖ test\x.test.js (12ms)                          ← relativ
       *
       * Ein blosser Gleichheitsvergleich haelt den Totalausfall unter Node 20
       * fuer einen gewoehnlichen roten Test — und der Befund sagte dann
       * "unabhaengig vom Abbruch rot" ueber genau die Datei, die abgestuerzt
       * ist. Deshalb wird auf Pfad-Ende verglichen, in beide Richtungen, mit
       * vereinheitlichten Trennzeichen.
       */
      const gleicherPfad = (a, b) => {
        const x = a.replace(/\\/g, "/");
        const y = b.replace(/\\/g, "/");
        return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
      };
      const istTotalausfall = (e) =>
        e.titel !== null && e.koerper !== null &&
        gleicherPfad(e.titel, e.datei) && OHNE_GRUND.test(e.koerper);

      const abbruch = treffer.length > 0;
      const totalausfaelle = eintraege.filter(istTotalausfall).map((e) => e.datei);
      const eindeutig = abbruch && totalausfaelle.length === 1;
      const mehrdeutig = abbruch && totalausfaelle.length > 1;

      const zugeordnet = new Set(eindeutig || mehrdeutig ? totalausfaelle : []);
      const weitere = [...new Set(eintraege.map((e) => e.datei).filter((d) => !zugeordnet.has(d)))];

      return {
        abbruch,
        treffer,
        /* Nativ gestorben, aber unbekannte Ursache: eigene Stufe, eigene
           Empfehlung, und niemals eine Wiederholung. */
        verdacht,
        eintraege,
        abgestuerzteDateien: eindeutig ? [...zugeordnet] : [],
        /* Mehrere Totalausfaelle, eine Signatur: welcher davon der Abbruch war,
           steht nicht in der Ausgabe. Raten waere hier das Gefaehrlichste. */
        verdaechtigeDateien: mehrdeutig ? [...zugeordnet] : [],
        weitereRoteDateien: weitere,
      };
    },
  };
}

/** Bequemer Einzelaufruf fuer Tests und fuer eine bereits vollstaendige Ausgabe. */
export function beurteileAusgabe(text, kanal = "stdout") {
  const s = neuerScanner();
  s.aufnehmen(text, kanal);
  s.abschliessen();
  return s.beurteilen();
}

/**
 * Der Text, den der Runner ausgibt. Getrennt vom Erkennen, damit die Formulierung
 * einzeln pruefbar ist — sie ist hier der eigentlich heikle Teil.
 */
export function formuliereBefund(befund, { status = null } = {}) {
  const strich = "─".repeat(78);

  /*
   * Ein GRUENER Lauf kann keinen Abbruch gehabt haben.
   *
   * Die Zeichenkette kann auch auf anderem Weg in die Ausgabe geraten: ein Test,
   * der sie als Vorlage benutzt und per console.log ausgibt, schreibt sie ab
   * Spalte 0 in den Bericht. Ohne diese Sperre stuende dann "NATIVER ABBRUCH
   * ERKANNT … WIEDERHOLEN" ueber einem Lauf, dem nichts fehlt — und beim
   * naechsten echten roten Lauf glaubt niemand mehr hin. Die Datei, die diese
   * Zeichenkette garantiert enthaelt, ist ausgerechnet der Test dieses Moduls.
   */
  if (status === 0 && (befund.abbruch || befund.verdacht?.length)) {
    return [
      "",
      strich,
      "[run-tests] Hinweis: die Ausgabe enthaelt eine Absturz-Signatur, der Lauf ist",
      "[run-tests] aber gruen. Dann ist nichts abgestuerzt — vermutlich hat ein Test",
      "[run-tests] die Zeichenkette selbst gedruckt. Keine Massnahme noetig.",
      strich,
      "",
    ].join("\n");
  }

  /*
   * Zweite Stufe zuerst abhandeln: nativ gestorben, Ursache unbekannt. Der Text
   * unterscheidet sich absichtlich in genau dem Punkt, auf den es ankommt — er
   * empfiehlt NICHT zu wiederholen, sondern hinzusehen. Wer das zusammenlegt,
   * hat aus einem unverstandenen Absturz einen "bekannten Flake" gemacht.
   */
  if (!befund.abbruch) {
    if (!befund.verdacht?.length) return null;
    const v = [];
    v.push("");
    v.push(strich);
    v.push("[run-tests] EIN PROZESS IST NATIV GESTORBEN — Ursache nicht bekannt.");
    v.push(strich);
    for (const t of befund.verdacht) {
      v.push(`  ${t.zeile}`);
      v.push(`    → ${t.beschreibung}`);
    }
    v.push("");
    v.push("  Das ist NICHT der belegte Wettlauf beim Prozessende. Wiederholen ist hier");
    v.push("  keine Antwort: solange niemand weiss, warum der Prozess gestorben ist, ist");
    v.push("  auch ein gruener zweiter Lauf kein Beleg.");
    v.push("");
    v.push("  Ist die Ursache verstanden und handelt es sich um denselben harmlosen");
    v.push("  Wettlauf, gehoert die Zeile als eigene Signatur nach");
    v.push("  api/scripts/lib/nativerAbbruch.mjs — mit dem Lauf, der sie belegt.");
    v.push(strich);
    v.push("");
    return v.join("\n");
  }

  const z = [];
  z.push("");
  z.push(strich);
  z.push("[run-tests] NATIVER ABBRUCH ERKANNT — dieser Lauf ist nicht aussagekraeftig.");
  z.push(strich);

  for (const t of befund.treffer) {
    z.push(`  ${t.zeile}`);
    z.push(`    → ${t.beschreibung}`);
  }
  z.push("");
  z.push("  Ein Testkindprozess ist beim Aufraeumen gestorben, nicht an einer Zusicherung.");

  if (befund.abgestuerzteDateien.length) {
    z.push("  Fuer diese Datei hat der Lauf damit KEINEN Befund erbracht:");
    for (const d of befund.abgestuerzteDateien) z.push(`    - ${d}`);
    z.push("");
    z.push("  Das heisst NICHT, dass sie in Ordnung ist: der Prozess kann auch mitten");
    z.push("  in der Datei gestorben sein, dann fehlen Untertests, die echt rot waeren.");
  } else if (befund.verdaechtigeDateien.length) {
    z.push("  Mehrere Dateien sind als GANZES ausgefallen. Ein solcher Ausfall sieht");
    z.push("  gleich aus, egal ob ihn der Abbruch oder ein Wurf beim Laden verursacht");
    z.push("  hat — welche davon der Abbruch war, steht nicht in der Ausgabe:");
    for (const d of befund.verdaechtigeDateien) z.push(`    - ${d}`);
    z.push("");
    z.push("  Nicht raten. Wiederholen und vergleichen: was dann wieder ausfaellt, ist echt.");
  } else {
    z.push("  Er liess sich keiner ausgefallenen Datei zuordnen — der Bericht nennt");
    z.push("  keinen Totalausfall. Der Lauf bleibt trotzdem ohne belastbaren Befund.");
  }

  z.push("");
  if (befund.weitereRoteDateien.length) {
    z.push("  ACHTUNG — diese Dateien sind unabhaengig vom Abbruch rot und bleiben es:");
    for (const d of befund.weitereRoteDateien) z.push(`    - ${d}`);
    z.push("");
    z.push("  Ein Wiederholen beseitigt sie nicht. Erst diese Fehler ansehen.");
  } else {
    z.push("  Ausser dem Abbruch hat der Lauf keine rote Datei gemeldet.");
    z.push("  Naechster Schritt: den Lauf WIEDERHOLEN. Ist er dann gruen, war es der");
    z.push("  bekannte Wettlauf beim Prozessende. Ist er ohne diese Zeile rot, ist der");
    z.push("  Fehler echt und gehoert untersucht.");
  }

  z.push("");
  z.push("  Ursache dauerhaft beheben: offene Handles der betroffenen Datei vor dem");
  z.push("  Ende schliessen, dann kann `--test-force-exit` dort nichts abschneiden.");
  z.push(strich);
  z.push("");
  return z.join("\n");
}
