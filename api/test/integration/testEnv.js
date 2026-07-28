/**
 * Deterministische Umgebung fuer die Integrationssuite.
 *
 * MUSS als **erster** Import einer Testdatei stehen, die davon abhaengt: ESM
 * wertet Importe in Reihenfolge aus, und `config/index.js` liest `process.env`
 * beim Laden. Steht dieser Import spaeter, ist die Variable zu spaet gesetzt.
 *
 * Warum es das braucht: `GET /api/admin/status` versteckt sich mit 404, solange
 * `ADMIN_SECRET` leer ist. Ohne gesetzte Variable war der Erfolgsfall des Guards
 * (richtiges Geheimnis -> 200) nie ausgefuehrt — geprueft wurde nur, dass eine
 * unkonfigurierte Route 404 liefert. Der Guard selbst blieb ungetestet.
 *
 * Nur Defaults: eine von aussen gesetzte Variable gewinnt, damit CI ihre eigenen
 * Werte durchreichen kann.
 */

const DEFAULTS = {
  ADMIN_SECRET: "integration-admin-secret"
};

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}

export const TEST_ENV = Object.freeze({ ...DEFAULTS, ...pick(Object.keys(DEFAULTS)) });

function pick(keys) {
  const out = {};
  for (const k of keys) out[k] = process.env[k];
  return out;
}
