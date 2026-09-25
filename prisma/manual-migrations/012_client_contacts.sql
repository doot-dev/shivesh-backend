-- 012: client contacts with client roles (docs/06-client-team-access.md).
-- Additive only. Backfill: scripts/backfill_client_contacts.mjs
-- AlterTable
ALTER TABLE `Order` ADD COLUMN `placedByContactId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ClientRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClientRole_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientRolePermission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `roleId` INTEGER NOT NULL,
    `permission` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ClientRolePermission_roleId_permission_key`(`roleId`, `permission`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientContact` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `designation` VARCHAR(191) NULL,
    `roleId` INTEGER NOT NULL,
    `allProjects` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `lastLoginAt` DATETIME(3) NULL,
    `createdByType` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClientContact_phone_idx`(`phone`),
    UNIQUE INDEX `ClientContact_clientId_phone_key`(`clientId`, `phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClientContactProject` (
    `id` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,

    INDEX `ClientContactProject_projectId_idx`(`projectId`),
    UNIQUE INDEX `ClientContactProject_contactId_projectId_key`(`contactId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_placedByContactId_idx` ON `Order`(`placedByContactId`);

-- AddForeignKey
ALTER TABLE `ClientRolePermission` ADD CONSTRAINT `ClientRolePermission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `ClientRole`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientContact` ADD CONSTRAINT `ClientContact_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientContact` ADD CONSTRAINT `ClientContact_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `ClientRole`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientContactProject` ADD CONSTRAINT `ClientContactProject_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `ClientContact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClientContactProject` ADD CONSTRAINT `ClientContactProject_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_placedByContactId_fkey` FOREIGN KEY (`placedByContactId`) REFERENCES `ClientContact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

