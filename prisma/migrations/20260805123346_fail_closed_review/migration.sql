-- CreateTable
CREATE TABLE "fail_closed_review" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fail_closed_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fail_closed_review_run_id_key" ON "fail_closed_review"("run_id");
