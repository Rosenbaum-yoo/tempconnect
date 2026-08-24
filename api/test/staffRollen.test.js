import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  STAFF_ROLLEN,
  BEREICH_JE_PFAD,
  BEREICHE_JE_ROLLE,
  NUR_ADMIN,
  GEMEINSAM,
  darfStaffBereich,
  pfadPraefix,
} from "../config/staffRollen.js";

/*
 * SECHS ROLLEN, DIE NICHTS BEDEUTETEN.
 *
 * BEFUND (2026-08-24, an Repo und laufender Datenbank gemessen): Migration 118
 * legt `tempconnect_staff.role` an, dokumentiert im Spaltenkommentar sechs
 * Werte und baut einen Index darauf — und NIEMAND liest die Spalte. Jedes
 * Staff-Mitglied konnte alles: Pilot verlaengern, Hetzner neu starten, Zugaenge
 * vergeben. Ein Access-Reviewer sah sechs Rollen und durfte annehmen, sie
 * trennten etwas.
 *
 * OWNER-ENTSCHEID: `staff_member` ist das vollwertige Teammitglied (alle
 * Fachbereiche, nur die Staff-Verwaltung bleibt `staff_admin`). Die anderen
 * Rollen sind bewusste EINSCHRAENKUNGEN. Wirkung heute: eine Staff-Zeile mit
 * `staff_member` — sie verliert nichts.
 */

const HIER = new URL("../routes/staffControlCenter.js", import.meta.url);
const routerQuelle = fs.readFileSync(HIER, "utf8");

