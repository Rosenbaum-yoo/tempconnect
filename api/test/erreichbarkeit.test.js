/**
 * Der Waechter gegen die unerreichbare Seite.
 *
 * WARUM ES IHN GIBT
 * `monatsplan.html` wurde end-to-end gebaut, im Browser belegt, ins Register
 * eingetragen — und war danach ueber KEINE Navigation zu finden. Nur wer die
 * URL kannte, kam hin. Gemessen am 2026-08-31 war sie die einzige LEBENDE Seite
 * von 80, auf die das zutraf; die uebrigen neun sind laut Register tot oder
 * ausdruecklich ohne Navigation.
 *
 * Ein Feature, das niemand findet, ist nicht geliefert. Und ob es gefunden
 * werden kann, darf nicht von der Aufmerksamkeit beim Bauen abhaengen —
 * deshalb dieser Test (Owner-Anweisung 2026-08-31: „sorge da immer automatisch
 * fuer").
 *
 * DAS REGISTER IST DIE WAHRHEIT, NICHT EINE ZWEITE LISTE
 * `docs/PLATTFORM_REGISTER.md` fuehrt jede Nutzerflaeche mit einem Zustand und
 * definiert `aktiv` selbst als „echte Datenanbindung UND ERREICHBAR". Genau
 * diese Zusage wird hier geprueft. Eine eigene Ausnahmeliste waere eine zweite
 * Wahrheit, die beim naechsten Umbau auseinanderlaeuft: Ausnahmen muessen im
 * Register stehen und dort ihren Grund nennen.
 *
 * WAS DIESER TEST NICHT LEISTET
 * Er prueft ERREICHBARKEIT, nicht Sichtbarkeit fuer die richtige Rolle. Dass
 * eine Seite in der Navigation steht, heisst nicht, dass der richtige Nutzer sie
 * sieht — das entscheidet `hubVisibility` und wird dort geprueft. Und ein
 * Verweis aus einer anderen Datei zaehlt auch dann, wenn er in einem Kommentar
 * steht; strenger zu sein hiesse, 49 per Tiefenverweis erreichbare Seiten
 * falsch anzuklagen.
 *
 * UEBERTRAGBAR: dieselbe Pruefung gehoert in jedes Folgeprojekt. Sie kostet
 * nichts und faengt einen Fehler, den man beim Bauen nicht sieht, weil man
 * seine eigene URL ja kennt.
 *
 * Run: node --test --test-force-exit test/erreichbarkeit.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Aufwaerts suchen UND auf Inhalt pruefen: Docker legt Mount-Ziele als leere
 * Verzeichnisse an, und ein leeres Verzeichnis macht jede Pruefung lautlos
 * gruen. Beide Startpunkte, weil der Lauf je nach Arbeitsverzeichnis anders
 * beginnt.
 */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, "frontend/public/js/pageShell.js"))
        && fs.existsSync(path.join(dir, "docs/PLATTFORM_REGISTER.md"))) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const vorhanden = ROOT !== null;

/** Jede .html und .js unterhalb von frontend/public. */
function alleDateien(dir, treffer = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) alleDateien(p, treffer);
    else if (/\.(html|js)$/.test(e.name)) treffer.push(p);
  }
  return treffer;
}

/**
 * Das Register, nach Dateiname aufgeschluesselt.
 *
 * Zwei Tabellenformen: die Flaechen-Tabellen (`Seite | Fuer wen | Wozu |
 * Zustand`) und die Weiterleitungs-Tabelle (`Seite | Leitet auf | Zustand`).
 * Beide enden auf dem Zustand, deshalb genuegt die LETZTE Spalte.
 */
