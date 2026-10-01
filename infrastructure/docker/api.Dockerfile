# Syntra API — multi-stage build (spec §16: reproducible environments)
FROM node:22-alpine AS build
WORKDIR /app

# Workspaces: copy manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/
# shared-types has a build step the API's types resolution relies on
RUN npm run build --workspace @ai-zone/shared-types \
 && cd apps/api && npx prisma generate && cd ../.. \
 && npm run build --workspace @ai-zone/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S syntra && adduser -S syntra -G syntra

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

USER syntra
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

# Migrations run as a separate deploy step (npm run db:deploy) per spec §16.
CMD ["node", "dist/server.js"]
