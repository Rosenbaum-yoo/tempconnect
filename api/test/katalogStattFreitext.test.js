/**
 * ═══════════════════════════════════════════════════════════════════════════
 * N8.1 — KATALOG STATT FREITEXT, AUCH DORT, WO GESUCHT WIRD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Owner (2026-09-14): "Freitext fuer Suche durch Checkboxen mit
 * Katalogeintraegen ersetzen, damit Matching funktioniert."
 *
 * GEMESSEN AM 2026-09-21 gegen die laufende Datenbank — und die Zahlen sind der
 * eigentliche Beleg dieser Welle:
 *
 *   162   aktive Eintraege im Katalog (`platform_skills`)
 *    44   verschiedene Rollen im Markt (28 an Angeboten, 16 an Bedarfen)
 *    19   davon treffen den Katalog NIE
 *
 * Die 19 sind kein Randfall, sondern zwei Sorten Schaden:
 *
 *   Schreibvariante   "Bauhelfer"  (der Katalog fuehrt "Bauhelfer:in"),
 *                     "Lagerhelfer", "Produktionshelfer", "CNC-Bediener"
 *   Unbrauchbar       "lager", "helfer", "spezial", "KI", "Bau", "ljoj",
 *                     "IJF)IE", "Schwei??er" (kaputte Kodierung)
 *
 * Solange eine Marktseite Freitext nimmt, KANN das Matching dort nicht treffen.
 * Das ist keine Frage der Rangformel — das Vokabular passt nicht zusammen.
 *
 * WAS HIER GEPRUEFT WIRD
 *   A) die Aufloesung selbst, AUSGEFUEHRT (nicht gelesen): Schreibvariante,
 *      Alias, Praefix, Mehrdeutigkeit und der unbekannte Begriff, der NICHT
 *      verschluckt werden darf.
 *   B) entdeckend: jedes Rollen-/Taetigkeitsfeld auf den Marktplatzseiten
 *      haengt am Katalog. Ein neues Freitextfeld faellt hier auf.
 *
 * Lauf: node --test --test-force-exit test/katalogStattFreitext.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HIER, "..");
const REPO_ROOT = path.resolve(API_ROOT, "..");
const PUB = path.join(REPO_ROOT, "frontend", "public");

/* ═══════════════════════════════════════════════════════════════════════════
   A) DIE AUFLOESUNG — ausgefuehrt, nicht gelesen
   ═══════════════════════════════════════════════════════════════════════════ */

function ladeModul() {
  const quelle = fs.readFileSync(path.join(PUB, "js", "katalogFeld.js"), "utf8");
  const fenster = {};
  const sandkasten = {
    window: fenster,
    document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} }, addEventListener() {} },
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    setTimeout, clearTimeout, Date, Math, String, Array, Object, JSON, Event
  };
  vm.createContext(sandkasten);
  new vm.Script(quelle, { filename: "katalogFeld.js" }).runInContext(sandkasten);
  assert.ok(fenster.TCKatalogFeld, "TCKatalogFeld haengt nicht am window");
  return fenster.TCKatalogFeld;
}

/** Ein Ausschnitt des echten Katalogs — die Namen stehen so in platform_skills. */
const KATALOG = [
  { name: "Bauhelfer:in", aliases: ["Bauhelfer"] },
  { name: "Lagerhelfer:in", aliases: [] },
  { name: "Lagerfachkraft", aliases: [] },
  { name: "Altenpflege", aliases: ["Seniorenpflege"] },
  { name: "Anlagenfuehrer:in", aliases: [] },
  { name: "Allrounder / Aushilfe", aliases: [] }
];

