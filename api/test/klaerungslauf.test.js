/**
 * Der Klaerungslauf — die Logik, die entscheidet, ob ein nativer Abbruch
 * harmlos war.
 *
 * Diese Datei ist wichtiger als ihre Groesse vermuten laesst: sie entscheidet
 * mit, ob ein Testlauf als gruen gilt. Ein Fehler HIER faelscht das Ergebnis
 * der ganzen Suite. Deshalb wird jeder Ausgang einzeln festgenagelt — und
 * besonders der eine, der etwas entlastet.
 *
 * Run: node --test --test-force-exit test/klaerungslauf.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  beurteileKlaerung,
  formuliereKlaerung,
  klaerungslauf,
  waehleZuKlaerende,
  fasseUrteileZusammen,
} from "../scripts/lib/klaerungslauf.mjs";

const OHNE_BEFUND = { abbruch: false, weitereRoteDateien: [] };

describe("beurteileKlaerung — die Wahrheit hinter einem Abbruch", () => {
  it("gruen und selbst beendet: die Datei ist entlastet", () => {
    const u = beurteileKlaerung({ status: 0, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "sauber");
    assert.match(u.begruendung, /Wettlauf/);
  });

  it("Zeitlimit erreicht: DAS ist das echte Handle-Leck", () => {
    /* Der teure Irrtum waere hier "sauber": eine Datei, die sich ohne das Flag
       nicht beendet, haelt wirklich etwas offen. Das ist der Befund, den der
       Klaerungslauf finden soll — er darf ihn nicht wegwerfen. */
    const u = beurteileKlaerung({ status: null, signal: "SIGKILL", zeitlimitErreicht: true, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "haengt");
  });

  it("das Zeitlimit schlaegt jeden Exitcode — auch die 0", () => {
    /* Nach SIGKILL kann ein Status hereinkommen. Wuerde er gewinnen, waere die
       haengende Datei als sauber gemeldet — die gefaehrlichste Verwechslung,
       die dieses Modul machen koennte. */
    const u = beurteileKlaerung({ status: 0, signal: null, zeitlimitErreicht: true, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "haengt");
  });

  it("roter Exitcode: ein echter Testfehler, kein Wettlauf", () => {
    const u = beurteileKlaerung({ status: 1, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "rot");
    assert.match(u.begruendung, /Exit 1/);
  });

  it("Abbruch AUCH ohne das Flag: das Flag ist entlastet, nicht die Datei", () => {
    const u = beurteileKlaerung({
      status: 3221226505, signal: null, zeitlimitErreicht: false,
      befund: { abbruch: true, weitereRoteDateien: [] },
    });
    assert.equal(u.ergebnis, "abbruch");
    assert.notEqual(u.ergebnis, "rot", "ein nativer Abbruch ist kein Testfehler");
  });

  it("per Signal gestorben: keine Aussage statt einer falschen", () => {
    const u = beurteileKlaerung({ status: null, signal: "SIGSEGV", zeitlimitErreicht: false, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "unklar");
  });

  it("gar kein Status: ebenfalls unklar, niemals sauber", () => {
    const u = beurteileKlaerung({ status: null, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND });
    assert.equal(u.ergebnis, "unklar");
  });

  it("NUR der Ausgang 'sauber' entlastet — alle anderen nicht", () => {
    /* Die Gegenprobe zur ganzen Mechanik: der Runner setzt gruen ausschliesslich
       bei "sauber". Faende ein spaeterer Umbau einen zweiten entlastenden
       Ausgang, muesste er hier vorbei. */
    const faelle = [
      { status: null, signal: null, zeitlimitErreicht: true, befund: OHNE_BEFUND },
      { status: 1, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND },
      { status: 134, signal: null, zeitlimitErreicht: false, befund: { abbruch: true, weitereRoteDateien: [] } },
      { status: null, signal: "SIGKILL", zeitlimitErreicht: false, befund: OHNE_BEFUND },
      { status: null, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND },
    ];
    for (const f of faelle) {
      assert.notEqual(beurteileKlaerung(f).ergebnis, "sauber",
        `dieser Fall darf nicht entlasten: ${JSON.stringify(f)}`);
    }
  });
});

describe("waehleZuKlaerende — welche Dateien ueberhaupt geprueft werden", () => {
  it("ohne Abbruch gibt es nichts zu klaeren", () => {
    assert.deepEqual(waehleZuKlaerende({ abbruch: false, abgestuerzteDateien: ["a.js"] }), []);
  });

  it("die eindeutig zugeordnete Datei", () => {
    assert.deepEqual(
      waehleZuKlaerende({ abbruch: true, abgestuerzteDateien: ["a.test.js"], verdaechtigeDateien: [] }),
      ["a.test.js"],
    );
  });

  it("AUCH die mehrdeutigen — dort ist der Klaerungsbedarf am groessten", () => {
    /* Der Detektor haelt sich bei mehreren Totalausfaellen bewusst zurueck,
       weil er aus der Ausgabe nicht raten darf, welcher der Abbruch war. Der
       Klaerungslauf faehrt jede einzeln und braucht nicht zu raten. Am
       2026-08-29 waren es zwei Dateien — beide einzeln gruen. Ohne diese Zeile
       waere gar nichts geklaert worden. */
    assert.deepEqual(
      waehleZuKlaerende({ abbruch: true, abgestuerzteDateien: [], verdaechtigeDateien: ["a.test.js", "b.test.js"] }),
      ["a.test.js", "b.test.js"],
    );
  });

  it("doppelt genannte Dateien werden nur einmal gefahren", () => {
    assert.deepEqual(
      waehleZuKlaerende({ abbruch: true, abgestuerzteDateien: ["a.js"], verdaechtigeDateien: ["a.js", "b.js"] }),
      ["a.js", "b.js"],
    );
  });

  it("fehlende Listen ergeben keine Ausnahme", () => {
    assert.deepEqual(waehleZuKlaerende({ abbruch: true }), []);
    assert.deepEqual(waehleZuKlaerende(null), []);
  });
});

describe("fasseUrteileZusammen — entlastet ist nur, wer ganz entlastet ist", () => {
  it("alle sauber ergibt sauber", () => {
    assert.equal(fasseUrteileZusammen([{ ergebnis: "sauber" }, { ergebnis: "sauber" }]).ergebnis, "sauber");
  });

  it("ein einziges 'haengt' verdirbt den Freispruch", () => {
    /* Ein "sauber" neben einem "haengt" ist kein halber Freispruch — der Lauf
       muesste sonst gruen werden, obwohl eine Datei nachweislich Handles
       offenhaelt. */
    assert.equal(
      fasseUrteileZusammen([{ ergebnis: "sauber" }, { ergebnis: "haengt" }]).ergebnis,
      "gemischt",
    );
  });

  it("eine LEERE Liste entlastet nichts", () => {
    /* Der teuerste denkbare Fehler dieser Mechanik: "nichts geprueft" duerfte
       nie wie "alles in Ordnung" aussehen. every() auf einem leeren Array ist
       true — genau die Falle, die hier zugehalten wird. */
    assert.notEqual(fasseUrteileZusammen([]).ergebnis, "sauber");
    assert.notEqual(fasseUrteileZusammen(null).ergebnis, "sauber");
  });

  it("ein null-Urteil entlastet ebenfalls nicht", () => {
    assert.notEqual(fasseUrteileZusammen([{ ergebnis: "sauber" }, null]).ergebnis, "sauber");
  });
});

describe("formuliereKlaerung — was der Mensch liest", () => {
  it("nennt die geprueften Dateien und das Ergebnis", () => {
    const t = formuliereKlaerung(
      beurteileKlaerung({ status: 0, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND }),
      ["test/me.route.coverage.test.js"],
    );
    assert.match(t, /test\/me\.route\.coverage\.test\.js/);
    assert.match(t, /in Ordnung/);
  });

  it("sagt bei jedem anderen Ausgang, dass der Lauf rot bleibt", () => {
    for (const f of [
      { status: null, signal: null, zeitlimitErreicht: true, befund: OHNE_BEFUND },
      { status: 1, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND },
      { status: 134, signal: null, zeitlimitErreicht: false, befund: { abbruch: true, weitereRoteDateien: [] } },
    ]) {
      const t = formuliereKlaerung(beurteileKlaerung(f), ["a.test.js"]);
      assert.match(t, /bleibt rot/, `fehlt bei ${JSON.stringify(f)}`);
    }
  });

  it("enthaelt keine Steuerzeichen", () => {
    const t = formuliereKlaerung(
      beurteileKlaerung({ status: 0, signal: null, zeitlimitErreicht: false, befund: OHNE_BEFUND }),
      ["a.test.js"],
    );
    /* Das Muster wird gebaut, nicht getippt: ein literales Steuerzeichen in
       einer Quelldatei ist selbst der Fehler, den der Sitzungsuebersicht-
       Waechter verbietet. Erlaubt bleiben Zeilenumbruch und Tabulator. */
    const steuerzeichen = new RegExp(
      "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
      String.fromCharCode(11) + String.fromCharCode(12) +
      String.fromCharCode(14) + "-" + String.fromCharCode(31) + "]",
    );
    assert.ok(!steuerzeichen.test(t), "der Bericht darf keine Steuerzeichen enthalten");
  });
});

describe("klaerungslauf — der Prozess, mit gefaelschtem spawn", () => {
  /** Ein Kindprozess-Doppel: sendet Ausgabe und endet, wie der Test es will. */
  function falschesKind({ status = 0, signal = null, ausgabe = "", verzoegerungMs = 0, nieBeenden = false }) {
    const kind = new EventEmitter();
    kind.stdout = new EventEmitter();
    kind.stderr = new EventEmitter();
    kind.getroffen = { kill: null };
    kind.kill = (s) => { kind.getroffen.kill = s; if (nieBeenden) kind.emit("close", null, s); };
    setTimeout(() => {
      if (ausgabe) kind.stdout.emit("data", Buffer.from(ausgabe, "utf8"));
      if (!nieBeenden) kind.emit("close", status, signal);
    }, verzoegerungMs);
    return kind;
  }

  it("laeuft OHNE --test-force-exit — das ist der ganze Punkt", async () => {
    let gesehen = null;
    await klaerungslauf({
      dateien: ["test/x.test.js"],
      projektVerzeichnis: "/w",
      spawnFn: (_exe, args) => { gesehen = args; return falschesKind({ status: 0 }); },
    });
    assert.ok(!gesehen.includes("--test-force-exit"),
      "mit dem Flag wuerde der Klaerungslauf genau den Verdaechtigen mitbringen");
    assert.ok(gesehen.includes("--test"));
    assert.ok(gesehen.includes("test/x.test.js"));
  });

  it("gruener Kindprozess ergibt 'sauber'", async () => {
    const u = await klaerungslauf({
      dateien: ["a.test.js"], projektVerzeichnis: "/w",
      spawnFn: () => falschesKind({ status: 0, ausgabe: "# pass 68\n# fail 0\n" }),
    });
    assert.equal(u.ergebnis, "sauber");
  });

  it("ein Kind, das nie endet, wird abgeschossen und heisst 'haengt'", async () => {
    let kind = null;
    const u = await klaerungslauf({
      dateien: ["a.test.js"], projektVerzeichnis: "/w", zeitlimitMs: 40,
      spawnFn: () => (kind = falschesKind({ nieBeenden: true })),
    });
    assert.equal(u.ergebnis, "haengt");
    assert.equal(kind.getroffen.kill, "SIGKILL",
      "SIGTERM reicht nicht: eine Datei mit offenen Handles muss darauf nicht reagieren");
  });

  it("scheitert der Start, wird nichts behauptet", async () => {
    const u = await klaerungslauf({
      dateien: ["a.test.js"], projektVerzeichnis: "/w",
      spawnFn: () => {
        const k = falschesKind({ verzoegerungMs: 9999 });
        setTimeout(() => k.emit("error", new Error("ENOENT")), 0);
        return k;
      },
    });
    assert.equal(u.ergebnis, "unklar");
    assert.match(u.begruendung, /ENOENT/);
  });

  it("erkennt einen Abbruch in der Ausgabe des Klaerungslaufs selbst", async () => {
    /* Bricht die Datei sogar ohne das Flag nativ ab, ist der Exitcode allein
       irrefuehrend — er saehe aus wie ein Testfehler. Der Scanner muss den
       Abbruch aus der Ausgabe lesen und gewinnen. */
    const u = await klaerungslauf({
      dateien: ["a.test.js"], projektVerzeichnis: "/w",
      spawnFn: () => falschesKind({
        status: 3221226505,
        ausgabe: "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76\n",
      }),
    });
    assert.equal(u.ergebnis, "abbruch");
  });
});
