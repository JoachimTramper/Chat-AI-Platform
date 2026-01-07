/*
  Warnings:

  - You are about to alter the column `displayName` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(32)`.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "displayName" SET DATA TYPE VARCHAR(32);
