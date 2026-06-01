/**
 * procurementCrossLinks.test.js
 *
 * Testet die Procurement-Verdrahtungslogik (April 2026):
 * - URL-Parameter-Generierung fuer Deep-Links
 * - Domenlogik fuer Cross-Navigation
 * - KPI-Ableitung aus vorhandenen Daten
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Skip guard: frontend files not mounted in Docker
const ROOT = process.cwd();
const HAS_API_SUBDIR = fs.existsSync(path.join(ROOT, 'api'));
const FRONTEND_AVAILABLE = HAS_API_SUBDIR && fs.existsSync(path.join(ROOT, 'frontend/public/requisitions.html'));
const frontendSuite = FRONTEND_AVAILABLE ? describe : describe.skip;

function readFrontendFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');
}

// ── URL-Parameter Deep-Link Logik ──────────────────────────

describe('Procurement Cross-Link: URL-Parameter Generierung', () => {

  function buildRateCardUrl(role, city, supplierId, supplierName) {
    var url = '/public/rate-cards.html?role=' + encodeURIComponent(role || '');
    if (city) url += '&region=' + encodeURIComponent(city);
    if (supplierId) url += '&supplier_org_id=' + encodeURIComponent(supplierId);
    if (supplierName) url += '&supplier_name=' + encodeURIComponent(supplierName);
    return url;
  }

  function buildScorecardUrl(supplierId, supplierName) {
    return '/public/supplier_scorecard.html?agencyId=' + encodeURIComponent(supplierId || '')
      + '&agencyName=' + encodeURIComponent(supplierName || '');
  }

  function buildSpendUrl(supplierId, supplierName, role) {
    var params = [];
    if (supplierId) params.push('vendor_id=' + encodeURIComponent(supplierId));
    if (supplierName) params.push('supplier=' + encodeURIComponent(supplierName));
    if (role) params.push('category=' + encodeURIComponent(role));
    return '/public/spend-analytics.html' + (params.length ? '?' + params.join('&') : '');
  }

  it('Rate Card URL enthaelt Rolle korrekt enkodiert', () => {
    var url = buildRateCardUrl('Schweißer', 'München');
    assert.ok(url.includes('role=Schwei%C3%9Fer'), 'Umlaute muessen enkodiert sein: ' + url);
    assert.ok(url.includes('region=M%C3%BCnchen'), 'Region muss enkodiert sein: ' + url);
  });

  it('Rate Card URL ohne Region ist valide', () => {
    var url = buildRateCardUrl('Lagerhelfer', '');
    assert.ok(url.includes('role=Lagerhelfer'));
    assert.ok(!url.includes('region='), 'Leere Region darf nicht angehaengt werden');
  });

  it('Rate Card URL kann Supplier-Kontext mitgeben', () => {
    var url = buildRateCardUrl('Elektriker', 'Berlin', 'sup-123', 'Best Supplier GmbH');
    assert.ok(url.includes('supplier_org_id=sup-123'));
    assert.ok(url.includes('supplier_name=Best'));
  });

  it('Scorecard URL enthaelt agencyId und agencyName', () => {
    var url = buildScorecardUrl('abc-123', 'TestGmbH');
    assert.ok(url.includes('agencyId=abc-123'));
    assert.ok(url.includes('agencyName=TestGmbH'));
  });

  it('Scorecard URL mit Sonderzeichen im Namen korrekt enkodiert', () => {
    var url = buildScorecardUrl('uuid-456', 'Personal & Service GmbH');
    assert.ok(url.includes('agencyName=Personal'), 'Name muss in URL enthalten sein');
    assert.ok(!url.includes(' & '), 'Leerzeichen und & muessen enkodiert sein');
  });

  it('Leere agencyId erzeugt valide aber leere URL', () => {
    var url = buildScorecardUrl('', '');
    assert.ok(url.startsWith('/public/supplier_scorecard.html'));
    assert.ok(url.includes('agencyId='));
  });

  it('Spend-URL nutzt vendor_id fuer Supplier-Drilldowns', () => {
    var url = buildSpendUrl('sup-789', 'Alpha & Beta GmbH', 'Pflege');
    assert.ok(url.includes('vendor_id=sup-789'));
    assert.ok(url.includes('supplier=Alpha'));
    assert.ok(url.includes('category=Pflege'));
  });
});

frontendSuite('Procurement Cross-Link: Requisition-Detail Skriptvertrag', () => {
  it('verwendet category statt legacy role fuer den Spend-Drilldown', () => {
    var script = readFrontendFile('frontend/public/js/pages/requisitions.js');
    assert.match(
      script,
      /var catEncoded = encodeURIComponent\(req\.worker_category \|\| req\.role \|\| ''\);/
    );
    assert.match(
      script,
      /var spendUrl = '\/public\/spend-analytics\.html'\s*\r?\n\s*\+ \(catEncoded \? '\?category=' \+ catEncoded : ''\);/
    );
    assert.doesNotMatch(
      script,
      /var roleEncoded = encodeURIComponent\(req\.role \|\| ''\);/
    );
    assert.doesNotMatch(
      script,
      /\+ \(req\.role \? '\?role=' \+ roleEncoded : ''\);/
    );
  });
});

frontendSuite('Procurement Cross-Link: Page-Script-Verdrahtung', () => {
  it('requisitions.html bindet das ausgelagerte Page-Modul', () => {
    var html = readFrontendFile('frontend/public/requisitions.html');
    assert.match(
      html,
      /<script src="\/public\/js\/pages\/requisitions\.js"><\/script>/
    );
  });

  it('vendor_pool.html bindet das ausgelagerte Page-Modul', () => {
    var html = readFrontendFile('frontend/public/vendor_pool.html');
    assert.match(
      html,
      /<script src="\/public\/js\/pages\/vendorPool\.js"><\/script>/
    );
  });
});

frontendSuite('Procurement Cross-Link: Rate-Card Sichtbarkeitsvertraege', () => {
  it('rate-cards.html modelliert Org-Lock, Read-only und Write-Gating im Quelltext', () => {
    var html = readFrontendFile('frontend/public/rate-cards.html');
    assert.match(html, /mode: 'org_locked'/);
    assert.match(html, /mode: 'read_only'/);
    assert.match(html, /if \(!rateCardAccess\.canRead\) return \{ status: 'blocked' \};/);
    assert.match(html, /if \(rateCardAccess\.canWrite && rc\.status === 'draft'\)/);
  });

  it('requisitions und vendor pool rendern Rate-Card-Aktionen nur hinter Zugriffsgates', () => {
    var reqHtml = readFrontendFile('frontend/public/requisitions.html');
    var reqScript = readFrontendFile('frontend/public/js/pages/requisitions.js');
    var vendorHtml = readFrontendFile('frontend/public/vendor_pool.html');
    var vendorScript = readFrontendFile('frontend/public/js/pages/vendorPool.js');

    assert.match(reqHtml, /id="reqRateCardLink"/);
    assert.ok(reqScript.includes("if (rateCardAccess.canRead) {"), 'Requisitions-Detail muss Rate-Card-CTA nur bei Zugriff rendern.');
    assert.ok(reqScript.includes("rateCardAccess.reason"), 'Requisitions-Detail muss bei gesperrtem Zugriff eine fachliche Erklaerung tragen.');

    assert.match(vendorHtml, /id="vendorPoolRateCardLink"/);
    assert.ok(vendorScript.includes("if(!rateCardAccess.canRead)return '';"), 'Vendor-Pool muss die Rate-Card-URL bei gesperrtem Zugriff leer lassen.');
    assert.ok(vendorScript.includes("var rateCardLink=rateCardAccess.canRead"), 'Vendor-Pool-Quicklink muss am Zugriffsgate haengen.');
  });

  it('supplier scorecard, spend analytics, compliance und executive dashboard gate ihre Rate-Card-Einstiege', () => {
    var scorecard = readFrontendFile('frontend/public/supplier_scorecard.html');
    var spend = readFrontendFile('frontend/public/spend-analytics.html');
    var compliance = readFrontendFile('frontend/public/compliance_overview.html');
    var executive = readFrontendFile('frontend/public/js/pages/executiveDashboard.js');

    assert.match(scorecard, /id="scorecardRateCardNavLink"/);
    assert.ok(scorecard.includes("scorecardAccess = resolveSurfaceAccess(currentMe, 'supplier_scorecard');"), 'Scorecard muss den gemeinsamen Surface-Access vor den Seiten-Requests auswerten.');
    assert.ok(scorecard.includes("rateCardAccess = resolveSurfaceAccess(currentMe, 'rate_cards');"), 'Scorecard muss den Nutzerkontext vor Rate-Card-Links auswerten.');
    assert.ok(scorecard.includes("var canShowRate = rateCardAccess.canRead && id;"), 'Scorecard-Deep-Link muss an Rate-Card-Zugriff gekoppelt bleiben.');

    assert.match(spend, /id="spendRateCardLink"/);
    assert.ok(spend.includes("rateCardAccess.canRead ? loadRateComparison(qs, loadId) : Promise.resolve({ section: 'Preisrahmen-Abgleich', status: 'blocked' })"), 'Spend-Analyse darf den Preisrahmen-Abgleich nur bei Zugriff laden.');

    assert.ok(compliance.includes("if(rateCardAccess.canRead){var rateCardStats=await apiGet('/rate-cards/stats');"), 'Compliance darf Rate-Card-Risiken nur bei Zugriff anfragen.');

    assert.ok(executive.includes("href:rateCardAccess.canRead ? '/public/rate-cards.html' : null"), 'Executive Over-Rate-Drilldown muss an Rate-Card-Zugriff gekoppelt bleiben.');
    assert.ok(executive.includes("if (!rateCardAccess.canRead && href && href.indexOf('/public/rate-cards') !== -1)"), 'Executive Procurement Pulse muss Rate-Card-Hrefs fuer gesperrte Nutzer entfernen.');
  });

  it('shell, hub und Demo-Hinweis bewerben Preisrahmen nur kontextgerecht', () => {
    var shell = readFrontendFile('frontend/public/js/pageShell.js');
    var enterprise = readFrontendFile('frontend/public/enterprise.html');
    var hubScript = readFrontendFile('frontend/public/js/pages/enterpriseHub.js');
    var hints = readFrontendFile('frontend/public/js/contextHints.js');

    assert.ok(shell.includes('key: "steuerung"'), 'Die Shell-Navigation braucht einen adressierbaren Steuerungseintrag.');
    assert.ok(shell.includes('resolveRateCardAccess(me)'), 'Die Shell muss Rate-Card-Zugriff aus dem Nutzerkontext ableiten.');
    assert.ok(shell.includes('updateNavLinkDescription("steuerung"'), 'Die Shell muss die Steuerungsbeschreibung nach dem Nutzerkontext aktualisieren.');
    assert.ok(shell.includes('getSteeringNavDescription'), 'Die Shell muss eine fachliche Beschreibung pro Zugriffslage erzeugen.');

    assert.match(enterprise, /id="supplierGovernanceDesc"/);
    assert.match(enterprise, /id="supplierGovernanceNote"/);
    assert.ok(hubScript.includes('applySupplierGovernanceCopy(me);'), 'Der Enterprise-Hub muss die Lieferantensteuerungs-Kopie aus dem Nutzerkontext ableiten.');
    assert.ok(hubScript.includes('TC.shell.resolveRateCardAccess'), 'Der Enterprise-Hub soll dieselbe Rate-Card-Zugriffslogik wie die Shell nutzen.');

    assert.ok(hints.includes('Organisation, Tarif und Rolle dafuer freigeschaltet sind'), 'Der Demo-Hinweis fuer Preisrahmen darf keine generelle Verfuegbarkeit suggerieren.');
    assert.doesNotMatch(hints, /Verwalten Sie Stundensatz-Korridore nach Rolle und Region/);
  });
});

// ── Procurement-Kreislauf Domaenenlogik ───────────────────

describe('Procurement-Kreislauf: Domaenzuordnung', () => {

  const DOMAIN_MAP = {
    requisitions: { label: 'Beschaffungsbedarf', leads_to: ['vendor_pool', 'rate_cards', 'spend_analytics'] },
    vendor_pool:  { label: 'Lieferantensteuerung', leads_to: ['supplier_scorecard', 'rate_cards', 'spend_analytics'] },
    supplier_scorecard: { label: 'Leistungsbewertung', leads_to: ['vendor_pool', 'requisitions', 'spend_analytics'] },
    rate_cards:   { label: 'Kommerzielle Konditionsbasis', leads_to: ['vendor_pool', 'spend_analytics', 'requisitions'] },
    spend_analytics: { label: 'Kostenanalyse', leads_to: ['rate_cards', 'supplier_scorecard', 'requisitions'] },
    executive_dashboard: { label: 'Managementsicht', leads_to: ['requisitions', 'vendor_pool', 'supplier_scorecard', 'rate_cards', 'spend_analytics'] }
  };

  it('Alle 6 Domaenen sind definiert', () => {
    assert.strictEqual(Object.keys(DOMAIN_MAP).length, 6);
  });

  it('Executive Dashboard hat Drilldowns in alle anderen Domaenen', () => {
    var eds = DOMAIN_MAP.executive_dashboard.leads_to;
    assert.ok(eds.includes('requisitions'));
    assert.ok(eds.includes('vendor_pool'));
    assert.ok(eds.includes('supplier_scorecard'));
    assert.ok(eds.includes('rate_cards'));
    assert.ok(eds.includes('spend_analytics'));
  });

  it('Requisition fuehrt zu Vendor Pool, Rate Cards und Spend', () => {
    var r = DOMAIN_MAP.requisitions.leads_to;
    assert.ok(r.includes('vendor_pool'));
    assert.ok(r.includes('rate_cards'));
    assert.ok(r.includes('spend_analytics'));
  });

  it('Vendor Pool fuehrt zu Scorecard (Deep-Link mit agencyId)', () => {
    var vp = DOMAIN_MAP.vendor_pool.leads_to;
    assert.ok(vp.includes('supplier_scorecard'));
  });

  it('Jede Domaene hat mindestens 2 ausgehende Verlinkungen', () => {
    Object.entries(DOMAIN_MAP).forEach(function([key, val]) {
      assert.ok(val.leads_to.length >= 2,
        key + ' muss mindestens 2 ausgehende Verlinkungen haben, hat ' + val.leads_to.length);
    });
  });
});

// ── Worker Skills Logik ────────────────────────────────────

describe('Worker Skills & Qualifikationen: Client-seitige Logik', () => {

  function buildSkillTags(existing, newSkill) {
    var tags = existing.slice();
    if (newSkill && !tags.includes(newSkill)) tags.push(newSkill);
    return tags;
  }

  function removeSkill(tags, index) {
    return tags.filter(function(_, i) { return i !== index; });
  }

  it('Skill hinzufuegen funktioniert', () => {
    var result = buildSkillTags(['Schweissen'], 'SPS');
    assert.deepStrictEqual(result, ['Schweissen', 'SPS']);
  });

  it('Doppelter Skill wird nicht nochmal hinzugefuegt', () => {
    var result = buildSkillTags(['Schweissen', 'SPS'], 'SPS');
    assert.strictEqual(result.length, 2);
  });

  it('Leerer Skill wird ignoriert', () => {
    var result = buildSkillTags(['Schweissen'], '');
    assert.strictEqual(result.length, 1);
  });

  it('Skill entfernen per Index', () => {
    var result = removeSkill(['Schweissen', 'SPS', 'Gabelstapler'], 1);
    assert.deepStrictEqual(result, ['Schweissen', 'Gabelstapler']);
  });

  it('Letzten Skill entfernen ergibt leeres Array', () => {
    var result = removeSkill(['Schweissen'], 0);
    assert.deepStrictEqual(result, []);
  });

  function buildQualification(name, expiryDate) {
    if (!name || !name.trim()) return null;
    return { name: name.trim(), expires_at: expiryDate || null };
  }

  it('Qualifikation mit Ablaufdatum korrekt gebaut', () => {
    var q = buildQualification('Staplerschein', '2027-12-31');
    assert.ok(q !== null);
    assert.strictEqual(q.name, 'Staplerschein');
    assert.strictEqual(q.expires_at, '2027-12-31');
  });

  it('Qualifikation ohne Name gibt null zurueck', () => {
    var q = buildQualification('', '2027-01-01');
    assert.strictEqual(q, null);
  });

  it('Qualifikation ohne Ablaufdatum ist valide', () => {
    var q = buildQualification('Fuehrerschein Klasse B', null);
    assert.ok(q !== null);
    assert.strictEqual(q.expires_at, null);
  });
});