describe("N8.1 · ein Freitext-Begriff wird gegen den Katalog gehalten", () => {
  const modul = ladeModul();
  const aufloesen = modul._aufloesen;

  it("die Schreibvariante trifft — genau der gemessene Hauptfall", () => {
    /* "Bauhelfer" steht 2026-09-21 im Markt, "Bauhelfer:in" im Katalog. Ohne
       diese Aufloesung sucht der eine am anderen vorbei. */
    const r = aufloesen("Bauhelfer", KATALOG);
    assert.equal(r.name, "Bauhelfer:in");
    assert.ok(r.art === "exakt" || r.art === "alias",
      `erwartet exakt/alias, bekam ${r.art}`);
  });

  it("die generische Form ist dieselbe Sache, nicht eine andere", () => {
    assert.equal(aufloesen("lagerhelfer", KATALOG).name, "Lagerhelfer:in");
    assert.equal(aufloesen("ALTENPFLEGE", KATALOG).name, "Altenpflege");
  });

  it("ein Alias fuehrt zum kanonischen Begriff", () => {
    const r = aufloesen("Seniorenpflege", KATALOG);
    assert.equal(r.name, "Altenpflege");
    assert.equal(r.art, "alias");
  });

  it("ein eindeutiges Praefix wird uebernommen, ein mehrdeutiges vorgelegt", () => {
    const eindeutig = aufloesen("bauhel", KATALOG);
    assert.equal(eindeutig.art, "praefix");
    assert.equal(eindeutig.name, "Bauhelfer:in");

    const mehrere = aufloesen("lager", KATALOG);
    assert.equal(mehrere.art, "mehrdeutig",
      "'lager' trifft Lagerhelfer:in UND Lagerfachkraft — eine stille Wahl waere geraten");
    assert.deepEqual(mehrere.kandidaten.sort(), ["Lagerfachkraft", "Lagerhelfer:in"]);
    assert.equal(mehrere.name, null, "bei Mehrdeutigkeit darf kein Begriff gesetzt werden");
  });

  it("ein unbekannter Begriff wird NICHT verschluckt", () => {
    /*
     * Der wichtigste Fall fuer N8.1c: ein alter Link `?role=ljoj` darf nicht
     * still zu einer leeren Suche werden. Der Text bleibt stehen und wird als
     * "nicht im Katalog" gekennzeichnet — ein Link, der ploetzlich nichts mehr
     * findet, ist schlimmer als einer, der sagt, warum er wenig findet.
     */
    const r = aufloesen("ljoj", KATALOG);
    assert.equal(r.art, "unbekannt");
    assert.equal(r.name, "ljoj", "der eingegebene Text wurde verworfen statt behalten");
  });

  it("ohne erreichbaren Katalog bleibt der Begriff erhalten", () => {
    /* Faellt `/skills/catalog` aus, darf die Suche nicht leer werden. */
    const r = aufloesen("Altenpflege", []);
    assert.equal(r.art, "kein-katalog");
    assert.equal(r.name, "Altenpflege");
  });

  it("GEGENPROBE: leer bleibt leer, und nichts wird erfunden", () => {
    const r = aufloesen("   ", KATALOG);
    assert.equal(r.art, "leer");
    assert.equal(r.name, null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   B) ENTDECKEND — kein Rollenfeld ohne Katalog
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * ALLE Flaechen, nicht nur der Marktplatz (Owner-Entscheid 2026-09-22:
 * "keine Freitexte mehr, alles katalogbunden, um maximal integriert zu sein").
 *
 * Der erste Entwurf dieses Waechters sah nur Marktplatzseiten — und uebersah
 * damit die Rolle im Konditionsrahmen, die Rolle am Bedarf aus dem
 * Anforderungsformular und den Nachweistyp im Arbeiter-Bereich. Eine Grenze,
 * die nur dort gilt, wo man zuerst hingesehen hat, ist keine.
 */
const SEITEN_MUSTER = /\.html$/i;

/* Wonach ein Feld aussieht, das eine Taetigkeit, eine Faehigkeit, eine
   Qualifikation oder einen Nachweis benennt. Der Platzhaltertext zaehlt mit:
   `newQualName` heisst nicht nach Katalog, sein Platzhalter sagt aber
   "z.B. Staplerschein". */
const ROLLEN_MUSTER = /(role|rolle|taetigkeit|skill|faehigkeit|beruf|position|qualifi|nachweis|zertifikat|schein)/i;

/*
 * BENANNTE AUSNAHMEN, je mit Grund. Eine Ausnahme ohne Grund ist eine Luecke
 * mit besserer Presse. Die Gruende zerfallen in vier Klassen:
 *
 *   UEBERSCHRIFT  benennt einen Vorgang, keine Taetigkeit
 *   PROSA         ein Satz an einen Menschen, kein Schluessel
 *   ANDERE WELT   ein Vokabular, das der Faehigkeitskatalog nicht fuehrt
 *   AUSWEG        genau das Feld, das fuer FEHLENDE Katalogbegriffe da ist
 */
const AUSNAHMEN = {
  "capacity_search.html#searchJobTitle":
    "UEBERSCHRIFT eines Suchauftrags ('Pflegefachkraft Berlin, ab Montag') — keine Taetigkeit. "
    + "Ein Katalog dafuer waere eine Zwangsjacke ohne Nutzen fuers Matching.",
  "capacity_search.html#editJobTitle":
    "UEBERSCHRIFT — dasselbe Feld im Bearbeiten-Formular.",
  "capacity_exchange_form.html#f-qualifications":
    "PROSA: 'Zusammenfassung relevanter Qualifikationen und Erfahrungen', gespeichert als "
    + "`qualification_summary`. Die STRUKTURIERTE Wahrheit steht im Feld daneben (`f-skills`, "
    + "katalogfest). Eine Zusammenfassung an den Katalog zu haengen hiesse, sie zu verstuemmeln "
    + "oder das Skill-Feld zu verdoppeln.",
  "capacity_exchange_form.html#f-certifications":
    "PROSA, gespeichert als `certifications_summary` — dieselbe Begruendung wie beim "
    + "Qualifikationsprofil daneben.",
  "capacity_exchange_detail.html#im-requirements":
    "PROSA: Freitext einer Nachricht an die Gegenseite ('Schicht, Zertifikate, Startfenster').",
  "company_profile_public.html#scr-message":
    "PROSA: die Nachricht einer Kontaktaufnahme.",
  "enterprise_anfrage.html#fStrategicCollabMessage":
    "PROSA: die Nachricht einer Anfrage.",
  "mitarbeiter.html#mpNotiz":
    "PROSA: eine Notiz zur Marktpraesenz ('seit einer Woche abwesend ohne Rueckmeldung').",
  "deal_management.html#dm-search-input":
    "ANDERE WELT: eine Freitextsuche UEBER Deals, Referenzen und Gegenseiten — sie sucht "
    + "nicht nach einer Taetigkeit, sondern quer ueber mehrere Gegenstaende.",
  "enterprise_anfrage.html#fContactRole":
    "ANDERE WELT: die Funktion eines Ansprechpartners in seiner Firma ('Einkauf', 'HR', "
    + "'Geschaeftsfuehrung') — kein Vokabular, das der Faehigkeitskatalog fuehrt oder fuehren soll.",
  "sso_config.html#cfgCertificate":
    "ANDERE WELT: ein PEM-Zertifikat fuer die Anmeldung per SSO. Das Wort 'Zertifikat' "
    + "bedeutet hier etwas voellig anderes als ein Staplerschein.",
  "einsatzportal-profil.html#docTitle":
    "ANDERE WELT: die Bezeichnung einer hochgeladenen DATEI ('Staplerschein PDF'). Den "
    + "Katalogbezug traegt das Feld daneben (`docQualification`), und genau das ist gebunden.",
  "mitarbeiter.html#workerDocumentTitle":
    "ANDERE WELT: dieselbe Dateibezeichnung auf der Firmenseite; gebunden ist der "
    + "Nachweistyp daneben.",
  "einsatzportal-profil.html#ownSkillInput":
    "AUSWEG: dieses Feld EXISTIERT fuer Begriffe, die der Katalog noch nicht kennt. Es "
    + "schickt an `POST /skills/propose`, das zuerst gegen Aliase prueft und dem Arbeiter "
    + "ehrlich sagt, ob seine Eingabe sofort zaehlt oder erst nach einer Pruefung. Es an den "
    + "Katalog zu binden hiesse, den einzigen Weg zu schliessen, auf dem der Katalog waechst."
};

function inputsDerSeite(html) {
  const raus = [];
  const muster = /<(?:input|textarea)\b[^>]*>/gi;
  let m;
  while ((m = muster.exec(html))) {
    const roh = m[0];
    const typ = (/\btype="([^"]+)"/i.exec(roh) || [, "text"])[1].toLowerCase();
    if (typ !== "text" && typ !== "search" && typ !== "") continue;
    const id = (/\bid="([^"]+)"/i.exec(roh) || [, null])[1];
    const name = (/\bname="([^"]+)"/i.exec(roh) || [, ""])[1];
    const platzhalter = (/\bplaceholder="([^"]*)"/i.exec(roh) || [, ""])[1];
    if (!ROLLEN_MUSTER.test(`${id || ""} ${name} ${platzhalter}`)) continue;
    raus.push({ id, name, roh });
  }
  return raus;
}

