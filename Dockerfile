# Use Node.js LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./

RUN npm install

# Copy application files
COPY . .

# Generate widget metadata JSON from widget source files
RUN node scripts/generate-widget-metadata.js

# Expose Vite dev server port
EXPOSE 3000

# Start development server
CMD ["sh", "-c", "node scripts/generate-widget-metadata.js && npm run dev -- --host 0.0.0.0"]
