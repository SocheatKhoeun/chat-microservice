# Mobile Call Feature — Integration Flow & QA

This document is scoped to one feature: **voice/video calling**, and answers
three questions a mobile engineer integrating it will ask:

1. How do I know a group member is online before/while calling them?
2. Will a call actually connect when the two devices are on different
   networks (e.g. one on wifi, one on cellular, both behind NAT)?
3. What does the end-to-end call flow look like, screen by screen, on a
   mobile client?

For the full wire reference (every REST endpoint, every WS event, DTOs),
see [`MOBILE_INTEGRATION.md`](./MOBILE_INTEGRATION.md) — this document
doesn't repeat that, it explains *how the pieces fit together* for calling
specifically. For the formal test-case-by-test-case QA plan (including what
needs real multi-device/multi-network testing vs. what's automated), see
[`QA_CALL_TEST_PLAN.md`](./QA_CALL_TEST_PLAN.md). For a Flutter-specific
walkthrough with runnable Dart (`flutter_webrtc`, a global `CallManager`,
the offer/answer/ICE-candidate code) see
[`FLUTTER_CALL_INTEGRATION.md`](./FLUTTER_CALL_INTEGRATION.md).

This server is verified against the live code as of 2026-08-31; the claims
below about presence and call-signaling behavior are traced directly in
`ChatGateway`/`CallsService`/`ChatEventsService` (cited inline), and were
also empirically confirmed against a real DB and a real Socket.IO gateway
during development — see `docs/QA_CALL_TEST_PLAN.md`'s "On automated
regression testing" note for why that verification isn't a suite you can
currently re-run from this repo.

---

## 1. What "online" means here, precisely

Presence is **per-user, ref-counted across that user's own sockets** — see
`ChatGateway.markOnline`/`markOffline` in
`src/modules/chat/chat.gateway.ts`. Two things follow from that:

- A user with the app open on phone + tablet doesn't flicker offline when
  they background one device — `presence:offline` only fires once the
  **last** socket for that `user_id` disconnects.
- Presence is **contact-scoped, not global**: you only get
  `presence:online`/`presence:offline` for users you share at least one
  active conversation with (`ConversationsService.listContactUserIds`) —
  never for a stranger, even if you somehow knew their id.

**Where to read it:**

| Source | Shape | Freshness |
|---|---|---|
| `presence:online` / `presence:offline` (WS, personal room) | `{ user_id }` / `{ user_id, last_seen_at }` | Real-time push |
| `GET /v1/conversations/:hash/members` | `last_seen_at: string \| null` per member | Point-in-time snapshot; `null` while online |

**Important caveat for "is this member online right now" UI**: the members
endpoint tells you when someone was *last* seen, not whether they're online
*now* — a `null` value is ambiguous between "currently online" and "never
tracked." Don't render a green dot off `last_seen_at` alone; drive the
online/offline dot from the live `presence:*` events (hydrated at
connect-time per §5.9 of `MOBILE_INTEGRATION.md`'s pattern — there's no
`GET /presence` snapshot endpoint today, so a freshly opened member list
has to wait for whatever `presence:*` events arrive, or you accept a brief
"unknown" state until one does).

**One deployment caveat worth knowing, not a bug today**: `onlineSocketCounts`
is an **in-process `Map`** on `ChatGateway` (see `chat.gateway.ts:74`), not
backed by Redis or any shared store. That's correct as long as this service
runs as a single instance — which is how it's deployed today (see
`Dockerfile`, one container, no Socket.IO Redis adapter configured). If this
service is ever scaled to multiple instances/replicas behind a load
balancer, presence ref-counting will be wrong across instances (a user's
two sockets landing on two different pods would each look like their only
socket, causing spurious online/offline flips). Not a mobile-client concern
today, but flag it before anyone adds a second replica.

**Should you gate calling on presence?** No — `call:invite` rings every
active member regardless of presence; an offline recipient simply doesn't
have a socket to receive it (their device shows the missed call next time
it connects, via `GET /v1/calls/active` — §3.5 of `MOBILE_INTEGRATION.md`).
Use presence for *UI* (green dot, "last seen 5m ago"), not as a client-side
guard that blocks the call button — the server already handles "no one
picked up."

