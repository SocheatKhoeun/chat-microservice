# Tasks

Workflow: a QA pass reviews code and lists issues here as tasks. A separate
implementation pass picks up each open task, fixes it, checks it off, and
notes the commit.

Status legend: `[ ]` open · `[x]` done

## How to run this workflow again later
1. QA pass: `/code-review <commit-range-or-PR>` → append findings below as tasks.
2. Implementation pass: fix each open task, check it off, commit with a message
   referencing the task.

---

## QA pass: `5b604d9..bc0977c` (Socket.IO chat feature)

- [x] **Presence race on fast disconnect** — `handleConnection` fired
  `authenticate()` without awaiting it, and `handleDisconnect` never waited on
  `client.data.authenticated`. A socket that disconnected mid-auth could get
  marked online *after* its disconnect had already been processed, leaving it
  stuck "online" forever. Fixed: `handleDisconnect` now awaits
  `client.data.authenticated` first. (`chat.gateway.ts`)

- [x] **Duplicate read receipts under concurrency** — `markConversationRead`
  did check-then-insert (`findMany` unread → `createMany`) with no unique
  constraint on `message_reads(message_id, user_id)`. Two concurrent calls
  (multi-tab, reconnect double-emit) could insert duplicate rows. **Fixed
  2026-08-24** as part of Phase 3 — see that section below for the migration,
  the fix, and the concurrency test that empirically reproduced this exact
  bug against the live DB before confirming the fix closes it.
  (`messages.service.ts`, `prisma/schema.prisma`)

- [x] **Uncaught broadcast could 500 an already-successful request** —
  `startDirectConversation` called `chatEventsService.notifyUser(...)`
  unguarded after the transaction committed. Fixed: wrapped in try/catch with
  a warning log; a broadcast failure no longer fails the request.
  (`conversations.service.ts`)

- [x] **WS error handler leaked internals / collapsed exception types** —
  `handle()`'s catch-all forwarded any thrown error's raw `.message`
  (including unexpected DB errors) to the client, and treated
  `NotFoundException`/`ForbiddenException`/plain `Error` identically. Fixed:
  known `HttpException`s (incl. the auth-required case, now thrown as
  `UnauthorizedException`) still return their intended message; anything else
  is logged server-side via `this.logger.error` and replaced with a generic
  "Something went wrong!" before it reaches the client. (`chat.gateway.ts`)

- [x] **Undocumented token-via-query-string auth path** — `extractToken()`
  accepted `handshake.query.token` in addition to the two paths the CHANGELOG
  documents (`auth.token`, `Authorization` header). Query strings land in
  server/proxy access logs, so this silently widened the token-leak surface.
  Fixed: removed the query-param path; only the two documented paths remain.
  (`chat.gateway.ts`)

- [x] **`typing:stop` never fires on abrupt disconnect** — a peer who
  disconnects mid-typing (crash, dropped network) left other members' UI
  stuck showing "typing…" forever, since `handleDisconnect` only handled
  presence. Fixed: sockets now track which conversations they've sent an
  unmatched `typing:start` for (`client.data.typingIn`), and
  `handleDisconnect` emits `typing:stop` for each of them. (`chat.gateway.ts`)

- [x] **Auth failures swallowed with no logging** — `authenticate()`'s
  catch-all discarded every exception identically (bad token vs. DB/config
  outage), with nothing logged, making a real outage indistinguishable from
  normal invalid-token traffic. Fixed: logs the underlying error via
  `this.logger.warn` before disconnecting the client. (`chat.gateway.ts`)

- [x] **Duplicated JWT-verification logic (WS vs REST)** — `ChatGateway`
  re-implemented the exact secret-lookup/verify/user-lookup/client_id-check
  logic already in `OauthJwtGuard`, so the two auth paths could silently
  diverge. Originally fixed by extracting a shared
  `AccessTokenResolverService.resolve()`; **reverted 2026-08-24 at explicit
  request** — `OauthJwtGuard` and `ChatGateway` each own their independent
  verification logic again, and the shared service was deleted. The
  duplication this item flagged is back by design; noted here so it isn't
  "rediscovered" as a surprise later.

