-- Auto-create tables on container start (idempotent — safe to run multiple times)
CREATE TABLE IF NOT EXISTS "Organization" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  "passwordHash" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "OrganizationMember" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE,
  UNIQUE ("organizationId", "userId")
);
CREATE TABLE IF NOT EXISTS "ApiKey" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  name TEXT,
  scopes TEXT NOT NULL DEFAULT 'extract:write,extract:read,templates:read',
  status TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Template" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  name TEXT NOT NULL,
  "documentType" TEXT NOT NULL DEFAULT 'invoice',
  "fieldsJson" TEXT NOT NULL,
  instructions TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Job" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  "ocrEngine" TEXT,
  "ocrText" TEXT,
  "ocrConfidence" DOUBLE PRECISION,
  "ocrTimeMs" INTEGER,
  "pdfTextLength" INTEGER,
  "pdfTimeMs" INTEGER,
  "extractedJson" TEXT,
  "llmModel" TEXT,
  "llmTimeMs" INTEGER,
  "llmTokensIn" INTEGER,
  "llmTokensOut" INTEGER,
  "validationJson" TEXT,
  "validationTimeMs" INTEGER,
  "multiInvoice" BOOLEAN NOT NULL DEFAULT false,
  "documentCount" INTEGER NOT NULL DEFAULT 1,
  "errorMessage" TEXT,
  "errorCode" TEXT,
  "totalProcessingMs" INTEGER,
  "webhookSent" BOOLEAN NOT NULL DEFAULT false,
  "webhookSentAt" TIMESTAMP(3),
  "webhookResponse" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
  FOREIGN KEY ("templateId") REFERENCES "Template"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "AuditLog" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorType" TEXT NOT NULL DEFAULT 'user',
  action TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "requestId" TEXT,
  "metadataJson" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE,
  FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "Webhook" (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT NOT NULL DEFAULT 'job.completed,job.failed,job.review_required',
  status TEXT NOT NULL DEFAULT 'active',
  "lastTriggeredAt" TIMESTAMP(3),
  "lastResponseCode" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Setting" (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
CREATE INDEX IF NOT EXISTS "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
CREATE INDEX IF NOT EXISTS "Template_organizationId_idx" ON "Template"("organizationId");
CREATE INDEX IF NOT EXISTS "Job_organizationId_idx" ON "Job"("organizationId");
CREATE INDEX IF NOT EXISTS "Job_status_idx" ON "Job"("status");
CREATE INDEX IF NOT EXISTS "Job_createdAt_idx" ON "Job"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "Webhook_organizationId_idx" ON "Webhook"("organizationId");
