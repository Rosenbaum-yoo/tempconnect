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
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
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

  it("S: der Aufbau wuerde einen kaputten Renderer bemerken", () => {
    /* Rueckmutation: ohne diese Probe belegt die Datei nur, dass etwas lief —
     * nicht, dass sie einen Ausfall SIEHT. */
    assert.throws(() => ctx.renderDetail(null),
      "ein Renderer, der bei fehlenden Daten stillschweigend nichts tut, waere " +
      "von den Proben darueber nicht zu unterscheiden");
  });
});
