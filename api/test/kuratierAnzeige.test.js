/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIE KURATIER-ANZEIGE IST VERDRAHTET (M4b.2, nachgeholt 2026-10-01)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Befund, der diese Datei nötig gemacht hat: `GET /markt-sichtbarkeit`
 * liefert seit N8.1b-6/-7 die Felder `faehigkeits_vorschlaege` und
 * `katalogfremde_rollen` — und `frontend/src/staff/modules/markt-sichtbarkeit/
 * index.tsx` rendert **keines von beiden**. Gemessen: im GANZEN Frontend kein
 * einziger Treffer auf die beiden Namen. Die Ursache war der Typ: er deklarierte
 * nur vier Felder, also war der Inhalt der anderen zwei unerreichbar.
 *
 * `vorschlagWirdEntschieden.test.js` prüft die SERVERSEITE dieser Welle und ist
 * dabei grün geblieben — zu Recht, sie hat nie behauptet, die Fläche zu prüfen.
 * Genau in dieser Naht lag der Verlust: beide Hälften gebaut, beide Hälften
 * bewacht, und niemand hat gesagt, dass die eine die andere nie erreicht. Diese
 * Datei bewacht die Naht.
 *
 * WARUM QUELLTEXT UND KEINE SANDBOX: ein `.tsx` lässt sich nicht wie eine
 * Vanilla-Seite in eine vm-Sandbox legen (JSX, Vite-Aliase). Der Typecheck
 * (`npm run build:scc` ruft `tsc --noEmit`) beweist, dass es übersetzt; was er
 * NICHT beweist, ist dass die Felder benutzt werden — ein unbenutztes optionales
 * Feld im Typ übersetzt tadellos. Also werden hier Benutzung und Form geprüft.
 *
 * Run: node --test --test-force-exit test/kuratierAnzeige.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwärts suchen UND auf Inhalt prüfen: Docker legt Mount-Ziele als leere
   Verzeichnisse an, und ein leeres Verzeichnis macht jede Prüfung lautlos grün. */
