# QA Test Plan — Call Feature

Full QA plan for voice/video calling: 1-to-1, group, signaling,
notifications, WebRTC connectivity, STUN/TURN, TURN credentials, FCM,
reconnection, join/leave, ending, history, background/foreground, poor
network, and multiple devices — covering both the backend (this repo) and
the mobile (Flutter) client's share of the work.

**How to read this document.** Every test case carries a status tag:

- ✅ **Verified against source** — traced end-to-end through the actual
  running code (`ChatGateway`, `CallsService`, `ChatEventsService`, the
  Prisma schema) cited inline, not assumed or guessed. Several of these
  were also empirically exercised once, live, against a real DB and a real
  Socket.IO gateway during this analysis (all passed) — but **no automated
  test suite is currently committed to this repo** to keep re-verifying
  them on every change (see "On automated regression testing" below for
  why, and what it'd take to add one back).
- 📱 **Manual (device/network required)** — needs real client hardware
  and/or real different networks; nothing in this Node backend can execute
  it. This is on you (or whoever runs device QA) to execute per the device
  and network matrix in §2.
- 🚫 **Blocked — not built** — the test case assumes a capability that does
  not exist in this codebase today. Marked so QA doesn't file a bug against
  something that was never implemented; see the linked gap.

This plan is scoped to what's true of the actual running code as of
2026-08-31, cross-referenced against `docs/CALL_INTEGRATION_FLOW.md`
(read that first for *why* each of these behaves the way it does) and
`docs/MOBILE_INTEGRATION.md` (the full wire reference).

### On automated regression testing

During this analysis a full e2e suite (presence + call lifecycle + group
membership + access control, run against a real DB and a real Socket.IO
gateway) was written and run — every case below tagged ✅ passed live at
least once. It isn't checked into the repo: running any e2e test here at
all requires two fixes to `test/jest-e2e.json` (a `moduleNameMapper` for
the generated Prisma client's `.js`-suffixed imports and a `src/...`
bare-import style used in `src/modules/auth/`) and running Jest with
`--experimental-vm-modules` (Prisma 7's WASM query compiler needs it) —
without them, **no** e2e test in this repo runs, including the
pre-existing `test/app.e2e-spec.ts`. Those config changes were reverted
each time they were applied, so per instruction this plan stays
documentation-only for now. If that changes, most of the ✅ items below are
close to a re-runnable suite, not a from-scratch effort.

---

## 1. Objective

Verify that the complete voice/video call feature works correctly between
users over different Internet networks, including: 1-to-1 voice calls,
1-to-1 video calls, group voice calls, group video calls, call signaling,
call notifications, WebRTC connection, STUN/TURN network traversal, TURN
credential issuance, call reconnection, participant join/leave, call
ending, call history/status, background/foreground behavior, poor network
conditions, and multiple devices — and to draw a clean line between what
this backend is responsible for and what the mobile client is.

---

## 2. Test environment

### Devices (manual QA)

* Android phone A
* Android phone B
* Android phone C
* iPhone A
* iPhone B

### Networks (manual QA)

| Device A | Device B | Expected |
|---|---|---|
| Wi-Fi | Same Wi-Fi | Call works |
| Wi-Fi | Different Wi-Fi | Call works |
| Wi-Fi | 4G/5G | Call works |
| 4G/5G | Wi-Fi | Call works |
| 4G/5G | Different 4G/5G | Call works |
| Different ISPs | Different ISPs | Call works |

The most important test is **different networks** — a local Wi-Fi test
alone does not verify Internet connectivity. Per
`CALL_INTEGRATION_FLOW.md` §2, every row in this table depends on the
mobile client having STUN configured, and the bottom rows (different
Wi-Fi, different mobile carriers, different ISPs) can depend on **TURN**
specifically if either side is behind a symmetric NAT or a restrictive
firewall — don't treat "same Wi-Fi worked" as evidence the other rows will.

---

## 3. Authentication

### TC-CALL-001 — Authenticated user can access call feature — 📱 manual (UI) / ✅ verified (server)

**Steps**: Login as User A → open a conversation → check voice/video call
buttons.

**Expected**: Call buttons are visible; user can start a call; no
authentication error occurs.

**Server-side**: `ChatGateway.authenticate()` validates the JWT before any
socket handler runs (`chat.gateway.ts:94-124`); an unauthenticated socket
gets `exception` + disconnect, never a working call handler. The
"buttons are visible" half is client-UI, manual-only.

---

## 4. Backend — Call REST API

### Create Call — 🚫 not a REST endpoint (by design)

There is **no** `POST /v1/calls` REST endpoint. Starting a call is
**WS-only** — `call:invite` (`ChatGateway.onCallInvite` →
`CallsService.initiateCall`, `calls.service.ts:109-185`). This is
deliberate, documented in `MOBILE_INTEGRATION.md` §3.5: *"Starting/
answering/ending a call itself is WS-only... These REST endpoints are
read-only."* If your QA checklist assumes a REST create-call endpoint,
update it — test `call:invite` over the socket instead (§6 below).

What `initiateCall` verifies, traced from source — ✅:
- Caller is authenticated and a member of the conversation
  (`assertMembership`, throws `NotFoundException` otherwise).
- `type` is validated against the `call_type` enum (`audio`/`video`) by
  `CallInviteDto`'s `@IsEnum(call_type)` — an invalid type fails DTO
  validation before the service even runs.
- Invitees are filtered to actual, still-present conversation members —
  an arbitrary `participant_user_ids` id that isn't a real member is
  silently dropped, never trusted (`calls.service.ts:128-129`).
- A `calls` row is created with `status: ringing`, and the caller is
  inserted into `call_participants` as `status: joined` in the same
  transaction as the invitees (`status: invited`) — `calls.service.ts:149-180`.

### Get Call — 🚫 not built as a single-call lookup endpoint

There is no `GET /v1/calls/:id` or `GET /v1/calls/:hash`. What exists
instead (`calls.controller.ts`):

| Endpoint | Purpose |
|---|---|
| `GET /v1/calls/conversations/:conversation_hash` | Call history for one conversation, paginated, newest-first |
| `GET /v1/calls/active` | This user's own ringing/active calls across every conversation |

Both are scoped to calls the requesting user actually participated in —
`listCalls` requires conversation membership first, `listActiveCalls`
filters by `call_participants.user_id = currentUserId`. There is no way
to fetch an arbitrary call by id/hash as a third party; that's the
"unauthorized user cannot access the call" requirement, satisfied by
*not exposing the lookup* rather than by an auth check on one. If a
single-call-by-id lookup is actually needed (e.g. for a push-notification
deep link), it doesn't exist yet — flag as a product decision, not a bug.

### End Call — ✅ verified

`call:end` (`ChatGateway.onCallEnd` → `CallsService.endCall`,
`calls.service.ts:335-402`). Traced:
- The caller (`isOwner`) ending it ends the call for **everyone**, even
  mid-group-call with others still on it.
- Anyone else ending it just leaves — the call stays `active` while
  `joinedCount >= 2`, and only fully ends once it drops below that
  (`calls.service.ts:359`, see §6 below for the exact rule).
- `ended_at` is set exactly when the call transitions to a terminal status
  (`ended`/`cancelled`), never on a partial leave.
- Duration isn't stored as a separate field — it's `ended_at - started_at`,
  computed client-side from the two timestamps `CallResponseDto` already
  returns; there's no persisted `duration` column. If a stored duration is
  actually required, that's a schema gap to raise, not something to test
  for as if it already exists.
- Every participant still `invited`/`ringing` when the call ends is moved
  to `missed`, and every `joined` participant is moved to `left` — nobody
  is left dangling in a live status once the call is over
  (`calls.service.ts:370-389`).

---

## 5. WebSocket signaling — event names, corrected

If your QA checklist or test client was written against
`call:ringing`/`call:accept`/`call:offer`/`call:ice_candidate`/
`call:participant_join`/`call:participant_leave`, those names don't match
this server. Actual events (`src/modules/chat/chat.model.ts`,
`MOBILE_INTEGRATION.md` §4.4):

| Assumed name | Actual event | Notes |
|---|---|---|
| `call:invite` | `call:invite` | matches |
| `call:ringing` | `call:ring` | client emits `call:ring`, not `ringing` |
| `call:accept` | `call:answer` | no separate "accept" — answering *is* `call:answer`, carrying the SDP answer |
| `call:reject` | `call:reject` | matches |
| `call:offer` | *(none — piggybacked)* | no dedicated offer event; the SDP offer rides the generic `call:ice-candidate` targeted-relay channel |
| `call:ice_candidate` | `call:ice-candidate` | hyphenated, not underscored |
| `call:participant_join` | `call:participant-joined` | hyphenated + past tense |
| `call:participant_leave` | *(none)* | inferred from `call:end` where the overall `status` is still `ringing`/`active` — no separate "participant left" event |
| `call:end` | `call:end` | matches, but see the owner-vs-participant split above |

### Backend verification per event — ✅ verified against source

| Requirement | Where it's enforced |
|---|---|
| Event authentication | `ChatGateway.handle()` wraps every handler, awaits `client.data.authenticated`, throws `UnauthorizedException` if no user (`chat.gateway.ts:407-434`) |
| Correct call ID | Every handler resolves the call by `hash` via `getCallForParticipant`, `NotFoundException` if it doesn't exist (`calls.service.ts:428-439`) |
| Correct conversation ID | `call:invite` resolves the call's conversation via `assertMembership`; every other action is scoped to the call, which is permanently tied to one `conversation_id` at creation |
| Correct sender | Every service method takes `currentUserId` from the authenticated socket, never from the payload |
| Correct receiver | Targeted events (`call:answer`, `call:ice-candidate`) require `target_user_id`, and `findParticipant` throws if that id isn't actually a participant on the call (`calls.service.ts:441-457`) — you can't target someone outside the call |
| User authorization | Same `findParticipant` check gates every action — see §9 |
| Event forwarding | `ChatEventsService.notifyUser`/`notifyUsers` — `Server.to(userRoom(id)).emit(...)`, personal-room delivery only, never a raw broadcast |
| Duplicate-event handling | Re-emitting `call:ring`/`call:answer`/`call:end` for a call you're already in is idempotent by design (`MOBILE_INTEGRATION.md` §5.9) — traced: `answer()` just re-sets the same participant row to `joined` again, no duplicate row, no crash |
| Invalid payload handling | Every DTO (`CallSignalDto`, `CallIceCandidateDto`, …) is validated via `validateDto()` before the service runs; a missing/malformed field throws `DtoValidationError`, caught in `ChatGateway.handle()` and returned as `{ success: false, message }` — never a thrown exception, never a dropped connection (`chat.gateway.ts:422-424`) |

**Backend forwards signaling, never touches media**: confirmed — every
`signal` field is typed `unknown` and passed through
`chatEventsService.notifyUser(...)` untouched (`calls.service.ts:250-256,
326-332`). There is no audio/video handling anywhere in this service.

---

## 6. WebRTC signaling — offer/answer/ICE

### Offer / Answer / ICE candidate relay — ✅ verified

```
Offer:  A → Backend → B   (piggybacked on call:ice-candidate, targeted)
Answer: B → Backend → A   (call:answer, targeted, carries the SDP answer)
ICE:    A → Backend → B   (call:ice-candidate, targeted, both directions)
        B → Backend → A
```

Traced in `CallsService.answer`/`relayIceCandidate`
(`calls.service.ts:209-259, 316-333`):

- **Candidates are not lost**: relay is a direct, synchronous
  `server.to(userRoom(targetId)).emit(...)` call — no queue, no storage,
  no drop path. If the target has no live socket, the emit is simply a
  no-op (nothing to receive it) — there is no candidate buffering for a
  target who reconnects later. A candidate sent while the target is
  briefly disconnected is lost, not queued; this matters for "late ICE
  candidates" below.
- **Sent to the correct call only**: every relay first resolves the call
  by hash and confirms both the sender and `target_user_id` are actual
  participants on *that* call (`getCallForParticipant` +
  `findParticipant`, twice) before relaying anything.
- **Sent only to authorized participants**: same check — a
  `target_user_id` who isn't a participant on this call throws
  `ForbiddenException` before any relay happens (§9).
- **Multiple ICE candidates**: no batching or single-candidate assumption
  anywhere — each `call:ice-candidate` emit is independent, so a client
  sending many in sequence works exactly as many independent relays.
- **Late ICE candidates**: since there's no buffering (previous point), a
  candidate for a target whose socket briefly dropped and reconnected is
  simply lost — it's the client's job to re-gather/re-send ICE candidates
  after a reconnect if needed. This is a real, verified behavior, not a
  gap to file as a bug — flagging it so mobile engineering builds around
  it rather than assumes durability that doesn't exist.

---

## 7. Group call backend

### Join / duplicate-join prevention / leave — ✅ verified

Traced in `CallsService.answer`/`endCall`:

- **All authorized users can join**: any invited/ringing participant can
  `call:answer`; a non-participant is rejected (§9).
- **Duplicate joins are prevented at the row level, not by rejecting the
  second call**: calling `call:answer` twice for the same user doesn't
  create a second `call_participants` row — `findParticipant` locates the
  existing row and updates it in place (`status: joined` again,
  `joined_at` refreshed). No duplicate participant, no crash — this is the
  deliberate idempotency `MOBILE_INTEGRATION.md` §5.9 documents for a
  retried client action. It does re-broadcast `call:participant-joined`
  each time, though — a client that double-answers will see that event
  twice; dedupe on your side if that matters for UI.
- **Participant count is correct**: `call_participants` rows are 1:1 with
  `(call_id, user_id)` at the schema level (no `@@unique` shown on that
  pair specifically in `prisma/schema.prisma`, but the application-level
  find-then-update pattern above prevents a duplicate insert in practice
  through this code path).
- **Participant leave is correct / one leaving doesn't wrongly end the
  call**: this is the rule you called out —

  ```
  joinedCount >= 2   → call remains active
  joinedCount < 2    → call can end (ends unconditionally if the leaver is the owner)
  ```

  Traced exactly in `calls.service.ts:359`:
  `if (isOwner || joinedCount < 2) { …end for everyone… }`. This is
  **participant-count-agnostic by construction** — it re-evaluates
  `joinedCount` fresh after every single leave, so it behaves identically
  whether the call started with 2, 3, 4, or more participants:

  | Participants joined | One leaves | Result |
  |---|---|---|
  | 2 | → 1 | `joinedCount < 2` → call ends for everyone |
  | 3 | → 2 | `joinedCount >= 2` → call stays active for the remaining 2 |
  | 4 | → 3 | stays active |
  | 4 → 3 → 2 | two sequential leaves | stays active after the first (3 left), ends after the second only if it drops the count below 2 |

  The **owner** leaving is the one exception to "count decides": if the
  owner ends the call, it ends for everyone regardless of how many
  participants remain joined (`isOwner ||` short-circuits the count check)
  — this matches `MOBILE_INTEGRATION.md` §4.4's documented owner-vs-
  participant split, and is worth calling out because it means "the call
  ends" isn't purely a function of participant count — *who* left matters
  too.

---

## 8. TURN credential API — ✅ built (`TASKS.md` Phase 9)

**Update**: originally documented here as not built, with the option to
implement it now instead of just flagging the gap — it's now built.
`GET /v1/calls/turn-credentials` (`calls.controller.ts` →
`CallsService.getTurnCredentials`, `calls.service.ts`), guarded by the same
`OauthJwtGuard` as every other call endpoint. Returns:

```json
{
  "iceServers": [
    { "urls": "stun:turn.example.com:3478" },
    { "urls": "turn:turn.example.com:3478", "username": "...", "credential": "..." }
  ]
}
```

Implementation, traced/tested (`src/modules/calls/calls.service.spec.ts`,
`src/core/services/setting/setting.service.spec.ts` — both pass under
`npm test`, no DB/e2e harness needed):

- **Authenticated users can request credentials; unauthorized users
  cannot** — ✅ enforced identically to every other `/v1/calls/*` route by
  `OauthJwtGuard` at the controller level; there's nothing endpoint-
  specific to verify beyond that shared guard.
- **Credentials expire** — ✅ coturn's `use-auth-secret` REST API
  convention: `username` is `"<expiry-unix-ts>:<userId>"`, `credential` is
  `HMAC-SHA1(secret, username)` base64-encoded. A TURN server configured
  with the same shared secret independently derives and checks this, and
  rejects anything past the embedded expiry — verified in the unit test by
  recomputing the HMAC independently and asserting a byte-for-byte match,
  and asserting the embedded expiry equals `now + ttlSeconds` (default
  3600s, deployment-configurable).
- **Credentials cannot be reused indefinitely** — ✅ same mechanism as
  above; there's no separate revocation list because there's nothing
  persisted to revoke — expiry alone is the enforcement, which is the
  standard pattern for this kind of credential (equivalent to a JWT's
  `exp` claim).
- **Correct TURN server information is returned** — ✅ `stun:` entries in
  the configured `turn_urls` setting carry no credentials (STUN needs
  none); `turn:`/`turns:` entries all carry the *same* username/credential
  pair for one request — verified as a dedicated test case (`"gives every
  turn:/turns: entry the same username/credential pair for one request"`).

**What's still true**: this backend doesn't run a TURN server itself, and
this endpoint is **inert** — `500`s with a clear
`InternalServerErrorException` — until an operator (1) deploys an actual
TURN server (e.g. `coturn`) with a `static-auth-secret`, and (2) inserts
matching `turn_secret`/`turn_urls` rows into the `settings` table (see
`TASKS.md` Phase 9 for the exact keys). Verified: the missing-config path
is a dedicated test case, not an assumption. **No live TURN server exists
to test actual connectivity against** — that remains 📱 manual, once one
is deployed (§12).

---

## 9. Authorization & security — ✅ verified

### Unauthorized user tries to join — ✅ verified

Traced: a conversation member who wasn't included in `call:invite`'s
participant list (or a stranger with no call access at all) gets a failed
ack backed by `ForbiddenException` — `"You are not a participant in this
call!"` — on `call:ring`, `call:answer`, and `call:ice-candidate` alike
(`findParticipant`, `calls.service.ts:441-457`, called at the top of every
one of those methods). This is a WS ack failure (`{ success: false,
message }`), not an HTTP 403 — there's no REST call-join endpoint to 403
(§4's "Create Call" note).

### Invalid call — ✅ verified

A nonexistent `call_hash` on any call event fails with `NotFoundException`
— `"Call not found!"` — before any participant check even runs
(`getCallForParticipant`, `calls.service.ts:428-439`). Confirmed the
socket stays fully usable afterward — no disconnect, no thrown exception
past the gateway's `handle()` wrapper (`chat.gateway.ts:407-434`).

### User not in conversation — ✅ verified

`call:invite` itself requires conversation membership
(`ConversationsService.assertMembership`, throws `NotFoundException` for a
non-member — matches this API's general "don't leak conversation
existence to non-members" pattern, same code path every REST conversation
endpoint uses). A user who was once a member but has since left
(`left_at` set) is excluded from the invitee set the same way
(`calls.service.ts:122`, filters `!member.left_at`).

### Invalid signaling payload — ✅ verified

Every signaling DTO requires `signal` via `@IsDefined()`
(`chat.model.ts:96-97, 110-111`); a missing/`null`/`undefined` signal
fails class-validator validation inside `validateDto()`, caught as
`DtoValidationError` and returned as a failed ack — never reaches
`CallsService`, never throws past the handler, never crashes the server or
drops the connection.

---

## 10. FCM incoming call — 🚫 not built

Push notifications for an incoming call when the recipient has no live
socket are **not implemented**. Per `TASKS.md`'s Phase 6: this was
designed (per-`oauth_client` Firebase service-account credentials, a
`device_tokens` table, wiring into `CallsService.initiateCall`), partially
built, and then **explicitly reverted at request** before any migration
landed — nothing of that implementation exists in the tree today. This is
a known, previously-made decision, not a fresh gap discovered here — don't
re-litigate without deliberately deciding to resume it (see `TASKS.md`
Phase 6 for the exact resume-from-here notes if that happens).

Current reality, traced:

```
User A calls B
       │
       ▼
Does B have a live, authenticated socket in their personal room?
       │
   ┌───┴────┐
  Yes        No
   │          │
   ▼          ▼
call:invite   Nothing is sent. B learns about the call only on next
reaches B     app foreground/launch, via GET /v1/calls/active.
```

There is no branch to FCM — the "No" path above is a dead end today, not a
fallback. `initiateCall` (`calls.service.ts:183`) broadcasts to every
invitee's personal room unconditionally; a recipient with no socket
subscribed to that room simply doesn't receive anything, silently. Every
acceptance-criteria item under "FCM incoming call" (correct recipient,
correct call id/caller/type, no notification to unrelated users) is
unverifiable until this is built.

---

## 11. Database QA — ✅ verified

`calls` (`prisma/schema.prisma:230-249`): `id`, `hash`, `conversation_id`,
`caller_id`, `type`, `status`, `started_at`, `answered_at`, `ended_at`.
(No persisted `duration` column — see §4's "End Call" note.)

`call_participants` (`schema.prisma:251-266`): `id`, `call_id`, `user_id`,
`status`, `joined_at`, `left_at`.

Verified by tracing every write path in `CallsService`:

- **No duplicate participants**: the join/duplicate-answer analysis in §7
  — `answer()` updates an existing row rather than inserting a new one for
  a repeat action by the same user.
- **No orphan participants**: `call_participants.call_id` has `onDelete:
  Cascade` from `calls` (`schema.prisma:262`) — a deleted call can't leave
  orphaned participant rows at the DB level.
- **Correct status transitions**: `invited` → `ringing`/`joined` →
  `left`/`missed`/`rejected`, every transition traced to a specific
  service method in §4/§7/§9 above; nothing is left in a non-terminal
  status once the call itself reaches `ended`/`cancelled`/`rejected`
  (`calls.service.ts:370-389`'s `updateMany` calls sweep both
  still-invited and still-joined participants on the way out).
- **Correct timestamps**: `started_at` set at creation, `answered_at` set
  exactly once (on the *first* `active` transition, not re-set on a later
  join — `calls.service.ts:233-240`), `ended_at` set exactly on a terminal
  transition, `joined_at`/`left_at` per participant per the transitions
  above.
- **Correct group membership**: the invitee set at creation is always
  filtered to real, currently-present conversation members
  (§4's "Create Call" note) — a call can never reference a participant who
  wasn't legitimately a member of the conversation at invite time.

---

## 12. Backend network tests — 📱 manual, mandatory

This backend cannot be exercised for real network topology from within
this repo — see `CALL_INTEGRATION_FLOW.md` §2 for the full explanation of
why (this service is a pure signaling relay; the actual WebRTC/NAT-
traversal infrastructure is entirely client-side + whatever STUN/TURN the
mobile client is configured with, and §8 above confirms this backend
supplies none of that today).

| Scenario | What to check |
|---|---|
| Wi-Fi ↔ Wi-Fi | Baseline — should always work |
| Wi-Fi ↔ 4G | Requires client-configured STUN at minimum |
| 4G ↔ Wi-Fi | Same |
| 4G ↔ 5G | Same |
| 5G ↔ 5G | Same |
| Different ISPs | Same, plus more likely to need TURN |
| Restrictive NAT | **Requires TURN** — and per §8, there is currently no server-issued TURN credential path; the client needs a manually-configured TURN server for this to have any chance of passing |

Expected flow (client-side, not this backend):
`Direct WebRTC → if unavailable → TURN → call still works`. This backend's
only role in that flow is relaying the signaling that negotiates it
(§5, §6) — verified; the STUN/direct/TURN attempt sequence itself is
entirely outside this service.

---

## 13. Backend acceptance criteria

- [x] ✅ REST call APIs work **as they actually exist** — history + active-calls lookup, read-only, no create/get/end over REST by design (§4)
- [x] ✅ WebSocket authentication works (§3, §5)
- [x] ✅ All signaling events work, **under their real names** — see §5's mapping table
- [x] ✅ Offer/answer forwarding works (§6)
- [x] ✅ ICE candidate forwarding works (§6, with the "no buffering for late candidates" caveat)
- [x] ✅ Group calls work (§7)
- [x] ✅ Join/leave logic works, including the count-agnostic active/end rule (§7)
- [x] ✅ Call ending logic works, including owner-vs-participant semantics (§4)
- [x] ✅ Authorization works (§9)
- [x] ✅ TURN credentials work — **built (§8)**, but only useful once an operator deploys a real TURN server for this instance
- [ ] 🚫 FCM fallback works — **not built, explicitly on hold (§10)**
- [x] ✅ Database state is correct (§11)
- [x] ✅ No duplicate participants (§7, §11)
- [x] ✅ No ghost active calls — every terminal transition sweeps stale participant statuses (§4, §11)
- [ ] 📱 Different Internet networks are supported — **cannot be verified from this backend alone; needs §12's manual matrix. The credential API (§8) is built, but still depends on an operator actually deploying a TURN server for this instance.**
- [x] ✅ Invalid requests are handled safely (§9 — bad payload, bad call id, unauthorized target all fail cleanly)
- [x] ✅ Server does not crash during call failures (§5, §9 — every failure path returns a failed ack, never throws past the gateway or drops the socket)

**One backend behavior worth flagging that this checklist doesn't ask
about but should**: the duplicate-call guard in `initiateCall`
(`calls.service.ts:137-147`) is scoped **per conversation**, not per user.
A user can be simultaneously invited into two different calls in two
different conversations — there is no cross-conversation "busy" check
anywhere in `CallsService`. "No two calls incorrectly become active
simultaneously" (from the mobile task list's §11, "Multiple Calls") is
**not enforced by this backend** for that cross-conversation case; it's
entirely the mobile client's responsibility to notice (via
`GET /v1/calls/active`) that the user is already on a call elsewhere and
decide what to do (auto-reject, show a busy state, etc.) before rendering
a second incoming-call UI. Verified by re-reading the guard's `where`
clause, which filters by `conversation_id` only.

---

## 14. Mobile (Flutter) QA — entirely 📱 manual

Everything below has zero server-side surface to verify from this repo —
included for completeness/traceability against the task list, not because
any of it can be automated here.

### Call UI
Voice/video call buttons, incoming/outgoing/connecting/connected/
reconnecting/ended/failed screens.

### Voice call
Start, accept, mute/unmute, speaker/earpiece, end call — audio path is
100% client + OS + WebRTC stack.

### Video call
Camera on/off, mute/unmute, switch camera, speaker, end call — same
caveat.

### Permissions
Microphone and camera: allow / deny / deny-permanently, each needing a
graceful in-app explanation and no crash.

### Different networks
Same matrix as §12 — Wi-Fi/4G/5G combinations, expect the call to connect
and carry audio/video.

### Network switching mid-call
Wi-Fi → mobile data and the reverse. What the backend actually guarantees
here (traced, ✅): an abrupt socket loss on one side ends *that
participant's* leg via `endStaleCallsForUser`
(`chat.gateway.ts:126-187` → `calls.service.ts:404-415`) without leaving
the call stuck for the others — but if the client's Socket.IO reconnect
logic recovers the same connection quickly (the common case for a brief
network blip), the server never sees a disconnect at all, and nothing
call-related happens server-side. Whether the client's own
`RTCPeerConnection` ICE state survives the switch (an ICE restart) is
independent of the socket and entirely client-side — not something this
backend is involved in.

### Background/foreground
Incoming call while backgrounded: per §10, expect this to work **only**
while the app's socket is still alive in the background (platform-
dependent) — there is no push fallback. Active-call backgrounding/
restoration is OS + client state management, no server role.

### Group call mobile
Participant list correctness, who-can-hear-whom, video rendering,
join/leave reflected in UI. Server-side membership/signaling correctness
backing this is §7 (✅); rendering is 📱.

### WebSocket reconnection
Disable/enable Internet mid-call, confirm the socket reconnects, call
state resyncs (via `GET /v1/calls/active` per `MOBILE_INTEGRATION.md`
§5.9), and no duplicate call is created client-side. Server-side: nothing
new to verify beyond §9's idempotency guarantees — reconnecting and
re-emitting `call:ring`/`call:answer` for a call you're still legitimately
in is safe by design.

### Call ending (caller / receiver / force-close)
Server-side semantics for all three are ✅ verified in §4/§9; the actual
UI teardown on each device is 📱.

### Multiple calls / busy behavior
See §13's flagged finding — "A is calling B, C calls A" is **not**
resolved by this backend; the client must implement its own busy/incoming
-call precedence using `GET /v1/calls/active` state. Test this
specifically as a client-logic case, not assuming the server prevents it.

---

## 15. Mobile acceptance criteria

Entirely 📱 — voice/video call, incoming/outgoing/accept/reject/cancel/
end, mute/unmute, speaker, camera on-off/switch, mic/camera permissions,
group call, participant join/leave, the full network matrix, network-
switch handling, background notification (constrained by §10's gap),
WebSocket reconnect, call-state restoration, no duplicate calls, no stuck
call UI, no crash. None of this has a server-side component beyond what's
already verified in §4–§11 above.

---

## 16. Final responsibility split — reconciled against actual code

| Feature | Backend | Flutter | Status |
|---|:---:|:---:|---|
| Create call | ✅ | | Built — WS-only, `call:invite` (§4) |
| Call database | ✅ | | Built (§11) |
| Call authorization | ✅ | | Built (§9) |
| WebSocket signaling | ✅ | | Built, under different event names than assumed (§5) |
| Offer/Answer forwarding | ✅ | | Built (§6) |
| ICE forwarding | ✅ | | Built, no candidate buffering (§6) |
| **TURN credentials** | ✅ | | **Built (§8)** — the credential-issuing endpoint exists and is tested; an operator still needs to deploy an actual TURN server for it to be useful |
| **FCM notification** | ✅ (assumed) | | **🚫 Not built, on hold (§10)** |
| WebRTC connection | | ✅ | Client responsibility, unchanged |
| Microphone | | ✅ | Client responsibility, unchanged |
| Camera | | ✅ | Client responsibility, unchanged |
| Call UI | | ✅ | Client responsibility, unchanged |
| Mute | | ✅ | Client responsibility, unchanged |
| Speaker | | ✅ | Client responsibility, unchanged |
| Camera switch | | ✅ | Client responsibility, unchanged |
| Network UI | | ✅ | Client responsibility, unchanged |
| Reconnection UI | | ✅ | Client responsibility; server-side stale-call cleanup backs it (§14) |
| Group participant UI | | ✅ | Client responsibility; server-side membership backs it (§7) |
| Database state | ✅ | | Built (§11) |
| Internet connectivity infrastructure | ✅ (assumed) | | **Partially true, improved** — signaling relay is built and network-agnostic (§6), and the backend now issues TURN credentials (§8); what's still **not** backend-provided is the TURN *server* itself — that's ops infrastructure outside this repo, same as the DB or the reverse proxy |
| End-to-end call testing | ✅ | ✅ | Backend half is ✅ source-verified (no committed automated suite — see the note under "How to read this document"); mobile half is entirely 📱, unexecuted here |

The one row still worth double-checking with whoever wrote the original
split: **Internet connectivity infrastructure** was marked as an
unqualified backend ✅. The credential-issuing *endpoint* is now genuinely
built (§8) — but running an actual TURN server remains an operational
task, not application code, so this row is closer to true than it was,
not fully true yet.

---

## 17. Final QA result

**Backend**: every ✅-tagged item in §4–§11 and §13 reflects behavior
traced directly in the running source and (for most of them) empirically
confirmed live during this analysis — but with no committed automated
suite, that confirmation doesn't automatically stay true as the code
changes. Treat the ✅ tags as "true as of 2026-08-31, re-verify after any
change to `ChatGateway`/`CallsService`/`ChatEventsService`," not as an
ongoing guarantee.

**PASS** requires, beyond the ✅ items already holding: the 📱 manual
matrix (§12/§2) executed and passed on real devices across genuinely
different networks — including, now that the credential endpoint exists,
an actual TURN server deployed and its `turn_secret`/`turn_urls` settings
configured (§8/`TASKS.md` Phase 9), so TURN fallback can be tested for
real rather than just assumed — and an explicit decision on the one
remaining 🚫 gap (FCM): either build it, or formally accept the current
scope (no push fallback for a fully backgrounded/terminated app) before
sign-off.

**FAIL** — any of: a ✅ item above no longer holds on re-check; cannot
connect across different networks (📱); unauthorized users can join
(regression in §9); database call state is inconsistent (regression in
§11); a call remains stuck after ending (regression in §4/§7); the
cross-conversation busy gap (§13) causes a real double-answer collision in
practice and is judged unacceptable as-is.
