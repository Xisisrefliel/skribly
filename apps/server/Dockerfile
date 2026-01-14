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

# Install FFmpeg and Chromium dependencies for PDF generation
RUN apt-get update && apt-get install -y \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

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
