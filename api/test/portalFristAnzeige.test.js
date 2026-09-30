import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

/*
 * DIE FRIST-ANZEIGE IM EINSATZPORTAL — AUSGEFUEHRT, NICHT ABGELESEN.
 *
 * WARUM DIESE DATEI EXISTIERT: Die Portal-Aenderungen dieser Welle (Frist auf
 * der Einsatz-Karte, Verfall-Abzeichen, Fehlertexte) waren bis hierher nur
 * gegen den QUELLTEXT geprueft. Ein Browser-Nachweis ist nicht moeglich — das
 * Einsatzportal ist fuer niemanden erreichbar: die Demo-Seite bietet nur
 * buyer/agency/admin, `ROLE_ACCOUNTS` kennt keinen Arbeiter, und die drei
 * geseeten Demo-Arbeiter tragen Attrappen-Hashes (51 statt 60 Zeichen,
 * `bcrypt.compare` liefert fuer jede Eingabe false). Das ist ein eigener,
 * owner-gebundener Befund; hier wird die Luecke geschlossen, die er
 * hinterlaesst.
 *
 * UND DAS IST NICHT NUR KOSMETIK: Genau diese Schwaeche hat die tote
 * `ersatz`-LATERAL drei Tage ueberleben lassen. Sie war gegen Zeichenketten
 * geprueft und gruen — ein Selbstwiderspruch in einer WHERE-Klausel sieht im
 * Quelltext richtig aus. `if (false && ...)` enthaelt die gesuchte
 * Zeichenkette weiterhin.
 *
 * Das Hausmuster dafuer steht in der CLAUDE.md ("vm-Sandbox-Test wenn
 * isolierbar") und wird hier benutzt statt nachgebaut — Vorbild
 * `abwesenheitOberflaeche.test.js`.
 */

const SEITE = new URL("../../frontend/public/einsatzportal-einsaetze.html", import.meta.url);
const seiteDa = fs.existsSync(SEITE);

let ctx = null;

/* Ein Minimal-Element, das genug kann, damit der Renderer laeuft. */
function elem(id) {
  return {
    id, innerHTML: "", textContent: "", style: {}, dataset: {},
    /* Mitschreibend, nicht stumm: der Reiterwechsel des Deep-Links ist sonst
     * nicht zu beobachten, und eine Probe darauf waere leer bestanden. */
    classList: (() => {
      const gesetzt = new Set();
      return {
        add: (c) => gesetzt.add(c),
        remove: (c) => gesetzt.delete(c),
        toggle: (c) => (gesetzt.has(c) ? gesetzt.delete(c) : gesetzt.add(c)),
        contains: (c) => gesetzt.has(c),
      };
    })(),
    addEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, getAttribute: () => null,
  };
}

