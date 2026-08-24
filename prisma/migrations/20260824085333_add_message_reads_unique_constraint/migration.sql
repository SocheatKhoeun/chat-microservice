-- CreateIndex
CREATE UNIQUE INDEX `message_reads_message_id_user_id_key` ON `message_reads`(`message_id`, `user_id`);
