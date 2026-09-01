# Flutter Integration — Calls (Voice/Video)

Companion to [`MOBILE_INTEGRATION.md`](./MOBILE_INTEGRATION.md) §3.5/§4.4/§5.9
and [`CALL_INTEGRATION_FLOW.md`](./CALL_INTEGRATION_FLOW.md) — this doc is
the Flutter-specific "how do I actually write this" version of those. It
assumes you've already got REST login, a connected `/chat` socket, and
(ideally) presence wired up per
[`FLUTTER_INTEGRATION.md`](./FLUTTER_INTEGRATION.md) — the same socket is
reused for calling, you don't open a second connection.

**What this server does for you**: relays your WebRTC signaling (offer,
answer, ICE candidates) between devices over their existing sockets, and
hands out TURN credentials. **What it never touches**: the actual audio/video
— that's a direct peer-to-peer connection between the calling devices,
entirely your WebRTC stack's job.

## 1. Dependencies & permissions

```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^2.0.3+1
  flutter_webrtc: ^0.11.0
```

Camera/mic permissions, required on both platforms before `getUserMedia`
will succeed:

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

```xml
<!-- ios/Runner/Info.plist -->
<key>NSCameraUsageDescription</key>
<string>Needed for video calls</string>
<key>NSMicrophoneUsageDescription</key>
<string>Needed for voice and video calls</string>
```

## 2. Fetch TURN/STUN credentials before every call

```dart
Future<List<Map<String, dynamic>>> fetchIceServers(String serverUrl, String accessToken) async {
  final res = await http.get(
    Uri.parse('$serverUrl/api/v1/calls/turn-credentials'),
    headers: {'Authorization': 'Bearer $accessToken'},
  );
  if (res.statusCode == 500) {
    // No TURN server configured for this deployment — not your bug.
    // Fall back to a bundled STUN-only config, or surface a clear warning.
    return [{'urls': 'stun:stun.l.google.com:19302'}];
  }
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  return List<Map<String, dynamic>>.from(body['iceServers']);
}
```

Fetch a fresh set right before `startCall`/`answer` — the `turn:` entries'
credentials expire (~1 hour), don't cache indefinitely.

## 3. Global `CallManager`

