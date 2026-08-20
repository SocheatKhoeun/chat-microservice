# Changelog

## [0.0.2] - 2026-08-06

### Added
- Core chat feature: 1:1 messaging, scoped per integration (`oauth_clients`), keyed by external
  user ids owned by the calling project (no local `users` table).
  - `conversations` / `messages` tables — `db/schema/conversations.ts`, `db/schema/messages.ts`
    (Drizzle, migration source of truth) mirrored in `prisma/schema.prisma` (query layer).
    `conversations` is unique on `(client_id, participant_one_id, participant_two_id)` with
    participant ids always stored in sorted order, so a pair of users maps to exactly one
    conversation regardless of call order.
  - `ChatModule` (`src/modules/chat/`) — `ChatController` + `ChatService`, guarded by the
    existing `ClientAuthGuard`, under `POST/GET /api/v1/chat/conversations`:
    - `POST /chat/conversations` — get-or-create the 1:1 conversation for two participant ids.
    - `GET /chat/conversations` — list a participant's conversations, newest activity first,
      each with its last message and unread count.
    - `GET /chat/conversations/:id` — fetch one conversation (403 if the caller isn't a
      participant, 404 if it belongs to a different integration).
    - `POST /chat/conversations/:id/messages` — send a message.
    - `GET /chat/conversations/:id/messages` — cursor-paginated message history.
    - `POST /chat/conversations/:id/read` — mark read up to now, per participant.
  - `CurrentClient` param decorator (`src/common/decorators/current-client.decorator.ts`) —
    reads the authenticated integration off `request.client`.
- `drizzle/0001_add_chat_tables.sql`, `drizzle/0002_fix_conversation_nullable_timestamps.sql`.

### Changed
- `ClientAuthGuard` now attaches the authenticated `oauth_clients` row to `request.client` (was
  previously discarded after the credentials check), so downstream handlers can scope queries to
  the calling integration via `@CurrentClient()`.

### Fixed
- `RangeError: Invalid time value` on every read that touched the new nullable timestamp columns
  (`participant_one_read_at`, `participant_two_read_at`, `last_message_at`). Cause: this
  database has `explicit_defaults_for_timestamp` off, so a defaultless nullable MySQL/MariaDB
  `timestamp` column silently becomes `NOT NULL DEFAULT '0000-00-00 00:00:00'` (or
  `CURRENT_TIMESTAMP` for the first such column in the table) instead of staying nullable —
  `@prisma/adapter-mariadb` then fails parsing that value back into a `Date`. Switched those
  three columns to `datetime`, which isn't subject to that legacy behavior. Any *future*
  nullable timestamp column added to this schema needs the same treatment.
- `PrismaService.onApplicationShutdown` / `SettingService` — removed two pre-existing unused
  symbols (`signal` param, `InternalServerErrorException` import) that were failing `pnpm lint`.
- `src/main.ts` — `bootstrap()` call wasn't awaited/handled, tripping
  `@typescript-eslint/no-floating-promises`; wrapped with `void`.

## [Unreleased]

### Added
- Configurable `PORT` via `.env`, actually loaded now via `ConfigModule.forRoot({ isGlobal: true })`
  in `src/app.module.ts` (previously nothing loaded `.env` for the Nest app, so `process.env.PORT`
  in `src/main.ts` was always `undefined`).
- Swagger API docs via `@nestjs/swagger`, served at `/swagger` (`/swagger-json` for the raw
  OpenAPI spec); disabled automatically when `NODE_ENV=production`.
- CORS support via `ALLOW_CORS` in `.env` — comma-separated origin list, or `*` for all origins.
  Wired up with `app.enableCors()` in `src/main.ts`.
- `start:prod` script now sets `NODE_ENV=production` so the Swagger-disable check actually
  triggers in production builds.
- New `settings` table (`db/schema/settings.ts`) — key/value store with `id`, `hash`, `key`,
  `value`, `created_at`, `updated_at`.
- `db:generate` and `db:migrate` scripts in `package.json` (`drizzle-kit generate` /
  `drizzle-kit migrate`), so the migration workflow doesn't need the full `drizzle-kit` CLI
  invocation.
- `PrismaService` (`src/core/services/prisma/prisma.service.ts`) — injectable Prisma Client
  wrapper using the `PrismaMariaDb` driver adapter, connecting/disconnecting via
  `OnModuleInit`/`OnApplicationShutdown`.
- `SettingService` (`src/core/services/setting/setting.service.ts`) — `getSecret()` and
  `getSessionDuration()`, reading from the `settings` table by `key`.
- `mariadb` dependency (via `pnpm add mariadb`) — required peer of `@prisma/adapter-mariadb`,
  was missing.
- Admin registration endpoint, `POST /api/v1/auths/register` (`src/modules/auths/register/`):
  - `RegisterDto` (`register.model.ts`) — `name`/`email`/`password` with `class-validator`
    decorators.
  - `RegisterService` — rejects duplicate emails (`ConflictException`), hashes the password with
    `bcrypt`, creates the `admins` row, and signs a JWT via `jsonwebtoken` using
    `SettingService.getSecret()` / `getSessionDuration()`.
  - `RegisterController` — wired into `AuthModule` (was an empty stub file).
