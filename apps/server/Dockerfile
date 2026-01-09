FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy built files
COPY dist ./dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
