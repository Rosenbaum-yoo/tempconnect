/* ══════════════════════════════════════════════════════════
   TempConnect – Landing Page Logic
   Auth modal (login / register / forgot / reset / SSO),
   CSRF handling, email verification, keyboard shortcuts.
   ══════════════════════════════════════════════════════════ */
'use strict';

const API = '/api';
var _resetToken  = null;
var _csrfToken   = null;   // cached CSRF token
var _returnUrl   = null;   // open-redirect-sicheres Ziel nach Login (?return=, z.B. /owner-control/)

/* ── CSRF: Token holen (gecacht, einmalig pro Session) ─ */
async function getCsrf() {
  if (_csrfToken) return _csrfToken;
  try {
    var r = await fetch('/api/csrf', { credentials: 'include' });
    var d = await r.json();
    _csrfToken = d.token || null;
  } catch (e) { _csrfToken = null; }
  return _csrfToken;
}

/* ── POST-Wrapper: Content-Type + CSRF automatisch ──── */
async function postJSON(url, body) {
  var csrf = await getCsrf();
  var headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['x-csrf-token'] = csrf;
  var r = await fetch(url, {
    method: 'POST', credentials: 'include',
    headers: headers,
    body: JSON.stringify(body)
  });
  if (r.status === 403) {
    // CSRF-Token abgelaufen — einmal neu holen und nochmals versuchen
    _csrfToken = null;
    csrf = await getCsrf();
    if (csrf) headers['x-csrf-token'] = csrf;
    r = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: headers,
      body: JSON.stringify(body)
    });
  }
  return r;
}

/* ── Landing-Auth-State ──────────────────────── */
var _isLoggedIn = false;
var _currentUser = null;

function showLoggedInState(me) {
  _isLoggedIn = true;
  _currentUser = me;
  var guest = document.getElementById('tc-landing-guest');
  var user  = document.getElementById('tc-landing-user');
  var label = document.getElementById('tc-landing-user-label');
  if (guest) guest.style.display = 'none';
  if (user) user.style.display = 'inline-flex';
  if (label) label.textContent = 'Eingeloggt als ' + (me.company_name || me.email || '\u2013');

  // Logout-Button verdrahten
  var logoutBtn = document.getElementById('tc-landing-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      logoutBtn.disabled = true;
      logoutBtn.textContent = '\u23f3';
      try {
        var csrf = await getCsrf();
        await fetch('/api/auth/logout', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf || '' }
        });
      } catch (_) {
        _csrfToken = null;
      }
      location.reload();
    });
  }
}

/* ── Init: auth-check + URL params ─────────────── */
(async function init() {
  var p      = new URLSearchParams(location.search);
  var verify = p.get('verify');
  var reset  = p.get('reset');

  // Open-redirect-sicheres Rueck-Ziel nach Login (z.B. aus dem OCC: ?return=/owner-control/).
  // Nur same-origin-Pfade: muss mit "/" beginnen, aber nicht mit "//" oder "/\" (Protocol-Relative).
  var ret = p.get('return');
  if (ret && /^\/(?![/\\])/.test(ret)) { _returnUrl = ret; }

  if (verify) { handleVerify(verify); return; }
  if (reset)  { _resetToken = reset; openAuth('reset'); return; }

  // Auto-fill referral code from URL ?ref=CODE
  var ref = p.get('ref');
  if (ref) {
    var refInput = document.getElementById('regReferral');
    if (refInput) refInput.value = ref;
    openAuth('register');
  }

  // URL-gesteuerte Auth-Oeffnung (von Pricing/externen CTAs)
  var authPane = p.get('auth');
  var urlPlan  = p.get('plan');
  var urlRole  = p.get('role');
  if (authPane === 'login' || authPane === 'register') {
    openAuth(authPane, urlRole || undefined);
    // Plan im Dropdown vorselektieren wenn vorhanden
    if (urlPlan) {
      var planSel = document.getElementById('regPlan');
      if (planSel) {
        // Versuche exakten Wert oder Fallback
        for (var i = 0; i < planSel.options.length; i++) {
          if (planSel.options[i].value === urlPlan) { planSel.value = urlPlan; break; }
        }
        planSel.dispatchEvent(new Event('change'));
      }
    }
  }

  // Auth-Check: eingeloggt = Topbar umschalten, KEIN harter Redirect
  try {
    var r = await fetch('/api/me', { credentials: 'include' });
    if (r.ok) {
      var me = await r.json();
      if (me && me.id) showLoggedInState(me);
    }
  } catch (_) {
    _isLoggedIn = false;
  }
})();