function liesRegister(text) {
  const karte = new Map();
  for (const zeile of text.split(/\r?\n/)) {
    if (!zeile.startsWith("|")) continue;
    const spalten = zeile.split("|").map((z) => z.trim());
    // ["", Seite, …, Zustand, ""]
    if (spalten.length < 4) continue;
    /*
     * BEFUND 2026-09-06: dieses Muster liess KEINEN Schraegstrich zu. Die
     * Tabellen nennen die Seite aber mal blank (`about.html`), mal mit Pfad
     * (`frontend/public/about.html`) - beides liest sich gleich gut, und beides
     * kommt vor. Gezaehlt wurden 84 blanke und 17 mit Pfad; die 17 hat dieser
     * Waechter uebersprungen, darunter fuenf LEBENDE Seiten direkt unter
     * `frontend/public/`: pricing, about, onepager, onboarding, whats-new.
     *
     * Fuer die Zusage "kein Feature, das nur seine URL kennt" gab es diese fuenf
     * schlicht nicht. Und das Uebersehen war lautlos: die Probe unten prueft
     * `register.size >= 50`, und 84 erreichen die Schwelle muehelos.
     *
     * Aufgeschluesselt wird jetzt nach DATEINAME, gleich welche Schreibweise die
     * Zeile waehlt.
     */
    const roh = (spalten[1].match(/^`([a-zA-Z0-9_.\-/]+\.html)`$/) || [])[1];
    if (!roh) continue;
    const name = roh.slice(roh.lastIndexOf("/") + 1);
    const zustand = spalten[spalten.length - 2].toLowerCase();
    karte.set(name, { zustand, zeile });
  }
  return karte;
}

/**
 * Nennt die Registerzeile selbst einen Grund, warum die Seite keine Navigation
 * hat? Dann ist sie entschuldigt — der Grund steht dann dort, wo ihn jemand
 * liest, und nicht in einer Testdatei.
 */
function ausnahmeLautRegister(zeile) {
  return /ohne Navigation|öffentlich \(Link\)|oeffentlich \(Link\)/i.test(zeile);
}

/** Die Kernpruefung, als Funktion — damit der Selbsttest sie fuettern kann. */
function unerreichbare({ seiten, register, navZiele, inhalte }) {
  const befunde = [];
  for (const seite of seiten) {
    const eintrag = register.get(seite);
    // Nicht im Register: dafuer ist `dokuWaechter` zustaendig, nicht dieser Test.
    if (!eintrag) continue;
    if (eintrag.zustand === "tot") continue;
    if (ausnahmeLautRegister(eintrag.zeile)) continue;

    if (navZiele.has(seite)) continue;
    let verlinkt = false;
    for (const [datei, text] of inhalte) {
      if (path.basename(datei) === seite) continue;
      if (text.includes(seite)) { verlinkt = true; break; }
    }
    if (!verlinkt) befunde.push({ seite, zustand: eintrag.zustand });
  }
  return befunde;
}

