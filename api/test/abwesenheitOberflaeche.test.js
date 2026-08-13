/**
 * Spur E, Oberflaeche (Wellen E2–E4) — die Tafel wird wirklich gerendert,
 * nicht nur behauptet.
 *
 * WARUM DIESER TEST SO GEBAUT IST
 * Der Frontend-Audit vom 2026-08-13 fand 85 Befunde, und das Muster war immer
 * dasselbe: das Markup ist da, der Aufruf geht raus, und irgendwo dazwischen
 * passiert nichts — der Knopf zeigt ins Leere, das Token fehlt, der Fehler wird
 * geschluckt. Die drei Waechter (frontendVerdrahtung.test.js) fangen das fuer
 * INLINE-Handler in HTML. Sie koennen aber nicht sehen, was eine Render-Funktion
 * zur Laufzeit BAUT — und genau dort haengen die neuen Aktionen dieser Welle.
 *
 * Deshalb wird `mitarbeiter.js` hier in einer vm-Sandbox mit einem winzigen
 * DOM-Ersatz wirklich ausgefuehrt und `renderLiveList` mit echten Zeilen
 * aufgerufen. Geprueft wird das Ergebnis: welcher Knopf entsteht, welcher nicht,
 * und ob Fremdtext escaped ankommt.
 *
 * Run: node --test --test-force-exit test/abwesenheitOberflaeche.test.js
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* Aufwaerts suchen UND auf Inhalt pruefen: Docker legt Mount-Ziele als leere
 * Verzeichnisse an, und ein leeres Verzeichnis macht jede Pruefung lautlos
 * gruen. Diese Falle ist in dieser Codebasis mehrfach zugeschnappt. */
function findeWurzel() {
  for (const start of [process.cwd(), __dirname]) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
      const kandidat = path.join(dir, "frontend/public/js/pages/mitarbeiter.js");
      if (fs.existsSync(kandidat) && fs.statSync(kandidat).size > 1000) return dir;
      const eltern = path.dirname(dir);
      if (eltern === dir) break;
      dir = eltern;
    }
  }
  return null;
}

const ROOT = findeWurzel();
const suite = ROOT ? describe : describe.skip;

