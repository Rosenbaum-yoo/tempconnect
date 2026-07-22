# TempConnect API – Produktion (Hetzner-ready)
# Build: npm ci im Image, kein npm install beim Start, kein --watch

FROM node:20-alpine

# Sicherheit: non-root User
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Dependencies deterministisch installieren (package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# App-Code
COPY . .

# Uploads-Verzeichnis fuer Angebotsbilder/Dokumente
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app

ENV NODE_ENV=production

USER appuser

EXPOSE 3000

# Healthcheck: grosszuegige start-period, damit ein normal bootender Container nicht
# faelschlich als "unhealthy" flappt (Fehlschlaege waehrend start-period halten Status
# "starting", zaehlen nicht als retry). Busybox-wget ist in node:20-alpine vorhanden.
HEALTHCHECK --interval=15s --timeout=10s --start-period=45s --retries=5 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["npm", "run", "start"]
