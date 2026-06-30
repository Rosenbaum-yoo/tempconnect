"use strict";
var _workers = [];
var _invites = [];
var _editUserId = null;
var _currentSkillWorker = null;
var _currentSkills = [];
var _currentQuals = [];
var _currentWorkerDocuments = [];
var _currentWorkerDocumentSummary = null;
var MAX_SKILL_TAGS = 50;
var PLAN_ORDER = ["DEMO", "BASIS", "PLUS", "PRO", "INDIVIDUELL"];
var _publicFieldLabels = {
  name: "Name",
  city: "Ort",
  skill_tags: "Skills",
  qualifications: "Qualifikationen",
  profile_text: "Kurzprofil",
  availability_note: "Verfügbarkeit"
};
var SKILL_CATALOG_GROUPS = [
  {
    id: "lager_logistik",
    title: "Lager & Logistik",
    description: "Operative Lager-, Versand- und Intralogistik-Kompetenzen.",
    skills: ["Kommissionierung", "Wareneingang", "Warenausgang", "Stapler", "Frontstapler", "Schubmaststapler", "Hochregal", "Scanner / MDE", "Pick-by-Voice", "Versand", "Verpackung", "Inventur"]
  },
  {
    id: "produktion_montage",
    title: "Produktion & Montage",
    description: "Serienfertigung, Montage und Linienkompetenzen.",
    skills: ["Maschinenbedienung", "Montage", "Serienfertigung", "Qualitätskontrolle", "Sichtprüfung", "Rüsten", "Endkontrolle", "Löten", "Kabelkonfektion", "Kunststoffverarbeitung", "Lebensmittelproduktion", "Pharma-Produktion"]
  },
  {
    id: "metall_industrie",
    title: "Metall & Industrie",
    description: "Technische und industrielle Fertigungskompetenzen.",
    skills: ["MAG-Schweißen", "WIG-Schweißen", "MIG-Schweißen", "Metallbau", "Kanten / Biegen", "Drehen", "Fräsen", "CNC-Bedienung", "Zeichnung lesen", "Instandhaltung", "Hydraulik", "Pneumatik"]
  },
  {
    id: "bau_handwerk",
    title: "Bau & Handwerk",
    description: "Baunahe, handwerkliche und montageorientierte Fähigkeiten.",
    skills: ["Trockenbau", "Elektroinstallation", "Sanitär", "Heizungsbau", "Malerarbeiten", "Fliesenlegen", "Holzmontage", "Fenster- / Türenmontage", "Rohbau", "Betonarbeiten", "Garten- und Landschaftsbau", "Gerüstbau"]
  },
  {
    id: "transport_fahrdienst",
    title: "Transport & Fahrdienst",
    description: "Fahr-, Touren- und Transportfertigkeiten.",
    skills: ["Führerschein B", "Führerschein C / CE", "Ladungssicherung", "Auslieferung", "Tourenplanung", "Nahverkehr", "Fernverkehr", "Kurierdienst", "Fahrzeugpflege", "Fahrerkarte", "Kühltransport", "Personenbeförderung"]
  },
  {
    id: "buero_verwaltung",
    title: "Büro & Verwaltung",
    description: "Administrative, kaufmännische und koordinative Skills.",
    skills: ["MS Office", "Excel-Reporting", "Datenerfassung", "Sachbearbeitung", "Auftragsbearbeitung", "Disposition", "Terminplanung", "Empfang", "Telefonzentrale", "Rechnungsprüfung", "Personalassistenz", "Dokumentenmanagement"]
  },
  {
    id: "handel_service",
    title: "Handel & Service",
    description: "Vertriebs-, Retail- und serviceorientierte Kompetenzen.",
    skills: ["Kundenberatung", "Kasse / POS", "Warenverräumung", "Merchandising", "Reklamationsbearbeitung", "Call Center", "Telesales", "Serviceannahme", "Filialsupport", "Upselling", "Beschwerdemanagement", "Front Office"]
  },
  {
    id: "gastro_event",
    title: "Gastro & Event",
    description: "Gastgewerbe-, Veranstaltungs- und Front-of-House-Skills.",
    skills: ["Service", "Küche", "Spülküche", "Bar", "Housekeeping", "Rezeption", "Catering", "Bankettservice", "Veranstaltungsaufbau", "Garderobe", "Frühstücksservice", "Night Audit"]
  },
  {
    id: "pflege_soziales",
    title: "Pflege & Soziales",
    description: "Pflege-, Betreuungs- und sozialnahe Kompetenzen.",
    skills: ["Grundpflege", "Behandlungspflege", "Betreuung", "Seniorenbetreuung", "Pflegedokumentation", "Medikamentengabe", "OP-Begleitung", "Stationshilfe", "Alltagsbegleitung", "Kita-Betreuung", "Schulbegleitung", "Sozialberatung"]
  },
  {
    id: "facility_reinigung",
    title: "Facility & Reinigung",
    description: "Gebäude-, Reinigungs- und Betreiberservices.",
    skills: ["Unterhaltsreinigung", "Glasreinigung", "Industriereinigung", "Maschinenreinigung", "Hausmeisterservice", "Gebäudetechnik", "Winterdienst", "Grünpflege", "Abfallmanagement", "Sicherheitsdienst", "Empfangsdienst", "Zutrittskontrolle"]
  },
  {
    id: "digital_systeme",
    title: "Digital & Systeme",
    description: "IT-nahe, systemische und prozessunterstützende Skills.",
    skills: ["Hardware-Rollout", "First-Level-Support", "Ticketing", "ERP / Warenwirtschaft", "SAP-Grundkenntnisse", "CRM-Pflege", "E-Commerce Support", "Contentpflege", "Social Media Support", "Datenanalyse", "Power BI", "Prozessdokumentation"]
  },
  {
    id: "sprachen_kommunikation",
    title: "Sprachen & Kommunikation",
    description: "Sprachkompetenzen für Einsätze, Kundenkontakt und Teams.",
    skills: ["Deutsch B2", "Deutsch C1", "Englisch B1", "Englisch B2", "Polnisch", "Rumänisch", "Türkisch", "Arabisch", "Russisch", "Französisch"]
  }
];
var _skillCatalogMeta = null;

/* ── API + CSRF ──────────────────────────────────────── */
var _csrf = null;
function getCsrf() {
  if (_csrf) return Promise.resolve(_csrf);
  return fetch("/api/csrf", { credentials: "include" })
    .then(function(r) { return r.json(); })
    .then(function(d) { _csrf = d.token || null; return _csrf; })
    .catch(function() { return null; });
}

function api(path, opts) {
  opts = opts || {};
  var method = opts.method || "GET";
  var headers = {};
  var isFormData = !!opts.formData;
  if (!isFormData) headers["Content-Type"] = "application/json";

  function doFetch(csrf) {
    if (csrf && method !== "GET") headers["x-csrf-token"] = csrf;
    var o = { method: method, credentials: "include", headers: headers };
    if (opts.body) o.body = JSON.stringify(opts.body);
    if (opts.formData) o.body = opts.formData;
    return fetch("/api" + path, o).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw e; });
      return r.json();
    });
  }

  if (method === "GET") return doFetch(null);
  return getCsrf().then(function(csrf) {
    return doFetch(csrf).catch(function(err) {
      if (err && (err.error === "CSRF_INVALID" || err.error === "CSRF_MISSING")) {
        _csrf = null;
        return getCsrf().then(doFetch);
      }
      throw err;
    });
  });
}

function toast(msg, type) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + (type || "ok");
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.className = "toast"; }, 4000);
}

function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function normalizePlan(plan) {
  var p = String(plan || "").toUpperCase();
  if (p === "FREE") p = "DEMO";
  if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
  return p || null;
}

function formatPlanLabel(plan) {
  if (window.PlanFeatures && typeof window.PlanFeatures.getDisplayPlanLabel === "function") {
    return window.PlanFeatures.getDisplayPlanLabel(plan);
  }
  return plan === "INDIVIDUELL" ? "Individueller Tarif" : plan;
}

