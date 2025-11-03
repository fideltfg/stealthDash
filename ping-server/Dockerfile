FROM node:20-alpine

# Install ping utility
RUN apk add --no-cache iputils

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
