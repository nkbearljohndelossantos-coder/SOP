# -------------------------------------------------------------
# Stage 1: Build React Frontend
# -------------------------------------------------------------
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Build Express Backend
# -------------------------------------------------------------
FROM node:20-alpine AS server-builder
WORKDIR /app/server

COPY server/package*.json ./
COPY server/prisma ./prisma/
RUN npm ci

COPY server/ ./
RUN npx prisma generate
RUN npm run build

# -------------------------------------------------------------
# Stage 3: Production Runner
# -------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Install required native libraries for Prisma on Alpine
RUN apk add --no-cache openssl libc6-compat dumb-init

ENV NODE_ENV=production
ENV APP_ENV=production
ENV PORT=4000
ENV CLIENT_DIST=/app/client/dist
ENV UPLOAD_DIR=/app/uploads
ENV DATABASE_URL="file:/app/data/sop_prod.db"

WORKDIR /app/server

# Install production dependencies only
COPY server/package*.json ./
COPY server/prisma ./prisma/
RUN npm ci --omit=dev
RUN npx prisma generate

# Copy built server and client artifacts
COPY --from=server-builder /app/server/dist ./dist
COPY --from=client-builder /app/client/dist /app/client/dist
COPY server/docker-entrypoint.sh ./

RUN chmod +x ./docker-entrypoint.sh

# Create persistent storage directories
RUN mkdir -p /app/data /app/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
