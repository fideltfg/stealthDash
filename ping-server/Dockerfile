FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY server.js ./
COPY auth.js ./
COPY db.js ./
COPY init-db.sql ./

EXPOSE 3001

CMD ["node", "server.js"]
