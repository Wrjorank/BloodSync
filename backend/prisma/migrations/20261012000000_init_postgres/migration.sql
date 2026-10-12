-- CreateEnum
CREATE TYPE "FaskesType" AS ENUM ('RS', 'UDD');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FASKES_STAFF', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Component" AS ENUM ('PRC', 'TC', 'WB');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('KRITIS', 'MENDESAK', 'TERJADWAL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING_VERIFICATION', 'APPROVED', 'BROADCASTING', 'FULFILLED', 'CLOSED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('INVITED', 'DECLINED', 'RESERVED', 'ARRIVED', 'SCREENED', 'SCREENING_FAILED', 'COLLECTED', 'NO_SHOW', 'CANCELLED', 'WITHDRAWN', 'QUOTA_FULL');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementKind" AS ENUM ('IN', 'OUT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "DonorSource" AS ENUM ('APP', 'REGISTRY');

-- CreateTable
CREATE TABLE "faskes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FaskesType" NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faskes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'FASKES_STAFF',
    "faskesId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "faskesId" TEXT NOT NULL,
    "component" "Component" NOT NULL,
    "bloodType" VARCHAR(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "faskesId" TEXT NOT NULL,
    "component" "Component" NOT NULL,
    "bloodType" VARCHAR(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "kind" "MovementKind" NOT NULL,
    "note" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "bloodType" VARCHAR(3) NOT NULL,
    "area" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "lastDonationAt" TIMESTAMP(3),
    "responseRate" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" "DonorSource" NOT NULL DEFAULT 'APP',
    "birthDate" DATE,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "residents" (
    "id" TEXT NOT NULL,
    "nik" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "bloodType" VARCHAR(3) NOT NULL,
    "address" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_badges" (
    "donorId" TEXT NOT NULL,
    "badgeId" VARCHAR(20) NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_badges_pkey" PRIMARY KEY ("donorId","badgeId")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "faskesId" TEXT,
    "requestCode" TEXT,
    "component" "Component" NOT NULL,
    "donatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_requests" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "publicToken" VARCHAR(24) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "phone" VARCHAR(20) NOT NULL,
    "patientName" TEXT NOT NULL,
    "medicalRecordNo" TEXT NOT NULL,
    "ward" TEXT NOT NULL,
    "faskesId" TEXT NOT NULL,
    "bloodType" VARCHAR(3) NOT NULL,
    "component" "Component" NOT NULL,
    "bagsNeeded" INTEGER NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "letterPath" TEXT,
    "letterName" TEXT,
    "letterMime" TEXT,
    "allocatedFromStock" INTEGER NOT NULL DEFAULT 0,
    "bagsCollected" INTEGER NOT NULL DEFAULT 0,
    "rejectReason" TEXT,
    "dispatchStartedAt" TIMESTAMP(3),
    "radiusKm" DOUBLE PRECISION,
    "wave" INTEGER NOT NULL DEFAULT 0,
    "waveStartedAt" TIMESTAMP(3),
    "escalateMinutes" INTEGER,
    "deadline" TIMESTAMP(3),
    "allowCompatible" BOOLEAN NOT NULL DEFAULT false,
    "maxedOut" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_waves" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "wave" INTEGER NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "inRadius" INTEGER NOT NULL DEFAULT 0,
    "typeMatch" INTEGER NOT NULL DEFAULT 0,
    "eligible" INTEGER NOT NULL DEFAULT 0,
    "capped" INTEGER NOT NULL DEFAULT 0,
    "invited" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_tickets" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "requestId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'INVITED',
    "wave" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertCount" INTEGER NOT NULL DEFAULT 1,
    "respondedAt" TIMESTAMP(3),
    "etaMin" INTEGER,
    "reservedUntil" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "hemoglobin" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "screeningPass" BOOLEAN,
    "screeningReasons" JSONB,
    "screenedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "newBadges" JSONB,
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donor_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ref" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromFaskesId" TEXT NOT NULL,
    "toFaskesId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "moved" INTEGER NOT NULL DEFAULT 0,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faskes_name_key" ON "faskes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_faskesId_idx" ON "users"("faskesId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_faskesId_component_bloodType_key" ON "stocks"("faskesId", "component", "bloodType");

-- CreateIndex
CREATE INDEX "stock_movements_faskesId_createdAt_idx" ON "stock_movements"("faskesId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "donors_phone_key" ON "donors"("phone");

-- CreateIndex
CREATE INDEX "donors_bloodType_isActive_idx" ON "donors"("bloodType", "isActive");

-- CreateIndex
CREATE INDEX "donors_lat_lng_idx" ON "donors"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "residents_nik_key" ON "residents"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "residents_phone_key" ON "residents"("phone");

-- CreateIndex
CREATE INDEX "residents_bloodType_idx" ON "residents"("bloodType");

-- CreateIndex
CREATE INDEX "residents_lat_lng_idx" ON "residents"("lat", "lng");

-- CreateIndex
CREATE INDEX "donations_donorId_donatedAt_idx" ON "donations"("donorId", "donatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "blood_requests_code_key" ON "blood_requests"("code");

-- CreateIndex
CREATE UNIQUE INDEX "blood_requests_publicToken_key" ON "blood_requests"("publicToken");

-- CreateIndex
CREATE INDEX "blood_requests_faskesId_status_idx" ON "blood_requests"("faskesId", "status");

-- CreateIndex
CREATE INDEX "blood_requests_phone_idx" ON "blood_requests"("phone");

-- CreateIndex
CREATE INDEX "blood_requests_status_idx" ON "blood_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_waves_requestId_wave_key" ON "dispatch_waves"("requestId", "wave");

-- CreateIndex
CREATE UNIQUE INDEX "donor_tickets_code_key" ON "donor_tickets"("code");

-- CreateIndex
CREATE INDEX "donor_tickets_donorId_status_idx" ON "donor_tickets"("donorId", "status");

-- CreateIndex
CREATE INDEX "donor_tickets_status_reservedUntil_idx" ON "donor_tickets"("status", "reservedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "donor_tickets_requestId_donorId_key" ON "donor_tickets"("requestId", "donorId");

-- CreateIndex
CREATE INDEX "request_events_requestId_createdAt_idx" ON "request_events"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");

-- CreateIndex
CREATE INDEX "stock_transfers_fromFaskesId_status_idx" ON "stock_transfers"("fromFaskesId", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_toFaskesId_status_idx" ON "stock_transfers"("toFaskesId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_badges" ADD CONSTRAINT "donor_badges_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_faskesId_fkey" FOREIGN KEY ("faskesId") REFERENCES "faskes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_waves" ADD CONSTRAINT "dispatch_waves_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_tickets" ADD CONSTRAINT "donor_tickets_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_tickets" ADD CONSTRAINT "donor_tickets_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromFaskesId_fkey" FOREIGN KEY ("fromFaskesId") REFERENCES "faskes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toFaskesId_fkey" FOREIGN KEY ("toFaskesId") REFERENCES "faskes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

