# Build stage v3
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy monorepo root files for workspace resolution
COPY package.json bun.lock ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Install all dependencies (including workspace packages)
RUN bun install

# Build the server
WORKDIR /app/apps/server
RUN bun run build

# Production stage - install dependencies directly
FROM oven/bun:1-slim

# Install FFmpeg for audio processing
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json and lockfile for production install
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages/shared ./packages/shared

# Install production dependencies
RUN bun install --production

# Copy built output
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["bun", "apps/server/dist/index.js"]
