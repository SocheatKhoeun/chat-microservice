-- AlterTable
ALTER TABLE `messages` ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `edited_at` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `message_reactions_message_id_user_id_key` ON `message_reactions`(`message_id`, `user_id`);
