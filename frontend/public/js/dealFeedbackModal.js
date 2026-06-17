/* dealFeedbackModal.js — Deal-Feedback v2 (eBay-modelliert, mutual-blind).
 * Bewerten ist NUR nach einem abgeschlossenen Marktplatz-Deal (assignment 'completed') möglich;
 * das Backend erzwingt Teilnehmer-Check, Fenster, Einmaligkeit. Die "Jetzt bewerten"-Buttons
 * stammen ausschliesslich aus GET /api/deal-feedback/pending. Beidseitig + mutual-blind:
 * das Urteil der Gegenseite wird erst nach beidseitiger Abgabe / Frist sichtbar.
 *
 * Exponiert:
 *   TCDealFeedback.open({ assignmentId, direction, partnerName, onDone })
 *   TCDealFeedback.mountPending(containerId, { onAfterSubmit })
 *   TCDealFeedback.mountOrg(containerId, orgId)
 */
(function (global) {
  "use strict";
  var API = "/api";
  // Rollenabhängige Dimensionen (müssen mit dealFeedbackService.DIMENSION_KEYS übereinstimmen).
  var AXES_BY_DIRECTION = {
    company_to_supplier: [
      { key: "zuverlaessigkeit", label: "Zuverlaessigkeit" },
      { key: "kommunikation", label: "Kommunikation" },
      { key: "qualitaet", label: "Qualitaet" },
      { key: "termintreue", label: "Termintreue" }
    ],
    supplier_to_company: [
      { key: "briefing_klarheit", label: "Briefing-Klarheit" },
      { key: "kommunikation", label: "Kommunikation" },
      { key: "zahlungsmoral", label: "Zahlungsmoral" },
      { key: "fairness", label: "Fairness" }
    ]
  };
  var SENTIMENTS = [
    { key: "positive", label: "Positiv" },
    { key: "neutral", label: "Neutral" },
    { key: "negative", label: "Negativ" }
  ];
  var state = { assignmentId: null, direction: null, onDone: null, sentiment: null, dims: {} };

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function toast(kind, title, msg) { if (global.TC && global.TC.toast && global.TC.toast[kind]) global.TC.toast[kind](title, msg); }
  function sentimentLabel(k) {
    if (k === "positive") return '<span style="color:var(--ds-success,#34d399);font-weight:700">Positiv</span>';
    if (k === "negative") return '<span style="color:var(--ds-danger,#f87171);font-weight:700">Negativ</span>';
    return '<span style="color:var(--ds-text-secondary,#8d9bba);font-weight:700">Neutral</span>';
  }

  var injected = false;
  function ensureDom() {
    if (injected) return;
    injected = true;
    var css = document.createElement("style");
    css.textContent = [
      ".tcdf-overlay{position:fixed;inset:0;background:var(--tc-modal-scrim,rgba(0,0,0,.65));display:none;align-items:center;justify-content:center;z-index:1000;padding:16px}",
      ".tcdf-overlay.show{display:flex}",
      ".tcdf-panel{background:var(--ds-bg-surface,#131b30);color:var(--ds-text,#eaeff8);border:1px solid var(--ds-border,rgba(255,255,255,.08));border-radius:var(--ds-radius-lg,14px);width:480px;max-width:96vw;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.4)}",
      ".tcdf-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tcdf-head h2{margin:0;font-size:18px;font-weight:700}",
      ".tcdf-x{background:none;border:none;color:var(--ds-text-secondary,#8d9bba);font-size:24px;cursor:pointer;line-height:1}",
      ".tcdf-body{padding:20px}",
      ".tcdf-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tcdf-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}",
      ".tcdf-label{font-size:13px;font-weight:600;color:var(--ds-text-secondary,#8d9bba)}",
      ".tcdf-sent{display:inline-flex;gap:8px}",
      ".tcdf-sentbtn{padding:7px 14px;border-radius:9px;border:1px solid var(--ds-border,rgba(255,255,255,.14));background:none;color:var(--ds-text,#eaeff8);cursor:pointer;font-weight:600;font-size:13px}",
      ".tcdf-sentbtn.on[data-s=\"positive\"]{background:var(--ds-success,#34d399);border-color:var(--ds-success,#34d399);color:#06281d}",
      ".tcdf-sentbtn.on[data-s=\"neutral\"]{background:var(--ds-text-secondary,#8d9bba);border-color:var(--ds-text-secondary,#8d9bba);color:#0a0f1e}",
      ".tcdf-sentbtn.on[data-s=\"negative\"]{background:var(--ds-danger,#f87171);border-color:var(--ds-danger,#f87171);color:#2a0a0a}",
      ".tcdf-stars{display:inline-flex;gap:4px;font-size:24px;cursor:pointer;user-select:none}",
      ".tcdf-star{color:var(--ds-text-tertiary,#5b6b88);transition:color .12s,transform .12s}",
      ".tcdf-star:hover{transform:scale(1.15)}",
      ".tcdf-star.on{color:var(--ds-warning,#fbbf24)}",
      ".tcdf-ta{width:100%;margin-top:8px;padding:10px;border:1px solid var(--ds-border,rgba(255,255,255,.1));border-radius:10px;background:var(--ds-bg,#0a0f1e);color:var(--ds-text,#eaeff8);font:inherit;box-sizing:border-box}",
      ".tcdf-btn{padding:9px 16px;border-radius:9px;border:1px solid var(--ds-border,rgba(255,255,255,.14));background:none;color:var(--ds-text,#eaeff8);cursor:pointer;font-weight:600;font-size:13px}",
      ".tcdf-btn--primary{background:var(--ds-brand,#4a9eff);border-color:var(--ds-brand,#4a9eff);color:#fff}",
      ".tcdf-btn:disabled{opacity:.5;cursor:default}",
      ".tcdf-note{font-size:12px;color:var(--ds-text-secondary,#8d9bba);background:rgba(74,158,255,.08);border:1px solid rgba(74,158,255,.2);border-radius:9px;padding:9px 12px;margin-bottom:14px}",
      ".tcdf-prompt{border:1px solid var(--ds-border,rgba(255,255,255,.08));border-radius:var(--ds-radius-lg,14px);background:var(--ds-bg-surface,#131b30);padding:16px 18px}",
      ".tcdf-prompt h3{margin:0 0 4px;font-size:15px;font-weight:700}",
      ".tcdf-pitem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--ds-border,rgba(255,255,255,.06))}",
      ".tcdf-rev{padding:12px 0;border-top:1px solid var(--ds-border,rgba(255,255,255,.06))}",
      "[data-theme=\"editorial\"] .tcdf-panel,[data-theme=\"editorial\"] .tcdf-prompt{background:#fffdf6;border-color:#d4cab3}",
      "[data-theme=\"editorial\"] .tcdf-ta{background:#faf7ee;border-color:#d4cab3}"
    ].join("");
    document.head.appendChild(css);

    var ov = document.createElement("div");
    ov.className = "tcdf-overlay";
    ov.id = "tcdf-overlay";
    var sentHtml = '<div class="tcdf-sent" id="tcdf-sent">';
    SENTIMENTS.forEach(function (s) { sentHtml += '<button type="button" class="tcdf-sentbtn" data-s="' + s.key + '">' + esc(s.label) + "</button>"; });
    sentHtml += "</div>";
    ov.innerHTML =
      '<div class="tcdf-panel" role="dialog" aria-modal="true" aria-label="Deal bewerten">' +
        '<div class="tcdf-head"><h2>Deal bewerten</h2><button class="tcdf-x" data-tcdf-close title="Schliessen">&times;</button></div>' +
        '<div class="tcdf-body">' +
          '<p id="tcdf-partner" style="margin:0 0 12px;color:var(--ds-text-secondary,#8d9bba);font-size:13px"></p>' +
          '<div class="tcdf-note">Beide Seiten bewerten verdeckt — das Urteil der Gegenseite wird erst sichtbar, wenn beide abgegeben haben (oder nach Ablauf der Frist). Fair und einmalig pro Deal.</div>' +
          '<div class="tcdf-row"><span class="tcdf-label">Gesamteindruck</span>' + sentHtml + "</div>" +
          '<div id="tcdf-axes"></div>' +
          '<textarea id="tcdf-comment" class="tcdf-ta" rows="3" maxlength="500" placeholder="Optionaler Kommentar (max. 500 Zeichen)…"></textarea>' +
          '<div id="tcdf-msg" style="font-size:12px;margin-top:8px;min-height:14px"></div>' +
        "</div>" +
        '<div class="tcdf-foot"><button class="tcdf-btn" data-tcdf-close>Abbrechen</button><button class="tcdf-btn tcdf-btn--primary" id="tcdf-send">Bewertung senden</button></div>' +
      "</div>";
    document.body.appendChild(ov);

    ov.addEventListener("click", function (e) {
      var star = e.target.closest ? e.target.closest(".tcdf-star") : null;
      if (star && ov.contains(star)) {
        var axisEl = star.parentNode;
        state.dims[axisEl.getAttribute("data-axis")] = parseInt(star.getAttribute("data-v"), 10);
        paintStars(axisEl, parseInt(star.getAttribute("data-v"), 10));
        return;
      }
      var sent = e.target.closest ? e.target.closest(".tcdf-sentbtn") : null;
      if (sent && ov.contains(sent)) {
        state.sentiment = sent.getAttribute("data-s");
        Array.prototype.forEach.call(document.querySelectorAll(".tcdf-sentbtn"), function (b) { b.classList.toggle("on", b === sent); });
        return;
      }
      if (e.target === ov || (e.target.getAttribute && e.target.hasAttribute && e.target.hasAttribute("data-tcdf-close"))) close();
    });
    ov.querySelector("#tcdf-send").addEventListener("click", submit);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function paintStars(axisEl, v) {
    var stars = axisEl.querySelectorAll(".tcdf-star");
    for (var i = 0; i < stars.length; i++) { var on = i < v; stars[i].textContent = on ? "★" : "☆"; stars[i].classList.toggle("on", on); }
  }
  function buildAxes(direction) {
    var axes = AXES_BY_DIRECTION[direction] || AXES_BY_DIRECTION.company_to_supplier;
    state.dims = {};
    var host = document.getElementById("tcdf-axes");
    var html = "";
    axes.forEach(function (a) {
      var stars = '<span class="tcdf-stars" data-axis="' + a.key + '">';
      for (var i = 1; i <= 5; i++) stars += '<span class="tcdf-star" data-v="' + i + '">☆</span>';
      stars += "</span>";
      html += '<div class="tcdf-row"><span class="tcdf-label">' + esc(a.label) + "</span>" + stars + "</div>";
    });
    host.innerHTML = html;
  }

  function open(opts) {
    opts = opts || {};
    ensureDom();
    state.assignmentId = opts.assignmentId || null;
    state.direction = opts.direction || "company_to_supplier";
    state.onDone = typeof opts.onDone === "function" ? opts.onDone : null;
    state.sentiment = null;
    buildAxes(state.direction);
    Array.prototype.forEach.call(document.querySelectorAll(".tcdf-sentbtn"), function (b) { b.classList.remove("on"); });
    document.getElementById("tcdf-comment").value = "";
    document.getElementById("tcdf-msg").textContent = "";
    document.getElementById("tcdf-partner").textContent = opts.partnerName
      ? ("Ihre Bewertung fuer: " + opts.partnerName)
      : "Ihre Bewertung fuer diesen abgeschlossenen Deal";
    document.getElementById("tcdf-send").disabled = false;
    document.getElementById("tcdf-overlay").classList.add("show");
  }
  function close() { var ov = document.getElementById("tcdf-overlay"); if (ov) ov.classList.remove("show"); }

  async function getCsrf() {
    try { var r = await fetch(API + "/csrf", { credentials: "include" }); var d = await r.json(); return d.csrfToken || d.token || ""; } catch (e) { return ""; }
  }

  async function submit() {
    var msg = document.getElementById("tcdf-msg");
    var axes = AXES_BY_DIRECTION[state.direction] || [];
    var allRated = axes.every(function (a) { return state.dims[a.key] >= 1; });
    if (!state.sentiment) { msg.style.color = "var(--ds-danger,#f87171)"; msg.textContent = "Bitte einen Gesamteindruck wählen."; return; }
    if (!allRated) { msg.style.color = "var(--ds-danger,#f87171)"; msg.textContent = "Bitte alle Dimensionen (1–5 Sterne) bewerten."; return; }
    if (!state.assignmentId) { msg.textContent = "Kein Deal-Bezug."; return; }
    var btn = document.getElementById("tcdf-send");
    btn.disabled = true;
    msg.style.color = "var(--ds-text-secondary,#8d9bba)";
    msg.textContent = "Senden…";
    try {
      var tok = await getCsrf();
      var r = await fetch(API + "/deal-feedback", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": tok },
        body: JSON.stringify({
          assignment_id: state.assignmentId, sentiment: state.sentiment, dimensions: state.dims,
          comment: (document.getElementById("tcdf-comment").value || "").trim() || null
        })
      });
      if (!r.ok) {
        var e = await r.json().catch(function () { return {}; });
        var emap = {
          ALREADY_RATED: "Sie haben diesen Deal bereits bewertet.",
          WINDOW_CLOSED: "Das Bewertungsfenster ist abgelaufen.",
          NOT_COMPLETED: "Dieser Deal ist noch nicht abgeschlossen.",
          FORBIDDEN: "Sie waren an diesem Deal nicht beteiligt.",
          NOT_FOUND: "Deal nicht gefunden.",
          NO_ORG_CONTEXT: "Kein Organisations-Kontext aktiv.",
          INVALID_DIMENSIONS: "Bitte alle Dimensionen korrekt bewerten.",
          VALIDATION: "Bitte alle Felder korrekt ausfuellen."
        };
        msg.style.color = "var(--ds-danger,#f87171)";
        msg.textContent = emap[e.error] || ("Fehler: " + (e.error || r.status));
        btn.disabled = false;
        return;
      }
      var d = await r.json().catch(function () { return {}; });
      toast("success", "Danke!", d.revealed
        ? "Bewertung abgegeben — beide Seiten sind jetzt sichtbar."
        : "Bewertung verdeckt abgegeben — wird sichtbar, sobald die Gegenseite bewertet hat.");
      btn.disabled = false;
      close();
      if (state.onDone) state.onDone();
    } catch (e) {
      msg.style.color = "var(--ds-danger,#f87171)";
      msg.textContent = "Netzwerkfehler. Bitte erneut versuchen.";
      btn.disabled = false;
    }
  }

  async function mountPending(containerId, opts) {
    opts = opts || {};
    var host = document.getElementById(containerId);
    if (!host) return;
    try {
      var r = await fetch(API + "/deal-feedback/pending", { credentials: "include" });
      if (!r.ok) { host.style.display = "none"; return; }
      var data = await r.json();
      var rows = (data && data.items) || [];
      if (!rows.length) { host.style.display = "none"; return; }
      ensureDom();
      var html = '<div class="tcdf-prompt"><h3>Offene Deal-Bewertungen <span style="color:var(--ds-text-secondary,#8d9bba);font-weight:500">(' + rows.length + ")</span></h3>" +
        '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba);margin-bottom:2px">Bewerten Sie abgeschlossene Deals — beidseitig &amp; verdeckt (mutual-blind).</div>';
      rows.forEach(function (d, i) {
        var partner = d.direction === "company_to_supplier" ? d.supplier_name : d.company_name;
        var when = d.completed_at ? String(d.completed_at).substring(0, 10) : "";
        html += '<div class="tcdf-pitem"><div><strong>' + esc(partner || "Partner") + "</strong>" +
            (when ? '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba)">abgeschlossen ' + esc(when) + "</div>" : "") +
          '</div><button class="tcdf-btn tcdf-btn--primary" data-tcdf-idx="' + i + '">Jetzt bewerten</button></div>';
      });
      html += "</div>";
      host.innerHTML = html;
      host.style.display = "";
      Array.prototype.forEach.call(host.querySelectorAll("[data-tcdf-idx]"), function (b) {
        b.addEventListener("click", function () {
          var d = rows[parseInt(b.getAttribute("data-tcdf-idx"), 10)] || {};
          var partner = d.direction === "company_to_supplier" ? d.supplier_name : d.company_name;
          open({
            assignmentId: d.assignment_id, direction: d.direction, partnerName: partner,
            onDone: function () { mountPending(containerId, opts); if (typeof opts.onAfterSubmit === "function") opts.onAfterSubmit(); }
          });
        });
      });
    } catch (e) { host.style.display = "none"; }
  }

  async function mountOrg(containerId, orgId) {
    var host = document.getElementById(containerId);
    if (!host || !orgId) return;
    try {
      var r = await fetch(API + "/deal-feedback/org/" + encodeURIComponent(orgId), { credentials: "include" });
      if (!r.ok) { host.style.display = "none"; return; }
      var data = await r.json();
      var rows = (data && data.items) || [];
      if (!rows.length) { host.style.display = "none"; return; }
      ensureDom();
      var html = '<div class="tcdf-prompt"><h3>Deal-Bewertungen <span style="color:var(--ds-text-secondary,#8d9bba);font-weight:500">(' + rows.length + ")</span></h3>";
      var sum = (data && data.summary) || {};
      var gradeLabels = { top: "Top-Bewertet", sehr_gut: "Sehr gut", gut: "Gut", solide: "Solide", ausbaufaehig: "Ausbaufaehig", unbewertet: "Neu" };
      if (sum.total) {
        html += '<div style="display:flex;align-items:center;gap:14px;margin:6px 0 12px;flex-wrap:wrap">' +
          '<div style="font-size:26px;font-weight:800;line-height:1;color:var(--ds-success,#34d399)">' + (sum.percent_positive != null ? sum.percent_positive + "%" : "–") + "</div>" +
          '<div><div style="font-weight:700">' + esc(gradeLabels[sum.grade] || "—") + " positiv</div>" +
            '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba)">' + sum.total + " Bewertung" + (sum.total === 1 ? "" : "en") +
              " · " + sum.positive + " positiv / " + sum.neutral + " neutral / " + sum.negative + " negativ</div></div>" +
        "</div>";
      }
      rows.forEach(function (f) {
        var dims = f.dimensions || {};
        var dimLine = Object.keys(dims).map(function (k) { return esc(k) + " " + esc(String(dims[k])); }).join(" · ");
        html += '<div class="tcdf-rev">' + sentimentLabel(f.sentiment) +
          (dimLine ? '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba);margin-top:2px">' + dimLine + "</div>" : "") +
          (f.comment ? '<div style="margin:4px 0;font-size:13px">' + esc(f.comment) + "</div>" : "") +
          (f.reply ? '<div style="margin:4px 0 0 12px;font-size:12px;border-left:2px solid var(--ds-border,rgba(255,255,255,.14));padding-left:8px"><strong>Antwort:</strong> ' + esc(f.reply) + "</div>" : "") +
          '<div style="font-size:11px;color:var(--ds-text-secondary,#8d9bba);margin-top:2px">' + esc(f.rater_org_name || "Partnerorganisation") + " · " + esc(String(f.revealed_at || f.created_at || "").substring(0, 10)) + "</div>" +
        "</div>";
      });
      html += "</div>";
      host.innerHTML = html;
      host.style.display = "";
    } catch (e) { host.style.display = "none"; }
  }

  global.TCDealFeedback = { open: open, mountPending: mountPending, mountOrg: mountOrg };
})(window);
