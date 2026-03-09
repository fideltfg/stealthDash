FROM node:20-alpine

# Install ping and traceroute utilities
RUN apk add --no-cache iputils traceroute

# Add docker group with GID 988 (match host) and add node user to it
RUN addgroup -g 988 docker && addgroup node docker

WORKDIR /app

COPY package*.json ./

RUN npm install

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
COPY jest.config.js ./
COPY tests ./tests

EXPOSE 3001

CMD ["node", "src/server.js"]
