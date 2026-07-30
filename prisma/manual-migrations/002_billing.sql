-- Billing: Bill table + TM approval fields.
--
-- Purely additive: no column is dropped and no existing row changes meaning.
-- Existing TmDetail rows default to approvalStatus='PENDING', which means they
-- are NOT billable until someone accepts them.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/002_billing.sql
--   npx prisma generate
--
-- Run 001_order_multi_vendor_tech.sql first.

-- ─── 1. TM approval (separate from DeliveryStatus, which tracks the truck) ───

ALTER TABLE `TmDetail`
  ADD COLUMN `approvalStatus`  ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `rejectionReason` TEXT        NULL,
  ADD COLUMN `approvedAt`      DATETIME(3) NULL;

-- ─── 2. Bill ─────────────────────────────────────────────────────────────────

CREATE TABLE `Bill` (
  `id`        VARCHAR(191) NOT NULL,
  `billNo`    VARCHAR(191) NOT NULL,
  `orderId`   VARCHAR(191) NOT NULL,
  `quantity`  DOUBLE       NOT NULL,
  `rate`      DOUBLE       NOT NULL,
  `amount`    DOUBLE       NOT NULL,
  `status`    ENUM('PENDING','SENT','PAID','OVERDUE','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `issueDate` DATETIME(3)  NULL,
  `dueDate`   DATETIME(3)  NULL,
  `paidAt`    DATETIME(3)  NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  `isDeleted` BOOLEAN      NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Bill_billNo_key` (`billNo`),
  UNIQUE INDEX `Bill_orderId_key` (`orderId`),
  INDEX `Bill_orderId_idx` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Bill`
  ADD CONSTRAINT `Bill_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
