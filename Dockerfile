# Multi-stage Dockerfile for AI-Trading Autonomous Terminal
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install dependencies for both root and client
COPY package*.json ./
RUN npm ci

COPY client/package*.json client/
RUN cd client && npm ci

# Copy full source and build client
COPY . .
RUN npm --prefix client run build

# Production Runner
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy package and install production dependencies (includes tsx runtime)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app files and pre-built client
COPY --from=builder /app/src ./src
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/scripts ./scripts
COPY tsconfig.json ./

# Volume for SQLite database persistence
VOLUME ["/app/data"]

EXPOSE 3001

# Container is unhealthy when the API stops answering — combined with
# `restart: unless-stopped` in docker-compose this auto-recovers crashes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "--no-install", "tsx", "src/server.ts"]
