-- CreateTable
CREATE TABLE "model_usage" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "arId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_usage_ts_idx" ON "model_usage"("ts");
