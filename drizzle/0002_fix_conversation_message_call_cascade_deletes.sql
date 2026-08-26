ALTER TABLE `call_participants` DROP FOREIGN KEY `call_participants_call_id_calls_id_fk`;
--> statement-breakpoint
ALTER TABLE `calls` DROP FOREIGN KEY `calls_conversation_id_conversations_id_fk`;
--> statement-breakpoint
ALTER TABLE `conversation_members` DROP FOREIGN KEY `conversation_members_conversation_id_conversations_id_fk`;
--> statement-breakpoint
ALTER TABLE `messages` DROP FOREIGN KEY `messages_conversation_id_conversations_id_fk`;
--> statement-breakpoint
ALTER TABLE `messages` DROP FOREIGN KEY `messages_replied_message_id_messages_id_fk`;
--> statement-breakpoint
ALTER TABLE `message_reactions` DROP FOREIGN KEY `message_reactions_message_id_messages_id_fk`;
--> statement-breakpoint
ALTER TABLE `message_reads` DROP FOREIGN KEY `message_reads_message_id_messages_id_fk`;
--> statement-breakpoint
ALTER TABLE `message_deliveries` DROP FOREIGN KEY `message_deliveries_message_id_messages_id_fk`;
--> statement-breakpoint
ALTER TABLE `message_attachments` DROP FOREIGN KEY `message_attachments_message_id_messages_id_fk`;
--> statement-breakpoint
ALTER TABLE `call_participants` ADD CONSTRAINT `call_participants_call_id_calls_id_fk` FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_replied_message_id_messages_id_fk` FOREIGN KEY (`replied_message_id`) REFERENCES `messages`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reactions` ADD CONSTRAINT `message_reactions_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_reads` ADD CONSTRAINT `message_reads_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_deliveries` ADD CONSTRAINT `message_deliveries_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `message_attachments` ADD CONSTRAINT `message_attachments_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;