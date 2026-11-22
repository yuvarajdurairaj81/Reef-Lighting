-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('HOME', 'ENTERPRISE');
CREATE TYPE "OrganizationType" AS ENUM ('PERSONAL', 'ENTERPRISE');
CREATE TYPE "RoleName" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');
CREATE TYPE "ConnectionMode" AS ENUM ('SIMULATED', 'BLE', 'WIFI', 'MQTT', 'CLOUD');
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PROVISIONING', 'ERROR');
CREATE TYPE "SyncStatus" AS ENUM ('NEVER_SYNCED', 'PENDING', 'SYNCED', 'FAILED');
CREATE TYPE "CoralCategory" AS ENUM ('SPS', 'LPS', 'SOFT', 'MIXED_REEF', 'FISH_ONLY', 'ANEMONE');
CREATE TYPE "ProfileVisibility" AS ENUM ('PRIVATE', 'SHARED', 'SYSTEM');
CREATE TYPE "RampType" AS ENUM ('SUNRISE', 'SUNSET');
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'HOME',
    "emailVerifiedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasskeyCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "PasskeyCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "challenge" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'PERSONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "RoleName" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RolePermission" (
    "role" "RoleName" NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role","permissionId")
);

CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tank" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "volumeLiters" INTEGER,
    "coralCategory" "CoralCategory" NOT NULL DEFAULT 'MIXED_REEF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tank_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tankId" TEXT,
    "hardwareId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'Reef9 Controller',
    "firmwareVersion" TEXT,
    "connectionMode" "ConnectionMode" NOT NULL DEFAULT 'SIMULATED',
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "lastSeenAt" TIMESTAMP(3),
    "desiredState" JSONB,
    "reportedState" JSONB,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'NEVER_SYNCED',
    "lastSyncedAt" TIMESTAMP(3),
    "activeProfileVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedChannel" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "maxWattage" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "LedChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceConnection" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "mode" "ConnectionMode" NOT NULL,
    "ssid" TEXT,
    "ipAddress" TEXT,
    "succeeded" BOOLEAN NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceTelemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intensities" JSONB NOT NULL,
    "powerWatts" DOUBLE PRECISION,
    "powerIsMeasured" BOOLEAN NOT NULL DEFAULT false,
    "temperatureC" DOUBLE PRECISION,
    "rssi" INTEGER,
    CONSTRAINT "DeviceTelemetry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LightingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coralCategory" "CoralCategory" NOT NULL,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "presetKey" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "forkedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LightingProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileVersion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rampUpMinutes" INTEGER NOT NULL DEFAULT 60,
    "rampDownMinutes" INTEGER NOT NULL DEFAULT 60,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelConfiguration" (
    "id" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    CONSTRAINT "ChannelConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TankProfileAssignment" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "pinnedVersionId" TEXT,
    "overrides" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TankProfileAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfileShare" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LightingSchedule" (
    "id" TEXT NOT NULL,
    "profileVersionId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LightingSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleChannelWindow" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "onTime" TEXT NOT NULL,
    "offTime" TEXT NOT NULL,
    CONSTRAINT "ScheduleChannelWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleRamp" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "channelKey" TEXT,
    "type" "RampType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    CONSTRAINT "ScheduleRamp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "intensities" JSONB NOT NULL,
    "reason" TEXT,
    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deviceId" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
CREATE UNIQUE INDEX "EmailToken_tokenHash_key" ON "EmailToken"("tokenHash");
CREATE INDEX "EmailToken_userId_purpose_idx" ON "EmailToken"("userId", "purpose");
CREATE UNIQUE INDEX "PasskeyCredential_credentialId_key" ON "PasskeyCredential"("credentialId");
CREATE INDEX "PasskeyCredential_userId_idx" ON "PasskeyCredential"("userId");
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "Site_organizationId_idx" ON "Site"("organizationId");
CREATE INDEX "Tank_siteId_idx" ON "Tank"("siteId");
CREATE UNIQUE INDEX "Device_hardwareId_key" ON "Device"("hardwareId");
CREATE INDEX "Device_organizationId_idx" ON "Device"("organizationId");
CREATE INDEX "Device_tankId_idx" ON "Device"("tankId");
CREATE UNIQUE INDEX "LedChannel_deviceId_channelKey_key" ON "LedChannel"("deviceId", "channelKey");
CREATE INDEX "DeviceConnection_deviceId_createdAt_idx" ON "DeviceConnection"("deviceId", "createdAt");
CREATE INDEX "DeviceTelemetry_deviceId_recordedAt_idx" ON "DeviceTelemetry"("deviceId", "recordedAt");
CREATE UNIQUE INDEX "LightingProfile_presetKey_key" ON "LightingProfile"("presetKey");
CREATE INDEX "LightingProfile_organizationId_idx" ON "LightingProfile"("organizationId");
CREATE UNIQUE INDEX "ProfileVersion_profileId_version_key" ON "ProfileVersion"("profileId", "version");
CREATE UNIQUE INDEX "ChannelConfiguration_profileVersionId_channelKey_key" ON "ChannelConfiguration"("profileVersionId", "channelKey");
CREATE UNIQUE INDEX "TankProfileAssignment_tankId_key" ON "TankProfileAssignment"("tankId");
CREATE INDEX "TankProfileAssignment_profileId_idx" ON "TankProfileAssignment"("profileId");
CREATE UNIQUE INDEX "ProfileShare_profileId_sharedWithId_key" ON "ProfileShare"("profileId", "sharedWithId");
CREATE UNIQUE INDEX "LightingSchedule_profileVersionId_key" ON "LightingSchedule"("profileVersionId");
CREATE UNIQUE INDEX "ScheduleChannelWindow_scheduleId_channelKey_key" ON "ScheduleChannelWindow"("scheduleId", "channelKey");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "Alert_organizationId_status_idx" ON "Alert"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailToken" ADD CONSTRAINT "EmailToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasskeyCredential" ADD CONSTRAINT "PasskeyCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tank" ADD CONSTRAINT "Tank_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Device" ADD CONSTRAINT "Device_activeProfileVersionId_fkey" FOREIGN KEY ("activeProfileVersionId") REFERENCES "ProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedChannel" ADD CONSTRAINT "LedChannel_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceConnection" ADD CONSTRAINT "DeviceConnection_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceTelemetry" ADD CONSTRAINT "DeviceTelemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LightingProfile" ADD CONSTRAINT "LightingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileVersion" ADD CONSTRAINT "ProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LightingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelConfiguration" ADD CONSTRAINT "ChannelConfiguration_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "ProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TankProfileAssignment" ADD CONSTRAINT "TankProfileAssignment_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TankProfileAssignment" ADD CONSTRAINT "TankProfileAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LightingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TankProfileAssignment" ADD CONSTRAINT "TankProfileAssignment_pinnedVersionId_fkey" FOREIGN KEY ("pinnedVersionId") REFERENCES "ProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfileShare" ADD CONSTRAINT "ProfileShare_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LightingProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileShare" ADD CONSTRAINT "ProfileShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LightingSchedule" ADD CONSTRAINT "LightingSchedule_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "ProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleChannelWindow" ADD CONSTRAINT "ScheduleChannelWindow_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LightingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleRamp" ADD CONSTRAINT "ScheduleRamp_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LightingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "LightingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
