/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WELLE N2.5 — ABBRECHEN VERLIERT NICHTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wer den Assistenten schliesst und wiederkommt, findet seinen Stand vor —
 * Eingaben UND den Schritt, an dem er aufgehoert hat.
 *
 * IM BROWSER, NICHT AUF DEM SERVER, und das ist eine Entscheidung: ein
 * `status='draft'` in `demand_requests` braeuchte eine Migration und einen
 * zusaetzlichen Filter in JEDER Abfrage, die Bedarfe liest. Genau diese
 * Fehlerklasse hat diese Welle mehrfach behoben (N4: die Sperre fehlte in vier
 * von fuenf Flaechen; N2.4: die Trefferzahl zaehlte die falsche Marktseite).
 * Ein halbfertiger Bedarf im Feed waere der teuerste Ausgang — eine
 * Zeitarbeitsfirma antwortet auf etwas, das niemand abgeschickt hat.
 *
 * Diese Datei FUEHRT den Entwurf aus, mit einem Speicher-Ersatz und einem
 * handgebauten DOM.
 *
 * Lauf: node --test --test-force-exit test/entwurfVerliertNichts.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SEITE = path.resolve(HIER, "..", "..", "frontend", "public", "marketplace_demand_create.html");
const da = fs.existsSync(SEITE);
const html = da ? fs.readFileSync(SEITE, "utf8") : "";

const TAG = 24 * 60 * 60 * 1000;

/** Der Entwurfs-Block in einer Sandbox, mit Speicher-Ersatz. */
function entwurf({ gespeichert = null, jetzt = 1_800_000_000_000, speicherWirft = false } = {}) {
  const von = html.indexOf('var SCHLUESSEL = "tc_bedarf_entwurf";');
  assert.ok(von > 0, "der Entwurfs-Block liegt nicht mehr, wo er lag");
  const bis = html.indexOf("})();", von);
  assert.ok(bis > von, "das Ende des Blocks ist nicht auffindbar");
  const quelle = html.slice(von, bis);

  /*
   * N2.11 — DIE FELDER STARTEN WIE IM MARKUP, nicht leer.
   *
   * Befund der Pruefung vom 2026-09-15: der Nachbau setzte jedes Feld auf "".
   * Im Markup steht `headcount` aber auf value="1". Die Probe "die blosse
   * Ortsvorbelegung ist kein Stand" war deshalb nur unter einem Wert gruen, den
   * die Seite nie hat — im Betrieb entstand bei jedem Oeffnen ein 7-Tage-Entwurf,
   * der beim naechsten Besuch den alten Ort zurueckholte (auch nach einem
   * Standortwechsel). Der Standard kommt jetzt aus dem Markup selbst, und
   * `defaultValue` traegt ihn, wie im Browser.
   */
  const standardAus = (id) => {
    const tag = new RegExp(`<(input|select|textarea)[^>]*\\bid="${id}"[^>]*>`, "i").exec(html);
    const wert = tag && /\bvalue="([^"]*)"/i.exec(tag[0]);
    return wert ? wert[1] : "";
  };
  const felder = {};
  ["title", "role", "skill_tags", "headcount", "start_date", "end_date",
    "location_city", "location_postal", "radius_km", "budget_min", "budget_max",
    "contact_name", "contact_phone"].forEach((id) => {
    const standard = standardAus(id);
    felder[id] = { id, value: standard, defaultValue: standard };
  });

  /*
   * N2.12 — VERSTECKTE FELDER VERHALTEN SICH ANDERS, und genau daran haette der
   * Nachbau vorbeigemessen (Befund der Nachpruefung 2026-09-16). Bei
   * `<input type="hidden">` setzt `.value` das value-ATTRIBUT selbst, und
   * `defaultValue` gibt dieses Attribut zurueck — der "Standard" waechst also
   * mit jeder Auswahl mit. `skill_tags` ist ein solches Feld. Wer nur
   * Faehigkeiten anklickte, erzeugte damit keinen Entwurf mehr: sein Wert war
   * per Definition nie vom "Standard" verschieden.
   */
  const versteckt = /<input[^>]*\bid="skill_tags"[^>]*type="hidden"|<input[^>]*type="hidden"[^>]*\bid="skill_tags"/i.test(html);
  assert.ok(versteckt, "skill_tags ist kein verstecktes Feld mehr — die Nachbildung unten prueft dann das Falsche");
  Object.defineProperty(felder.skill_tags, "defaultValue", {
    get() { return this.value; },
    configurable: true
  });

  const speicher = { _: gespeichert === null ? {} : { tc_bedarf_entwurf: gespeichert } };
  const sandkasten = {
    document: { getElementById: (id) => felder[id] || null },
    window: {
      localStorage: {
        getItem: (k) => {
          if (speicherWirft) throw new Error("Speicher gesperrt");
          return Object.prototype.hasOwnProperty.call(speicher._, k) ? speicher._[k] : null;
        },
        setItem: (k, v) => { if (speicherWirft) throw new Error("Speicher voll"); speicher._[k] = v; },
        removeItem: (k) => { if (speicherWirft) throw new Error("Speicher gesperrt"); delete speicher._[k]; }
      }
    },
    Date: { now: () => jetzt },
    JSON, Number, String, Object, Array,
    console: { log() {}, warn() {}, error() {} }
  };
  vm.createContext(sandkasten);
  vm.runInContext(quelle
    + "\nglobalThis._lesen = lesen;"
    + "\nglobalThis._schreiben = schreiben;"
    + "\nglobalThis._loeschen = loeschen;"
    + "\nglobalThis._wieder = wiederherstellen;",
    sandkasten, { filename: "entwurf" });

  return { sandkasten, felder, speicher, roh: () => speicher._.tc_bedarf_entwurf };
}

