# Flutter Integration — Presence (Online/Offline)

Companion to [`MOBILE_INTEGRATION.md`](./MOBILE_INTEGRATION.md) — this doc
only covers wiring up **presence** (green/grey dot, "last seen") in a
Flutter client. It assumes you've already got REST login
([§2.1](./MOBILE_INTEGRATION.md#21-get-a-user-access-token-rest)) and a
connected `/chat` socket
([§2.2](./MOBILE_INTEGRATION.md#22-websocket-authentication)) working.

## 1. The three events

| Event | When it fires | Payload |
|---|---|---|
| `presence:list` | Once, right after your socket authenticates (including every reconnect) | `[{ user_id, online, last_seen_at }]` — every current contact's status |
| `presence:online` | A contact's *first* device connects | `{ user_id }` |
| `presence:offline` | A contact's *last* device disconnects | `{ user_id, last_seen_at }` |

`presence:list` exists specifically so your conversation-list screen has an
answer immediately on load — `presence:online`/`presence:offline` only fire
on a *change*, so without the snapshot you'd have no idea who's online until
someone's status happens to flip while you're connected.

`last_seen_at` is `null` whenever the user is currently online (there's
nothing to show) — it's only populated once they've gone offline. The
underlying database value isn't cleared on login; it's the API layer that
masks it based on live connection state, so don't be surprised if a raw DB
row still shows an old date for someone who's online right now.

Only your **contacts** (anyone you share an active conversation with) are
included — this is not a global user directory.

## 2. Add the dependency

```yaml
# pubspec.yaml
dependencies:
  socket_io_client: ^2.0.3+1
```

## 3. Connect

Same token as REST, passed via `auth` (matches
[§2.2](./MOBILE_INTEGRATION.md#22-websocket-authentication) — query-string
tokens are not supported):

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket connectChatSocket(String serverUrl, String accessToken) {
  final socket = IO.io(
    '$serverUrl/chat',
    IO.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'token': accessToken})
        .build(),
  );
  return socket;
}
```

## 4. `PresenceService`

One small `ChangeNotifier` that owns the online/last-seen state for every
contact and stays in sync for the life of the socket:

```dart
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class PresenceService extends ChangeNotifier {
  PresenceService(this._socket) {
    _socket.on('presence:list', _onList);
    _socket.on('presence:online', _onOnline);
    _socket.on('presence:offline', _onOffline);
  }

  final IO.Socket _socket;
  final Map<String, bool> _online = {};
  final Map<String, DateTime?> _lastSeen = {};

  bool isOnline(String userId) => _online[userId] ?? false;
  DateTime? lastSeen(String userId) => _lastSeen[userId];

  void _onList(dynamic data) {
    for (final entry in (data as List)) {
      final id = entry['user_id'] as String;
      _online[id] = entry['online'] as bool;
      _lastSeen[id] = _parse(entry['last_seen_at']);
    }
    notifyListeners();
  }

  void _onOnline(dynamic data) {
    _online[data['user_id'] as String] = true;
    notifyListeners();
  }

  void _onOffline(dynamic data) {
    final id = data['user_id'] as String;
    _online[id] = false;
    _lastSeen[id] = _parse(data['last_seen_at']);
    notifyListeners();
  }

  DateTime? _parse(dynamic v) =>
      v == null ? null : DateTime.parse(v as String);

  @override
  void dispose() {
    _socket.off('presence:list', _onList);
    _socket.off('presence:online', _onOnline);
    _socket.off('presence:offline', _onOffline);
    super.dispose();
  }
}
```

Construct it once, right after connecting, and keep it alive for the app's
lifetime (same rule as the socket itself —
[§5.1](./MOBILE_INTEGRATION.md#51-keep-one-socket-alive-globally)):

```dart
final socket = connectChatSocket(serverUrl, accessToken);
final presence = PresenceService(socket);
```

## 5. Use it in your conversation list

```dart
class PresenceDot extends StatelessWidget {
  const PresenceDot({super.key, required this.online});
  final bool online;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: online ? const Color(0xFF1FAA73) : const Color(0xFF9AA39C),
        border: Border.all(
          color: Theme.of(context).scaffoldBackgroundColor,
          width: 2,
        ),
      ),
    );
  }
}
```

```dart
ListenableBuilder(
  listenable: presence,
  builder: (context, _) {
    final online = presence.isOnline(conversation.otherUserId);
    final seen = presence.lastSeen(conversation.otherUserId);
    return ListTile(
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(child: Text(conversation.otherUserId[0])),
          Positioned(right: -2, bottom: -2, child: PresenceDot(online: online)),
        ],
      ),
      title: Text(conversation.otherUserId),
      subtitle: Text(online ? 'Online' : _lastSeenLabel(seen)),
    );
  },
)

String _lastSeenLabel(DateTime? seen) =>
    seen == null ? 'Offline' : 'Last seen ${TimeOfDay.fromDateTime(seen).format(context)}';
```

`conversation.otherUserId` is `sender_id` from
[`GET /v1/conversations`](./MOBILE_INTEGRATION.md#get-v1conversations) for a
`direct` conversation.

## 6. Gotchas

- **Multiple devices don't flicker.** Presence is ref-counted server-side —
  a contact only flips offline once *every* device of theirs disconnects.
- **Reconnects are handled for you.** A fresh `presence:list` snapshot
  arrives on every successful (re)connection, so you never need to manually
  re-request it after a network drop.
- **Don't dispose the socket's listeners twice.** If you rebuild
  `PresenceService` on hot-reload/reconnect without disposing the old one
  first, you'll get duplicate `notifyListeners()` calls — call `dispose()`
  before creating a new instance.
