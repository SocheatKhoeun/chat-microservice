# Changelog

## [Unreleased]

### Added
- `src/modules/conversations/` (`ConversationsModule`) — 1:1 direct chat, conversation side:
  - `POST /api/v1/conversations/direct` — starts (or resumes) a direct conversation with another
    user identified by `external_id`, always sending an initial `message` in the same call so the
    recipient has something to see. Looks for an existing direct conversation between the two
    members first (`conversations.findFirst` scoped to both `conversation_members` rows) before
    creating a new `conversations` + 2 `conversation_members` rows, so a pair of users maps to
    exactly one conversation no matter how many times it's called.
  - `GET /api/v1/conversations` — lists the caller's conversations, newest first, `skip`/`take`
    paginated (default `take: 30`), each item carrying its `last_message` and the other
    participant's `sender_id` (their external id).
  - `ConversationsService#assertMembership(conversationHash, userId)` — resolves a conversation by
    its public `hash` and throws `403` if the caller isn't an active member (`left_at IS NULL`);
    shared by `MessagesService` below.
  - `conversations.model.ts` (`StartDirectConversationDto`, `ConversationResponseDto`,
    `ConversationListItemDto`, `ListConversationsQueryDto`, `ConversationListResponseDto`),
    `conversations.service.ts`, `conversations.controller.ts`, `conversations.module.ts`.
- `src/modules/messages/` (`MessagesModule`) — 1:1 direct chat, message side:
  - `GET /api/v1/conversations/:conversation_hash` — lists messages in a conversation, newest
    first, cursor-paginated (`cursor`/`limit`, default `limit: 30`).
  - `POST /api/v1/conversations/:conversation_hash` — sends a message; validates
    `replied_message_id` belongs to the same conversation when given.
  - `messages.model.ts` (`SendMessageDto`, `ListMessagesQueryDto`, `MessageResponseDto`,
    `MessageListResponseDto`), `messages.service.ts`, `messages.controller.ts`,
    `messages.module.ts`.
  - Both controllers guarded by `OauthJwtGuard`, tagged `Mobile - Conversations` /
    `Mobile - Messages` in Swagger.
- `prisma/migrations/0_init/` — the database had never been baselined into Prisma Migrate (no
  `prisma/migrations/` directory existed; `db:generate`/`db:migrate` in `package.json` only ever
  drove Drizzle, which has its own, unrelated migration history). Generated a full-schema
  `migration.sql` from the current `schema.prisma` and marked it applied
  (`prisma migrate resolve --applied 0_init`) without re-running any SQL, so `prisma migrate
  status` now reports the database up to date and future schema changes can go through
  `prisma migrate dev` and be tracked, instead of ad-hoc `ALTER TABLE`s.