Per [§5.9](./MOBILE_INTEGRATION.md#59-global-call-handling): call state is
**global**, not screen state. One `ChangeNotifier`, created once alongside
your socket, listened to by an app-root overlay so an incoming call
interrupts whatever screen is open.

```dart
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

enum CallStatus { idle, ringing, active }

class CallManager extends ChangeNotifier {
  CallManager(this._socket, this._fetchIceServers) {
    _socket.on('call:invite', _onInvite);
    _socket.on('call:participant-joined', _onParticipantJoined);
    _socket.on('call:answer', _onRemoteSignal);
    _socket.on('call:ice-candidate', _onRemoteSignal);
    _socket.on('call:reject', _onReject);
    _socket.on('call:end', _onEnd);
  }

  final IO.Socket _socket;
  final Future<List<Map<String, dynamic>>> Function() _fetchIceServers;

  String? callHash;
  String? conversationHash;
  String callerId = '';
  String type = 'audio';
  CallStatus status = CallStatus.idle;

  MediaStream? localStream;
  final Map<String, MediaStream> remoteStreams = {};
  final Map<String, RTCPeerConnection> _peers = {};
  final Map<String, List<RTCIceCandidate>> _pendingCandidates = {};

  // ... populated by the sections below
}
```

Keyed by `call_hash` — the server guarantees one ringing/active call per
conversation, and re-emitting `call:ring`/`call:answer`/`call:end` for a
call you're already in is safe (idempotent), so treat a duplicate/replayed
event as a no-op rather than a second overlay.

**Hydrate on cold start / foreground**, not just from the socket push — a
backgrounded or terminated app can miss the push entirely:

```dart
Future<void> hydrate() async {
  final res = await http.get(Uri.parse('$serverUrl/api/v1/calls/active'),
      headers: {'Authorization': 'Bearer $accessToken'});
  final data = (jsonDecode(res.body)['data'] as List);
  if (data.isEmpty) return;
  final call = data.first; // reconcile into the same state the socket writes to
  callHash = call['hash'];
  conversationHash = call['conversation_id'].toString();
  type = call['type'];
  status = call['status'] == 'active' ? CallStatus.active : CallStatus.ringing;
  notifyListeners();
}
```

## 4. Placing a call

```dart
Future<void> startCall(String conversationHash, String type, List<String> inviteeIds) async {
  final ack = await _emitWithAck('call:invite', {
    'conversation_hash': conversationHash,
    'type': type, // 'audio' | 'video'
  });
  if (ack['success'] != true) {
    throw Exception(ack['message']); // e.g. "already an active call in this conversation"
  }

  callHash = ack['data']['hash'];
  this.conversationHash = conversationHash;
  this.type = type;
  status = CallStatus.ringing;
  notifyListeners();

  localStream = await navigator.mediaDevices.getUserMedia({
    'audio': true,
    'video': type == 'video' ? {'facingMode': 'user'} : false,
  });

  // One RTCPeerConnection per invitee — offer up front, before anyone's answered.
  for (final userId in inviteeIds) {
    final pc = await _peerFor(userId);
    final offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // No dedicated "send offer" event — it piggybacks on the generic
    // targeted-relay channel, same as any other ICE payload.
    _socket.emit('call:ice-candidate', {
      'call_hash': callHash,
      'target_user_id': userId,
      'signal': {'type': offer.type, 'sdp': offer.sdp},
    });
  }
}
```

Render "ringing…" driven by `call:participant-joined`/`call:reject`/
`call:end` from here, until someone answers or the user cancels with
`call:end`. **There's no server-side ring timeout** — a call nobody answers
stays `ringing` forever until you end it; a "missed after N seconds" UX is
entirely your client's timer.

## 5. Receiving a call

The global listener from step 3 already catches `call:invite` no matter what
screen is open:

```dart
void _onInvite(dynamic data) {
  callHash = data['hash'];
  conversationHash = data['conversation_hash'];
  callerId = data['caller_id'];
  type = data['type'];
  status = CallStatus.ringing;
  notifyListeners(); // render the incoming-call overlay at the app root
}

Future<void> answer() async {
  await _emitWithAck('call:ring', {'call_hash': callHash}); // optional, lets the caller see "ringing on their device"
  localStream = await navigator.mediaDevices.getUserMedia({
    'audio': true,
    'video': type == 'video' ? {'facingMode': 'user'} : false,
  });
  // The offer itself arrives via call:ice-candidate — handled in
  // _onRemoteSignal below, which creates+sends the answer once it
  // recognizes an offer payload.
}
```

## 6. The one non-obvious part: `call:ice-candidate` carries two different things

The server treats `signal` as completely opaque — it just relays whatever
you send. That means **the same event carries both the initial SDP offer
and every subsequent ICE candidate**; your client has to tell them apart by
shape:

```dart
Future<void> _onRemoteSignal(dynamic data) async {
  final fromUserId = data['user_id'] as String;
  final signal = Map<String, dynamic>.from(data['signal']);
  final pc = await _peerFor(fromUserId);

  if (signal['sdp'] != null) {
    // It's an SDP offer or answer.
    await pc.setRemoteDescription(RTCSessionDescription(signal['sdp'], signal['type']));
    await _flushPendingCandidates(fromUserId, pc);

    if (signal['type'] == 'offer') {
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      final ack = await _emitWithAck('call:answer', {
        'call_hash': callHash,
        'target_user_id': fromUserId,
        'signal': {'type': answer.type, 'sdp': answer.sdp},
      });
      if (ack['success'] == true) {
        status = CallStatus.active;
        notifyListeners();
      }
    }
  } else {
    // It's a plain ICE candidate.
    final candidate = RTCIceCandidate(
      signal['candidate'], signal['sdpMid'], signal['sdpMLineIndex'],
    );
    if ((await pc.getRemoteDescription()) == null) {
      // Candidates commonly arrive before/alongside the SDP that
      // negotiates them — addCandidate() throws until the remote
      // description is set, so buffer until then.
      (_pendingCandidates[fromUserId] ??= []).add(candidate);
    } else {
      await pc.addCandidate(candidate);
    }
  }
}

Future<void> _flushPendingCandidates(String userId, RTCPeerConnection pc) async {
  for (final c in _pendingCandidates.remove(userId) ?? const []) {
    await pc.addCandidate(c);
  }
}

Future<RTCPeerConnection> _peerFor(String userId) async {
  final existing = _peers[userId];
  if (existing != null) return existing;

  final pc = await createPeerConnection({'iceServers': await _fetchIceServers()});
  localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream!));

  pc.onIceCandidate = (c) {
    if (c.candidate == null) return;
    _socket.emit('call:ice-candidate', {
      'call_hash': callHash,
      'target_user_id': userId,
      'signal': c.toMap(),
    });
  };
  pc.onTrack = (event) {
    remoteStreams[userId] = event.streams[0];
    notifyListeners(); // attach to an RTCVideoRenderer in your UI
  };

  _peers[userId] = pc;
  return pc;
}
```

`call:answer`'s own broadcast is **targeted** (only the caller's device
receives it) and also fires the separate, all-participants broadcast
`call:participant-joined` — status only, no SDP, safe to render "so-and-so
joined" from without touching any peer connection:

