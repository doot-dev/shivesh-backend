-- TM approval, for display on the bill detail page.
--
-- Distinct from 002's version of these columns: approval no longer decides what
-- gets billed (the bill is calculated from the order's own quantity). It is now
-- a per-truck accept/reject record shown against each TM on the bill page, with
-- a reason required on rejection.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/004_tm_approval_restore.sql
--   npx prisma generate
--
-- Purely additive. Existing TMs default to PENDING.

ALTER TABLE `TmDetail`
  ADD COLUMN `approvalStatus`  ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `rejectionReason` TEXT        NULL,
  ADD COLUMN `approvedAt`      DATETIME(3) NULL;