/* ── Email-Verifizierung ────────────────────────────── */
async function handleVerify(token) {
  try {
    var r = await fetch('/api/auth/verify/' + encodeURIComponent(token));
    var d = await r.json();
    if (r.ok && d.ok) {
      openAuth('verified');
    } else {
      openAuth('login');
      showErr('login', 'Der Bestätigungslink ist ungültig oder abgelaufen.');
    }
  } catch (e) {
    openAuth('login');
  }
}

/* ── Modal öffnen / schließen ───────────────────────── */
function setRegisterDefaults(role, plan) {
  var roleSel = document.getElementById('regRole');
  var planSel = document.getElementById('regPlan');
  if (roleSel && role) roleSel.value = role;
  if (!planSel) return;
  var targetPlan = plan || (role === 'agency' ? 'BASIS' : role === 'company' ? 'PLUS' : null);
  if (!targetPlan) return;
  for (var i = 0; i < planSel.options.length; i++) {
    if (planSel.options[i].value === targetPlan) {
      planSel.value = targetPlan;
      break;
    }
  }
  planSel.dispatchEvent(new Event('change'));
}

function openAuth(pane, role, plan) {
  document.getElementById('amOverlay').classList.add('open');
  showPane(pane || 'login');
  if ((pane || 'login') === 'register') {
    setRegisterDefaults(role, plan);
  } else if (role) {
    var sel = document.getElementById('regRole');
    if (sel) sel.value = role;
  }
  setTimeout(function() {
    var first = document.querySelector('.am-pane.active .am-input');
    if (first) first.focus();
  }, 60);
}

function closeAuth() {
  document.getElementById('amOverlay').classList.remove('open');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('amOverlay')) closeAuth();
}

/* ── Pane wechseln ──────────────────────────────────── */
function showPane(pane) {
  document.querySelectorAll('.am-pane').forEach(function(el) { el.classList.remove('active'); });
  var id = 'pane' + pane.charAt(0).toUpperCase() + pane.slice(1);
  var el = document.getElementById(id);
  if (el) el.classList.add('active');

  var tabPanes = ['login', 'register'];
  document.getElementById('amTabs').style.display = tabPanes.indexOf(pane) >= 0 ? 'flex' : 'none';
  var tabL = document.getElementById('amTabLogin');
  var tabR = document.getElementById('amTabRegister');
  if (tabL) tabL.classList.toggle('active', pane === 'login');
  if (tabR) tabR.classList.toggle('active', pane === 'register');

  var titles = { login:'Anmelden', register:'Konto erstellen', forgot:'Passwort vergessen', reset:'Neues Passwort setzen', verified:'E-Mail bestätigt' };
  document.getElementById('amTitle').textContent = titles[pane] || '';
}

/* ── Error / Success helpers ────────────────────────── */
function showErr(pane, msg) {
  var id = 'err' + pane.charAt(0).toUpperCase() + pane.slice(1);
  var el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}
function clearErr(pane) {
  var id = 'err' + pane.charAt(0).toUpperCase() + pane.slice(1);
  var el = document.getElementById(id);
  if (el) { el.textContent = ''; el.classList.remove('visible'); }
}
function setBtn(id, loading, label) {
  var b = document.getElementById(id);
  if (!b) return;
  b.disabled = loading;
  b.textContent = loading ? '⏳ Bitte warten…' : label;
}

/* ── Plan-CTA auf Landing: auth-aware mit Intent ─── */
window.selectLandingPlan = function(plan, role) {
  if (TC && TC.authIntent) {
    TC.authIntent.navigateForPlan({ plan: plan, role: role || null, isLoggedIn: _isLoggedIn });
  } else if (_isLoggedIn) {
    // Fallback ohne authIntent: direkt navigieren
    if (['INDIVIDUELL','INDIVIDUELL_PILOT','INDIVIDUELL_DIRECT'].indexOf(plan) >= 0) {
      location.href = '/public/enterprise_anfrage.html';
    } else if (['BASIS','PLUS','PRO'].indexOf(plan) >= 0) {
      location.href = '/public/sla_abo.html?plan=' + encodeURIComponent(plan);
    } else {
      location.href = '/public/enterprise.html';
    }
  } else {
    // Nicht eingeloggt, kein authIntent: einfach Register oeffnen
    openAuth('register', role, plan);
  }
};

