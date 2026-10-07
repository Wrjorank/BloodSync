-- AlterTable
ALTER TABLE `donors` ADD COLUMN `birthDate` DATE NULL,
    ADD COLUMN `source` ENUM('APP', 'REGISTRY') NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE `residents` (
    `id` VARCHAR(191) NOT NULL,
    `nik` VARCHAR(16) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `birthDate` DATE NOT NULL,
    `bloodType` VARCHAR(3) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `isSimulated` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `residents_nik_key`(`nik`),
    UNIQUE INDEX `residents_phone_key`(`phone`),
    INDEX `residents_bloodType_idx`(`bloodType`),
    INDEX `residents_lat_lng_idx`(`lat`, `lng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

