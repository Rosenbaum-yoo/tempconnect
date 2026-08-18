"use strict";

/**
 * portalApi.js — Gemeinsamer API-Client für das Einsatzportal
 * Laden: <script src="/public/js/workerPortal/portalApi.js">
 * Exponiert: window.PortalApi
 *
 * Enthält:
 *  - getCsrf()     — CSRF-Token mit Caching (eine Anfrage pro Session)
 *  - clearCsrf()   — Cache zurücksetzen (nach CSRF-Ablauf)
 *  - apiJson()     — zentraler fetch-Wrapper mit Error-Mapping
 *  - get/post/patch/put/del — Kurzformen
 *  - PortalApiError — typisierte Fehlerklasse
 */
(function () {
  const API = '/api';
  let _csrfToken = null;

  /* ── PortalApiError ────────────────────────────────────────────── */
  function PortalApiError(code, status, details) {
    this.name    = 'PortalApiError';
    this.message = code;
    this.code    = code;
    this.status  = status;
    this.details = details || null;
  }
  PortalApiError.prototype = Object.create(Error.prototype);
  PortalApiError.prototype.constructor = PortalApiError;

  /* ── 429: zwei verschiedene Dinge unter derselben Zahl ───────────
   *
   * DAS WAR EINE ECHTE LUECKE (gefunden in Welle G5): Hier stand
   *   if (r.status === 429) throw new PortalApiError('RATE_LIMITED', 429);
   * VOR dem Lesen des Rumpfes — ohne drittes Argument, also ohne `details`.
   * Damit ging jede Zusatzangabe verloren, die der Server mitschickt.
   *
   * Und genau daran haengt die Zeitsperre der Selbst-Abmeldung: Der Server
   * antwortet mit 429 UND `verbleibend_sekunden`, damit die Oberflaeche einen
   * ehrlichen Zaehler zeigen kann. Diese Zahl erreichte den Browser nie — der
   * Mensch sah "zu viele Anfragen" und wusste nicht, wie lange er warten soll.
   *
   * Unter 429 liegen zwei verschiedene Dinge:
   *   - die Zeitsperre eines Vorgangs (fachlich, mit verbleibend_sekunden)
   *   - das allgemeine Anfragenlimit (technisch, RATE_LIMIT)
   * Sie sind nur an ihrem Rumpf zu unterscheiden. Deshalb wird er gelesen und
   * der Fehlercode aus ihm genommen, wenn er einen nennt.
   */
  async function _zuVieleAnfragen(r) {
    var rumpf = {};
    try {
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) rumpf = await r.json();
    } catch (e) { /* kein oder kaputter Rumpf: der Code unten faellt zurueck */ }
    var code = (rumpf && (rumpf.error || rumpf.code)) || 'RATE_LIMITED';
    return new PortalApiError(code, 429, rumpf);
  }

  /* ── CSRF ──────────────────────────────────────────────────────── */
  async function getCsrf() {
    if (_csrfToken) return _csrfToken;
    const r = await fetch(API + '/csrf', { credentials: 'include' });
    if (!r.ok) throw new PortalApiError('CSRF_FAILED', r.status);
    const d = await r.json();
    _csrfToken = d.token;
    return _csrfToken;
  }

  function clearCsrf() { _csrfToken = null; }

  /* ── apiJson ───────────────────────────────────────────────────── */
  /**
   * Zentraler fetch-Wrapper.
   *
   * Fehlerverhalten — RICHTIGGESTELLT in Welle G5. Hier stand eine Tabelle mit
   * festen Codes je Status (403→FORBIDDEN, 404→NOT_FOUND, 422→VALIDATION,
   * 500→SERVER_ERROR), die der Code darunter nie hatte. Sie hat beim Bauen von
   * G5 zwei Recherchen in die Irre gefuehrt: Es gibt im ganzen Portal keinen
   * einzigen 422-Pfad — eine zu kurze Beschreibung antwortet mit 400.
   *
   *   401 → PortalApiError('NOT_AUTH', 401)             — Sonderweg, ohne Rumpf
   *   429 → PortalApiError(<code aus dem Rumpf>, 429, rumpf)
   *          fachlich 'ZEITSPERRE' mit details.verbleibend_sekunden,
   *          technisch 'RATE_LIMITED' — nur am Rumpf zu unterscheiden
   *   403 mit CSRF_INVALID → Token neu holen und EINMAL wiederholen
   *   alles andere → PortalApiError(rumpf.error || rumpf.code || 'HTTP_<status>',
   *                                 status, rumpf)
   *          d. h. der Code kommt IMMER aus der Antwort, nicht aus einer Tabelle.
   *          Beispiele: 400 BESCHREIBUNG_ZU_KURZ (mit woerter/fehlend/mindestens),
   *          428 VORGANG_NICHT_EROEFFNET, 409 ABSENCE_OVERLAP.
   *   Netzwerkfehler → PortalApiError('NETWORK_ERROR', 0)
   */
  async function apiJson(path, opts) {
    opts = opts || {};
    const method = (opts.method || 'GET').toUpperCase();
    const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (isMutation) {
      headers['x-csrf-token'] = await getCsrf();
    }

    var body = opts.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      body = JSON.stringify(body);
    }

    var fetchOpts = { method: method, credentials: 'include', headers: headers };
    if (body !== undefined) fetchOpts.body = body;

    var r;
    try {
      r = await fetch(API + path, fetchOpts);
    } catch (netErr) {
      throw new PortalApiError('NETWORK_ERROR', 0, netErr.message);
    }

    // CSRF abgelaufen: Token zurücksetzen, einmal automatisch neu versuchen
    if (r.status === 403 && isMutation) {
      var errBody;
      try { errBody = await r.json(); } catch (e) { errBody = {}; }
      var iscsrf = errBody && (errBody.code === 'CSRF_INVALID' || errBody.error === 'CSRF_INVALID' || errBody.error === 'INVALID_CSRF');
      if (iscsrf) {
        clearCsrf();
        headers['x-csrf-token'] = await getCsrf();
        try {
          r = await fetch(API + path, Object.assign({}, fetchOpts, { headers: headers }));
        } catch (netErr2) {
          throw new PortalApiError('NETWORK_ERROR', 0, netErr2.message);
        }
      } else {
        throw new PortalApiError(errBody.error || 'FORBIDDEN', 403, errBody);
      }
    }

    if (r.status === 401) throw new PortalApiError('NOT_AUTH', 401);
    if (r.status === 429) throw await _zuVieleAnfragen(r);

    var ct = r.headers.get('content-type') || '';
    var resBody;
    if (ct.indexOf('application/json') !== -1) {
      try { resBody = await r.json(); } catch (e) { resBody = {}; }
    } else {
      resBody = {};
    }

    if (!r.ok) {
      var code = (resBody && (resBody.error || resBody.code)) || ('HTTP_' + r.status);
      throw new PortalApiError(code, r.status, resBody);
    }

    return resBody;
  }

  /* ── Kurzformen ────────────────────────────────────────────────── */
  function get(path, params) {
    var url = path;
    if (params) {
      var qs = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      url = path + '?' + qs;
    }
    return apiJson(url, { method: 'GET' });
  }
  function post(path, body)  { return apiJson(path, { method: 'POST',   body: body !== undefined ? body : {} }); }
  function patch(path, body) { return apiJson(path, { method: 'PATCH',  body: body !== undefined ? body : {} }); }
  function put(path, body)   { return apiJson(path, { method: 'PUT',    body: body !== undefined ? body : {} }); }
  function del(path)         { return apiJson(path, { method: 'DELETE', body: {} }); }

  /**
   * upload(path, formData) — Multipart-POST (kein Content-Type-Header setzen,
   * Browser setzt boundary automatisch). Für Datei-Uploads.
   */
  async function upload(path, formData) {
    const csrf = await getCsrf();
    var r;
    try {
      r = await fetch(API + path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf },
        body: formData
      });
    } catch (netErr) {
      throw new PortalApiError('NETWORK_ERROR', 0, netErr.message);
    }
    if (r.status === 401) throw new PortalApiError('NOT_AUTH', 401);
    if (r.status === 429) throw await _zuVieleAnfragen(r);
    var ct = r.headers.get('content-type') || '';
    var resBody;
    if (ct.indexOf('application/json') !== -1) {
      try { resBody = await r.json(); } catch (e) { resBody = {}; }
    } else {
      resBody = {};
    }
    if (!r.ok) {
      var code = (resBody && (resBody.error || resBody.code)) || ('HTTP_' + r.status);
      throw new PortalApiError(code, r.status, resBody);
    }
    return resBody;
  }

  /* ── Export ────────────────────────────────────────────────────── */
  window.PortalApi = {
    apiJson: apiJson,
    getCsrf: getCsrf,
    clearCsrf: clearCsrf,
    get: get,
    post: post,
    patch: patch,
    put: put,
    del: del,
    upload: upload,
    PortalApiError: PortalApiError
  };
})();
