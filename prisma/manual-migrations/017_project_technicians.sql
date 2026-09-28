-- 017: field technicians on a project (2026-09-28). Additive.
-- They see every order of the project; OrderTechnician stays as the order's contact person.
-- CreateTable
CREATE TABLE `ProjectTechnician` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProjectTechnician_userId_idx`(`userId`),
    UNIQUE INDEX `ProjectTechnician_projectId_userId_key`(`projectId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProjectTechnician` ADD CONSTRAINT `ProjectTechnician_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProjectTechnician` ADD CONSTRAINT `ProjectTechnician_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: a tech already working an order of a project joins that project.
INSERT IGNORE INTO `ProjectTechnician` (`id`, `projectId`, `userId`)
SELECT CONCAT('pt', MD5(CONCAT(o.`projectId`, '-', ot.`userId`))), o.`projectId`, ot.`userId`
FROM `OrderTechnician` ot JOIN `Order` o ON o.`id` = ot.`orderId`
WHERE ot.`isDeleted` = false AND o.`isDeleted` = false
GROUP BY o.`projectId`, ot.`userId`;
