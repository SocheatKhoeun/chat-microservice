FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.30.1
WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# .dockerignore keeps node_modules/dist/generated/.env/.git out of this copy.
COPY . .

RUN pnpm prisma generate
RUN pnpm run build

RUN pnpm prune --prod

FROM node:22-alpine AS runner
RUN apk add --no-cache tini
WORKDIR /app

RUN addgroup -S chat && adduser -S chat -G chat

COPY --from=build --chown=chat:chat /app/node_modules ./node_modules
COPY --from=build --chown=chat:chat /app/dist ./dist
COPY --from=build --chown=chat:chat /app/prisma ./prisma
COPY --from=build --chown=chat:chat /app/package.json ./package.json

USER chat
EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/src/main.js"]
