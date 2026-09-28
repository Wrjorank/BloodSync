-- CreateTable
CREATE TABLE `faskes` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('RS', 'UDD') NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('FASKES_STAFF', 'SUPER_ADMIN') NOT NULL DEFAULT 'FASKES_STAFF',
    `faskesId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_faskesId_idx`(`faskesId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stocks` (
    `id` VARCHAR(191) NOT NULL,
    `faskesId` VARCHAR(191) NOT NULL,
    `component` ENUM('PRC', 'TC', 'WB') NOT NULL,
    `bloodType` VARCHAR(3) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stocks_faskesId_component_bloodType_key`(`faskesId`, `component`, `bloodType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` VARCHAR(191) NOT NULL,
    `faskesId` VARCHAR(191) NOT NULL,
    `component` ENUM('PRC', 'TC', 'WB') NOT NULL,
    `bloodType` VARCHAR(3) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `kind` ENUM('IN', 'OUT', 'TRANSFER') NOT NULL,
    `note` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_faskesId_createdAt_idx`(`faskesId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donors` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `bloodType` VARCHAR(3) NOT NULL,
    `area` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `lastDonationAt` DATETIME(3) NULL,
    `responseRate` DOUBLE NOT NULL DEFAULT 0.5,
    `isSimulated` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `donors_phone_key`(`phone`),
    INDEX `donors_bloodType_isActive_idx`(`bloodType`, `isActive`),
    INDEX `donors_lat_lng_idx`(`lat`, `lng`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donor_badges` (
    `donorId` VARCHAR(191) NOT NULL,
    `badgeId` VARCHAR(20) NOT NULL,
    `earnedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`donorId`, `badgeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donations` (
    `id` VARCHAR(191) NOT NULL,
    `donorId` VARCHAR(191) NOT NULL,
    `faskesId` VARCHAR(191) NULL,
    `requestCode` VARCHAR(191) NULL,
    `component` ENUM('PRC', 'TC', 'WB') NOT NULL,
    `donatedAt` DATETIME(3) NOT NULL,

    INDEX `donations_donorId_donatedAt_idx`(`donorId`, `donatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blood_requests` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `publicToken` VARCHAR(24) NOT NULL,
    `status` ENUM('PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING', 'FULFILLED', 'CLOSED', 'REJECTED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `phone` VARCHAR(20) NOT NULL,
    `patientName` VARCHAR(191) NOT NULL,
    `medicalRecordNo` VARCHAR(191) NOT NULL,
    `ward` VARCHAR(191) NOT NULL,
    `faskesId` VARCHAR(191) NOT NULL,
    `bloodType` VARCHAR(3) NOT NULL,
    `component` ENUM('PRC', 'TC', 'WB') NOT NULL,
    `bagsNeeded` INTEGER NOT NULL,
    `urgency` ENUM('KRITIS', 'MENDESAK', 'TERJADWAL') NOT NULL,
    `letterPath` VARCHAR(191) NULL,
    `letterName` VARCHAR(191) NULL,
    `letterMime` VARCHAR(191) NULL,
    `allocatedFromStock` INTEGER NOT NULL DEFAULT 0,
    `bagsCollected` INTEGER NOT NULL DEFAULT 0,
    `rejectReason` VARCHAR(191) NULL,
    `dispatchStartedAt` DATETIME(3) NULL,
    `radiusKm` DOUBLE NULL,
    `wave` INTEGER NOT NULL DEFAULT 0,
    `waveStartedAt` DATETIME(3) NULL,
    `escalateMinutes` INTEGER NULL,
    `deadline` DATETIME(3) NULL,
    `allowCompatible` BOOLEAN NOT NULL DEFAULT false,
    `maxedOut` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `blood_requests_code_key`(`code`),
    UNIQUE INDEX `blood_requests_publicToken_key`(`publicToken`),
    INDEX `blood_requests_faskesId_status_idx`(`faskesId`, `status`),
    INDEX `blood_requests_phone_idx`(`phone`),
    INDEX `blood_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dispatch_waves` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `wave` INTEGER NOT NULL,
    `radiusKm` DOUBLE NOT NULL,
    `inRadius` INTEGER NOT NULL DEFAULT 0,
    `typeMatch` INTEGER NOT NULL DEFAULT 0,
    `eligible` INTEGER NOT NULL DEFAULT 0,
    `capped` INTEGER NOT NULL DEFAULT 0,
    `invited` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dispatch_waves_requestId_wave_key`(`requestId`, `wave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donor_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(12) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `donorId` VARCHAR(191) NOT NULL,
    `status` ENUM('INVITED', 'DECLINED', 'RESERVED', 'ARRIVED', 'SCREENED', 'SCREENING_FAILED', 'COLLECTED', 'NO_SHOW', 'CANCELLED', 'WITHDRAWN', 'QUOTA_FULL') NOT NULL DEFAULT 'INVITED',
    `wave` INTEGER NOT NULL,
    `distanceKm` DOUBLE NOT NULL,
    `invitedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,
    `etaMin` INTEGER NULL,
    `reservedUntil` DATETIME(3) NULL,
    `arrivedAt` DATETIME(3) NULL,
    `bpSystolic` INTEGER NULL,
    `bpDiastolic` INTEGER NULL,
    `hemoglobin` DOUBLE NULL,
    `weightKg` DOUBLE NULL,
    `screeningPass` BOOLEAN NULL,
    `screeningReasons` JSON NULL,
    `screenedAt` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NULL,
    `newBadges` JSON NULL,
    `note` VARCHAR(191) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `donor_tickets_code_key`(`code`),
    INDEX `donor_tickets_donorId_status_idx`(`donorId`, `status`),
    INDEX `donor_tickets_status_reservedUntil_idx`(`status`, `reservedUntil`),
    UNIQUE INDEX `donor_tickets_requestId_donorId_key`(`requestId`, `donorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `request_events` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `text` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `request_events_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `ref` VARCHAR(191) NULL,
    `meta` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_createdAt_idx`(`createdAt`),
    INDEX `audit_logs_actor_idx`(`actor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_faskesId_fkey` FOREIGN KEY (`faskesId`) REFERENCES `faskes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stocks` ADD CONSTRAINT `stocks_faskesId_fkey` FOREIGN KEY (`faskesId`) REFERENCES `faskes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_faskesId_fkey` FOREIGN KEY (`faskesId`) REFERENCES `faskes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donor_badges` ADD CONSTRAINT `donor_badges_donorId_fkey` FOREIGN KEY (`donorId`) REFERENCES `donors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donations` ADD CONSTRAINT `donations_donorId_fkey` FOREIGN KEY (`donorId`) REFERENCES `donors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donations` ADD CONSTRAINT `donations_faskesId_fkey` FOREIGN KEY (`faskesId`) REFERENCES `faskes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blood_requests` ADD CONSTRAINT `blood_requests_faskesId_fkey` FOREIGN KEY (`faskesId`) REFERENCES `faskes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dispatch_waves` ADD CONSTRAINT `dispatch_waves_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donor_tickets` ADD CONSTRAINT `donor_tickets_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donor_tickets` ADD CONSTRAINT `donor_tickets_donorId_fkey` FOREIGN KEY (`donorId`) REFERENCES `donors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `request_events` ADD CONSTRAINT `request_events_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `blood_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

