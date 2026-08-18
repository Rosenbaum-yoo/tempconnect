/**
 * Welle G5 — die Oberflaeche der Selbst-Abmeldung im Einsatzportal.
 *
 * DAS GATE DIESER WELLE, WOERTLICH:
 *   "Kein Zustand ohne Anzeige (Lade-, Leer-, Fehlerfall); der dritte Schritt
 *    zeigt echte Einsatzdaten aus folgenVorschau(), keine Platzhalter."
 *
 * WAS DIESE DATEI PRUEFT UND WARUM SO
 * Eine Oberflaeche laesst sich ohne Browser nur am Markup und am Quelltext
 * pruefen. Das ist weniger, als ein Klicktest zeigen wuerde — aber es faengt
 * genau die Fehlerklasse, die in G4 dreimal aufgetreten ist: etwas ist
 * vollstaendig gebaut und wird von niemandem aufgerufen, geladen oder erreicht.
 * Deshalb steht hier ueberall die Frage "wer ruft das auf, wer laedt das,
 * wohin fuehrt das" statt "sieht es gut aus".
 *
 * Run: node --test --test-force-exit test/g5AbwesenheitOberflaeche.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BESCHREIBUNG_FRAGEN,
  BESCHREIBUNG_MINDESTWOERTER,
  ABSENCE_ARTEN,
  VERSPAETUNG_MAX_MINUTEN,
} from "../services/workerAbsenceService.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HIER, "..", "..");
const PUB = path.join(REPO, "frontend", "public");

const SEITE = path.join(PUB, "einsatzportal-abwesenheit.html");
const LOGIK = path.join(PUB, "js", "workerPortal", "portalAbwesenheit.js");
const SHELL = path.join(PUB, "js", "workerPortal", "portalShell.js");
const API = path.join(PUB, "js", "workerPortal", "portalApi.js");

const lies = (p) => fs.readFileSync(p, "utf8");

/**
 * Kommentare entfernen, bevor in Code gesucht wird.
 *
 * DIESELBE FALLE WIE IN G4: Die reparierte Stelle in portalApi.js ZITIERT den
 * alten, kaputten Aufruf in ihrer Begruendung. Ohne diesen Schritt schlaegt der
 * Waechter auf seiner eigenen Dokumentation an — und zwingt dazu, den Fehler
 * unbeschreibbar zu machen. Dann steht nirgends mehr, warum es die Regel gibt.
 */
const ohneKommentare = (q) =>
  String(q).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
