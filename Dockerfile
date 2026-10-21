# node 22.23.4-alpine (2026-10-21) is a security release; pinned one back under the 3-day rule.
# Bump to 22.23.4-alpine on or after 2026-10-24.
FROM node:22.23.3-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ src/
# Default, secret-free config. Mount your own at /app/config.json to override.
COPY config.example.json ./config.json

USER node
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3080/health >/dev/null || exit 1

CMD ["node", "src/index.js"]
