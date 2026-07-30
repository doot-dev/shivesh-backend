-- Order: single vendor/technician -> multiple.
--
-- Creates OrderVendor + OrderTechnician, copies the existing single-value
-- columns into them, and only then drops those columns. Run this INSTEAD of
-- `prisma db push` for this change -- push would drop the columns without
-- copying the data first.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/001_order_multi_vendor_tech.sql
--   npx prisma generate
--
-- MySQL commits DDL implicitly, so this cannot run as one transaction. Take a
-- backup first; the steps are ordered so a failure part-way leaves the old
-- columns intact and readable.

-- ─── 1. New tables ───────────────────────────────────────────────────────────

CREATE TABLE `OrderVendor` (
  `id`               VARCHAR(191) NOT NULL,
  `orderId`          VARCHAR(191) NOT NULL,
  `vendorId`         INTEGER      NOT NULL,
  `vendorLocationId` INTEGER      NULL,
  `vendorHandlerId`  INTEGER      NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  `isDeleted`        BOOLEAN      NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  INDEX `OrderVendor_orderId_idx` (`orderId`),
  INDEX `OrderVendor_vendorId_idx` (`vendorId`),
  INDEX `OrderVendor_vendorLocationId_fkey` (`vendorLocationId`),
  INDEX `OrderVendor_vendorHandlerId_fkey` (`vendorHandlerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrderTechnician` (
  `id`        VARCHAR(191) NOT NULL,
  `orderId`   VARCHAR(191) NOT NULL,
  `userId`    INTEGER      NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  `isDeleted` BOOLEAN      NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  INDEX `OrderTechnician_orderId_idx` (`orderId`),
  INDEX `OrderTechnician_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── 2. Backfill from the columns about to be dropped ────────────────────────

INSERT INTO `OrderVendor`
  (`id`, `orderId`, `vendorId`, `vendorLocationId`, `vendorHandlerId`, `createdAt`, `updatedAt`, `isDeleted`)
SELECT UUID(), `o`.`id`, `o`.`vendorId`, `o`.`vendorLocationId`, `o`.`vendorHandlerId`,
       `o`.`createdAt`, NOW(3), false
FROM `Order` `o`
WHERE `o`.`vendorId` IS NOT NULL;

INSERT INTO `OrderTechnician`
  (`id`, `orderId`, `userId`, `createdAt`, `updatedAt`, `isDeleted`)
SELECT UUID(), `o`.`id`, `o`.`assignedToId`, `o`.`createdAt`, NOW(3), false
FROM `Order` `o`
WHERE `o`.`assignedToId` IS NOT NULL;

-- ─── 3. Foreign keys (after backfill, so bad legacy rows surface as errors) ───

ALTER TABLE `OrderVendor`
  ADD CONSTRAINT `OrderVendor_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrderVendor_vendorId_fkey`
    FOREIGN KEY (`vendorId`) REFERENCES `Vendor` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `OrderVendor_vendorLocationId_fkey`
    FOREIGN KEY (`vendorLocationId`) REFERENCES `VendorLocation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `OrderVendor_vendorHandlerId_fkey`
    FOREIGN KEY (`vendorHandlerId`) REFERENCES `VendorHandler` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `OrderTechnician`
  ADD CONSTRAINT `OrderTechnician_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrderTechnician_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── 4. Verify the copy before destroying the source ─────────────────────────
-- Both queries must return 0. If either does not, STOP and investigate: the
-- rows below are assignments that would be lost by step 5.

SELECT COUNT(*) AS `orders_with_vendor_not_copied`
FROM `Order` `o`
WHERE `o`.`vendorId` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `OrderVendor` `ov` WHERE `ov`.`orderId` = `o`.`id`);

SELECT COUNT(*) AS `orders_with_tech_not_copied`
FROM `Order` `o`
WHERE `o`.`assignedToId` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `OrderTechnician` `ot` WHERE `ot`.`orderId` = `o`.`id`);

-- ─── 5. Drop the old single-value columns ────────────────────────────────────

ALTER TABLE `Order` DROP FOREIGN KEY `Order_assignedToId_fkey`;
ALTER TABLE `Order` DROP FOREIGN KEY `Order_vendorId_fkey`;
ALTER TABLE `Order` DROP FOREIGN KEY `Order_vendorLocationId_fkey`;
ALTER TABLE `Order` DROP FOREIGN KEY `Order_vendorHandlerId_fkey`;

DROP INDEX `Order_assignedToId_idx` ON `Order`;

ALTER TABLE `Order`
  DROP COLUMN `assignedToId`,
  DROP COLUMN `vendorId`,
  DROP COLUMN `vendorLocationId`,
  DROP COLUMN `vendorHandlerId`;
