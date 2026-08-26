CREATE TABLE `blocked_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blocker_id` varchar(255) NOT NULL,
	`blocked_id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `blocked_users_blocker_id_blocked_id_unique` UNIQUE(`blocker_id`,`blocked_id`)
);
--> statement-breakpoint
CREATE TABLE `message_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`message_id` int NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`delivered_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `message_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_deliveries_message_id_user_id_unique` UNIQUE(`message_id`,`user_id`)
);
--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `is_muted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `is_archived` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `is_pinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `pinned_at` timestamp;--> statement-breakpoint
ALTER TABLE `conversations` ADD `direct_key` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `edited_at` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `deleted_at` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `is_pinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_at` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `pinned_by` varchar(255);--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversation_id_user_id_unique` UNIQUE(`conversation_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_direct_key_unique` UNIQUE(`direct_key`);--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_message_id_user_id_unique` UNIQUE(`message_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_message_id_user_id_unique` UNIQUE(`message_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocker_id_users_id_fk` FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocked_id_users_id_fk` FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_pinned_by_users_id_fk` FOREIGN KEY (`pinned_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;