/* ── Redirect nach erfolgreicher Auth ─────────── */
function redirectAfterAuth() {
  // Explizites Rueck-Ziel (z.B. OCC) hat Vorrang vor der plan-/intent-basierten Logik.
  if (_returnUrl) { window.location.replace(_returnUrl); return; }
  var intent = (TC && TC.authIntent) ? TC.authIntent.consume() : {};
  var url = (TC && TC.authIntent) ? TC.authIntent.resolveRedirect(intent) : '/public/capacity_exchange_feed.html';
  window.location.replace(url);
}

/* ── LOGIN ──────────────────────────────────────────── */
async function doLogin() {
  clearErr('login');
  var email    = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  if (!email || !password) { showErr('login', 'Bitte E-Mail und Passwort eingeben.'); return; }

  setBtn('btnLogin', true, 'Anmelden');
  try {
    var r = await postJSON('/api/auth/login', { email: email, password: password });
    var d = await r.json();
    if (!r.ok) {
      var m = { INVALID_CREDENTIALS: 'E-Mail oder Passwort falsch.' };
      showErr('login', m[d.error] || d.message || 'Anmeldung fehlgeschlagen.'); return;
    }
    redirectAfterAuth();
  } catch (e) {
    showErr('login', 'Verbindungsfehler. Bitte erneut versuchen.');
  } finally {
    setBtn('btnLogin', false, 'Anmelden');
  }
}

/* ══ REGISTER ═══════════════════════════════════════════ */

/* ── Hilfsfunktionen: Individuell-Erkennung ──────────── */
var INDIVIDUAL_PLAN_VALUES = ['INDIVIDUELL_PILOT','INDIVIDUELL_DIRECT','INDIVIDUELL','INDIVIDUAL','ENTERPRISE'];

function isIndividualRegistration(planValue) {
  return INDIVIDUAL_PLAN_VALUES.indexOf(planValue) >= 0;
}

function getIndividualSignupMode(planValue) {
  if (planValue === 'INDIVIDUELL_DIRECT') return 'direct';
  if (isIndividualRegistration(planValue)) return 'pilot';
  return null;
}

/* Size-Class → repräsentativer employee_count (Median der Klasse) */
var SIZE_CLASS_EMPLOYEE_MAP = { 'I': 15, 'II': 100, 'III': 500, 'IV': 2000 };

async function doRegister() {
  clearErr('register');
  var role       = document.getElementById('regRole').value;
  var company    = document.getElementById('regCompany').value.trim();
  var email      = document.getElementById('regEmail').value.trim();
  var phone      = document.getElementById('regPhone').value.trim();
  var rawPlan    = document.getElementById('regPlan').value;
  var postalCode = document.getElementById('regPostalCode').value.trim();
  var city       = document.getElementById('regCity').value.trim();
  var pw         = document.getElementById('regPassword').value;
  var pw2        = document.getElementById('regPassword2').value;
  var agb        = document.getElementById('regAgb').checked;
  var sizeClassEl = document.getElementById('regCompanySizeClass');
  var sizeClass   = sizeClassEl ? sizeClassEl.value : '';
  var isIndividual = isIndividualRegistration(rawPlan);
  var signupMode   = getIndividualSignupMode(rawPlan);

  if (!email)        { showErr('register', 'Bitte E-Mail-Adresse eingeben.'); return; }
  if (!pw)           { showErr('register', 'Bitte Passwort eingeben.'); return; }
  if (pw.length < 8) { showErr('register', 'Passwort muss mindestens 8 Zeichen lang sein.'); return; }
  if (pw !== pw2)    { showErr('register', 'Passwörter stimmen nicht überein.'); return; }
  if (!agb)          { showErr('register', 'Bitte AGB und Datenschutzerklärung akzeptieren.'); return; }
  if (isIndividual && !sizeClass) { showErr('register', 'Bitte wählen Sie Ihre Unternehmensgröße (Pflicht bei individuellem Tarif).'); return; }

  setBtn('btnRegister', true, 'Konto anlegen');
  try {
    var referral = document.getElementById('regReferral').value.trim();
    var body = {
      role: role, email: email, password: pw,
      company_name: company    || null,
      phone:        phone      || null,
      postal_code:  postalCode || null,
      city:         city       || null,
      plan:         'INDIVIDUELL',
      referral_code: referral  || null
    };
    if (!isIndividual) {
      // Standard-Tarif: Plan direkt übernehmen, keine Individuell-Felder
      body.plan = rawPlan;
    } else {
      // Individuell: Plan immer INDIVIDUELL, Modus + Größenklasse separat
      body.plan = 'INDIVIDUELL';
      body.individual_signup_mode = signupMode;
      body.company_size_class = sizeClass;
      body.employee_count = SIZE_CLASS_EMPLOYEE_MAP[sizeClass] || null;
    }
    var r = await postJSON('/api/auth/register', body);
    var d = await r.json();
    if (!r.ok) {
      var m = {
        EMAIL_EXISTS: 'Diese E-Mail ist bereits registriert.',
        PILOT_NOT_ELIGIBLE: 'Die Pilotphase wurde bereits genutzt oder ist nicht verfuegbar.',
        VALIDATION: d.details ? 'Bitte pruefen: ' + (d.details.map ? d.details.map(function(x) { return x.message; }).join(', ') : '') : 'Eingabefehler.'
      };
      showErr('register', m[d.error] || d.message || 'Registrierung fehlgeschlagen.'); return;
    }
    showToast('Willkommen bei TempConnect! Bitte best\u00e4tigen Sie Ihre E-Mail.', 'info');
    // Intent-basierte Weiterleitung nach Registrierung
    var intent = (TC && TC.authIntent) ? TC.authIntent.consume() : {};
    var nextUrl = (TC && TC.authIntent) ? TC.authIntent.resolveRedirect(intent) : '/public/capacity_exchange_feed.html';
    setTimeout(function() { window.location.replace(nextUrl); }, 1200);
  } catch (e) {
    showErr('register', 'Verbindungsfehler. Bitte erneut versuchen.');
  } finally {
    setBtn('btnRegister', false, 'Konto anlegen');
  }
}

