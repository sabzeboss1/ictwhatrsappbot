-- Migration additive : suivi des demandes commerciales dans le pipeline HubSpot "Suivi commercial WhatsApp" (4352514296)
CREATE TABLE IF NOT EXISTS "CommercialRequest" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "hubspotContactId" TEXT,
    "hubspotDealId" TEXT,
    "pipelineId" TEXT NOT NULL DEFAULT '4352514296',
    "requestedStage" TEXT NOT NULL DEFAULT 'NOUVELLE_DEMANDE',
    "syncedStage" TEXT,
    "remoteStageId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCorrelationId" TEXT,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "paymentVerified" BOOLEAN NOT NULL DEFAULT false,
    "paymentVerifiedBy" TEXT,
    "paymentVerifiedAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "bookingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "offerSentAt" TIMESTAMP(3),
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommercialRequest_requestKey_key" ON "CommercialRequest"("requestKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialRequest_reference_key" ON "CommercialRequest"("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "CommercialRequest_hubspotDealId_key" ON "CommercialRequest"("hubspotDealId");
CREATE INDEX IF NOT EXISTS "CommercialRequest_leadId_createdAt_idx" ON "CommercialRequest"("leadId", "createdAt");
CREATE INDEX IF NOT EXISTS "CommercialRequest_syncStatus_nextRetryAt_idx" ON "CommercialRequest"("syncStatus", "nextRetryAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CommercialRequest_leadId_fkey'
    ) THEN
        ALTER TABLE "CommercialRequest"
        ADD CONSTRAINT "CommercialRequest_leadId_fkey"
        FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