const eintrag = (werte, ueber = {}) =>
  JSON.stringify({ stand: 1_800_000_000_000, schritt: 0, werte, ...ueber });

/* ═══════════════════════════════════════════════════════════════════════ */

describe("N2.5 · der Stand ueberlebt das Schliessen", { skip: !da && "Seite fehlt" }, () => {

  it("was getippt wurde, steht beim Wiederkommen wieder da", () => {
    const e = entwurf({
      gespeichert: eintrag({ title: "10 Helfer", role: "Helfer", location_city: "Münster",
        start_date: "2026-10-01", skill_tags: "Pflege, Nachtdienst" }, { schritt: 3 })
    });
    e.sandkasten._wieder();
    assert.strictEqual(e.felder.title.value, "10 Helfer");
    assert.strictEqual(e.felder.role.value, "Helfer");
    assert.strictEqual(e.felder.skill_tags.value, "Pflege, Nachtdienst");
    assert.strictEqual(e.felder.start_date.value, "2026-10-01");
  });

  it("der Schritt gehoert zum Stand — und wird auch WIRKLICH geschrieben", () => {
    /*
     * ERST NACH EINER RUECKMUTATION VOLLSTAENDIG.
     *
     * Die erste Fassung legte einen Eintrag mit `schritt: 3` hin und las ihn
     * zurueck — damit prueft sie nur, dass JSON funktioniert. Das Schreiben des
     * Schritts blieb unbewacht: man konnte es durch `schritt: 0` ersetzen, und
     * nichts wurde rot. Der Kunde haette seine Eingaben wiedergefunden, aber am
     * Anfang, und sich durchklicken muessen.
     */
    const gelesen = entwurf({ gespeichert: eintrag({ title: "x" }, { schritt: 3 }) });
    assert.strictEqual(gelesen.sandkasten._lesen().schritt, 3, "der Schritt kommt nicht zurueck");

    const geschrieben = entwurf();
    geschrieben.sandkasten.window.__tcEntwurfSchritt = 3;
    geschrieben.felder.title.value = "10 Helfer";
    geschrieben.sandkasten._schreiben();
    assert.strictEqual(JSON.parse(geschrieben.roh()).schritt, 3,
      "der Schritt wird nicht mitgeschrieben");
  });

  it("Standardwerte werden ueberschrieben — sonst kaeme die Anzahl nicht zurueck", () => {
    /*
     * KORRIGIERT NACH EINER ROTEN PROBE.
     *
     * Die erste Fassung forderte das Gegenteil: der Entwurf duerfe ein
     * gefuelltes Feld nicht anfassen. Das war falsch und widersprach der
     * Absicht im Code. `headcount` steht im Markup auf `1`, `radius_km` auf
     * `25` — beides SIND gefuellte Felder. Wer sie ausnimmt, stellt genau die
     * zwei Zahlen nicht wieder her, die der Kunde geaendert hat.
     *
     * Dass dabei keine Eingabe verlorengehen kann, liegt an der POSITION des
     * Blocks: er laeuft inline direkt nach dem Markup, bevor irgendjemand
     * tippen konnte. Diese Position ist keine Annahme, sondern bewacht — siehe
     * "der Entwurf wird vor dem Katalogwaehler wiederhergestellt".
     */
    const e = entwurf({ gespeichert: eintrag({ headcount: "14", radius_km: "50" }) });
    e.felder.headcount.value = "1";     // Standard aus dem Markup
    e.felder.radius_km.value = "25";    // Standard aus dem Markup
    e.sandkasten._wieder();
    assert.strictEqual(e.felder.headcount.value, "14", "die Anzahl kam nicht zurueck");
    assert.strictEqual(e.felder.radius_km.value, "50", "der Umkreis kam nicht zurueck");
  });

  it("ein leeres Feld im Entwurf loescht nichts", () => {
    const e = entwurf({ gespeichert: eintrag({ title: "", role: "Helfer" }) });
    e.felder.title.value = "steht schon";
    e.sandkasten._wieder();
    assert.strictEqual(e.felder.title.value, "steht schon");
    assert.strictEqual(e.felder.role.value, "Helfer");
  });
});