```dart
void _onParticipantJoined(dynamic data) {
  // { call_hash, user_id, status } — no SDP. UI-only update.
  notifyListeners();
}
```

## 7. In-call controls: camera on/off, mute, switch camera

Only camera-off and mic-mute are relayed to the other participant — the
server has a dedicated `call:media-state` event for exactly that (fanned out
to everyone else in the call, same as `call:participant-joined`, not
targeted at one peer like `call:ice-candidate`). **Switching front/back
camera never touches the server at all** — it's a local device swap that
replaces the outgoing video track on your existing peer connections; the
remote side just keeps receiving frames on the same track, no signaling
needed.

Add to `CallManager`:

```dart
bool videoEnabled = true;
bool audioEnabled = true;
final Map<String, bool> remoteVideoEnabled = {}; // per-user_id, from call:media-state
final Map<String, bool> remoteAudioEnabled = {};

CallManager(this._socket, this._fetchIceServers) {
  _socket.on('call:invite', _onInvite);
  _socket.on('call:participant-joined', _onParticipantJoined);
  _socket.on('call:answer', _onRemoteSignal);
  _socket.on('call:ice-candidate', _onRemoteSignal);
  _socket.on('call:media-state', _onRemoteMediaState);   // new
  _socket.on('call:reject', _onReject);
  _socket.on('call:end', _onEnd);
}
```

### 🎥 Turn camera on/off

```dart
Future<void> toggleVideo() async {
  videoEnabled = !videoEnabled;
  localStream?.getVideoTracks().forEach((t) => t.enabled = videoEnabled);
  await _emitWithAck('call:media-state', {
    'call_hash': callHash,
    'video_enabled': videoEnabled,
    'audio_enabled': audioEnabled,
  });
  notifyListeners();
}
```

### 🎤 Mute/unmute microphone

```dart
Future<void> toggleAudio() async {
  audioEnabled = !audioEnabled;
  localStream?.getAudioTracks().forEach((t) => t.enabled = audioEnabled);
  await _emitWithAck('call:media-state', {
    'call_hash': callHash,
    'video_enabled': videoEnabled,
    'audio_enabled': audioEnabled,
  });
  notifyListeners();
}
```

Both send the **full current state**, not a delta — the server holds no
media state of its own, it's a pure relay, so each event has to be
self-contained.

### 🔄 Switch front/back camera

Purely local — `flutter_webrtc`'s `Helper.switchCamera` swaps the capture
device on the existing video track without renegotiating anything:

```dart
Future<void> switchCamera() async {
  final videoTrack = localStream?.getVideoTracks().firstOrNull;
  if (videoTrack != null) await Helper.switchCamera(videoTrack);
}
```

