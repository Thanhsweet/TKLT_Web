FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends default-mysql-client ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
RUN mkdir -p var/backups public/uploads && chown -R node:node var public/uploads
USER node
EXPOSE 3000
CMD ["node", "server.js"]
