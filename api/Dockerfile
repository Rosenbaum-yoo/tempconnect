# TempConnect API – Produktion (Hetzner-ready)
# Build: npm ci im Image, kein npm install beim Start, kein --watch

FROM node:20-alpine

# Sicherheit: non-root User
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Dependencies deterministisch installieren (package-lock.json)
#
# S3, 2026-09-21: hier stand `--legacy-peer-deps`. Der Schalter loest
# Abhaengigkeiten ausdruecklich "potenziell kaputt" auf und verschluckt dabei
# JEDE kuenftige echte Warnung — er war noetig, weil die Wurzel `redis@^4`
# pinnte, waehrend `bullmq@5` `peerOptional redis@">=5.0.0"` fuehrt. Seit der
# Ratenbegrenzer denselben Klienten wie die Warteschlangen benutzt (ioredis),
# gibt es den Konflikt nicht mehr, und `npm ci` laeuft ohne Ausnahme.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App-Code
COPY . .

# Uploads-Verzeichnis fuer Angebotsbilder/Dokumente
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

ENV NODE_ENV=production

# S4.3 — DER CONTAINER SAGT SELBST, AUF WELCHEM STAND ER LAEUFT.
# Ohne das blieb nur `ps -o etime` und ein Dateivergleich, um herauszufinden, ob
# ein laufender Container den letzten Merge ueberhaupt kennt. Gesetzt wird der
# Wert beim Bauen (`docker compose build --build-arg APP_COMMIT=$(git rev-parse --short HEAD)`);
# fehlt er, steht "unbekannt" im Startprotokoll — auch das ist eine Aussage.
ARG APP_COMMIT=unbekannt
ENV APP_COMMIT=$APP_COMMIT

USER appuser

EXPOSE 3000

# Healthcheck: grosszuegige start-period, damit ein normal bootender Container nicht
# faelschlich als "unhealthy" flappt (Fehlschlaege waehrend start-period halten Status
# "starting", zaehlen nicht als retry). Busybox-wget ist in node:20-alpine vorhanden.
HEALTHCHECK --interval=15s --timeout=10s --start-period=45s --retries=5 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["npm", "run", "start"]
