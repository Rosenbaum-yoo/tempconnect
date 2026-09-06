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
