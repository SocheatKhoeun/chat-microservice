# Changelog

## [Unreleased]

## [0.0.3] - 2026-08-22

### Added
- Full relational `prisma/schema.prisma`: every foreign-key column across the 12 chat tables now
  has a matching `@relation` (`users.oauth_client`, `conversations.creator`,
  `conversation_members.conversation`/`.user`, `messages.conversation`/`.sender` plus a
  self-relation `replied_message`/`replies` for threaded replies, `message_reactions`,
  `message_reads`, `message_attachments`, `calls`, `call_participants`, and the back-reference
  arrays on `users`/`conversations`/`oauth_clients`/`oauth_client_grant_types`) instead of bare
  `Int`/`Int?` columns.
- Matching Drizzle schema files for the same tables/relations — `db/schema/users.ts`,
  `conversations.ts`, `conversation-members.ts`, `messages.ts` (self-referencing
  `replied_message_id`), `message-reactions.ts`, `message-reads.ts`, `message-attachments.ts`,
  `calls.ts`, `call-participants.ts` — plus `drizzle/0000_classy_sentry.sql` generated from them,
  creating all 12 tables with their FK constraints.
- `src/modules/users/` — `POST /api/v1/users/registration` endpoint: `users.model.ts`
  (`CreateUserDto`, pinned to the generated Prisma `users` type via
  `implements Pick<users, 'external_id'>` rather than hand-maintained fields),
  `users.service.ts` (creates an anonymous user when no `external_id` is given; resolves the
  existing user when `external_id` already belongs to the same client; `ConflictException` if it
  belongs to a different one), `users.controller.ts`, `users.module.ts`.
- `src/common/guards/oauth/oauth.guard.ts` (`OauthGuard`) — Basic-auth guard for the calling
  `oauth_clients` app (`client_id`/`client_secret` via `bcrypt.compare`), attaching the row to
  `request.oauthClient`. Replaces `ClientAuthGuard`.
- `src/common/decorators/oauth-client.decorator.ts` (`CurrentOauthClient`) — reads
  `request.oauthClient`; replaces `CurrentClient`.
- `src/common/guards/oauth-jwt/oauth-jwt.guard.ts` (`OauthJwtGuard`) + `@nestjs/jwt` dependency —
  Bearer JWT guard using `SettingService.getSecret()`; not wired into any module yet, and not
  currently lint-clean (several `no-unsafe-*` errors from the untyped `request`/`token`).
- `.addBearerAuth()` alongside `.addBasicAuth()` in `main.ts`'s Swagger config, for the above.

### Changed
- `SettingService.getSecret()` uncommented and live again.
- `main.ts`: `setGlobalPrefix('api')` (was `'api/v1'` — `v1` now lives on individual controller
  paths instead, e.g. `users.controller.ts`'s `v1/users/registration`, combining to the same
  `/api/v1/users/registration` route); `ValidationPipe` dropped `whitelist: true` (unknown body
  fields are no longer stripped, only `transform: true` remains); `bootstrap()` call is no longer wrapped in
  `void`, so `pnpm lint` flags it again (`@typescript-eslint/no-floating-promises`); added a
  Cambodia-time log line; CORS falls back to `http://localhost:5000` when `ALLOW_CORS` is unset.
- `nest-cli.json`: the `@nestjs/swagger` CLI plugin (auto-inferred Swagger schemas from DTO
  types) was tried and then removed again — DTOs need manual `@ApiProperty()` /
  `@ApiPropertyOptional()` from here on, as on `CreateUserDto`.

### Removed
- `src/common/guards/client-auth.guard.ts` (`ClientAuthGuard`) and
  `src/common/decorators/current-client.decorator.ts` (`CurrentClient`) — superseded by
  `OauthGuard` / `CurrentOauthClient` above.
- `skills-lock.json` — Prisma AI-agent skills lockfile, unreferenced by any app code or script.
- The admin-registration work previously listed here (`RegisterDto`/`RegisterService`/
  `RegisterController` under `src/modules/auths/register/`, plus the old `ClientAuthGuard`
  wiring) was never actually committed and no longer exists on disk — dropped from this
  changelog since it didn't reflect the real tree.

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