/* ── FORGOT PASSWORD ────────────────────────────────── */
async function doForgotPassword() {
  clearErr('forgot');
  document.getElementById('okForgot').classList.remove('visible');
  var email = document.getElementById('forgotEmail').value.trim();
  if (!email) { showErr('forgot', 'Bitte E-Mail-Adresse eingeben.'); return; }

  setBtn('btnForgot', true, 'Reset-Link senden');
  try {
    await postJSON('/api/auth/forgot-password', { email: email });
    var ok = document.getElementById('okForgot');
    ok.textContent = '✓ Falls ein Konto existiert, wurde ein Reset-Link gesendet.';
    ok.classList.add('visible');
    document.getElementById('forgotEmail').value = '';
  } catch (e) {
    showErr('forgot', 'Verbindungsfehler. Bitte erneut versuchen.');
  } finally {
    setBtn('btnForgot', false, 'Reset-Link senden');
  }
}

/* ── RESET PASSWORD ─────────────────────────────────── */
async function doResetPassword() {
  clearErr('reset');
  document.getElementById('okReset').classList.remove('visible');
  var pw  = document.getElementById('resetPassword').value;
  var pw2 = document.getElementById('resetPassword2').value;
  if (!pw || pw.length < 8) { showErr('reset', 'Passwort muss mindestens 8 Zeichen lang sein.'); return; }
  if (pw !== pw2)            { showErr('reset', 'Passwörter stimmen nicht überein.'); return; }
  if (!_resetToken)          { showErr('reset', 'Ungültiger Reset-Link. Bitte neu anfordern.'); return; }

  setBtn('btnReset', true, 'Passwort speichern');
  try {
    var r = await postJSON('/api/auth/reset-password', { token: _resetToken, password: pw });
    var d = await r.json();
    if (r.ok || d.ok) {
      var ok = document.getElementById('okReset');
      ok.textContent = '✓ Passwort erfolgreich gesetzt. Sie können sich jetzt anmelden.';
      ok.classList.add('visible');
      _resetToken = null;
      setTimeout(function() { showPane('login'); }, 2200);
    } else {
      var m = { TOKEN_EXPIRED: 'Der Reset-Link ist abgelaufen. Bitte neu anfordern.', PASSWORD_TOO_SHORT: 'Mindestens 8 Zeichen erforderlich.' };
      showErr('reset', m[d.error] || d.message || 'Fehler beim Zurücksetzen.');
    }
  } catch (e) {
    showErr('reset', 'Verbindungsfehler. Bitte erneut versuchen.');
  } finally {
    setBtn('btnReset', false, 'Passwort speichern');
  }
}

/* ── SSO: Auto-detect on email blur ──────────────────── */
var _ssoOrg = null;
var _ssoEnforce = false;
var _ssoLookupTimer = null;

document.getElementById('loginEmail').addEventListener('input', function() {
  clearTimeout(_ssoLookupTimer);
  _ssoLookupTimer = setTimeout(checkSSO, 600);
});
document.getElementById('loginEmail').addEventListener('blur', function() {
  clearTimeout(_ssoLookupTimer);
  checkSSO();
});