function findeWurzel() {
  const ziel = path.join("frontend", "src", "staff", "modules", "markt-sichtbarkeit", "index.tsx");
  for (const start of [__dirname, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const k = path.join(dir, ziel);
      if (fs.existsSync(k) && fs.statSync(k).size > 1000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

suite("M4b.2 · die Kuratier-Anzeige im Staff Control Center", () => {
  const modul = ROOT ? fs.readFileSync(path.join(
    ROOT, "frontend", "src", "staff", "modules", "markt-sichtbarkeit", "index.tsx"), "utf8") : "";

  /* ── Die Naht: beide Felder kommen an ─────────────────────────────────── */

  it("beide Felder stehen im Typ UND werden benutzt", () => {
    /*
     * ZWEIMAL PRÜFEN, weil der Befund genau dazwischen lag. Im Typ zu stehen
     * genügt nicht (ein optionales Feld, das niemand liest, übersetzt tadellos);
     * benutzt zu werden ohne im Typ zu stehen geht in TypeScript nicht. Beides
     * zusammen ist die Zusicherung.
     */
    for (const feld of ["faehigkeits_vorschlaege", "katalogfremde_rollen"]) {
      assert.match(modul, new RegExp(feld + "\\??:"),
        feld + " fehlt im Typ — genau das war der Grund, warum der Inhalt " +
        "unerreichbar war, obwohl der Server ihn seit N8.1b liefert");
      const benutzt = (modul.match(new RegExp("\\." + feld + "\\b", "g")) || []).length
                    + (modul.match(new RegExp('\\["' + feld + '"\\]', "g")) || []).length;
      assert.ok(benutzt >= 1, feld + " steht im Typ, wird aber nirgends gelesen — " +
        "ein Feld im Typ ist keine Anzeige");
    }
  });

  it("beide Abschnitte werden wirklich gerendert, nicht nur definiert", () => {
    /*
     * ERREICHBARKEIT, NICHT ANWESENHEIT. Zwei Komponenten zu definieren und
     * keine davon einzuhängen ist derselbe Zustand wie vorher — und genau diese
     * Lücke hat in dieser Woche schon eine Probe grün gelassen
     * (`if (false && …)` um einen vorhandenen Aufruf).
     */
    for (const komponente of ["Vorschlaege", "KatalogfremdeRollen"]) {
      assert.match(modul, new RegExp("function " + komponente + "\\("),
        "die Komponente " + komponente + " fehlt");
      assert.match(modul, new RegExp("<" + komponente + "\\b"),
        komponente + " ist definiert, wird aber nicht eingehängt — " +
        "definiert und nicht gerendert ist derselbe Zustand wie vorher");
    }
  });

  /* ── Der Hebel steht an der Zeile ─────────────────────────────────────── */

  it("die Entscheidung geht an den richtigen Weg, mit Bestätigung und Grund", () => {
    assert.match(modul, /\/faehigkeits-vorschlaege\/\$\{encodeURIComponent\(v\.id\)\}\/entscheiden/,
      "der Entscheidungsweg fehlt oder die Kennung wird nicht kodiert");
    assert.match(modul, /confirmed: true/, "ohne Bestätigung — der Server weist das ab");
    assert.match(modul, /reason,/, "der Grund wird nicht mitgeschickt");
    assert.match(modul, /entscheidung,/, "die Entscheidung wird nicht mitgeschickt");
  });

  it("der Grund kommt vom MENSCHEN, nicht aus dem Quelltext", () => {
    /*
     * Die Falle, die diese Woche in `vendorPool.js` wirklich stand: dort war der
     * Grund fest eingebaut ("Manuell gesperrt"), und das Pflichtfeld war damit
     * eine Formalität. Hier muss er aus dem Dialog kommen.
     */
    assert.match(modul, /onConfirm: async \(reason: string\)/,
      "der Grund wird nicht aus dem Bestätigungsdialog übernommen");
    assert.doesNotMatch(modul, /reason: ["'][^"']{3,}["']/,
      "ein fest eingebauter Grund macht die Begründungspflicht zur Formalität");
  });

  it("alle drei Entscheidungen sind erreichbar", () => {
    for (const e of ["zuordnen", "annehmen", "ablehnen"]) {
      assert.match(modul, new RegExp('"' + e + '"'),
        "die Entscheidung '" + e + "' ist in der Fläche nicht auslösbar — " +
        "der Dienst kennt genau diese drei (VORSCHLAG_ENTSCHEIDUNGEN)");
    }
  });

  it("zuordnen schickt ein Ziel — und erscheint nur, wenn es eines gibt", () => {
    /*
     * KEIN TOTER KNOPF. Ohne `ziel_skill_id` antwortet der Dienst mit
     * ZIEL_FEHLT; ein sichtbarer Knopf, der garantiert scheitert, ist schlimmer
     * als keiner. Geprüft wird beides: dass das Ziel mitgeht, und dass der Knopf
     * an der Liste der Vorschläge hängt statt unbedingt zu erscheinen.
     */
    assert.match(modul, /ziel_skill_id: ziel\.id/,
      "beim Zuordnen geht kein Ziel mit — der Dienst antwortet dann ZIEL_FEHLT");
    assert.match(modul, /v\.zuordnungsvorschlag\.length > 0/,
      "der Zuordnen-Knopf hängt nicht an der Frage, ob es überhaupt ein Ziel gibt");
    assert.match(modul, /kein naheliegender Katalogeintrag/,
      "ohne Ziel fehlt die Auskunft, WARUM kein Zuordnen angeboten wird");
  });

  it("die Wirkung steht VOR der Bestätigung, nicht danach", () => {
    /* Hausregel, zweimal in dieser Welle angewandt: eine Handlung nennt ihre
       Folge, bevor sie sie hat. Beim Zuordnen hängen Träger um — eine Änderung
       an fremden Profilen. */
    assert.match(modul, /hint: hinweis/,
      "der Bestätigungsdialog bekommt keine Wirkungsvorschau");
    assert.match(modul, /umgehängt/,
      "die Vorschau nennt nicht, dass Zuordnungen umgehängt werden");
    /*
     * DIE ZAHL IM RICHTIGEN ZWEIG, und dieser Anker hat zwei Anläufe gebraucht:
     *  1. `/v\.traeger/` blieb grün, weil der Name auch in den Bedingungen steht.
     *  2. `/\$\{v\.traeger\}/` blieb grün, weil die Einsetzung auch im
     *     ABLEHNEN-Zweig vorkommt — ich hatte nur den Zuordnen-Zweig mutiert.
     * Beide Male hat die Zusicherung eine andere Stelle belegt als die gemeinte.
     * Also zuerst den Zweig herausschneiden, dann darin prüfen.
     */
    const zuordnenZweig = modul.match(
      /entscheidung === "zuordnen"\s*\?[\s\S]*?: entscheidung === "annehmen"/);
    assert.ok(zuordnenZweig, "der Zuordnen-Zweig der Vorschau ist nicht auffindbar");
    assert.match(zuordnenZweig[0], /\$\{v\.traeger\}/,
      "der Zuordnen-Zweig nennt die ZAHL der umgehängten Zuordnungen nicht — " +
      "'einige Zuordnungen' ist keine Wirkungsvorschau");
    assert.match(zuordnenZweig[0], /\$\{ziel\?\.name\}/,
      "der Zuordnen-Zweig nennt das Ziel nicht, auf das zugeordnet wird");

    /* Und der Ablehnen-Zweig nennt seine eigene Folge: die Kräfte bleiben ohne
       Katalogbezug und damit am Markt unauffindbar — der Zusammenhang zur Zahl
       ganz oben auf dieser Seite. */
    const ablehnenZweig = modul.match(/: `„\$\{v\.name\}" wird abgelehnt\.[\s\S]*?\);/);
    assert.ok(ablehnenZweig, "der Ablehnen-Zweig der Vorschau ist nicht auffindbar");
    assert.match(ablehnenZweig[0], /\$\{v\.traeger\}/,
      "der Ablehnen-Zweig nennt nicht, wie viele Kräfte die Angabe schon tragen");
    assert.match(ablehnenZweig[0], /unauffindbar/,
      "der Ablehnen-Zweig nennt die Folge nicht — die Kräfte bleiben ohne " +
      "Katalogbezug und damit am Markt unauffindbar");
  });

  /* ── Was der Mensch sieht, wenn nichts da ist oder etwas schiefgeht ───── */

  it("der Leerzustand ist ehrlich und vom Fehlerfall unterscheidbar", () => {
    assert.match(modul, /Derzeit keine offenen Vorschläge/,
      "der Leerzustand fehlt — ein leerer Kasten liest sich wie ein gescheitertes Laden");
    /* Und die drei Zustände sind getrennt: Feld fehlt, nicht lesbar, leer. */
    assert.match(modul, /faehigkeits_vorschlaege<\/span> nicht/,
      "ein fehlendes Feld wird nicht von 'keine Vorschläge' unterschieden");
    assert.match(modul, /verfuegbar === false/,
      "'nicht lesbar' wird nicht als Befund behandelt");
  });

  it("Serverkennungen werden übersetzt, bevor sie der Mensch liest", () => {
    /*
     * Gemessen am Verhalten des globalen Dialogs: wirft `onConfirm`, bleibt er
     * offen und zeigt `e.message` INLINE. Ohne Übersetzung steht dort
     * "ZIEL_IST_VORSCHLAG" — für den Lesenden keine Auskunft.
     */
    for (const code of ["ZIEL_FEHLT", "ZIEL_IST_VORSCHLAG", "SCHON_ENTSCHIEDEN",
      "BEGRUENDUNG_FEHLT", "NICHT_GEFUNDEN", "ZIEL_UNGUELTIG", "VORSCHLAG_FEHLT",
      "UNBEKANNTE_ENTSCHEIDUNG"]) {
      assert.match(modul, new RegExp(code + ":"),
        "die Kennung " + code + " wird nicht übersetzt — sie erscheint roh im Dialog");
    }
    assert.match(modul, /throw new Error\(fehlerSatz\(e\)\)/,
      "der Fehler wird nicht weitergeworfen — dann schließt der Dialog und die " +
      "eingegebene Begründung ist weg");
  });

  it("nach einer Entscheidung wird nachgeladen", () => {
    assert.match(modul, /nachladen\(\)/,
      "ohne Nachladen steht der entschiedene Vorschlag weiter in der Liste");
    assert.match(modul, /toast\.success/, "der Mensch erfährt den Erfolg nicht");
  });

  /* ── Die katalogfremden Rollen: die Bezeichnungen SELBST ──────────────── */

  it("die katalogfremden Rollen werden im Wortlaut gezeigt, nicht nur gezählt", () => {
    /*
     * AUSDRÜCKLICHE VORGABE der gegenprüfenden Sitzung, und sie hat recht: eine
     * Zahl „17 katalogfremde Rollen" ist nicht bearbeitbar. Wer sie aufräumen
     * soll, muss lesen, WELCHE Schreibweise danebenliegt — „Lagerhelfer" neben
     * „Lagerhelfer:in" erkennt man nur im Wortlaut.
     */
    assert.match(modul, /daten\.rollen\.map/,
      "die Rollen werden nicht einzeln gerendert — eine Zahl allein ist nicht aufräumbar");
    /*
     * AUF DIE ZELLE ANKERN, nicht auf den Namen. Erster Versuch prüfte
     * `/\{r\.rolle\}/` — und blieb grün, als ich den Zelleninhalt durch festen
     * Text ersetzte: `key={r.rolle}` am `<tr>` hat das Muster weiter erfüllt.
     * Dieselbe Familie wie „Wächter nie per Teilzeichenkette": ein Name, der an
     * mehreren Stellen vorkommt, belegt keine davon.
     */
    assert.match(modul, /<td><strong>\{r\.rolle\}<\/strong><\/td>/,
      "die Bezeichnung selbst erscheint nicht in der Zelle");
    assert.match(modul, /<td>\{r\.eintraege\}<\/td>/,
      "ohne Anzahl in der Zelle fehlt die Dringlichkeit je Zeile");
    assert.match(modul, /r\.seiten\.map/,
      "ohne Seite ist unklar, ob die Bezeichnung in Angeboten oder Bedarfen steht");
  });

  it("der Hinweis des Servers bleibt stehen — er sagt, dass NICHT gelöscht wird", () => {
    /*
     * An diesen Bezeichnungen hängen Angebote und Bedarfe. Ohne den Satz liest
     * die Liste sich wie eine Aufräum-Erlaubnis.
     *
     * AUF DIE BEDINGUNG ANKERN, nicht auf den Namen: ein `/daten\.hinweis/`
     * blieb grün, als ich die Bedingung auf `{false ? (` setzte — der Name stand
     * im nun unerreichbaren Zweig weiter da. Anwesenheit statt Erreichbarkeit,
     * die Lücke, die diese Woche schon zweimal zugeschlagen hat.
     */
    assert.match(modul, /\{daten\.hinweis \? \(/,
      "der Vorbehalt des Servers hängt nicht mehr an seiner eigenen Bedingung — " +
      "er kann damit unerreichbar sein, obwohl sein Name noch im Quelltext steht");
    assert.match(modul, /\{daten\.hinweis\}/, "der Vorbehalt wird nicht ausgegeben");
  });

  it("die Zahl im Kopf stammt aus derselben Antwort wie die Liste", () => {
    /* Kopf und Liste dürfen nicht auseinanderlaufen: der Dienst rechnet
       `eintraege` ausdrücklich aus den ZEILEN, damit das nicht passiert. Die
       Fläche darf es nicht wieder trennen. */
    assert.match(modul, /daten\.anzahl/, "die Anzahl im Kopf fehlt");
    assert.match(modul, /daten\.eintraege/, "die Summe der Einträge fehlt");
  });

  /* ── Keine erfundenen Klassen, kein Umgehen des Dialogs ───────────────── */

  it("es gibt keine zweite Schreibroute neben dem Dialog", () => {
    /*
     * Dieselbe Prüfung wie bei der Wirkungsvorschau im Lieferantenpool: jeder
     * schreibende Aufruf muss durch den Bestätigungsdialog gehen. Ein
     * `sccApi.post` ausserhalb von `onConfirm` wäre der Weg daran vorbei.
     */
    const schreibend = [...modul.matchAll(/sccApi\.(post|patch|del)\(/g)];
    assert.ok(schreibend.length >= 1, "es wird gar nicht geschrieben");
    for (const treffer of schreibend) {
      const davor = modul.slice(0, treffer.index);
      const letzterDialog = davor.lastIndexOf("onConfirm:");
      const letzteFunktion = Math.max(
        davor.lastIndexOf("function "), davor.lastIndexOf("async function "));
      assert.ok(letzterDialog > letzteFunktion,
        "ein schreibender Aufruf (" + treffer[0] + ") steht ausserhalb von onConfirm — " +
        "damit gibt es einen Weg an Bestätigung und Begründung vorbei");
    }
  });

  it("kein requireStepUp-Umweg, den der Server nicht verlangt", () => {
    /*
     * GEMESSEN: `POST /faehigkeits-vorschlaege/:id/entscheiden` trägt
     * `requireStaff` und `requireConfirmAndReason` — aber **kein**
     * `requireStepUp`. Ein `await stepUp()` wie in den Modulen `automation` und
     * `platform` wäre hier eine Hürde, die der Server nicht verlangt: der Mensch
     * müsste sich erneut ausweisen, um eine Schreibvariante zuzuordnen.
     * Sicherheit, die nicht schützt, kostet nur Benutzung.
     */
    /* Breit genug, um auch eine selbstgebaute Attrappe zu fangen: die erste
       Fassung prüfte nur auf den AUFRUF `stepUp()` und blieb grün, als ich eine
       Definition `const stepUp = () =>` einsetzte. Eine Hürde entsteht beim
       Einbauen, nicht erst beim Aufrufen. */
    assert.doesNotMatch(modul, /useStepUp|ensureStepUp|\bstepUp\b/,
      "die Fläche baut eine Zweitbestätigung ein, die der Server nicht fordert — " +
      "gemessen trägt POST /faehigkeits-vorschlaege/:id/entscheiden kein requireStepUp");
  });
});
