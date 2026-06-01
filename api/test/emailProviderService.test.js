/**
 * emailProviderService tests (Phase E).
 * Rein funktional — kein nodemailer, keine DB, kein IO.
 *
 * Run: node --test --test-force-exit test/emailProviderService.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_PROVIDERS,
  looksLikePlaceholder,
  isSmtpConfigured,
  isSendgridConfigured,
  resolveEmailProvider,
  describeEmail
} from "../services/emailProviderService.js";

const REAL_SMTP = { SMTP_HOST: "smtp.mailgun.org", SMTP_PORT: 587 };
const REAL_SG = { SENDGRID_API_KEY: "SG.abc123realkey" };
const CAP_KEYS = ["outbound_delivery", "pooled_connections", "bounce_tracking", "dev_logging"];

describe("EMAIL_PROVIDERS + placeholder detection", () => {
  it("exposes the canonical provider set", () => {
    assert.deepStrictEqual(
      Object.values(EMAIL_PROVIDERS).sort(),
      ["console", "disabled", "sendgrid", "smtp"]
    );
  });

  it("treats empty/placeholder values as not configured", () => {
    assert.strictEqual(looksLikePlaceholder(""), true);
    assert.strictEqual(looksLikePlaceholder("   "), true);
    assert.strictEqual(looksLikePlaceholder(undefined), true);
    assert.strictEqual(looksLikePlaceholder("SG.DEIN_KEY_HIER"), true);
    assert.strictEqual(looksLikePlaceholder("xxxxxxxx"), true);
    assert.strictEqual(looksLikePlaceholder("smtp.mailgun.org"), false);
    assert.strictEqual(looksLikePlaceholder("SG.abc123realkey"), false);
  });

  it("isSmtpConfigured / isSendgridConfigured reflect real values", () => {
    assert.strictEqual(isSmtpConfigured({}), false);
    assert.strictEqual(isSmtpConfigured(REAL_SMTP), true);
    assert.strictEqual(isSendgridConfigured({}), false);
    assert.strictEqual(isSendgridConfigured(REAL_SG), true);
  });
});

describe("resolveEmailProvider — explicit wins", () => {
  for (const p of ["smtp", "sendgrid", "console", "disabled"]) {
    it(`explicit EMAIL_PROVIDER=${p} is honored regardless of keys`, () => {
      const r = resolveEmailProvider({ EMAIL_PROVIDER: p, ...REAL_SMTP, ...REAL_SG });
      assert.strictEqual(r.provider, p);
      assert.strictEqual(r.source, "explicit");
    });
  }

  it("unknown explicit provider falls through to derivation", () => {
    const r = resolveEmailProvider({ EMAIL_PROVIDER: "bogus", ...REAL_SMTP });
    assert.strictEqual(r.provider, "smtp");
    assert.strictEqual(r.source, "derived");
  });
});

describe("resolveEmailProvider — derivation precedence", () => {
  it("SendGrid key wins over SMTP host", () => {
    const r = resolveEmailProvider({ ...REAL_SMTP, ...REAL_SG });
    assert.strictEqual(r.provider, "sendgrid");
    assert.strictEqual(r.source, "derived");
  });

  it("SMTP host without SendGrid → smtp", () => {
    assert.strictEqual(resolveEmailProvider(REAL_SMTP).provider, "smtp");
  });

  it("nothing configured → console (safe dev default)", () => {
    const r = resolveEmailProvider({});
    assert.strictEqual(r.provider, "console");
    assert.strictEqual(r.smtp_configured, false);
    assert.strictEqual(r.sendgrid_configured, false);
  });

  it("opts can override config detection", () => {
    const r = resolveEmailProvider({}, { sendgridConfigured: true });
    assert.strictEqual(r.provider, "sendgrid");
  });
});

describe("describeEmail — capability honesty + warnings", () => {
  it("smtp active → outbound true, no bounce tracking, no warnings", () => {
    const d = describeEmail({ ...REAL_SMTP, SMTP_FROM: "ops@acme.de" });
    assert.strictEqual(d.provider, "smtp");
    assert.strictEqual(d.capabilities.outbound_delivery, true);
    assert.strictEqual(d.capabilities.pooled_connections, true);
    assert.strictEqual(d.capabilities.bounce_tracking, false);
    assert.strictEqual(d.capabilities.dev_logging, false);
    assert.strictEqual(d.from, "ops@acme.de");
    assert.deepStrictEqual(d.warnings, []);
  });

  it("sendgrid active → bounce tracking on", () => {
    const d = describeEmail(REAL_SG);
    assert.strictEqual(d.provider, "sendgrid");
    assert.strictEqual(d.capabilities.outbound_delivery, true);
    assert.strictEqual(d.capabilities.bounce_tracking, true);
    assert.deepStrictEqual(d.warnings, []);
  });

  it("console (no config) → outbound off + dev warning", () => {
    const d = describeEmail({});
    assert.strictEqual(d.provider, "console");
    assert.strictEqual(d.capabilities.outbound_delivery, false);
    assert.strictEqual(d.capabilities.dev_logging, true);
    assert.ok(d.warnings.some((w) => w.includes("console")));
  });

  it("disabled → outbound off + explicit-off warning", () => {
    const d = describeEmail({ EMAIL_PROVIDER: "disabled" });
    assert.strictEqual(d.provider, "disabled");
    assert.strictEqual(d.capabilities.outbound_delivery, false);
    assert.ok(d.warnings.some((w) => w.includes("disabled")));
  });

  it("sendgrid forced without key → degraded + warning (no silent false-assumption)", () => {
    const d = describeEmail({ EMAIL_PROVIDER: "sendgrid" });
    assert.strictEqual(d.provider, "sendgrid");
    assert.strictEqual(d.capabilities.outbound_delivery, false);
    assert.ok(d.warnings.some((w) => w.includes("SENDGRID_API_KEY")));
  });

  it("smtp forced without host → degraded + warning", () => {
    const d = describeEmail({ EMAIL_PROVIDER: "smtp" });
    assert.strictEqual(d.provider, "smtp");
    assert.strictEqual(d.capabilities.outbound_delivery, false);
    assert.ok(d.warnings.some((w) => w.includes("SMTP_HOST")));
  });

  it("unknown EMAIL_PROVIDER → warning + derived provider used", () => {
    const d = describeEmail({ EMAIL_PROVIDER: "carrierpigeon", ...REAL_SG });
    assert.strictEqual(d.provider, "sendgrid");
    assert.ok(d.warnings.some((w) => w.includes("carrierpigeon")));
  });

  it("all capabilities are booleans and from defaults to null", () => {
    const d = describeEmail();
    for (const k of CAP_KEYS) {
      assert.strictEqual(typeof d.capabilities[k], "boolean", `capability ${k}`);
    }
    assert.strictEqual(d.from, null);
    assert.ok(Array.isArray(d.warnings));
  });

  it("garbage-safe: no throw on junk input", () => {
    assert.doesNotThrow(() => describeEmail(null));
    assert.doesNotThrow(() => resolveEmailProvider(undefined));
    assert.doesNotThrow(() => describeEmail({ EMAIL_PROVIDER: 123 }));
  });
});