function getNextPlan(plan) {
  var idx = PLAN_ORDER.indexOf(plan);
  if (idx < 0 || idx >= PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

function sortPlans(plans) {
  return plans.slice().sort(function(a, b) {
    return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b);
  });
}

function buildUpgradeHref(plan) {
  if (!plan) return "/public/sla_abo.html";
  if (plan === "INDIVIDUELL") return "/public/enterprise_anfrage.html";
  return "/public/sla_abo.html?plan=" + encodeURIComponent(plan);
}

function getWorkerLimitMeta(planLimits) {
  if (!planLimits || !Array.isArray(planLimits.checks)) return null;
  var check = planLimits.checks.find(function(c) { return c.metric === "active_workers"; });
  if (!check) return null;
  var max = (check.max === null || check.max === undefined) ? "∞" : check.max;
  return "Aktive Worker: " + check.current + " / " + max;
}

function showWorkerUpgradeBanner(info) {
  var banner = document.getElementById("workerUpgradeBanner");
  if (!banner) return;
  var titleEl = document.getElementById("workerUpgradeTitle");
  var textEl = document.getElementById("workerUpgradeText");
  var listEl = document.getElementById("workerUpgradeList");
  var metaEl = document.getElementById("workerUpgradeMeta");
  var ctaEl = document.getElementById("workerUpgradeCta");

  var reason = info && info.reason ? info.reason : "feature";
  var currentPlan = normalizePlan(info.current_plan || (info.plan_limits && info.plan_limits.plan) || info.plan);
  var requiredPlans = Array.isArray(info.required_plans)
    ? sortPlans(info.required_plans.map(normalizePlan).filter(Boolean))
    : [];
  var minPlan = requiredPlans.length ? requiredPlans[0] : "PLUS";
  var targetPlan = reason === "limit" ? (getNextPlan(currentPlan) || minPlan) : minPlan;
  if (currentPlan === "INDIVIDUELL" && reason === "limit") targetPlan = "INDIVIDUELL";

  var title = "Workforce-Hub freischalten";
  var text = "Der Workforce-Hub ist ab PLUS verfügbar. Verwalten Sie Mitarbeiterprofile, Skills und Qualifikationen zentral.";
  var listItems = [
    "Mitarbeiterprofile und Skill-Katalog",
    "Qualifikationen, Nachweise und Ablaufdaten",
    "CSV-Import für schnelle Aktivierung"
  ];

  if (reason === "limit") {
    title = "Mitarbeiter-Limit erreicht";
    text = "Ihr aktueller Plan stößt beim Workforce-Hub an die Grenze. Erhöhen Sie das Kontingent für aktive Mitarbeiter und Einsätze.";
    listItems = [
      "Mehr aktive Worker und Einsätze",
      "Skalierbarer CSV-Import und Dokumentenverwaltung",
      "Zusätzliche Steuerungs- und Reporting-Tiefe"
    ];
  } else if (requiredPlans.length) {
    text = "Der Workforce-Hub ist ab " + requiredPlans.map(formatPlanLabel).join(" / ") + " verfügbar. Verwalten Sie Mitarbeiterprofile, Skills und Qualifikationen zentral.";
  }

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;

  if (listEl) {
    listEl.innerHTML = "";
    if (listItems && listItems.length) {
      listEl.style.display = "";
      listItems.forEach(function(item) {
        var li = document.createElement("li");
        li.textContent = item;
        listEl.appendChild(li);
      });
    } else {
      listEl.style.display = "none";
    }
  }

  if (metaEl) {
    var metaParts = [];
    if (currentPlan) metaParts.push("Aktueller Plan: " + formatPlanLabel(currentPlan));
    if (reason === "limit") {
      var limitMeta = getWorkerLimitMeta(info.plan_limits);
      if (limitMeta) metaParts.push(limitMeta);
    }
    metaEl.textContent = metaParts.join(" · ");
    metaEl.style.display = metaParts.length ? "" : "none";
  }

  if (ctaEl) {
    ctaEl.href = buildUpgradeHref(targetPlan);
    ctaEl.textContent = targetPlan === "INDIVIDUELL" ? "Individuell anfragen" : "Upgrade starten";
  }

  banner.style.display = "flex";
}

function showWorkerUpgradeFromError(err) {
  if (!err || !err.error) return false;
  if (err.error === "FEATURE_NOT_AVAILABLE") {
    showWorkerUpgradeBanner(Object.assign({}, err, { reason: "feature" }));
    return true;
  }
  if (err.error === "WORKER_LIMIT_EXCEEDED") {
    showWorkerUpgradeBanner(Object.assign({}, err, { reason: "limit" }));
    return true;
  }
  return false;
}

/* ── Tabs ────────────────────────────────────────────── */
function showTab(name) {
  document.querySelectorAll(".panel").forEach(function(p) { p.classList.remove("active"); });
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  var panel = document.getElementById("panel-" + name);
  if (panel) panel.classList.add("active");
  var tab = document.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (tab) tab.classList.add("active");
  if (name === "invites") loadInvites();
  if (name === "skills") populateSkillsWorkerSelect();
  if (name === "live") startLiveBoard(); else stopLiveBoard();
}

/* ── Live-Belegschaft (Disposition) ─────────────────────
 * Pro-Worker-Live-Status (verfügbar/im Einsatz/endet bald/inaktiv + offene Stundenzettel),
 * Polling alle 30 s (nur solange der Tab aktiv ist). Serverseitig org-gebunden. */
var _liveTimer = null;
var _liveSearchT = null;
var LIVE_POLL_MS = 30000;
var LIVE_STATUS = {
  endet_bald: { label: "Endet bald", color: "var(--ds-warning,#f59e0b)" },
  im_einsatz: { label: "Im Einsatz", color: "var(--ds-brand,#4a9eff)" },
  verfuegbar: { label: "Verfügbar",  color: "var(--ds-success,#34d399)" },
  inaktiv:    { label: "Inaktiv",    color: "var(--ds-text-tertiary,#8d9bba)" }
};

function startLiveBoard() {
  loadLiveBoard();
  if (_liveTimer) clearInterval(_liveTimer);
  _liveTimer = setInterval(loadLiveBoard, LIVE_POLL_MS);
}
function stopLiveBoard() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}
function filterLiveBoard() {
  if (_liveSearchT) clearTimeout(_liveSearchT);
  _liveSearchT = setTimeout(loadLiveBoard, 300);
}
function loadLiveBoard() {
  var q = (document.getElementById("liveSearch") || {}).value || "";
  return api("/workers/live-board" + (q ? "?search=" + encodeURIComponent(q) : "")).then(function(data) {
    renderLiveKpis((data && data.kpis) || {});
    renderLiveList((data && data.workers) || []);
    var u = document.getElementById("liveUpdated");
    if (u) u.textContent = "Stand: " + new Date().toLocaleTimeString("de-DE");
  }).catch(function() {
    var l = document.getElementById("liveList");
    if (l) l.innerHTML = '<div class="empty-state">Live-Belegschaft konnte nicht geladen werden.</div>';
  });
}
function renderLiveKpis(k) {
  var el = document.getElementById("liveKpis"); if (!el) return;
  function tile(label, val, color) {
    return '<div style="flex:1;min-width:120px;padding:14px 16px;border:1px solid var(--ds-border,rgba(0,0,0,.1));border-radius:12px;background:var(--ds-bg-surface,#fff)">' +
           '<div style="font-size:24px;font-weight:800;color:' + (color || "var(--ds-text,#0f172a)") + '">' + esc(String(val != null ? val : "–")) + '</div>' +
           '<div style="font-size:12px;color:var(--wk-text-muted,#64748b)">' + esc(label) + '</div></div>';
  }
  el.innerHTML =
    tile("Auslastung", (k.auslastung_pct != null ? k.auslastung_pct + " %" : "–"), "var(--ds-brand,#4a9eff)") +
    tile("Im Einsatz", (k.im_einsatz || 0) + (k.endet_bald ? " (+" + k.endet_bald + ")" : ""), null) +
    tile("Verfügbar", k.verfuegbar || 0, "var(--ds-success,#34d399)") +
    tile("Endet bald", k.endet_bald || 0, "var(--ds-warning,#f59e0b)") +
    tile("Stundenzettel offen", k.open_timesheets || 0, null) +
    tile("Belegschaft", k.total || 0, null);
}
function renderLiveList(workers) {
  var el = document.getElementById("liveList"); if (!el) return;
  if (!workers.length) { el.innerHTML = '<div class="empty-state">Noch keine Mitarbeiter in der Belegschaft.</div>'; return; }
  var order = ["endet_bald", "im_einsatz", "verfuegbar", "inaktiv"]; // Handlungsbedarf zuerst
  var html = "";
  order.forEach(function(st) {
    var group = workers.filter(function(w) { return w.live_status === st; });
    if (!group.length) return;
    var cfg = LIVE_STATUS[st] || { label: st, color: "var(--ds-text,#0f172a)" };
    html += '<div style="margin:18px 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:' + cfg.color + '">' + esc(cfg.label) + ' (' + group.length + ')</div>';
    group.forEach(function(w) {
      var name = esc(((w.first_name || "") + " " + (w.last_name || "")).trim() || "—") +
                 (w.personnel_number ? ' <span style="color:var(--wk-text-muted,#64748b);font-weight:400">#' + esc(w.personnel_number) + '</span>' : "");
      var sub = [];
      if (w.client_name) sub.push("bei " + esc(w.client_name));
      if (w.effective_end_date) sub.push("bis " + esc(String(w.effective_end_date).slice(0, 10)));
      var ts = (w.open_timesheets > 0)
        ? '<a href="/public/worker-submissions-review.html" class="badge" style="background:var(--ds-warning-muted,rgba(245,158,11,.15));color:var(--ds-warning,#b45309);text-decoration:none">' + w.open_timesheets + ' Stundenzettel</a>'
        : "";
      html += '<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">' +
                '<div><div style="font-weight:700">' + name + '</div>' +
                (sub.length ? '<div style="font-size:13px;color:var(--wk-text-muted,#64748b)">' + sub.join(" · ") + '</div>' : "") + '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;flex-shrink:0">' + ts +
                  '<span class="badge" style="background:transparent;border:1px solid ' + cfg.color + ';color:' + cfg.color + '">' + esc(cfg.label) + '</span>' +
                '</div></div>';
    });
  });
  el.innerHTML = html;
}

/* ── Init ────────────────────────────────────────────── */
function init() {
  api("/me").then(function(me) {
    if (!me) { window.location.href = "/"; return; }
    var displayPlan = me.plan || "DEMO";
    if (displayPlan === "FREE") displayPlan = "DEMO";
    var badge = document.getElementById("userBadge");
    if (badge) badge.textContent = (me.company_name || me.email) + " · " + displayPlan;
    loadWorkers();
    loadInvites();
    populateSkillsWorkerSelect();
  }).catch(function() {
    window.location.href = "/";
  });
}

/* ── Workers laden ───────────────────────────────────── */
function loadWorkers() {
  var status = document.getElementById("filterStatus").value;
  var url = "/workers?limit=200";
  if (status) url += "&is_active=" + status;
  api(url).then(function(data) {
    _workers = data.items || [];
    document.getElementById("workerCount").textContent = _workers.length;
    renderWorkers();
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    document.getElementById("workerList").innerHTML = '<div class="empty-state"><div class="icon">&#9888;</div>' + esc(e.message || e.error || "Fehler beim Laden") + '</div>';
  });
}

function filterWorkers() {
  renderWorkers();
}

