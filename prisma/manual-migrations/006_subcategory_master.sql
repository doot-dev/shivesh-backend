-- Sub-category becomes its own master table.
--
-- Before: `Size.subcategory` was a free-text column typed in per grade, so the
-- same sub-category ("Pure OPC") was re-entered on every size row and could
-- drift in spelling. After: `Subcategory` is a standalone master with its own
-- CRUD, and consumers copy the NAME by value.
--
-- ProjectProduct gains its own `subcategory` string column. It is deliberately
-- NOT a foreign key to Subcategory — a project product records the sub-category
-- that was chosen at the time it was created, so renaming or deactivating a
-- master entry later must not rewrite existing project products.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/006_subcategory_master.sql
--   npx prisma generate
--
-- Run order matters: the master table is seeded from the existing Size values
-- BEFORE the old column is dropped, otherwise the data is gone.

-- 1. New master table.
CREATE TABLE `Subcategory` (
  `id`        INTEGER      NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(191) NOT NULL,
  `isActive`  BOOLEAN      NOT NULL DEFAULT true,
  `isDeleted` BOOLEAN      NOT NULL DEFAULT false,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Subcategory_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Seed the master from the distinct sub-categories already typed into Size.
--    Blank values are skipped; the unique index de-dupes the rest.
INSERT INTO `Subcategory` (`name`, `updatedAt`)
SELECT DISTINCT TRIM(`subcategory`), CURRENT_TIMESTAMP(3)
FROM `Size`
WHERE `subcategory` IS NOT NULL AND TRIM(`subcategory`) <> '';

-- 3. ProjectProduct carries its own copied-by-value sub-category.
ALTER TABLE `ProjectProduct`
  ADD COLUMN `subcategory` VARCHAR(191) NOT NULL DEFAULT '';

-- 4. Backfill existing project products by matching their grade to the Size row
--    it came from. ProjectProduct stores grade as a plain name, so match on
--    productName + productGrade via Product/Size; anything that doesn't match
--    keeps the '' default and can be set by an admin on next edit.
UPDATE `ProjectProduct` `pp`
JOIN `Product` `p`
  ON `p`.`name` = `pp`.`productName`
JOIN `Size` `s`
  ON `s`.`productId` = `p`.`id`
 AND `s`.`name` = `pp`.`productGrade`
SET `pp`.`subcategory` = TRIM(`s`.`subcategory`)
WHERE `s`.`subcategory` IS NOT NULL AND TRIM(`s`.`subcategory`) <> '';

-- 5. Finally drop the old per-size column.
ALTER TABLE `Size` DROP COLUMN `subcategory`;
