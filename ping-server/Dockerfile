FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

# Add docker group with GID 988 (match host) and add node user to it
RUN addgroup -g 988 docker && addgroup node docker

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY src/server.js ./src/
COPY src/auth.js ./src/
COPY src/db.js ./src/
COPY src/crypto-utils.js ./src/
COPY src/vnc-proxy.js ./src/
COPY src/plugin-loader.js ./src/
COPY src/plugin-helpers.js ./src/
COPY init-db.sql ./
COPY routes ./routes
COPY plugins ./plugins

EXPOSE 3001

CMD ["node", "src/server.js"]
