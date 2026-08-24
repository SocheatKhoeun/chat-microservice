-- AlterTable
ALTER TABLE `users` ADD COLUMN `last_seen_at` DATETIME(3) NULL;

-- CreateTable
-- Collation matches this database's actual convention (utf8mb4_general_ci,
-- same as users.id/messages.id below) rather than Prisma's usual generated
-- default (utf8mb4_unicode_ci) — this DB was originally provisioned by
-- drizzle-kit push, not by replaying these Prisma migration files, so its
-- real column collations don't match what Prisma would generate by default.
CREATE TABLE `message_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message_id` INTEGER NOT NULL,
    `user_id` VARCHAR(255) NOT NULL,
    `delivered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- CreateIndex
CREATE UNIQUE INDEX `message_deliveries_message_id_user_id_key` ON `message_deliveries`(`message_id`, `user_id`);

-- AddForeignKey
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
