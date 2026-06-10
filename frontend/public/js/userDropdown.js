/**
 * userDropdown.js — Profile dropdown for topbar.
 * Mounts onto the static #tc-user-profile button already in the HTML.
 * Fetches /api/me -> populates dropdown with Name, Email, Plan, Rolle.
 */
(function () {
  "use strict";

  var ROLE_LABELS = {
    agency: "Zeitarbeitsfirma",
    company: "Unternehmen",
    worker: "Worker",
    admin: "Admin"
  };

  var PLAN_COLORS = {
    DEMO: "#8d9bba",
    FREE: "#8d9bba",
    BASIS: "#4a9eff",
    PLUS: "#34d399",
    PRO: "#a855f7",
    ENTERPRISE: "#f43f5e"
  };

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function init() {
    var wrap    = document.getElementById("tc-user-profile");
    var btn     = document.getElementById("tc-user-btn");
    var dd      = document.getElementById("tc-user-dropdown");
    var content = document.getElementById("tc-user-dd-content");
    if (!wrap || !btn || !dd) return;

    /* ── Toggle logic ── */
    var open = false;
    function close() { open = false; dd.style.display = "none"; }
    function toggle() { open = !open; dd.style.display = open ? "block" : "none"; }
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener("click", function (e) { if (open && !wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) close(); });

    /* ── Hover glow ── */
    btn.addEventListener("mouseenter", function () {
      btn.style.borderColor = "rgba(74,158,255,.6)";
      btn.style.boxShadow   = "0 0 0 3px rgba(74,158,255,.12)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.borderColor = "rgba(74,158,255,.35)";
      btn.style.boxShadow   = "none";
    });

    /* ── Fetch user data & populate ── */
    fetch("/api/me", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me) {
          if (content) content.innerHTML =
            '<div style="font-size:13px;color:var(--muted,#8d9bba);padding:4px 0">Nicht eingeloggt</div>' +
            '<a href="/" style="display:block;margin-top:8px;font-size:12px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none;text-align:center">Zum Login &rarr;</a>';
          return;
        }
        populate(btn, content, me);
      })
      .catch(function () {
        if (content) content.innerHTML = '<div style="font-size:13px;color:var(--muted,#8d9bba)">Profil nicht verf\u00fcgbar</div>';
      });
  }

  function populate(btn, container, me) {
    // Update button: show user initial instead of generic icon
    var initial = ((me.first_name || "")[0] || (me.email || "?")[0] || "?").toUpperCase();
    btn.textContent = initial;
    btn.style.fontSize = "14px";

    // Build info
    var name = "";
    if (me.first_name || me.last_name) {
      name = ((me.first_name || "") + " " + (me.last_name || "")).trim();
    } else if (me.name) { name = me.name; }
    var email   = me.email || "\u2013";
    var plan    = me.plan || "DEMO";
    if (plan === "FREE") plan = "DEMO";
    var role    = ROLE_LABELS[me.role] || me.role || "\u2013";
    var orgName = me.company_name || me.org_name || "";
    var planClr = PLAN_COLORS[plan] || PLAN_COLORS.DEMO;

    var h = '<div style="font-size:15px;font-weight:700;margin-bottom:2px">' + esc(name || email) + '</div>';
    if (name) h += '<div style="font-size:12px;color:var(--muted,#8d9bba);margin-bottom:12px">' + esc(email) + '</div>';
    else h += '<div style="margin-bottom:12px"></div>';

    h += '<div style="display:flex;flex-direction:column;gap:8px;font-size:12px">';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted,#8d9bba)">Rolle</span><span style="font-weight:600">' + esc(role) + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted,#8d9bba)">Abo</span><span style="font-weight:700;color:' + planClr + '">' + esc(plan) + '</span></div>';
    if (orgName) {
      h += '<div style="display:flex;justify-content:space-between;gap:8px"><span style="color:var(--muted,#8d9bba);flex-shrink:0">Organisation</span><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right">' + esc(orgName) + '</span></div>';
    }
    h += '</div>';

    h += '<div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line,rgba(255,255,255,.07));text-align:center">';
    h += '<a href="/public/sla_profil.html" style="font-size:12px;color:var(--ds-brand,#4a9eff);font-weight:600;text-decoration:none">Profil bearbeiten \u2192</a>';
    h += '</div>';

    container.innerHTML = h;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
