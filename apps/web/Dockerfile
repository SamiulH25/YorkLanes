FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@yorklanes/web --include=dev

FROM base AS build
ARG PUBLIC_API_URL=https://yorklanes.SamiulH25.com
ARG API_INTERNAL_URL=http://api:3001
ENV PUBLIC_API_URL=$PUBLIC_API_URL
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
RUN npm run build:prod -w apps/web

FROM base AS runtime
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@yorklanes/web --omit=dev

WORKDIR /app/apps/web
COPY --from=build /app/apps/web/dist ./dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
