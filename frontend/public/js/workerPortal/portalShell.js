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
 */
(function () {
  var _me = null;

  /* ── esc ───────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s || '').replace(/[<>&"']/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c;
    });
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
      '<div style="font-size:2rem;margin-bottom:12px">⚠️</div>' +
      '<p style="font-size:.95rem;line-height:1.5;margin-bottom:16px">' + esc(msg) + '</p>' +
      '<button class="ep-btn ep-btn-outline ep-btn-sm" onclick="location.reload()">Erneut versuchen</button>';
  }

  /* ── Sidebar-User setzen ───────────────────────────────────────── */
  function _setUserInSidebar(u) {
    if (!u) return;
    var ini = ((u.first_name || '?').charAt(0) + (u.last_name || '?').charAt(0)).toUpperCase();
    var name = (u.first_name || '') + ' ' + (u.last_name || '');
    name = name.trim() || u.email || '';
    _setById('sd-ava',  function (el) { el.textContent = ini; });
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
      { sel: '.ep-sidebar',     attr: 'aria-label', val: 'Einsatzportal' },
      { sel: '.ep-sidebar-nav', attr: 'aria-label', val: 'Hauptnavigation' },
      { sel: '.ep-bottom-nav',  attr: 'aria-label', val: 'Kurznavigation' },
      { sel: '.ep-bell',        attr: 'aria-label', val: 'Benachrichtigungen' }
    ];
    map.forEach(function (item) {
      var el = document.querySelector(item.sel);
      if (el && !el.getAttribute(item.attr)) {
        el.setAttribute(item.attr, item.val);
      }
    });
    // Loading skeletons — hide from AT while loading
    var skels = document.querySelectorAll('.ep-skel');
    skels.forEach(function (s) {
      s.setAttribute('aria-hidden', 'true');
    });
  }

  /* ── Shell initialisieren ──────────────────────────────────────── */
  /**
   * Lädt Worker-Me, setzt Sidebar, startet Unread-Count (fire-and-forget).
   * Setzt Accessibility-Attribute auf Landmark-Elementen.
   * Wirft PortalApiError('NOT_AUTH') wenn Session abgelaufen.
   */
  async function initShell() {
    _setupAccessibility();
    var me = await loadWorkerMe();
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
    setupAccessibility: _setupAccessibility
  };
})();
