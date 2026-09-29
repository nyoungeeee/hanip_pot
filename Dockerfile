# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
# better-sqlite3 prebuilt가 없는 플랫폼에서 소스 빌드용(런타임 이미지에는 포함하지 않음)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY web web
COPY server server
RUN cd web && npm run build && cd ../server && npm run build

FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Asia/Seoul PORT=3000 DATA_DIR=/data UPLOAD_DIR=/uploads WEB_DIST=/app/web/dist
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/web/dist /app/web/dist
COPY server/package.json ./
COPY server/seed ./seed
COPY server/scripts ./scripts
RUN mkdir -p /data /uploads /backups && chown -R node:node /data /uploads /backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
