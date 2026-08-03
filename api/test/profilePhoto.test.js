/**
 * Profil-/Firmenfoto (P7b) — Bild-Integritaet + Routen + Service-SQL.
 *
 * Drei Schichten:
 * 1. imageIntegrity: Magic-Byte-Sniffing + JPEG-EXIF-Strip (dependency-frei) —
 *    inkl. Beweis, dass ein eingebettetes EXIF-Segment (GPS!) wirklich
 *    verschwindet und APP0/JFIF + Bilddaten intakt bleiben.
 * 2. workerPortal-Foto-Routen: 404-Pfade, Loeschen mit Datei-Cleanup,
 *    Upload-Terminal-Handler mit echtem Temp-File (Happy Path + INVALID_IMAGE).
 * 3. companyProfileService: CTE-Form der Set/Clear-Queries (RETURNING nach
 *    SET NULL sieht die NEUE Zeile — die CTE ist die Korrektheitsgarantie).
 *
 * Run: node --test --test-force-exit test/profilePhoto.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sniffImageMime, stripJpegExif, sanitizeImageFile } from "../utils/imageIntegrity.js";
import { createWorkerPortalRouter } from "../routes/workerPortal.js";
import * as companyProfileService from "../services/companyProfileService.js";

/* ── Fixtures: minimale, strukturell echte Bild-Buffer ────────────────────── */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_MAGIC = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBP")]);

function jpegSegment(marker, payload) {
  const len = payload.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, (len >> 8) & 0xff, len & 0xff]), payload]);
}

/** JPEG: SOI + APP0(JFIF) + APP1(EXIF mit GPS-Marker-Text) + DQT + SOS + Daten + EOI */
function buildJpegWithExif() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),                                   // SOI
    jpegSegment(0xe0, Buffer.from("JFIF\0datadata")),            // APP0 — muss bleiben
    jpegSegment(0xe1, Buffer.from("Exif\0\0GPSLATITUDE_SECRET")),// APP1 — muss weg
    jpegSegment(0xfe, Buffer.from("comment-to-strip")),          // COM  — muss weg
    jpegSegment(0xdb, Buffer.from([1, 2, 3, 4])),                // DQT  — muss bleiben
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02]),           // SOS + Header
    Buffer.from([0xaa, 0xbb, 0xcc]),                             // Scan-Daten
    Buffer.from([0xff, 0xd9])                                    // EOI
  ]);
}

/* ── 1. imageIntegrity ────────────────────────────────────────────────────── */

describe("imageIntegrity — Magic-Bytes", () => {
  it("erkennt PNG, JPEG, WebP; lehnt Muell und Kurz-Buffer ab", () => {
    assert.equal(sniffImageMime(PNG_MAGIC), "image/png");
    assert.equal(sniffImageMime(buildJpegWithExif()), "image/jpeg");
    assert.equal(sniffImageMime(WEBP_MAGIC), "image/webp");
    assert.equal(sniffImageMime(Buffer.from("GIF89a-not-allowed!!")), null);
    assert.equal(sniffImageMime(Buffer.from([0xff, 0xd8])), null); // zu kurz
    assert.equal(sniffImageMime(null), null);
  });
});

describe("imageIntegrity — JPEG-EXIF-Strip", () => {
  it("entfernt APP1 (GPS) + COM, behaelt APP0/DQT/SOS/Bilddaten", () => {
    const original = buildJpegWithExif();
    const cleaned = stripJpegExif(original);
    assert.ok(!cleaned.includes("GPSLATITUDE_SECRET"), "EXIF-Inhalt muss verschwinden");
    assert.ok(!cleaned.includes("comment-to-strip"), "COM-Segment muss verschwinden");
    assert.ok(cleaned.includes("JFIF"), "APP0/JFIF bleibt erhalten");
    // Scan-Daten + EOI verbatim am Ende
    assert.deepEqual([...cleaned.subarray(cleaned.length - 5)], [0xaa, 0xbb, 0xcc, 0xff, 0xd9]);
    assert.ok(cleaned.length < original.length);
    // Struktur bleibt gueltiges JPEG (beginnt mit SOI)
    assert.equal(cleaned[0], 0xff); assert.equal(cleaned[1], 0xd8);
  });

  it("fail-open: Nicht-JPEG und kaputte Struktur kommen unveraendert zurueck", () => {
    assert.equal(stripJpegExif(PNG_MAGIC), PNG_MAGIC);
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0x00, 0x00, 0x00])]);
    assert.equal(stripJpegExif(broken), broken);
  });
});

