-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AR', 'COMPLIANCE', 'SMF');

-- CreateEnum
CREATE TYPE "WriteStatus" AS ENUM ('PENDING', 'FINAL');

-- CreateEnum
CREATE TYPE "ARStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "FPType" AS ENUM ('RESEARCH', 'TEASER', 'DECK', 'MARKETING', 'ADVISORY');

-- CreateEnum
CREATE TYPE "FPStatus" AS ENUM ('PENDING', 'ADOPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BreachStatus" AS ENUM ('PENDING', 'REPORTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SignOffStatus" AS ENUM ('PENDING', 'SIGNED_OFF', 'RETURNED');

-- CreateTable
CREATE TABLE "appointed_rep" (
    "id" TEXT NOT NULL,
    "frn" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "status" "ARStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboarded_at" TIMESTAMP(3) NOT NULL,
    "risk_band" "RiskBand",
    "arId" TEXT NOT NULL,

    CONSTRAINT "appointed_rep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cf30_return" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "received_at" TIMESTAMP(3),
    "status" "WriteStatus" NOT NULL DEFAULT 'PENDING',
    "due_date" TIMESTAMP(3) NOT NULL,
    "exceptions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cf30_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_promotion" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "type" "FPType" NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "cobs" JSONB NOT NULL,
    "status" "FPStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewer_notes" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "financial_promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_document" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "blob_url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_score" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "band" "RiskBand" NOT NULL,
    "cadence" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_breach" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "art33_clock" TIMESTAMP(3) NOT NULL,
    "status" "BreachStatus" NOT NULL DEFAULT 'PENDING',
    "severity" "Severity" NOT NULL,

    CONSTRAINT "data_breach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_cpd" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "cpd_hours" INTEGER NOT NULL DEFAULT 0,
    "required" INTEGER NOT NULL DEFAULT 35,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "cert_expiry" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_cpd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_completion" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "module_title" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "out_of" INTEGER NOT NULL,
    "pct" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "certificate_id" TEXT,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'training_platform',

    CONSTRAINT "training_completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sign_off_item" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "SignOffStatus" NOT NULL DEFAULT 'PENDING',
    "agent_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "register_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "sign_off_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hash_prev" TEXT,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "output" JSONB NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointed_rep_frn_key" ON "appointed_rep"("frn");

-- CreateIndex
CREATE INDEX "appointed_rep_arId_idx" ON "appointed_rep"("arId");

-- CreateIndex
CREATE INDEX "cf30_return_arId_idx" ON "cf30_return"("arId");

-- CreateIndex
CREATE UNIQUE INDEX "financial_promotion_ref_key" ON "financial_promotion"("ref");

-- CreateIndex
CREATE INDEX "financial_promotion_arId_idx" ON "financial_promotion"("arId");

-- CreateIndex
CREATE INDEX "promotion_document_arId_idx" ON "promotion_document"("arId");

-- CreateIndex
CREATE INDEX "promotion_document_promotion_id_idx" ON "promotion_document"("promotion_id");

-- CreateIndex
CREATE INDEX "risk_score_arId_idx" ON "risk_score"("arId");

-- CreateIndex
CREATE UNIQUE INDEX "data_breach_ref_key" ON "data_breach"("ref");

-- CreateIndex
CREATE INDEX "data_breach_arId_idx" ON "data_breach"("arId");

-- CreateIndex
CREATE INDEX "person_cpd_arId_idx" ON "person_cpd"("arId");

-- CreateIndex
CREATE INDEX "training_completion_arId_person_idx" ON "training_completion"("arId", "person");

-- CreateIndex
CREATE INDEX "sign_off_item_arId_idx" ON "sign_off_item"("arId");

-- CreateIndex
CREATE INDEX "sign_off_item_status_idx" ON "sign_off_item"("status");

-- CreateIndex
CREATE INDEX "audit_event_entity_entity_id_idx" ON "audit_event"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "agent_run_agent_id_idx" ON "agent_run"("agent_id");

-- AddForeignKey
ALTER TABLE "promotion_document" ADD CONSTRAINT "promotion_document_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "financial_promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
