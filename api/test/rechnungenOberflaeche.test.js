/**
 * Der Rechnungen-Reiter der Agenturseite (Welle J7).
 *
 * Aus freigegebenen Stundenzetteln wird die Rechnung an das Unternehmen. Der
 * Reiter liegt in `worker-submissions-review.html` und nicht auf einer eigenen
 * Flaeche: wer die Zettel freigibt, stellt auch die Rechnung.
 *
 * WAS HIER GESCHUETZT WIRD
 *
 *   A) DIE VERDRAHTUNG gegen das echte Markup. Reiter, Panel, jedes Element,
 *      das die Logik anspricht, und jede Funktion hinter einem onclick. Faellt
 *      eines weg, verschwindet der Reiter lautlos oder ein Knopf tut nichts.
 *   B) DAS VERHALTEN, in einer vm-Sandbox wirklich ausgefuehrt (Muster aus
 *      h1KundenansichtAusfall Teil C):
 *        - Die Stammdaten-Warnung erscheint NUR bei fehlenden Feldern und nennt
 *          sie im Klartext. Ohne Stammdaten ist keine Rechnung gueltig
 *          (§ 14 UStG) — das darf man nicht erst beim Stellen erfahren.
 *        - Abrechenbare Zettel werden JE EINSATZ gebuendelt. Eine Rechnung
 *          entsteht je Einsatz; wer sie einzeln auflistete, liesse den Nutzer
 *          die Buendelung im Kopf machen.
 *        - Ohne Stundensatz KEIN Erzeugen-Knopf (der Server meldete sonst
 *          NO_HOURLY_RATE, nachdem der Nutzer geklickt hat).
 *        - Ein Entwurf traegt KEINE Nummer — sie faellt erst beim Stellen
 *          (Mig 203). Die Oberflaeche sagt das, statt eine Luecke zu zeigen.
 *        - Die Knoepfe folgen dem Zustandsautomaten des Servers.
 *
 * Run: node --test --test-force-exit test/rechnungenOberflaeche.test.js
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
      const kandidat = path.join(dir, "frontend/public/js/pages/workerSubmissionsReview.js");
      if (fs.existsSync(kandidat) && fs.statSync(kandidat).size > 10000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

/** Alles, was die Rechnungslogik im Markup anspricht. */
const ELEMENTE = [
  "panel-inv", "tab-inv", "invStateNotice", "invReadiness",
  "invBillable", "invRechnungen", "invFilterStatus",
  "ki1", "ki2", "ki3", "ki4"
];
/** Jede Funktion, die aus einem onclick gerufen wird. */
const FUNKTIONEN = ["loadInv", "invErzeugen", "invStellen", "invBezahlt", "invStornieren"];

