/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AdGroup` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AdGroup` table. All the data in the column will be lost.
  - You are about to drop the column `changedBy` on the `BudgetLog` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `BudgetLog` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `BudgetLog` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Campaign` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Creative` table. All the data in the column will be lost.
  - You are about to drop the column `imageUrl` on the `Creative` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Creative` table. All the data in the column will be lost.
  - You are about to drop the column `adGroupId` on the `DailyMetric` table. All the data in the column will be lost.
  - You are about to drop the column `convValue` on the `DailyMetric` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `DailyMetric` table. All the data in the column will be lost.
  - You are about to drop the column `creativeId` on the `DailyMetric` table. All the data in the column will be lost.
  - You are about to drop the column `roas` on the `DailyMetric` table. All the data in the column will be lost.
  - You are about to alter the column `conversions` on the `DailyMetric` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to drop the column `cpc` on the `SearchTermReport` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `SearchTermReport` table. All the data in the column will be lost.
  - You are about to drop the column `matchType` on the `SearchTermReport` table. All the data in the column will be lost.
  - You are about to alter the column `conversions` on the `SearchTermReport` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - Made the column `campaignId` on table `DailyMetric` required. This step will fail if there are existing NULL values in that column.
  - Made the column `campaignId` on table `SearchTermReport` required. This step will fail if there are existing NULL values in that column.
  - Made the column `campaignName` on table `SearchTermReport` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "AdGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AdGroup" ("campaignId", "id", "name", "status") SELECT "campaignId", "id", "name", "status" FROM "AdGroup";
DROP TABLE "AdGroup";
ALTER TABLE "new_AdGroup" RENAME TO "AdGroup";
CREATE TABLE "new_BudgetLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "budget" REAL NOT NULL,
    "spent" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "BudgetLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BudgetLog" ("budget", "campaignId", "id", "month", "spent") SELECT "budget", "campaignId", "id", "month", "spent" FROM "BudgetLog";
DROP TABLE "BudgetLog";
ALTER TABLE "new_BudgetLog" RENAME TO "BudgetLog";
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "adType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "monthlyBudget" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Campaign" ("adType", "createdAt", "id", "monthlyBudget", "name", "platform", "status") SELECT "adType", "createdAt", "id", "monthlyBudget", "name", "platform", "status" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
CREATE TABLE "new_Creative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "headline1" TEXT,
    "headline2" TEXT,
    "headline3" TEXT,
    "description1" TEXT,
    "description2" TEXT,
    "status" TEXT NOT NULL,
    CONSTRAINT "Creative_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Creative" ("adGroupId", "description1", "description2", "headline1", "headline2", "headline3", "id", "name", "status", "type") SELECT "adGroupId", "description1", "description2", "headline1", "headline2", "headline3", "id", "name", "status", "type" FROM "Creative";
DROP TABLE "Creative";
ALTER TABLE "new_Creative" RENAME TO "Creative";
CREATE TABLE "new_CreativeHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creativeId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "beforeData" TEXT,
    "afterData" TEXT,
    "note" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreativeHistory_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CreativeHistory" ("afterData", "beforeData", "changeType", "changedAt", "changedBy", "creativeId", "id", "note") SELECT "afterData", "beforeData", "changeType", "changedAt", "changedBy", "creativeId", "id", "note" FROM "CreativeHistory";
DROP TABLE "CreativeHistory";
ALTER TABLE "new_CreativeHistory" RENAME TO "CreativeHistory";
CREATE TABLE "new_DailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "cpc" REAL NOT NULL DEFAULT 0,
    "cpa" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "DailyMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DailyMetric" ("campaignId", "clicks", "conversions", "cost", "cpa", "cpc", "ctr", "date", "id", "impressions", "platform") SELECT "campaignId", "clicks", "conversions", "cost", coalesce("cpa", 0) AS "cpa", coalesce("cpc", 0) AS "cpc", coalesce("ctr", 0) AS "ctr", "date", "id", "impressions", "platform" FROM "DailyMetric";
DROP TABLE "DailyMetric";
ALTER TABLE "new_DailyMetric" RENAME TO "DailyMetric";
CREATE TABLE "new_SearchTermReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "platform" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "cpa" REAL NOT NULL DEFAULT 0,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SearchTermReport_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SearchTermReport" ("campaignId", "campaignName", "clicks", "conversions", "cost", "cpa", "ctr", "date", "id", "impressions", "isExcluded", "platform", "searchTerm") SELECT "campaignId", "campaignName", "clicks", "conversions", "cost", coalesce("cpa", 0) AS "cpa", coalesce("ctr", 0) AS "ctr", "date", "id", "impressions", "isExcluded", "platform", "searchTerm" FROM "SearchTermReport";
DROP TABLE "SearchTermReport";
ALTER TABLE "new_SearchTermReport" RENAME TO "SearchTermReport";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
