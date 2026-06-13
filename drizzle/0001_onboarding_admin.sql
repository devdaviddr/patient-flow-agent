CREATE TABLE `invite` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`used_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`used_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;--> statement-breakpoint
-- Last-superadmin invariant (B5, decision 5): a DB-level guard the admin plugin
-- and the self-service delete path both pass through and neither can bypass.
-- Deleting the final superadmin aborts the write.
CREATE TRIGGER `guard_last_superadmin_delete`
BEFORE DELETE ON `user`
FOR EACH ROW WHEN OLD.`role` = 'superadmin'
  AND (SELECT COUNT(*) FROM `user` WHERE `role` = 'superadmin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'last superadmin cannot be deleted');
END;--> statement-breakpoint
-- Demoting the final superadmin (changing its role to anything else) aborts too.
CREATE TRIGGER `guard_last_superadmin_demote`
BEFORE UPDATE OF `role` ON `user`
FOR EACH ROW WHEN OLD.`role` = 'superadmin' AND NEW.`role` <> 'superadmin'
  AND (SELECT COUNT(*) FROM `user` WHERE `role` = 'superadmin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'last superadmin cannot be demoted');
END;