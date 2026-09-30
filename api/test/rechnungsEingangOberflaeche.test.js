/**
 * Der Rechnungs-Eingang des Unternehmens (Welle J7).
 *
 * Was die Zeitarbeitsfirma stellt, kommt hier an. Die Flaeche ist bewusst
 * LESEND: Stellen, Stornieren und "bezahlt" gehoeren dem Rechnungssteller —
 * seit dem Befund vom 2026-08-28 auch serverseitig (NOT_INVOICE_ISSUER,
 * siehe rechnungRollentrennung.test.js). Diese Datei haelt fest, dass die
 * Oberflaeche dieselbe Linie zieht: kein Knopf, der den fremden Beleg
 * veraendert.
 *
 * Was der Empfaenger braucht und bekommt: die Positionen zum Nachvollziehen
 * (Kraft, Woche, Stunden, Satz), die Summen, CSV und die E-Rechnung.
 *
 * Run: node --test --test-force-exit test/rechnungsEingangOberflaeche.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));

function findeWurzel() {
  for (const start of [HIER, process.cwd()]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const kandidat = path.join(dir, "frontend/public/js/pages/companyTimesheets.js");
      if (fs.existsSync(kandidat) && fs.statSync(kandidat).size > 5000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

const ELEMENTE = [
  "tabInvoices", "viewInvoices", "ciBody", "ciFilterStatus", "ciCount",
  "ciOpen", "ciOverdue", "ciSum", "ciPaid",
  "ciModal", "ciDetailTitle", "ciDetailMeta", "ciDetailBody", "ciDetailActions"
];

suite("Rechnungs-Eingang · Teil A — die Verdrahtung", () => {
  let html, js;
  before(() => {
    html = fs.readFileSync(path.join(ROOT, "frontend/public/company-timesheets.html"), "utf8");
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/companyTimesheets.js"), "utf8");
  });

  it("jedes Element, das die Logik anspricht, gibt es genau einmal", () => {
    for (const id of ELEMENTE) {
      const n = html.split(`id="${id}"`).length - 1;
      assert.equal(n, 1, `"${id}" steht ${n}-mal im Markup`);
    }
  });

  it("jede Funktion hinter einem onclick existiert", () => {
    for (const fn of ["ctView", "ctLoadInvoices", "ciOpen", "ciClose"]) {
      assert.ok(new RegExp(`window\\.${fn}\\s*=`).test(js),
        `"${fn}" liegt nicht auf window — der Knopf waere tot`);
    }
  });

  it("die Flaeche bietet KEINEN schreibenden Weg an", () => {
    /* Der Kern dieser Welle: der Empfaenger liest. Stellen, Stornieren und
     * "bezahlt" gehoeren dem Aussteller — serverseitig seit dem Befund vom
     * 2026-08-28 erzwungen, hier soll die Oberflaeche gar nicht erst dazu
     * einladen. */
    const abschnitt = js.slice(js.indexOf("RECHNUNGS-EINGANG (Welle J7)"));
    for (const weg of ["/issue", "/void", "/paid", "/generate", "/correction"]) {
      assert.ok(!abschnitt.includes(weg),
        `der Rechnungs-Eingang ruft "${weg}" auf — das ist ein Schreibweg des Ausstellers`);
    }
    assert.ok(!/TC\.api\.(post|put|patch|delete)/.test(abschnitt),
      "der Rechnungs-Eingang schreibt — er soll ausschliesslich lesen");
  });

  it("beide Ausleitungswege stehen bereit", () => {
    const abschnitt = js.slice(js.indexOf("RECHNUNGS-EINGANG (Welle J7)"));
    assert.ok(abschnitt.includes("/export/csv"), "der CSV-Weg fehlt");
    assert.ok(abschnitt.includes("/e-rechnung"),
      "die E-Rechnung fehlt — ab 2027 ist sie der einzige zulaessige Rechnungsweg");
  });

  it("jeder Text steht in DE und EN", () => {
    const de = js.slice(0, js.indexOf("TCi18n.register('en'"));
    const en = js.slice(js.indexOf("TCi18n.register('en'"));
    const schluessel = [...new Set([...de.matchAll(/'(cts\.(?:inv|tab\.invoices)[a-zA-Z.]*)'\s*:/g)].map((m) => m[1]))];
    assert.ok(schluessel.length >= 25, `zu wenige Schluessel: ${schluessel.length}`);
    assert.deepEqual(schluessel.filter((k) => !en.includes(`'${k}'`)), [],
      "diese Schluessel fehlen auf Englisch");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — das Verhalten, wirklich ausgefuehrt
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Rechnungs-Eingang · Teil B — das Verhalten", () => {
  let js;
  before(() => {
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/companyTimesheets.js"), "utf8");
  });

  /** Das ganze Modul in einer Sandbox — es ist eine IIFE, also laeuft init() mit. */
  function sandbox(antworten = {}) {
    const elemente = {};
    function elem(id) {
      const e = {
        id, innerHTML: "", textContent: "", value: "", style: {},
        _klassen: new Set(),
        classList: {
          add: (c) => e._klassen.add(c), remove: (c) => e._klassen.delete(c),
          toggle: (c, an) => (an ? e._klassen.add(c) : e._klassen.delete(c)),
          contains: (c) => e._klassen.has(c)
        },
        addEventListener() {},
        querySelectorAll(sel) {
          if (!/tr/.test(sel)) return [];
          return String(e.innerHTML).split("<tr>").slice(1).map((h) => ({ innerHTML: h }));
        }
      };
      return e;
    }
    const hole = (id) => (elemente[id] = elemente[id] || elem(id));
    const woerter = { de: {}, en: {} };
    const gerufen = [];

    const ctx = {
      console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Map, Set,
      URLSearchParams,
      setTimeout: (fn) => { fn(); return 1; },
      clearTimeout() {}, setInterval: () => 1, clearInterval() {},
      alert() {}, confirm: () => true,
      TCi18n: {
        register: (l, d) => Object.assign(woerter[l] = woerter[l] || {}, d),
        t: (k, p) => String(woerter.de[k] == null ? k : woerter.de[k]).replace(/\{(\w+)\}/g, (m, n) => (p && n in p ? p[n] : m)),
        locale: () => "de"
      },
      TC: {
        api: {
          get: async (pfad) => {
            gerufen.push(pfad);
            for (const [muster, antwort] of Object.entries(antworten)) {
              if (new RegExp(muster).test(pfad)) return antwort;
            }
            return {};
          },
          post: async () => ({}), delete: async () => ({})
        }
      },
      document: {
        getElementById: (id) => hole(id),
        addEventListener() {},
        querySelectorAll: () => []
      },
      window: { location: { search: "", hash: "", href: "" } },
      /* Die Seite nutzt TCDate.todayDE() statt eines UTC-Schnitts (die Zeile
         waere in Europe/Berlin abends der Vortag). Die Sandbox stellt es
         bereit, sonst kann sie das Faelligkeits-Verhalten nicht pruefen. */
      TCDate: {
        todayDE() {
          const d = new Date();
          return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        }
      }
    };
    ctx.globalThis = ctx;
    ctx.window.TC = ctx.TC;
    ctx.window.TCDate = ctx.TCDate;
    ctx.window.TCi18n = ctx.TCi18n;
    ctx.window.document = ctx.document;
    vm.createContext(ctx);
    vm.runInContext(js, ctx, { filename: "companyTimesheets.js" });
    return { ctx, hole, gerufen, woerter };
  }

  const LISTE = {
    "/invoices/operational/kpis": { issued_count: 3, overdue_count: 1, outstanding_cents: 456789, paid_this_month_cents: 120000 },
    "/invoices/operational(\\?|$)": {
      items: [
        { id: "i1", invoice_number: "RE-2026-000001", supplier_org_name: "Muster Zeitarbeit", billing_period_start: "2026-08-01", billing_period_end: "2026-08-07", due_at: "2099-01-01", total_cents: 250000, status: "issued" },
        { id: "i2", invoice_number: "RE-2026-000002", supplier_org_name: "Muster Zeitarbeit", billing_period_start: "2026-07-01", billing_period_end: "2026-07-31", due_at: "2000-01-01", total_cents: 99000, status: "issued" },
        { id: "i3", invoice_number: null, supplier_org_name: "Andere ZAF", billing_period_start: "2026-08-10", billing_period_end: "2026-08-16", due_at: null, total_cents: 50000, status: "draft" }
      ]
    }
  };

  it("der Reiterwechsel zeigt den Eingang und laedt ihn genau einmal", async () => {
    const { ctx, hole, gerufen } = sandbox(LISTE);
    await ctx.window.ctView("invoices");
    await new Promise((r) => setImmediate(r));
    assert.ok(hole("tabInvoices").classList.contains("ct-tab--active"), "der Reiter ist nicht aktiv");
    assert.equal(hole("viewInvoices").style.display, "", "die Ansicht ist verborgen");
    assert.equal(hole("viewTimesheets").style.display, "none", "die Stundenzettel bleiben sichtbar");
    const ersteAbrufe = gerufen.filter((p) => p.startsWith("/invoices/operational")).length;
    await ctx.window.ctView("timesheets");
    await ctx.window.ctView("invoices");
    await new Promise((r) => setImmediate(r));
    assert.equal(gerufen.filter((p) => p.startsWith("/invoices/operational")).length, ersteAbrufe,
      "der zweite Reiterwechsel hat erneut geladen");
  });

  it("die Liste zeigt Nummer, Betrag und den Entwurf als solchen", async () => {
    const { ctx, hole } = sandbox(LISTE);
    await ctx.window.ctLoadInvoices();
    const h = hole("ciBody").innerHTML;
    assert.equal(hole("ciBody").querySelectorAll("tr").length, 3);
    assert.ok(h.includes("RE-2026-000001"), "die Rechnungsnummer fehlt");
    assert.ok(h.includes("2.500,00"), "der Betrag steht nicht in Euro");
    /* Das Modul registriert sein Woerterbuch in der Sandbox mit, also steht
     * hier der uebersetzte Text — der Schluessel taucht nur auf, wenn die
     * Uebersetzung fehlt. Beides gilt als Nachweis, dass der Entwurf benannt
     * wird statt eine leere Zelle zu zeigen. */
    assert.ok(h.includes("noch nicht gestellt") || h.includes("cts.inv.notYetIssued"),
      "ein Entwurf der Gegenseite wird nicht als 'noch nicht gestellt' ausgewiesen");
  });

  it("ein ueberschrittenes Zahlungsziel faellt auf, bevor der Server es merkt", async () => {
    /* Der Server kennt 'overdue' erst nach seinem Lauf. Die Zeile rechnet das
     * Datum selbst nach — sonst saehe eine laengst faellige Rechnung wochenlang
     * aus wie eine frische. */
    const { ctx, hole } = sandbox(LISTE);
    await ctx.window.ctLoadInvoices();
    const zeilen = hole("ciBody").querySelectorAll("tr");
    assert.ok(!zeilen[0].innerHTML.includes("ct-badge--rej"), "die nicht faellige Rechnung ist rot");
    assert.ok(zeilen[1].innerHTML.includes("ct-badge--rej"),
      "die ueberfaellige Rechnung wird nicht hervorgehoben");
  });

  it("keine Zeile bietet eine schreibende Aktion an", async () => {
    const { ctx, hole } = sandbox(LISTE);
    await ctx.window.ctLoadInvoices();
    const h = hole("ciBody").innerHTML;
    assert.ok(!/issue|void|paid/i.test(h),
      "die Liste bietet dem Empfaenger einen Schreibweg an");
  });

  it("das Detail zeigt Positionen und Summen — und nur Wege nach draussen", async () => {
    const { ctx, hole } = sandbox({
      ...LISTE,
      "/invoices/operational/i1$": {
        id: "i1", invoice_number: "RE-2026-000001", supplier_org_name: "Muster Zeitarbeit",
        billing_period_start: "2026-08-01", billing_period_end: "2026-08-07",
        amount_cents: 210000, tax_rate_pct: 19, tax_amount_cents: 39900, total_cents: 249900,
        status: "issued",
        items: [
          { description: "Regulaere Stunden", worker_name: "Anna Bauer", week_start: "2026-08-01", quantity: 40, unit_amount_cents: 4200, total_cents: 168000 },
          { description: "Ueberstunden", worker_name: "Anna Bauer", week_start: "2026-08-01", quantity: 8, unit_amount_cents: 5250, total_cents: 42000 }
        ]
      }
    });
    await ctx.window.ciOpen("i1");
    assert.ok(hole("ciModal").classList.contains("active"), "das Fenster ist zu");
    const b = hole("ciDetailBody").innerHTML;
    assert.equal((b.match(/ct-entry/g) || []).length, 2, "die Positionen fehlen");
    assert.ok(b.includes("Anna Bauer"), "die Kraft wird nicht genannt — dann ist nichts nachvollziehbar");
    assert.ok(b.includes("2.100,00"), "der Nettobetrag fehlt");
    assert.ok(b.includes("399,00"), "die Steuer fehlt");
    assert.ok(b.includes("2.499,00"), "der Gesamtbetrag fehlt");

    const a = hole("ciDetailActions").innerHTML;
    assert.ok(a.includes("export/csv") && a.includes("e-rechnung"), "ein Ausleitungsweg fehlt");
    assert.ok(!/issue|void|paid/i.test(a), "das Detail bietet eine schreibende Aktion an");
  });

  it("ein Fehler landet sichtbar in der Tabelle, nicht in der Konsole", async () => {
    const { ctx, hole } = sandbox();
    ctx.TC.api.get = async () => { const e = new Error("kaputt"); e.code = "SERVER_ERROR"; throw e; };
    await ctx.window.ctLoadInvoices();
    assert.ok(hole("ciBody").innerHTML.includes("ct-empty"),
      "der Fehler wurde verschluckt — der Nutzer saehe eine leere Tabelle ohne Grund");
  });
});
