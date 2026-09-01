# Mobile Integration Guide

This is the complete, from-source reference for integrating a mobile (or
web) client against this chat microservice: every REST endpoint, every
WebSocket event, the authentication model, and the client-side architecture
patterns this API is designed to be consumed with. It's written to be
accurate against the actual code, not aspirational — anything not yet built
is explicitly called out, not silently implied.

For the day-to-day "what's done, what's open" project view, see
[`TASKS.md`](../TASKS.md). For a chronological history of changes, see
[`CHANGELOG.md`](../CHANGELOG.md). This document is neither of those — it's
a stable reference for a client engineer integrating against the API as it
exists right now. For calling specifically — presence semantics, whether
calls work across different networks, the mobile call flow, and the QA
plan — see [`CALL_INTEGRATION_FLOW.md`](./CALL_INTEGRATION_FLOW.md) and
[`QA_CALL_TEST_PLAN.md`](./QA_CALL_TEST_PLAN.md). For Flutter-specific
walkthroughs with runnable Dart — presence (online/offline) in
[`FLUTTER_INTEGRATION.md`](./FLUTTER_INTEGRATION.md), calls in
[`FLUTTER_CALL_INTEGRATION.md`](./FLUTTER_CALL_INTEGRATION.md).

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Authentication](#2-authentication)
3. [REST API reference](#3-rest-api-reference)
4. [WebSocket API reference](#4-websocket-api-reference)
5. [Client integration patterns](#5-client-integration-patterns)
6. [Error handling](#6-error-handling)
7. [End-to-end example flows](#7-end-to-end-example-flows)

---

## 1. Architecture at a glance

- **REST** (`/api/v1/...`) for everything that's a mutation-with-a-response
  or a paginated list: auth, profile, conversations, messages, blocks,
  calls history, attachment uploads.
- **WebSocket** (`/chat` namespace, Socket.IO) for everything real-time:
  message delivery, typing, presence, and the WebRTC signaling for calls.
  Most mutations are also reachable over WS (`message:send`,
  `message:read`) as a convenience for a client that's already connected —
  but **every REST mutation broadcasts to WS too**, so a client never needs
  to poll after doing something over REST. There is no case where you must
  use WS to see a REST-triggered change.
- **Two Socket.IO rooms per connected user**: a personal room (`user:<id>`,
  joined automatically on connect) and zero-or-more conversation rooms
  (`conversation:<hash>`, joined explicitly, only while that conversation is
  open). Every conversation-scoped broadcast goes to *both* the
  conversation's room *and* every member's personal room — so a member who
  hasn't opened that specific conversation still hears about it. This is
  the mechanism your chat-list screen relies on; see
  [§5](#5-client-integration-patterns).
- **Identity**: this service doesn't own user identity. `user_id` is
  whatever id the integrating app already uses for that person — this
  service just needs a stable string.
- **Multi-tenant**: each integrating app is an OAuth client (`client_id`/
  `client_secret`), issued to you outside this codebase. All requests are
  scoped to your client's own users.

---

## 2. Authentication

### 2.1 Get a user access token (REST)

```
POST /api/v1/auth/login
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/json

{ "user_id": "customer_1" }     // omit to create a new anonymous user
```

**Response** `201`
```json
{ "access_token": "<JWT>" }
```

- If `user_id` already exists under your client, you get a token for the
  existing user.
- If it exists under a **different** client, you get `409 Conflict`.
- If omitted, a new anonymous user is created with a generated id (you
  won't know it from this response alone — call `GET /v1/profile/me`
  afterward if you need it).
- The token expires after your client's configured session duration. There
  is currently **no refresh-token endpoint** — when a token expires,
  call `/auth/login` again with the same `user_id`.

Use this same `access_token` for both REST (`Authorization: Bearer <token>`)
and the WebSocket connection.

### 2.2 WebSocket authentication

Connect to the `/chat` Socket.IO namespace with the token in **one** of two
places:

```js
// Browsers: use `auth` — browsers can't set custom headers on a WS handshake
io('https://your-host/chat', { auth: { token: accessToken } });

// Native/Node clients: an Authorization header also works
io('https://your-host/chat', {
  extraHeaders: { Authorization: `Bearer ${accessToken}` },
});
```

Any other way of passing the token (query string, etc.) is **not**
supported — those paths were deliberately removed (query strings leak into
proxy/server access logs).

**Auth failure behavior is deliberate**: the socket is allowed to *connect*
at the transport level, then the server validates the token asynchronously.
If it's missing or invalid, you get an `exception` event with a reason,
then the socket is disconnected:

```js
socket.on('exception', (err) => {
  console.log(err.message); // "Unauthorize access is not allowed||..."
});
socket.on('disconnect', (reason) => { /* handle */ });
```

Don't assume `connect` means "authenticated" — wait for either your first
successful ack, or handle `exception`/`disconnect` as the failure signal.

---

## 3. REST API reference

Base path for everything below: `/api/v1`. Every endpoint requires
`Authorization: Bearer <access_token>` unless stated otherwise. Request
bodies are JSON. Error responses follow the shape in [§6](#6-error-handling).

### 3.1 Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/profile/me` | Your own profile: `{ id, created_at, updated_at }`. |

### 3.2 Conversations

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/conversations` | List your conversations (the "chat list"). |
| `POST` | `/v1/conversations/direct` | Start (or resume) a 1:1 conversation. |
| `POST` | `/v1/conversations/group` | Create a group conversation. |
| `PATCH` | `/v1/conversations/:hash` | Update group name/description/avatar. |
| `PATCH` | `/v1/conversations/:hash/settings` | Mute/archive/pin *this conversation* for yourself. |
| `GET` | `/v1/conversations/:hash/members` | List members (works for direct conversations too). |
| `POST` | `/v1/conversations/:hash/members` | Add members to a group. |
| `DELETE` | `/v1/conversations/:hash/members/:user_id` | Remove a member, or leave (pass your own id). |
| `PATCH` | `/v1/conversations/:hash/members/:user_id` | Promote/demote a member's role. |

#### `GET /v1/conversations`

Query: `cursor?` (number, older-than-this-id pagination), `take?` (default
30, max 100), `archived?` (`true`/`false`, default `false`).

```json
{
  "data": [
    {
      "id": 42,
      "hash": "bDzwj1MhgotgRqAM",
      "type": "direct",
      "created_at": "...", "updated_at": "...",
      "sender_id": "other_user_id",
      "last_message": { /* MessageResponseDto, see §3.3, or null */ },
      "is_muted": false,
      "is_archived": false,
      "is_pinned": false,
      "unread_count": 3
    }
  ],
  "next_cursor": 41,
  "total_unread_conversations": 2
}
```

- `sender_id` is only populated for `direct` conversations (the other
  participant's id).
- `total_unread_conversations` is the app-icon-badge number: how many
  **non-archived** conversations have ≥1 unread message — not a raw
  message tally.
- Pinned conversations sort first; this ordering is exact on page 1, not
  guaranteed exact past page 1 if you've pinned more conversations than one
  page holds (an edge case, not expected in normal use).

#### `POST /v1/conversations/direct`

```json
{ "user_id": "other_user_id", "message": "Hi 👋" }
```

Always sends an opening message in the same call — there's no
"create empty conversation" mode. Calling this again for the same pair
returns the **same** conversation (race-safe under concurrency) and just
sends another message into it.

**Response** `201` — `ConversationResponseDto`:
```json
{
  "id": 42, "hash": "bDzwj1MhgotgRqAM", "type": "direct",
  "sender_id": "other_user_id",
  "message": { /* MessageResponseDto */ },
  "created_at": "...", "updated_at": "..."
}
```

`403` if either user has blocked the other (see [§3.4](#34-blocks)).

#### `POST /v1/conversations/group`

```json
{
  "name": "Team chat",
  "description": "optional",
  "avatar_url": "optional",
  "member_user_ids": ["u1", "u2"]
}
```
You become `owner` automatically; `member_user_ids` join as `member`.

**Response** `201` — `GroupConversationResponseDto` (see members shape in
§3.2 members table below).

#### `PATCH /v1/conversations/:hash`

Owner/admin only. Body: any of `name`, `description`, `avatar_url`
(all optional — only given fields change).

#### `PATCH /v1/conversations/:hash/settings`

Any member, self-only (you can't set these for someone else). Body: any of
`is_muted`, `is_archived`, `is_pinned` (all optional booleans).

**Response** `200` — `ConversationSettingsDto`:
```json
{
  "conversation_hash": "bDzwj1MhgotgRqAM",
  "is_muted": true, "is_archived": false, "is_pinned": false,
  "pinned_at": null
}
```

#### `GET /v1/conversations/:hash/members`

**Response** `200`:
```json
{
  "data": [
    {
      "user_id": "u1", "role": "owner", "nickname": null,
      "joined_at": "...", "last_seen_at": "2026-08-25T09:00:00.000Z"
    }
  ]
}
```
`role` is `null` for direct conversations (roles are a group concept).
`last_seen_at` is `null` if never tracked or currently online.

#### `POST /v1/conversations/:hash/members`

Owner/admin only. `{ "member_user_ids": ["u3", "u4"] }`. Returns the full
current member list (`200`).

#### `DELETE /v1/conversations/:hash/members/:user_id`

`204`. Owner/admin only for removing *someone else*; anyone can pass their
**own** `user_id` to leave. The owner can't be removed this way.

**Owner leaving a group**: the longest-tenured admin is promoted, else the
longest-tenured plain member, else the group is left with no owner (only
possible if it's now empty).

#### `PATCH /v1/conversations/:hash/members/:user_id`

Owner only. `{ "role": "admin" }` (`owner`/`admin`/`member`). You can't
change your own role this way.

### 3.3 Messages

All under `/v1/conversations/:conversation_hash/...`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/:hash` | List messages (or sync missed ones — see below). |
| `POST` | `/:hash` | Send a message. |
| `PATCH` | `/:hash/:message_hash` | Edit your own message. |
| `DELETE` | `/:hash/:message_hash` | Delete (unsend) your own message. |
| `POST` | `/:hash/:message_hash/forward` | Forward into another conversation you belong to. |
| `POST` | `/:hash/:message_hash/delivered` | Ack delivery (idempotent). |
| `POST` / `DELETE` | `/:hash/:message_hash/reactions` | React / remove your reaction. |
| `POST` / `DELETE` | `/:hash/:message_hash/pin` | Pin / unpin a message. |
| `GET` | `/:hash/pinned` | List pinned messages. |
| `GET` | `/:hash/search?q=` | Search within this conversation. |
| `GET` | `/search/messages?q=` | Search across every conversation you're in. |

#### The `MessageResponseDto` shape (returned everywhere a message is returned)

```json
{
  "id": 501, "hash": "XEavOenyQeIvtPdx",
  "conversation_id": 42, "sender_id": "u1",
  "type": "text", "content": "hello",
  "replied_message_id": null, "replied_message": null,
  "edited_at": null, "deleted_at": null,
  "is_pinned": false, "pinned_at": null, "pinned_by": null,
  "attachments": [{ "id": 1, "file_url": "...", "file_type": "image" }],
  "reactions": [{ "user_id": "u2", "reaction": "👍", "created_at": "..." }],
  "reads": [{ "user_id": "u2", "read_at": "..." }],
  "deliveries": [{ "user_id": "u2", "delivered_at": "..." }]
}
```
A deleted message has `content: null`, `attachments: []`, `deleted_at` set
— render a placeholder ("Message deleted") rather than blank content.

#### `GET /v1/conversations/:hash` — list, or sync missed messages

This one endpoint has **two mutually exclusive modes**, chosen by which
query params you pass:

**Normal mode** (no `since_id`) — load-the-conversation, newest-first,
backward pagination:
```
GET /v1/conversations/:hash?cursor=500&limit=30
```
```json
{ "data": [ /* MessageResponseDto[], id 499 down to ~470 */ ], "next_cursor": 470 }
```
Pass `next_cursor` back as `cursor` for the next (older) page. `null` means
you've reached the start of the conversation.

**Sync mode** (`since_id` given) — reconnect-catch-up, oldest-first:
```
GET /v1/conversations/:hash?since_id=487&limit=30
```
Returns everything with `id > 487`, ascending (chronological replay order —
"everything I missed"). If the result is a full page, `next_cursor` is the
last id in it — pass that back as `since_id` to keep paging forward through
a larger backlog. `next_cursor: null` means you're fully caught up. See
[§5.7](#57-reconnect-sync) for the full pattern.

`since_id` wins if you somehow pass both.

#### `POST /v1/conversations/:hash`

```json
{
  "content": "hello",
  "type": "text",
  "replied_message_hash": "optional, must be in the same conversation",
  "attachments": [{ "file_url": "...", "file_type": "image" }]
}
```
`type` defaults to `text`. Attachments are metadata-only — upload the file
first via [§3.6](#36-attachments), then pass the returned `file_url`/
`file_type` here.

`403` if you're not a member, or (direct conversations) if either party has
blocked the other.

#### `PATCH` / `DELETE /v1/conversations/:hash/:message_hash`

Sender only. Delete is `204`, idempotent (deleting an already-deleted
message is a no-op, not an error).

#### `POST /v1/conversations/:hash/:message_hash/forward`

```json
{ "target_conversation_hash": "..." }
```
You must be a member of both. Copies content + attachments into a new
message in the target.

#### `POST /v1/conversations/:hash/:message_hash/delivered`

No body. Idempotent — first ack per user sticks; calling again just
returns the existing state. `200/201`:
```json
{ "user_id": "u2", "delivered_at": "..." }
```

#### Reactions

```
POST /v1/conversations/:hash/:message_hash/reactions
{ "reaction": "👍" }
```
One reaction per user per message — reacting again **replaces** yours, it
doesn't stack. `DELETE` (no body) removes yours; `204`, idempotent.

#### Pin/unpin a message

```
POST /v1/conversations/:hash/:message_hash/pin     (no body)
DELETE /v1/conversations/:hash/:message_hash/pin
```
Any active member can pin/unpin — not sender/admin-restricted. Re-pinning
an already-pinned message just updates who pinned it last (not an error).
Unpinning an already-unpinned one is a silent no-op (`204`). Pinning a
deleted message is `400`.

`GET /v1/conversations/:hash/pinned` — most-recently-pinned first, capped
at 100, no pagination (pinned messages are meant to be a small highlights
set, not a full list you'd page through).

#### Search

```
GET /v1/conversations/:hash/search?q=budget&cursor=&limit=
GET /v1/conversations/search/messages?q=budget&cursor=&limit=
```
Plain substring match on `content`, excludes deleted messages, same
cursor-pagination shape as normal listing (always newest-first — search has
no `since_id` sync mode).

### 3.4 Blocks

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/users/blocked` | List users you've blocked. |
| `POST` | `/v1/users/:user_id/block` | Block a user. |
| `DELETE` | `/v1/users/:user_id/block` | Unblock. |

`POST` is `201` (matches this API's convention for action-endpoints, not a
literal "resource fetch"):
```json
{ "user_id": "other_user_id", "created_at": "..." }
```

**What blocking actually does**: gates **direct** messaging only — starting
a direct conversation and sending into an existing one both `403` while
either party has blocked the other. A **shared group** is unaffected
(blocking someone doesn't remove you from mutual groups, matching how
Messenger behaves). Only the blocker is notified over WS
(`user:blocked`) — the blocked party is never told, silently.

### 3.5 Calls

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/calls/conversations/:hash` | Call history for one conversation, newest first. |
| `GET` | `/v1/calls/active` | This user's ringing/active calls across **every** conversation. |
| `GET` | `/v1/calls/turn-credentials` | Short-lived STUN/TURN `iceServers` config for your `RTCPeerConnection`. |

Starting/answering/ending a call itself is **WS-only** — see
[§4.4](#44-call-signaling-events). These REST endpoints are read-only.

```json
{
  "data": [{
    "id": 1, "hash": "...", "conversation_id": 42, "caller_id": "u1",
    "type": "video", "status": "ended",
    "started_at": "...", "answered_at": "...", "ended_at": "...",
    "participants": [
      { "user_id": "u1", "status": "left", "joined_at": "...", "left_at": "..." }
    ]
  }],
  "next_cursor": null
}
```

`/v1/calls/active` returns the same shape (`next_cursor` is always `null` —
there's realistically never more than a handful of concurrent calls for one
user, so it isn't paginated). It exists specifically for **hydrating your
global call state** — see [§5.9](#59-global-call-handling) — for the cases
where a `call:invite`/`call:answer`/etc. socket push may have been missed
entirely because no socket was open yet (app cold start, was backgrounded,
was terminated, or a reconnect gap). It's scoped to the caller: you only
ever see calls you're a live participant in, never anyone else's.

#### `GET /v1/calls/turn-credentials`

Short-lived STUN/TURN credentials to configure your `RTCPeerConnection`'s
`iceServers` with — this is what makes calling across different networks
(NAT, symmetric NAT, restrictive firewalls) actually work; see
[`CALL_INTEGRATION_FLOW.md`](./CALL_INTEGRATION_FLOW.md) §2 for the full
explanation of why STUN alone isn't always enough.

**Response** `200`:
```json
{
  "iceServers": [
    { "urls": "stun:turn.example.com:3478" },
    {
      "urls": "turn:turn.example.com:3478",
      "username": "1735689600:customer_1",
      "credential": "base64-hmac..."
    }
  ]
}
```
Pass the whole `iceServers` array straight into
`new RTCPeerConnection({ iceServers })`. `stun:` entries carry no
credentials; `turn:`/`turns:` entries carry a `username`/`credential` pair
valid only until the expiry embedded in `username` (an hour by default) —
fetch a fresh set again before starting a new call rather than caching one
indefinitely. `500` if this deployment has no TURN server configured
(`InternalServerErrorException` — a deployment/ops gap, not something your
client can recover from; fall back to STUN-only or surface a clear error).

### 3.6 Attachments

```
POST /v1/attachments/upload
Content-Type: multipart/form-data
field: file
```
Max 25MB. `attachment_type` is auto-detected from the file's mimetype.

**Response** `201`:
```json
{ "file_url": "https://...", "file_type": "image" }
```
Drop straight into a message's `attachments` array. This is metadata-only
storage — there's no separate "confirm attachment" step.

---

## 4. WebSocket API reference

**Connect to**: `<host>/chat` (Socket.IO namespace). See
[§2.2](#22-websocket-authentication) for auth.

**Every client→server event acknowledges** with:
```ts
{ success: boolean, data?: T, message?: string }
```
via Socket.IO's ack callback — `socket.emit(event, payload, (ack) => {...})`
or `await socket.emitWithAck(event, payload)`. A failed action **never**
throws or drops the connection; you always get `{ success: false, message }`
back. See [§6](#6-error-handling).

### 4.1 Rooms — the model your client needs to understand

- **Personal room** (`user:<your_id>`): joined automatically the moment
  your socket authenticates. Every event relevant to you as a person —
  regardless of which conversation screen you have open, if any — reaches
  this room.
- **Conversation room** (`conversation:<hash>`): **not** automatic. Join
  with `conversation:join` when the user opens that conversation's screen;
  leave with `conversation:leave` when they close it. This only affects
  whether *typing indicators* reach you (typing is room-only, deliberately
  — see below) — every other conversation event already reaches you via
  your personal room whether you've joined the room or not.

This split is why your chat-list screen doesn't need to join every
conversation's room to stay live — see [§5](#5-client-integration-patterns).

### 4.2 Core messaging events

| Event | Direction | Payload (client→server) | Ack `data` / broadcast payload |
|---|---|---|---|
| `conversation:join` | C→S | `{ conversation_hash }` | `{ conversation_hash }` |
| `conversation:leave` | C→S | `{ conversation_hash }` | `{ conversation_hash }` |
| `message:send` | C→S | `{ conversation_hash, body, type?, replied_message_hash?, attachments? }` | Full `MessageResponseDto` |
| `message:new` | S→C only | — | Full `MessageResponseDto` |
| `message:read` | C→S | `{ conversation_hash }` | `{ conversation_hash, read_count, last_read_message_id, user_id, read_at }` |
| `message:delivered` | S→C only | — | `{ conversation_hash, message_hash, user_id, delivered_at }` |
| `message:edited` | S→C only | — | Full `MessageResponseDto` |
| `message:deleted` | S→C only | — | `{ conversation_hash, message_hash }` |
| `message:pinned` | S→C only | — | Full `MessageResponseDto` |
| `message:unpinned` | S→C only | — | `{ conversation_hash, message_hash, user_id }` |
| `reaction:added` | S→C only | — | `{ conversation_hash, message_hash, user_id, reaction }` |
| `reaction:removed` | S→C only | — | `{ conversation_hash, message_hash, user_id }` |
| `typing:start` | C→S, relayed | `{ conversation_hash }` | `{ conversation_hash, user_id }` |
| `typing:stop` | C→S, relayed | `{ conversation_hash }` | `{ conversation_hash, user_id }` |
| `list_messages` | C→S | `{ conversation_hash, cursor?, since_id?, limit? }` | Same shape as `GET /v1/conversations/:hash` — see §3.3 |

**Important asymmetries, not bugs**:
- `message:new`/`edited`/`deleted`/`delivered`/`pinned`/`unpinned`/
  reactions are **broadcast-only** — you don't emit them, you only listen.
  They fire from *both* the REST and WS mutation paths (send a message over
  REST, everyone still gets `message:new` over WS).
- `typing:start`/`typing:stop` are **room-scoped only** — they do *not*
  reach your personal room, unlike everything else. If you haven't called
  `conversation:join` for that conversation, you won't see typing for it.
  This is deliberate: you shouldn't render "so-and-so is typing" on your
  chat-list screen.
- A client that disconnects abruptly while mid-`typing:start` gets an
  automatic `typing:stop` emitted on its behalf, so peers never see a
  permanently-stuck "typing…" indicator.

### 4.3 Presence

| Event | Direction | Payload |
|---|---|---|
| `presence:list` | S→C only | `{ user_id, online, last_seen_at }[]` |
| `presence:online` | S→C only | `{ user_id }` |
| `presence:offline` | S→C only | `{ user_id, last_seen_at }` |

Sent to everyone you share at least one active conversation with (your
"contacts"), not globally broadcast. **Ref-counted across a user's own
multiple connections** — presence only flips online on the *first* socket
connecting and offline on the *last* one disconnecting, so a user with two
tabs/devices open doesn't flicker offline when they close one.

`presence:online`/`presence:offline` are edge-triggered — you only get one
when a contact's status *changes* while your socket is connected. That's not
enough to render initial online/offline state for your conversation list: if
a contact was already online before you connected, you'd never otherwise
find out. `presence:list` closes that gap — it's a one-shot snapshot pushed
to your socket right after it authenticates (not requested, no ack needed),
covering every current contact's status at that instant. Seed your local
presence map from it on `connect`, then keep it live with
`presence:online`/`presence:offline` for the rest of the connection —
including across reconnects, since a fresh `presence:list` arrives on every
successful (re)connection, same as [§5.7](#57-reconnect-sync).

### 4.4 Call signaling events

All WS-only — there is no REST way to start/join/end a call (see
[§3.5](#35-calls) for history-only REST). One call at a time per
conversation; no participant-count limit (see the mesh note below before
you rely on that for large calls).

| Event | Direction | Payload (client→server) | Broadcast payload |
|---|---|---|---|
| `call:invite` | C→S | `{ conversation_hash, type: 'audio'\|'video', participant_user_ids?: string[] }` | Full `CallResponseDto` (see §3.5) |
| `call:ring` | C→S | `{ call_hash }` | `{ call_hash, user_id }`; ack returns full `CallResponseDto` |
| `call:answer` | C→S | `{ call_hash, target_user_id, signal }` (SDP answer, opaque) | **Targeted**: `{ call_hash, user_id, signal }`, delivered only to `target_user_id`'s personal room. Also fires `call:participant-joined` (below) to everyone on the call. Ack returns full `CallResponseDto` |
| `call:participant-joined` | S→C only | — | `{ call_hash, user_id, status }` — broadcast to every participant when `user_id` answers; carries no SDP |
| `call:reject` | C→S | `{ call_hash }` | `{ call_hash, user_id, status }`; ack returns full `CallResponseDto` |
| `call:ice-candidate` | C→S | `{ call_hash, target_user_id, signal }` | Relayed verbatim to `target_user_id`'s personal room only — never conversation-wide |
| `call:end` | C→S | `{ call_hash }` | `{ call_hash, user_id, status, ended_at }`; ack returns full `CallResponseDto` |

- `call:invite` rings **every** active conversation member by default; pass
  `participant_user_ids` to ring a chosen subset instead. Ids that aren't
  actual, still-present members of the conversation are silently dropped,
  not errored — never trust `participant_user_ids` as anything more than a
  hint of who to ring.
- `signal` is completely opaque to the server — it's your WebRTC SDP/ICE
  payload, relayed verbatim. The server never inspects it.
- There's no dedicated "send initial offer" event — piggyback your SDP
  offer on `call:ice-candidate`'s generic targeted-relay channel.
- **`call:answer` is targeted, not broadcast — `target_user_id` is
  required.** Pass whichever participant's offer you're answering. This
  only matters once a call has 3+ participants: broadcasting the SDP
  answer to everyone (the old behavior) would let a bystander try to apply
  an answer meant for someone else's peer connection.
  `call:participant-joined` is the separate, safe-to-broadcast event for
  "someone joined" — status only, no SDP.
- The caller can't `call:reject` their own call — use `call:end` to cancel
  before anyone answers.
- **`call:end` means something different depending on who sends it.** The
  call's **owner** ending it ends it for **everyone**, even mid a group
  call with others still on it. Anyone **else** ending it just **leaves** —
  the call keeps going for the rest as long as ≥2 participants are still
  `joined`, and only closes out for everyone once it drops below that.
  Don't assume every `call:end` you receive means the call is over: check
  `status` in the payload — if it's still `ringing`/`active`, only
  `user_id` left, so tear down just their peer connection, not your whole
  call state.
- Broadcasts go to the call's own participants' **personal rooms**
  (`notifyUsers`), not the conversation room — not every conversation
  member necessarily has the call UI open.

#### Group calls are mesh WebRTC, not an SFU

There's no media server — every participant holds one `RTCPeerConnection`
per *other* participant. That's fine for a handful of people; it does not
scale to large calls (each client uploads N-1 streams), and there's
deliberately no server-side cap stopping you from trying anyway — the real
ceiling is your users' upload bandwidth and device CPU, not something a
request parameter can fix. Revisit this (an SFU like mediasoup/LiveKit) if
group calls become a heavily used, larger-than-a-handful feature.

To form the mesh without two participants ever offering each other at the
same time:
- The **caller** offers to every invitee up front, at `call:invite` time,
  before anyone has answered.
- **Whoever answers/joins** additionally offers to every *other*
  participant who is already `joined` at that moment — not the caller
  again, who already offered to them. Read that list fresh off the
  `call:ring`/`call:answer` ack's `participants` array; the original
  `call:invite` payload can be stale by the time you actually join.
- Everyone else only ever answers incoming offers — nobody initiates
  toward a newcomer.

### 4.5 Group & organization events

| Event | Trigger | Payload |
|---|---|---|
| `conversation_started` | Someone starts a direct conversation with you | Full `ConversationResponseDto` |
| `group:created` | You're added to a new group | Full `GroupConversationResponseDto` |
| `group:updated` | Group name/description/avatar changed | Full `GroupConversationResponseDto` |
| `member:added` | Members added to a group you're in | `{ conversation_hash, added_by, member_user_ids }` |
| `member:removed` | A member left/was removed | `{ conversation_hash, user_id, removed_by }` |
| `member:role_updated` | A role changed (incl. auto-promotion on owner departure) | `{ conversation_hash, user_id, role }` |
| `conversation:settings_updated` | **Your own other devices only** — you muted/archived/pinned a conversation | Full `ConversationSettingsDto` |
| `user:blocked` | **You** blocked someone (your other devices only — the blocked user is never told) | `{ user_id, created_at }` |
| `user:unblocked` | Same, for unblocking | `{ user_id }` |

`conversation:settings_updated`/`user:blocked`/`user:unblocked` are the
three events that go **only** to your own personal room (multi-device
sync), never broadcast to anyone else — worth knowing so you don't wire up
a listener expecting other members to see them.

---

## 5. Client integration patterns

This is the architecture this API is designed to be integrated with. All of
it is already supported server-side today (verified against the live code,
not assumed) — this section is "how to build your client against it," not
a list of pending server work.

### 5.1 Keep one socket alive globally

Open the Socket.IO connection once, at app start (after login), and keep it
alive for the app's lifetime — not per-screen. There's no server-side
assumption that a socket lives only as long as one screen; presence,
personal-room delivery, and conversation membership are all
connection-lifetime concepts, not screen-lifetime ones.

### 5.2 Chat list = personal room, no per-conversation joins needed

Your chat-list screen doesn't need to call `conversation:join` for
anything. `message:new`, `message:read`, `group:created`, etc. all reach
your personal room automatically (see [§4.1](#41-rooms--the-model-your-client-needs-to-understand)).
Listen globally, update whichever conversation in your local list matches
the incoming `conversation_id`/`conversation_hash`.

### 5.3 Join a conversation room only while its screen is open

```js
// on screen open
socket.emit('conversation:join', { conversation_hash });
// on screen close
socket.emit('conversation:leave', { conversation_hash });
```
This is what gates typing indicators (see [§4.2](#42-core-messaging-events)).
Joining/leaving conversation rooms you're not currently viewing wastes
memory server-side for no benefit — you already get every other event via
your personal room regardless.

### 5.4 Deduplicating `message:new`

Socket.IO delivers an event to a given socket **once**, even if that socket
matches multiple target rooms of a single broadcast (the conversation room
*and* your personal room, in this case) — there's no server-side
double-send to protect against.

The dedup case that *is* yours to handle: an **optimistic send**. If you
render a message locally the instant the user hits send, then also receive
it back via `message:new`, reconcile by `hash` — the REST response's `hash`
and the WS broadcast's `hash` for that exact message are always identical.
```js
function onMessageNew(msg) {
  if (localMessages.has(msg.hash)) {
    localMessages.get(msg.hash).status = 'confirmed'; // replace optimistic entry
  } else {
    localMessages.set(msg.hash, msg); // came from another device/member
  }
}
```

### 5.5 Updating chat-list state from `message:new`

The broadcast payload is a full `MessageResponseDto` — `conversation_id`,
`content`, `sender_id`, `created_at`, everything you need to update a
conversation's preview/last-message and re-sort your list, with no
follow-up fetch required.

### 5.6 Unread count

`GET /v1/conversations` gives you `unread_count` per conversation and
`total_unread_conversations` (the app badge number) any time you load or
refresh the list. There's no incremental WS push of the count itself —
increment your local count by 1 when `message:new` arrives for a
conversation you're not currently viewing, and clear it locally the moment
you call `message:read` for a conversation you open. Reconcile against the
server value on your next full list fetch (e.g. app foreground) rather than
trusting purely local math indefinitely.

### 5.7 Reconnect sync

On every successful (re)connection — including the very first one and
every automatic Socket.IO reconnect after a network drop — for each
conversation you have cached locally, ask what you missed:

```js
socket.on('connect', async () => {
  for (const conv of yourLocalConversationList) {
    let sinceId = conv.lastKnownMessageId;
    let more = true;
    while (more) {
      const ack = await socket.emitWithAck('list_messages', {
        conversation_hash: conv.hash,
        since_id: sinceId,
        limit: 100,
      });
      if (!ack.success) break;
      applyMessagesInOrder(ack.data.data); // ascending — apply as-is
      more = ack.data.next_cursor !== null;
      sinceId = ack.data.next_cursor;
    }
  }
});
```

This is exactly what [§3.3's sync mode](#get-v1conversationshash--list-or-sync-missed-messages)
is for. Don't use the normal (`cursor`, newest-first) mode for this — it's
built for "scroll up to load older history," not "catch up on what's new."

### 5.8 Multiple devices

Nothing special to opt into — connect a socket per device the same way,
each authenticates independently. You'll see: both devices receive
personal-room broadcasts identically; presence only flips offline once
*every* device has disconnected (ref-counted); each device can
independently join/leave conversation rooms based on what's open on that
specific device.

### 5.9 Global call handling

An incoming call has to interrupt the user regardless of what screen
they're on — Home, chat list, a chat detail, settings, anywhere. Build this
as one global subsystem, not per-screen logic. Everything below is verified
against the live server, not aspirational.

**Global socket listener.** Call events (`call:invite`, `call:ring`,
`call:answer`, `call:reject`, `call:end`, `call:ice-candidate`) are
delivered to your **personal room** (`notifyUsers`, [§4.4](#44-call-signaling-events)),
exactly like `message:new` and everything else in [§5.2](#52-chat-list--personal-room-no-per-conversation-joins-needed).
They do **not** require `conversation:join` — attach the call listeners
once, at the same place and same time you open the one global socket from
[§5.1](#51-keep-one-socket-alive-globally), not inside any particular
screen's mount/unmount. A screen that never calls `conversation:join` still
gets the incoming call.

**Global CallManager + global call state.** Keep one piece of state for
"the call in progress" (if any), keyed by `call_hash`, owned outside any
screen's lifecycle — a singleton/store/context, not component state. Every
screen reads from it; only the global listener writes to it. This is what
lets the incoming-call UI render on top of whatever screen is currently
mounted, and what lets a chat-detail screen for the *same* conversation
show "call in progress" inline instead of a second competing overlay.

**Hydrating that state.** The socket push is the fast path but not the only
path — a cold start, a backgrounded app whose socket was suspended, or a
reconnect gap can all mean the push never arrived. On every app start and
every foreground transition, call `GET /v1/call/active`
([§3.5](#35-calls)) and reconcile it into the same CallManager state the
socket listener writes to. Both paths funnel into one state, so your UI
code doesn't need to know which one populated it.

**Incoming call UI.** Render it off the CallManager state, as a
global overlay/modal mounted at the app root (above your navigator), not
inside any one screen. It should be capable of appearing regardless of the
currently active route.

**Duplicate protection.** The server already guarantees only one
ringing/active call per conversation — a second `call:invite` while one is
in progress is rejected outright ([§4.4](#44-call-signaling-events), "one
call at a time per conversation"). It's also safe to re-emit `call:ring` /
`call:answer` / `call:end` for a call you're already in — they're
idempotent, so a retried action (e.g. a client reconnect resending the last
in-flight ack) doesn't corrupt call state. Your CallManager should still
key its own state by `call_hash` so a duplicate/replayed socket event is a
no-op update rather than a second overlay.

**Navigation.** The global overlay is the entry point regardless of where
the user is; tapping "answer" should navigate into the call/chat screen
*from* wherever they currently are, not assume a particular screen stack.
Don't gate call handling behind "is the chat detail screen for this
conversation currently open" — per the above, it explicitly isn't required
to be.

**Group calls.** Everything above is unchanged — one call per conversation,
one CallManager, personal-room delivery. The only difference is UI and peer
management: a call can have more than 2 participants (see
[§4.4](#44-call-signaling-events) for the mesh connection rule), so render
remote video as a dynamic list keyed by `user_id`, not a fixed local/remote
pair, and keep one `RTCPeerConnection` per other participant. Watch for
`call:participant-joined` (someone joined — no media to apply, just update
state/UI) separately from `call:answer` (the actual SDP you apply to one
specific peer connection), and remember a `call:end` with `status` still
`ringing`/`active` means only that one participant left — drop their tile
and peer connection, not the whole call.

**Multi-device state.** Falls out of [§5.8](#58-multiple-devices) for free:
every device with a live socket gets the same personal-room events, and
`GET /v1/call/active` returns identical data no matter which device asks.
If a call is answered from one device, the others learn via the normal
`call:answer` broadcast (or by re-hydrating from `/v1/call/active`) and
should dismiss their own incoming-call UI rather than let the user answer
twice.

---

## 6. Error handling

### REST

Standard HTTP status codes. Error bodies from validation/business-rule
failures:
```json
{
  "statusCode": 403,
  "message": "You are not a member of this conversation!||អ្នកមិនមែនជាសមាជិកនៃការសន្ទនានេះទេ!",
  "error": "Forbidden"
}
```

**`message` is bilingual, English and Khmer, separated by `||`** —
`message.split('||')` to get either half. This is consistent across every
error in the API. Common codes you'll see: `400` (bad input/business rule,
e.g. "can't message yourself"), `403` (not a member / blocked), `404`
(conversation/message/user not found), `409` (login: `user_id` belongs to a
different client).

### WebSocket

Every event acks `{ success: false, message: "..." }` on failure — same
bilingual `||` format as REST. **The socket itself never disconnects or
throws because of a bad event** — a malformed payload, a 403-equivalent, a
not-found, all just come back as a failed ack; the connection stays fully
usable for the next event. Unexpected server errors (not a validation or
known business-rule failure) are logged server-side and returned to the
client as a generic `"Something went wrong!"` — internals are never leaked
into the ack message.

---

## 7. End-to-end example flows

### 7.1 Login → connect → open chat list

```js
const { access_token } = await fetch(`${API}/v1/auth/login`, {
  method: 'POST',
  headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: myUserId }),
}).then((r) => r.json());

const socket = io(`${WS_HOST}/chat`, { auth: { token: access_token } });
socket.on('connect', syncMissedMessages);       // §5.7
socket.on('message:new', updateChatListAndUnread); // §5.5, §5.6

const { data, total_unread_conversations } = await fetch(`${API}/v1/conversations`, {
  headers: { Authorization: `Bearer ${access_token}` },
}).then((r) => r.json());
renderChatList(data);
renderBadge(total_unread_conversations);
```

### 7.2 Open a conversation

```js
socket.emit('conversation:join', { conversation_hash });
const { data: { data: history } } = await socket.emitWithAck('list_messages', { conversation_hash, limit: 30 });
renderMessages(history.reverse()); // newest-first from the server, oldest-first for a typical message list UI
await fetch(`${API}/v1/conversations/${conversation_hash}`, { method: /* no REST mark-read endpoint — use WS */ });
socket.emit('message:read', { conversation_hash }); // clears unread for this conversation
```
*(Note: marking read is WS-only today — there's no REST equivalent.)*

### 7.3 Send a message with optimistic UI

```js
const tempId = crypto.randomUUID();
renderOptimisticMessage({ tempId, content: text, status: 'sending' });

const ack = await socket.emitWithAck('message:send', { conversation_hash, body: text });
if (ack.success) {
  reconcileOptimisticMessage(tempId, ack.data); // by hash — see §5.4
} else {
  markOptimisticMessageFailed(tempId, ack.message);
}
```

### 7.4 Leaving the conversation screen

```js
socket.emit('conversation:leave', { conversation_hash });
```

---

*Generated against the codebase as of 2026-08-27 — cross-check against the
live Swagger docs at `/swagger` for anything REST-shaped if this drifts;
this file isn't auto-generated and can go stale if the API changes without
a doc update.*
