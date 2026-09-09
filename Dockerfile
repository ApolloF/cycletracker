FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/simulation/package.json packages/simulation/package.json
RUN pnpm install --frozen-lockfile
COPY . .
FROM base AS build
RUN pnpm build
FROM base AS api
ENV NODE_ENV=production
RUN mkdir -p /data/documents && chown -R node:node /data
USER node
EXPOSE 3100
CMD ["pnpm", "exec", "tsx", "apps/api/src/server.ts"]
FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/web /usr/share/nginx/html
