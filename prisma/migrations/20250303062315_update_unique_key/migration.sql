/*
  Warnings:

  - A unique constraint covering the columns `[ymd,user,channel]` on the table `state` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "state_ymd_user_key";

-- CreateIndex
CREATE UNIQUE INDEX "state_ymd_user_channel_key" ON "state"("ymd", "user", "channel");
