/**
 * TempConnect Shared API Client
 * ─────────────────────────────────────────────────────────────
 * Extracted & hardened from index.html's apiFetch pattern.
 * Drop-in for ALL pages — replaces per-page fetch() boilerplate.
 *
 * Usage:
 *   TC.api.get('/capacities')
 *   TC.api.post('/requests', { listing_id: '...' })
 *   TC.api.patch('/requests/123/status', { status: 'ACCEPTED' })
 *   TC.api.delete('/listings/123')
 *   TC.api.upload('/uploads', formData)
 *
 * Events dispatched on document:
 *   'tc:auth-required'  — 401 received (session expired)
 *   'tc:rate-limited'   — 429 received
 *   'tc:server-error'   — 500+ received
 *   'tc:network-error'  — fetch failed (offline / DNS / timeout)
 *
 * Depends on: nothing (self-contained IIFE)
 * Provides:  window.TC.api
 */
"use strict";

var TC = window.TC || {};

TC.api = (function () {
  var API_BASE = "/api";
  var _csrfToken = null;
  var _csrfPromise = null; // dedup concurrent CSRF fetches
  var ACTIVE_ORG_KEY = "tc.activeOrgId";
  var ACTIVE_LOCATION_KEY = "tc.activeLocationId";
  var _activeOrgId;
  var _activeLocationId;

  function getActiveOrgId() {
    if (_activeOrgId !== undefined) return _activeOrgId;
    try {
      _activeOrgId = sessionStorage.getItem(ACTIVE_ORG_KEY) || null;
    } catch (_err) {
      _activeOrgId = null;
    }
    return _activeOrgId;
  }

  function setActiveOrgId(orgId) {
    var normalized = orgId ? String(orgId).trim() : "";
    _activeOrgId = normalized || null;
    try {
      if (normalized) {
        sessionStorage.setItem(ACTIVE_ORG_KEY, normalized);
      } else {
        sessionStorage.removeItem(ACTIVE_ORG_KEY);
      }
    } catch (_err) { /* ignore */ }
    return _activeOrgId;
  }

  function getActiveLocationId() {
    if (_activeLocationId !== undefined) return _activeLocationId;
    try {
      _activeLocationId = sessionStorage.getItem(ACTIVE_LOCATION_KEY) || null;
    } catch (_err) {
      _activeLocationId = null;
    }
    return _activeLocationId;
  }

  function setActiveLocationId(locationId) {
    var normalized = locationId ? String(locationId).trim() : "";
    _activeLocationId = normalized || null;
    try {
      if (normalized) {
        sessionStorage.setItem(ACTIVE_LOCATION_KEY, normalized);
      } else {
        sessionStorage.removeItem(ACTIVE_LOCATION_KEY);
      }
    } catch (_err) { /* ignore */ }
    return _activeLocationId;
  }

  /* ── CSRF Token Management ─────────────────────────────────── */

  function fetchCsrfToken() {
    if (_csrfToken) return Promise.resolve(_csrfToken);
    // Deduplicate: if a fetch is already in-flight, return that promise
    if (_csrfPromise) return _csrfPromise;
    _csrfPromise = fetch(API_BASE + "/csrf", { credentials: "include" })
      .then(function (r) {
        if (!r.ok) throw new Error("CSRF fetch failed: " + r.status);
        var ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.indexOf("application/json") < 0) {
          throw new Error("API antwortet nicht mit JSON. Server erreichbar?");
        }
        return r.json();
      })
      .then(function (d) {
        _csrfToken = (d && d.token) || null;
        _csrfPromise = null;
        return _csrfToken;
      })
      .catch(function (err) {
        _csrfPromise = null;
        throw err;
      });
    return _csrfPromise;
  }

  function invalidateCsrf() {
    _csrfToken = null;
    _csrfPromise = null;
  }

  /* ── Core Request ──────────────────────────────────────────── */

  var MUTATING = ["POST", "PUT", "PATCH", "DELETE"];

  function request(path, opts) {
    opts = opts || {};
    var method = (opts.method || "GET").toUpperCase();
    var body = opts.body !== undefined ? opts.body : null;
    var isMutating = MUTATING.indexOf(method) >= 0;
    var isFormData = body instanceof FormData;
    var signal = opts.signal || null;
    var rawResponse = opts.rawResponse || false;

    // Build headers
    var headers = {};
    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }
    var explicitOrg = Object.prototype.hasOwnProperty.call(opts, "orgId") ? opts.orgId : undefined;
    var activeOrg = explicitOrg !== undefined ? explicitOrg : getActiveOrgId();
    if (activeOrg) {
      headers["X-Org-Id"] = String(activeOrg);
    }
    var explicitLoc = Object.prototype.hasOwnProperty.call(opts, "locationId") ? opts.locationId : undefined;
    var activeLoc = explicitLoc !== undefined ? explicitLoc : getActiveLocationId();
    if (activeLoc) {
      headers["X-Location-Id"] = String(activeLoc);
    }

    function doFetch(token) {
      if (isMutating && token) {
        headers["X-CSRF-Token"] = token;
      }
      var fetchOpts = {
        method: method,
        headers: headers,
        credentials: "include"
      };
      if (signal) fetchOpts.signal = signal;
      if (body != null) {
        fetchOpts.body = isFormData ? body : JSON.stringify(body);
      }
      return fetch(API_BASE + path, fetchOpts);
    }

    // Ensure CSRF token before mutating requests
    var fetchPromise;
    if (isMutating) {
      fetchPromise = (_csrfToken ? Promise.resolve(_csrfToken) : fetchCsrfToken())
        .then(function (token) { return doFetch(token); });
    } else {
      fetchPromise = Promise.resolve().then(function () { return doFetch(null); });
    }

    return fetchPromise.then(function (res) {
      return handleResponse(res, method, path, body, isFormData, signal, rawResponse);
    }).catch(function (err) {
      // Network error (offline, DNS, timeout)
      if (err.name === "AbortError") throw err;
      if (!err._handled) {
        dispatch("tc:network-error", { path: path, error: err });
      }
      throw normalizeError(err);
    });
  }

  function hasApiErrorCode(data, expectedCode) {
    if (!data || !expectedCode || typeof data !== "object") return false;
    if (typeof data.error === "string" && data.error === expectedCode) return true;
    if (typeof data.code === "string" && data.code === expectedCode) return true;
    if (data.error && typeof data.error === "object") {
      if (typeof data.error.code === "string" && data.error.code === expectedCode) return true;
      if (typeof data.error.error === "string" && data.error.error === expectedCode) return true;
    }
    return false;
  }

  function toErrorMessage(value, fallback) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value && typeof value === "object") {
      if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
      if (typeof value.code === "string" && value.code.trim()) return value.code.trim();
      try {
        var serialized = JSON.stringify(value);
        if (serialized && serialized !== "{}") return serialized;
      } catch (_err) { /* ignore */ }
    }
    return fallback || "Unbekannter Fehler";
  }

  function parseApiErrorPayload(data, status, defaults) {
    defaults = defaults || {};
    var fallbackCode = defaults.code || ("HTTP_" + status);
    var fallbackMessage = defaults.message || ("Fehler " + status);
    if (!data || typeof data !== "object") {
      return {
        code: fallbackCode,
        message: typeof data === "string" && data.trim() ? data.trim() : fallbackMessage,
        details: null,
        feature: null,
        plan: null
      };
    }
    var nested = data.error && typeof data.error === "object" ? data.error : null;
    var code = fallbackCode;
    if (nested && typeof nested.code === "string" && nested.code.trim()) {
      code = nested.code.trim();
    } else if (typeof data.error === "string" && data.error.trim()) {
      code = data.error.trim();
    } else if (typeof data.code === "string" && data.code.trim()) {
      code = data.code.trim();
    }
    var message = fallbackMessage;
    if (nested && typeof nested.message === "string" && nested.message.trim()) {
      message = nested.message.trim();
    } else if (typeof data.message === "string" && data.message.trim()) {
      message = data.message.trim();
    } else if (code && code !== "API_ERROR") {
      message = code;
    }
    var details = nested && Object.prototype.hasOwnProperty.call(nested, "details")
      ? nested.details
      : (Object.prototype.hasOwnProperty.call(data, "details") ? data.details : null);
    var feature = nested && Object.prototype.hasOwnProperty.call(nested, "feature")
      ? nested.feature
      : (Object.prototype.hasOwnProperty.call(data, "feature") ? data.feature : null);
    var plan = nested && Object.prototype.hasOwnProperty.call(nested, "plan")
      ? nested.plan
      : (Object.prototype.hasOwnProperty.call(data, "plan") ? data.plan : null);
    return {
      code: code || fallbackCode,
      message: toErrorMessage(message, fallbackMessage),
      details: details,
      feature: feature,
      plan: plan
    };
  }

  function handleResponse(res, method, path, body, isFormData, signal, rawResponse, isRetry) {
    // 502/503/504 — server unreachable
    if (res.status >= 502 && res.status <= 504) {
      var serverErr = createError("SERVER_UNREACHABLE", "Server nicht erreichbar (" + res.status + ").", res.status);
      dispatch("tc:server-error", { path: path, status: res.status });
      throw serverErr;
    }

    var ct = (res.headers.get("content-type") || "").toLowerCase();

    // HTML response from reverse proxy — server down
    if (ct.indexOf("text/html") >= 0 && res.status !== 200) {
      var proxyErr = createError("SERVER_UNREACHABLE", "Server nicht erreichbar.", res.status);
      dispatch("tc:server-error", { path: path, status: res.status });
      throw proxyErr;
    }

    // Return raw response if requested (for file downloads etc.)
    if (rawResponse) return Promise.resolve(res);

    // Parse response
    var dataPromise = ct.indexOf("application/json") >= 0
      ? res.json()
      : res.text().then(function (t) { return t; });

    return dataPromise.then(function (data) {
      // CSRF invalid — auto-retry once
      if (res.status === 403 && !isRetry && hasApiErrorCode(data, "CSRF_INVALID")) {
        invalidateCsrf();
        return fetchCsrfToken().then(function (newToken) {
          var headers2 = {};
          if (!isFormData) headers2["Content-Type"] = "application/json";
          if (newToken) headers2["X-CSRF-Token"] = newToken;
          var fetchOpts2 = {
            method: method,
            headers: headers2,
            credentials: "include"
          };
          if (signal) fetchOpts2.signal = signal;
          if (body != null) {
            fetchOpts2.body = isFormData ? body : JSON.stringify(body);
          }
          return fetch(API_BASE + path, fetchOpts2);
        }).then(function (res2) {
          return handleResponse(res2, method, path, body, isFormData, signal, rawResponse, true);
        });
      }

      // 401 — session expired
      if (res.status === 401) {
        dispatch("tc:auth-required", { path: path });
        var authErr = parseApiErrorPayload(data, 401, {
          code: "NOT_AUTHENTICATED",
          message: "Sitzung abgelaufen. Bitte erneut anmelden."
        });
        throw createError(authErr.code, authErr.message, 401, {
          details: authErr.details,
          feature: authErr.feature,
          plan: authErr.plan,
          response: data
        });
      }

      // 429 — rate limited
      if (res.status === 429) {
        var retryAfter = res.headers.get("Retry-After");
        dispatch("tc:rate-limited", { path: path, retryAfter: retryAfter });
        var rateErr = parseApiErrorPayload(data, 429, {
          code: "RATE_LIMITED",
          message: "Zu viele Anfragen. Bitte kurz warten."
        });
        throw createError(rateErr.code, rateErr.message, 429, {
          details: rateErr.details,
          feature: rateErr.feature,
          plan: rateErr.plan,
          response: data
        });
      }

      // 403 SSO required
      if (res.status === 403 && hasApiErrorCode(data, "SSO_REQUIRED")) {
        var ssoUrl = data && data.sso_url;
        if (!ssoUrl && data && data.error && typeof data.error === "object") {
          ssoUrl = data.error.sso_url || null;
        }
        dispatch("tc:sso-required", { sso_url: ssoUrl || null });
        var ssoErr = parseApiErrorPayload(data, 403, {
          code: "SSO_REQUIRED",
          message: "SSO-Anmeldung erforderlich."
        });
        throw createError(ssoErr.code, ssoErr.message, 403, {
          details: ssoErr.details,
          feature: ssoErr.feature,
          plan: ssoErr.plan,
          response: data
        });
      }

      // Any other error
      if (!res.ok) {
        var parsedErr = parseApiErrorPayload(data, res.status, {
          code: "HTTP_" + res.status,
          message: "Fehler " + res.status
        });
        var apiErr = createError(parsedErr.code, parsedErr.message, res.status, {
          details: parsedErr.details,
          feature: parsedErr.feature,
          plan: parsedErr.plan,
          response: data
        });
        if (res.status >= 500) {
          dispatch("tc:server-error", { path: path, status: res.status, data: data });
        }
        throw apiErr;
      }

      return data;
    });
  }

  /* ── Convenience Methods ───────────────────────────────────── */

  function get(path, opts)    { return request(path, Object.assign({}, opts, { method: "GET" })); }
  function post(path, body, opts)   { return request(path, Object.assign({}, opts, { method: "POST", body: body })); }
  function patch(path, body, opts)  { return request(path, Object.assign({}, opts, { method: "PATCH", body: body })); }
  function put(path, body, opts)    { return request(path, Object.assign({}, opts, { method: "PUT", body: body })); }
  function del(path, opts)   { return request(path, Object.assign({}, opts, { method: "DELETE" })); }

  function upload(path, formData, opts) {
    return request(path, Object.assign({}, opts, { method: "POST", body: formData }));
  }

  /* ── Helpers ───────────────────────────────────────────────── */

  function createError(code, message, status, metadata) {
    var safeCode = (typeof code === "string" && code.trim()) ? code.trim() : "API_ERROR";
    var err = new Error(toErrorMessage(message, safeCode === "API_ERROR" ? "Unbekannter Fehler" : safeCode));
    err.code = safeCode;
    err.status = (typeof status === "number" && isFinite(status)) ? status : 0;
    err.details = metadata && Object.prototype.hasOwnProperty.call(metadata, "details") ? metadata.details : null;
    err.feature = metadata && Object.prototype.hasOwnProperty.call(metadata, "feature") ? metadata.feature : null;
    err.plan = metadata && Object.prototype.hasOwnProperty.call(metadata, "plan") ? metadata.plan : null;
    if (metadata && Object.prototype.hasOwnProperty.call(metadata, "response")) {
      err.response = metadata.response;
    }
    err._handled = true;
    return err;
  }

  function normalizeError(err) {
    if (err instanceof Error && err._handled) return err;
    var code = (err && typeof err.code === "string" && err.code.trim()) ? err.code.trim() : "NETWORK_ERROR";
    var status = (err && typeof err.status === "number" && isFinite(err.status)) ? err.status : 0;
    var msg = toErrorMessage(err && Object.prototype.hasOwnProperty.call(err, "message") ? err.message : err, "Verbindungsfehler");
    return createError(code, msg, status, {
      details: err && Object.prototype.hasOwnProperty.call(err, "details") ? err.details : null,
      feature: err && Object.prototype.hasOwnProperty.call(err, "feature") ? err.feature : null,
      plan: err && Object.prototype.hasOwnProperty.call(err, "plan") ? err.plan : null
    });
  }

  function dispatch(eventName, detail) {
    try {
      document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    } catch (_) { /* old browsers */ }
  }

  /* ── Public API ────────────────────────────────────────────── */

  return {
    get: get,
    post: post,
    patch: patch,
    put: put,
    delete: del,
    upload: upload,
    request: request,
    /** Force-refresh CSRF token (useful after login) */
    refreshCsrf: function () { invalidateCsrf(); return fetchCsrfToken(); },
    /** Get current CSRF token (for legacy code migration) */
    getCsrfToken: function () { return _csrfToken; },
    /** Set CSRF token externally (for legacy code migration) */
    setCsrfToken: function (t) { _csrfToken = t; },
    /** Active org helpers */
    getActiveOrgId: getActiveOrgId,
    setActiveOrgId: setActiveOrgId,
    clearActiveOrgId: function () { return setActiveOrgId(null); },
    /** Active location helpers */
    getActiveLocationId: getActiveLocationId,
    setActiveLocationId: setActiveLocationId,
    clearActiveLocationId: function () { return setActiveLocationId(null); }
  };
})();

window.TC = TC;
