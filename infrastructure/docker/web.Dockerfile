# AI Zone web — build with Vite, serve with nginx (API proxied at /api)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN npm run build --workspace @ai-zone/shared-types \
 && npm run build --workspace @ai-zone/web

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infrastructure/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
