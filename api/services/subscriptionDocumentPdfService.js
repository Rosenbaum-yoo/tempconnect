/**
 * Optionale PDF-Ausgabe fuer subscription_documents.
 *
 * Strategie:
 *   - Eine Engine: wkhtmltopdf als externer CLI-Prozess.
 *   - Standard: deaktiviert, damit Docker/Production ohne Binary nicht hart
 *     ausfaellt.
 *   - Aktivierung: SUBSCRIPTION_DOCUMENT_PDF_ENGINE=wkhtmltopdf
 *     optional WKHTMLTOPDF_BIN=/path/to/wkhtmltopdf.
 *   - Bei fehlendem Binary/Timeout/Fehler liefert der Service einen
 *     HTML-Fallback-Grund statt zu werfen.
 */

import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 20_000;
const STDERR_LIMIT = 4_000;

export function getPdfEngineStatus(env = process.env) {
  const raw = String(env.SUBSCRIPTION_DOCUMENT_PDF_ENGINE || env.PDF_ENGINE || "").trim().toLowerCase();
  if (!raw || raw === "off" || raw === "disabled" || raw === "none" || raw === "html") {
    return { configured: false, engine: "none", reason: "PDF_ENGINE_NOT_CONFIGURED" };
  }
  if (raw !== "wkhtmltopdf") {
    return { configured: false, engine: raw, reason: "PDF_ENGINE_UNSUPPORTED" };
  }
  return {
    configured: true,
    engine: "wkhtmltopdf",
    binary: String(env.WKHTMLTOPDF_BIN || "wkhtmltopdf")
  };
}

export function renderPdfFromHtml(html, options = {}) {
  const status = options.status || getPdfEngineStatus(options.env || process.env);
  if (!status.configured) {
    return {
      ok: false,
      skipped: true,
      engine: status.engine,
      reason: status.reason,
      fallback_format: "html"
    };
  }
  return renderWithWkhtmltopdf(html, {
    binary: status.binary,
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  });
}

function renderWithWkhtmltopdf(html, { binary, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const chunks = [];
    const child = spawn(binary, ["--quiet", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* noop */ }
      resolve({
        ok: false,
        skipped: true,
        engine: "wkhtmltopdf",
        reason: "PDF_ENGINE_TIMEOUT",
        fallback_format: "html"
      });
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        skipped: true,
        engine: "wkhtmltopdf",
        reason: err && err.code === "ENOENT" ? "PDF_ENGINE_BINARY_MISSING" : "PDF_ENGINE_ERROR",
        error_message: err && err.message ? String(err.message).slice(0, 240) : null,
        fallback_format: "html"
      });
    });

    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => {
      if (stderr.length < STDERR_LIMIT) stderr += String(chunk);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const buffer = Buffer.concat(chunks);
      if (code === 0 && buffer.length > 0) {
        resolve({ ok: true, engine: "wkhtmltopdf", buffer });
        return;
      }
      resolve({
        ok: false,
        skipped: true,
        engine: "wkhtmltopdf",
        reason: code === 0 ? "PDF_ENGINE_EMPTY_OUTPUT" : "PDF_ENGINE_RENDER_FAILED",
        error_message: stderr ? stderr.slice(0, 500) : null,
        fallback_format: "html"
      });
    });

    child.stdin.end(String(html || ""), "utf8");
  });
}
