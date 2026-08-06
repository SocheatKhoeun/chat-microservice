CREATE TABLE `oauth_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` varchar(191) NOT NULL,
	`client_secret` varchar(191) NOT NULL,
	`grant_type_id` int NOT NULL,
	`is_disabled` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_clients_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_clients_client_id_unique` UNIQUE(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_client_grant_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(191) NOT NULL,
	`description` varchar(191),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_client_grant_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_client_grant_types_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hash` varchar(16) NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` varchar(255) NOT NULL,
	`description` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `oauth_clients` ADD CONSTRAINT `oauth_clients_grant_type_id_oauth_client_grant_types_id_fk` FOREIGN KEY (`grant_type_id`) REFERENCES `oauth_client_grant_types`(`id`) ON DELETE no action ON UPDATE no action;