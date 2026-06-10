/**
 * accountSubscription.js — Eingeloggte Account-/Abo-Verwaltung fuer sla_abo.html.
 *
 * Datenquellen:
 *   - GET /api/me                        (Org-Kontext, billing-Rolle, Profil-Prefill)
 *   - GET /api/me/entitlements           (Welle 8 Schritt 5: Plan, Features, Limits,
 *                                         Pending-Requests, Subscription-Status)
 *   - GET /api/public/catalog            (Welle 8 Schritt 2: Wunsch-Plaene fuer Aktionen)
 *   - GET /api/subscription-requests/mine (Offene Account-Abo-Aktionen)
 *   - GET /api/subscription-documents/mine (Tarif-/Vertragsdokumente)
 *   - GET /api/payment/config            (Stripe Customer Portal Feature-Flag)
 *
 * Verhaeltnis zu `slaAbo.js`:
 *   - slaAbo.js bleibt unveraendert verantwortlich fuer Plan-Grid Render,
 *     Stripe/Demo-Checkout-Modal, 3-Step-Downgrade-Wizard,
 *     Bounty-Teaser, Referral-Banner, Payment-History-Tabelle.
 *   - Diese Datei fuellt die Account-/Limits-/Features-/Pending-/
 *     Aktions-/Dokumente-Sektionen am oberen Seitenrand.
 *
 * CTAs:
 *   - Upgrade/Downgrade/Cancellation aus dem Account-Bereich -> direkte
 *     POSTs auf /api/subscription-requests/* mit Live-Refresh.
 *   - Standard-Checkout in `slaAbo.js` bleibt fuer explizite Payment-Flows
 *     erhalten, wird aber fuer Account-Aktionen nicht mehr als Ersatz fuer
 *     Subscription-Requests genutzt.
 *
 * Pending-State: Wenn `pending_requests` mind. eine Zeile mit
 * non-terminal Status enthaelt, werden DUPLIKAT-CTAs ausgeblendet:
 *   - Bei Pending Upgrade: Upgrade-Buttons disabled + Pending-Badge
 *   - Bei Pending Cancellation: Cancel-Button ersetzt durch "Kuendigung
 *     vorgemerkt"-Hinweis
 *
 * Sicherheits-Note: Diese Datei ist UI-Convenience. Backend gateet ALLE
 * Mutationen. Wenn /api/me/entitlements einen sub.active=false-Snapshot
 * liefert, faerbt der Renderer die Aktionen visuell rot, blockiert sie
 * jedoch nicht hart - das macht der entitlementGuard auf der Server-Seite.
 */
