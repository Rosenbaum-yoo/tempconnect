/**
 * M2 — die 8 A-Faelle aus `services/enterpriseSurfaceAccessService.js`.
 *
 * WAS HIER FEHLTE
 * Die Flaechenmatrix in `enterpriseSurfaceAccessService.test.js` prueft ganze
 * Zeilen der Matrix — aber je Rollen-MENGE nur einen Vertreter. Fuer `owner`
 * ist damit belegt, dass er Admin-Rechte bekommt; fuer `platform_admin` und
 * `admin` nicht. Der Mutations-Lauf hat das sichtbar gemacht: in allen drei
 * Rollenlisten (ADMIN, SENIOR, MANAGER) ueberlebt genau der Eintrag
 * `platform_admin` und der Eintrag `admin`, waehrend `owner` stirbt.
 *
 * Das ist keine Kleinigkeit. Diese Listen sind kein Text, sondern die
 * Rechtezuteilung selbst. Gemessen an einem Company-Kontext mit PRO-Tarif
 * (der Dienst liefert je Aufruf neun Flaechen): faellt ein ADMIN-Eintrag weg,
 * aendern sich sieben der neun. Und `platform_admin` ist die Rolle mit den
 * weitesten Rechten der Plattform.
 *
 * JEDER TEST HAENGT AN GENAU EINER LISTE.
 * ADMIN, SENIOR und MANAGER ueberlappen sich (ADMIN ⊂ SENIOR ⊂ MANAGER), eine
 * beliebige Zusicherung wuerde also mehrere Mutanten gleichzeitig treffen oder
 * keinen. Deshalb je Liste eine Faehigkeit, die NUR aus ihr folgt:
 *   ADMIN   -> audit_trail.canExport
 *   SENIOR  -> executive_dashboard.mode === "full"
 *   MANAGER -> vendor_pool.canInvite
 *
 * Fallnummern (nr) verweisen auf
 * `docs/qualitaet/mutation/2026-08-14-rbac/triage.json`; dort steht auch, warum
 * die uebrigen 13 Faelle dieser Datei bewusst keinen Test bekommen — die
 * meisten sind gleichwertige Mutanten, die man gar nicht toeten KANN, solange
 * eine Bedingung doppelt gemoppelt ist (Befund M0-B6).
 *
 * Diese Datei muss in `stryker.rbac.conf.json` unter `commandRunner` stehen.
 * Run: node --test --test-force-exit test/enterpriseSurfaceMutanten.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveEnterpriseSurfaceAccess } from "../services/enterpriseSurfaceAccessService.js";

/** Company-Kontext mit PRO-Tarif — der Fall, in dem alle Flaechen offen stehen koennen. */
const company = (orgRole) => resolveEnterpriseSurfaceAccess({ plan: "PRO", orgType: "company", orgRole });

describe("M2 — jede Rolle der Admin-Liste bekommt Admin-Rechte", () => {
  for (const rolle of ["platform_admin", "admin"]) {
    it(`nr ${rolle === "platform_admin" ? "43" : "44"}: ${rolle} darf den Pruefpfad exportieren`, () => {
      const zugriff = company(rolle);
      assert.equal(
        zugriff.audit_trail.canExport,
        true,
        `${rolle} steht in ADMIN_ROLES — faellt der Eintrag weg, verliert die Rolle Export, ` +
          `Loeschen und Verwalten auf mehreren Flaechen, ohne dass ein Test es merkt`
      );
      // Zweite Folge derselben Liste. BEWUSST NICHT compliance_overview.canDelete:
      // das haengt zusaetzlich an coMode und damit an SENIOR_ROLES — die
      // Zusicherung wuerde dann zwei Listen gleichzeitig treffen.
      assert.equal(zugriff.multi_location.canManage, true);
    });
  }

  it("die Gegenprobe: eine Rolle ausserhalb der Liste darf es nicht", () => {
    assert.equal(company("hiring_manager").audit_trail.canExport, false);
    assert.equal(company("hiring_manager").multi_location.canManage, false);
  });
});

describe("M2 — jede Rolle der Senior-Liste sieht die Fuehrungszahlen", () => {
  for (const rolle of ["platform_admin", "admin"]) {
    it(`nr ${rolle === "platform_admin" ? "45" : "46"}: ${rolle} bekommt das Executive Dashboard`, () => {
      const zugriff = company(rolle);
      assert.equal(
        zugriff.executive_dashboard.mode,
        "full",
        `${rolle} steht in SENIOR_ROLES — ohne den Eintrag waere das Dashboard role_locked`
      );
      assert.equal(zugriff.executive_dashboard.canRead, true);
      assert.equal(zugriff.executive_dashboard.canExport, true);
    });
  }

  it("die Gegenprobe: unterhalb der Senior-Ebene bleibt es gesperrt", () => {
    assert.equal(company("recruiter").executive_dashboard.mode, "role_locked");
  });
});