describe("N2.5 · was NICHT als Entwurf zaehlt", { skip: !da && "Seite fehlt" }, () => {

  it("ein leeres Formular hinterlaesst keinen Entwurf", () => {
    const e = entwurf();
    e.sandkasten._schreiben();
    assert.strictEqual(e.roh(), undefined, "ein leeres Formular wurde gespeichert");
  });

  it("die blosse Ortsvorbelegung ist kein Stand", () => {
    /*
     * Der Ort wird beim Oeffnen aus dem Standortkontext gefuellt (N2.1) und der
     * Umkreis hat einen Standardwert. Zaehlte das als Entwurf, meldete sich das
     * Formular beim zweiten Besuch mit einem "Stand", den niemand eingegeben
     * hat — und der Kunde suchte, was er angeblich angefangen hatte.
     */
    const e = entwurf();
    // Mit den ECHTEN Standardwerten des Markups (N2.11): headcount steht auf "1".
    assert.strictEqual(e.felder.headcount.value, "1",
      "Vorbedingung: das Markup belegt die Anzahl mit 1 — sonst prueft diese Probe den falschen Fall");
    e.felder.location_city.value = "Münster";
    e.sandkasten._schreiben();
    assert.strictEqual(e.roh(), undefined, "die Vorbelegung allein wurde als Entwurf gespeichert");
  });

  it("ein Feld, das nur seinen Markup-Standard traegt, ist keine Eingabe — eine Aenderung schon", () => {
    const e = entwurf();
    e.felder.headcount.value = "1";           // unveraendert
    e.sandkasten._schreiben();
    assert.strictEqual(e.roh(), undefined, "der Markup-Standard zaehlte als Eingabe");
    e.felder.headcount.value = "2";           // jetzt hat jemand getippt
    e.sandkasten._schreiben();
    assert.strictEqual(JSON.parse(e.roh()).werte.headcount, "2");
  });

  it("nur angeklickte Faehigkeiten sind ein Stand — auch im versteckten Feld", () => {
    /*
     * N2.12 — Befund der Nachpruefung 2026-09-16. `skill_tags` ist versteckt,
     * und dort folgt `defaultValue` dem gesetzten Wert. Wurde der Standard
     * LAUFEND aus `defaultValue` gelesen, konnte eine Auswahl nie als Eingabe
     * zaehlen: wer in Schritt 2 Faehigkeiten anklickte und die Seite verliess,
     * fand beim Wiederkommen nichts vor. Der Standard wird jetzt EINMAL beim
     * Laden festgehalten.
     */
    const e = entwurf();
    assert.strictEqual(e.felder.skill_tags.defaultValue, "",
      "Vorbedingung: das versteckte Feld startet leer");
    e.felder.location_city.value = "Münster";     // nur Vorbelegung
    e.felder.skill_tags.value = "Stapler, Lager"; // die einzige echte Eingabe
    assert.strictEqual(e.felder.skill_tags.defaultValue, "Stapler, Lager",
      "Vorbedingung: bei einem versteckten Feld waechst defaultValue mit");
    e.sandkasten._schreiben();
    const gespeichert = e.roh();
    assert.ok(gespeichert, "die angeklickten Faehigkeiten wurden nicht als Entwurf gesichert");
    assert.strictEqual(JSON.parse(gespeichert).werte.skill_tags, "Stapler, Lager");
  });

  it("sobald etwas Eigenes dazukommt, wird gespeichert — mitsamt Ort", () => {
    const e = entwurf();
    e.felder.location_city.value = "Münster";
    e.felder.title.value = "10 Helfer";
    e.sandkasten._schreiben();
    const gespeichert = JSON.parse(e.roh());
    assert.strictEqual(gespeichert.werte.title, "10 Helfer");
    assert.strictEqual(gespeichert.werte.location_city, "Münster",
      "der Ort faellt aus dem Stand, obwohl er dazugehoert");
  });
});

