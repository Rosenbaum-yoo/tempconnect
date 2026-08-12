import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnterpriseSurfaceAccess } from "../services/enterpriseSurfaceAccessService.js";

/* ═══════════════════════════════════════════════════════════════════════════
 * Die Flächenmatrix, Zeile für Zeile
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MUTATION-WELLE 3. Der Dienst entscheidet für ~10 Flächen je einen Modus und
 * bis zu fünf Fähigkeiten — rund 60 boolesche Aussagen. Geprüft waren davon
 * eine Handvoll, entsprechend überlebten 92 Mutanten: jedes `isAdmin`, das zu
 * `true` wird, jedes `proPlan &&`, das wegfällt.
 *
 * Einzeltests dafür wären unlesbar. Stattdessen eine Tabelle: je Kontext die
 * ERWARTETE Zeile der Matrix, vollständig. Das ist zugleich die einzige
 * lesbare Fassung dessen, was das Produkt eigentlich zusagt — wer wissen will,
 * was ein Disponent im DEMO-Tarif sieht, liest hier eine Zeile statt fünf
 * Verzweigungen im Dienst.
 *
 * Rollenmengen (aus dem Dienst):
 *   ADMIN   = platform_admin, owner, admin
 *   SENIOR  = ADMIN + program_manager
 *   MANAGER = SENIOR + supplier_manager
 */
const FAELLE = [
  {
    was: "Agentur, Eigentümer",
    ctx: { plan: "PRO", orgType: "agency", orgRole: "owner" },
    erwartet: {
      vendor_pool:         { mode: "org_locked" },
      supplier_scorecard:  { mode: "org_locked" },
      rate_cards:          { mode: "org_locked" },
      spend_analytics:     { mode: "org_locked" },
      executive_dashboard: { mode: "org_locked" },
      data_governance:     { mode: "org_locked" },
      compliance_overview: { mode: "full", canRead: true, canUpload: true, canVerify: true, canDelete: true, canManage: true },
      audit_trail:         { mode: "full", canRead: true, canExport: true, canFilter: true },
      multi_location:      { mode: "full", canRead: true, canWrite: true, canManage: true }
    }
  },
  {
    was: "Agentur, einfacher Mitarbeiter",
    ctx: { plan: "PRO", orgType: "agency", orgRole: "supplier_user" },
    erwartet: {
      vendor_pool:         { mode: "org_locked" },
      compliance_overview: { mode: "full", canRead: true, canUpload: true, canVerify: false, canDelete: false, canManage: false },
      audit_trail:         { mode: "full", canRead: true, canExport: false, canFilter: true },
      multi_location:      { mode: "full", canRead: true, canWrite: false, canManage: false }
    }
  },
  {
    was: "Unternehmen PRO, Eigentümer",
    ctx: { plan: "PRO", orgType: "company", orgRole: "owner" },
    erwartet: {
      vendor_pool:         { mode: "full", canRead: true, canManage: true, canInvite: true, canWrite: true },
      supplier_scorecard:  { mode: "full", canRead: true, canAnnotate: true, canExport: true, canWrite: true },
      rate_cards:          { mode: "full", canRead: true, canWrite: true, canPublish: true, canExport: true },
      spend_analytics:     { mode: "full", canRead: true, canWrite: true, canExport: true, canDrilldown: true, canCompare: true },
      executive_dashboard: { mode: "full", canRead: true, canExport: true },
      data_governance:     { mode: "full", canRead: true, canExport: true, canAnonymize: true, canRetention: true, canRequests: true },
      compliance_overview: { mode: "full", canRead: true, canUpload: true, canVerify: true, canDelete: true, canManage: true }
    }
  },
  {
    was: "Unternehmen PRO, Buchhaltung",
    ctx: { plan: "PRO", orgType: "company", orgRole: "finance" },
    erwartet: {
      // finance ist weder Admin noch Senior noch Manager
      vendor_pool:         { mode: "read_only", canRead: true, canManage: false, canInvite: false, canWrite: false },
      supplier_scorecard:  { mode: "read_only", canRead: true, canAnnotate: false, canExport: true, canWrite: false },
      // Sonderfall: darf exportieren, aber nicht schreiben
      rate_cards:          { mode: "full", canRead: true, canWrite: false, canPublish: false, canExport: true },
      spend_analytics:     { mode: "full", canRead: true, canWrite: false, canExport: true, canDrilldown: true, canCompare: false },
      executive_dashboard: { mode: "role_locked", canRead: false, canExport: false },
      data_governance:     { mode: "role_locked", canRead: false, canExport: false, canAnonymize: false, canRetention: false, canRequests: false },
      compliance_overview: { mode: "read_only", canRead: true, canUpload: false, canVerify: false, canDelete: false, canManage: false },
      audit_trail:         { mode: "full", canRead: true, canExport: false, canFilter: true }
    }
  },
  {
    was: "Unternehmen PRO, Programmleitung",
    ctx: { plan: "PRO", orgType: "company", orgRole: "program_manager" },
    erwartet: {
      // Senior und Manager, aber NICHT Admin
      vendor_pool:         { mode: "full", canRead: true, canManage: false, canInvite: true, canWrite: true },
      supplier_scorecard:  { mode: "full", canRead: true, canAnnotate: true, canExport: true, canWrite: true },
      rate_cards:          { mode: "full", canRead: true, canWrite: false, canPublish: false, canExport: false },
      spend_analytics:     { mode: "full", canRead: true, canWrite: false, canExport: true, canDrilldown: true, canCompare: true },
      executive_dashboard: { mode: "full", canRead: true, canExport: true },
      data_governance:     { mode: "role_locked", canRead: false },
      compliance_overview: { mode: "full", canRead: true, canUpload: true, canVerify: true, canDelete: false, canManage: false }
    }
  },
  {
    was: "Unternehmen PRO, Lieferantenbetreuung",
    ctx: { plan: "PRO", orgType: "company", orgRole: "supplier_manager" },
    erwartet: {
      // Manager, aber weder Senior noch Admin
      vendor_pool:         { mode: "full", canRead: true, canManage: false, canInvite: true, canWrite: true },
      supplier_scorecard:  { mode: "full", canRead: true, canAnnotate: true, canExport: true, canWrite: false },
      executive_dashboard: { mode: "role_locked", canRead: false, canExport: false },
      spend_analytics:     { mode: "full", canCompare: false }
    }
  },
  {
    was: "Unternehmen PRO, Lieferanten-Nutzer",
    ctx: { plan: "PRO", orgType: "company", orgRole: "supplier_user" },
    erwartet: {
      // Sonderfall: gesperrt, darf aber hochladen
      compliance_overview: { mode: "role_locked", canRead: false, canUpload: true, canVerify: false, canDelete: false, canManage: false }
    }
  },
  {
    was: "Unternehmen DEMO, Eigentümer",
    ctx: { plan: "DEMO", orgType: "company", orgRole: "owner" },
    erwartet: {
      // Rolle voll, Plan sperrt — die bezahlten Flächen bleiben zu
      vendor_pool:         { mode: "full", canRead: true, canManage: true },
      rate_cards:          { mode: "plan_locked", canRead: false, canWrite: false, canPublish: false, canExport: false },
      spend_analytics:     { mode: "plan_locked", canRead: false, canWrite: false, canExport: false, canDrilldown: false, canCompare: false },
      data_governance:     { mode: "plan_locked", canRead: false, canExport: false, canAnonymize: false, canRetention: false, canRequests: false },
      executive_dashboard: { mode: "full", canRead: true, canExport: true },
      audit_trail:         { mode: "full", canRead: true, canExport: true, canFilter: true }
    }
  }
];

