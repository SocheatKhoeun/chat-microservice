-- CreateIndex
-- Follow-up to 20260825140000_add_direct_conversation_key: applied only
-- after the app-level backfill (directConversationKey(), not raw SQL) ran
-- against every pre-existing `direct` conversation — verified 0 remaining
-- NULLs and 0 collisions before this was written. `group` conversations
-- keep `direct_key` NULL forever; MySQL unique indexes allow multiple NULLs,
-- so they never collide with each other.
CREATE UNIQUE INDEX `conversations_direct_key_key` ON `conversations`(`direct_key`);
