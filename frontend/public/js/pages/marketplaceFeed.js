/* ═══════════════════════════════════════════════════════
   Marketplace Feed — Page Logic
   ═══════════════════════════════════════════════════════ */
(function() {
  'use strict';

  var PAGE_SIZE = 25;
  var currentPage = 1;

  function esc(s) { return s == null ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmtDate(d) { return d ? String(d).substring(0,10) : "?"; }
  function todayDateString() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, "0");
    var day = String(now.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }
  function toAssetUrl(rawPath) {
    var p = String(rawPath || "");
    if (!p) return "";
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
    return "/" + p;
  }
  function count(value, fallback) {
    var num = Number(value);
    return isFinite(num) ? Math.max(0, Math.trunc(num)) : fallback;
  }
  function totalHeadcount(entry) {
    return Math.max(1, count(entry && entry.headcount, 1));
  }
  function remainingHeadcount(entry) {
    if (!entry) return 1;
    if (entry.remaining_headcount != null) return Math.max(0, count(entry.remaining_headcount, 0));
    return totalHeadcount(entry);
  }
  function committedHeadcount(entry) {
    if (!entry) return 0;
    if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
    return 0;
  }
  function demandTotalHeadcount(entry) {
    return Math.max(1, count(entry && (entry.required_total_count != null ? entry.required_total_count : entry.headcount), 1));
  }
  function demandRemainingHeadcount(entry) {
    if (!entry) return 1;
    if (entry.remaining_open_count != null) return Math.max(0, count(entry.remaining_open_count, 0));
    return demandTotalHeadcount(entry);
  }
  function demandCommittedHeadcount(entry) {
    if (!entry) return 0;
    if (entry.currently_committed_count != null) return Math.max(0, count(entry.currently_committed_count, 0));
    if (entry.committed_headcount != null) return Math.max(0, count(entry.committed_headcount, 0));
    return 0;
  }
  function supplyHeadcountLabel(entry) {
    var total = totalHeadcount(entry);
    var remaining = remainingHeadcount(entry);
    var committed = committedHeadcount(entry);
    if (entry && (entry.status === "reserved" || committed > 0 || remaining !== total)) {
      return remaining + " frei / " + total + " gesamt" + (committed > 0 ? " · " + committed + " dealgebunden" : "");
    }
    return total + " Personen";
  }
  function demandHeadcountLabel(entry) {
    var total = demandTotalHeadcount(entry);
    var remaining = demandRemainingHeadcount(entry);
    var committed = demandCommittedHeadcount(entry);
    if (entry && (entry.status === "partially_covered" || committed > 0 || remaining !== total)) {
      return remaining + " offen / " + total + " gesamt" + (committed > 0 ? " · " + committed + " gebunden" : "");
    }
    return total + " Personen";
  }

  var SHIFT_LABELS = { day:"Tagschicht", night:"Nachtschicht", rotating:"Wechselschicht", flexible:"Flexibel", weekend:"Wochenende", on_call:"Bereitschaft" };
  var EMPLOYMENT_LABELS = { temporary:"ANUe", contract:"Werkvertrag", temp_to_perm:"Temp-to-Perm", project:"Projekt", on_call:"Abruf" };
  var COMPLIANCE_LABELS = { unknown:"Unbekannt", pending:"In Pruefung", partial:"Teilweise", complete:"Vollstaendig" };
  var COMPLIANCE_COLORS = { complete:"--green", partial:"--yellow", pending:"--yellow", unknown:"--grey" };

  function freshnessHtml(ts) {
    if (!ts) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span></span>';
    var h = (Date.now() - new Date(ts).getTime()) / 36e5;
    if (h < 48) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--fresh"></span>Aktuell</span>';
    if (h < 96) return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--aging"></span></span>';
    return '<span class="ce-freshness"><span class="ce-freshness__dot ce-freshness__dot--stale"></span></span>';
  }

  var GRADE_COLORS = {
    PLATINUM: { bg: 'rgba(168,85,247,.12)', fg: '#a855f7' },
    GOLD:     { bg: 'rgba(234,179,8,.12)',   fg: '#eab308' },
    SILVER:   { bg: 'rgba(148,163,184,.12)', fg: '#94a3b8' },
    BRONZE:   { bg: 'rgba(180,83,9,.12)',    fg: '#b45309' }
  };

  var PREMIUM_TIERS = {
    ENTERPRISE: { css: 'ce-premium-badge--enterprise', label: '&#9733; PARTNER: INDIVIDUELLER TARIF', cardCss: 'ce-card--premium-enterprise' },
    PRO:        { css: 'ce-premium-badge--pro',        label: '&#9733; PREMIUM PRO',       cardCss: 'ce-card--premium-pro' },
    PLUS:       { css: 'ce-premium-badge--plus',       label: '&#9733; PREMIUM',           cardCss: 'ce-card--premium-plus' }
  };

  // Gegenseitenorientierte Labels
  var FEED_TYPE_LABELS = {
    supply: { badge: '&#128188; Zeitarbeitsangebot', badgeCls: 'ce-type-badge--supply', label: 'Angebot einer Zeitarbeitsfirma' },
    demand: { badge: '&#128270; Arbeitsplatzangebot', badgeCls: 'ce-type-badge--demand', label: 'Arbeitsplatzangebot eines Unternehmens' }
  };

  function premiumBadgeHtml(item) {
    if (!item || !item.subscription_plan) return "";
    var tier = PREMIUM_TIERS[item.subscription_plan];
    if (!tier) return "";
    return '<span class="ce-premium-badge ' + tier.css + '">' + tier.label + '</span>';
  }

  function premiumCardClass(item) {
    if (!item || !item.subscription_plan) return "";
    var tier = PREMIUM_TIERS[item.subscription_plan];
    return tier ? " " + tier.cardCss : "";
  }

  function reputationBadgeHtml(item) {
    if (!item || !item.reputation_grade || item.reputation_grade === 'UNRATED') return "";
    var g = GRADE_COLORS[item.reputation_grade] || GRADE_COLORS.BRONZE;
    var html = '<span class="ds-trust-badge" style="background:' + g.bg + ';color:' + g.fg + ';font-weight:700">&#9733; ';
    if (item.reputation_score != null) html += Math.round(item.reputation_score) + ' ';
    html += item.reputation_grade + '</span>';
    if (item.deal_success_rate != null) {
      html += '<span class="ds-trust-badge" style="font-size:11px">' + Math.round(item.deal_success_rate) + '% Erfolg</span>';
    }
    return html;
  }

  function trustBadges(ts) {
    if (!ts) return "";
    var html = "";
    if (ts.supplier_verified) html += '<span class="ds-trust-badge ds-trust-badge--verified">&#10003; Verifiziert</span>';
    if (ts.compliance_complete) html += '<span class="ds-trust-badge ds-trust-badge--compliance">Compliance</span>';
    if (ts.active_subscriber) html += '<span class="ds-trust-badge ds-trust-badge--active">Aktiver Abonnent</span>';
    if (ts.completed_deals > 0) html += '<span class="ds-trust-badge ds-trust-badge--deals">' + ts.completed_deals + ' Deals</span>';
    if (ts.recently_confirmed) html += '<span class="ds-trust-badge ds-trust-badge--response">Kuerzlich bestaetigt</span>';
    return html;
  }

  function previewPlaceholderHtml(e) {
    var label = e.feed_type === "demand" ? "Nachfrage" : "Angebot";
    return '<div class="ce-card__preview-fallback" data-preview-placeholder="1">' +
      '<span class="ce-card__preview-fallback-icon" aria-hidden="true">&#128247;</span>' +
      '<span class="ce-card__preview-fallback-label">' + esc(label) + '</span>' +
      '</div>';
  }

  function renderCard(e) {
    var shift = e.shift_model ? SHIFT_LABELS[e.shift_model] || e.shift_model : null;
    var compLabel = COMPLIANCE_LABELS[e.compliance_status] || "";
    var compColor = COMPLIANCE_COLORS[e.compliance_status] || "--grey";
    var totalPeople = totalHeadcount(e);
    var freePeople = remainingHeadcount(e);
    var committedPeople = committedHeadcount(e);
    var priceHtml = "";
    if (e.price_hint) { priceHtml = esc(e.price_hint); }
    else if (e.price_min != null || e.price_max != null) {
      var parts = [];
      if (e.price_min != null) parts.push("ab " + Number(e.price_min).toFixed(2) + " EUR");
      if (e.price_max != null) parts.push("bis " + Number(e.price_max).toFixed(2) + " EUR");
      priceHtml = parts.join(" ");
    }

    var isDemandCard = e.feed_type === 'demand';
    var rankLabels = Array.isArray(e.rank_labels) ? e.rank_labels.slice(0, 3) : [];
    var cardStyle = isDemandCard ? 'border-left:3px solid #fb923c;background:rgba(251,146,60,.03)' : '';
    var premCls = premiumCardClass(e);
    var demandRemaining = demandRemainingHeadcount(e);
    var demandCommitted = demandCommittedHeadcount(e);
    var html = '<div class="ce-card' + premCls + '" data-id="' + esc(e.id) + '" data-feed-type="' + (e.feed_type || 'supply') + '"' + (cardStyle ? ' style="' + cardStyle + '"' : '') + '>';
    html += '<div class="ce-card__layout">';
    html += '<div class="ce-card__preview" data-logo-id="' + esc(e.id) + '">' + previewPlaceholderHtml(e) + '</div>';
    html += '<div class="ce-card__content">';
    html += '<div class="ce-card__head">';
    var ftl = FEED_TYPE_LABELS[e.feed_type] || FEED_TYPE_LABELS.supply;
    html += '<span class="ce-type-badge ' + ftl.badgeCls + '">' + ftl.badge + '</span> ';
    // Professionelle Headline: "15 Produktionshelfer verfuegbar" statt generischer Titel
    var headline = e.title;
    if (!isDemandCard && e.headcount && e.role) {
      headline = freePeople > 0
        ? freePeople + ' ' + e.role + ' verfuegbar'
        : totalPeople + ' ' + e.role + ' reserviert';
    } else if (isDemandCard && e.headcount && e.role) {
      headline = demandRemaining + ' ' + e.role + ' gesucht';
    }
    html += '<div style="flex:1;min-width:0"><div class="ce-card__title">' + esc(headline) + '</div>';
    var subParts = [esc(e.role)];
    if (e.worker_category) subParts.push(esc(e.worker_category));
    if (e.location_city) subParts.push('ab ' + fmtDate(e.availability_from) + ' in ' + esc(e.location_city));
    html += '<div class="ce-card__role">' + subParts.join(' \u00b7 ') + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:var(--ds-space-2)">';
    html += freshnessHtml(e.last_confirmed_at);
    if (e.priority_level === "notdienst") html += '<span class="ds-badge ds-badge--danger">Notdienst</span>';
    else if (e.priority_level === "urgent") html += '<span class="ds-badge ds-badge--danger">Dringend</span>';
    else if (e.priority_level === "elevated") html += '<span class="ds-badge ds-badge--warning">Erhoet</span>';
    if (!isDemandCard && e.status === "reserved") html += '<span class="ds-badge ds-badge--neutral">Reserviert</span>';
    else if (!isDemandCard && committedPeople > 0) html += '<span class="ds-badge ds-badge--neutral">' + committedPeople + ' dealgebunden</span>';
    if (isDemandCard && e.status === "partially_covered") html += '<span class="ds-badge ds-badge--neutral">Teilgedeckt</span>';
    if (isDemandCard && demandCommitted > 0) html += '<span class="ds-badge ds-badge--neutral">' + demandCommitted + ' gebunden</span>';
    if (e.employment_type) html += '<span class="ds-badge ds-badge--neutral">' + esc(EMPLOYMENT_LABELS[e.employment_type] || e.employment_type) + '</span>';
    html += '<button class="ce-card__save" data-save-id="' + esc(e.id) + '" title="Merken" onclick="event.stopPropagation();window._saveCap(this)">&#9734; Merken</button>';
    html += '</div></div>';
    if (rankLabels.length) {
      html += '<div class="ce-card__meta" style="margin-bottom:var(--ds-space-2)">';
      rankLabels.forEach(function(lbl) {
        html += '<span class="ds-badge ds-badge--neutral">' + esc(lbl) + '</span>';
      });
      html += '</div>';
    }

    html += '<div class="ce-card__meta">';
    html += '<span class="ce-card__meta-item">&#128205; ' + esc(e.location_city || "?") + (e.location_postal ? " " + esc(e.location_postal) : "") + '</span>';
    html += '<span class="ce-card__meta-item">&#128101; ' + esc(isDemandCard ? demandHeadcountLabel(e) : supplyHeadcountLabel(e)) + '</span>';
    html += '<span class="ce-card__meta-item">&#128197; ' + fmtDate(e.availability_from) + (e.availability_to ? " – " + fmtDate(e.availability_to) : "+") + '</span>';
    if (shift) html += '<span class="ce-card__meta-item">&#9200; ' + esc(shift) + '</span>';
    if (compLabel) html += '<span class="ce-card__meta-item"><span class="ds-traffic-light ds-traffic-light' + compColor + '"></span>' + esc(compLabel) + '</span>';
    if (priceHtml) html += '<span class="ce-card__meta-item">&#128176; ' + priceHtml + '</span>';
    html += '</div>';

    var premBadge = premiumBadgeHtml(e);
    var repBadge = reputationBadgeHtml(e);
    var trust = trustBadges(e.trust_signals);
    var trustAll = premBadge + repBadge + trust;
    if (trustAll) html += '<div class="ce-card__trust">' + trustAll + '</div>';

    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  function setImmediateState(enabled, opts) {
    var toggle = document.getElementById("ff-immediate");
    var dateEl = document.getElementById("ff-avail-from");
    if (!toggle || !dateEl) return;
    var skipRemember = opts && opts.skipRemember;
    if (enabled) {
      if (!skipRemember && !dateEl.disabled) {
        dateEl.dataset.prevValue = dateEl.value || "";
      }
      var anchor = (opts && opts.anchor) || dateEl.value;
      if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(String(anchor))) {
        anchor = todayDateString();
      }
      dateEl.value = anchor;
      dateEl.disabled = true;
      toggle.checked = true;
    } else {
      toggle.checked = false;
      dateEl.disabled = false;
      if (!skipRemember && dateEl.dataset.prevValue != null) {
        dateEl.value = dateEl.dataset.prevValue;
        delete dateEl.dataset.prevValue;
      }
    }
  }

  function loadFeed(page) {
    currentPage = page || 1;
    var params = new URLSearchParams();
    var role = document.getElementById("ff-role").value.trim();
    var city = document.getElementById("ff-city").value.trim();
    var cat = document.getElementById("ff-category").value;
    var shift = document.getElementById("ff-shift").value;
    var comp = document.getElementById("ff-compliance").value;
    var hc = document.getElementById("ff-headcount").value;
    var availFrom = document.getElementById("ff-avail-from").value;
    var immediate = document.getElementById("ff-immediate").checked;
    var sort = document.getElementById("ff-sort").value;
    if (immediate && (!availFrom || !/^\d{4}-\d{2}-\d{2}$/.test(String(availFrom)))) {
      availFrom = todayDateString();
      document.getElementById("ff-avail-from").value = availFrom;
    }
    persistFilters({
      role: role || "",
      city: city || "",
      worker_category: cat || "",
      shift_model: shift || "",
      compliance_status: comp || "",
      min_headcount: hc || "",
      availability_from: availFrom || "",
      availability_window: immediate ? "immediate" : "",
      sort: sort || defaultSort
    });
    if (role) params.set("role", role);
    if (city) params.set("city", city);
    if (cat) params.set("worker_category", cat);
    if (shift) params.set("shift_model", shift);
    if (comp) params.set("compliance_status", comp);
    if (hc) params.set("min_headcount", hc);
    if (availFrom) params.set("availability_from", availFrom);
    if (immediate) params.set("availability_window", "immediate");
    if (sort) params.set("sort", sort);
    params.set("page", currentPage);
    params.set("limit", PAGE_SIZE);

    var feedEl = document.getElementById("feed");
    var emptyEl = document.getElementById("empty-state");
    var pagEl = document.getElementById("pagination");
    var infoEl = document.getElementById("results-info");
    var contextEl = document.getElementById("feed-context-hint");

    feedEl.innerHTML = '<div class="ds-skeleton ds-skeleton--card" style="height:120px"></div><div class="ds-skeleton ds-skeleton--card" style="height:120px"></div>';
    emptyEl.style.display = "none";
    pagEl.style.display = "none";

    TC.api.get("/capacity-exchange/feed?" + params.toString())
    .then(function(data) {
      var items = data.items || data || [];
      var total = data.total || items.length;
      var ctx = data.feed_context || {};

      if (!items.length) {
        feedEl.innerHTML = "";
        var locLbl = (function() { try { return sessionStorage.getItem("tc.activeLocationName") || null; } catch (_e) { return null; } })();
        var titleEl = emptyEl.querySelector(".ds-empty__title");
        if (titleEl) titleEl.textContent = locLbl ? "Kein passendes Personal für Standort " + locLbl : "Kein passendes Personal gefunden";
        emptyEl.style.display = "block";
        infoEl.textContent = "";
        return;
      }

      infoEl.textContent = total + " Eintr" + (total !== 1 ? "aege" : "ag") + " gefunden";
      if (ctx.viewer_role === "agency" && ctx.inter_agency_enabled) {
        contextEl.textContent = "Inter-Agency Matching ist aktiv: Neben Unternehmens-Nachfragen werden qualifizierte Nachfragen von Zeitarbeitsfirmen kontrolliert einbezogen.";
      } else if (ctx.viewer_role === "agency") {
        contextEl.textContent = "Standardmodus aktiv: Priorisiert werden passende Nachfragen von Unternehmen.";
      } else if (ctx.viewer_role === "company") {
        contextEl.textContent = "Standardmodus aktiv: Priorisiert wird passendes Personal von Zeitarbeitsfirmen.";
      } else {
        contextEl.textContent = "";
      }
      var html = "";
      items.forEach(function(e) { html += renderCard(e); });
      feedEl.innerHTML = html;
      emptyEl.style.display = "none";

      // Bind card clicks
      feedEl.querySelectorAll(".ce-card[data-id]").forEach(function(card) {
        card.addEventListener("click", function() {
          window.location.href = "/public/capacity_exchange_detail.html?id=" + card.getAttribute("data-id") + "&type=" + (card.getAttribute("data-feed-type") || "supply");
        });
      });

      // Logos nachladen
      var ids = items.map(function(e) { return e.id; }).join(",");
      if (ids) {
        TC.api.get("/offer-assets/batch-logos?ids=" + encodeURIComponent(ids))
        .then(function(resp) {
          if (!resp || !resp.data) return;
          var logos = resp.data;
          Object.keys(logos).forEach(function(oid) {
            var el = feedEl.querySelector('[data-logo-id="' + oid + '"]');
            if (el) {
              var img = document.createElement("img");
              var rawPath = String(logos[oid] || "");
              img.src = toAssetUrl(rawPath);
              img.alt = "Vorschau";
              img.className = "ce-card__preview-image";
              img.loading = "lazy";
              img.onerror = function() {
                el.innerHTML = previewPlaceholderHtml({ feed_type: el.closest(".ce-card") && el.closest(".ce-card").getAttribute("data-feed-type") });
              };
              el.innerHTML = "";
              el.appendChild(img);
            }
          });
        }).catch(function() {});
      }

      // Pagination
      var totalPages = Math.ceil(total / PAGE_SIZE);
      if (totalPages > 1) {
        pagEl.style.display = "flex";
        document.getElementById("page-info").textContent = "Seite " + currentPage + " von " + totalPages;
        document.getElementById("btn-prev").disabled = currentPage <= 1;
        document.getElementById("btn-next").disabled = currentPage >= totalPages;
      } else {
        pagEl.style.display = "none";
      }
    })
    .catch(function() {
      feedEl.innerHTML = '<div class="ds-alert ds-alert--danger">Fehler beim Laden des Personals.</div>';
    });
  }

  // Make loadFeed globally accessible for the reset button
  window.loadFeed = loadFeed;
  var FILTER_STORAGE_KEY = "tc.capacityFeed.filters.v1";
  var FILTER_PARAM_MAP = {
    role: "ff-role",
    city: "ff-city",
    worker_category: "ff-category",
    shift_model: "ff-shift",
    compliance_status: "ff-compliance",
    min_headcount: "ff-headcount",
    availability_from: "ff-avail-from",
    sort: "ff-sort"
  };

  var advancedFilterIds = ["ff-shift", "ff-compliance", "ff-headcount", "ff-avail-from", "ff-immediate", "ff-sort"];
  var advancedFiltersEl = document.getElementById("feed-advanced-filters");
  var advancedToggle = document.getElementById("filter-toggle");
  var defaultSort = document.getElementById("ff-sort") ? document.getElementById("ff-sort").value : "newest";
  function readUrlFilters() {
    var params = new URLSearchParams(window.location.search);
    var filters = {};
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (params.has(key)) filters[key] = params.get(key);
    });
    if (params.get("availability_window") === "immediate") {
      filters.availability_window = "immediate";
    }
    return filters;
  }

  function readStoredFilters() {
    try {
      return JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || "{}");
    } catch (err) {
      return {};
    }
  }

  function writeStoredFilters(filters) {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch (err) {
      return;
    }
  }

  function setFieldValue(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") {
      var hasOption = Array.from(el.options).some(function(opt) { return opt.value === value; });
      if (!hasOption) return;
    }
    if (id === "ff-headcount" && value) {
      var num = Number(value);
      if (!isFinite(num) || num <= 0) return;
    }
    if (id === "ff-avail-from" && value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return;
    }
    el.value = value;
  }

  function applyFilterValues(values) {
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return;
      setFieldValue(FILTER_PARAM_MAP[key], values[key]);
    });
  }

  function initFilterDefaults() {
    var urlFilters = readUrlFilters();
    var storedFilters = readStoredFilters();
    var merged = {};
    Object.keys(FILTER_PARAM_MAP).forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(urlFilters, key)) merged[key] = urlFilters[key];
      else if (Object.prototype.hasOwnProperty.call(storedFilters, key)) merged[key] = storedFilters[key];
    });
    if (Object.prototype.hasOwnProperty.call(urlFilters, "availability_window")) {
      merged.availability_window = urlFilters.availability_window;
    } else if (Object.prototype.hasOwnProperty.call(storedFilters, "availability_window")) {
      merged.availability_window = storedFilters.availability_window;
    }
    applyFilterValues(merged);
    if (merged.availability_window === "immediate") {
      setImmediateState(true, { anchor: merged.availability_from, skipRemember: true });
    } else {
      setImmediateState(false, { skipRemember: true });
    }
  }

  function persistFilters(filters) {
    writeStoredFilters(filters);
  }

  function hasAdvancedFilters() {
    return advancedFilterIds.some(function(id) {
      var el = document.getElementById(id);
      if (!el) return false;
      if (id === "ff-sort") {
        return el.value && el.value !== defaultSort;
      }
      if (id === "ff-immediate") {
        return el.checked === true;
      }
      return String(el.value || "").trim() !== "";
    });
  }

  function setAdvancedFilters(open, opts) {
    if (!advancedFiltersEl || !advancedToggle) return;
    advancedFiltersEl.hidden = !open;
    advancedToggle.setAttribute("aria-expanded", open ? "true" : "false");
    advancedToggle.textContent = open ? "Filter einklappen" : "Weitere Filter";
    if (open && opts && opts.focus) {
      var firstField = advancedFiltersEl.querySelector("input, select");
      if (firstField) firstField.focus();
    }
  }

  initFilterDefaults();
  if (advancedToggle && advancedFiltersEl) {
    advancedToggle.addEventListener("click", function() {
      setAdvancedFilters(advancedFiltersEl.hidden, { focus: true });
    });
    setAdvancedFilters(hasAdvancedFilters());
  }

  document.getElementById("btn-search").addEventListener("click", function() { loadFeed(1); });
  document.getElementById("btn-prev").addEventListener("click", function() { if (currentPage > 1) loadFeed(currentPage - 1); });
  document.getElementById("btn-next").addEventListener("click", function() { loadFeed(currentPage + 1); });

  // Enter key triggers search
  ["ff-role","ff-city","ff-headcount","ff-avail-from"].forEach(function(id) {
    document.getElementById(id).addEventListener("keydown", function(e) { if (e.key === "Enter") loadFeed(1); });
  });
  ["ff-category","ff-shift","ff-compliance","ff-sort"].forEach(function(id) {
    document.getElementById(id).addEventListener("change", function() { loadFeed(1); });
  });
  document.getElementById("ff-avail-from").addEventListener("change", function() { loadFeed(1); });
  var immediateToggle = document.getElementById("ff-immediate");
  if (immediateToggle) {
    immediateToggle.addEventListener("change", function() {
      setImmediateState(immediateToggle.checked);
      loadFeed(1);
    });
  }

  // Quick-save / bookmark
  window._saveCap = function(btn) {
    var id = btn.getAttribute("data-save-id");
    btn.disabled = true;
    TC.api.post("/capacity-exchange/entries/" + id + "/interactions", { interaction_type: "save", message: null })
    .then(function() {
      btn.disabled = false;
      btn.innerHTML = "&#9733; Gemerkt"; btn.classList.add("saved");
    }).catch(function() { btn.disabled = false; });
  };


  // Load activity stats bar
  (function loadFeedStats() {
    TC.api.get("/capacity-exchange/stats")
    .then(function(s) {
      document.getElementById("fs-active").textContent = s.active != null ? s.active : "?";
      document.getElementById("fs-suppliers").textContent = s.unique_suppliers != null ? s.unique_suppliers : "?";
      document.getElementById("fs-deals").textContent = s.deals_last_30d != null ? s.deals_last_30d : "?";
      document.getElementById("fs-fresh").textContent = s.confirmed_today != null ? s.confirmed_today : "?";
    }).catch(function() {});
  })();

  loadFeed(1);
})();

  /* ── Role-based CTAs ───────────────────────────────── */
