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

CMD ["npm", "run", "start"]
