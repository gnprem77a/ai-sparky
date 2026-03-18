# ── Stage 1: Build ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────
FROM node:20-alpine AS runner

# dumb-init: proper signal handling + zombie process reaping
RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Install production deps only.
# connect-pg-simple is intentionally excluded from the esbuild bundle
# so it loads from node_modules at runtime — its __dirname stays correct
# and table.sql is found automatically (no manual file copying needed).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend + server bundle
COPY --from=builder /app/dist ./dist

# Run as non-root for security
USER node

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.cjs"]