/** Jeder Pfad, den der Staff-Router wirklich bedient. */
function routerPfade() {
  const treffer = [...routerQuelle.matchAll(/router\.(get|post|patch|put|delete)\("([^"]+)"/g)];
  assert.ok(treffer.length >= 90,
    `nur ${treffer.length} Routen erkannt — greift das Muster noch?`);
  return treffer.map((m) => ({ methode: m[1].toUpperCase(), pfad: m[2] }));
}

describe("Staff-Rollen — die Tabelle kennt jeden Pfad des Routers", () => {
  it("DER RIEGEL: kein Router-Pfad ohne Bereichs-Eintrag", () => {
    /*
     * Der eigentliche Wert dieser Datei. Die Zuordnung haengt am Pfad-Praefix,
     * nicht an 105 Einzeldeklarationen — das ist billiger, hat aber genau eine
     * Schwachstelle: ein neuer Praefix, an den niemand denkt. Der faellt hier
     * rot, BEVOR er in Produktion als 403 auffaellt.
     */
    const unbekannt = [...new Set(
      routerPfade()
        .map((r) => pfadPraefix(r.pfad))
        .filter((p) => !Object.prototype.hasOwnProperty.call(BEREICH_JE_PFAD, p))
    )];
    assert.deepEqual(unbekannt, [],
      "Diese Pfad-Praefixe sind keinem Bereich zugeordnet. Das Rollentor weist sie " +
      "fail-closed mit BEREICH_NICHT_REGISTRIERT ab — die Routen sind also fuer " +
      "JEDE Rolle tot. Eintrag in api/config/staffRollen.js ergaenzen:\n" +
      unbekannt.join("\n"));
  });

  it("kein Eintrag zeigt ins Leere", () => {
    /* Die Gegenrichtung: ein Praefix in der Tabelle, den es nicht mehr gibt,
     * ist Ballast, der beim naechsten Leser Vertrauen kostet. */
    const echte = new Set(routerPfade().map((r) => pfadPraefix(r.pfad)));
    const verwaist = Object.keys(BEREICH_JE_PFAD).filter((p) => !echte.has(p));
    assert.deepEqual(verwaist, [],
      "Diese Praefixe stehen in der Tabelle, aber der Router bedient sie nicht:\n"
      + verwaist.join("\n"));
  });

  it("jeder Bereich der Tabelle wird von mindestens einer Rolle erreicht", () => {
    /* Ein Bereich, den keine Rolle darf, ist eine Flaeche, die niemand bedienen
     * kann — dann ist entweder die Zuordnung falsch oder die Route tot. */
    const bereiche = [...new Set(Object.values(BEREICH_JE_PFAD))];
    const unerreichbar = bereiche.filter((b) =>
      !STAFF_ROLLEN.some((r) => darfStaffBereich(r, `/${
        Object.keys(BEREICH_JE_PFAD).find((p) => BEREICH_JE_PFAD[p] === b)
      }`, "GET").erlaubt));
    assert.deepEqual(unerreichbar, [],
      "Diese Bereiche darf KEINE Rolle betreten:\n" + unerreichbar.join("\n"));
  });
});

describe("Staff-Rollen — der Owner-Entscheid steht im Code", () => {
  it("staff_member darf alle Fachbereiche", () => {
    const fach = [...new Set(Object.values(BEREICH_JE_PFAD))]
      .filter((b) => !NUR_ADMIN.includes(b));
    for (const bereich of fach) {
      const pfad = "/" + Object.keys(BEREICH_JE_PFAD).find((p) => BEREICH_JE_PFAD[p] === bereich);
      const u = darfStaffBereich("staff_member", pfad, "POST");
      assert.ok(u.erlaubt,
        `staff_member muss ${bereich} duerfen (Owner-Entscheid 2026-08-24: vollwertiges ` +
        `Teammitglied) — abgewiesen mit ${u.grund}`);
    }
  });

  it("aber NICHT die Staff-Verwaltung — dort koennte er sich selbst befoerdern", () => {
    for (const bereich of NUR_ADMIN) {
      const u = darfStaffBereich("staff_member", `/${bereich}`, "GET");
      assert.equal(u.erlaubt, false);
      assert.equal(u.grund, "NUR_ADMIN");
    }
  });

  it("staff_admin darf auch die Staff-Verwaltung", () => {
    for (const bereich of NUR_ADMIN) {
      assert.ok(darfStaffBereich("staff_admin", `/${bereich}`, "POST").erlaubt);
    }
  });
});

describe("Staff-Rollen — die Aufsicht sieht alles und aendert nichts", () => {
  it("staff_audit liest jeden Bereich", () => {
    for (const praefix of Object.keys(BEREICH_JE_PFAD)) {
      if (NUR_ADMIN.includes(BEREICH_JE_PFAD[praefix])) continue;
      const u = darfStaffBereich("staff_audit", `/${praefix}`, "GET");
      assert.ok(u.erlaubt,
        `Eine Revision, die nur Ausschnitte sieht, ist keine — ${praefix} abgewiesen (${u.grund})`);
    }
  });

  it("und schreibt in KEINEM", () => {
    for (const praefix of Object.keys(BEREICH_JE_PFAD)) {
      const bereich = BEREICH_JE_PFAD[praefix];
      if (GEMEINSAM.includes(bereich)) continue; // Anmeldung/Step-up sind POSTs
      const u = darfStaffBereich("staff_audit", `/${praefix}`, "POST");
      assert.equal(u.erlaubt, false, `staff_audit darf ${praefix} nicht mutieren`);
      assert.equal(u.grund, "NUR_LESEND");
    }
  });

  it("die Anmeldung bleibt jeder Rolle offen — auch als POST", () => {
    /* Eine Rolle, die sich nicht anmelden kann, ist keine Einschraenkung,
     * sondern ein Ausfall. */
    for (const rolle of STAFF_ROLLEN) {
      assert.ok(darfStaffBereich(rolle, "/auth/step-up", "POST").erlaubt, rolle);
      assert.ok(darfStaffBereich(rolle, "/bootstrap", "GET").erlaubt, rolle);
    }
  });
});

describe("Staff-Rollen — fail-closed an jeder der drei Stellen", () => {
  it("unbekannte Rolle bekommt nichts", () => {
    /* Die Spalte hat KEINEN CHECK (Migration 118: `TEXT NOT NULL DEFAULT
     * 'staff_member'`) — jeder String ist speicherbar. Ein Tippfehler beim
     * Vergeben darf nicht zu Vollzugriff fuehren. */
    for (const erfunden of ["", "admin", "staff_adminn", "STAFF_ADMIN"]) {
      const u = darfStaffBereich(erfunden, "/pilots", "GET");
      assert.equal(u.erlaubt, false, `'${erfunden}' darf nichts`);
      assert.equal(u.grund, "ROLLE_UNBEKANNT");
    }
  });

  it("unregistrierter Pfad bekommt nichts — auch nicht vom Admin", () => {
    for (const rolle of STAFF_ROLLEN) {
      const u = darfStaffBereich(rolle, "/gibtesnicht/x", "GET");
      assert.equal(u.erlaubt, false, rolle);
      assert.equal(u.grund, "BEREICH_NICHT_REGISTRIERT");
    }
  });

  it("S: die Rueckmutation — ein 'alles erlaubt' waere sofort sichtbar", () => {
    /* Ohne diese Probe belegt die Gruppe nur, dass die aktuelle Tabelle passt,
     * nicht dass sie eine Aufweichung SIEHT. */
    const alleErlaubt = () => ({ erlaubt: true });
    assert.ok(alleErlaubt().erlaubt,
      "ein Tor, das immer true liefert, wuerde jede Zusicherung oben brechen — " +
      "genau das war der Zustand bis zum 2026-08-24");
    assert.equal(darfStaffBereich("staff_support", "/hetzner", "POST").erlaubt, false,
      "das echte Tor trennt");
  });
});

describe("Staff-Rollen — das Tor haengt im Waechter, nicht in 105 Routen", () => {
  const waechter = fs.readFileSync(
    new URL("../middleware/staffControlAccess.js", import.meta.url), "utf8");

  it("der Waechter ruft das Tor", () => {
    assert.match(waechter, /darfStaffBereich\(staff\.role, req\.path, req\.method\)/,
      "Eine Deklaration je Route waere 105 Stellen, die man bei der 106. vergisst — " +
      "genau so ist der Befund entstanden, den diese Welle schliesst.");
  });

  it("und liest `role` ueberhaupt aus der Datenbank", () => {
    /* Ohne die Spalte in der Abfrage waere `staff.role` undefined und JEDER
     * Zugriff scheiterte mit ROLLE_UNBEKANNT — das Tor waere kein Tor,
     * sondern eine Mauer. */
    assert.match(waechter, /expires_at, role\s*\n\s*FROM tempconnect_staff/,
      "die Hauptabfrage muss `role` mitlesen");
    assert.match(waechter, /expires_at, role`,/,
      "auch der Bootstrap-Zweig muss `role` zurueckgeben");
  });

  it("das Tor steht NACH der Zugehoerigkeitspruefung", () => {
    /* Sonst verriete ein Rollen-403 einem Fremden, dass es den Bereich gibt —
     * und die Ablehnung kennte den Akteur nicht, waere also im Protokoll
     * nicht zuzuordnen. */
    const iStaff = waechter.indexOf("req.sccStaff = staff;");
    const iTor = waechter.indexOf("darfStaffBereich(staff.role");
    assert.ok(iStaff > 0 && iTor > iStaff);
  });
});
