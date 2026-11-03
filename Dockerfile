FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY . .
EXPOSE 4173

CMD ["node", "server.mjs"]
