"use strict";
/* global PortalApi */
// PortalApi ist ein externes Global aus portalApi.js (wird laut Lade-Reihenfolge ZUVOR
// per <script> eingebunden) — Deklaration nur fuer eslint, kein Laufzeit-Effekt.

/**
 * portalShell.js — Gemeinsame Shell für das Einsatzportal
 * Lädt NACH portalApi.js: <script src="/public/js/workerPortal/portalShell.js">
 * Exponiert: window.PortalShell
 *
 * Enthält:
 *  - initShell()       — Worker-Me laden + Sidebar setzen + Unread (fire-and-forget)
 *  - loadWorkerMe()    — GET /worker/me, setzt Sidebar-User
 *  - loadUnreadCount() — Benachrichtigungs-Badge aktualisieren
 *  - doLogout()        — POST /auth/logout + Redirect zu worker-login.html
 *  - toast(msg, type)  — Gemeinsamer Toast (type: 'error' | 'success' | 'warning' | '')
 *  - showError(msg)    — Sichtbarer Fehlerzustand statt Spinner
 *  - getMe()           — Geladenes Worker-Profil abrufen
 *  - esc(s)            — XSS-Schutz für innerHTML
 *  - Icon-Satz         — Inline-SVG für Navigation und Glocke (keine Emojis)
 */