No event, no `notifyListeners()` needed for the remote side — they keep
receiving the same track, just from whichever lens is now active.

### Receiving the other participant's camera/mic state

```dart
void _onRemoteMediaState(dynamic data) {
  final userId = data['user_id'] as String;
  remoteVideoEnabled[userId] = data['video_enabled'] as bool;
  remoteAudioEnabled[userId] = data['audio_enabled'] as bool;
  notifyListeners(); // swap that tile to an avatar/mic-muted icon instead of a frozen frame
}
```

Without this, a peer disabling their camera just freezes on the last frame
on your screen — `RTCPeerConnection`'s own `track.onmute` fires on
network-level RTP gaps, not on the remote side's local `enabled` flag, so
there's no free signal here. `call:media-state` is what makes "camera off"
render as a deliberate state instead of looking like a stalled connection.

## 8. Ending a call

```dart
Future<void> endCall() async {
  await _emitWithAck('call:end', {'call_hash': callHash});
}

void _onEnd(dynamic data) {
  if (data['call_hash'] != callHash) return;
  if (data['status'] == 'ringing' || data['status'] == 'active') {
    // The call is still going for everyone else — only data['user_id'] left.
    _teardownPeer(data['user_id'] as String);
  } else {
    _teardownEverything(); // status is 'ended' — the owner ended it, or it dropped below 2 joined
  }
  notifyListeners();
}
```

**Always check `status` before tearing down your whole call UI.** Who sent
`call:end` changes what it means:

- The call's **owner** ending it ends it for **everyone**, even mid a group
  call.
- Anyone **else** ending it just **leaves** — the call keeps going for the
  rest while ≥2 participants remain `joined`.

The same teardown-one-participant path also runs automatically if a
participant's socket cleanly disconnects mid-call (app killed, network drop
that outlasts Socket.IO's own reconnect window) — the server ends their
participation and broadcasts `call:end` for just them. A **brief** network
blip that Socket.IO's reconnect absorbs needs no handling at all; only a
real disconnect triggers this. Separately, your own
`RTCPeerConnection.onIceConnectionState` can go `disconnected`/`failed` on a
network change even while the socket stays up — that's an ICE-level
reconnect, unrelated to the signaling socket, and entirely your WebRTC
stack's concern.

## 9. Group calls

Everything above already generalizes — a call can have more than two
participants. The only change is UI and peer bookkeeping:

- Render remote video as a **list keyed by `user_id`** (`remoteStreams`
  above), not a fixed local/remote pair.
- One `RTCPeerConnection` per *other* participant (`_peers`, above).
- **Offer topology, so nobody double-offers**: the caller offers to every
  invitee up front (step 4). Whoever *answers/joins* additionally offers to
  every other participant already `joined` at that moment (read that list
  fresh off the `call:ring`/`call:answer` ack's `participants` array —
  don't reuse the original `call:invite` payload, it can be stale).
  Everyone else only ever answers incoming offers.
- This is mesh WebRTC, not an SFU — every client uploads N-1 streams. Fine
  for a handful of people; there's no server-side participant cap, so the
  real ceiling is upload bandwidth/CPU, not a request parameter.

## FAQ

**Should I hide the call button when someone's offline?** No.
`call:invite` rings every active member regardless of presence — an
offline recipient's device just has no socket to receive it right then, and
finds out via `GET /v1/calls/active` next time it connects. Use presence
for the green dot, not as a call-button guard.

**My incoming-call overlay didn't show up while the app was backgrounded.**
Expected — there's no push notification (FCM/APNs) for calls today; a
genuinely backgrounded/terminated app only learns about a missed call on
its next foreground/launch, via the `hydrate()` call in step 3.

**Do I need a second socket connection for calls?** No — reuse the same
`/chat` socket from your presence/messaging setup. Call events land on the
same personal room as everything else.

**The TURN endpoint returned a 500.** That means this deployment hasn't
configured a TURN server yet — an ops gap, not a client bug. Fall back to a
bundled STUN-only config (see step 2) and, ideally, surface "calls may not
work off your local network."