describe("M2 — jede Rolle der Manager-Liste darf den Lieferantenpool fuehren", () => {
  for (const rolle of ["platform_admin", "admin"]) {
    it(`nr ${rolle === "platform_admin" ? "47" : "48"}: ${rolle} darf in den Pool einladen`, () => {
      const zugriff = company(rolle);
      assert.equal(
        zugriff.vendor_pool.canInvite,
        true,
        `${rolle} steht in MANAGER_ROLES — ohne den Eintrag faellt der Pool auf read_only`
      );
      assert.equal(zugriff.vendor_pool.mode, "full");
      assert.equal(zugriff.supplier_scorecard.canAnnotate, true);
    });
  }

  it("die Gegenprobe: ausserhalb der Manager-Liste bleibt der Pool lesend", () => {
    assert.equal(company("hiring_manager").vendor_pool.mode, "read_only");
    assert.equal(company("hiring_manager").vendor_pool.canInvite, false);
  });
});

describe("M2 — das Tarif-Praefix wird am Anfang gelesen, nicht am Ende", () => {
  it("nr 53: ein INDIVIDUELL_-Tarif zaehlt als PRO-Niveau", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "INDIVIDUELL_ENTERPRISE",
      orgType: "company",
      orgRole: "owner",
    });
    assert.equal(
      zugriff.spend_analytics.mode,
      "full",
      "Wird das Praefix am Ende statt am Anfang geprueft, verliert ein bezahlter Sondertarif " +
        "Ausgabenanalyse, Konditionen und Datenschutz-Flaeche"
    );
    // rate_cards haengt allein am Tarif. data_governance NICHT: es ist zusaetzlich
    // rollen-gesperrt (Dienst Z. 97-100) und wuerde die Aussage vermischen.
    assert.equal(zugriff.rate_cards.mode, "full");
  });

  it("nr 53 (Gegenrichtung): ein Tarif, der nur so ENDET, zaehlt nicht", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "SONDER_INDIVIDUELL_",
      orgType: "company",
      orgRole: "owner",
    });
    assert.equal(
      zugriff.spend_analytics.mode,
      "plan_locked",
      "Sonst schaltet ein beliebiger Tarifname mit passender Endung bezahlte Flaechen frei"
    );
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Die Invariante, auf der vier nicht toetbare Mutanten beruhen (Befund M0-B6)
 *
 *  In compliance_overview stehen Konjunktionen wie `coMode === "full" &&
 *  isSenior`. Sie sind HEUTE redundant, weil coMode genau dann "full" ist, wenn
 *  isSenior gilt — deshalb ueberleben dort vier Mutanten, die man gar nicht
 *  toeten kann (Faelle nr 57-60, Kategorie C).
 *
 *  Der Dienst behaelt die Konjunktionen trotzdem: sie sagen, was zugesagt ist,
 *  nicht was gerade ausreicht. Damit diese Entscheidung nicht auf einer
 *  Annahme steht, wird die Aequivalenz hier festgenagelt. Bricht sie — etwa
 *  weil eine Rolle "full" bekommt, ohne senior zu sein —, wird dieser Test rot
 *  und zeigt auf die Stelle, an der die Konjunktionen dann WIRKLICH tragen.
 * ═══════════════════════════════════════════════════════════ */

describe("M0-B6 — die Aequivalenz, die die Redundanz erklaert", () => {
  const ROLLEN = [
    "platform_admin", "owner", "admin", "program_manager", "supplier_manager",
    "hiring_manager", "finance", "recruiter", "dispatcher", "member",
    "supplier_user", "viewer", undefined,
  ];

  for (const rolle of ROLLEN) {
    it(`fuer '${rolle ?? "(ohne Rolle)"}': volle Compliance-Flaeche genau dann wie volles Dashboard`, () => {
      const z = company(rolle);
      assert.equal(
        z.compliance_overview.mode === "full",
        z.executive_dashboard.mode === "full",
        "Beide leiten sich heute aus isSenior ab. Faellt das auseinander, tragen die " +
          "Konjunktionen in compliance_overview plötzlich Gewicht — und die vier dort " +
          "als 'nicht toetbar' eingestuften Mutanten waeren neu zu bewerten."
      );
    });
  }
});

describe("M2 — die Organisationsart schlaegt das alte Rollenfeld", () => {
  it("nr 56: orgType='company' gewinnt gegen ein Alt-Feld role='agency'", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({
      plan: "PRO",
      orgType: "company",
      role: "agency",
      orgRole: "owner",
    });
    assert.notEqual(
      zugriff.vendor_pool.mode,
      "org_locked",
      "Gewinnt das Alt-Feld, bekommt ein Unternehmen schlagartig die Agentur-Flaechen: " +
        "sechs Flaechen org_locked, obwohl es die eigenen sein muessten"
    );
    assert.equal(zugriff.vendor_pool.mode, "full");
    assert.equal(zugriff.spend_analytics.mode, "full");
  });

  it("nr 56 (Rueckfall): ohne orgType entscheidet das Alt-Feld weiterhin", () => {
    const zugriff = resolveEnterpriseSurfaceAccess({ plan: "PRO", role: "agency", orgRole: "owner" });
    assert.equal(
      zugriff.vendor_pool.mode,
      "org_locked",
      "Der Rueckfall auf das Alt-Feld muss erhalten bleiben — sonst brechen Alt-Sitzungen ohne orgType"
    );
  });
});
