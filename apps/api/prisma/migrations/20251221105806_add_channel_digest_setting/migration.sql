-- CreateTable
CREATE TABLE "ChannelDigestSetting" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timeHHmm" TEXT NOT NULL DEFAULT '18:00',
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelDigestSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDigestSetting_channelId_key" ON "ChannelDigestSetting"("channelId");

-- AddForeignKey
ALTER TABLE "ChannelDigestSetting" ADD CONSTRAINT "ChannelDigestSetting_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