describe("N2.5 · ein alter Entwurf ist kein Stand mehr", { skip: !da && "Seite fehlt" }, () => {

  it("aelter als sieben Tage wird verworfen, nicht angeboten", () => {
    /*
     * Ein zwei Wochen alter Entwurf traegt ein Startdatum in der Vergangenheit
     * und einen Preisvorschlag von gestern. Ab hier ist ein leeres Formular
     * ehrlicher als ein alter Stand.
     */
    const alt = JSON.stringify({ stand: 1_800_000_000_000 - 8 * TAG, schritt: 2, werte: { title: "alt" } });
    const e = entwurf({ gespeichert: alt });
    assert.strictEqual(e.sandkasten._lesen(), null, "ein acht Tage alter Entwurf wurde angeboten");
    assert.strictEqual(e.roh(), undefined, "der alte Entwurf liegt noch im Speicher");
  });

  it("knapp innerhalb der Frist zaehlt er noch", () => {
    const frisch = JSON.stringify({ stand: 1_800_000_000_000 - 6 * TAG, schritt: 1, werte: { title: "frisch" } });
    const e = entwurf({ gespeichert: frisch });
    assert.ok(e.sandkasten._lesen(), "ein sechs Tage alter Entwurf wurde verworfen");
  });

  it("ohne Zeitstempel gilt er als unbrauchbar", () => {
    const e = entwurf({ gespeichert: JSON.stringify({ werte: { title: "x" } }) });
    assert.strictEqual(e.sandkasten._lesen(), null);
  });
});

describe("N2.5 · der Speicher darf nichts brechen", { skip: !da && "Seite fehlt" }, () => {

  it("beschaedigter Inhalt wirft nicht", () => {
    const e = entwurf({ gespeichert: "{kein json" });
    assert.doesNotThrow(() => e.sandkasten._lesen());
    assert.strictEqual(e.sandkasten._lesen(), null);
  });

  it("ein gesperrter Speicher wirft nicht — weder beim Lesen noch beim Schreiben", () => {
    /*
     * `localStorage` wirft in privaten Fenstern und bei abgeschalteten
     * Seitendaten. Ein Formular, das daran scheitert, waere fuer diese Nutzer
     * unbenutzbar — wegen einer Bequemlichkeit.
     */
    const e = entwurf({ speicherWirft: true });
    e.felder.title.value = "10 Helfer";
    assert.doesNotThrow(() => e.sandkasten._lesen());
    assert.doesNotThrow(() => e.sandkasten._schreiben());
    assert.doesNotThrow(() => e.sandkasten._loeschen());
    assert.doesNotThrow(() => e.sandkasten._wieder());
  });

  it("geloescht heisst geloescht", () => {
    const e = entwurf({ gespeichert: eintrag({ title: "x" }) });
    e.sandkasten._loeschen();
    assert.strictEqual(e.roh(), undefined);
  });
});