/**
 * Der Quelltext, den EINE Seite tatsaechlich laedt: ihr eigenes HTML plus die
 * `/public/js/…`-Dateien aus ihren Skript-Zeilen.
 *
 * WARUM JE SEITE UND NICHT UEBER ALLES (gemessen als Rueckmutation N2): ein
 * erster Entwurf sammelte die gebundenen Kennungen im ganzen Verzeichnis. Dann
 * genuegt EINE Seite, die `role` bindet, damit das gleichnamige Feld auf JEDER
 * anderen Seite als gebunden gilt — und `marketplace_demand_create.html` bindet
 * `role`. Die Rueckmutation "Bindung auf capacity_search entfernt" blieb damit
 * gruen. Ein Waechter, der Namen global zaehlt, prueft nicht die Seite.
 */
function seitenQuelle(seite) {
  const html = fs.readFileSync(path.join(PUB, seite), "utf8");
  const teile = [html];
  const skripte = html.match(/<script[^>]*src="([^"]+)"/g) || [];
  for (const roh of skripte) {
    const treffer = /src="([^"]+)"/.exec(roh);
    if (!treffer) continue;
    const rel = treffer[1].replace(/^\/public\//, "");
    if (!/^js\//.test(rel)) continue;
    const voll = path.join(PUB, rel);
    if (fs.existsSync(voll)) teile.push(fs.readFileSync(voll, "utf8"));
  }
  return teile.join(String.fromCharCode(10));
}