const portalSeiten = () =>
  fs.readdirSync(PUB).filter((f) => /^einsatzportal-[a-z]+\.html$/.test(f));

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. Die Seite existiert und ist vollstaendig verdrahtet
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — die Seite ist an die Shell angeschlossen", () => {
  it("Seite und Logik existieren", () => {
    assert.ok(fs.existsSync(SEITE), "einsatzportal-abwesenheit.html fehlt");
    assert.ok(fs.existsSync(LOGIK), "portalAbwesenheit.js fehlt");
  });

  it("die Logikdatei wird von der Seite auch GELADEN", () => {
    /* Die Lehre aus G4: `toast.js` war vollstaendig gebaut und von keiner Seite
     * eingebunden. Ein Test auf "die Datei existiert" haette das bestaetigt. */
    const html = lies(SEITE);
    assert.match(html, /<script src="\/public\/js\/workerPortal\/portalAbwesenheit\.js"><\/script>/,
      "die Seite laedt ihre eigene Logik nicht — jeder Handler liefe ins Leere");
  });

  it("die Ladereihenfolge stimmt: portalApi vor portalShell vor der Seitenlogik", () => {
    const html = lies(SEITE);
    const i = (s) => html.indexOf(s);
    assert.ok(i("portalApi.js") < i("portalShell.js"), "portalShell braucht PortalApi");
    assert.ok(i("portalShell.js") < i("portalAbwesenheit.js"), "die Seitenlogik braucht PortalShell");
  });

  it("die Pflicht-Elemente der Shell sind vorhanden", () => {
    const html = lies(SEITE);
    for (const id of ["sd-ava", "sd-name", "mob-badge", "sb-badge", "bn-dot", "ep-toast", "loading", "content"]) {
      assert.ok(html.includes(`id="${id}"`), `#${id} fehlt — die Shell greift darauf zu`);
    }
    assert.ok(html.includes('class="ep-content"'), ".ep-content fehlt — showError() haengt dort an");
    assert.ok(html.includes('class="ep-preauth"'), "ohne ep-preauth blitzt die Huelle fuer Nicht-Angemeldete auf");
  });

  it("jeder onclick zeigt auf eine Funktion, die es gibt", () => {
    const html = lies(SEITE);
    const logik = lies(LOGIK);
    const treffer = [...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\.?([\w$]*)\(/g)];
    assert.ok(treffer.length > 0, "die Seite hat keine Handler — dann ist sie nicht bedienbar");
    for (const [, objekt, methode] of treffer) {
      if (objekt === "AwPage") {
        assert.ok(new RegExp(`${methode}\\s*:`).test(logik) || new RegExp(`function ${methode}\\b`).test(logik),
          `AwPage.${methode} wird aufgerufen, ist aber nicht definiert`);
      } else {
        assert.ok(objekt === "doLogout", `unbekannter Handler ${objekt}`);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. Kein Zustand ohne Anzeige  (das Gate)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — jeder Zustand hat eine Anzeige", () => {
  it("Ladezustand: Skelett im Markup, danach umgeschaltet", () => {
    const html = lies(SEITE);
    const logik = lies(LOGIK);
    assert.ok(html.includes('class="ep-skel"'), "kein Ladeskelett");
    assert.match(logik, /loading'\)\.style\.display = 'none'/, "der Ladezustand wird nie beendet");
    assert.match(logik, /content'\)\.style\.display = ''/, "der Inhalt wird nie eingeblendet");
  });

  it("Leerzustand: die Folgen-Liste sagt, dass NICHTS betroffen ist", () => {
    const logik = lies(LOGIK);
    assert.match(logik, /ep\.abwesenheit\.s3\.none/,
      "ohne eigene Aussage im Leerfall bleibt Schritt 3 leer und der Mensch raet");
    assert.match(logik, /ep\.abwesenheit\.list\.empty/, "die Meldungsliste hat keinen Leerzustand");
  });

  it("Fehlerzustand ist von LEER unterscheidbar", () => {
    /* Der gefaehrlichste Verwechslungsfall dieser Welle: Schlaegt die
     * Folgen-Abfrage fehl und sieht das aus wie "kein Einsatz betroffen",
     * meldet sich jemand ab im Glauben, es sei nichts zu verlieren. */
    const logik = lies(LOGIK);
    assert.match(logik, /ep\.abwesenheit\.s3\.loadFail/,
      "ein Fehler beim Laden der Folgen hat keine eigene Meldung");
    assert.ok(logik.indexOf("s3.loadFail") !== logik.indexOf("s3.none"),
      "Fehler und Leerfall benutzen denselben Text");
  });

  it("jeder Fehlercode des Servers hat einen eigenen Satz", () => {
    const logik = lies(LOGIK);
    for (const code of ["ZEITSPERRE", "VORGANG_NICHT_EROEFFNET", "BESCHREIBUNG_ZU_KURZ", "ABSENCE_OVERLAP"]) {
      assert.ok(logik.includes(code), `${code} wird nicht behandelt — der Mensch saehe nur "hat nicht geklappt"`);
    }
  });

  it("Lade-, Leer- und Fehlerzustand sind bei jeder der drei Listen gedeckt", () => {
    const logik = lies(LOGIK);
    // Folgen-Liste
    assert.match(logik, /folgenBox[\s\S]*?ep-skel/, "die Folgen-Liste hat kein Ladeskelett");
    // Meldungs-Liste
    assert.match(logik, /meineBox[\s\S]*?ep-skel/, "die Meldungsliste hat kein Ladeskelett");
    assert.match(logik, /ep\.abwesenheit\.list\.fail/, "die Meldungsliste hat keinen Fehlerzustand");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. Die Regeln liegen hinten — die Oberflaeche zeigt sie nur an
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — die Oberflaeche setzt keine Regel selbst durch", () => {
  it("der Absenden-Knopf wird NICHT von der Zeitsperre gesperrt", () => {
    /* G-E6 und die Uebergabe verlangen das ausdruecklich: Der Browser zeigt den
     * Zaehler nur an. Ein clientseitig gesperrter Knopf waere eine Attrappe —
     * ueber die Entwicklerkonsole in zehn Sekunden frei — und wuerde bei
     * driftendem Zaehler jemanden aussperren, der laengst darf. */
    const logik = lies(LOGIK);
    const block = logik.slice(logik.indexOf("function pruefeAbsenden"), logik.indexOf("function fehlerZeigen"));
    assert.ok(!/_sperreBis/.test(block),
      "pruefeAbsenden() wertet die Zeitsperre aus — sie gehoert hinten, nicht hierher");
    assert.ok(/awBestaetigt/.test(block), "die ausdrueckliche Bestaetigung fehlt als Bedingung");
  });

  it("nach ZEITSPERRE wird die Restzeit des SERVERS uebernommen", () => {
    const logik = lies(LOGIK);
    assert.match(logik, /verbleibend_sekunden/,
      "die Restzeit aus der Server-Antwort wird nicht ausgewertet");
  });

  it("der Zaehler gleicht sich ab, wenn der Tab zurueckkommt", () => {
    /* Ein Mobil-Tab im Hintergrund friert Timer ein. Ohne Abgleich zeigt die
     * Seite eine Zahl, die mit dem Server nichts mehr zu tun hat. */
    const logik = lies(LOGIK);
    assert.match(logik, /visibilitychange/, "kein Server-Abgleich nach dem Zurueckkehren");
  });

  it("die Wortzahl-Anzeige nennt die FEHLENDEN Woerter", () => {
    const logik = lies(LOGIK);
    assert.match(logik, /words\.missing/, "der Zaehler sagt nicht, wie viele Woerter fehlen");
    assert.ok(logik.includes("MINDEST_WOERTER = " + BESCHREIBUNG_MINDESTWOERTER),
      `die Oberflaeche rechnet mit einer anderen Mindestzahl als der Server (${BESCHREIBUNG_MINDESTWOERTER})`);
  });

  it("die Verspaetung wird NICHT clientseitig gedeckelt", () => {
    /* Die Obergrenze VERWEIST auf den schweren Weg. Ein clientseitiger Deckel
     * macht genau diese Bruecke unerreichbar — der Service-Kommentar nennt sie
     * als Entwurfszweck. */
    const logik = lies(LOGIK);
    assert.match(logik, /KEINE_VERSPAETUNG_MEHR/,
      "die Antwort des Servers auf eine zu lange Verspaetung wird nicht ausgewertet");
    assert.match(logik, /delay\.tooLong/, "der Verweis auf den anderen Weg fehlt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Anzeige und Akte sagen dasselbe
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — kein Auseinanderdriften zwischen Oberflaeche und Server", () => {
  it("die vier Fragen stehen WORTGLEICH in Oberflaeche und Dienst", () => {
    /* Der Server setzt seinen Fragetext woertlich vor die Antwort und legt
     * beides in der Akte ab. Weicht die Anzeige ab, liest der Disponent eine
     * andere Frage, als der Mensch beantwortet hat. */
    const logik = lies(LOGIK);
    for (const f of BESCHREIBUNG_FRAGEN) {
      assert.ok(logik.includes(f.schluessel),
        `Feldname ${f.schluessel} fehlt in der Oberflaeche — die Antwort kaeme nie an`);
      assert.ok(logik.includes(f.frage),
        `der Fragetext "${f.frage}" weicht ab — Anzeige und Akte driften auseinander`);
    }
  });

  it("alle vier Arten sind waehlbar, ohne Vorbelegung", () => {
    const logik = lies(LOGIK);
    for (const a of ABSENCE_ARTEN) {
      assert.ok(logik.includes(`'${a}'`), `die Art "${a}" fehlt in der Auswahl`);
    }
    assert.match(logik, /var _art = null/, "eine Art ist vorbelegt — G-E5 verlangt eine bewusste Wahl");
  });

  it("die Obergrenze der Verspaetung stimmt mit dem Dienst ueberein", () => {
    const logik = lies(LOGIK);
    assert.ok(logik.includes("VERSPAETUNG_MAX = " + VERSPAETUNG_MAX_MINUTEN),
      `die Oberflaeche nennt eine andere Obergrenze als der Dienst (${VERSPAETUNG_MAX_MINUTEN})`);
  });

  it("die Erfolgsmeldung beschoenigt nicht, wenn niemand erreicht wurde", () => {
    /* Der Route-Kommentar sagt ausdruecklich: bei 0 SOLL zum Anruf geraten
     * werden. Ein pauschales "erledigt" waere genau die Beschoenigung, die der
     * Code vermeidet. */
    const logik = lies(LOGIK);
    assert.match(logik, /buero_benachrichtigt/, "die ehrliche Zahl wird nicht ausgewertet");
    assert.match(logik, /sentSilent/, "es fehlt der Hinweis, zusaetzlich anzurufen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Erreichbarkeit — der Weg muss existieren, wenn man ihn braucht
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — die Seite ist von ueberall erreichbar", () => {
  it("JEDE Portalseite verweist auf sie — Seitenleiste UND Kurznavigation", () => {
    /* Die Navigation ist in jeder Seite dupliziert. Genau deshalb braucht sie
     * einen Waechter: Eine vergessene Seite faellt sonst niemandem auf, bis
     * jemand dort steht und den Weg sucht. */
    const fehlend = [];
    for (const datei of portalSeiten()) {
      const html = lies(path.join(PUB, datei));
      const sidebar = /ep-sidebar-item[^>]*href="einsatzportal-abwesenheit\.html"/.test(html);
      const bottom = /ep-bn-item[^>]*href="einsatzportal-abwesenheit\.html"/.test(html);
      if (!sidebar) fehlend.push(`${datei}: Seitenleiste`);
      if (!bottom) fehlend.push(`${datei}: Kurznavigation`);
    }
    assert.deepEqual(fehlend, [],
      "diese Seiten fuehren nicht zur Abwesenheitsmeldung:\n  " + fehlend.join("\n  "));
  });

  it("die Kurznavigation ist der mobile Weg — unter 1024px gibt es keinen anderen", () => {
    const html = lies(SEITE);
    assert.match(html, /ep-bn-item[^>]*href="einsatzportal-abwesenheit\.html"/,
      "ohne Platz in der Kurznavigation existiert der Reiter auf dem Telefon nicht — " +
      "und genau dort meldet sich jemand um sechs Uhr frueh krank");
  });

  it("alle Portalseiten zeigen DIESELBE Navigation, in derselben Reihenfolge", () => {
    /* Die Navigation ist in jeder Seite dupliziert — ohne Waechter driftet sie.
     * Genau das ist beim Bauen dieser Welle passiert: Die neue Seite hatte
     * versehentlich 'Plan' durch 'Melden' ERSETZT statt ergaenzt, und damit
     * eine andere Leiste als alle anderen. Im Browser gemessen, nicht im Kopf. */
    const reihenfolge = (html, klasse) =>
      [...html.matchAll(new RegExp(klasse + '[^>]*href="(einsatzportal-[a-z]+\.html)"', "g"))].map((m) => m[1]);

    const seiten = portalSeiten();
    const referenz = {
      sidebar: reihenfolge(lies(path.join(PUB, seiten[0])), "ep-sidebar-item"),
      bottom: reihenfolge(lies(path.join(PUB, seiten[0])), "ep-bn-item"),
    };
    assert.ok(referenz.bottom.length >= 7, "die Kurznavigation hat den neuen Eintrag nicht");

    for (const datei of seiten.slice(1)) {
      const html = lies(path.join(PUB, datei));
      assert.deepEqual(reihenfolge(html, "ep-sidebar-item"), referenz.sidebar,
        `${datei}: die Seitenleiste weicht von ${seiten[0]} ab`);
      assert.deepEqual(reihenfolge(html, "ep-bn-item"), referenz.bottom,
        `${datei}: die Kurznavigation weicht von ${seiten[0]} ab`);
    }
  });

  it("die Kurznavigation bleibt auf dem schmalsten Geraet lesbar", () => {
    /* Bei 320px (iPhone SE) teilen sich die Eintraege je 45px — im Browser
     * gemessen, kein Eintrag bricht um, der knappste hat 8px Luft. Ein ACHTER
     * Eintrag draengte das unter die Grenze. Diese Zahl ist deshalb keine
     * Kosmetik, sondern die Obergrenze. */
    const html = lies(SEITE);
    const n = (html.match(/ep-bn-item/g) || []).length;
    assert.ok(n <= 7,
      `${n} Eintraege in der Kurznavigation — bei 320px blieben je ${Math.floor(312 / n)}px, ` +
      "und der breiteste Text braucht 36px plus Abstand. Ein Eintrag muss weichen.");
  });

  it("das Dashboard fuehrt prominent hin", () => {
    const html = lies(path.join(PUB, "einsatzportal-dashboard.html"));
    assert.match(html, /id="abwesenheitZugang"/, "der Zugang auf dem Dashboard fehlt");
    const zugang = html.indexOf('id="abwesenheitZugang"');
    const stats = html.indexOf('id="statsStrip"');
    assert.ok(zugang < stats && zugang > 0,
      "der Zugang steht nicht weit oben — er muss vor den Kennzahlen kommen");
  });

  it("die Seite bleibt bei unvollstaendiger Aufnahme erreichbar", () => {
    /* Wer krank ist, ist krank — unabhaengig davon, ob sein Profil vollstaendig
     * ist. Ihn ausgerechnet auf dem Notfallweg zur Profilpflege umzuleiten,
     * waere die schlechteste denkbare Stelle dafuer. */
    const shell = lies(SHELL);
    const zeile = shell.split("\n").find((z) => z.includes("AUFNAHME_FREI ="));
    assert.ok(zeile && zeile.includes("einsatzportal-abwesenheit.html"),
      "die Seite steht nicht in AUFNAHME_FREI — _enforceOnboarding leitet den Notfallweg um");
  });

  it("der alte, leichte Abmeldeweg fuehrt jetzt ueber die Huerde", () => {
    /* Solange ein zweiter Weg ohne Zeitsperre, ohne Mindestbeschreibung und
     * ohne Folgenanzeige offensteht, ist die dreistufige Huerde Dekoration. */
    const html = lies(path.join(PUB, "einsatzportal-einsaetze.html"));
    assert.ok(!html.includes("submitUnavailable"),
      "der alte Absendeweg existiert noch — wer es eilig hat, nimmt ihn");
    assert.ok(!html.includes('id="unavailableForm-'),
      "das alte Formular steht noch im Markup");
    assert.match(html, /einsatzportal-abwesenheit\.html/,
      "der alte Knopf leitet nicht auf den neuen Ablauf um");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6. Der Zustellweg der Antwort — die Luecke, die G5 aufgedeckt hat
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — 429 traegt seinen Rumpf bis in den Browser", () => {
  it("portalApi wirft bei 429 NICHT mehr vor dem Lesen des Rumpfes", () => {
    /* HIER WAR EINE ECHTE LUECKE: `throw new PortalApiError('RATE_LIMITED', 429)`
     * stand VOR dem Body-Parsen, ohne drittes Argument. Damit erreichte
     * `verbleibend_sekunden` den Browser nie — der Zaehler der Zeitsperre haette
     * nie eine echte Zahl zeigen koennen. */
    const api = ohneKommentare(lies(API));
    assert.ok(!/throw new PortalApiError\('RATE_LIMITED', 429\)/.test(api),
      "429 wirft wieder ohne Rumpf — die Restzeit der Zeitsperre geht verloren");
    assert.match(api, /_zuVieleAnfragen/, "der gemeinsame 429-Pfad fehlt");
  });

  it("BEIDE 429-Stellen sind versorgt — apiJson und upload", () => {
    const api = lies(API);
    const n = (api.match(/await _zuVieleAnfragen\(r\)/g) || []).length;
    assert.equal(n, 2,
      `nur ${n} von 2 Stellen versorgt — die zweite steht in upload() und faellt sonst zurueck`);
  });

  it("der Fehlercode kommt aus dem Rumpf, sonst RATE_LIMITED", () => {
    /* Unter 429 liegen zwei verschiedene Dinge: die fachliche Zeitsperre und
     * das technische Anfragenlimit. Sie sind nur am Rumpf zu unterscheiden. */
    const api = lies(API);
    const block = api.slice(api.indexOf("async function _zuVieleAnfragen"), api.indexOf("/* ── CSRF"));
    assert.match(block, /rumpf\.error/, "der fachliche Code wird nicht aus dem Rumpf genommen");
    assert.match(block, /'RATE_LIMITED'/, "der technische Rueckfall fehlt");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 7. Die Quittung
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("G5 — nach dem Absenden bleibt etwas sichtbar", () => {
  it("die Seite laedt die eigenen Meldungen", () => {
    const logik = lies(LOGIK);
    assert.match(logik, /\/worker\/me\/abwesenheiten/,
      "ohne Lesepfad endet der Ablauf ohne Quittung");
  });

  it("der Zustand 'beantragt' wird als solcher benannt", () => {
    /* Bei eingeschalteter Freigabepflicht hat sich der Mensch abgemeldet, ist
     * aber NICHT abgemeldet. Ohne diesen Hinweis glaubt er, es sei erledigt. */
    const logik = lies(LOGIK);
    assert.match(logik, /beantragt/, "der Wartezustand wird nicht unterschieden");
    /* Der Schluessel entsteht dynamisch ('ep.abwesenheit.list.' + zustand) —
     * geprueft wird deshalb, dass beide Sprachen ihn kennen. Faehlte er, zeigte
     * i18n einen leeren Text: der Zustand waere unsichtbar statt falsch. */
    const html = lies(SEITE);
    assert.ok((html.match(/'ep\.abwesenheit\.list\.pending'/g) || []).length === 2,
      "'wartet auf Freigabe' fehlt in einer der beiden Sprachen");
  });

  it("der Endpunkt liefert die Beschreibung NICHT mit", () => {
    /* Was nicht gesendet wird, kann auch nicht in einem Zwischenspeicher des
     * Browsers landen. Die Art bleibt (eigene Akte), die 30 Woerter nicht. */
    const route = ohneKommentare(lies(path.join(REPO, "api", "routes", "workerPortal.js")));
    const i = route.indexOf('router.get("/worker/me/abwesenheiten"');
    /* Genau bis zum Ende DIESER Route schneiden. Bis zur naechsten `router.`-
     * Zeile zu lesen wuerde das Verspaetungs-Schema mitnehmen, das ein eigenes
     * `notiz`-Feld hat — der Test schluege dann auf fremdem Code an. */
    const block = route.slice(i, route.indexOf("} catch (err) { next(err); }", i));
    assert.ok(block.length > 0, "der Endpunkt fehlt");
    assert.ok(!/beschreibung/.test(block), "die 30-Woerter-Beschreibung wird mitgeliefert");
    assert.ok(!/notiz/.test(block), "die Notiz wird mitgeliefert");
    assert.match(block, /art:/, "die Art fehlt — sie gehoert in die eigene Akte");
  });

  it("der Entwurf ueberlebt einen Fehlversuch", () => {
    /* Ein Fehler im dritten Schritt darf 30 muehsam getippte Woerter nicht
     * loeschen — sonst ist der Ablauf nach dem ersten Fehlversuch unzumutbar. */
    const logik = lies(LOGIK);
    assert.match(logik, /sessionStorage/, "es gibt keinen Zwischenspeicher");
    assert.match(logik, /entwurfLoeschen/, "der Entwurf wird nach Erfolg nie aufgeraeumt");
  });
});