(function() {
  TC.api.get("/me").then(function(me) {
    var cta = document.getElementById("feed-ctas");
    if (!cta) return;
    if (me.role === "agency") {
      cta.innerHTML = '<a href="/public/capacity_exchange_form.html" class="ds-btn ds-btn--primary ds-btn--sm">Personal einstellen</a><a href="/public/capacity_exchange_manage.html" class="ds-btn ds-btn--sm ds-btn--ghost">Verfügbares Personal</a>';
    } else if (me.role === "company") {
      cta.innerHTML = '<a href="/public/marketplace_demand_create.html" class="ds-btn ds-btn--primary ds-btn--sm">Arbeitsplatz anbieten</a><a href="/public/marketplace_demand_list.html" class="ds-btn ds-btn--sm ds-btn--ghost">Meine Angebote</a>';
      // Einsatzunternehmen bieten Arbeitsplaetze an (kein eigenes Personal): Karte 3 = Uebersicht der eigenen Arbeitsplatzangebote.
      var c3 = document.getElementById("feed-nav-card3");
      var c3t = document.getElementById("feed-nav-card3-title");
      var c3d = document.getElementById("feed-nav-card3-desc");
      if (c3) c3.href = "/public/marketplace_demand_list.html";
      if (c3t) c3t.textContent = "Verfügbare Arbeitsplätze";
      if (c3d) c3d.textContent = "Übersicht Ihrer Arbeitsplatzangebote.";
    }
  }).catch(function() {});
})();