async function checkSSO() {
  var email = document.getElementById('loginEmail').value.trim();
  if (!email || !email.includes('@') || email.split('@')[1].length < 3) {
    resetSSO();
    return;
  }
  try {
    var r = await fetch('/api/sso/lookup?email=' + encodeURIComponent(email));
    if (!r.ok) { resetSSO(); return; }
    var d = await r.json();
    if (d.sso_available && d.org_id) {
      _ssoOrg = { id: d.org_id, name: d.org_name };
      _ssoEnforce = !!d.enforce_sso;
      showSSOOption();
    } else {
      resetSSO();
    }
  } catch (e) {
    resetSSO();
  }
}

function showSSOOption() {
  document.getElementById('ssoSection').classList.add('visible');
  var label = _ssoOrg.name
    ? 'Mit ' + _ssoOrg.name + ' SSO anmelden'
    : 'Mit SSO anmelden';
  document.getElementById('ssoOrgLabel').textContent = label;

  if (_ssoEnforce) {
    document.getElementById('ssoEnforceBanner').style.display = '';
    document.getElementById('loginPasswordWrap').style.display = 'none';
    document.getElementById('loginBtnWrap').style.display = 'none';
  } else {
    document.getElementById('ssoEnforceBanner').style.display = 'none';
    document.getElementById('loginPasswordWrap').style.display = '';
    document.getElementById('loginBtnWrap').style.display = '';
  }
}

function resetSSO() {
  _ssoOrg = null;
  _ssoEnforce = false;
  document.getElementById('ssoSection').classList.remove('visible');
  document.getElementById('ssoEnforceBanner').style.display = 'none';
  document.getElementById('loginPasswordWrap').style.display = '';
  document.getElementById('loginBtnWrap').style.display = '';
}

async function doSSOLogin() {
  if (!_ssoOrg) return;
  clearErr('login');
  document.getElementById('btnSSOLogin').disabled = true;
  document.getElementById('ssoOrgLabel').textContent = '⏳ Weiterleitung…';
  try {
    var r = await fetch('/api/sso/login/' + encodeURIComponent(_ssoOrg.id));
    var d = await r.json();
    if (!r.ok || !d.redirect_url) {
      showErr('login', d.error === 'SSO_NOT_CONFIGURED'
        ? 'SSO ist für diese Organisation noch nicht konfiguriert.'
        : (d.message || 'SSO-Login fehlgeschlagen.'));
      return;
    }
    window.location.href = d.redirect_url;
  } catch (e) {
    showErr('login', 'Verbindungsfehler bei SSO-Anmeldung.');
  } finally {
    document.getElementById('btnSSOLogin').disabled = false;
    showSSOOption();
  }
}

/* ── Keyboard shortcuts ─────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeAuth(); return; }
  if (e.key !== 'Enter') return;
  if (e.target.tagName === 'TEXTAREA') return;
  var active = document.querySelector('.am-pane.active');
  if (!active) return;
  var id = active.id;
  if (id === 'paneLogin')    doLogin();
  if (id === 'paneRegister') doRegister();
  if (id === 'paneForgot')   doForgotPassword();
  if (id === 'paneReset')    doResetPassword();
});

/* ── Toast ──────────────────────────────────────────── */
function showToast(msg, type) {
  var el = document.getElementById('tcToast');
  el.textContent = msg;
  el.className = 'tc-toast visible' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.classList.remove('visible'); }, 4500);
}

/* ── Story-Visuals: KI-Bild-Drop-in (P7c) ─────────────────────────
   Jede figure.story__visual[data-img] behaelt ihre SVG-Illustration als
   Fallback. Existiert die Bilddatei (Phase 7c legt sie unter
   /public/img/landing/ ab), wird sie eingeblendet und die SVG versteckt —
   ohne Deploy-Aenderung am Markup. Ladefehler bleiben stumm (kein JS-Error). */
(function () {
  var figures = document.querySelectorAll('.story__visual[data-img]');
  figures.forEach(function (fig) {
    var probe = new Image();
    probe.onload = function () {
      var img = document.createElement('img');
      img.src = fig.getAttribute('data-img');
      img.alt = fig.getAttribute('data-alt') || '';
      img.loading = 'lazy';
      img.width = 960; img.height = 720;
      img.className = 'story__img';
      fig.insertBefore(img, fig.firstChild);
      fig.classList.add('has-img');
    };
    probe.src = fig.getAttribute('data-img');
  });
})();