---

## 2. Calling across different networks

**Short answer: yes — the backend now issues short-lived STUN/TURN
credentials via `GET /v1/calls/turn-credentials`, but only if an operator
has actually deployed and configured a TURN server for this instance. If
that hasn't happened yet for your deployment, fall back to §2.2's
client-side-static-config path.**

### 2.1 What this server does and does not do

This service is a **pure signaling relay**. Every call-related event
(`call:invite`, `call:answer`, `call:ice-candidate`, …) carries a `signal`
field that the server treats as opaque — see `CallSignalDto`/
`CallIceCandidateDto` in `src/modules/chat/chat.model.ts`, and the code
comments there: *"opaque to the server, just relayed to the target
participant."* `CallsService.answer`/`relayIceCandidate` push it verbatim
to the target user's **personal room** over their already-open Socket.IO
connection.

That's the entire job this server does for NAT traversal: **relay the SDP
offer/answer and ICE candidates between two clients, whatever network
either of them is on** — because the relay travels over each client's
existing WebSocket connection to this server (itself just a normal
internet connection, unaffected by either client's NAT), not over a
direct peer path. So signaling itself is network-agnostic — traced
directly in `CallsService.answer`/`relayIceCandidate`
(`calls.service.ts:209-259, 316-333`), and was empirically confirmed
during development by round-tripping a TURN-`relay`-typed ICE candidate
through a real server and target socket and checking it arrived
byte-for-byte unmodified.

**What this server does and does not do for the actual media path**:

- The **media** path (audio/video packets) is peer-to-peer (mesh WebRTC —
  see `MOBILE_INTEGRATION.md` §4.4's "Group calls are mesh WebRTC, not an
  SFU") between the mobile devices themselves, never through this server.
- **NAT traversal for that media path is entirely the mobile client's
  job**, configured on each device's `RTCPeerConnection` — this server has
  no involvement in the actual STUN/ICE negotiation or media relay, only
  in getting the signaling messages that negotiate it from one client to
  the other (above).
- **What this server now does provide**: the *credentials* for that
  client-side config, via `GET /v1/calls/turn-credentials` (§2.2) — it
  still doesn't run a STUN/TURN server itself, or touch any media, but it
  can hand out short-lived, authenticated access to one an operator has
  deployed.

### 2.2 What your mobile client must do

Fetch fresh ICE server config before starting (or joining) a call, and
configure `iceServers` on every `RTCPeerConnection` you create (both
platforms' WebRTC SDKs take the same shape):

```js
const { iceServers } = await fetch(`${API}/v1/calls/turn-credentials`, {
  headers: { Authorization: `Bearer ${accessToken}` },
}).then((r) => r.json());

const pc = new RTCPeerConnection({ iceServers });
```

See `MOBILE_INTEGRATION.md` §3.5 for the full response shape. A few things
worth knowing about it:

- **STUN alone** is enough for most home/office wifi and most cellular
  NATs (full-cone/restricted-cone) — it lets each peer discover its public
  `srflx` address and a direct path usually opens.
- **STUN is not enough** for a symmetric NAT (common on some carrier-grade
  NAT cellular networks and some corporate firewalls) or a network that
  blocks UDP outright — those need a **TURN relay** to fall back to, or the
  call one-way-audios or never connects. "Two devices on different
  networks" is exactly the case where you can't assume STUN is sufficient
  — this is why the TURN entries matter, not just the STUN one.
- Every `turn:`/`turns:` entry in one response shares the same short-lived
  `username`/`credential` pair, valid for about an hour by default
  (deployment-configurable) — fetch a fresh set before each new call
  rather than caching one indefinitely; don't assume it survives past a
  single call session.
- **`500` from this endpoint means the operator hasn't deployed/configured
  a TURN server for this instance yet** — not a bug in your client. Handle
  it (fall back to a client-bundled static STUN-only config, or surface a
  clear "calls may not work off your local network" state) rather than
  letting it crash the call flow. Whoever runs this deployment needs to
  stand up a TURN server (e.g. `coturn`) and configure this backend's
  `turn_secret`/`turn_urls` settings before this endpoint does anything
  useful — see `TASKS.md` Phase 9 for the exact setup.
- The offer/answer/ICE-candidate *exchange* still goes through this
  server's WS events exactly as documented in `MOBILE_INTEGRATION.md` §4.4
  — this endpoint only supplies the ICE server *list*, nothing about the
  exchange itself changes.

### 2.3 What "can join call" actually depends on

| Layer | Owned by | Cross-network concern |
|---|---|---|
| Signaling (offer/answer/ICE exchange) | This server | None — relayed over each client's existing WS connection regardless of network. Traced in source, empirically confirmed during development. |
| TURN/STUN credentials | This server (`GET /v1/calls/turn-credentials`), **if** an operator has deployed a TURN server for this instance | Falls back to a client-bundled static config if this endpoint 500s (not configured for this deployment) |
| NAT traversal / connectivity checks | Client WebRTC stack, using the `iceServers` from above | The actual "different network" risk — needs STUN at minimum, TURN for symmetric NAT/restrictive firewalls |
| Media transport | Peer-to-peer between clients (mesh) | Same as above; TURN relays media too when a direct path can't be found |
| Reachability while ringing | Presence (§1) + `call:invite` fan-out | A ringing device with no live socket just doesn't ring — not a network-topology issue |

---

## 3. Mobile integration flow

### 3.1 Outgoing call

```
User taps "call" on a conversation screen
        │
        ▼
socket.emitWithAck('call:invite', { conversation_hash, type: 'audio'|'video' })
        │
        ├─ ack.success === false → show the bilingual error (see §6 of
        │   MOBILE_INTEGRATION.md), most commonly "already an active call
        │   in this conversation"
        │
        ▼ ack.success === true → ack.data is the CallResponseDto
Store { call_hash: ack.data.hash } in the global CallManager (per §5.9 of
MOBILE_INTEGRATION.md — call state is global, not screen-local)
        │
        ▼
Create one RTCPeerConnection per invitee (configured with your STUN/TURN —
see §2.2), createOffer(), setLocalDescription()
        │
        ▼
socket.emit('call:ice-candidate', { call_hash, target_user_id, signal: offer })
  — there's no separate "send offer" event; the offer piggybacks on the
  generic targeted-relay channel, per MOBILE_INTEGRATION.md §4.4
        │
        ▼
Render "ringing…" UI, driven by call:participant-joined /
call:reject / call:end events, until someone answers or you call:end to cancel
```

### 3.2 Incoming call

```
call:invite arrives on your personal room (global socket listener — see
MOBILE_INTEGRATION.md §5.9, "Global socket listener")
        │
        ▼
Write call_hash into the global CallManager; render the incoming-call
overlay at the app root, regardless of current screen
        │
        ▼
User taps "answer"
        │
        ▼
socket.emitWithAck('call:ring', { call_hash })   // optional but recommended:
                                                  // lets the caller's UI show
                                                  // "ringing on their device"
        │
        ▼
Create your RTCPeerConnection(s) (STUN/TURN configured), wait for the
inbound offer via 'call:ice-candidate', setRemoteDescription(offer),
createAnswer(), setLocalDescription(answer)
        │
        ▼
socket.emitWithAck('call:answer', { call_hash, target_user_id: <caller_id>, signal: answer })
        │
        ▼
On call:answer ack success + the caller's peer connection reaching
'connected' via its own ICE events → call is live. Every ICE candidate
either side discovers from here on relays through 'call:ice-candidate'
targeted at the other participant, same channel, no separate setup.
```

### 3.3 In-call controls: camera off / mute

Turning your camera or mic off locally (`track.enabled = false`) is silent
to the server and to the other participant by default — WebRTC's
`track.onmute` fires on network-level RTP interruptions, not on the local
`enabled` flag, so the remote side just sees a frozen last frame with no way
to tell "camera off" from "connection stalled."

`call:media-state` closes that gap: emit `{ call_hash, video_enabled,
audio_enabled }` (full current state, not a delta — the server holds none of
its own) alongside flipping the track locally, and it's relayed to every
other participant in the call (fan-out, like `call:participant-joined` —
not targeted at one peer like `call:ice-candidate`). See
`FLUTTER_CALL_INTEGRATION.md` §7 for the client code.

**Switching front/back camera never goes through this server at all** — it
swaps the local capture device on the existing outgoing video track; the
remote side keeps receiving the same track and needs no signal.

### 3.4 Ending a call

Emit `call:end`. Remember the two different outcomes documented in
`MOBILE_INTEGRATION.md` §4.4: the call's **owner** ending it ends it for
everyone; anyone else ending it just leaves (the call keeps going for the
rest while ≥2 participants remain `joined`). Always check the broadcast's
`status` field before tearing down your whole call UI — see §3.5 below for
the concrete "one participant's connection drops" case, traced in
`CallsService.endCall` (`calls.service.ts:335-402`).

**There is no server-side ring timeout.** A call that nobody answers or
rejects stays `ringing` indefinitely until the caller calls `call:end`
(or their socket disconnects, which triggers the same stale-call cleanup).
If you want a "missed call after N seconds of no answer" UX, the timer and
the resulting `call:end` are your client's responsibility — this server
does not auto-expire a ringing call. See `QA_CALL_TEST_PLAN.md` TC-CALL-006.

### 3.5 A participant's network drops mid-call

This is the practical form of "different networks" mobile QA cares about:
a phone losing wifi and failing over to cellular, or losing signal
entirely, mid-call. Two distinct things happen, and your client needs to
handle both:

- **Socket.IO reconnect**: if the underlying socket survives (a brief
  network blip Socket.IO's own reconnect logic absorbs), nothing
  call-related needs to happen — the same socket resumes.
- **A clean socket disconnect** (the app backgrounds hard enough to kill
  the socket, or the network drop outlasts Socket.IO's reconnect window):
  the server's `handleDisconnect` calls `endStaleCallsForUser`, which walks
  every call that user was `invited`/`ringing`/`joined` on and ends their
  participation — broadcasting `call:end` for that one user (or ending the
  whole call if that drops it below 2 joined participants). Your
  CallManager must treat `call:end` with a still-`ringing`/`active` overall
  `status` as "just that participant left," not "the call is over" — see
  `MOBILE_INTEGRATION.md` §4.4 and §5.9's "Group calls" note. Traced
  exactly in `ChatGateway.handleDisconnect`/`markOffline`
  (`chat.gateway.ts:126-187`) → `CallsService.endStaleCallsForUser`
  (`calls.service.ts:404-415`), and was empirically confirmed during
  development by dropping a joined participant's socket mid-call and
  observing the other side receive `call:end` with the call otherwise
  still `active`.
- Separately, your own client's ICE connection state
  (`RTCPeerConnection.oniceconnectionstatechange`) can go `disconnected` /
  `failed` on a network change even while the signaling socket stays up —
  that's a WebRTC-level reconnect (ICE restart), not something this server
  is involved in at all. Handle it client-side; don't conflate it with the
  socket-level `call:end` above.

---

## 4. Known gaps against a "full call feature" QA plan

Called out explicitly so QA doesn't spend time filing bugs against features
that were never built, and so mobile engineering knows what to build
client-side vs. what to expect from this backend:

| Expectation | Status |
|---|---|
| Server hands the client STUN/TURN servers | **Built** (`TASKS.md` Phase 9) — `GET /v1/calls/turn-credentials`, §2.2. Still requires an operator to have actually deployed a TURN server and configured `turn_secret`/`turn_urls` for *this* instance; the endpoint 500s cleanly if not. |
| Push notification (FCM/APNs) for an incoming call when the app has no live socket | **Not built**, explicitly on hold (see `TASKS.md` Phase 6) — a genuinely backgrounded/terminated app only learns about a call on next foreground/launch via `GET /v1/calls/active`, not instantly. |
| Automatic "missed call" after a ring timeout | **Not built** (§3.3) — a ringing call has no server-side expiry. |
| SFU / media server for large group calls | **Not built** — mesh WebRTC only; see `MOBILE_INTEGRATION.md` §4.4 for the practical participant-count ceiling. |

Everything else in this document — signaling, presence, targeted relay,
stale-call cleanup on disconnect, group call membership — is live and
verified against the running code.

---

*This document describes the call feature's integration surface as it
exists in the current codebase, not a target design — anything not yet
built is called out above, not implied.*
