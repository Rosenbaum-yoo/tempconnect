/**
 * logout-btn.js
 * Injiziert einen kleinen Logout-Button in jede Seite mit class="topbar".
 * CSRF-Token wird automatisch geholt. Nach Logout → Redirect auf /.
 */
(function () {
  'use strict';

  function inject() {
    /* Bevorzuge [data-notif-topbar] (sichtbare Haupt-Topbar).
       Fallback auf ersten .topbar, der NICHT im #paywall-Container steckt. */
    var topbar = document.querySelector('[data-notif-topbar]');
    if (!topbar) {
      var all = document.querySelectorAll('.topbar');
      for (var i = 0; i < all.length; i++) {
        if (!all[i].closest('#paywall')) { topbar = all[i]; break; }
      }
    }
    if (!topbar) return;
    if (document.getElementById('tc-logout-btn')) return;

    var btn = document.createElement('button');
    btn.id        = 'tc-logout-btn';
    btn.type      = 'button';
    btn.title     = 'Abmelden';
    btn.innerHTML = '&#x23FB;&nbsp;Abmelden';
    btn.setAttribute('aria-label', 'Abmelden');

    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:4px',
      'padding:4px 10px',
      'font-size:11px',
      'font-weight:700',
      'letter-spacing:.03em',
      'border-radius:8px',
      'border:1px solid rgba(255,92,122,.3)',
      'background:rgba(255,92,122,.07)',
      'color:rgba(255,160,140,.9)',
      'cursor:pointer',
      'font-family:inherit',
      'transition:background .15s,border-color .15s',
      'white-space:nowrap',
      'flex-shrink:0',
      'margin-left:auto',   /* schiebt Button an den rechten Rand */
      'line-height:1.4'
    ].join(';');

    btn.onmouseenter = function () {
      btn.style.background  = 'rgba(255,92,122,.18)';
      btn.style.borderColor = 'rgba(255,92,122,.55)';
      btn.style.color       = '#ffb0a0';
    };
    btn.onmouseleave = function () {
      btn.style.background  = 'rgba(255,92,122,.07)';
      btn.style.borderColor = 'rgba(255,92,122,.3)';
      btn.style.color       = 'rgba(255,160,140,.9)';
    };
    btn.onclick = doLogout;

    /* Direkt an die Topbar hängen — flexbox positioniert ihn automatisch */
    topbar.appendChild(btn);
  }

  async function doLogout() {
    var btn = document.getElementById('tc-logout-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '&#x23F3;'; }
    try {
      var cr = await fetch('/api/csrf', { credentials: 'include' });
      var cd = await cr.json();
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': cd.token || ''
        }
      });
    } catch (e) { /* Fehler ignorieren — trotzdem weiterleiten */ }
    window.location.replace('/');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
