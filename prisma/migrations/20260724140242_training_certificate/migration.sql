-- CreateTable
CREATE TABLE "training_certificate" (
    "id" TEXT NOT NULL,
    "arId" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "blob_url" TEXT NOT NULL,
    "stored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_certificate_arId_person_idx" ON "training_certificate"("arId", "person");
