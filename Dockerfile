FROM node:20-slim

EXPOSE 3000
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . ./

ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
