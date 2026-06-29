CREATE TABLE `agent_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`model` text,
	`system_prompt` text,
	`plan_instruction` text,
	`prompt_timeout_ms` integer,
	`updated_at` integer NOT NULL
);