describe("enterpriseSurfaceAccessService — die Matrix Zeile für Zeile", () => {
  for (const fall of FAELLE) {
    it(fall.was, () => {
      const access = resolveEnterpriseSurfaceAccess({ role: fall.ctx.orgType, ...fall.ctx });
      for (const [flaeche, felder] of Object.entries(fall.erwartet)) {
        assert.ok(access[flaeche], `Fläche ${flaeche} fehlt in der Antwort`);
        for (const [feld, soll] of Object.entries(felder)) {
          assert.strictEqual(
            access[flaeche][feld], soll,
            `${fall.was} → ${flaeche}.${feld}: erwartet ${soll}, bekommen ${access[flaeche][feld]}`
          );
        }
      }
    });
  }
});

describe("enterpriseSurfaceAccessService", () => {
  it("grants full buyer and governance surfaces to a PRO company owner", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });

    assert.deepEqual(
      {
        vendorPool: access.vendor_pool.mode,
        scorecard: access.supplier_scorecard.mode,
        spend: access.spend_analytics.mode,
        executive: access.executive_dashboard.mode,
        compliance: access.compliance_overview.mode,
        governance: access.data_governance.mode,
        rateCards: access.rate_cards.mode
      },
      {
        vendorPool: "full",
        scorecard: "full",
        spend: "full",
        executive: "full",
        compliance: "full",
        governance: "full",
        rateCards: "full"
      }
    );
    assert.equal(access.spend_analytics.canExport, true);
    assert.equal(access.compliance_overview.canUpload, true);
    assert.equal(access.data_governance.canAnonymize, true);
  });

  it("keeps finance users read-only on procurement surfaces but allows executive spend access", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "finance"
    });

    assert.equal(access.vendor_pool.mode, "read_only");
    assert.equal(access.vendor_pool.canManage, false);
    assert.equal(access.supplier_scorecard.mode, "read_only");
    assert.equal(access.supplier_scorecard.canAnnotate, false);
    assert.equal(access.spend_analytics.mode, "full");
    assert.equal(access.spend_analytics.canWrite, false);
    assert.equal(access.rate_cards.mode, "full");
    assert.equal(access.compliance_overview.mode, "read_only");
    assert.equal(access.data_governance.mode, "role_locked");
  });

  it("models supplier-user compliance access as upload-only soft lock", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "company",
      orgType: "company",
      orgRole: "supplier_user"
    });

    assert.equal(access.compliance_overview.mode, "role_locked");
    assert.equal(access.compliance_overview.canRead, false);
    assert.equal(access.compliance_overview.canUpload, true);
    assert.equal(access.compliance_overview.canVerify, false);
    assert.equal(access.compliance_overview.canDelete, false);
  });

  it("soft-locks buyer-only control surfaces for agency organizations while leaving compliance role-governed", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      role: "agency",
      orgType: "agency",
      orgRole: "owner"
    });

    assert.equal(access.vendor_pool.mode, "org_locked");
    assert.equal(access.supplier_scorecard.mode, "org_locked");
    assert.equal(access.spend_analytics.mode, "org_locked");
    assert.equal(access.executive_dashboard.mode, "org_locked");
    assert.equal(access.rate_cards.mode, "org_locked");
    assert.equal(access.compliance_overview.mode, "full");
  });

  /*
   * MUTATION-KILL (Welle 3). isProPlus beginnt mit
   *
   *     if (!plan) return false;
   *
   * Der Mutant dreht das in `return true` — und ueberlebte. Eine Organisation
   * OHNE Planangabe bekaeme damit PRO-Flaechen frei: Spend Analytics, Rate
   * Cards und Data Governance. Also bezahlte Auswertungen, fremde
   * Konditionsrahmen und die Datenschutz-Flaeche.
   *
   * Der Kommentar ueber der Funktion nennt sie ausdruecklich "bypass-sicher" —
   * eine Absicht, die bisher niemand nachgewiesen hat.
   *
   * Erreichbar ist das: resolveEnterpriseSurfaceAccess hat zwar plan = "DEMO"
   * als Vorgabe, die aber nicht greift, wenn null AUSDRUECKLICH uebergeben
   * wird. Genau das liefert ein leeres plan-Feld aus der Datenbank
   * (services/userService.js reicht den Org-Plan unveraendert durch).
   */
  for (const [bezeichnung, plan] of [
    ["null",           null],
    ["leerer String",  ""],
    ["undefined",      undefined]
  ]) {
    it(`sperrt PRO-Flaechen, wenn der Plan ${bezeichnung} ist`, () => {
      const access = resolveEnterpriseSurfaceAccess({
        plan,
        role: "company",
        orgType: "company",
        orgRole: "owner"
      });

      assert.equal(access.spend_analytics.mode, "plan_locked",
        "ohne Planangabe darf keine bezahlte Auswertung offenstehen");
      assert.equal(access.rate_cards.mode, "plan_locked",
        "Konditionsrahmen sind Vertragsdaten");
      assert.equal(access.data_governance.mode, "plan_locked",
        "die Datenschutz-Flaeche ist die heikelste von dreien");
    });
  }

  /*
   * MUTATION-KILL (Welle 3). isProPlus normalisiert Alt-Schreibweisen:
   *
   *     if (p === "ENTERPRISE" || p === "INDIVIDUAL") p = "INDIVIDUELL";
   *     if (p === "FREE") p = "DEMO";
   *
   * Fuenf Mutanten ueberlebten hier, weil kein Test je einen dieser Aliase
   * uebergeben hat. Faellt die Normalisierung weg, verliert ein zahlender
   * INDIVIDUELL-Kunde mit Alt-Eintrag "ENTERPRISE" seine Flaechen — Spend
   * Analytics, Rate Cards, Data Governance stuenden ploetzlich auf
   * plan_locked.
   *
   * Die Aliase existieren, WEIL echte Daten sie enthalten (CLAUDE.md: ENTERPRISE
   * ist kein oeffentlicher Plan, sondern ein Funktionsniveau innerhalb
   * INDIVIDUELL). Eine Umwandlung, die niemand prueft, ist eine Zusage ohne
   * Deckung.
   */
  for (const alias of ["ENTERPRISE", "INDIVIDUAL", "individuell", "  PRO  "]) {
    it(`erkennt "${alias}" als PRO-Niveau`, () => {
      const access = resolveEnterpriseSurfaceAccess({
        plan: alias,
        role: "company",
        orgType: "company",
        orgRole: "owner"
      });
      assert.equal(access.spend_analytics.mode, "full",
        `"${alias}" ist ein zahlender Kunde — die Flaeche muss offen sein`);
      assert.equal(access.rate_cards.mode, "full");
    });
  }

  it("behandelt \"FREE\" wie DEMO und sperrt die PRO-Flaechen", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "FREE", role: "company", orgType: "company", orgRole: "owner"
    });
    assert.equal(access.spend_analytics.mode, "plan_locked");
    assert.equal(access.data_governance.mode, "plan_locked");
  });

  it("plan-locks spend, governance, and rate cards below PRO even for company owners", () => {
    const access = resolveEnterpriseSurfaceAccess({
      plan: "DEMO",
      role: "company",
      orgType: "company",
      orgRole: "owner"
    });

    assert.equal(access.vendor_pool.mode, "full");
    assert.equal(access.supplier_scorecard.mode, "full");
    assert.equal(access.spend_analytics.mode, "plan_locked");
    assert.equal(access.data_governance.mode, "plan_locked");
    assert.equal(access.rate_cards.mode, "plan_locked");
  });
});
