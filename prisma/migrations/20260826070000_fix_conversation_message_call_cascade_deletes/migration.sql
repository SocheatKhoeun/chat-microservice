-- Fixes: "Cannot delete or update a parent row: a foreign key constraint
-- fails (`conversation_members`, CONSTRAINT ..._conversation_id... FOREIGN
-- KEY ... ON DELETE NO ACTION)".
--
-- conversation_members, messages, and calls all reference conversations.id
-- (and message_reactions/message_reads/message_deliveries/message_attachments
-- reference messages.id, call_participants references calls.id) with the
-- default ON DELETE RESTRICT/NO ACTION. Deleting a conversation (or a
-- message, or a call) is blocked as long as any of its children still exist.
-- These are strict ownership chains, so cascade the delete instead of
-- restricting it.
--
-- DropForeignKey
ALTER TABLE `conversation_members` DROP FOREIGN KEY `conversation_members_conversation_id_fkey`;

-- DropForeignKey
ALTER TABLE `messages` DROP FOREIGN KEY `messages_conversation_id_fkey`;

-- DropForeignKey
ALTER TABLE `calls` DROP FOREIGN KEY `calls_conversation_id_fkey`;

-- DropForeignKey
ALTER TABLE `message_reactions` DROP FOREIGN KEY `message_reactions_message_id_fkey`;

-- DropForeignKey
ALTER TABLE `message_reads` DROP FOREIGN KEY `message_reads_message_id_fkey`;

-- DropForeignKey
ALTER TABLE `message_deliveries` DROP FOREIGN KEY `message_deliveries_message_id_fkey`;

-- DropForeignKey
ALTER TABLE `message_attachments` DROP FOREIGN KEY `message_attachments_message_id_fkey`;

-- DropForeignKey
ALTER TABLE `call_participants` DROP FOREIGN KEY `call_participants_call_id_fkey`;

-- AddForeignKey
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calls` ADD CONSTRAINT `calls_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `call_participants` ADD CONSTRAINT `call_participants_call_id_fkey` FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