function renderWorkers() {
  var q = (document.getElementById("searchInput").value || "").toLowerCase();
  var filtered = _workers.filter(function(w) {
    if (!q) return true;
    var s = ((w.first_name || "") + " " + (w.last_name || "") + " " + (w.email || "") + " " + (w.personnel_number || "")).toLowerCase();
    return s.indexOf(q) >= 0;
  });
  var el = document.getElementById("workerList");
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="icon">&#128100;</div>' +
      (_workers.length === 0 ? 'Noch keine Mitarbeiter angelegt.<br><button class="btn primary" style="margin-top:12px" onclick="showTab(\'create\')">Ersten Mitarbeiter anlegen</button>' : 'Keine Mitarbeiter gefunden.') +
      '</div>';
    return;
  }
  var html = '<table class="w-table"><thead><tr><th>Name</th><th>E-Mail</th><th>Personal-Nr.</th><th>Telefon</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>';
  filtered.forEach(function(w) {
    var isActive = w.is_active !== false;
    var profileMeta = [];
    if (w.skill_count) profileMeta.push(String(w.skill_count) + " Skills");
    if (w.qualification_count) profileMeta.push(String(w.qualification_count) + " Qualifikationen");
    if (w.document_count) profileMeta.push(String(w.document_count) + " Nachweise");
    if (w.expired_document_count) profileMeta.push(String(w.expired_document_count) + " abgelaufen");
    if (w.expiring_soon_document_count) profileMeta.push(String(w.expiring_soon_document_count) + " läuft bald ab");
    if (w.next_document_expiry) profileMeta.push("nächste Frist " + formatDateLabel(w.next_document_expiry));
    if (w.profile_public) profileMeta.push("extern freigegeben");
    html += '<tr>' +
      '<td class="name">' + esc(w.first_name || "") + ' ' + esc(w.last_name || "") +
        (profileMeta.length ? '<div class="meta">' + esc(profileMeta.join(" · ")) + '</div>' : '') + '</td>' +
      '<td class="meta">' + esc(w.email || "") + '</td>' +
      '<td class="meta">' + esc(w.personnel_number || "–") + '</td>' +
      '<td class="meta">' + esc(w.phone || "–") + '</td>' +
      '<td><span class="status-dot ' + (isActive ? 'active' : 'inactive') + '"></span>' + (isActive ? 'Aktiv' : 'Inaktiv') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="action-btn" onclick="openWorkerProfileHub(\'' + w.user_id + '\')">Profil</button> ' +
        '<button class="action-btn" onclick="openEdit(\'' + w.user_id + '\')">Bearbeiten</button> ' +
        (isActive
          ? '<button class="action-btn danger" onclick="toggleActive(\'' + w.user_id + '\', false)">Deaktivieren</button>'
          : '<button class="action-btn good" onclick="toggleActive(\'' + w.user_id + '\', true)">Aktivieren</button>') +
      '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ── Worker anlegen ──────────────────────────────────── */
function createWorker() {
  var data = {
    first_name: document.getElementById("cFirstName").value.trim(),
    last_name:  document.getElementById("cLastName").value.trim(),
    email:      document.getElementById("cEmail").value.trim(),
    personnel_number: document.getElementById("cPersonnelNr").value.trim() || null,
    phone:      document.getElementById("cPhone").value.trim() || null,
    city:       document.getElementById("cCity").value.trim() || null,
    street:     document.getElementById("cStreet").value.trim() || null,
    postal_code: document.getElementById("cPostal").value.trim() || null
  };
  var pw = document.getElementById("cPassword").value;
  if (pw) data.password = pw;

  if (!data.first_name || !data.last_name || !data.email) {
    toast("Bitte Vorname, Nachname und E-Mail ausfuellen.", "err");
    return;
  }

  document.getElementById("btnCreate").disabled = true;
  api("/workers", { method: "POST", body: data }).then(function() {
    toast("Mitarbeiter erfolgreich angelegt!");
    document.querySelectorAll("#panel-create input").forEach(function(i) { i.value = ""; });
    showTab("list");
    loadWorkers();
  }).catch(function(e) {
    var msg = e.error === "EMAIL_EXISTS" ? "Diese E-Mail ist bereits registriert."
            : e.error === "WORKER_LIMIT_EXCEEDED" ? "Mitarbeiter-Limit erreicht. Bitte Plan upgraden."
            : e.error === "FEATURE_NOT_AVAILABLE" ? "Worker-Modul nicht verfuegbar. Bitte Plan upgraden (PLUS/PRO)."
            : (e.message || e.error || "Fehler beim Anlegen");
    showWorkerUpgradeFromError(e);
    toast(msg, "err");
  }).finally(function() {
    document.getElementById("btnCreate").disabled = false;
  });
}

/* ── Worker einladen ─────────────────────────────────── */
function inviteWorker() {
  var data = {
    first_name: document.getElementById("iFirstName").value.trim(),
    last_name:  document.getElementById("iLastName").value.trim(),
    email:      document.getElementById("iEmail").value.trim(),
    personnel_number: document.getElementById("iPersonnelNr").value.trim() || null
  };
  if (!data.first_name || !data.last_name || !data.email) {
    toast("Bitte Vorname, Nachname und E-Mail ausfuellen.", "err");
    return;
  }
  document.getElementById("btnInvite").disabled = true;
  api("/worker-invites", { method: "POST", body: data }).then(function() {
    toast("Einladung erfolgreich gesendet!");
    document.querySelectorAll("#panel-invite input").forEach(function(i) { i.value = ""; });
    showTab("invites");
    loadInvites();
  }).catch(function(e) {
    var msg = e.error === "INVITE_ALREADY_PENDING" ? "Es gibt bereits eine offene Einladung fuer diese E-Mail."
            : e.error === "WORKER_LIMIT_EXCEEDED" ? "Mitarbeiter-Limit erreicht."
            : e.error === "FEATURE_NOT_AVAILABLE" ? "Worker-Modul nicht verfuegbar. Bitte Plan upgraden."
            : (e.message || e.error || "Fehler");
    showWorkerUpgradeFromError(e);
    toast(msg, "err");
  }).finally(function() {
    document.getElementById("btnInvite").disabled = false;
  });
}

/* ── Einladungen laden ───────────────────────────────── */
function loadInvites() {
  api("/worker-invites").then(function(data) {
    _invites = data.items || [];
    document.getElementById("inviteCount").textContent = _invites.filter(function(i) { return i.status === "pending"; }).length;
    renderInvites();
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    document.getElementById("inviteList").innerHTML = '<div class="empty-state">Einladungen konnten nicht geladen werden.</div>';
  });
}

function renderInvites() {
  var el = document.getElementById("inviteList");
  if (_invites.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="icon">&#128233;</div>Noch keine Einladungen gesendet.</div>';
    return;
  }
  var statusLabels = { pending: "Ausstehend", accepted: "Angenommen", revoked: "Widerrufen", expired: "Abgelaufen" };
  var statusColors = { pending: "yellow", accepted: "green", revoked: "red", expired: "muted" };
  var html = "";
  _invites.forEach(function(inv) {
    var st = inv.status || "pending";
    html += '<div class="invite-item">' +
      '<div class="info"><div class="name">' + esc(inv.first_name) + ' ' + esc(inv.last_name) + '</div><div class="email">' + esc(inv.email) + (inv.personnel_number ? ' · ' + esc(inv.personnel_number) : '') + '</div></div>' +
      '<span class="tag ' + (statusColors[st] || 'muted') + '">' + (statusLabels[st] || st) + '</span>' +
      '<div class="actions">' +
        (st === "pending" ? '<button class="action-btn" onclick="resendInvite(\'' + inv.id + '\')">Erneut senden</button><button class="action-btn danger" onclick="revokeInvite(\'' + inv.id + '\')">Widerrufen</button>' : '') +
      '</div></div>';
  });
  el.innerHTML = html;
}

function resendInvite(id) {
  api("/worker-invites/" + id + "/resend", { method: "POST" }).then(function() {
    toast("Einladung erneut gesendet!");
  }).catch(function(e) { toast(e.message || e.error || "Fehler", "err"); });
}

function revokeInvite(id) {
  if (!confirm("Einladung wirklich widerrufen?")) return;
  api("/worker-invites/" + id + "/revoke", { method: "POST" }).then(function() {
    toast("Einladung widerrufen.");
    loadInvites();
  }).catch(function(e) { toast(e.message || e.error || "Fehler", "err"); });
}

/* ── Aktivieren / Deaktivieren ───────────────────────── */
function toggleActive(userId, activate) {
  var action = activate ? "activate" : "deactivate";
  api("/workers/" + userId + "/" + action, { method: "POST" }).then(function() {
    toast(activate ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
    loadWorkers();
  }).catch(function(e) {
    toast(e.message || e.error || "Fehler", "err");
  });
}

/* ── Bearbeiten ──────────────────────────────────────── */
function openEdit(userId) {
  _editUserId = userId;
  api("/workers/" + userId).then(function(w) {
    document.getElementById("eFirstName").value = w.first_name || "";
    document.getElementById("eLastName").value = w.last_name || "";
    document.getElementById("ePersonnelNr").value = w.personnel_number || "";
    document.getElementById("ePhone").value = w.phone || "";
    document.getElementById("eCity").value = w.city || "";
    document.getElementById("eStreet").value = w.street || "";
    document.getElementById("ePostal").value = w.postal_code || "";
    document.getElementById("eNotes").value = w.notes || "";
    document.getElementById("editModal").classList.add("show");
  }).catch(function(e) { toast(e.message || "Fehler", "err"); });
}

function closeEditModal() {
  document.getElementById("editModal").classList.remove("show");
  _editUserId = null;
}

function saveEdit() {
  if (!_editUserId) return;
  var data = {
    first_name:       document.getElementById("eFirstName").value.trim() || undefined,
    last_name:        document.getElementById("eLastName").value.trim() || undefined,
    personnel_number: document.getElementById("ePersonnelNr").value.trim() || null,
    phone:            document.getElementById("ePhone").value.trim() || null,
    city:             document.getElementById("eCity").value.trim() || null,
    street:           document.getElementById("eStreet").value.trim() || null,
    postal_code:      document.getElementById("ePostal").value.trim() || null,
    notes:            document.getElementById("eNotes").value.trim() || null
  };
  api("/workers/" + _editUserId, { method: "PATCH", body: data }).then(function() {
    toast("Mitarbeiter aktualisiert!");
    closeEditModal();
    loadWorkers();
  }).catch(function(e) { toast(e.message || e.error || "Fehler", "err"); });
}

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") closeEditModal();
});

/* ── Profil- & Talent-Hub ───────────────────────────── */
function formatDateInput(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatDateLabel(value) {
  var iso = formatDateInput(value);
  if (!iso) return "–";
  var parts = iso.split("-");
  return parts.length === 3 ? parts[2] + "." + parts[1] + "." + parts[0] : iso;
}

function publicFieldLabel(field) {
  return _publicFieldLabels[field] || field;
}

function renderHubList(items, emptyText, renderItem) {
  if (!items || items.length === 0) {
    return '<div class="hub-list-item"><div class="hub-list-title">' + esc(emptyText) + "</div></div>";
  }
  return items.map(renderItem).join("");
}

function normalizeSkillKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getSkillCatalogMeta() {
  if (_skillCatalogMeta) return _skillCatalogMeta;
  var order = {};
  var groups = {};
  var totalSkills = 0;
  SKILL_CATALOG_GROUPS.forEach(function(group) {
    groups[group.id] = group;
    group.skills.forEach(function(skill) {
      var key = normalizeSkillKey(skill);
      if (order[key]) return;
      order[key] = {
        label: skill,
        groupId: group.id,
        groupTitle: group.title,
        index: totalSkills
      };
      totalSkills += 1;
    });
  });
  _skillCatalogMeta = {
    order: order,
    groups: groups,
    totalSkills: totalSkills
  };
  return _skillCatalogMeta;
}

function isCatalogSkill(skill) {
  return !!getSkillCatalogMeta().order[normalizeSkillKey(skill)];
}

function hasSkill(skill) {
  var key = normalizeSkillKey(skill);
  return _currentSkills.some(function(current) { return normalizeSkillKey(current) === key; });
}

function sortSkillList(skills) {
  var catalogOrder = getSkillCatalogMeta().order;
  return (skills || []).slice().sort(function(a, b) {
    var aMeta = catalogOrder[normalizeSkillKey(a)];
    var bMeta = catalogOrder[normalizeSkillKey(b)];
    if (aMeta && bMeta) return aMeta.index - bMeta.index;
    if (aMeta) return -1;
    if (bMeta) return 1;
    return String(a || "").localeCompare(String(b || ""), "de", { sensitivity: "base" });
  });
}

function setCurrentSkills(skills) {
  var next = [];
  var seen = {};
  (skills || []).forEach(function(skill) {
    var value = String(skill || "").trim().replace(/\s+/g, " ");
    var key = normalizeSkillKey(value);
    if (!value || value.length > 80 || seen[key]) return;
    seen[key] = true;
    if (next.length < MAX_SKILL_TAGS) next.push(value);
  });
  _currentSkills = sortSkillList(next);
}

function addSkillValue(skill, opts) {
  var options = opts || {};
  var value = String(skill || "").trim().replace(/\s+/g, " ");
  if (!value) return false;
  if (hasSkill(value)) return false;
  if (_currentSkills.length >= MAX_SKILL_TAGS) {
    if (!options.silentLimitToast) toast("Maximal 50 Skills pro Mitarbeiterprofil.", "err");
    return false;
  }
  _currentSkills.push(value);
  _currentSkills = sortSkillList(_currentSkills);
  return true;
}

function removeSkillValue(skill) {
  var key = normalizeSkillKey(skill);
  _currentSkills = _currentSkills.filter(function(current) {
    return normalizeSkillKey(current) !== key;
  });
  _currentSkills = sortSkillList(_currentSkills);
}

function updateSkillSelectionViews() {
  renderSkillTags();
  renderSkillCatalog();
  renderWorkerHubHeader(_currentSkillWorker);
}

function populateSkillsWorkerSelect() {
  var sel = document.getElementById("skillsWorkerSelect");
  if (!sel) return Promise.resolve();
  var current = sel.value || (_currentSkillWorker && (_currentSkillWorker.user_id || _currentSkillWorker.id)) || "";
  return api("/workers?limit=200").then(function(data) {
    var items = data.items || [];
    sel.innerHTML = '<option value="">Mitarbeiter auswählen...</option>' + items.map(function(w) {
      var id = w.user_id || w.id || "";
      var label = ((w.first_name || "") + " " + (w.last_name || "")).trim() || (w.email || "Unbekannt");
      var meta = [];
      if (w.personnel_number) meta.push(w.personnel_number);
      if (w.profile_public) meta.push("extern");
      return '<option value="' + esc(id) + '">' + esc(label) + (meta.length ? " (" + esc(meta.join(" · ")) + ")" : "") + "</option>";
    }).join("");
    if (current) sel.value = current;
  }).catch(function(e) {
    showWorkerUpgradeFromError(e);
    sel.innerHTML = '<option value="">Mitarbeiter auswählen...</option>';
  });
}

function resetWorkerHubSelection() {
  _currentSkillWorker = null;
  setCurrentSkills([]);
  _currentQuals = [];
  _currentWorkerDocuments = [];
  _currentWorkerDocumentSummary = null;
  var sel = document.getElementById("skillsWorkerSelect");
  if (sel) sel.value = "";
  ["workerDocumentTitle", "workerDocumentQualification", "workerDocumentIssuer", "workerDocumentValidFrom", "workerDocumentValidUntil", "workerDocumentNotes", "newSkillInput", "skillCatalogSearch"].forEach(function(id) {
    var field = document.getElementById(id);
    if (field) field.value = "";
  });
  var fileInput = document.getElementById("workerDocumentFile");
  if (fileInput) fileInput.value = "";
  var panel = document.getElementById("skillsWorkerPanel");
  var hint = document.getElementById("skillsEmptyHint");
  if (panel) panel.style.display = "none";
  if (hint) hint.style.display = "";
  renderSkillTags();
  renderSkillCatalog();
}

function openWorkerProfileHub(userId) {
  showTab("skills");
  populateSkillsWorkerSelect().then(function() {
    var sel = document.getElementById("skillsWorkerSelect");
    if (!sel) return;
    sel.value = userId;
    loadWorkerSkills();
  });
}

function setPublicFieldSelection(fields) {
  var fieldSet = {};
  (fields || []).forEach(function(field) { fieldSet[field] = true; });
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    box.checked = !!fieldSet[box.getAttribute("data-public-field")];
  });
}

