FROM node:18-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:18-alpine AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN pnpm add -g serve

COPY --from=build /app/dist ./dist

EXPOSE 4173

CMD ["serve", "-s", "dist", "-l", "4173"]
