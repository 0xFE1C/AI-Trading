# Multi-stage Dockerfile for AI-Trading Autonomous Terminal
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Copy package and install production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm install -g tsx

# Copy app files and pre-built client
COPY --from=builder /app/src ./src
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/scripts ./scripts
COPY tsconfig.json ./

# Volume for SQLite database persistence
VOLUME ["/app/data"]

EXPOSE 3001

CMD ["tsx", "src/server.ts"]
