/**
 * imageIntegrity — dependency-freie Bild-Haertung fuer Upload-Pfade (P7b).
 *
 * Zwei Aufgaben:
 * 1. sniffImageMime: Magic-Byte-Pruefung — wir glauben nicht dem Client-MIME,
 *    sondern den ersten Bytes der Datei (PNG/JPEG/WebP).
 * 2. stripJpegExif: entfernt Metadaten-Segmente aus JPEGs (APP1–APP13, APP15,
 *    COM) — Profilfotos vom Handy tragen sonst GPS-Koordinaten (DSGVO).
 *    APP0 (JFIF) und APP14 (Adobe-Farbtransform) bleiben erhalten, sonst
 *    kippt die Farbdarstellung von Adobe-JPEGs.
 *
 * Bewusst OHNE sharp/jimp: native Dependencies brauchen einen Image-Rebuild
 * (Windows-Host vs. Linux-Container) — Owner-Gate. PNG/WebP-Metadaten sind
 * selten und GPS-frei ueblich; dokumentierte Luecke, kein stiller Verzicht.
 */

import fs from "node:fs";

/** Magic-Byte-Erkennung der drei erlaubten Bildformate. */
export function sniffImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Entfernt APP1–APP13, APP15 und COM-Segmente aus einem JPEG-Buffer.
 * Ab SOS (Start of Scan) wird der Rest unveraendert uebernommen — dahinter
 * liegen die komprimierten Bilddaten, in denen Marker-Bytes Teil des Streams
 * sind. Ungueltige Strukturen geben den Original-Buffer zurueck (fail-open:
 * lieber ein Foto mit EXIF als ein kaputtes Foto — der Upload selbst wurde
 * bereits per Magic-Bytes als JPEG verifiziert).
 */
export function stripJpegExif(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const parts = [buf.subarray(0, 2)]; // SOI
  let off = 2;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) return buf; // kaputte Struktur -> unveraendert
    const marker = buf[off + 1];
    // SOS: ab hier alles verbatim uebernehmen
    if (marker === 0xda) {
      parts.push(buf.subarray(off));
      return Buffer.concat(parts);
    }
    // Marker ohne Laengenfeld (RSTn/TEM) sollten vor SOS nicht auftreten
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buf.subarray(off, off + 2));
      off += 2;
      continue;
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2 || off + 2 + len > buf.length) return buf;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xee; // APP0 (JFIF) + APP14 (Adobe)
    const isCom = marker === 0xfe;
    const strip = (isApp && !keepApp) || isCom;
    if (!strip) parts.push(buf.subarray(off, off + 2 + len));
    off += 2 + len;
  }
  return buf; // kein SOS gefunden -> unveraendert
}

/**
 * Haertet eine frisch hochgeladene Bilddatei auf der Platte:
 * - Magic-Bytes muessen zu einem erlaubten Format gehoeren (sonst { ok:false })
 * - JPEGs werden EXIF-bereinigt zurueckgeschrieben
 * Rueckgabe: { ok: true, mime } oder { ok: false }.
 */
export function sanitizeImageFile(filePath, allowedMimes) {
  const buf = fs.readFileSync(filePath);
  const mime = sniffImageMime(buf);
  if (!mime || (Array.isArray(allowedMimes) && !allowedMimes.includes(mime))) {
    return { ok: false };
  }
  if (mime === "image/jpeg") {
    const cleaned = stripJpegExif(buf);
    if (cleaned !== buf) fs.writeFileSync(filePath, cleaned);
  }
  return { ok: true, mime };
}
