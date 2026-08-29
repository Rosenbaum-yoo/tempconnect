/**
 * Was ein gruener Lauf NICHT bewiesen hat.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WARUM ES DAS GIBT (2026-08-29)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ein Volllauf meldete "10204 Tests, 1 Fehler" und sah damit aus wie ein
 * belastbarer Befund. Er war es nicht: 13 Tests waren uebersprungen worden,
 * weil `DATABASE_URL` nicht gesetzt war. Darunter ausgerechnet die beiden, die
 * den Rechnungs-Nummernkreis und die Ausstellerrolle gegen echte Zeilen
 * pruefen — also genau die Zusicherungen, die ein Mock nicht ersetzen kann und
 * die deshalb absichtlich datenbankgebunden sind.
 *
 * Mit Datenbank lief derselbe Stand als 10259 Tests. 55 Zusicherungen
 * Unterschied, ohne dass irgendeine Zeile der Ausgabe darauf hingewiesen
 * haette. Der Laeufer sagte "gruen" und meinte "gruen, soweit ich geschaut
 * habe".
 *
 * CLAUDE.md §0.9 nennt das beim Namen: ein Test, der unter dem offiziellen
 * Laeufer nicht real ausfuehrt, zaehlt nicht als gruen. Die Regel stand da,
 * aber nichts erzwang sie — ein uebersprungener Test sieht in der Ausgabe
 * genauso unauffaellig aus wie ein bestandener.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WAS ES TUT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Mitlesen, zaehlen, nach Grund gruppieren — und am Ende sagen, wieviel
 * Beweiskraft gefehlt hat. Zwei Stufen, weil die beiden Faelle verschieden
 * sind:
 *
 *   ohne Schalter        laut melden. Der Lauf ohne Datenbank ist ein
 *                        legitimes Werkzeug: er ist schneller und reicht fuer
 *                        die meiste Arbeit. Er darf nur nicht so aussehen wie
 *                        der vollstaendige.
 *   --verlange-datenbank rot. Fuer Release- und CI-Laeufe, in denen ein
 *                        uebersprungener Datenbanktest ein Loch im Nachweis
 *                        ist und kein Komfort.
 *
 * Bewusst NICHT: die Tests zwingen zu laufen. Sie ueberspringen sich aus einem
 * echten Grund, und ein erzwungener Lauf ohne Datenbank wuerde reihenweise an
 * der Verbindung scheitern statt an der Sache — das waere lauter, aber nicht
 * wahrer.
 */

/**
 * Der spec-Reporter schreibt uebersprungene Tests so:
 *
 *   ﹣ Name des Tests (0.4127ms) # keine Datenbank
 *   ﹣ Anderer Test (1.2ms) # SKIP
 *
 * Das fuehrende Zeichen ist U+FE63 (SMALL HYPHEN-MINUS), nicht der gewoehnliche
 * Bindestrich — deshalb steht es hier als Escape und nicht als Literal: in
 * einer Quelldatei waere es beim naechsten Editor-Durchlauf still ersetzt.
 */