function getSelectedPublicFields() {
  var fields = [];
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    if (box.checked) fields.push(box.getAttribute("data-public-field"));
  });
  return fields;
}

function updatePublicProfileControls() {
  var isPublic = !!(document.getElementById("profilePublic") && document.getElementById("profilePublic").checked);
  var fields = getSelectedPublicFields();
  document.querySelectorAll("#publicProfileFields input[data-public-field]").forEach(function(box) {
    box.disabled = !isPublic;
  });
  var linkValue = _currentSkillWorker ? (_currentSkillWorker.public_profile_url || _currentSkillWorker.public_profile_path || "") : "";
  var linkInput = document.getElementById("publicProfileLink");
  var previewLink = document.getElementById("publicProfilePreviewLink");
  var summary = document.getElementById("publicProfilePreviewSummary");
  if (linkInput) linkInput.value = linkValue;
  if (previewLink) {
    previewLink.href = linkValue || "#";
    previewLink.style.opacity = (isPublic && linkValue) ? "1" : ".5";
    previewLink.style.pointerEvents = (isPublic && linkValue) ? "" : "none";
  }
  if (summary) {
    if (!isPublic) summary.textContent = "Profil ist aktuell rein intern sichtbar.";
    else if (!fields.length) summary.textContent = "Bitte mindestens ein Feld für die externe Freigabe auswählen.";
    else summary.textContent = "Freigegeben: " + fields.map(publicFieldLabel).join(", ");
  }
}

