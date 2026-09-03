-- Speeds up GET /api/v1/conversations (ConversationsService.listConversations),
-- which was doing a full table scan on `conversation_members` and an
-- unindexed per-conversation lookup on `messages` for every request.

-- Covers: WHERE user_id + left_at + is_archived, ORDER BY is_pinned,
-- conversation_id (also the cursor range and the total_unread_conversations
-- count query), all currently unindexed since the only existing index on
-- this table is the (conversation_id, user_id) unique constraint.
CREATE INDEX `conversation_members_user_id_is_archived_left_at_is_pinned_idx`
  ON `conversation_members` (`user_id`, `is_archived`, `left_at`, `is_pinned`, `conversation_id`);

-- Covers "last message per conversation" (ORDER BY id DESC scoped to
-- conversation_id) and the unread-count lookups, previously relying only on
-- the single-column FK index on conversation_id plus a filesort.
CREATE INDEX `messages_conversation_id_id_idx`
  ON `messages` (`conversation_id`, `id`);