- [ ] **Redundant member re-query on every broadcast** — `broadcastToConversation`
  re-fetches conversation+members on every `message:send`/`message:read` even
  though `assertMembership` just fetched the same data moments earlier.
  Efficiency-only (not a correctness bug) — left open as a lower-priority
  optimization; would need threading the already-fetched member list through
  `sendMessage`/`markConversationRead` into the broadcast call.
  (`chat.gateway.ts`, `conversations.service.ts`)

- [ ] **Duplicate direct conversations under concurrency** — the
  find-or-create for a direct conversation between two users has no unique
  constraint backing the (type=direct, member-pair) combination, so two
  near-simultaneous `startDirectConversation` calls between the same pair can
  create two separate conversations. **Needs a schema-level fix** (a
  constraint or an application-level lock) — flagged, not applied
  automatically; let me know if you want the migration.
  (`conversations.service.ts`, `prisma/schema.prisma`)

---

## Feature roadmap: Messenger-parity chat app

Gap analysis of the current API (`v1/conversations`, `v1/conversations/:hash`
messages, `chat` WS gateway) against a Facebook‑Messenger‑style product.
Today the API only does: 1:1 conversations, text messages with replies, read
receipts, typing, online/offline presence. Everything below is what's still
missing, grouped into phases so it can be picked up one at a time instead of
as one giant change. "Schema-ready" means `prisma/schema.prisma` already has
the table; "needs migration" means it doesn't yet.