describe("imageIntegrity — sanitizeImageFile", () => {
  it("akzeptiert echtes PNG, verweigert getarnten Muell, bereinigt JPEG auf Platte", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photo-test-"));
    try {
      const pngPath = path.join(dir, "a.png");
      fs.writeFileSync(pngPath, PNG_MAGIC);
      assert.deepEqual(sanitizeImageFile(pngPath, ["image/png"]), { ok: true, mime: "image/png" });

      // Client behauptet Bild, Datei ist keins -> ok:false
      const fakePath = path.join(dir, "fake.png");
      fs.writeFileSync(fakePath, Buffer.from("#!/bin/sh echo pwned...."));
      assert.equal(sanitizeImageFile(fakePath, ["image/png", "image/jpeg", "image/webp"]).ok, false);

      // Format echt, aber nicht in der Whitelist -> ok:false
      assert.equal(sanitizeImageFile(pngPath, ["image/jpeg"]).ok, false);

      // JPEG mit EXIF wird auf der Platte bereinigt
      const jpgPath = path.join(dir, "c.jpg");
      fs.writeFileSync(jpgPath, buildJpegWithExif());
      const r = sanitizeImageFile(jpgPath, ["image/jpeg"]);
      assert.equal(r.ok, true);
      assert.ok(!fs.readFileSync(jpgPath).includes("GPSLATITUDE_SECRET"), "Datei auf Platte ist EXIF-frei");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ── 2. workerPortal Foto-Routen ──────────────────────────────────────────── */

function dispatchPool(rules = []) {
  const calls = [];
  const matchOne = (sql) => {
    for (const rule of rules) {
      const m = rule.match;
      const hit = m instanceof RegExp ? m.test(sql) : sql.includes(m);
      if (hit) return rule.rows;
    }
    return { rows: [] };
  };
  return {
    calls,
    query: async (sql, params = []) => { calls.push({ sql, params }); return matchOne(sql); },
    connect: async () => ({ query: async () => ({ rows: [] }), release() {} })
  };
}

const WORKER_ID = "11111111-1111-1111-1111-111111111111";

function mockReq(overrides = {}) {
  return {
    session: { userId: WORKER_ID, userRole: "worker" },
    params: {}, query: {}, body: {}, headers: {}, ip: "127.0.0.1", get: () => "",
    ...overrides
  };
}

function mockRes() {
  const res = {
    _status: 200, _json: null, _headers: {}, locals: {},
    status(c) { res._status = c; return res; },
    json(p) { res._json = p; return res; },
    setHeader(n, v) { res._headers[String(n).toLowerCase()] = v; return res; },
    set() { return res; }, type() { return res; }, end() { return res; }
  };
  return res;
}

const requireAuth = (_req, _res, next) => next();

function getHandler(router, method, exactPath) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== exactPath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  throw new Error(`Route ${method.toUpperCase()} ${exactPath} not found`);
}

async function run(handler, req, res) {
  let nextErr = null;
  await handler(req, res, (err) => { if (err) nextErr = err; });
  if (nextErr) throw nextErr;
  return res;
}

function profileRule(extra = {}) {
  return {
    match: "FROM worker_profiles wp",
    rows: { rows: [{ user_id: WORKER_ID, supplier_org_id: "org-1", first_name: "Max", last_name: "M", ...extra }] }
  };
}

describe("workerPortal — GET /worker/me/photo", () => {
  it("404 NO_PHOTO ohne gesetztes Foto; 404 FILE_MISSING bei verwaistem Ref", async () => {
    const router = createWorkerPortalRouter({ pool: dispatchPool([profileRule()]), requireAuth });
    const handler = getHandler(router, "get", "/worker/me/photo");
    const res = await run(handler, mockReq(), mockRes());
    assert.equal(res._status, 404);
    assert.equal(res._json.error, "NO_PHOTO");

    const router2 = createWorkerPortalRouter({
      pool: dispatchPool([profileRule({ photo_file_ref: "/uploads/worker-photos/" + WORKER_ID + "/gone.png", photo_mime: "image/png" })]),
      requireAuth
    });
    const res2 = await run(getHandler(router2, "get", "/worker/me/photo"), mockReq(), mockRes());
    assert.equal(res2._status, 404);
    assert.equal(res2._json.error, "FILE_MISSING");
  });
});

describe("workerPortal — DELETE /worker/me/photo", () => {
  it("404 NO_PHOTO wenn nichts gesetzt; ok + Audit wenn Foto vorhanden", async () => {
    const pool = dispatchPool([profileRule()]); // UPDATE matcht keine Regel -> rows []
    const router = createWorkerPortalRouter({ pool, requireAuth });
    const res = await run(getHandler(router, "delete", "/worker/me/photo"), mockReq(), mockRes());
    assert.equal(res._status, 404);
    assert.equal(res._json.error, "NO_PHOTO");

    const pool2 = dispatchPool([
      profileRule(),
      { match: "UPDATE worker_profiles", rows: { rows: [{ previous_file_ref: "/uploads/worker-photos/" + WORKER_ID + "/old.png" }] } }
    ]);
    const router2 = createWorkerPortalRouter({ pool: pool2, requireAuth });
    const res2 = await run(getHandler(router2, "delete", "/worker/me/photo"), mockReq(), mockRes());
    assert.equal(res2._status, 200);
    assert.deepEqual(res2._json, { ok: true });
    assert.equal(res2.locals.audit.action, "worker.photo_delete");
    const upd = pool2.calls.find((c) => c.sql.includes("UPDATE worker_profiles"));
    assert.match(upd.sql, /WITH old AS/, "Clear muss den ALTEN file_ref per CTE liefern");
  });
});

describe("workerPortal — POST /worker/me/photo (Terminal-Handler)", () => {
  it("Happy Path: sanitisiert, speichert, raeumt Vorgaenger-Datei auf, auditiert", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photo-up-"));
    try {
      const filePath = path.join(dir, "neu.png");
      fs.writeFileSync(filePath, PNG_MAGIC);
      const prevPath = path.join(dir, "vorher.png");
      fs.writeFileSync(prevPath, PNG_MAGIC);

      const pool = dispatchPool([
        profileRule(),
        { match: "UPDATE worker_profiles", rows: { rows: [{ previous_file_ref: null }] } }
      ]);
      const router = createWorkerPortalRouter({ pool, requireAuth });
      const handler = getHandler(router, "post", "/worker/me/photo");
      const req = mockReq({ file: { path: filePath, filename: "neu.png", originalname: "neu.png", mimetype: "image/png", size: PNG_MAGIC.length } });
      const res = await run(handler, req, mockRes());
      assert.equal(res._status, 201);
      assert.equal(res._json.photo_path, "/api/worker/me/photo");
      assert.equal(res._json.mime, "image/png");
      assert.equal(res.locals.audit.action, "worker.photo_upload");
      const upd = pool.calls.find((c) => c.sql.includes("UPDATE worker_profiles"));
      assert.ok(upd.params.includes("image/png"), "gesniffter MIME (nicht Client-MIME) wird gespeichert");
      assert.ok(String(upd.params[2]).startsWith("/uploads/worker-photos/" + WORKER_ID + "/"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("INVALID_IMAGE: getarnter Nicht-Bild-Upload wird geloescht + 400", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "photo-bad-"));
    try {
      const filePath = path.join(dir, "boese.png");
      fs.writeFileSync(filePath, Buffer.from("<html>not an image</html>"));
      const router = createWorkerPortalRouter({ pool: dispatchPool([profileRule()]), requireAuth });
      const handler = getHandler(router, "post", "/worker/me/photo");
      const req = mockReq({ file: { path: filePath, filename: "boese.png", originalname: "boese.png", mimetype: "image/png", size: 25 } });
      const res = await run(handler, req, mockRes());
      assert.equal(res._status, 400);
      assert.equal(res._json.error, "INVALID_IMAGE");
      // fs.unlink ist async-fire-and-forget — kurz warten, dann muss die Datei weg sein
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(fs.existsSync(filePath), false, "Muell-Datei darf nicht liegen bleiben");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ── 3. companyProfileService — CTE-Korrektheit ───────────────────────────── */

describe("companyProfileService — Firmenfoto Set/Clear", () => {
  function capturePool(rows) {
    const calls = [];
    return { calls, query: async (sql, params) => { calls.push({ sql, params }); return { rows }; } };
  }

  it("setProfilePhoto: Upsert + alter Wert via CTE", async () => {
    const pool = capturePool([{ photo_url: "/uploads/company-media/u1/neu.png", previous_photo_url: "/uploads/company-media/u1/alt.png" }]);
    const r = await companyProfileService.setProfilePhoto(pool, "u1", "/uploads/company-media/u1/neu.png");
    assert.equal(r.previous_photo_url, "/uploads/company-media/u1/alt.png");
    assert.match(pool.calls[0].sql, /WITH old AS/);
    assert.match(pool.calls[0].sql, /ON CONFLICT \(user_id\) DO UPDATE/);
  });

  it("clearProfilePhoto: liefert alten Wert (CTE), null wenn kein Foto", async () => {
    const pool = capturePool([{ previous_photo_url: "/uploads/company-media/u1/alt.png" }]);
    const r = await companyProfileService.clearProfilePhoto(pool, "u1");
    assert.equal(r.previous_photo_url, "/uploads/company-media/u1/alt.png");
    assert.match(pool.calls[0].sql, /WITH old AS/);
    assert.match(pool.calls[0].sql, /SET photo_url = NULL/);

    const emptyPool = capturePool([]);
    assert.equal(await companyProfileService.clearProfilePhoto(emptyPool, "u1"), null);
  });
});
