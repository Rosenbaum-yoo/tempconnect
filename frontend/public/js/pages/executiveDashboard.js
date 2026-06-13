/* ═══════════════════════════════════════════════════════
   Executive Dashboard — Page Logic
   ═══════════════════════════════════════════════════════ */
(function() {
  'use strict';
  var currentMe = null;
  var executiveAccess = { canRead: false, canWrite: false, canExport: false, mode: 'hidden', reason: '' };
  var rateCardAccess = { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  var EXEC_DASH_FILTER_STORAGE_KEY = 'tc.executiveDashboard.filters.v1';
  function applyExecutiveDomLocks(root) {
    if (window.TC && window.TC.entitlements && typeof window.TC.entitlements.applyDomLocks === 'function') {
      window.TC.entitlements.applyDomLocks(root || document).catch(function() {});
    }
  }

  function readStoredExecutiveFilters() {
    try {
      var raw = sessionStorage.getItem(EXEC_DASH_FILTER_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function writeStoredExecutiveFilters(filters) {
    try { sessionStorage.setItem(EXEC_DASH_FILTER_STORAGE_KEY, JSON.stringify(filters || {})); }
    catch (e) { /* Session-Storage kann lokal blockiert sein. */ }
  }

  function applyOrgFilterDefaults() {
    var params = new URLSearchParams(window.location.search || '');
    var hasOrg = params.has('org_id');
    var stored = hasOrg ? {} : readStoredExecutiveFilters();
    var orgId = hasOrg ? (params.get('org_id') || '') : (stored.orgId || '');
    var orgFilter = document.getElementById('orgFilter');
    if (orgFilter) {
      if (orgId) {
        var hasOption = Array.prototype.some.call(orgFilter.options, function(opt) { return opt.value === orgId; });
        if (hasOption) orgFilter.value = orgId;
      } else {
        orgFilter.value = '';
      }
    }
    return orgId;
  }

  function bindOrgFilterPersistence() {
    var orgFilter = document.getElementById('orgFilter');
    if (!orgFilter) return;
    orgFilter.addEventListener('change', function() {
      writeStoredExecutiveFilters({ orgId: orgFilter.value || '' });
      loadDashboard();
    });
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  async function api(path) {
    try { return await TC.api.get(path); } catch(e) { return null; }
  }
  function renderExecutiveState(tone, title, text) {
    var el = document.getElementById('executiveState');
    if (!el) return;
    if (!title && !text) {
      el.className = 'page-state';
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.className = 'page-state page-state--' + (tone || 'info');
    el.innerHTML = '<div class="page-state__title">' + esc(title || '') + '</div><div class="page-state__text">' + esc(text || '') + '</div>';
    el.style.display = '';
  }
  function describeExecutiveAccess(access) {
    if (!access || access.canRead) return '';
    return access.reason || 'Steuerung & Analytik ist fuer diese Rolle derzeit nicht freigeschaltet.';
  }
  function resolveSurfaceAccess(me, key) {
    if (window.TC && window.TC.surfaceAccess && typeof window.TC.surfaceAccess.resolve === 'function') {
      return window.TC.surfaceAccess.resolve(me, key) || { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
    }
    return { canRead: false, canWrite: false, mode: 'hidden', reason: '' };
  }
  function applyExecutiveRateCardAccess() {
    var hubLink = document.getElementById('executiveRateCardHubLink');
    if (!hubLink) return;
    hubLink.style.display = rateCardAccess.canRead ? '' : 'none';
  }
  function applyExecutiveAccess() {
    applyExecutiveRateCardAccess();
    var refreshButtons = Array.prototype.slice.call(document.querySelectorAll('button[onclick*="loadDashboard"], button[onclick*="runQuickSearch"], button[onclick*="exportExecutiveFinanceTruth"]'));
    refreshButtons.forEach(function(button) {
      if (button && button.getAttribute('onclick') && button.getAttribute('onclick').indexOf('exportExecutiveFinanceTruth') !== -1) {
        button.style.display = executiveAccess.canExport ? '' : 'none';
      } else if (button) {
        button.disabled = !executiveAccess.canRead;
      }
    });
    var quickSearch = document.getElementById('quickSearch');
    if (quickSearch) quickSearch.disabled = !executiveAccess.canRead;
    var orgFilter = document.getElementById('orgFilter');
    if (orgFilter) orgFilter.disabled = !executiveAccess.canRead;
    if (!executiveAccess.canExport) {
      setFinanceExportStatus('Finance-Export bleibt fuer diese Rolle ausgeblendet.', 'muted');
    }
    applyExecutiveDomLocks(document);
  }

  function sectionMessage(text) {
    return '<p style="color:var(--muted);font-size:13px">' + esc(text) + '</p>';
  }
  function setFinanceExportStatus(message, tone) {
    var status = document.getElementById('financeExportStatus');
    if (!status) return;
    status.className = 'ds-text-sm';
    if (tone === 'good') status.style.color = 'var(--good)';
    else if (tone === 'bad') status.style.color = 'var(--bad)';
    else if (tone === 'warn') status.style.color = 'var(--warn)';
    else status.style.color = 'var(--muted)';
    status.textContent = message || '';
  }

  function setFinanceExportButtonsDisabled(disabled) {
    Array.prototype.slice.call(document.querySelectorAll('button[onclick*="exportExecutiveFinanceTruth"]')).forEach(function(button) {
      button.disabled = !!disabled;
    });
  }

  function fileNameFromContentDisposition(headerValue, fallback) {
    if (!headerValue) return fallback;
    var fileNameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(headerValue);
    var raw = fileNameMatch ? (fileNameMatch[1] || fileNameMatch[2]) : null;
    if (!raw) return fallback;
    try {
      return decodeURIComponent(raw);
    } catch (_err) {
      return raw;
    }
  }

  function saveBlob(blob, fileName) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(function() {
      URL.revokeObjectURL(link.href);
      link.remove();
    }, 1500);
  }

  async function exportExecutiveFinanceTruth(format) {
    var normalized = String(format || '').toLowerCase();
    if (normalized !== 'csv' && normalized !== 'json') return;
    if (!executiveAccess.canExport) return;
    setFinanceExportButtonsDisabled(true);
    setFinanceExportStatus('Export wird erstellt…', 'muted');
    try {
      if (normalized === 'csv') {
        var response = await TC.api.request('/reporting/finance-truth/export?format=csv', { method: 'GET', rawResponse: true });
        var csvBlob = await response.blob();
        var csvName = fileNameFromContentDisposition(
          response.headers.get('content-disposition'),
          'finance-truth-' + new Date().toISOString().slice(0, 10) + '.csv'
        );
        saveBlob(csvBlob, csvName);
      } else {
        var payload = await TC.api.get('/reporting/finance-truth/export?format=json');
        var jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        var jsonName = 'finance-truth-' + new Date().toISOString().slice(0, 10) + '.json';
        saveBlob(jsonBlob, jsonName);
      }
      setFinanceExportStatus('Export bereitgestellt.', 'good');
    } catch (err) {
      setFinanceExportStatus('Export fehlgeschlagen: ' + ((err && err.message) || 'Unbekannter Fehler'), 'bad');
    } finally {
      setFinanceExportButtonsDisabled(false);
    }
  }
  window.exportExecutiveFinanceTruth = exportExecutiveFinanceTruth;

  function compactEuro(cents) {
    return ((Number(cents) || 0) / 100).toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + ' €';
  }

  function compactEuroValue(value) {
    return (Number(value) || 0).toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }) + ' €';
  }

  function compactCount(value) {
    return (Number(value) || 0).toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  function compactPercent(value) {
    if (value == null || !isFinite(Number(value))) return '–';
    return Number(value).toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }
  function compactDays(value) {
    if (value == null || !isFinite(Number(value))) return '–';
    return Number(value).toLocaleString('de-DE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + ' d';
  }

  // ── Scope-Display-Hilfsfunktionen ──────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '–';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  /**
   * Rendert die Scope-Kontextleiste (Org | Standort | Zeitraum | Datenstand).
   * Erstellt das Element dynamisch vor #kpiGrid wenn #dashboardScopeBar fehlt.
   * scope=null blendet die Leiste aus.
   *
   * @param {object|null} scope - { org_id, location_id, date_from, date_to, window_days }
   * @param {string|null} generatedAt - ISO-Timestamp des API-Calls
   */
  function renderScopeBar(scope, generatedAt) {
    var bar = document.getElementById('dashboardScopeBar');
    if (!bar) {
      var kpiGrid = document.getElementById('kpiGrid');
      if (!kpiGrid || !kpiGrid.parentNode) return;
      bar = document.createElement('div');
      bar.id = 'dashboardScopeBar';
      kpiGrid.parentNode.insertBefore(bar, kpiGrid);
    }
    if (!scope) {
      bar.style.display = 'none';
      return;
    }

    // Org-Name: aus aktuellem Me-Objekt, Fallback auf scope.org_id
    var orgName = (currentMe && currentMe.org_name) || scope.org_id || '–';

    // Standort-Anzeige
    var locName = null;
    try { locName = sessionStorage.getItem('tc.activeLocationName'); } catch (_e) { /* storage not available */ }
    var locDisplay = locName || (scope.location_id || null) || 'Alle Standorte';

    // Zeitraum
    var periodDisplay = fmtDate(scope.date_from) + ' – ' + fmtDate(scope.date_to);
    if (scope.window_days) periodDisplay += ' (' + scope.window_days + ' Tage)';

    // Datenstand
    var standDisplay = generatedAt ? fmtDateTime(generatedAt) : '–';

    bar.style.display = '';
    bar.setAttribute('style',
      'padding:6px 0 10px;font-size:12px;color:var(--muted);' +
      'display:flex;flex-wrap:wrap;gap:14px;align-items:center;' +
      'border-bottom:1px solid var(--line);margin-bottom:14px');
    bar.innerHTML =
      '<span title="Organisation – alle Daten sind auf diese Org beschraenkt">' +
        '<strong style="color:var(--text)">Org:</strong> ' + esc(orgName) +
      '</span>' +
      '<span title="Standort-Kontext – \'Alle Standorte\' bedeutet org-weite Auswertung">' +
        '<strong style="color:var(--text)">Standort:</strong> ' + esc(locDisplay) +
      '</span>' +
      '<span title="Analysezeitraum der dargestellten Kennzahlen">' +
        '<strong style="color:var(--text)">Zeitraum:</strong> ' + esc(periodDisplay) +
      '</span>' +
      '<span title="Zeitpunkt der Datenberechnung auf dem Server">' +
        '<strong style="color:var(--text)">Datenstand:</strong> ' + esc(standDisplay) +
      '</span>';
  }

  function pilotStageLabel(stage) {
    var labels = {
      lead: 'Lead',
      qualified: 'Qualifiziert',
      registered: 'Registriert',
      pilot_started: 'Pilot gestartet',
      pilot_activated: 'Pilot aktiviert',
      first_core_flow_executed: 'Erster Kernfluss',
      pilot_successful_usage: 'Belastbare Nutzung',
      commercial_pricing_clarified: 'Pricing klar',
      paid_live: 'Zahlend live',
      lost_aborted: 'Verloren'
    };
    return labels[stage] || stage || '–';
  }
  function tariffPathLabel(path) {
    var labels = {
      pilot: 'Pilot-Pfad',
      direct_contract: 'Direktvertrag',
      catalog_paid: 'Katalog / live',
      lead_only: 'Lead ohne Conversion',
      unclassified: 'Unklassifiziert'
    };
    return labels[path] || path || '–';
  }
  function moduleLabel(module) {
    var labels = {
      demand: 'Demand',
      deal: 'Deal',
      delivery: 'Delivery',
      vendor_governance: 'Vendor Governance'
    };
    return labels[module] || module || '–';
  }

  function procurementBasisLabel(metric) {
    var basis = metric && metric.basis;
    var labels = {
      current_backlog: 'Zeitbasis: aktueller Backlog.',
      activity_30d: 'Zeitbasis: Aktivität der letzten 30 Tage.',
      window_overlap_30d: 'Zeitbasis: im 30-Tage-Fenster gültig.',
      approved_timesheets_30d: 'Zeitbasis: freigegebene Timesheets der letzten 30 Tage.',
      risk_window_30d: 'Zeitbasis: aktuelle Risiken und nächstes 30-Tage-Fenster.'
    };
    return labels[basis] || '';
  }

  function procurementMetricValue(metric) {
    if (!metric || metric.available === false) return '–';
    if (metric.value_cents != null) return compactEuro(metric.value_cents);
    if (metric.value == null) return '–';
    return String(metric.value);
  }

  function procurementMetricTitle(metric) {
    var parts = [];
    if (metric && metric.description) parts.push(metric.description);
    var basis = procurementBasisLabel(metric);
    if (basis) parts.push(basis);
    if (metric && metric.available === false) parts.push('Der Wert ist derzeit nicht verfügbar.');
    return parts.join(' ');
  }

  function spendWindowHref(window) {
    if (!window || !window.date_from || !window.date_to) return '/public/spend-analytics.html';
    return '/public/spend-analytics.html?date_from=' + encodeURIComponent(window.date_from) + '&date_to=' + encodeURIComponent(window.date_to);
  }
  function featureKeyForHref(href) {
    if (!href) return '';
    if (href.indexOf('/public/spend-analytics') !== -1) return 'spend_analytics';
    if (href.indexOf('/public/rate-cards') !== -1) return 'rate_card_management';
    if (href.indexOf('/public/vendor_pool') !== -1) return 'supplier_management';
    if (href.indexOf('/public/supplier_scorecard') !== -1) return 'supplier_ratings';
    if (href.indexOf('/public/data-governance') !== -1 || href.indexOf('/public/compliance_overview') !== -1) return 'data_governance';
    return '';
  }
  function featureAttrForHref(href) {
    var key = featureKeyForHref(href);
    return key ? ' data-feature-key="' + key + '"' : '';
  }

  function renderDashboardUnavailable() {
    renderScopeBar(null, null);
    document.getElementById('kpiGrid').innerHTML =
      '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">Dashboard nicht verfügbar</span></div>';
    document.getElementById('procurementPulseGrid').innerHTML = sectionMessage('Procurement Pulse konnte nicht geladen werden.');
    document.getElementById('criticalReqSection').innerHTML = sectionMessage('Kritischer Besetzungsdruck konnte nicht geladen werden.');
    document.getElementById('reqChart').innerHTML = sectionMessage('Arbeitsplatzangebote konnten nicht geladen werden.');
    document.getElementById('slaSection').innerHTML = sectionMessage('SLA-Daten konnten nicht geladen werden.');
    document.getElementById('compSection').innerHTML = sectionMessage('Compliance-Daten konnten nicht geladen werden.');
    document.getElementById('platformGrid').innerHTML = sectionMessage('Plattformdaten konnten nicht geladen werden.');
    document.getElementById('spendGrid').innerHTML = sectionMessage('Spend-Daten konnten nicht geladen werden.');
    document.getElementById('financeGrid').innerHTML = sectionMessage('Finance-Daten konnten nicht geladen werden.');
    document.getElementById('financeDetail').innerHTML = '';
    document.getElementById('retentionGrid').innerHTML = sectionMessage('Retention-/Churn-Daten konnten nicht geladen werden.');
    document.getElementById('retentionDetail').innerHTML = '';
    document.getElementById('pilotConversionGrid').innerHTML = sectionMessage('Pilot-/Conversion-Daten konnten nicht geladen werden.');
    document.getElementById('pilotConversionDetail').innerHTML = '';
    setFinanceExportStatus('Dashboard nicht verfügbar. Export kann separat versucht werden.', 'warn');
  }
  function renderDashboardLocked() {
    renderScopeBar(null, null);
    document.getElementById('kpiGrid').innerHTML =
      '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">Steuerung ausgeblendet</span></div>';
    document.getElementById('procurementPulseGrid').innerHTML = sectionMessage(describeExecutiveAccess(executiveAccess));
    document.getElementById('criticalReqSection').innerHTML = sectionMessage('Kritischer Besetzungsdruck bleibt fuer diese Rolle ausgeblendet.');
    document.getElementById('reqChart').innerHTML = sectionMessage('Arbeitsplatzangebote bleiben für diese Rolle ausgeblendet.');
    document.getElementById('slaSection').innerHTML = sectionMessage('SLA-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('compSection').innerHTML = sectionMessage('Compliance-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('platformGrid').innerHTML = sectionMessage('Plattformdaten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('spendGrid').innerHTML = sectionMessage('Spend-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('financeGrid').innerHTML = sectionMessage('Finance-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('financeDetail').innerHTML = '';
    document.getElementById('retentionGrid').innerHTML = sectionMessage('Retention-/Churn-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('retentionDetail').innerHTML = '';
    document.getElementById('pilotConversionGrid').innerHTML = sectionMessage('Pilot-/Conversion-Daten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('pilotConversionDetail').innerHTML = '';
    document.getElementById('ceGrid').innerHTML = sectionMessage('Vermittlungsaktivitaet bleibt fuer diese Rolle ausgeblendet.');
    document.getElementById('activityTimeline').innerHTML = sectionMessage('Aktivitaeten bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('dsgvoGrid').innerHTML = sectionMessage('Governance-Kennzahlen bleiben fuer diese Rolle ausgeblendet.');
    document.getElementById('healthGrid').innerHTML = sectionMessage('Platform Health bleibt fuer diese Rolle ausgeblendet.');
    setFinanceExportStatus('Finance-Export bleibt fuer diese Rolle ausgeblendet.', 'muted');
  }

  async function init() {
    setFinanceExportStatus('CSV/JSON Snapshot für Audit verfügbar.', 'muted');
    currentMe = await api('/me');
    executiveAccess = resolveSurfaceAccess(currentMe, 'executive_dashboard');
    rateCardAccess = resolveSurfaceAccess(currentMe, 'rate_cards');
    applyExecutiveAccess();
    bindOrgFilterPersistence();
    if (!executiveAccess.canRead) {
      renderExecutiveState('info', 'Steuerung & Analytik ausgeblendet', describeExecutiveAccess(executiveAccess));
      renderDashboardLocked();
      return;
    }
    renderExecutiveState();
    applyOrgFilterDefaults();
    loadDashboard();
    checkOnboarding();
  }

  async function checkOnboarding() {
    try {
      var me = currentMe || await api('/me');
      if (!me || me.is_demo || me.onboarding_completed) return;
      var status = await api('/me/onboarding-status');
      if (!status || status.onboarding_completed) return;
      var banner = document.getElementById('onboardingBanner');
      banner.style.display = '';
      var pctEl = document.getElementById('onboardingBannerPct');
      if (pctEl) pctEl.textContent = status.progress_pct + '% abgeschlossen';
      var textEl = document.getElementById('onboardingBannerText');
      if (textEl && status.suggested_next === 'profile_basics') {
        textEl.textContent = 'Fuellen Sie Ihr Firmenprofil aus, um loszulegen.';
      } else if (textEl && status.suggested_next === 'first_action') {
        textEl.textContent = 'Erstellen Sie Ihre erste Aktion, um das Onboarding abzuschliessen.';
      }
    } catch(e) { /* non-critical */ }
  }

  window.dismissOnboardingBanner = function() {
    document.getElementById('onboardingBanner').style.display = 'none';
    TC.api.post('/me/onboarding-complete').catch(function(){});
  };

  async function loadDashboard() {
    if (!executiveAccess.canRead) return;
    var orgId = document.getElementById('orgFilter').value;
    var qs = orgId ? '?org_id=' + encodeURIComponent(orgId) : '';
    var data = await api('/reporting/dashboard' + qs);
    if (!data) {
      renderDashboardUnavailable();
      return;
    }

    renderScopeBar(data.scope, data.generated_at);
    renderAlertBanner(data.alerts || []);
    renderKpis(data.requisitions);
    renderReqChart(data.requisitions);
    renderSla(data.sla);
    renderCompliance(data.compliance);
    renderPlatform(data.platform);
    renderSpend(data.spend, data.window);
    renderFinance(data.finance);
    renderRetention(data.retention || (data.finance && data.finance.retention_truth));
    renderPilotConversion(data.pilot_conversion || (data.finance && data.finance.pilot_conversion_truth));
    renderProcurementPulse(data.procurement_pulse);
    renderCriticalStaffingPressure(data.critical_staffing_pressure);
    applyExecutiveDomLocks(document);
  }
  window.loadDashboard = loadDashboard;

  /**
   * renderAlertBanner — zeigt SLA- und Staffing-Alerts prominent als Banner.
   * Alerts kommen authorativ vom Backend (alerts[] im Dashboard-Response).
   * @param {Array<{code:string,severity:string,message:string,detail_url?:string}>} alerts
   */
  function renderAlertBanner(alerts) {
    var el = document.getElementById('slaAlertBanner');
    if (!el) return;

    if (!alerts || alerts.length === 0) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }

    var SEVERITY_STYLE = {
      critical: 'background:var(--ds-danger,#dc2626);color:#fff;border-left:5px solid #7f1d1d',
      warning:  'background:rgba(245,158,11,.15);color:var(--ds-text,#111);border-left:5px solid var(--ds-warning,#f59e0b)'
    };

    var html = alerts.map(function(a) {
      var style = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.warning;
      var linkHtml = a.detail_url
        ? ' <a href="' + esc(a.detail_url) + '" style="color:inherit;font-weight:700;white-space:nowrap">Details &rarr;</a>'
        : '';
      return (
        '<div class="ds-alert" role="alert" data-alert-code="' + esc(a.code) + '" ' +
        'style="padding:12px 16px;border-radius:6px;margin-bottom:8px;font-size:13px;display:flex;gap:8px;align-items:flex-start;' + style + '">' +
        '<span style="flex-shrink:0;font-weight:700">' + (a.severity === 'critical' ? '&#9888;' : '&#9888;') + '</span>' +
        '<span>' + esc(a.message) + linkHtml + '</span>' +
        '</div>'
      );
    }).join('');

    el.innerHTML = html;
    el.style.display = 'block';
  }

  function renderProcurementPulse(pulse) {
    var grid = document.getElementById('procurementPulseGrid');
    if (!grid) return;
    var tiles = pulse && pulse.tiles;
    if (!tiles || !tiles.length) {
      grid.innerHTML = sectionMessage((pulse && pulse.message) || 'Procurement Pulse derzeit nicht verfügbar.');
      return;
    }
    grid.innerHTML = tiles.map(function(metric) {
      var tone = metric && metric.tone ? metric.tone : 'neutral';
      var color = 'var(--text)';
      if (tone === 'risk') color = 'var(--bad)';
      else if (tone === 'warn') color = 'var(--warn)';
      else if (metric && metric.key === 'active_vendors_30d') color = 'var(--good)';
      else if (metric && metric.key === 'active_rate_cards') color = '#7c5cff';
      else if (metric && metric.key === 'open_requisitions') color = 'var(--brand)';
      var value = procurementMetricValue(metric);
      var tip = procurementMetricTitle(metric);
      var href = metric && metric.href;
      if (!rateCardAccess.canRead && href && href.indexOf('/public/rate-cards') !== -1) {
        href = null;
        tip = (tip ? tip + ' ' : '') + rateCardAccess.reason;
      }
      var tagOpen = href ? '<a href="' + href + '"' + featureAttrForHref(href) : '<div';
      var tagClose = href ? '</a>' : '</div>';
      return tagOpen + ' class="kpi-tile procurement-pulse procurement-pulse--' + tone + '" title="' + esc(tip) + '" style="text-decoration:none;color:inherit">' +
        '<span class="kpi-val" style="color:' + color + '">' + esc(String(value)) + '</span>' +
        '<span class="kpi-label">' + esc(metric.label || 'Kennzahl') + '</span>' +
        '<span class="procurement-pulse__hint">i</span>' +
      tagClose;
    }).join('');
  }

  function renderKpis(r) {
    if (!r) {
      var locLbl = (function() { try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; } })();
      document.getElementById('kpiGrid').innerHTML =
        '<div class="kpi-tile"><span class="kpi-val">–</span><span class="kpi-label">' + (locLbl ? 'Keine KPI-Daten für Standort ' + esc(locLbl) : 'Keine KPI-Daten') + '</span></div>';
      return;
    }
    var tiles = [
      { label: 'Gesamt', val: r.total || 0, color: 'var(--text)', href: '/public/requisitions.html', title: 'Alle Arbeitsplatzangebote unabhängig vom Status.' },
      { label: 'Offen', val: r.open || 0, color: 'var(--brand)', href: '/public/requisitions.html?status=OPEN', title: 'Arbeitsplatzangebote im Status OPEN.' },
      { label: 'In Pruefung', val: r.in_review || 0, color: 'var(--warn)', href: '/public/requisitions.html?status=IN_REVIEW', title: 'Arbeitsplatzangebote im Status IN_REVIEW.' },
      { label: 'Shortlisted', val: r.shortlisted || 0, color: '#7c5cff', href: '/public/requisitions.html?status=SHORTLISTED', title: 'Arbeitsplatzangebote im Status SHORTLISTED.' },
      { label: 'Besetzt', val: r.filled || 0, color: 'var(--good)', href: '/public/requisitions.html?status=FILLED', title: 'Arbeitsplatzangebote im Status FILLED.' },
      { label: 'Storniert', val: r.cancelled || 0, color: 'var(--bad)', href: '/public/requisitions.html?status=CANCELLED', title: 'Arbeitsplatzangebote im Status CANCELLED.' },
      { label: 'Dringend offen', val: r.urgent_open || 0, color: 'var(--bad)', href: '/public/requisitions.html?status_group=urgent_open&urgency=urgent', title: 'Dringliche Arbeitsplatzangebote im operativen Bearbeitungsraum OPEN oder IN_REVIEW.' },
      { label: 'Avg Time-to-Fill', val: (r.avg_time_to_fill_hours || '–') + 'h', color: 'var(--muted)', href: null, title: 'Durchschnittliche Zeit von Erstellung bis FILLED in Stunden.' }
    ];
    document.getElementById('kpiGrid').innerHTML = tiles.map(function(t) {
      var inner = '<span class="kpi-val" style="color:' + t.color + '">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span>';
      return t.href
        ? '<a class="kpi-tile" href="' + t.href + '"' + featureAttrForHref(t.href) + ' style="text-decoration:none;color:inherit;display:block;cursor:pointer" title="' + esc(t.title || '') + '">' + inner + '</a>'
        : '<div class="kpi-tile" title="' + esc(t.title || '') + '">' + inner + '</div>';
    }).join('');
  }

  function renderReqChart(r) {
    if (!r) {
      var locLblReq = (function() { try { return sessionStorage.getItem('tc.activeLocationName') || null; } catch (_e) { return null; } })();
      document.getElementById('reqChart').innerHTML = sectionMessage(locLblReq ? 'Keine Arbeitsplatzangebot-Daten für Standort ' + locLblReq + '.' : 'Keine Arbeitsplatzangebot-Daten verfügbar.');
      return;
    }
    var statuses = [
      { key: 'draft', label: 'Draft', color: 'var(--muted)' },
      { key: 'pending_approval', label: 'Freigabe', color: 'var(--warn)' },
      { key: 'approved', label: 'Genehmigt', color: '#4fa7ff' },
      { key: 'open', label: 'Offen', color: 'var(--brand)' },
      { key: 'in_review', label: 'Pruefung', color: '#7c5cff' },
      { key: 'shortlisted', label: 'Shortlist', color: '#9b6dff' },
      { key: 'filled', label: 'Besetzt', color: 'var(--good)' },
      { key: 'closed', label: 'Closed', color: 'rgba(255,255,255,.2)' },
      { key: 'cancelled', label: 'Storniert', color: 'var(--bad)' }
    ];
    var max = Math.max(1, ...statuses.map(function(s) { return r[s.key] || 0; }));
    document.getElementById('reqChart').innerHTML = statuses.map(function(s) {
      var v = r[s.key] || 0;
      var h = Math.max(2, (v / max) * 100);
      return '<div class="bar-col"><div class="bar" style="height:' + h + '%;background:' + s.color + '" title="' + esc(s.label) + ': ' + v + '"></div><div class="bar-label">' + esc(s.label) + '<br>' + v + '</div></div>';
    }).join('');
  }

  function renderSla(s) {
    var el = document.getElementById('slaSection');
    if (!s) {
      el.innerHTML = sectionMessage('Keine SLA-Daten verfügbar.');
      return;
    }
    var pctNum = s.sla_compliance_pct != null ? Number(s.sla_compliance_pct) : null;
    var pct = pctNum != null ? pctNum + '%' : '–';

    // Farbkodierung der Compliance-Tile: gruen >= 90%, gelb 80-89%, rot < 80%
    var pctColor = 'var(--good)';
    if (pctNum != null) {
      if (pctNum < 80) pctColor = 'var(--bad)';
      else if (pctNum < 90) pctColor = 'var(--warn)';
    }

    // Zusatz-Hinweis unter dem Compliance-Wert wenn unter Schwellwert
    var pctHint = (pctNum != null && pctNum < 80)
      ? '<span style="display:block;font-size:11px;color:var(--bad);margin-top:4px;font-weight:600">Unter Schwellwert (80%)</span>'
      : '';

    el.innerHTML =
      '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--good)">' + esc(String(s.sla_met || 0)) + '</span><span class="kpi-label">SLA Met</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--bad)">' + esc(String(s.sla_breached || 0)) + '</span><span class="kpi-label">SLA Breached</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:var(--warn)">' + esc(String(s.sla_running || 0)) + '</span><span class="kpi-label">Running</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="color:' + pctColor + '">' + esc(pct) + '</span>' + pctHint + '<span class="kpi-label">Compliance %</span></div>' +
      '</div>';
  }

  function renderCompliance(c) {
    var el = document.getElementById('compSection');
    if (!c) {
      el.innerHTML = sectionMessage('Keine Compliance-Daten verfügbar.');
      return;
    }
    var total = Math.max(1, c.total_documents || 1);
    var pcts = {
      verified: ((c.verified || 0) / total * 100).toFixed(0),
      pending: ((c.pending || 0) / total * 100).toFixed(0),
      rejected: ((c.rejected || 0) / total * 100).toFixed(0),
      expired: ((c.expired || 0) / total * 100).toFixed(0)
    };
    el.innerHTML =
      '<div class="compliance-bar">' +
      '<span class="cb-green" style="width:' + pcts.verified + '%"></span>' +
      '<span class="cb-yellow" style="width:' + pcts.pending + '%"></span>' +
      '<span class="cb-red" style="width:' + pcts.expired + '%"></span>' +
      '<span class="cb-grey" style="width:' + pcts.rejected + '%"></span>' +
      '</div>' +
      '<div class="legend">' +
      '<span class="l-green">Verifiziert: ' + (c.verified || 0) + '</span>' +
      '<span class="l-yellow">Ausstehend: ' + (c.pending || 0) + '</span>' +
      '<span class="l-red">Abgelaufen: ' + (c.expired || 0) + '</span>' +
      '<span class="l-grey">Abgelehnt: ' + (c.rejected || 0) + '</span>' +
      '</div>' +
      (c.expiring_soon > 0 ? '<p style="color:var(--warn);margin:8px 0 0;font-size:13px">⚠ ' + c.expiring_soon + ' Dokument(e) laufen in 30 Tagen ab</p>' : '');
  }

  function renderPlatform(p) {
    if (!p) {
      document.getElementById('platformGrid').innerHTML = sectionMessage('Keine Plattform-Daten verfügbar.');
      return;
    }
    var tiles = [
      { label: 'Nutzer', val: p.total_users || 0 },
      { label: 'Organisationen', val: p.total_orgs || 0 },
      { label: 'Aktive Personalangebote', val: p.active_capacity_posts || 0 },
      { label: 'Offene Demands', val: p.open_demands || 0 },
      { label: 'Vendor Eintraege', val: p.active_vendor_entries || 0 }
    ];
    document.getElementById('platformGrid').innerHTML = tiles.map(function(t) {
      return '<div class="kpi-tile"><span class="kpi-val">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span></div>';
    }).join('');
  }

  function renderSpend(s, window) {
    var grid = document.getElementById('spendGrid');
    if (!grid) return;
    if (!s || s.available === false) {
      grid.innerHTML = sectionMessage('Spend derzeit nicht verfügbar.');
      return;
    }
    if (!s.has_data) {
      grid.innerHTML = sectionMessage('Keine Spend-Daten im aktuellen 30-Tage-Fenster.');
      return;
    }
    function eurFmt(c) { return (c/100).toLocaleString('de-DE',{minimumFractionDigits:0,maximumFractionDigits:0}); }
    function eurFull(c) { return (c/100).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    var spendHref = spendWindowHref(window);
    var overRatePct = s.over_rate_spend_cents && s.total_spend_cents
      ? Math.round(s.over_rate_spend_cents / s.total_spend_cents * 100) : 0;
    grid.innerHTML = [
      {
        label:'Spend 30 Tage',
        val:eurFmt(s.total_spend_cents)+' €',
        color:'var(--brand)',
        href:spendHref,
        title:'Freigegebener Spend aus approved Timesheets im aktuellen 30-Tage-Fenster.'
      },
      {
        label:'Projected Spend',
        val:eurFmt(s.projected_spend_cents||0)+' €',
        color:'#7c5cff',
        href:spendHref,
        title:'Projektion auf Basis aktiver Assignments und verbleibender Wochen bis geplantem Ende; ohne Enddatum mit 90-Tage-Fallback.'
      },
      {
        label:'Aktive Assignments',
        val:s.active_assignments||0,
        color:'var(--text)',
        href:spendHref,
        title:'Aktive Assignments, die in die Spend-Projektion einfließen.'
      },
      {
        label:'Assignments 30 Tage',
        val:s.assignment_count||s.assignments||0,
        color:'var(--text)',
        href:spendHref,
        title:'Assignments mit freigegebenen Timesheets im aktuellen 30-Tage-Fenster.'
      },
      {
        label:'Vendoren 30 Tage',
        val:s.vendor_count||0,
        color:'#7c5cff',
        href:spendHref,
        title:'Distinct Supplier mit freigegebenem Spend im aktuellen 30-Tage-Fenster.'
      },
      {
        label:'Approved Hours',
        val:(Number(s.total_hours||0)).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h',
        color:'var(--text)',
        href:spendHref,
        title:'Freigegebene Stunden aus approved Timesheets im aktuellen 30-Tage-Fenster.'
      },
      {
        label:'Ø Stundensatz',
        val:eurFull(s.avg_rate_cents)+' €',
        color:'var(--text)',
        href:spendHref,
        title:'Durchschnittlicher Ist-Stundensatz der Spend-Basis im aktuellen Fenster.'
      },
      {
        label:'Überstunden',
        val:eurFmt(s.overtime_spend_cents||0)+' €',
        color:'var(--warn)',
        href:spendHref,
        title:'Überstundenanteil des freigegebenen Spend im aktuellen 30-Tage-Fenster.'
      },
      {
        label:'Over-Rate (' + overRatePct + '%)',
        val:eurFmt(s.over_rate_spend_cents||0)+' €',
        color: overRatePct > 10 ? 'var(--bad)' : 'var(--warn)',
        href:rateCardAccess.canRead ? '/public/rate-cards.html' : null,
        title:(s.over_rate_count||0) + ' Assignment(s) im Fenster liegen über dem Rate-Card-Target.' + (rateCardAccess.canRead ? '' : ' ' + rateCardAccess.reason)
      }
    ].map(function(t){
      var inner = '<span class="kpi-val" style="color:'+t.color+';font-size:20px">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span>';
      return t.href
        ? '<a class="kpi-tile" href="'+t.href+'"' + featureAttrForHref(t.href) + ' style="text-decoration:none;color:inherit;cursor:pointer" title="'+esc(t.title||'')+'">'+inner+'</a>'
        : '<div class="kpi-tile" title="'+esc(t.title||'')+'">'+inner+'</div>';
    }).join('');
  }

  function renderFinance(finance) {
    var grid = document.getElementById('financeGrid');
    var detail = document.getElementById('financeDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!finance || finance.available === false) {
      grid.innerHTML = sectionMessage('Finance-Wahrheit derzeit nicht verfügbar.');
      return;
    }

    var subscription = finance.subscription_truth || {};
    var invoice = finance.invoice_truth || {};
    var payment = finance.payment_truth || {};
    var billable = finance.billable_truth || {};
    var reconciliation = finance.reconciliation_30d || {};
    var pendingQuotes = Number(subscription.pending_quote_subscribers || 0);
    var spendInvoiceGap = Number(reconciliation.spend_invoice_gap_cents || 0);

    var tiles = [
      {
        label: 'Contractual MRR',
        val: compactEuroValue(subscription.contractually_active_mrr || 0),
        color: 'var(--brand)',
        title: 'Vertraglich anerkannter monatlicher Umsatz ohne custom_quote_pending.'
      },
      {
        label: 'Catalog MRR (theoretisch)',
        val: compactEuroValue(subscription.catalog_mrr_theoretical || 0),
        color: '#7c5cff',
        title: 'Katalogbasierter Referenz-MRR für aktive bezahlte Subscriptions.'
      },
      {
        label: 'Open Receivables',
        val: compactEuro(invoice.open_receivables_cents || 0),
        color: Number(invoice.overdue_receivables_cents || 0) > 0 ? 'var(--bad)' : 'var(--warn)',
        title: 'Issued + overdue Rechnungen, noch nicht bezahlt.'
      },
      {
        label: 'Paid Revenue',
        val: compactEuro(invoice.paid_revenue_cents || 0),
        color: 'var(--good)',
        title: 'Historisch als paid markierter Rechnungsumsatz.'
      },
      {
        label: 'Billable Volumen',
        val: billable.available === false ? '–' : compactEuro(billable.approved_uninvoiced_amount_cents || 0),
        color: 'var(--warn)',
        title: 'Freigegebene, noch nicht abgerechnete Timesheet-Leistung.'
      },
      {
        label: 'Pending Quotes',
        val: pendingQuotes,
        color: pendingQuotes > 0 ? 'var(--warn)' : 'var(--good)',
        title: 'Aktive Subscriptions mit custom_quote_pending ohne anerkannten Preis.'
      },
      {
        label: 'Completed Sessions',
        val: payment.available === false ? '–' : (payment.completed_count || 0),
        color: 'var(--text)',
        title: 'Abgeschlossene Payment Sessions als Cash-Proxy.'
      },
      {
        label: 'Spend↔Invoice Gap 30d',
        val: reconciliation.available === false ? '–' : compactEuro(spendInvoiceGap),
        color: reconciliation.available === false ? 'var(--muted)' : (spendInvoiceGap > 0 ? 'var(--warn)' : 'var(--good)'),
        title: 'Approved Spend (30d) minus operational invoiced revenue (30d).'
      }
    ];

    grid.innerHTML = tiles.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');

    if (!detail) return;
    var pricingRows = Array.isArray(finance.pricing_state_breakdown) ? finance.pricing_state_breakdown : [];
    var detailHtml = '';

    if (pricingRows.length) {
      detailHtml +=
        '<div style="overflow:auto;margin-top:12px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr>' +
              '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Preisquelle</th>' +
              '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Subscriber</th>' +
              '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">MRR</th>' +
            '</tr></thead>' +
            '<tbody>' +
              pricingRows.map(function(row) {
                return '<tr>' +
                  '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.source || 'unknown') + '</td>' +
                  '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(String(row.subscribers || 0)) + '</td>' +
                  '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.mrr || 0)) + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>';
    }

    detailHtml +=
      '<div style="margin-top:10px;font-size:13px;color:var(--muted)">' +
        'Invoice-Lifecycle: Draft ' + esc(String(invoice.draft_count || 0)) +
        ' · Issued ' + esc(String(invoice.issued_count || 0)) +
        ' · Overdue ' + esc(String(invoice.overdue_count || 0)) +
        ' · Paid ' + esc(String(invoice.paid_count || 0)) +
        ' · Void ' + esc(String(invoice.void_count || 0)) +
      '</div>';

    if (reconciliation.available) {
      detailHtml +=
        '<div style="margin-top:6px;font-size:13px;color:var(--muted)">' +
          'Coverage 30d: ' + esc(reconciliation.coverage_ratio_pct == null ? '–' : (String(reconciliation.coverage_ratio_pct) + '%')) +
          ' · Approved Spend ' + esc(compactEuro(reconciliation.approved_spend_30d_cents || 0)) +
          ' · Operational Invoiced ' + esc(compactEuro(reconciliation.operational_invoiced_30d_cents || 0)) +
        '</div>';
    }

    detail.innerHTML = detailHtml;
  }

  function renderSegmentRows(rows) {
    return (rows || []).slice(0, 5).map(function(row) {
      return '<tr>' +
        '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label || row.value || '–') + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.active_paid_orgs || 0)) + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(
          (row.retained_logos || 0) > 0 || (row.logo_churned_orgs || 0) > 0
            ? ((Number(row.retained_logos || 0) / Math.max(1, Number(row.retained_logos || 0) + Number(row.logo_churned_orgs || 0))) * 100)
            : null
        )) + '</td>' +
        '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.current_mrr || 0)) + '</td>' +
      '</tr>';
    }).join('');
  }
  function renderRetention(retention) {
    var grid = document.getElementById('retentionGrid');
    var detail = document.getElementById('retentionDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!retention || retention.available === false) {
      grid.innerHTML = sectionMessage('Retention-/Churn-Truth derzeit nicht verfügbar.');
      return;
    }
    var headline = retention.headline || {};
    var usage = retention.usage_intensity || {};
    var quality = retention.quality_flags || {};
    var cards = [
      { label: 'Active Paid Orgs', val: compactCount(headline.active_paid_orgs || 0), color: 'var(--brand)', title: 'Aktive zahlende Organisationen im aktuellen Fenster.' },
      { label: 'Active Customers', val: compactCount(headline.active_customer_orgs || 0), color: '#7c5cff', title: 'Zahlende Organisationen mit wertstiftender Aktivität.' },
      { label: 'Retained Logos', val: compactCount(headline.retained_logos || 0), color: 'var(--good)', title: 'Vorperioden-Kohorte, die weiterhin aktiv zahlend bleibt.' },
      { label: 'Logo Churn Rate', val: compactPercent(headline.logo_churn_rate_pct), color: Number(headline.logo_churn_rate_pct || 0) >= 10 ? 'var(--bad)' : 'var(--warn)', title: 'Logo-Churn im Kohortenvergleich.' },
      { label: 'NRR', val: compactPercent(headline.net_revenue_retention_pct), color: Number(headline.net_revenue_retention_pct || 0) >= 100 ? 'var(--good)' : 'var(--warn)', title: 'Net Revenue Retention inkl. Expansion/Kontraktion.' },
      { label: 'Gross Churn MRR', val: compactEuroValue(headline.gross_revenue_churn_mrr || 0), color: 'var(--bad)', title: 'Brutto-MRR-Verlust aus Vorperioden-Kohorte.' },
      { label: 'Expansion MRR', val: compactEuroValue(headline.expansion_mrr || 0), color: 'var(--good)', title: 'MRR-Expansion in der Vorperioden-Kohorte.' },
      { label: 'Inactive but Paying', val: compactCount(headline.inactive_but_paying_orgs || 0), color: Number(headline.inactive_but_paying_orgs || 0) > 0 ? 'var(--warn)' : 'var(--good)', title: 'Zahlende Organisationen ohne wertstiftende Aktivität.' },
      { label: 'PQA', val: compactCount(headline.pqa_orgs || 0), color: '#4fa7ff', title: 'Product Qualified Accounts mit intensiver Nutzung.' }
    ];
    grid.innerHTML = cards.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');
    if (!detail) return;
    var stageRows = (((retention || {}).segment_drilldown || {}).by_stage) || [];
    var planRows = (((retention || {}).segment_drilldown || {}).by_plan) || [];
    var atRiskRows = (((retention || {}).org_drilldown || {}).at_risk || []).slice(0, 10);
    var usageAvailable = quality.usage_source_available !== false;
    var detailHtml = '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));margin-top:12px">' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.high || 0)) + '</span><span class="kpi-label">Usage High</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.medium || 0)) + '</span><span class="kpi-label">Usage Medium</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.low || 0)) + '</span><span class="kpi-label">Usage Low</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.dormant || 0)) + '</span><span class="kpi-label">Usage Dormant</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.avg_value_events_per_active_org || 0)) + '</span><span class="kpi-label">Avg Value Events</span></div>' +
      '<div class="kpi-tile"><span class="kpi-val" style="font-size:20px">' + esc(compactCount(usage.median_value_events_per_active_org || 0)) + '</span><span class="kpi-label">Median Value Events</span></div>' +
    '</div>';
    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">' +
      '<div style="overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Segment by Stage</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Stage</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Paid Orgs</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Retention</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">MRR</th>' +
          '</tr></thead><tbody>' + renderSegmentRows(stageRows) + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Segment by Plan</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Plan</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Paid Orgs</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Retention</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">MRR</th>' +
          '</tr></thead><tbody>' + renderSegmentRows(planRows) + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
    if (atRiskRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">At-Risk Accounts</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Organisation</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Stage</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Risk</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Value Events</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">MRR</th>' +
          '</tr></thead><tbody>' +
            atRiskRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.org_name || row.org_id || '–') + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.stage || '–') + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line);color:var(--warn)">' + esc(compactCount(row.risk_score || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.current_value_events || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactEuroValue(row.current_mrr || 0)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }
    if (!usageAvailable) {
      detailHtml += '<div style="margin-top:10px;font-size:12px;color:var(--warn)">Usage-Quelle nicht verfügbar: usage-basierte Retention-/Churn-Kennzahlen sind eingeschränkt.</div>';
    }
    detail.innerHTML = detailHtml;
  }
  function renderPilotConversion(truth) {
    var grid = document.getElementById('pilotConversionGrid');
    var detail = document.getElementById('pilotConversionDetail');
    if (!grid) return;
    if (detail) detail.innerHTML = '';
    if (!truth || truth.available === false) {
      grid.innerHTML = sectionMessage('Pilot-/Conversion-Truth derzeit nicht verfügbar.');
      return;
    }
    var headline = truth.headline || {};
    var transitions = truth.transitions || {};
    var pilotToActivated = transitions.pilot_started_to_activated || {};
    var activatedToPaid = transitions.activated_to_paid_live || {};
    var pilotToLost = transitions.pilot_to_lost || {};
    var cards = [
      { label: 'Active Pilots', val: compactCount(headline.active_pilots || 0), color: 'var(--brand)', title: 'Aktuell laufende Piloten.' },
      { label: 'Activated Pilots', val: compactCount(headline.activated_pilots || 0), color: '#4fa7ff', title: 'Aktive Piloten mit echtem Produktkontakt.' },
      { label: 'Converted Pilots', val: compactCount(headline.converted_pilots || 0), color: 'var(--good)', title: 'Piloten mit zahlender Live-Conversion.' },
      { label: 'At-Risk Pilots', val: compactCount(headline.at_risk_pilots || 0), color: Number(headline.at_risk_pilots || 0) > 0 ? 'var(--warn)' : 'var(--good)', title: 'Aktive Piloten mit klaren Risikosignalen.' },
      { label: 'Ø Tage bis Aktivierung', val: compactDays(headline.avg_days_to_activation), color: 'var(--text)', title: 'Durchschnitt Pilotstart → erste echte Aktivierung.' },
      { label: 'Ø Tage bis Conversion', val: compactDays(headline.avg_days_to_conversion), color: 'var(--text)', title: 'Durchschnitt Pilotstart → zahlend live.' },
      { label: 'Pilot → Aktiviert', val: compactPercent(pilotToActivated.rate_pct), color: Number(pilotToActivated.rate_pct || 0) >= 60 ? 'var(--good)' : 'var(--warn)', title: 'Cohort-Rate Pilotstart → Aktivierung.' },
      { label: 'Aktiviert → Paid', val: compactPercent(activatedToPaid.rate_pct), color: Number(activatedToPaid.rate_pct || 0) >= 35 ? 'var(--good)' : 'var(--warn)', title: 'Cohort-Rate Aktivierung → zahlend live.' },
      { label: 'Pilot → Lost', val: compactPercent(pilotToLost.rate_pct), color: Number(pilotToLost.rate_pct || 0) >= 20 ? 'var(--bad)' : 'var(--text)', title: 'Cohort-Rate Pilotstart → verloren.' }
    ];
    grid.innerHTML = cards.map(function(tile) {
      return '<div class="kpi-tile" title="' + esc(tile.title || '') + '">' +
        '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
        '<span class="kpi-label">' + esc(tile.label) + '</span>' +
      '</div>';
    }).join('');
    if (!detail) return;

    var stageRows = Array.isArray(truth.current_stage_distribution) ? truth.current_stage_distribution : [];
    var atRiskRows = ((((truth || {}).org_drilldown || {}).at_risk) || []).slice(0, 8);
    var bottlenecks = ((((truth || {}).gtm_learning || {}).onboarding_bottlenecks) || []).slice(0, 5);
    var icpRows = ((((truth || {}).gtm_learning || {}).by_icp) || []).slice(0, 5);
    var tariffRows = ((((truth || {}).gtm_learning || {}).by_tariff_path) || []).slice(0, 5);
    var moduleRows = (((truth || {}).gtm_learning || {}).product_area_usage) || [];
    var quality = truth.quality_flags || {};
    var detailHtml = '';

    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Aktueller Funnel-Stand</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Stage</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Orgs</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Ø Tage</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">At-Risk</th>' +
        '</tr></thead>' +
        '<tbody>' +
          (stageRows.length ? stageRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(pilotStageLabel(row.stage)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactDays(row.avg_days_in_stage)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.at_risk_orgs || 0)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">Keine Funnel-Stufen vorhanden.</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Transition-Raten (' + esc(((truth.cohort_window || {}).label) || 'Fenster') + ')</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Transition</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Cohort</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Converted</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Rate</th>' +
        '</tr></thead><tbody>' +
          [
            { label: 'Lead → Registrierung', data: transitions.lead_to_registered || {} },
            { label: 'Registrierung → Pilotstart', data: transitions.registration_to_pilot_started || {} },
            { label: 'Pilotstart → Aktivierung', data: transitions.pilot_started_to_activated || {} },
            { label: 'Aktivierung → Paid', data: transitions.activated_to_paid_live || {} },
            { label: 'Pilot → Lost', data: transitions.pilot_to_lost || {} }
          ].map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.data.cohort_count || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.data.converted_count || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.data.rate_pct)) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '</div>';

    detailHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px">';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">GTM Learnings nach ICP</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">ICP</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Tracked</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Aktiviert</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Converted</th>' +
        '</tr></thead><tbody>' +
          (icpRows.length ? icpRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.label || row.key || '–') + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.tracked_orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.activation_rate_pct)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.conversion_rate_pct)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">Keine ICP-Learnings vorhanden.</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '<div style="overflow:auto">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Tarif-/Pfad-Learnings</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Pfad</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Tracked</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Aktiviert</th>' +
          '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Converted</th>' +
        '</tr></thead><tbody>' +
          (tariffRows.length ? tariffRows.map(function(row) {
            return '<tr>' +
              '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(tariffPathLabel(row.label || row.key)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.tracked_orgs || 0)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.activation_rate_pct)) + '</td>' +
              '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactPercent(row.conversion_rate_pct)) + '</td>' +
            '</tr>';
          }).join('') : '<tr><td colspan="4" style="padding:8px;color:var(--muted)">Keine Tarifpfade vorhanden.</td></tr>') +
        '</tbody>' +
      '</table>' +
    '</div>';
    detailHtml += '</div>';

    if (moduleRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Produktbereiche mit echter Pilotnutzung</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Bereich</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Pilot-Orgs</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Active Pilots</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Successful Usage</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Events</th>' +
          '</tr></thead><tbody>' +
            moduleRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(moduleLabel(row.module)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.pilot_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.active_pilot_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.successful_usage_orgs || 0)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line)">' + esc(compactCount(row.event_count || 0)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }

    if (atRiskRows.length) {
      detailHtml += '<div style="margin-top:12px;overflow:auto">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:6px">At-Risk Pilots</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
          '<thead><tr>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Organisation</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Stage</th>' +
            '<th style="text-align:right;padding:6px;border-bottom:1px solid var(--line)">Risk</th>' +
            '<th style="text-align:left;padding:6px;border-bottom:1px solid var(--line)">Hinweise</th>' +
          '</tr></thead><tbody>' +
            atRiskRows.map(function(row) {
              return '<tr>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(row.org_name || row.org_id || '–') + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(pilotStageLabel(row.current_stage)) + '</td>' +
                '<td style="padding:6px;text-align:right;border-bottom:1px solid var(--line);color:var(--warn)">' + esc(compactCount(row.risk_score || 0)) + '</td>' +
                '<td style="padding:6px;border-bottom:1px solid var(--line)">' + esc(((row.risk_reasons || []).slice(0, 2)).join(' · ') || '–') + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
    }

    if (bottlenecks.length) {
      detailHtml += '<div style="margin-top:10px;font-size:13px;color:var(--muted)">' +
        'Onboarding-Bottlenecks: ' +
        bottlenecks.map(function(row) {
          return esc(row.label + ' (' + compactCount(row.blocked_pilots || 0) + ')');
        }).join(' · ') +
      '</div>';
    }
    if (quality.pre_registration_lead_capture_available === false) {
      detailHtml += '<div style="margin-top:6px;font-size:12px;color:var(--warn)">Pre-Registration-Leads sind nur teilweise vorhanden; Lead-Stage fallbackt sonst ehrlich auf Registrierung.</div>';
    }
    if (quality.pricing_clarity_timestamps_partially_inferred) {
      detailHtml += '<div style="margin-top:6px;font-size:12px;color:var(--muted)">Pricing-Klarheit nutzt teilweise abgeleitete Zeitanker (Pilotstart / Subscription-Erstellung), da kein separates historisches Pricing-Timestamp existiert.</div>';
    }
    detail.innerHTML = detailHtml;
  }

  /* ── Quick Search ─────────────────────────────────── */
  async function runQuickSearch() {
    var q = document.getElementById('quickSearch').value.trim();
    if (!q || q.length < 2) return;
    var sec = document.getElementById('quickSearchSection');
    var box = document.getElementById('quickSearchResults');
    sec.style.display = '';
    box.innerHTML = '<p style="color:var(--muted)">Suche laeuft...</p>';
    try {
      var data = await TC.api.get('/search?q=' + encodeURIComponent(q) + '&type=all&limit=10');
      var results = (data.data && data.data.results) || data.results || [];
      var total = (data.data && data.data.total) || data.total || 0;
      if (!results.length) { box.innerHTML = '<p style="color:var(--muted)">Keine Treffer</p>'; return; }
      var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + total + ' Treffer</div>';
      results.forEach(function(item) {
        var title = item.company_name || item.name || item.title || item.role || item.skill_name || 'Unbekannt';
        var idx = item._index || '';
        html += '<div style="padding:6px 0;border-bottom:1px solid var(--line);font-size:13px">' +
          '<strong>' + esc(title) + '</strong>' +
          (idx ? ' <span style="font-size:10px;color:var(--muted)">[' + esc(idx) + ']</span>' : '') + '</div>';
      });
      box.innerHTML = html;
    } catch (e) {
      box.innerHTML = '<p style="color:var(--bad)">Fehler: ' + esc(e.message) + '</p>';
    }
  }
  window.runQuickSearch = runQuickSearch;

  /* ── Platform Health ──────────────────────────────── */
  async function loadHealth() {
    var grid = document.getElementById('healthGrid');
    try {
      var health;
      try { health = await TC.api.get('/health'); } catch(e) { health = { ok: false }; }

      var searchData, search;
      try { searchData = await TC.api.get('/search/status'); search = (searchData && searchData.data) || searchData || {}; } catch(e) { search = {}; }

      var tiles = [
        { label: 'Datenbank', val: health.ok ? 'Online' : 'Offline', color: health.ok ? 'var(--good)' : 'var(--bad)' },
        { label: 'API Service', val: health.service || 'api', color: 'var(--good)' },
        { label: 'Search Engine', val: search.available ? (search.engine || 'Active') : 'Fallback', color: search.available ? 'var(--good)' : 'var(--warn)' },
        { label: 'Search Indexes', val: (search.availableIndexes || []).length || 0, color: 'var(--brand)' }
      ];
      grid.innerHTML = tiles.map(function(t) {
        return '<div class="kpi-tile"><span class="kpi-val" style="color:' + t.color + ';font-size:20px">' + esc(String(t.val)) + '</span><span class="kpi-label">' + esc(t.label) + '</span></div>';
      }).join('');
    } catch (e) {
      grid.innerHTML = '<p style="color:var(--bad);font-size:13px">Health-Status konnte nicht geladen werden</p>';
    }
  }

  /* ── Capacity Exchange Stats ──────────────────────── */
  async function loadCeStats() {
    var grid = document.getElementById('ceGrid');
    try {
      var feed, sj;
      try { feed = await TC.api.get('/capacity-exchange/feed?limit=1'); } catch(e) { feed = {}; }
      try { sj = await TC.api.get('/sla/search-jobs'); } catch(e) { sj = {}; }
      var posts = (feed.data && feed.data.pagination) ? feed.data.pagination.total : (feed.total || '–');
      var jobs = Array.isArray(sj)
        ? sj.length
        : (sj.data && sj.data.pagination)
          ? sj.data.pagination.total
          : (sj.total || '–');
      grid.innerHTML = [
        {label:'Personal-Posts',val:posts,color:'var(--brand)'},
        {label:'Such-Aufträge',val:jobs,color:'#7c5cff'}
      ].map(function(t){
        return '<div class="kpi-tile"><span class="kpi-val" style="color:'+t.color+'">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span></div>';
      }).join('');
    } catch(e) {
      grid.innerHTML = sectionMessage('Keine CE-Daten');
    }
  }

  /* ── Activity Feed Timeline ───────────────────────── */
  async function loadActivityFeed() {
    var box = document.getElementById('activityTimeline');
    try {
      var data = await TC.api.get('/activity-feed?limit=8');
      var items = (data.data && data.data.items) || data.items || [];
      if (!items.length) {
        box.innerHTML = sectionMessage('Keine Aktivitäten');
        return;
      }
      box.innerHTML = items.map(function(ev) {
        var when = ev.created_at ? new Date(ev.created_at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        return '<div class="timeline-item"><div class="timeline-dot"></div><div><div>'+esc(ev.description||ev.event_type||'Aktion')+'</div><div class="timeline-time">'+when+'</div></div></div>';
      }).join('');
    } catch(e) {
      box.innerHTML = sectionMessage('Aktivitäten konnten nicht geladen werden.');
    }
  }

  /* ── DSGVO Compliance ─────────────────────────────── */
  async function loadDsgvo() {
    var grid = document.getElementById('dsgvoGrid');
    try {
      var d = await TC.api.get('/data-governance/requests?limit=1');
      var total = (d.data && d.data.total) || 0;
      var items = (d.data && d.data.items) || [];
      var pending = items.filter(function(i){return i.status==='pending'||i.status==='in_progress';}).length;

      var inv = await api('/data-governance/inventory');
      var catCount = inv && inv.data && inv.data.categories ? Object.keys(inv.data.categories).length : 4;

      grid.innerHTML = [
        {label:'DSGVO-Anfragen',val:total,color:'var(--brand)'},
        {label:'Offen',val:pending,color:pending>0?'var(--warn)':'var(--good)'},
        {label:'Datenkategorien',val:catCount,color:'var(--text)'}
      ].map(function(t){
        return '<div class="kpi-tile"><span class="kpi-val" style="color:'+t.color+';font-size:20px">'+esc(String(t.val))+'</span><span class="kpi-label">'+esc(t.label)+'</span></div>';
      }).join('');
    } catch(e) {
      grid.innerHTML = sectionMessage('Keine DSGVO-Daten');
    }
  }

  /* ── Kritischer Besetzungsdruck ───────────────────── */
  function formatCriticalAge(item) {
    var ageDays = Number(item && item.age_days || 0);
    if (ageDays > 0) return ageDays + 'd offen';
    var ageMinutes = Number(item && item.age_minutes || 0);
    if ((item && item.kind) === 'emergency' && ageMinutes >= 60) {
      return Math.max(1, Math.round(ageMinutes / 60)) + 'h offen';
    }
    if ((item && item.kind) === 'emergency' && ageMinutes >= 1) {
      return ageMinutes + ' min offen';
    }
    return 'neu';
  }
  function formatCriticalStart(item) {
    if (!item || item.days_to_start == null) return 'kein Startdatum';
    if (item.days_to_start < 0) return 'Start überfällig';
    if (item.days_to_start === 0) return 'Start heute';
    if (item.days_to_start === 1) return 'Start in 1 Tag';
    return 'Start in ' + item.days_to_start + ' Tagen';
  }
  function criticalOpenHeadcount(item) {
    var value = item && item.open_headcount != null
      ? Number(item.open_headcount)
      : Number(item && item.headcount || 0);
    return Math.max(0, value || 0);
  }
  function formatCriticalCoverage(item) {
    if (!item) return 'keine Abdeckung';
    if (item.kind === 'emergency') {
      return (Number(item.committed_count || 0)) + ' zugesagt · ' + (Number(item.response_count || 0)) + ' Reaktionen';
    }
    return (Number(item.shortlisted_count || 0)) + ' Shortlist · ' + (Number(item.supplier_count || 0)) + ' Supplier';
  }
  function criticalSummaryMarkup(section) {
    var summary = section && section.summary || {};
    var total = section && section.total != null
      ? Number(section.total)
      : ((section && section.items && section.items.length) || 0);
    var tiles = [
      {
        label: 'Priorisiert',
        val: total,
        color: 'var(--brand)',
        title: 'Serverseitig priorisierte Fälle mit Druck-Score ab 55.'
      },
      {
        label: 'Risiko',
        val: Number(summary.risk || 0),
        color: 'var(--bad)',
        title: 'Priorisierte Fälle mit Risiko-Ton und besonders hohem Druck-Score.'
      },
      {
        label: 'Warnung',
        val: Number(summary.warn || 0),
        color: 'var(--warn)',
        title: 'Priorisierte Fälle mit Warn-Ton und erhöhter Management-Aufmerksamkeit.'
      },
      {
        label: 'Notdienst',
        val: Number(summary.emergency_open || 0),
        color: '#7c5cff',
        title: 'Priorisierte Emergency-/Notdienstfälle in der aktuellen Management-Sicht.'
      }
    ];
    return '<div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:12px">' +
      tiles.map(function(tile) {
        return '<div class="kpi-tile" title="' + esc(tile.title) + '">' +
          '<span class="kpi-val" style="color:' + tile.color + ';font-size:20px">' + esc(String(tile.val)) + '</span>' +
          '<span class="kpi-label">' + esc(tile.label) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }
  function renderCriticalStaffingPressure(section) {
    var sec = document.getElementById('criticalReqSection');
    if (!sec) return;
    if (!section || section.available === false) {
      sec.innerHTML = sectionMessage('Kritischer Besetzungsdruck derzeit nicht verfügbar.');
      return;
    }
    var summaryHtml = criticalSummaryMarkup(section);
    var items = section.items || [];
    if (!items.length) {
      sec.innerHTML = summaryHtml + sectionMessage('Kein kritischer Besetzungsdruck. Aktuell gibt es keine priorisierten Arbeitsplatzangebote oder Notdienstfälle.');
      return;
    }
    sec.innerHTML = summaryHtml + items.map(function(item) {
      var toneColor = item.tone === 'risk' ? 'var(--bad)' : item.tone === 'warn' ? 'var(--warn)' : 'var(--brand)';
      var kindLabel = item.kind === 'emergency' ? 'Notdienst' : 'Arbeitsplatzangebot';
      var statusLabel = item.status || '';
      var ageTxt = formatCriticalAge(item);
      var startTxt = formatCriticalStart(item);
      var coverageTxt = formatCriticalCoverage(item);
      var openCount = criticalOpenHeadcount(item);
      var openTxt = openCount + (item.kind === 'emergency' ? ' Kräfte offen' : ' Stellen offen');
      var reasons = (item.reasons || []).map(function(reason) {
        return '<span class="critical-pressure-chip">' + esc(reason) + '</span>';
      }).join('');
      var rowTitle = 'Serverseitig priorisiert nach Druck-Score.' +
        ((item.reasons && item.reasons.length) ? (' Treiber: ' + item.reasons.join(', ') + '.') : '');
      return '<a href="' + esc(item.href || '#') + '" class="critical-pressure-row critical-pressure-row--' + esc(item.tone || 'ok') + '" title="' + esc(rowTitle) + '">' +
        '<div class="critical-pressure-row__main">' +
          '<div class="critical-pressure-row__title">' + esc(item.title || 'Vorgang') + '</div>' +
          '<div class="critical-pressure-row__meta">' + esc(kindLabel) + ' · ' + esc(item.role || 'ohne Rolle') + ' · ' + esc(statusLabel) + '</div>' +
          '<div class="critical-pressure-row__meta">' + esc(ageTxt) + ' · ' + esc(startTxt) + ' · ' + esc(openTxt) + ' · ' + esc(coverageTxt) + '</div>' +
          '<div class="critical-pressure-row__reasons">' + reasons + '</div>' +
        '</div>' +
        '<div class="critical-pressure-row__stats">' +
          '<div class="critical-pressure-row__score" style="color:' + toneColor + '">' + esc(String(item.pressure_score || 0)) + '</div>' +
          '<div class="critical-pressure-row__score-label">Druck-Score</div>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  /* ── Bootstrap ────────────────────────────────────────── */
  init();
  loadHealth();
  loadCeStats();
  loadActivityFeed();
  loadDsgvo();
})();