const SKIP_ZEILE = /^\s*﹣\s+(.*?)\s*(?:\(\d+(?:\.\d+)?ms\))?\s*(?:#\s*(.*))?$/;

/** Gruende, die auf eine fehlende Datenbank hindeuten. */
const DB_GRUND = /datenbank|database_url|\bdb\b/i;

/**
 * Dasselbe im TESTNAMEN — und das ist nicht doppelt gemoppelt.
 *
 * Gemessen an einem echten Lauf: 28 der 40 uebersprungenen Tests meldeten als
 * Grund nur `# SKIP`, ohne ein Wort dazu. Nach dem Grund allein waeren sie alle
 * als harmlos durchgegangen — obwohl darunter Namen wie "AUEG · Datenanbindung
 * — echte Datenbank" standen. Der Name ist bei `describe.skip(...)` oft die
 * einzige Stelle, an der der Grund ueberhaupt auftaucht.
 *
 * Enger gefasst als DB_GRUND: kein blosses `\bdb\b`, das in Testnamen zu leicht
 * etwas anderes trifft.
 */
const DB_NAME = /echte\s+datenbank|datenbank|database|db-smoke|db\s*gated/i;

/**
 * Ein Zaehler, der Zeile fuer Zeile mitliest.
 *
 * Getrennt vom Abbruch-Scanner, obwohl beide dieselbe Ausgabe sehen: die
 * Fragen sind verschieden ("ist der Lauf gestorben?" gegen "was hat er
 * ausgelassen?"), und ein Modul, das beides beantwortet, waere bei der
 * naechsten Aenderung an einer der beiden Fragen im Weg.
 */
export function neuerSkipZaehler() {
  const gruende = new Map();
  let gesamt = 0;
  let rest = "";

  const zeileLesen = (zeile) => {
    const m = SKIP_ZEILE.exec(zeile);
    if (!m) return;
    gesamt += 1;
    const name = (m[1] || "").trim();
    let grund = (m[2] || "").trim();
    /* `# SKIP` ohne Zusatz ist kein Grund, sondern die Abwesenheit eines
       Grundes. Es als solchen zu fuehren waere die unehrlichste Zeile im
       ganzen Bericht: 28 Tests unter der Ueberschrift "SKIP" sehen erklaert
       aus und sind es nicht. */
    if (!grund || /^skip$/i.test(grund)) grund = "ohne angegebenen Grund";
    const eintrag = gruende.get(grund) || { anzahl: 0, namen: [], datenbank: 0 };
    eintrag.anzahl += 1;
    /* Ein paar Namen mitfuehren: "28 uebersprungen" ist eine Zahl,
       "28 uebersprungen, darunter AUEG · Datenanbindung" ist ein Hinweis,
       mit dem jemand etwas anfangen kann. */
    if (eintrag.namen.length < 3 && name) eintrag.namen.push(name);
    /* Je Test entscheiden, nicht je Gruppe: unter "ohne angegebenen Grund"
       liegen 28 voellig verschiedene Tests. Haenge die Eigenschaft an der
       Gruppe, faerbt ein einziger Datenbanktest die anderen 27 mit ein — und
       aus einer Luecke von 1 wuerde eine gemeldete Luecke von 28. Der Name ist
       bei fehlendem Grund die einzige Spur, die es gibt. */
    if (DB_GRUND.test(grund) || DB_NAME.test(name)) eintrag.datenbank += 1;
    gruende.set(grund, eintrag);
  };

  return {
    aufnehmen(chunk) {
      const text = rest + (typeof chunk === "string" ? chunk : String(chunk));
      const zeilen = text.split(/\r?\n/);
      rest = zeilen.pop() ?? "";
      for (const z of zeilen) zeileLesen(entfaerben(z));
      if (rest.length > 4096) rest = rest.slice(-1024);
    },
    abschliessen() {
      if (rest) { zeileLesen(entfaerben(rest)); rest = ""; }
    },
    beurteilen() {
      const nachGrund = [...gruende.entries()]
        .map(([grund, e]) => ({ grund, anzahl: e.anzahl, datenbank: e.datenbank, namen: e.namen }))
        .sort((a, b) => b.anzahl - a.anzahl);
      return {
        gesamt,
        nachGrund,
        datenbankSkips: nachGrund.reduce((s, g) => s + g.datenbank, 0),
      };
    },
  };
}

/** Farbcodes weg — sonst trifft kein Muster. Dieselbe Not wie im Abbruch-Scanner. */
function entfaerben(zeile) {
  // eslint-disable-next-line no-control-regex
  return String(zeile).replace(new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g"), "");
}

/**
 * Der Text fuer den Menschen.
 *
 * @param {object}  befund             Ergebnis von beurteilen()
 * @param {boolean} datenbankGesetzt   war DATABASE_URL da?
 * @param {boolean} verlangt           lief der Lauf mit --verlange-datenbank?
 * @returns {string} leer, wenn es nichts zu sagen gibt
 */
export function formuliereSkips(befund, { datenbankGesetzt, verlangt = false } = {}) {
  if (!befund || !befund.gesamt) return "";
  /* Sind alle Skips harmlos und die Datenbank war da, ist das keine Nachricht
     wert — dann hat der Lauf gezeigt, was er zeigen konnte. */
  if (!befund.datenbankSkips && datenbankGesetzt) return "";

  const strich = "─".repeat(78);
  const z = ["", strich];
  z.push(
    befund.datenbankSkips
      ? "[run-tests] DIESER LAUF BEWEIST WENIGER, ALS ER SCHEINT"
      : "[run-tests] Uebersprungene Tests",
  );
  z.push(strich);
  z.push(`  Uebersprungen: ${befund.gesamt} Test(e).`);
  for (const g of befund.nachGrund.slice(0, 8)) {
    const db = g.datenbank ? `, davon ${g.datenbank} datenbankgebunden` : "";
    z.push(`    ${String(g.anzahl).padStart(4)} × ${g.grund}${db}`);
    /* Bei fehlendem Grund sind die Namen die einzige verwertbare Information —
       ohne sie muesste jemand 15000 Zeilen durchsuchen, um zu sehen, WAS
       ausgelassen wurde. */
    if (g.grund === "ohne angegebenen Grund" && g.namen.length) {
      for (const n of g.namen) z.push(`         · ${n}`);
      if (g.anzahl > g.namen.length) z.push(`         · … und ${g.anzahl - g.namen.length} weitere`);
    }
  }
  if (befund.nachGrund.length > 8) {
    z.push(`    … und ${befund.nachGrund.length - 8} weitere Gruende`);
  }
  z.push("");

  if (befund.datenbankSkips) {
    z.push(`  Davon ${befund.datenbankSkips} mangels Datenbank. Diese Tests sind absichtlich`);
    z.push("  datenbankgebunden: sie pruefen Dinge, die ein Mock nicht zeigen kann —");
    z.push("  Zeilensperren, Transaktionen, echte Eindeutigkeit. Ihr Ueberspringen ist");
    z.push("  kein Detail, sondern eine Luecke im Nachweis.");
    z.push("");
    if (!datenbankGesetzt) {
      z.push("  Mit Datenbank laufen lassen:");
      z.push("");
      z.push("    DATABASE_URL=postgres://…  node scripts/run-tests.js");
      z.push("");
    }
    if (verlangt) {
      z.push("  --verlange-datenbank ist gesetzt: der Lauf gilt damit als ROT.");
    } else {
      z.push("  Fuer Release- und CI-Laeufe: --verlange-datenbank macht daraus einen Fehler.");
    }
  }
  z.push(strich, "");
  return z.join("\n");
}
