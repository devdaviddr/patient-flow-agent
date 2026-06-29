CREATE TABLE `decision_record` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`type` text NOT NULL,
	`state_ref` text NOT NULL,
	`rationale` text NOT NULL,
	`payload` text NOT NULL,
	`actor` text,
	`created_at` integer NOT NULL
);