function renderWorkerHubHeader(worker) {
  var el = document.getElementById("skillsWorkerHeader");
  if (!el || !worker) return;
  var name = ((worker.first_name || "") + " " + (worker.last_name || "")).trim() || (worker.email || "Unbekannt");
  var initials = ((worker.first_name || "?").slice(0, 1) + (worker.last_name || "?").slice(0, 1)).toUpperCase();
  var ops = worker.operational_context || {};
  var badges = [
    '<span class="hub-badge info">Profil ' + esc(String(worker.profile_completion_percent || 0)) + '%</span>',
    '<span class="hub-badge ' + (worker.profile_public ? "good" : "warn") + '">' + (worker.profile_public ? "extern freigegeben" : "nur intern") + '</span>',
    '<span class="hub-badge ' + (worker.linkage && worker.linkage.is_verified ? "good" : "warn") + '">' + ((worker.linkage && worker.linkage.is_verified) ? "Account verifiziert" : "Account nicht verifiziert") + '</span>'
  ];
  el.innerHTML =
    '<div class="hub-hero">' +
      '<div class="hub-hero-main">' +
        '<div class="hub-avatar">' + esc(initials) + "</div>" +
        '<div>' +
          '<h3 class="hub-hero-title">' + esc(name) + "</h3>" +
          '<div class="hub-hero-meta">' +
            '<span>' + esc(worker.email || "Keine E-Mail") + "</span>" +
            '<span>Personal-Nr.: ' + esc(worker.personnel_number || "–") + "</span>" +
            '<span>Status: ' + esc(worker.is_active === false ? "Inaktiv" : "Aktiv") + "</span>" +
          "</div>" +
          '<div class="hub-badges">' + badges.join("") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="hub-hero-side">' +
        '<div class="hub-stat"><div class="hub-stat-label">Aktive Einsätze</div><div class="hub-stat-value">' + esc(String(ops.active_assignment_count || 0)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">Offene Bestätigungen</div><div class="hub-stat-value">' + esc(String(ops.pending_confirmation_count || 0)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">Skills</div><div class="hub-stat-value">' + esc(String((_currentSkills || []).length)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">Qualifikationen</div><div class="hub-stat-value">' + esc(String((_currentQuals || []).length)) + "</div></div>" +
        '<div class="hub-stat"><div class="hub-stat-label">Nachweise</div><div class="hub-stat-value">' + esc(String((_currentWorkerDocuments || []).length)) + "</div></div>" +
      "</div>" +
    "</div>";
}
function renderSkillCatalog() {
  var container = document.getElementById("skillCatalogSections");
  if (!container) return;
  var metaEl = document.getElementById("skillCatalogMeta");
  var searchInput = document.getElementById("skillCatalogSearch");
  var query = (searchInput && searchInput.value || "").trim().toLowerCase();
  var catalogMeta = getSkillCatalogMeta();
  var selectedCatalogCount = _currentSkills.filter(function(skill) { return isCatalogSkill(skill); }).length;
  var customCount = Math.max(0, _currentSkills.length - selectedCatalogCount);
  if (metaEl) {
    var metaParts = [
      String(catalogMeta.totalSkills) + " Katalog-Skills in " + String(SKILL_CATALOG_GROUPS.length) + " Gruppen",
      String(_currentSkills.length) + " ausgewählt"
    ];
    if (customCount) metaParts.push(String(customCount) + " individuell ergänzt");
    if (query) metaParts.push("Filter aktiv: " + query);
    metaParts.push("Scheine und Nachweise bitte unter Qualifikationen pflegen");
    metaEl.textContent = metaParts.join(" · ");
  }
  var groupsHtml = SKILL_CATALOG_GROUPS.map(function(group) {
    var visibleSkills = group.skills.filter(function(skill) {
      if (!query) return true;
      var haystack = (group.title + " " + group.description + " " + skill).toLowerCase();
      return haystack.indexOf(query) >= 0;
    });
    if (!visibleSkills.length) return "";
    var selectedCount = group.skills.filter(function(skill) { return hasSkill(skill); }).length;
    var groupMeta = String(selectedCount) + " von " + String(group.skills.length) + " gewählt";
    if (query) groupMeta = String(visibleSkills.length) + " Treffer · " + groupMeta;
    return '<div class="skill-catalog-group">' +
      '<div class="skill-catalog-group__head">' +
        '<div>' +
          '<div class="hub-section-title" style="margin:0 0 2px">' + esc(group.title) + '</div>' +
          '<div class="skill-catalog-group__meta">' + esc(group.description) + ' · ' + esc(groupMeta) + '</div>' +
        "</div>" +
        '<div class="skill-catalog-group__actions">' +
          '<button type="button" class="action-btn" data-group-id="' + esc(group.id) + '" onclick="selectSkillGroup(this.getAttribute(&quot;data-group-id&quot;))">Kategorie wählen</button>' +
          '<button type="button" class="action-btn" data-group-id="' + esc(group.id) + '" onclick="clearSkillGroup(this.getAttribute(&quot;data-group-id&quot;))">Leeren</button>' +
        "</div>" +
      "</div>" +
      '<div class="skill-checkbox-grid">' +
        visibleSkills.map(function(skill) {
          return '<label class="skill-checkbox-option">' +
            '<input type="checkbox" data-skill="' + esc(skill) + '" ' + (hasSkill(skill) ? "checked" : "") + ' onchange="handleSkillCatalogToggle(this)">' +
            '<span>' + esc(skill) + "</span>" +
          "</label>";
        }).join("") +
      "</div>" +
    "</div>";
  }).join("");
  if (!groupsHtml) {
    container.innerHTML = '<div class="hub-list-item"><div class="hub-list-title">Keine Katalog-Skills zum aktuellen Filter gefunden.</div><div class="hub-list-meta">Nutzen Sie den Freitext unten für seltene oder sehr kundenspezifische Spezialskills.</div></div>';
    return;
  }
  container.innerHTML = groupsHtml;
}

function renderSkillTags() {
  var el = document.getElementById("skillTagsList");
  var summaryEl = document.getElementById("skillSelectionSummary");
  if (!el) return;
  var catalogCount = _currentSkills.filter(function(skill) { return isCatalogSkill(skill); }).length;
  var customCount = Math.max(0, _currentSkills.length - catalogCount);
  if (summaryEl) {
    if (!_currentSkills.length) summaryEl.textContent = "Noch keine Skills ausgewählt.";
    else summaryEl.textContent = String(_currentSkills.length) + " Skills ausgewählt · " + String(catalogCount) + " aus dem Katalog" + (customCount ? " · " + String(customCount) + " individuell" : "");
  }
  if (!_currentSkills.length) {
    el.innerHTML = '<span style="color:var(--wk-text-muted);font-size:13px">Noch keine Skills ausgewählt. Wählen Sie passende Einsatzskills aus dem Katalog oder ergänzen Sie individuelle Spezialskills.</span>';
    return;
  }
  el.innerHTML = _currentSkills.map(function(skill, index) {
    var customClass = isCatalogSkill(skill) ? "" : " custom";
    var customBadge = isCatalogSkill(skill) ? "" : '<span class="skill-chip-note">individuell</span>';
    return '<span class="hub-chip' + customClass + '">' + esc(skill) + customBadge + '<button onclick="removeSkill(' + index + ')" style="background:none;border:none;color:var(--wk-text-muted);cursor:pointer;font-size:14px;padding:0;line-height:1">&times;</button></span>';
  }).join("");
}

function addSkillTag() {
  var input = document.getElementById("newSkillInput");
  var value = (input && input.value || "").trim();
  if (!value) return;
  addSkillValue(value);
  if (input) input.value = "";
  updateSkillSelectionViews();
}

function handleSkillCatalogToggle(input) {
  if (!input) return;
  var skill = input.getAttribute("data-skill") || "";
  if (input.checked) addSkillValue(skill);
  else removeSkillValue(skill);
  updateSkillSelectionViews();
}

function selectSkillGroup(groupId) {
  var group = getSkillCatalogMeta().groups[groupId];
  if (!group) return;
  var added = 0;
  var limitHit = false;
  group.skills.forEach(function(skill) {
    var alreadySelected = hasSkill(skill);
    if (addSkillValue(skill, { silentLimitToast: true })) added += 1;
    else if (!alreadySelected && _currentSkills.length >= MAX_SKILL_TAGS) limitHit = true;
  });
  updateSkillSelectionViews();
  if (limitHit) toast("Maximal 50 Skills pro Mitarbeiterprofil.", "err");
  else if (added > 0) toast(group.title + ": " + String(added) + " Skills übernommen.");
}

function clearSkillGroup(groupId) {
  var group = getSkillCatalogMeta().groups[groupId];
  if (!group) return;
  var before = _currentSkills.length;
  group.skills.forEach(function(skill) { removeSkillValue(skill); });
  updateSkillSelectionViews();
  if (before !== _currentSkills.length) toast(group.title + " geleert.");
}

function clearAllSkills() {
  if (!_currentSkills.length) return;
  setCurrentSkills([]);
  updateSkillSelectionViews();
  toast("Skill-Auswahl geleert.");
}

function removeSkill(index) {
  _currentSkills.splice(index, 1);
  _currentSkills = sortSkillList(_currentSkills);
  updateSkillSelectionViews();
}

function getDocumentsForQualification(name) {
  var key = String(name || "").trim().toLowerCase();
  if (!key) return [];
  return (_currentWorkerDocuments || []).filter(function(document) {
    return String(document.qualification_name || "").trim().toLowerCase() === key;
  });
}

function documentCategoryLabel(category) {
  var labels = {
    qualification: "Qualifikation",
    identity: "Identität",
    permit: "Erlaubnis",
    medical: "Medizin",
    training: "Training",
    other: "Sonstiges"
  };
  return labels[category] || "Dokument";
}

function documentStatusLabel(status) {
  var labels = {
    pending_review: "In Prüfung",
    verified: "Verifiziert",
    rejected: "Abgelehnt",
    archived: "Archiviert",
    expired: "Abgelaufen"
  };
  return labels[status] || status || "offen";
}

function documentBadgeClass(status) {
  if (status === "verified") return "good";
  if (status === "pending_review") return "warn";
  if (status === "expired" || status === "rejected") return "warn";
  return "info";
}

function formatFileSize(bytes) {
  var value = Number(bytes || 0);
  if (!value) return "ohne Dateigröße";
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  return Math.round(value / 1024) + " KB";
}

function renderQualifications() {
  var el = document.getElementById("qualificationsList");
  if (!el) return;
  if (!_currentQuals.length) {
    el.innerHTML = '<span style="color:var(--wk-text-muted);font-size:13px">Noch keine Qualifikationen eingetragen.</span>';
    return;
  }
  el.innerHTML = _currentQuals.map(function(qualification, index) {
    var linkedDocuments = getDocumentsForQualification(qualification.name);
    return '<div class="qualification-item">' +
      '<div class="hub-list-head">' +
        '<div class="hub-list-title">' + esc(qualification.name || "Unbenannt") + "</div>" +
        '<button onclick="removeQual(' + index + ')" style="background:none;border:none;color:var(--wk-text-muted);cursor:pointer;font-size:14px;line-height:1">&times;</button>' +
      "</div>" +
      '<div class="qualification-meta">' +
        (qualification.issuer ? '<span>Aussteller: ' + esc(qualification.issuer) + "</span>" : "") +
        (qualification.expires_at ? '<span>Gültig bis: ' + esc(formatDateLabel(qualification.expires_at)) + "</span>" : "") +
        (qualification.document_label ? '<span>Nachweis: ' + esc(qualification.document_label) + "</span>" : "") +
      "</div>" +
      (qualification.note ? '<div style="font-size:12px;color:var(--wk-text-muted)">' + esc(qualification.note) + "</div>" : "") +
      (linkedDocuments.length ? '<div style="font-size:12px;color:var(--wk-text-muted);margin-top:6px">Verknüpfte Nachweise: ' + linkedDocuments.map(function(document) {
        return esc(document.title || document.original_name || "Dokument") + ' (' + esc(documentStatusLabel(document.effective_status || document.status)) + ')';
      }).join(", ") + "</div>" : "") +
    "</div>";
  }).join("");
}

function addQualification() {
  var qualification = {
    name: (document.getElementById("newQualName").value || "").trim(),
    issuer: (document.getElementById("newQualIssuer").value || "").trim() || null,
    expires_at: (document.getElementById("newQualExpiry").value || "").trim() || null,
    document_label: (document.getElementById("newQualDocument").value || "").trim() || null,
    note: (document.getElementById("newQualNote").value || "").trim() || null
  };
  if (!qualification.name) return;
  _currentQuals.push(qualification);
  ["newQualName","newQualIssuer","newQualExpiry","newQualDocument","newQualNote"].forEach(function(id) {
    var field = document.getElementById(id);
    if (field) field.value = "";
  });
  renderQualifications();
  renderWorkerHubHeader(_currentSkillWorker);
}

function removeQual(index) {
  _currentQuals.splice(index, 1);
  renderQualifications();
  renderWorkerHubHeader(_currentSkillWorker);
}

function renderWorkerDocuments() {
  var statsEl = document.getElementById("workerDocumentStats");
  var listEl = document.getElementById("workerDocumentList");
  var summary = _currentWorkerDocumentSummary || { total: 0, verified: 0, pending_review: 0, expired: 0, expiring_soon: 0 };
  if (statsEl) {
    statsEl.innerHTML =
      '<span class="hub-badge info">Gesamt: ' + esc(String(summary.total || 0)) + "</span>" +
      '<span class="hub-badge good">Verifiziert: ' + esc(String(summary.verified || 0)) + "</span>" +
      '<span class="hub-badge warn">In Prüfung: ' + esc(String(summary.pending_review || 0)) + "</span>" +
      '<span class="hub-badge ' + ((summary.expired || 0) ? "warn" : "info") + '">Abgelaufen: ' + esc(String(summary.expired || 0)) + "</span>" +
      '<span class="hub-badge ' + ((summary.expiring_soon || 0) ? "warn" : "info") + '">Läuft bald ab: ' + esc(String(summary.expiring_soon || 0)) + "</span>";
  }
  if (!listEl) return;
  listEl.innerHTML = renderHubList(_currentWorkerDocuments || [], "Noch keine Nachweise hinterlegt.", function(document) {
    var validity = [];
    if (document.valid_from) validity.push("ab " + formatDateLabel(document.valid_from));
    if (document.valid_until) validity.push("bis " + formatDateLabel(document.valid_until));
    return '<div class="hub-list-item">' +
      '<div class="hub-list-head">' +
        '<div class="hub-list-title">' + esc(document.title || document.original_name || "Dokument") + "</div>" +
        '<span class="hub-badge ' + documentBadgeClass(document.effective_status || document.status) + '">' + esc(documentStatusLabel(document.effective_status || document.status)) + "</span>" +
      "</div>" +
      '<div class="hub-list-meta">' +
        esc(documentCategoryLabel(document.category)) +
        (document.issuer ? " · " + esc(document.issuer) : "") +
        (document.qualification_name ? " · " + esc(document.qualification_name) : "") +
        (validity.length ? " · " + esc(validity.join(" / ")) : "") +
      "</div>" +
      '<div style="font-size:12px;color:var(--wk-text-muted);margin-top:6px">' +
        esc(formatFileSize(document.file_size_bytes)) +
        (document.review_note ? " · " + esc(document.review_note) : "") +
      "</div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
        (document.download_path ? '<button class="btn" onclick="downloadWorkerDocument(\'' + esc(document.id) + '\')">Download</button>' : "") +
        '<button class="btn" onclick="verifyWorkerDocument(\'' + esc(document.id) + '\')">Verifizieren</button>' +
        '<button class="btn" onclick="rejectWorkerDocument(\'' + esc(document.id) + '\')">Ablehnen</button>' +
        '<button class="btn" onclick="deleteWorkerDocument(\'' + esc(document.id) + '\')">Löschen</button>' +
      "</div>" +
    "</div>";
  });
}

function uploadWorkerDocument() {
  if (!_currentSkillWorker) return;
  var fileInput = document.getElementById("workerDocumentFile");
  var file = fileInput && fileInput.files && fileInput.files[0];
  if (!file) {
    toast("Bitte eine Datei auswählen.", "err");
    return;
  }
  var formData = new FormData();
  formData.append("category", document.getElementById("workerDocumentCategory").value || "qualification");
  formData.append("title", (document.getElementById("workerDocumentTitle").value || "").trim());
  formData.append("qualification_name", (document.getElementById("workerDocumentQualification").value || "").trim());
  formData.append("issuer", (document.getElementById("workerDocumentIssuer").value || "").trim());
  formData.append("valid_from", document.getElementById("workerDocumentValidFrom").value || "");
  formData.append("valid_until", document.getElementById("workerDocumentValidUntil").value || "");
  formData.append("notes", (document.getElementById("workerDocumentNotes").value || "").trim());
  formData.append("file", file);
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents", { method: "POST", formData: formData }).then(function() {
    ["workerDocumentTitle", "workerDocumentQualification", "workerDocumentIssuer", "workerDocumentValidFrom", "workerDocumentValidUntil", "workerDocumentNotes"].forEach(function(id) {
      var field = document.getElementById(id);
      if (field) field.value = "";
    });
    if (fileInput) fileInput.value = "";
    toast("Nachweis hinterlegt.");
    loadWorkerSkills();
  }).catch(function(e) {
    var msg = e.error === "FILE_REQUIRED" ? "Bitte eine Datei auswählen."
            : e.error === "FILE_TOO_LARGE" ? "Datei ist zu groß (max. 10 MB)."
            : e.error === "INVALID_MIME" ? (e.message || "Dateityp nicht erlaubt.")
            : (e.message || e.error || "Nachweis konnte nicht gespeichert werden.");
    toast(msg, "err");
  });
}

function downloadWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  window.open("/api/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/download", "_blank", "noopener");
}

function verifyWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  var note = window.prompt("Optionale Verifikationsnotiz", "") || "";
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/verify", {
    method: "POST",
    body: { note: note.trim() || null }
  }).then(function() {
    toast("Nachweis verifiziert.");
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || "Nachweis konnte nicht verifiziert werden.", "err");
  });
}

function rejectWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  var note = window.prompt("Bitte Ablehnungsgrund eingeben", "");
  if (note === null) return;
  if (!String(note).trim()) {
    toast("Bitte einen Ablehnungsgrund angeben.", "err");
    return;
  }
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId) + "/reject", {
    method: "POST",
    body: { note: String(note).trim() }
  }).then(function() {
    toast("Nachweis abgelehnt.");
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || "Nachweis konnte nicht abgelehnt werden.", "err");
  });
}

function deleteWorkerDocument(documentId) {
  if (!_currentSkillWorker) return;
  if (!window.confirm("Nachweis wirklich löschen?")) return;
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id) + "/documents/" + encodeURIComponent(documentId), {
    method: "DELETE"
  }).then(function() {
    toast("Nachweis gelöscht.");
    loadWorkerSkills();
  }).catch(function(e) {
    toast(e.message || e.error || "Nachweis konnte nicht gelöscht werden.", "err");
  });
}

function renderWorkerLinkage(worker) {
  var el = document.getElementById("workerLinkageInfo");
  if (!el || !worker) return;
  var linkage = worker.linkage || {};
  var rows = [
    { label: "Account", value: linkage.email || worker.email || "–", meta: linkage.is_verified ? "verifiziert" : "nicht verifiziert" },
    { label: "Angelegt", value: formatDateLabel(linkage.account_created_at), meta: worker.supplier_org_name || "–" },
    { label: "Portal", value: linkage.worker_portal_path || "/public/einsatzportal-profil.html", meta: linkage.org_membership_active === false ? "Mitgliedschaft inaktiv" : "Portalzugang aktiv" },
    { label: "Freigabe", value: worker.profile_public ? "Extern freigegeben" : "Nur intern", meta: (worker.public_profile_preview && worker.public_profile_preview.public_fields || []).map(publicFieldLabel).join(", ") || "keine Felder" }
  ];
  el.innerHTML = rows.map(function(row) {
    return '<div class="hub-linkage-row"><div><strong>' + esc(row.label) + '</strong>' + esc(row.value || "–") + '</div><div style="font-size:12px;color:var(--wk-text-muted);text-align:right">' + esc(row.meta || "–") + "</div></div>";
  }).join("");
}

function getOperationalAssignmentBadge(item) {
  var today = new Date().toISOString().slice(0, 10);
  var state = item && item.assignment_lifecycle_state;
  if (!state) {
    if (item && item.assignment_status === "completed") state = "completed";
    else if (item && item.assignment_status === "cancelled") state = "cancelled";
    else if (item && item.is_active === false) state = "archived";
    else {
      var endDate = item && (item.assignment_effective_end_date || item.end_date || item.asg_end || null);
      if (endDate && endDate < today) state = "expired";
      else if (endDate && endDate === today) state = "ends_today";
      else state = "active";
    }
  }
  if (state === "ends_today") return { tone: "warn", label: "Endet heute" };
  if (state === "expired") return { tone: "warn", label: "Abgelaufen" };
  if (state === "completed") return { tone: "good", label: "Beendet" };
  if (state === "cancelled") return { tone: "warn", label: "Storniert" };
  if (state === "archived") return { tone: "info", label: "Archiv" };

  var confirmation = item && item.worker_confirmation_status;
  if (confirmation === "pending_confirmation") return { tone: "warn", label: "Bestätigung offen" };
  if (confirmation === "worker_unavailable") return { tone: "warn", label: "Abwesend" };
  if (confirmation === "worker_declined") return { tone: "warn", label: "Abgelehnt" };
  return { tone: "good", label: "Aktiv" };
}

function renderOperationalContext(worker) {
  var ops = worker.operational_context || {};
  var stats = document.getElementById("workerOpsStats");
  if (stats) {
    var correctionCount = ops.submission_status_counts && ops.submission_status_counts.needs_correction || 0;
    var submittedCount = ops.submission_status_counts && ops.submission_status_counts.submitted || 0;
    stats.innerHTML =
      '<span class="hub-badge info">Aktive Einsätze: ' + esc(String(ops.active_assignment_count || 0)) + "</span>" +
      '<span class="hub-badge warn">Offene Bestätigungen: ' + esc(String(ops.pending_confirmation_count || 0)) + "</span>" +
      '<span class="hub-badge info">Submitted: ' + esc(String(submittedCount)) + "</span>" +
      '<span class="hub-badge ' + (correctionCount ? "warn" : "good") + '">Korrekturen: ' + esc(String(correctionCount)) + "</span>";
  }
  var assignmentsEl = document.getElementById("workerAssignmentTimeline");
  if (assignmentsEl) {
    assignmentsEl.innerHTML = renderHubList(ops.recent_assignments || [], "Noch keine Einsatzverknüpfungen vorhanden.", function(item) {
      var badge = getOperationalAssignmentBadge(item);
      return '<div class="hub-list-item">' +
        '<div class="hub-list-head"><div class="hub-list-title">' + esc(item.client_display_name || item.client_name || item.worker_description || "Einsatz") + '</div><span class="hub-badge ' + esc(badge.tone) + '">' + esc(badge.label) + "</span></div>" +
        '<div class="hub-list-meta">' + esc(formatDateLabel(item.start_date)) + (item.end_date ? " – " + esc(formatDateLabel(item.end_date)) : "") + (item.location_address ? " · " + esc(item.location_address) : "") + "</div>" +
      "</div>";
    });
  }
  var submissionsEl = document.getElementById("workerSubmissionTimeline");
  if (submissionsEl) {
    submissionsEl.innerHTML = renderHubList(ops.recent_submissions || [], "Noch keine Worker-Submissions vorhanden.", function(item) {
      return '<div class="hub-list-item">' +
        '<div class="hub-list-head"><div class="hub-list-title">KW ' + esc(formatDateLabel(item.week_start)) + " – " + esc(formatDateLabel(item.week_end)) + '</div><span class="hub-badge ' + (item.status === "needs_correction" ? "warn" : "info") + '">' + esc(item.status || "offen") + "</span></div>" +
        '<div class="hub-list-meta">' + esc(String(item.total_hours || 0)) + " h · " + esc(item.client_name || item.supplier_name || "ohne Einsatz") + "</div>" +
      "</div>";
    });
  }
}

function fillWorkerHubForm(worker) {
  document.getElementById("profilePhone").value = worker.phone || "";
  document.getElementById("profileBirthDate").value = formatDateInput(worker.date_of_birth);
  document.getElementById("profileStreet").value = worker.street || "";
  document.getElementById("profilePostal").value = worker.postal_code || "";
  document.getElementById("profileCity").value = worker.city || "";
  document.getElementById("profileLocale").value = worker.preferred_locale || "";
  document.getElementById("availabilityNoteInput").value = worker.availability_note || "";
  document.getElementById("profileTextarea").value = worker.profile_text || "";
  document.getElementById("profileNotes").value = worker.notes || "";
  document.getElementById("profilePublic").checked = !!worker.profile_public;
  setPublicFieldSelection((worker.public_profile_preview && worker.public_profile_preview.public_fields) || worker.public_profile_fields || []);
}

function loadWorkerSkills() {
  var sel = document.getElementById("skillsWorkerSelect");
  var id = sel && sel.value;
  var panel = document.getElementById("skillsWorkerPanel");
  var hint = document.getElementById("skillsEmptyHint");
  if (!id) {
    if (panel) panel.style.display = "none";
    if (hint) hint.style.display = "";
    return;
  }
  api("/workers/" + encodeURIComponent(id)).then(function(worker) {
    _currentSkillWorker = worker;
    setCurrentSkills((worker.skill_tags || []).slice());
    _currentQuals = (worker.qualifications || []).slice();
    _currentWorkerDocuments = (worker.document_hub && worker.document_hub.recent_documents || []).slice();
    _currentWorkerDocumentSummary = worker.document_hub && worker.document_hub.summary || null;
    if (panel) panel.style.display = "";
    if (hint) hint.style.display = "none";
    fillWorkerHubForm(worker);
    renderSkillCatalog();
    renderSkillTags();
    renderQualifications();
    renderWorkerDocuments();
    renderWorkerHubHeader(worker);
    renderWorkerLinkage(worker);
    renderOperationalContext(worker);
    updatePublicProfileControls();
  }).catch(function(e) {
    toast(e.message || e.error || "Profil konnte nicht geladen werden.", "err");
  });
}

function saveWorkerHub() {
  if (!_currentSkillWorker) return;
  var isPublic = !!document.getElementById("profilePublic").checked;
  var publicFields = getSelectedPublicFields();
  if (isPublic && publicFields.length === 0) {
    toast("Bitte mindestens ein Feld für die externe Freigabe auswählen.", "err");
    return;
  }
  var body = {
    phone: document.getElementById("profilePhone").value.trim() || null,
    date_of_birth: document.getElementById("profileBirthDate").value || null,
    street: document.getElementById("profileStreet").value.trim() || null,
    postal_code: document.getElementById("profilePostal").value.trim() || null,
    city: document.getElementById("profileCity").value.trim() || null,
    preferred_locale: document.getElementById("profileLocale").value.trim() || null,
    availability_note: document.getElementById("availabilityNoteInput").value.trim() || null,
    profile_text: document.getElementById("profileTextarea").value.trim() || null,
    notes: document.getElementById("profileNotes").value.trim() || null,
    skill_tags: _currentSkills.slice(),
    qualifications: _currentQuals.slice(),
    profile_public: isPublic,
    public_profile_fields: publicFields
  };
  api("/workers/" + encodeURIComponent(_currentSkillWorker.user_id || _currentSkillWorker.id), { method: "PATCH", body: body }).then(function(worker) {
    _currentSkillWorker = worker;
    setCurrentSkills((worker.skill_tags || []).slice());
    _currentQuals = (worker.qualifications || []).slice();
    _currentWorkerDocuments = (worker.document_hub && worker.document_hub.recent_documents || []).slice();
    _currentWorkerDocumentSummary = worker.document_hub && worker.document_hub.summary || null;
    fillWorkerHubForm(worker);
    renderSkillCatalog();
    renderSkillTags();
    renderQualifications();
    renderWorkerDocuments();
    renderWorkerHubHeader(worker);
    renderWorkerLinkage(worker);
    renderOperationalContext(worker);
    updatePublicProfileControls();
    loadWorkers();
    populateSkillsWorkerSelect();
    toast("Profil-Hub gespeichert!");
  }).catch(function(e) {
    var msg = e.error === "PUBLIC_FIELDS_REQUIRED" ? "Bitte mindestens ein freigegebenes Feld definieren."
            : e.error === "NO_FIELDS" ? "Keine Änderungen zum Speichern erkannt."
            : (e.message || e.error || "Fehler beim Speichern");
    toast(msg, "err");
  });
}