/** Die Kennungen, die IN DIESEM Quelltext an `TCKatalogFeld.binde(` haengen. */
function gebundeneKennungen(text) {
  const gefunden = new Set();
  const muster = /TCKatalogFeld\.binde\(/g;
  let m;
  while ((m = muster.exec(text))) {
    /* Der Aufruf steht in den naechsten ~200 Zeichen; dort die Kennung
       einsammeln, egal ob als "id", "#id" oder ueber ein Element. */
    const fenster = text.slice(m.index, m.index + 200);
    const namen = fenster.match(/"#?([A-Za-z0-9_\-]+)"/g) || [];
    namen.forEach((n) => gefunden.add(n.replace(/["#]/g, "")));
  }
  /* Der Mehrfachwaehler bindet ueber `hiddenInput` — auch das ist Katalog. */
  const versteckt = text.match(/hiddenInput:\s*"([^"]+)"/g) || [];
  versteckt.forEach((v) => gefunden.add(v.replace(/hiddenInput:\s*"|"/g, "")));
  return gefunden;
}

describe("N8.1d · kein Rollenfeld auf Marktplatzseiten ohne Katalog", () => {
  const seiten = fs.readdirSync(PUB).filter((d) => d.endsWith(".html") && SEITEN_MUSTER.test(d));

  it("die Erhebung findet ueberhaupt Seiten und Felder", () => {
    /* Ohne diese Probe waere der Waechter lautlos gruen, sobald der Pfad
       nicht mehr stimmt: eine leere Menge besteht jede Schleife. */
    assert.ok(seiten.length >= 40, `nur ${seiten.length} Flaechen gefunden — der Durchlauf sieht zu wenig`);
    const felder = seiten.flatMap((s) => inputsDerSeite(fs.readFileSync(path.join(PUB, s), "utf8")));
    assert.ok(felder.length >= 25,
      `nur ${felder.length} katalogwuerdige Felder erkannt — erwartet mindestens 25`);
    const alleBindungen = seiten.reduce((n, s) => n + gebundeneKennungen(seitenQuelle(s)).size, 0);
    assert.ok(alleBindungen >= 8, `nur ${alleBindungen} Bindungen ueber alle Seiten gefunden`);
  });

  it("jedes Rollen-/Taetigkeitsfeld haengt am Katalog oder ist benannt ausgenommen", () => {
    const frei = [];
    for (const seite of seiten) {
      const html = fs.readFileSync(path.join(PUB, seite), "utf8");
      const gebunden = gebundeneKennungen(seitenQuelle(seite));
      for (const feld of inputsDerSeite(html)) {
        if (!feld.id) { frei.push(`${seite}: <input> ohne id (${feld.name})`); continue; }
        const schluessel = `${seite}#${feld.id}`;
        if (AUSNAHMEN[schluessel]) continue;
        if (!gebunden.has(feld.id)) frei.push(schluessel);
      }
    }
    assert.deepStrictEqual(frei, [],
      "Freitext fuer eine Taetigkeit. Gemessen am 2026-09-21 treffen 19 von 44 Rollen im "
      + "Markt den Katalog nie — ein Feld ohne Katalog erzeugt genau solche Werte. Entweder "
      + "mit TCKatalogFeld.binde({input: ...}) binden oder in AUSNAHMEN mit Grund eintragen.");
  });

  it("jede Ausnahme traegt einen Grund", () => {
    for (const [schluessel, grund] of Object.entries(AUSNAHMEN)) {
      assert.ok(typeof grund === "string" && grund.trim().length > 30,
        `${schluessel}: Ausnahme ohne belastbaren Grund`);
    }
  });

  it("der Waehler kennt die Einzelauswahl — sonst waere ein zweiter noetig", () => {
    /* N8.1a: derselbe Waehler, kein zweiter. Eine Suche fragt nach EINER
       Taetigkeit; ohne Einzelauswahl haette es dafuer ein eigenes Bauteil
       gebraucht — und damit eine zweite Wahrheit ueber gueltige Begriffe. */
    /* An der VERZWEIGUNG geprueft, nicht am Vorkommen des Namens: eine
       Rueckmutation ersetzte `else if (opt.einzeln)` durch `else if (false)` —
       und blieb gruen, weil `opt.einzeln` zwei Zeilen tiefer noch einmal steht.
       Derselbe Fehler, den dieses Projekt schon mehrfach gemacht hat. */
    const quelle = fs.readFileSync(path.join(PUB, "js", "skillPicker.js"), "utf8");
    assert.ok(/else if \(opt\.einzeln\)\s*\{/.test(quelle),
      "skillPicker verzweigt nicht mehr auf die Einzelauswahl");
    const zweig = /else if \(opt\.einzeln\)\s*\{([\s\S]{0,900}?)\s*\} else \{/.exec(quelle);
    assert.ok(zweig && /gewaehlt\s*=\s*\[\s*name\s*\]/.test(zweig[1]),
      "der Einzelauswahl-Zweig ersetzt die Auswahl nicht mehr — dann waehlt eine Suche mehrfach");
    const katalogFeld = fs.readFileSync(path.join(PUB, "js", "katalogFeld.js"), "utf8");
    assert.ok(/einzeln:\s*true/.test(katalogFeld),
      "die Feldbindung fordert die Einzelauswahl nicht mehr an");
    assert.ok(/TCSkillPicker\.mount/.test(katalogFeld),
      "die Feldbindung benutzt nicht mehr den vorhandenen Waehler — dann ist es ein zweiter");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   C) DIE VERDRAHTUNG — ausgefuehrt an einer DOM-Attrappe
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Eine Bindung, die den Quelltext ziert, aber das Feld nicht anfasst, waere
 * genau der tote Pfad, den die Projektregeln verbieten. Hier wird `binde()`
 * wirklich ausgefuehrt: das Feld muss dasselbe Element bleiben (aller
 * bestehender Code liest `document.getElementById(...).value`), es bekommt
 * einen Griff, und eine Uebernahme schreibt hinein UND meldet es.
 */

function knoten(art) {
  const el = {
    tagName: String(art || "div").toUpperCase(),
    children: [], attribute: {}, dataset: {}, style: {},
    value: "", textContent: "", className: "", hidden: false,
    zuhoerer: {},
    appendChild(k) { this.children.push(k); k.parentNode = this; return k; },
    insertBefore(neu, vor) {
      const i = this.children.indexOf(vor);
      this.children.splice(i < 0 ? this.children.length : i, 0, neu);
      neu.parentNode = this;
      return neu;
    },
    setAttribute(n, v) { this.attribute[n] = String(v); },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attribute, n) ? this.attribute[n] : null; },
    addEventListener(art2, fn) { (this.zuhoerer[art2] = this.zuhoerer[art2] || []).push(fn); },
    dispatchEvent(ev) { (this.zuhoerer[ev.type] || []).forEach((fn) => fn(ev)); return true; },
    querySelector() { return null; },
    contains() { return false; },
    focus() {}
  };
  return el;
}

function sandkastenMitDom(katalog) {
  const kopf = knoten("head");
  const feld = knoten("input");
  feld.id = "ff-role";
  const eltern = knoten("div");
  eltern.appendChild(feld);

  const fenster = {};
  const dokument = {
    getElementById: (id) => (id === "ff-role" ? feld : null),
    createElement: (art) => knoten(art),
    head: kopf,
    addEventListener() {}
  };
  const sandkasten = {
    window: fenster,
    document: dokument,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: [{ skills: katalog }] }) }),
    setTimeout, clearTimeout, Date, Math, String, Array, Object, JSON, Promise,
    Event: class { constructor(art, o) { this.type = art; Object.assign(this, o || {}); } }
  };
  /* Der Waehler selbst wird hier nicht geoeffnet — die Probe prueft die
     Bindung, nicht die Auswahl. Ein Platzhalter genuegt, damit `binde` nicht
     vorzeitig aussteigt. */
  fenster.TCSkillPicker = { mount: () => ({ werte: () => [], neu() {} }) };
  vm.createContext(sandkasten);
  const quelle = fs.readFileSync(path.join(PUB, "js", "katalogFeld.js"), "utf8");
  new vm.Script(quelle, { filename: "katalogFeld.js" }).runInContext(sandkasten);
  return { modul: fenster.TCKatalogFeld, feld, eltern };
}

describe("N8.1 · die Bindung fasst das Feld wirklich an", () => {

  it("das Feld bleibt dasselbe Element und bekommt einen Griff", () => {
    const { modul, feld } = sandkastenMitDom([{ name: "Bauhelfer:in", aliases: ["Bauhelfer"] }]);
    const griff = modul.binde({ input: "ff-role" });
    assert.ok(griff, "binde() hat nichts geliefert");
    assert.equal(feld.dataset.tcKatalog, "1", "das Feld ist nicht als gebunden gekennzeichnet");
    assert.ok(feld.tcKatalog, "am Feld haengt kein Griff — Skript-gesetzte Werte blieben unaufgeloest");
    assert.equal(feld.getAttribute("autocomplete"), "off",
      "ohne das schlaegt die Browser-Vervollstaendigung mit alten Freitexten zu");
  });

  it("ein zweiter Aufruf bindet nicht doppelt", () => {
    const { modul, feld } = sandkastenMitDom([{ name: "Bauhelfer:in", aliases: [] }]);
    modul.binde({ input: "ff-role" });
    const zweiter = modul.binde({ input: feld });
    assert.equal(zweiter, null, "eine zweite Bindung baut einen zweiten Knopf an dasselbe Feld");
  });

  it("eine Uebernahme schreibt den kanonischen Begriff INS Feld und meldet ihn", async () => {
    const { modul, feld } = sandkastenMitDom([{ name: "Bauhelfer:in", aliases: ["Bauhelfer"] }]);
    const griff = modul.binde({ input: "ff-role" });
    let gemeldet = 0;
    feld.addEventListener("change", () => { gemeldet++; });

    const r = await griff.uebernehmen("Bauhelfer");
    assert.equal(feld.value, "Bauhelfer:in",
      "der kanonische Begriff landet nicht im Feld — dann sucht die Seite weiter mit dem alten Wort");
    assert.ok(r.art === "exakt" || r.art === "alias");
    assert.equal(gemeldet, 1,
      "ohne `change` erfaehrt die Seite nichts von der Uebernahme (die Trefferzahl haengt daran)");
  });

  it("eine Flaeche mit eigenem Zugang bekommt den Katalog ueber ihren Lader", async () => {
    /*
     * Der Arbeiter-Bereich spricht ueber `PortalApi` (eigene Sitzung), nicht
     * ueber `fetch` mit Sitzungskeks. Ohne den Haken `holen` saehe ein Arbeiter
     * dort "Katalog nicht erreichbar" und tippte wieder Freitext — also genau
     * das, was N8.1 abschafft.
     */
    const { modul, feld } = sandkastenMitDom([]);
    let gerufen = 0;
    const eigenerLader = function () {
      gerufen++;
      return Promise.resolve({ categories: [{ skills: [{ name: "Staplerschein", aliases: ["Stapler"] }] }] });
    };
    const griff = modul.binde({ input: "ff-role", holen: eigenerLader });
    const r = await griff.uebernehmen("Stapler");

    assert.ok(gerufen > 0, "der eigene Lader wurde nie gerufen — die Flaeche haette keinen Katalog");
    assert.equal(r.name, "Staplerschein", "der Alias wurde nicht ueber den eigenen Lader aufgeloest");
    assert.equal(feld.value, "Staplerschein");
  });

  it("ein unbekannter Begriff bleibt im Feld stehen — der Link bricht nicht", async () => {
    const { modul, feld } = sandkastenMitDom([{ name: "Bauhelfer:in", aliases: [] }]);
    const griff = modul.binde({ input: "ff-role" });
    feld.value = "ljoj";
    const r = await griff.uebernehmen("ljoj");
    assert.equal(r.art, "unbekannt");
    assert.equal(feld.value, "ljoj",
      "der Wert wurde geleert — ein alter Link liefert damit ploetzlich alles statt wenig");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   D) N8.1b-6 — DIE ALTBEZEICHNUNGEN: KENNZEICHNEN, NICHT LOESCHEN
   ═══════════════════════════════════════════════════════════════════════════
 *
 * Seit N8.1 kommt kein Freitext mehr in ein Rollenfeld. Was VORHER hineinkam,
 * steht weiter da: 19 von 44 Rollen treffen den Katalog nie. Geloescht wird
 * nichts — an ihnen haengen Angebote und Bedarfe. Sie werden GEZEIGT, mit der
 * Zahl der Eintraege, damit die Reihenfolge der Aufraeumarbeit aus den Daten
 * kommt und nicht aus dem Gefuehl.
 */

import { katalogfremdeRollen } from "../services/marktpraesenzService.js";

function abfragePool(zeilen, fehler) {
  const gesehen = [];
  return {
    gesehen,
    async query(sql, params) {
      gesehen.push({ sql: String(sql), params });
      if (fehler) throw new Error("Datenbank weg");
      return { rows: zeilen };
    }
  };
}

describe("N8.1b-6 · die Altbezeichnungen werden gezeigt, nicht geloescht", () => {

  it("die Abfrage liest BEIDE Marktseiten und schliesst Katalog UND Aliase aus", async () => {
    const pool = abfragePool([]);
    await katalogfremdeRollen(pool);
    const sql = pool.gesehen[0].sql;

    assert.ok(/FROM capacity_posts/.test(sql), "die Angebotsseite fehlt");
    assert.ok(/FROM demand_requests/.test(sql), "die Bedarfsseite fehlt - die Haelfte der Rollen waere unsichtbar");
    assert.ok(/platform_skills/.test(sql), "der Katalog wird nicht gegengehalten");
    assert.ok(/unnest/.test(sql) && /aliases/.test(sql),
      "die Aliase werden nicht geprueft - dann gilt jede bekannte Schreibvariante als fremd");
    assert.ok(/is_active/.test(sql),
      "ein stillgelegter Katalogeintrag wuerde eine Rolle weiterhin als bekannt ausweisen");
    assert.ok(!/\b(UPDATE|DELETE)\b/i.test(sql),
      "die Messung greift in fremde Ausschreibungen ein - das ist eine Owner-Entscheidung");
  });

  it("die Gesamtzahl kommt aus den Zeilen, nicht aus einer zweiten Abfrage", async () => {
    const pool = abfragePool([
      { rolle: "ljoj", eintraege: 3, seiten: ["angebot"] },
      { rolle: "Bauhelfer", eintraege: 7, seiten: ["angebot", "bedarf"] }
    ]);
    const erg = await katalogfremdeRollen(pool);

    assert.equal(erg.verfuegbar, true);
    assert.equal(erg.anzahl, 2);
    assert.equal(erg.eintraege, 10,
      "Kopfzahl und Liste laufen auseinander - eine Kennzahl, die ihrer eigenen "
      + "Aufschluesselung widerspricht, ist keine");
    assert.equal(pool.gesehen.length, 1, "eine zweite Abfrage waere eine zweite Wahrheit");
    assert.equal(erg.rollen[1].rolle, "Bauhelfer");
    assert.deepEqual(erg.rollen[1].seiten, ["angebot", "bedarf"]);
  });

  it("ein Datenbankfehler reisst die Aufsichtsseite nicht mit", async () => {
    const erg = await katalogfremdeRollen(abfragePool([], true));
    assert.equal(erg.verfuegbar, false, "ein Fehler muss als nicht verfuegbar ankommen");
    assert.equal(erg.anzahl, 0);
    assert.deepEqual(erg.rollen, []);
  });

  it("ohne Pool liefert sie einen leeren Stand statt zu werfen", async () => {
    const erg = await katalogfremdeRollen(null);
    assert.equal(erg.verfuegbar, false);
  });

  it("die Staff-Route liefert beide Messungen in EINER Antwort", () => {
    const quelle = fs.readFileSync(path.join(API_ROOT, "routes", "staffControlCenter.js"), "utf8");
    const i = quelle.indexOf('router.get("/markt-sichtbarkeit"');
    assert.ok(i > 0, "die Route ist nicht mehr auffindbar");
    const block = quelle.slice(i, i + 1200);
    assert.ok(/katalogfremdeRollen/.test(block),
      "die Altbezeichnungen stehen nicht mehr in der Antwort");
    assert.ok(/katalogfremde_rollen/.test(block),
      "das Feld heisst anders - die Oberflaeche findet es dann nicht");
  });
});
