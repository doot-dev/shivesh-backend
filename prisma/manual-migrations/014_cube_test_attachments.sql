-- 014: many attachments per cube test; clients can log and edit cube tests.
-- Additive only. CubeTest.fileUrl stays and mirrors the newest attachment, so
-- old app builds and the SCHEDULED/DUE/RESULT_ADDED status keep working.

-- AlterTable
ALTER TABLE `CubeTest` ADD COLUMN `addedByName` VARCHAR(191) NULL,
    ADD COLUMN `addedByType` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `CubeTestAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `cubeTestId` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(512) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `addedByType` VARCHAR(191) NOT NULL,
    `addedById` VARCHAR(191) NULL,
    `addedByName` VARCHAR(191) NULL,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CubeTestAttachment_cubeTestId_idx`(`cubeTestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CubeTestAttachment` ADD CONSTRAINT `CubeTestAttachment_cubeTestId_fkey` FOREIGN KEY (`cubeTestId`) REFERENCES `CubeTest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing result file becomes the test's first attachment.
INSERT INTO `CubeTestAttachment` (`id`, `cubeTestId`, `fileUrl`, `fileName`, `addedByType`, `createdAt`)
SELECT CONCAT('mig014_', `id`), `id`, `fileUrl`, SUBSTRING_INDEX(`fileUrl`, '/', -1), 'SYSTEM', `updatedAt`
FROM `CubeTest`
WHERE `fileUrl` IS NOT NULL AND `fileUrl` <> '';

-- New client permission cubeTests.manage for the Site Engineer starter role
-- (Owner is a system role and holds every permission already).
INSERT IGNORE INTO `ClientRolePermission` (`roleId`, `permission`)
SELECT `id`, 'cubeTests.manage' FROM `ClientRole` WHERE `name` = 'Site Engineer' AND `isDeleted` = false;
