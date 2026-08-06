/**
 * Zweiter Einladungskanal — Provider-Aufloesung (Tier-1 nach Config-Taxonomie).
 *
 * Die teuerste Fehlkonfiguration ist die stille: SMS_PROVIDER=twilio gesetzt,
 * Zugangsdaten fehlen — die Konfiguration sieht richtig aus, es geht trotzdem
 * nichts raus, und niemand merkt es, bis Einladungen ausbleiben. Deshalb prueft
 * diese Suite vor allem, dass genau diese Kombination WARNT statt zu schweigen.
 *
 * Run: node --test --test-force-exit test/smsProvider.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SMS_PROVIDERS, resolveSmsProvider, describeSms, canSendInvite, looksLikePlaceholder
} from "../services/smsProviderService.js";

const TWILIO_ECHT = {
  TWILIO_ACCOUNT_SID: "AC1234567890abcdef",
  TWILIO_AUTH_TOKEN: "echtes_token_1234567890",
  SMS_SENDER: "+4915112345678"
};

describe("Aufloesung — ohne Konfiguration geht nichts nach draussen", () => {
  it("leere Konfiguration -> console, kein Versand", () => {
    const d = describeSms({});
    assert.equal(d.provider, SMS_PROVIDERS.CONSOLE);
    assert.equal(d.capabilities.outbound_delivery, false);
    assert.equal(d.capabilities.dev_logging, true);
    assert.deepEqual(d.warnings, [], "der Default ist kein Fehler und darf nicht warnen");
  });

  it("Platzhalter zaehlen nicht als konfiguriert", () => {
    assert.equal(looksLikePlaceholder("DEIN_TWILIO_SID"), true);
    assert.equal(looksLikePlaceholder(""), true);
    assert.equal(looksLikePlaceholder("AC1234567890abcdef"), false);
    const d = describeSms({ TWILIO_ACCOUNT_SID: "ACxxxxxxxx", TWILIO_AUTH_TOKEN: "x", SMS_SENDER: "+49" });
    assert.equal(d.provider, SMS_PROVIDERS.CONSOLE);
  });

  it("echte Zugangsdaten ohne ausdrueckliche Angabe -> Anbieter wird abgeleitet", () => {
    const r = resolveSmsProvider(TWILIO_ECHT);
    assert.equal(r.provider, SMS_PROVIDERS.TWILIO);
    assert.equal(r.twilio_configured, true);
    assert.equal(r.explicit, null);
  });

  it("ausdrueckliche Angabe gewinnt gegen abgeleitete", () => {
    const r = resolveSmsProvider({ ...TWILIO_ECHT, SMS_PROVIDER: "disabled" });
    assert.equal(r.provider, SMS_PROVIDERS.DISABLED);
    assert.equal(r.explicit, "disabled");
  });
});

describe("Die stille Fehlkonfiguration muss laut sein", () => {
  it("SMS_PROVIDER=twilio ohne Zugangsdaten -> Warnung UND kein Versand", () => {
    const d = describeSms({ SMS_PROVIDER: "twilio" });
    assert.equal(d.capabilities.outbound_delivery, false);
    assert.equal(d.warnings.length, 1);
    assert.match(d.warnings[0], /nur geloggt/);
  });

  it("unbekannter Anbieter -> Warnung, aber kein Absturz", () => {
    const d = describeSms({ SMS_PROVIDER: "brieftaube" });
    assert.equal(d.provider, SMS_PROVIDERS.CONSOLE);
    assert.match(d.warnings[0], /Unbekannter SMS_PROVIDER/);
  });

  it("WhatsApp nur dort, wo es das wirklich gibt", () => {
    assert.equal(describeSms(TWILIO_ECHT).capabilities.whatsapp, true);
    assert.equal(describeSms({ MESSAGEBIRD_API_KEY: "live_abc123", SMS_SENDER: "+4915112345678" })
      .capabilities.whatsapp, false, "MessageBird deckt WhatsApp hier nicht ab");
  });
});

describe("canSendInvite — der Kanal ist ohne Nummer wertlos", () => {
  it("aktiver Anbieter, aber keine Mobilnummer -> nicht moeglich, Grund benannt", () => {
    const r = canSendInvite(TWILIO_ECHT, { phone: null });
    assert.equal(r.possible, false);
    assert.equal(r.reason, "NO_PHONE");
  });

  it("Nummer da, aber kein Anbieter -> nicht moeglich, anderer Grund", () => {
    const r = canSendInvite({}, { phone: "+49 151 12345678" });
    assert.equal(r.possible, false);
    assert.equal(r.reason, "NO_PROVIDER");
  });

  it("beides da -> moeglich", () => {
    const r = canSendInvite(TWILIO_ECHT, { phone: "0151 12345678" });
    assert.equal(r.possible, true);
    assert.equal(r.reason, null);
  });

  it("offensichtlicher Unsinn zaehlt nicht als Nummer", () => {
    assert.equal(canSendInvite(TWILIO_ECHT, { phone: "keine" }).reason, "NO_PHONE");
    assert.equal(canSendInvite(TWILIO_ECHT, { phone: "123" }).reason, "NO_PHONE");
  });
});
