(function () {
  "use strict";

  if (window.__tcProductAnalyticsInitialized) return;
  window.__tcProductAnalyticsInitialized = true;

  function safeJson(v) {
    try { return JSON.stringify(v); } catch { return "{}"; }
  }

  function sessionId() {
    const key = "tc.analytics.session_id";
    let sid = sessionStorage.getItem(key);
    if (!sid) {
      sid = "tc_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(key, sid);
    }
    return sid;
  }

  function anonId() {
    const key = "tc.analytics.anonymous_id";
    let aid = localStorage.getItem(key);
    if (!aid) {
      aid = "anon_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(key, aid);
    }
    return aid;
  }

  function send(eventName, metadata, options) {
    var opts = options || {};
    if (!eventName || typeof eventName !== "string") return;
    const payload = {
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      session_id: sessionId(),
      anonymous_id: anonId(),
      page_path: location.pathname,
      importance: opts.importance || "normal",
      metadata: metadata || {}
    };
    // Optionale String-Felder nur setzen wenn truthy — verhindert null-Werte
    // die serverseitig bei Zod .optional() (ohne .nullable()) zu 400 fuehren.
    if (opts.flow_key) payload.flow_key = opts.flow_key;
    if (opts.journey_id) payload.journey_id = opts.journey_id;
    if (opts.step_name) payload.step_name = opts.step_name;
    if (opts.route_name) payload.route_name = opts.route_name;
    if (opts.component_name) payload.component_name = opts.component_name;
    if (opts.feature_context) payload.feature_context = opts.feature_context;
    const body = safeJson(payload);
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/track-public", blob);
        return;
      }
    } catch { /* fallback to fetch */ }
    fetch("/api/analytics/track-public", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body
    }).then(function(r) {
      // Analytics is non-critical. Avoid noisy console/errors on expected validation failures.
      if (!r.ok && r.status !== 400) {
        // best-effort: ignore
      }
    }).catch(() => {});
  }

  const FLOW_FROM_PATH = [
    [/capacity_exchange_feed|capacity_exchange/i, "capacity_exchange"],
    [/matching|marketplace/i, "matching"],
    [/enterprise|organization|admin|internal_control_center/i, "enterprise_ops"],
    [/deal|request/i, "deal"],
    [/worker|einsatzportal/i, "worker_portal"],
    [/timesheet/i, "timesheets"],
    [/rate/i, "rate_cards"],
    [/requisition/i, "requisitions"]
  ];

  function inferFlow() {
    const p = location.pathname;
    for (const [re, key] of FLOW_FROM_PATH) {
      if (re.test(p)) return key;
    }
    return "generic";
  }

  function inferCorePageEvent() {
    const p = location.pathname;
    if (/capacity_exchange_feed/i.test(p)) return "capacity_feed_viewed";
    if (/capacity_exchange_detail|capacity_exchange\/[^/]+/i.test(p)) return "capacity_detail_viewed";
    if (/enterprise/i.test(p)) return "enterprise_config_started";
    if (/demo/i.test(p)) return "demo_mode_used";
    if (/timesheet/i.test(p)) return "timesheet_started";
    if (/matching/i.test(p)) return "matching_results_viewed";
    return null;
  }

  function getLastSeen() {
    return Number(localStorage.getItem("tc.analytics.last_seen_at") || 0);
  }
  function setLastSeen() {
    localStorage.setItem("tc.analytics.last_seen_at", String(Date.now()));
  }

  const flow = inferFlow();
  const lastSeen = getLastSeen();
  const inactivityMs = lastSeen ? Date.now() - lastSeen : 0;
  if (!lastSeen || inactivityMs > 30 * 60 * 1000) {
    send("session_started", { inactivity_ms: inactivityMs, entry_path: location.pathname }, { flow_key: flow, importance: "high" });
  } else {
    send("session_resumed", { inactivity_ms: inactivityMs, entry_path: location.pathname }, { flow_key: flow });
  }
  setLastSeen();

  send("page_view", { title: document.title, referrer: document.referrer || null }, { flow_key: flow });
  const coreEvent = inferCorePageEvent();
  if (coreEvent) send(coreEvent, {}, { flow_key: flow });

  let pageStart = Date.now();
  let hiddenStart = null;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      const ms = Math.max(0, Date.now() - pageStart);
      hiddenStart = Date.now();
      send("page_hidden", { visible_ms: ms }, { flow_key: flow });
      send("page_time_spent", { duration_ms: ms }, { flow_key: flow });
    } else {
      if (hiddenStart) {
        send("page_focus", { hidden_ms: Math.max(0, Date.now() - hiddenStart) }, { flow_key: flow });
      }
      pageStart = Date.now();
      hiddenStart = null;
      setLastSeen();
    }
  });

  var trackedScrollBuckets = { 25: false, 50: false, 75: false, 100: false };
  var scrollEnabled = String(window.TC_ANALYTICS_SCROLL_TRACKING || "false").toLowerCase() === "true";
  if (scrollEnabled) {
    window.addEventListener("scroll", function () {
      var height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
      if (height <= 0) return;
      var depth = Math.min(100, Math.round((window.scrollY / height) * 100));
      [25, 50, 75, 100].forEach(function (bucket) {
        if (depth >= bucket && !trackedScrollBuckets[bucket]) {
          trackedScrollBuckets[bucket] = true;
          send("journey_step_viewed", { scroll_depth: bucket }, { flow_key: flow, step_name: "scroll_" + bucket });
        }
      });
    }, { passive: true });
  }

  let clickBuffer = [];
  document.addEventListener("click", function (e) {
    const t = e.target?.closest?.("[data-analytics-event]");
    if (t) {
      send(
        t.getAttribute("data-analytics-event"),
        { cta: t.tagName, label: (t.textContent || "").trim().slice(0, 80) },
        { flow_key: flow, feature_context: t.getAttribute("data-feature-context") || null }
      );
    }

    const now = Date.now();
    const x = e.clientX;
    const y = e.clientY;
    clickBuffer = clickBuffer.filter((c) => now - c.t < 1200);
    clickBuffer.push({ t: now, x, y });
    const local = clickBuffer.filter((c) => Math.abs(c.x - x) < 24 && Math.abs(c.y - y) < 24);
    if (local.length >= 4) {
      send("rage_click_detected", { x, y, clicks: local.length }, { flow_key: flow });
      clickBuffer = [];
    }
  }, true);

  document.querySelectorAll("form").forEach((form) => {
    let started = false;
    const formName = form.getAttribute("id") || form.getAttribute("name") || "form";
    form.addEventListener("input", function () {
      if (started) return;
      started = true;
      send("form_started", { form: formName }, { flow_key: flow });
    });
    form.addEventListener("submit", function () {
      send("form_submitted", { form: formName }, { flow_key: flow });
      send("form_completed", { form: formName }, { flow_key: flow });
      started = false;
    });
    window.addEventListener("beforeunload", function () {
      if (started) send("form_abandoned", { form: formName }, { flow_key: flow });
    });
  });

  window.addEventListener("beforeunload", function () {
    send("page_exit", { exit_path: location.pathname }, { flow_key: flow });
    send("session_ended", { exit_path: location.pathname }, { flow_key: flow });
    setLastSeen();
  });

  function currentJourneyId(flowName) {
    return sessionStorage.getItem("tc.analytics.journey." + flowName) || null;
  }

  function setJourneyId(flowName, journeyId) {
    sessionStorage.setItem("tc.analytics.journey." + flowName, journeyId);
  }

  function clearJourneyId(flowName) {
    sessionStorage.removeItem("tc.analytics.journey." + flowName);
  }

  var replayConsent = localStorage.getItem("tc.analytics.replay.consent") || "unknown";

  window.TC = window.TC || {};
  window.TC.analytics = {
    track: function (name, metadata, options) {
      send(name, metadata || {}, options || { flow_key: flow });
    },
    pageView: function (meta) {
      send("page_view", meta || {}, { flow_key: flow });
    },
    identifyContext: function (ctx) {
      send("journey_step_viewed", { reason: "identify_context", label: String((ctx && ctx.label) || "context") }, { flow_key: flow });
    },
    startJourney: function (flowName, context) {
      var jid = "j_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      setJourneyId(flowName, jid);
      send("journey_started", context || {}, { flow_key: flowName, journey_id: jid, step_name: "start", importance: "high" });
      return jid;
    },
    stepJourney: function (flowName, stepName, context) {
      var jid = currentJourneyId(flowName);
      send("journey_step_completed", context || {}, { flow_key: flowName, journey_id: jid, step_name: stepName || "step" });
    },
    completeJourney: function (flowName, context) {
      var jid = currentJourneyId(flowName);
      send("journey_step_completed", Object.assign({ result: "completed" }, context || {}), { flow_key: flowName, journey_id: jid, step_name: "completed", importance: "high" });
      clearJourneyId(flowName);
    },
    abandonJourney: function (flowName, reason) {
      var jid = currentJourneyId(flowName);
      send("journey_abandoned", { reason: reason || "unknown" }, { flow_key: flowName, journey_id: jid, step_name: "abandoned", importance: "high" });
      clearJourneyId(flowName);
    },
    formStarted: function (formName, meta) {
      send("form_started", Object.assign({ form: formName || "form" }, meta || {}), { flow_key: flow });
    },
    formCompleted: function (formName, meta) {
      send("form_completed", Object.assign({ form: formName || "form" }, meta || {}), { flow_key: flow });
    },
    formAbandoned: function (formName, meta) {
      send("form_abandoned", Object.assign({ form: formName || "form" }, meta || {}), { flow_key: flow });
    },
    trackRageClick: function (meta) {
      send("rage_click_detected", meta || {}, { flow_key: flow });
    },
    trackTiming: function (name, ms, meta) {
      send(name || "page_time_spent", Object.assign({ duration_ms: Math.max(0, Number(ms) || 0) }, meta || {}), { flow_key: flow });
    },
    setReplayConsent: function (status) {
      replayConsent = (status === "granted" || status === "denied") ? status : "unknown";
      localStorage.setItem("tc.analytics.replay.consent", replayConsent);
    },
    enableReplayAdapterIfAllowed: function () {
      if (replayConsent !== "granted") return;
      initReplayAdapter();
    }
  };

  function initReplayAdapter() {
    fetch("/api/analytics/provider-config", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg?.data || cfg.data.provider !== "posthog" || !cfg.data.posthog?.apiKey) return;
        if (window.posthog) return;
        var script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/posthog-js@1.196.0/dist/module.no-external.js";
        script.async = true;
        script.onload = function () {
          try {
            window.posthog.init(cfg.data.posthog.apiKey, {
              api_host: cfg.data.posthog.apiHost,
              person_profiles: "identified_only",
              session_recording: { maskAllInputs: true, maskTextSelector: "input,textarea,[contenteditable='true']" },
              autocapture: false,
              capture_pageview: false
            });
            window.posthog.capture("tempconnect_session_recording_enabled", { path: location.pathname });
            send("journey_step_viewed", { reason: "replay_enabled", consent: replayConsent }, { flow_key: flow });
          } catch { /* do nothing */ }
        };
        document.head.appendChild(script);
      })
      .catch(function () {});
  }

  if (replayConsent === "granted") initReplayAdapter();
})();