describe("N2.5 · nach dem Absenden ist der Entwurf weg", () => {

  it("der Erfolgsweg loescht ihn", { skip: !da && "Seite fehlt" }, () => {
    /*
     * Sonst startet der NAECHSTE Bedarf vorbelegt mit dem vorigen — und der
     * Kunde schickt womoeglich zweimal dasselbe ab, ohne es zu merken.
     * Geprueft an der Stelle, die nur nach einer echten Serverantwort laeuft.
     */
    /* §0.9 (N2.11): hier wurde `renderResult` geprueft. Genau dort war das
       Loeschen falsch — renderResult laeuft auch bei jedem Sprachwechsel, und ein
       Entwurf, der NACH dem Erfolg fuer den naechsten Bedarf begonnen wurde,
       verschwand beim Umschalten (Befund der Pruefung vom 2026-09-15). Geprueft
       wird jetzt der Erfolgszweig des Absendens — und dass renderResult es NICHT
       mehr tut. */
    const erfolg = /postDemand\(body\)\.then\(function\(d\) \{[\s\S]{0,900}/.exec(html);
    assert.ok(erfolg, "der Erfolgszweig des Absendens ist nicht mehr auffindbar");
    assert.match(erfolg[0], /__tcEntwurf.*loeschen\(\)/,
      "nach dem Anlegen bleibt der Entwurf liegen");

    const von = html.indexOf("function renderResult(d) {");
    const bis = html.indexOf("document.addEventListener(\"tc:langchange\"", von);
    assert.ok(von > 0 && bis > von, "renderResult ist nicht mehr auffindbar");
    /* Ohne Kommentare: die Erklaerung, warum das Loeschen hier NICHT mehr steht,
       nennt den Aufruf beim Namen — Prosa ist kein Code. */
    const ohneKommentare = html.slice(von, bis).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/__tcEntwurf.*loeschen\(\)/.test(ohneKommentare), false,
      "renderResult loescht den Entwurf wieder — es laeuft auch beim Sprachwechsel");
  });

  it("und NIRGENDWO sonst — ein zweites Loeschen faellt auf, egal an welcher Stelle", { skip: !da && "Seite fehlt" }, () => {
    /*
     * N2.12 — Befund der Nachpruefung 2026-09-16: die Probe oben schneidet nur
     * `renderResult` aus. Zwei Rueckmutationen ueberlebten sie deshalb, und
     * beide sind echte Rueckschritte:
     *   * `loeschen()` im `tc:langchange`-Hoerer — derselbe Befund wie N2.11,
     *     nur eine Zeile weiter (der Entwurf fuer den NAECHSTEN Bedarf ist weg);
     *   * `loeschen()` im `.catch` des Absendens — ein 402 oder ein Netzfehler
     *     wuerfe die Eingaben des Kunden weg, genau wenn er sie braucht.
     * Deshalb wird jetzt die GANZE Seite gezaehlt: genau EIN Aufruf, und der
     * liegt im Erfolgszweig zwischen `postDemand(...).then(` und `.catch(`.
     */
    const ohneKommentare = html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const treffer = [...ohneKommentare.matchAll(/__tcEntwurf\s*\.\s*loeschen\s*\(\s*\)/g)];
    assert.strictEqual(treffer.length, 1,
      `der Entwurf wird an ${treffer.length} Stellen geloescht — genau eine ist richtig (der Erfolgszweig)`);

    const beginn = ohneKommentare.indexOf("postDemand(body).then(function(d) {");
    const fehlerzweig = ohneKommentare.indexOf(".catch(function(err) {", beginn);
    assert.ok(beginn > 0 && fehlerzweig > beginn, "Erfolgs- und Fehlerzweig des Absendens sind nicht auffindbar");
    assert.ok(treffer[0].index > beginn && treffer[0].index < fehlerzweig,
      "das Loeschen liegt nicht im Erfolgszweig des Absendens");

    /* SELBSTTEST: beide Rueckmutationen muessen die Zaehlung wirklich umwerfen. */
    const zweimal = ohneKommentare.replace(
      "if (window.__tcEntwurf) window.__tcEntwurf.loeschen();",
      "if (window.__tcEntwurf) window.__tcEntwurf.loeschen(); window.__tcEntwurf.loeschen();");
    assert.strictEqual([...zweimal.matchAll(/__tcEntwurf\s*\.\s*loeschen\s*\(\s*\)/g)].length, 2,
      "die Zaehlung wuerde ein zweites Loeschen gar nicht bemerken");
  });

  it("der Entwurf wird vor dem Katalogwaehler wiederhergestellt", { skip: !da && "Seite fehlt" }, () => {
    /*
     * GEMESSENE REIHENFOLGE-FALLE. Der Waehler liest seine Vorauswahl BEIM
     * MONTIEREN aus dem versteckten Feld `skill_tags`. Stuende der Entwurf
     * weiter unten, waeren die Faehigkeiten zwar im Feld, aber nicht
     * angeklickt — und der Kunde saehe einen halben Stand.
     */
    const entwurfPos = html.indexOf('var SCHLUESSEL = "tc_bedarf_entwurf";');
    const waehlerPos = html.indexOf('<script src="/public/js/skillPicker.js">');
    assert.ok(entwurfPos > 0 && waehlerPos > 0, "einer der beiden Bloecke fehlt");
    assert.ok(entwurfPos < waehlerPos,
      "der Entwurf wird erst nach dem Katalogwaehler wiederhergestellt — zu spaet");

    /* SELBSTTEST: die Probe muss die umgekehrte Reihenfolge auch wirklich
       bemerken. Ein Vergleich zweier Positionen ist schnell so geschrieben,
       dass er immer wahr ist. */
    const verdreht = 'x<script src="/public/js/skillPicker.js"></script>y'
      + 'var SCHLUESSEL = "tc_bedarf_entwurf";';
    assert.ok(!(verdreht.indexOf('var SCHLUESSEL = "tc_bedarf_entwurf";')
      < verdreht.indexOf('<script src="/public/js/skillPicker.js">')),
      "der Vergleich wuerde auch die falsche Reihenfolge durchlassen");
  });
});
