-- AlterTable
ALTER TABLE `donor_tickets` ADD COLUMN `alertCount` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `stock_transfers` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `fromFaskesId` VARCHAR(191) NOT NULL,
    `toFaskesId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `moved` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `requestedBy` VARCHAR(191) NOT NULL,
    `decidedBy` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `stock_transfers_fromFaskesId_status_idx`(`fromFaskesId`, `status`),
    INDEX `stock_transfers_toFaskesId_status_idx`(`toFaskesId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_fromFaskesId_fkey` FOREIGN KEY (`fromFaskesId`) REFERENCES `faskes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_toFaskesId_fkey` FOREIGN KEY (`toFaskesId`) REFERENCES `faskes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

