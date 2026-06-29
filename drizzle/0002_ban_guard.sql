-- Banning the final active superadmin locks the system out of administration just
-- as deleting or demoting it would, but neither existing guard fires on a ban (it
-- sets `banned`, not `role`, and doesn't delete the row). This closes that path (#46).
CREATE TRIGGER `guard_last_superadmin_ban`
BEFORE UPDATE OF `banned` ON `user`
FOR EACH ROW WHEN OLD.`role` = 'superadmin' AND OLD.`banned` = 0 AND NEW.`banned` = 1
  AND (SELECT COUNT(*) FROM `user` WHERE `role` = 'superadmin' AND `banned` = 0) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last superadmin cannot be banned');
END;
