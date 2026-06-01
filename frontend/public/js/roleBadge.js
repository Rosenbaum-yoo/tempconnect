/**
 * roleBadge.js — Zeigt Rollen-Badge + Plan im Topbar an.
 * Benötigt: ds-topbar mit [data-notif-topbar] Attribut.
 * Lädt /api/me und rendert: [Rolle] [Plan-Badge]
 */
(function () {
  var ROLE_LABELS = {
    agency:  "Zeitarbeitsfirma",
    company: "Unternehmen",
    worker:  "Worker",
    admin:   "Admin"
  };

  var ORG_ROLE_LABELS = {
    platform_admin: "Plattform-Admin",
    owner: "Owner",
    admin: "Admin",
    program_manager: "Programm-Manager",
    hiring_manager: "Hiring-Manager",
    supplier_manager: "Supplier-Manager",
    finance: "Finanzen",
    recruiter: "Recruiter",
    dispatcher: "Dispatcher",
    member: "Mitglied",
    supplier_user: "Supplier",
    viewer: "Viewer"
  };

  var PLAN_COLORS = {
    DEMO:       { bg: "rgba(255,255,255,.08)", color: "#8d9bba" },
    FREE:       { bg: "rgba(255,255,255,.08)", color: "#8d9bba" },
    BASIS:      { bg: "rgba(74,158,255,.12)",  color: "#4a9eff" },
    PLUS:       { bg: "rgba(52,211,153,.12)",  color: "#34d399" },
    PRO:        { bg: "rgba(168,85,247,.12)",  color: "#a855f7" },
    ENTERPRISE: { bg: "rgba(244,63,94,.12)",   color: "#f43f5e" }
  };

  function createBadge(text, bgColor, textColor) {
    var el = document.createElement("span");
    el.textContent = text;
    el.style.cssText =
      "display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;" +
      "font-size:11px;font-weight:600;letter-spacing:.3px;white-space:nowrap;" +
      "background:" + bgColor + ";color:" + textColor + ";";
    return el;
  }

  function createUserLabel(text) {
    var el = document.createElement("span");
    el.textContent = text;
    el.style.cssText =
      "font-size:12px;color:#94a3b8;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;";
    return el;
  }

  function createSeparator() {
    var el = document.createElement("span");
    el.textContent = "\u00b7";
    el.style.cssText = "color:#475569;font-size:12px;";
    return el;
  }

  function inject(me) {
    var topbar = document.querySelector("[data-notif-topbar]") || document.querySelector(".ds-topbar");
    if (!topbar) return;

    var nav = topbar.querySelector(".ds-topbar__nav");
    if (!nav) return;

    // Container rechts im Topbar
    var container = document.createElement("div");
    container.className = "ds-role-badge-group";
    container.style.cssText =
      "display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding-left:12px;";

    // Rollen-Badge (User-Typ)
    var roleLabel = ROLE_LABELS[me.role] || me.role || "–";
    container.appendChild(createBadge(roleLabel, "rgba(255,255,255,.06)", "#c0cbde"));

    // Org-Rollen-Badge (wenn vorhanden: owner/admin/dispatcher etc.)
    if (me.org_role && ORG_ROLE_LABELS[me.org_role]) {
      container.appendChild(createBadge(ORG_ROLE_LABELS[me.org_role], "rgba(99,91,255,.1)", "#8b83ff"));
    }

    // Nutzername anzeigen (Vorname Nachname, Fallback E-Mail)
    var userName = "";
    if (me.first_name || me.last_name) {
      userName = ((me.first_name || "") + " " + (me.last_name || "")).trim();
    } else if (me.name) {
      userName = me.name;
    } else if (me.email) {
      userName = me.email;
    }
    if (userName) {
      container.appendChild(createSeparator());
      container.appendChild(createUserLabel(userName));
    }

    // Firmen-/Organisationsname anzeigen
    var orgName = me.company_name || me.org_name || "";
    if (orgName) {
      container.appendChild(createSeparator());
      container.appendChild(createUserLabel(orgName));
    }

    // Plan-Badge
    var plan = me.plan || "DEMO";
    if (plan === "FREE") plan = "DEMO";
    var pc = PLAN_COLORS[plan] || PLAN_COLORS.DEMO;
    container.appendChild(createBadge(plan, pc.bg, pc.color));

    nav.appendChild(container);
  }

  function run() {
    fetch("/api/me", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) { if (me) inject(me); })
      .catch(function () { /* silent */ });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
