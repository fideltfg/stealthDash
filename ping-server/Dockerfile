FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

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