suite("Spur E — die Live-Belegschaft in der Oberflaeche", () => {
  let ctx;
  let elemente;
  let html;
  let js;
  let woerter;

  /** Minimaler DOM-Ersatz: nur so viel, wie die Render-Pfade wirklich anfassen. */
  function elem(id) {
    return {
      id, innerHTML: "", textContent: "", value: "", disabled: false,
      style: {}, _classes: new Set(),
      classList: {
        add: function (c) { elemente[id]._classes.add(c); },
        remove: function (c) { elemente[id]._classes.delete(c); },
        contains: function (c) { return elemente[id]._classes.has(c); }
      },
      appendChild: function () {}
    };
  }

  before(() => {
    html = fs.readFileSync(path.join(ROOT, "frontend/public/mitarbeiter.html"), "utf8");
    js = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/mitarbeiter.js"), "utf8");

    elemente = {};
    woerter = { de: {}, en: {} };
    const hole = (id) => (elemente[id] = elemente[id] || elem(id));

    const TCi18n = {
      register: (lang, dict) => Object.assign(woerter[lang] = woerter[lang] || {}, dict),
      // Uebersetzung wie im Original: DE ist Rueckfallebene, nie der rohe Key.
      t: (key, params) => {
        const wert = woerter.de[key];
        if (wert == null) return "";
        return String(wert).replace(/\{(\w+)\}/g, (m, n) => (params && n in params ? String(params[n]) : m));
      },
      locale: () => "de",
      dateLocale: () => "de-DE"
    };

    ctx = {
      TCi18n,
      console,
      // readyState 'loading' verhindert, dass init() beim Laden losfeuert.
      document: {
        readyState: "loading",
        addEventListener: () => {},
        getElementById: (id) => elemente[id] || null,
        querySelectorAll: () => [],
        querySelector: () => null,
        createElement: () => elem("tmp"),
        documentElement: { setAttribute: () => {} }
      },
      window: { TCDate: { todayDE: () => "2026-08-13", isoDateDE: (v) => v } },
      localStorage: { getItem: () => null, setItem: () => {} },
      navigator: { language: "de-DE", languages: ["de-DE"] },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      setTimeout, clearTimeout, setInterval, clearInterval,
      Date, Math, JSON, encodeURIComponent, decodeURIComponent, Intl,
      alert: () => {}, confirm: () => true
    };
    ctx.window.TCi18n = TCi18n;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(js, ctx, { filename: "mitarbeiter.js" });

    hole("liveList");
    hole("liveKpis");
    hole("liveTabs");
    hole("liveBreakdown");
    hole("liveTruncated");
    hole("toast");
  });

  /* ── Die Woerterbuecher ─────────────────────────────────────────────────── */

  it("jeder neue Schluessel steht in DE UND EN — sonst faellt die englische Oberflaeche stumm auf Deutsch zurueck", () => {
    const neue = Object.keys(woerter.de).filter((k) => k.indexOf("mit.live.absence.") === 0 || k === "mit.live.status.absent");
    assert.ok(neue.length >= 20, `erwartet: die Schluessel der Welle E2, gefunden: ${neue.length}`);
    const fehlend = neue.filter((k) => !woerter.en[k]);
    assert.deepEqual(fehlend, [], "diese Schluessel fehlen im englischen Woerterbuch");
  });

  it("die vier Abwesenheitsarten haben in beiden Sprachen ein Label", () => {
    for (const art of ["krank", "urlaub", "termin", "sonstiges"]) {
      assert.ok(woerter.de["mit.live.absence.art." + art], `DE fehlt: ${art}`);
      assert.ok(woerter.en["mit.live.absence.art." + art], `EN fehlt: ${art}`);
    }
  });

  /* ── Das Markup des Dialogs ─────────────────────────────────────────────── */

  it("jedes Feld, das der Code anspricht, gibt es auch in der Seite", () => {
    const ids = ["absenceModal", "absenceWorker", "absenceArt", "absenceVon", "absenceBis", "absenceNotiz", "absenceError", "absenceSubmitBtn"];
    const fehlend = ids.filter((id) => html.indexOf('id="' + id + '"') < 0);
    assert.deepEqual(fehlend, [], "diese Felder spricht mitarbeiter.js an, die Seite kennt sie nicht");
  });

  it("das Auswahlfeld bietet genau die vier Arten des CHECK an — kein fuenfter Wert, den die DB abweist", () => {
    const abschnitt = html.slice(html.indexOf('id="absenceArt"'), html.indexOf('id="absenceArt"') + 600);
    const werte = [...abschnitt.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(werte, ["krank", "urlaub", "termin", "sonstiges"]);
  });

  /* ── Was renderLiveList wirklich baut ───────────────────────────────────── */

  function render(zeilen) {
    ctx.renderLiveList(zeilen);
    return elemente.liveList.innerHTML;
  }

  it("eine abwesende Kraft zeigt Grund, Zeitraum und den Ruecknahme-Knopf", () => {
    const out = render([{
      id: "p1", first_name: "Erika", last_name: "Muster", live_status: "abwesend",
      absence_id: "abw-1", absence_art: "krank", absence_von: "2026-08-13", absence_bis: null,
      open_timesheets: 0
    }]);
    assert.ok(out.includes("Abwesend"), "der Zustand wird benannt");
    assert.ok(out.includes("Krank"), "der Grund steht in der Zeile, nicht nur in der Kachel");
    assert.ok(out.includes("13.08.2026"), "Datum in DACH-Schreibweise");
    assert.ok(out.includes("Ende offen"), "ein offenes Ende wird ausgesprochen, nicht verschwiegen");
    assert.ok(out.includes("revokeAbsence('abw-1')"), "der Ruecknahme-Knopf zeigt auf die konkrete Abwesenheit");
    assert.ok(!out.includes("openAbsenceModal("), "kein zweiter Abmelde-Knopf fuer jemanden, der schon abgemeldet ist");
  });

  it("eine verfuegbare Kraft bekommt den Abmelde-Knopf mit ihrer Profil-ID", () => {
    const out = render([{ id: "p2", first_name: "Max", last_name: "Frei", live_status: "verfuegbar", open_timesheets: 0 }]);
    assert.ok(out.includes("openAbsenceModal('p2')"), "die Profil-ID wird uebergeben — nicht die Konto-ID");
    assert.ok(out.includes("Abmelden"));
  });

  it("eine inaktive Kraft bekommt keinen Abmelde-Knopf — das waere eine Sackgasse", () => {
    const out = render([{ id: "p3", first_name: "Alt", last_name: "Ausgeschieden", live_status: "inaktiv", open_timesheets: 0 }]);
    assert.ok(!out.includes("openAbsenceModal("), "wer nicht mehr beschaeftigt ist, wird nicht krank gemeldet");
  });

  it("die Abwesenden stehen oben — sie sind der Handlungsbedarf", () => {
    const out = render([
      { id: "p1", first_name: "A", last_name: "A", live_status: "verfuegbar", open_timesheets: 0 },
      { id: "p2", first_name: "B", last_name: "B", live_status: "abwesend", absence_id: "x", absence_art: "krank", absence_von: "2026-08-13", open_timesheets: 0 }
    ]);
    assert.ok(out.indexOf("Abwesend") < out.indexOf("Verfügbar"), "Abwesend kommt vor Verfügbar");
  });

  it("der Einsatz-Zusammenhang bleibt stehen: sichtbar, WO die Kraft fehlt", () => {
    const out = render([{
      id: "p4", first_name: "C", last_name: "C", live_status: "abwesend",
      absence_id: "y", absence_art: "urlaub", absence_von: "2026-08-13", absence_bis: "2026-08-20",
      client_name: "Baustelle Nord", open_timesheets: 0
    }]);
    assert.ok(out.includes("Baustelle Nord"), "ohne den Kunden weiss der Disponent nicht, wen er anrufen muss");
    assert.ok(out.includes("bis 20.08.2026"));
  });

  it("Fremdtext wird escaped — ein Kundenname ist kein Markup", () => {
    const out = render([{
      id: "p5", first_name: "<script>alert(1)</script>", last_name: "X", live_status: "abwesend",
      absence_id: "z", absence_art: "krank", absence_von: "2026-08-13",
      client_name: '"><img src=x onerror=alert(1)>', open_timesheets: 0
    }]);
    /* Geprueft wird, dass aus der Eingabe kein TAG und kein ATTRIBUT entsteht —
       nicht, dass die Zeichenfolge "onerror=" nirgends vorkommt. Als reiner Text
       hinter escaptem "<" ist sie harmlos, und eine Pruefung darauf waere ein
       Stellvertreter statt der Eigenschaft (genau der Fehler, der in dieser
       Codebasis fuenfmal gruene Tests ohne Aussage erzeugt hat). */
    assert.ok(!out.includes("<script"), "kein rohes Script-Tag im Markup");
    assert.ok(!out.includes("<img"), "kein rohes Bild-Tag — sonst feuerte onerror wirklich");
    assert.ok(out.includes("&lt;script&gt;"), "die Eingabe erscheint escaped als Text");
    assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"), "auch das Attribut bleibt Text");
    assert.ok(!/<div[^>]*&quot;&gt;<img/.test(out));
  });

  /* ── Die Kachel ─────────────────────────────────────────────────────────── */

  it("die Aufschluesselung nach Grund steht am Abwesenheits-Reiter", () => {
    /* Bis E3 stand sie in einer Kachel. Seit E4 tragen die Reiter die
       Zustands-Zahlen — dieselbe Zusicherung, anderer Ort: 'drei abwesend' allein
       sagt dem Disponenten nicht, ob er Ersatz braucht (krank) oder es laengst
       wusste (Urlaub). */
    ctx.setLiveFilter("abwesend", { silent: true });
    ctx.renderLiveTabs({ total: 5, abwesend: 3, abwesend_nach_art: { krank: 2, urlaub: 1, termin: 0, sonstiges: 0 } });
    const out = elemente.liveBreakdown.innerHTML;
    assert.ok(/Krank[\s\S]*?2/.test(out), "krank wird beziffert — davon haengt ab, ob Ersatz noetig ist");
    assert.ok(/Urlaub[\s\S]*?1/.test(out));
    assert.ok(!out.includes("Termin"), "was null ist, wird nicht aufgezaehlt");
    assert.strictEqual(elemente.liveBreakdown.style.display, "flex");
    ctx.setLiveFilter("alle", { silent: true });
  });

  it("keine Zahl steht doppelt: die Kacheln fuehren nur noch, was kein Reiter ist", () => {
    // Zweimal dieselbe Zahl an zwei Orten heisst, dass eine von beiden
    // irgendwann falsch ist.
    ctx.renderLiveKpis({ total: 5, abwesend: 3, im_einsatz: 1, verfuegbar: 1, auslastung_pct: 20, open_timesheets: 0 });
    const out = elemente.liveKpis.innerHTML;
    assert.ok(out.includes("Auslastung") && out.includes("Belegschaft"));
    assert.ok(!out.includes("Abwesend") && !out.includes("Verfügbar"),
      "Zustands-Zahlen gehoeren seit E4 ausschliesslich in die Reiter");
  });

  /* ── Der schreibende Aufruf ─────────────────────────────────────────────── */

  it("die Aktionen rufen genau die Endpunkte auf, die die Route anbietet", () => {
    assert.ok(/api\("\/workers\/absences",\s*\{\s*\n?\s*method:\s*"POST"/.test(js) || js.includes('api("/workers/absences", {'),
      "Erfassen geht auf POST /workers/absences");
    assert.ok(js.includes('"/workers/absences/" + encodeURIComponent(absenceId) + "/aufheben"'),
      "Zuruecknehmen geht auf den Aufheben-Pfad, mit kodierter ID");

    const route = fs.readFileSync(path.join(ROOT, "api/routes/workers.js"), "utf8");
    assert.ok(route.includes('router.post("/workers/absences"'), "die Route existiert wirklich");
    assert.ok(route.includes('/workers/absences/:id([0-9a-fA-F-]{36})/aufheben'), "auch der Aufheben-Pfad");
  });

  /* ── Welle E3: Montage ──────────────────────────────────────────────────── */

  it("Montage hat in beiden Sprachen ein Label", () => {
    assert.ok(woerter.de["mit.live.status.montage"]);
    assert.ok(woerter.en["mit.live.status.montage"]);
  });

  it("eine Montage-Zeile steht unter Montage und zeigt den Kunden", () => {
    const out = render([{
      id: "m1", first_name: "Mont", last_name: "Auswaerts", live_status: "montage",
      is_montage: true, client_name: "Werk Sued", effective_end_date: "2026-09-30", open_timesheets: 0
    }]);
    assert.ok(out.includes("Montage"));
    assert.ok(out.includes("Werk Sued"));
    assert.ok(out.includes("openAbsenceModal('m1')"), "auch von der Montage kann man sich abmelden");
  });

  it("das nahende Ende bleibt in der Zeile sichtbar, obwohl der Zustand 'montage' heisst", () => {
    // Sonst uebersieht der Disponent genau die Rueckkehr, die er planen muss.
    const out = render([{
      id: "m2", first_name: "A", last_name: "B", live_status: "montage",
      is_montage: true, endet_bald: true, effective_end_date: "2026-08-18", open_timesheets: 0
    }]);
    assert.ok(out.includes("Endet bald"), "der Hinweis darf nicht verschwinden");
  });

  it("Montage bekommt einen eigenen Reiter mit eigener Zahl", () => {
    ctx.renderLiveTabs({ total: 3, montage: 2, abwesend_nach_art: {} });
    const out = elemente.liveTabs.innerHTML;
    assert.ok(out.includes("Montage"));
    assert.ok(/data-status="montage"[\s\S]*?>2</.test(out), "mit dem Zaehlwert aus derselben Antwort");
  });

  it("der Einsatz-Editor bietet den Schalter an — sonst bleibt der Reiter leer", () => {
    const rev = fs.readFileSync(path.join(ROOT, "frontend/public/js/pages/workerSubmissionsReview.js"), "utf8");
    assert.ok(rev.includes('id="le-is_montage"'), "Schalter im Formular");
    assert.ok(/body\.is_montage\s*=\s*!!mont\.checked/.test(rev),
      "ein Schalter wird IMMER mitgeschickt — sonst liesse sich eine falsch gesetzte Montage nie abwaehlen");
    const route = fs.readFileSync(path.join(ROOT, "api/routes/workers.js"), "utf8");
    assert.ok(/"is_montage"/.test(route), "und die Route laesst das Feld auch durch");
    assert.ok(/is_montage:\s+z\.boolean\(\)\.optional\(\)/.test(route), "mit Validierung");
  });

  it("der Mitarbeiter erfaehrt im Einsatzportal, dass er auswaerts uebernachtet", () => {
    const ep = fs.readFileSync(path.join(ROOT, "frontend/public/einsatzportal-einsaetze.html"), "utf8");
    assert.ok(ep.includes("a.is_montage"), "die Karte wertet das Feld aus");
    assert.ok(ep.includes("'ep.einsaetze.montageHinweis': 'Ausw"), "DE-Hinweis vorhanden");
    assert.ok(/'ep\.einsaetze\.montageHinweis': 'Away assignment/.test(ep), "EN-Hinweis vorhanden");
    const svc = fs.readFileSync(path.join(ROOT, "api/services/workerService.js"), "utf8");
    assert.ok((svc.match(/wal\.is_montage/g) || []).length >= 3,
      "alle drei Leser-Abfragen reichen das Feld durch — sonst zeigt die Karte nie etwas");
  });

  /* ── Welle E4: die Reiter ───────────────────────────────────────────────── */

  it("jeder Reiter hat in beiden Sprachen ein Label und einen eigenen Leerzustand", () => {
    for (const st of ctx.LIVE_TAB_ORDER) {
      const leerKey = st === "alle" ? "mit.live.empty" : "mit.live.leer." + st;
      assert.ok(woerter.de[leerKey], `DE fehlt: ${leerKey}`);
      assert.ok(woerter.en[leerKey], `EN fehlt: ${leerKey}`);
    }
    assert.ok(woerter.de["mit.live.tab.all"] && woerter.en["mit.live.tab.all"]);
  });

  it("die Zaehlwerte der Reiter ergeben zusammen die Gesamtzahl (Gate E4)", () => {
    const kpis = { total: 12, abwesend: 3, endet_bald: 2, montage: 1, im_einsatz: 4, verfuegbar: 1, inaktiv: 1, abwesend_nach_art: {} };
    ctx.renderLiveTabs(kpis);
    const zahlen = {};
    for (const m of elemente.liveTabs.innerHTML.matchAll(/data-status="([a-z_]+)"[\s\S]*?live-tab-count">(\d+)</g)) {
      zahlen[m[1]] = Number(m[2]);
    }
    const summe = ctx.LIVE_TAB_ORDER
      .filter((st) => st !== "alle")
      .reduce((n, st) => n + (zahlen[st] || 0), 0);
    assert.strictEqual(summe, zahlen.alle,
      "kein Mensch faellt zwischen zwei Reiter, keiner erscheint doppelt");
    assert.strictEqual(zahlen.alle, kpis.total);
  });

  it("ein leerer Reiter bleibt sichtbar — nur gedaempft", () => {
    // Ihn zu verstecken zwaenge den Nutzer zu raten, ob er die Frage falsch
    // gestellt hat. "Niemand ist krank gemeldet" IST eine Antwort.
    ctx.renderLiveTabs({ total: 1, im_einsatz: 1, abwesend: 0, abwesend_nach_art: {} });
    const out = elemente.liveTabs.innerHTML;
    assert.ok(out.includes('data-status="abwesend"'), "der Reiter ist da");
    assert.ok(/data-status="abwesend"[^>]*data-leer="1"/.test(out), "und als leer gekennzeichnet");
  });

  it("ein Reiter filtert wirklich — und die anderen Zustaende verschwinden", () => {
    const zeilen = [
      { id: "a1", first_name: "Krank", last_name: "K", live_status: "abwesend", absence_id: "x", absence_art: "krank", absence_von: "2026-08-13", open_timesheets: 0 },
      { id: "a2", first_name: "Frei", last_name: "F", live_status: "verfuegbar", open_timesheets: 0 }
    ];
    ctx.setLiveFilter("abwesend", { silent: true });
    ctx.renderLiveList(zeilen);
    const out = elemente.liveList.innerHTML;
    assert.ok(out.includes("Krank"));
    assert.ok(!out.includes(">Frei"), "die verfuegbare Kraft gehoert nicht in diesen Reiter");
    ctx.setLiveFilter("alle", { silent: true });
  });

  it("jeder leere Reiter erklaert seine Leere mit eigenen Worten", () => {
    const faelle = {
      abwesend: "abgemeldet",
      montage: "Montage",
      verfuegbar: "frei",
      inaktiv: "aktiv"
    };
    for (const [status, wort] of Object.entries(faelle)) {
      ctx.setLiveFilter(status, { silent: true });
      ctx.renderLiveList([{ id: "x", live_status: "im_einsatz", first_name: "A", last_name: "B", open_timesheets: 0 }]);
      assert.ok(elemente.liveList.innerHTML.includes(wort),
        `der Leerzustand von "${status}" sagt nicht, worum es ging`);
    }
    ctx.setLiveFilter("alle", { silent: true });
  });

  it("der Leerzustand von 'endet bald' nennt das echte Zeitfenster des Servers", () => {
    // Eine fest eingetippte 7 waere gelogen, sobald der Server das Fenster aendert.
    ctx.setLiveFilter("endet_bald", { silent: true });
    ctx.renderLiveList([]);
    assert.ok(elemente.liveList.innerHTML.includes("7"), "Rueckfall, wenn kein Scope da ist");
    ctx.setLiveFilter("alle", { silent: true });
  });

  it("die Reiterleiste ist mit der Tastatur bedienbar (WAI-ARIA)", () => {
    ctx.setLiveFilter("alle", { silent: true });
    ctx.renderLiveTabs({ total: 0, abwesend_nach_art: {} });
    const out = elemente.liveTabs.innerHTML;
    assert.strictEqual((out.match(/role="tab"/g) || []).length, ctx.LIVE_TAB_ORDER.length);
    assert.strictEqual((out.match(/aria-selected="true"/g) || []).length, 1, "genau ein Reiter ist gewaehlt");
    assert.strictEqual((out.match(/tabindex="0"/g) || []).length, 1, "roving tabindex: nur der gewaehlte ist erreichbar");
    assert.ok(out.includes('aria-controls="liveList"'), "der Reiter benennt den Bereich, den er steuert");

    let verhindert = false;
    ctx.liveTabKey({ key: "ArrowRight", preventDefault: () => { verhindert = true; } });
    assert.ok(verhindert, "die Pfeiltaste wird abgefangen, sonst scrollt die Seite");
    assert.ok(elemente.liveTabs.innerHTML.includes('id="liveTab-abwesend" aria-selected="true"'),
      "Pfeil rechts waehlt den naechsten Reiter");

    ctx.liveTabKey({ key: "End", preventDefault: () => {} });
    const letzter = ctx.LIVE_TAB_ORDER[ctx.LIVE_TAB_ORDER.length - 1];
    assert.ok(elemente.liveTabs.innerHTML.includes('id="liveTab-' + letzter + '" aria-selected="true"'));
    ctx.setLiveFilter("alle", { silent: true });
  });

  it("eine abgeschnittene Liste sagt es — sonst liest sich die Deckelung wie Vollstaendigkeit", () => {
    ctx.renderLiveTruncated(true, { limit: 300 });
    assert.ok(elemente.liveTruncated.textContent.includes("300"));
    assert.strictEqual(elemente.liveTruncated.style.display, "");
    ctx.renderLiveTruncated(false, { limit: 300 });
    assert.strictEqual(elemente.liveTruncated.style.display, "none");
  });

  it("der Name ist der Deep-Link auf genau diesen Menschen", () => {
    const out = render([{ id: "p9", user_id: "u9", first_name: "Ziel", last_name: "Person", live_status: "verfuegbar", open_timesheets: 0 }]);
    assert.ok(out.includes("openWorkerDetail('p9')"), "auf die Personalakte, nicht auf die Uebersicht");
    assert.ok(out.includes("Ziel Person"));
  });

  it("ein Mensch ohne Konto verliert seinen Namen nicht, nur den Verweis", () => {
    // worker_profiles.user_id darf seit Mig 175 NULL sein. Ein Verweis ins Leere
    // waere schlimmer als kein Verweis.
    const out = render([{ id: "", first_name: "Ohne", last_name: "Konto", live_status: "verfuegbar", open_timesheets: 0 }]);
    assert.ok(out.includes("Ohne Konto"));
    assert.ok(!out.includes("openWorkerDetail("));
  });

  it("der Fehlerfall wird gezeigt, nicht geschluckt", () => {
    // Genau das Muster, das der Audit 85-mal fand: .catch(function(){}) ohne Ausgabe.
    const abschnitt = js.slice(js.indexOf("function saveAbsence"), js.indexOf("function revokeAbsence"));
    assert.ok(abschnitt.includes("showAbsenceError"), "der Dialog hat eine sichtbare Fehlerzeile");
    assert.ok(abschnitt.includes("ABSENCE_OVERLAP"), "die Ueberlappung bekommt eine eigene, verstaendliche Meldung");
    assert.ok(!/\.catch\(function\(\)\s*\{\s*\}\)/.test(abschnitt), "kein leerer catch-Block");
  });
});
