FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
# Exact dependency versions from the committed lockfile.
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/data/planner.sqlite
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/build-info.json ./build-info.json
COPY --from=build --chown=node:node /app/src/lib/server/version.js ./src/lib/server/version.js
COPY --from=build --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