function copyPublicProfileLink() {
  var link = document.getElementById("publicProfileLink");
  if (!document.getElementById("profilePublic").checked || !link || !link.value) {
    toast("Keine aktive externe Freigabe vorhanden.", "err");
    return;
  }
  function fallbackCopy() {
    link.focus();
    link.select();
    try {
      document.execCommand("copy");
      toast("Link kopiert.");
    } catch (_) {
      toast("Link konnte nicht kopiert werden.", "err");
    }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link.value).then(function() {
      toast("Link kopiert.");
    }).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function saveSkills() { saveWorkerHub(); }
function saveProfile() { saveWorkerHub(); }

/* ══════════════════════════════════════════════════════════
   CSV-Import Wizard
   ══════════════════════════════════════════════════════════ */
var _csvData = { headers: [], rows: [], mapping: {}, validated: [], dupInfo: {} };

var CSV_FIELDS = [
  { key: "email",            label: "E-Mail *",         required: true,  aliases: ["email","e-mail","mail","e_mail","emailaddress","e-mailadresse"] },
  { key: "first_name",       label: "Vorname *",        required: true,  aliases: ["first_name","vorname","firstname","given_name","givenname","vname"] },
  { key: "last_name",        label: "Nachname *",       required: true,  aliases: ["last_name","nachname","lastname","surname","family_name","familyname","nname","zuname"] },
  { key: "personnel_number", label: "Personalnummer",   required: false, aliases: ["personnel_number","personalnummer","personnelnumber","personal_nr","personnr","pnr","mitarbeiter_nr","employee_id","mitarbeiternummer","staffnr"] },
  { key: "phone",            label: "Telefon",          required: false, aliases: ["phone","telefon","tel","telephone","mobile","handy","mobilnummer","mobiltelefon","rufnummer"] },
  { key: "street",           label: "Stra\u00dfe",           required: false, aliases: ["street","strasse","stra\u00dfe","address","adresse","anschrift"] },
  { key: "postal_code",      label: "PLZ",              required: false, aliases: ["postal_code","plz","postalcode","zip","zipcode","postleitzahl"] },
  { key: "city",             label: "Stadt",            required: false, aliases: ["city","stadt","ort","wohnort","location","standort"] },
  { key: "country",          label: "Land",             required: false, aliases: ["country","land","laendercode","countrycode"] },
  { key: "date_of_birth",    label: "Geburtsdatum",     required: false, aliases: ["date_of_birth","geburtsdatum","dob","birthday","birthdate","geburtstag","geb_datum"] },
  { key: "notes",            label: "Notizen",          required: false, aliases: ["notes","notizen","bemerkung","kommentar","comment","anmerkung","info"] }
];
// Enterprise: Zusaetzliche Felder koennen per Org-Konfiguration hinzugefuegt werden
// z.B. Abteilung, Kostenstelle, Qualifikation, Fuehrerschein etc.
// Die API akzeptiert beliebige Zusatzfelder im 'notes' Feld als JSON-Erweiterung.

/* ── CSV Parsing ─────────────────────────────────────── */
function csvDetectDelimiter(text) {
  var first = text.split(/\r?\n/)[0] || "";
  var counts = { ";":0, ",":0, "\t":0 };
  for (var i = 0; i < first.length; i++) {
    if (counts[first[i]] !== undefined) counts[first[i]]++;
  }
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] >= counts[","]) return "\t";
  return ",";
}

function csvParseLine(line, delim) {
  var fields = [];
  var current = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === delim) { fields.push(current.trim()); current = ""; }
      else { current += c; }
    }
  }
  fields.push(current.trim());
  return fields;
}

function csvParseText(text) {
  var delim = csvDetectDelimiter(text);
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim() !== ""; });
  if (lines.length < 2) { toast("CSV muss mindestens eine Kopfzeile und eine Datenzeile enthalten.", "err"); return false; }
  if (lines.length > 1001) { toast("Max. 1000 Datens\u00e4tze erlaubt (" + (lines.length - 1) + " gefunden).", "err"); return false; }
  var headers = csvParseLine(lines[0], delim);
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = csvParseLine(lines[i], delim);
    if (vals.length === 1 && vals[0] === "") continue;
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = (vals[j] || "").trim();
    }
    row._row = i + 1;
    rows.push(row);
  }
  _csvData.headers = headers;
  _csvData.rows = rows;
  return true;
}

