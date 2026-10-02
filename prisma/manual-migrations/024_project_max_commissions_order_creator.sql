-- 024 (2026-10-02). Additive.
--   Project.maxQty: agreed project volume in CBM, display only.
--   ProjectCommission + CommissionPayout: many commission people per project,
--     each with their own rate; payouts recorded against them.
--   Order.createdByType / createdByName: who booked the order.
--   (fieldOrders.create is granted per FT by an admin; nothing is granted here.)

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `maxQty` DOUBLE NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `createdByType` VARCHAR(20) NULL,
    ADD COLUMN `createdByName` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProjectCommission` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mobile` VARCHAR(191) NULL,
    `ratePerM3` DOUBLE NOT NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProjectCommission_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CommissionPayout` (
    `id` VARCHAR(191) NOT NULL,
    `commissionId` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paidOn` DATE NOT NULL,
    `mode` VARCHAR(30) NULL,
    `reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdById` INTEGER NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CommissionPayout_commissionId_idx`(`commissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectCommission` ADD CONSTRAINT `ProjectCommission_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionPayout` ADD CONSTRAINT `CommissionPayout_commissionId_fkey` FOREIGN KEY (`commissionId`) REFERENCES `ProjectCommission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommissionPayout` ADD CONSTRAINT `CommissionPayout_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: the old single commission person becomes the first row.
-- Project.commissionPerson* columns are kept (no longer read), so nothing is lost.
INSERT INTO `ProjectCommission` (`id`, `projectId`, `name`, `mobile`, `ratePerM3`, `updatedAt`)
SELECT CONCAT('pc', MD5(p.`id`)), p.`id`, TRIM(p.`commissionPersonName`), NULLIF(TRIM(p.`commissionPersonMobile`), ''), COALESCE(p.`commissionAmountPerM3`, 0), CURRENT_TIMESTAMP(3)
FROM `Project` p
WHERE p.`isDeleted` = false AND NULLIF(TRIM(p.`commissionPersonName`), '') IS NOT NULL;

-- Backfill who booked each order: the client contact, else the CREATED activity's panel user or FT.
UPDATE `Order` o JOIN `ClientContact` c ON c.`id` = o.`placedByContactId`
SET o.`createdByType` = 'CLIENT_CONTACT', o.`createdByName` = c.`name`
WHERE o.`createdByName` IS NULL;

UPDATE `Order` o
JOIN `Activity` a ON a.`entityType` = 'ORDER' AND a.`entityId` = o.`id` AND a.`action` = 'CREATED'
JOIN `User` u ON u.`id` = COALESCE(a.`createdById`, IF(a.`actorType` = 'FIELD_TECH', CAST(a.`actorId` AS UNSIGNED), NULL))
SET o.`createdByType` = IF(u.`role` = 'FIELD_TECHNICIAN', 'FIELD_TECH', 'USER'), o.`createdByName` = u.`name`
WHERE o.`createdByName` IS NULL;

-- Client-app orders from before contacts (docs/06): the client's owner.
UPDATE `Order` o
JOIN `Activity` a ON a.`entityType` = 'ORDER' AND a.`entityId` = o.`id` AND a.`action` = 'CREATED' AND a.`actorType` = 'CLIENT'
JOIN `Client` c ON c.`id` = o.`clientId`
SET o.`createdByType` = 'CLIENT', o.`createdByName` = COALESCE(NULLIF(TRIM(c.`ownerName`), ''), c.`companyName`)
WHERE o.`createdByName` IS NULL;