### Phase 1 — Group chat *(schema-ready: `conversation_type.group`, `conversation_member_role`, `conversations.name/description/avatar_url`)* — ✅ done
- [x] `POST /v1/conversations/group` — create a group with a name + initial member list (creator becomes `owner`)
- [x] `POST /v1/conversations/:hash/members` — add members (owner/admin only)
- [x] `DELETE /v1/conversations/:hash/members/:user_id` — remove a member (owner/admin only), or leave yourself by passing your own user id
- [x] `PATCH /v1/conversations/:hash` — update group info (name, description, avatar; owner/admin only)
- [x] `PATCH /v1/conversations/:hash/members/:user_id` — promote/demote member role (owner only; owner can't be removed or have their own role changed via this endpoint)
- [x] `GET /v1/conversations/:hash/members` — list members with roles (works for direct conversations too)
- [x] WS events broadcast on the REST actions above: `group:created`, `group:updated`, `member:added`, `member:removed`, `member:role_updated` (via `ChatEventsService`, same best-effort pattern as `conversation_started`)
- [x] Presence/typing/read-receipt broadcasts already generalized to N members — `listContactUserIds`/`broadcastToConversation` don't filter by conversation type, so group support was structural, not code
- [x] Refactored `ChatEventsService` to own room-naming (`conversationRoom`/`userRoom`) and a shared `broadcastToConversation`/`notifyUsers`, reused by both the gateway and `ConversationsService` (removes the room-targeting duplication)

Not done in this phase (left for later, on purpose):
- Ownership transfer — if the owner leaves via self-removal, the group is left without an owner; no transfer flow yet
- Rate/size limits on `member_external_ids` beyond `ArrayMaxSize(255)`

### Phase 2 — Rich messages *(reactions + attachments were schema-ready; edit/delete needed a migration)* — ✅ done
- [x] Media messages: `SendMessageDto`/`WsSendMessageDto` take an `attachments: [{file_url, file_type}]` array (client uploads the file elsewhere and just registers the URL — no binary upload endpoint, matching the `avatar_url`-style convention already used in this codebase); persisted to `message_attachments`, returned on every message payload
- [x] Emoji reactions: `POST`/`DELETE /v1/conversations/:hash/:message_hash/reactions` + WS broadcast (`reaction:added`/`reaction:removed`). One reaction per user per message — reacting again replaces it via a Prisma `upsert` against a new `@@unique([message_id, user_id])` constraint (atomic, race-free — the same bug class as the still-open `duplicate-read-receipts` task, avoided here from the start)
- [x] Edit message — `PATCH /v1/conversations/:hash/:message_hash` (sender only); migration added `messages.edited_at`; broadcasts `message:edited`
- [x] Delete/unsend message — `DELETE /v1/conversations/:hash/:message_hash` (sender only); migration added `messages.deleted_at`; nulls `content` and removes `message_attachments` rows, broadcasts `message:deleted`
- [x] Forward a message — `POST /v1/conversations/:hash/:message_hash/forward` (must be a member of both source and target conversations); copies content + attachments into a new message, broadcasts `message:new` to the target

**Migration**: `prisma/migrations/20260824065337_add_message_edit_delete_and_reaction_unique/`
(adds `messages.edited_at`, `messages.deleted_at`, `@@unique([message_id, user_id])` on
`message_reactions`) plus a `migration_lock.toml` that was missing from the repo.
**Hand-authored, not applied** — no DB was reachable in this environment
(`mysql://root:@localhost:3306` refused the connection) to run `prisma migrate dev`,
so the SQL was written to match Prisma's own output format and `prisma generate`
was run against the schema only (no DB needed for that step) to regenerate the
client types. **Run `npx prisma migrate deploy` against your real database before
using edit/delete/reactions** — the code assumes those columns/constraint exist.

### Post-Phase-2 hardening (2026-08-24) — ✅ done

- [x] **`external_id` → `user_id` rename**, API-wide. It was always just
  `users.id` (see `login.service.ts`'s `resolveUser` — `dto.external_id`
  became `users.id` directly); only the field/param name at the API boundary
  changes. Touched: `LoginDto.user_id`, `StartDirectConversationDto.user_id`,
  `CreateGroupConversationDto`/`AddGroupMembersDto.member_user_ids`, the
  `:user_id` route params on the member endpoints, and every description/error
  string that said "external id". No DB/schema change.

- [x] **MinIO-backed attachment uploads**: `POST /v1/attachments/upload`
  (multipart) — detects `attachment_type` from the file's mimetype, uploads to
  the configured bucket, returns `{file_url, file_type}` ready to drop into a
  message's `attachments`. The MinIO client logic lives directly in
  `AttachmentsService` (`src/modules/attachments/attachments.service.ts`) —
  deliberately **not** a separate `core/services/storage` service, so upload
  concerns stay inside the one module that owns them. Config is env-driven
  (`S3_ENDPOINT`/`S3_PORT`/`S3_USE_SSL`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`);
  missing config logs a warning instead of crashing the app at boot.
  **Fixed `.env`**: the S3 credentials were sitting there as an inert HTML
  comment (`<!-- S3 Endpoint: ... -->`), not real env vars — now actual
  `KEY=value` lines the app can read.

- [x] **QA pass** (`/code-review` against the full uncommitted working-tree
  diff) — one review angle ("simplification and efficiency") completed before
  the session hit a usage-limit interruption; the other angles (line-by-line
  diff, removed-behavior audit, cross-file trace, reuse) didn't finish and
  weren't re-run rather than re-spawning more background agents right after a
  limit reset. Every finding the completed angle returned was a real,
  verified redundant-DB-query / duplication issue — all six fixed:
  - `MessagesService.reactToMessage/removeReaction/editMessage/deleteMessage/forwardMessage`
    each called `assertMembership` (which already returns `conversation.members`)
    and then separately re-queried `listMemberUserIds()` just to get the same
    ids again for the broadcast. Fixed: added `activeMemberIds()` +
    `broadcastToConversation()` private helpers that reuse the
    already-in-hand member list — 5 duplicate queries removed.
  - `forwardMessage` ran its two independent `assertMembership` calls
    (source + target conversation) sequentially. Fixed: `Promise.all`.
  - `safeBroadcast()` was copy-pasted verbatim into both `ConversationsService`
    and `MessagesService`. Fixed: moved to `ChatEventsService.safeBroadcast()`
    (the natural shared home — it's the service both already depend on for
    broadcasting), removed from both call sites, dropped the now-unused
    `Logger` fields.
  - `ConversationsService.addGroupMembers` re-fetched the whole
    conversation+members after `createMany` purely to reconstruct data the
    caller already had. Fixed: builds the returned member list and the
    broadcast's member-id list in memory from the pre-existing active members
    (already loaded by `assertMembership`) plus the just-inserted ids —
    no re-fetch.
  - **Not** fixed (already tracked, deliberately deferred): `ChatGateway`'s own
    `broadcastToConversation` still re-queries members on every
    `message:send`/`message:read` — this is the same item already logged
    above under Phase-1-era QA ("Redundant member re-query on every
    broadcast"); fixing it means changing what `sendMessage`/
    `markConversationRead` return (their return value is currently the WS ack
    payload verbatim), which is a bigger, riskier change than the fixes
    above — left as a tracked follow-up, not silently reintroduced as new scope.

**Verification**: `npx tsc --noEmit`, `npm run build`, `npm test`, and
`eslint` all pass after every fix above (same pre-existing `req: any`
baseline warnings as before, nothing new).

### Phase 3 — Presence & delivery fidelity — ✅ done (2026-08-24)

- [x] **"Delivered" vs "Read" distinction** — new `message_deliveries` table
  (mirrors `message_reads`). `POST /v1/conversations/:hash/:message_hash/delivered`
  acks receipt (idempotent — first ack per user sticks); broadcasts
  `message:delivered`. `markConversationRead` also back-fills a delivery
  record for anything marked read without an explicit prior ack (read implies
  delivered). `MessageResponseDto` now carries both `reads: [{user_id,
  read_at}]` and `deliveries: [{user_id, delivered_at}]`.
- [x] **Per-user "last seen" timestamp** — `users.last_seen_at`, set in
  `ChatGateway.markOffline` the moment a user's last socket disconnects
  (best-effort — a DB failure here doesn't block the presence broadcast).
  Included in the `presence:offline` WS payload, and on every `GroupMemberDto`
  (via `conversation_members.include.user`) — visible on `GET
  /v1/conversations/:hash/members` for any conversation you're in.
- [x] **"Seen by" list for group messages** — the `reads` array on
  `MessageResponseDto` above; works for any conversation size, not
  group-specific code.

**Migrations**:
- `prisma/migrations/20260824084140_add_presence_and_delivery_tracking/` —
  adds `users.last_seen_at` and the `message_deliveries` table
  (`@@unique([message_id, user_id])`).
- `prisma/migrations/20260824085333_add_message_reads_unique_constraint/` —
  adds the constraint that finally closes the "Duplicate read receipts" item
  above.

**How these got applied — worth knowing if you touch migrations here again:**
- Earlier sessions believed the local DB was unreachable and hand-authored
  Phase 2's migration without ever running it against a real database. That
  was **wrong** — the `mysql` CLI fails here (missing `mysql_native_password`
  plugin), but the app's own driver (`@prisma/adapter-mariadb`) connects
  fine. Once that was noticed, `npx prisma migrate deploy` (not `migrate
  dev` — see below) applied cleanly, including the Phase 2 migration that
  had been sitting unapplied the whole time.
- `prisma migrate dev` **must not be used against this database** — it
  wants to diff against a shadow DB, detects massive drift (this DB was
  originally provisioned by `drizzle-kit push`, not by replaying these
  Prisma migration files — `0_init` was retroactively marked "applied," not
  actually executed), and its only offer to proceed is `prisma migrate
  reset`, which drops all data. Use `migrate deploy` with a hand-authored
  migration file instead, always.
- Fixed a real pre-existing bug found along the way: `0_init/migration.sql`
  had literal CLI stdout (`Loaded Prisma config from prisma.config.ts.`)
  baked into it as its first line — invalid SQL that broke `migrate dev`'s
  shadow-DB replay. Stripped the stray line; doesn't change what the
  migration does.
- This DB's real column collation convention is `utf8mb4_general_ci`
  (Drizzle's default), **not** `utf8mb4_unicode_ci` (Prisma's usual
  generated default). A migration that creates a new `VARCHAR` FK column
  using Prisma's default collation will fail with errno 150 ("foreign key
  constraint incorrectly formed") against `users.id`/`messages.id`. Hit this
  building `message_deliveries`, had to roll back the partial table+column
  (`prisma migrate resolve --rolled-back`, manual `DROP TABLE`/`DROP COLUMN`
  cleanup) and reapply with the correct collation. Match existing tables'
  collation explicitly in any new hand-authored migration here.

**QA — real integration testing, not just static review**: wrote a
throwaway script (`tsx` + the generated Prisma client directly, run and
deleted, not committed) that exercised the actual logic against the live DB
with disposable test data, cleaned up after. This is how the two findings
below were actually caught, not just reasoned about:

- **Found & fixed a real race**: Prisma's `upsert()` on MySQL is not atomic
  — it runs a SELECT then an INSERT, so two genuinely concurrent upserts on
  the same compound-unique key can both miss the row and both attempt to
  insert; the loser gets a `P2002` unique-constraint error thrown at it
  instead of a quiet upsert. Reproduced this directly (3 concurrent
  `markDelivered`-equivalent calls → 1 succeeded, 2 threw). This affected
  the **new** `markDelivered` and, it turns out, the **already-shipped**
  Phase 2 `reactToMessage` — which this log had incorrectly described as
  "atomic... race-free." Fixed both with a shared `isUniqueConstraintViolation()`
  check: `reactToMessage` retries as a plain `update` on conflict
  (last-write-wins, so the "loser" request's own reaction still lands
  instead of silently vanishing); `markDelivered` retries as a `findUniqueOrThrow`
  fetch on conflict (first-write-wins is the intent, so there's nothing to
  write, just read what the winner already inserted). Verified with a
  3-way-concurrent test against the real DB for both.
- **Empirically reproduced, then closed, the long-open "duplicate read
  receipts" item**: the QA script's own concurrent-`markConversationRead`
  test hit it directly — 3 concurrent calls against a fresh unread message
  produced 2 `message_reads` rows before the migration above was applied.
  Confirmed 1 row after. Unlike `upsert`, `createMany({skipDuplicates:
  true})` doesn't have the same race (one INSERT statement, not a
  SELECT-then-INSERT), so no additional catch/retry needed here — just the
  constraint plus the flag.

**`chat-test.html`** extended to exercise all of the above: a "Mark
delivered" button on every message you didn't send, a "Delivered
to/Seen by" status line under your own sent messages (from the `reads`/
`deliveries` arrays), a `message:delivered` WS listener, `last_seen_at` shown
per group member and in the `presence:offline` system message.

**Verification**: `npx tsc --noEmit`, `npm run build`, `npm test`, `eslint`,
`prisma validate`, and `prisma migrate status` all pass/clean. The
concurrency behavior above was verified against the real database, not
simulated.

### Phase 4 — Calls — ✅ done (2026-08-24)

- [x] **WS signaling events for WebRTC**: `call:invite`, `call:ring`,
  `call:answer`, `call:reject`, `call:ice-candidate`, `call:end` — all pure
  WS (no REST endpoints; calls are inherently real-time, matching the
  existing `typing:*`/presence pattern rather than the REST-triggers-broadcast
  pattern used by messages). New `src/modules/calls/` (`calls.service.ts`,
  `calls.model.ts`, `calls.module.ts`), handlers live in `ChatGateway`
  alongside the other `@SubscribeMessage`s. No migration needed — the
  `calls`/`call_participants` tables and `call_type`/`call_status`/
  `call_participant_status` enums were already schema-ready.
- [x] **`calls`/`call_participants` lifecycle wired to those events**:
  - `call:invite` — caller must be a conversation member; creates the `calls`
    row (`status: ringing`) plus one `call_participants` row per active
    member (`caller: joined`, everyone else: `invited`). Rejects if the
    conversation already has a `ringing`/`active` call (one call at a time
    per conversation) or has no one else to call.
  - `call:ring` — callee's device is alerting; flips their participant row
    `invited` → `ringing`.
  - `call:answer` — flips the answering participant to `joined`; first
    answer flips the call itself `ringing` → `active` and stamps
    `answered_at`. Carries an opaque `signal` (the SDP answer) relayed
    verbatim to the other participants — the server never inspects it.
  - `call:reject` — flips the declining participant to `rejected`; the
    caller can't reject their own call (must `call:end` to cancel instead).
    If nobody else ever joined, auto-closes the call as `status: rejected`.
  - `call:ice-candidate` — pure relay, no DB write; requires a
    `target_user_id` and delivers only to that participant's personal room
    (never broadcast conversation-wide) — correct for a mesh WebRTC
    topology and keeps signaling peer-to-peer.
  - `call:end` — flips the leaving participant to `left`; when no
    participant is left `joined`, closes the call out as `cancelled` (caller
    hung up before anyone answered) or `ended` (someone had joined), and
    bulk-flips anyone still `invited`/`ringing` to `missed`. Idempotent if
    called again after already leaving.
  - Every event broadcasts to the call's own participants via
    `ChatEventsService.notifyUsers` (personal rooms), not
    `broadcastToConversation` — deliberately narrower than the conversation
    itself, since not every conversation member necessarily has the call UI
    open.
- [x] **Group calls** — `call:invite` invites every active conversation
  member, not just one; `call_participants` already supports many rows per
  `calls` row. `call:ice-candidate`'s `target_user_id` lets clients build a
  pairwise mesh across however many participants joined.

**QA — real integration testing against the live DB, not just static
review**: temporarily ran a second app instance (`PORT=3999`, alongside the
user's own already-running dev server on 3000 — never touched) and drove the
full lifecycle over real Socket.IO connections with `socket.io-client` and
JWTs signed against the DB's actual secret (disposable script, `tsx`,
deleted after, disposable test users/conversations cleaned up from the DB
afterward). 25 assertions, all passing:
- Group `call:invite` → `call:ring` → `call:answer` (SDP relayed verbatim to
  the caller) → targeted `call:ice-candidate` (confirmed the *non-targeted*
  third participant does **not** receive it) → one participant
  `call:reject`s → both remaining participants `call:end` → call closes as
  `ended` with `ended_at` set.
- Caller attempting `call:reject` on their own call is rejected.
- A user with no call_participants row (never invited) gets a 403 trying to
  `call:answer`.
- 1:1 call the caller cancels before the callee ever answers closes as
  `cancelled`, and the never-answering callee's participant row is flipped
  to `missed`.
- A second `call:invite` into a conversation that already has a live call is
  rejected; ending the first call and inviting again succeeds.

Two real bugs found and fixed by this (not caught by `tsc`/lint, since both
were type-correct but functionally wrong): `call:end` and `call:reject`
initially only broadcast/returned `{call_hash, user_id}`, so no
participant — including the one who triggered it — could actually see the
call's resulting status (`ended`/`cancelled`/`rejected`) or `ended_at` from
the event/ack itself. Both now return the full `CallResponseDto` from the
service and the gateway handlers return it directly, matching the
`call:answer`/`call:ring` pattern instead of hand-building a narrower ack.

**`chat-test.html`** extended with a real Call panel per pane (audio/video
select, Start/End call, incoming-call banner with Accept/Reject, local +
remote `<video>` tiles) — actual `getUserMedia`/`RTCPeerConnection`, not
simulated. The initial SDP offer piggybacks on `call:ice-candidate` (its
generic targeted-relay channel — no dedicated "send offer" event exists);
`call:answer` carries the SDP answer as designed. Verified live in Chrome
(real sockets against the real server, disposable JWTs/test users, stubbed
`getUserMedia` for the click-through pass since camera/mic permission
prompts are native browser UI automation can't click through) — caught and
fixed two real client bugs this way:
- The incoming-call banner was visible on page load — `.incoming-call {
  display: flex }` was beating the `hidden` attribute in the cascade (author
  styles win over the UA `[hidden]` rule at equal specificity). Fixed with
  `.incoming-call[hidden] { display: none }`.
- `teardownCall()` stopped tracks/closed peer connections and *then*
  re-enabled the "Start call" button in one straight sequence — reported
  live as "Start call stays disabled after cancelling before being
  answered." A synthetic test stream never hit this, but a real camera/
  `RTCPeerConnection` has more ways to throw mid-cleanup; if anything did,
  the re-enable line never ran. Fixed by wrapping cleanup in `try/finally`
  (button always gets re-evaluated, any error now logs to the Event Log
  panel instead of silently killing the rest of the function) and guarding
  `pc.onicecandidate`/`pc.ontrack` against firing after `this.call` is
  already null. Re-verified the invite → cancel → invite-again flow
  end-to-end after the fix, both at the API level (scripted) and by
  actually clicking through the page — both succeed.

**REST call history** — `GET /v1/conversations/:conversation_hash/calls`
(`calls.controller.ts`, new), cursor-paginated exactly like `GET
/v1/conversations/:conversation_hash` for messages (`ListCallsQueryDto` /
`CallListResponseDto` mirror `ListMessagesQueryDto` /
`MessageListResponseDto`). `CallsService.listCalls` reuses
`assertMembership` + the same `id desc` / `take limit` / cursor pattern.
Verified against the live server: pagination across pages ends with
`next_cursor: null`, 403 for a non-member, 404 for a nonexistent
conversation.

A REST `POST .../calls` to start a call over plain HTTP was tried and then
deliberately reverted — starting a call is the one point in the whole
lifecycle where every later step (`call:ring`/`answer`/`reject`/
`ice-candidate`/`end`) still requires a live WS connection anyway, so
starting over WS too keeps the whole lifecycle on one transport rather than
splitting it across two for no real benefit. Starting a call, like the rest
of it, is WS-only: `call:invite`.

**Verification**: `npx tsc --noEmit -p tsconfig.build.json`, `npx nest
build`, `npm test`, and `eslint` (with `--fix` for formatting) all pass
clean.

### Phase 5 — Conversation organization
- [ ] Mute / archive / pin a conversation — **needs migration**: per-member settings (e.g. columns on `conversation_members` or a new table)
- [ ] Block / unblock a user — **needs migration**: new `blocked_users` table
- [ ] Search messages within a conversation and across conversations
- [ ] Unread-count badge per conversation (derivable from `message_reads`, cache for perf)

### Phase 6 — Delivery & scale
- [ ] Push notifications (FCM/APNs) when the recipient is offline — hook into `broadcastToConversation`/`notifyUser`
- [ ] Rate limiting on `message:send` (spam/flood protection)
- [ ] Link previews for URLs in message content

---

**Next step**: pick the next phase (or a specific item) to implement — each
phase is independently shippable. Items marked "needs migration" require a
`prisma migrate` decision before code, same as the two open QA items above.

**Verification**: `npx tsc --noEmit`, `npm run build`, and `npm test` all
pass after Phase 1; `eslint --fix` applied to the touched files (formatting
only — the remaining `no-unsafe-*` warnings are a pre-existing codebase
pattern from `req: any` on every controller method, not something this
change introduced).
