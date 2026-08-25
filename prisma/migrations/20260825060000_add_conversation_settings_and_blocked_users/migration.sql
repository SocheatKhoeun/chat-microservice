-- AlterTable
-- Per-member conversation organization (Phase 5: mute/archive/pin).
ALTER TABLE `conversation_members`
    ADD COLUMN `is_muted` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_archived` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pinned_at` DATETIME(3) NULL;

-- CreateTable
-- Collation matches this database's actual convention (utf8mb4_general_ci,
-- same as users.id/messages.id) rather than Prisma's usual generated default
-- (utf8mb4_unicode_ci) — see the message_deliveries migration for why.
CREATE TABLE `blocked_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blocker_id` VARCHAR(255) NOT NULL,
    `blocked_id` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- CreateIndex
CREATE UNIQUE INDEX `blocked_users_blocker_id_blocked_id_key` ON `blocked_users`(`blocker_id`, `blocked_id`);

-- AddForeignKey
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocker_id_fkey` FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocked_id_fkey` FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
