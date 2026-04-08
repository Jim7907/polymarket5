FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps 2>&1

# Copy source files
COPY index.html ./
COPY vite.config.js ./
COPY src/ ./src/

# Build with verbose output so errors are visible
RUN npm run build -- --debug 2>&1 || npm run build 2>&1

# ── Production stage ──────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps 2>&1

COPY server/ ./server/
COPY --from=builder /app/build ./build

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]
