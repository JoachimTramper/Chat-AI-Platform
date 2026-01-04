/*
  Warnings:

  - A unique constraint covering the columns `[name,isDirect]` on the table `Channel` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_isDirect_key" ON "Channel"("name", "isDirect");