describe("Erreichbarkeit — keine Seite, die nur ihre URL kennt",
  { skip: !vorhanden && "Repo-Wurzel nicht gefunden" }, () => {

  const PUB = vorhanden ? path.join(ROOT, "frontend/public") : null;

  function lage() {
    const register = liesRegister(
      fs.readFileSync(path.join(ROOT, "docs/PLATTFORM_REGISTER.md"), "utf8"));
    const shell = fs.readFileSync(path.join(PUB, "js/pageShell.js"), "utf8");
    const navZiele = new Set(
      [...shell.matchAll(/href:\s*"\/public\/([a-zA-Z0-9_.-]+\.html)"/g)].map((m) => m[1]));
    const seiten = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
    const inhalte = new Map(
      alleDateien(PUB).map((p) => [p, fs.readFileSync(p, "utf8")]));
    return { register, navZiele, seiten, inhalte };
  }

  it("das Register kennt ueberhaupt Seiten und Zustaende", () => {
    /* Ohne diese Probe koennte ein geaendertes Tabellenformat den ganzen
     * Waechter lautlos entwaffnen: eine leere Karte laesst jede Seite durch. */
    const { register } = lage();
    assert.ok(register.size >= 50,
      `nur ${register.size} Seiten im Register erkannt — das Tabellenformat hat sich geaendert`);
    const zustaende = new Set([...register.values()].map((e) => e.zustand));
    assert.ok(zustaende.has("aktiv"), "der Zustand `aktiv` muss vorkommen");
    assert.ok(zustaende.has("tot"), "der Zustand `tot` muss vorkommen");
  });

  it("jede lebende Seite ist von irgendwo aus erreichbar", () => {
    const { register, navZiele, seiten, inhalte } = lage();
    const befunde = unerreichbare({ seiten, register, navZiele, inhalte });
    assert.deepEqual(befunde, [],
      "Diese Seiten fuehrt das Register als lebend, aber niemand kann sie oeffnen:\n"
      + befunde.map((b) => `  * ${b.seite} (${b.zustand})`).join("\n")
      + "\n\nEntweder in die Navigation (frontend/public/js/pageShell.js) eintragen, "
      + "von einer Seite aus verlinken, oder im Register begruenden "
      + "(\"bewusst ohne Navigation\").");
  });

  it("er liest AUCH Zeilen, die den Pfad mitschreiben", () => {
    /*
     * SELBSTTEST zum Befund vom 2026-09-06. Ohne ihn faellt ein Rueckbau des
     * Musters nicht auf: die Karte bliebe gross genug, um die Schwelle oben zu
     * nehmen, und die uebersprungenen Seiten waeren wieder unsichtbar.
     *
     * Geprueft wird an echten Zeilen des Registers, nicht an erfundenen - eine
     * erfundene Zeile beweist nur, dass die Zerlegung funktioniert, nicht dass
     * sie auf das PASST, was wirklich dort steht.
     */
    const { register } = lage();
    for (const seite of ["about.html", "onepager.html", "whats-new.html",
                         "pricing.html", "onboarding.html"]) {
      assert.ok(register.has(seite),
        `${seite} steht im Register (mit Pfad geschrieben), der Waechter sieht sie aber nicht`);
    }
  });

  it("jede lebende Seite unter frontend/public taucht im Register auf", () => {
    /*
     * Die Gegenrichtung zur Kernpruefung: `unerreichbare()` ueberspringt eine
     * Seite, die das Register gar nicht kennt (dafuer ist `dokuWaechter` da).
     * Diese Probe haelt fest, dass es solche Seiten nicht gibt - sonst waere die
     * Zusage dieses Waechters an eine Buchfuehrung geknuepft, die er selbst nicht
     * prueft.
     */
    const { register, seiten } = lage();
    const unbekannt = seiten.filter((s) => !register.has(s));
    assert.deepEqual(unbekannt, [],
      "Diese Seiten gibt es, aber keine Registerzeile nennt sie — fuer die "
      + "Erreichbarkeitspruefung existieren sie damit nicht: " + unbekannt.join(", "));
  });

  it("die Monatsplanung steht in der Navigation — nicht nur in einem Verweis", () => {
    /* Der Anlass dieses Waechters, als eigener Fall festgehalten: ein Verweis
     * von irgendwoher genuegt der allgemeinen Regel, aber eine Arbeitsflaeche,
     * die man taeglich aufschlaegt, gehoert in die Navigation. */
    const { navZiele } = lage();
    assert.ok(navZiele.has("monatsplan.html"),
      "die Monatsplanung muss ueber die Navigation erreichbar sein");
  });

  it("er wuerde eine neue unerreichbare Seite bemerken", () => {
    /* SELBSTTEST. Ein Waechter, der nie anschlaegt, ist von einem kaputten
     * nicht zu unterscheiden — diese Falle ist in dieser Codebasis mehrfach
     * zugeschnappt. Hier wird eine Seite ERFUNDEN, die es nicht gibt, und
     * geprueft, dass der Befund sie nennt. */
    const { navZiele, inhalte } = lage();
    const erfunden = "erfundene-flaeche-die-niemand-verlinkt.html";
    const register = new Map([[erfunden, {
      zustand: "aktiv",
      zeile: `| \`${erfunden}\` | jemand | irgendwas | aktiv |`
    }]]);

    const befunde = unerreichbare({
      seiten: [erfunden], register, navZiele, inhalte
    });
    assert.equal(befunde.length, 1, "die erfundene Seite muss auffallen");
    assert.equal(befunde[0].seite, erfunden);
  });

  it("er laesst eine tote Seite und eine begruendete Ausnahme in Ruhe", () => {
    /* Die Gegenprobe zum Selbsttest: ein Waechter, der ALLES anklagt, wird
     * abgeschaltet. `tot` und eine im Register begruendete Ausnahme duerfen
     * nicht als Befund erscheinen. */
    const { navZiele, inhalte } = lage();
    const tot = "erfundene-tote-seite.html";
    const begruendet = "erfundene-einladungsseite.html";
    const register = new Map([
      [tot, { zustand: "tot", zeile: `| \`${tot}\` | \`woanders.html\` | tot |` }],
      [begruendet, {
        zustand: "aktiv",
        zeile: `| \`${begruendet}\` | neue Mitglieder | aus der E-Mail; bewusst ohne Navigation | aktiv |`
      }]
    ]);

    assert.deepEqual(
      unerreichbare({ seiten: [tot, begruendet], register, navZiele, inhalte }), [],
      "eine tote Seite und eine im Register begruendete Ausnahme sind kein Befund");
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
 * N2.6 — BESTIMMTE WEGE, NICHT NUR IRGENDEINER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Der Waechter oben fragt: "ist diese Seite von IRGENDWO erreichbar?" Das ist
 * die richtige Grundfrage, aber sie war fuer die Bedarfsanlage schon gruen,
 * als der Weg fehlte, auf den es ankommt.
 *
 * Owner-Vorgabe (Welle N, Phase N2.6): die Bedarfsanlage ist "erreichbar aus
 * der PERSONALSUCHE, nicht von einer eigenen Seite". Gemessen am 2026-09-07
 * verlinkten sie `marketplace_demand_list`, `enterprise`, `notdienst_leitstand`
 * und `matching_results` — ausgerechnet `capacity_search` nicht. Also genau die
 * Flaeche, auf der ein Unternehmen sucht und nichts findet.
 *
 * Ein Weg, den niemand festhaelt, faellt beim naechsten Umbau still wieder
 * heraus. Deshalb steht hier nicht "irgendwo verlinkt", sondern WOHER WOHIN.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("Erreichbarkeit — die Wege, auf die es ankommt",
  { skip: !vorhanden && "Repo-Wurzel nicht gefunden" }, () => {

  const PUB = vorhanden ? path.join(ROOT, "frontend/public") : null;

  /** Von → Nach, mit dem Grund, warum genau dieser Weg zaehlt. */
  const WEGE = [
    {
      von: "capacity_search.html",
      nach: "marketplace_demand_create.html",
      grund: "Wer Personal sucht und nichts findet, muss den Bedarf ausschreiben "
        + "koennen, ohne die Flaeche zu wechseln (N2.6)."
    }
  ];

  /*
   * WAS ALS "DAUERHAFT DA" ZAEHLT.
   *
   * Nachgetragen 2026-09-08 nach einer Rueckmutation, die UEBERLIEF: der
   * dauerhafte Verweis wurde nicht geloescht, sondern AUSKOMMENTIERT — und die
   * Probe blieb gruen. Genau so verschwinden Wege bei einem Umbau; haeufiger
   * als durch Loeschen. Der Selbsttest unten deckte die Luecke nicht ab, weil
   * er den NAMEN in einem Kommentar prueft, nicht ein href IN einem Kommentar.
   *
   * Skripte fallen raus, weil ihr Inhalt zustandsabhaengig ist (dafuer gibt es
   * die Leerzustands-Probe). Kommentare fallen raus, weil sie nichts anzeigen.
   */
  const statischesMarkup = (quelle) => quelle
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const verweisMuster = (nach) =>
    new RegExp('href\\s*=\\s*"[^"]*' + nach.replace(/\./g, "\\."), "i");

  /* Der Block, den eine oeffnende Klammer beginnt — bis zur PASSENDEN
     schliessenden. Klammern in Zeichenketten zaehlen nicht mit.

     N2.12 (Befund der Nachpruefung 2026-09-16): Kommentare und regulaere
     Ausdruecke koennen ein einzelnes Anfuehrungszeichen tragen (`var rx=/["]/;`
     oder ein Apostroph in einem Kommentar). Wer sie fuer Text haelt, verliert
     die Spur und liest ueber das Ende des Zweigs hinaus — die Probe waere dann
     still gruen. Deshalb werden Kommentare ZUERST entfernt, und der Aufrufer
     bekommt einen Zweig, der nachweislich dort endet, wo er enden soll. */
  const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const zweigNach = (rohquelle, kopf) => {
    const quelle = ohneKommentare(rohquelle);
    const m = kopf.exec(quelle);
    if (!m) return null;
    let tiefe = 0;
    let inText = null;
    for (let i = m.index + m[0].length - 1; i < quelle.length; i++) {
      const z = quelle[i];
      if (inText) {
        if (z === "\\") { i++; continue; }
        if (z === inText) inText = null;
        continue;
      }
      /* Ein Anfuehrungszeichen INNERHALB eines regulaeren Ausdrucks ist kein
         Textanfang. Die Zeichenklasse ueberspringen wir als Ganzes. */
      if (z === "[" && quelle.slice(Math.max(0, i - 40), i).includes("/")) {
        const zu = quelle.indexOf("]", i);
        if (zu > i) { i = zu; continue; }
      }
      if (z === "'" || z === '"' || z === "`") { inText = z; continue; }
      if (z === "{") tiefe++;
      else if (z === "}" && --tiefe === 0) return quelle.slice(m.index, i + 1);
    }
    return null;
  };

  /* Der Leerzweig MIT Riegel: verlaeuft sich die Klammersuche doch einmal,
     endet sie im Treffer-Zweig — und dort steht `matches.forEach`. Dann gibt es
     hier `null` statt eines zu langen Blocks, und die Probe wird ROT statt
     still gruen. Beides steht bewusst in EINER Funktion, damit der Selbsttest
     unten denselben Weg prueft wie die Probe. */
  const leerzweigVon = (quelle) => {
    const block = zweigNach(quelle, /matches\.length === 0\)\s*\{/);
    if (!block || /matches\.forEach/.test(block)) return null;
    return block;
  };

  for (const weg of WEGE) {
    it(`${weg.von} fuehrt zu ${weg.nach}`, () => {
      /*
       * ERST NACH ZWEI RUECKMUTATIONEN RICHTIG.
       *
       * Die erste Fassung fragte nur, ob IRGENDWO auf der Seite ein Verweis
       * steht. Damit war sie auch dann gruen, wenn der dauerhafte Weg entfernt
       * wurde und nur noch der im Leerzustand uebrig blieb — der erscheint aber
       * erst, wenn eine Suche null Treffer hatte. Wer noch nicht gesucht hat
       * oder wer Treffer bekam, haette dann keinen Weg.
       *
       * Geprueft wird deshalb das STATISCHE Markup: die Skriptbloecke werden
       * herausgeschnitten, und der Verweis muss in dem stehen, was uebrig
       * bleibt. Das ist der Weg, der unabhaengig von jedem Zustand da ist.
       *
       * Und auf das ATTRIBUT, nicht auf das Vorkommen des Namens: eine
       * Erwaehnung in einem Kommentar oder Woerterbuch-Eintrag ist kein Weg.
       */
      const quelle = statischesMarkup(
        fs.readFileSync(path.join(PUB, weg.von), "utf8"));
      assert.match(quelle, verweisMuster(weg.nach),
        `${weg.von} verlinkt ${weg.nach} nicht.\n  Warum das zaehlt: ${weg.grund}`);
    });

    it(`${weg.von} bietet ${weg.nach} auch im Leerzustand an`, () => {
      /*
       * Der zweite, kontextbezogene Weg: wer gesucht und nichts gefunden hat,
       * braucht den naechsten Schritt DORT, wo die Enttaeuschung steht. Ein
       * Hinweis ohne naechsten Schritt ist eine Sackgasse.
       */
      const quelle = fs.readFileSync(path.join(PUB, weg.von), "utf8");
      /* N2.11 — Befund der Pruefung vom 2026-09-15: hier wurden 900 Zeichen ab
         `matches.length === 0` ausgeschnitten. Das `} else {` des Treffer-Zweigs
         liegt nach ~750 Zeichen — ein Verweis im TREFFER-Zweig galt damit als
         Leerzustand. Jetzt genau der Block zwischen den passenden Klammern. */
      const leerzweig = leerzweigVon(quelle);
      assert.ok(leerzweig,
        "der Leerzustand ist nicht auffindbar — oder der ausgeschnittene Block reicht bis in den Treffer-Zweig");
      assert.match(leerzweig, verweisMuster(weg.nach),
        "der Leerzustand nennt keinen naechsten Schritt");
    });

    it(`der Leerzustand-Waechter zaehlt einen Verweis im Treffer-Zweig NICHT mit (${weg.nach})`, () => {
      /* Selbsttest: genau die Rueckmutation, die die 900-Zeichen-Fassung ueberlebte. */
      const verschoben = `if (matches.length === 0) { html += '<div class="empty">nichts</div>'; } else { matches.forEach(function(m) { html += '<a href="/public/${weg.nach}">x</a>'; }); }`;
      const nurLeerzweig = leerzweigVon(verschoben);
      assert.ok(nurLeerzweig, "Vorbedingung: der Leerzweig ist sauber begrenzt und wird gefunden");
      assert.ok(!verweisMuster(weg.nach).test(nurLeerzweig),
        "ein Verweis hinter `} else {` gilt als Leerzustand");
      const richtig = `if (matches.length === 0) { html += '<a href="/public/${weg.nach}">x</a>'; } else { matches.forEach(function(m) { html += '<b>t</b>'; }); }`;
      assert.ok(verweisMuster(weg.nach).test(leerzweigVon(richtig)),
        "ein Verweis IM Leerzustand wird nicht erkannt");

      /*
       * N2.12 — die zwei Faelle, an denen sich die Klammersuche verlaufen hat.
       * Der Leerzweig traegt hier ABSICHTLICH keine Zeichenkette: dann bleibt
       * das einzelne Anfuehrungszeichen aus Kommentar bzw. regulaerem Ausdruck
       * ohne Gegenstueck, die Suche laeuft bis ins Dateiende — und wer das nicht
       * bemerkt, haelt den Treffer-Zweig fuer den Leerzustand.
       */
      const sauberOhneVerweis = (quelle, was) => {
        const block = leerzweigVon(quelle);
        /* Entweder die Suche verlaeuft sich (dann greift der Riegel und liefert
           null) oder sie liest den Treffer-Zweig mit — beides ist hier rot. */
        assert.ok(block, `${was}: der Leerzweig wurde gar nicht mehr sauber gefunden`);
        assert.ok(!verweisMuster(weg.nach).test(block),
          `${was}: der Leerzweig reicht bis in den Treffer-Zweig`);
      };
      sauberOhneVerweis(
        `if (matches.length === 0) { /* der Kunde's Weg */ html += leer; } else { matches.forEach(function(m) { html += '<a href="/public/${weg.nach}">x</a>'; }); }`,
        "ein Apostroph im Kommentar");
      sauberOhneVerweis(
        `if (matches.length === 0) { var rx=/['"]/; html += leer; } else { matches.forEach(function(m) { html += '<a href="/public/${weg.nach}">x</a>'; }); }`,
        "ein Anfuehrungszeichen in einem regulaeren Ausdruck");

      /*
       * UND DER RIEGEL SELBST. Eine geschweifte Klammer in einem regulaeren
       * Ausdruck (`/\\{/`) zaehlt die Suche mit — dagegen hilft kein
       * Kommentar-Entfernen. Der Block reicht dann in den Treffer-Zweig, und
       * genau dafuer gibt es den Riegel: lieber NICHTS liefern (die Probe wird
       * rot) als den falschen Block (sie bliebe still gruen).
       */
      const mitKlammerImRegex = `function zeichne() { if (matches.length === 0) { var rx=/\\{/; html += leer; } else { matches.forEach(function(m) { html += '<a href="/public/${weg.nach}">x</a>'; }); } }`;
      assert.equal(leerzweigVon(mitKlammerImRegex), null,
        "die Klammersuche liefert einen zu langen Block, statt ihn zu verweigern — der Riegel fehlt");
    });

    it(`der Waechter haelt eine blosse Erwaehnung von ${weg.nach} nicht fuer einen Weg`, () => {
      /*
       * SELBSTTEST des Musters oben. Ohne ihn koennte jemand die Pruefung auf
       * `includes(name)` zurueckbauen — sie bliebe gruen, und ein Weg, der nur
       * noch als Wort im Kommentar existiert, gaelte als vorhanden.
       */
      const muster = verweisMuster(weg.nach);
      assert.ok(!muster.test(`<!-- siehe ${weg.nach} --> <p>${weg.nach}</p>`),
        "das Muster haelt eine blosse Erwaehnung faelschlich fuer einen Weg");
      assert.ok(muster.test(`<a href="/public/${weg.nach}">x</a>`),
        "das Muster erkennt einen echten Verweis nicht");

      /*
       * Und der Fall, der die erste Fassung ueberlebt hat: ein Verweis, der
       * noch dasteht, aber auskommentiert ist. Das Muster allein sieht ihn —
       * deshalb muss `statischesMarkup` ihn vorher wegnehmen.
       */
      const auskommentiert = `<!-- <a href="/public/${weg.nach}">x</a> -->`;
      assert.ok(muster.test(auskommentiert),
        "Vorbedingung: das Muster allein sieht auch den auskommentierten Verweis");
      assert.ok(!muster.test(statischesMarkup(auskommentiert)),
        "ein auskommentierter Verweis gilt faelschlich als Weg");
      assert.ok(muster.test(statischesMarkup(`<a href="/public/${weg.nach}">x</a>`)),
        "statischesMarkup verschluckt einen echten Verweis");
    });
  }
});
