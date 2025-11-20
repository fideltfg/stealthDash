FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

# Add docker group with GID 988 (match host) and add node user to it
RUN addgroup -g 988 docker && addgroup node docker

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY src/server.js ./
COPY src/auth.js ./
COPY src/db.js ./
COPY src/crypto-utils.js ./
COPY init-db.sql ./
COPY src/widgetMetadata.js ./
COPY routes ./routes

EXPOSE 3001

CMD ["node", "server.js"]
