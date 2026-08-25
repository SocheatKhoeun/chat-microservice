-- AlterTable
-- Message-level pin (distinct from the conversation-level pin already on
-- conversation_members). `pinned_by` is nullable and cleared alongside
-- `is_pinned`/`pinned_at` on unpin.
ALTER TABLE `messages`
    ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinned_at` DATETIME(3) NULL,
    ADD COLUMN `pinned_by` VARCHAR(255) NULL;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_pinned_by_fkey` FOREIGN KEY (`pinned_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
