FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@yorklanes/api --include=dev

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
RUN npm run build -w apps/api

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY services/checklist-parser/requirements.txt services/checklist-parser/
RUN pip3 install --break-system-packages -r services/checklist-parser/requirements.txt

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@yorklanes/api --omit=dev

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY services/checklist-parser ./services/checklist-parser

ENV NODE_ENV=production
ENV API_BIND=0.0.0.0
ENV PYTHON_PATH=python3

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