describe("Einsatzportal — die Frist steht wirklich auf der Karte",
  { skip: !seiteDa && "frontend/ nicht verfuegbar (API-Container)" }, () => {

  before(() => {
    const html = fs.readFileSync(SEITE, "utf8");
    /* Nur die Inline-Skripte OHNE src — dieselbe Auswahl, die auch der
     * i18n-Waechter trifft. */
    const skripte = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1]);
    assert.ok(skripte.length >= 1, "kein Inline-Skript gefunden — greift das Muster noch?");

    const woerter = { de: {}, en: {} };
    const TCi18n = {
      register: (lang, dict) => Object.assign(woerter[lang] = woerter[lang] || {}, dict),
      t: (key, params) => {
        const wert = woerter.de[key];
        if (wert == null) return "";
        return String(wert).replace(/\{(\w+)\}/g, (m, n) => (params && n in params ? String(params[n]) : m));
      },
      locale: () => "de",
      dateLocale: () => "de-DE",
    };

    const elemente = {};
    ctx = {
      TCi18n, console,
      document: {
        readyState: "loading",            // verhindert, dass init() losfeuert
        addEventListener: () => {},
        getElementById: (id) => (elemente[id] = elemente[id] || elem(id)),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => elem("tmp"),
        documentElement: { setAttribute: () => {} },
        body: elem("body"),
      },
      window: { location: { href: "", search: "" }, TCDate: { todayDE: () => "2026-08-24" } },
      location: { href: "", search: "" },
      localStorage: { getItem: () => null, setItem: () => {} },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      PortalApi: { get: async () => ({}), post: async () => ({}) },
      /* Die volle Oberflaeche der Schale (portalShell.js:386-401) — ein
       * unvollstaendiger Stub laesst den Renderer mitten im Aufbau abbrechen
       * und die Probe misst dann das Schweigen, nicht das Ergebnis. `esc` muss
       * ECHT escapen: sonst koennte eine Probe gruen werden, die in Wahrheit
       * ein XSS-Loch beschreibt. */
      PortalShell: {
        initShell: async () => ({}), loadWorkerMe: async () => ({}),
        loadUnreadCount: async () => {}, doLogout: () => {},
        toast: () => {}, showError: () => {}, getMe: () => ({}),
        esc: (v) => String(v == null ? "" : v)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;"),
        setupAccessibility: () => {}, setupIcons: () => {}, iconSvg: () => "",
      },
      /* OHNE DIESE ZEILE PRUEFEN DIE DEEP-LINK-PROBEN NICHTS: `oeffneAusAdresse`
       * kapselt den Zugriff in try/catch, faellt ohne URLSearchParams auf
       * `id = null` zurueck und kehrt still zurueck — jede Zusicherung
       * darunter waere leer bestanden. */
      URLSearchParams,
      setTimeout, clearTimeout, setInterval, clearInterval,
      Date, Math, JSON, encodeURIComponent, decodeURIComponent, Intl,
      alert: () => {}, confirm: () => true,
    };
    ctx.window.TCi18n = TCi18n;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    for (const js of skripte) {
      try { vm.runInContext(js, ctx, { filename: "einsatzportal-einsaetze.html" }); }
      catch (e) { /* Skripte, die eine Umgebung brauchen, die es hier nicht gibt */ }
    }
  });

  /** Ein Einsatz, wie ihn `getWorkerAssignments` liefert. */
  const einsatz = (over = {}) => ({
    id: "link-1", assignment_id: "asg-1",
    worker_confirmation_status: "pending_confirmation",
    start_date: "2026-08-25", end_date: "2026-09-30",
    asg_start: "2026-08-25", asg_end: "2026-09-30",
    client_display_name: "Nordbau Industrie GmbH",
    assignment_status: "active",
    assignment_lifecycle_state: "active",
    ...over,
  });

  it("der Renderer ist ueberhaupt erreichbar — sonst prueft die Datei nichts", () => {
    assert.equal(typeof ctx.renderDetail, "function",
      "renderDetail wurde nicht geladen; ohne sie ist jede Zusicherung darunter wertlos");
  });

  it("mit Frist erscheint sie im erzeugten HTML — mit der echten Uhrzeit", () => {
    /* DAS IST DER KERN: nicht "die Zeichenkette kommt im Quelltext vor",
     * sondern "der Renderer gibt sie aus". */
    ctx.renderDetail(einsatz({ response_deadline_label: "24.08.2026 18:38" }));
    const html = ctx.document.getElementById("detContent").innerHTML;
    /* BEIM ERSTEN ANLAUF LAS DIESE PROBE `detail` — ein Element, das der
     * Renderer nie anfasst. Zwei der Zusicherungen darunter waren damit LEER
     * BESTANDEN: sie prueften, dass ein leerer String etwas nicht enthaelt.
     * Genau die Fehlerklasse, gegen die diese Datei gebaut ist. Deshalb steht
     * die Laengenpruefung VOR jeder inhaltlichen Aussage. */
    assert.ok(html.length > 0, "der Renderer hat nichts geschrieben — pruefen wir das richtige Element?");
    assert.match(html, /24\.08\.2026 18:38/,
      "Eine Frist, die man dem Betroffenen nicht mitteilt, ist eine Falle — " +
      "und genau das war sie, bis sie hier auftaucht.");
  });

  it("ohne Frist steht KEIN Frist-Satz da", () => {
    /* Regulaere Zuweisungen trugen bis Migration 195 keine Frist. Ein Satz, der
     * eine behauptet, waere gelogen. */
    ctx.renderDetail(einsatz({ response_deadline_label: null }));
    const html = ctx.document.getElementById("detContent").innerHTML;
    assert.ok(html.length > 0, "sonst besteht die Zusicherung darunter leer");
    assert.ok(!/Antwort bis/.test(html),
      "ohne Frist darf kein Frist-Satz erscheinen");
  });

  it("ist sie abgelaufen, verschwinden die Knoepfe", () => {
    /* Sonst fuehrt der Klick garantiert in einen Fehler — ein Knopf, der nur
     * eine Fehlermeldung erzeugt, ist ein toter Knopf. */
    ctx.renderDetail(einsatz({ response_deadline_label: "24.08.2026 06:00", is_expired: true }));
    const html = ctx.document.getElementById("detContent").innerHTML;
    assert.ok(html.length > 0, "sonst besteht die Zusicherung darunter leer");
    assert.ok(!/confirmAsg\(/.test(html),
      "nach Fristablauf darf kein Bestaetigen-Knopf mehr dastehen");
  });

  it("das Verfall-Abzeichen ist neutral, nicht rot", () => {
    /* Verfall ist KEINE Absage. Rot waere ein Vorwurf an jemanden, der nur
     * nicht hingesehen hat. */
    assert.equal(typeof ctx.confBadge, "function", "confBadge fehlt");
    const abzeichen = ctx.confBadge("expired");
    assert.ok(abzeichen && abzeichen.length > 0,
      "ohne Eintrag faellt die Zeile auf '' zurueck und sieht aus wie eine normale Zuweisung");
    assert.ok(!/#ef4444|239,68,68/.test(abzeichen),
      "Rot ist die Farbe der Absage — der Verfall bekommt Grau");
  });

  /* ── Der Weg aus der Benachrichtigung ─────────────────────────────
   *
   * Vier Arbeiter-Meldungen endeten auf `einsatzportal-benachrichtigungen.html`
   * — auf der Liste, aus der der Mensch gerade kam. Er las "Ihre Antwort steht
   * noch aus, die Anfrage verfaellt am …" und musste den Einsatz danach selbst
   * suchen. Die Mechanik zum Oeffnen war die ganze Zeit da (`selAsg`); es fehlte
   * nur der Anstoss aus der Adresse.
   *
   * WARUM DIESE PROBEN DEN GANZEN WEG FAHREN statt `oeffneAusAdresse` einzeln
   * aufzurufen: `assignments`, `curTab` und `selId` sind `let`-Bindungen. In
   * einer vm-Sandbox werden sie NICHT zu Eigenschaften des Kontexts — von
   * aussen weder setzbar noch lesbar. Ein erster Anlauf hat genau daran
   * gescheitert. Also: `load()` mit gestelltem `PortalApi`, und beobachtet wird,
   * was der Mensch sieht — der Inhalt der Detailspalte.
   */

  /** Laesst die Seite laden, als kaeme man aus einer Benachrichtigung. */
  async function ausAdresseLaden(suche, liste) {
    /* ZUERST LEEREN. Der erste Anlauf dieser Proben bestand aus dem falschen
     * Grund: das Stub-Element behaelt seinen Inhalt ueber Probengrenzen hinweg,
     * und eine fruehere Probe hatte denselben Firmennamen gerendert. Erst die
     * Rueckmutation (Aufruf aus load() entfernt) hat es gezeigt — drei der vier
     * Proben blieben gruen. */
    ctx.document.getElementById("detContent").innerHTML = "";
    ctx.window.location.search = suche;
    ctx.location.search = suche;
    ctx.PortalApi.get = async (pfad) => {
      if (pfad === "/worker/assignments") return { items: liste };
      const treffer = liste.find((a) => pfad === `/worker/assignments/${a.id}`);
      return treffer || {};
    };
    await ctx.load();
    /* `oeffneAusAdresse` wartet bewusst nicht auf `selAsg` — die Seite soll
     * nicht blockieren. Hier muss die Probe die Microtasks nachlaufen lassen. */
    await new Promise((fertig) => setTimeout(fertig, 0));
  }

  it("die Seite oeffnet den Einsatz aus `?einsatz=`", async () => {
    assert.equal(typeof ctx.oeffneAusAdresse, "function",
      "ohne die Funktion fuehrt die Meldung weiter auf eine Uebersicht");

    await ausAdresseLaden("?einsatz=link-7", [
      einsatz({ id: "link-7", assignment_is_current: true,
                client_display_name: "Deeplink Ziel AG" }),
    ]);

    const html = ctx.document.getElementById("detContent").innerHTML;
    assert.ok(html.length > 0,
      "die Detailspalte blieb leer — der Deep-Link hat nichts aufgeschlagen");
    assert.match(html, /Deeplink Ziel AG/,
      "Es muss der ANGEFRAGTE Einsatz dastehen. Sonst landet der Mensch wieder " +
      "auf einer Liste und sucht selbst — waehrend seine Frist laeuft.");
  });

  it("ein vergangener Einsatz wechselt den Reiter mit", async () => {
    /* Ein VERFALLENER oder zurueckgezogener Einsatz liegt in "Vergangen".
     * Oeffnete sich nur die Detailansicht, zeigte die Liste daneben ihn nicht —
     * die Markierung ginge ins Leere und die Seite saehe verwirrt aus. */
    await ausAdresseLaden("?einsatz=link-alt", [
      einsatz({ id: "link-alt", assignment_is_current: false,
                client_display_name: "Altbau Service GmbH" }),
    ]);

    assert.ok(ctx.document.getElementById("tab-past").classList.contains("active"),
      "der Reiter muss zum Einsatz passen");
    const html = ctx.document.getElementById("detContent").innerHTML;
    assert.ok(html.length > 0 && /Altbau Service GmbH/.test(html),
      "und der Einsatz selbst muss trotzdem aufgeschlagen sein");
  });

  it("eine unbekannte Kennung aendert nichts und wirft nicht", async () => {
    /* Die Zuweisung kann geloescht sein oder zu einem anderen Konto gehoeren.
     * Eine Fehlermeldung waere hier lauter als der Anlass. */
    ctx.document.getElementById("detContent").innerHTML = "";
    await ausAdresseLaden("?einsatz=gibt-es-nicht", [
      einsatz({ id: "link-7", assignment_is_current: true }),
    ]);
    assert.equal(ctx.document.getElementById("detContent").innerHTML, "",
      "nichts aufgeschlagen — aber auch kein Krach");
  });

  it("S: ohne Parameter schlaegt die Seite nichts auf", async () => {
    /* Rueckmutation der Proben oben: waere `oeffneAusAdresse` ein Stummel, der
     * IMMER den ersten Einsatz waehlt, wuerden sie trotzdem gruen. */
    ctx.document.getElementById("detContent").innerHTML = "";
    await ausAdresseLaden("", [
      einsatz({ id: "link-7", assignment_is_current: true,
                client_display_name: "Nordbau Industrie GmbH" }),
    ]);
    assert.equal(ctx.document.getElementById("detContent").innerHTML, "",
      "ohne `?einsatz=` darf die Seite nichts aufschlagen");
  });

  it("S: der Aufbau wuerde einen kaputten Renderer bemerken", () => {
    /* Rueckmutation: ohne diese Probe belegt die Datei nur, dass etwas lief —
     * nicht, dass sie einen Ausfall SIEHT. */
    assert.throws(() => ctx.renderDetail(null),
      "ein Renderer, der bei fehlenden Daten stillschweigend nichts tut, waere " +
      "von den Proben darueber nicht zu unterscheiden");
  });
});
