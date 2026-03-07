# TempConnect API – Produktion (Hetzner-ready)
# Build: npm ci im Image, kein npm install beim Start, kein --watch

FROM node:20-alpine

# Sicherheit: non-root User
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Dependencies deterministisch installieren (package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App-Code
COPY . .

# Dateiberechtigungen fuer non-root
RUN chown -R appuser:appgroup /app

ENV NODE_ENV=production

USER appuser

EXPOSE 3000

CMD ["npm", "run", "start"]