/* ── Drag & Drop / File Input ────────────────────────── */
function csvInitUpload() {
  var dz = document.getElementById("csv-dropzone");
  var fi = document.getElementById("csv-file-input");
  dz.addEventListener("click", function() { fi.click(); });
  dz.addEventListener("dragover", function(e) { e.preventDefault(); dz.style.borderColor = "var(--tc-tone-brand-border)"; });
  dz.addEventListener("dragleave", function() { dz.style.borderColor = "var(--tc-dash-border)"; });
  dz.addEventListener("drop", function(e) {
    e.preventDefault(); dz.style.borderColor = "var(--tc-dash-border)";
    if (e.dataTransfer.files.length) csvHandleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener("change", function() {
    if (fi.files.length) csvHandleFile(fi.files[0]);
  });
}

function csvHandleFile(file) {
  if (!file.name.match(/\.(csv|txt)$/i)) { toast("Bitte eine .csv-Datei w\u00e4hlen.", "err"); return; }
  if (file.size > 5 * 1024 * 1024) { toast("Datei zu gro\u00df (max. 5 MB).", "err"); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    if (csvParseText(text)) {
      document.getElementById("csv-file-name").textContent = file.name;
      document.getElementById("csv-file-meta").textContent = _csvData.rows.length + " Datens\u00e4tze \u00b7 " + _csvData.headers.length + " Spalten";
      document.getElementById("csv-file-info").style.display = "block";
      setTimeout(function() { csvGoStep(2); }, 400);
    }
  };
  reader.readAsText(file, "UTF-8");
}

/* ── Step Navigation ─────────────────────────────────── */
function csvGoStep(n) {
  for (var s = 1; s <= 4; s++) {
    var panel = document.getElementById("csv-step-" + s);
    if (panel) panel.style.display = s === n ? "block" : "none";
  }
  document.querySelectorAll("#csv-steps .csv-step").forEach(function(el) {
    var step = parseInt(el.getAttribute("data-step"));
    el.className = "csv-step" + (step === n ? " csv-step--active" : (step < n ? " csv-step--done" : ""));
  });
  if (n === 2) csvBuildMapping();
  if (n === 3) csvRunValidation();
}

/* ── Step 2: Column Mapping ──────────────────────────── */
function csvAutoMap() {
  var mapping = {};
  _csvData.headers.forEach(function(h) {
    var lower = h.toLowerCase().replace(/[^a-z0-9_äöüß]/g, "");
    for (var i = 0; i < CSV_FIELDS.length; i++) {
      var f = CSV_FIELDS[i];
      for (var j = 0; j < f.aliases.length; j++) {
        if (lower === f.aliases[j].replace(/[^a-z0-9_äöüß]/g, "")) {
          if (!mapping[h]) mapping[h] = f.key;
          break;
        }
      }
    }
  });
  return mapping;
}

function csvBuildMapping() {
  _csvData.mapping = csvAutoMap();
  var grid = document.getElementById("csv-mapping-grid");
  var html = '<div style="font-size:11px;font-weight:700;color:var(--wk-text-muted);text-transform:uppercase">CSV-Spalte</div>' +
             '<div></div>' +
             '<div style="font-size:11px;font-weight:700;color:var(--wk-text-muted);text-transform:uppercase">TempConnect-Feld</div>';
  _csvData.headers.forEach(function(h) {
    var sample = "";
    for (var i = 0; i < Math.min(3, _csvData.rows.length); i++) {
      if (_csvData.rows[i][h]) { sample = _csvData.rows[i][h]; break; }
    }
    html += '<div class="csv-mapping-row">';
    html += '<div class="csv-col-name">' + esc(h) + (sample ? '<br><span style="font-size:11px;color:var(--wk-text-muted);font-weight:400">z.B. ' + esc(sample) + '</span>' : '') + '</div>';
    html += '<div class="csv-arrow">\u2192</div>';
    html += '<select onchange="csvUpdateMapping(\'' + esc(h).replace(/'/g, "\\'") + '\', this.value)">';
    html += '<option value="">— Nicht importieren —</option>';
    CSV_FIELDS.forEach(function(f) {
      var sel = (_csvData.mapping[h] === f.key) ? ' selected' : '';
      html += '<option value="' + f.key + '"' + sel + '>' + esc(f.label) + '</option>';
    });
    html += '</select>';
    html += '</div>';
  });
  grid.innerHTML = html;
}

function csvUpdateMapping(csvCol, fieldKey) {
  if (fieldKey) {
    Object.keys(_csvData.mapping).forEach(function(k) {
      if (_csvData.mapping[k] === fieldKey && k !== csvCol) delete _csvData.mapping[k];
    });
    _csvData.mapping[csvCol] = fieldKey;
  } else {
    delete _csvData.mapping[csvCol];
  }
  csvBuildMapping();
}

/* ── Step 3: Validation ──────────────────────────────── */
function csvRunValidation() {
  var mappedFields = {};
  Object.keys(_csvData.mapping).forEach(function(csvCol) {
    mappedFields[_csvData.mapping[csvCol]] = csvCol;
  });
  var required = CSV_FIELDS.filter(function(f) { return f.required; });
  var missingRequired = required.filter(function(f) { return !mappedFields[f.key]; });
  if (missingRequired.length > 0) {
    toast("Pflichtfelder nicht zugeordnet: " + missingRequired.map(function(f) { return f.label; }).join(", "), "err");
    csvGoStep(2);
    return;
  }

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var validated = [];
  var okCount = 0;
  var errCount = 0;
  var emails = {};

  _csvData.rows.forEach(function(row) {
    var rec = { _row: row._row, _errors: [], _data: {} };
    CSV_FIELDS.forEach(function(f) {
      var csvCol = mappedFields[f.key];
      var val = csvCol ? (row[csvCol] || "").trim() : "";
      if (f.required && !val) { rec._errors.push(f.label.replace(" *","") + " fehlt"); }
      if (f.key === "email" && val && !emailRe.test(val)) { rec._errors.push("Ung\u00fcltige E-Mail"); }
      if (f.key === "email" && val) {
        var lower = val.toLowerCase();
        if (emails[lower]) { rec._errors.push("Doppelte E-Mail in CSV (Zeile " + emails[lower] + ")"); }
        else { emails[lower] = row._row; }
      }
      rec._data[f.key] = val;
    });
    if (rec._errors.length > 0) errCount++; else okCount++;
    validated.push(rec);
  });
  _csvData.validated = validated;

  var summary = document.getElementById("csv-validation-summary");
  summary.innerHTML =
    '<div class="csv-kpi info"><span class="num">' + validated.length + '</span> Gesamt</div>' +
    '<div class="csv-kpi ok"><span class="num">' + okCount + '</span> G\u00fcltig</div>' +
    '<div class="csv-kpi err"><span class="num">' + errCount + '</span> Fehler</div>';

  csvCheckDuplicates(function(dupInfo) {
    _csvData.dupInfo = dupInfo || {};
    var dupCount = Object.keys(_csvData.dupInfo).length;
    if (dupCount > 0) {
      summary.innerHTML += '<div class="csv-kpi dup"><span class="num">' + dupCount + '</span> Duplikate</div>';
    }
    csvRenderValidationTable();
    document.getElementById("csv-btn-import").disabled = (okCount === 0 && errCount > 0);
  });
}

function csvCheckDuplicates(cb) {
  var emails = _csvData.validated
    .filter(function(r) { return r._data.email && r._errors.length === 0; })
    .map(function(r) { return r._data.email; });
  if (emails.length === 0) { cb({}); return; }
  api("/workers/check-duplicates", { method: "POST", body: { emails: emails } })
    .then(function(res) { cb(res.duplicates || {}); })
    .catch(function() { cb({}); });
}

function csvRenderValidationTable() {
  var el = document.getElementById("csv-validation-table");
  var html = '<table class="w-table"><thead><tr><th>#</th><th>E-Mail</th><th>Vorname</th><th>Nachname</th><th>Status</th></tr></thead><tbody>';
  _csvData.validated.forEach(function(rec) {
    var email = rec._data.email || "";
    var isDup = _csvData.dupInfo[email.toLowerCase()];
    var hasErr = rec._errors.length > 0;
    var statusHtml;
    if (hasErr) {
      statusHtml = '<span class="csv-val-err">\u2716 ' + esc(rec._errors[0]) + (rec._errors.length > 1 ? ' (+' + (rec._errors.length - 1) + ')' : '') + '</span>';
    } else if (isDup) {
      statusHtml = '<span class="csv-val-dup">\u2194 Duplikat</span>';
    } else {
      statusHtml = '<span class="csv-val-ok">\u2714 OK</span>';
    }
    html += '<tr><td>' + rec._row + '</td><td class="meta">' + esc(email) + '</td><td>' + esc(rec._data.first_name) + '</td><td>' + esc(rec._data.last_name) + '</td><td>' + statusHtml + '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ── Step 4: Execute Import ──────────────────────────── */
function csvExecuteImport() {
  var btn = document.getElementById("csv-btn-import");
  btn.disabled = true;
  btn.textContent = "Importiere...";
  csvGoStep(4);

  var progress = document.getElementById("csv-progress");
  var bar = document.getElementById("csv-progress-bar");
  var ptext = document.getElementById("csv-progress-text");
  progress.style.display = "block";
  bar.style.width = "20%";
  ptext.textContent = "Daten werden \u00fcbertragen...";

  var strategy = document.getElementById("csv-dup-strategy").value;
  var workers = _csvData.validated
    .filter(function(r) { return r._errors.length === 0; })
    .map(function(r) {
      var clean = {};
      Object.keys(r._data).forEach(function(k) {
        var v = r._data[k];
        clean[k] = (v === "" || v === undefined) ? null : v;
      });
      return clean;
    });

  if (workers.length === 0) {
    bar.style.width = "100%";
    ptext.textContent = "Keine g\u00fcltigen Datens\u00e4tze zum Importieren.";
    document.getElementById("csv-result-summary").innerHTML = '<div class="csv-kpi err"><span class="num">0</span> Keine g\u00fcltigen Datens\u00e4tze</div>';
    return;
  }

  bar.style.width = "50%";
  ptext.textContent = "Importiere " + workers.length + " Datens\u00e4tze...";

  api("/workers/import", { method: "POST", body: { workers: workers, on_duplicate: strategy } })
    .then(function(res) {
      bar.style.width = "100%";
      ptext.textContent = "Import abgeschlossen!";
      csvShowResult(res);
    })
    .catch(function(e) {
      bar.style.width = "100%";
      bar.style.background = "var(--tc-tone-danger-border)";
      var msg = e.error === "FEATURE_NOT_AVAILABLE" ? "Worker-Modul nicht verf\u00fcgbar. Bitte Plan upgraden (PLUS/PRO)."
              : e.error === "WORKER_LIMIT_EXCEEDED" ? "Mitarbeiter-Limit erreicht."
              : (e.message || e.error || "Import fehlgeschlagen");
      showWorkerUpgradeFromError(e);
      ptext.textContent = "Fehler: " + msg;
      document.getElementById("csv-result-summary").innerHTML = '<div class="csv-kpi err" style="width:100%"><span class="num">!</span> ' + esc(msg) + '</div>';
    });
}

function csvShowResult(res) {
  var summary = document.getElementById("csv-result-summary");
  var created = (res.created || []).length;
  var updated = (res.updated || []).length;
  var skipped = (res.skipped || []).length;
  var errors  = (res.errors  || []).length;
  summary.innerHTML =
    '<div class="csv-kpi ok"><span class="num">' + created + '</span> Erstellt</div>' +
    '<div class="csv-kpi info"><span class="num">' + updated + '</span> Aktualisiert</div>' +
    '<div class="csv-kpi dup"><span class="num">' + skipped + '</span> \u00dcbersprungen</div>' +
    (errors > 0 ? '<div class="csv-kpi err"><span class="num">' + errors + '</span> Fehler</div>' : '');

  var details = document.getElementById("csv-result-details");
  var html = '';
  if (res.errors && res.errors.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-danger-strong-text);margin:0 0 8px">Fehler</h3>';
    html += '<div style="margin-bottom:16px">';
    res.errors.forEach(function(err) {
      html += '<div style="padding:6px 10px;margin-bottom:4px;border-radius:8px;background:var(--tc-tone-danger-bg);border:1px solid var(--tc-tone-danger-border);font-size:12px">';
      html += '<strong>Zeile ' + (err.row || '?') + ':</strong> ' + esc(err.error || err.message || 'Unbekannter Fehler');
      if (err.email) html += ' <span style="color:var(--wk-text-muted)">(' + esc(err.email) + ')</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  if (res.created && res.created.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-success-strong-text);margin:0 0 8px">Erstellt (' + res.created.length + ')</h3>';
    html += '<div style="margin-bottom:16px;font-size:12px;color:var(--wk-text-muted)">';
    res.created.slice(0, 20).forEach(function(w) {
      html += '<div>' + esc(w.email || w.first_name + ' ' + w.last_name) + '</div>';
    });
    if (res.created.length > 20) html += '<div>... und ' + (res.created.length - 20) + ' weitere</div>';
    html += '</div>';
  }
  if (res.updated && res.updated.length > 0) {
    html += '<h3 style="font-size:14px;font-weight:700;color:var(--tc-tone-brand-text);margin:0 0 8px">Aktualisiert (' + res.updated.length + ')</h3>';
    html += '<div style="margin-bottom:16px;font-size:12px;color:var(--wk-text-muted)">';
    res.updated.slice(0, 20).forEach(function(w) {
      html += '<div>' + esc(w.email || w.first_name + ' ' + w.last_name) + '</div>';
    });
    if (res.updated.length > 20) html += '<div>... und ' + (res.updated.length - 20) + ' weitere</div>';
    html += '</div>';
  }
  details.innerHTML = html;
}

/* ── Reset Wizard ────────────────────────────────────── */
function csvReset() {
  _csvData = { headers: [], rows: [], mapping: {}, validated: [], dupInfo: {} };
  document.getElementById("csv-file-input").value = "";
  document.getElementById("csv-file-info").style.display = "none";
  document.getElementById("csv-mapping-grid").innerHTML = "";
  document.getElementById("csv-validation-summary").innerHTML = "";
  document.getElementById("csv-validation-table").innerHTML = "";
  document.getElementById("csv-result-summary").innerHTML = "";
  document.getElementById("csv-result-details").innerHTML = "";
  document.getElementById("csv-progress").style.display = "none";
  document.getElementById("csv-progress-bar").style.width = "0%";
  document.getElementById("csv-progress-bar").style.background = "linear-gradient(90deg,var(--ds-brand),var(--ds-success))";
  document.getElementById("csv-btn-import").disabled = true;
  document.getElementById("csv-btn-import").textContent = "Import starten";
  csvGoStep(1);
}

/* ── Expose functions called from HTML onclick handlers ──── */
window.showTab = showTab;
window.filterWorkers = filterWorkers;
window.createWorker = createWorker;
window.inviteWorker = inviteWorker;
window.resendInvite = resendInvite;
window.revokeInvite = revokeInvite;
window.toggleActive = toggleActive;
window.openEdit = openEdit;
window.saveEdit = saveEdit;
window.populateSkillsWorkerSelect = populateSkillsWorkerSelect;
window.loadWorkerSkills = loadWorkerSkills;
window.openWorkerProfileHub = openWorkerProfileHub;
window.resetWorkerHubSelection = resetWorkerHubSelection;
window.renderSkillCatalog = renderSkillCatalog;
window.handleSkillCatalogToggle = handleSkillCatalogToggle;
window.selectSkillGroup = selectSkillGroup;
window.clearSkillGroup = clearSkillGroup;
window.clearAllSkills = clearAllSkills;
window.addSkillTag = addSkillTag;
window.removeSkill = removeSkill;
window.addQualification = addQualification;
window.removeQual = removeQual;
window.uploadWorkerDocument = uploadWorkerDocument;
window.downloadWorkerDocument = downloadWorkerDocument;
window.verifyWorkerDocument = verifyWorkerDocument;
window.rejectWorkerDocument = rejectWorkerDocument;
window.deleteWorkerDocument = deleteWorkerDocument;
window.updatePublicProfileControls = updatePublicProfileControls;
window.saveWorkerHub = saveWorkerHub;
window.copyPublicProfileLink = copyPublicProfileLink;
window.saveSkills = saveSkills;
window.saveProfile = saveProfile;
window.csvUpdateMapping = csvUpdateMapping;
window.csvExecuteImport = csvExecuteImport;
window.csvReset = csvReset;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function() { init(); csvInitUpload(); renderSkillCatalog(); });
} else {
  init(); csvInitUpload(); renderSkillCatalog();
}
