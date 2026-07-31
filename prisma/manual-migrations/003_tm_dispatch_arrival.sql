-- TM details: dispatch/arrival timings, and challans that arrive later.
--
-- Purely additive plus three widenings. No column is dropped and no existing
-- row changes meaning: the two new columns are NULL on existing TMs, and the
-- three MODIFYs only relax NOT NULL to NULL.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/003_tm_dispatch_arrival.sql
--   npx prisma generate
--
-- Run 001_order_multi_vendor_tech.sql and 002_billing.sql first. Note that step
-- 1 of 002 (the TmDetail approval columns) was reverted out of the schema when
-- billing stopped depending on TMs -- if it never ran, nothing here needs it.

-- ─── 1. Dispatch and arrival timings ─────────────────────────────────────────

ALTER TABLE `TmDetail`
  ADD COLUMN `dispatchTime` VARCHAR(191) NULL AFTER `qty`,
  ADD COLUMN `arrivalTime`  VARCHAR(191) NULL AFTER `dispatchTime`;

-- ─── 2. Details that are only known later ────────────────────────────────────
-- TMs can now be planned when the order is created, with batch timings and the
-- challan filled in once the truck actually runs. Existing rows already have
-- values, so relaxing these breaks nothing.

ALTER TABLE `TmDetail`
  MODIFY COLUMN `batchStartTime` VARCHAR(191) NULL,
  MODIFY COLUMN `batchEndTime`   VARCHAR(191) NULL,
  MODIFY COLUMN `challanNo`      VARCHAR(191) NULL;
