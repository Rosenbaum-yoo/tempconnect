"use strict";
/* global PortalApi, PortalShell, TCi18n, TCDate */

/**
 * portalAbwesenheit.js — der dreistufige Ablauf der Selbst-Abmeldung (Welle G5)
 *
 * DIE REGELN LIEGEN HINTEN. Diese Datei zeigt sie nur an:
 *  - Die Zeitsperre (G-E6) wird serverseitig geprueft. Der Zaehler hier ist eine
 *    ANZEIGE, keine Durchsetzung — der Absenden-Knopf wird deshalb NIE hart
 *    gesperrt. Wer es zu frueh versucht, bekommt die Antwort des Servers zu
 *    sehen, samt Restzeit. Eine per JavaScript gesperrte Schaltflaeche waere
 *    ueber die Entwicklerkonsole in zehn Sekunden frei; eine, die es versucht
 *    und ehrlich scheitert, ist verlaesslicher als eine, die so tut.
 *  - Die Mindestbeschreibung (G-E8) ebenso. Der Zaehler sagt, wie viele Woerter
 *    FEHLEN — eine Ablehnung ohne Zahl laesst den Menschen raten.
 *
 * DER ZAEHLER DRIFTET, UND DAS IST EINGEPLANT. Ein Mobil-Tab im Hintergrund
 * friert Timer ein. Deshalb wird bei `visibilitychange` gegen den Server neu
 * abgeglichen (POST /vorgang ist idempotent und liefert die echte Restzeit).
 * Ohne diesen Abgleich zeigte die Seite "noch 40 s", waehrend der Server laengst
 * frei ist — oder umgekehrt.
 *
 * ZWISCHENSPEICHER: Die vier Antworten kosten Muehe. Ein Fehler im dritten
 * Schritt darf sie nicht loeschen, deshalb liegen sie in sessionStorage. Sie
 * verlassen das Geraet nicht und sind mit dem Tab wieder weg.
 */