suite("Rechnungen-Reiter · Teil A — die Verdrahtung", () => {
  let html, js;
  before(() => {
    html = fs.readFileSync(path.join(ROOT, "frontend/public/worker-submissions-review.html"), "utf8");
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/workerSubmissionsReview.js"), "utf8");
    assert.ok(html.length > 5000 && js.length > 20000, "Datei leer oder Mount-Attrappe");
  });

  it("jedes Element, das die Logik anspricht, gibt es im Markup", () => {
    for (const id of ELEMENTE) {
      assert.ok(html.includes(`id="${id}"`), `"${id}" fehlt — die Logik schriebe ins Leere`);
    }
  });

  it("keine Kennung ist doppelt vergeben", () => {
    /* `invList` gehoert seit laengerem den Einladungen im Einreichungen-Panel;
     * die Rechnungsliste heisst deshalb `invRechnungen`. Zwei gleiche
     * Kennungen treffen sich irgendwann in einem getElementById. */
    for (const id of ELEMENTE) {
      const treffer = html.split(`id="${id}"`).length - 1;
      assert.equal(treffer, 1, `"${id}" steht ${treffer}-mal im Markup`);
    }
  });

  it("jede Funktion hinter einem onclick existiert", () => {
    for (const fn of FUNKTIONEN) {
      assert.ok(new RegExp(`window\\.${fn}\\s*=`).test(js),
        `"${fn}" wird nicht auf window gelegt — der Knopf waere tot`);
    }
  });

  it("der Reiter haengt an der Abrechnungsberechtigung, nicht am Worker-Modul", () => {
    /* Eine Buchhaltung darf Rechnungen stellen, ohne Einsatzkraefte zu
     * verwalten. Haenge der Reiter am worker_module, saehe sie ihn nie. */
    assert.match(js, /inv:\s*!!caps\.org_billing/,
      "der Reiter ist nicht an org_billing gebunden");
    assert.match(js, /TAB_ORDER=\[[^\]]*'inv'/, "'inv' fehlt in der Reiter-Reihenfolge");
  });

  it("der Reiterwechsel laedt die Rechnungen beim ersten Oeffnen", () => {
    assert.match(js, /t==='inv'&&\(!invLoaded\|\|opts\.force\)/,
      "der Reiter laedt seine Daten nicht (oder bei jedem Wechsel neu)");
  });

  it("jeder Text steht in DE und EN", () => {
    const de = js.slice(0, js.indexOf("TCi18n.register('en'"));
    const en = js.slice(js.indexOf("TCi18n.register('en'"));
    const schluessel = [...new Set([...de.matchAll(/'(ts\.rev\.inv\.[a-zA-Z]+)'\s*:/g)].map((m) => m[1]))];
    assert.ok(schluessel.length >= 40, `zu wenige Schluessel gefunden: ${schluessel.length}`);
    const fehlend = schluessel.filter((k) => !en.includes(`'${k}'`));
    assert.deepEqual(fehlend, [],
      "diese Schluessel fehlen auf Englisch — die Oberflaeche faellt dort stumm auf Deutsch zurueck");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 *  Teil B — das Verhalten, wirklich ausgefuehrt
 * ═══════════════════════════════════════════════════════════════════════════ */

suite("Rechnungen-Reiter · Teil B — das Verhalten", () => {
  let js;
  before(() => {
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/workerSubmissionsReview.js"), "utf8");
  });

  /**
   * Die Renderer allein ausfuehren. Die Seiten-JS ist gross und zieht beim
   * Laden Netzaufrufe nach — deshalb werden nur die vier reinen
   * Render-Funktionen samt ihrer Helfer in eine Sandbox geschnitten. Sie
   * beruehren nichts als das DOM, das ihnen gegeben wird.
   */
  function sandbox() {
    const elemente = {};
    function elem(id) {
      return {
        id, innerHTML: "", textContent: "", value: "", style: {},
        querySelectorAll(sel) {
          /* Nur was die Proben brauchen: Zeilen der gerenderten Tabelle. */
          if (!/tr/.test(sel)) return [];
          const teile = String(this.innerHTML).split("<tr>").slice(1);
          const koerper = this.innerHTML.includes("<tbody>")
            ? this.innerHTML.split("<tbody>")[1].split("<tr>").slice(1)
            : teile;
          return koerper.map((h) => ({ innerHTML: h }));
        }
      };
    }
    const hole = (id) => (elemente[id] = elemente[id] || elem(id));

    const woerter = {};
    const ctx = {
      console, Map, Set, Array, Object, String, Number, Boolean, JSON, Math, Date, RegExp, Error, Promise,
      API: "/api",
      /* Die Uebersetzung gibt den Schluessel zurueck, wenn nichts hinterlegt
       * ist — die Proben pruefen Struktur und Zahlen, nicht die Wortwahl. */
      tt: (k, p) => (woerter[k] || k).replace(/\{(\w+)\}/g, (m, n) => (p && n in p ? p[n] : m)),
      esc: (s) => String(s == null ? "" : s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] || c)),
      TCi18n: { locale: () => "de" },
      pageAccess: { tabs: { inv: true } },
      document: { getElementById: (id) => hole(id) },
      window: {},
      setPanelNotice: () => {},
      isTransientError: () => false,
      toast: () => {},
      fetchJson: async () => ({ items: [] }),
      getCsrf: async () => "x",
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      confirm: () => true
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    /* Nur den Rechnungs-Abschnitt ausfuehren — ab seiner Ueberschrift. */
    const start = js.indexOf("const INVOICE_URL");
    assert.ok(start > 0, "der Rechnungs-Abschnitt wurde nicht gefunden");
    const abschnitt = js.slice(start).replace(/^const INVOICE_URL[^\n]*\n/, 'const INVOICE_URL = "/api/invoices/operational";\n');
    vm.runInContext(abschnitt, ctx, { filename: "rechnungen.js" });
    return { ctx, elemente, hole };
  }

  it("die Stammdaten-Warnung erscheint nur, wenn etwas fehlt — und nennt es", () => {
    const { ctx, hole } = sandbox();
    ctx.renderInvReadiness({ bereit: false, fehlend: [{ feld: "Verkäufer: USt-IdNr. oder Steuernummer" }] });
    const el = hole("invReadiness");
    assert.notEqual(el.style.display, "none", "die Warnung blieb verborgen");
    assert.ok(el.innerHTML.includes("USt-IdNr"), "die Warnung nennt das fehlende Feld nicht");

    ctx.renderInvReadiness({ bereit: true, fehlend: [] });
    assert.equal(hole("invReadiness").style.display, "none",
      "die Warnung bleibt stehen, obwohl alles gepflegt ist");
  });

  it("abrechenbare Zettel werden je EINSATZ gebuendelt", () => {
    const { ctx, hole } = sandbox();
    ctx.renderInvBillable([
      { id: "t1", assignment_id: "a1", total_hours: 10, hourly_rate_cents: 4200 },
      { id: "t2", assignment_id: "a1", total_hours: 5, hourly_rate_cents: 4200 },
      { id: "t3", assignment_id: "a2", total_hours: 8, hourly_rate_cents: 4200 }
    ]);
    const zeilen = hole("invBillable").querySelectorAll("tbody tr");
    assert.equal(zeilen.length, 2, "drei Zettel auf zwei Einsaetzen ergeben zwei Zeilen");
    assert.ok(zeilen[0].innerHTML.includes(">2<"), "die Zettelzahl des ersten Einsatzes stimmt nicht");
    assert.ok(zeilen[0].innerHTML.includes(">15<"), "die Stunden wurden nicht summiert");
  });

  it("ohne Stundensatz gibt es keinen Erzeugen-Knopf", () => {
    /* Sonst meldete der Server NO_HOURLY_RATE, nachdem der Nutzer geklickt
     * hat — die Oberflaeche weiss es vorher. */
    const { ctx, hole } = sandbox();
    ctx.renderInvBillable([{ id: "t1", assignment_id: "a1", total_hours: 8, hourly_rate_cents: null }]);
    const h = hole("invBillable").innerHTML;
    assert.ok(!h.includes("invErzeugen"), "der Knopf steht trotz fehlendem Satz");
    assert.ok(h.includes("ts.rev.inv.noRate"), "der Grund wird nicht benannt");
  });

  it("ein Entwurf traegt keine Nummer — und die Oberflaeche sagt es", () => {
    const { ctx, hole } = sandbox();
    ctx.renderInvList([{ id: "i1", invoice_number: null, status: "draft", total_cents: 49980 }]);
    const h = hole("invRechnungen").innerHTML;
    assert.ok(h.includes("ts.rev.inv.noNumberYet"),
      "der Entwurf zeigt keine Erklaerung fuer die fehlende Nummer");
  });

  it("die Knoepfe folgen dem Zustandsautomaten des Servers", () => {
    const { ctx, hole } = sandbox();
    ctx.renderInvList([
      { id: "i1", invoice_number: null, status: "draft", total_cents: 1 },
      { id: "i2", invoice_number: "RE-2026-000001", status: "issued", total_cents: 1 },
      { id: "i3", invoice_number: "RE-2026-000002", status: "paid", total_cents: 1 },
      { id: "i4", invoice_number: "RE-2026-000003", status: "void", total_cents: 1 }
    ]);
    const z = hole("invRechnungen").querySelectorAll("tbody tr");
    assert.equal(z.length, 4);
    assert.ok(/invStellen/.test(z[0].innerHTML), "ein Entwurf muss stellbar sein");
    assert.ok(/invBezahlt/.test(z[1].innerHTML), "eine gestellte Rechnung muss als bezahlt markierbar sein");
    assert.ok(!/invStellen/.test(z[1].innerHTML), "eine gestellte Rechnung darf nicht erneut stellbar sein");
    /* paid und void sind Endzustaende — dort gibt es nichts mehr zu tun. */
    for (const i of [2, 3]) {
      assert.ok(!/inv(Stellen|Bezahlt|Stornieren)/.test(z[i].innerHTML),
        `Zeile ${i} ist ein Endzustand und darf keine Aktion mehr anbieten`);
    }
    assert.ok(z.every((r) => r.innerHTML.includes("export/csv")), "der CSV-Weg fehlt in einer Zeile");
  });

  it("Betraege stehen in Euro, nicht in Cent", () => {
    const { ctx, hole } = sandbox();
    ctx.renderInvKpis({ draft_count: 2, issued_count: 5, overdue_count: 1, outstanding_cents: 123456 });
    assert.equal(hole("ki1").textContent, 2);
    assert.ok(String(hole("ki4").textContent).includes("1.234,56"),
      `der offene Betrag wird nicht als Euro gezeigt: ${hole("ki4").textContent}`);
  });

  it("ohne Berechtigung laedt der Reiter nichts nach", async () => {
    const { ctx } = sandbox();
    ctx.pageAccess.tabs.inv = false;
    let gerufen = false;
    ctx.fetchJson = async () => { gerufen = true; return { items: [] }; };
    await ctx.loadInv();
    assert.equal(gerufen, false, "ohne Berechtigung wurde trotzdem abgefragt");
  });
});