- `generateHash()` util (`src/common/utils/generate-hash.util.ts`) — random alphanumeric
  string via `crypto.randomInt`, used for the `admins.hash` column.
- `ClientAuthGuard` (`src/common/guards/client-auth.guard.ts`) — authenticates the *calling
  client app* (not the end user) against the `oauth_clients` table, via HTTP Basic Auth on the
  `Authorization` header (`client_id` as username, `client_secret` as password, checked with
  `bcrypt.compare`); applied to `RegisterController` with `@UseGuards`. Documented in Swagger via
  `@ApiBasicAuth('client-credentials')` + `DocumentBuilder.addBasicAuth(...)` in `src/main.ts`.
- Global `ValidationPipe` (`whitelist: true, transform: true`) in `src/main.ts` — required for
  the `class-validator` decorators on DTOs to actually run; nothing enabled it before.
- Global route prefix `api/v1` via `app.setGlobalPrefix('api/v1')` in `src/main.ts` — applies to
  all `@Controller` routes; does not affect `/swagger`, which is mounted separately.
- `@types/jsonwebtoken` dev dependency (`jsonwebtoken` itself had no bundled types).

### Fixed
- `admins.hash` was being generated with `crypto.randomUUID()` (36 chars), but the live
  `admins.hash` column is `varchar(16)` (left over from the earlier Drizzle-based schema) —
  caused a `P2000`/`Data too long for column 'hash'` error on every registration. Switched to
  `generateHash(16)`.
- `PrismaService` imported `PrismaClient` from `@prisma/client`, which no longer exports it
  under the v7 `prisma-client` generator; now imports from `generated/prisma/client` and passes
  a `PrismaMariaDb` adapter built from `DATABASE_URL`.
- Adapter construction moved into the `PrismaService` constructor instead of module scope —
  building it at import time ran before `ConfigModule.forRoot()` loaded `.env`, so
  `DATABASE_URL` would have been `undefined` in the running app, not just in tests.
- `settings.key` marked `@unique` in `prisma/schema.prisma` — `SettingService` looks it up via
  `findUnique`, which Prisma only permits on unique fields.
- Jest config (`package.json`): added `moduleNameMapper` to strip `.js` extensions so ts-jest
  can resolve the generated client's ESM-style relative imports, and
  `setupFiles: ["dotenv/config"]` so `DATABASE_URL` is available when tests instantiate
  `PrismaService`.

### Changed
- `.gitignore`: broadened `/generated/prisma` to `/generated`.
- `PrismaService`/`SettingService` are no longer provided by a shared `CoreModule` — that module
  was removed, and both are now provided directly on `AuthModule` (its only current consumer).
  Trade-off: a future second consumer (e.g. a `login`/`users` module) would get its own
  `PrismaService` instance/connection pool unless it's given a shared module again.
- `src/core/guards/` and `src/core/utils/` moved to `src/common/guards/` and `src/common/utils/`
  — `src/core/` now holds `services/` only.
- Client credentials for `ClientAuthGuard` moved from two custom headers (`x-client-id`,
  `x-client-secret`) to a single `Authorization: Basic base64(client_id:client_secret)` header.

### Removed
- `src/core/core.module.ts` (the global module noted above).
- `register.service.spec.ts` / `register.controller.spec.ts` — no test coverage currently on the
  register endpoint.

## [0.0.1] - 2026-08-01

### Added
- Drizzle ORM wired up as the project's actual database access layer (Prisma kept only as a
  schema reference, not used for queries/migrations).
  - `drizzle.config.ts` — mysql dialect, schema at `./db/schema`, migrations output to `./drizzle`.
  - `db/index.ts` — Drizzle client over a `mysql2` pool; uses `DATABASE_URL` if set, otherwise
    falls back to discrete `DB_HOST`/`DB_USER`/`DB_PASS`/`DB_NAME`/`DB_PORT`.
  - `db/schema/users.ts`, `admins.ts`, `oauth-clients.ts`, `oauth-client-grant-types.ts`,
    `app-versions.ts` — table definitions mirroring the Prisma models.
  - `db/schema/index.ts` — barrel export of all tables.
- New tables: `oauth_clients`, `oauth_client_grant_types` (indexed on `client_id`), `admins`,
  `app_versions`.

### Changed
- `Users` model/table renamed to lowercase `users`; `createdAt`/`updatedAt` columns renamed to
  `created_at`/`updated_at` across all tables for snake_case consistency with Prisma.
- Reset `drizzle/` migration history after the database was found empty and the journal
  referenced missing `.sql` files; regenerated a single clean migration matching current schema.

### Fixed
- Prisma v7 schema validation error (`P1012`) caused by `datasource.url` no longer being
  supported in `schema.prisma`. Removed `url = env("DATABASE_URL")` from the datasource block
  (connection now lives in `prisma.config.ts`).
- `prisma/schema.prisma` generator updated to the v7 `prisma-client` provider with explicit
  `output = "../generated/prisma"` and `moduleFormat = "cjs"`.
- Installed `@prisma/adapter-mariadb`, the required v7 driver adapter for the `mysql` datasource
  provider.

### Commands
```bash
pnpm drizzle-kit generate   # write a new SQL migration from schema changes
pnpm drizzle-kit migrate    # apply pending migrations to the database
pnpm drizzle-kit studio     # browse the live database in a local web UI
```
