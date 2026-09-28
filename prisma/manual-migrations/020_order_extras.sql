-- 020: extra services on orders (pumping, part load, other) + project PO rates (2026-09-29). Additive.
-- AlterTable
ALTER TABLE `Bill` ADD COLUMN `extrasAmount` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `partLoadRate` DOUBLE NULL,
    ADD COLUMN `pumpingRate` DOUBLE NULL;

-- CreateTable
CREATE TABLE `OrderExtra` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `addedById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,
    `removedById` INTEGER NULL,
    `removeReason` TEXT NULL,

    INDEX `OrderExtra_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderExtra` ADD CONSTRAINT `OrderExtra_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderExtra` ADD CONSTRAINT `OrderExtra_addedById_fkey` FOREIGN KEY (`addedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions: anyone in the Shivesh team who works orders or billing may add
-- extras; removing them is for billing (the accountant). Super admin has all.
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp
  JOIN (SELECT 'orderExtras.view' AS p UNION ALL SELECT 'orderExtras.create') s
  WHERE rp.`permission` IN ('orders.update', 'billing.update');
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT `roleId`, 'orderExtras.delete' FROM `RolePermission` WHERE `permission` = 'billing.update';
