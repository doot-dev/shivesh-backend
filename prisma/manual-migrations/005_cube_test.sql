-- Cube testing: one or more concrete cube tests logged against an order.
--
-- Each test records when the cube was cast (castingDate), the quantity it
-- represents, the testing period (7/14/21 days from casting, or a custom
-- date), and an optional image/PDF of the result.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/005_cube_test.sql
--   npx prisma generate
--
-- Purely additive: a new table only, nothing existing changes.

CREATE TABLE `CubeTest` (
  `id`          VARCHAR(191) NOT NULL,
  `orderId`     VARCHAR(191) NOT NULL,
  `castingDate` DATETIME(3)  NOT NULL,
  `quantity`    VARCHAR(191) NOT NULL,
  `period`      ENUM('SEVEN_DAYS','FOURTEEN_DAYS','TWENTYONE_DAYS','CUSTOM') NOT NULL,
  `fromDate`    DATETIME(3)  NOT NULL,
  `toDate`      DATETIME(3)  NOT NULL,
  `fileUrl`     VARCHAR(191) NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL,
  `isDeleted`   BOOLEAN      NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  INDEX `CubeTest_orderId_idx` (`orderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CubeTest`
  ADD CONSTRAINT `CubeTest_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
