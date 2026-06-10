/* ratingModal.js — Wiederverwendbares zweiseitiges Bewertungssystem.
 * Bewerten ist NUR nach einem abgeschlossenen (FINALIZED) Deal moeglich — das Backend
 * erzwingt das hart (Teilnehmer-Check, status=FINALIZED, 30-Tage-Fenster, kein Doppel).
 * Die UI bietet darum gar nichts anderes an: die "Bewerten"-Buttons stammen ausschliesslich
 * aus GET /api/ratings/pending (= die rateable Deals des Users).
 *
 * Exponiert:
 *   TCRating.open({ requestId, partnerName, partnerId, onDone })  — Absende-Modal (4 Achsen + Kommentar)
 *   TCRating.mountPending(containerId, { onAfterSubmit })          — "Offene Bewertungen"-Prompt
 *   TCRating.mountProfile(containerId, userId)                     — Anzeige (Schnitt + letzte Bewertungen)
 */
(function (global) {
  "use strict";
  var API = "/api";
  var AXES = [
    { key: "stars", label: "Gesamt" },
    { key: "reliability", label: "Zuverlaessigkeit" },
    { key: "communication", label: "Kommunikation" },
    { key: "quality", label: "Qualitaet" }
  ];
  var state = { requestId: null, partnerId: null, onDone: null, axes: { stars: 0, reliability: 0, communication: 0, quality: 0 } };

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function toast(kind, title, msg) {
    if (global.TC && global.TC.toast && global.TC.toast[kind]) global.TC.toast[kind](title, msg);
  }
  function starbar(n) {
    n = Math.round(Number(n) || 0);
    var s = "";
    for (var i = 1; i <= 5; i++) s += (i <= n ? "★" : "☆");
    return '<span style="color:var(--ds-warning,#fbbf24);letter-spacing:1px">' + s + '</span>';
  }
  function axval(v) { return v != null ? Number(v).toFixed(1) : "–"; }

  /* ── one-time DOM/CSS injection ────────────────────────── */
  var injected = false;
  function ensureDom() {
    if (injected) return;
    injected = true;
    var css = document.createElement("style");
    css.textContent = [
      ".tcr-overlay{position:fixed;inset:0;background:var(--tc-modal-scrim,rgba(0,0,0,.65));display:none;align-items:center;justify-content:center;z-index:1000;padding:16px}",
      ".tcr-overlay.show{display:flex}",
      ".tcr-panel{background:var(--ds-bg-surface,#131b30);color:var(--ds-text,#eaeff8);border:1px solid var(--ds-border,rgba(255,255,255,.08));border-radius:var(--ds-radius-lg,14px);width:460px;max-width:96vw;max-height:92vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.4)}",
      ".tcr-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tcr-head h2{margin:0;font-size:18px;font-weight:700}",
      ".tcr-x{background:none;border:none;color:var(--ds-text-secondary,#8d9bba);font-size:24px;cursor:pointer;line-height:1}",
      ".tcr-body{padding:20px}",
      ".tcr-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--ds-border,rgba(255,255,255,.08))}",
      ".tcr-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}",
      ".tcr-label{font-size:13px;font-weight:600;color:var(--ds-text-secondary,#8d9bba)}",
      ".tcr-stars{display:inline-flex;gap:4px;font-size:24px;cursor:pointer;user-select:none}",
      ".tcr-star{color:var(--ds-text-tertiary,#5b6b88);transition:color .12s,transform .12s}",
      ".tcr-star:hover{transform:scale(1.15)}",
      ".tcr-star.on{color:var(--ds-warning,#fbbf24)}",
      ".tcr-ta{width:100%;margin-top:8px;padding:10px;border:1px solid var(--ds-border,rgba(255,255,255,.1));border-radius:10px;background:var(--ds-bg,#0a0f1e);color:var(--ds-text,#eaeff8);font:inherit;box-sizing:border-box}",
      ".tcr-btn{padding:9px 16px;border-radius:9px;border:1px solid var(--ds-border,rgba(255,255,255,.14));background:none;color:var(--ds-text,#eaeff8);cursor:pointer;font-weight:600;font-size:13px}",
      ".tcr-btn--primary{background:var(--ds-brand,#4a9eff);border-color:var(--ds-brand,#4a9eff);color:#fff}",
      ".tcr-btn:disabled{opacity:.5;cursor:default}",
      ".tcr-prompt{border:1px solid var(--ds-border,rgba(255,255,255,.08));border-radius:var(--ds-radius-lg,14px);background:var(--ds-bg-surface,#131b30);padding:16px 18px}",
      ".tcr-prompt h3{margin:0 0 4px;font-size:15px;font-weight:700}",
      ".tcr-pitem{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--ds-border,rgba(255,255,255,.06))}",
      ".tcr-rev{padding:12px 0;border-top:1px solid var(--ds-border,rgba(255,255,255,.06))}",
      ".tcr-avg{font-size:30px;font-weight:800;line-height:1}",
      "[data-theme=\"editorial\"] .tcr-panel,[data-theme=\"editorial\"] .tcr-prompt{background:#fffdf6;border-color:#d4cab3}",
      "[data-theme=\"editorial\"] .tcr-ta{background:#faf7ee;border-color:#d4cab3}"
    ].join("");
    document.head.appendChild(css);

    var ov = document.createElement("div");
    ov.className = "tcr-overlay";
    ov.id = "tcr-overlay";
    var axesHtml = "";
    AXES.forEach(function (a) {
      var stars = '<span class="tcr-stars" data-axis="' + a.key + '">';
      for (var i = 1; i <= 5; i++) stars += '<span class="tcr-star" data-v="' + i + '">☆</span>';
      stars += "</span>";
      axesHtml += '<div class="tcr-row"><span class="tcr-label">' + esc(a.label) + "</span>" + stars + "</div>";
    });
    ov.innerHTML =
      '<div class="tcr-panel" role="dialog" aria-modal="true" aria-label="Deal bewerten">' +
        '<div class="tcr-head"><h2>Deal bewerten</h2><button class="tcr-x" data-tcr-close title="Schliessen">&times;</button></div>' +
        '<div class="tcr-body">' +
          '<p id="tcr-partner" style="margin:0 0 14px;color:var(--ds-text-secondary,#8d9bba);font-size:13px"></p>' +
          '<div id="tcr-axes">' + axesHtml + "</div>" +
          '<textarea id="tcr-comment" class="tcr-ta" rows="3" maxlength="500" placeholder="Optionaler Kommentar (max. 500 Zeichen)…"></textarea>' +
          '<div id="tcr-msg" style="font-size:12px;margin-top:8px;min-height:14px"></div>' +
        "</div>" +
        '<div class="tcr-foot"><button class="tcr-btn" data-tcr-close>Abbrechen</button><button class="tcr-btn tcr-btn--primary" id="tcr-send">Bewertung senden</button></div>' +
      "</div>";
    document.body.appendChild(ov);

    ov.addEventListener("click", function (e) {
      var star = e.target.closest ? e.target.closest(".tcr-star") : null;
      if (star && ov.contains(star)) {
        var axisEl = star.parentNode;
        state.axes[axisEl.getAttribute("data-axis")] = parseInt(star.getAttribute("data-v"), 10);
        paintStars(axisEl, parseInt(star.getAttribute("data-v"), 10));
        return;
      }
      if (e.target === ov || (e.target.getAttribute && e.target.getAttribute("data-tcr-close") !== null && e.target.hasAttribute("data-tcr-close"))) close();
    });
    ov.querySelector("#tcr-send").addEventListener("click", submit);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function paintStars(axisEl, v) {
    var stars = axisEl.querySelectorAll(".tcr-star");
    for (var i = 0; i < stars.length; i++) {
      var on = i < v;
      stars[i].textContent = on ? "★" : "☆";
      stars[i].classList.toggle("on", on);
    }
  }
  function resetStars() {
    state.axes = { stars: 0, reliability: 0, communication: 0, quality: 0 };
    var host = document.getElementById("tcr-axes");
    if (host) Array.prototype.forEach.call(host.querySelectorAll(".tcr-stars"), function (el) { paintStars(el, 0); });
  }

  function open(opts) {
    opts = opts || {};
    ensureDom();
    state.requestId = opts.requestId || null;
    state.partnerId = opts.partnerId || null;
    state.onDone = typeof opts.onDone === "function" ? opts.onDone : null;
    resetStars();
    document.getElementById("tcr-comment").value = "";
    document.getElementById("tcr-msg").textContent = "";
    document.getElementById("tcr-partner").textContent = opts.partnerName
      ? ("Ihre Bewertung fuer: " + opts.partnerName)
      : "Ihre Bewertung fuer diesen abgeschlossenen Deal";
    document.getElementById("tcr-send").disabled = false;
    document.getElementById("tcr-overlay").classList.add("show");
  }
  function close() {
    var ov = document.getElementById("tcr-overlay");
    if (ov) ov.classList.remove("show");
  }

  async function getCsrf() {
    try { var r = await fetch(API + "/csrf", { credentials: "include" }); var d = await r.json(); return d.csrfToken || d.token || ""; } catch (e) { return ""; }
  }

  async function submit() {
    var msg = document.getElementById("tcr-msg");
    var a = state.axes;
    if (!a.stars || !a.reliability || !a.communication || !a.quality) {
      msg.style.color = "var(--ds-danger,#f87171)";
      msg.textContent = "Bitte alle vier Bewertungen (1–5 Sterne) vergeben.";
      return;
    }
    if (!state.requestId) { msg.textContent = "Kein Deal-Bezug."; return; }
    var btn = document.getElementById("tcr-send");
    btn.disabled = true;
    msg.style.color = "var(--ds-text-secondary,#8d9bba)";
    msg.textContent = "Senden…";
    try {
      var tok = await getCsrf();
      var r = await fetch(API + "/ratings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": tok },
        body: JSON.stringify({
          request_id: state.requestId, stars: a.stars, reliability: a.reliability,
          communication: a.communication, quality: a.quality,
          comment: (document.getElementById("tcr-comment").value || "").trim() || null
        })
      });
      if (!r.ok) {
        var e = await r.json().catch(function () { return {}; });
        var emap = {
          ALREADY_RATED: "Sie haben diesen Deal bereits bewertet.",
          RATING_WINDOW_EXPIRED: "Das 30-Tage-Bewertungsfenster ist abgelaufen.",
          REQUEST_NOT_FINALIZED: "Dieser Deal ist noch nicht abgeschlossen.",
          NOT_PARTICIPANT: "Sie waren an diesem Deal nicht beteiligt.",
          REQUEST_NOT_FOUND: "Deal wurde nicht gefunden oder wurde entfernt.",
          EMAIL_NOT_VERIFIED: "Bitte bestaetigen Sie zuerst Ihre E-Mail-Adresse.",
          VALIDATION: "Bitte alle Felder korrekt ausfuellen."
        };
        msg.style.color = "var(--ds-danger,#f87171)";
        msg.textContent = emap[e.error] || ("Fehler: " + (e.error || r.status));
        btn.disabled = false;
        return;
      }
      toast("success", "Danke!", "Ihre Bewertung wurde gespeichert.");
      btn.disabled = false;
      close();
      if (state.onDone) state.onDone();
    } catch (e) {
      msg.style.color = "var(--ds-danger,#f87171)";
      msg.textContent = "Netzwerkfehler. Bitte erneut versuchen.";
      btn.disabled = false;
    }
  }

  /* ── "Offene Bewertungen"-Prompt (Deals-Seite) ─────────── */
  async function mountPending(containerId, opts) {
    opts = opts || {};
    var host = document.getElementById(containerId);
    if (!host) return;
    try {
      var r = await fetch(API + "/ratings/pending", { credentials: "include" });
      if (!r.ok) { host.style.display = "none"; return; }
      var rows = await r.json();
      rows = Array.isArray(rows) ? rows : (rows && rows.items) || [];
      if (!rows.length) { host.style.display = "none"; return; }
      ensureDom();
      var html = '<div class="tcr-prompt"><h3>Offene Bewertungen <span style="color:var(--ds-text-secondary,#8d9bba);font-weight:500">(' + rows.length + ")</span></h3>" +
        '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba);margin-bottom:2px">Bewerten Sie Ihre abgeschlossenen Deals – fair und einmalig pro Deal.</div>';
      rows.forEach(function (d, i) {
        var meta = [d.listing_category, d.listing_region].filter(Boolean).join(" · ");
        html += '<div class="tcr-pitem">' +
            "<div><strong>" + esc(d.partner_name || "Partner") + "</strong>" +
              (meta ? '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba)">' + esc(meta) + "</div>" : "") +
            "</div>" +
            '<button class="tcr-btn tcr-btn--primary" data-tcr-idx="' + i + '">Bewerten</button>' +
          "</div>";
      });
      html += "</div>";
      host.innerHTML = html;
      host.style.display = "";
      // Kein User-Wert in Attributen (esc() escaped keine Quotes) -> Lookup ueber Index.
      Array.prototype.forEach.call(host.querySelectorAll("[data-tcr-idx]"), function (b) {
        b.addEventListener("click", function () {
          var d = rows[parseInt(b.getAttribute("data-tcr-idx"), 10)] || {};
          open({
            requestId: d.request_id,
            partnerName: d.partner_name,
            partnerId: d.partner_id,
            onDone: function () { mountPending(containerId, opts); if (typeof opts.onAfterSubmit === "function") opts.onAfterSubmit(); }
          });
        });
      });
    } catch (e) { host.style.display = "none"; }
  }

  /* ── Profil-Anzeige (Schnitt + letzte Bewertungen) ─────── */
  async function mountProfile(containerId, userId) {
    var host = document.getElementById(containerId);
    if (!host || !userId) return;
    try {
      var r = await fetch(API + "/users/" + encodeURIComponent(userId) + "/ratings", { credentials: "include" });
      if (!r.ok) { host.style.display = "none"; return; }
      var data = await r.json();
      var stats = data.stats || {};
      var ratings = data.ratings || [];
      var count = Number(stats.count || 0);
      if (!count) { host.style.display = "none"; return; }
      ensureDom();
      var avg = Number(stats.avg_stars || 0);
      var html = '<div class="tcr-prompt"><h3>Bewertungen</h3>' +
        '<div style="display:flex;align-items:center;gap:16px;margin:8px 0 4px">' +
          '<div class="tcr-avg">' + avg.toFixed(1) + "</div>" +
          "<div>" + starbar(avg) + '<div style="font-size:12px;color:var(--ds-text-secondary,#8d9bba)">' + count + " Bewertung" + (count === 1 ? "" : "en") + "</div></div>" +
          '<div style="margin-left:auto;font-size:12px;color:var(--ds-text-secondary,#8d9bba);text-align:right;line-height:1.6">' +
            "Zuverlaessigkeit " + axval(stats.avg_reliability) + "<br>Kommunikation " + axval(stats.avg_communication) + "<br>Qualitaet " + axval(stats.avg_quality) +
          "</div>" +
        "</div>";
      ratings.slice(0, 5).forEach(function (rv) {
        html += '<div class="tcr-rev">' + starbar(rv.stars) +
          (rv.comment ? '<div style="margin:4px 0;font-size:13px">' + esc(rv.comment) + "</div>" : "") +
          '<div style="font-size:11px;color:var(--ds-text-secondary,#8d9bba)">' + esc(rv.rater_company || "Anonym") + " · " + esc(String(rv.created_at || "").substring(0, 10)) + "</div>" +
        "</div>";
      });
      html += "</div>";
      host.innerHTML = html;
      host.style.display = "";
    } catch (e) { host.style.display = "none"; }
  }

  global.TCRating = { open: open, mountPending: mountPending, mountProfile: mountProfile };
})(window);