- `src/modules/chat/` (`ChatModule`) — real-time chat over Socket.IO at the `/chat` namespace,
  alongside the REST endpoints above:
  - Auth happens at the socket handshake: JWT via `auth: { token }` in the client's `io()` options
    (works from browsers) or an `Authorization: Bearer <token>` header (Node/native clients only,
    since browsers can't set custom headers on a WebSocket handshake). A missing/invalid token
    lets the socket connect, emits an `exception` event explaining why, then disconnects it —
    deliberately not rejected at the transport level, so clients always get a reason instead of a
    bare close.
  - Every authenticated socket auto-joins two kinds of Socket.IO room: a personal `user:<id>` room
    (once, on connect) and a `conversation:<hash>` room (per `conversation:join` call).
    `conversation_started`/`message:new`/`message:read`/presence broadcast to a conversation's
    *members' personal rooms* as well as its room, so they reach a user who's connected but hasn't
    (yet) joined that specific conversation; `typing:start`/`typing:stop` deliberately broadcast to
    the room only, excluding personal rooms, so only people with that conversation open see it.
  - Events — `conversation:join`/`conversation:leave` (`{ conversation_hash }`), `message:send`
    (`{ conversation_hash, body, type?, replied_message_hash? }`, broadcasts `message:new`),
    `message:read` (`{ conversation_hash }`, also the broadcast event name, carries
    `read_count`/`last_read_message_id`), `typing:start`/`typing:stop` (`{ conversation_hash }`,
    relayed verbatim to the room minus the sender), `list_messages`
    (`{ conversation_hash, cursor?, limit? }`, same pagination as the REST endpoint). Every
    client→server event acknowledges with `{ success, data?, message? }` instead of throwing, so a
    client's `emitWithAck` never hangs.
  - Presence — `presence:online`/`presence:offline`, broadcast to everyone a user shares a
    conversation with (`ConversationsService#listContactUserIds`), ref-counted per user across
    sockets so multiple tabs/devices only flip presence on the true first-connect/last-disconnect,
    not every socket.
  - `conversation_started` — broadcast to the other member's personal room the moment
    `ConversationsService#startDirectConversation` creates (or reuses) a direct conversation, so
    they find out immediately even though they can't have joined a room for a conversation that
    didn't exist a moment ago. Needed a new `ChatEventsService`/`ChatEventsModule`
    (`src/common/services/chat-events/`) — a small singleton holding the gateway's Socket.IO server
    reference — since `ConversationsService` can't import `ChatGateway` directly without a circular
    module dependency (`ChatModule` already imports `ConversationsModule`).
  - `chat.gateway.ts` (`ChatGateway`), `chat.model.ts` (`JoinConversationDto`, `MarkReadDto`,
    `TypingDto`, `WsSendMessageDto`, `ListMessagesWsDto`), `chat.module.ts`.
- `src/common/utils/validate-dto.util.ts` (`validateDto`, `DtoValidationError`) — runs a
  class-validator DTO manually outside the HTTP pipeline, since WS handlers don't go through
  Nest's `ValidationPipe`.
- `ConversationsService#listMemberUserIds(conversationHash)` and `#listContactUserIds(userId)` —
  conversation membership / cross-conversation contacts, used by the gateway to build broadcast
  targets.
- `MessagesService#markConversationRead(userId, conversationHash)` — marks every message in a
  conversation the caller hasn't sent and hasn't already read as read; the `message_reads` table
  existed in the schema but nothing wrote to it before this.
- `chat-test.html` (repo root) — two-pane browser tester, one Socket.IO connection per pane, for
  exercising the whole `/chat` API with two real users side by side: independent login/connect per
  pane, join/leave, send with live message bubbles, mark read, typing indicator (throttled on
  input, auto-stops after 2s idle), presence, load history, and a "start conversation" button in
  both directions that demonstrates `conversation_started` firing on a pane that never joined the
  new conversation's room. Later extended across every phase below — group management panel,
  attachment upload, reactions/edit/delete/forward buttons, "Delivered to/Seen by" status lines,
  `last_seen_at` display, and a full Call panel (see Calls below).
- **Group chat** (schema-ready: `conversation_type.group`, `conversation_member_role`,
  `conversations.name`/`description`/`avatar_url`):
  - `POST /v1/conversations/group` — create a group with a name + initial member list (creator
    becomes `owner`).
  - `POST /v1/conversations/:hash/members` — add members (owner/admin only).
  - `DELETE /v1/conversations/:hash/members/:user_id` — remove a member (owner/admin only), or
    leave yourself by passing your own user id.
  - `PATCH /v1/conversations/:hash` — update group info (name/description/avatar; owner/admin
    only).
  - `PATCH /v1/conversations/:hash/members/:user_id` — promote/demote a member's role (owner only;
    the owner can't be removed or have their own role changed via this endpoint).
  - `GET /v1/conversations/:hash/members` — list members with roles (works for direct conversations
    too).
  - WS broadcasts on the REST actions above: `group:created`, `group:updated`, `member:added`,
    `member:removed`, `member:role_updated` (via `ChatEventsService`, same best-effort pattern as
    `conversation_started`).
  - Presence/typing/read-receipt broadcasts needed no group-specific code — `listContactUserIds`/
    `broadcastToConversation` never filtered by conversation type, so N-member support was already
    structural.
  - `ChatEventsService` refactored to own room-naming (`conversationRoom`/`userRoom`) and a shared
    `broadcastToConversation`/`notifyUsers`, reused by both `ChatGateway` and `ConversationsService`
    (removes the room-targeting duplication that existed before).
- **Rich messages** (reactions/attachments were schema-ready; edit/delete needed a migration):
  - Media attachments: `SendMessageDto`/`WsSendMessageDto` take an `attachments: [{file_url,
    file_type}]` array (the client uploads the file elsewhere and just registers the URL — no
    binary-upload endpoint on the message API itself, matching the `avatar_url` convention already
    used); persisted to `message_attachments`, returned on every message payload.
  - Emoji reactions: `POST`/`DELETE /v1/conversations/:hash/:message_hash/reactions` + WS broadcast
    (`reaction:added`/`reaction:removed`). One reaction per user per message — reacting again
    replaces it, backed by a new `@@unique([message_id, user_id])` constraint on
    `message_reactions`.
  - Edit message — `PATCH /v1/conversations/:hash/:message_hash` (sender only); new
    `messages.edited_at` column; broadcasts `message:edited`.
  - Delete/unsend message — `DELETE /v1/conversations/:hash/:message_hash` (sender only); new
    `messages.deleted_at` column; nulls `content` and removes the message's `message_attachments`
    rows; broadcasts `message:deleted`.
  - Forward a message — `POST /v1/conversations/:hash/:message_hash/forward` (must be a member of
    both the source and target conversation); copies content + attachments into a new message in
    the target, broadcasts `message:new` there.
  - `prisma/migrations/20260824065337_add_message_edit_delete_and_reaction_unique/` — adds
    `messages.edited_at`/`deleted_at` and the reaction unique constraint.
- **MinIO-backed attachment uploads** — `POST /v1/attachments/upload` (multipart): detects
  `attachment_type` from the file's mimetype, uploads to the configured bucket, returns
  `{file_url, file_type}` ready to drop into a message's `attachments`. `src/modules/attachments/`
  (`attachments.service.ts` owns the MinIO client logic directly — deliberately not a separate
  shared storage service, so upload concerns stay inside the one module that owns them). Config is
  env-driven (`S3_ENDPOINT`/`S3_PORT`/`S3_USE_SSL`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`);
  missing config logs a warning instead of crashing the app at boot.
- **Presence & delivery fidelity**:
  - "Delivered" vs "Read" distinction — new `message_deliveries` table (mirrors `message_reads`).
    `POST /v1/conversations/:hash/:message_hash/delivered` acks receipt (idempotent — first ack per
    user sticks); broadcasts `message:delivered`. `markConversationRead` also back-fills a delivery
    record for anything marked read without an explicit prior ack (read implies delivered).
    `MessageResponseDto` now carries both `reads: [{user_id, read_at}]` and
    `deliveries: [{user_id, delivered_at}]`.
  - Per-user "last seen" timestamp — `users.last_seen_at`, set in `ChatGateway.markOffline` the
    moment a user's last socket disconnects (best-effort — a DB failure here doesn't block the
    presence broadcast). Included in the `presence:offline` WS payload and on every
    `GroupMemberDto` (`GET /v1/conversations/:hash/members`).
  - "Seen by" list for group messages — the `reads` array above; works at any conversation size,
    not group-specific code.
  - `prisma/migrations/20260824084140_add_presence_and_delivery_tracking/` — adds
    `users.last_seen_at` and the `message_deliveries` table (`@@unique([message_id, user_id])`).
  - `prisma/migrations/20260824085333_add_message_reads_unique_constraint/` — adds
    `@@unique([message_id, user_id])` on `message_reads`.
- **Calls (voice/video signaling)** — `src/modules/calls/` (`CallsModule`): WS-only, matching the
  existing `typing:*`/presence pattern rather than messages' REST-triggers-broadcast pattern, since
  calls are inherently real-time. No migration needed — `calls`/`call_participants` and their enums
  were already schema-ready.
  - `call:invite` `{conversation_hash, type}` — caller must be a conversation member; creates the
    `calls` row (`status: ringing`) plus one `call_participants` row per active member (caller:
    `joined`, everyone else: `invited`). Rejects if the conversation already has a live call, or has
    no one else to call.
  - `call:ring` `{call_hash}` — callee's device is alerting; flips their participant row `invited`
    → `ringing`.
  - `call:answer` `{call_hash, signal}` — flips the answering participant to `joined`; the first
    answer flips the call itself to `active` and stamps `answered_at`. `signal` (the SDP answer) is
    opaque to the server, relayed verbatim.
  - `call:reject` `{call_hash}` — flips the declining participant to `rejected` (the caller can't
    reject their own call — use `call:end` to cancel). Auto-closes the call as `rejected` if nobody
    else ever joined.
  - `call:ice-candidate` `{call_hash, target_user_id, signal}` — pure relay, no DB write; delivered
    only to `target_user_id`'s personal room (never conversation-wide), correct for a mesh WebRTC
    topology. Also carries the initial SDP offer (`{type: 'offer', sdp}`) — there's no separate
    "send offer" event; this generic targeted-relay channel doubles as that.
  - `call:end` `{call_hash}` — flips the leaving participant to `left`; once nobody is left
    `joined`, closes the call as `cancelled` (caller hung up before anyone answered) or `ended`
    (someone had joined), and bulk-flips anyone still `invited`/`ringing` to `missed`. Idempotent.
  - Group calls: `call:invite` rings every active conversation member, not just one;
    `call:ice-candidate`'s `target_user_id` lets clients build a pairwise mesh across however many
    joined.
  - Every event broadcasts to the call's own participants via `ChatEventsService.notifyUsers`
    (personal rooms), deliberately narrower than `broadcastToConversation` — not every conversation
    member necessarily has the call UI open.
  - `GET /v1/conversations/:hash/calls` — call history, cursor-paginated exactly like the messages
    list endpoint (`ListCallsQueryDto`/`CallListResponseDto` mirror their messages equivalents).
  - `chat-test.html` — real Call panel per pane (audio/video select, Start/End call, incoming-call
    banner with Accept/Reject, local + remote `<video>` tiles) using actual `getUserMedia`/
    `RTCPeerConnection`, not simulated signaling.
  - A REST `POST .../calls` to start a call over plain HTTP was tried and then deliberately
    reverted — every step after inviting (`ring`/`answer`/`reject`/`ice-candidate`/`end`) still
    requires a live WS connection anyway, so starting over WS too keeps the whole lifecycle on one
    transport. Starting a call is WS-only (`call:invite`), same as the rest of it.

### Changed
- **`users.id` is now the external id itself** (`String @id @db.VarChar(255)`) — the separate
  `external_id` column is gone. Anonymous logins (no `external_id` given) now get `id` set to a
  `generateHash()` value instead of relying on autoincrement. Ripple effects:
  - Every foreign key that pointed at `users.id` — `conversations.created_by`,
    `conversation_members.user_id`, `messages.sender_id`, `message_reactions.user_id`,
    `message_reads.user_id`, `calls.caller_id`, `call_participants.user_id` — changed from `Int`
    to `String @db.VarChar(255)`, in both `prisma/schema.prisma` and the live database (migrated
    in place: FKs dropped, columns backfilled via an id map built from each user's old
    `external_id`, FKs re-added; no data loss).
  - `db/schema/users.ts` and the other Drizzle files under `db/schema/` (unused by the app, kept
    in sync anyway) updated to match.
  - `AccessTokenPayload.sub` (`login.model.ts`) is now `string`; the payload's separate
    `external_id` claim was dropped as redundant with `sub`.
  - `ProfileResponseDto` (`profile.model.ts`) dropped its `external_id` field for the same reason.
  - `ConversationsService#listConversations` no longer needs a second `users.findMany` query to
    resolve the other participant's external id — `conversation_members.user_id` already *is*
    that value now.
- `POST /api/v1/conversations/direct` and `GET`/`POST /api/v1/conversations/:conversation_hash`
  identify the conversation by its public `hash`, not its internal integer `id`.
- `ConversationResponseDto`/`ConversationListItemDto`'s `other_user_id: number` field is now
  `sender_id: string | null` (the other participant's external id, not an internal numeric id);
  both list responses' `items` field is now named `data`.
- `GET /api/v1/conversations` pagination changed from cursor-based (`cursor`/`limit`) to plain
  `skip`/`take`.
- `MessagesController`'s routes lost the `/messages` suffix — was
  `GET`/`POST /v1/conversations/:conversationHash/messages`, is now
  `GET`/`POST /v1/conversations/:conversation_hash` — which means it shares its base path with
  `ConversationsController`'s literal `/direct` route. Works today because `ConversationsModule`
  is imported before `MessagesModule` in `app.module.ts` (the literal route wins), but is
  order-dependent.
- `app.module.ts` now also imports `ConversationsModule` and `MessagesModule`.
- Conversation identification over the WebSocket API uses the same public `conversation_hash` the
  REST endpoints use, not the internal numeric id — tried numeric `conversation_id` first, switched
  once the REST-vs-WS inconsistency came up.
- WebSocket event names follow a namespaced `noun:verb` convention (`conversation:join`,
  `conversation:leave`, `message:send`/`message:new`, `message:read`, `typing:start`/`typing:stop`)
  instead of the original flat names (`join_conversation`, `send_message`/`message`,
  `mark_read`/`read`, a single `typing` event with an `is_typing` boolean). `list_messages` and
  `conversation_started` were left as-is — not part of the naming scheme being matched.
- `src/core/services/chat-events/` moved to `src/common/services/chat-events/`.
- **`external_id` → `user_id` rename, API-wide** — it was always just `users.id` under a different
  name at the API boundary; only the field/param name changes, no behavior change.
  `LoginDto.user_id`, `StartDirectConversationDto.user_id`,
  `CreateGroupConversationDto`/`AddGroupMembersDto.member_user_ids`, the `:user_id` route params on
  the member endpoints, and every description/error string that said "external id".
- `ChatGateway`'s JWT-verification logic was briefly extracted into a shared
  `AccessTokenResolverService.resolve()` (deduplicating it against `OauthJwtGuard`'s identical
  logic), then **reverted at explicit request** — `OauthJwtGuard` and `ChatGateway` each own their
  independent verification logic again, on purpose; the duplication is back by design.
- `MessagesService`/`ConversationsService` had several private response-mapping helpers
  (`mapMessage`, `mapMember`, `mapGroupConversation`, etc.) converted to DTO classes with
  constructors instead (`new MessageResponseDto(message)` rather than a function call) — applied
  across every module (messages, conversations, attachments, login, profile) for consistency with
  the existing `RepliedMessageDto` pattern.
- Race-condition protection on `reactToMessage`/`markDelivered` (see Fixed, below) was added, then
  the raw-SQL/retry version of it was **explicitly removed again at request** — both now use plain
  unprotected `upsert()` calls. The underlying race (see Fixed) is real and reintroduced by this;
  documented here so it isn't mistaken for an oversight.

### Removed
- `ws-test.js` and `ws-client.js` (root-level Node CLI testers for the WebSocket API — one
  scripted two-user scenario, one free-form single-user client) — removed on request;
  `chat-test.html` is the remaining way to exercise the gateway manually.
- A Swagger `description` block documenting the WebSocket API (`main.ts`) — OpenAPI has no concept
  of a persistent socket with named events, so it never showed up as a route; added as a
  workaround, then removed again on request.

### Fixed
- `RangeError: Invalid time value` crashing every request touching `conversation_members`,
  `calls`, or `call_participants` — `left_at`/`answered_at`/`ended_at` were
  `TIMESTAMP NOT NULL DEFAULT '0000-00-00 00:00:00'` in the live database despite
  `schema.prisma` declaring them nullable (leftover from the original Drizzle-generated DDL);
  `@prisma/adapter-mariadb` can't parse that zero-date default into a `Date`. Fixed twice in this
  window — it resurfaced after the database was reset/reseeded (different user data appeared),
  most likely by `drizzle-kit migrate` re-applying the original zero-date DDL, since the database
  had no Prisma migration history to protect it (see `prisma/migrations/0_init` above).
- `GET /api/v1/conversations`'s default `take` (was `?? 10`) and
  `GET /api/v1/conversations/:conversation_hash`'s default `limit` (was `?? 20`) silently didn't
  match their own Swagger-documented default of `30` — both now actually default to `30`.
- **Presence race on fast disconnect** — `handleConnection` fired `authenticate()` without awaiting
  it, and `handleDisconnect` never waited on `client.data.authenticated`. A socket that disconnected
  mid-auth could get marked online *after* its disconnect had already been processed, leaving it
  stuck "online" forever. `handleDisconnect` now awaits `client.data.authenticated` first.
- **Uncaught broadcast could 500 an already-successful request** — `startDirectConversation` called
  `chatEventsService.notifyUser(...)` unguarded after the transaction committed. Wrapped in
  try/catch with a warning log (now `ChatEventsService.safeBroadcast()`, shared by every broadcast
  call site) — a broadcast failure no longer fails the request.
- **WS error handler leaked internals / collapsed exception types** — `ChatGateway#handle()`'s
  catch-all forwarded any thrown error's raw `.message` (including unexpected DB errors) to the
  client, and treated `NotFoundException`/`ForbiddenException`/plain `Error` identically. Known
  `HttpException`s still return their intended message; anything else is logged server-side and
  replaced with a generic "Something went wrong!" before it reaches the client.
- **Undocumented token-via-query-string auth path** — `extractToken()` accepted
  `handshake.query.token` in addition to the two documented paths (`auth.token`, `Authorization`
  header). Query strings land in server/proxy access logs, silently widening the token-leak
  surface. Removed; only the two documented paths remain.
- **`typing:stop` never fires on abrupt disconnect** — a peer who disconnects mid-typing (crash,
  dropped network) left other members' UI stuck showing "typing…" forever. Sockets now track which
  conversations they've sent an unmatched `typing:start` for (`client.data.typingIn`), and
  `handleDisconnect` emits `typing:stop` for each of them.
- **Auth failures swallowed with no logging** — `authenticate()`'s catch-all discarded every
  exception identically (bad token vs. DB/config outage), with nothing logged, making a real outage
  indistinguishable from normal invalid-token traffic. Now logs the underlying error via
  `this.logger.warn` before disconnecting the client.
- **`.env` S3 credentials were inert** — sitting there as an HTML comment
  (`<!-- S3 Endpoint: ... -->`) instead of real `KEY=value` lines, so attachment uploads couldn't
  find them at boot.
- **Redundant DB re-queries** — `reactToMessage`/`removeReaction`/`editMessage`/`deleteMessage`/
  `forwardMessage` each called `assertMembership` (which already returns `conversation.members`)
  and then separately re-queried `listMemberUserIds()` for the same ids again, just for the
  broadcast; `forwardMessage`'s two independent `assertMembership` calls ran sequentially instead
  of via `Promise.all`; `addGroupMembers` re-fetched the whole conversation+members after
  `createMany` purely to reconstruct data already in hand; `safeBroadcast()` was copy-pasted into
  both `ConversationsService` and `MessagesService` instead of living on `ChatEventsService` once.
  All fixed — six redundant queries/duplications removed.
- **Duplicate read receipts under concurrency** — `markConversationRead` did check-then-insert
  (`findMany` unread → `createMany`) with no unique constraint on `message_reads(message_id,
  user_id)`. Two concurrent calls (multi-tab, reconnect double-emit) could insert duplicate rows.
  Reproduced directly against the live DB (3 concurrent calls → 2 duplicate rows), fixed with the
  `@@unique([message_id, user_id])` constraint plus `createMany({skipDuplicates: true})` (a single
  INSERT statement, so — unlike `upsert()` below — no separate race to guard against).
- **`upsert()` on MySQL is not atomic** — it runs a SELECT then an INSERT, so two genuinely
  concurrent upserts on the same compound-unique key can both miss the row and both attempt to
  insert; the loser gets a `P2002` unique-constraint error instead of a quiet upsert. Reproduced
  directly (3 concurrent calls → 1 succeeded, 2 threw) against both the new `markDelivered` and the
  already-shipped `reactToMessage`. Fixed with atomic `INSERT ... ON DUPLICATE KEY UPDATE` raw SQL,
  **then explicitly reverted at request** back to plain `upsert()` — see the Changed entry above;
  the race is real and currently unguarded again, by design.
- `chat-test.html` — the incoming-call banner was visible on page load: `.incoming-call { display:
  flex }` was beating the `hidden` attribute in the CSS cascade (author styles win over the UA
  `[hidden]` rule at equal specificity). Fixed with `.incoming-call[hidden] { display: none }`.
- `chat-test.html` — `teardownCall()` stopped media tracks/closed peer connections and *then*
  re-enabled the "Start call" button in one straight sequence; if anything threw during a real
  camera/`RTCPeerConnection`'s cleanup (more failure modes than a synthetic test stream hits), the
  button never re-enabled — reproduced live as "Start call stays disabled after cancelling before
  being answered." Wrapped cleanup in `try/finally` (button always re-evaluated; errors now log to
  the Event Log panel instead of silently killing the rest of the function) and guarded
  `pc.onicecandidate`/`pc.ontrack` against firing after the call state is already torn down.

## [0.0.4] - 2026-08-22

### Added
- `src/modules/auth/` — `POST /api/v1/auth/login`: resolves-or-creates a user by `external_id`
  (same rules as the old `users.service.ts`: anonymous user when omitted, existing user returned
  when it already belongs to the calling client, `ConflictException` when it belongs to a
  different one) and returns a JWT `{ access_token }`. `auth.module.ts` wires `JwtModule`,
  `PrismaService`, `SettingService`, `OauthGuard` (Basic auth) into `login/login.controller.ts` +
  `login/login.service.ts`; `login/login.model.ts` holds `LoginDto`, `AccessTokenResponseDto`,
  and the `AccessTokenPayload` JWT-claims shape (`sub`, `external_id`, `client_id`) shared by the
  guard, decorator, and profile module below.
- `SettingService.getSessionDuration()` uncommented and wired up: `LoginService.issueAccessToken`
  now signs the token with `expiresIn` read from the `session_duration` setting (seconds; `500`
  if it's missing/non-numeric/`<= 0`) instead of issuing a non-expiring token.
- `OauthJwtGuard` now does more than verify the JWT signature: after `verifyAsync`, it loads the
  `users` row for `token.sub` and rejects with `401` if it's missing or its `oauth_client_id`
  no longer matches `token.client_id` (token for a deleted/reassigned user), then attaches both
  `request.token` (decoded JWT) and `request.user` (the DB row) to the request. Needs
  `PrismaService` injected now.
- `src/common/decorators/token.decorator.ts` (`CurrentToken`) — reads `request.token`; not
  currently used by any controller (`profile` reads `request.user` directly via `@Req()`
  instead), kept as a ready-made primitive for a future endpoint that only needs the claims.
- `src/modules/profile/` — `GET /api/v1/profile/me`, guarded by `OauthJwtGuard`:
  `profile.controller.ts` reads `req.user.id` off the raw request and calls
  `profile.service.ts#getProfile(userId)`, which re-queries `users` scoped to
  `{ id, external_id, created_at, updated_at }` (`oauth_client_id` never leaves the query) and
  throws `NotFoundException` if the id doesn't resolve. `profile.model.ts` holds
  `ProfileResponseDto`.

### Changed
- `app.module.ts` now imports `AuthModule` and `ProfileModule` in place of `UsersModule`.

### Removed
- `src/modules/users/` (`users.controller.ts`/`.service.ts`/`.model.ts`/`.module.ts`) — the
  `POST /api/v1/users/registration` endpoint from 0.0.3 is superseded by
  `POST /api/v1/auth/login` above; no other module referenced it.
- A client-credentials `POST /api/v1/auth/token` endpoint (token bound to the client only, no
  user) was added alongside `login` and then removed again as unneeded — `LoginService` no
  longer exposes `issueAccessToken` publicly, it's a private helper called only by `login()`.
- `src/common/decorators/user.decorator.ts` (`CurrentUser`) — added for `profile.controller.ts`,
  then deleted once that controller settled on reading `request.user` off a raw `@Req()` instead.

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
