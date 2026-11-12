FROM node:22-bookworm-slim

WORKDIR /app
COPY server/package.json server/package-lock.json server/
COPY shared shared
RUN npm ci --omit=dev --prefix server \
  && npm cache clean --force

COPY server server
ENV NODE_ENV=production
ENV PORT=3091
ENV SERVE_STATIC=0
USER node
EXPOSE 3091

CMD ["node", "server/index.js"]
