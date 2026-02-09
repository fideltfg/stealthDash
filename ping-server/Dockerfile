FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

# Add docker group with GID 988 (match host) and add node user to it
RUN addgroup -g 988 docker && addgroup node docker

WORKDIR /app

COPY package*.json ./

RUN npm install --production

# Copy application files maintaining directory structure
COPY src ./src
COPY routes ./routes
COPY init-db.sql ./

EXPOSE 3001

CMD ["node", "src/server.js"]
