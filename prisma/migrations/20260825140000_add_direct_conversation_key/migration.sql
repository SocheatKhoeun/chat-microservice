-- AlterTable
-- Nullable, no unique index yet on purpose — existing `direct` conversations
-- need `direct_key` backfilled (via the app's own directConversationKey()
-- util, not raw SQL, so the hash is byte-identical to what the app computes
-- at lookup time) before the unique index can be added safely. See the
-- follow-up migration `20260825140500_add_direct_conversation_key_unique_index`.
ALTER TABLE `conversations` ADD COLUMN `direct_key` VARCHAR(255) NULL;

-- AlterTable
-- Verified against the live DB before writing this: zero existing duplicate
-- (conversation_id, user_id) rows, so this applies clean with no backfill/dedupe
-- needed first.
-- CreateIndex
CREATE UNIQUE INDEX `conversation_members_conversation_id_user_id_key` ON `conversation_members`(`conversation_id`, `user_id`);