(function () {

  /* Die vier Fragen. WORTGLEICH mit BESCHREIBUNG_FRAGEN in
   * api/services/workerAbsenceService.js — der Server setzt seinen Fragetext
   * woertlich vor die Antwort und legt beides in der Akte ab. Weicht die
   * Anzeige hier ab, liest der Disponent eine andere Frage, als der Mensch
   * beantwortet hat. `api/test/g5AbwesenheitOberflaeche.test.js` haelt beide
   * Listen gegeneinander. */
  var FRAGEN = [
    { schluessel: 'seit_wann',                 frage: 'Seit wann?' },
    { schluessel: 'voraussichtlich_bis',       frage: 'Voraussichtlich bis wann?' },
    { schluessel: 'arzt',                      frage: 'Arzt aufgesucht oder Krankschreibung zu erwarten?' },
    { schluessel: 'eingeschraenkt_einsetzbar', frage: 'Waerst du eingeschraenkt einsetzbar?' }
  ];

  var ARTEN = ['krank', 'urlaub', 'termin', 'sonstiges'];
  var MINDEST_WOERTER = 30;
  var VERSPAETUNG_MAX = 240;
  var DATUM_RX = /^\d{4}-\d{2}-\d{2}$/;
  var SPEICHER = 'tc.abwesenheit.entwurf';

  var _schritt = 1;
  var _art = null;
  var _folgen = null;
  var _sperreBis = 0;      // Zeitpunkt in ms, ab dem der Server freigibt
  var _ticker = null;
  var _sendet = false;

  function t(k, p) { return TCi18n.t(k, p) || ''; }
  function esc(s) { return PortalShell.esc(s); }
  function $(id) { return document.getElementById(id); }

  /* ── Entwurf: haelt die Muehe fest ─────────────────────────────── */
  function entwurfLesen() {
    try { return JSON.parse(sessionStorage.getItem(SPEICHER) || '{}'); } catch (e) { return {}; }
  }
  function entwurfSchreiben() {
    try {
      var d = { art: _art, von: ($('awVon') || {}).value, bis: ($('awBis') || {}).value };
      FRAGEN.forEach(function (f) { var el = $('f_' + f.schluessel); if (el) d[f.schluessel] = el.value; });
      sessionStorage.setItem(SPEICHER, JSON.stringify(d));
    } catch (e) { /* privater Modus: kein Speicher, kein Fehler */ }
  }
  function entwurfLoeschen() { try { sessionStorage.removeItem(SPEICHER); } catch (e) { /* egal */ } }

  /* ── Wortzahl: dieselbe Zaehlweise wie der Server ───────────────── */
  function woerter() {
    var text = FRAGEN.map(function (f) {
      var el = $('f_' + f.schluessel);
      return el ? String(el.value || '').trim() : '';
    }).filter(Boolean).join(' ');
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }

  function zaehlerZeichnen() {
    var el = $('wortZaehler'); if (!el) return;
    var n = woerter();
    var fehlt = MINDEST_WOERTER - n;
    if (fehlt > 0) {
      el.className = 'aw-zaehler';
      el.textContent = t('ep.abwesenheit.words.missing', { n: fehlt });
    } else {
      el.className = 'aw-zaehler genug';
      el.textContent = t('ep.abwesenheit.words.enough', { n: n });
    }
    pruefeWeiter();
  }

  /* ── Schritt 1: Art waehlen ────────────────────────────────────── */
  function artenZeichnen() {
    var box = $('artenBox'); if (!box) return;
    box.innerHTML = ARTEN.map(function (a) {
      return '<button type="button" class="aw-art" data-art="' + esc(a) + '" aria-pressed="false">' +
        '<span>' + esc(t('ep.abwesenheit.art.' + a)) + '</span>' +
        '<small>' + esc(t('ep.abwesenheit.art.' + a + 'Sub')) + '</small>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.aw-art'), function (b) {
      b.addEventListener('click', function () { artWaehlen(b.getAttribute('data-art')); });
    });
  }

  function artWaehlen(a) {
    _art = a;
    Array.prototype.forEach.call(document.querySelectorAll('.aw-art'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-art') === a ? 'true' : 'false');
    });
    entwurfSchreiben();
    pruefeWeiter();

    /* DIE UHR STARTET HIER, nicht beim Oeffnen der Seite. Wer nur nachsieht,
     * was es gibt, soll keine Sperre ausloesen; wer eine Art waehlt, hat
     * begonnen. Ab jetzt laeuft die Wartezeit waehrend des Tippens ab — genau
     * das meint G-E6: aus Strafzeit wird Lesezeit. */
    vorgangEroeffnen();
  }

  /* ── Die Zeitsperre: Anzeige, nicht Durchsetzung ───────────────── */
  async function vorgangEroeffnen() {
    try {
      var r = await PortalApi.post('/worker/me/abwesenheit/vorgang', {});
      var rest = Number(r && r.verbleibend_sekunden) || 0;
      _sperreBis = Date.now() + rest * 1000;
      sperreZeichnen();
    } catch (e) {
      /* Klemmt das Eroeffnen, laeuft der Ablauf trotzdem weiter: Der Server
       * weist beim Absenden mit 428 ab, und DIESE Antwort ist verstaendlich.
       * Hier zu blockieren hiesse, den Menschen vor einer Tuer stehen zu
       * lassen, die vielleicht offen ist. */
      _sperreBis = 0;
    }
  }

  function sperreZeichnen() {
    var el = $('sperreBox'); if (!el) return;
    var rest = Math.max(0, Math.ceil((_sperreBis - Date.now()) / 1000));
    if (rest > 0) {
      el.className = 'aw-sperre';
      el.textContent = t('ep.abwesenheit.lock.waiting', { n: rest });
    } else {
      el.className = 'aw-sperre frei';
      el.textContent = t('ep.abwesenheit.lock.free');
    }
  }

  function tickerStarten() {
    if (_ticker) clearInterval(_ticker);
    _ticker = setInterval(sperreZeichnen, 1000);
  }
  function tickerStoppen() { if (_ticker) { clearInterval(_ticker); _ticker = null; } }

  /* ── Schritt 2: die vier Fragen ────────────────────────────────── */
  function fragenZeichnen() {
    var box = $('fragenBox'); if (!box || box.dataset.fertig) return;
    box.innerHTML = FRAGEN.map(function (f) {
      return '<div class="aw-frage">' +
        '<label for="f_' + esc(f.schluessel) + '">' + esc(f.frage) + '</label>' +
        '<textarea id="f_' + esc(f.schluessel) + '" rows="2"></textarea>' +
        '</div>';
    }).join('');
    box.dataset.fertig = '1';
    FRAGEN.forEach(function (f) {
      var el = $('f_' + f.schluessel);
      if (el) el.addEventListener('input', function () { zaehlerZeichnen(); entwurfSchreiben(); });
    });
  }

  /* ── Schritt 3: die Folgen, namentlich ─────────────────────────── */
  async function folgenLaden() {
    var box = $('folgenBox'); if (!box) return;
    box.innerHTML = '<div class="ep-skel" style="height:80px"></div>';

    var von = ($('awVon') || {}).value;
    var bis = ($('awBis') || {}).value;

    /* `bis` VOR dem Laden pruefen. Ein unvollstaendiges Datum wird
     * serverseitig zu null, und null heisst im Zeitraum "offenes Ende" — die
     * Vorschau zeigte dann still ALLE kuenftigen Einsaetze statt der
     * betroffenen. Das Gate verlangt echte Einsatzdaten; mehr zu zeigen als
     * betroffen ist, erfuellt es formal und verletzt es inhaltlich. */
    var query = { von: von };
    if (bis && DATUM_RX.test(bis)) query.bis = bis;

    try {
      var r = await PortalApi.get('/worker/me/abwesenheit/folgen', query);
      _folgen = (r && r.einsaetze) || [];
      folgenZeichnen();
    } catch (e) {
      /* LEER ist nicht dasselbe wie FEHLGESCHLAGEN. Ein Fehler darf hier nicht
       * wie "kein Einsatz betroffen" aussehen — sonst meldet sich jemand ab im
       * Glauben, es sei nichts zu verlieren. */
      _folgen = null;
      box.innerHTML = '<div class="ep-alert ep-alert-warning">' + esc(t('ep.abwesenheit.s3.loadFail')) + '</div>';
    }
  }

  function folgenZeichnen() {
    var box = $('folgenBox'); if (!box) return;
    if (!_folgen || !_folgen.length) {
      /* Der Leerfall ist eine ANTWORT, kein Fehlen von Daten — und die
       * Bestaetigung bleibt trotzdem Pflicht: Die Meldung erreicht das Buero
       * auch dann, und der Mensch soll wissen, dass er sie absetzt. */
      box.innerHTML = '<div class="ep-empty"><p>' + esc(t('ep.abwesenheit.s3.none')) + '</p></div>';
      return;
    }
    box.innerHTML = _folgen.map(function (e) {
      var wann = [];
      if (e.beginnt) wann.push(t('ep.abwesenheit.s3.from', { date: e.beginnt }));
      wann.push(e.endet ? t('ep.abwesenheit.s3.till', { date: e.endet }) : t('ep.abwesenheit.s3.openEnd'));
      /* `kunde` kann null sein (LEFT JOIN auf organizations). Dann steht dort
       * die Einsatzbezeichnung statt eines leeren Feldes oder "null". */
      var wer = e.kunde || t('ep.abwesenheit.s3.title');
      return '<div class="aw-einsatz">' +
        '<strong>' + esc(wer) + '</strong>' +
        '<span>' + esc(wann.join(' · ')) + ' — ' + esc(t('ep.abwesenheit.s3.releases')) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ── Navigation ────────────────────────────────────────────────── */
  function schrittZeigen(n) {
    _schritt = n;
    [1, 2, 3].forEach(function (i) {
      var s = $('step' + i); if (s) s.style.display = (i === n ? '' : 'none');
      var d = $('dot' + i); if (d) d.className = 'aw-step-dot' + (i <= n ? ' done' : '');
    });
    var label = $('stepLabel'); if (label) label.textContent = t('ep.abwesenheit.step', { n: n });
    var zurueck = $('btnZurueck'); if (zurueck) zurueck.style.display = (n > 1 ? '' : 'none');
    var weiter = $('btnWeiter'); if (weiter) weiter.style.display = (n < 3 ? '' : 'none');
    var senden = $('btnAbsenden'); if (senden) senden.style.display = (n === 3 ? '' : 'none');
    if (n === 3) { tickerStarten(); sperreZeichnen(); } else { tickerStoppen(); }
    pruefeWeiter();
    pruefeAbsenden();
  }

  function pruefeWeiter() {
    var b = $('btnWeiter'); if (!b) return;
    if (_schritt === 1) b.disabled = !_art;
    else if (_schritt === 2) {
      var von = ($('awVon') || {}).value;
      b.disabled = !(DATUM_RX.test(von || '') && woerter() >= MINDEST_WOERTER);
    }
  }

  function pruefeAbsenden() {
    var b = $('btnAbsenden'); if (!b) return;
    /* NUR die Bestaetigung sperrt hier — die Zeitsperre NICHT. Sie liegt hinten
     * und wird dort geprueft; ein clientseitiges Sperren waere eine Attrappe
     * und wuerde bei driftendem Zaehler jemanden aussperren, der laengst darf. */
    b.disabled = _sendet || !($('awBestaetigt') || {}).checked;
  }

  function fehlerZeigen(text) {
    var el = $('awFehler'); if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? '' : 'none';
  }

  /* ── Absenden ──────────────────────────────────────────────────── */
  async function absenden() {
    if (_sendet) return;
    var von = ($('awVon') || {}).value;
    var bis = ($('awBis') || {}).value;
    if (!DATUM_RX.test(von || '')) { fehlerZeigen(t('ep.abwesenheit.err.date')); return; }
    if (bis && !DATUM_RX.test(bis)) { fehlerZeigen(t('ep.abwesenheit.err.date')); return; }
    if (bis && bis < von) { fehlerZeigen(t('ep.abwesenheit.err.dateOrder')); return; }

    _sendet = true;
    pruefeAbsenden();
    fehlerZeigen('');

    var rumpf = { art: _art, von: von };
    if (bis) rumpf.bis = bis;
    FRAGEN.forEach(function (f) {
      var el = $('f_' + f.schluessel);
      if (el && el.value.trim()) rumpf[f.schluessel] = el.value.trim();
    });

    try {
      var r = await PortalApi.post('/worker/me/abwesenheit', rumpf);
      entwurfLoeschen();
      tickerStoppen();
      /* DIE EHRLICHE ZAHL, nicht ein pauschales "erledigt": Ist niemand mit
       * Zustaendigkeit erreichbar, ist sie 0 — und dann SOLL der Mensch
       * zusaetzlich anrufen. Eine beschoenigte Bestaetigung waere hier der
       * gefaehrlichere Zustand. */
      var erreicht = Number(r && r.buero_benachrichtigt) || 0;
      PortalShell.toast(t(erreicht > 0 ? 'ep.abwesenheit.sent' : 'ep.abwesenheit.sentSilent'),
                        erreicht > 0 ? 'success' : 'warning');
      zuruecksetzen();
      meineLaden();
    } catch (e) {
      _sendet = false;
      pruefeAbsenden();
      fehlerZeigen(fehlertext(e));
      /* Nach ZEITSPERRE die echte Restzeit uebernehmen: Der Server ist die
       * Wahrheit, der lokale Zaehler war offenbar zu optimistisch. */
      var rest = e && e.details && Number(e.details.verbleibend_sekunden);
      if (rest > 0) { _sperreBis = Date.now() + rest * 1000; sperreZeichnen(); }
    }
  }

  function fehlertext(e) {
    var code = e && e.code;
    var d = (e && e.details) || {};
    if (code === 'ZEITSPERRE') return t('ep.abwesenheit.err.tooEarly', { n: d.verbleibend_sekunden || 0 });
    if (code === 'VORGANG_NICHT_EROEFFNET') return t('ep.abwesenheit.err.noProcess');
    if (code === 'BESCHREIBUNG_ZU_KURZ') return t('ep.abwesenheit.err.tooShort', { n: d.fehlend || 0 });
    if (code === 'ABSENCE_OVERLAP') return t('ep.abwesenheit.err.overlap');
    if (code === 'INVALID_DATE' || code === 'INVALID_RANGE') return t('ep.abwesenheit.err.date');
    return t('ep.abwesenheit.err.generic');
  }

  function zuruecksetzen() {
    _art = null; _folgen = null; _sperreBis = 0; _sendet = false;
    var box = $('fragenBox'); if (box) { box.innerHTML = ''; delete box.dataset.fertig; }
    var chk = $('awBestaetigt'); if (chk) chk.checked = false;
    ['awVon', 'awBis'].forEach(function (id) { var el = $(id); if (el) el.value = ''; });
    artenZeichnen();
    schrittZeigen(1);
  }

  /* ── Der leichte Weg ───────────────────────────────────────────── */
  async function verspaetungSenden() {
    var el = $('delayMin');
    var msg = $('delayMsg');
    var btn = $('delayBtn');
    var min = Number(el && el.value);
    if (!min || min < 1) { if (msg) msg.textContent = t('ep.abwesenheit.delay.needed'); return; }

    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '';
    try {
      var r = await PortalApi.post('/worker/me/verspaetung', { minuten: Math.round(min) });
      var erreicht = Number(r && r.buero_benachrichtigt) || 0;
      PortalShell.toast(t(erreicht > 0 ? 'ep.abwesenheit.delay.ok' : 'ep.abwesenheit.delay.okStill'),
                        erreicht > 0 ? 'success' : 'warning');
      if (el) el.value = '';
    } catch (e) {
      /* Die Obergrenze VERWEIST auf den anderen Weg, statt nur nein zu sagen.
       * Wer hier scheitert, hat ein echtes Anliegen; ihn ohne Hinweis stehen zu
       * lassen treibt ihn ans Telefon — und dann steht die Meldung wieder
       * ausserhalb des Systems. */
      if (e && e.code === 'KEINE_VERSPAETUNG_MEHR') {
        var max = (e.details && e.details.max_minuten) || VERSPAETUNG_MAX;
        if (msg) msg.textContent = t('ep.abwesenheit.delay.tooLong', { max: max });
        var karte = $('artenBox');
        if (karte && karte.scrollIntoView) karte.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (msg) {
        msg.textContent = t('ep.abwesenheit.err.generic');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ── Die Quittung: was schon gemeldet ist ──────────────────────── */
  async function meineLaden() {
    var box = $('meineBox'); if (!box) return;
    box.innerHTML = '<div class="ep-skel ep-skel-sm"></div>';
    try {
      var r = await PortalApi.get('/worker/me/abwesenheiten');
      var items = (r && r.items) || [];
      if (!items.length) {
        box.innerHTML = '<div class="ep-empty"><p>' + esc(t('ep.abwesenheit.list.empty')) + '</p></div>';
        return;
      }
      box.innerHTML = items.map(function (a) {
        /* "beantragt" ist der Zustand, den der Mensch WISSEN MUSS: Er hat sich
         * abgemeldet, ist aber noch nicht abgemeldet (Freigabepflicht je Firma,
         * G-E2). Ohne diesen Hinweis glaubt er, die Sache sei erledigt. */
        var zustand = a.aufgehoben_am ? 'cancelled' : (a.zustand === 'beantragt' ? 'pending' : 'active');
        var wann = [a.von, a.bis || t('ep.abwesenheit.s3.openEnd')].join(' – ');
        return '<div class="aw-einsatz" style="border-left-color:var(--ep-' +
          (zustand === 'active' ? 'success' : zustand === 'pending' ? 'warning' : 'border') + ')">' +
          '<strong>' + esc(t('ep.abwesenheit.art.' + a.art) || a.art) + '</strong>' +
          '<span>' + esc(wann) + ' — ' + esc(t('ep.abwesenheit.list.' + zustand)) + '</span>' +
          '</div>';
      }).join('');
    } catch (e) {
      box.innerHTML = '<div class="ep-alert ep-alert-warning">' + esc(t('ep.abwesenheit.list.fail')) + '</div>';
    }
  }

  /* ── Start ─────────────────────────────────────────────────────── */
  function init() {
    artenZeichnen();
    schrittZeigen(1);

    var heute = (window.TCDate && TCDate.todayDE) ? TCDate.todayDE() : '';
    var von = $('awVon'); if (von && !von.value) von.value = heute;
    ['awVon', 'awBis'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { entwurfSchreiben(); pruefeWeiter(); });
    });

    /* Entwurf zurueckholen — die 30 Woerter sollen einen Fehlversuch ueberleben. */
    var d = entwurfLesen();
    if (d && d.art && ARTEN.indexOf(d.art) >= 0) {
      if (von && d.von) von.value = d.von;
      var bis = $('awBis'); if (bis && d.bis) bis.value = d.bis;
      artWaehlen(d.art);
      fragenZeichnen();
      FRAGEN.forEach(function (f) { var el = $('f_' + f.schluessel); if (el && d[f.schluessel]) el.value = d[f.schluessel]; });
      zaehlerZeichnen();
    }

    /* Server-Abgleich, wenn der Tab zurueckkommt: eingefrorene Timer driften. */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && _art && _schritt === 3) vorgangEroeffnen();
    });

    $('loading').style.display = 'none';
    $('content').style.display = '';
    meineLaden();
  }

  window.AwPage = {
    init: init,
    weiter: function () {
      if (_schritt === 1) { fragenZeichnen(); zaehlerZeichnen(); schrittZeigen(2); }
      else if (_schritt === 2) { schrittZeigen(3); folgenLaden(); }
    },
    zurueck: function () { if (_schritt > 1) schrittZeigen(_schritt - 1); },
    absenden: absenden,
    pruefeAbsenden: pruefeAbsenden,
    verspaetungSenden: verspaetungSenden
  };
})();
