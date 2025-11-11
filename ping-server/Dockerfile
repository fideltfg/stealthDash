FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY server.js ./
COPY auth.js ./
COPY db.js ./
COPY crypto-utils.js ./
COPY init-db.sql ./
COPY widgetMetadata.js ./
COPY routes ./routes

EXPOSE 3001

CMD ["node", "server.js"]