(function () {
  var _me = null;

  /* ── esc ───────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c;
    });
  }

  /* ── Pre-Auth-Gate aufheben ────────────────────────────────────── */
  // Entfernt .ep-preauth vom <body> -> Portal-Huelle wird sichtbar. Wird NUR
  // nach bestaetigter Session (initShell) oder im Fehlerzustand (showError)
  // aufgerufen; bei NOT_AUTH bleibt der Body verborgen und die Seite leitet
  // zu worker-login.html um -> kein Aufblitzen fuer uneingeloggte Nutzer.
  function _reveal() {
    if (document.body) document.body.classList.remove('ep-preauth');
  }

  /* ── Toast ─────────────────────────────────────────────────────── */
  function toast(msg, type) {
    type = type || '';
    var el = document.getElementById('ep-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = type ? 'show ' + type : 'show';
    clearTimeout(el._tid);
    el._tid = setTimeout(function () { el.className = ''; }, 3500);
  }

  /* ── Fehlerzustand ─────────────────────────────────────────────── */
  function showError(msg) {
    _reveal(); // Fehlerzustand muss sichtbar sein, auch wenn die Huelle noch verborgen war
    var loadingEl = document.getElementById('loading');
    var contentEl = document.getElementById('content');
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';

    var errorEl = document.getElementById('ep-error-state');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.id = 'ep-error-state';
      errorEl.style.cssText = 'padding:48px 24px;text-align:center;color:var(--ep-text-muted,#888)';
      var container = document.querySelector('.ep-content') || document.querySelector('main') || document.body;
      container.appendChild(errorEl);
    }
    errorEl.innerHTML =
      '<p style="font-size:.95rem;line-height:1.5;margin-bottom:16px">' + esc(msg) + '</p>' +
      '<button class="ep-btn ep-btn-outline ep-btn-sm" onclick="location.reload()">Erneut versuchen</button>';
  }

  /* ── Sidebar-User setzen ───────────────────────────────────────── */
  function _setUserInSidebar(u) {
    if (!u) return;
    var ini = ((u.first_name || '?').charAt(0) + (u.last_name || '?').charAt(0)).toUpperCase();
    var name = (u.first_name || '') + ' ' + (u.last_name || '');
    name = name.trim() || u.email || '';
    _setById('sd-ava',  function (el) {
      // Profilfoto (P7b): session-gebundene Route; ohne Foto bleiben Initialen.
      if (u.photo_file_ref) {
        el.innerHTML = '<img src="/api/worker/me/photo" alt="Profilfoto" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block"/>';
      } else {
        el.textContent = ini;
      }
    });
    _setById('sd-name', function (el) { el.textContent = name; });
  }

  /* ── Worker-Me laden ───────────────────────────────────────────── */
  async function loadWorkerMe() {
    var data = await PortalApi.get('/worker/me');
    _me = data;
    _setUserInSidebar(data);
    return data;
  }

  function getMe() { return _me; }

  /* ── Unread-Count laden ────────────────────────────────────────── */
  async function loadUnreadCount() {
    try {
      var d = await PortalApi.get('/worker/notifications', { unread: 'true', limit: '1' });
      var cnt = d.unread_count || 0;
      if (cnt > 0) {
        var label = cnt > 9 ? '9+' : String(cnt);
        _setById('mob-badge', function (el) { el.textContent = label; el.style.display = ''; });
        _setById('sb-badge',  function (el) { el.textContent = label; el.style.display = ''; });
        _setById('bn-dot',    function (el) { el.style.display = ''; });
      }
    } catch (e) { /* Unread-Count ist nicht kritisch — still ignorieren */ }
  }

  /* ── Logout ────────────────────────────────────────────────────── */
  async function doLogout() {
    try { await PortalApi.post('/auth/logout', {}); } catch (e) { /* Logout trotzdem ausführen */ }
    location.href = 'worker-login.html';
  }
  // global für onclick="doLogout()" im HTML
  window.doLogout = doLogout;

  /* ── Accessibility-Landmarks setzen ───────────────────────────── */
  /**
   * Fügt aria-label zu Landmark-Elementen hinzu, sofern noch nicht gesetzt.
   * Läuft einmalig beim Shell-Init — deckt alle Portal-Seiten ab.
   */
  function _setupAccessibility() {
    var map = [
      { sel: '.ep-sidebar',     attr: 'aria-label', val: 'Einsatzportal',      i18n: 'ep.aria.sidebar' },
      { sel: '.ep-sidebar-nav', attr: 'aria-label', val: 'Hauptnavigation',    i18n: 'ep.aria.mainnav' },
      { sel: '.ep-bottom-nav',  attr: 'aria-label', val: 'Kurznavigation',     i18n: 'ep.aria.quicknav' },
      { sel: '.ep-bell',        attr: 'aria-label', val: 'Benachrichtigungen', i18n: 'ep.aria.bell' }
    ];
    map.forEach(function (item) {
      var el = document.querySelector(item.sel);
      if (el && !el.getAttribute(item.attr)) {
        el.setAttribute(item.attr, item.val);
        // i18n-Hook (P6): apply() haelt das aria-label sprachaktuell,
        // sobald die Seite i18n.js laedt (data-i18n-aria in i18n.js).
        el.setAttribute('data-i18n-aria', item.i18n);
      }
    });
    // Loading skeletons — hide from AT while loading
    var skels = document.querySelectorAll('.ep-skel');
    skels.forEach(function (s) {
      s.setAttribute('aria-hidden', 'true');
    });
  }


  /* ── Icon-Satz ─────────────────────────────────────────────────── */
  /**
   * Strichzeichnungen statt Emojis (CLAUDE.md: keine Emojis in produktiver UI).
   * Bewusst hier und nicht in den sieben Portal-Seiten: ein Satz, eine Wahrheit —
   * kopierte Icons driften beim ersten Nachziehen auseinander.
   * `currentColor` sorgt dafuer, dass sie jedem Theme folgen.
   */
  var ICON_PATHS = {
    dashboard:          'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
    einsaetze:          'M4 5h16v15H4zM8 3v4M16 3v4M8 12h8M8 16h5',
    plan:               'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
    stundenzettel:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    benachrichtigungen: 'M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6zM10 19a2 2 0 0 0 4 0',
    kontakt:            'M4 5h16v11H9l-5 4z',
    profil:             'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
    abmelden:           'M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6',
    // Zustandssymbole (Welle 2): erledigt / offen. Bewusst hier und nicht als
    // Unicode-Zeichen in der Seite — CLAUDE.md verbietet Emojis in produktiver UI,
    // und der Waechter `api/test/uiNoEmoji.test.js` setzt das durch. Ein Haken als
    // SVG traegt dieselbe Bedeutung, folgt `currentColor` und skaliert sauber.
    erledigt:           'M20 6 9 17l-5-5',
    offen:              'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'
  };

  /** Ein Icon als Inline-SVG. Rein dekorativ — die Beschriftung steht daneben. */
  function _iconSvg(key) {
    var d = ICON_PATHS[key];
    if (!d) return '';
    return '<svg class="ep-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
           'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
           'stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  }

  /** Schluessel aus dem Ziel-Link ableiten: einsatzportal-plan.html -> plan */
  function _iconKeyFromHref(href) {
    var m = /einsatzportal-([a-z]+)\.html/.exec(String(href || ''));
    return m ? m[1] : null;
  }

  /**
   * Setzt die Icons in Seitenleiste, Kurznavigation und Glocke.
   * Idempotent: ein bereits gesetztes Icon wird nicht doppelt eingefuegt.
   * Faellt die Datei aus, bleibt die Navigation als reine Textliste nutzbar.
   */
  function _setupIcons() {
    var links = document.querySelectorAll('.ep-sidebar-item, .ep-bn-item');
    links.forEach(function (a) {
      if (a.querySelector('.ep-icon')) return;
      var svg = _iconSvg(_iconKeyFromHref(a.getAttribute('href')));
      if (svg) a.insertAdjacentHTML('afterbegin', svg);
    });
    var logout = document.querySelector('button.ep-sidebar-item[onclick*="doLogout"]');
    if (logout && !logout.querySelector('.ep-icon')) {
      logout.insertAdjacentHTML('afterbegin', _iconSvg('abmelden'));
    }
    var bell = document.querySelector('.ep-bell');
    if (bell && !bell.querySelector('.ep-icon')) {
      bell.insertAdjacentHTML('afterbegin', _iconSvg('benachrichtigungen'));
    }
  }

  /* ── Shell initialisieren ──────────────────────────────────────── */
  /**
   * Lädt Worker-Me, setzt Sidebar, startet Unread-Count (fire-and-forget).
   * Setzt Accessibility-Attribute auf Landmark-Elementen.
   * Wirft PortalApiError('NOT_AUTH') wenn Session abgelaufen.
   */
  /* ── i18n (P6): gemeinsames Portal-Woerterbuch + Profil-Sync ────────────
     Nur aktiv, wenn die Seite /public/js/i18n.js laedt (progressive Migration).
     Die Nav-/Shell-Keys leben HIER, weil jede Portal-Seite die Shell laedt —
     Seiten registrieren nur noch ihre eigenen ep.<seite>.*-Keys. */
  function _setupI18n(me) {
    if (!window.TCi18n) return;
    window.TCi18n.register('de', {
      // Kurz = Bottom-Nav (Platz!), lang = Seitenleiste. Zwei Saetze, weil ein
      // gemeinsamer Satz die beschreibenden Seitenleisten-Labels verkuerzt haette.
      'ep.nav.start': 'Start', 'ep.nav.einsaetze': 'Einsätze', 'ep.nav.plan': 'Plan',
      'ep.nav.stunden': 'Stunden', 'ep.nav.info': 'Info', 'ep.nav.profil': 'Profil',
      'ep.nav.kontakt': 'Kontakt', 'ep.nav.benachrichtigungen': 'Benachrichtigungen',
      'ep.navlong.start': 'Dashboard', 'ep.navlong.einsaetze': 'Meine Einsätze',
      'ep.navlong.plan': 'Einsatzplan', 'ep.navlong.stunden': 'Stundenzettel',
      'ep.navlong.benachrichtigungen': 'Benachrichtigungen',
      'ep.navlong.kontakt': 'Kontakt & Hilfe', 'ep.navlong.profil': 'Mein Profil',
      'ep.shell.logout': 'Abmelden', 'ep.shell.role': 'Arbeitnehmer',
      'ep.shell.loading': 'Lädt…', 'ep.shell.retry': 'Erneut versuchen',
      'ep.shell.loadError': 'Fehler beim Laden', 'ep.shell.brand': 'Einsatzportal',
      'ep.aria.sidebar': 'Einsatzportal', 'ep.aria.mainnav': 'Hauptnavigation',
      'ep.aria.quicknav': 'Kurznavigation', 'ep.aria.bell': 'Benachrichtigungen'
    });
    window.TCi18n.register('en', {
      'ep.nav.start': 'Home', 'ep.nav.einsaetze': 'Assignments', 'ep.nav.plan': 'Schedule',
      'ep.nav.stunden': 'Hours', 'ep.nav.info': 'Updates', 'ep.nav.profil': 'Profile',
      'ep.nav.kontakt': 'Contact', 'ep.nav.benachrichtigungen': 'Notifications',
      'ep.navlong.start': 'Dashboard', 'ep.navlong.einsaetze': 'My assignments',
      'ep.navlong.plan': 'Schedule', 'ep.navlong.stunden': 'Timesheets',
      'ep.navlong.benachrichtigungen': 'Notifications',
      'ep.navlong.kontakt': 'Contact & help', 'ep.navlong.profil': 'My profile',
      'ep.shell.logout': 'Sign out', 'ep.shell.role': 'Worker',
      'ep.shell.loading': 'Loading…', 'ep.shell.retry': 'Try again',
      'ep.shell.loadError': 'Failed to load', 'ep.shell.brand': 'Worker Portal',
      'ep.aria.sidebar': 'Worker portal', 'ep.aria.mainnav': 'Main navigation',
      'ep.aria.quicknav': 'Quick navigation', 'ep.aria.bell': 'Notifications'
    });
    // Profil-Praeferenz anwenden — aber eine EXPLIZITE Geraete-Wahl gewinnt
    // (gleiches Prinzip wie tempconnect-theme-explicit).
    var pref = me && me.preferred_locale;
    if (pref && window.TCi18n.supported.indexOf(pref) >= 0 &&
        !window.TCi18n.hasExplicitChoice() && pref !== window.TCi18n.locale()) {
      window.TCi18n.set(pref, { explicit: false });
    }
    window.TCi18n.apply();
    // Jeder spaetere Wechsel wandert ins Profil (Cross-Device-Gedaechtnis).
    document.addEventListener('tc:langchange', function (e) {
      PortalApi.patch('/worker/me', { preferred_locale: e.detail.locale }).catch(function () {});
    });
  }

  /* ── Verbindliche Aufnahme (Owner-Freigabe 2026-08-06) ─────────────────────
     Wer frisch eingeladen wurde, soll die Aufnahme abschliessen, bevor er sich
     im Portal umsieht — vorher ist dort ohnehin nichts.

     Zwei Flaechen bleiben IMMER offen, und zwar mit Absicht:
       - das Profil selbst, sonst gaebe es keinen Weg aus der Sperre heraus,
       - Kontakt & Hilfe, denn wer nicht weiterkommt, muss fragen koennen.
         Eine Sperre ohne Ausweg ist keine Fuehrung, sondern eine Falle.

     Ob ueberhaupt gesperrt werden DARF, entscheidet der Server
     (`zugang_beschraenkt`) — er weiss als Einziger, ob die Kraft schon einmal
     im Einsatz war. Wer bereits gearbeitet hat, wird nie gesperrt: er muss
     seinen Stundenzettel einreichen koennen, auch mit halbem Profil. */
  var AUFNAHME_FREI = ['einsatzportal-profil.html', 'einsatzportal-kontakt.html'];

  async function _enforceOnboarding() {
    var seite = (location.pathname.split('/').pop() || '').toLowerCase();
    if (AUFNAHME_FREI.indexOf(seite) >= 0) return;
    try {
      var p = await PortalApi.get('/worker/me/onboarding');
      if (p && p.zugang_beschraenkt) {
        // `aufnahme=1` sagt der Profilseite, warum jemand dort gelandet ist —
        // ohne diesen Hinweis wirkt die Umleitung wie ein Fehler.
        location.replace('einsatzportal-profil.html?willkommen=1&aufnahme=1');
        return true;
      }
    } catch (e) { /* Zweifel gehen zugunsten des Zugangs aus: nie wegen eines
                     fehlgeschlagenen Abrufs aussperren. */ }
    return false;
  }

  async function initShell() {
    _setupAccessibility();
    _setupIcons();
    var me = await loadWorkerMe();
    _setupI18n(me);
    if (await _enforceOnboarding()) return me; // Umleitung laeuft — nichts mehr aufbauen
    _reveal(); // Session bestaetigt -> Portal-Huelle einblenden (vorher .ep-preauth)
    loadUnreadCount(); // fire-and-forget — kein await
    return me;
  }

  /* ── Hilfsfunktionen ───────────────────────────────────────────── */
  function _setById(id, fn) {
    var el = document.getElementById(id);
    if (el) fn(el);
  }

  /* ── Export ────────────────────────────────────────────────────── */
  window.PortalShell = {
    initShell: initShell,
    loadWorkerMe: loadWorkerMe,
    loadUnreadCount: loadUnreadCount,
    doLogout: doLogout,
    toast: toast,
    showError: showError,
    getMe: getMe,
    esc: esc,
    setupAccessibility: _setupAccessibility,
    // Nachtraeglich aufrufbar, wenn eine Seite Navigationseintraege selbst nachlaedt.
    setupIcons: _setupIcons,
    // Damit Seiten Zustandssymbole aus DEMSELBEN Satz nehmen, statt eigene
    // Unicode-Zeichen zu erfinden (siehe Kommentar bei ICON_PATHS).
    iconSvg: _iconSvg
  };
})();
