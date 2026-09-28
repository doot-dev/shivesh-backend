-- 019: per-lead follow-up chat (2026-09-28). Additive; the Activity log is left as it is.
-- CreateTable
CREATE TABLE `LeadMessage` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `authorId` INTEGER NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `text` TEXT NULL,
    `fileUrl` VARCHAR(512) NULL,
    `mimeType` VARCHAR(100) NULL,
    `durationSec` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadMessage_leadId_createdAt_idx`(`leadId`, `createdAt`),
    INDEX `LeadMessage_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LeadMessage` ADD CONSTRAINT `LeadMessage_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadMessage` ADD CONSTRAINT `LeadMessage_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

