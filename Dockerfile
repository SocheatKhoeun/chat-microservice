FROM node:22-alpine3.19 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN npm install -g pnpm@10.30.1
COPY . /app
WORKDIR /app

FROM base AS build
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm prisma generate
RUN pnpm run build

FROM node:22-alpine3.19
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-khmer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=build /app /home/chat/app

RUN adduser -D chat
USER chat
WORKDIR /home/chat/app
EXPOSE 3000
CMD ["sh", "-c", "node dist/src/main.js"]
