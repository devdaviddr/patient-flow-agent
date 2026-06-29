CREATE TABLE `auth_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`target_id` text,
	`detail` text,
	`created_at` integer NOT NULL
);
