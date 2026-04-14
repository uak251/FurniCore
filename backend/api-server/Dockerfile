# Optional image build. Railway often uses Nixpacks instead of this file.
#
# Native analytics need analytics-rbac.v1.json in dist/contracts after `pnpm run build`.
# That happens automatically when the repo root `contracts/` exists (../../contracts from this package).
# Build from monorepo root if you use Docker: docker build -f backend/api-server/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN npm install -g pnpm && pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN npm install -g pnpm && pnpm install --no-frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

# file: workspace stubs used at runtime (esbuild external)
COPY --from=builder /app/lib ./lib

EXPOSE 3000

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
