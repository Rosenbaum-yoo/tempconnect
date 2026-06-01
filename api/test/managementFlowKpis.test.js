/**
 * managementFlowKpis.test.js
 *
 * Testet den Management-Flow:
 * Requisition -> Deal/Besetzung -> Spend -> Executive Dashboard
 *
 * - Kritische Requisitions-Filterlogik
 * - Drilldown-URL-Generierung
 * - KPI-Farb-/Druck-Logik
 * - Prozessfortschritt-Berechnung
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Kritische Requisitions: Filterlogik ───────────────────

describe('Kritische Requisitions: Filterlogik', () => {

  const now = Date.now();
  const MS_DAY = 24 * 60 * 60 * 1000;

  function isCritical(req) {
    if (['FILLED', 'CLOSED', 'CANCELLED'].includes(req.status)) return false;
    var isUrgent = ['urgent', 'notdienst', 'high'].includes(req.urgency);
    var ageMs = req.created_at ? (now - new Date(req.created_at).getTime()) : 0;
    var isOverdue = ageMs > 14 * MS_DAY;
    return isUrgent || isOverdue;
  }

  it('Dringende Requisition ist kritisch', () => {
    assert.ok(isCritical({ status: 'OPEN', urgency: 'urgent', created_at: new Date(now - MS_DAY).toISOString() }));
  });

  it('Notdienst-Requisition ist kritisch', () => {
    assert.ok(isCritical({ status: 'OPEN', urgency: 'notdienst', created_at: new Date(now - MS_DAY).toISOString() }));
  });

  it('Alte Requisition (> 14 Tage) ist kritisch', () => {
    assert.ok(isCritical({ status: 'OPEN', urgency: 'normal', created_at: new Date(now - 15 * MS_DAY).toISOString() }));
  });

  it('Junge normale Requisition ist nicht kritisch', () => {
    assert.ok(!isCritical({ status: 'OPEN', urgency: 'normal', created_at: new Date(now - 3 * MS_DAY).toISOString() }));
  });

  it('Besetzte Requisition ist nie kritisch', () => {
    assert.ok(!isCritical({ status: 'FILLED', urgency: 'urgent', created_at: new Date(now - 20 * MS_DAY).toISOString() }));
  });

  it('Stornierte Requisition ist nie kritisch', () => {
    assert.ok(!isCritical({ status: 'CANCELLED', urgency: 'notdienst', created_at: new Date(now - 1 * MS_DAY).toISOString() }));
  });

  it('Geschlossene Requisition ist nie kritisch', () => {
    assert.ok(!isCritical({ status: 'CLOSED', urgency: 'high', created_at: new Date(now - 20 * MS_DAY).toISOString() }));
  });
});

// ── Prozessfortschritt-Berechnung ─────────────────────────

describe('Requisition: Prozessfortschritt', () => {

  var FLOW_STEPS = {
    'DRAFT': 1, 'PENDING_APPROVAL': 2, 'APPROVED': 3,
    'OPEN': 4, 'IN_REVIEW': 5, 'SHORTLISTED': 6, 'FILLED': 7, 'CLOSED': 7, 'CANCELLED': 0
  };

  function getProgress(status) {
    var step = FLOW_STEPS[status] != null ? FLOW_STEPS[status] : 1;
    return Math.round((Math.max(0, step) / 7) * 100);
  }

  it('DRAFT = 14%', () => {
    assert.strictEqual(getProgress('DRAFT'), 14);
  });

  it('FILLED = 100%', () => {
    assert.strictEqual(getProgress('FILLED'), 100);
  });

  it('CANCELLED = 0%', () => {
    assert.strictEqual(getProgress('CANCELLED'), 0);
  });

  it('OPEN = 57%', () => {
    assert.strictEqual(getProgress('OPEN'), 57);
  });

  it('IN_REVIEW = 71%', () => {
    assert.strictEqual(getProgress('IN_REVIEW'), 71);
  });
});

// ── Drilldown-URL-Generierung ──────────────────────────────

describe('Management-Flow: Drilldown-URL-Generierung', () => {

  function buildReqDrilldown(status, urgency) {
    var params = [];
    if (status) params.push('status=' + encodeURIComponent(status));
    if (urgency) params.push('urgency=' + encodeURIComponent(urgency));
    return '/public/requisitions.html' + (params.length ? '?' + params.join('&') : '');
  }

  function buildSpendDrilldown(role, category, region) {
    var params = [];
    if (role) params.push('role=' + encodeURIComponent(role));
    if (category) params.push('category=' + encodeURIComponent(category));
    if (region) params.push('region=' + encodeURIComponent(region));
    return '/public/spend-analytics.html' + (params.length ? '?' + params.join('&') : '');
  }

  it('Drilldown Requisitions nach Status OPEN', () => {
    var url = buildReqDrilldown('OPEN', '');
    assert.ok(url.includes('status=OPEN'));
    assert.ok(!url.includes('urgency='));
  });

  it('Drilldown Requisitions nach Dringlichkeit urgent', () => {
    var url = buildReqDrilldown('', 'urgent');
    assert.ok(url.includes('urgency=urgent'));
    assert.ok(!url.includes('status='));
  });

  it('Kombinierter Drilldown Status + Urgency', () => {
    var url = buildReqDrilldown('IN_REVIEW', 'high');
    assert.ok(url.includes('status=IN_REVIEW'));
    assert.ok(url.includes('urgency=high'));
  });

  it('Spend-Drilldown nach Rolle', () => {
    var url = buildSpendDrilldown('Schweißer', '', '');
    assert.ok(url.includes('role=Schwei%C3%9Fer'));
  });

  it('Spend-Drilldown nach Kategorie und Region', () => {
    var url = buildSpendDrilldown('', 'Produktion', 'Berlin');
    assert.ok(url.includes('category=Produktion'));
    assert.ok(url.includes('region=Berlin'));
  });

  it('Leere Drilldown-URL ohne Parameter', () => {
    var url = buildReqDrilldown('', '');
    assert.strictEqual(url, '/public/requisitions.html');
  });

  // ── Location-Scope Drilldown (Pflicht-Tests) ─────────────
  // Spiegelt das locParam-Spread-Muster aus reportingService.getProcurementPulse

  function buildDrilldown(base, params) {
    var qs = Object.entries(params)
      .filter(function(e) { return e[1] != null && e[1] !== ''; })
      .map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
      .join('&');
    return base + (qs ? '?' + qs : '');
  }

  it('Drilldown enthält location_id wenn locParam gesetzt', () => {
    var locParam = { location_id: 'loc-abc-123' };
    var url = buildDrilldown('/public/requisitions.html', { status_group: 'backlog', ...locParam });
    assert.ok(url.includes('location_id=loc-abc-123'), 'location_id muss im Drilldown-URL stehen: ' + url);
    assert.ok(url.includes('status_group=backlog'), 'Basis-Parameter darf nicht verloren gehen: ' + url);
  });

  it('Drilldown enthält KEINE location_id wenn locParam leer ist', () => {
    var locParam = {};
    var url = buildDrilldown('/public/vendor_pool.html', { status_group: 'activity_30d', ...locParam });
    assert.ok(!url.includes('location_id'), 'location_id darf nicht erscheinen wenn kein Standort aktiv ist');
  });

  it('Spend-Drilldown überträgt location_id und Datumsparameter gleichzeitig', () => {
    var locParam = { location_id: 'loc-test-42' };
    var url = buildDrilldown('/public/spend-analytics.html', {
      date_from: '2026-01-01', date_to: '2026-01-31', ...locParam
    });
    assert.ok(url.includes('location_id=loc-test-42'), 'location_id muss enthalten sein');
    assert.ok(url.includes('date_from=2026-01-01'), 'date_from muss enthalten sein');
    assert.ok(url.includes('date_to=2026-01-31'), 'date_to muss enthalten sein');
  });
});

// ── KPI-Farb-/Druck-Logik ─────────────────────────────────

describe('Executive Dashboard: KPI-Farb-Logik', () => {

  function getOpenReqColor(count) {
    return count >= 20 ? 'var(--bad)' : count >= 8 ? 'var(--warn)' : 'var(--brand)';
  }

  function getVendorColor(count) {
    return count === 0 ? 'var(--bad)' : count < 3 ? 'var(--warn)' : 'var(--good)';
  }

  function getOverRateColor(pct) {
    return pct > 10 ? 'var(--bad)' : 'var(--warn)';
  }

  it('Wenige offene Requisitions = brand (OK)', () => {
    assert.strictEqual(getOpenReqColor(3), 'var(--brand)');
  });

  it('Viele offene Requisitions = warn', () => {
    assert.strictEqual(getOpenReqColor(10), 'var(--warn)');
  });

  it('Sehr viele offene Requisitions = bad (kritisch)', () => {
    assert.strictEqual(getOpenReqColor(25), 'var(--bad)');
  });

  it('Keine Vendoren = bad', () => {
    assert.strictEqual(getVendorColor(0), 'var(--bad)');
  });

  it('Wenige Vendoren = warn', () => {
    assert.strictEqual(getVendorColor(2), 'var(--warn)');
  });

  it('Genuegend Vendoren = good', () => {
    assert.strictEqual(getVendorColor(5), 'var(--good)');
  });

  it('Over-Rate > 10% = bad', () => {
    assert.strictEqual(getOverRateColor(15), 'var(--bad)');
  });

  it('Over-Rate <= 10% = warn', () => {
    assert.strictEqual(getOverRateColor(8), 'var(--warn)');
  });
});