(function () {
  "use strict";

  var state = {
    me: null,
    entitlements: null,
    catalog: null,
    requests: [],
    documents: [],
    invoices: [],
    paymentConfig: null,
    error: null,
    requestsError: null,
    documentsError: null,
    invoicesError: null,
    paymentError: null,
    actionBusy: null,
    notice: null
  };

  /* ── Helper ───────────────────────────────────────────────── */

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function fmtDate(s) { try { return s ? new Date(s).toLocaleDateString("de-DE") : "\u2013"; } catch (e) { return "\u2013"; } }
  function fmtCents(c) {
    if (c == null) return "\u2013";
    var n = Number(c) / 100;
    if (!isFinite(n)) return "\u2013";
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString("de-DE"); }
  function fmtLimitValue(v) {
    if (v === -1 || v == null) return "Unbegrenzt";
    return fmtNum(v);
  }

  function $(id) { return document.getElementById(id); }

  function idempotencyKey() {
    try {
      return (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "acct-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    } catch (e) {
      return "acct-" + Math.random().toString(36).slice(2) + "-" + Date.now();
    }
  }

  function extractItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function safeFetchJson(url, fallback, opts) {
    opts = opts || {};
    return fetch(url, { credentials: opts.credentials || "include" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP_" + r.status);
      return r.json();
    }).catch(function (e) {
      if (opts.errorKey) state[opts.errorKey] = e && e.message ? e.message : "LOAD_FAILED";
      return fallback;
    });
  }

  function getCsrf() {
    return fetch("/api/csrf", { credentials: "include" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      return d && (d.csrfToken || d.token) || "";
    }).catch(function () { return ""; });
  }

  function parseResponse(r) {
    return r.text().then(function (text) {
      var payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }
      if (!r.ok) {
        var errBody = payload && payload.error ? payload.error : payload;
        var err = new Error(
          (errBody && (errBody.message || errBody.code)) ||
          (payload && (payload.message || payload.error)) ||
          ("HTTP_" + r.status)
        );
        err.status = r.status;
        err.code = errBody && errBody.code ? errBody.code : (payload && payload.error) || null;
        err.payload = payload;
        throw err;
      }
      return payload;
    });
  }

  function apiMutation(path, body) {
    return getCsrf().then(function (token) {
      return fetch(path, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
          "Idempotency-Key": idempotencyKey()
        },
        body: JSON.stringify(body || {})
      });
    }).then(parseResponse);
  }

  function setNotice(type, message) {
    state.notice = { type: type || "info", message: message || "" };
  }

  function noticeHtml() {
    if (!state.notice || !state.notice.message) return "";
    var color = state.notice.type === "success" ? "57,217,138"
      : state.notice.type === "error" ? "255,92,122"
      : state.notice.type === "warn" ? "255,204,0"
      : "74,158,255";
    return '<div style="margin:0 0 var(--ds-space-3);padding:10px 12px;border-radius:var(--ds-radius-md);border:1px solid rgba(' + color + ',.32);background:rgba(' + color + ',.08);font-size:13px;color:var(--ds-text-secondary)">' + esc(state.notice.message) + '</div>';
  }

  function requestList() {
    if (Array.isArray(state.requests) && state.requests.length) return state.requests;
    var ent = state.entitlements;
    return ent && Array.isArray(ent.pending_requests) ? ent.pending_requests : [];
  }

  function normalizeType(type) {
    return String(type || "").toLowerCase();
  }

  function pendingByType(type) {
    var wanted = normalizeType(type);
    return requestList().find(function (r) { return normalizeType(r.request_type) === wanted; }) || null;
  }

  function hasOpenRequest(types) {
    types = Array.isArray(types) ? types : [types];
    return requestList().some(function (r) {
      return types.indexOf(normalizeType(r.request_type)) !== -1;
    });
  }

  function _planRank(plan) {
    return ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"].indexOf(String(plan || "DEMO").toUpperCase());
  }

  function nextPlan(currentPlan) {
    if (currentPlan === "BASIS") return "PLUS";
    if (currentPlan === "PLUS") return "PRO";
    if (currentPlan === "DEMO") return "BASIS";
    return null;
  }

  function previousPlan(currentPlan) {
    if (currentPlan === "INDIVIDUELL") return "PRO";
    if (currentPlan === "PRO") return "PLUS";
    if (currentPlan === "PLUS") return "BASIS";
    if (currentPlan === "BASIS") return "DEMO";
    return null;
  }

  function defaultExpectedStartDate() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function accountPayloadBase(message) {
    var ent = state.entitlements || {};
    var usage = ent.usage || {};
    var users = usage.users && (usage.users.current || usage.users.count || usage.users.used);
    var sites = usage.sites && (usage.sites.current || usage.sites.count || usage.sites.used);
    return {
      employee_count: ent.employee_count ? Number(ent.employee_count) : null,
      user_count: users ? Number(users) : null,
      site_count: sites ? Number(sites) : null,
      region_scope: ent.region_scope || null,
      industry: ent.industry || null,
      expected_start_date: defaultExpectedStartDate(),
      message: message || null
    };
  }

  function actionErrorMessage(e, fallback) {
    if (!e) return fallback;
    if (e.code === "DUPLICATE_OPEN_REQUEST") return "Es gibt bereits eine offene Anfrage. Die Statusanzeige wurde aktualisiert.";
    if (e.code === "PERMISSION_DENIED") return "Nur Owner/Admin/Finance koennen Tarif-Aenderungen anfragen.";
    if (e.code === "DOWNGRADE_HARD_BLOCKED") return "Downgrade ist aktuell hart blockiert: zuerst Nutzer/Limits reduzieren.";
    if (e.code === "DOWNGRADE_BLOCKED") return "Downgrade wuerde Limits ueberschreiten. Bitte Limits reduzieren oder Staff pruefen lassen.";
    if (e.code === "STRIPE_CUSTOMER_NOT_FOUND") return "Fuer diesen Account ist noch kein Stripe-Customer-Portal verfuegbar.";
    if (e.code === "STRIPE_CUSTOMER_PORTAL_UNAVAILABLE") return "Stripe Customer Portal ist noch nicht verfuegbar.";
    return e.message || fallback;
  }

  /* ── Init ─────────────────────────────────────────────────── */

  function init() {
    var hasContainers = $("accountStatusBlock") || $("accountFeaturesBlock");
    if (!hasContainers) return; // andere Seite, kein Render
    loadAll().then(renderAll).catch(function (e) {
      state.error = e && e.message ? e.message : "UNKNOWN_ERROR";
      renderAll();
    });
  }

  function loadAll() {
    state.error = null;
    state.requestsError = null;
    state.documentsError = null;
    state.invoicesError = null;
    state.paymentError = null;
    return Promise.all([
      safeFetchJson("/api/me", null),
      safeFetchJson("/api/me/entitlements", null, { errorKey: "error" }),
      safeFetchJson("/api/public/catalog", null, { credentials: "omit" }),
      safeFetchJson("/api/subscription-requests/mine", { data: { items: [] } }, { errorKey: "requestsError" }),
      safeFetchJson("/api/subscription-documents/mine?limit=50", { data: { items: [] } }, { errorKey: "documentsError" }),
      safeFetchJson("/api/payment/config", null, { errorKey: "paymentError" }),
      safeFetchJson("/api/invoices?limit=20", null, { errorKey: "invoicesError" })
    ]).then(function (res) {
      state.me = res[0];
      state.entitlements = res[1];
      state.catalog = res[2];
      state.requests = extractItems(res[3]);
      state.documents = extractItems(res[4]);
      state.paymentConfig = res[5];
      // Invoices: { items: [...] } oder Array direkt
      var rawInvoices = res[6];
      state.invoices = Array.isArray(rawInvoices)
        ? rawInvoices
        : (rawInvoices && Array.isArray(rawInvoices.items) ? rawInvoices.items : []);
      if (!state.entitlements) state.error = "ENTITLEMENTS_UNAVAILABLE";
      return state;
    });
  }

  function refreshAfterMutation(successMessage) {
    return loadAll().then(function () {
      if (successMessage) setNotice("success", successMessage);
      renderAll();
      return state;
    });
  }

  /* ── Render-Pipeline ──────────────────────────────────────── */

  function renderAll() {
    renderStatus();
    renderLimits();
    renderActions();
    renderFeatures();
    renderPending();
    renderInvoices();
    renderDocuments();
    applyAccountDomLocks();
  }

  function applyAccountDomLocks() {
    if (!window.TC || !window.TC.entitlements || typeof window.TC.entitlements.applyDomLocks !== "function") return;
    window.TC.entitlements.applyDomLocks(document).catch(function () {});
  }

  /* ── Account-Status ───────────────────────────────────────── */

  function statusPill(sub) {
    if (!sub) return '<span class="account-status__pill account-status__pill--info">Kein Abo</span>';
    if (sub.pilot) return '<span class="account-status__pill account-status__pill--info">Pilot aktiv</span>';
    if (sub.status === "individual_contract") return '<span class="account-status__pill account-status__pill--info">Individueller Vertrag</span>';
    if (sub.status === "active") return '<span class="account-status__pill account-status__pill--ok">Aktiv</span>';
    if (sub.status === "demo") return '<span class="account-status__pill account-status__pill--info">DEMO</span>';
    if (sub.status === "canceling") return '<span class="account-status__pill account-status__pill--warn">Kuendigung vorgemerkt</span>';
    if (sub.status === "canceled") return '<span class="account-status__pill account-status__pill--danger">Gekuendigt</span>';
    if (sub.status === "past_due_grace") return '<span class="account-status__pill account-status__pill--warn">Zahlung ueberfaellig &mdash; Kulanzfrist aktiv</span>';
    if (sub.status === "past_due") return '<span class="account-status__pill account-status__pill--danger">Zahlung ueberfaellig &mdash; Zugang gesperrt</span>';
    return '<span class="account-status__pill account-status__pill--warn">' + esc(sub.status || "Unbekannt") + '</span>';
  }

  function renderStatus() {
    var host = $("accountStatusBlock");
    if (!host) return;
    if (state.error) {
      host.innerHTML = '<h3>Account-Status</h3><div class="account-error">Account-Daten konnten nicht geladen werden. Bitte Seite neu laden oder Vertrieb kontaktieren.</div>';
      return;
    }
    var ent = state.entitlements;
    if (!ent) {
      host.innerHTML = '<h3>Account-Status</h3><div class="empty-block">Bitte einloggen.</div>';
      return;
    }
    var sub = ent.subscription || {};
    var planLabel = ent.effective_plan === "INDIVIDUELL" ? "Individueller Tarif" : (ent.effective_plan || "DEMO");

    host.innerHTML =
      '<h3>Account-Status</h3>' +
      '<div class="account-status">' +
        '<div class="account-status__plan">' + esc(planLabel) + '</div>' +
        statusPill(sub) +
        (ent.pilot && ent.pilot.active ? '<span class="account-status__pill account-status__pill--info">Pilot</span>' : "") +
        (ent.individual_tier ? '<span class="account-status__pill account-status__pill--info">' + esc(ent.individual_tier.replace("individuell_", "Tier ").toUpperCase()) + '</span>' : "") +
      '</div>' +
      '<dl class="account-meta">' +
        '<dt>Organisation</dt><dd>' + esc(ent.org_name || (state.me && state.me.org_name) || "\u2013") + '</dd>' +
        '<dt>Plan-Quelle</dt><dd>' + esc(ent.plan_source || "\u2013") + '</dd>' +
        '<dt>Mitarbeiter (ca.)</dt><dd>' + esc(ent.employee_count || "\u2013") + '</dd>' +
        '<dt>Feature-Bundle</dt><dd>' + esc(ent.feature_bundle || "\u2013") + '</dd>' +
        (sub.cancel_at ? '<dt>Kuendigung wirksam zum</dt><dd>' + esc(fmtDate(sub.cancel_at)) + '</dd>' : "") +
        (sub.reason ? '<dt>Hinweis</dt><dd>' + esc(sub.reason) + '</dd>' : "") +
      '</dl>';
  }

  /* ── Limits + Usage ──────────────────────────────────────── */

  function normalizeLimit(limit) {
    if (limit === -1 || limit == null || limit === "") return limit === -1 ? -1 : null;
    var n = Number(limit);
    return isFinite(n) ? n : null;
  }

  function usageMetric(usage, key, fallbackLimit) {
    var raw = (usage && usage[key]) || {};
    var current = raw.current != null ? raw.current : (raw.count != null ? raw.count : raw.used);
    var limit = raw.limit != null ? raw.limit : fallbackLimit;
    return {
      current: Number(current || 0),
      limit: normalizeLimit(limit),
      allowed: raw.allowed,
      source: raw.source || ""
    };
  }

  function limitBar(current, limit) {
    if (limit === -1 || limit == null) return "";
    var pct = limit > 0 ? Math.min(100, Math.round((Number(current || 0) / Number(limit)) * 100)) : 0;
    var cls = pct >= 100 ? "limit-row__bar--danger" : pct >= 80 ? "limit-row__bar--warn" : "";
    return '<div class="limit-row__bar ' + cls + '"><span style="width:' + pct + '%"></span></div>';
  }
  function limitStatus(current, limit) {
    if (limit === -1 || limit == null) return { cls: "limit-row__pill--ok", text: "Unbegrenzt" };
    var pct = limit > 0 ? (Number(current || 0) / Number(limit)) * 100 : 0;
    if (pct >= 100) return { cls: "limit-row__pill--danger", text: "Limit erreicht" };
    if (pct >= 80) return { cls: "limit-row__pill--warn", text: "Knapp" };
    return { cls: "limit-row__pill--ok", text: "OK" };
  }

  function limitRow(label, current, limit, opts) {
    opts = opts || {};
    limit = normalizeLimit(limit);
    current = Number(current || 0);
    var status = limitStatus(current, limit);
    var pctText = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) + "% genutzt" : "";
    var valueHtml = limit === -1 || limit == null
      ? '<span>' + esc(fmtLimitValue(limit)) + '</span>'
      : '<span>' + fmtNum(current) + ' / ' + fmtNum(limit) + '</span>';
    return '<div class="limit-row"><span>' + esc(label) + '</span>' + valueHtml + limitBar(current, limit) +
      '<div class="limit-row__meta"><span class="limit-row__pill ' + status.cls + '">' + esc(status.text) + '</span>' +
      (pctText ? '<span>' + esc(pctText) + '</span>' : "") +
      (opts.hint ? '<span>' + esc(opts.hint) + '</span>' : "") +
      '</div></div>';
  }

  function addonLabel(addon) {
    if (!addon) return "";
    return addon.name || addon.label || addon.addon_key || addon.key || addon;
  }

  function addonRow(addons) {
    if (!addons || !addons.length) {
      return '<div class="limit-row"><span>Aktive Add-ons</span><span>Keine</span><div class="limit-row__meta"><span>Zusatzmodule koennen im individuellen Tarif aktiviert werden.</span></div></div>';
    }
    return '<div class="limit-row"><span>Aktive Add-ons</span><span>' + fmtNum(addons.length) + '</span>' +
      '<div class="addon-chip-row">' + addons.map(function (a) { return '<span class="addon-chip">' + esc(addonLabel(a)) + '</span>'; }).join("") + '</div></div>';
  }

  function hasTightQuota(metrics) {
    return metrics.some(function (m) {
      if (!m || m.limit === -1 || m.limit == null || m.limit <= 0) return false;
      return (Number(m.current || 0) / Number(m.limit)) >= 0.8;
    });
  }

  function renderLimits() {
    var host = $("accountLimitsBlock");
    if (!host) return;
    var ent = state.entitlements;
    if (!ent) { host.innerHTML = '<h3>Limits &amp; Nutzung</h3><div class="empty-block">Bitte einloggen.</div>'; return; }
    var limits = ent.limits || {};
    var usage = ent.usage || {};
    var metrics = {
      requestsSend: usageMetric(usage, "requests_send", limits.plan_max_requests_send),
      requestsReceive: usageMetric(usage, "requests_receive", limits.plan_max_requests_receive),
      listings: usageMetric(usage, "listings", limits.plan_max_listings),
      users: usageMetric(usage, "users", limits.plan_max_users),
      sites: usageMetric(usage, "sites", limits.plan_max_sites),
      suppliers: usageMetric(usage, "suppliers", limits.plan_max_suppliers),
      multiOrgSlots: usageMetric(usage, "multi_org_slots", limits.plan_max_multi_org_slots)
    };
    var tight = hasTightQuota(Object.values(metrics));
    var upgradeText = tight
      ? "Eine oder mehrere Quoten sind knapp oder erreicht. Upgrade bzw. individuelle Erweiterung anfragen."
      : "Mehr Nutzer, Standorte, Lieferanten oder Add-ons benoetigt? Quoten koennen erweitert werden.";

    host.innerHTML =
      '<h3>Limits &amp; Nutzung</h3>' +
      limitRow("Nutzer", metrics.users.current, metrics.users.limit, { hint: "Hard-Limit bei Downgrade" }) +
      limitRow("Standorte", metrics.sites.current, metrics.sites.limit) +
      limitRow("Lieferanten / Vendoren", metrics.suppliers.current, metrics.suppliers.limit) +
      limitRow("Multi-Org Slots", metrics.multiOrgSlots.current, metrics.multiOrgSlots.limit, { hint: limits.multi_org ? "Multi-Org aktiv" : "" }) +
      limitRow("Anfragen senden / Monat", metrics.requestsSend.current, metrics.requestsSend.limit) +
      limitRow("Anfragen empfangen / Monat", metrics.requestsReceive.current, metrics.requestsReceive.limit) +
      limitRow("Aktive Listings", metrics.listings.current, metrics.listings.limit) +
      '<div class="limit-row"><span>Worker pro Anfrage</span><span>' + esc(fmtLimitValue(limits.max_workers_per_request)) + '</span></div>' +
      '<div class="limit-row"><span>Notdienst</span><span>' + (limits.notdienst ? "Verfuegbar" : "\u2013") + '</span></div>' +
      '<div class="limit-row"><span>SLA-Stufe</span><span>' + esc(limits.sla_level || "none") + '</span></div>' +
      (limits.seats_included != null
        ? '<div class="limit-row"><span>Seats inklusive</span><span>' + fmtNum(limits.seats_included) + (limits.extra_seat_cents ? ' (+ ' + fmtCents(limits.extra_seat_cents) + ' / extra Seat)' : "") + '</span></div>'
        : "") +
      addonRow(ent.active_addons || []) +
      '<div class="quota-upgrade-card"><span>' + esc(upgradeText) + '</span><button type="button" class="ds-btn ds-btn--sm ds-btn--primary" onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.requestUpgrade(\'INDIVIDUELL\')">Upgrade / Erweiterung anfragen</button></div>';
  }

  /* ── Aktionen ─────────────────────────────────────────────── */

  function actionButton(label, action, plan, opts) {
    opts = opts || {};
    var classes = "ds-btn" + (opts.primary ? " ds-btn--primary" : "");
    var styleValue = opts.danger ? "background:rgba(255,92,122,.12);border-color:rgba(255,92,122,.3);color:#ffd0d8" : "";
    if (opts.disabled || state.actionBusy) {
      var disabledStyle = styleValue ? styleValue + ";opacity:.6" : "opacity:.6";
      return '<button type="button" class="' + classes + '" disabled style="' + disabledStyle + '">' + esc(label) + (opts.disabledHint ? ' &mdash; ' + esc(opts.disabledHint) : "") + '</button>';
    }
    var planArg = plan ? ("'" + esc(plan) + "'") : "";
    var styleAttr = styleValue ? ' style="' + styleValue + '"' : "";
    return '<button type="button" class="' + classes + '"' + styleAttr + ' onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.' + action + '(' + planArg + ')">' + esc(label) + '</button>';
  }

  function canUseCustomerPortal() {
    return !!(state.paymentConfig &&
      state.paymentConfig.stripe_customer_portal_enabled &&
      state.paymentConfig.stripe_customer_portal_endpoint);
  }

  function requestUpgrade(plan) {
    plan = String(plan || "INDIVIDUELL").toUpperCase();
    if (hasOpenRequest(["upgrade", "new_individual", "pilot"])) {
      setNotice("warn", "Es gibt bereits eine offene Upgrade-/Tarif-Anfrage.");
      renderAll();
      return Promise.resolve(false);
    }
    state.actionBusy = "upgrade";
    setNotice("info", "Upgrade-Anfrage wird gesendet ...");
    renderActions();
    var payload = accountPayloadBase("Upgrade aus sla_abo Account-Management: " + ((state.entitlements && state.entitlements.effective_plan) || "DEMO") + " -> " + plan);
    payload.desired_plan = plan;
    if (plan === "INDIVIDUELL") payload.desired_individual_tier = (state.entitlements && state.entitlements.individual_tier) || null;
    return apiMutation("/api/subscription-requests/upgrade", payload).then(function () {
      state.actionBusy = null;
      return refreshAfterMutation("Upgrade-Anfrage wurde erstellt. Status und Dokumente wurden aktualisiert.");
    }).catch(function (e) {
      state.actionBusy = null;
      setNotice("error", actionErrorMessage(e, "Upgrade-Anfrage konnte nicht erstellt werden."));
      return loadAll().then(function () { renderAll(); return false; });
    });
  }

  function requestDowngrade(plan) {
    plan = String(plan || "").toUpperCase();
    if (!plan) plan = previousPlan((state.entitlements && state.entitlements.effective_plan) || "DEMO");
    if (!plan) {
      setNotice("warn", "Kein gueltiger Zieltarif fuer Downgrade verfuegbar.");
      renderActions();
      return Promise.resolve(false);
    }
    if (hasOpenRequest("downgrade")) {
      setNotice("warn", "Es gibt bereits eine offene Downgrade-Anfrage.");
      renderAll();
      return Promise.resolve(false);
    }
    state.actionBusy = "downgrade";
    setNotice("info", "Downgrade-Anfrage wird gesendet ...");
    renderActions();
    var payload = {
      desired_plan: plan,
      acknowledge_impact: true,
      expected_start_date: defaultExpectedStartDate(),
      message: "Downgrade aus sla_abo Account-Management; Impact-Hinweise im UI bestaetigt."
    };
    return apiMutation("/api/subscription-requests/downgrade", payload).then(function () {
      state.actionBusy = null;
      return refreshAfterMutation("Downgrade-Anfrage wurde erstellt. Status und Dokumente wurden aktualisiert.");
    }).catch(function (e) {
      state.actionBusy = null;
      setNotice("error", actionErrorMessage(e, "Downgrade-Anfrage konnte nicht erstellt werden."));
      return loadAll().then(function () { renderAll(); return false; });
    });
  }

  function requestCancellation() {
    if (hasOpenRequest("cancellation")) {
      setNotice("warn", "Es gibt bereits eine offene Kuendigungsanfrage.");
      renderAll();
      return Promise.resolve(false);
    }
    state.actionBusy = "cancellation";
    setNotice("info", "Kuendigungsanfrage wird gesendet ...");
    renderActions();
    var sub = state.entitlements && state.entitlements.subscription ? state.entitlements.subscription : {};
    var date = sub.current_period_end || sub.cancel_at || null;
    var payload = {
      cancellation_effective_at: date ? String(date).slice(0, 10) : null,
      reason: "Kuendigung aus sla_abo Account-Management"
    };
    return apiMutation("/api/subscription-requests/cancellation", payload).then(function () {
      state.actionBusy = null;
      return refreshAfterMutation("Kuendigungsanfrage wurde erstellt. Status und Dokumente wurden aktualisiert.");
    }).catch(function (e) {
      state.actionBusy = null;
      setNotice("error", actionErrorMessage(e, "Kuendigungsanfrage konnte nicht erstellt werden."));
      return loadAll().then(function () { renderAll(); return false; });
    });
  }

  function openCustomerPortal() {
    if (!canUseCustomerPortal()) {
      setNotice("warn", "Zahlungsmethoden-Self-Service ist fuer diesen Account noch nicht verfuegbar.");
      renderActions();
      return Promise.resolve(false);
    }
    state.actionBusy = "portal";
    setNotice("info", "Stripe Customer Portal wird geoeffnet ...");
    renderActions();
    return apiMutation(state.paymentConfig.stripe_customer_portal_endpoint, {
      return_url: window.location.origin + "/public/sla_abo.html"
    }).then(function (payload) {
      var url = payload && payload.data && payload.data.url ? payload.data.url : payload && payload.url;
      if (!url) throw new Error("PORTAL_URL_MISSING");
      window.location.href = url;
      return true;
    }).catch(function (e) {
      state.actionBusy = null;
      setNotice("error", actionErrorMessage(e, "Customer Portal konnte nicht geoeffnet werden."));
      renderActions();
      return false;
    });
  }

  function renderActions() {
    var host = $("accountActionsBlock");
    if (!host) return;
    var ent = state.entitlements;
    if (!ent) { host.innerHTML = '<h3>Aktionen</h3>' + noticeHtml() + '<div class="empty-block">Bitte einloggen.</div>'; return; }

    var sub = ent.subscription || {};
    var currentPlan = ent.effective_plan || "DEMO";
    var pendingUpgrade = pendingByType("upgrade") || pendingByType("new_individual");
    var pendingDowngrade = pendingByType("downgrade");
    var pendingCancellation = pendingByType("cancellation");
    var upgradeTarget = nextPlan(currentPlan);
    var downgradeTarget = previousPlan(currentPlan);

    var actions = [];

    if (pendingUpgrade) {
      actions.push('<button type="button" class="ds-btn" disabled style="opacity:.6">Upgrade-Anfrage offen (' + esc(pendingUpgrade.status) + ')</button>');
    } else {
      if (upgradeTarget) {
        actions.push(actionButton("Upgrade auf " + upgradeTarget + " anfragen", "requestUpgrade", upgradeTarget, { primary: true }));
      }
      actions.push(actionButton(currentPlan === "INDIVIDUELL" ? "Individuelles Angebot anpassen" : "Auf Individuell upgraden", "requestUpgrade", "INDIVIDUELL", { primary: !upgradeTarget }));
    }

    if (pendingDowngrade) {
      actions.push('<button type="button" class="ds-btn" disabled style="opacity:.6">Downgrade-Anfrage offen (' + esc(pendingDowngrade.status) + ')</button>');
    } else if (currentPlan !== "DEMO" && downgradeTarget) {
      actions.push(actionButton("Downgrade auf " + downgradeTarget + " anfragen", "requestDowngrade", downgradeTarget));
    }

    if (pendingCancellation || sub.status === "canceling") {
      var hint = pendingCancellation ? "Anfrage offen (" + pendingCancellation.status + ")" : "Vorgemerkt zum " + fmtDate(sub.cancel_at);
      actions.push('<button type="button" class="ds-btn" disabled style="opacity:.6">Kuendigung &mdash; ' + esc(hint) + '</button>');
    } else if (currentPlan !== "DEMO" && sub.status !== "canceled") {
      actions.push(actionButton("Kuendigung anfragen", "requestCancellation", null, { danger: true }));
    }

    if (canUseCustomerPortal()) {
      actions.push(actionButton("Zahlungsmethoden verwalten", "openCustomerPortal", null));
    }

    if (!actions.length) {
      host.innerHTML = '<h3>Aktionen</h3>' + noticeHtml() + '<div class="empty-block">Aktuell sind keine Tarif-Aenderungen verfuegbar.</div>';
      return;
    }

    host.innerHTML = '<h3>Aktionen</h3>' +
      noticeHtml() +
      '<div class="action-row">' + actions.join("") + '</div>' +
      '<div style="margin-top:var(--ds-space-3);font-size:11px;color:var(--ds-text-tertiary)">' +
        'Abo-Aenderungen werden direkt als Subscription-Request angelegt und durch das Tarif-Team freigegeben. Zahlungshistorie bleibt separat unten.' +
        (state.paymentConfig && state.paymentConfig.stripe_enabled && !canUseCustomerPortal() ? ' Zahlungsmethoden-Self-Service ist noch nicht verfuegbar.' : '') +
      '</div>';
  }

  /* ── Features (aktiv / Add-on / gesperrt / pending) ──────── */

  function featureCell(f, opts) {
    opts = opts || {};
    var cls = ["feature-cell"];
    if (opts.addon) cls.push("feature-cell--addon");
    else if (opts.pending) cls.push("feature-cell--pending");
    else if (f.allowed) cls.push("feature-cell--ok");
    else cls.push("feature-cell--locked");
    var featureAttr = f.key ? ' data-feature-key="' + esc(f.key) + '"' : "";
    var sub = "";
    if (opts.addon) sub = '<span class="feature-cell__sub">Add-on aktiv</span>';
    else if (opts.pending) sub = '<span class="feature-cell__sub">Anfrage beim Tarif-Team</span>';
    else if (f.maturity_locked) sub = '<span class="feature-cell__sub">Noch nicht freigegeben</span>';
    else if (!f.allowed) sub = '<span class="feature-cell__sub">Upgrade noetig</span>';
    return '<div class="' + cls.join(" ") + '"' + featureAttr + '>' +
      '<span class="feature-cell__dot"></span>' +
      '<div><strong>' + esc(f.name || f.key) + '</strong>' + sub + '</div>' +
    '</div>';
  }

  function renderFeatures() {
    var host = $("accountFeaturesBlock");
    if (!host) return;
    var ent = state.entitlements;
    if (!ent || !ent.features) {
      host.innerHTML = '<h3>Aktive und gesperrte Features</h3><div class="empty-block">Bitte einloggen.</div>';
      return;
    }
    var _addonKeys = (ent.active_addons || []).reduce(function (acc, a) { acc[a.key] = a; return acc; }, {});
    var pendingFeatureKeys = {};
    requestList().forEach(function (r) {
      var arr = Array.isArray(r.desired_features) ? r.desired_features : [];
      arr.forEach(function (k) { pendingFeatureKeys[k] = r; });
    });

    // Catalog liefert visible_in_subscription via FEATURE_CATALOG; entitlements
    // hat features-Map keyed by feature_key. Wir mergen mit catalog-Reihenfolge.
    var catalogFeatures = (state.catalog && Array.isArray(state.catalog.features)) ? state.catalog.features : [];
    var featuresList = catalogFeatures.length
      ? catalogFeatures.map(function (cf) {
          var ef = ent.features[cf.feature_key] || { key: cf.feature_key, name: cf.name, allowed: false };
          return Object.assign({}, ef, { name: cf.name, category: cf.category, sort_order: cf.sort_order });
        })
      : Object.values(ent.features);

    var active = featuresList.filter(function (f) { return f.allowed; });
    var addons = (ent.active_addons || []);
    var locked = featuresList.filter(function (f) { return !f.allowed; });

    var html = "";
    html += '<h3>Aktive Features <span style="font-weight:500;color:var(--ds-text-secondary);font-size:13px">(' + active.length + ')</span></h3>';
    html += active.length
      ? '<div class="feature-matrix">' + active.map(function (f) { return featureCell(f); }).join("") + '</div>'
      : '<div class="empty-block">Keine Features aktiv. Tarif waehlen oder Pilot anfragen.</div>';

    if (addons.length) {
      html += '<h3 style="margin-top:var(--ds-space-4)">Aktive Add-ons</h3>';
      html += '<div class="feature-matrix">' + addons.map(function (a) { return featureCell({ name: a.name, allowed: true }, { addon: true }); }).join("") + '</div>';
    }

    if (locked.length) {
      html += '<h3 style="margin-top:var(--ds-space-4)">Gesperrt &mdash; mit Upgrade verfuegbar</h3>';
      html += '<div class="feature-matrix">' + locked.map(function (f) {
        return featureCell(f, { pending: !!pendingFeatureKeys[f.key] });
      }).join("") + '</div>';
    }

    host.innerHTML = html;
  }

  /* ── Pending Subscription-Anfragen ───────────────────────── */

  function renderPending() {
    var host = $("accountPendingBlock");
    if (!host) return;
    if (!state.entitlements) {
      host.innerHTML = '<h3>Offene Anfragen</h3><div class="empty-block">Bitte einloggen.</div>';
      return;
    }
    var pending = requestList();
    if (state.requestsError) {
      host.innerHTML = '<h3>Offene Anfragen</h3><div class="account-error">Offene Anfragen konnten nicht geladen werden. <button type="button" class="ds-btn ds-btn--sm" onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.refresh()">Erneut versuchen</button></div>';
      return;
    }
    if (!pending.length) {
      host.innerHTML = '<h3>Offene Anfragen</h3><div class="empty-block">Aktuell keine offene Anfrage. Sie koennen jederzeit eine neue Aenderung anfragen.</div>';
      return;
    }
    host.innerHTML = '<h3>Offene Anfragen <span style="font-weight:500;color:var(--ds-text-secondary);font-size:13px">(' + pending.length + ')</span></h3>' +
      pending.map(function (r) {
        return '<div class="pending-card">' +
          '<div class="pending-card__head">' +
            '<span>' + esc(r.request_type) + '</span>' +
            '<span class="account-status__pill account-status__pill--warn">' + esc(r.status) + '</span>' +
            (r.desired_plan ? '<span class="account-status__pill account-status__pill--info">' + esc(r.desired_plan) + '</span>' : "") +
          '</div>' +
          '<div class="pending-card__sub">' +
            'erstellt ' + esc(fmtDate(r.created_at)) +
            (r.expected_start_date ? ' \u00b7 erwarteter Start ' + esc(fmtDate(r.expected_start_date)) : "") +
            (r.desired_individual_tier ? ' \u00b7 Tier ' + esc(r.desired_individual_tier) : "") +
          '</div>' +
        '</div>';
      }).join("");
  }

  /* ── Rechnungen (/api/invoices — WAVE_09) ────────────────── */

  function invoiceStatusStyle(status) {
    if (status === "paid") return "color:var(--ds-success)";
    if (status === "overdue") return "color:var(--ds-error)";
    if (status === "refunded") return "color:var(--ds-warning)";
    if (status === "void") return "color:var(--ds-text-tertiary)";
    return "color:var(--ds-text-secondary)";
  }

  function invoiceStatusLabel(status) {
    var map = {
      draft: "Entwurf",
      pending: "Ausstehend",
      paid: "Bezahlt",
      overdue: "Ueberfaellig",
      refunded: "Rueckgebucht",
      void: "Storniert"
    };
    return map[status] || status || "–";
  }

  function renderInvoices() {
    var host = $("accountInvoicesBlock");
    if (!host) return;
    if (!state.entitlements) {
      host.innerHTML = '<h3>Rechnungen</h3><div class="empty-block">Bitte einloggen.</div>';
      return;
    }
    if (state.invoicesError) {
      host.innerHTML = '<h3>Rechnungen</h3><div class="account-error">Rechnungen konnten nicht geladen werden. <button type="button" class="ds-btn ds-btn--sm" onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.refresh()">Erneut versuchen</button></div>';
      return;
    }
    var rows = state.invoices || [];
    if (!rows.length) {
      host.innerHTML = '<h3>Rechnungen</h3><div class="empty-block">Noch keine Rechnungen vorhanden. Rechnungen werden nach der ersten Abo-Aktivierung erzeugt.</div>';
      return;
    }
    var html = '<h3>Rechnungen <span style="font-weight:500;color:var(--ds-text-secondary);font-size:13px">(' + rows.length + ')</span></h3>' +
      '<table class="history-table"><thead><tr>' +
        '<th>Rechnungsnr.</th><th>Datum</th><th>Plan</th><th>Betrag (brutto)</th><th>Status</th><th>Download</th>' +
      '</tr></thead><tbody>';
    rows.slice(0, 20).forEach(function (r) {
      var totalEur = r.total_cents != null
        ? (Number(r.total_cents) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR"
        : "–";
      var downloadUrl = "/api/invoices/" + encodeURIComponent(r.id) + "?format=html";
      var pdfUrl = "/api/invoices/" + encodeURIComponent(r.id) + "?format=pdf";
      html += '<tr>' +
        '<td style="font-family:monospace;font-size:12px">' + esc(r.invoice_number || r.id.slice(0, 8) + "…") + '</td>' +
        '<td>' + esc(fmtDate(r.issued_at || r.created_at)) + '</td>' +
        '<td>' + esc(r.plan || "–") + '</td>' +
        '<td style="font-variant-numeric:tabular-nums">' + esc(totalEur) + '</td>' +
        '<td style="' + invoiceStatusStyle(r.status) + '">' + esc(invoiceStatusLabel(r.status)) + '</td>' +
        '<td><a class="ds-btn ds-btn--sm" href="' + esc(downloadUrl) + '" target="_blank" rel="noopener">Anzeigen</a> <a class="ds-btn ds-btn--sm ds-btn--primary" href="' + esc(pdfUrl) + '">PDF</a></td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    if (rows.length > 20) {
      html += '<div style="margin-top:var(--ds-space-2);font-size:12px;color:var(--ds-text-secondary)">Zeige 20 von ' + rows.length + ' Rechnungen.</div>';
    }
    host.innerHTML = html;
  }

  /* ── Dokumente / Tarifunterlagen ─────────────────────────── */

  function documentTypeLabel(type) {
    var map = {
      cost_preview: "Kostenvorschau",
      offer: "Angebot",
      order_confirmation: "Auftragsbestaetigung",
      change_confirmation: "Aenderungsbestaetigung",
      cancellation_confirmation: "Kuendigungsbestaetigung"
    };
    return map[type] || type || "Dokument";
  }

  function statusStyle(status) {
    if (status === "issued") return "color:var(--ds-success)";
    if (status === "superseded") return "color:var(--ds-text-tertiary)";
    if (status === "void") return "color:var(--ds-error)";
    return "color:var(--ds-warning)";
  }

  function renderDocuments() {
    var host = $("accountDocumentsBlock");
    if (!host) return;
    if (!state.entitlements) {
      host.innerHTML = '<h3>Dokumente &amp; Tarifunterlagen</h3><div class="empty-block">Bitte einloggen.</div>';
      return;
    }
    var rows = state.documents || [];
    if (state.documentsError) {
      host.innerHTML = '<h3>Dokumente &amp; Tarifunterlagen</h3><div class="account-error">Dokumente konnten nicht geladen werden. <button type="button" class="ds-btn ds-btn--sm" onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.refreshDocuments()">Erneut versuchen</button></div>';
      return;
    }
    if (!rows.length) {
      host.innerHTML = '<h3>Dokumente &amp; Tarifunterlagen</h3><div class="empty-block">Noch keine Tarif-/Vertragsdokumente verfuegbar. Rechnungen bleiben separat in der Zahlungshistorie.</div>';
      return;
    }
    var html = '<h3>Dokumente &amp; Tarifunterlagen <button type="button" class="ds-btn ds-btn--sm" style="margin-left:8px" onclick="window.TC && window.TC.accountSubscription && window.TC.accountSubscription.refreshDocuments()">Aktualisieren</button></h3>' +
      '<table class="history-table"><thead><tr><th>Typ</th><th>Datum</th><th>Status</th><th>Betrag</th><th>Download</th></tr></thead><tbody>';
    rows.slice(0, 10).forEach(function (r) {
      var downloadUrl = "/api/subscription-documents/" + encodeURIComponent(r.id) + "/download";
      html += '<tr><td>' + esc(documentTypeLabel(r.document_type)) + (r.document_number ? '<div style="font-size:11px;color:var(--ds-text-tertiary)">' + esc(r.document_number) + '</div>' : "") + '</td>' +
        '<td>' + esc(fmtDate(r.issued_at || r.created_at || r.effective_from)) + '</td>' +
        '<td style="' + statusStyle(r.status) + '">' + esc(r.status || "issued") + '</td>' +
        '<td>' + esc(fmtCents(r.total_cents)) + '</td>' +
        '<td><a class="ds-btn ds-btn--sm" href="' + esc(downloadUrl) + '" target="_blank" rel="noopener">Download</a></td></tr>';
    });
    html += '</tbody></table>';
    if (rows.length > 10) {
      html += '<div style="margin-top:var(--ds-space-2);font-size:12px;color:var(--ds-text-secondary)">Zeige 10 von ' + rows.length + ' Dokumenten.</div>';
    }
    host.innerHTML = html;
  }

  /* ── Boot ─────────────────────────────────────────────────── */
  window.TC = window.TC || {};
  window.TC.accountSubscription = {
    refresh: function () { return loadAll().then(renderAll); },
    refreshDocuments: function () { return loadAll().then(function () { renderInvoices(); renderDocuments(); renderPending(); renderActions(); }); },
    requestUpgrade: requestUpgrade,
    requestDowngrade: requestDowngrade,
    requestCancellation: requestCancellation,
    openCustomerPortal: openCustomerPortal
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
