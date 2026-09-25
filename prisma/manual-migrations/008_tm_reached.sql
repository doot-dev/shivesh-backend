-- Phase 1A (docs/00-master-plan.md): truck "Reached site", site rejection,
-- cube-test periods 15/28 days, and a unit per product.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/008_tm_reached.sql
--   npx prisma generate
--
-- Purely additive: enum values are appended (existing rows keep their values),
-- new columns are nullable or defaulted. Take a backup anyway.

-- REACHED sits between IN_TRANSIT and DELIVERED. Order.deliveryStatus and
-- TmDetail.status each carry their own copy of the enum in MySQL.
ALTER TABLE `Order`
  MODIFY COLUMN `deliveryStatus` ENUM('ASSIGNED','IN_TRANSIT','REACHED','DELIVERED','COMPLETED') NOT NULL DEFAULT 'ASSIGNED';

-- Who rejected a truck at site, and when (W32). approvalStatus/rejectionReason
-- already exist from 004.
ALTER TABLE `TmDetail`
  MODIFY COLUMN `status` ENUM('ASSIGNED','IN_TRANSIT','REACHED','DELIVERED','COMPLETED') NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN `rejectedAt`     DATETIME(3)  NULL,
  ADD COLUMN `rejectedByType` VARCHAR(16)  NULL,   -- CLIENT | USER
  ADD COLUMN `rejectedById`   VARCHAR(191) NULL;

-- D21: 7 / 15 / 28 days + custom. 14 and 21 stay for existing rows, hidden in the UI.
ALTER TABLE `CubeTest`
  MODIFY COLUMN `period` ENUM('SEVEN_DAYS','FOURTEEN_DAYS','FIFTEEN_DAYS','TWENTYONE_DAYS','TWENTYEIGHT_DAYS','CUSTOM') NOT NULL;

-- W38: Shivesh trades many materials. Existing products are RMC, so CBM + concrete.
ALTER TABLE `Product`
  ADD COLUMN `unit`       VARCHAR(16) NOT NULL DEFAULT 'CBM',
  ADD COLUMN `isConcrete` BOOLEAN     NOT NULL DEFAULT true;
